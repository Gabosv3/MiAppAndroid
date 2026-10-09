import axios from 'axios';
import Constants from 'expo-constants';

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
      if (error.response.status === 401 && !error.config?.url?.includes('/login')) {
        _onSesionExpirada?.();
      }
      const msg = error.response.data?.message || `Error ${error.response.status}`;
      const serverError = new Error(msg);
      serverError.response = error.response; // IMPORTANTE: preservar response
      return Promise.reject(serverError);
    }
    _onTransitorio?.(true);
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new Error('Tiempo de espera agotado'));
    }
    return Promise.reject(new Error('Sin conexión con el servidor'));
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
