/**
 * POS Heartbeat Service
 * Sends device state to POST /api/pos/heartbeat every 2 minutes while the user
 * is logged in. No UI — pure background data reporting.
 *
 * Datos enviados:
 *   device_serial  — Android ID único por dispositivo (cacheado en AsyncStorage)
 *   device_nombre  — "POS-XXXX" donde XXXX son los últimos 4 chars del serial
 *   lat / lng      — GPS si el permiso fue concedido previamente, null si no
 *   bateria        — % de batería (null si no disponible sin paquete nativo extra)
 *   app_version    — versión de app.json
 *   error          — último error reportado por la app, null si todo bien
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import api from './api';

const APP_VERSION = '1.0.0'; // debe coincidir con app.json version
const SERIAL_KEY  = '@sidb/device_serial';

// ── Device serial ─────────────────────────────────────────────────────────────
// Android ID (único por dispositivo, persiste entre instalaciones en el mismo apk)
// Accedemos vía el módulo nativo RNDeviceInfo si existe, o generamos un UUID
// estable guardado en AsyncStorage.
const getOrCreateSerial = async () => {
  // 1. Intentar leer el Android ID por NativeModules si está disponible
  try {
    const { RNDeviceInfo } = NativeModules;
    if (RNDeviceInfo?.getAndroidIdSync) {
      const id = RNDeviceInfo.getAndroidIdSync();
      if (id && id !== 'unknown') return id;
    }
  } catch { /* no disponible */ }

  // 2. Fallback: UUID estable guardado en AsyncStorage
  try {
    const cached = await AsyncStorage.getItem(SERIAL_KEY);
    if (cached) return cached;

    // Generar UUID simple basado en timestamp + random
    const uuid = `RN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    await AsyncStorage.setItem(SERIAL_KEY, uuid);
    return uuid;
  } catch {
    return `RN-FALLBACK-${Platform.OS.toUpperCase()}`;
  }
};

// ── GPS (no bloqueante, usa última posición conocida) ─────────────────────────
const getGps = async () => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return { lat: null, lng: null };
    const pos = await Location.getLastKnownPositionAsync();
    if (pos) return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch { /* ignore */ }
  return { lat: null, lng: null };
};

// ── Batería via expo-battery (0.0–1.0 → 0–100) ────────────────────────────────
const getBateria = async () => {
  try {
    const level = await Battery.getBatteryLevelAsync();
    if (level >= 0) return Math.round(level * 100);
  } catch { /* ignore */ }
  return null;
};

// ── Último error reportado ────────────────────────────────────────────────────
let _lastError = null;
export const setError  = (msg) => { _lastError = msg  || null; };
export const clearError = ()    => { _lastError = null; };

// ── Serial cacheado en memoria tras primera lectura ───────────────────────────
let _serial = null;

// ── Envío de heartbeat ────────────────────────────────────────────────────────
const sendHeartbeat = async () => {
  try {
    if (!_serial) _serial = await getOrCreateSerial();

    const [bateria, gps] = await Promise.all([getBateria(), getGps()]);

    const payload = {
      device_serial: _serial,
      device_nombre: `POS-${_serial.slice(-4).toUpperCase()}`,
      lat:           gps.lat,
      lng:           gps.lng,
      app_version:   APP_VERSION,
      error:         _lastError,
      ...(bateria !== null && { bateria }),
    };

    await api.post('/pos/heartbeat', payload);
  } catch {
    // Falla silenciosa — si no hay red simplemente no se envía
  }
};

// ── Control del intervalo ─────────────────────────────────────────────────────
const INTERVAL_MS = 2 * 60 * 1000; // 2 minutos
let _timer = null;

export const startHeartbeat = () => {
  if (_timer) return;           // ya está corriendo
  sendHeartbeat();              // envío inmediato al hacer login
  _timer = setInterval(sendHeartbeat, INTERVAL_MS);
};

export const stopHeartbeat = () => {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
};
