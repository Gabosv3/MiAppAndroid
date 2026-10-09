import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Cada vendedor ajusta el tamaño de letra del catálogo de productos a su
// gusto (algunos POS/teléfonos hacen que el texto se vea muy chico) — se
// guarda por teléfono, no por servidor, así que cada quien lo deja como
// mejor le funcione a él sin afectar a los demás.
const STORAGE_KEY = 'ESCALA_TEXTO_VENTAS';
const PASOS = [0.85, 1, 1.15, 1.3, 1.45];
const ESCALA_DEFECTO = 1;

export const useEscalaTexto = () => {
  const [escala, setEscala] = useState(ESCALA_DEFECTO);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      const valor = raw ? parseFloat(raw) : ESCALA_DEFECTO;
      if (PASOS.includes(valor)) setEscala(valor);
    });
  }, []);

  const guardar = useCallback((nuevaEscala) => {
    setEscala(nuevaEscala);
    AsyncStorage.setItem(STORAGE_KEY, String(nuevaEscala)).catch(() => {});
  }, []);

  const aumentar = useCallback(() => {
    const idx = PASOS.indexOf(escala);
    const siguiente = PASOS[Math.min(idx + 1, PASOS.length - 1)];
    guardar(siguiente);
  }, [escala, guardar]);

  const disminuir = useCallback(() => {
    const idx = PASOS.indexOf(escala);
    const anterior = PASOS[Math.max(idx - 1, 0)];
    guardar(anterior);
  }, [escala, guardar]);

  return {
    escala,
    aumentar,
    disminuir,
    puedeAumentar: escala !== PASOS[PASOS.length - 1],
    puedeDisminuir: escala !== PASOS[0],
  };
};
