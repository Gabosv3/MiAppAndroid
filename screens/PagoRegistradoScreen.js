import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const estadoConfig = {
  cobrado: { label: 'Cobrado', color: '#2e7d32', bg: '#e8f5e9' },
  parcialmente_cobrado: { label: 'Parcial', color: '#e65100', bg: '#fff3e0' },
  pendiente: { label: 'Pendiente', color: '#1565C0', bg: '#e3f2fd' },
};

export default function PagoRegistradoScreen({ navigation, route }) {
  const { resultado, clienteId, clienteNombre } = route.params;
  const { colors } = useTheme();
  const s = styles(colors);

  const cuotasPagadas = resultado?.cuotas_pagadas || [];
  const proximaCuota = resultado?.proxima_cuota;
  const totalDistribuido = cuotasPagadas.length;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Pago registrado</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Confirmación */}
        <View style={s.confirmCard}>
          <View style={s.checkCircle}>
            <Text style={{ fontSize: 36 }}>✓</Text>
          </View>
          <Text style={s.confirmTitle}>Pago registrado correctamente</Text>
          <Text style={s.confirmMonto}>Monto total: <Text style={s.confirmMontoVal}>{fmt(resultado?.monto_total)}</Text></Text>
          <Text style={s.confirmSub}>Distribuido en <Text style={{ fontWeight: '700', color: '#1565C0' }}>{totalDistribuido}</Text> cuota(s)</Text>
        </View>

        {/* Cuotas pagadas */}
        {cuotasPagadas.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Cuotas pagadas</Text>
            {cuotasPagadas.map((c, idx) => {
              const cfg = estadoConfig[c.estado] || estadoConfig.pendiente;
              return (
                <View key={idx} style={s.cuotaRow}>
                  <Text style={s.cuotaNum}>{c.cuota}</Text>
                  <View style={s.cuotaInfo}>
                    <Text style={s.cuotaLabel}>Monto aplicado</Text>
                    <Text style={s.cuotaVal}>{fmt(c.monto_aplicado)}</Text>
                  </View>
                  <View style={[s.estadoBadge, { backgroundColor: cfg.bg }]}>
                    <Text style={{ fontSize: 12, marginRight: 4 }}>
                      {c.estado === 'cobrado' ? '✅' : '⏳'}
                    </Text>
                    <Text style={[s.estadoTxt, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* Próxima cuota */}
        {proximaCuota && (
          <View style={s.proximaCard}>
            <View style={s.proximaIcon}>
              <Text style={{ fontSize: 24 }}>📅</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.proximaTitle}>Próxima cuota</Text>
              <View style={s.proximaRow}>
                <Text style={s.proximaLabel}>Cuota</Text>
                <Text style={s.proximaVal}>{proximaCuota.cuota}</Text>
              </View>
              <View style={s.proximaRow}>
                <Text style={s.proximaLabel}>Saldo pendiente:</Text>
                <Text style={[s.proximaVal, { color: '#F5A623', fontWeight: '700' }]}>{fmt(proximaCuota.saldo_pendiente)}</Text>
              </View>
              <View style={s.proximaRow}>
                <Text style={s.proximaLabel}>Fecha vencimiento:</Text>
                <Text style={s.proximaVal}>{proximaCuota.fecha_vencimiento}</Text>
              </View>
              <View style={s.proximaRow}>
                <Text style={s.proximaLabel}>Estado:</Text>
                <View style={[s.estadoBadge, { backgroundColor: estadoConfig[proximaCuota.estado]?.bg || '#e3f2fd' }]}>
                  <Text style={{ color: estadoConfig[proximaCuota.estado]?.color || '#1565C0', fontSize: 12, fontWeight: '600' }}>
                    {proximaCuota.estado?.replace('_', ' ')}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Botones */}
        <TouchableOpacity
          style={s.rutaBtn}
          onPress={() => navigation.navigate('Cobros')}
        >
          <Text style={s.rutaBtnTxt}>Volver a ruta</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.clienteBtn}
          onPress={() => navigation.navigate('DetalleCliente', { clienteId, clienteNombre })}
        >
          <Text style={s.clienteBtnTxt}>Ver cliente</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = (c) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    backgroundColor: '#1565C0',
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 8 : 44,
    paddingBottom: 16, paddingHorizontal: 20,
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  confirmCard: {
    backgroundColor: c.card, margin: 12, borderRadius: 12, padding: 24,
    alignItems: 'center', elevation: 2,
  },
  checkCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#e8f5e9', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  confirmTitle: { color: '#2e7d32', fontSize: 16, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  confirmMonto: { color: c.text, fontSize: 15, marginBottom: 4 },
  confirmMontoVal: { color: '#1565C0', fontSize: 22, fontWeight: '800' },
  confirmSub: { color: c.textMuted, fontSize: 13 },
  sectionTitle: { color: c.text, fontSize: 14, fontWeight: '700', marginHorizontal: 14, marginTop: 12, marginBottom: 6 },
  cuotaRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: c.card,
    marginHorizontal: 12, marginBottom: 6, borderRadius: 10, padding: 12,
    elevation: 1,
  },
  cuotaNum: { color: '#1565C0', fontSize: 15, fontWeight: '700', width: 52 },
  cuotaInfo: { flex: 1 },
  cuotaLabel: { color: c.textMuted, fontSize: 11 },
  cuotaVal: { color: c.text, fontSize: 13, fontWeight: '700' },
  estadoBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  estadoTxt: { fontSize: 12, fontWeight: '700' },
  proximaCard: {
    flexDirection: 'row', gap: 12, backgroundColor: '#e8eaf6', marginHorizontal: 12,
    marginTop: 8, borderRadius: 12, padding: 14,
  },
  proximaIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#c5cae9', alignItems: 'center', justifyContent: 'center' },
  proximaTitle: { color: '#1565C0', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  proximaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  proximaLabel: { color: '#555', fontSize: 12, flex: 1 },
  proximaVal: { color: '#222', fontSize: 12 },
  rutaBtn: { marginHorizontal: 12, marginTop: 16, backgroundColor: '#1565C0', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  rutaBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  clienteBtn: { marginHorizontal: 12, borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  clienteBtnTxt: { color: '#1565C0', fontWeight: '700', fontSize: 15 },
});
