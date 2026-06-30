import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, TextInput, ActivityIndicator, Alert, Image, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import api from '../services/api';
import { useConnectivity } from '../services/connectivity';
import * as offlineQueue from '../services/offlineQueue';
import { guardarEnHistorial, marcarClienteVisitado } from '../services/cobrosOffline';

const RESULTADOS = [
  { value: 'no_encontrado', label: 'No estaba en casa',   icon: '🚪', color: '#1565C0', bg: '#e3f2fd' },
  { value: 'sin_pago',      label: 'Estaba pero no pagó', icon: '🚫', color: '#e65100', bg: '#fff3e0' },
  { value: 'promesa_pago',  label: 'Prometió pagar',      icon: '🤝', color: '#2e7d32', bg: '#e8f5e9' },
  { value: 'rechazo',       label: 'Se negó a atender',   icon: '⛔', color: '#c62828', bg: '#ffebee' },
];

export default function RegistrarVisitaScreen({ navigation, route }) {
  const { cliente } = route.params;
  const { isOnline } = useConnectivity();

  const [resultado,     setResultado]     = useState(null);
  const [observaciones, setObservaciones] = useState('');
  const [promesaFecha,  setPromesaFecha]  = useState('');
  const [foto,          setFoto]          = useState(null);
  const [ubicacion,     setUbicacion]     = useState(null);
  const [capturandoGps, setCapturandoGps] = useState(false);
  const [submitting,    setSubmitting]    = useState(false);

  // GPS silencioso — el cobrador no ve esto
  const capturarGpsSilencioso = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      setCapturandoGps(true);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUbicacion({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch (_) {}
    finally { setCapturandoGps(false); }
  }, []);

  // Tomar foto (única forma — cámara)
  const tomarFoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso de cámara requerido', 'Ve a Configuración y habilita el acceso a la cámara para esta app.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.length > 0) {
      const asset = result.assets[0];
      setFoto({ uri: asset.uri, type: asset.mimeType || 'image/jpeg', name: 'foto_hogar.jpg' });
      // GPS se captura en segundo plano sin que el cobrador lo vea
      capturarGpsSilencioso();
    }
  }, [capturarGpsSilencioso]);

  const quitarFoto = () => {
    setFoto(null);
    setUbicacion(null);
  };

  // Validar fecha YYYY-MM-DD futura
  const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && new Date(f) > new Date();

  // Registrar visita
  const registrar = useCallback(async () => {
    if (!resultado) {
      Alert.alert('Falta seleccionar', 'Elige qué pasó en la visita.');
      return;
    }
    if (!foto) {
      Alert.alert('Foto requerida', 'Debes tomar una foto del hogar para registrar la visita.');
      return;
    }
    if (resultado === 'promesa_pago' && !fechaValida(promesaFecha)) {
      Alert.alert('Fecha requerida', 'Ingresa una fecha futura válida (YYYY-MM-DD) para la promesa de pago.');
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('resultado', resultado);
      if (observaciones.trim()) form.append('observaciones', observaciones.trim());
      if (resultado === 'promesa_pago') form.append('promesa_fecha', promesaFecha);
      if (ubicacion) {
        form.append('latitud',  String(ubicacion.lat));
        form.append('longitud', String(ubicacion.lng));
      }
      form.append('foto_hogar', {
        uri: Platform.OS === 'ios' ? foto.uri.replace('file://', '') : foto.uri,
        type: foto.type,
        name: foto.name,
      });

      if (isOnline) {
        const { data } = await api.post(`/cobros/clientes/${cliente.id}/visita`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        await guardarEnHistorial({
          clienteId: cliente.id, clienteNombre: cliente.nombre,
          tipo: 'visita', resultadoVisita: resultado,
          observaciones: observaciones.trim() || null,
          resultado: data,
        });
        await marcarClienteVisitado(cliente.id);
        Alert.alert(
          '✅ Visita registrada',
          'La gestión quedó guardada correctamente.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        await offlineQueue.enqueueRequest({
          method: 'POST',
          url: `/cobros/clientes/${cliente.id}/visita`,
          label: `Visita ${cliente.nombre}`,
          data: {
            resultado,
            ...(observaciones.trim() && { observaciones: observaciones.trim() }),
            ...(resultado === 'promesa_pago' && { promesa_fecha: promesaFecha }),
            ...(ubicacion && { latitud: ubicacion.lat, longitud: ubicacion.lng }),
          },
        });
        await guardarEnHistorial({
          clienteId: cliente.id, clienteNombre: cliente.nombre,
          tipo: 'visita', resultadoVisita: resultado,
          observaciones: observaciones.trim() || null,
          resultado: { ok: true, mensaje: 'Visita pendiente de envío (offline)' },
        });
        await marcarClienteVisitado(cliente.id);
        Alert.alert(
          '📴 Guardado sin conexión',
          'La visita se enviará cuando recuperes la señal. La foto se adjuntará al reconectarte.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || e?.message || 'No se pudo registrar la visita.');
    } finally {
      setSubmitting(false);
    }
  }, [resultado, observaciones, promesaFecha, foto, ubicacion, isOnline, cliente.id, navigation]);

  const resObj = RESULTADOS.find(r => r.value === resultado);
  const puedeRegistrar = resultado && foto && !submitting;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Registrar visita</Text>
          <Text style={s.headerSub}>{cliente.nombre}</Text>
        </View>
      </View>

      {!isOnline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>📴 Sin conexión — la visita se guardará y enviará al reconectarte</Text>
        </View>
      )}

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Qué pasó ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>¿Qué pasó en la visita?</Text>
          {RESULTADOS.map(r => (
            <TouchableOpacity
              key={r.value}
              style={[s.opcion, resultado === r.value && { backgroundColor: r.bg, borderColor: r.color }]}
              onPress={() => setResultado(r.value)}
              activeOpacity={0.75}
            >
              <Text style={s.opcionIcon}>{r.icon}</Text>
              <Text style={[s.opcionLabel, resultado === r.value && { color: r.color, fontWeight: '800' }]}>
                {r.label}
              </Text>
              {resultado === r.value && <Text style={[s.opcionCheck, { color: r.color }]}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Fecha promesa ── */}
        {resultado === 'promesa_pago' && (
          <View style={s.card}>
            <Text style={s.cardTitle}>¿Para cuándo prometió pagar? *</Text>
            <TextInput
              style={s.input}
              value={promesaFecha}
              onChangeText={setPromesaFecha}
              placeholder="YYYY-MM-DD  ej: 2026-06-25"
              placeholderTextColor="#bbb"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
            <Text style={s.inputHint}>Debe ser una fecha futura</Text>
          </View>
        )}

        {/* ── Foto ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>📷 Foto del hogar *</Text>
          <Text style={s.cardDesc}>Toma una foto del frente de la casa como comprobante de visita.</Text>

          {foto ? (
            <View style={s.fotoContainer}>
              <Image source={{ uri: foto.uri }} style={s.fotoPreview} resizeMode="cover" />
              {capturandoGps && (
                <View style={s.gpsOverlay}>
                  <ActivityIndicator color="#fff" size="small" />
                </View>
              )}
              <TouchableOpacity style={s.fotoRemove} onPress={quitarFoto}>
                <Text style={s.fotoRemoveTxt}>✕ Volver a tomar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.fotoBtnGrande} onPress={tomarFoto} activeOpacity={0.8}>
              <Text style={s.fotoBtnGrandeIco}>📷</Text>
              <Text style={s.fotoBtnGrandeTxt}>Tomar foto</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Observaciones ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Observaciones <Text style={s.cardOpcional}>(opcional)</Text></Text>
          <TextInput
            style={[s.input, { height: 90, textAlignVertical: 'top', paddingTop: 12 }]}
            value={observaciones}
            onChangeText={setObservaciones}
            placeholder="Notas sobre la visita..."
            placeholderTextColor="#bbb"
            multiline
            maxLength={500}
          />
          <Text style={[s.inputHint, { textAlign: 'right' }]}>{observaciones.length}/500</Text>
        </View>

        {/* ── Resumen ── */}
        {resultado && (
          <View style={[s.resumen, { borderColor: resObj?.color || '#eee' }]}>
            <Text style={[s.resumenTitulo, { color: resObj?.color }]}>{resObj?.icon} {resObj?.label}</Text>
            {foto && <Text style={s.resumenItem}>📷 Foto tomada</Text>}
            {resultado === 'promesa_pago' && promesaFecha
              && <Text style={s.resumenItem}>📅 Promesa para: {promesaFecha}</Text>}
          </View>
        )}

        {/* ── Aviso si falta foto ── */}
        {resultado && !foto && (
          <View style={s.avisoFoto}>
            <Text style={s.avisoFotoTxt}>📷 Falta tomar la foto del hogar para poder registrar</Text>
          </View>
        )}

        {/* ── Botón registrar ── */}
        <TouchableOpacity
          style={[s.btnPrimary, !puedeRegistrar && { opacity: 0.5 }]}
          onPress={registrar}
          disabled={!puedeRegistrar}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnPrimaryTxt}>Registrar visita</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={s.btnSecondary} onPress={() => navigation.goBack()}>
          <Text style={s.btnSecondaryTxt}>Cancelar</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    backgroundColor: '#1565C0', flexDirection: 'row', alignItems: 'center',
    paddingTop: (StatusBar.currentHeight || 0) + 8, paddingBottom: 16, paddingHorizontal: 16, gap: 12,
  },
  backBtn:    { paddingRight: 4 },
  backArrow:  { color: '#fff', fontSize: 24 },
  headerTitle:{ color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub:  { color: 'rgba(255,255,255,0.8)', fontSize: 13 },

  offlineBanner: { backgroundColor: '#fff3cd', padding: 10, borderBottomWidth: 1, borderBottomColor: '#ffeaa7' },
  offlineTxt:    { color: '#856404', fontSize: 12, fontWeight: '600', textAlign: 'center' },

  card: {
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12,
    borderRadius: 16, padding: 16, elevation: 2,
  },
  cardTitle:    { color: '#1a1a1a', fontSize: 14, fontWeight: '800', marginBottom: 6 },
  cardDesc:     { color: '#888', fontSize: 12, marginBottom: 12 },
  cardOpcional: { color: '#aaa', fontWeight: '400', fontSize: 12 },

  opcion: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderRadius: 12, borderWidth: 1.5, borderColor: '#e0e0e0',
    marginBottom: 8, backgroundColor: '#fafafa',
  },
  opcionIcon:  { fontSize: 20, marginRight: 12 },
  opcionLabel: { flex: 1, fontSize: 14, color: '#333' },
  opcionCheck: { fontSize: 16, fontWeight: '800' },

  input: {
    borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10,
    padding: 14, fontSize: 14, color: '#1a1a1a', backgroundColor: '#fff',
  },
  inputHint: { color: '#bbb', fontSize: 11, marginTop: 4 },

  fotoBtnGrande: {
    backgroundColor: '#e3f2fd', borderRadius: 14, padding: 28,
    alignItems: 'center', borderWidth: 2, borderColor: '#90caf9', borderStyle: 'dashed',
  },
  fotoBtnGrandeIco: { fontSize: 44, marginBottom: 10 },
  fotoBtnGrandeTxt: { color: '#1565C0', fontWeight: '800', fontSize: 16 },

  fotoContainer: { alignItems: 'center' },
  fotoPreview:   { width: '100%', height: 220, borderRadius: 12, marginBottom: 10 },
  fotoRemove:    { backgroundColor: '#fff3e0', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: '#ffcc80' },
  fotoRemoveTxt: { color: '#e65100', fontWeight: '700', fontSize: 13 },

  gpsOverlay: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, padding: 6,
  },

  resumen: {
    marginHorizontal: 12, marginTop: 12, padding: 14,
    borderRadius: 12, borderWidth: 2, backgroundColor: '#fff',
  },
  resumenTitulo: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  resumenItem:   { color: '#555', fontSize: 13, marginTop: 4 },

  avisoFoto: {
    marginHorizontal: 12, marginTop: 10, backgroundColor: '#fff8e1',
    borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#ffe082',
  },
  avisoFotoTxt: { color: '#f57f17', fontSize: 13, fontWeight: '600', textAlign: 'center' },

  btnPrimary:     { marginHorizontal: 12, marginTop: 14, backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 16, alignItems: 'center', elevation: 2 },
  btnPrimaryTxt:  { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnSecondary:   { marginHorizontal: 12, marginTop: 10, borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  btnSecondaryTxt:{ color: '#1565C0', fontWeight: '700', fontSize: 15 },
});
