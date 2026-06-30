import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Alert, Linking, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fechaHoyLocal, fechaLocalDesdeISO } from '../services/dateUtils';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
const hora = (iso) => {
  try { return new Date(iso).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', hour12: true }); }
  catch { return ''; }
};
const escHtml = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── Genera HTML del ticket de venta ──────────────────────────────────────────
const buildTicketHtml = (venta, logoUri) => {
  const date    = new Date(venta.fecha_venta || venta.created_at || Date.now()).toLocaleString('es-SV');
  const cliente = venta.cliente?.nombre
    ? `${venta.cliente.nombre} ${venta.cliente.apellido || ''}`.trim()
    : 'Consumidor Final';
  const tipoPagoLabel = venta.tipo_pago === 'credito' ? 'Crédito' : 'Contado';
  const logoHtml = logoUri
    ? `<div style="text-align:center;margin-bottom:10px"><img src="${logoUri}" style="max-width:140px;height:auto"/></div>`
    : '';

  const itemsHtml = (venta.detalles || []).map(d => {
    const nombre = escHtml(d.nombre || d.producto?.nombre || `Producto ${d.producto_id}`);
    const precio = parseFloat(d.precio_unitario || d.precio_venta || 0);
    const qty    = Number(d.cantidad || 1);
    const tieneCuotas = Number(d.cuotas || 0) > 0;
    return `
      <div style="margin-bottom:6px">
        <div style="font-size:13px;font-weight:700">${nombre}</div>
        <div style="font-size:12px;color:#555">Cantidad: ${qty}</div>
        ${tieneCuotas
          ? `<div style="font-size:12px">Precio cuota: ${fmt(d.precio_cuota)}</div>
             <div style="font-size:12px;font-weight:700">${d.cuotas} cuotas de ${fmt(d.precio_cuota)}</div>`
          : `<div style="font-size:12px">Precio: ${fmt(precio)}</div>`
        }
      </div>
      <div style="border-top:1px dashed #aaa;margin:6px 0"></div>`;
  }).join('');

  const prima = parseFloat(venta.prima || venta.abono_inicial || 0);

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
    <div class="divider"></div>
    <div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:8px">━ TICKET DE VENTA ━</div>
    <div style="font-size:12px;margin-bottom:2px"><strong>Venta No:</strong> ${escHtml(venta.numero_venta || venta.id)}</div>
    <div style="font-size:12px;margin-bottom:2px"><strong>Fecha:</strong> ${escHtml(date)}</div>
    <div style="font-size:12px;margin-bottom:2px"><strong>Sucursal:</strong> ${escHtml(venta.sucursal?.nombre || '')}</div>
    <div style="font-size:12px;margin-bottom:2px"><strong>Vendedor:</strong> ${escHtml(venta.vendedor?.nombre || venta.user?.name || '')}</div>
    <div style="font-size:12px;margin-top:4px"><strong>Cliente:</strong> ${escHtml(cliente)}</div>
    <div class="divider"></div>
    <div style="font-size:13px;font-weight:700;margin-bottom:8px">PRODUCTOS</div>
    ${itemsHtml}
    <div class="divider"></div>
    <table>
      <tr><td>Subtotal</td><td style="text-align:right;font-weight:600">${fmt(venta.subtotal)}</td></tr>
      <tr><td>Descuento</td><td style="text-align:right;font-weight:600">${fmt(venta.descuento || 0)}</td></tr>
      <tr><td style="font-size:15px;font-weight:800"><strong>TOTAL</strong></td><td style="text-align:right;font-size:15px;font-weight:800">${fmt(venta.total)}</td></tr>
    </table>
    <div class="divider"></div>
    <div style="font-size:13px;margin-bottom:4px"><strong>Forma de pago:</strong> ${tipoPagoLabel}</div>
    <table>
      ${venta.tipo_pago === 'credito'
        ? `<tr><td style="font-weight:700">Prima inicial</td><td style="text-align:right;font-weight:800;font-size:14px">${prima > 0 ? fmt(prima) : 'Sin prima'}</td></tr>`
        : `<tr><td>Pago recibido</td><td style="text-align:right;font-weight:600">${fmt(venta.pago_recibido || venta.total)}</td></tr>`
      }
    </table>
    <div class="divider"></div>
    <div style="text-align:center;font-size:14px;font-weight:700">¡Gracias por su compra!</div>
    <div style="text-align:center;font-size:12px;color:#555">DISTRIBUIDORA BM<br/>"Equipando su hogar con calidad"</div>
  </body></html>`;
};

// ── Mensaje WhatsApp ──────────────────────────────────────────────────────────
const buildWhatsAppMsg = (venta) => {
  const cliente = venta.cliente?.nombre
    ? `${venta.cliente.nombre} ${venta.cliente.apellido || ''}`.trim()
    : 'Consumidor Final';
  const date  = new Date(venta.fecha_venta || venta.created_at || Date.now()).toLocaleDateString('es-SV');
  const items = (venta.detalles || []).map(d => {
    const nombre = d.nombre || d.producto?.nombre || `Producto ${d.producto_id}`;
    const cuotas = Number(d.cuotas || 0);
    return cuotas > 0
      ? `• ${nombre} — ${cuotas} cuotas de ${fmt(d.precio_cuota)}`
      : `• ${nombre} x${d.cantidad} — ${fmt(d.precio_unitario || d.precio_venta)}`;
  }).join('\n');
  const prima = parseFloat(venta.prima || venta.abono_inicial || 0);
  const tipoPagoLabel = venta.tipo_pago === 'credito' ? 'Crédito' : 'Contado';

  return `🏪 *DISTRIBUIDORA BM*
🛍️ *TICKET DE VENTA*
━━━━━━━━━━━━━━━━━━━━
📅 Fecha: ${date}
🔖 Venta No: ${venta.numero_venta || venta.id}
👤 Cliente: ${cliente}
💳 Forma de pago: ${tipoPagoLabel}

📦 *Productos:*
${items}

💵 Subtotal: ${fmt(venta.subtotal)}
🏷️ Descuento: ${fmt(venta.descuento || 0)}
💰 *TOTAL: ${fmt(venta.total)}*${venta.tipo_pago === 'credito' ? `\n🤝 Prima inicial: ${prima > 0 ? fmt(prima) : 'Sin prima'}` : ''}
━━━━━━━━━━━━━━━━━━━━
¡Gracias por su compra! 🙏
_Conserve este mensaje como comprobante._`;
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function HistorialVentasScreen({ navigation }) {
  const { user } = useAuth();
  const [ventas,   setVentas]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);
  const [logoUri,  setLogoUri]  = useState(null);
  const logoLoaded = useRef(false);

  // Cargar logo una vez
  const cargarLogo = useCallback(async () => {
    if (logoLoaded.current) return;
    try {
      const asset = Asset.fromModule(require('../assets/img/logo.png'));
      if (!asset.localUri) await asset.downloadAsync();
      const uri = asset.localUri || asset.uri;
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      setLogoUri(`data:image/png;base64,${b64}`);
      logoLoaded.current = true;
    } catch (_) {}
  }, []);

  // Cargar ventas del día (la API ya filtra por el vendedor autenticado)
  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      cargarLogo();
      try {
        const hoy = fechaHoyLocal(); // YYYY-MM-DD en hora de El Salvador
        const { data } = await api.get('/ventas?per_page=200');
        const todas = Array.isArray(data) ? data : (data.data || []);
        // Filtrar solo las del día de hoy por fecha_venta (en hora local, no UTC)
        const deHoy = todas.filter(v => {
          const f = v.fecha_venta || v.created_at || '';
          return fechaLocalDesdeISO(f) === hoy;
        });
        setVentas(deHoy);
      } catch (e) {
        Alert.alert('Error', 'No se pudieron cargar las ventas del día.');
      } finally {
        setLoading(false);
      }
    })();
  }, [cargarLogo]));

  const totalDia = ventas.reduce((s, v) => s + parseFloat(v.total || 0), 0);

  // Imprimir ticket
  const imprimir = useCallback(async (venta) => {
    try {
      const html = buildTicketHtml(venta, logoUri);
      await Print.printAsync({ html });
    } catch (_) {
      Alert.alert('Error', 'No se pudo imprimir el ticket.');
    }
  }, [logoUri]);

  // Enviar WhatsApp
  const enviarWhatsApp = useCallback(async (venta) => {
    const telefono = (venta.cliente?.telefono || venta.cliente?.whatsapp || '').replace(/\D/g, '');
    if (!telefono) {
      Alert.alert('Sin teléfono', 'El cliente no tiene número de WhatsApp registrado.');
      return;
    }
    const numero = telefono.startsWith('503') ? telefono : `503${telefono}`;
    const msg    = buildWhatsAppMsg(venta);
    const url    = `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
    const puede  = await Linking.canOpenURL(url);
    if (puede) await Linking.openURL(url);
    else Alert.alert('WhatsApp no disponible', 'No se encontró WhatsApp en este dispositivo.');
  }, []);

  // ── Card de venta ───────────────────────────────────────────────────────────
  const renderItem = ({ item, index }) => {
    const cliente = item.cliente?.nombre
      ? `${item.cliente.nombre} ${item.cliente.apellido || ''}`.trim()
      : 'Consumidor Final';
    const esCredito  = item.tipo_pago === 'credito';
    const numItems   = (item.detalles || []).length;

    return (
      <TouchableOpacity style={s.card} onPress={() => setSelected(item)} activeOpacity={0.8}>
        <View style={[s.cardAccent, { backgroundColor: esCredito ? '#F5A623' : '#10B981' }]} />
        <View style={s.cardBody}>
          <View style={s.cardRow}>
            <Text style={s.cardNum}>#{index + 1}</Text>
            <Text style={s.cardVentaNo}>{item.numero_venta || `ID:${item.id}`}</Text>
            <View style={[s.badge, { backgroundColor: esCredito ? '#fff8e1' : '#e8f5e9' }]}>
              <Text style={[s.badgeTxt, { color: esCredito ? '#F5A623' : '#2e7d32' }]}>
                {esCredito ? 'Crédito' : 'Contado'}
              </Text>
            </View>
          </View>
          <View style={s.cardRow}>
            <Text style={s.cardCliente} numberOfLines={1}>👤 {cliente}</Text>
            <Text style={s.cardTotal}>{fmt(item.total)}</Text>
          </View>
          <View style={s.cardRow}>
            <Text style={s.cardMeta}>{numItems} producto{numItems !== 1 ? 's' : ''}</Text>
            <Text style={s.cardHora}>{hora(item.fecha_venta || item.created_at)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Modal detalle de venta ──────────────────────────────────────────────────
  const renderModal = () => {
    if (!selected) return null;
    const v       = selected;
    const cliente = v.cliente?.nombre
      ? `${v.cliente.nombre} ${v.cliente.apellido || ''}`.trim()
      : 'Consumidor Final';
    const tieneTel = !!(v.cliente?.telefono || v.cliente?.whatsapp);
    const prima    = parseFloat(v.prima || v.abono_inicial || 0);

    return (
      <Modal visible animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            {/* Header modal */}
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Venta {v.numero_venta || v.id}</Text>
              <TouchableOpacity onPress={() => setSelected(null)} style={s.modalClose}>
                <Text style={s.modalCloseTxt}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {/* Info cliente y fecha */}
              <View style={s.modalSection}>
                <Text style={s.modalSectionTitle}>Información</Text>
                <View style={s.modalRow}>
                  <Text style={s.modalLabel}>Cliente</Text>
                  <Text style={s.modalValue}>{cliente}</Text>
                </View>
                <View style={s.modalRow}>
                  <Text style={s.modalLabel}>Fecha</Text>
                  <Text style={s.modalValue}>{new Date(v.fecha_venta || v.created_at).toLocaleString('es-SV')}</Text>
                </View>
                <View style={s.modalRow}>
                  <Text style={s.modalLabel}>Tipo de pago</Text>
                  <View style={[s.badge, { backgroundColor: v.tipo_pago === 'credito' ? '#fff8e1' : '#e8f5e9' }]}>
                    <Text style={[s.badgeTxt, { color: v.tipo_pago === 'credito' ? '#F5A623' : '#2e7d32' }]}>
                      {v.tipo_pago === 'credito' ? 'Crédito' : 'Contado'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Productos */}
              <View style={s.modalSection}>
                <Text style={s.modalSectionTitle}>Productos</Text>
                {(v.detalles || []).map((d, i) => {
                  const nombre   = d.nombre || d.producto?.nombre || `Producto ${d.producto_id}`;
                  const cuotas   = Number(d.cuotas || 0);
                  const esCredItem = cuotas > 0;
                  return (
                    <View key={i} style={s.prodRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.prodNombre}>{nombre}</Text>
                        <Text style={s.prodMeta}>
                          {esCredItem
                            ? `${cuotas} cuotas de ${fmt(d.precio_cuota)}`
                            : `x${d.cantidad} · Precio: ${fmt(d.precio_unitario || d.precio_venta)}`}
                        </Text>
                        {esCredItem && (
                          <View style={s.creditoBadge}>
                            <Text style={s.creditoBadgeTxt}>CRÉDITO</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.prodTotal}>{fmt(parseFloat(d.precio_unitario || d.precio_venta || 0) * Number(d.cantidad || 1))}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Totales */}
              <View style={[s.modalSection, s.totalesSection]}>
                <View style={s.modalRow}>
                  <Text style={s.modalLabel}>Subtotal</Text>
                  <Text style={s.modalValue}>{fmt(v.subtotal)}</Text>
                </View>
                {parseFloat(v.descuento || 0) > 0 && (
                  <View style={s.modalRow}>
                    <Text style={s.modalLabel}>Descuento</Text>
                    <Text style={[s.modalValue, { color: '#10B981' }]}>-{fmt(v.descuento)}</Text>
                  </View>
                )}
                <View style={[s.modalRow, { marginTop: 6 }]}>
                  <Text style={[s.modalLabel, { fontSize: 16, fontWeight: '800', color: '#1a1a1a' }]}>TOTAL</Text>
                  <Text style={[s.modalValue, { fontSize: 18, fontWeight: '900', color: '#1565C0' }]}>{fmt(v.total)}</Text>
                </View>
                {v.tipo_pago === 'credito' && (
                  <View style={[s.modalRow, { backgroundColor: '#fff8e1', borderRadius: 8, padding: 8, marginTop: 8 }]}>
                    <Text style={{ color: '#7a5900', fontWeight: '700' }}>💰 Prima inicial</Text>
                    <Text style={{ color: '#F5A623', fontWeight: '800', fontSize: 15 }}>
                      {prima > 0 ? fmt(prima) : 'Sin prima'}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Botones de acción */}
            <View style={s.modalBtns}>
              {tieneTel && (
                <TouchableOpacity style={s.btnWa} onPress={() => enviarWhatsApp(v)}>
                  <Text style={s.btnWaTxt}>💬  WhatsApp</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.btnPrint} onPress={() => imprimir(v)}>
                <Text style={s.btnPrintTxt}>🖨️  Imprimir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // ── Render principal ────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Mis ventas de hoy</Text>
          <Text style={s.headerSub}>
            {loading
              ? 'Cargando...'
              : `${ventas.length} venta${ventas.length !== 1 ? 's' : ''} · ${user?.name || user?.nombre || 'Vendedor'}`}
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color="#1565C0" size="large" style={{ marginTop: 48 }} />
      ) : ventas.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>🛍️</Text>
          <Text style={s.emptyTxt}>Sin ventas registradas hoy</Text>
        </View>
      ) : (
        <>
          <View style={s.resumenCard}>
            <View>
              <Text style={s.resumenLabel}>Total vendido hoy</Text>
              <Text style={s.resumenContado}>{ventas.filter(v => v.tipo_pago !== 'credito').length} contado · {ventas.filter(v => v.tipo_pago === 'credito').length} crédito</Text>
            </View>
            <Text style={s.resumenTotal}>{fmt(totalDia)}</Text>
          </View>

          <FlatList
            data={ventas}
            keyExtractor={v => String(v.id)}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      {renderModal()}
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    backgroundColor: '#1565C0',
    paddingTop: (StatusBar.currentHeight || 0) + 10,
    paddingBottom: 18, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  backBtn:     { paddingRight: 4 },
  backTxt:     { color: '#fff', fontSize: 24, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSub:   { color: 'rgba(255,255,255,0.75)', fontSize: 13 },

  resumenCard: {
    backgroundColor: '#1565C0', marginHorizontal: 12, marginTop: 12,
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    opacity: 0.9,
  },
  resumenLabel:   { color: '#fff', fontSize: 13, fontWeight: '600' },
  resumenContado: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },
  resumenTotal:   { color: '#fff', fontSize: 26, fontWeight: '900' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 10,
    flexDirection: 'row', overflow: 'hidden', elevation: 2,
  },
  cardAccent: { width: 6 },
  cardBody:   { flex: 1, padding: 12 },
  cardRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardNum:    { color: '#aaa', fontWeight: '700', fontSize: 12, marginRight: 6 },
  cardVentaNo:{ color: '#555', fontSize: 12, flex: 1 },
  cardCliente:{ color: '#1a1a1a', fontWeight: '700', fontSize: 14, flex: 1, marginRight: 8 },
  cardTotal:  { color: '#1565C0', fontWeight: '900', fontSize: 16 },
  cardMeta:   { color: '#888', fontSize: 12 },
  cardHora:   { color: '#aaa', fontSize: 12 },

  badge:    { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeTxt: { fontSize: 11, fontWeight: '700' },

  empty:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon:{ fontSize: 48, marginBottom: 12 },
  emptyTxt: { color: '#888', fontSize: 16 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '90%', paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  modalTitle:    { fontSize: 17, fontWeight: '800', color: '#1a1a1a' },
  modalClose:    { padding: 4 },
  modalCloseTxt: { fontSize: 20, color: '#aaa' },

  modalSection: {
    marginHorizontal: 16, marginTop: 14, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  totalesSection: { borderBottomWidth: 0 },
  modalSectionTitle: { fontSize: 12, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  modalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  modalLabel: { color: '#666', fontSize: 14 },
  modalValue: { color: '#1a1a1a', fontWeight: '600', fontSize: 14, textAlign: 'right', flex: 1, marginLeft: 8 },

  prodRow:    { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  prodNombre: { color: '#1a1a1a', fontWeight: '600', fontSize: 13 },
  prodMeta:   { color: '#888', fontSize: 12, marginTop: 2 },
  prodTotal:  { color: '#1565C0', fontWeight: '700', fontSize: 14, marginLeft: 8 },
  creditoBadge:    { backgroundColor: '#fff3cd', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, marginTop: 4, alignSelf: 'flex-start' },
  creditoBadgeTxt: { color: '#856404', fontSize: 10, fontWeight: '700' },

  modalBtns: {
    flexDirection: 'row', gap: 10,
    marginHorizontal: 16, marginTop: 14,
  },
  btnWa:      { flex: 1, backgroundColor: '#25D366', borderRadius: 12, paddingVertical: 14, alignItems: 'center', elevation: 2 },
  btnWaTxt:   { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnPrint:   { flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#bbb' },
  btnPrintTxt:{ color: '#444', fontWeight: '700', fontSize: 14 },
});
