import AsyncStorage from '@react-native-async-storage/async-storage';
import { fechaHoyLocal, fechaLocalDesde } from './dateUtils';
import * as backupOffline from './backupOffline';

// Candado por clave: casi todo aquí es leer-modificar-escribir sobre un mismo
// JSON de AsyncStorage. Sin esto, dos operaciones casi simultáneas (ej. un
// abono a varias cuentas de un grupo familiar, o encolar un cobro mientras
// la sincronización elimina otro) leen el mismo estado viejo y la segunda
// escritura pisa a la primera — se pierde un cobro o un registro del historial.
const _colasBloqueo = new Map();
const conBloqueo = (clave, fn) => {
  const previo = _colasBloqueo.get(clave) || Promise.resolve();
  const siguiente = previo.catch(() => {}).then(fn);
  _colasBloqueo.set(clave, siguiente);
  return siguiente;
};

// Lee un arreglo JSON. Si el contenido está corrupto NO lo descarta en
// silencio: lo copia a "<clave>__CORRUPTO" para poder recuperarlo y recién
// entonces devuelve [] (antes, encolar un cobro con la cola corrupta tronaba
// y el cobro nunca se guardaba).
const leerArreglo = async (clave) => {
  const raw = await AsyncStorage.getItem(clave);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    console.warn(`[cobrosOffline] ${clave} corrupto, respaldado:`, e?.message || e);
    await AsyncStorage.setItem(`${clave}__CORRUPTO`, raw).catch(() => {});
    return [];
  }
};

const KEYS = {
  ruta:        'COBROS_RUTA_CACHE',
  clientes:    'COBROS_CLIENTES_CACHE',
  pagos:       'COBROS_PAGOS_PENDIENTES',
  historial:   'COBROS_HISTORIAL',
  orden:       'COBROS_ORDEN_CLIENTES',
  visitados:   'COBROS_VISITADOS_HOY',
  correlativo: 'COBROS_CORRELATIVO_LOCAL',
  rechazados:  'COBROS_PAGOS_RECHAZADOS',
  vehiculos:   'COBROS_VEHICULOS_CACHE',
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

// Antes esto descartaba la caché por completo si no era exactamente de hoy
// (cache.fecha !== fechaHoy() → null). Eso dejaba al cobrador sin nada que
// mostrar si el día arrancaba con mala señal, aunque existiera la ruta de
// ayer — que casi siempre sigue siendo útil como respaldo de emergencia. En
// vez de descartarla, se devuelve con `esDeHoy` para que la pantalla avise
// que es una versión vieja, sin dejar al cobrador totalmente en blanco.
export const leerRutaCache = async () => {
  const raw = await AsyncStorage.getItem(KEYS.ruta);
  if (!raw) return null;
  try {
    const cache = JSON.parse(raw);
    return { ...cache, esDeHoy: cache.fecha === fechaHoy() };
  } catch { return null; }
};

// ─── DETALLE CLIENTE ─────────────────────────────────────────────────────────

// Cada cliente va en su PROPIA clave (COBROS_CLI_<id>). Antes todos vivían en
// un único JSON: con el detalle completo de 80-130 clientes eran varios MB y
// cada lectura (abrir un cliente) parseaba todo — lento y con mucha RAM en
// teléfonos de 3 GB. Ahora leer o guardar un cliente toca solo ese cliente.
const PREFIJO_CLIENTE = 'COBROS_CLI_';

// Migración única desde el formato viejo (un solo bloque): se reparte en
// claves por cliente y se borra el bloque.
let migracionClientes = null;
const migrarCacheClientes = () => {
  if (!migracionClientes) {
    migracionClientes = (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEYS.clientes);
        if (!raw) return;
        const viejo = JSON.parse(raw);
        const pares = Object.entries(viejo).map(([id, v]) => [PREFIJO_CLIENTE + id, JSON.stringify(v)]);
        if (pares.length) await AsyncStorage.multiSet(pares);
        await AsyncStorage.removeItem(KEYS.clientes);
      } catch (e) {
        console.warn('[cobrosOffline] migración de caché de clientes falló:', e?.message || e);
      }
    })();
  }
  return migracionClientes;
};

export const guardarClienteCache = async (clienteId, data) => {
  await migrarCacheClientes();
  await AsyncStorage.setItem(PREFIJO_CLIENTE + clienteId, JSON.stringify({ data, savedAt: Date.now() }));
};

// Cuántos clientes tienen algún respaldo guardado en este teléfono ahora
// mismo — para poder revisarlo ANTES de salir a la ruta con mala señal, en
// vez de descubrir a mitad del día que a alguno nunca le tocó precargarse
// (pasa si la app nunca llegó a cargar la ruta en línea ni una vez ese día).
// Si se pasa "ids" (los clientes de la ruta de hoy), cuenta solo cuántos de
// ESOS tienen respaldo — la caché acumula clientes de días anteriores que ya
// no están en la ruta, y contarlos todos hacía parecer que estaba completo
// aunque a alguno de hoy le faltara.
export const contarClientesConRespaldo = async (ids = null) => {
  await migrarCacheClientes();
  if (!Array.isArray(ids)) {
    const claves = await AsyncStorage.getAllKeys();
    return claves.filter((k) => k.startsWith(PREFIJO_CLIENTE)).length;
  }
  const pares = await AsyncStorage.multiGet(ids.map((id) => PREFIJO_CLIENTE + id));
  return pares.filter(([, v]) => v !== null).length;
};

