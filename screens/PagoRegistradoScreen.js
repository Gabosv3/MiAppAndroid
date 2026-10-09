import React, { useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { fmtFechaCorta } from '../services/dateUtils';
import { enviarReciboPorWhatsApp, htmlPieInformativo, htmlMetodosPago } from '../services/reciboWhatsApp';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const fmt = (n) => `$${Number(n||0).toFixed(2)}`;
const capitalizar = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

// Formato compacto — una línea por dato, separadores finos en vez de cajas
// con márgenes grandes, para gastar menos papel sin perder legibilidad.
// pdf=true: mismo contenido pero en una página legible en el teléfono del
// cliente (el ticket de 220px, tal cual, queda diminuto en una hoja normal)
// y con la página web al pie. La impresión del ticket no cambia.
const buildHtmlRecibo = ({ clienteNombre, codigoCliente, ventaNumero, producto, numeroRecibo, montoTotal, metodoPago, proximaVisita, saldoAntes, saldoDespues, nombreCobrador, pdf = false }) => {
  const fecha   = fmtFechaCorta(new Date());
  const proxFmt = proximaVisita ? fmtFechaCorta(proximaVisita) : '';
  const ancho   = pdf ? 480 : 220;
  const base    = pdf ? 15 : 11;
  const grande  = pdf ? 20 : 14;
  const relleno = pdf ? '28px 8px' : '6px 4px';
  return `<html><head>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,Helvetica,sans-serif;width:${ancho}px;margin:0 auto;padding:${relleno};font-size:${base}px;line-height:1.5;color:#111}
      .c{text-align:center}
      .b{font-weight:700}
      .row{display:flex;justify-content:space-between;align-items:center}
      .div{border-top:1px solid #999;margin:5px 0}
      .tot{font-size:${grande}px}
    </style>
  </head><body>
    <div class="c b" style="font-size:${grande}px">DISTRIBUIDORA BM</div>
    <div class="c">6047-9762</div>
    <div style="height:8px"></div>
    <div class="row"><span class="b">${numeroRecibo||'N/A'}</span><span>${fecha}</span></div>
    <div class="div"></div>
    <div><span class="b">${clienteNombre}</span>${codigoCliente ? ` (${codigoCliente})` : ''}</div>
    ${producto ? `<div>${producto}</div>` : ''}
    <div class="row"><span>Venta:</span><span>${ventaNumero||'N/A'}</span></div>
    <div class="row"><span>Cobrador:</span><span>${nombreCobrador}</span></div>
    <div class="row"><span>Pago:</span><span>${capitalizar(metodoPago)}</span></div>
    <div class="div"></div>
    <div class="row"><span>Debía:</span><span>${fmt(saldoAntes)}</span></div>
    <div class="row tot"><span class="b">Abona:</span><span class="b">${fmt(montoTotal)}</span></div>
    <div class="row"><span>Resta:</span><span>${fmt(saldoDespues)}</span></div>
    <div class="div"></div>
    ${proxFmt ? `<div class="row"><span>Próx. visita:</span><span>${proxFmt}</span></div><div class="div"></div>` : ''}
    <div class="c">Gracias por su pago</div>
    ${pdf ? htmlPieInformativo(base - 1) : `<div class="div"></div>${htmlMetodosPago(base - 1)}`}
  </body></html>`;
};

// Genera el PDF y abre el diálogo de impresión (con opción de PDF/WhatsApp/etc)
const imprimirRecibo = async (params) => {
  try {
    const html = buildHtmlRecibo(params);
    const { uri } = await Print.printToFileAsync({ html, base64: false });

    // Intentar abrir el print dialog (Android abre el print dialog con opciones)
    // Si falla, fallback a share sheet
    try {
      await Print.printAsync({ uri });
    } catch (printError) {
      const msg = String(printError?.message || '');
      // Si Print.printAsync() no está disponible o falla, usar share sheet
      if (msg.includes('not available') || msg.includes('unavailable')) {
        const puedeCompartir = await Sharing.isAvailableAsync();
        if (puedeCompartir) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Recibo de cobro',
            UTI: 'com.adobe.pdf',
          });
        }
      } else if (!msg.includes('cancel') && !msg.includes('canceled')) {
        throw printError;
      }
    }
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes('cancel') && !msg.includes('canceled') && !msg.includes('dismiss')) {
      console.warn('Recibo error:', e);
      Alert.alert('Error', 'No se pudo abrir el recibo: ' + msg.slice(0, 50));
    }
  }
};

