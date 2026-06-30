import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, Linking, Alert, ActivityIndicator,
} from 'react-native';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';

const fmt     = (n) => `$${Number(n || 0).toFixed(2)}`;
const escHtml = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── Genera HTML del ticket ────────────────────────────────────────────────────
const buildHtml = (venta, carrito, totals, logoUri) => {
  const date    = new Date(venta.fecha_venta || Date.now()).toLocaleString('es-SV');
  const cliente = venta.cliente?.nombre
    ? `${venta.cliente.nombre} ${venta.cliente.apellido || ''}`.trim()
    : totals.clienteNombre || 'Consumidor Final';
  const cajaNombre      = escHtml(String(venta.caja || venta.caja_numero || '01'));
  const sucursalNombre  = escHtml(String(venta.sucursal?.nombre || venta.sucursal_nombre || ''));
  const vendedorNombre  = escHtml(String(venta.vendedor?.nombre || venta.user?.name || ''));
  const ventaNumero     = escHtml(String(venta.numero_venta || venta.id || 'N/A'));
  const tipoPagoLabel   = totals.tipoPago === 'credito' ? 'Crédito' : 'Contado';
  const logoHtml        = logoUri
    ? `<div style="text-align:center;margin-bottom:10px"><img src="${logoUri}" style="max-width:140px;height:auto"/></div>`
    : '';

  const itemsHtml = (carrito || []).map(d => {
    const nombre   = escHtml(d.nombre || `Producto ${d.id}`);
    const qty      = Number(d.cantidad || 1);
    const cuotas   = Number(d.cuotas || 0);
    const esCred   = cuotas > 0 && Number(d.precio_cuota || 0) > 0;
    return `
      <div style="margin-bottom:6px">
        <div style="font-size:13px;font-weight:700">${nombre}</div>
        <div style="font-size:12px;color:#555">Cantidad: ${qty}</div>
        ${esCred
          ? `<div style="font-size:12px">Precio cuota: ${fmt(d.precio_cuota)}</div>
             <div style="font-size:12px;font-weight:700">${cuotas} cuotas de ${fmt(d.precio_cuota)}</div>`
          : `<div style="font-size:12px">Precio: ${fmt(d.precio_venta)}</div>`}
      </div>
      <div style="border-top:1px dashed #aaa;margin:6px 0"></div>`;
  }).join('');

  return `<html><head>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <style>
      *{box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:14px;width:100%;max-width:380px;margin:0 auto;padding:12px}
      .center{text-align:center}
      .divider{border-top:2px dashed #333;margin:10px 0}
      table{width:100%;border-collapse:collapse;table-layout:fixed}
      td{padding:3px 2px;font-size:13px;word-break:break-word}
      td:first-child{width:60%}
      td:last-child{width:40%;text-align:right}
    </style>
  </head><body>
    ${logoHtml}
    <div class="center">
      <div style="font-size:20px;font-weight:800;margin-bottom:4px">DISTRIBUIDORA BM</div>
      <div style="font-size:12px;color:#555">Muebles • Electrodomésticos</div>
    </div>
    <div style="font-size:12px;margin-top:8px;line-height:18px;color:#555">
      Teléfono: +503 7777-7777<br/>WhatsApp: +503 7777-7777<br/>
      Correo: ventas@bmdistribuidora.com<br/>Web: www.bmdistribuidora.com
    </div>
    <div style="font-size:12px;margin-top:6px;color:#555">Dirección:<br/>Usulután, El Salvador</div>
    <div class="divider"></div>
    <div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:8px">━ TICKET DE VENTA ━</div>
    <div style="font-size:12px;margin-bottom:2px"><strong>Venta No:</strong> ${ventaNumero}</div>
    <div style="font-size:12px;margin-bottom:2px"><strong>Fecha:</strong> ${escHtml(date)}</div>
    <div style="font-size:12px;margin-bottom:2px"><strong>Caja:</strong> ${cajaNombre}</div>
    <div style="font-size:12px;margin-bottom:2px"><strong>Sucursal:</strong> ${sucursalNombre}</div>
    <div style="font-size:12px;margin-bottom:2px"><strong>Vendedor:</strong> ${vendedorNombre}</div>
    <div style="font-size:12px;margin-top:4px"><strong>Cliente:</strong> ${escHtml(cliente)}</div>
    <div class="divider"></div>
    <div style="font-size:13px;font-weight:700;margin-bottom:8px">PRODUCTOS</div>
    ${itemsHtml}
    <div class="divider"></div>
    <table>
      <tr><td>Subtotal</td><td style="text-align:right;font-weight:600">${fmt(totals.subtotal)}</td></tr>
      <tr><td>Descuento</td><td style="text-align:right;font-weight:600">${fmt(totals.descVal)}</td></tr>
      <tr><td style="font-size:15px;font-weight:800"><strong>TOTAL</strong></td><td style="text-align:right;font-size:15px;font-weight:800">${fmt(totals.total)}</td></tr>
    </table>
    <div class="divider"></div>
    <div style="font-size:13px;margin-bottom:4px"><strong>Forma de pago:</strong> ${tipoPagoLabel}</div>
    <table>
      ${totals.tipoPago === 'credito'
        ? `<tr><td style="font-weight:700">Prima inicial</td><td style="text-align:right;font-weight:800;font-size:14px">${totals.pagoVal > 0 ? fmt(totals.pagoVal) : 'Sin prima'}</td></tr>`
        : `<tr><td>Pago recibido</td><td style="text-align:right;font-weight:600">${fmt(totals.pagoVal)}</td></tr>
           <tr><td>Vuelto</td><td style="text-align:right;font-weight:600">${fmt(totals.vuelto)}</td></tr>`}
    </table>
    <div class="divider"></div>
    <div style="font-size:12px;font-weight:700;margin-bottom:4px">GARANTÍA Y CONSULTAS</div>
    <div style="font-size:11px;line-height:17px;color:#555">
      Conserve este comprobante para cambios, garantías y consultas.
    </div>
    <div class="divider"></div>
    <div style="text-align:center;font-size:13px;font-weight:700">¡Gracias por su compra!</div>
    <div style="text-align:center;font-size:11px;color:#555">DISTRIBUIDORA BM<br/>"Equipando su hogar con calidad"</div>
  </body></html>`;
};

