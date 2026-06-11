import axios from 'axios';
import Constants from 'expo-constants';

const envUrl = process.env.EXPO_PUBLIC_API_URL;
const manifestUrl = Constants.manifest?.extra?.EXPO_PUBLIC_API_URL;
const expoConfigUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_URL;
const BASE_URL = envUrl || manifestUrl || expoConfigUrl || 'http://192.168.1.13:8000/api';

if (!envUrl && !manifestUrl && !expoConfigUrl) {
  console.warn('API URL no encontrada en variables de entorno, usando fallback:', BASE_URL);
} else {
  console.log('API URL configurada:', BASE_URL);
}

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Token a nivel de módulo para compartir con AuthContext sin pasar props
let _token = null;

export const setAuthToken = (token) => { _token = token; };
export const clearAuthToken = () => { _token = null; };

api.interceptors.request.use((config) => {
  if (_token) config.headers.Authorization = `Bearer ${_token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Error del servidor (4xx, 5xx) — preservar .response para que offlineQueue distinga
      const msg = error.response.data?.message || `Error ${error.response.status}`;
      const serverError = new Error(msg);
      serverError.response = error.response; // IMPORTANTE: preservar response
      return Promise.reject(serverError);
    }
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new Error('Tiempo de espera agotado'));
    }
    return Promise.reject(new Error('Sin conexión con el servidor'));
  }
);

export default api;
