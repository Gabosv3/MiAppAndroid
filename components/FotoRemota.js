import React from 'react';
import { Image } from 'expo-image';

// Foto que viene del servidor (casa del cliente, comprobantes). A diferencia de
// <Image> de React Native:
//  - se guarda en disco (cachePolicy memory-disk): la segunda vez carga al
//    instante y sin gastar datos;
//  - se decodifica al tamaño con que se muestra (no a los 12 MP originales), lo
//    que importa mucho en teléfonos de 3 GB de RAM;
//  - muestra un fundido en vez de saltar de vacío a imagen.
// resizeMode usa los mismos valores que <Image> ('cover', 'contain'...).
export default function FotoRemota({ uri, style, resizeMode = 'cover', onError, ...resto }) {
  if (!uri) return null;
  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit={resizeMode === 'stretch' ? 'fill' : resizeMode}
      cachePolicy="memory-disk"
      transition={150}
      recyclingKey={uri}
      onError={onError}
      {...resto}
    />
  );
}
