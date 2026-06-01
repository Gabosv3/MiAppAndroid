import api from './api';

export async function getMe() {
  const { data } = await api.get('/me');
  return data;
}

export async function getAsignacionHoy() {
  const { data } = await api.get('/asignacion/hoy');
  return data;
}

export async function getProductos(q = '') {
  const qs = `per_page=200${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  const { data } = await api.get(`/productos?${qs}`);
  return data;
}

export default {
  getMe,
  getAsignacionHoy,
  getProductos,
};
