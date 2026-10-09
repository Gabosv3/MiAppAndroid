import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api, { TIMEOUT_LECTURA_CACHE } from '../services/api';
import { useConnectivity } from '../services/connectivity';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

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

export default function AdminKPIsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isOnline } = useConnectivity();

  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!isOnline) {
      setError('Necesitás conexión a internet para ver los KPIs.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/kpis', { timeout: TIMEOUT_LECTURA_CACHE });
      setDatos(res.data);
    } catch (e) {
      setError(
        e?.response?.status === 403
          ? 'Tu cuenta no tiene permiso de super admin.'
          : 'No se pudieron cargar los KPIs.'
      );
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#5E35B1" />
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>📈 KPIs del negocio</Text>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#5E35B1" /></View>
      ) : error ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>⚠️</Text>
          <Text style={s.errorTxt}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <Text style={s.seccionTitle}>🛒 Ventas (todas las sucursales)</Text>

          <View style={s.card}>
            <Text style={s.cardTitle}>📅 Vendido esta semana</Text>
            <Text style={s.montoGrande}>{fmt(datos.vendido_semana_actual)}</Text>
            <Comparativa actual={datos.vendido_semana_actual} anterior={datos.vendido_semana_pasada} />
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>🗓️ Vendido este mes</Text>
            <Text style={s.montoGrande}>{fmt(datos.vendido_mes_actual)}</Text>
            <Comparativa actual={datos.vendido_mes_actual} anterior={datos.vendido_mes_pasado} />
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>🛍️ Ventas de hoy</Text>
            <Text style={s.montoMediano}>{datos.ventas_hoy}</Text>
            <Text style={s.cardSub}>venta{datos.ventas_hoy !== 1 ? 's' : ''} registrada{datos.ventas_hoy !== 1 ? 's' : ''}</Text>
          </View>

          <Text style={[s.seccionTitle, { marginTop: 8 }]}>💰 Cobros (todas las sucursales)</Text>

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

          <View style={s.card}>
            <Text style={s.cardTitle}>⚠️ Cartera en mora</Text>
            <Text style={[s.montoGrande, { color: datos.cuentas_en_mora > 0 ? '#e53e3e' : '#2e7d32' }]}>
              {fmt(datos.monto_en_mora)}
            </Text>
            <Text style={s.cardSub}>
              {datos.cuentas_en_mora} cuenta{datos.cuentas_en_mora !== 1 ? 's' : ''} vencida{datos.cuentas_en_mora !== 1 ? 's' : ''}
            </Text>
          </View>

          {datos.top_vendedores_mes?.length > 0 && (
            <>
              <Text style={[s.seccionTitle, { marginTop: 8 }]}>🏆 Top vendedores del mes</Text>
              <View style={s.card}>
                {datos.top_vendedores_mes.map((v, i) => (
                  <View key={i} style={s.topRow}>
                    <Text style={s.topPos}>{i + 1}.</Text>
                    <Text style={s.topNombre} numberOfLines={1}>{v.nombre}</Text>
                    <Text style={s.topMonto}>{fmt(v.total)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
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
    backgroundColor: '#5E35B1', flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 32, // paddingTop real (insets.top) se aplica inline en el render
    paddingBottom: 16, paddingHorizontal: 16,
  },
  backBtn: {},
  backArrow: { color: '#fff', fontSize: 24 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },

  seccionTitle: { fontSize: 13, fontWeight: '800', color: '#555', marginBottom: 8, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 12, elevation: 2 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#666', marginBottom: 8 },
  montoGrande: { fontSize: 28, fontWeight: '900', color: '#1a1a1a' },
  montoMediano: { fontSize: 22, fontWeight: '900', color: '#1a1a1a', marginTop: 2 },
  cardSub: { fontSize: 11, color: '#aaa', marginTop: 2 },
  compTxt: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  compNeutro: { fontSize: 12, color: '#aaa', marginTop: 8 },

  topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  topPos: { width: 22, fontSize: 13, fontWeight: '800', color: '#5E35B1' },
  topNombre: { flex: 1, fontSize: 13, color: '#333', fontWeight: '600' },
  topMonto: { fontSize: 13, fontWeight: '800', color: '#1a1a1a' },
});
