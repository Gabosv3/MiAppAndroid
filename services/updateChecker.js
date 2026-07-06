import { Alert, Linking } from 'react-native';
import Constants from 'expo-constants';
import api from './api';

// Usa el endpoint autenticado de la API — el servidor lee version.json o cae al fallback configurado
const VERSION_ENDPOINT = '/version';

// Compara versiones tipo "1.0.0" — retorna true si remota > local
const esVersionMayor = (remota, local) => {
  const r = remota.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
};

export const verificarActualizacion = async ({ manual = false } = {}) => {
  try {
    const versionActual = Constants.expoConfig?.version || '1.0.0';
    const { data } = await api.get(VERSION_ENDPOINT, { timeout: 8000 });
    const { version, url, notas } = data || {};
    if (!version || !url) {
      if (manual) Alert.alert('Sin respuesta', 'El servidor no devolvió información de versión.');
      return;
    }
    if (!esVersionMayor(version, versionActual)) {
      if (manual) Alert.alert('✅ App al día', `Tienes la versión más reciente (${versionActual}).`);
      return;
    }

    Alert.alert(
      '🚀 Nueva versión disponible',
      `Versión ${version} disponible${notas ? `\n\n${notas}` : ''}\n\nTu versión actual: ${versionActual}`,
      [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Actualizar', onPress: () => Linking.openURL(url) },
      ],
      { cancelable: true }
    );
  } catch (e) {
    if (manual) Alert.alert('Sin conexión', 'No se pudo verificar actualizaciones. Revisa tu conexión.');
  }
};

export const versionActual = () => Constants.expoConfig?.version || '1.0.0';
