import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, RefreshControl, ActivityIndicator, TextInput, FlatList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const getInitials = (name = '') => name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
const getAvatarColor = (name = '') => {
  const palette = ['#1565C0', '#283593', '#6a1b9a', '#00695c', '#e65100', '#c62828', '#2e7d32', '#4527a0'];
  return palette[(name.charCodeAt(0) || 0) % palette.length];
};

export default function CobrosScreen({ navigation }) {
  const { colors } = useTheme();
  const [rutas, setRutas] = useState([]);
  const [dia, setDia] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [rutaSeleccionada, setRutaSeleccionada] = useState(null);

  const cargarRuta = useCallback(async () => {
    try {
      setError('');
      const { data } = await api.get('/cobros/ruta-hoy');
      setDia(data.dia || '');
      setRutas(data.rutas || []);
      if (data.rutas?.length === 1) setRutaSeleccionada(data.rutas[0].id);
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

  const onRefresh = () => { setRefreshing(true); cargarRuta(); };

  const todosClientes = useMemo(() => {
    return rutas.flatMap(r =>
      (r.clientes || []).map(c => ({ ...c, rutaNombre: r.nombre, rutaId: r.id }))
    );
  }, [rutas]);

  const clientesFiltrados = useMemo(() => {
    const lista = rutaSeleccionada
      ? todosClientes.filter(c => c.rutaId === rutaSeleccionada)
      : todosClientes;
    if (!busqueda.trim()) return lista;
    const q = busqueda.toLowerCase();
    return lista.filter(c =>
      c.nombre?.toLowerCase().includes(q) ||
      c.codigo_anterior?.toLowerCase().includes(q) ||
      c.telefono?.includes(q)
    );
  }, [todosClientes, busqueda, rutaSeleccionada]);

  const totalClientes = todosClientes.length;
  const totalSaldo = todosClientes.reduce((s, c) => s + (c.saldo_total || 0), 0);
  const totalVencidas = todosClientes.reduce((s, c) => s + (c.cuotas_vencidas || 0), 0);

  const s = styles(colors);

  const renderCliente = ({ item: cliente }) => {
    const color = getAvatarColor(cliente.nombre);
    const totalVentasVencidas = cliente.ventas?.reduce((s, v) => s + (v.cuotas_vencidas || 0), 0) || 0;
    return (
      <View style={s.clienteCard}>
        <View style={s.clienteTop}>
          <View style={[s.avatar, { backgroundColor: color }]}>
            <Text style={s.avatarTxt}>{getInitials(cliente.nombre)}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.clienteNombre} numberOfLines={1}>{cliente.nombre}</Text>
            <View style={s.clienteMeta}>
              {cliente.codigo_anterior ? <Text style={s.metaItem}>#{cliente.codigo_anterior}</Text> : null}
              {cliente.telefono ? <Text style={s.metaItem}>📞 {cliente.telefono}</Text> : null}
            </View>
          </View>
          {cliente.cuotas_vencidas > 0 && (
            <View style={s.vencidaBadge}>
              <Text style={s.vencidaTxt}>{cliente.cuotas_vencidas} venc.</Text>
            </View>
          )}
        </View>

        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Text style={s.statLabel}>Saldo</Text>
            <Text style={[s.statVal, { color: '#e53e3e' }]}>{fmt(cliente.saldo_total)}</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statLabel}>Al día</Text>
            <Text style={[s.statVal, { color: '#F5A623' }]}>{fmt(cliente.para_estar_al_dia)}</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statLabel}>Ventas</Text>
            <Text style={[s.statVal, { color: '#1565C0' }]}>{cliente.ventas?.length || 0}</Text>
          </View>
        </View>

        <View style={s.clienteBtns}>
          <TouchableOpacity
            style={s.btnDetalle}
            onPress={() => navigation.navigate('DetalleCliente', {
              clienteId: cliente.id, clienteNombre: cliente.nombre
            })}
          >
            <Text style={s.btnDetalleTxt}>Ver detalle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.btnCobrar}
            onPress={() => navigation.navigate('RegistrarPago', {
              cliente,
              ventaId: cliente.ventas?.[0]?.id || null,
              ventaNumero: cliente.ventas?.[0]?.numero_venta || null,
              saldoPendiente: cliente.ventas?.[0]?.saldo_pendiente || cliente.saldo_total,
              cuotasVencidas: totalVentasVencidas,
            })}
          >
            <Text style={s.btnCobrarTxt}>💰 Cobrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) return (
    <View style={[s.root, s.centered]}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />
      <ActivityIndicator color="#1565C0" size="large" />
      <Text style={{ color: colors.textMuted, marginTop: 12 }}>Cargando ruta del día...</Text>
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.headerLabel}>HOY · {dia?.toUpperCase()}</Text>
            <Text style={s.headerTitle}>Cobros</Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={onRefresh}>
            <Text style={{ fontSize: 18 }}>🔄</Text>
          </TouchableOpacity>
        </View>

        {/* Summary cards */}
        <View style={s.summaryRow}>
          <View style={s.summaryCard}>
            <Text style={s.summaryVal}>{totalClientes}</Text>
            <Text style={s.summaryLabel}>Clientes</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={[s.summaryVal, { color: '#ffcc02' }]}>{fmt(totalSaldo)}</Text>
            <Text style={s.summaryLabel}>Saldo total</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={[s.summaryVal, { color: totalVencidas > 0 ? '#ff6b6b' : '#81c784' }]}>{totalVencidas}</Text>
            <Text style={s.summaryLabel}>Vencidas</Text>
          </View>
        </View>
      </View>

      {error ? (
        <View style={s.centered}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>😕</Text>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 6 }}>Sin ruta disponible</Text>
          <Text style={{ color: colors.textMuted, textAlign: 'center', marginBottom: 20 }}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); cargarRuta(); }}>
            <Text style={s.retryTxt}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Filtro de rutas */}
          {rutas.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.rutaScroll} contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 8, gap: 8 }}>
              <TouchableOpacity
                style={[s.rutaChip, rutaSeleccionada === null && s.rutaChipActive]}
                onPress={() => setRutaSeleccionada(null)}
              >
                <Text style={[s.rutaChipTxt, rutaSeleccionada === null && s.rutaChipTxtActive]}>Todas</Text>
              </TouchableOpacity>
              {rutas.map(r => (
                <TouchableOpacity
                  key={r.id}
                  style={[s.rutaChip, rutaSeleccionada === r.id && s.rutaChipActive]}
                  onPress={() => setRutaSeleccionada(r.id)}
                >
                  <Text style={[s.rutaChipTxt, rutaSeleccionada === r.id && s.rutaChipTxtActive]}>{r.nombre}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Buscador */}
          <View style={s.searchWrap}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput
              style={s.searchInput}
              placeholder="Buscar cliente, código, teléfono..."
              placeholderTextColor={colors.textMuted}
              value={busqueda}
              onChangeText={setBusqueda}
              clearButtonMode="while-editing"
            />
            {busqueda.length > 0 && (
              <TouchableOpacity onPress={() => setBusqueda('')}>
                <Text style={{ color: colors.textMuted, fontSize: 18, paddingHorizontal: 8 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Resultado */}
          <View style={s.resultBar}>
            <Text style={s.resultTxt}>
              {clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? 's' : ''}
              {busqueda ? ` para "${busqueda}"` : ''}
            </Text>
          </View>

          <FlatList
            data={clientesFiltrados}
            keyExtractor={i => String(i.id)}
            renderItem={renderCliente}
            contentContainerStyle={{ padding: 12, paddingTop: 4, paddingBottom: 24 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565C0']} />}
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Text style={{ fontSize: 40, marginBottom: 10 }}>🔍</Text>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Sin resultados</Text>
                <Text style={{ color: colors.textMuted, marginTop: 4 }}>Intenta con otro nombre o código</Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </View>
  );
}

const styles = (c) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: {
    backgroundColor: '#1565C0',
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 8 : 44,
    paddingBottom: 20,
    paddingHorizontal: 18,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  headerLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  headerTitle: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 2 },
  refreshBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 12, alignItems: 'center' },
  summaryVal: { color: '#fff', fontSize: 18, fontWeight: '800' },
  summaryLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '600', marginTop: 2 },
  rutaScroll: { backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border },
  rutaChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: c.surfaceAlt || '#f0f0f0', borderWidth: 1.5, borderColor: c.border },
  rutaChipActive: { backgroundColor: '#e3f2fd', borderColor: '#1565C0' },
  rutaChipTxt: { color: c.textMuted, fontSize: 13, fontWeight: '600' },
  rutaChipTxtActive: { color: '#1565C0' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.card, marginHorizontal: 12, marginTop: 10, marginBottom: 2,
    borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: c.border,
    elevation: 1,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, color: c.text, fontSize: 14, paddingVertical: 12 },
  resultBar: { paddingHorizontal: 16, paddingVertical: 6 },
  resultTxt: { color: c.textMuted, fontSize: 12 },
  clienteCard: {
    backgroundColor: c.card, borderRadius: 14, marginBottom: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07,
    overflow: 'hidden',
  },
  clienteTop: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingBottom: 10 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  clienteNombre: { color: c.text, fontSize: 15, fontWeight: '700' },
  clienteMeta: { flexDirection: 'row', gap: 10, marginTop: 3 },
  metaItem: { color: c.textMuted, fontSize: 12 },
  vencidaBadge: { backgroundColor: '#fce4ec', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  vencidaTxt: { color: '#c62828', fontSize: 11, fontWeight: '700' },
  statsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceAlt || '#f8f9fa', marginHorizontal: 14, borderRadius: 10, padding: 10, marginBottom: 12 },
  statItem: { flex: 1, alignItems: 'center' },
  statLabel: { color: c.textMuted, fontSize: 10, fontWeight: '600', marginBottom: 2 },
  statVal: { fontSize: 14, fontWeight: '800' },
  statDivider: { width: 1, height: 28, backgroundColor: c.border },
  clienteBtns: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  btnDetalle: { flex: 1, borderRadius: 9, paddingVertical: 10, borderWidth: 1.5, borderColor: '#1565C0', alignItems: 'center' },
  btnDetalleTxt: { color: '#1565C0', fontWeight: '700', fontSize: 13 },
  btnCobrar: { flex: 1, borderRadius: 9, paddingVertical: 10, backgroundColor: '#1565C0', alignItems: 'center' },
  btnCobrarTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  retryBtn: { backgroundColor: '#1565C0', borderRadius: 10, paddingHorizontal: 28, paddingVertical: 12 },
  retryTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyWrap: { alignItems: 'center', paddingVertical: 48 },
});
