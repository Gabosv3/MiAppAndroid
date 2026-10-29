import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api, { TIMEOUT_LECTURA_CACHE } from '../services/api';
import { useConnectivity } from '../services/connectivity';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const CONFIG = {
  ventas:     { titulo: 'Ventas del Día', color: '#F5A623', endpoint: '/admin/resumenes-dia/ventas', filtro: { tipo: 'vendedor', param: 'vendedor_id' } },
  cobros:     { titulo: 'Cobros del Día', color: '#1565C0', endpoint: '/admin/resumenes-dia/cobros', filtro: { tipo: 'cobrador', param: 'cobrador_id' } },
  encuestas:  { titulo: 'Encuestas de Cliente', color: '#00897B', endpoint: '/admin/resumenes-dia/encuestas', filtro: { tipo: 'cobrador', param: 'cobrador_id' } },
  reintegros: { titulo: 'Reintegros del Día', color: '#B71C1C', endpoint: '/admin/resumenes-dia/reintegros', filtro: { tipo: 'vendedor', param: 'vendedor_id' } },
  garantias:  { titulo: 'Garantías del Día', color: '#5E35B1', endpoint: '/admin/resumenes-dia/garantias', filtro: null },
};

const ENDPOINT_OPCIONES = { vendedor: '/admin/vendedores', cobrador: '/admin/cobradores' };

const ESTADO_COLOR = {
  pendiente: '#e53e3e', en_proceso: '#F5A623', resuelta: '#2e7d32', rechazada: '#888',
  no_recuperado: '#e53e3e', recuperado: '#2e7d32',
  coincide: '#2e7d32',
};

