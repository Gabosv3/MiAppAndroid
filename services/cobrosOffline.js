import AsyncStorage from '@react-native-async-storage/async-storage';
import { fechaHoyLocal, fechaLocalDesde } from './dateUtils';

const KEYS = {
  ruta:      'COBROS_RUTA_CACHE',
  clientes:  'COBROS_CLIENTES_CACHE',
  pagos:     'COBROS_PAGOS_PENDIENTES',
  historial: 'COBROS_HISTORIAL',
  orden:     'COBROS_ORDEN_CLIENTES',
  visitados: 'COBROS_VISITADOS_HOY',
};

const fechaHoy = fechaHoyLocal; // hora de El Salvador, no UTC

// ─── RUTA HOY ───────────────────────────────────────────────────────────────

export const guardarRutaCache = async (data) => {
  await AsyncStorage.setItem(KEYS.ruta, JSON.stringify({ data, fecha: fechaHoy(), savedAt: Date.now() }));
};

export const leerRutaCache = async () => {
  const raw = await AsyncStorage.getItem(KEYS.ruta);
  if (!raw) return null;
  try {
    const cache = JSON.parse(raw);
    // Solo válida si es de hoy
    if (cache.fecha !== fechaHoy()) return null;
    return cache;
  } catch { return null; }
};

// ─── DETALLE CLIENTE ─────────────────────────────────────────────────────────

export const guardarClienteCache = async (clienteId, data) => {
  const raw = await AsyncStorage.getItem(KEYS.clientes);
  const cache = raw ? JSON.parse(raw) : {};
  cache[clienteId] = { data, savedAt: Date.now() };
  await AsyncStorage.setItem(KEYS.clientes, JSON.stringify(cache));
};

export const leerClienteCache = async (clienteId) => {
  const raw = await AsyncStorage.getItem(KEYS.clientes);
  if (!raw) return null;
  try {
    const cache = JSON.parse(raw);
    return cache[clienteId] || null;
  } catch { return null; }
};

// ─── PAGOS PENDIENTES ────────────────────────────────────────────────────────

export const encolarPago = async ({ clienteId, clienteNombre, ventaId, ventaNumero, monto, metodo, referencia, notas }) => {
  const raw = await AsyncStorage.getItem(KEYS.pagos);
  const cola = raw ? JSON.parse(raw) : [];
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    clienteId, clienteNombre, ventaId, ventaNumero,
    monto, metodo, referencia, notas,
    creadoEn: new Date().toISOString(),
  };
  cola.push(item);
  await AsyncStorage.setItem(KEYS.pagos, JSON.stringify(cola));
  return item;
};

export const leerPagosPendientes = async () => {
  const raw = await AsyncStorage.getItem(KEYS.pagos);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
};

export const eliminarPago = async (id) => {
  const raw = await AsyncStorage.getItem(KEYS.pagos);
  const cola = raw ? JSON.parse(raw) : [];
  await AsyncStorage.setItem(KEYS.pagos, JSON.stringify(cola.filter(p => p.id !== id)));
};

export const contarPagosPendientes = async () => {
  const cola = await leerPagosPendientes();
  return cola.length;
};

// ─── HISTORIAL DE COBROS ─────────────────────────────────────────────────────

const proximaVisita = (diasBase = 14) => {
  const d = new Date();
  d.setDate(d.getDate() + diasBase);
  return fechaLocalDesde(d); // "2026-06-29" en hora de El Salvador
};

export const guardarEnHistorial = async ({
  clienteId, clienteNombre, clienteWhatsapp = null, ventaNumero, monto, metodo, resultado,
  tipo = 'pago', resultadoVisita = null, observaciones = null,
  proximaVisitaFecha = null, pagoOfflineId = null,
}) => {
  const raw = await AsyncStorage.getItem(KEYS.historial);
  const historial = raw ? JSON.parse(raw) : [];
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tipo,
    clienteId,
    clienteNombre,
    clienteWhatsapp,
    ventaNumero,
    monto,
    metodo,
    resultadoVisita,
    observaciones,
    fecha: new Date().toISOString(),
    proximaVisita: tipo === 'pago' ? (proximaVisitaFecha || proximaVisita(14)) : null,
    resultado,
    ...(pagoOfflineId && { pagoOfflineId }),
  };
  historial.unshift(item); // más reciente primero
  // Mantener máximo 200 registros
  await AsyncStorage.setItem(KEYS.historial, JSON.stringify(historial.slice(0, 200)));
  return item;
};

