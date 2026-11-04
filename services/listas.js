import { Platform } from 'react-native';

// Ajustes de virtualización para listas largas en teléfonos de 3 GB de RAM:
// se pintan pocas filas al abrir, se renderiza en lotes pequeños y se libera lo
// que sale de pantalla. Sin esto FlatList pinta ~10 filas por lote con una
// ventana de 21 pantallas, y listas de cientos de elementos se vuelven lentas.
export const LISTA_RAPIDA = {
  initialNumToRender: 10,
  maxToRenderPerBatch: 8,
  updateCellsBatchingPeriod: 60,
  windowSize: 7,
  removeClippedSubviews: Platform.OS === 'android',
};
