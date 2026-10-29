import axios from 'axios';
import Constants from 'expo-constants';
import { addDebugLog } from './debugLog';

const envUrl = process.env.EXPO_PUBLIC_API_URL;
const manifestUrl = Constants.manifest?.extra?.EXPO_PUBLIC_API_URL;
const expoConfigUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_URL;
const BASE_URL = envUrl || manifestUrl || expoConfigUrl || 'https://panel.distribuidorabriancescomenjivar.com/api';

if (!envUrl && !manifestUrl && !expoConfigUrl) {
  console.warn('API URL no encontrada en variables de entorno, usando fallback:', BASE_URL);
} else {
  console.log('API URL configurada:', BASE_URL);
}

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Timeout corto para pantallas que tienen caché local de respaldo (ruta de
// hoy, asignación de productos, categorías, historial, etc.). Con el timeout
// default de 20s, una conexión lenta (pero no totalmente caída) dejaba a
// esas pantallas "colgadas" hasta 20 segundos antes de mostrar los datos
// guardados — el modo offline tardaba en "activarse" aunque ya estuviera
// disponible. Las escrituras críticas (ventas, pagos) NO deben usar este
// timeout corto: necesitan más margen para completarse en conexión lenta,
// y quedan protegidas contra duplicados por idempotency_key si sí se
// quedan cortas.
export const TIMEOUT_LECTURA_CACHE = 8000;

// Notificado por el interceptor de abajo cada vez que un request falla de
// forma transitoria (sin respuesta, o 5xx) — permite que ConnectivityProvider
// reaccione al instante en vez de esperar el próximo ping periódico (hasta
// 15s de retraso). Se registra desde services/connectivity.js.
let _onTransitorio = null;
export const setTransitorioListener = (fn) => { _onTransitorio = fn; };

// Avisa cuando el servidor rechaza el token (401) fuera del propio /login —
// antes esto nunca pasaba a media sesión porque los tokens no vencían, pero
// ahora sí expiran (60 días) y un teléfono con la app abierta muchos días
// seguidos puede toparse con esto sin haber cerrado sesión. Sin este aviso,
// cada pantalla mostraría un error de "no autorizado" distinto en vez de
// mandar al cobrador a iniciar sesión de nuevo. Se registra desde
// AuthContext.
let _onSesionExpirada = null;
export const setSesionExpiradaListener = (fn) => { _onSesionExpirada = fn; };

// Token a nivel de módulo para compartir con AuthContext sin pasar props
let _token = null;

export const setAuthToken = (token) => { _token = token; };
export const clearAuthToken = () => { _token = null; };

api.interceptors.request.use((config) => {
  if (_token) config.headers.Authorization = `Bearer ${_token}`;
  return config;
});

const endpointDe = (error) =>
  `${(error.config?.method || 'get').toUpperCase()} ${error.config?.url || '?'}`;

// Cada fallo queda en el registro de depuración (visible en Diagnóstico) sin
// bloquear el flujo: un 401 del ping de conectividad sin sesión es ruido.
const registrarFalloApi = (error, estado, mensaje) => {
  if (estado === 401 && !_token) return;
  // El ping de /me y el heartbeat fallan cada pocos segundos sin red; se
  // registrarían cientos de veces y taparían los errores útiles.
  const url = error.config?.url || '';
  if (estado === 'red' && (url === '/me' || url.includes('heartbeat'))) return;
  console.warn('[API]', endpointDe(error), '→', estado, mensaje);
  addDebugLog(`API ${endpointDe(error)} → ${estado}`, { mensaje: String(mensaje).slice(0, 400) });
};

api.interceptors.response.use(
  (response) => {
    // Un request que sí completó demuestra que hay conexión — recupera el
    // estado "en línea" al instante en vez de esperar el próximo ping.
    _onTransitorio?.(false);
    return response;
  },
  (error) => {
    if (error.response) {
      // Error del servidor (4xx, 5xx) — preservar .response para que offlineQueue distinga
      if (error.response.status >= 500) _onTransitorio?.(true);
      // Solo cuenta como sesión expirada si el request llevaba token: el ping
      // de ConnectivityProvider golpea /me sin sesión y ese 401 es esperado.
      if (error.response.status === 401 && _token && !error.config?.url?.includes('/login')) {
        _onSesionExpirada?.();
      }
      const { status, data } = error.response;
      // El backend responde { message } (Laravel/validación) o { mensaje } (la mayoría
      // de los controladores propios) o { error }: se aceptan los tres.
      const base = data?.message || data?.mensaje || (typeof data?.error === 'string' ? data.error : null) || `Error ${status}`;
      // Laravel 422: { message, errors: { campo: [msgs] } } — se muestra cada
      // campo inválido en vez de solo "The given data was invalid".
      const campos = data?.errors && typeof data.errors === 'object'
        ? Object.values(data.errors).flat().filter(Boolean)
        : [];
      let msg = campos.length ? `${base}\n• ${campos.join('\n• ')}` : base;
      // Para 5xx el mensaje del servidor no dice dónde ocurrió — se agrega
      // el endpoint y el código HTTP para poder ubicar el fallo.
      if (status >= 500) msg += `\n(HTTP ${status} en ${endpointDe(error)})`;
      else if (base === `Error ${status}`) msg += ` en ${endpointDe(error)}`;
      const serverError = new Error(msg);
      serverError.response = error.response; // IMPORTANTE: preservar response
      serverError.status = status;
      serverError.campos = data?.errors || null;
      registrarFalloApi(error, status, msg);
      return Promise.reject(serverError);
    }
    _onTransitorio?.(true);
    const detalleRed = `${endpointDe(error)}\nURL base: ${BASE_URL}`;
    const netError = error.code === 'ECONNABORTED'
      ? new Error(`Tiempo de espera agotado\n${detalleRed}`)
      : new Error(`Sin conexión con el servidor\n${detalleRed}`);
    registrarFalloApi(error, 'red', netError.message);
    return Promise.reject(netError);
  }
);

// Un error se considera "transitorio" (equivalente a sin conexión, aunque el
// teléfono sí tenga señal) cuando:
//   - No hubo respuesta del servidor (red caída, timeout)
//   - El servidor respondió pero con 5xx (caído momentáneamente, reiniciando,
//     el proxy devolvió 502/503/504 mientras el backend no estaba listo)
// En ambos casos NO es un error de datos del usuario — el request debe
// guardarse/reintentarse, no descartarse ni mostrarse como error final.
// Un 4xx (400, 403, 404, 422, etc.) sí es un error real de datos y no cae aquí.
export const esErrorTransitorio = (error) => {
  if (!error?.response) return true;
  return error.response.status >= 500;
};

export default api;
