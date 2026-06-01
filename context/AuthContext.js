import React, { createContext, useContext, useState } from 'react';
import axios from 'axios';

const AuthContext = createContext();

const API_URL = process.env.EXPO_PUBLIC_API_URL;

// Usuario local de prueba (usado si la API no está disponible)
const LOCAL_USER = {
  email: 'admin@sidb.local',
  password: 'admin123',
  name: 'Administrador',
  role: 'admin',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const login = async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      if (!email || !password) {
        throw new Error('Complete todos los campos');
      }

      // Verificar credenciales locales primero
      if (email === LOCAL_USER.email && password === LOCAL_USER.password) {
        await new Promise(r => setTimeout(r, 600));
        setUser({ email: LOCAL_USER.email, name: LOCAL_USER.name, role: LOCAL_USER.role, isLocal: true });
        return;
      }

      // Si no coincide local, intentar con la API
      try {
        const response = await axios.post(`${API_URL}/auth/login`, { email, password }, {
          timeout: 5000,
        });
        const { user: apiUser, token } = response.data;
        setUser({ ...apiUser, token });
      } catch (apiError) {
        if (apiError.code === 'ECONNABORTED' || apiError.code === 'ERR_NETWORK' || !apiError.response) {
          throw new Error('Credenciales incorrectas');
        }
        const msg = apiError.response?.data?.message || 'Credenciales incorrectas';
        throw new Error(msg);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setError(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, API_URL }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
