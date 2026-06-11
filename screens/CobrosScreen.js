import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function CobrosScreen({ navigation }) {
  const { colors } = useTheme();
  const [rutas, setRutas] = useState([]);
  const [dia, setDia] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const cargarRuta = useCallback(async () => {
    try {
      setError('');
      const { data } = await api.get('/cobros/ruta-hoy');
      setDia(data.dia || '');
      setRutas(data.rutas || []);
    } catch (e) {
      setError(e?.message || 'Error cargando ruta');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    cargarRuta();
  }, [cargarRuta]));

  const onRefresh = () => {
    setRefreshing(true);
    cargarRuta();
  };

  const s = styles(colors);
  const totalClientes = rutas.reduce((s, r) => s + (r.total_clientes || 0), 0);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Cobros</Text>
          <Text style={s.headerSub}>Ruta de hoy · {dia}</Text>
        </View>
        <View style={s.headerChips}>
          <View style={s.chip}>
            <Text style={s.chipTxt}>📍 {rutas.length} ruta{rutas.length !== 1 ? 's' : ''}</Text>
          </View>
          <View style={s.chip}>
            <Text style={s.chipTxt}>👥 {totalClientes} clientes</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator color="#1565C0" size="large" />
          <Text style={{ color: colors.textMuted, marginTop: 12 }}>Cargando ruta...</Text>
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Text style={{ fontSize: 32 }}>😕</Text>
          <Text style={{ color: colors.text, marginTop: 8, fontWeight: '600' }}>Sin ruta disponible</Text>
          <Text style={{ color: colors.textMuted, marginTop: 4, textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); cargarRuta(); }}>
            <Text style={s.retryTxt}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
          showsVerticalScrollIndicator={false}
        >
          {rutas.map(ruta => (
            <View key={ruta.id}>
              {/* Ruta card */}
              <TouchableOpacity style={s.rutaCard} activeOpacity={0.85}>
                <View style={s.rutaIcon}>
                  <Text style={{ fontSize: 24 }}>🗺️</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rutaNombre}>{ruta.nombre}</Text>
                  <Text style={s.rutaSub}>Total clientes: {ruta.total_clientes}</Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
              </TouchableOpacity>

              {/* Clientes */}
              {(ruta.clientes || []).map(cliente => {
                const totalVentas = cliente.ventas?.length || 0;
                const totalVencidas = cliente.ventas?.reduce((s, v) => s + (v.cuotas_vencidas || 0), 0) || 0;
                return (
                  <View key={cliente.id} style={s.clienteCard}>
                    <View style={s.clienteHeader}>
                      <View style={[s.avatar, { backgroundColor: getAvatarColor(cliente.nombre) }]}>
                        <Text style={s.avatarTxt}>{cliente.nombre?.charAt(0)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.clienteNombre}>{cliente.nombre}</Text>
                        <Text style={s.clienteSub}>Código: {cliente.codigo_anterior} · Tel: {cliente.telefono}</Text>
                      </View>
                      <TouchableOpacity>
                        <Text style={{ fontSize: 20, color: colors.textMuted }}>⋮</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={s.clienteStats}>
                      <View style={s.statBox}>
                        <Text style={s.statLabel}>Saldo total</Text>
                        <Text style={[s.statVal, { color: '#e53e3e' }]}>{fmt(cliente.saldo_total)}</Text>
                      </View>
                      <View style={s.statBox}>
                        <Text style={s.statLabel}>Cuotas vencidas</Text>
                        <Text style={[s.statVal, { color: '#F5A623' }]}>{cliente.cuotas_vencidas}</Text>
                      </View>
                      <View style={s.statBox}>
                        <Text style={s.statLabel}>Para estar al día</Text>
                        <Text style={[s.statVal, { color: '#F5A623' }]}>{fmt(cliente.para_estar_al_dia)}</Text>
                      </View>
                    </View>

                    <View style={s.clienteBadges}>
                      {totalVentas > 0 && (
                        <View style={[s.badge, { backgroundColor: '#e3f2fd' }]}>
                          <Text style={[s.badgeTxt, { color: '#1565C0' }]}>🗓 {totalVentas} venta{totalVentas !== 1 ? 's' : ''} activa{totalVentas !== 1 ? 's' : ''}</Text>
                        </View>
                      )}
                      {totalVencidas > 0 && (
                        <View style={[s.badge, { backgroundColor: '#fce4ec' }]}>
                          <Text style={[s.badgeTxt, { color: '#c62828' }]}>⚠️ {totalVencidas} vencida{totalVencidas !== 1 ? 's' : ''}</Text>
                        </View>
                      )}
                    </View>

                    <View style={s.clienteBtns}>
                      <TouchableOpacity
                        style={s.btnDetalle}
                        onPress={() => navigation.navigate('DetalleCliente', { clienteId: cliente.id, clienteNombre: cliente.nombre })}
                      >
                        <Text style={s.btnDetalleTxt}>Ver detalle</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.btnCobrar}
                        onPress={() => navigation.navigate('RegistrarPago', { cliente, ventaId: null })}
                      >
                        <Text style={s.btnCobrarTxt}>Cobrar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const getAvatarColor = (name) => {
  const colors = ['#e57373', '#81c784', '#64b5f6', '#ffb74d', '#ba68c8', '#4dd0e1'];
  const idx = (name?.charCodeAt(0) || 0) % colors.length;
  return colors[idx];
};

const styles = (c) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    backgroundColor: '#1565C0',
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 12 : 44,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerTitle: { color: '#fff', fontSize: 28, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2, textTransform: 'capitalize' },
  headerChips: { flexDirection: 'row', gap: 8, marginTop: 12 },
  chip: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 },
  chipTxt: { color: '#fff', fontSize: 12, fontWeight: '600' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  retryBtn: { marginTop: 16, backgroundColor: '#1565C0', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 },
  retryTxt: { color: '#fff', fontWeight: '700' },
  rutaCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: c.card,
    margin: 12, marginBottom: 4, borderRadius: 12, padding: 14,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08,
  },
  rutaIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e3f2fd', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rutaNombre: { color: c.text, fontSize: 15, fontWeight: '700' },
  rutaSub: { color: c.textMuted, fontSize: 13, marginTop: 2 },
  clienteCard: {
    backgroundColor: c.card, marginHorizontal: 12, marginTop: 8, borderRadius: 12, padding: 14,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08,
  },
  clienteHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  clienteNombre: { color: c.text, fontSize: 15, fontWeight: '700' },
  clienteSub: { color: c.textMuted, fontSize: 12, marginTop: 2 },
  clienteStats: { flexDirection: 'row', backgroundColor: c.surfaceAlt || '#f8f9fa', borderRadius: 8, padding: 10, marginBottom: 10, gap: 8 },
  statBox: { flex: 1, alignItems: 'center' },
  statLabel: { color: c.textMuted, fontSize: 11, marginBottom: 4, textAlign: 'center' },
  statVal: { fontSize: 13, fontWeight: '700' },
  clienteBadges: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  badge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeTxt: { fontSize: 11, fontWeight: '600' },
  clienteBtns: { flexDirection: 'row', gap: 8 },
  btnDetalle: { flex: 1, borderRadius: 8, paddingVertical: 10, borderWidth: 1.5, borderColor: '#1565C0', alignItems: 'center' },
  btnDetalleTxt: { color: '#1565C0', fontWeight: '700', fontSize: 13 },
  btnCobrar: { flex: 1, borderRadius: 8, paddingVertical: 10, backgroundColor: '#1565C0', alignItems: 'center' },
  btnCobrarTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
