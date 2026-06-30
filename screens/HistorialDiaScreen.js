import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Modal, ScrollView, Linking, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { leerHistorial } from '../services/cobrosOffline';
import { fechaHoyLocal, fechaLocalDesdeISO } from '../services/dateUtils';

const fmt   = (n) => `$${Number(n || 0).toFixed(2)}`;
const hoy   = fechaHoyLocal;
const hora  = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return ''; }
};
const fmtFecha = (iso) => {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-SV', { day: '2-digit', month: 'short' });
  } catch { return iso; }
};

const METODO_ICON = { efectivo: '💵', transferencia: '📲', cheque: '📄', deposito: '🏦' };

const VISITA_INFO = {
  no_encontrado: { label: 'No estaba en casa',   icon: '🚪', color: '#1565C0', bg: '#e3f2fd' },
  sin_pago:      { label: 'Estaba pero no pagó', icon: '🚫', color: '#e65100', bg: '#fff3e0' },
  promesa_pago:  { label: 'Prometió pagar',      icon: '🤝', color: '#2e7d32', bg: '#e8f5e9' },
  rechazo:       { label: 'Se negó a atender',   icon: '⛔', color: '#c62828', bg: '#ffebee' },
};

const buildReciboHtml = ({ clienteNombre, ventaNumero, monto, metodo, proximaVisita, fecha }) => {
  const fechaFmt = new Date(fecha).toLocaleDateString('es-SV');
  const horaFmt = new Date(fecha).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', hour12: true });
  const proxFmt = proximaVisita
    ? new Date(proximaVisita + 'T12:00:00').toLocaleDateString('es-SV', { day:'2-digit', month:'long', year:'numeric' })
    : '';
  return `<html><head>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;width:220px;margin:0 auto;padding:8px 6px;font-size:11px}
      .center{text-align:center}
      .divider{border:none;border-top:1px dashed #bbb;margin:6px 0}
      .row{display:flex;justify-content:space-between;align-items:center;padding:3px 0}
      .lbl{flex:1;color:#333}
      .val{font-weight:700;text-align:right;white-space:nowrap;padding-left:6px}
      .abono{background:#e8f5e9;border-radius:4px;padding:5px 6px;margin:3px 0}
      .abono .lbl{color:#2e7d32;font-weight:800}
      .abono .val{font-size:15px;font-weight:900;color:#1b5e20}
    </style>
  </head><body>
    <div class="center" style="margin-bottom:6px">
      <div style="font-size:14px;font-weight:900">DISTRIBUIDORA BM</div>
      <div style="font-size:9px;color:#888">Muebles · Electrodomésticos</div>
    </div>
    <hr class="divider"/>
    <div class="center" style="font-size:11px;font-weight:800;margin-bottom:6px">RECIBO DE COBRO</div>
    <div class="row"><span class="lbl"><b>Fecha:</b></span><span class="val">${fechaFmt}</span></div>
    <div class="row"><span class="lbl"><b>Hora:</b></span><span class="val">${horaFmt}</span></div>
    <div class="row"><span class="lbl"><b>Cliente:</b></span><span class="val">${clienteNombre}</span></div>
    ${ventaNumero ? `<div class="row"><span class="lbl"><b>Venta:</b></span><span class="val">${ventaNumero}</span></div>` : ''}
    <div class="row"><span class="lbl"><b>Método:</b></span><span class="val">${metodo}</span></div>
    <hr class="divider"/>
    <div class="row abono"><span class="lbl">Monto cobrado:</span><span class="val">$${Number(monto).toFixed(2)}</span></div>
    <hr class="divider"/>
    ${proxFmt ? `<div class="center" style="margin:6px 0">
      <div style="font-size:9px;color:#888">PROXIMA VISITA</div>
      <div style="font-size:12px;font-weight:900;color:#1565C0">${proxFmt}</div>
    </div><hr class="divider"/>` : ''}
    <div class="center" style="font-weight:700;font-size:11px">Gracias por su cobro!</div>
  </body></html>`;
};

