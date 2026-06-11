import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const ESTADO_CFG = {
  cobrado: { label: 'Cobrado', color: '#2e7d32', bg: '#e8f5e9', icon: '✅' },
  parcialmente_cobrado: { label: 'Parcial', color: '#e65100', bg: '#fff3e0', icon: '⏳' },
  pendiente: { label: 'Pendiente', color: '#1565C0', bg: '#e3f2fd', icon: '🕐' },
};

export default function PagoRegistradoScreen({ navigation, route }) {
  const { resultado, clienteId, clienteNombre } = route.params;
  const { colors } = useTheme();
  const s = styles(colors);

  const cuotasPagadas = resultado?.cuotas_pagadas || [];
  const proximaCuota = resultado?.proxima_cuota;
  const totalDistribuido = cuotasPagadas.length;
  const cobradas = cuotasPagadas.filter(c => c.estado === 'cobrado').length;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#2e7d32" />

      <View style={s.header}>
        <Text style={s.headerTitle}>Pago registrado</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Hero confirmación */}
        <View style={s.heroCard}>
          <View style={s.checkCircle}>
            <Text style={{ fontSize: 40, color: '#2e7d32' }}>✓</Text>
          </View>
          <Text style={s.heroTitle}>¡Pago registrado correctamente!</Text>
          <Text style={s.heroMonto}>{fmt(resultado?.monto_total)}</Text>
          <Text style={s.heroSub}>Distribuido en <Text style={{ fontWeight: '800', color: '#1565C0' }}>{totalDistribuido}</Text> cuota(s) · <Text style={{ color: '#2e7d32' }}>{cobradas} cobradas</Text></Text>
        </View>

        {/* Cuotas */}
        {cuotasPagadas.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Cuotas pagadas</Text>
            <View style={s.cuotasList}>
              {cuotasPagadas.map((c, idx) => {
                const cfg = ESTADO_CFG[c.estado] || ESTADO_CFG.pendiente;
                return (
                  <View key={idx} style={[s.cuotaRow, idx < cuotasPagadas.length - 1 && s.cuotaRowBorder]}>
                    <Text style={s.cuotaNum}>{c.cuota}</Text>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={s.cuotaMontoLabel}>Monto aplicado</Text>
                      <Text style={s.cuotaMonto}>{fmt(c.monto_aplicado)}</Text>
                    </View>
                    {c.saldo_pendiente > 0 && (
                      <Text style={s.cuotaSaldo}>Saldo: {fmt(c.saldo_pendiente)}</Text>
                    )}
                    <View style={[s.estadoBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[s.estadoTxt, { color: cfg.color }]}>{cfg.icon} {cfg.label}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Próxima cuota */}
        {proximaCuota && (
          <View style={s.proximaCard}>
            <View style={s.proximaHeader}>
              <Text style={{ fontSize: 22 }}>📅</Text>
              <Text style={s.proximaTitle}>Próxima cuota</Text>
            </View>
            <View style={s.proximaGrid}>
              <View style={s.proximaItem}>
                <Text style={s.proximaLabel}>Cuota</Text>
                <Text style={s.proximaVal}>{proximaCuota.cuota}</Text>
              </View>
              <View style={s.proximaItem}>
                <Text style={s.proximaLabel}>Saldo pendiente</Text>
                <Text style={[s.proximaVal, { color: '#F5A623', fontWeight: '800' }]}>{fmt(proximaCuota.saldo_pendiente)}</Text>
              </View>
              <View style={s.proximaItem}>
                <Text style={s.proximaLabel}>Vencimiento</Text>
                <Text style={s.proximaVal}>{proximaCuota.fecha_vencimiento}</Text>
              </View>
              <View style={s.proximaItem}>
                <Text style={s.proximaLabel}>Estado</Text>
                <View style={[s.estadoBadge, { backgroundColor: ESTADO_CFG[proximaCuota.estado]?.bg || '#e3f2fd' }]}>
                  <Text style={{ color: ESTADO_CFG[proximaCuota.estado]?.color || '#1565C0', fontSize: 11, fontWeight: '700' }}>
                    {proximaCuota.estado?.replace(/_/g, ' ')}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Acciones */}
        <View style={s.actions}>
          <TouchableOpacity style={s.btnPrimary} onPress={() => navigation.navigate('Cobros')}>
            <Text style={s.btnPrimaryTxt}>🗺️ Volver a ruta</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.btnSecondary}
            onPress={() => navigation.navigate('DetalleCliente', { clienteId, clienteNombre })}
          >
            <Text style={s.btnSecondaryTxt}>👤 Ver cliente</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = (c) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    backgroundColor: '#2e7d32',
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 8 : 44,
    paddingBottom: 16, paddingHorizontal: 20,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  heroCard: {
    backgroundColor: c.card, margin: 12, borderRadius: 16, padding: 28,
    alignItems: 'center', elevation: 3,
  },
  checkCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#e8f5e9',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    borderWidth: 2, borderColor: '#a5d6a7',
  },
  heroTitle: { color: '#2e7d32', fontSize: 16, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  heroMonto: { color: c.text, fontSize: 32, fontWeight: '900', marginBottom: 6 },
  heroSub: { color: c.textMuted, fontSize: 13, textAlign: 'center' },
  section: { marginHorizontal: 12, marginBottom: 10 },
  sectionTitle: { color: c.text, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  cuotasList: { backgroundColor: c.card, borderRadius: 14, overflow: 'hidden', elevation: 2 },
  cuotaRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 4 },
  cuotaRowBorder: { borderBottomWidth: 1, borderBottomColor: c.border },
  cuotaNum: { color: '#1565C0', fontSize: 14, fontWeight: '800', width: 50 },
  cuotaMontoLabel: { color: c.textMuted, fontSize: 10 },
  cuotaMonto: { color: c.text, fontSize: 13, fontWeight: '700' },
  cuotaSaldo: { color: '#F5A623', fontSize: 11, fontWeight: '600', marginRight: 6 },
  estadoBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  estadoTxt: { fontSize: 11, fontWeight: '700' },
  proximaCard: {
    backgroundColor: '#e8eaf6', marginHorizontal: 12, borderRadius: 14,
    padding: 16, marginBottom: 10,
  },
  proximaHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  proximaTitle: { color: '#1565C0', fontSize: 14, fontWeight: '800' },
  proximaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  proximaItem: { width: '45%' },
  proximaLabel: { color: '#555', fontSize: 11, marginBottom: 3 },
  proximaVal: { color: '#222', fontSize: 13, fontWeight: '700' },
  actions: { marginHorizontal: 12, gap: 10, marginTop: 4 },
  btnPrimary: { backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnSecondary: { borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  btnSecondaryTxt: { color: '#1565C0', fontWeight: '700', fontSize: 15 },
});
