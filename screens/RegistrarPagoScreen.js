import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const METODOS = [
  { value: 'efectivo', label: '💵 Efectivo' },
  { value: 'transferencia', label: '📲 Transferencia' },
  { value: 'cheque', label: '📄 Cheque' },
  { value: 'deposito', label: '🏦 Depósito' },
];

export default function RegistrarPagoScreen({ navigation, route }) {
  const { cliente, ventaId, ventaNumero, saldoPendiente, cuotasVencidas } = route.params;
  const { colors } = useTheme();

  const [monto, setMonto] = useState(saldoPendiente ? String(saldoPendiente) : '');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [referencia, setReferencia] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showMetodos, setShowMetodos] = useState(false);

  const montoNum = parseFloat(monto) || 0;

  const registrar = async () => {
    if (!montoNum || montoNum <= 0) {
      Alert.alert('Error', 'Ingresa un monto válido');
      return;
    }
    if (!ventaId) {
      Alert.alert('Error', 'No se especificó la venta');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        monto: montoNum,
        metodo_pago: metodoPago,
        venta_id: ventaId,
        referencia: referencia.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
      };

      const { data } = await api.post(`/cobros/clientes/${cliente.id}/pagar`, payload);

      navigation.replace('PagoRegistrado', {
        resultado: data,
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
      });
    } catch (e) {
      Alert.alert('Error al registrar pago', e?.message || 'Ocurrió un error');
    } finally {
      setSubmitting(false);
    }
  };

  const s = styles(colors);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Registrar pago</Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Info cliente */}
        <View style={s.clienteCard}>
          <View style={s.clienteRow}>
            <View style={s.avatar}>
              <Text style={s.avatarTxt}>{cliente?.nombre?.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.clienteNombre}>{cliente?.nombre}</Text>
              {ventaNumero ? <Text style={s.clienteSub}>Venta: {ventaNumero}</Text> : null}
            </View>
          </View>
          <View style={s.infoStats}>
            <View style={s.infoStat}>
              <Text style={s.infoLabel}>Saldo pendiente</Text>
              <Text style={[s.infoVal, { color: '#2e7d32' }]}>{fmt(saldoPendiente)}</Text>
            </View>
            {cuotasVencidas > 0 && (
              <View style={s.infoStat}>
                <Text style={s.infoLabel}>Cuotas vencidas</Text>
                <Text style={[s.infoVal, { color: '#F5A623' }]}>{cuotasVencidas}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Formulario */}
        <View style={s.formCard}>
          <Text style={s.formTitle}>Datos del pago</Text>

          {/* Monto */}
          <Text style={s.label}>Monto a pagar</Text>
          <View style={s.montoRow}>
            <TextInput
              style={s.montoInput}
              value={monto}
              onChangeText={setMonto}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
            />
            <View style={s.montoIcon}>
              <Text style={{ fontSize: 18 }}>💲</Text>
            </View>
          </View>

          {/* Método de pago */}
          <Text style={s.label}>Método de pago</Text>
          <TouchableOpacity style={s.select} onPress={() => setShowMetodos(!showMetodos)}>
            <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>
              {METODOS.find(m => m.value === metodoPago)?.label}
            </Text>
            <Text style={{ color: colors.textMuted }}>▾</Text>
          </TouchableOpacity>
          {showMetodos && (
            <View style={s.dropdown}>
              {METODOS.map(m => (
                <TouchableOpacity
                  key={m.value}
                  style={[s.dropItem, metodoPago === m.value && s.dropItemActive]}
                  onPress={() => { setMetodoPago(m.value); setShowMetodos(false); }}
                >
                  <Text style={{ color: metodoPago === m.value ? '#1565C0' : colors.text, fontSize: 14 }}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Venta seleccionada */}
          {ventaNumero && (
            <>
              <Text style={s.label}>Venta seleccionada</Text>
              <View style={[s.select, { justifyContent: 'space-between' }]}>
                <Text style={{ color: colors.text, fontSize: 14 }}>{ventaNumero}</Text>
                <Text style={{ color: colors.textMuted }}>▾</Text>
              </View>
            </>
          )}

          {/* Referencia */}
          <Text style={s.label}>Referencia</Text>
          <TextInput
            style={s.input}
            value={referencia}
            onChangeText={setReferencia}
            placeholder="Pago en el hogar (opcional)"
            placeholderTextColor={colors.textMuted}
          />

          {/* Observaciones */}
          <Text style={s.label}>Observaciones</Text>
          <TextInput
            style={[s.input, { height: 80, textAlignVertical: 'top' }]}
            value={observaciones}
            onChangeText={setObservaciones}
            placeholder="Notas adicionales (opcional)"
            placeholderTextColor={colors.textMuted}
            multiline
          />

          {/* Info distribución */}
          <View style={s.infoBox}>
            <Text style={{ fontSize: 16, marginRight: 8 }}>ℹ️</Text>
            <Text style={s.infoTxt}>El sistema distribuirá el pago automáticamente entre las cuotas pendientes por fecha de vencimiento.</Text>
          </View>
        </View>

        {/* Resumen */}
        <View style={s.resumenCard}>
          <Text style={s.formTitle}>Resumen antes de guardar</Text>
          <View style={s.resumenRow}>
            <Text style={{ fontSize: 16 }}>👤</Text>
            <Text style={s.resumenLabel}>Cliente</Text>
            <Text style={s.resumenVal}>{cliente?.nombre}</Text>
          </View>
          <View style={s.resumenRow}>
            <Text style={{ fontSize: 16 }}>💲</Text>
            <Text style={s.resumenLabel}>Monto</Text>
            <Text style={[s.resumenVal, { color: '#2e7d32', fontWeight: '800' }]}>{fmt(montoNum)}</Text>
          </View>
          <View style={s.resumenRow}>
            <Text style={{ fontSize: 16 }}>💵</Text>
            <Text style={s.resumenLabel}>Método</Text>
            <Text style={s.resumenVal}>{METODOS.find(m => m.value === metodoPago)?.label?.replace(/./u, '').trim()}</Text>
          </View>
          {ventaNumero && (
            <View style={s.resumenRow}>
              <Text style={{ fontSize: 16 }}>📋</Text>
              <Text style={s.resumenLabel}>Aplicación</Text>
              <Text style={s.resumenVal}>Venta {ventaNumero}</Text>
            </View>
          )}
        </View>

        {/* Botones */}
        <TouchableOpacity
          style={[s.registrarBtn, submitting && { opacity: 0.7 }]}
          onPress={registrar}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.registrarTxt}>Registrar pago</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={s.cancelarBtn} onPress={() => navigation.goBack()}>
          <Text style={s.cancelarTxt}>Cancelar</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = (c) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    backgroundColor: '#1565C0', flexDirection: 'row', alignItems: 'center',
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 8 : 44,
    paddingBottom: 16, paddingHorizontal: 16,
  },
  backBtn: { marginRight: 12 },
  backIcon: { color: '#fff', fontSize: 22 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  clienteCard: { backgroundColor: c.card, margin: 12, borderRadius: 12, padding: 14, elevation: 2 },
  clienteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffcdd2', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#c62828', fontSize: 16, fontWeight: '700' },
  clienteNombre: { color: c.text, fontSize: 15, fontWeight: '700' },
  clienteSub: { color: c.textMuted, fontSize: 12, marginTop: 2 },
  infoStats: { flexDirection: 'row', gap: 16 },
  infoStat: {},
  infoLabel: { color: c.textMuted, fontSize: 11, marginBottom: 2 },
  infoVal: { fontSize: 18, fontWeight: '800' },
  formCard: { backgroundColor: c.card, marginHorizontal: 12, borderRadius: 12, padding: 16, elevation: 2, marginBottom: 10 },
  formTitle: { color: c.text, fontSize: 15, fontWeight: '700', marginBottom: 16 },
  label: { color: c.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  montoRow: { flexDirection: 'row', borderWidth: 2, borderColor: '#1565C0', borderRadius: 8, overflow: 'hidden' },
  montoInput: { flex: 1, color: c.text, fontSize: 18, padding: 12, fontWeight: '700', backgroundColor: c.surface },
  montoIcon: { backgroundColor: c.surfaceAlt || '#f0f0f0', padding: 12, justifyContent: 'center' },
  select: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: c.border,
    borderRadius: 8, padding: 12, backgroundColor: c.surface,
  },
  dropdown: { borderWidth: 1, borderColor: c.border, borderRadius: 8, overflow: 'hidden', marginTop: 2 },
  dropItem: { padding: 12, backgroundColor: c.surface },
  dropItemActive: { backgroundColor: '#e3f2fd' },
  input: {
    borderWidth: 1.5, borderColor: c.border, borderRadius: 8, padding: 12,
    color: c.text, fontSize: 14, backgroundColor: c.surface,
  },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#e3f2fd', borderRadius: 8, padding: 10, marginTop: 12,
  },
  infoTxt: { flex: 1, color: '#1565C0', fontSize: 12, lineHeight: 18 },
  resumenCard: { backgroundColor: c.card, marginHorizontal: 12, borderRadius: 12, padding: 16, elevation: 2, marginBottom: 12 },
  resumenRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
  resumenLabel: { flex: 1, color: c.textMuted, fontSize: 13 },
  resumenVal: { color: c.text, fontSize: 13 },
  registrarBtn: { marginHorizontal: 12, backgroundColor: '#1565C0', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  registrarTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cancelarBtn: { marginHorizontal: 12, borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  cancelarTxt: { color: '#1565C0', fontWeight: '700', fontSize: 15 },
});
