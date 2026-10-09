/**
 * POS Heartbeat Service
 *
 * Envía la posición del vendedor al servidor cada 2 minutos, incluso con el
 * teléfono bloqueado o la app en segundo plano.
 *
 * Estrategia dual:
 *  1. Foreground: setInterval normal mientras la app está activa.
 *  2. Background: expo-task-manager + Location.startLocationUpdatesAsync
 *     — Android dispara la tarea cuando el SO detecta movimiento significativo,
 *       lo que mantiene la posición fresca sin agotar la batería.
 *
 * Datos enviados a POST /api/pos/heartbeat:
 *   device_serial, device_nombre, lat, lng, bateria, app_version, error
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import * as Application from 'expo-application';
import api from './api';

const TASK_NAME   = 'SIDB_LOCATION_TASK';
const INTERVAL_MS = 2 * 60 * 1000; // 2 min foreground
const SERIAL_KEY  = '@sidb/device_serial';
// Antes estaba fijo en '1.0.2' — el panel de monitoreo POS (columna
// "app_version", usada para saber qué dispositivos siguen en una versión
// vieja del APK) mostraba ese valor sin importar la versión real instalada.
// Se lee del mismo lugar que ya usa updateChecker.js.
const APP_VERSION = Constants.expoConfig?.version || '1.0.0';

// ── Serial de dispositivo ─────────────────────────────────────────────────────
// Antes se generaba un ID al azar y se guardaba solo en AsyncStorage — al
// desinstalar y reinstalar la app (algo que pasa seguido: la app se pone
// lenta, o toca desinstalar por un cambio de firma del APK) ese dato se
// borraba y el mismo teléfono se registraba como un POS "nuevo" en el panel,
// dejando decenas de fantasmas duplicados. Android.getAndroidId() sobrevive
// a desinstalar/reinstalar la app (solo cambia si se resetea el teléfono de
// fábrica), así que ahora es la base del serial — el mismo POS siempre vuelve
// a identificarse igual sin importar cuántas veces se reinstale.
const getOrCreateSerial = async () => {
  try {
    const cached = await AsyncStorage.getItem(SERIAL_KEY);
    if (cached) return cached;

    let base = Platform.OS === 'android' ? Application.getAndroidId() : null;
    if (!base) {
      // iOS o algún dispositivo sin Android ID disponible: se mantiene el
      // comportamiento anterior como respaldo (mejor un serial random que
      // ninguno, aunque no sobreviva a una reinstalación).
      base = `RN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    }
    const serial = `AID-${base}`;
    await AsyncStorage.setItem(SERIAL_KEY, serial);
    return serial;
  } catch {
    return `RN-FALLBACK-${Platform.OS.toUpperCase()}`;
  }
};

let _serial = null;
const getSerial = async () => {
  if (!_serial) _serial = await getOrCreateSerial();
  return _serial;
};

// ── Batería ───────────────────────────────────────────────────────────────────
const getBateria = async () => {
  try {
    const level = await Battery.getBatteryLevelAsync();
    if (level >= 0) return Math.round(level * 100);
  } catch { /* ignore */ }
  return null;
};

// ── Último error ──────────────────────────────────────────────────────────────
let _lastError = null;
export const setError   = (msg) => { _lastError = msg || null; };
export const clearError = ()    => { _lastError = null; };

// ── Envío principal ───────────────────────────────────────────────────────────
export const sendHeartbeat = async (coords = null) => {
  try {
    const serial  = await getSerial();
    const bateria = await getBateria();

    let lat = null, lng = null;
    if (coords) {
      lat = coords.latitude;
      lng = coords.longitude;
    } else {
      try {
        const pos = await Location.getLastKnownPositionAsync();
        if (pos) { lat = pos.coords.latitude; lng = pos.coords.longitude; }
      } catch { /* ignore */ }
    }

    await api.post('/pos/heartbeat', {
      device_serial: serial,
      device_nombre: `POS-${serial.slice(-4).toUpperCase()}`,
      lat,
      lng,
      bateria,
      app_version: APP_VERSION,
      error: _lastError,
    });
  } catch {
    // Falla silenciosa — sin red simplemente no se envía
  }
};

// ── Tarea de background (se registra en el módulo, fuera de componentes) ──────
// TaskManager.defineTask debe llamarse en el top-level del módulo, no dentro
// de funciones, para que el SO pueda invocarla cuando la app está suspendida.
TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  if (error) { console.warn('[HB background]', error.message); return; }
  const coords = data?.locations?.[0]?.coords || null;
  await sendHeartbeat(coords);
});

// ── Solicitar permisos de ubicación en background ─────────────────────────────
const pedirPermisosBackground = async () => {
  // Primero aseguramos permisos en primer plano
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') return false;

  // Luego solicitamos background (Android muestra el diálogo del sistema)
  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  return bg === 'granted';
};

// ── Iniciar seguimiento en background ─────────────────────────────────────────
const iniciarBackground = async () => {
  try {
    const granted = await pedirPermisosBackground();
    if (!granted) {
      console.warn('[HB] Permiso de background location denegado — solo foreground activo');
      return;
    }

    const yaActivo = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (yaActivo) return;

    await Location.startLocationUpdatesAsync(TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: INTERVAL_MS,
      distanceInterval: 50,          // también dispara si se mueve 50 m
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: 'SIDB activo',
        notificationBody: 'Registrando ubicación del cobrador',
        notificationColor: '#1a1a2e',
      },
      pausesUpdatesAutomatically: false,
    });
  } catch (e) {
    console.warn('[HB] Error al iniciar background location:', e.message);
  }
};

const detenerBackground = async () => {
  try {
    const activo = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (activo) await Location.stopLocationUpdatesAsync(TASK_NAME);
  } catch { /* ignore */ }
};

// ── Control del intervalo foreground ─────────────────────────────────────────
let _timer = null;

export const startHeartbeat = async () => {
  // Envío inmediato
  sendHeartbeat();

  // Foreground: intervalo normal
  if (!_timer) {
    _timer = setInterval(sendHeartbeat, INTERVAL_MS);
  }

  // Background: task de ubicación
  await iniciarBackground();
};

export const stopHeartbeat = async () => {
  if (_timer) { clearInterval(_timer); _timer = null; }
  await detenerBackground();
};
