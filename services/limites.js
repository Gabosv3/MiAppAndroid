// Topes que el servidor valida (rama api-domingo del backend). La app los aplica
// ANTES de enviar: así la persona ve el aviso al instante en vez de recibir un
// 422 después — y, sobre todo, una venta o un cobro con un dato absurdo no llega
// a la cola offline para fallar al sincronizar.

export const LIMITES = {
  CANTIDAD_MAX: 100000,            // cantidad de un producto (venta o asignación)
  PRECIO_MAX: 99999999.99,         // precio unitario
  CUOTAS_MIN: 2,
  CUOTAS_MAX: 120,
  DIAS_CREDITO_MIN: 1,
  DIAS_CREDITO_MAX: 3650,
  PRIMA_MAX: 9999999999.99,
  MONTO_COBRO_MIN: 0.01,           // cobro, vale y monto financiado del pagaré
  MONTO_COBRO_MAX: 99999999.99,
  DUI_MAX: 15,
  EMAIL_MAX: 100,
};

const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Mensaje de error si el monto no cabe en lo que acepta el servidor; null si está bien. */
export const validarMonto = (monto, nombre = 'El monto') => {
  const n = Number(monto);
  if (!Number.isFinite(n) || n < LIMITES.MONTO_COBRO_MIN) return `${nombre} debe ser al menos ${LIMITES.MONTO_COBRO_MIN}.`;
  if (n > LIMITES.MONTO_COBRO_MAX) return `${nombre} no puede ser mayor que ${fmt(LIMITES.MONTO_COBRO_MAX)}.`;
  return null;
};

/**
 * Revisa el carrito de una venta con las mismas cuentas que arma el payload
 * (precio_unitario = cuotas × precio_cuota en los productos a crédito).
 * Devuelve el primer problema encontrado, o null.
 */
export const validarLimitesVenta = (carrito = [], prima = 0) => {
  for (const i of carrito) {
    const nombre = i.nombre || `Producto ${i.id}`;
    const cantidad = Number(i.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1) return `"${nombre}": la cantidad debe ser un número entero de 1 en adelante.`;
    if (cantidad > LIMITES.CANTIDAD_MAX) return `"${nombre}": la cantidad no puede pasar de ${fmt(LIMITES.CANTIDAD_MAX)}.`;

    const esCredito = Number(i.cuotas) > 0;
    if (esCredito) {
      const cuotas = Number(i.cuotas);
      if (!Number.isInteger(cuotas) || cuotas < LIMITES.CUOTAS_MIN || cuotas > LIMITES.CUOTAS_MAX) {
        return `"${nombre}": las cuotas deben ser entre ${LIMITES.CUOTAS_MIN} y ${LIMITES.CUOTAS_MAX}.`;
      }
    }
    const precio = esCredito && i.precio_cuota
      ? Number(i.cuotas) * Number(i.precio_cuota)
      : parseFloat(i.precio_venta || 0);
    if (!Number.isFinite(precio) || precio < 0) return `"${nombre}": el precio no es válido.`;
    if (precio > LIMITES.PRECIO_MAX) return `"${nombre}": el precio no puede pasar de ${fmt(LIMITES.PRECIO_MAX)}.`;
  }
  if (Number(prima) > LIMITES.PRIMA_MAX) return `La prima no puede pasar de ${fmt(LIMITES.PRIMA_MAX)}.`;
  return null;
};

/** Cantidades de una asignación (productos + cantidad_asignada), sin repetidos. */
export const validarLimitesAsignacion = (detalles = []) => {
  const vistos = new Set();
  for (const d of detalles) {
    const nombre = d.nombre || `Producto ${d.producto_id}`;
    if (vistos.has(d.producto_id)) return `"${nombre}" está repetido: un producto solo puede aparecer una vez en la asignación.`;
    vistos.add(d.producto_id);
    const c = Number(d.cantidad_asignada);
    if (!Number.isFinite(c) || c < 1) return `"${nombre}": la cantidad debe ser al menos 1.`;
    if (c > LIMITES.CANTIDAD_MAX) return `"${nombre}": la cantidad no puede pasar de ${fmt(LIMITES.CANTIDAD_MAX)}.`;
  }
  return null;
};
