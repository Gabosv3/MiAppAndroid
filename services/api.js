import axios from 'axios';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

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
      const msg = error.response.data?.message || `Error ${error.response.status}`;
      return Promise.reject(new Error(msg));
    }
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new Error('Tiempo de espera agotado'));
    }
    return Promise.reject(new Error('Sin conexión con el servidor'));
  }
);

export default api;
