import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
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

// Antes esto solo abría la URL del APK en el navegador — el cobrador tenía
// que ver la notificación de descarga, tocarla, y de ahí recién llegaba al
// instalador (4-5 pasos). Ahora la app descarga el APK ella misma y abre el
// instalador nativo de Android directo, vía un content:// URI del
// FileProvider que ya trae expo-file-system — quedan solo 2 toques
// (Instalar, Abrir).
const descargarEInstalar = async (url, onProgress) => {
  if (Platform.OS !== 'android') {
    const { Linking } = require('react-native');
    await Linking.openURL(url);
    return;
  }

  const destino = FileSystem.cacheDirectory + 'sidb-actualizacion.apk';
  const descarga = FileSystem.createDownloadResumable(
    url,
    destino,
    {},
    (progreso) => {
      if (onProgress) {
        const pct = progreso.totalBytesWritten / progreso.totalBytesExpectedToWrite;
        onProgress(Math.round(pct * 100));
      }
    }
  );

  const resultado = await descarga.downloadAsync();
  if (!resultado?.uri) {
    throw new Error('La descarga no se completó.');
  }

  const contentUri = await FileSystem.getContentUriAsync(resultado.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
};

export const verificarActualizacion = async ({ manual = false, onDescargando } = {}) => {
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
        {
          text: 'Actualizar',
          onPress: async () => {
            try {
              onDescargando?.(0);
              await descargarEInstalar(url, onDescargando);
            } catch (e) {
              Alert.alert('Error', 'No se pudo descargar la actualización: ' + (e?.message || ''));
            } finally {
              onDescargando?.(null);
            }
          },
        },
      ],
      { cancelable: true }
    );
  } catch (e) {
    if (manual) Alert.alert('Sin conexión', 'No se pudo verificar actualizaciones. Revisa tu conexión.');
  }
};

export const versionActual = () => Constants.expoConfig?.version || '1.0.0';
