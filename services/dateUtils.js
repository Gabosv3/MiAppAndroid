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
  // Un string "YYYY-MM-DD" puro (ej. la fecha de próxima visita) ya ES el día
  // calendario que se quiso decir — no representa un instante que haya que
  // convertir. `new Date("2026-08-10")` lo interpreta como medianoche UTC, y
  // restarle el offset de El Salvador lo corre un día hacia atrás. Se
  // devuelve tal cual, sin pasar por la conversión de instante a zona horaria.
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
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

// Fecha corta "DD/MM/YYYY" para recibos impresos — acepta Date, ISO completo,
// o "YYYY-MM-DD". Siempre con ceros a la izquierda, sin depender del locale
// del dispositivo (evita "20/7/2026" vs "20/07/2026" según el teléfono).
export const fmtFechaCorta = (value) => {
  if (!value) return '';
  const iso = fechaLocalDesde(value);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
