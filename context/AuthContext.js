import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import api, { setAuthToken, clearAuthToken, setSesionExpiradaListener } from '../services/api';
import { startHeartbeat, stopHeartbeat } from '../services/posHeartbeat';
import { verificarActualizacion } from '../services/updateChecker';
import { limpiarCacheOffline } from '../services/cobrosOffline';
import { clearOfflineData } from '../services/localDb';
import { clearQueue } from '../services/offlineQueue';
import { registrarPushToken, eliminarPushToken } from '../services/pushNotifications';
import { removePin } from '../services/appLock';
import { asegurarConfiguradoTrasLogin } from '../services/backupOffline';

const AuthContext = createContext();
// El objeto de usuario (nombre, permisos, perfil) no es sensible por sí solo
// — sin el token no sirve para nada — así que puede vivir en AsyncStorage.
const STORAGE_KEY_USER = '@miapp/auth_user';
// El token da acceso completo a la API como ese usuario, y el hash de la
// contraseña permite el login offline — ambos van cifrados en el
// keystore/keychain del dispositivo (SecureStore), igual que el PIN, en vez
// de en AsyncStorage sin cifrar como estaban antes.
const SECURE_KEY_CREDENCIALES = 'auth_credenciales';

// Hash de doble pasada con salt para verificación offline.
// No es criptografía fuerte — pero ahora vive en SecureStore (cifrado por el
// SO), ya no en texto plano en AsyncStorage.
const hashText = (text, salt = '') => {
  const str = String((salt || '') + text);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `h2_${(h2 >>> 0).toString(16)}_${(h1 >>> 0).toString(16)}`;
};

const saveAuthData = async ({ user, token, email, password }) => {
  const credenciales = {
    token,
    email,
    passwordHash: password ? hashText(password, email) : null,
  };
  // El objeto "user" en memoria trae el token adentro (comodidad de acceso),
  // pero si se guarda tal cual en AsyncStorage sin cifrar, el token se
  // filtra igual por esa puerta — se guarda sin ese campo, ya está a salvo
  // en SecureStore dentro de "credenciales".
  const { token: _omitir, ...userSinToken } = user || {};
  await Promise.all([
    AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userSinToken)),
    SecureStore.setItemAsync(SECURE_KEY_CREDENCIALES, JSON.stringify(credenciales)),
  ]);
};

const loadAuthData = async () => {
  const [userRaw, credencialesRaw] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEY_USER),
    SecureStore.getItemAsync(SECURE_KEY_CREDENCIALES),
  ]);
  if (!credencialesRaw) return null;
  try {
    const credenciales = JSON.parse(credencialesRaw);
    const user = userRaw ? JSON.parse(userRaw) : null;
    return { ...credenciales, user };
  } catch {
    return null;
  }
};

