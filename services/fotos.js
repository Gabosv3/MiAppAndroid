import * as ImageManipulator from 'expo-image-manipulator';

// Las fotos de la cámara salen de 4-12 MB (12 MP). Subirlas así con datos
// móviles tarda minutos y a veces se agota el tiempo — la visita o el vale se
// queda "cargando" o termina en la cola offline. Se reducen ANTES de subir: a
// ~1280 px de ancho y calidad 0.65 una foto pesa 150-400 KB y se sigue viendo
// perfecta en el panel. Para documentos (DUI) se conserva más resolución.

export const PERFIL_FOTO = {
  normal: { ancho: 1280, calidad: 0.65 },
  documento: { ancho: 1600, calidad: 0.75 },
};

/**
 * Devuelve { uri, width, height } de la foto reducida. Si algo falla se usa la
 * original (subir una foto pesada es mejor que perderla).
 * asset: el resultado de ImagePicker ({ uri, width, height }).
 */
export const comprimirFoto = async (asset, perfil = PERFIL_FOTO.normal) => {
  try {
    const acciones = asset.width && asset.width > perfil.ancho ? [{ resize: { width: perfil.ancho } }] : [];
    const r = await ImageManipulator.manipulateAsync(asset.uri, acciones, {
      compress: perfil.calidad,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return { uri: r.uri, width: r.width, height: r.height };
  } catch (e) {
    console.warn('[fotos] no se pudo comprimir, se usa la original:', e?.message || e);
    return { uri: asset.uri, width: asset.width, height: asset.height };
  }
};