// ── Mensaje WhatsApp ──────────────────────────────────────────────────────────
const buildWaMsg = (venta, carrito, totals) => {
  const date    = new Date(venta.fecha_venta || Date.now()).toLocaleDateString('es-SV');
  const cliente = venta.cliente?.nombre
    ? `${venta.cliente.nombre} ${venta.cliente.apellido || ''}`.trim()
    : totals.clienteNombre || 'Consumidor Final';
  const items = (carrito || []).map(d => {
    const cuotas = Number(d.cuotas || 0);
    return cuotas > 0
      ? `• ${d.nombre} — ${cuotas} cuotas de ${fmt(d.precio_cuota)}`
      : `• ${d.nombre} x${d.cantidad} — ${fmt(d.precio_venta)}`;
  }).join('\n');
  const tipoPagoLabel = totals.tipoPago === 'credito' ? 'Crédito' : 'Contado';

  return `🏪 *DISTRIBUIDORA BM*
🛍️ *TICKET DE VENTA*
━━━━━━━━━━━━━━━━━━━━
📅 Fecha: ${date}
🔖 Venta No: ${venta.numero_venta || venta.id}
👤 Cliente: ${cliente}
💳 Forma de pago: ${tipoPagoLabel}

📦 *Productos:*
${items}

💵 Subtotal: ${fmt(totals.subtotal)}
🏷️ Descuento: ${fmt(totals.descVal)}
💰 *TOTAL: ${fmt(totals.total)}*${totals.tipoPago === 'credito' ? `\n🤝 Prima inicial: ${totals.pagoVal > 0 ? fmt(totals.pagoVal) : 'Sin prima'}` : `\n💵 Vuelto: ${fmt(totals.vuelto)}`}
━━━━━━━━━━━━━━━━━━━━
¡Gracias por su compra! 🙏
_Conserve este mensaje como comprobante._`;
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function VentaRegistradaScreen({ navigation, route }) {
  const { venta, carrito, totals, clienteWhatsapp } = route.params;
  const [printing, setPrinting] = useState(false);
  const [logoUri,  setLogoUri]  = useState(null);
  const logoLoaded = useRef(false);

  useEffect(() => {
    (async () => {
      if (logoLoaded.current) return;
      try {
        const asset = Asset.fromModule(require('../assets/img/logo.png'));
        if (!asset.localUri) await asset.downloadAsync();
        const uri = asset.localUri || asset.uri;
        const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        setLogoUri(`data:image/png;base64,${b64}`);
        logoLoaded.current = true;
      } catch (_) {}
    })();
  }, []);

  const imprimir = useCallback(async () => {
    setPrinting(true);
    try {
      const html = buildHtml(venta, carrito, totals, logoUri);
      await Print.printAsync({ html });
    } catch (_) {
      Alert.alert('Error', 'No se pudo imprimir el ticket.');
    } finally {
      setPrinting(false);
    }
  }, [venta, carrito, totals, logoUri]);

  const enviarWhatsApp = useCallback(async () => {
    const telefono = (clienteWhatsapp || '').replace(/\D/g, '');
    if (!telefono) {
      Alert.alert('Sin teléfono', 'El cliente no tiene número de WhatsApp registrado.');
      return;
    }
    const numero = telefono.startsWith('503') ? telefono : `503${telefono}`;
    const msg    = buildWaMsg(venta, carrito, totals);
    const url    = `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
    const puede  = await Linking.canOpenURL(url);
    if (puede) await Linking.openURL(url);
    else Alert.alert('WhatsApp no disponible', 'No se encontró WhatsApp en este dispositivo.');
  }, [venta, carrito, totals, clienteWhatsapp]);

  const tipoPago = totals.tipoPago;
  const esCredito = tipoPago === 'credito';

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />

      <View style={s.header}>
        <Text style={s.headerTitle}>Venta registrada</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Hero */}
        <View style={s.heroCard}>
          <View style={s.checkCircle}>
            <Text style={{ fontSize: 44, color: '#2e7d32' }}>✓</Text>
          </View>
          <Text style={s.heroNumero}>{venta.numero_venta || `ID: ${venta.id}`}</Text>
          <Text style={s.heroLabel}>Venta registrada correctamente</Text>
          <View style={[s.tipoBadge, { backgroundColor: esCredito ? '#fff8e1' : '#e8f5e9' }]}>
            <Text style={[s.tipoBadgeTxt, { color: esCredito ? '#F5A623' : '#2e7d32' }]}>
              {esCredito ? '💳 Crédito' : '💵 Contado'}
            </Text>
          </View>
        </View>

        {/* Totales */}
        <View style={s.totalesCard}>
          <View style={s.totRow}>
            <Text style={s.totLabel}>Subtotal</Text>
            <Text style={s.totVal}>{fmt(totals.subtotal)}</Text>
          </View>
          {totals.descVal > 0 && (
            <View style={s.totRow}>
              <Text style={s.totLabel}>Descuento</Text>
              <Text style={[s.totVal, { color: '#10B981' }]}>-{fmt(totals.descVal)}</Text>
            </View>
          )}
          <View style={s.sep} />
          <View style={s.totRow}>
            <Text style={[s.totLabel, { fontSize: 18, fontWeight: '800', color: '#1a1a1a' }]}>TOTAL</Text>
            <Text style={[s.totVal, { fontSize: 22, fontWeight: '900', color: '#1565C0' }]}>{fmt(totals.total)}</Text>
          </View>
          <View style={s.sep} />
          {esCredito ? (
            <View style={[s.totRow, { backgroundColor: '#fff8e1', borderRadius: 10, padding: 10, marginTop: 8 }]}>
              <Text style={{ color: '#7a5900', fontWeight: '700', fontSize: 14 }}>💰 Prima inicial</Text>
              <Text style={{ color: totals.pagoVal > 0 ? '#F5A623' : '#aaa', fontWeight: '900', fontSize: 16 }}>
                {totals.pagoVal > 0 ? fmt(totals.pagoVal) : 'Sin prima'}
              </Text>
            </View>
          ) : (
            <>
              <View style={s.totRow}>
                <Text style={s.totLabel}>Pago recibido</Text>
                <Text style={s.totVal}>{fmt(totals.pagoVal)}</Text>
              </View>
              <View style={s.totRow}>
                <Text style={s.totLabel}>Vuelto</Text>
                <Text style={[s.totVal, { color: '#10B981', fontWeight: '800' }]}>{fmt(totals.vuelto)}</Text>
              </View>
            </>
          )}
        </View>

        {/* Productos */}
        <View style={s.productosCard}>
          <Text style={s.productosTitle}>Productos ({carrito.length})</Text>
          {carrito.map((item, idx) => {
            const cuotas  = Number(item.cuotas || 0);
            const esCred  = cuotas > 0;
            return (
              <View key={idx} style={s.prodRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.prodNombre}>{item.nombre}</Text>
                  <Text style={s.prodMeta}>
                    {esCred
                      ? `${cuotas} cuotas de ${fmt(item.precio_cuota)}`
                      : `x${item.cantidad} · ${fmt(item.precio_venta)}`}
                  </Text>
                </View>
                {esCred && (
                  <View style={s.credBadge}>
                    <Text style={s.credBadgeTxt}>CRÉDITO</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Botones */}
        <View style={s.btns}>
          {clienteWhatsapp ? (
            <TouchableOpacity style={s.btnWa} onPress={enviarWhatsApp}>
              <Text style={s.btnWaTxt}>💬  Enviar por WhatsApp</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={s.btnPrint} onPress={imprimir} disabled={printing}>
            {printing
              ? <ActivityIndicator color="#444" />
              : <Text style={s.btnPrintTxt}>🖨️  Imprimir ticket</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={s.btnPrimary}
            onPress={() => navigation.navigate('NuevaVenta')}
          >
            <Text style={s.btnPrimaryTxt}>+ Nueva venta</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.btnSecondary}
            onPress={() => navigation.navigate('HistorialVentas')}
          >
            <Text style={s.btnSecondaryTxt}>📋 Ver historial del día</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    backgroundColor: '#1565C0',
    paddingTop: (StatusBar.currentHeight || 0) + 10,
    paddingBottom: 18, paddingHorizontal: 20,
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },

  heroCard: {
    backgroundColor: '#fff', margin: 12, borderRadius: 16, padding: 24,
    alignItems: 'center', elevation: 3,
  },
  checkCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#e8f5e9',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    borderWidth: 2, borderColor: '#a5d6a7',
  },
  heroNumero: { color: '#1565C0', fontSize: 18, fontWeight: '900', marginBottom: 4 },
  heroLabel:  { color: '#2e7d32', fontSize: 14, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  tipoBadge:  { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  tipoBadgeTxt:{ fontSize: 13, fontWeight: '700' },

  totalesCard: {
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 4,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, elevation: 2,
  },
  totRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  totLabel:{ color: '#666', fontSize: 14 },
  totVal:  { color: '#1a1a1a', fontWeight: '700', fontSize: 14 },
  sep:     { height: 1, backgroundColor: '#eee', marginVertical: 4 },

  productosCard: {
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 10,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, elevation: 2,
  },
  productosTitle: { color: '#888', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  prodRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  prodNombre:{ color: '#1a1a1a', fontWeight: '600', fontSize: 14 },
  prodMeta:  { color: '#888', fontSize: 12, marginTop: 2 },
  credBadge: { backgroundColor: '#fff3cd', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  credBadgeTxt:{ color: '#856404', fontSize: 10, fontWeight: '700' },

  btns:        { marginHorizontal: 12, marginTop: 16, gap: 10 },
  btnWa:       { backgroundColor: '#25D366', borderRadius: 12, paddingVertical: 16, alignItems: 'center', elevation: 2 },
  btnWaTxt:    { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnPrint:    { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#bbb' },
  btnPrintTxt: { color: '#444', fontWeight: '700', fontSize: 15 },
  btnPrimary:  { backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 16, alignItems: 'center', elevation: 2 },
  btnPrimaryTxt:{ color: '#fff', fontWeight: '800', fontSize: 15 },
  btnSecondary: { borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  btnSecondaryTxt:{ color: '#1565C0', fontWeight: '700', fontSize: 15 },
});
