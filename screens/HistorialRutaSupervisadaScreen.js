import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { useConnectivity } from '../services/connectivity';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function HistorialRutaSupervisadaScreen({ route, navigation }) {
  const { rutaId, rutaNombre } = route.params;
  const { isOnline } = useConnectivity();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!isOnline) {
      setError('Necesitás conexión a internet para ver el historial.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data: resp } = await api.get(`/cobros/supervisor/rutas/${rutaId}/historial`);
      setData(resp);
    } catch (e) {
      setError(e?.response?.data?.mensaje || 'No se pudo cargar el historial de la ruta.');
    } finally {
      setLoading(false);
    }
  }, [isOnline, rutaId]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const items = data ? [
    ...(data.pagos || []).map(p => ({ ...p, _key: `pago-${p.numero_recibo}-${p.hora}` })),
    ...(data.visitas || []).map(v => ({ ...v, _key: `visita-${v.cliente}-${v.hora}` })),
  ].sort((a, b) => a.hora.localeCompare(b.hora)) : [];

  const renderItem = ({ item }) => (
    <View style={s.card}>
      <View style={{ flex: 1 }}>
        <Text style={s.itemCliente}>{item.tipo === 'pago' ? '💵' : '🚶'} {item.cliente}</Text>
        <Text style={s.itemMeta}>
          {item.tipo === 'pago' ? `${item.metodo_pago} · ${item.numero_recibo || ''}` : item.resultado}
          {' · '}Cobrador: {item.cobrador || 'N/A'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {item.tipo === 'pago' && <Text style={s.itemMonto}>{fmt(item.monto)}</Text>}
        <Text style={s.itemHora}>{item.hora}</Text>
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{rutaNombre}</Text>
          <Text style={s.headerSub}>Historial de hoy</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#1565C0" /></View>
      ) : error ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>⚠️</Text>
          <Text style={s.errorTxt}>{error}</Text>
        </View>
      ) : (
        <>
          <View style={s.totalCard}>
            <Text style={s.totalLabel}>Total cobrado hoy en esta ruta</Text>
            <Text style={s.totalVal}>{fmt(data?.total_cobrado)}</Text>
          </View>
          <FlatList
            data={items}
            keyExtractor={i => i._key}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.center}>
                <Text style={{ fontSize: 44, marginBottom: 10 }}>📋</Text>
                <Text style={{ color: '#888' }}>Sin cobros ni visitas registradas hoy en esta ruta.</Text>
              </View>
            }
          />
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f6fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingTop: 40 },
  errorTxt: { color: '#888', textAlign: 'center', fontSize: 13 },
  header: {
    backgroundColor: '#1565C0', flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: (StatusBar.currentHeight || 0) + 8, paddingBottom: 16, paddingHorizontal: 16,
  },
  backBtn: {},
  backArrow: { color: '#fff', fontSize: 24 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },

  totalCard: { backgroundColor: '#1565C0', margin: 16, marginBottom: 4, borderRadius: 14, padding: 16 },
  totalLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  totalVal: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 2 },

  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, elevation: 1 },
  itemCliente: { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  itemMeta: { fontSize: 11, color: '#888', marginTop: 3 },
  itemMonto: { fontSize: 14, fontWeight: '800', color: '#2e7d32' },
  itemHora: { fontSize: 11, color: '#aaa', marginTop: 2 },
});