export const leerHistorial = async () => {
  const raw = await AsyncStorage.getItem(KEYS.historial);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
};

// Actualiza el primer registro offline pendiente que coincida con el pago sincronizado.
// Evita duplicados en el historial al sincronizar pagos guardados sin conexión.
const actualizarHistorialOffline = async (pagoId, respuestaServidor) => {
  const raw = await AsyncStorage.getItem(KEYS.historial);
  const historial = raw ? JSON.parse(raw) : [];
  // Busca el registro offline que corresponde a este pago por su id de cola
  const idx = historial.findIndex(h => h.pagoOfflineId === pagoId);
  if (idx !== -1) {
    historial[idx] = { ...historial[idx], resultado: respuestaServidor, sincronizado: true };
    await AsyncStorage.setItem(KEYS.historial, JSON.stringify(historial));
  }
  // Si no encuentra el registro (ej: historial borrado), no hace nada — no duplica
};

export const leerHistorialCliente = async (clienteId) => {
  const todos = await leerHistorial();
  return todos.filter(h => h.clienteId === clienteId);
};

// ─── ORDEN PERSONALIZADO DE CLIENTES ──────────────────────────────────────────
// Guarda el orden en que el cobrador prefiere visitar a sus clientes (arrastre manual).

export const guardarOrdenClientes = async (ids) => {
  await AsyncStorage.setItem(KEYS.orden, JSON.stringify(ids));
};

export const leerOrdenClientes = async () => {
  const raw = await AsyncStorage.getItem(KEYS.orden);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
};

// ─── CLIENTES VISITADOS HOY ───────────────────────────────────────────────────
// Se quitan de la lista de ruta apenas se registra un pago o una visita (con o
// sin abono), para que el cobrador vea solo a quién le falta visitar. Se
// reinicia automáticamente al cambiar de día.

export const marcarClienteVisitado = async (clienteId) => {
  const raw = await AsyncStorage.getItem(KEYS.visitados);
  let store = raw ? JSON.parse(raw) : null;
  if (!store || store.fecha !== fechaHoy()) store = { fecha: fechaHoy(), ids: [] };
  if (!store.ids.includes(clienteId)) store.ids.push(clienteId);
  await AsyncStorage.setItem(KEYS.visitados, JSON.stringify(store));
};

export const leerClientesVisitadosHoy = async () => {
  const raw = await AsyncStorage.getItem(KEYS.visitados);
  if (!raw) return [];
  try {
    const store = JSON.parse(raw);
    if (store.fecha !== fechaHoy()) return [];
    return store.ids || [];
  } catch { return []; }
};

// ─── SINCRONIZAR PAGOS ───────────────────────────────────────────────────────

export const sincronizarPagosPendientes = async (api) => {
  const cola = await leerPagosPendientes();
  if (cola.length === 0) return { total: 0, synced: 0, errores: [] };

  let synced = 0;
  const errores = [];

  for (const pago of cola) {
    try {
      const { data } = await api.post(`/cobros/clientes/${pago.clienteId}/pagar`, {
        monto: pago.monto,
        metodo_pago: pago.metodo,
        ...(pago.ventaId != null && { venta_id: pago.ventaId }),
        ...(pago.referencia && { referencia: pago.referencia }),
        ...(pago.notas      && { observaciones: pago.notas }),
      });
      // Actualizar el registro offline existente con la respuesta real del servidor
      // (no crear uno nuevo — ya fue guardado cuando se registró offline)
      await actualizarHistorialOffline(pago.id, data);
      await eliminarPago(pago.id);
      synced++;
      console.log(`✅ Cobro sincronizado: ${pago.clienteNombre} $${pago.monto}`);
    } catch (e) {
      // Error de red → detener, quedará en cola para próximo intento
      if (!e.response) {
        console.log('🛑 Sin red, deteniendo sync de cobros');
        break;
      }
      // Error del servidor → registrar y eliminar para no bloquear
      console.warn(`⚠️ Error servidor en cobro ${pago.id}:`, e.message);
      errores.push({ id: pago.id, cliente: pago.clienteNombre, error: e.message });
      await eliminarPago(pago.id);
    }
  }

  return { total: cola.length, synced, errores };
};
