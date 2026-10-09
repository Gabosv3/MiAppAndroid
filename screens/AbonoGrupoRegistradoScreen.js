import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { fmtFechaCorta, fechaHoyLocal } from '../services/dateUtils';
import { enviarReciboPorWhatsApp, htmlPieInformativo, htmlMetodosPago } from '../services/reciboWhatsApp';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
const capitalizar = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

const METODOS_LABEL = { efectivo: 'Efectivo', transferencia: 'Transferencia', cheque: 'Cheque', deposito: 'Depósito' };

// pdf=true: mismo contenido en una página legible en el teléfono del cliente
// y con la página web al pie. La impresión del ticket no cambia.
const buildHtmlRecibo = ({ aplicados, metodo, proximaVisita, nombreCobrador, pdf = false }) => {
  const px = (n) => Math.round(n * (pdf ? 1.36 : 1));
  const fecha = fmtFechaCorta(new Date());
  const proxFmt = proximaVisita ? fmtFechaCorta(proximaVisita) : '';
  const okAplicados = aplicados.filter(a => a.ok);
  const totalDebia = okAplicados.reduce((s, a) => s + a.saldoAntes, 0);
  const totalAbonado = okAplicados.reduce((s, a) => s + a.monto, 0);
  const totalResta = okAplicados.reduce((s, a) => s + a.saldoDespues, 0);

  const filasHtml = aplicados.map(a => `
    <div style="padding:4px 0">
      <div class="row"><span class="b">${a.ok ? '✔' : '✘'} ${a.clienteNombre}</span><span class="b">${a.sinPago ? '' : (a.numeroRecibo || (a.ok ? '' : 'ERROR'))}</span></div>
      ${a.producto ? `<div style="font-size:${px(10)}px;color:#666">${a.producto}</div>` : ''}
      ${a.ok && a.sinPago ? `
      <div class="row" style="margin-top:2px"><span>Debía:</span><span style="color:#c62828">${fmt(a.saldoAntes)}</span></div>
      <div class="row"><span style="color:#e65100;font-weight:800">No abonó</span><span></span></div>
      ` : a.ok ? `
      <div class="row" style="margin-top:2px"><span>Debía:</span><span style="color:#c62828">${fmt(a.saldoAntes)}</span></div>
      <div class="row"><span>Abona:</span><span style="color:#1b5e20;font-weight:800">${fmt(a.monto)}</span></div>
      <div class="row"><span>Resta:</span><span style="color:#e65100">${fmt(a.saldoDespues)}</span></div>` : ''}
    </div>
  `).join('');

  return `<html><head>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,Helvetica,sans-serif;width:${pdf ? 480 : 220}px;margin:0 auto;padding:${pdf ? "28px 8px" : "6px 4px"};font-size:${px(11)}px;line-height:1.5;color:#111}
      .c{text-align:center}
      .b{font-weight:700}
      .row{display:flex;justify-content:space-between;align-items:center}
      .div{border-top:1px solid #999;margin:5px 0}
      .tot{font-size:${px(14)}px}
    </style>
  </head><body>
    <div class="c b" style="font-size:${px(14)}px">DISTRIBUIDORA BM</div>
    <div class="c">6047-9762</div>
    <div style="height:8px"></div>
    <div class="row"><span class="b">ABONO GRUPAL</span><span>${fecha}</span></div>
    <div class="row"><span>Cobrador:</span><span>${nombreCobrador}</span></div>
    <div class="row"><span>Método:</span><span>${capitalizar(metodo)}</span></div>
    <div class="div"></div>
    <div class="b">Cuentas del grupo (${aplicados.length})</div>
    ${filasHtml}
    <div class="div"></div>
    <div class="row"><span>Total debía:</span><span style="color:#c62828">${fmt(totalDebia)}</span></div>
    <div class="row tot"><span class="b">Total abonado:</span><span class="b" style="color:#1b5e20">${fmt(totalAbonado)}</span></div>
    <div class="row"><span>Total resta:</span><span style="color:#e65100">${fmt(totalResta)}</span></div>
    ${proxFmt ? `<div class="div"></div><div class="c" style="font-size:${px(9)}px;color:#888">PROXIMA VISITA</div><div class="c b" style="font-size:${px(12)}px;">${proxFmt}</div>` : ''}
    <div class="div"></div>
    <div class="c">Gracias por su pago</div>${pdf ? htmlPieInformativo(px(10)) : `<div class="div"></div>${htmlMetodosPago(px(10))}`}
  </body></html>`;
};

