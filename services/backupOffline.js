/**
 * Respaldo en texto plano de todo lo que se guarda offline (cobros, ventas,
 * etc. que todavía no llegaron al servidor).
 *
 * Por qué existe: la cola offline normal vive en el almacenamiento privado
 * de la app (AsyncStorage) — si alguien desinstala la app (a propósito o
 * "para arreglarla"), esa cola se borra sin dejar rastro. Este archivo se
 * escribe en una carpeta pública del teléfono (elegida una vez con el
 * selector del sistema), así que sobrevive aunque se desinstale la app —
 * solo se pierde si además se borra el archivo a mano o se resetea el
 * teléfono de fábrica.
 *
 * No reemplaza la cola offline (esa sigue siendo la que de verdad reintenta
 * el envío) — es una bitácora aparte, de solo escritura, para poder
 * reconstruir a mano qué se cobró si algo se pierde.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform, Alert } from 'react-native';

const DIR_URI_KEY = '@sidb/backup_dir_uri';
const NOMBRE_ARCHIVO = 'SIDB_respaldo_pendientes.txt';

let _dirUriCache = null;

const getDirUri = async () => {
  if (_dirUriCache) return _dirUriCache;
  try {
    const guardado = await AsyncStorage.getItem(DIR_URI_KEY);
    if (guardado) {
      _dirUriCache = guardado;
      return guardado;
    }
  } catch { /* ignore */ }
  return null;
};

// Pide UNA vez al usuario que elija una carpeta (recomendado: Descargas) —
// el permiso queda guardado por el sistema operativo y no hay que volver a
// pedirlo. Se debe llamar desde una acción explícita del usuario (botón en
// Diagnóstico), no automáticamente, porque abre un selector nativo.
export const configurarCarpetaRespaldo = async () => {
  if (Platform.OS !== 'android') {
    return { ok: false, mensaje: 'El respaldo automático solo está disponible en Android.' };
  }
  try {
    const permiso = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permiso.granted) {
      return { ok: false, mensaje: 'No se concedió permiso a ninguna carpeta.' };
    }
    await AsyncStorage.setItem(DIR_URI_KEY, permiso.directoryUri);
    _dirUriCache = permiso.directoryUri;
    // Línea de prueba, para que el usuario vea de inmediato que sí quedó escribiendo ahí.
    await escribirLinea(`[${new Date().toLocaleString('es-SV')}] Respaldo activado en este teléfono.`);
    return { ok: true };
  } catch (e) {
    return { ok: false, mensaje: e?.message || 'No se pudo configurar la carpeta.' };
  }
};

export const hayCarpetaConfigurada = async () => !!(await getDirUri());

// Se llama después de cada login exitoso (ver AuthContext.js). Como la app se
// reinstala seguido en campo, esperar a que un admin entre con la clave de
// Diagnóstico a activarlo cada vez no sirve — el permiso de carpeta se pierde
// con cada reinstalación aunque el archivo en sí sobreviva. Esto lo deja
// listo solo, sin depender de nadie, apenas la persona vuelve a entrar.
// El aviso previo es deliberadamente genérico (no menciona cobros ni
// respaldo "antifraude") — para quien lo usa a diario es solo un paso más
// de la app, como cualquier otro permiso.
export const asegurarConfiguradoTrasLogin = async () => {
  if (Platform.OS !== 'android') return;
  if (await hayCarpetaConfigurada()) return;

  Alert.alert(
    'Configuración inicial',
    'Para continuar, elegí la carpeta "Descargas" en la siguiente pantalla y tocá "Usar esta carpeta".',
    [{
      text: 'Continuar',
      onPress: async () => {
        const resultado = await configurarCarpetaRespaldo();
        if (!resultado.ok) {
          // Si cancela el selector, se le vuelve a pedir en el próximo login
          // — no se le insiste en el momento para no trabar el flujo normal.
          console.warn('[backupOffline] No se configuró la carpeta:', resultado.mensaje);
        }
      },
    }],
    { cancelable: false }
  );
};

