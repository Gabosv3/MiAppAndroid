import * as FileSystem from 'expo-file-system/legacy';

const GOOGLE_VISION_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY || '';

export const extractTextFromImage = async (imageUri) => {
  if (!GOOGLE_VISION_API_KEY) {
    throw new Error('Google Vision API key no configurada');
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: 'base64',
    });

    const body = {
      requests: [
        {
          image: {
            content: base64,
          },
          features: [
            {
              type: 'TEXT_DETECTION',
              maxResults: 10,
            },
          ],
        },
      ],
    };

    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      throw new Error(`Google Vision API error: ${response.status}`);
    }

    const result = await response.json();

    if (result.responses?.[0]?.error) {
      throw new Error(result.responses[0].error.message);
    }

    const textAnnotations = result.responses?.[0]?.textAnnotations || [];
    if (textAnnotations.length === 0) {
      return null;
    }

    const fullText = textAnnotations[0]?.description || '';
    return parseDUIData(fullText);
  } catch (error) {
    console.error('Error en OCR:', error);
    throw error;
  }
};

const parseDUIData = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  const duiRegex = /\d{8}-\d/;
  const dui = lines.find(l => duiRegex.test(l))?.match(duiRegex)?.[0] || '';

  const phoneRegex = /\d{4}-\d{4}/g;
  const phones = text.match(phoneRegex) || [];

  let nombre = '';
  let apellido = '';

  // Intenta extraer nombre y apellido del texto
  const textUpper = text.toUpperCase();
  const lines2 = textUpper.split('\n').map(l => l.trim()).filter(l => l && l.length > 2);

  if (lines2.length > 0) {
    const firstNameLine = lines2[0];
    const nameParts = firstNameLine.split(/\s+/);

    if (nameParts.length >= 2) {
      apellido = nameParts[0];
      nombre = nameParts.slice(1).join(' ');
    } else if (nameParts.length === 1) {
      nombre = nameParts[0];
    }
  }

  return {
    nombre: nombre.toLowerCase(),
    apellido: apellido.toLowerCase(),
    dui: dui,
    telefono: phones[0] || '',
    telefonoWhatsapp: phones[1] || phones[0] || '',
    fullText: text,
  };
};