export default function AdminResumenDetalleScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { isOnline } = useConnectivity();
  const tipo = route?.params?.tipo || 'ventas';
  const fecha = route?.params?.fecha;
  const cfg = CONFIG[tipo];

  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filtroSel, setFiltroSel] = useState(null); // {id, nombre} | null = Todos
  const [opciones, setOpciones] = useState([]);
  const [modalFiltro, setModalFiltro] = useState(false);
  const [cargandoOpciones, setCargandoOpciones] = useState(false);
  const [errorOpciones, setErrorOpciones] = useState('');

  const cargar = useCallback(async () => {
    if (!isOnline) {
      setError('Necesitás conexión a internet.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = { fecha };
      if (cfg.filtro && filtroSel) params[cfg.filtro.param] = filtroSel.id;
      const res = await api.get(cfg.endpoint, { params, timeout: TIMEOUT_LECTURA_CACHE });
      setDatos(res.data);
    } catch (e) {
      console.warn('[AdminResumenDetalle] cargar:', e?.message || e);
      setError(
        e?.response?.status === 403
          ? 'Tu cuenta no tiene permiso de super admin.'
          : `No se pudo cargar el detalle.\n${e?.message || e}`
      );
    } finally {
      setLoading(false);
    }
  }, [isOnline, fecha, cfg.endpoint, cfg.filtro, filtroSel]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const abrirFiltro = async () => {
    setModalFiltro(true);
    if (opciones.length === 0 && cfg.filtro) {
      setCargandoOpciones(true);
      setErrorOpciones('');
      try {
        const res = await api.get(ENDPOINT_OPCIONES[cfg.filtro.tipo], { timeout: TIMEOUT_LECTURA_CACHE });
        setOpciones(Array.isArray(res.data) ? res.data : []);
      } catch (e) {
        console.warn('[AdminResumenDetalleScreen] opciones de filtro:', e?.message || e);
        // Antes el modal quedaba con el spinner girando para siempre.
        setErrorOpciones(e?.message || 'No se pudo cargar la lista.');
      } finally {
        setCargandoOpciones(false);
      }
    }
  };

  const elegirFiltro = (opcion) => {
    setFiltroSel(opcion);
    setModalFiltro(false);
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={cfg.color} />
      <View style={[s.header, { backgroundColor: cfg.color, paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{cfg.titulo}</Text>
      </View>

      {cfg.filtro && (
        <TouchableOpacity style={s.filtroBar} onPress={abrirFiltro} activeOpacity={0.7}>
          <Text style={s.filtroLabel}>{cfg.filtro.tipo === 'vendedor' ? '👤 Vendedor:' : '👤 Cobrador:'}</Text>
          <Text style={[s.filtroValor, { color: cfg.color }]}>{filtroSel ? filtroSel.nombre : 'Todos'}</Text>
          <Text style={s.filtroFlecha}>▾</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={cfg.color} /></View>
      ) : error ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>⚠️</Text>
          <Text style={s.errorTxt}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {tipo === 'cobros' && <CobrosDetalle datos={datos} color={cfg.color} />}
          {tipo === 'ventas' && <VentasDetalle datos={datos} color={cfg.color} />}
          {tipo === 'encuestas' && <EncuestasDetalle datos={datos} />}
          {tipo === 'reintegros' && <ReintegrosDetalle datos={datos} />}
          {tipo === 'garantias' && <GarantiasDetalle datos={datos} />}
        </ScrollView>
      )}

      <Modal visible={modalFiltro} transparent animationType="fade" onRequestClose={() => setModalFiltro(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setModalFiltro(false)}>
          <View style={s.modalCaja}>
            <Text style={s.modalTitulo}>Filtrar por {cfg.filtro?.tipo === 'vendedor' ? 'vendedor' : 'cobrador'}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity style={s.opcionRow} onPress={() => elegirFiltro(null)}>
                <Text style={[s.opcionTxt, !filtroSel && { color: cfg.color, fontWeight: '800' }]}>Todos</Text>
              </TouchableOpacity>
              {opciones.length === 0
                ? (cargandoOpciones
                  ? <ActivityIndicator size="small" color={cfg.color} style={{ marginVertical: 16 }} />
                  : <Text style={{ color: errorOpciones ? '#e53e3e' : '#888', textAlign: 'center', marginVertical: 16 }}>
                      {errorOpciones || 'No hay opciones disponibles.'}
                    </Text>)
                : opciones.map((o) => (
                  <TouchableOpacity key={o.id} style={s.opcionRow} onPress={() => elegirFiltro(o)}>
                    <Text style={[s.opcionTxt, filtroSel?.id === o.id && { color: cfg.color, fontWeight: '800' }]}>{o.nombre}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── Cobros: por cobrador/ruta, con pendientes de visitar ──────────────────
function CobrosDetalle({ datos, color }) {
  const [abiertos, setAbiertos] = useState({});
  const toggle = (i) => setAbiertos(prev => ({ ...prev, [i]: !prev[i] }));

  if (!datos.grupos?.length) return <Text style={s.vacioTxt}>Sin actividad de cobro este día.</Text>;

  return (
    <>
      {datos.grupos.map((g, i) => (
        <View key={i} style={s.card}>
          <Text style={s.grupoTitulo}>{g.cobrador}{g.ruta ? ` — ${g.ruta}` : ''}</Text>
          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Text style={[s.statValor, { color }]}>{fmt(g.total_cobrado)}</Text>
              <Text style={s.statLabel}>Cobrado</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statValor}>{g.clientes_visitados}</Text>
              <Text style={s.statLabel}>Visitados</Text>
            </View>
            <View style={s.statBox}>
              <Text style={[s.statValor, g.pendientes_visitar.length > 0 && { color: '#e53e3e' }]}>{g.pendientes_visitar.length}</Text>
              <Text style={s.statLabel}>Pendientes</Text>
            </View>
          </View>

          {g.ventas_canceladas > 0 && <Text style={s.alertaLinea}>⚠️ {g.ventas_canceladas} venta(s) cancelada(s)</Text>}
          {g.reintegros_enviados > 0 && <Text style={s.alertaLinea}>↩️ {g.reintegros_enviados} reintegro(s) enviado(s)</Text>}

          {g.pagos.length > 0 && (
            <TouchableOpacity onPress={() => toggle(`p${i}`)} style={s.toggleRow}>
              <Text style={s.toggleTxt}>{abiertos[`p${i}`] ? '▾' : '▸'} Pagos registrados ({g.pagos.length})</Text>
            </TouchableOpacity>
          )}
          {abiertos[`p${i}`] && g.pagos.map((p, j) => (
            <View key={j} style={s.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={[s.itemTxt, p.anulado && { color: '#bbb', textDecorationLine: 'line-through' }]} numberOfLines={1}>{p.cliente}</Text>
                {p.cuotas > 1 && <Text style={s.itemSub}>{p.cuotas} cuotas · recibo #{p.numero_recibo}</Text>}
              </View>
              <Text style={s.itemMonto}>{fmt(p.monto)}</Text>
            </View>
          ))}

          {g.pendientes_visitar.length > 0 && (
            <TouchableOpacity onPress={() => toggle(`nv${i}`)} style={s.toggleRow}>
              <Text style={[s.toggleTxt, { color: '#e53e3e' }]}>{abiertos[`nv${i}`] ? '▾' : '▸'} Pendientes de visitar ({g.pendientes_visitar.length})</Text>
            </TouchableOpacity>
          )}
          {abiertos[`nv${i}`] && g.pendientes_visitar.map((c) => (
            <View key={c.id} style={s.itemRow}>
              <Text style={s.itemTxt} numberOfLines={1}>{c.nombre}</Text>
              <Text style={s.itemSub}>{c.telefono || c.codigo || ''}</Text>
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

// ── Ventas: lista simple ────────────────────────────────────────────────
function VentasDetalle({ datos, color }) {
  if (!datos.items?.length) return <Text style={s.vacioTxt}>Sin ventas registradas este día.</Text>;
  return datos.items.map((v) => (
    <View key={v.id} style={s.card}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.grupoTitulo}>{v.cliente}</Text>
          <Text style={s.itemSub}>{v.vendedor} · {v.hora}</Text>
        </View>
        <Text style={[s.montoGrande, { color }]}>{fmt(v.total)}</Text>
      </View>
      {v.productos?.length > 0 && <Text style={s.itemSub}>{v.productos.join(', ')}</Text>}
      <View style={s.chipsRow}>
        {v.es_cliente_nuevo && <Text style={[s.chip, { backgroundColor: '#2e7d3220', color: '#2e7d32' }]}>Nuevo</Text>}
        <Text style={[s.chip, { backgroundColor: '#88888820', color: '#555' }]}>{v.tipo_pago}</Text>
        {v.estado !== 'completada' && <Text style={[s.chip, { backgroundColor: '#e53e3e20', color: '#e53e3e' }]}>{v.estado}</Text>}
      </View>
    </View>
  ));
}

// ── Encuestas ────────────────────────────────────────────────────────────
function EncuestasDetalle({ datos }) {
  if (!datos.items?.length) return <Text style={s.vacioTxt}>Sin encuestas este día.</Text>;
  return datos.items.map((e, i) => (
    <View key={i} style={s.card}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.grupoTitulo}>{e.cliente}</Text>
          <Text style={s.itemSub}>{e.cobrador} · {e.hora}</Text>
        </View>
        <Text style={[s.chip, { backgroundColor: (ESTADO_COLOR[e.resultado] || '#888') + '20', color: ESTADO_COLOR[e.resultado] || '#888' }]}>
          {e.resultado}
        </Text>
      </View>
      {e.diferencia !== 0 && <Text style={s.alertaLinea}>Diferencia: {fmt(e.diferencia)}</Text>}
    </View>
  ));
}

// ── Reintegros ───────────────────────────────────────────────────────────
function ReintegrosDetalle({ datos }) {
  if (!datos.items?.length) return <Text style={s.vacioTxt}>Sin reintegros este día.</Text>;
  return datos.items.map((r, i) => (
    <View key={i} style={s.card}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.grupoTitulo}>{r.cliente}</Text>
          <Text style={s.itemSub}>{r.vendedor} {r.ruta_origen ? `· ${r.ruta_origen}` : ''}</Text>
        </View>
        <Text style={[s.chip, { backgroundColor: (ESTADO_COLOR[r.estado] || '#888') + '20', color: ESTADO_COLOR[r.estado] || '#888' }]}>
          {r.estado}
        </Text>
      </View>
      <Text style={s.itemSub}>Monto adeudado: {fmt(r.monto_adeudado)}</Text>
    </View>
  ));
}

// ── Garantías ────────────────────────────────────────────────────────────
function GarantiasDetalle({ datos }) {
  if (!datos.items?.length) return <Text style={s.vacioTxt}>Sin garantías este día.</Text>;
  return datos.items.map((g, i) => (
    <View key={i} style={s.card}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.grupoTitulo}>{g.cliente}</Text>
          <Text style={s.itemSub}>Asignado a: {g.asignado_a || 'Sin asignar'}</Text>
        </View>
        <Text style={[s.chip, { backgroundColor: (ESTADO_COLOR[g.estado] || '#888') + '20', color: ESTADO_COLOR[g.estado] || '#888' }]}>
          {g.estado}
        </Text>
      </View>
    </View>
  ));
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f6fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  errorTxt: { color: '#888', textAlign: 'center', fontSize: 13 },
  vacioTxt: { color: '#999', textAlign: 'center', fontSize: 13, marginTop: 30 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 32, paddingBottom: 16, paddingHorizontal: 16 },
  backBtn: {},
  backArrow: { color: '#fff', fontSize: 22 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },

  filtroBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee', gap: 6 },
  filtroLabel: { fontSize: 12, color: '#888', fontWeight: '600' },
  filtroValor: { fontSize: 12, fontWeight: '800', flex: 1 },
  filtroFlecha: { fontSize: 12, color: '#999' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalCaja: { backgroundColor: '#fff', borderRadius: 16, padding: 16, maxHeight: '70%' },
  modalTitulo: { fontSize: 14, fontWeight: '800', color: '#1a1a1a', marginBottom: 10 },
  opcionRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  opcionTxt: { fontSize: 13, color: '#333' },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  grupoTitulo: { fontSize: 14, fontWeight: '800', color: '#1a1a1a' },
  montoGrande: { fontSize: 16, fontWeight: '900' },

  statsRow: { flexDirection: 'row', marginTop: 10, marginBottom: 4 },
  statBox: { flex: 1, alignItems: 'center' },
  statValor: { fontSize: 17, fontWeight: '900', color: '#1a1a1a' },
  statLabel: { fontSize: 10, color: '#999', marginTop: 1 },

  alertaLinea: { fontSize: 11, color: '#e53e3e', marginTop: 6, fontWeight: '600' },

  toggleRow: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  toggleTxt: { fontSize: 12, fontWeight: '700', color: '#1565C0' },

  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  itemTxt: { flex: 1, fontSize: 12, color: '#444' },
  itemSub: { fontSize: 11, color: '#999', marginTop: 2 },
  itemMonto: { fontSize: 12, fontWeight: '700', color: '#1a1a1a' },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { fontSize: 10, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
});
