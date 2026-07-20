import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

// Lienzo de firma dentro de un WebView — dibuja con el dedo (touch) o mouse,
// y exporta el trazo como PNG en base64 vía postMessage. Se usa WebView (ya
// instalado para el mapa) en vez de una librería de firma nativa nueva, para
// no agregar otra dependencia que exija recompilar módulos nativos.
const HTML = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>
  html,body{margin:0;padding:0;overflow:hidden;background:#fff;width:100%;height:100%}
  canvas{touch-action:none;display:block;width:100%;height:100%}
</style>
</head><body>
<canvas id="c"></canvas>
<script>
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  function resize(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
  }
  resize();
  window.addEventListener('resize', resize);

  let drawing = false, last = null, tieneTrazo = false;

  function pos(e){
    const t = e.touches && e.touches[0] ? e.touches[0] : e;
    const rect = canvas.getBoundingClientRect();
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }
  function start(e){ drawing = true; last = pos(e); e.preventDefault(); }
  function move(e){
    if(!drawing) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    tieneTrazo = true;
    e.preventDefault();
  }
  function end(){ drawing = false; }

  canvas.addEventListener('touchstart', start, {passive:false});
  canvas.addEventListener('touchmove', move, {passive:false});
  canvas.addEventListener('touchend', end);
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);

  window.limpiarFirma = function(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    tieneTrazo = false;
  };
  window.exportarFirma = function(){
    if (!tieneTrazo) {
      window.ReactNativeWebView.postMessage('VACIA');
      return;
    }
    window.ReactNativeWebView.postMessage(canvas.toDataURL('image/png'));
  };
</script>
</body></html>`;

const FirmaPad = forwardRef(({ onFirma }, ref) => {
  const webRef = useRef(null);

  useImperativeHandle(ref, () => ({
    exportar: () => webRef.current?.injectJavaScript('window.exportarFirma(); true;'),
    limpiar: () => webRef.current?.injectJavaScript('window.limpiarFirma(); true;'),
  }));

  return (
    <View style={styles.box}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html: HTML }}
        onMessage={(e) => onFirma(e.nativeEvent.data)}
        style={{ flex: 1, backgroundColor: '#fff' }}
        scrollEnabled={false}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  box: { height: 180, borderWidth: 1.5, borderColor: '#ccc', borderStyle: 'dashed', borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff' },
});

export default FirmaPad;
