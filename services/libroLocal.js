import AsyncStorage from '@react-native-async-storage/async-storage';
import { fechaHoyLocal } from './dateUtils';
import { compararLibroConServidor, ESTADOS, redondear } from './conciliacion';
import { reportarErrorSync } from './reporteSync';

// LIBRO PROPIO DE LA APP.
//
// Registro de cada cobro tal como lo capturó el cobrador en el teléfono (monto,
// recibo, cliente, hora), guardado ANTES de depender de lo que responda el
// servidor. Es independiente del historial del servidor: sirve para comparar
// ambos y detectar diferencias (p. ej. un cobro de $90 que el servidor guardó
// como $37).
//
// A diferencia de COBROS_HISTORIAL (que se reemplaza con la respuesta del
// servidor y se recorta a 200), el libro conserva SIEMPRE el monto original y
// nunca se sobrescribe con lo que diga el servidor.

const KEY = 'LIBRO_LOCAL_COBROS';
const MAX_ENTRADAS = 1500;
const DIAS_A_GUARDAR = 60;

let _cadena = Promise.resolve();
const conBloqueo = (fn) => {
  const siguiente = _cadena.catch(() => {}).then(fn);
  _cadena = siguiente;
  return siguiente;
};

const leerTodo = async () => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const lista = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? lista : [];
  } catch (e) {
    console.warn('[libroLocal] libro ilegible, se respalda:', e?.message || e);
    try { const raw = await AsyncStorage.getItem(KEY); if (raw) await AsyncStorage.setItem(`${KEY}__CORRUPTO`, raw); } catch { /* nada */ }
    return [];
  }
};

const guardarTodo = async (lista) => {
  const limite = Date.now() - DIAS_A_GUARDAR * 24 * 3600 * 1000;
  const recortada = lista.filter((e) => Date.parse(e.creadoEn) >= limite).slice(-MAX_ENTRADAS);
  await AsyncStorage.setItem(KEY, JSON.stringify(recortada));
};

/**
 * Anota un cobro en el libro. entrada: { id (clave de idempotencia), usuarioId,
 * clienteId, clienteNombre, ventaId, ventaNumero, numeroRecibo, monto, metodo,
 * estado: 'enviado'|'pendiente', origen: 'online'|'offline' }
 * No lanza: un fallo del libro nunca debe impedir registrar el cobro.
 */
export const registrarCobroEnLibro = async (entrada) => {
  try {
    await conBloqueo(async () => {
      const lista = await leerTodo();
      if (lista.some((e) => e.id === entrada.id)) return;
      lista.push({
        tipo: 'pago',
        ...entrada,
        monto: redondear(entrada.monto),
        creadoEn: entrada.creadoEn || new Date().toISOString(),
        fecha: fechaHoyLocal(),
      });
      await guardarTodo(lista);
    });
  } catch (e) {
    console.warn('[libroLocal] no se pudo anotar el cobro:', e?.message || e);
  }
};

/** Cambia estado/recibo de una entrada (p. ej. cuando un cobro offline se sincroniza). */
export const actualizarEntradaLibro = async (id, cambios) => {
  try {
    await conBloqueo(async () => {
      const lista = await leerTodo();
      const i = lista.findIndex((e) => e.id === id);
      if (i === -1) return;
      // El monto original NO se toca nunca.
      const { monto: _ignorar, ...seguros } = cambios || {};
      lista[i] = { ...lista[i], ...seguros };
      await guardarTodo(lista);
    });
  } catch (e) {
    console.warn('[libroLocal] no se pudo actualizar la entrada:', e?.message || e);
  }
};

export const leerLibroDelDia = async (fecha, usuarioId) => {
  const lista = await leerTodo();
  return lista.filter((e) => e.fecha === fecha && (usuarioId == null || e.usuarioId == null || e.usuarioId === usuarioId));
};

/**
 * Compara el libro del día contra el historial del servidor.
 * Guarda el resultado de la verificación en cada entrada y reporta al panel las
 * diferencias (una sola vez por entrada y monto del servidor).
 */
export const conciliarDia = async ({ api, fecha, usuarioId }) => {
  const entradas = await leerLibroDelDia(fecha, usuarioId);
  const { data } = await api.get('/cobros/historial', { params: { fecha }, timeout: 25000 });
  const resultado = compararLibroConServidor(entradas, data?.items || []);

  const ahora = new Date().toISOString();
  for (const fila of resultado.filas) {
    if (!fila.entrada) continue;
    const e = fila.entrada;
    await actualizarEntradaLibro(e.id, {
      verificacion: { estado: fila.estado, montoServidor: fila.montoServidor ?? null, verificadoEn: ahora },
    });

    if (fila.estado === ESTADOS.diferencia || fila.estado === ESTADOS.noEnServidor) {
      const detalle = fila.estado === ESTADOS.diferencia
        ? `La app registró $${fila.montoApp.toFixed(2)} y el servidor tiene $${fila.montoServidor.toFixed(2)} (diferencia $${fila.diferencia.toFixed(2)}).`
        : `La app registró $${fila.montoApp.toFixed(2)} pero el servidor no tiene ese recibo.`;
      reportarErrorSync({
        client_id: `d-${e.id}-${fila.montoServidor ?? 'x'}`,
        tipo: 'diferencia',
        metodo: 'POST',
        endpoint: `/cobros/clientes/${e.clienteId}/pagar`,
        etiqueta: `Cobro ${e.clienteNombre || ''} — ${e.numeroRecibo || e.id}`.trim(),
        monto: fila.montoApp,
        motivo: detalle,
        ocurrido_en: e.creadoEn,
      });
    }
  }

  return { fecha, ...resultado, totalesServidorApi: { total_cobrado: data?.total_cobrado ?? null } };
};

// Comparación automática en segundo plano: sin que nadie tenga que abrir la pantalla,
// el libro de hoy se contrasta con el servidor (máx. una vez cada 20 min) y las
// diferencias llegan al panel de monitoreo. Solo si hay cobros anotados hoy.
let _ultimaAuto = 0;
const CADA_MS = 20 * 60 * 1000;
export const conciliarEnSegundoPlano = async ({ api, usuarioId }) => {
  try {
    if (Date.now() - _ultimaAuto < CADA_MS) return;
    const fecha = fechaHoyLocal();
    const entradas = await leerLibroDelDia(fecha, usuarioId);
    if (entradas.length === 0) return;
    _ultimaAuto = Date.now();
    await conciliarDia({ api, fecha, usuarioId });
  } catch (e) {
    console.warn('[libroLocal] comparación automática falló:', e?.message || e);
  }
};
