import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

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
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Text style={s.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Detalle del cliente</Text>
          {cliente?.whatsapp ? (
            <TouchableOpacity onPress={() => Linking.openURL(`https://wa.me/${cliente.whatsapp}`)}>
              <Text style={{ fontSize: 22 }}>💬</Text>
            </TouchableOpacity>
          ) : <View style={{ width: 32 }} />}
        </View>
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator color="#1565C0" size="large" /></View>
      ) : error ? (
        <View style={s.centered}>
          <Text style={{ color: colors.text }}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); cargar(); }}>
            <Text style={s.retryTxt}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Info cliente */}
          <View style={s.clienteCard}>
            <View style={s.clienteRow}>
              <View style={s.avatar}>
                <Text style={s.avatarTxt}>{cliente?.nombre?.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.clienteNombre}>{cliente?.nombre}</Text>
                {cliente?.dui ? <Text style={s.clienteInfo}>DUI: {cliente.dui}</Text> : null}
                {cliente?.telefono ? <Text style={s.clienteInfo}>Tel: {cliente.telefono}</Text> : null}
                {cliente?.direccion ? <Text style={s.clienteInfo}>Dirección: {cliente.direccion}</Text> : null}
                {cliente?.ruta ? <Text style={s.clienteInfo}>Ruta: {cliente.ruta}</Text> : null}
              </View>
              <View style={s.saldoBox}>
                <Text style={s.saldoLabel}>Saldo total</Text>
                <Text style={s.saldoVal}>{fmt(cliente?.saldo_total)}</Text>
              </View>
            </View>
          </View>

          {/* Resumen badges */}
          <View style={s.resumenRow}>
            <View style={s.resumenBox}>
              <Text style={{ fontSize: 20 }}>🛍️</Text>
              <Text style={s.resumenLabel}>Total ventas</Text>
              <Text style={[s.resumenVal, { color: '#1565C0' }]}>{resumen?.total_ventas}</Text>
            </View>
            <View style={s.resumenBox}>
              <Text style={{ fontSize: 20 }}>⏳</Text>
              <Text style={s.resumenLabel}>Cuotas pendientes</Text>
              <Text style={[s.resumenVal, { color: '#F5A623' }]}>{resumen?.cuotas_pendientes}</Text>
            </View>
            <View style={s.resumenBox}>
              <Text style={{ fontSize: 20 }}>⚠️</Text>
              <Text style={s.resumenLabel}>Cuotas vencidas</Text>
              <Text style={[s.resumenVal, { color: '#e53e3e' }]}>{resumen?.cuotas_vencidas}</Text>
            </View>
          </View>

          {/* Ventas activas */}
          <Text style={s.sectionTitle}>Ventas activas</Text>

          {ventas.map(venta => (
            <View key={venta.id} style={s.ventaCard}>
              <View style={s.ventaHeader}>
                <View style={s.ventaIconBox}>
                  <Text style={{ fontSize: 20 }}>📋</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.ventaNum}>{venta.numero_venta}</Text>
                  <Text style={s.ventaFecha}>Fecha: {venta.fecha_venta}</Text>
                </View>
              </View>

              <View style={s.ventaStats}>
                <View style={s.ventaStat}>
                  <Text style={s.ventaStatLabel}>Total</Text>
                  <Text style={[s.ventaStatVal, { color: '#1565C0' }]}>{fmt(venta.total)}</Text>
                </View>
                <View style={s.ventaStat}>
                  <Text style={s.ventaStatLabel}>Pagado</Text>
                  <Text style={[s.ventaStatVal, { color: '#2e7d32' }]}>{fmt(venta.monto_pagado)}</Text>
                </View>
                <View style={s.ventaStat}>
                  <Text style={s.ventaStatLabel}>Pendiente</Text>
                  <Text style={[s.ventaStatVal, { color: '#F5A623' }]}>{fmt(venta.saldo_pendiente)}</Text>
                </View>
              </View>

              <View style={s.ventaBadges}>
                {venta.resumen?.pendientes > 0 && (
                  <View style={[s.badge, { backgroundColor: '#fff8e1' }]}>
                    <Text style={[s.badgeTxt, { color: '#f57f17' }]}>⏳ {venta.resumen.pendientes} pendientes</Text>
                  </View>
                )}
                {venta.resumen?.vencidas > 0 && (
                  <View style={[s.badge, { backgroundColor: '#fce4ec' }]}>
                    <Text style={[s.badgeTxt, { color: '#c62828' }]}>⚠️ {venta.resumen.vencidas} vencidas</Text>
                  </View>
                )}
              </View>

              <View style={s.ventaInfoRow}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  🪙 {venta.resumen?.total_cuotas} cuotas · Estado: <Text style={{ color: '#2e7d32', fontWeight: '700' }}>{venta.estado}</Text>
                </Text>
              </View>

              <TouchableOpacity
                style={s.cobrarBtn}
                onPress={() => navigation.navigate('RegistrarPago', {
                  cliente: { id: clienteId, nombre: cliente?.nombre, ...cliente },
                  ventaId: venta.id,
                  ventaNumero: venta.numero_venta,
                  saldoPendiente: venta.saldo_pendiente,
                  cuotasVencidas: venta.resumen?.vencidas || 0,
                })}
              >
                <Text style={s.cobrarBtnTxt}>Cobrar esta venta</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Gestiones pendientes */}
          <TouchableOpacity
            style={s.gestionesBtn}
            onPress={() => navigation.navigate('GestionesPendientes', { clienteId, clienteNombre })}
          >
            <Text style={{ fontSize: 18 }}>📋</Text>
            <Text style={s.gestionesTxt}>Ver gestiones pendientes</Text>
            <Text style={{ color: '#1565C0', fontSize: 18 }}>›</Text>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = (c) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    backgroundColor: '#1565C0',
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 8 : 44,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { marginRight: 12 },
  backIcon: { color: '#fff', fontSize: 22 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  retryBtn: { marginTop: 12, backgroundColor: '#1565C0', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 },
  retryTxt: { color: '#fff', fontWeight: '700' },
  clienteCard: { backgroundColor: c.card, margin: 12, borderRadius: 12, padding: 14, elevation: 2 },
  clienteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ffcdd2', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#c62828', fontSize: 18, fontWeight: '700' },
  clienteNombre: { color: c.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  clienteInfo: { color: c.textMuted, fontSize: 12, marginBottom: 2 },
  saldoBox: { alignItems: 'flex-end' },
  saldoLabel: { color: c.textMuted, fontSize: 11 },
  saldoVal: { color: '#e53e3e', fontSize: 16, fontWeight: '800' },
  resumenRow: { flexDirection: 'row', marginHorizontal: 12, gap: 8, marginBottom: 4 },
  resumenBox: { flex: 1, backgroundColor: c.card, borderRadius: 10, padding: 10, alignItems: 'center', elevation: 1 },
  resumenLabel: { color: c.textMuted, fontSize: 10, textAlign: 'center', marginTop: 4 },
  resumenVal: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  sectionTitle: { color: c.text, fontSize: 15, fontWeight: '700', marginHorizontal: 14, marginTop: 16, marginBottom: 8 },
  ventaCard: { backgroundColor: c.card, marginHorizontal: 12, marginBottom: 10, borderRadius: 12, padding: 14, elevation: 2 },
  ventaHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  ventaIconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e3f2fd', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  ventaNum: { color: c.text, fontSize: 14, fontWeight: '700' },
  ventaFecha: { color: c.textMuted, fontSize: 12 },
  ventaStats: { flexDirection: 'row', backgroundColor: c.surfaceAlt || '#f8f9fa', borderRadius: 8, padding: 10, marginBottom: 10 },
  ventaStat: { flex: 1, alignItems: 'center' },
  ventaStatLabel: { color: c.textMuted, fontSize: 11, marginBottom: 2 },
  ventaStatVal: { fontSize: 13, fontWeight: '700' },
  ventaBadges: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  badge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  badgeTxt: { fontSize: 11, fontWeight: '600' },
  ventaInfoRow: { backgroundColor: c.surfaceAlt || '#f8f9fa', borderRadius: 6, padding: 8, marginBottom: 10 },
  cobrarBtn: { backgroundColor: '#1565C0', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  cobrarBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  gestionesBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.card, marginHorizontal: 12, marginTop: 4,
    borderRadius: 12, padding: 16, elevation: 1,
  },
  gestionesTxt: { flex: 1, color: '#1565C0', fontWeight: '600', fontSize: 14 },
});
