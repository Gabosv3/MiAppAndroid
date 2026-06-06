import { useEffect, useState, useCallback } from 'react';
import api from './api';

const checkConnectivity = async () => {
  try {
    // Usar timeout corto para no bloquear la UI
    await api.get('/me', { timeout: 5000 });
    return true;
  } catch (e) {
    // Si el servidor respondió (aunque con error 401), estamos online
    if (e.response) return true;
    return false;
  }
};

export const useConnectivity = () => {
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

  return { isOnline, checking, check };
};
