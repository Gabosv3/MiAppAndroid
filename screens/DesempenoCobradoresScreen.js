import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { useConnectivity } from '../services/connectivity';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function DesempenoCobradoresScreen({ navigation }) {
  const { isOnline } = useConnectivity();
  const [cobradores, setCobradores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!isOnline) {
      setError('Necesitás conexión a internet para ver el desempeño.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/cobros/supervisor/desempeno-cobradores');
      setCobradores(data.cobradores || []);
    } catch (e) {
      setError(e?.response?.data?.mensaje || 'No se pudo cargar el desempeño.');
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const renderItem = ({ item }) => (
    <View style={s.card}>
      <Text style={s.nombre}>{item.nombre}</Text>
      <View style={s.filasRow}>
        <View style={s.fila}>
          <Text style={s.filaLabel}>Hoy</Text>
          <Text style={s.filaVal}>{fmt(item.cobrado_hoy)}</Text>
        </View>
        <View style={s.fila}>
          <Text style={s.filaLabel}>Esta semana</Text>
          <Text style={s.filaVal}>{fmt(item.cobrado_semana)}</Text>
        </View>
        <View style={s.fila}>
          <Text style={s.filaLabel}>En mora</Text>
          <Text style={[s.filaVal, { color: item.cuentas_en_mora > 0 ? '#e53e3e' : '#2e7d32' }]}>{item.cuentas_en_mora}</Text>
        </View>
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
        <Text style={s.headerTitle}>Desempeño de mis cobradores</Text>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#1565C0" /></View>
      ) : error ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>⚠️</Text>
          <Text style={s.errorTxt}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={cobradores}
          keyExtractor={c => String(c.cobrador_id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={{ fontSize: 44, marginBottom: 10 }}>👥</Text>
              <Text style={{ color: '#888' }}>Sin cobradores en tus rutas supervisadas todavía.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f6fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  errorTxt: { color: '#888', textAlign: 'center', fontSize: 13 },
  header: {
    backgroundColor: '#1565C0', flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: (StatusBar.currentHeight || 0) + 8, paddingBottom: 16, paddingHorizontal: 16,
  },
  backBtn: {},
  backArrow: { color: '#fff', fontSize: 24 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 },
  nombre: { fontSize: 15, fontWeight: '800', color: '#1a1a1a', marginBottom: 10 },
  filasRow: { flexDirection: 'row', justifyContent: 'space-between' },
  fila: { alignItems: 'center', flex: 1 },
  filaLabel: { fontSize: 11, color: '#888', marginBottom: 3 },
  filaVal: { fontSize: 15, fontWeight: '800', color: '#1a1a1a' },
});