const imprimirRecibo = async (params) => {
  try {
    const html = buildHtmlRecibo(params);
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    try {
      await Print.printAsync({ uri });
    } catch (printError) {
      const msg = String(printError?.message || '');
      if (msg.includes('not available') || msg.includes('unavailable')) {
        const puedeCompartir = await Sharing.isAvailableAsync();
        if (puedeCompartir) {
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Recibo de abono grupal', UTI: 'com.adobe.pdf' });
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
const enviarWhatsApp = ({ aplicados, metodo, proximaVisita, nombreCobrador, clienteWhatsapp, clienteNombreDestino }) => {
  const totalAbonado = aplicados.filter(a => a.ok).reduce((s, a) => s + a.monto, 0);
  return enviarReciboPorWhatsApp({
    telefonoWhatsapp: clienteWhatsapp,
    nombreDestino: clienteNombreDestino,
    resumenLinea: `📋 Abono grupal — total abonado ${fmt(totalAbonado)}`,
    generarHtmlPdf: () => buildHtmlRecibo({ aplicados, metodo, proximaVisita, nombreCobrador, pdf: true }),
    nombreArchivo: `Recibo-abono-grupal-${fechaHoyLocal()}`,
    tituloDialogo: 'Recibo de abono grupal',
  });
};

export default function AbonoGrupoRegistradoScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const {
    aplicados = [], metodo, proximaVisita, nombreCobrador,
    clienteId, clienteNombre, clienteWhatsapp,
    huboOffline,
  } = route.params;

  useFocusEffect(useCallback(() => {
    imprimirRecibo({ aplicados, metodo, proximaVisita, nombreCobrador });
  }, []));

  const okAplicados = aplicados.filter(a => a.ok);
  const totalDebia   = okAplicados.reduce((s, a) => s + a.saldoAntes, 0);
  const totalAbonado = okAplicados.reduce((s, a) => s + a.monto, 0);
  const totalResta   = okAplicados.reduce((s, a) => s + a.saldoDespues, 0);
  const proxFmt = proximaVisita
    ? new Date(proximaVisita + 'T12:00:00').toLocaleDateString('es-SV', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />

      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <Text style={s.headerTitle}>Abono grupal registrado</Text>
        <Text style={s.headerSub}>{aplicados.length} cuenta{aplicados.length !== 1 ? 's' : ''} del grupo gestionada{aplicados.length !== 1 ? 's' : ''}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.heroCard}>
          <View style={[s.checkCircle, huboOffline && { backgroundColor: '#fef9c3', borderColor: '#fbbf24' }]}>
            <Text style={{ fontSize: 44, color: huboOffline ? '#d97706' : '#2e7d32' }}>{huboOffline ? '📴' : '✓'}</Text>
          </View>
          <Text style={[s.heroLabel, huboOffline && { color: '#d97706' }]}>
            {huboOffline ? 'Algunos abonos quedaron sin conexión' : 'Abono grupal aplicado correctamente'}
          </Text>
          <View style={s.metodoBadge}>
            <Text style={s.metodoBadgeTxt}>💳 {METODOS_LABEL[metodo] || metodo}</Text>
          </View>
        </View>

        {aplicados.map((a, i) => (
          <View key={i} style={s.cuentaCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={s.cuentaNombre}>{a.ok ? '✔' : '✘'} {a.clienteNombre}</Text>
              {a.numeroRecibo ? <Text style={s.cuentaRecibo}>{a.numeroRecibo}</Text> : null}
            </View>
            {a.producto ? <Text style={s.cuentaProducto}>{a.producto}</Text> : null}
            {a.ok && a.sinPago ? (
              <View style={s.cuentaSaldosRow}>
                <Text style={s.cuentaSaldoTxt}>Debía: <Text style={{ color: '#e53e3e', fontWeight: '700' }}>{fmt(a.saldoAntes)}</Text></Text>
                <Text style={[s.cuentaSaldoTxt, { color: '#e65100', fontWeight: '800' }]}>No abonó</Text>
              </View>
            ) : a.ok ? (
              <View style={s.cuentaSaldosRow}>
                <Text style={s.cuentaSaldoTxt}>Debía: <Text style={{ color: '#e53e3e', fontWeight: '700' }}>{fmt(a.saldoAntes)}</Text></Text>
                <Text style={s.cuentaSaldoTxt}>Abona: <Text style={{ color: '#2e7d32', fontWeight: '700' }}>{fmt(a.monto)}</Text></Text>
                <Text style={s.cuentaSaldoTxt}>Resta: <Text style={{ color: '#e65100', fontWeight: '700' }}>{fmt(a.saldoDespues)}</Text></Text>
              </View>
            ) : (
              <Text style={{ color: '#e53e3e', fontSize: 12, marginTop: 4 }}>No se pudo aplicar</Text>
            )}
          </View>
        ))}

        <View style={s.saldosCard}>
          <View style={s.saldoRow}>
            <Text style={s.saldoLabel}>Total debía</Text>
            <Text style={[s.saldoValor, { color: '#e53e3e' }]}>{fmt(totalDebia)}</Text>
          </View>
          <View style={s.sep} />
          <View style={s.abonoRow}>
            <Text style={s.abonoLabel}>Total abonado</Text>
            <Text style={s.abonoValor}>{fmt(totalAbonado)}</Text>
          </View>
          <View style={s.sep} />
          <View style={s.saldoRow}>
            <Text style={s.saldoLabel}>Total resta</Text>
            <Text style={[s.saldoValor, { color: totalResta > 0 ? '#e65100' : '#2e7d32' }]}>{fmt(totalResta)}</Text>
          </View>
          <View style={s.sep} />
          <Text style={s.cobradorTxt}>Cobrador: {nombreCobrador}</Text>
        </View>

        {proxFmt ? (
          <View style={s.proximaCard}>
            <Text style={{ fontSize: 22, marginBottom: 6 }}>📅</Text>
            <Text style={s.proximaLabel}>Próxima visita</Text>
            <Text style={s.proximaFecha}>{proxFmt}</Text>
          </View>
        ) : null}

        <View style={s.btns}>
          {clienteWhatsapp ? (
            <TouchableOpacity
              style={s.btnWhatsapp}
              onPress={() => enviarWhatsApp({ aplicados, metodo, proximaVisita, nombreCobrador, clienteWhatsapp, clienteNombreDestino: clienteNombre })}
            >
              <Text style={s.btnWhatsappTxt}>💬  Enviar recibo por WhatsApp</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={s.btnImprimir}
            onPress={() => imprimirRecibo({ aplicados, metodo, proximaVisita, nombreCobrador })}
          >
            <Text style={s.btnImprimirTxt}>🖨️  Reimprimir recibo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnPrimary} onPress={() => navigation.navigate('Cobros')}>
            <Text style={s.btnPrimaryTxt}>Volver a ruta</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.btnSecondary}
            onPress={() => navigation.navigate('DetalleCliente', { clienteId, clienteNombre })}
          >
            <Text style={s.btnSecondaryTxt}>Ver cliente</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f6fa' },
  header: { backgroundColor: '#1565C0',
    paddingTop: 32, // paddingTop real (insets.top) se aplica inline en el render
    paddingBottom: 18, paddingHorizontal: 20 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', marginTop: 2 },

  heroCard: { backgroundColor: '#fff', margin: 12, borderRadius: 16, padding: 24, alignItems: 'center', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08 },
  checkCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#e8f5e9', alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderWidth: 2, borderColor: '#a5d6a7' },
  heroLabel: { color: '#2e7d32', fontSize: 15, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  metodoBadge: { backgroundColor: '#f0f0f0', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  metodoBadgeTxt: { color: '#555', fontSize: 13, fontWeight: '600' },

  cuentaCard: { backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 8, borderRadius: 14, padding: 14, elevation: 1, borderWidth: 1, borderColor: '#eee' },
  cuentaNombre: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  cuentaRecibo: { fontSize: 11, color: '#888', fontWeight: '600' },
  cuentaProducto: { fontSize: 11, color: '#999', marginTop: 2 },
  cuentaSaldosRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  cuentaSaldoTxt: { fontSize: 11, color: '#666' },

  saldosCard: { backgroundColor: '#fff', marginHorizontal: 12, marginTop: 8, borderRadius: 16, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, elevation: 2 },
  saldoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  saldoLabel: { color: '#555', fontSize: 14, flexGrow: 1, flexShrink: 1 },
  saldoValor: { fontSize: 16, fontWeight: '700', minWidth: 80, textAlign: 'right' },
  sep: { height: 1, backgroundColor: '#eeeeee' },
  abonoRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8f5e9', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 10 },
  abonoLabel: { color: '#2e7d32', fontSize: 14, fontWeight: '800', flexGrow: 1, flexShrink: 1 },
  abonoValor: { color: '#1b5e20', fontSize: 22, fontWeight: '900', minWidth: 80, textAlign: 'right' },
  cobradorTxt: { color: '#999', fontSize: 12, textAlign: 'right', paddingTop: 10 },

  proximaCard: { backgroundColor: '#e3f2fd', marginHorizontal: 12, marginTop: 10, borderRadius: 16, padding: 20, alignItems: 'center' },
  proximaLabel: { color: '#1565C0', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  proximaFecha: { color: '#1565C0', fontSize: 22, fontWeight: '900' },

  btns: { marginHorizontal: 12, marginTop: 16, gap: 10 },
  btnWhatsapp: { backgroundColor: '#25D366', borderRadius: 12, paddingVertical: 16, alignItems: 'center', elevation: 2 },
  btnWhatsappTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnImprimir: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#888' },
  btnImprimirTxt: { color: '#444', fontWeight: '700', fontSize: 15 },
  btnPrimary: { backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 16, alignItems: 'center', elevation: 2 },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnSecondary: { borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  btnSecondaryTxt: { color: '#1565C0', fontWeight: '700', fontSize: 15 },
});
