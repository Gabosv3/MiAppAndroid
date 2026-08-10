import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { setAuthToken, clearAuthToken } from '../services/api';
import { startHeartbeat, stopHeartbeat } from '../services/posHeartbeat';
import { verificarActualizacion } from '../services/updateChecker';
import { limpiarCacheOffline } from '../services/cobrosOffline';
import { clearQueue } from '../services/offlineQueue';
import { registrarPushToken, eliminarPushToken } from '../services/pushNotifications';
import { removePin } from '../services/appLock';

const AuthContext = createContext();
const STORAGE_KEY_AUTH = '@miapp/auth';

// Hash de doble pasada con salt para verificación offline.
// No es criptografía fuerte — solo evita guardar la contraseña en texto plano.
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
  const payload = {
    user,
    token,
    email,
    passwordHash: password ? hashText(password, email) : null,
  };
  await AsyncStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(payload));
};

const loadAuthData = async () => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY_AUTH);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [initialized, setInitialized] = useState(false);

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
          await AsyncStorage.removeItem(STORAGE_KEY_AUTH);
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
      setUser(stored.user);
      return stored.user;
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
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEY_AUTH),
      limpiarCacheOffline(),
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
