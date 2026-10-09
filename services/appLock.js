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

export const verifyPin = async (pin) => {
  const guardado = await SecureStore.getItemAsync(PIN_KEY);
  return !!guardado && guardado === pin;
};

export const removePin = async () => {
  await SecureStore.deleteItemAsync(PIN_KEY);
};
