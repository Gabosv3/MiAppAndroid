import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import { fechaHoyLocal, fechaLocalDesde } from './dateUtils';
import {
  guardarRutaCache,
  leerClienteCache,
  guardarClientesCacheBatch,
  contarClientesConRespaldo,
  guardarVehiculosCache,
} from './cobrosOffline';
import * as localDb from './localDb';

// Precarga completa del día: se corre al iniciar (con señal) para que, cuando
// el cobrador/vendedor llegue a un cliente sin cobertura, YA tenga el detalle
// real guardado — no solo el resumen básico de la ruta. Antes el detalle de
// cada cliente se guardaba recién al abrirlo con señal, y si no se alcanzaba
// a abrir, offline no había nada.

const KEY_FECHA = 'PRECARGA_DIA_FECHA';
const CONCURRENCIA = 4;       // peticiones en paralelo: suficiente sin saturar la red del teléfono
const LOTE_GUARDADO = 15;     // clientes por escritura al almacenamiento (evita pisarse)
const TIMEOUT_CLIENTE = 20000;

let enCurso = null; // candado a nivel de módulo: nunca dos precargas a la vez

export const precargaHechaHoy = async () => {
  try { return (await AsyncStorage.getItem(KEY_FECHA)) === fechaHoyLocal(); }
  catch { return false; }
};

// El detalle real trae `resumen`; el respaldo básico de la ruta lo deja en null.
const tieneDetalleCompletoDeHoy = async (clienteId) => {
  const c = await leerClienteCache(clienteId);
  if (!c?.data?.resumen || !c.savedAt) return false;
  return fechaLocalDesde(new Date(c.savedAt)) === fechaHoyLocal();
};

const precargarCobros = async (onProgreso, errores) => {
  const { data } = await api.get('/cobros/ruta-hoy', { timeout: TIMEOUT_CLIENTE });
  await guardarRutaCache(data);

  const ids = [...new Set((data.rutas || []).flatMap((r) => (r.clientes || []).map((c) => c.id)))];
  const pendientes = [];
  for (const id of ids) {
    if (!(await tieneDetalleCompletoDeHoy(id))) pendientes.push(id);
  }

  let hechos = ids.length - pendientes.length;
  const total = ids.length;
  onProgreso?.({ fase: 'clientes', hechos, total });

  let lote = [];
  const volcarLote = async () => {
    if (lote.length === 0) return;
    const entradas = lote;
    lote = [];
    await guardarClientesCacheBatch(entradas, { sobrescribir: true });
  };

  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < pendientes.length) {
      const id = pendientes[siguiente++];
      try {
        const res = await api.get(`/cobros/clientes/${id}`, { timeout: TIMEOUT_CLIENTE });
        if (!res?.data?.cliente) throw new Error('respuesta sin datos del cliente');
        lote.push({ clienteId: id, data: res.data });
        if (lote.length >= LOTE_GUARDADO) await volcarLote();
        hechos += 1;
      } catch (e) {
        errores.push(`Cliente ${id}: ${e?.message || e}`);
      }
      onProgreso?.({ fase: 'clientes', hechos, total });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));
  await volcarLote();

  // Vehículos disponibles para vales de gasto (opcional: no todos los
  // cobradores tienen vehículo, un fallo aquí no invalida la precarga).
  try {
    const { data: vehiculos } = await api.get('/vehiculos/disponibles', { timeout: TIMEOUT_CLIENTE });
    if (Array.isArray(vehiculos)) await guardarVehiculosCache(vehiculos);
  } catch (e) { console.warn('[PrecargaDia] vehículos:', e?.message || e); }

  return { total, descargados: hechos, ids };
};

const precargarVentas = async (errores) => {
  try {
    const { data } = await api.get('/categorias', { timeout: TIMEOUT_CLIENTE });
    if (Array.isArray(data)) await localDb.saveCategories(data);
  } catch (e) { errores.push(`Categorías: ${e?.message || e}`); }

  try {
    const { data } = await api.get('/clientes?per_page=200&contexto=venta', { timeout: TIMEOUT_CLIENTE });
    const lista = Array.isArray(data) ? data : (data?.data || []);
    if (lista.length) await localDb.saveClients(lista);
  } catch (e) { errores.push(`Clientes para ventas: ${e?.message || e}`); }
};

/**
 * Descarga todo lo necesario para trabajar el día sin señal.
 * perfil: user.perfil ({ es_cobrador, es_vendedor }). onProgreso({fase, hechos, total}).
 * Devuelve { ok, total, descargados, faltantes, errores }. Solo marca el día
 * como "hecho" si no faltó ningún cliente, para que un reintento complete el resto.
 */
export const precargarDia = (perfil, onProgreso) => {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    const errores = [];
    let total = 0;
    let descargados = 0;
    try {
      if (perfil?.es_cobrador) {
        try {
          const r = await precargarCobros(onProgreso, errores);
          total = r.total;
          descargados = r.descargados;
        } catch (e) {
          errores.push(`Ruta del día: ${e?.message || e}`);
        }
      }
      if (perfil?.es_vendedor) {
        onProgreso?.({ fase: 'ventas', hechos: 0, total: 0 });
        await precargarVentas(errores);
      }
      const faltantes = Math.max(0, total - descargados);
      const ok = errores.length === 0;
      if (ok) await AsyncStorage.setItem(KEY_FECHA, fechaHoyLocal());
      if (errores.length) console.warn('[PrecargaDia] errores:', errores.slice(0, 10));
      return { ok, total, descargados, faltantes, errores };
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
};

export { contarClientesConRespaldo };
