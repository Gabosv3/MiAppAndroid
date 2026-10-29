import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import api from './api';

// Avisa al servidor (y por tanto al panel de monitoreo POS) cuando una operación
// guardada en el teléfono NO se pudo subir: el servidor la rechazó (4xx de datos).
// Antes eso solo lo sabía quien tenía el teléfono en la mano — la venta o el
// cobro simplemente no llegaba y nadie en la oficina se enteraba.
//
// Solo se envía una descripción (etiqueta, endpoint, monto, motivo), NUNCA el
// contenido completo de la operación: puede traer fotos y datos personales.
//
// Si el reporte no se puede enviar (sin señal), queda en una bandeja local y se
// reintenta en el siguiente heartbeat.

const OUTBOX_KEY = 'SYNC_ERRORES_OUTBOX';
const MAX_OUTBOX = 100;
const POR_ENVIO = 50;
const APP_VERSION = Constants.expoConfig?.version || '1.0.0';

let _serial = null;
export const setSerialParaReporte = (serial) => { _serial = serial || null; };

let enviando = false;
// Candado propio para no pisar la bandeja si se encolan dos errores casi a la vez.
let _cadena = Promise.resolve();
const conBloqueo = (fn) => {
  const siguiente = _cadena.catch(() => {}).then(fn);
  _cadena = siguiente;
  return siguiente;
};

const leerBandeja = async () => {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    const lista = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? lista : [];
  } catch { return []; }
};

const guardarBandeja = (lista) =>
  AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(lista.slice(-MAX_OUTBOX))).catch(() => {});

/** Envía lo que haya en la bandeja. Seguro de llamar muchas veces. */
export const vaciarReportes = async () => {
  if (enviando) return;
  enviando = true;
  try {
    const lista = await leerBandeja();
    if (lista.length === 0) return;
    const lote = lista.slice(0, POR_ENVIO);
    await api.post('/sync-errores', {
      device_serial: _serial || undefined,
      app_version: APP_VERSION,
      errores: lote,
    }, { timeout: 15000 });
    // Se quitan solo los enviados; lo que se agregó mientras tanto se conserva.
    const enviados = new Set(lote.map((e) => e.client_id));
    await conBloqueo(async () => {
      const actual = await leerBandeja();
      await guardarBandeja(actual.filter((e) => !enviados.has(e.client_id)));
    });
  } catch (e) {
    // Sin red o servidor caído: queda en la bandeja para el próximo intento.
    console.warn('[reporteSync] no se pudo reportar, se reintentará:', e?.message || e);
  } finally {
    enviando = false;
  }
};

/**
 * Registra un error de sincronización y trata de enviarlo ya.
 * error: { client_id, tipo?, metodo?, endpoint?, etiqueta?, monto?, http_status?, motivo? }
 */
export const reportarErrorSync = async (error) => {
  if (!error?.client_id) return;
  try {
    await conBloqueo(async () => {
      const lista = await leerBandeja();
      if (lista.some((e) => e.client_id === error.client_id)) return;
      lista.push({
        tipo: 'rechazado',
        ...error,
        motivo: error.motivo ? String(error.motivo).slice(0, 1000) : undefined,
        etiqueta: error.etiqueta ? String(error.etiqueta).slice(0, 255) : undefined,
        ocurrido_en: error.ocurrido_en || new Date().toISOString(),
      });
      await guardarBandeja(lista);
    });
    vaciarReportes();
  } catch (e) {
    console.warn('[reporteSync] no se pudo registrar el error:', e?.message || e);
  }
};