const removeAuthData = async () => {
  await Promise.all([
    AsyncStorage.removeItem(STORAGE_KEY_USER),
    SecureStore.deleteItemAsync(SECURE_KEY_CREDENCIALES),
  ]);
};

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Token vencido o revocado a media sesión (ya no ocurre solo al abrir la
    // app): se limpia la sesión para que vuelva a la pantalla de login. A
    // diferencia de logout(), NO se borra la cola offline ni el caché ni el
    // PIN — es la MISMA persona, solo necesita volver a autenticarse; borrar
    // eso perdería ventas/cobros pendientes de envío sin motivo.
    setSesionExpiradaListener(() => {
      stopHeartbeat();
      clearAuthToken();
      setUser(null);
      setError('Tu sesión expiró. Inicia sesión de nuevo.');
      removeAuthData().catch(() => {});
    });
    return () => setSesionExpiradaListener(null);
  }, []);

  useEffect(() => {
    const restoreAuth = async () => {
      const stored = await loadAuthData();
      if (stored?.token) {
        setAuthToken(stored.token);
        try {
          const { data: me } = await api.get('/me');
          setUser({ ...me, token: stored.token });
          startHeartbeat();
          verificarActualizacion();
          registrarPushToken();
        } catch {
          clearAuthToken();
          await removeAuthData();
          setUser(null);
        }
      }
      setInitialized(true);
    };
    restoreAuth();
  }, []);

  const attemptOfflineLogin = async (email, password) => {
    const stored = await loadAuthData();
    if (!stored || !stored.email || !stored.passwordHash) {
      throw new Error('No hay credenciales guardadas para acceso offline');
    }
    if (stored.email !== email || stored.passwordHash !== hashText(password, email)) {
      throw new Error('Credenciales offline no coinciden');
    }
    if (stored.token) {
      setAuthToken(stored.token);
    }
    if (stored.user) {
      const userData = { ...stored.user, token: stored.token };
      setUser(userData);
      asegurarConfiguradoTrasLogin(); // no-await: no debe retrasar el login
      return userData;
    }
    throw new Error('No hay datos de usuario disponibles en el modo offline');
  };

  const login = async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      if (!email || !password) throw new Error('Complete todos los campos');

      console.log('=== LOGIN ATTEMPT ===');
      console.log('Email:', email);
      console.log('Posting to /login...');

      const { data } = await api.post('/login', { email, password });
      console.log('Login response:', data);

      const t = data.token;
      if (!t) throw new Error('Respuesta inválida del servidor');

      setAuthToken(t);
      const { data: me } = await api.get('/me');
      console.log('User data:', me);

      const userData = { ...me, token: t };
      setUser(userData);
      await saveAuthData({ user: userData, token: t, email, password });
      startHeartbeat();
      verificarActualizacion(); // no-await: corre en segundo plano sin bloquear login
      registrarPushToken(); // no-await: idem
      asegurarConfiguradoTrasLogin(); // no-await: idem
      console.log('✅ Login successful');
    } catch (e) {
      console.log('=== LOGIN ERROR ===');
      console.log('Error message:', e.message);
      console.log('Has response:', !!e.response);
      console.log('Response status:', e.response?.status);
      console.log('Response data:', e.response?.data);
      console.log('Full error:', e);

      // Solo fallback a offline si es error de RED, no error de credenciales del servidor
      const isNetworkError = !e.response ||
        e.message?.includes('Sin conexión') ||
        e.message?.includes('Timeout');

      const isServerCredentialError = e.response?.status === 401 || e.response?.status === 422;

      console.log('isNetworkError:', isNetworkError);
      console.log('isServerCredentialError:', isServerCredentialError);

      if (isNetworkError && !isServerCredentialError) {
        console.log('→ Attempting offline login...');
        try {
          await attemptOfflineLogin(email, password);
          startHeartbeat();
          verificarActualizacion();
          console.log('✅ Offline login successful');
          return;
        } catch (offlineException) {
          console.log('❌ Offline login failed:', offlineException.message);
          clearAuthToken();
          setError(offlineException.message || 'Error al iniciar sesión offline');
          return;
        }
      }

      clearAuthToken();
      setError(e.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    stopHeartbeat();
    await eliminarPushToken();
    try { await api.post('/logout'); } catch { /* ignorar error de red */ }
    clearAuthToken();
    setUser(null);
    setError(null);
    // Limpiar datos del cobrador anterior para que el siguiente no los vea.
    // El PIN también es por sesión, no por dispositivo: si no se borra, el
    // siguiente cobrador que inicie sesión en este mismo teléfono queda
    // atrapado detrás del PIN de otra persona.
    // clearOfflineData() (localDb.js) es una caché SEPARADA de clientes/productos
    // (SQLite + su respaldo en AsyncStorage, usada para buscar clientes/productos
    // sin conexión) — antes NO se borraba aquí, así que si se corrompía, ni cerrar
    // sesión ni volver a entrar la arreglaba; solo desinstalar la app la limpiaba.
    await Promise.all([
      removeAuthData(),
      limpiarCacheOffline(),
      clearOfflineData(),
      clearQueue(),
      removePin(),
    ]);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, initialized, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
