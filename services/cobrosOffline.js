import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  ruta:    'COBROS_RUTA_CACHE',
  clientes:'COBROS_CLIENTES_CACHE',
  pagos:   'COBROS_PAGOS_PENDIENTES',
};

// ─── RUTA HOY ───────────────────────────────────────────────────────────────

export const guardarRutaCache = async (data) => {
  await AsyncStorage.setItem(KEYS.ruta, JSON.stringify({ data, savedAt: Date.now() }));
};

export const leerRutaCache = async () => {
  const raw = await AsyncStorage.getItem(KEYS.ruta);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
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

// ─── SINCRONIZAR PAGOS ───────────────────────────────────────────────────────

export const sincronizarPagosPendientes = async (api) => {
  const cola = await leerPagosPendientes();
  if (cola.length === 0) return { total: 0, synced: 0, errores: [] };

  let synced = 0;
  const errores = [];

  for (const pago of cola) {
    try {
      await api.post(`/cobros/clientes/${pago.clienteId}/pagar`, {
        monto: pago.monto,
        metodo_pago: pago.metodo,
        ...(pago.ventaId    && { venta_id: pago.ventaId }),
        ...(pago.referencia && { referencia: pago.referencia }),
        ...(pago.notas      && { observaciones: pago.notas }),
      });
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
