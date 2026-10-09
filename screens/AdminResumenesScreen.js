import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api, { TIMEOUT_LECTURA_CACHE } from '../services/api';
import { useConnectivity } from '../services/connectivity';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fechaHoyLocal } from '../services/dateUtils';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
// Hora de El Salvador, no UTC: pasadas las 6 pm el día UTC ya es "mañana".
const fechaBonita = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long' });
};

const RESUMENES = [
  {
    key: 'ventas',
    icon: '🛒',
    tint: '#F5A62312',
    color: '#F5A623',
    titulo: 'Ventas del Día',
    campos: (d) => [
      { label: 'Total vendido', valor: fmt(d.total_vendido), destacado: true },
      { label: 'Ventas registradas', valor: d.total_ventas },
      { label: 'Clientes nuevos', valor: d.clientes_nuevos },
      { label: 'Clientes recurrentes', valor: d.clientes_recurrentes },
      { label: 'Ventas canceladas', valor: d.ventas_canceladas, alerta: d.ventas_canceladas > 0 },
    ],
  },
  {
    key: 'cobros',
    icon: '📊',
    tint: '#1565C012',
    color: '#1565C0',
    titulo: 'Cobros del Día',
    campos: (d) => [
      { label: 'Total cobrado', valor: fmt(d.total_cobrado), destacado: true },
      { label: 'Pagos registrados', valor: d.total_pagos },
      { label: 'Clientes visitados', valor: d.clientes_visitados },
      { label: 'Visitas sin cobro', valor: d.total_sin_cobro },
      { label: 'Cuentas pendientes', valor: d.total_pendientes },
    ],
  },
  {
    key: 'encuestas',
    icon: '📋',
    tint: '#00897B12',
    color: '#00897B',
    titulo: 'Encuestas de Cliente',
    campos: (d) => [
      { label: 'Total encuestas', valor: d.total_encuestas, destacado: true },
      { label: 'Coinciden', valor: d.coinciden },
      { label: 'Con diferencia', valor: d.con_diferencia, alerta: d.con_diferencia > 0 },
      { label: 'Monto en diferencia', valor: fmt(d.monto_diferencia) },
    ],
  },
  {
    key: 'reintegros',
    icon: '↩️',
    tint: '#B71C1C12',
    color: '#B71C1C',
    titulo: 'Reintegros del Día',
    campos: (d) => [
      { label: 'Total', valor: d.total, destacado: true },
      { label: 'Sin asignar', valor: d.sin_asignar, alerta: d.sin_asignar > 0 },
      { label: 'Recuperados', valor: d.recuperados },
      { label: 'No recuperados', valor: d.no_recuperados },
      { label: 'Monto adeudado', valor: fmt(d.monto_adeudado) },
    ],
  },
  {
    key: 'garantias',
    icon: '🛡️',
    tint: '#5E35B112',
    color: '#5E35B1',
    titulo: 'Garantías del Día',
    campos: (d) => [
      { label: 'Total', valor: d.total, destacado: true },
      { label: 'Pendientes', valor: d.pendientes, alerta: d.pendientes > 0 },
      { label: 'En proceso', valor: d.en_proceso },
      { label: 'Resueltas', valor: d.resueltas },
      { label: 'Rechazadas', valor: d.rechazadas },
    ],
  },
];

export default function AdminResumenesScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isOnline } = useConnectivity();

  const [fecha, setFecha] = useState(fechaHoyLocal());
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async (f) => {
    if (!isOnline) {
      setError('Necesitás conexión a internet para ver los resúmenes.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/resumenes-dia', { params: { fecha: f }, timeout: TIMEOUT_LECTURA_CACHE });
      setDatos(res.data);
    } catch (e) {
      setError(
        e?.response?.status === 403
          ? 'Tu cuenta no tiene permiso de super admin.'
          : 'No se pudieron cargar los resúmenes.'
      );
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useFocusEffect(useCallback(() => { cargar(fecha); }, [cargar, fecha]));

  const cambiarDia = (delta) => {
    const [y, m, d] = fecha.split('-').map(Number);
    // Aritmética de calendario pura sobre el "YYYY-MM-DD" (sin zonas horarias):
    // pasar por una Date local podía correr el día según la zona del teléfono.
    const nueva = new Date(Date.UTC(y, m - 1, d + delta));
    const pad = (n) => String(n).padStart(2, '0');
    setFecha(`${nueva.getUTCFullYear()}-${pad(nueva.getUTCMonth() + 1)}-${pad(nueva.getUTCDate())}`);
  };

  const esHoy = fecha === fechaHoyLocal();

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>📅 Resúmenes del Día</Text>
      </View>

      <View style={s.fechaBar}>
        <TouchableOpacity onPress={() => cambiarDia(-1)} style={s.fechaBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.fechaBtnTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={s.fechaTxt} numberOfLines={1}>{fechaBonita(fecha)}</Text>
        <TouchableOpacity
          onPress={() => !esHoy && cambiarDia(1)}
          style={[s.fechaBtn, esHoy && { opacity: 0.3 }]}
          disabled={esHoy}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.fechaBtnTxt}>›</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#1a1a1a" /></View>
      ) : error ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>⚠️</Text>
          <Text style={s.errorTxt}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {RESUMENES.map((r) => {
            const d = datos?.[r.key] || {};
            return (
              <TouchableOpacity
                key={r.key}
                style={s.card}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('AdminResumenDetalle', { tipo: r.key, fecha })}
              >
                <View style={s.cardHeader}>
                  <View style={[s.iconWrap, { backgroundColor: r.tint }]}>
                    <Text style={s.icon}>{r.icon}</Text>
                  </View>
                  <Text style={s.cardTitulo}>{r.titulo}</Text>
                  <Text style={s.verMas}>Ver detalle ›</Text>
                </View>
                <View style={s.camposGrid}>
                  {r.campos(d).map((c, i) => (
                    <View key={i} style={s.campo}>
                      <Text style={[s.campoValor, c.destacado && { color: r.color, fontSize: 22 }, c.alerta && { color: '#e53e3e' }]}>
                        {c.valor}
                      </Text>
                      <Text style={s.campoLabel}>{c.label}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
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
    backgroundColor: '#1a1a1a', flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 32, // paddingTop real (insets.top) se aplica inline en el render
    paddingBottom: 16, paddingHorizontal: 16,
  },
  backBtn: {},
  backArrow: { color: '#fff', fontSize: 24 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },

  fechaBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  fechaBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#f0f0f0' },
  fechaBtnTxt: { fontSize: 20, fontWeight: '800', color: '#333' },
  fechaTxt: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#333', textTransform: 'capitalize' },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  iconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 18 },
  cardTitulo: { flex: 1, fontSize: 15, fontWeight: '800', color: '#1a1a1a' },
  verMas: { fontSize: 11, fontWeight: '700', color: '#1565C0' },

  camposGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  campo: { width: '50%', marginBottom: 10 },
  campoValor: { fontSize: 17, fontWeight: '800', color: '#1a1a1a' },
  campoLabel: { fontSize: 11, color: '#888', marginTop: 1 },
});
