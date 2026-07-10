import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from './api';

const checkConnectivity = async () => {
  try {
    await api.get('/me', { timeout: 5000 });
    return true;
  } catch (e) {
    if (e.response) return true;
    return false;
  }
};

const ConnectivityContext = createContext({ isOnline: true, checking: false, check: () => {} });

// Un único intervalo para toda la app — no uno por pantalla montada
export function ConnectivityProvider({ children }) {
  const [isOnline, setIsOnline] = useState(true);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    const online = await checkConnectivity();
    setIsOnline(online);
    setChecking(false);
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [check]);

  return (
    <ConnectivityContext.Provider value={{ isOnline, checking, check }}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export const useConnectivity = () => useContext(ConnectivityContext);
