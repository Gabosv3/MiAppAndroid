import AsyncStorage from '@react-native-async-storage/async-storage';
import { fechaHoyLocal, fechaLocalDesde } from './dateUtils';

const KEYS = {
  ruta:        'COBROS_RUTA_CACHE',
  clientes:    'COBROS_CLIENTES_CACHE',
  pagos:       'COBROS_PAGOS_PENDIENTES',
  historial:   'COBROS_HISTORIAL',
  orden:       'COBROS_ORDEN_CLIENTES',
  visitados:   'COBROS_VISITADOS_HOY',
  correlativo: 'COBROS_CORRELATIVO_LOCAL',
};

// ─── CORRELATIVO DE RECIBO (por dispositivo + cobrador) ──────────────────────
// Cada cobro registrado (con o sin conexión) recibe un número de recibo propio,
// generado en el momento en el teléfono. Es independiente del número de venta:
// un cliente puede tener 1 venta y 5 recibos de abonos distintos a lo largo del
// tiempo. Al no depender del servidor, funciona igual con o sin conexión.
//
// El contador es local por teléfono, así que si dos cobradores usan teléfonos
// distintos podrían generar el mismo consecutivo (ej. ambos llegan a "5" el mismo
// día). Para que los recibos sean distinguibles entre cobradores, se incluye el
// ID del cobrador en el número: REC-{cobradorId}-{consecutivo}, ej. REC-12-000005.
export const generarNumeroRecibo = async (cobradorId) => {
  const raw = await AsyncStorage.getItem(KEYS.correlativo);
  const siguiente = (raw ? parseInt(raw, 10) : 0) + 1;
  await AsyncStorage.setItem(KEYS.correlativo, String(siguiente));
  const prefijo = cobradorId != null ? `${cobradorId}-` : '';
  return `REC-${prefijo}${String(siguiente).padStart(6, '0')}`;
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

export const encolarPago = async ({ clienteId, clienteNombre, ventaId, ventaNumero, numeroRecibo, monto, metodo, referencia, notas }) => {
  const raw = await AsyncStorage.getItem(KEYS.pagos);
  const cola = raw ? JSON.parse(raw) : [];
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    clienteId, clienteNombre, ventaId, ventaNumero, numeroRecibo,
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
  clienteId, clienteNombre, clienteCodigo = null, clienteWhatsapp = null,
  ventaNumero, numeroRecibo, producto = null, monto, metodo, resultado,
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
    clienteCodigo,
    clienteWhatsapp,
    ventaNumero,
    numeroRecibo,
    producto,
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
// También reemplaza el numeroRecibo TEMPORAL (generado local al momento del cobro
// offline) por el correlativo real que asigna el servidor, ligado al cobrador.
const actualizarHistorialOffline = async (pagoId, respuestaServidor) => {
  const raw = await AsyncStorage.getItem(KEYS.historial);
  const historial = raw ? JSON.parse(raw) : [];
  // Busca el registro offline que corresponde a este pago por su id de cola
  const idx = historial.findIndex(h => h.pagoOfflineId === pagoId);
  if (idx !== -1) {
    historial[idx] = {
      ...historial[idx],
      resultado: respuestaServidor,
      sincronizado: true,
      ...(respuestaServidor?.numero_recibo && { numeroRecibo: respuestaServidor.numero_recibo }),
      ...(respuestaServidor?.producto && { producto: respuestaServidor.producto }),
      ...(respuestaServidor?.cliente?.codigo_anterior && { clienteCodigo: respuestaServidor.cliente.codigo_anterior }),
    };
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

// Borra toda la caché offline del cobrador — llamar al hacer logout
// para que el siguiente usuario no vea datos del anterior.
// NO borra pagos pendientes de envío (COBROS_PAGOS_PENDIENTES) para no perder
// cobros que aún no se sincronizaron.
export const limpiarCacheOffline = async () => {
  await AsyncStorage.multiRemove([
    KEYS.ruta,
    KEYS.clientes,
    KEYS.historial,
    KEYS.orden,
    KEYS.visitados,
  ]);
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

// Candado a nivel de módulo (no por pantalla) — CobrosScreen llama a esta
// función cada vez que la pantalla recupera el foco (cargar()), lo cual pasa
// muy seguido en un día normal (el cobrador entra y sale de cada cliente).
// Con señal débil, una sincronización puede tardar varios segundos; si el
// cobrador vuelve a esta pantalla antes de que termine, se disparaba OTRA
// sincronización en paralelo que releía la misma cola (todavía no vaciada)
// y reenviaba el mismo cobro al servidor — de ahí los cobros duplicados
// hasta 3-4 veces. Un useRef no alcanza porque se resetea si la pantalla se
// desmonta; esta bandera vive mientras la app esté corriendo, sin importar
// qué pantalla o cuántas veces se vuelva a montar.
let sincronizandoPagos = false;

export const sincronizarPagosPendientes = async (api) => {
  if (sincronizandoPagos) {
    console.log('⏳ Ya hay una sincronización de cobros en curso — se omite esta llamada duplicada');
    return { total: 0, synced: 0, errores: [], omitido: true };
  }
  sincronizandoPagos = true;
  try {
    return await _sincronizarPagosPendientesInterno(api);
  } finally {
    sincronizandoPagos = false;
  }
};

const _sincronizarPagosPendientesInterno = async (api) => {
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
      // Sin red O el servidor respondió 5xx (caído momentáneamente) →
      // transitorio, no es un error de datos. Detener y reintentar todo
      // en el próximo sync — NO eliminar el cobro de la cola, o se pierde.
      const statusNum = e.response?.status;
      const esTransitorio = !e.response || (statusNum && statusNum >= 500);
      if (esTransitorio) {
        console.log(`🛑 Problema de conexión o servidor caído (${statusNum || 'sin respuesta'}), deteniendo sync de cobros`);
        break;
      }
      // Error 4xx del servidor (validación, permisos) → sí es un error
      // real de datos, reintentarlo no lo va a arreglar. Eliminar de la
      // cola para que no bloquee los demás cobros pendientes.
      console.warn(`⚠️ Error servidor en cobro ${pago.id}:`, e.message);
      errores.push({ id: pago.id, cliente: pago.clienteNombre, error: e.message });
      await eliminarPago(pago.id);
    }
  }

  return { total: cola.length, synced, errores };
};
