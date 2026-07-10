import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

const QUEUE_KEY = 'OFFLINE_REQUEST_QUEUE';

const getRawQueue = async () => {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
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
  const queue = await getRawQueue();
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
  queue.push(item);
  await saveRawQueue(queue);
  return item;
};

export const removeRequest = async (id) => {
  const queue = await getRawQueue();
  const filtered = queue.filter((item) => item.id !== id);
  await saveRawQueue(filtered);
  return filtered;
};

export const clearQueue = async () => {
  await AsyncStorage.removeItem(QUEUE_KEY);
};

const buildFormData = (payload = {}) => {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value && typeof value === 'object' && value.uri) {
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

export const syncQueue = async () => {
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
      console.log(`   ✅ ÉXITO: ${item.label} sincronizado`);
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || String(error);
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

      // Si NO hay respuesta del servidor = problema de red → detener
      if (!error.response && (error.message?.includes('Timeout') || error.message?.includes('Sin conexión') || error.message?.includes('15s sin respuesta'))) {
        console.log(`   🛑 DETENIENDO - Problema de conexión`);
        break;
      }

      // Si el servidor respondió con error (4xx/5xx) → es un error de datos
      // Eliminar de la cola para que no bloquee los demás
      if (error.response) {
        console.log(`   ⚠️ Error del servidor (${errorStatus}), eliminando de cola para no bloquear`);
        await removeRequest(item.id);
      }
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
