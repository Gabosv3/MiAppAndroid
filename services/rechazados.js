import { Alert } from 'react-native';
import * as offlineQueue from './offlineQueue';
import { leerPagosRechazados, descartarPagosRechazados } from './cobrosOffline';

// Operaciones guardadas sin conexión que el servidor rechazó (4xx de datos).
// Antes se borraban de la cola sin avisar y el cobro/venta simplemente
// desaparecía. Ahora se conservan y se le muestran al usuario con el motivo.

let mostrando = false;

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

export const contarRechazados = async () => {
  const [pagos, cola] = await Promise.all([leerPagosRechazados(), offlineQueue.getRejected()]);
  return pagos.length + cola.length;
};

export const avisarRechazados = async () => {
  if (mostrando) return;
  try {
    const [pagos, cola] = await Promise.all([leerPagosRechazados(), offlineQueue.getRejected()]);
    if (pagos.length + cola.length === 0) return;
    mostrando = true;

    const lineas = [
      ...pagos.map((p) => `• Cobro ${p.clienteNombre || ''} ${fmt(p.monto)}${p.numeroRecibo ? ` (${p.numeroRecibo})` : ''}\n   Motivo: ${p.motivo}`),
      ...cola.map((c) => `• ${c.label || c.url}\n   Motivo: ${c.motivo}`),
    ].slice(0, 8);
    const extra = pagos.length + cola.length - lineas.length;

    Alert.alert(
      `⚠️ ${pagos.length + cola.length} operación(es) rechazada(s) por el servidor`,
      `No se registraron en el sistema. Avisa a tu supervisor antes de borrarlas:\n\n${lineas.join('\n')}${extra > 0 ? `\n… y ${extra} más` : ''}`,
      [
        { text: 'Ver luego', style: 'cancel', onPress: () => { mostrando = false; } },
        {
          text: 'Ya las revisé',
          style: 'destructive',
          onPress: async () => {
            await Promise.all([descartarPagosRechazados(), offlineQueue.clearRejected()]);
            mostrando = false;
          },
        },
      ],
      { cancelable: false }
    );
  } catch (e) {
    mostrando = false;
    console.warn('[rechazados] no se pudo revisar:', e?.message || e);
  }
};
