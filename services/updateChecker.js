import { Alert, Linking } from 'react-native';
import Constants from 'expo-constants';

const VERSION_URL = 'https://panel.distribuidorabriancescomenjivar.com/update/version.json';

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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res;
    try {
      res = await fetch(VERSION_URL, { cache: 'no-store', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      if (manual) Alert.alert('Sin respuesta', 'No se pudo contactar el servidor de actualizaciones.');
      return;
    }
    const { version, url, notas } = await res.json();
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
  } catch {
    if (manual) Alert.alert('Sin conexión', 'No se pudo verificar actualizaciones. Revisa tu conexión.');
  }
};

export const versionActual = () => Constants.expoConfig?.version || '1.0.0';
