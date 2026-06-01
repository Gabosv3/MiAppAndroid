import React, { createContext, useContext, useState } from 'react';
import api, { setAuthToken, clearAuthToken } from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const login = async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      if (!email || !password) throw new Error('Complete todos los campos');

      const { data } = await api.post('/login', { email, password });
      const t = data.token;
      if (!t) throw new Error('Respuesta inválida del servidor');

      setAuthToken(t);

      // Obtener datos completos del usuario
      const { data: me } = await api.get('/me');
      setUser({ ...me, token: t });
    } catch (e) {
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
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
