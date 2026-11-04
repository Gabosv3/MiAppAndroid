// Compara el libro propio de la app (lo que el cobrador registró en el teléfono)
// contra el historial del servidor. Función pura: sin almacenamiento ni red, para
// poder probarla sola.
//
// Caso que motivó esto: el cobrador registró un cobro de $90 y el servidor dejó
// $37. El servidor responde al pagar con el monto que RECIBIÓ (eco), no con lo
// que guardó, así que la diferencia solo se ve comparando con el historial.

const TOLERANCIA = 0.005;
export const redondear = (n) => Math.round(Number(n || 0) * 100) / 100;

export const ESTADOS = {
  coincide: 'coincide',               // mismo recibo y mismo monto
  diferencia: 'diferencia',           // mismo recibo, monto distinto
  noEnServidor: 'no_en_servidor',     // la app lo envió pero el servidor no lo tiene
  pendiente: 'pendiente',             // sigue en la cola del teléfono (no se ha enviado)
  rechazado: 'rechazado',             // el servidor lo rechazó
  soloServidor: 'solo_servidor',      // está en el servidor pero no en el libro de la app
};

/**
 * entradas: libro de la app para ese día (cobros).
 *   { id, numeroRecibo, monto, estado: 'enviado'|'pendiente'|'rechazado', clienteNombre, ... }
 * itemsServidor: items de GET /cobros/historial (se usan los tipo 'pago').
 *   { numero_recibo, monto, cliente: { nombre }, hora, ... }
 */
export const compararLibroConServidor = (entradas = [], itemsServidor = []) => {
  const pagosServidor = itemsServidor.filter((i) => i?.tipo === 'pago');
  const porRecibo = new Map(
    pagosServidor.filter((p) => p.numero_recibo).map((p) => [p.numero_recibo, p])
  );
  const usados = new Set();

  const filas = entradas.map((e) => {
    const base = { entrada: e, montoApp: redondear(e.monto) };

    if (e.estado === 'rechazado') return { ...base, estado: ESTADOS.rechazado };

    const s = e.numeroRecibo ? porRecibo.get(e.numeroRecibo) : null;
    if (s) {
      usados.add(s.numero_recibo);
      const dif = redondear(base.montoApp - redondear(s.monto));
      return {
        ...base,
        servidor: s,
        montoServidor: redondear(s.monto),
        diferencia: dif,
        estado: Math.abs(dif) < TOLERANCIA ? ESTADOS.coincide : ESTADOS.diferencia,
      };
    }

    // Todavía en la cola del teléfono: aún no es un problema, solo está pendiente.
    if (e.estado === 'pendiente') return { ...base, estado: ESTADOS.pendiente };

    // Se envió (el servidor respondió OK) pero ese recibo no aparece en su historial.
    return { ...base, estado: ESTADOS.noEnServidor };
  });

  const soloServidor = pagosServidor
    .filter((p) => !(p.numero_recibo && usados.has(p.numero_recibo)))
    .map((p) => ({ servidor: p, montoServidor: redondear(p.monto), estado: ESTADOS.soloServidor }));

  const todas = [...filas, ...soloServidor];

  // Solo cuenta para el total de la app lo que ya debería estar en el servidor.
  const enviadas = filas.filter((f) => f.estado !== ESTADOS.pendiente && f.estado !== ESTADOS.rechazado);
  const totalApp = redondear(enviadas.reduce((s, f) => s + f.montoApp, 0));
  const totalServidor = redondear(pagosServidor.reduce((s, p) => s + Number(p.monto || 0), 0));
  const totalPendiente = redondear(filas.filter((f) => f.estado === ESTADOS.pendiente).reduce((s, f) => s + f.montoApp, 0));

  const cuenta = (estado) => todas.filter((f) => f.estado === estado).length;
  return {
    filas: todas,
    totales: {
      totalApp,
      totalServidor,
      diferencia: redondear(totalApp - totalServidor),
      totalPendiente,
    },
    conteo: {
      coincide: cuenta(ESTADOS.coincide),
      diferencia: cuenta(ESTADOS.diferencia),
      noEnServidor: cuenta(ESTADOS.noEnServidor),
      pendiente: cuenta(ESTADOS.pendiente),
      rechazado: cuenta(ESTADOS.rechazado),
      soloServidor: cuenta(ESTADOS.soloServidor),
    },
    hayProblemas: todas.some((f) => [ESTADOS.diferencia, ESTADOS.noEnServidor, ESTADOS.soloServidor, ESTADOS.rechazado].includes(f.estado)),
  };
};
