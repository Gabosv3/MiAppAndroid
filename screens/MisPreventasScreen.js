import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { useConnectivity } from '../services/connectivity';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const ESTADO_INFO = {
  pendiente:  { label: 'Pendiente',  color: '#e65100', bg: '#fff3e0' },
  convertida: { label: 'Convertida', color: '#2e7d32', bg: '#e8f5e9' },
  rechazada:  { label: 'Rechazada',  color: '#c62828', bg: '#ffebee' },
};

const FILTROS = [
  { value: null,        label: 'Todas' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'convertida',label: 'Convertidas' },
  { value: 'rechazada', label: 'Rechazadas' },
];

export default function MisPreventasScreen({ navigation }) {
  const { isOnline } = useConnectivity();
  const [preventas, setPreventas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState(null);
  const [selected, setSelected] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = filtro ? { estado: filtro } : {};
      const { data } = await api.get('/preventas', { params });
      setPreventas(Array.isArray(data) ? data : (data.data || []));
    } catch (e) {
      setError(isOnline ? (e?.message || 'No se pudieron cargar las preventas.') : 'Sin conexión — necesitas internet para ver tus preventas.');
    } finally {
      setLoading(false);
    }
  }, [filtro, isOnline]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const renderItem = ({ item }) => {
    const est = ESTADO_INFO[item.estado] || { label: item.estado, color: '#666', bg: '#f5f5f5' };
    return (
      <TouchableOpacity style={s.card} onPress={() => setSelected(item)} activeOpacity={0.8}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardNombre}>{item.cliente?.nombre || 'Cliente'}</Text>
          <Text style={s.cardMeta}>
            {(item.productos || []).length} producto{(item.productos || []).length !== 1 ? 's' : ''} · {item.fecha}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.cardMonto}>{fmt(item.monto_estimado)}</Text>
          <View style={[s.badge, { backgroundColor: est.bg }]}>
            <Text style={[s.badgeTxt, { color: est.color }]}>{est.label}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Mis preventas</Text>
          <Text style={s.headerSub}>{preventas.length} preventa{preventas.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => navigation.navigate('RegistrarPreventa')}>
          <Text style={s.addBtnTxt}>+ Nueva</Text>
        </TouchableOpacity>
      </View>

      <View style={s.filtrosRow}>
        {FILTROS.map(f => (
          <TouchableOpacity
            key={f.label}
            style={[s.filtroChip, filtro === f.value && s.filtroChipOn]}
            onPress={() => setFiltro(f.value)}
          >
            <Text style={[s.filtroTxt, filtro === f.value && s.filtroTxtOn]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color="#1565C0" style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>😕</Text>
          <Text style={s.emptyTxt}>{error}</Text>
        </View>
      ) : preventas.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📝</Text>
          <Text style={s.emptyTxt}>Sin preventas{filtro ? ` ${ESTADO_INFO[filtro]?.label.toLowerCase()}` : ''}</Text>
        </View>
      ) : (
        <FlatList
          data={preventas}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {selected && (
        <Modal visible animationType="slide" transparent onRequestClose={() => setSelected(null)}>
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Detalle de preventa</Text>
                <TouchableOpacity onPress={() => setSelected(null)} style={{ padding: 8 }}>
                  <Text style={{ fontSize: 20, color: '#999' }}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
                <View style={s.modalRow}><Text style={s.modalLabel}>Cliente</Text><Text style={s.modalValue}>{selected.cliente?.nombre}</Text></View>
                <View style={s.modalRow}><Text style={s.modalLabel}>Estado</Text><Text style={[s.modalValue, { color: (ESTADO_INFO[selected.estado] || {}).color, fontWeight: '800' }]}>{(ESTADO_INFO[selected.estado] || {}).label || selected.estado}</Text></View>
                <View style={s.modalRow}><Text style={s.modalLabel}>Fecha</Text><Text style={s.modalValue}>{selected.fecha}</Text></View>
                {selected.vendedor ? (
                  <View style={s.modalRow}><Text style={s.modalLabel}>Vendedor asignado</Text><Text style={s.modalValue}>{selected.vendedor.nombre}</Text></View>
                ) : null}
                {selected.observaciones ? (
                  <View style={s.modalRow}><Text style={s.modalLabel}>Observaciones</Text><Text style={[s.modalValue, { flex: 1, textAlign: 'right' }]}>{selected.observaciones}</Text></View>
                ) : null}

                <Text style={[s.modalLabel, { marginTop: 16, marginBottom: 8 }]}>Productos</Text>
                {(selected.productos || []).map((p, i) => (
                  <View key={i} style={s.productoRow}>
                    <Text style={{ flex: 1, color: '#1a1a1a', fontSize: 13 }}>{p.nombre} x{p.cantidad}</Text>
                    <Text style={{ color: '#1a1a1a', fontWeight: '700', fontSize: 13 }}>{fmt(p.subtotal)}</Text>
                  </View>
                ))}
                <View style={[s.modalRow, { marginTop: 8 }]}>
                  <Text style={[s.modalLabel, { fontWeight: '800' }]}>Monto estimado</Text>
                  <Text style={[s.modalValue, { color: '#1565C0', fontWeight: '800' }]}>{fmt(selected.monto_estimado)}</Text>
                </View>
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    backgroundColor: '#1565C0', flexDirection: 'row', alignItems: 'center',
    paddingTop: (StatusBar.currentHeight || 0) + 8, paddingBottom: 16, paddingHorizontal: 16, gap: 12,
  },
  backBtn: { paddingRight: 4 },
  backArrow: { color: '#fff', fontSize: 24 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  addBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  addBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },

  filtrosRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  filtroChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f0f0f0', borderWidth: 1.5, borderColor: '#e0e0e0' },
  filtroChipOn: { backgroundColor: '#e3f2fd', borderColor: '#1565C0' },
  filtroTxt: { color: '#888', fontSize: 12, fontWeight: '600' },
  filtroTxtOn: { color: '#1565C0' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTxt: { color: '#888', fontSize: 15, textAlign: 'center' },

  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, elevation: 2 },
  cardNombre: { color: '#1a1a1a', fontWeight: '700', fontSize: 14 },
  cardMeta: { color: '#888', fontSize: 11, marginTop: 3 },
  cardMonto: { color: '#1565C0', fontWeight: '900', fontSize: 15 },
  badge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 },
  badgeTxt: { fontSize: 11, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', maxHeight: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  modalTitle: { color: '#1a1a1a', fontSize: 16, fontWeight: '800' },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  modalLabel: { color: '#666', fontSize: 13, fontWeight: '600' },
  modalValue: { color: '#1a1a1a', fontSize: 13, fontWeight: '600' },
  productoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f8f8f8' },
});