export default function HistorialDiaScreen({ navigation }) {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      const todos = await leerHistorial();
      const fechaHoy = hoy();
      // Filtrar solo los del día de hoy (en hora de El Salvador, no UTC)
      const deHoy = todos.filter(h => fechaLocalDesdeISO(h.fecha) === fechaHoy);
      setItems(deHoy);
      setLoading(false);
    })();
  }, []));

  const cobros  = items.filter(h => h.tipo !== 'visita');
  const visitas = items.filter(h => h.tipo === 'visita');
  const totalCobrado = cobros.reduce((s, h) => s + Number(h.monto || 0), 0);

  const imprimir = async (item) => {
    try {
      const html = buildReciboHtml(item);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      try {
        await Print.printAsync({ uri });
      } catch (printError) {
        const msg = String(printError?.message || '');
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
      if (!msg.includes('cancel') && !msg.includes('canceled')) {
        Alert.alert('Error', 'No se pudo imprimir');
      }
    }
  };

  const renderItem = ({ item, index }) => {
    if (item.tipo === 'visita') {
      const v = VISITA_INFO[item.resultadoVisita] || { label: item.resultadoVisita, icon: '📍', color: '#666', bg: '#f5f5f5' };
      return (
        <TouchableOpacity style={s.card} onPress={() => setSelected(item)} activeOpacity={0.7}>
          <View style={[s.cardLeft, { backgroundColor: v.bg }]}>
            <Text style={{ fontSize: 18 }}>{v.icon}</Text>
          </View>
          <View style={s.cardBody}>
            <View style={s.cardRow}>
              <Text style={s.cardNombre} numberOfLines={1}>{item.clienteNombre}</Text>
              <Text style={[s.cardMonto, { color: v.color, fontSize: 13 }]}>{v.label}</Text>
            </View>
            <View style={s.cardRow}>
              <Text style={s.cardMeta} numberOfLines={1}>{item.observaciones || 'Sin observaciones'}</Text>
              <Text style={s.cardHora}>{hora(item.fecha)}</Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity style={s.card} onPress={() => setSelected(item)} activeOpacity={0.7}>
        <View style={s.cardLeft}>
          <Text style={s.cardNum}>#{index + 1}</Text>
        </View>
        <View style={s.cardBody}>
          <View style={s.cardRow}>
            <Text style={s.cardNombre} numberOfLines={1}>{item.clienteNombre}</Text>
            <Text style={s.cardMonto}>{fmt(item.monto)}</Text>
          </View>
          <View style={s.cardRow}>
            <Text style={s.cardMeta}>
              {METODO_ICON[item.metodo] || '💳'} {item.metodo}
              {item.ventaNumero ? `  ·  ${item.ventaNumero}` : ''}
            </Text>
            <Text style={s.cardHora}>{hora(item.fecha)}</Text>
          </View>
          {item.proximaVisita ? (
            <Text style={s.cardProxima}>📅 Próx. visita: {fmtFecha(item.proximaVisita)}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0"/>

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Historial del día</Text>
          <Text style={s.headerSub}>
            {cobros.length} cobro{cobros.length !== 1 ? 's' : ''}
            {visitas.length > 0 ? `  ·  ${visitas.length} visita${visitas.length !== 1 ? 's' : ''}` : ''}
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color="#1565C0" style={{ marginTop: 40 }}/>
      ) : items.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📋</Text>
          <Text style={s.emptyTxt}>Sin cobros registrados hoy</Text>
        </View>
      ) : (<>
        {items.length > 0 && (
          <View style={s.totalCard}>
            <Text style={s.totalLabel}>Total cobrado hoy</Text>
            <Text style={s.totalValor}>{fmt(totalCobrado)}</Text>
          </View>
        )}
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      </>)}

      {/* Modal detalle */}
      {selected && (
        <Modal visible animationType="slide" transparent onRequestClose={() => setSelected(null)}>
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>{selected.tipo === 'visita' ? 'Detalle de la visita' : 'Detalle del cobro'}</Text>
                <TouchableOpacity onPress={() => setSelected(null)} style={s.modalClose}>
                  <Text style={s.modalCloseTxt}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                <View style={s.modalSection}>
                  <View style={s.modalRow}>
                    <Text style={s.modalLabel}>Cliente</Text>
                    <Text style={s.modalValue}>{selected.clienteNombre}</Text>
                  </View>

                  {selected.tipo === 'visita' ? (
                    <>
                      <View style={s.modalRow}>
                        <Text style={s.modalLabel}>Resultado</Text>
                        <Text style={[s.modalValue, { color: (VISITA_INFO[selected.resultadoVisita]||{}).color || '#666', fontWeight: '800' }]}>
                          {(VISITA_INFO[selected.resultadoVisita]||{}).icon} {(VISITA_INFO[selected.resultadoVisita]||{}).label || selected.resultadoVisita}
                        </Text>
                      </View>
                      <View style={s.modalRow}>
                        <Text style={s.modalLabel}>Observaciones</Text>
                        <Text style={[s.modalValue, { flex: 1, textAlign: 'right' }]}>{selected.observaciones || '—'}</Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={s.modalRow}>
                        <Text style={s.modalLabel}>Monto</Text>
                        <Text style={[s.modalValue, {color:'#2e7d32',fontWeight:'800'}]}>{fmt(selected.monto)}</Text>
                      </View>
                      <View style={s.modalRow}>
                        <Text style={s.modalLabel}>Método</Text>
                        <Text style={s.modalValue}>{(METODO_ICON[selected.metodo] || '💳')} {selected.metodo}</Text>
                      </View>
                      {selected.ventaNumero && (
                        <View style={s.modalRow}>
                          <Text style={s.modalLabel}>Venta</Text>
                          <Text style={s.modalValue}>{selected.ventaNumero}</Text>
                        </View>
                      )}
                    </>
                  )}

                  <View style={s.modalRow}>
                    <Text style={s.modalLabel}>Fecha & Hora</Text>
                    <Text style={s.modalValue}>{fmtFecha(selected.fecha)} {hora(selected.fecha)}</Text>
                  </View>
                  {selected.proximaVisita && (
                    <View style={s.modalRow}>
                      <Text style={s.modalLabel}>Próxima visita</Text>
                      <Text style={[s.modalValue, {color:'#1565C0'}]}>{fmtFecha(selected.proximaVisita)}</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
              <View style={s.modalBtns}>
                {selected.tipo !== 'visita' && (
                  <TouchableOpacity style={s.btnImprimir} onPress={() => { imprimir(selected); setSelected(null); }}>
                    <Text style={s.btnImprimirTxt}>🖨️  Reimprimir</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={s.btnSecondary} onPress={() => setSelected(null)}>
                  <Text style={s.btnSecondaryTxt}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    backgroundColor: '#1565C0',
    paddingTop: (StatusBar.currentHeight || 0) + 10,
    paddingBottom: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn:     { paddingRight: 4 },
  backTxt:     { color: '#fff', fontSize: 24, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSub:   { color: 'rgba(255,255,255,0.75)', fontSize: 13 },

  totalCard: {
    backgroundColor: '#1565C0', marginHorizontal: 12, marginTop: 12,
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    opacity: 0.9,
  },
  totalLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  totalValor: { color: '#fff', fontSize: 26, fontWeight: '900' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 10,
    flexDirection: 'row', overflow: 'hidden', elevation: 2,
  },
  cardLeft: {
    backgroundColor: '#e3f2fd', width: 42,
    alignItems: 'center', justifyContent: 'center',
  },
  cardNum:  { color: '#1565C0', fontWeight: '800', fontSize: 13 },
  cardBody: { flex: 1, padding: 12 },
  cardRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  cardNombre:{ color: '#1a1a1a', fontWeight: '700', fontSize: 15, flex: 1, marginRight: 8 },
  cardMonto: { color: '#2e7d32', fontWeight: '900', fontSize: 16 },
  cardMeta:  { color: '#666', fontSize: 12 },
  cardHora:  { color: '#999', fontSize: 12 },
  cardProxima:{ color: '#1565C0', fontSize: 12, marginTop: 4 },

  empty:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon:{ fontSize: 48, marginBottom: 12 },
  emptyTxt: { color: '#888', fontSize: 16 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#fff', maxHeight: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 20, elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  modalTitle: { color: '#1a1a1a', fontSize: 16, fontWeight: '800' },
  modalClose: { padding: 8 },
  modalCloseTxt: { color: '#999', fontSize: 20, fontWeight: '700' },

  modalSection: { padding: 20 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  modalLabel: { color: '#666', fontSize: 13, fontWeight: '600' },
  modalValue: { color: '#1a1a1a', fontSize: 13, fontWeight: '600' },

  modalBtns: { paddingHorizontal: 20, gap: 10 },
  btnImprimir: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#1565C0' },
  btnImprimirTxt: { color: '#1565C0', fontWeight: '700', fontSize: 14 },
  btnSecondary: { backgroundColor: '#f5f6fa', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnSecondaryTxt: { color: '#666', fontWeight: '700', fontSize: 14 },
});
