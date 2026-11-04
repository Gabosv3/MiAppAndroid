import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';
import { useConnectivity } from '../services/connectivity';
import { useAuth } from '../context/AuthContext';
import { conciliarDia, leerLibroDelDia } from '../services/libroLocal';
import { ESTADOS } from '../services/conciliacion';
import { fechaHoyLocal, fechaLocalDesde } from '../services/dateUtils';
import { LISTA_RAPIDA } from '../services/listas';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

// Cómo se ve cada resultado de la comparación
const ESTILO = {
  [ESTADOS.coincide]:     { icono: '✅', color: '#2e7d32', fondo: '#e8f5e9', texto: 'Coincide' },
  [ESTADOS.diferencia]:   { icono: '⚠️', color: '#c62828', fondo: '#ffebee', texto: 'DIFERENCIA de monto' },
  [ESTADOS.noEnServidor]: { icono: '❌', color: '#c62828', fondo: '#ffebee', texto: 'No está en el servidor' },
  [ESTADOS.pendiente]:    { icono: '⏳', color: '#b26a00', fondo: '#fff8e1', texto: 'Pendiente de enviar' },
  [ESTADOS.rechazado]:    { icono: '🚫', color: '#c62828', fondo: '#ffebee', texto: 'Rechazado por el servidor' },
  [ESTADOS.soloServidor]: { icono: 'ℹ️', color: '#1565C0', fondo: '#e3f2fd', texto: 'Solo en el servidor' },
};

