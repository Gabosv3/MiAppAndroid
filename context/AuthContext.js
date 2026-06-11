import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { setAuthToken, clearAuthToken } from '../services/api';

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

      const { data } = await api.post('/login', { email, password });
      const t = data.token;
      if (!t) throw new Error('Respuesta inválida del servidor');

      setAuthToken(t);
      const { data: me } = await api.get('/me');
      const userData = { ...me, token: t };
      setUser(userData);
      await saveAuthData({ user: userData, token: t, email, password });
    } catch (e) {
      // Solo fallback a offline si es error de RED, no error de credenciales del servidor
      const isNetworkError = !e.response ||
        e.message?.includes('Sin conexión') ||
        e.message?.includes('Timeout');

      const isServerCredentialError = e.response?.status === 401 || e.response?.status === 422;

      if (isNetworkError && !isServerCredentialError) {
        try {
          await attemptOfflineLogin(email, password);
          return;
        } catch (offlineException) {
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
    try { await api.post('/logout'); } catch { /* ignorar error de red */ }
    clearAuthToken();
    setUser(null);
    setError(null);
    await AsyncStorage.removeItem(STORAGE_KEY_AUTH);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, initialized, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
