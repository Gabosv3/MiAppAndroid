/**
 * Envío del recibo al cliente por WhatsApp: un mensaje de texto (siempre con
 * la página web de la distribuidora) + el recibo en PDF.
 *
 * WhatsApp no deja mandar texto y archivo en un solo paso desde un link
 * wa.me ni desde el menú de compartir, así que se hace en dos pasos:
 *   1. Se abre el chat del cliente (número ya cargado) con el texto escrito.
 *      Se hace primero porque así el chat queda abierto/reciente y el
 *      destinatario es el correcto — el menú de compartir no puede
 *      prellenar a quién se manda.
 *   2. Al volver a la app, se ofrece mandar el PDF por el menú de compartir
 *      (el chat del cliente aparece arriba en "recientes").
 */
import { AppState, Linking, Alert } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

export const URL_WEB = 'https://distribuidorabriancescomenjivar.com/';

// Únicos métodos de pago del negocio — se muestran en el texto de WhatsApp y
// al pie de todos los PDF (cobro, abono grupal, venta). Si cambia la cuenta,
// se edita solo aquí.
export const DATOS_PAGO = {
  intro: 'Nuestros únicos métodos de pago son con el POS y a la cuenta:',
  banco: 'Banco América Central',
  tipoCuenta: 'Cuenta corriente',
  numeroCuenta: '201549177',
  nombreCuenta: 'Giancarlos Briancesco',
};

// Solo los métodos de pago — lo llevan los tickets que se imprimen y, dentro
// del pie, los PDF. "base" es el tamaño de letra en px (cada comprobante usa
// una escala distinta).
export const htmlMetodosPago = (base = 12) => `
    <div style="font-size:${base}px;line-height:1.5;text-align:left">
      <b>Métodos de pago</b><br/>
      ${DATOS_PAGO.intro}<br/>
      Banco: ${DATOS_PAGO.banco}<br/>
      Tipo de cuenta: ${DATOS_PAGO.tipoCuenta}<br/>
      Número de cuenta: <b>${DATOS_PAGO.numeroCuenta}</b><br/>
      Nombre de la cuenta: ${DATOS_PAGO.nombreCuenta}
    </div>`;

// Pie de los PDF: tienda en línea + métodos de pago.
export const htmlPieInformativo = (base = 12) => `
    <div style="border-top:1px solid #999;margin:8px 0"></div>
    <div style="text-align:center;font-size:${base}px;line-height:1.5">Visita nuestra tienda en línea:<br/><a href="${URL_WEB}" style="color:#1565C0;font-weight:700;text-decoration:none">${URL_WEB}</a></div>
    <div style="border-top:1px solid #999;margin:8px 0"></div>${htmlMetodosPago(base)}`;

const SALUDO_PAGO = '¡Gracias por su pago! 🙏';
const PIE_PAGO = '_Por favor confirme respondiendo *SÍ* si este recibo corresponde a su pago. En caso de alguna diferencia, comuníquese con nosotros._';

const construirTexto = ({ saludo = SALUDO_PAGO, resumenLinea, pie = PIE_PAGO }) =>
`🏪 *DISTRIBUIDORA BM*
${saludo}${resumenLinea ? `\n${resumenLinea}` : ''}

🌐 Visita nuestra tienda en línea:
${URL_WEB}

💳 ${DATOS_PAGO.intro}
• Banco: ${DATOS_PAGO.banco}
• Tipo de cuenta: ${DATOS_PAGO.tipoCuenta}
• Número de cuenta: *${DATOS_PAGO.numeroCuenta}*
• Nombre de la cuenta: ${DATOS_PAGO.nombreCuenta}

${pie}`;

// printToFileAsync deja el archivo con un nombre aleatorio, y ese es el
// nombre que ve el cliente en WhatsApp — se copia a uno legible.
const archivoConNombre = async (uri, nombreArchivo) => {
  try {
    const limpio = String(nombreArchivo || 'Recibo').replace(/[^A-Za-z0-9_-]/g, '_');
    const destino = `${FileSystem.cacheDirectory}${limpio}.pdf`;
    // Si el mismo recibo se reenvía, el archivo ya existe y la copia podría
    // fallar (quedando con el nombre aleatorio) — se borra primero.
    await FileSystem.deleteAsync(destino, { idempotent: true });
    await FileSystem.copyAsync({ from: uri, to: destino });
    return destino;
  } catch {
    return uri;
  }
};

export const compartirPdf = async ({ generarHtmlPdf, nombreArchivo, tituloDialogo }) => {
  try {
    const { uri } = await Print.printToFileAsync({ html: generarHtmlPdf(), base64: false });
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('No disponible', 'Este teléfono no permite compartir archivos.');
      return;
    }
    const archivo = await archivoConNombre(uri, nombreArchivo);
    await Sharing.shareAsync(archivo, {
      mimeType: 'application/pdf',
      dialogTitle: tituloDialogo || 'Recibo',
      UTI: 'com.adobe.pdf',
    });
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes('cancel') && !msg.includes('dismiss')) {
      console.warn('Recibo PDF error:', e);
      Alert.alert('Error', 'No se pudo generar el PDF: ' + msg.slice(0, 80));
    }
  }
};

export const enviarReciboPorWhatsApp = async ({
  telefonoWhatsapp, resumenLinea, saludo, pie, generarHtmlPdf, nombreArchivo, tituloDialogo, nombreDestino,
}) => {
  const telefono = (telefonoWhatsapp || '').replace(/\D/g, '');
  if (!telefono) {
    Alert.alert('Sin teléfono', `${nombreDestino || 'El cliente'} no tiene número de WhatsApp registrado.`);
    return;
  }
  const numero = telefono.startsWith('503') ? telefono : `503${telefono}`;
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(construirTexto({ saludo, resumenLinea, pie }))}`;

  if (!(await Linking.canOpenURL(url))) {
    Alert.alert('WhatsApp no disponible', 'No se encontró WhatsApp instalado en este dispositivo.');
    return;
  }

  // Cuando la persona vuelve de WhatsApp (ya mandó —o no— el texto), se le
  // ofrece el PDF. Solo cuenta si realmente salió de la app antes.
  let salioDeLaApp = false;
  const suscripcion = AppState.addEventListener('change', (estado) => {
    if (estado !== 'active') {
      salioDeLaApp = true;
      return;
    }
    if (!salioDeLaApp) return;
    suscripcion.remove();
    Alert.alert(
      'Recibo en PDF',
      'Ahora enviá el recibo en PDF. En WhatsApp elegí el chat del cliente (aparece primero en la lista de recientes).',
      [
        { text: 'Omitir', style: 'cancel' },
        { text: 'Enviar PDF', onPress: () => compartirPdf({ generarHtmlPdf, nombreArchivo, tituloDialogo }) },
      ],
      { cancelable: false }
    );
  });
  // Por si nunca llega a salir de la app, no dejar el listener colgado.
  setTimeout(() => suscripcion.remove(), 30 * 60 * 1000);

  try {
    await Linking.openURL(url);
  } catch {
    suscripcion.remove();
    Alert.alert('WhatsApp no disponible', 'No se pudo abrir WhatsApp en este dispositivo.');
  }
};