const sumarDias = (fecha, delta) => {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return fechaLocalDesde(d);
};
const primerDiaDelMes = (fecha) => `${fecha.slice(0, 8)}01`;
const hora = (iso) => {
  try { return new Date(iso).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', hour12: true }); }
  catch { return ''; }
};

export default function ConciliacionScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isOnline } = useConnectivity();
  const { user } = useAuth();
  const hoy = fechaHoyLocal();

  const [fecha, setFecha] = useState(hoy);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);   // comparación completa (con servidor)
  const [soloLibro, setSoloLibro] = useState([]);     // libro de la app (sin conexión)
  const [soloDiferencias, setSoloDiferencias] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    setResultado(null);
    try {
      const libro = await leerLibroDelDia(fecha, user?.id);
      setSoloLibro(libro);
      if (!isOnline) {
        setError('Sin conexión: se muestra solo lo registrado en este teléfono. Con señal se compara contra el servidor.');
        return;
      }
      setResultado(await conciliarDia({ api, fecha, usuarioId: user?.id }));
    } catch (e) {
      setError(`No se pudo comparar con el servidor.\n${e?.message || e}`);
    } finally {
      setCargando(false);
    }
  }, [fecha, isOnline, user?.id]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const filas = useMemo(() => {
    if (!resultado) return [];
    return soloDiferencias
      ? resultado.filas.filter((f) => f.estado !== ESTADOS.coincide && f.estado !== ESTADOS.pendiente)
      : resultado.filas;
  }, [resultado, soloDiferencias]);

  const puedeIrAtras = fecha > primerDiaDelMes(hoy);   // el servidor solo guarda el mes en curso
  const puedeIrAdelante = fecha < hoy;
  const t = resultado?.totales;

  const renderFila = ({ item }) => {
    const est = ESTILO[item.estado] || ESTILO[ESTADOS.coincide];
    const e = item.entrada;
    const srv = item.servidor;
    const nombre = e?.clienteNombre || srv?.cliente?.nombre || 'Cliente';
    const recibo = e?.numeroRecibo || srv?.numero_recibo || '';
    return (
      <View style={[s.fila, { backgroundColor: est.fondo, borderLeftColor: est.color }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.filaNombre} numberOfLines={1}>{est.icono} {nombre}</Text>
          <Text style={s.filaMeta}>
            {recibo ? `Recibo ${recibo}` : 'Sin número de recibo'}
            {e?.creadoEn ? `  ·  ${hora(e.creadoEn)}` : srv?.hora ? `  ·  ${srv.hora}` : ''}
          </Text>
          <Text style={[s.filaEstado, { color: est.color }]}>{est.texto}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.montoEtiqueta}>App</Text>
          <Text style={s.monto}>{item.montoApp != null ? fmt(item.montoApp) : '—'}</Text>
          <Text style={[s.montoEtiqueta, { marginTop: 4 }]}>Servidor</Text>
          <Text style={[s.monto, item.estado === ESTADOS.diferencia && { color: '#c62828' }]}>
            {item.montoServidor != null ? fmt(item.montoServidor) : '—'}
          </Text>
          {item.estado === ESTADOS.diferencia ? (
            <Text style={s.dif}>Dif. {fmt(Math.abs(item.diferencia))}</Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Comparar con el servidor</Text>
          <Text style={s.headerSub}>Lo que registró la app vs. lo que quedó en el servidor</Text>
        </View>
      </View>

      {/* Selector de día */}
      <View style={s.diaBar}>
        <TouchableOpacity disabled={!puedeIrAtras} onPress={() => setFecha(sumarDias(fecha, -1))} style={[s.diaBtn, !puedeIrAtras && { opacity: 0.3 }]}>
          <Text style={s.diaBtnTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={s.diaTxt}>{fecha === hoy ? `Hoy · ${fecha}` : fecha}</Text>
        <TouchableOpacity disabled={!puedeIrAdelante} onPress={() => setFecha(sumarDias(fecha, 1))} style={[s.diaBtn, !puedeIrAdelante && { opacity: 0.3 }]}>
          <Text style={s.diaBtnTxt}>›</Text>
        </TouchableOpacity>
      </View>

      {cargando ? (
        <View style={s.center}><ActivityIndicator size="large" color="#1565C0" /></View>
      ) : (
        <>
          {resultado ? (
            <View style={s.resumen}>
              <View style={s.caja}>
                <Text style={s.cajaEt}>EN LA APP</Text>
                <Text style={s.cajaVal}>{fmt(t.totalApp)}</Text>
              </View>
              <View style={s.caja}>
                <Text style={s.cajaEt}>EN EL SERVIDOR</Text>
                <Text style={s.cajaVal}>{fmt(t.totalServidor)}</Text>
              </View>
              <View style={[s.caja, Math.abs(t.diferencia) >= 0.005 && { backgroundColor: '#ffebee' }]}>
                <Text style={s.cajaEt}>DIFERENCIA</Text>
                <Text style={[s.cajaVal, Math.abs(t.diferencia) >= 0.005 && { color: '#c62828' }]}>{fmt(t.diferencia)}</Text>
              </View>
            </View>
          ) : null}

          {resultado && t.totalPendiente > 0 ? (
            <Text style={s.aviso}>⏳ Además hay {fmt(t.totalPendiente)} guardados en el teléfono sin enviar (no cuentan en el total de la app).</Text>
          ) : null}

          {resultado ? (
            <View style={s.estadoBar}>
              <Text style={[s.estadoTxt, { color: resultado.hayProblemas ? '#c62828' : '#2e7d32' }]}>
                {resultado.hayProblemas
                  ? `⚠️ ${resultado.conteo.diferencia + resultado.conteo.noEnServidor + resultado.conteo.rechazado + resultado.conteo.soloServidor} cosa(s) por revisar — ya se avisó a la oficina`
                  : '✅ Todo coincide con el servidor'}
              </Text>
              <TouchableOpacity onPress={() => setSoloDiferencias((v) => !v)}>
                <Text style={s.filtro}>{soloDiferencias ? 'Ver todo' : 'Solo diferencias'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {error ? <Text style={s.error}>{error}</Text> : null}

          {resultado ? (
            <FlatList
              {...LISTA_RAPIDA}
              data={filas}
              keyExtractor={(f, i) => String(f.entrada?.id || f.servidor?.numero_recibo || i)}
              renderItem={renderFila}
              contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
              ListEmptyComponent={<Text style={s.vacio}>{soloDiferencias ? 'No hay diferencias en este día.' : 'No hay cobros registrados este día.'}</Text>}
              ListFooterComponent={<Text style={s.pie}>Se compara cada recibo de la app con el del servidor. Los montos de la app se guardan tal como los capturó el cobrador y nunca se modifican.</Text>}
            />
          ) : (
            <FlatList
              {...LISTA_RAPIDA}
              data={soloLibro}
              keyExtractor={(e) => String(e.id)}
              renderItem={({ item: e }) => (
                <View style={[s.fila, { backgroundColor: '#fff', borderLeftColor: '#90a4ae' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.filaNombre} numberOfLines={1}>{e.clienteNombre || 'Cliente'}</Text>
                    <Text style={s.filaMeta}>{e.numeroRecibo ? `Recibo ${e.numeroRecibo}` : ''}  ·  {hora(e.creadoEn)}</Text>
                    <Text style={s.filaMeta}>{e.estado === 'pendiente' ? '⏳ Sin enviar' : e.estado === 'rechazado' ? '🚫 Rechazado' : 'Enviado'}</Text>
                  </View>
                  <Text style={s.monto}>{fmt(e.monto)}</Text>
                </View>
              )}
              contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
              ListEmptyComponent={<Text style={s.vacio}>No hay cobros registrados en este teléfono para este día.</Text>}
            />
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f6fa' },
  header: { backgroundColor: '#1565C0', flexDirection: 'row', alignItems: 'center', paddingBottom: 14, paddingHorizontal: 16, gap: 12 },
  backTxt: { color: '#fff', fontSize: 26, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: '#bbdefb', fontSize: 11, marginTop: 2 },
  diaBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  diaBtn: { paddingHorizontal: 14, paddingVertical: 2 },
  diaBtnTxt: { fontSize: 26, color: '#1565C0', fontWeight: '800' },
  diaTxt: { fontSize: 15, fontWeight: '800', color: '#1a1a1a', minWidth: 150, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  resumen: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 6 },
  caja: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#eee' },
  cajaEt: { fontSize: 9, fontWeight: '800', color: '#888', letterSpacing: 0.4 },
  cajaVal: { fontSize: 17, fontWeight: '800', color: '#1a1a1a', marginTop: 4 },
  aviso: { marginHorizontal: 12, marginBottom: 4, fontSize: 12, color: '#b26a00' },
  estadoBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
  estadoTxt: { flex: 1, fontSize: 12, fontWeight: '700' },
  filtro: { fontSize: 12, color: '#1565C0', fontWeight: '800' },
  error: { margin: 12, padding: 10, backgroundColor: '#fff3cd', color: '#856404', borderRadius: 8, fontSize: 12 },
  fila: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, marginBottom: 8, borderLeftWidth: 5, gap: 10 },
  filaNombre: { fontSize: 14, fontWeight: '800', color: '#1a1a1a' },
  filaMeta: { fontSize: 11, color: '#666', marginTop: 2 },
  filaEstado: { fontSize: 11, fontWeight: '800', marginTop: 3 },
  montoEtiqueta: { fontSize: 9, color: '#888', fontWeight: '700' },
  monto: { fontSize: 15, fontWeight: '800', color: '#1a1a1a' },
  dif: { fontSize: 11, fontWeight: '800', color: '#c62828', marginTop: 2 },
  vacio: { textAlign: 'center', color: '#888', marginTop: 40 },
  pie: { fontSize: 10, color: '#999', textAlign: 'center', marginTop: 12 },
});
