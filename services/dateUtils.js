/**
 * Utilidades de fecha en hora de El Salvador (UTC-6, sin horario de verano).
 *
 * `toISOString()` siempre devuelve la fecha en UTC. Cerca de las 6:00pm hora
 * local (El Salvador), UTC ya marca el día siguiente — eso hacía que los
 * registros del día "desaparecieran" de los filtros de "hoy" en la noche.
 * Estas funciones calculan la fecha usando un offset fijo de -6 horas, sin
 * depender de la zona horaria configurada en el dispositivo ni de Intl/ICU.
 */

const EL_SALVADOR_OFFSET_HOURS = -6;

const pad2 = (n) => String(n).padStart(2, '0');

// Convierte cualquier Date a su fecha "YYYY-MM-DD" en hora de El Salvador.
export const fechaLocalDesde = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  // Normaliza a UTC real, sin importar la zona horaria del dispositivo, y
  // luego aplica el offset fijo de El Salvador.
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  const elSalvadorMs = utcMs + EL_SALVADOR_OFFSET_HOURS * 3600000;
  const local = new Date(elSalvadorMs);
  return `${local.getFullYear()}-${pad2(local.getMonth() + 1)}-${pad2(local.getDate())}`;
};

// Fecha de "hoy" en El Salvador, formato "YYYY-MM-DD".
export const fechaHoyLocal = () => fechaLocalDesde(new Date());

// Convierte un string ISO (ej. "2026-06-16T03:12:00.000Z") a su fecha local
// "YYYY-MM-DD" en El Salvador. Útil para comparar contra fechaHoyLocal().
export const fechaLocalDesdeISO = (iso) => {
  if (!iso) return '';
  return fechaLocalDesde(iso);
};
