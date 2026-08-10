import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

const TOKEN_STORAGE_KEY = 'PUSH_TOKEN_REGISTRADO';

// Que las notificaciones sí se muestren mientras la app está abierta (por
// defecto expo-notifications las silencia en foreground).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Pide permiso y registra el token de este dispositivo en el backend. Se
// llama después de iniciar sesión — si falla (sin conexión, permiso negado,
// emulador sin Google Play Services, o el proyecto Expo no tiene projectId
// configurado con `eas init`), no debe romper el login: solo no habrá
// notificaciones push en este dispositivo hasta la próxima vez.
export const registrarPushToken = async () => {
  try {
    if (!Device.isDevice) return; // emuladores no reciben push reales

    const { status: existente } = await Notifications.getPermissionsAsync();
    let status = existente;
    if (status !== 'granted') {
      const resultado = await Notifications.requestPermissionsAsync();
      status = resultado.status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'General',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    if (!token) return;

    await api.post('/push-tokens', { token, platform: Platform.OS });
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch (e) {
    console.warn('No se pudo registrar el token de push notifications:', e?.message);
  }
};

// Se llama al cerrar sesión, para que un dispositivo compartido entre
// cobradores deje de recibir notificaciones del usuario anterior.
export const eliminarPushToken = async () => {
  try {
    const token = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) return;
    await api.delete('/push-tokens', { data: { token } });
    await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (e) {
    console.warn('No se pudo eliminar el token de push notifications:', e?.message);
  }
};
