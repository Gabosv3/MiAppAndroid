import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import * as backupOffline from './backupOffline';

const QUEUE_KEY = 'OFFLINE_REQUEST_QUEUE';
const REJECTED_KEY = 'OFFLINE_REQUEST_REJECTED';

// Candado: encolar, quitar y rechazar son leer-modificar-escribir sobre el
// mismo JSON. Sin esto, encolar una venta mientras la sincronización quita
// otra pisaba la cola y se perdía una de las dos.
let _cadena = Promise.resolve();
const conBloqueo = (fn) => {
  const siguiente = _cadena.catch(() => {}).then(fn);
  _cadena = siguiente;
  return siguiente;
};

// Errores que se reintentan (NO son de datos): sin respuesta, 5xx, 401 (sesión
// vencida — antes TODA la cola se borraba con un 401), 408 y 429.
const esReintentable = (error) => {
  const st = error?.response?.status;
  return !error?.response || st >= 500 || st === 401 || st === 408 || st === 429;
};

export const getRejected = async () => {
  const raw = await AsyncStorage.getItem(REJECTED_KEY);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
};

export const clearRejected = async () => { await AsyncStorage.removeItem(REJECTED_KEY); };

const moverARechazados = (item, motivo, statusCode) => conBloqueo(async () => {
  const lista = await getRejected();
  if (!lista.some((r) => r.id === item.id)) {
    lista.push({ ...item, motivo, statusCode, rechazadoEn: new Date().toISOString() });
    await AsyncStorage.setItem(REJECTED_KEY, JSON.stringify(lista));
  }
});

const getRawQueue = async () => {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    // No se descarta en silencio: se respalda para poder recuperarla.
    console.warn('[offlineQueue] cola corrupta, respaldada:', e?.message || e);
    AsyncStorage.setItem(`${QUEUE_KEY}__CORRUPTO`, raw).catch(() => {});
    return [];
  }
};

const saveRawQueue = async (queue) => {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue || []));
};