export const leerClienteCache = async (clienteId) => {
  await migrarCacheClientes();
  const raw = await AsyncStorage.getItem(PREFIJO_CLIENTE + clienteId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

// Guarda el respaldo de VARIOS clientes de una sola vez (una sola lectura y
// una sola escritura), en vez de llamar guardarClienteCache() por cada uno.
// Ese patrón —leer todo el bloque, modificar un cliente, reescribir todo el
// bloque— es seguro para UN cliente a la vez, pero si se dispara para 80-130
// clientes en paralelo (como al precargar toda la ruta del día), cada
// llamada lee el bloque "antes" de que las demás terminen de escribir, así
// que unas pisan el resultado de otras y de paso se satura el
// almacenamiento del teléfono. Aquí se hace UNA sola vez para todos.
// No pisa el respaldo de un cliente que ya tenía uno guardado.
// Con { sobrescribir: true } SÍ reemplaza lo existente: lo usa la precarga
// completa del día para dejar el detalle real (con productos y cuotas) y el
// saldo actualizado, en vez de conservar el respaldo básico de ayer.
export const guardarClientesCacheBatch = async (entradas, { sobrescribir = false } = {}) => {
  if (!entradas || entradas.length === 0) return;
  await migrarCacheClientes();
  let aGuardar = entradas;
  if (!sobrescribir) {
    const existentes = await AsyncStorage.multiGet(entradas.map((e) => PREFIJO_CLIENTE + e.clienteId));
    const yaTienen = new Set(existentes.filter(([, v]) => v !== null).map(([k]) => k));
    aGuardar = entradas.filter((e) => !yaTienen.has(PREFIJO_CLIENTE + e.clienteId));
  }
  if (aGuardar.length === 0) return;
  const ahora = Date.now();
  await AsyncStorage.multiSet(
    aGuardar.map(({ clienteId, data }) => [PREFIJO_CLIENTE + clienteId, JSON.stringify({ data, savedAt: ahora })])
  );
};

// ─── VEHÍCULOS DISPONIBLES (para vales de gasto) ─────────────────────────────
// Sin esto, registrar un gasto de vehículo era imposible sin señal: la lista
// de vehículos solo se pedía en línea.
export const guardarVehiculosCache = async (lista) => {
  await AsyncStorage.setItem(KEYS.vehiculos, JSON.stringify({ lista, fecha: fechaHoy() }));
};

export const leerVehiculosCache = async () => {
  const raw = await AsyncStorage.getItem(KEYS.vehiculos);
  if (!raw) return [];
  try { return JSON.parse(raw).lista || []; } catch { return []; }
};

// ─── PAGOS PENDIENTES ────────────────────────────────────────────────────────

// `id` es también la clave de idempotencia que ve el servidor
// (`idempotency_key` en el POST /pagar). Si ya se generó al intentar el cobro
// online por primera vez, se reutiliza aquí para que el reintento offline
// tenga la MISMA clave — así, si el primer intento sí llegó a procesarse en
// el servidor pero el teléfono no alcanzó a recibir la respuesta (timeout),
// el reintento no crea un segundo cobro.
export const encolarPago = async ({ id, clienteId, clienteNombre, ventaId, ventaNumero, numeroRecibo, monto, metodo, referencia, notas }) => {
  const item = {
    id: id || `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    clienteId, clienteNombre, ventaId, ventaNumero, numeroRecibo,
    monto, metodo, referencia, notas,
    creadoEn: new Date().toISOString(),
  };
  await conBloqueo(KEYS.pagos, async () => {
    const cola = await leerArreglo(KEYS.pagos);
    cola.push(item);
    await AsyncStorage.setItem(KEYS.pagos, JSON.stringify(cola));
  });
  // Bitácora aparte, fuera del almacenamiento privado de la app — sobrevive
  // aunque se desinstale antes de que este cobro llegue al servidor.
  backupOffline.registrarPendiente({
    label: `Cobro ${clienteNombre} — ${numeroRecibo || id}`,
    url: `/cobros/clientes/${clienteId}/pagar`,
    data: { clienteId, clienteNombre, ventaId, ventaNumero, numeroRecibo, monto, metodo, referencia, notas },
  }).catch(() => {});
  return item;
};

export const leerPagosPendientes = async () => leerArreglo(KEYS.pagos);

export const eliminarPago = (id) => conBloqueo(KEYS.pagos, async () => {
  const cola = await leerArreglo(KEYS.pagos);
  await AsyncStorage.setItem(KEYS.pagos, JSON.stringify(cola.filter(p => p.id !== id)));
});

// ─── COBROS RECHAZADOS POR EL SERVIDOR ───────────────────────────────────────
// Un 4xx real (monto inválido, venta ya saldada, sin permiso...) ya no se borra
// en silencio: queda aquí con el motivo para que el cobrador lo vea y avise.
export const leerPagosRechazados = async () => leerArreglo(KEYS.rechazados);

const moverARechazados = (pago, motivo, statusCode) => conBloqueo(KEYS.rechazados, async () => {
  const lista = await leerArreglo(KEYS.rechazados);
  if (!lista.some(r => r.id === pago.id)) {
    lista.push({ ...pago, motivo, statusCode, rechazadoEn: new Date().toISOString() });
    await AsyncStorage.setItem(KEYS.rechazados, JSON.stringify(lista));
  }
});

export const descartarPagosRechazados = async () => {
  await AsyncStorage.removeItem(KEYS.rechazados);
};

// Errores que NO son de datos y se reintentan: sin respuesta, 5xx, 401 (la
// sesión venció — al volver a iniciar sesión el cobro sí es válido), 408 y 429.
export const esErrorReintentable = (e) => {
  const st = e?.response?.status;
  return !e?.response || st >= 500 || st === 401 || st === 408 || st === 429;
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
  saldoAntes = null, saldoDespues = null,
}) => {
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
    saldoAntes,
    saldoDespues,
    metodo,
    resultadoVisita,
    observaciones,
    fecha: new Date().toISOString(),
    proximaVisita: tipo === 'pago' ? (proximaVisitaFecha || proximaVisita(14)) : null,
    resultado,
    ...(pagoOfflineId && { pagoOfflineId }),
  };
  await conBloqueo(KEYS.historial, async () => {
    const historial = await leerArreglo(KEYS.historial);
    historial.unshift(item); // más reciente primero
    // Mantener máximo 200 registros
    await AsyncStorage.setItem(KEYS.historial, JSON.stringify(historial.slice(0, 200)));
  });
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
const actualizarHistorialOffline = (pagoId, respuestaServidor) => conBloqueo(KEYS.historial, async () => {
  const historial = await leerArreglo(KEYS.historial);
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
});

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

export const marcarClienteVisitado = (clienteId) => conBloqueo(KEYS.visitados, async () => {
  const raw = await AsyncStorage.getItem(KEYS.visitados);
  let store = null;
  try { store = raw ? JSON.parse(raw) : null; } catch { store = null; }
  if (!store || store.fecha !== fechaHoy()) store = { fecha: fechaHoy(), ids: [] };
  if (!store.ids.includes(clienteId)) store.ids.push(clienteId);
  await AsyncStorage.setItem(KEYS.visitados, JSON.stringify(store));
});

// Borra toda la caché offline del cobrador — llamar al hacer logout
// para que el siguiente usuario no vea datos del anterior.
// NO borra pagos pendientes de envío (COBROS_PAGOS_PENDIENTES) para no perder
// cobros que aún no se sincronizaron.
export const limpiarCacheOffline = async () => {
  const claves = await AsyncStorage.getAllKeys();
  const deClientes = claves.filter((k) => k.startsWith(PREFIJO_CLIENTE));
  await AsyncStorage.multiRemove([
    ...deClientes,
    KEYS.ruta,
    KEYS.vehiculos,
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
        idempotency_key: pago.id,
        ...(pago.ventaId != null && { venta_id: pago.ventaId }),
        ...(pago.referencia && { referencia: pago.referencia }),
        ...(pago.notas      && { observaciones: pago.notas }),
      });
      // Actualizar el registro offline existente con la respuesta real del servidor
      // (no crear uno nuevo — ya fue guardado cuando se registró offline)
      await actualizarHistorialOffline(pago.id, data);
      await eliminarPago(pago.id);
      backupOffline.registrarSincronizado({
        label: `Cobro ${pago.clienteNombre} — ${pago.numeroRecibo || pago.id}`,
        url: `/cobros/clientes/${pago.clienteId}/pagar`,
      }).catch(() => {});
      synced++;
      console.log(`✅ Cobro sincronizado: ${pago.clienteNombre} $${pago.monto}`);
    } catch (e) {
      // Sin red O el servidor respondió 5xx (caído momentáneamente) →
      // transitorio, no es un error de datos. Detener y reintentar todo
      // en el próximo sync — NO eliminar el cobro de la cola, o se pierde.
      const statusNum = e.response?.status;
      // Incluye 401: con la sesión vencida TODOS los cobros pendientes
      // fallarían con 401 y antes se borraban uno por uno de la cola.
      if (esErrorReintentable(e)) {
        console.log(`🛑 Problema de conexión, sesión o servidor (${statusNum || 'sin respuesta'}), deteniendo sync de cobros`);
        break;
      }
      // Error 4xx real de datos (validación, permisos, venta ya saldada):
      // reintentarlo no lo arregla y no debe bloquear los demás cobros, pero
      // TAMPOCO se borra en silencio — pasa a "rechazados" con el motivo.
      console.warn(`⚠️ Error servidor en cobro ${pago.id}:`, e.message);
      errores.push({ id: pago.id, cliente: pago.clienteNombre, monto: pago.monto, error: e.message });
      await moverARechazados(pago, e.message, statusNum);
      await eliminarPago(pago.id);
    }
  }

  return { total: cola.length, synced, errores };
};
