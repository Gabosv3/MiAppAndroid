import * as SecureStore from 'expo-secure-store';

// SecureStore ya cifra el valor en el keystore/keychain del dispositivo, así
// que no hace falta un hash propio encima — a diferencia del hash de la
// contraseña de login (que se guarda en AsyncStorage sin cifrar).
const PIN_KEY = 'app_pin';

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
