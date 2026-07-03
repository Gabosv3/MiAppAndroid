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

export const verificarActualizacion = async () => {
  try {
    const versionActual = Constants.expoConfig?.version || '1.0.0';
    const res = await fetch(VERSION_URL, { cache: 'no-store' });
    if (!res.ok) return;
    const { version, url, notas } = await res.json();
    if (!version || !url) return;
    if (!esVersionMayor(version, versionActual)) return;

    Alert.alert(
      '🚀 Nueva versión disponible',
      `Versión ${version} disponible${notas ? `\n\n${notas}` : ''}\n\nTu versión actual: ${versionActual}`,
      [
        { text: 'Ahora no', style: 'cancel' },
        {
          text: 'Actualizar',
          onPress: () => Linking.openURL(url),
        },
      ],
      { cancelable: true }
    );
  } catch {
    // Sin conexión o servidor no responde — ignorar silenciosamente
  }
};
