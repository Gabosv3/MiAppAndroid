import * as Location from 'expo-location';

// Obtener el GPS sin quedarse colgado.
//
// getCurrentPositionAsync con precisión alta puede tardar 30 s o más dentro de
// una casa o con poca señal — y no tiene tiempo límite: la pantalla se quedaba
// esperando indefinidamente. Aquí:
//  - 'rapida'  (evidencia de una visita): usa la última posición conocida si es
//    reciente (≤ 60 s) y solo si no hay pide una nueva con precisión equilibrada.
//  - 'alta'    (guardar la ubicación de la casa de un cliente): pide precisión
//    alta pero con tiempo límite; si no llega, usa la equilibrada y, como último
//    recurso, la última conocida — mejor una posición aproximada que ninguna.

const conTiempo = (promesa, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('tiempo agotado obteniendo la ubicación')), ms);
  promesa.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

export const obtenerUbicacion = async ({ modo = 'alta' } = {}) => {
  if (modo === 'rapida') {
    try {
      const ultima = await Location.getLastKnownPositionAsync({ maxAge: 60 * 1000 });
      if (ultima) return ultima;
    } catch { /* se intenta una nueva */ }
    return conTiempo(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 12000);
  }

  try {
    return await conTiempo(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), 15000);
  } catch (e) {
    console.warn('[ubicacion] precisión alta no llegó, se usa una aproximada:', e?.message || e);
    try {
      return await conTiempo(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 8000);
    } catch {
      const ultima = await Location.getLastKnownPositionAsync();
      if (ultima) return ultima;
      throw new Error('No se pudo obtener la ubicación. Revisa que el GPS esté encendido e intenta de nuevo.');
    }
  }
};