// Busca (o crea) el archivo de respaldo dentro de la carpeta elegida y le
// agrega una línea al final. SAF no tiene "append" nativo — hay que leer el
// contenido actual y reescribirlo completo con la línea nueva agregada.
const escribirLineaInterno = async (linea) => {
  const dirUri = await getDirUri();
  if (!dirUri) return false; // Todavía no se configuró ninguna carpeta — no hay dónde escribir.

  try {
    const archivos = await FileSystem.StorageAccessFramework.readDirectoryAsync(dirUri);
    let fileUri = archivos.find((f) => f.endsWith(NOMBRE_ARCHIVO));

    if (!fileUri) {
      fileUri = await FileSystem.StorageAccessFramework.createFileAsync(dirUri, NOMBRE_ARCHIVO, 'text/plain');
    }

    let actual = '';
    try {
      actual = await FileSystem.StorageAccessFramework.readAsStringAsync(fileUri);
    } catch { /* archivo recién creado, todavía vacío */ }

    await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, actual + linea + '\n');
    return true;
  } catch (e) {
    console.warn('[backupOffline] No se pudo escribir en el respaldo:', e?.message);
    return false;
  }
};

// Cola interna — sin esto, dos cobros guardados casi al mismo tiempo (ej. un
// abono a varias cuentas de un grupo familiar en la misma visita) pueden
// leer el archivo "antes" de que el otro termine de reescribirlo, y una de
// las dos líneas se pierde. Cada llamada espera a que termine la anterior
// antes de leer+reescribir, así nunca se pisan entre sí.
let colaEscritura = Promise.resolve();
const escribirLinea = (linea) => {
  colaEscritura = colaEscritura.then(() => escribirLineaInterno(linea));
  return colaEscritura;
};

// Se llama cada vez que algo queda encolado offline (cobro, venta, etc.) —
// deja registrada la línea aunque después la app se desinstale antes de
// que ese registro se sincronice.
// Este archivo queda en una carpeta PÚBLICA del teléfono (legible por
// cualquier gestor de archivos), así que no se vuelca el payload completo de
// cada petición — solo lo necesario para reconstruir a mano un cobro o una
// venta. Datos personales (DUI, dirección, teléfonos, fotos) nunca entran.
const CAMPOS_SEGUROS = [
  'monto', 'metodo', 'metodo_pago', 'referencia', 'numeroRecibo',
  'clienteId', 'cliente_id', 'clienteNombre', 'ventaId', 'venta_id', 'ventaNumero',
  'tipo_pago', 'total', 'pago_recibido', 'abono_inicial', 'prima',
  'descuento_porcentaje', 'sucursal_id',
];

const resumirDatos = (data) => {
  const salida = {};
  for (const campo of CAMPOS_SEGUROS) {
    const valor = data?.[campo];
    if (valor !== undefined && valor !== null && valor !== '') salida[campo] = valor;
  }
  if (Array.isArray(data?.detalles)) {
    salida.detalles = data.detalles.map((d) => ({
      producto_id: d?.producto_id,
      cantidad: d?.cantidad,
      ...(d?.cuotas ? { cuotas: d.cuotas } : {}),
    }));
  }
  return salida;
};

export const registrarPendiente = async ({ label, url, data }) => {
  const resumenMonto = data?.monto ?? data?.pago_recibido ?? data?.abono_inicial ?? null;
  const datos = resumirDatos(data);
  const linea = `[${new Date().toLocaleString('es-SV')}] PENDIENTE — ${label || url}` +
    (resumenMonto !== null ? ` — monto: ${resumenMonto}` : '') +
    (Object.keys(datos).length > 0 ? ` — datos: ${JSON.stringify(datos)}` : '');
  await escribirLinea(linea);
};

// Se llama cuando ese mismo registro finalmente se sincroniza con éxito —
// así el .txt queda como bitácora completa (qué se guardó offline Y qué de
// eso sí se confirmó en el servidor), no solo una lista de sospechas.
export const registrarSincronizado = async ({ label, url }) => {
  const linea = `[${new Date().toLocaleString('es-SV')}] ✅ SINCRONIZADO — ${label || url}`;
  await escribirLinea(linea);
};
