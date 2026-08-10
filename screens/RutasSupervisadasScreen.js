import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, FlatList, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { useConnectivity } from '../services/connectivity';

export default function RutasSupervisadasScreen({ navigation }) {
  const { isOnline } = useConnectivity();
  const [rutas, setRutas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!isOnline) {
      setError('Necesitás conexión a internet para ver tus rutas supervisadas.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/cobros/supervisor/rutas');
      setRutas(data.rutas || []);
    } catch (e) {
      setError(e?.response?.data?.mensaje || 'No se pudieron cargar tus rutas supervisadas.');
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const renderItem = ({ item }) => (
    <View style={s.card}>
      <View style={{ flex: 1 }}>
        <Text style={s.rutaNombre}>{item.nombre}</Text>
        <Text style={s.rutaMeta}>
          {item.dia_semana ? `${item.dia_semana} · ` : ''}{item.total_clientes} cliente{item.total_clientes !== 1 ? 's' : ''}
        </Text>
        {item.cobrador ? <Text style={s.rutaCobrador}>Cobrador titular: {item.cobrador.nombre}</Text> : <Text style={s.rutaCobrador}>Sin cobrador titular</Text>}
      </View>
      <View style={s.botonesCol}>
        <TouchableOpacity
          style={s.btnChico}
          onPress={() => navigation.navigate('HistorialRutaSupervisada', { rutaId: item.id, rutaNombre: item.nombre })}
        >
          <Text style={s.btnChicoTxt}>📋 Historial</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.btnChico, { marginTop: 6, backgroundColor: '#e8f5e9' }]}
          onPress={() => navigation.navigate('RegistrarSupervision', { rutaId: item.id, rutaNombre: item.nombre, cobradorNombre: item.cobrador?.nombre })}
        >
          <Text style={[s.btnChicoTxt, { color: '#2e7d32' }]}>📝 Evaluar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.btnChico, { marginTop: 6, backgroundColor: '#fce4ec' }]}
          onPress={() => navigation.navigate('EncuestaCliente', { rutaId: item.id, rutaNombre: item.nombre })}
        >
          <Text style={[s.btnChicoTxt, { color: '#ad1457' }]}>🔎 Encuestar cliente</Text>
        </TouchableOpacity>
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
        <Text style={s.headerTitle}>Rutas que superviso</Text>
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
          data={rutas}
          keyExtractor={r => String(r.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={{ fontSize: 44, marginBottom: 10 }}>🗺️</Text>
              <Text style={{ color: '#888' }}>Todavía no tenés rutas asignadas para supervisar.</Text>
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
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },

  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 },
  rutaNombre: { fontSize: 15, fontWeight: '800', color: '#1a1a1a' },
  rutaMeta: { fontSize: 12, color: '#888', marginTop: 3 },
  rutaCobrador: { fontSize: 12, color: '#1565C0', marginTop: 6, fontWeight: '600' },

  botonesCol: { justifyContent: 'center' },
  btnChico: { backgroundColor: '#e3f2fd', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  btnChicoTxt: { color: '#1565C0', fontWeight: '700', fontSize: 12 },
});
