// Validaciones de transporte seguro (HTTPS).
//
// La app envía contraseñas, tokens y cobros: en una build de producción NUNCA
// debe hablar con el servidor por HTTP plano. Solo en desarrollo (__DEV__) se
// tolera HTTP, y únicamente hacia equipos de la red local (localhost, 10.0.2.2
// del emulador, 192.168.x.x...), para poder probar contra un backend en la PC.

const HOST_LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i;

export const hostDe = (url) => {
  const m = String(url || '').match(/^[a-z][a-z0-9+.-]*:\/\/([^/:?#]+)/i);
  return m ? m[1].toLowerCase() : '';
};

export const esHttps = (url) => /^https:\/\//i.test(String(url || ''));

export const esHostLocal = (url) => HOST_LOCAL.test(hostDe(url));

// ¿Es aceptable usar esta URL como base de la API?
export const urlApiSegura = (url) => esHttps(url) || (__DEV__ && esHostLocal(url));

export const mensajeUrlInsegura = (url) =>
  `Conexión no segura bloqueada: la dirección del servidor (${url || 'no configurada'}) no usa HTTPS, `
  + 'y esta versión de la app solo se conecta por HTTPS. Avisa a soporte para corregir la configuración.';

// Si una URL que viene del servidor (foto, comprobante) llega como http:// pero
// el servidor de la API es https, se sube a https cuando es el MISMO host: evita
// contenido mixto/bloqueado sin abrir la puerta a otros dominios.
export const asegurarHttps = (url, urlApi) => {
  if (!url || esHttps(url) || !/^http:\/\//i.test(url)) return url;
  if (esHttps(urlApi) && hostDe(url) === hostDe(urlApi)) return url.replace(/^http:/i, 'https:');
  return url;
};

// Descargas que se instalan (APK): solo HTTPS, sin excepciones.
export const validarUrlDescarga = (url) => {
  if (!esHttps(url)) {
    throw new Error('El enlace de descarga no usa HTTPS; por seguridad no se descargará ni instalará.');
  }
  return url;
};
