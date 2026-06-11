import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const getInitials = (name = '') => name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

export default function DetalleClienteScreen({ navigation, route }) {
  const { clienteId, clienteNombre } = route.params;
  const { colors } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      setError('');
      const res = await api.get(`/cobros/clientes/${clienteId}`);
      setData(res.data);
    } catch (e) {
      setError(e?.message || 'Error cargando cliente');
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    cargar();
  }, [cargar]));

  const s = styles(colors);
  const cliente = data?.cliente;
  const resumen = data?.resumen;
  const ventas = data?.ventas || [];

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>Detalle del cliente</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {cliente?.telefono && (
              <TouchableOpacity style={s.headerAction} onPress={() => Linking.openURL(`tel:${cliente.telefono}`)}>
                <Text style={{ fontSize: 16 }}>📞</Text>
              </TouchableOpacity>
            )}
            {cliente?.whatsapp && (
              <TouchableOpacity style={s.headerAction} onPress={() => Linking.openURL(`https://wa.me/503${cliente.whatsapp}`)}>
                <Text style={{ fontSize: 16 }}>💬</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator color="#1565C0" size="large" /><Text style={{ color: colors.textMuted, marginTop: 12 }}>Cargando...</Text></View>
      ) : error ? (
        <View style={s.centered}>
          <Text style={{ fontSize: 36, marginBottom: 10 }}>😕</Text>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); cargar(); }}>
            <Text style={s.retryTxt}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Hero card cliente */}
          <View style={s.heroCard}>
            <View style={s.heroAvatar}>
              <Text style={s.heroAvatarTxt}>{getInitials(cliente?.nombre)}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={s.heroNombre}>{cliente?.nombre}</Text>
              {cliente?.dui ? <Text style={s.heroInfo}>🪪 DUI: {cliente.dui}</Text> : null}
              {cliente?.telefono ? <Text style={s.heroInfo}>📞 {cliente.telefono}</Text> : null}
              {cliente?.direccion ? <Text style={s.heroInfo}>📍 {cliente.direccion}</Text> : null}
              {cliente?.ruta ? <Text style={s.heroInfo}>🗺️ {cliente.ruta}</Text> : null}
            </View>
            <View style={s.saldoBadge}>
              <Text style={s.saldoLabel}>SALDO</Text>
              <Text style={s.saldoVal}>{fmt(cliente?.saldo_total)}</Text>
            </View>
          </View>

          {/* Resumen stats */}
          <View style={s.statsGrid}>
            <View style={[s.statsCard, { borderLeftColor: '#1565C0' }]}>
              <Text style={s.statsIcon}>🛍️</Text>
              <Text style={[s.statsVal, { color: '#1565C0' }]}>{resumen?.total_ventas}</Text>
              <Text style={s.statsLabel}>Ventas activas</Text>
            </View>
            <View style={[s.statsCard, { borderLeftColor: '#F5A623' }]}>
              <Text style={s.statsIcon}>⏳</Text>
              <Text style={[s.statsVal, { color: '#F5A623' }]}>{resumen?.cuotas_pendientes}</Text>
              <Text style={s.statsLabel}>Cuotas pendientes</Text>
            </View>
            <View style={[s.statsCard, { borderLeftColor: '#e53e3e' }]}>
              <Text style={s.statsIcon}>⚠️</Text>
              <Text style={[s.statsVal, { color: '#e53e3e' }]}>{resumen?.cuotas_vencidas}</Text>
              <Text style={s.statsLabel}>Cuotas vencidas</Text>
            </View>
          </View>

          {/* Ventas activas */}
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Ventas activas</Text>
            <Text style={s.sectionCount}>{ventas.length}</Text>
          </View>

          {ventas.map(venta => (
            <View key={venta.id} style={s.ventaCard}>
              {/* Venta header */}
              <View style={s.ventaTop}>
                <View style={s.ventaIconWrap}>
                  <Text style={{ fontSize: 18 }}>📋</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={s.ventaNum}>{venta.numero_venta}</Text>
                  <Text style={s.ventaFecha}>Fecha: {venta.fecha_venta}</Text>
                </View>
                <View style={[s.estadoBadge, venta.estado === 'activa' && s.estadoActiva]}>
                  <Text style={[s.estadoTxt, venta.estado === 'activa' && { color: '#2e7d32' }]}>{venta.estado}</Text>
                </View>
              </View>

              {/* Progress bar */}
              <View style={s.progressWrap}>
                <View style={s.progressBg}>
                  <View style={[s.progressFill, {
                    width: `${Math.min(100, (venta.monto_pagado / venta.total) * 100)}%`
                  }]} />
                </View>
                <Text style={s.progressTxt}>{Math.round((venta.monto_pagado / venta.total) * 100)}%</Text>
              </View>

              {/* Montos */}
              <View style={s.montosRow}>
                <View style={s.montoBox}>
                  <Text style={s.montoLabel}>Total</Text>
                  <Text style={[s.montoVal, { color: '#1565C0' }]}>{fmt(venta.total)}</Text>
                </View>
                <View style={s.montoBox}>
                  <Text style={s.montoLabel}>Pagado</Text>
                  <Text style={[s.montoVal, { color: '#2e7d32' }]}>{fmt(venta.monto_pagado)}</Text>
                </View>
                <View style={s.montoBox}>
                  <Text style={s.montoLabel}>Pendiente</Text>
                  <Text style={[s.montoVal, { color: '#F5A623' }]}>{fmt(venta.saldo_pendiente)}</Text>
                </View>
              </View>

              {/* Badges cuotas */}
              <View style={s.cuotasBadges}>
                <View style={s.infoPill}>
                  <Text style={s.infoPillTxt}>🪙 {venta.resumen?.total_cuotas} cuotas</Text>
                </View>
                {venta.resumen?.pendientes > 0 && (
                  <View style={[s.infoPill, { backgroundColor: '#fff8e1' }]}>
                    <Text style={[s.infoPillTxt, { color: '#f57f17' }]}>⏳ {venta.resumen.pendientes} pend.</Text>
                  </View>
                )}
                {venta.resumen?.vencidas > 0 && (
                  <View style={[s.infoPill, { backgroundColor: '#fce4ec' }]}>
                    <Text style={[s.infoPillTxt, { color: '#c62828' }]}>⚠️ {venta.resumen.vencidas} venc.</Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={s.cobrarVentaBtn}
                onPress={() => navigation.navigate('RegistrarPago', {
                  cliente: { id: clienteId, nombre: cliente?.nombre, ...cliente },
                  ventaId: venta.id,
                  ventaNumero: venta.numero_venta,
                  saldoPendiente: venta.saldo_pendiente,
                  cuotasVencidas: venta.resumen?.vencidas || 0,
                })}
              >
                <Text style={s.cobrarVentaTxt}>💰 Cobrar esta venta</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Gestiones pendientes link */}
          <TouchableOpacity style={s.gestionesCard}>
            <View style={s.gestionesLeft}>
              <Text style={{ fontSize: 20 }}>📋</Text>
              <Text style={s.gestionesTxt}>Ver gestiones pendientes</Text>
            </View>
            <Text style={{ color: '#1565C0', fontSize: 20 }}>›</Text>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = (c) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: {
    backgroundColor: '#1565C0',
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 6 : 44,
    paddingBottom: 14, paddingHorizontal: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { marginRight: 12 },
  backIcon: { color: '#fff', fontSize: 22 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 },
  headerAction: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  retryBtn: { marginTop: 14, backgroundColor: '#1565C0', borderRadius: 10, paddingHorizontal: 28, paddingVertical: 12 },
  retryTxt: { color: '#fff', fontWeight: '700' },
  heroCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: c.card, margin: 12, borderRadius: 14, padding: 16, elevation: 3,
  },
  heroAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center' },
  heroAvatarTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },
  heroNombre: { color: c.text, fontSize: 16, fontWeight: '800', marginBottom: 5 },
  heroInfo: { color: c.textMuted, fontSize: 12, marginBottom: 2 },
  saldoBadge: { alignItems: 'flex-end' },
  saldoLabel: { color: c.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  saldoVal: { color: '#e53e3e', fontSize: 18, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', marginHorizontal: 12, gap: 8, marginBottom: 4 },
  statsCard: { flex: 1, backgroundColor: c.card, borderRadius: 10, padding: 12, alignItems: 'center', borderLeftWidth: 3, elevation: 1 },
  statsIcon: { fontSize: 18, marginBottom: 4 },
  statsVal: { fontSize: 20, fontWeight: '800' },
  statsLabel: { color: c.textMuted, fontSize: 10, textAlign: 'center', marginTop: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  sectionTitle: { color: c.text, fontSize: 15, fontWeight: '700', flex: 1 },
  sectionCount: { backgroundColor: '#1565C0', color: '#fff', fontSize: 12, fontWeight: '700', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  ventaCard: { backgroundColor: c.card, marginHorizontal: 12, marginBottom: 10, borderRadius: 14, padding: 14, elevation: 2 },
  ventaTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  ventaIconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#e3f2fd', alignItems: 'center', justifyContent: 'center' },
  ventaNum: { color: c.text, fontSize: 14, fontWeight: '800' },
  ventaFecha: { color: c.textMuted, fontSize: 11, marginTop: 1 },
  estadoBadge: { backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  estadoActiva: { backgroundColor: '#e8f5e9' },
  estadoTxt: { fontSize: 12, fontWeight: '700', color: c.textMuted },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  progressBg: { flex: 1, height: 6, backgroundColor: c.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#1565C0', borderRadius: 3 },
  progressTxt: { color: c.textMuted, fontSize: 11, fontWeight: '700', width: 32 },
  montosRow: { flexDirection: 'row', backgroundColor: c.surfaceAlt || '#f8f9fa', borderRadius: 10, padding: 10, marginBottom: 10 },
  montoBox: { flex: 1, alignItems: 'center' },
  montoLabel: { color: c.textMuted, fontSize: 10, fontWeight: '600', marginBottom: 3 },
  montoVal: { fontSize: 13, fontWeight: '800' },
  cuotasBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  infoPill: { backgroundColor: '#e3f2fd', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  infoPillTxt: { color: '#1565C0', fontSize: 11, fontWeight: '600' },
  cobrarVentaBtn: { backgroundColor: '#1565C0', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cobrarVentaTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  gestionesCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: c.card, marginHorizontal: 12, marginTop: 4,
    borderRadius: 14, padding: 16, elevation: 1,
  },
  gestionesLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gestionesTxt: { color: '#1565C0', fontWeight: '700', fontSize: 14 },
});
