import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  FlatList, ActivityIndicator, Alert, Modal, TextInput, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const ESTADO_CFG = {
  pendiente:      { label: 'Pendiente',      color: '#F5A623', bg: '#fff8e1' },
  en_proceso:     { label: 'En proceso',     color: '#1565C0', bg: '#e3f2fd' },
  recuperado:     { label: 'Recuperado',     color: '#2e7d32', bg: '#e8f5e9' },
  no_recuperado:  { label: 'No recuperado',  color: '#c62828', bg: '#ffebee' },
};

const ACCIONES = [
  { estado: 'en_proceso',    label: '🚗 Marcar en proceso' },
  { estado: 'recuperado',    label: '✅ Productos recuperados' },
  { estado: 'no_recuperado', label: '❌ No se pudo recuperar' },
];

export default function ReintegrosScreen({ navigation }) {
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filtro,     setFiltro]     = useState('pendiente');
  const [modal,      setModal]      = useState(null); // { reintegro }
  const [obs,        setObs]        = useState('');
  const [saving,     setSaving]     = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/reintegros', { params: { estado: filtro, per_page: 50 } });
      setItems(data.data || []);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudieron cargar los reintegros');
    } finally {
      setLoading(false);
    }
  }, [filtro]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const actualizarEstado = async (reintegroId, estado) => {
    setSaving(true);
    try {
      await api.patch(`/reintegros/${reintegroId}/estado`, {
        estado,
        ...(obs.trim() && { observaciones: obs.trim() }),
      });
      setModal(null);
      setObs('');
      await cargar();
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo actualizar');
    } finally {
      setSaving(false);
    }
  };

  const abrirModal = (reintegro) => {
    setObs(reintegro.observaciones || '');
    setModal(reintegro);
  };

  const renderItem = ({ item }) => {
    const cfg = ESTADO_CFG[item.estado] || ESTADO_CFG.pendiente;
    return (
      <TouchableOpacity style={s.card} onPress={() => abrirModal(item)} activeOpacity={0.8}>
        <View style={s.cardHeader}>
          <Text style={s.cardNombre} numberOfLines={1}>{item.cliente?.nombre}</Text>
          <View style={[s.estadoBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[s.estadoTxt, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>

        <View style={s.cardRow}>
          <Text style={s.cardMeta}>📦 {item.venta?.numero_venta || 'N/A'}</Text>
          <Text style={s.cardMeta}>DUI: {item.cliente?.dui || '—'}</Text>
        </View>

        {item.cliente?.telefono && (
          <Text style={s.cardMeta}>📞 {item.cliente.telefono}</Text>
        )}

        <View style={s.cardRow}>
          <Text style={s.cardDeuda}>Adeudado: <Text style={{ color: '#c62828' }}>{fmt(item.monto_adeudado)}</Text></Text>
          <Text style={s.cardMeta}>⚠️ {item.cuotas_vencidas} cuotas</Text>
        </View>

        {item.motivo ? (
          <Text style={s.cardMotivo} numberOfLines={2}>📝 {item.motivo}</Text>
        ) : null}

        <Text style={s.cardTap}>Toca para actualizar estado →</Text>
      </TouchableOpacity>
    );
  };

  const filtros = Object.entries(ESTADO_CFG);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#B71C1C"/>

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Reintegros</Text>
          <Text style={s.headerSub}>Recuperación de productos</Text>
        </View>
      </View>

      {/* Filtros de estado */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filtrosRow} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
        {filtros.map(([key, cfg]) => (
          <TouchableOpacity
            key={key}
            style={[s.filtroBtn, filtro === key && { backgroundColor: cfg.color }]}
            onPress={() => setFiltro(key)}
          >
            <Text style={[s.filtroTxt, filtro === key && { color: '#fff' }]}>{cfg.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color="#B71C1C" style={{ marginTop: 40 }}/>
      ) : items.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📦</Text>
          <Text style={s.emptyTxt}>Sin reintegros {ESTADO_CFG[filtro]?.label.toLowerCase()}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          onRefresh={cargar}
          refreshing={loading}
        />
      )}

      {/* Modal actualizar estado */}
      <Modal visible={!!modal} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>{modal?.cliente?.nombre}</Text>
            <Text style={s.modalSub}>{modal?.venta?.numero_venta} · {fmt(modal?.monto_adeudado)} adeudado</Text>

            <Text style={s.modalLabel}>Observaciones (opcional)</Text>
            <TextInput
              style={s.modalInput}
              value={obs}
              onChangeText={setObs}
              placeholder="Ej: Cliente no estaba, productos en buen estado..."
              multiline
              numberOfLines={3}
            />

            <Text style={s.modalLabel}>Actualizar estado</Text>
            {ACCIONES
              .filter(a => {
                if (modal?.estado === 'recuperado' || modal?.estado === 'no_recuperado') return false;
                if (modal?.estado === 'en_proceso' && a.estado === 'en_proceso') return false;
                return true;
              })
              .map(a => (
              <TouchableOpacity
                key={a.estado}
                style={[s.accionBtn, saving && { opacity: 0.5 }]}
                onPress={() => actualizarEstado(modal.id, a.estado)}
                disabled={saving}
              >
                <Text style={s.accionTxt}>{a.label}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={s.cancelBtn} onPress={() => { setModal(null); setObs(''); }}>
              <Text style={s.cancelTxt}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    backgroundColor: '#B71C1C',
    paddingTop: (StatusBar.currentHeight || 0) + 10,
    paddingBottom: 16, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  backBtn: { paddingRight: 4 },
  backTxt: { color: '#fff', fontSize: 24, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSub:   { color: 'rgba(255,255,255,0.75)', fontSize: 12 },

  filtrosRow: { maxHeight: 52, paddingVertical: 8 },
  filtroBtn:  { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
                backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  filtroTxt:  { fontSize: 13, fontWeight: '600', color: '#555' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 10, elevation: 2,
  },
  cardHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardNombre:  { fontSize: 15, fontWeight: '800', color: '#1a1a1a', flex: 1, marginRight: 8 },
  estadoBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  estadoTxt:   { fontSize: 12, fontWeight: '700' },
  cardRow:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  cardMeta:    { color: '#666', fontSize: 12, marginTop: 2 },
  cardDeuda:   { fontSize: 13, fontWeight: '600', color: '#333', marginTop: 4 },
  cardMotivo:  { color: '#888', fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  cardTap:     { color: '#B71C1C', fontSize: 11, marginTop: 8, textAlign: 'right', fontWeight: '600' },

  empty:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon:{ fontSize: 48, marginBottom: 12 },
  emptyTxt: { color: '#888', fontSize: 15 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 36,
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#1a1a1a', marginBottom: 2 },
  modalSub:   { color: '#888', fontSize: 13, marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '700', color: '#555', marginBottom: 6, marginTop: 12 },
  modalInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    padding: 10, fontSize: 13, color: '#333',
    minHeight: 70, textAlignVertical: 'top',
  },
  accionBtn: {
    backgroundColor: '#1a1a1a', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  accionTxt:  { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelBtn:  { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
  cancelTxt:  { color: '#999', fontSize: 14 },
});
