import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Image, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { useConnectivity } from '../services/connectivity';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const ESTADO_INFO = {
  pendiente: { label: 'Pendiente', color: '#e65100', bg: '#fff3e0' },
  aprobado:  { label: 'Aprobado',  color: '#2e7d32', bg: '#e8f5e9' },
  rechazado: { label: 'Rechazado', color: '#c62828', bg: '#ffebee' },
};

const FILTROS = [
  { value: null,        label: 'Todos' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'aprobado',  label: 'Aprobados' },
  { value: 'rechazado', label: 'Rechazados' },
];

// comprobante_url viene relativo (ej. "/storage/vales/5/xyz.jpg") — se arma
// la URL completa quitando el sufijo /api del host configurado.
const urlComprobante = (path) => {
  if (!path) return null;
  const base = (api.defaults.baseURL || '').replace(/\/api\/?$/, '');
  return `${base}${path}`;
};

export default function MisValesScreen({ navigation }) {
  const { isOnline } = useConnectivity();
  const [vales,   setVales]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [filtro,  setFiltro]  = useState(null);
  const [preview, setPreview] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = filtro ? { estado: filtro } : {};
      const { data } = await api.get('/vales', { params });
      setVales(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(isOnline ? (e?.message || 'No se pudieron cargar los vales.') : 'Sin conexión — necesitas internet para ver tus vales.');
    } finally {
      setLoading(false);
    }
  }, [filtro, isOnline]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const renderItem = ({ item }) => {
    const est = ESTADO_INFO[item.estado] || { label: item.estado, color: '#666', bg: '#f5f5f5' };
    return (
      <TouchableOpacity style={s.card} onPress={() => setPreview(item)} activeOpacity={0.8}>
        {item.comprobante_url ? (
          <Image source={{ uri: urlComprobante(item.comprobante_url) }} style={s.thumb} />
        ) : (
          <View style={[s.thumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0' }]}>
            <Text style={{ fontSize: 20 }}>🧾</Text>
          </View>
        )}
        <View style={s.cardBody}>
          <View style={s.cardRow}>
            <Text style={s.cardTipo}>
              {item.tipo === 'vehiculo' ? `🏍️ ${item.vehiculo || ''} · ${item.categoria_vehiculo || ''}` : '🧾 Consumo'}
            </Text>
            <Text style={s.cardMonto}>{fmt(item.monto)}</Text>
          </View>
          <View style={s.cardRow}>
            <Text style={s.cardFecha}>{item.creado}</Text>
            <View style={[s.badge, { backgroundColor: est.bg }]}>
              <Text style={[s.badgeTxt, { color: est.color }]}>{est.label}</Text>
            </View>
          </View>
          {item.estado === 'rechazado' && item.observaciones_admin ? (
            <Text style={s.motivoRechazo} numberOfLines={2}>Motivo: {item.observaciones_admin}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const s2 = styles();

  return (
    <View style={s2.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />

      <View style={s2.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s2.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s2.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s2.headerTitle}>Mis vales</Text>
          <Text style={s2.headerSub}>{vales.length} vale{vales.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity style={s2.addBtn} onPress={() => navigation.navigate('RegistrarGasto')}>
          <Text style={s2.addBtnTxt}>+ Nuevo</Text>
        </TouchableOpacity>
      </View>

      <View style={s2.filtrosRow}>
        {FILTROS.map(f => (
          <TouchableOpacity
            key={f.label}
            style={[s2.filtroChip, filtro === f.value && s2.filtroChipOn]}
            onPress={() => setFiltro(f.value)}
          >
            <Text style={[s2.filtroTxt, filtro === f.value && s2.filtroTxtOn]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color="#1565C0" style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={s2.empty}>
          <Text style={s2.emptyIcon}>😕</Text>
          <Text style={s2.emptyTxt}>{error}</Text>
        </View>
      ) : vales.length === 0 ? (
        <View style={s2.empty}>
          <Text style={s2.emptyIcon}>🧾</Text>
          <Text style={s2.emptyTxt}>Sin vales{filtro ? ` ${ESTADO_INFO[filtro]?.label.toLowerCase()}` : ''}</Text>
        </View>
      ) : (
        <FlatList
          data={vales}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Preview del comprobante */}
      {preview && (
        <Modal visible animationType="slide" transparent onRequestClose={() => setPreview(null)}>
          <View style={s2.modalOverlay}>
            <View style={s2.modalBox}>
              <View style={s2.modalHeader}>
                <Text style={s2.modalTitle}>Detalle del vale</Text>
                <TouchableOpacity onPress={() => setPreview(null)} style={{ padding: 8 }}>
                  <Text style={{ fontSize: 20, color: '#999' }}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {preview.comprobante_url && (
                  <Image source={{ uri: urlComprobante(preview.comprobante_url) }} style={s2.previewImg} resizeMode="contain" />
                )}
                <View style={s2.modalSection}>
                  <View style={s2.modalRow}><Text style={s2.modalLabel}>Monto</Text><Text style={[s2.modalValue, { color: '#e65100', fontWeight: '800' }]}>{fmt(preview.monto)}</Text></View>
                  <View style={s2.modalRow}><Text style={s2.modalLabel}>Tipo</Text><Text style={s2.modalValue}>{preview.tipo === 'vehiculo' ? `${preview.vehiculo} · ${preview.categoria_vehiculo}` : 'Consumo'}</Text></View>
                  <View style={s2.modalRow}><Text style={s2.modalLabel}>Estado</Text><Text style={[s2.modalValue, { color: (ESTADO_INFO[preview.estado]||{}).color, fontWeight: '800' }]}>{(ESTADO_INFO[preview.estado]||{}).label || preview.estado}</Text></View>
                  <View style={s2.modalRow}><Text style={s2.modalLabel}>Fecha</Text><Text style={s2.modalValue}>{preview.creado}</Text></View>
                  {preview.descripcion && <View style={s2.modalRow}><Text style={s2.modalLabel}>Descripción</Text><Text style={[s2.modalValue, { flex: 1, textAlign: 'right' }]}>{preview.descripcion}</Text></View>}
                  {preview.estado === 'rechazado' && preview.observaciones_admin && (
                    <View style={[s2.modalRow, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                      <Text style={s2.modalLabel}>Motivo del rechazo</Text>
                      <Text style={[s2.modalValue, { color: '#c62828', marginTop: 4 }]}>{preview.observaciones_admin}</Text>
                    </View>
                  )}
                  {preview.descuenta_cobro_diario === false && (
                    <Text style={{ color: '#999', fontSize: 11, marginTop: 8, fontStyle: 'italic' }}>
                      Este gasto no se descuenta de tu entrega diaria.
                    </Text>
                  )}
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = () => StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    backgroundColor: '#1565C0', flexDirection: 'row', alignItems: 'center',
    paddingTop: (StatusBar.currentHeight || 0) + 8, paddingBottom: 16, paddingHorizontal: 16, gap: 12,
  },
  backBtn:    { paddingRight: 4 },
  backArrow:  { color: '#fff', fontSize: 24 },
  headerTitle:{ color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub:  { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  addBtn:     { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  addBtnTxt:  { color: '#fff', fontWeight: '700', fontSize: 13 },

  filtrosRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  filtroChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f0f0f0', borderWidth: 1.5, borderColor: '#e0e0e0' },
  filtroChipOn: { backgroundColor: '#e3f2fd', borderColor: '#1565C0' },
  filtroTxt:   { color: '#888', fontSize: 12, fontWeight: '600' },
  filtroTxtOn: { color: '#1565C0' },

  empty:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyIcon:{ fontSize: 48, marginBottom: 12 },
  emptyTxt: { color: '#888', fontSize: 15, textAlign: 'center' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 10,
    flexDirection: 'row', overflow: 'hidden', elevation: 2,
  },
  thumb: { width: 64, height: 64 },
  cardBody: { flex: 1, padding: 12 },
  cardRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTipo: { color: '#1a1a1a', fontWeight: '700', fontSize: 13, flex: 1, marginRight: 8 },
  cardMonto:{ color: '#e65100', fontWeight: '900', fontSize: 15 },
  cardFecha:{ color: '#999', fontSize: 11 },
  badge:    { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  badgeTxt: { fontSize: 11, fontWeight: '700' },
  motivoRechazo: { color: '#c62828', fontSize: 11, marginTop: 4 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', maxHeight: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  modalTitle: { color: '#1a1a1a', fontSize: 16, fontWeight: '800' },
  previewImg: { width: '100%', height: 260, backgroundColor: '#f0f0f0' },
  modalSection: { padding: 20 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  modalLabel: { color: '#666', fontSize: 13, fontWeight: '600' },
  modalValue: { color: '#1a1a1a', fontSize: 13, fontWeight: '600' },
});
