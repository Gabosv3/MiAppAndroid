import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, TextInput, ActivityIndicator, Alert, Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import api from '../services/api';
import { useConnectivity } from '../services/connectivity';
import * as offlineQueue from '../services/offlineQueue';

const CATEGORIAS_VEHICULO = [
  { value: 'gasolina',   label: 'Gasolina',   icon: '⛽' },
  { value: 'imprevisto', label: 'Imprevisto', icon: '🔧' },
];

export default function RegistrarGastoScreen({ navigation }) {
  const { isOnline } = useConnectivity();

  const [tipo, setTipo] = useState(null); // 'consumo' | 'vehiculo'
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [comprobante, setComprobante] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [vehiculos, setVehiculos] = useState([]);
  const [loadingVehiculos, setLoadingVehiculos] = useState(false);
  const [vehiculoId, setVehiculoId] = useState(null);
  const [categoriaVehiculo, setCategoriaVehiculo] = useState(null);

  const cargarVehiculos = useCallback(async () => {
    if (!isOnline) return;
    setLoadingVehiculos(true);
    try {
      const { data } = await api.get('/vehiculos/disponibles');
      setVehiculos(Array.isArray(data) ? data : []);
    } catch { setVehiculos([]); }
    finally { setLoadingVehiculos(false); }
  }, [isOnline]);

  useFocusEffect(useCallback(() => { if (tipo === 'vehiculo') cargarVehiculos(); }, [tipo, cargarVehiculos]));

  const elegirTipo = (t) => {
    setTipo(t);
    setVehiculoId(null);
    setCategoriaVehiculo(null);
    if (t === 'vehiculo') cargarVehiculos();
  };

  const tomarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso de cámara requerido', 'Habilita el acceso a la cámara para esta app.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.75, allowsEditing: false });
    if (!result.canceled && result.assets?.length > 0) {
      const a = result.assets[0];
      setComprobante({ uri: a.uri, type: a.mimeType || 'image/jpeg', name: 'comprobante.jpg' });
    }
  };

  const elegirDeGaleria = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Habilita el acceso a la galería.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.75, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!result.canceled && result.assets?.length > 0) {
      const a = result.assets[0];
      setComprobante({ uri: a.uri, type: a.mimeType || 'image/jpeg', name: 'comprobante.jpg' });
    }
  };

  const montoNum = parseFloat(monto) || 0;
  const esVehiculo = tipo === 'vehiculo';
  const puedeEnviar = !!tipo && montoNum >= 0.01 && !!comprobante &&
    (!esVehiculo || (vehiculoId && categoriaVehiculo)) && !submitting;

  const limpiar = () => {
    setTipo(null); setMonto(''); setDescripcion(''); setComprobante(null);
    setVehiculoId(null); setCategoriaVehiculo(null);
  };

  const enviar = async () => {
    if (!puedeEnviar) return;
    setSubmitting(true);

    const campos = {
      tipo,
      monto: montoNum.toFixed(2),
      ...(descripcion.trim() && { descripcion: descripcion.trim() }),
      ...(esVehiculo && { vehiculo_id: vehiculoId, categoria_vehiculo: categoriaVehiculo }),
    };

    try {
      if (isOnline) {
        const formData = new FormData();
        Object.entries(campos).forEach(([k, v]) => formData.append(k, String(v)));
        formData.append('comprobante', { uri: comprobante.uri, name: comprobante.name, type: comprobante.type });

        await api.post('/vales', formData, { timeout: 30000, headers: { 'Content-Type': 'multipart/form-data' } });
        Alert.alert('✅ Vale enviado', 'Queda pendiente de aprobación.', [{ text: 'OK', onPress: () => { limpiar(); navigation.goBack(); } }]);
      } else {
        await offlineQueue.enqueueRequest({
          method: 'POST',
          url: '/vales',
          label: `Vale ${tipo === 'vehiculo' ? categoriaVehiculo : 'consumo'} $${montoNum.toFixed(2)}`,
          useFormData: true,
          data: { ...campos, comprobante },
        });
        Alert.alert(
          '📴 Guardado sin conexión',
          'El vale se enviará automáticamente cuando recuperes la señal.',
          [{ text: 'OK', onPress: () => { limpiar(); navigation.goBack(); } }]
        );
      }
    } catch (e) {
      if (e?.response?.status === 403) {
        Alert.alert('Vehículo no disponible', e.response.data?.mensaje || 'Este vehículo ya no te pertenece ni está disponible como reserva.');
        setVehiculoId(null);
        cargarVehiculos();
      } else if (e?.response?.status === 422) {
        const errores = e.response.data?.errors;
        const msg = errores ? Object.values(errores).flat().join('\n') : (e.response.data?.message || 'Datos inválidos.');
        Alert.alert('Error de validación', msg);
      } else {
        Alert.alert('Error', e?.response?.data?.message || e?.message || 'No se pudo enviar el vale.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const s = styles();

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Registrar gasto</Text>
          <Text style={s.headerSub}>Comprobante de gasto en la calle</Text>
        </View>
      </View>

      {!isOnline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>📴 Sin conexión — el vale se guardará y enviará al reconectarte</Text>
        </View>
      )}

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Tipo ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>¿Qué tipo de gasto es?</Text>
          <View style={s.tipoRow}>
            <TouchableOpacity
              style={[s.tipoBtn, tipo === 'consumo' && s.tipoBtnOn]}
              onPress={() => elegirTipo('consumo')}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 26 }}>🧾</Text>
              <Text style={[s.tipoBtnTxt, tipo === 'consumo' && { color: '#1565C0' }]}>Consumo</Text>
              <Text style={s.tipoBtnSub}>Almuerzo, refrigerio</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tipoBtn, tipo === 'vehiculo' && s.tipoBtnOn]}
              onPress={() => elegirTipo('vehiculo')}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 26 }}>🏍️</Text>
              <Text style={[s.tipoBtnTxt, tipo === 'vehiculo' && { color: '#1565C0' }]}>Vehículo</Text>
              <Text style={s.tipoBtnSub}>Gasolina, imprevisto</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Selector de vehículo y categoría ── */}
        {esVehiculo && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Vehículo</Text>
            {loadingVehiculos ? (
              <ActivityIndicator color="#1565C0" style={{ marginVertical: 12 }} />
            ) : vehiculos.length === 0 ? (
              <Text style={s.avisoTxt}>
                {isOnline ? 'No tienes un vehículo asignado ni hay reservas disponibles. Contacta a tu supervisor.' : 'Necesitas conexión para cargar tus vehículos disponibles.'}
              </Text>
            ) : (
              <>
                {vehiculos.map(v => (
                  <TouchableOpacity
                    key={v.id}
                    style={[s.vehiculoRow, vehiculoId === v.id && s.vehiculoRowOn]}
                    onPress={() => setVehiculoId(v.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 20, marginRight: 10 }}>{v.tipo === 'moto' ? '🏍️' : v.tipo === 'carro' ? '🚗' : v.tipo === 'pickup' ? '🛻' : '🚙'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.vehiculoPlaca}>{v.placa}</Text>
                      <Text style={s.vehiculoMeta}>{[v.marca, v.modelo].filter(Boolean).join(' ') || v.tipo}</Text>
                    </View>
                    <View style={[s.vehiculoBadge, v.es_mio ? s.vehiculoBadgeMio : s.vehiculoBadgeReserva]}>
                      <Text style={[s.vehiculoBadgeTxt, { color: v.es_mio ? '#2e7d32' : '#e65100' }]}>
                        {v.es_mio ? 'Mi vehículo' : 'Reserva'}
                      </Text>
                    </View>
                    {vehiculoId === v.id && <Text style={{ fontSize: 18, color: '#1565C0', marginLeft: 8 }}>✓</Text>}
                  </TouchableOpacity>
                ))}

                <Text style={[s.cardTitle, { marginTop: 16 }]}>Categoría</Text>
                <View style={s.tipoRow}>
                  {CATEGORIAS_VEHICULO.map(c => (
                    <TouchableOpacity
                      key={c.value}
                      style={[s.catBtn, categoriaVehiculo === c.value && s.tipoBtnOn]}
                      onPress={() => setCategoriaVehiculo(c.value)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 20 }}>{c.icon}</Text>
                      <Text style={[s.tipoBtnTxt, categoriaVehiculo === c.value && { color: '#1565C0' }]}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* ── Monto ── */}
        {tipo && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Monto</Text>
            <View style={s.montoWrap}>
              <Text style={{ fontSize: 20, color: '#888', marginRight: 6 }}>$</Text>
              <TextInput
                style={s.montoInput}
                value={monto}
                onChangeText={setMonto}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#bbb"
              />
            </View>
          </View>
        )}

        {/* ── Foto comprobante ── */}
        {tipo && (
          <View style={s.card}>
            <Text style={s.cardTitle}>📷 Foto del comprobante *</Text>
            <Text style={s.cardDesc}>Obligatoria — factura, recibo o ticket del gasto.</Text>
            {comprobante ? (
              <View style={{ alignItems: 'center' }}>
                <Image source={{ uri: comprobante.uri }} style={s.fotoPreview} resizeMode="cover" />
                <TouchableOpacity style={s.fotoRemove} onPress={() => setComprobante(null)}>
                  <Text style={s.fotoRemoveTxt}>✕ Volver a tomar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={[s.fotoBtnGrande, { flex: 1 }]} onPress={tomarFoto} activeOpacity={0.8}>
                  <Text style={s.fotoBtnGrandeIco}>📷</Text>
                  <Text style={s.fotoBtnGrandeTxt}>Cámara</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.fotoBtnGrande, { flex: 1 }]} onPress={elegirDeGaleria} activeOpacity={0.8}>
                  <Text style={s.fotoBtnGrandeIco}>🖼️</Text>
                  <Text style={s.fotoBtnGrandeTxt}>Galería</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ── Descripción (opcional) ── */}
        {tipo && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Descripción <Text style={s.cardOpcional}>(opcional)</Text></Text>
            <TextInput
              style={[s.input, { height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
              value={descripcion}
              onChangeText={setDescripcion}
              placeholder="Ej: Llanta ponchada en el camino"
              placeholderTextColor="#bbb"
              multiline
              maxLength={500}
            />
          </View>
        )}

        {tipo && (
          <TouchableOpacity style={[s.btnPrimary, !puedeEnviar && { opacity: 0.5 }]} onPress={enviar} disabled={!puedeEnviar}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryTxt}>Enviar vale</Text>}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={s.btnSecondary} onPress={() => navigation.goBack()}>
          <Text style={s.btnSecondaryTxt}>Cancelar</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = () => StyleSheet.create({
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

  card: { backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12, borderRadius: 16, padding: 16, elevation: 2 },
  cardTitle:    { color: '#1a1a1a', fontSize: 14, fontWeight: '800', marginBottom: 6 },
  cardDesc:     { color: '#888', fontSize: 12, marginBottom: 12 },
  cardOpcional: { color: '#aaa', fontWeight: '400', fontSize: 12 },
  avisoTxt:     { color: '#e65100', fontSize: 13, lineHeight: 18 },

  tipoRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  tipoBtn: {
    flex: 1, alignItems: 'center', padding: 16, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#e0e0e0', backgroundColor: '#fafafa',
  },
  tipoBtnOn:  { borderColor: '#1565C0', backgroundColor: '#e3f2fd' },
  tipoBtnTxt: { fontSize: 14, fontWeight: '700', color: '#333', marginTop: 6 },
  tipoBtnSub: { fontSize: 10, color: '#999', marginTop: 2, textAlign: 'center' },
  catBtn: {
    flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
    padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#e0e0e0', backgroundColor: '#fafafa',
  },

  vehiculoRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#e0e0e0', marginBottom: 8, backgroundColor: '#fafafa',
  },
  vehiculoRowOn:  { borderColor: '#1565C0', backgroundColor: '#e3f2fd' },
  vehiculoPlaca:  { fontSize: 14, fontWeight: '800', color: '#1a1a1a' },
  vehiculoMeta:   { fontSize: 12, color: '#888', marginTop: 2 },
  vehiculoBadge:      { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  vehiculoBadgeMio:     { backgroundColor: '#e8f5e9' },
  vehiculoBadgeReserva: { backgroundColor: '#fff3e0' },
  vehiculoBadgeTxt:   { fontSize: 10, fontWeight: '700' },

  montoWrap: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e0e0e0',
    borderRadius: 12, paddingHorizontal: 14, backgroundColor: '#fafafa',
  },
  montoInput: { flex: 1, fontSize: 20, fontWeight: '700', color: '#1a1a1a', paddingVertical: 12 },

  input: {
    borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10,
    padding: 14, fontSize: 14, color: '#1a1a1a', backgroundColor: '#fff',
  },

  fotoBtnGrande: {
    backgroundColor: '#e3f2fd', borderRadius: 14, padding: 22,
    alignItems: 'center', borderWidth: 2, borderColor: '#90caf9', borderStyle: 'dashed',
  },
  fotoBtnGrandeIco: { fontSize: 32, marginBottom: 6 },
  fotoBtnGrandeTxt: { color: '#1565C0', fontWeight: '800', fontSize: 13 },
  fotoPreview:   { width: '100%', height: 200, borderRadius: 12, marginBottom: 10 },
  fotoRemove:    { backgroundColor: '#fff3e0', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: '#ffcc80' },
  fotoRemoveTxt: { color: '#e65100', fontWeight: '700', fontSize: 13 },

  btnPrimary:     { marginHorizontal: 12, marginTop: 14, backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 16, alignItems: 'center', elevation: 2 },
  btnPrimaryTxt:  { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnSecondary:   { marginHorizontal: 12, marginTop: 10, borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  btnSecondaryTxt:{ color: '#1565C0', fontWeight: '700', fontSize: 15 },
});
