import React, { useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView, Linking, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { fmtFechaCorta } from '../services/dateUtils';

const fmt = (n) => `$${Number(n||0).toFixed(2)}`;
const capitalizar = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

// Formato compacto — una línea por dato, separadores finos en vez de cajas
// con márgenes grandes, para gastar menos papel sin perder legibilidad.
const buildHtmlRecibo = ({ clienteNombre, codigoCliente, ventaNumero, producto, numeroRecibo, montoTotal, metodoPago, proximaVisita, saldoAntes, saldoDespues, nombreCobrador }) => {
  const fecha   = fmtFechaCorta(new Date());
  const proxFmt = proximaVisita ? fmtFechaCorta(proximaVisita) : '';
  return `<html><head>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,Helvetica,sans-serif;width:220px;margin:0 auto;padding:6px 4px;font-size:11px;line-height:1.5;color:#111}
      .c{text-align:center}
      .b{font-weight:700}
      .row{display:flex;justify-content:space-between;align-items:center}
      .div{border-top:1px solid #999;margin:5px 0}
      .tot{font-size:14px}
    </style>
  </head><body>
    <div class="c b" style="font-size:14px">DISTRIBUIDORA BM</div>
    <div class="div"></div>
    <div class="row"><span>Recibo:</span><span class="b">${numeroRecibo||'N/A'}</span></div>
    <div class="row"><span>Fecha:</span><span>${fecha}</span></div>
    <div class="row"><span>Tel:</span><span>6047-9762</span></div>
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

const enviarWhatsApp = async ({ clienteNombre, codigoCliente, clienteWhatsapp, montoTotal, metodoPago, ventaNumero, producto, numeroRecibo, proximaVisita, saldoAntes, saldoDespues, nombreCobrador }) => {
  const fecha   = new Date().toLocaleDateString('es-SV');
  const proxFmt = proximaVisita
    ? new Date(proximaVisita + 'T12:00:00').toLocaleDateString('es-SV', { day:'2-digit', month:'long', year:'numeric' })
    : '';

  const mensaje =
`🏪 *DISTRIBUIDORA BM*
📋 *RECIBO DE COBRO*
━━━━━━━━━━━━━━━━━━━━
🧾 Recibo: ${numeroRecibo || 'N/A'}
📅 Fecha: ${fecha}
📞 Teléfono: 6047-9762
👤 Cliente: ${clienteNombre}${codigoCliente ? ` (Código: ${codigoCliente})` : ''}
🔖 Venta: ${ventaNumero || 'N/A'}${producto ? `\n📦 Producto: ${producto}` : ''}
💳 Método: ${metodoPago}
👷 Cobrador: ${nombreCobrador}

💸 Lo que debía: ${fmt(saldoAntes)}
💰 *Lo que abona: ${fmt(montoTotal)}*
📉 Lo que resta: ${fmt(saldoDespues)}
${proxFmt ? `\n📅 *Próxima visita: ${proxFmt}*` : ''}
━━━━━━━━━━━━━━━━━━━━
¡Gracias por su pago! 🙏

_Por favor confirme respondiendo *SÍ* si este recibo corresponde a su pago. En caso de alguna diferencia, comuníquese con nosotros._`;

  const telefono = (clienteWhatsapp || '').replace(/\D/g, '');
  if (!telefono) {
    Alert.alert('Sin teléfono', 'El cliente no tiene número de WhatsApp registrado.');
    return;
  }
  const numero = telefono.startsWith('503') ? telefono : `503${telefono}`;
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
  const puede = await Linking.canOpenURL(url);
  if (puede) {
    await Linking.openURL(url);
  } else {
    Alert.alert('WhatsApp no disponible', 'No se encontró WhatsApp instalado en este dispositivo.');
  }
};

export default function PagoRegistradoScreen({ navigation, route }) {
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

      <View style={s.header}>
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
    paddingTop:(StatusBar.currentHeight||0)+10, paddingBottom:18, paddingHorizontal:20,
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
