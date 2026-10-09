// Contenido del asistente de ayuda offline — un árbol simple de nodos.
// Cada nodo tiene uno o más mensajes del "bot" y una lista de opciones que
// llevan a otro nodo. Todo vive en el código de la app, no depende de
// conexión ni de ningún servicio externo. Para agregar un tema nuevo, basta
// con sumar nodos aquí y un botón que apunte a su primer nodo desde 'menu'.

export const NODO_INICIAL = 'menu';

export const NODOS = {
  menu: {
    mensajes: ['¡Hola! 👋 Soy la ayuda de SIDB. ¿En qué te puedo ayudar?'],
    opciones: [
      { texto: '👤 ¿Cómo creo un cliente?', ir: 'crear_cliente_1' },
    ],
  },

  // ── Crear cliente ──────────────────────────────────────────────────────
  crear_cliente_1: {
    mensajes: [
      'Para crear un cliente nuevo, ve a Inicio → "Crear cliente".',
      '1️⃣ Datos personales: escribe el Nombre completo y el Apellido. Ambos son obligatorios.',
    ],
    opciones: [
      { texto: 'Siguiente ▶️', ir: 'crear_cliente_2' },
      { texto: '⬅️ Menú principal', ir: 'menu' },
    ],
  },
  crear_cliente_2: {
    mensajes: [
      '2️⃣ Identificación: escribe el DUI en formato 12345678-9.',
      'Tip: más abajo en la pantalla hay un botón para escanearlo con la cámara y que se llene solo — o si ya lo copiaste de otro lado, toca el ícono 📋 para pegarlo.',
    ],
    opciones: [
      { texto: 'Siguiente ▶️', ir: 'crear_cliente_3' },
      { texto: '⬅️ Menú principal', ir: 'menu' },
    ],
  },
  crear_cliente_3: {
    mensajes: [
      '3️⃣ Contacto: teléfono normal y WhatsApp, en formato 1234-5678.',
      'El correo es opcional — a menos que tu administrador haya activado que sea obligatorio.',
    ],
    opciones: [
      { texto: 'Siguiente ▶️', ir: 'crear_cliente_4' },
      { texto: '⬅️ Menú principal', ir: 'menu' },
    ],
  },
  crear_cliente_4: {
    mensajes: [
      '4️⃣ Ubicación: si le das permiso de GPS al teléfono, se puede llenar sola con tu posición actual.',
      'Si el cliente te mandó su ubicación por WhatsApp, también puedes pegarla directo — la app entiende tanto coordenadas sueltas como el link de Google Maps.',
    ],
    opciones: [
      { texto: 'Siguiente ▶️', ir: 'crear_cliente_5' },
      { texto: '⬅️ Menú principal', ir: 'menu' },
    ],
  },
  crear_cliente_5: {
    mensajes: [
      '5️⃣ Fotos del DUI: toma una foto de frente y otra del reverso con la cámara.',
      '6️⃣ Foto de la casa: una foto del frente de la vivienda — sirve para reconocerla después en las visitas de cobro.',
    ],
    opciones: [
      { texto: 'Siguiente ▶️', ir: 'crear_cliente_fin' },
      { texto: '⬅️ Menú principal', ir: 'menu' },
    ],
  },
  crear_cliente_fin: {
    mensajes: [
      '✅ Cuando completes todo, toca "Guardar cliente".',
      'No necesitas señal para esto — si no hay conexión en ese momento, el cliente se guarda en el teléfono y se envía solo apenas recuperes internet.',
    ],
    opciones: [
      { texto: '⬅️ Menú principal', ir: 'menu' },
    ],
  },
};