// Texto con la página web + recibo en PDF (ver services/reciboWhatsApp.js).
const enviarWhatsApp = (params) => enviarReciboPorWhatsApp({
  telefonoWhatsapp: params.clienteWhatsapp,
  nombreDestino: params.clienteNombre,
  resumenLinea: `🧾 Recibo ${params.numeroRecibo || 'N/A'} — ${fmt(params.montoTotal)}`,
  generarHtmlPdf: () => buildHtmlRecibo({ ...params, pdf: true }),
  nombreArchivo: `Recibo-${params.numeroRecibo || 'cobro'}`,
  tituloDialogo: 'Recibo de cobro',
});

export default function PagoRegistradoScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const {
    resultado, clienteId, clienteNombre, codigoCliente, clienteWhatsapp,
    montoTotal, metodoPago, ventaNumero, producto, numeroRecibo, proximaVisita,
    saldoAntes, saldoDespues, nombreCobrador,
    autoImprimir, isOffline,
  } = route.params;

  // Abrir share sheet cuando la pantalla esté completamente visible
  useFocusEffect(useCallback(() => {
    if (autoImprimir) {
      imprimirRecibo({ clienteNombre, codigoCliente, ventaNumero, producto, numeroRecibo, montoTotal, metodoPago, proximaVisita, saldoAntes, saldoDespues, nombreCobrador });
    }
  }, [autoImprimir]));

  const proxFmt = proximaVisita
    ? new Date(proximaVisita + 'T12:00:00').toLocaleDateString('es-SV', { day:'2-digit', month:'long', year:'numeric' })
    : '';

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0"/>

      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <Text style={s.headerTitle}>Pago registrado</Text>
        {numeroRecibo ? <Text style={s.headerRecibo}>Recibo {numeroRecibo}</Text> : null}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:40}}>

        {/* ── Hero ── */}
        <View style={s.heroCard}>
          <View style={[s.checkCircle, isOffline && { backgroundColor: '#fef9c3', borderColor: '#fbbf24' }]}>
            <Text style={{fontSize:44,color: isOffline ? '#d97706' : '#2e7d32'}}>
              {isOffline ? '📴' : '✓'}
            </Text>
          </View>
          <Text style={[s.heroLabel, isOffline && { color: '#d97706' }]}>
            {isOffline ? 'Cobro guardado sin conexión' : 'Pago registrado correctamente'}
          </Text>
          <View style={s.metodoBadge}>
            <Text style={s.metodoBadgeTxt}>💳 {metodoPago}</Text>
          </View>
          {isOffline && (
            <Text style={{fontSize:11,color:'#9ca3af',marginTop:8,textAlign:'center'}}>
              Se enviará automáticamente al recuperar la conexión
            </Text>
          )}
        </View>

        {/* ── Resumen de saldos ── */}
        <View style={s.saldosCard}>
          <View style={s.saldoRow}>
            <Text style={s.saldoLabel}>Lo que debía</Text>
            <Text style={[s.saldoValor, {color:'#e53e3e'}]}>{fmt(saldoAntes)}</Text>
          </View>
          <View style={s.sep}/>
          <View style={s.abonoRow}>
            <Text style={s.abonoLabel}>Lo que abona</Text>
            <Text style={s.abonoValor}>{fmt(montoTotal)}</Text>
          </View>
          <View style={s.sep}/>
          <View style={s.saldoRow}>
            <Text style={s.saldoLabel}>Lo que resta</Text>
            <Text style={[s.saldoValor, {color: Number(saldoDespues) > 0 ? '#e65100' : '#2e7d32'}]}>{fmt(saldoDespues)}</Text>
          </View>
          <View style={s.sep}/>
          <Text style={s.cobradorTxt}>Cobrador: {nombreCobrador}</Text>
        </View>

        {/* ── Próxima visita ── */}
        {proxFmt ? (
          <View style={s.proximaCard}>
            <Text style={{fontSize:22,marginBottom:6}}>📅</Text>
            <Text style={s.proximaLabel}>Próxima visita</Text>
            <Text style={s.proximaFecha}>{proxFmt}</Text>
          </View>
        ) : null}

        {/* ── Botones ── */}
        <View style={s.btns}>
          {!isOffline && clienteWhatsapp ? (
            <TouchableOpacity
              style={s.btnWhatsapp}
              onPress={() => enviarWhatsApp({ clienteNombre, codigoCliente, clienteWhatsapp, montoTotal, metodoPago, ventaNumero, producto, numeroRecibo, proximaVisita, saldoAntes, saldoDespues, nombreCobrador })}
            >
              <Text style={s.btnWhatsappTxt}>💬  Enviar recibo por WhatsApp</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={s.btnImprimir}
            onPress={() => imprimirRecibo({ clienteNombre, codigoCliente, ventaNumero, producto, numeroRecibo, montoTotal, metodoPago, proximaVisita, saldoAntes, saldoDespues, nombreCobrador })}
          >
            <Text style={s.btnImprimirTxt}>🖨️  {isOffline ? 'Vista previa' : 'Imprimir recibo'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnPrimary} onPress={()=>navigation.navigate(isOffline ? 'Home' : 'Cobros')}>
            <Text style={s.btnPrimaryTxt}>{isOffline ? 'Aceptar' : 'Volver a ruta'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.btnSecondary}
            onPress={()=>navigation.navigate('DetalleCliente',{clienteId,clienteNombre})}
          >
            <Text style={s.btnSecondaryTxt}>{isOffline ? 'Descartar' : 'Ver cliente'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex:1, backgroundColor:'#f5f6fa' },
  header: {
    backgroundColor:'#1565C0',
    paddingTop: 32, // paddingTop real (insets.top) se aplica inline en el render
    paddingBottom:18, paddingHorizontal:20,
  },
  headerTitle: { color:'#fff', fontSize:22, fontWeight:'800' },
  headerRecibo:{ color:'rgba(255,255,255,0.75)', fontSize:12, fontWeight:'600', marginTop:2 },

  heroCard: {
    backgroundColor:'#fff', margin:12, borderRadius:16, padding:24, alignItems:'center',
    elevation:3, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.08,
  },
  checkCircle: {
    width:80,height:80,borderRadius:40, backgroundColor:'#e8f5e9',
    alignItems:'center',justifyContent:'center', marginBottom:14,
    borderWidth:2, borderColor:'#a5d6a7',
  },
  heroLabel:    { color:'#2e7d32', fontSize:16, fontWeight:'700', marginBottom:12, textAlign:'center' },
  metodoBadge:  { backgroundColor:'#f0f0f0', borderRadius:20, paddingHorizontal:14, paddingVertical:5 },
  metodoBadgeTxt:{ color:'#555', fontSize:13, fontWeight:'600' },

  saldosCard: {
    backgroundColor:'#fff', marginHorizontal:12, marginTop:4, borderRadius:16,
    paddingHorizontal:16, paddingTop:14, paddingBottom:14, elevation:2,
  },
  saldoRow:  { flexDirection:'row', alignItems:'center', paddingVertical:10 },
  saldoLabel:{ color:'#555', fontSize:14, flexGrow:1, flexShrink:1 },
  saldoValor:{ fontSize:16, fontWeight:'700', minWidth:80, textAlign:'right' },
  sep:       { height:1, backgroundColor:'#eeeeee' },
  abonoRow:  { flexDirection:'row', alignItems:'center',
               backgroundColor:'#e8f5e9', borderRadius:10,
               paddingVertical:12, paddingHorizontal:10, marginVertical:0 },
  abonoLabel:{ color:'#2e7d32', fontSize:14, fontWeight:'800', flexGrow:1, flexShrink:1 },
  abonoValor:{ color:'#1b5e20', fontSize:22, fontWeight:'900', minWidth:80, textAlign:'right' },
  cobradorTxt:{ color:'#999', fontSize:12, textAlign:'right', paddingTop:10 },

  proximaCard: {
    backgroundColor:'#e3f2fd', marginHorizontal:12, marginTop:10, borderRadius:16,
    padding:20, alignItems:'center',
  },
  proximaLabel: { color:'#1565C0', fontSize:13, fontWeight:'700', marginBottom:4 },
  proximaFecha: { color:'#1565C0', fontSize:22, fontWeight:'900' },

  btns:          { marginHorizontal:12, marginTop:16, gap:10 },
  btnWhatsapp:   { backgroundColor:'#25D366', borderRadius:12, paddingVertical:16, alignItems:'center', elevation:2 },
  btnWhatsappTxt:{ color:'#fff', fontWeight:'800', fontSize:15 },
  btnImprimir:   { backgroundColor:'#fff', borderRadius:12, paddingVertical:16, alignItems:'center', borderWidth:1.5, borderColor:'#888' },
  btnImprimirTxt:{ color:'#444', fontWeight:'700', fontSize:15 },
  btnPrimary:    { backgroundColor:'#1565C0', borderRadius:12, paddingVertical:16, alignItems:'center', elevation:2 },
  btnPrimaryTxt: { color:'#fff', fontWeight:'800', fontSize:15 },
  btnSecondary:  { borderWidth:1.5, borderColor:'#1565C0', borderRadius:12, paddingVertical:16, alignItems:'center' },
  btnSecondaryTxt:{ color:'#1565C0', fontWeight:'700', fontSize:15 },
});
