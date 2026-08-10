import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import api, { esErrorTransitorio } from '../services/api';
import { useConnectivity } from '../services/connectivity';
import * as offlineQueue from '../services/offlineQueue';

const OPCIONES_SINO = [
  { value: true, label: 'Sí', color: '#2e7d32', bg: '#e8f5e9' },
  { value: false, label: 'No', color: '#c62828', bg: '#ffebee' },
];

export default function RegistrarSupervisionScreen({ route, navigation }) {
  const { rutaId, rutaNombre, cobradorNombre } = route.params;
  const { isOnline } = useConnectivity();

  const [visitoClientes, setVisitoClientes] = useState(null);
  const [efectivoCuadrado, setEfectivoCuadrado] = useState(null);
  const [calificacion, setCalificacion] = useState(0);
  const [observaciones, setObservaciones] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const enviar = async () => {
    if (calificacion === 0) {
      Alert.alert('Falta la calificación', 'Elegí una calificación de 1 a 5 estrellas.');
      return;
    }
    setSubmitting(true);
    const payload = {
      ruta_cobro_id: rutaId,
      visito_clientes_correctos: visitoClientes,
      efectivo_cuadrado: efectivoCuadrado,
      calificacion,
      ...(observaciones.trim() && { observaciones: observaciones.trim() }),
    };

    const guardarOffline = async () => {
      await offlineQueue.enqueueRequest({
        method: 'POST',
        url: '/cobros/supervisiones',
        label: `Supervisión ${rutaNombre}`,
        data: payload,
      });
      Alert.alert(
        '📴 Guardada sin conexión',
        'La evaluación se enviará automáticamente cuando recuperes la señal.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    };

    try {
      if (isOnline) {
        try {
          await api.post('/cobros/supervisiones', payload);
          Alert.alert('✅ Evaluación registrada', 'Gracias por la supervisión.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        } catch (e) {
          if (esErrorTransitorio(e)) await guardarOffline();
          else Alert.alert('Error', e?.response?.data?.mensaje || 'No se pudo registrar la evaluación.');
        }
      } else {
        await guardarOffline();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Evaluar supervisión</Text>
          <Text style={s.headerSub} numberOfLines={1}>{rutaNombre}{cobradorNombre ? ` · ${cobradorNombre}` : ''}</Text>
        </View>
      </View>

      {!isOnline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>📴 Sin conexión — se guardará y enviará al reconectarte</Text>
        </View>
      )}

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={s.card}>
          <Text style={s.cardTitle}>¿El cobrador visitó a los clientes correctos?</Text>
          <View style={s.opcionesRow}>
            {OPCIONES_SINO.map(op => (
              <TouchableOpacity
                key={String(op.value)}
                style={[s.opcionBtn, visitoClientes === op.value && { backgroundColor: op.bg, borderColor: op.color }]}
                onPress={() => setVisitoClientes(op.value)}
              >
                <Text style={[s.opcionTxt, visitoClientes === op.value && { color: op.color, fontWeight: '800' }]}>{op.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>¿El efectivo cuadra con lo cobrado?</Text>
          <View style={s.opcionesRow}>
            {OPCIONES_SINO.map(op => (
              <TouchableOpacity
                key={String(op.value)}
                style={[s.opcionBtn, efectivoCuadrado === op.value && { backgroundColor: op.bg, borderColor: op.color }]}
                onPress={() => setEfectivoCuadrado(op.value)}
              >
                <Text style={[s.opcionTxt, efectivoCuadrado === op.value && { color: op.color, fontWeight: '800' }]}>{op.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Calificación general *</Text>
          <View style={s.estrellasRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity key={n} onPress={() => setCalificacion(n)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <Text style={s.estrella}>{n <= calificacion ? '⭐' : '☆'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Observaciones <Text style={{ color: '#bbb', fontWeight: '400' }}>(opcional)</Text></Text>
          <TextInput
            style={[s.input, { height: 90, textAlignVertical: 'top', paddingTop: 12 }]}
            value={observaciones}
            onChangeText={setObservaciones}
            placeholder="Notas sobre la visita de supervisión..."
            placeholderTextColor="#bbb"
            multiline
            maxLength={1000}
          />
        </View>

        <TouchableOpacity style={[s.btnPrimary, submitting && { opacity: 0.6 }]} onPress={enviar} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryTxt}>Registrar evaluación</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.btnSecondary} onPress={() => navigation.goBack()}>
          <Text style={s.btnSecondaryTxt}>Cancelar</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f6fa' },
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

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 },
  cardTitle: { color: '#1a1a1a', fontSize: 14, fontWeight: '800', marginBottom: 10 },

  opcionesRow: { flexDirection: 'row', gap: 10 },
  opcionBtn: { flex: 1, borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: '#fafafa' },
  opcionTxt: { fontSize: 14, fontWeight: '700', color: '#555' },

  estrellasRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  estrella: { fontSize: 34 },

  input: { borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, padding: 12, fontSize: 14, color: '#1a1a1a' },

  btnPrimary: { backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnSecondary: { marginTop: 10, borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  btnSecondaryTxt: { color: '#1565C0', fontWeight: '700', fontSize: 15 },
});
