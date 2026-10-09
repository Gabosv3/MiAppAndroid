import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

// Palabras de relleno que un cobrador diría alrededor del dato real
// ("busca cliente 0001", "buscame a Maria López") — se quitan para que
// quede solo lo que realmente hay que buscar ("0001", "Maria López").
const PALABRAS_RELLENO = [
  'busca', 'buscar', 'buscame', 'búscame', 'buscarme',
  'cliente', 'clienta', 'a ver', 'porfavor', 'por favor',
];

const limpiarTranscripcion = (texto) => {
  let limpio = ` ${texto.trim()} `;
  PALABRAS_RELLENO.forEach((palabra) => {
    limpio = limpio.replace(new RegExp(`\\s${palabra}\\s`, 'gi'), ' ');
  });
  return limpio.trim();
};

// Hook reutilizable de "buscar por voz" — reconocimiento nativo del
// teléfono (sin conexión si el idioma está descargado en Ajustes de
// Android; con conexión si no). No manda audio a ningún servidor propio.
export const useBusquedaPorVoz = (onResultado) => {
  const [escuchando, setEscuchando] = useState(false);

  useSpeechRecognitionEvent('start', () => setEscuchando(true));
  useSpeechRecognitionEvent('end', () => setEscuchando(false));

  useSpeechRecognitionEvent('result', (event) => {
    const texto = event.results?.[0]?.transcript;
    if (texto) onResultado(limpiarTranscripcion(texto));
  });

  useSpeechRecognitionEvent('error', (event) => {
    setEscuchando(false);
    if (event.error === 'not-allowed') {
      Alert.alert('Permiso de micrófono requerido', 'Habilita el acceso al micrófono para esta app en Ajustes.');
    } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
      Alert.alert('No se pudo escuchar', 'Intenta de nuevo, o escribe la búsqueda directamente.');
    }
  });

  const iniciar = useCallback(async () => {
    const permiso = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert('Permiso de micrófono requerido', 'Habilita el acceso al micrófono en Ajustes para buscar por voz.');
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: 'es-419',
      interimResults: false,
      continuous: false,
    });
  }, []);

  const detener = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { escuchando, iniciar, detener };
};
