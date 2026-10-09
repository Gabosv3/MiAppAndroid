import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import api, { setTransitorioListener } from './api';

const checkConnectivity = async () => {
  try {
    await api.get('/me', { timeout: 4000 });
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
  // Evita que el ping periódico "resucite" isOnline=true justo después de
  // que un request real acaba de detectar una falla transitoria — se ignora
  // un ping en curso si ya llegó una señal reactiva más reciente.
  const ultimaSenalReactiva = useRef(0);

  const check = useCallback(async () => {
    setChecking(true);
    const antesDelPing = Date.now();
    const online = await checkConnectivity();
    // Si mientras el ping estaba en vuelo ya llegó una señal reactiva más
    // nueva (de un request real fallando o completando), esa señal manda.
    if (ultimaSenalReactiva.current < antesDelPing) {
      setIsOnline(online);
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    // Cualquier request real de la app (no solo el ping dedicado) actualiza
    // el estado al instante — así una pantalla no tiene que esperar hasta
    // 15s para que el modo offline (o la reconexión) se refleje en la UI.
    setTransitorioListener((esTransitorio) => {
      ultimaSenalReactiva.current = Date.now();
      setIsOnline(!esTransitorio);
    });

    check();
    // 15s en vez de 30s — reduce a la mitad cuánto puede quedar "atascado"
    // isOnline=true si ningún otro request disparó la señal reactiva.
    const interval = setInterval(check, 15000);
    return () => { clearInterval(interval); setTransitorioListener(null); };
  }, [check]);

  return (
    <ConnectivityContext.Provider value={{ isOnline, checking, check }}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export const useConnectivity = () => useContext(ConnectivityContext);
