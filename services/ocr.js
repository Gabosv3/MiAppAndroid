import TextRecognition from '@react-native-ml-kit/text-recognition';

// Palabras que aparecen en el DUI pero no son datos del cliente
const PALABRAS_IGNORAR = [
  'REPUBLICA','EL SALVADOR','DOCUMENTO','UNICO','IDENTIDAD',
  'APELLIDOS','NOMBRES','NOMBRE','APELLIDO','FECHA','NACIMIENTO',
  'DOMICILIO','PROFESION','OFICIO','ESTADO','CIVIL','VALIDEZ',
  'FIRMA','TITULAR','REGISTRO','ELECTORAL','NUMERO','DUI',
  'CENTROAMERICA','CENTROAMÉRICA','SALVADOREÑO','SALVADOREÑA',
];

export const extractTextFromImage = async (imageUri) => {
  const result = await TextRecognition.recognize(imageUri);
  if (!result?.text) return null;
  return parseDUI(result.text);
};

const parseDUI = (texto) => {
  const lineas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 1);

  // ── Número de DUI ──────────────────────────────────────────────────────
  const duiMatch = texto.match(/\d{8}[-–]\d/);
  const dui = duiMatch ? duiMatch[0].replace('–', '-') : '';

  // ── Nombre y apellido ──────────────────────────────────────────────────
  // El DUI salvadoreño tiene etiquetas: "APELLIDOS" seguido de los apellidos
  // y "NOMBRES" seguido de los nombres
  let apellido = '';
  let nombre   = '';

  const textoUp = texto.toUpperCase();

  // Buscar después de la etiqueta APELLIDOS
  const matchApellido = textoUp.match(/APELLIDOS?\s*[:\n\r]+\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{2,40})/);
  if (matchApellido) {
    apellido = capitalizar(matchApellido[1].trim());
  }

  // Buscar después de la etiqueta NOMBRES
  const matchNombre = textoUp.match(/NOMBRES?\s*[:\n\r]+\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{2,40})/);
  if (matchNombre) {
    nombre = capitalizar(matchNombre[1].trim());
  }

  // Si no encontró con etiquetas, intentar con líneas limpias de palabras clave
  if (!apellido || !nombre) {
    const lineasLimpias = lineas.filter(l => {
      const up = l.toUpperCase();
      // Solo líneas con letras, sin números, que no sean palabras del documento
      return (
        /^[A-ZÁÉÍÓÚÑ\s]{4,}$/i.test(l) &&
        !PALABRAS_IGNORAR.some(p => up.includes(p)) &&
        !duiMatch?.input?.includes(l)
      );
    });

    if (!apellido && lineasLimpias[0]) apellido = capitalizar(lineasLimpias[0]);
    if (!nombre  && lineasLimpias[1]) nombre   = capitalizar(lineasLimpias[1]);
  }

  // ── Fecha de nacimiento ────────────────────────────────────────────────
  const fechaMatch = texto.match(/(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/);
  const fechaNac = fechaMatch ? fechaMatch[0] : '';

  return { dui, nombre, apellido, fechaNac, textoCompleto: texto };
};

const capitalizar = (str) =>
  str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim();
