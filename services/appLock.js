import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// SecureStore ya cifra el valor en el keystore/keychain del dispositivo, así
// que no hace falta un hash propio encima — a diferencia del hash de la
// contraseña de login (que se guarda en AsyncStorage sin cifrar).
const PIN_KEY = 'app_pin';
// Por defecto el bloqueo queda ACTIVADO (mismo comportamiento que ya había,
// obligatorio) — es una preferencia por dispositivo, no algo sensible, así
// que no hace falta SecureStore para esto.
const LOCK_ENABLED_KEY = 'app_lock_enabled';

export const isLockEnabled = async () => {
  const val = await AsyncStorage.getItem(LOCK_ENABLED_KEY);
  return val === null ? true : val === '1';
};

export const setLockEnabled = async (enabled) => {
  await AsyncStorage.setItem(LOCK_ENABLED_KEY, enabled ? '1' : '0');
};

export const hasPin = async () => {
  const pin = await SecureStore.getItemAsync(PIN_KEY);
  return !!pin;
};

export const setPin = async (pin) => {
  await SecureStore.setItemAsync(PIN_KEY, pin);
};

// Límite de intentos: un PIN de 4 dígitos son solo 10.000 combinaciones y
// antes se podían probar todas sin ninguna espera. Tras 5 fallos seguidos se
// bloquea 30 s, y cada nueva tanda de 5 duplica la espera (tope 15 min). El
// contador persiste: cerrar y abrir la app no lo reinicia.
const FALLOS_KEY = 'app_pin_fallos';
const MAX_FALLOS = 5;
const ESPERA_BASE_MS = 30 * 1000;
const ESPERA_MAX_MS = 15 * 60 * 1000;

const leerFallos = async () => {
  try {
    const raw = await AsyncStorage.getItem(FALLOS_KEY);
    return raw ? JSON.parse(raw) : { n: 0, hasta: 0 };
  } catch { return { n: 0, hasta: 0 }; }
};

export const bloqueoRestanteSeg = async () => {
  const { hasta } = await leerFallos();
  return hasta > Date.now() ? Math.ceil((hasta - Date.now()) / 1000) : 0;
};

export const verifyPin = async (pin) => {
  if ((await bloqueoRestanteSeg()) > 0) return false;
  const guardado = await SecureStore.getItemAsync(PIN_KEY);
  const ok = !!guardado && guardado === pin;
  if (ok) {
    await AsyncStorage.removeItem(FALLOS_KEY).catch(() => {});
    return true;
  }
  const { n } = await leerFallos();
  const nuevos = n + 1;
  const tandas = Math.floor(nuevos / MAX_FALLOS);
  const hasta = nuevos % MAX_FALLOS === 0
    ? Date.now() + Math.min(ESPERA_BASE_MS * 2 ** (tandas - 1), ESPERA_MAX_MS)
    : 0;
  await AsyncStorage.setItem(FALLOS_KEY, JSON.stringify({ n: nuevos, hasta })).catch(() => {});
  return false;
};

export const removePin = async () => {
  await SecureStore.deleteItemAsync(PIN_KEY);
};
