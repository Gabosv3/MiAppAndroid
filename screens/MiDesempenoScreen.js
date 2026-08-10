import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { useConnectivity } from '../services/connectivity';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

// Compara contra el período anterior — flecha verde si subió, roja si bajó,
// gris si se mantuvo. Sin porcentajes engañosos cuando el período anterior
// fue $0 (evita "∞%" o divisiones raras).
const Comparativa = ({ actual, anterior }) => {
  if (anterior <= 0) {
    return actual > 0 ? <Text style={s.compNeutro}>Sin dato del período anterior</Text> : null;
  }
  const delta = actual - anterior;
  const pct = Math.round((delta / anterior) * 100);
  if (pct === 0) return <Text style={s.compNeutro}>Igual que el período anterior</Text>;
  const subio = pct > 0;
  return (
    <Text style={[s.compTxt, { color: subio ? '#2e7d32' : '#e53e3e' }]}>
      {subio ? '▲' : '▼'} {Math.abs(pct)}% vs. período anterior
    </Text>
  );
};

export default function MiDesempenoScreen({ navigation }) {
  const { isOnline } = useConnectivity();
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!isOnline) {
      setError('Necesitás conexión a internet para ver tu desempeño.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/cobros/desempeno');
      setDatos(data);
    } catch (e) {
      setError(e?.response?.data?.mensaje || 'No se pudo cargar tu desempeño.');
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Mi desempeño</Text>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#1565C0" /></View>
      ) : error ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>⚠️</Text>
          <Text style={s.errorTxt}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={s.card}>
            <Text style={s.cardTitle}>📅 Cobrado esta semana</Text>
            <Text style={s.montoGrande}>{fmt(datos.cobrado_semana_actual)}</Text>
            <Comparativa actual={datos.cobrado_semana_actual} anterior={datos.cobrado_semana_pasada} />
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>🗓️ Cobrado este mes</Text>
            <Text style={s.montoGrande}>{fmt(datos.cobrado_mes_actual)}</Text>
            <Comparativa actual={datos.cobrado_mes_actual} anterior={datos.cobrado_mes_pasado} />
          </View>

          <View style={s.row}>
            <View style={[s.card, s.cardMitad]}>
              <Text style={s.cardTitle}>🚶 Ruta de hoy</Text>
              <Text style={s.montoMediano}>
                {datos.gestionados_hoy}/{datos.clientes_ruta_hoy}
              </Text>
              <Text style={s.cardSub}>cuentas gestionadas</Text>
            </View>
            <View style={[s.card, s.cardMitad]}>
              <Text style={s.cardTitle}>⚠️ En mora</Text>
              <Text style={[s.montoMediano, { color: datos.cuentas_en_mora > 0 ? '#e53e3e' : '#2e7d32' }]}>
                {datos.cuentas_en_mora}
              </Text>
              <Text style={s.cardSub}>cuenta{datos.cuentas_en_mora !== 1 ? 's' : ''} con mora</Text>
            </View>
          </View>
        </ScrollView>
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

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 12, elevation: 2 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#666', marginBottom: 8 },
  montoGrande: { fontSize: 28, fontWeight: '900', color: '#1a1a1a' },
  montoMediano: { fontSize: 22, fontWeight: '900', color: '#1a1a1a', marginTop: 2 },
  cardSub: { fontSize: 11, color: '#aaa', marginTop: 2 },
  compTxt: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  compNeutro: { fontSize: 12, color: '#aaa', marginTop: 8 },

  row: { flexDirection: 'row', gap: 12 },
  cardMitad: { flex: 1 },
});
