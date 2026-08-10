import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, TextInput, ActivityIndicator, Alert, FlatList,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import api, { esErrorTransitorio } from '../services/api';
import { useConnectivity } from '../services/connectivity';
import * as offlineQueue from '../services/offlineQueue';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const RESULTADOS = [
  { value: 'coincide', label: 'Todo coincide', icon: '✅', color: '#2e7d32', bg: '#e8f5e9' },
  { value: 'diferencia_investigar', label: 'Diferencia por investigar', icon: '⚠️', color: '#e65100', bg: '#fff3e0' },
  { value: 'pago_no_registrado', label: 'Cliente reporta pago no registrado', icon: '🚨', color: '#c62828', bg: '#ffebee' },
  { value: 'comprobante_inconsistente', label: 'Comprobante presenta inconsistencia', icon: '📄', color: '#ad1457', bg: '#fce4ec' },
];

const OPCIONES_SINO = [
  { value: true, label: 'Sí', color: '#2e7d32', bg: '#e8f5e9' },
  { value: false, label: 'No', color: '#c62828', bg: '#ffebee' },
];

export default function EncuestaClienteScreen({ route, navigation }) {
  const { rutaId, rutaNombre } = route.params;
  const { isOnline } = useConnectivity();

  const [cargandoClientes, setCargandoClientes] = useState(true);
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cliente, setCliente] = useState(null);

  const [montoFrecuencia, setMontoFrecuencia] = useState('');
  const [cobradorReportado, setCobradorReportado] = useState('');
  const [recibioComprobante, setRecibioComprobante] = useState(null);
  const [ultimoPagoMonto, setUltimoPagoMonto] = useState('');
  const [ultimoPagoFecha, setUltimoPagoFecha] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saldoInformado, setSaldoInformado] = useState('');
  const [resultado, setResultado] = useState(null);
  const [observaciones, setObservaciones] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      if (!isOnline) { setCargandoClientes(false); return; }
      try {
        const { data } = await api.get(`/cobros/rutas/${rutaId}/clientes`);
        setClientes(data.clientes || data || []);
      } catch (e) {
        Alert.alert('Error', 'No se pudieron cargar los clientes de la ruta.');
      } finally {
        setCargandoClientes(false);
      }
    })();
  }, [rutaId, isOnline]);

  const clientesFiltrados = clientes.filter(c =>
    !busqueda.trim() ||
    c.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.codigo_anterior?.toLowerCase().includes(busqueda.toLowerCase())
  );

  const limpiarFormulario = () => {
    setMontoFrecuencia(''); setCobradorReportado(''); setRecibioComprobante(null);
    setUltimoPagoMonto(''); setUltimoPagoFecha(new Date()); setSaldoInformado('');
    setResultado(null); setObservaciones('');
  };

  const pad = n => String(n).padStart(2, '0');
  const dateToStr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  const enviar = async () => {
    if (!resultado) {
      Alert.alert('Falta el resultado', 'Elegí qué se encontró al verificar (coincide, diferencia, etc.).');
      return;
    }
    setSubmitting(true);
    const payload = {
      cliente_id: cliente.id,
      resultado,
      ...(montoFrecuencia.trim() && { monto_frecuencia_pago: montoFrecuencia.trim() }),
      ...(cobradorReportado.trim() && { cobrador_reportado_cliente: cobradorReportado.trim() }),
      ...(recibioComprobante !== null && { recibio_comprobante: recibioComprobante }),
      ...(ultimoPagoMonto && { ultimo_pago_monto_cliente: parseFloat(ultimoPagoMonto) }),
      ...(ultimoPagoMonto && { ultimo_pago_fecha_cliente: dateToStr(ultimoPagoFecha) }),
      ...(saldoInformado && { saldo_informado_cliente: parseFloat(saldoInformado) }),
      ...(observaciones.trim() && { observaciones: observaciones.trim() }),
    };

    const guardarOffline = async () => {
      await offlineQueue.enqueueRequest({
        method: 'POST',
        url: '/cobros/encuestas-cliente',
        label: `Encuesta ${cliente.nombre}`,
        data: payload,
      });
      Alert.alert(
        '📴 Guardada sin conexión',
        'La "verificación interna BM" (pago y saldo reales) se calculará cuando se sincronice — no se puede calcular sin conexión.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    };

    try {
      if (isOnline) {
        try {
          const { data } = await api.post('/cobros/encuestas-cliente', payload);
          const e = data.encuesta || {};
          Alert.alert(
            '✅ Encuesta registrada',
            `Pago registrado en BM: ${fmt(e.pago_registrado_bm)}\nSaldo registrado en BM: ${fmt(e.saldo_registrado_bm)}\nDiferencia: ${fmt(e.diferencia)}`,
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        } catch (e) {
          if (esErrorTransitorio(e)) await guardarOffline();
          else Alert.alert('Error', e?.response?.data?.mensaje || 'No se pudo registrar la encuesta.');
        }
      } else {
        await guardarOffline();
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Paso 1: elegir cliente ──────────────────────────────────────────────
  if (!cliente) {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor="#1565C0" />
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Encuestar cliente</Text>
            <Text style={s.headerSub} numberOfLines={1}>{rutaNombre}</Text>
          </View>
        </View>

        {!isOnline ? (
          <View style={s.center}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>⚠️</Text>
            <Text style={s.errorTxt}>Necesitás conexión para elegir el cliente a encuestar.</Text>
          </View>
        ) : (
          <>
            <View style={s.searchBox}>
              <Text style={{ fontSize: 14 }}>🔍</Text>
              <TextInput
                style={s.searchInput}
                placeholder="Buscar por nombre o código..."
                placeholderTextColor="#aaa"
                value={busqueda}
                onChangeText={setBusqueda}
              />
            </View>
            {cargandoClientes ? (
              <View style={s.center}><ActivityIndicator size="large" color="#1565C0" /></View>
            ) : (
              <FlatList
                data={clientesFiltrados}
                keyExtractor={c => String(c.id)}
                contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
                renderItem={({ item }) => (
                  <TouchableOpacity style={s.clienteItem} onPress={() => setCliente(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.clienteNombre}>{item.nombre}</Text>
                      <Text style={s.clienteMeta}>Código: {item.codigo_anterior || '—'} · Saldo: {fmt(item.saldo_total)}</Text>
                    </View>
                    <Text style={{ fontSize: 18, color: '#ccc' }}>›</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={{ color: '#888', textAlign: 'center', marginTop: 30 }}>Sin resultados</Text>}
              />
            )}
          </>
        )}
      </View>
    );
  }

  // ── Paso 2: formulario ───────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => setCliente(null)} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{cliente.nombre}</Text>
          <Text style={s.headerSub}>Código: {cliente.codigo_anterior || '—'}</Text>
        </View>
      </View>

      {!isOnline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>📴 Sin conexión — se guardará y enviará al reconectarte (la verificación interna se calcula al sincronizar)</Text>
        </View>
      )}

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={s.card}>
          <Text style={s.cardTitle}>1. ¿Cuánto paga normalmente y cada cuánto?</Text>
          <TextInput
            style={[s.input, { height: 70, textAlignVertical: 'top', paddingTop: 12 }]}
            value={montoFrecuencia}
            onChangeText={setMontoFrecuencia}
            placeholder="Respuesta del cliente..."
            placeholderTextColor="#bbb"
            multiline
          />
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>2. ¿A quién le entregó su último pago?</Text>
          <TextInput
            style={s.input}
            value={cobradorReportado}
            onChangeText={setCobradorReportado}
            placeholder="Nombre o identificación del cobrador"
            placeholderTextColor="#bbb"
          />
          <Text style={[s.label, { marginTop: 12 }]}>¿Recibió comprobante?</Text>
          <View style={s.opcionesRow}>
            {OPCIONES_SINO.map(op => (
              <TouchableOpacity
                key={String(op.value)}
                style={[s.opcionBtn, recibioComprobante === op.value && { backgroundColor: op.bg, borderColor: op.color }]}
                onPress={() => setRecibioComprobante(op.value)}
              >
                <Text style={[s.opcionTxt, recibioComprobante === op.value && { color: op.color, fontWeight: '800' }]}>{op.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>3. ¿Cuál fue su último pago?</Text>
          <Text style={s.label}>Cantidad entregada</Text>
          <TextInput style={s.input} value={ultimoPagoMonto} onChangeText={setUltimoPagoMonto} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor="#bbb" />
          <Text style={[s.label, { marginTop: 12 }]}>Fecha del pago</Text>
          <TouchableOpacity style={s.dateBtn} onPress={() => setShowDatePicker(true)}>
            <Text style={{ fontSize: 16, marginRight: 8 }}>📅</Text>
            <Text style={{ flex: 1, fontWeight: '700', color: '#1565C0' }}>{dateToStr(ultimoPagoFecha)}</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={ultimoPagoFecha}
              mode="date"
              display="default"
              maximumDate={new Date()}
              onChange={(_, date) => { setShowDatePicker(false); if (date) setUltimoPagoFecha(date); }}
            />
          )}
          <Text style={[s.label, { marginTop: 12 }]}>Saldo que le informaron</Text>
          <TextInput style={s.input} value={saldoInformado} onChangeText={setSaldoInformado} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor="#bbb" />
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Verificación interna BM</Text>
          <Text style={s.cardDesc}>Se calcula automáticamente al guardar, comparando lo que dijo el cliente contra el sistema — no hace falta escribirlo.</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Resultado *</Text>
          {RESULTADOS.map(r => (
            <TouchableOpacity
              key={r.value}
              style={[s.opcion, resultado === r.value && { backgroundColor: r.bg, borderColor: r.color }]}
              onPress={() => setResultado(r.value)}
            >
              <Text style={s.opcionIcon}>{r.icon}</Text>
              <Text style={[s.opcionLabel, resultado === r.value && { color: r.color, fontWeight: '800' }]}>{r.label}</Text>
              {resultado === r.value && <Text style={[s.opcionCheck, { color: r.color }]}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Observación del encargado <Text style={{ color: '#bbb', fontWeight: '400' }}>(opcional)</Text></Text>
          <TextInput
            style={[s.input, { height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
            value={observaciones}
            onChangeText={setObservaciones}
            placeholder="Notas adicionales..."
            placeholderTextColor="#bbb"
            multiline
          />
        </View>

        <TouchableOpacity style={[s.btnPrimary, submitting && { opacity: 0.6 }]} onPress={enviar} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryTxt}>Registrar encuesta</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.btnSecondary} onPress={() => setCliente(null)}>
          <Text style={s.btnSecondaryTxt}>Elegir otro cliente</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f6fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  errorTxt: { color: '#888', textAlign: 'center', fontSize: 13 },
  header: {
    backgroundColor: '#1565C0', flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: (StatusBar.currentHeight || 0) + 8, paddingBottom: 16, paddingHorizontal: 16,
  },
  backBtn: {},
  backArrow: { color: '#fff', fontSize: 24 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },

  offlineBanner: { backgroundColor: '#fff3cd', padding: 10, borderBottomWidth: 1, borderBottomColor: '#ffeaa7' },
  offlineTxt: { color: '#856404', fontSize: 12, fontWeight: '600', textAlign: 'center' },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: '#e0e0e0', gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1a1a1a' },

  clienteItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, elevation: 1 },
  clienteNombre: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  clienteMeta: { fontSize: 11, color: '#888', marginTop: 3 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 },
  cardTitle: { color: '#1a1a1a', fontSize: 14, fontWeight: '800', marginBottom: 10 },
  cardDesc: { color: '#888', fontSize: 12 },
  label: { color: '#666', fontSize: 12, fontWeight: '700', marginBottom: 6 },

  input: { borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, padding: 12, fontSize: 14, color: '#1a1a1a' },
  dateBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 10, padding: 12, backgroundColor: '#e3f2fd' },

  opcionesRow: { flexDirection: 'row', gap: 10 },
  opcionBtn: { flex: 1, borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: '#fafafa' },
  opcionTxt: { fontSize: 14, fontWeight: '700', color: '#555' },

  opcion: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderRadius: 12, borderWidth: 1.5, borderColor: '#e0e0e0',
    marginBottom: 8, backgroundColor: '#fafafa',
  },
  opcionIcon: { fontSize: 18, marginRight: 12 },
  opcionLabel: { flex: 1, fontSize: 13, color: '#333' },
  opcionCheck: { fontSize: 16, fontWeight: '800' },

  btnPrimary: { backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnSecondary: { marginTop: 10, borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  btnSecondaryTxt: { color: '#1565C0', fontWeight: '700', fontSize: 15 },
});