const generateId = () => `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

export const getQueue = async () => getRawQueue();

export const getQueueCount = async () => {
  const queue = await getRawQueue();
  return queue.length;
};

export const enqueueRequest = async ({ method, url, data, label, useFormData = false }) => {
  let payload = data || {};
  try {
    payload = JSON.parse(JSON.stringify(data || {}));
  } catch (error) {
    console.warn('No se pudo serializar payload offline, se guardarán valores seguros:', error);
    payload = {};
  }

  const item = {
    id: generateId(),
    method: method?.toUpperCase() || 'POST',
    url,
    label: label || url,
    data: payload,
    useFormData: Boolean(useFormData),
    createdAt: new Date().toISOString(),
  };
  await conBloqueo(async () => {
    const queue = await getRawQueue();
    queue.push(item);
    await saveRawQueue(queue);
  });
  // No bloquea el guardado normal si falla (ej. todavía no se configuró la
  // carpeta de respaldo) — es una bitácora extra, no la fuente de verdad.
  backupOffline.registrarPendiente(item).catch(() => {});
  return item;
};

export const removeRequest = (id) => conBloqueo(async () => {
  const queue = await getRawQueue();
  const filtered = queue.filter((item) => item.id !== id);
  await saveRawQueue(filtered);
  return filtered;
});

export const clearQueue = async () => {
  await AsyncStorage.removeItem(QUEUE_KEY);
};

const buildFormData = (payload = {}) => {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      // Varias fotos bajo la misma clave (ej. fotos de una garantía) — el
      // sufijo [] es lo que PHP necesita para juntarlas en un solo array en
      // vez de quedarse solo con la última.
      value.forEach((item) => {
        if (item && typeof item === 'object' && item.uri) {
          formData.append(`${key}[]`, {
            uri: item.uri,
            name: item.name || `${key}.jpg`,
            type: item.type || 'image/jpeg',
          });
        } else if (item !== undefined && item !== null) {
          formData.append(`${key}[]`, String(item));
        }
      });
    } else if (value && typeof value === 'object' && value.uri) {
      formData.append(key, {
        uri: value.uri,
        name: value.name || `${key}.jpg`,
        type: value.type || 'image/jpeg',
      });
    } else if (value !== undefined && value !== null) {
      formData.append(key, String(value));
    } else {
      formData.append(key, '');
    }
  });
  return formData;
};

// Candado a nivel de módulo — mismo motivo que en cobrosOffline.js: un
// useRef por pantalla no protege contra remounts (logout/login, navegación
// que desmonta y remonta HomeScreen) ni contra otra pantalla llamando a esto
// en paralelo. Sin este candado, dos sincronizaciones simultáneas pueden
// releer la misma cola antes de que la primera termine de vaciarla y
// reenviar el mismo request (venta, cliente, vale, visita) más de una vez.
let sincronizandoCola = false;

export const syncQueue = async () => {
  if (sincronizandoCola) {
    console.log('⏳ Ya hay una sincronización de cola en curso — se omite esta llamada duplicada');
    return { total: 0, synced: 0, remaining: await getQueueCount(), details: [], omitido: true };
  }
  sincronizandoCola = true;
  try {
    return await _syncQueueInterno();
  } finally {
    sincronizandoCola = false;
  }
};

const _syncQueueInterno = async () => {
  const queue = await getRawQueue();
  const total = queue.length;
  let synced = 0;
  const details = [];

  console.log(`🔄 === INICIANDO SINCRONIZACIÓN ===`);
  console.log(`📊 Cola: ${total} request(s) pendiente(s)`);

  if (total === 0) {
    console.log('ℹ️ Cola vacía, nada que sincronizar');
    return { total: 0, synced: 0, remaining: 0, details: [] };
  }

  for (const item of queue) {
    console.log(`\n📤 ITEM: ${item.label}`);
    console.log(`   Método: ${item.method}`);
    console.log(`   URL: ${item.url}`);
    console.log(`   useFormData: ${item.useFormData}`);

    try {
      const requestData = item.useFormData ? buildFormData(item.data) : item.data;
      console.log(`   📦 Datos preparados`);

      // Agregar timeout de 15 segundos — el timer se limpia siempre para no quedar colgado
      let timeoutHandle;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('Timeout - 15s sin respuesta')), 15000);
      });

      const requestPromise = api.request({
        method: item.method,
        url: item.url,
        data: requestData,
        timeout: 15000,
      });

      console.log(`   ⏳ Esperando respuesta...`);
      let response;
      try {
        response = await Promise.race([requestPromise, timeoutPromise]);
      } finally {
        clearTimeout(timeoutHandle);
      }
      console.log(`   ✅ Respuesta recibida:`, response?.status || 200);

      await removeRequest(item.id);
      synced += 1;
      details.push({ id: item.id, status: 'ok', label: item.label, url: item.url });
      backupOffline.registrarSincronizado(item).catch(() => {});
      console.log(`   ✅ ÉXITO: ${item.label} sincronizado`);
    } catch (error) {
      const errorMessage = error.message || String(error);
      const errorStatus = error.response?.status || 'sin-respuesta';

      details.push({
        id: item.id,
        status: 'error',
        label: item.label,
        message: errorMessage,
        statusCode: errorStatus
      });

      console.warn(`   ❌ ERROR en ${item.label}:`);
      console.warn(`      Mensaje: ${errorMessage}`);
      console.warn(`      Status: ${errorStatus}`);

      // Sin respuesta (red caída), 5xx o 401 (sesión vencida) → NO es un
      // error de datos. Detener y reintentar todo en el próximo sync, sin
      // borrar nada de la cola — de lo contrario se pierde el pago/venta.
      const statusNum = error.response?.status;
      if (esReintentable(error)) {
        console.log(`   🛑 DETENIENDO - Problema de conexión o servidor caído (${errorStatus})`);
        break;
      }

      // Error 4xx real de datos (validación, permisos, etc.): reintentarlo no
      // lo arregla y no debe bloquear los demás, pero TAMPOCO se borra en
      // silencio — pasa a "rechazados" con el motivo para que se vea.
      console.log(`   ⚠️ Error del servidor (${errorStatus}), movido a rechazados`);
      await moverARechazados(item, errorMessage, errorStatus);
      await removeRequest(item.id);
    }
  }

  const remainingQueue = await getRawQueue();
  console.log(`\n📊 === RESULTADO FINAL ===`);
  console.log(`   Enviados: ${synced}/${total}`);
  console.log(`   Pendientes: ${remainingQueue.length}`);
  console.log(`   Detalles de errores:`, details.filter(d => d.status === 'error'));

  return {
    total,
    synced,
    remaining: remainingQueue.length,
    details,
  };
};
