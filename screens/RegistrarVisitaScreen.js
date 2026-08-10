import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, TextInput, ActivityIndicator, Alert, Image, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import api, { esErrorTransitorio } from '../services/api';
import { useConnectivity } from '../services/connectivity';
import * as offlineQueue from '../services/offlineQueue';
import { guardarEnHistorial, marcarClienteVisitado } from '../services/cobrosOffline';

const RESULTADOS = [
  { value: 'no_encontrado', label: 'No estaba en casa',   icon: '🚪', color: '#1565C0', bg: '#e3f2fd' },
  { value: 'sin_pago',      label: 'Estaba pero no pagó', icon: '🚫', color: '#e65100', bg: '#fff3e0' },
  { value: 'promesa_pago',  label: 'Prometió pagar',      icon: '🤝', color: '#2e7d32', bg: '#e8f5e9' },
  { value: 'rechazo',       label: 'Se negó a atender',   icon: '⛔', color: '#c62828', bg: '#ffebee' },
  { value: 'abono_previo',  label: 'Ya abonó mensualidad',icon: '✅', color: '#00695c', bg: '#e0f2f1' },
  // Para cuentas vinculadas que ya están en $0 (nada que cobrar) pero igual
  // se visitó la casa: deja registrada la gestión del día sin exigir un pago
  // que no corresponde. Requiere que el backend acepte este mismo valor
  // ('sin_saldo') en POST /cobros/clientes/{id}/visita.
  { value: 'sin_saldo',     label: 'Cuenta al día (sin saldo)', icon: '💚', color: '#2e7d32', bg: '#e8f5e9' },
];

// Opciones que NO requieren foto ni GPS
const SIN_EVIDENCIA = new Set(['abono_previo', 'sin_saldo']);

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function RegistrarVisitaScreen({ navigation, route }) {
  const { cliente, grupoClientes, resultadoInicial } = route.params;
  const { isOnline } = useConnectivity();

  // Con cuentas vinculadas, cada una puede tener un resultado distinto (ej.
  // una "ya abonó mensualidad" y otras dos "no estaba en casa") — no todas
  // tienen que coincidir. Sin grupo, se usa el selector único de siempre.
  const esGrupo = grupoClientes?.length > 1;
  const miembros = esGrupo ? grupoClientes : [cliente];

  const [resultado,      setResultado]     = useState(resultadoInicial || null); // solo modo individual
  const [resultadosPorCliente, setResultadosPorCliente] = useState(
    esGrupo ? Object.fromEntries(grupoClientes.map(m => [m.id, resultadoInicial || null])) : {}
  );
  const [observaciones,  setObservaciones] = useState('');
  const [opcionPromesa,    setOpcionPromesa]    = useState('14'); // '14' | '28' | 'custom'
  const [promesaCustomDate,setPromesaCustomDate] = useState(new Date());
  const [showDatePicker,   setShowDatePicker]    = useState(false);
  const [foto,           setFoto]          = useState(null);
  const [ubicacion,     setUbicacion]     = useState(null);
  const [capturandoGps, setCapturandoGps] = useState(false);
  const [submitting,    setSubmitting]    = useState(false);

  const resultadoDe = (destino) => esGrupo ? resultadosPorCliente[destino.id] : resultado;
  const setResultadoDe = (destinoId, valor) => {
    if (esGrupo) setResultadosPorCliente(prev => ({ ...prev, [destinoId]: valor }));
    else setResultado(valor);
  };

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

  const pad = n => String(n).padStart(2, '0');
  const dateToStr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  const calcPromesaFecha = () => {
    if (opcionPromesa === 'custom') return dateToStr(promesaCustomDate);
    const d = new Date();
    d.setDate(d.getDate() + Number(opcionPromesa));
    return dateToStr(d);
  };

  // Entre todos los destinos, ¿alguno necesita evidencia (foto+GPS)? Si al
  // menos uno la necesita, se pide UNA sola foto/ubicación y se adjunta solo
  // a los que la requieren — los demás (ej. "ya abonó") van sin ella.
  const algunoNecesitaEvidencia = miembros.some(m => {
    const r = resultadoDe(m);
    return r && !SIN_EVIDENCIA.has(r);
  });
  const algunoTienePromesa = miembros.some(m => resultadoDe(m) === 'promesa_pago');
  const todosTienenResultado = miembros.every(m => !!resultadoDe(m));

  // Registrar visita
  const registrar = useCallback(async () => {
    if (!todosTienenResultado) {
      Alert.alert('Falta seleccionar', esGrupo
        ? 'Elige qué pasó con cada cuenta del grupo.'
        : 'Elige qué pasó en la visita.');
      return;
    }
    if (algunoNecesitaEvidencia && !foto) {
      Alert.alert('Foto requerida', 'Debes tomar una foto del hogar para registrar la visita.');
      return;
    }

    const calcFecha = () => {
      if (opcionPromesa === 'custom') {
        const d = promesaCustomDate;
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      }
      const d = new Date();
      d.setDate(d.getDate() + Number(opcionPromesa));
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };
    const promesaFecha = calcFecha();
    if (algunoTienePromesa) {
      const esValida = /^\d{4}-\d{2}-\d{2}$/.test(promesaFecha) && new Date(promesaFecha) > new Date();
      if (!esValida) {
        Alert.alert('Fecha inválida', 'La fecha personalizada debe ser futura con formato YYYY-MM-DD.');
        return;
      }
    }

    // Guarda la visita de UN cliente en la cola offline — usado tanto si ya
    // sabíamos que no había conexión, como si el request online falló por un
    // problema transitorio (red caída a mitad de camino, servidor 5xx). Sin
    // este respaldo en el catch, una falla momentánea perdía la visita
    // completa (incluida la foto ya tomada) y obligaba a rehacerla.
    const guardarOffline = async (destino, resultadoDestino, sinEvidenciaDestino) => {
      await offlineQueue.enqueueRequest({
        method: 'POST',
        url: `/cobros/clientes/${destino.id}/visita`,
        label: `Visita ${destino.nombre}`,
        useFormData: !sinEvidenciaDestino,
        data: {
          resultado: resultadoDestino,
          ...(observaciones.trim() && { observaciones: observaciones.trim() }),
          ...(resultadoDestino === 'promesa_pago' && { promesa_fecha: promesaFecha }),
          ...(!sinEvidenciaDestino && ubicacion && { latitud: String(ubicacion.lat), longitud: String(ubicacion.lng) }),
          ...(!sinEvidenciaDestino && foto && { foto_hogar: { uri: foto.uri, type: foto.type || 'image/jpeg', name: foto.name || 'foto_hogar.jpg' } }),
        },
      });
      await guardarEnHistorial({
        clienteId: destino.id, clienteNombre: destino.nombre,
        clienteWhatsapp: destino.whatsapp || destino.telefono || null,
        tipo: 'visita', resultadoVisita: resultadoDestino,
        observaciones: observaciones.trim() || null,
        resultado: { ok: true, mensaje: 'Visita pendiente de envío (offline)' },
      });
      await marcarClienteVisitado(destino.id);
    };

    // Registra la visita para UN cliente con SU propio resultado: intenta
    // online, si falla por algo transitorio (o si ya sabíamos que no había
    // conexión) cae a la cola offline. Se llama una vez por cada miembro.
    const registrarParaCliente = async (destino) => {
      const resultadoDestino = resultadoDe(destino);
      const sinEvidenciaDestino = SIN_EVIDENCIA.has(resultadoDestino);

      if (!isOnline) {
        await guardarOffline(destino, resultadoDestino, sinEvidenciaDestino);
        return { ok: true, offline: true };
      }
      try {
        let payload;
        let headers = {};

        if (sinEvidenciaDestino) {
          payload = {
            resultado: resultadoDestino,
            ...(observaciones.trim() && { observaciones: observaciones.trim() }),
          };
          headers = { 'Content-Type': 'application/json' };
        } else {
          // Con foto — multipart/form-data. Se construye un FormData nuevo
          // por cliente (no se puede reutilizar el mismo objeto ya enviado).
          const form = new FormData();
          form.append('resultado', resultadoDestino);
          if (observaciones.trim()) form.append('observaciones', observaciones.trim());
          if (resultadoDestino === 'promesa_pago') form.append('promesa_fecha', promesaFecha);
          if (ubicacion) {
            form.append('latitud',  String(ubicacion.lat));
            form.append('longitud', String(ubicacion.lng));
          }
          form.append('foto_hogar', {
            uri: Platform.OS === 'ios' ? foto.uri.replace('file://', '') : foto.uri,
            type: foto.type,
            name: foto.name,
          });
          payload = form;
          headers = { 'Content-Type': 'multipart/form-data' };
        }

        const { data } = await api.post(`/cobros/clientes/${destino.id}/visita`, payload, { headers });
        await guardarEnHistorial({
          clienteId: destino.id, clienteNombre: destino.nombre,
          clienteWhatsapp: destino.whatsapp || destino.telefono || null,
          tipo: 'visita', resultadoVisita: resultadoDestino,
          observaciones: observaciones.trim() || null,
          resultado: data,
        });
        await marcarClienteVisitado(destino.id);
        return { ok: true, offline: false };
      } catch (e) {
        if (esErrorTransitorio(e)) {
          await guardarOffline(destino, resultadoDestino, sinEvidenciaDestino);
          return { ok: true, offline: true };
        }
        return { ok: false, error: e?.response?.data?.message || e?.message || 'No se pudo registrar la visita.' };
      }
    };

    setSubmitting(true);
    try {
      const resultados = [];
      for (const destino of miembros) {
        resultados.push({ destino, ...(await registrarParaCliente(destino)) });
      }

      const exitosos = resultados.filter(r => r.ok);
      const huboOffline = resultados.some(r => r.offline);
      const fallidos = resultados.filter(r => !r.ok);

      if (miembros.length === 1) {
        if (exitosos.length === 1) {
          Alert.alert(
            huboOffline ? '📴 Guardado sin conexión' : '✅ Visita registrada',
            huboOffline
              ? 'La visita (con foto) se enviará automáticamente cuando recuperes la señal.'
              : 'La gestión quedó guardada correctamente.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        } else {
          Alert.alert('Error', fallidos[0]?.error || 'No se pudo registrar la visita.');
        }
      } else {
        const detalle = fallidos.length
          ? `\n\nNo se pudo en: ${fallidos.map(f => f.destino.nombre).join(', ')}`
          : '';
        Alert.alert(
          exitosos.length > 0 ? '✅ Visita registrada para el grupo' : 'Error',
          `${exitosos.length} de ${miembros.length} cuenta${miembros.length !== 1 ? 's' : ''} registrada${exitosos.length !== 1 ? 's' : ''}.${huboOffline ? ' (algunas quedaron pendientes de envío sin conexión)' : ''}${detalle}`,
          [{ text: 'OK', onPress: () => exitosos.length > 0 && navigation.goBack() }]
        );
      }
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || e?.message || 'No se pudo registrar la visita.');
    } finally {
      setSubmitting(false);
    }
  }, [resultado, resultadosPorCliente, observaciones, opcionPromesa, promesaCustomDate, foto, ubicacion, isOnline, cliente, grupoClientes, navigation, todosTienenResultado, algunoNecesitaEvidencia, algunoTienePromesa]);

  const resObjIndividual = RESULTADOS.find(r => r.value === resultado);
  const necesitaFoto = esGrupo ? algunoNecesitaEvidencia : (!!resultado && !SIN_EVIDENCIA.has(resultado));
  // Sin evidencia: solo necesita resultado(s) seleccionados. Con evidencia:
  // requiere foto + ubicación GPS además.
  const puedeRegistrar = todosTienenResultado && !submitting &&
    (!necesitaFoto || (foto && ubicacion && !capturandoGps));

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
          <Text style={s.headerSub}>
            {esGrupo ? `${miembros.length} cuentas vinculadas` : cliente.nombre}
            {!esGrupo && cliente.cuotaMensual > 0 ? ` · Cuota: ${fmt(cliente.cuotaMensual)}` : ''}
          </Text>
        </View>
      </View>

      {!isOnline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>📴 Sin conexión — la visita se guardará y enviará al reconectarte</Text>
        </View>
      )}

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}>

        {esGrupo ? (
          /* ── Un selector independiente por cada cuenta del grupo ── */
          <View style={s.card}>
            <Text style={s.cardTitle}>¿Qué pasó con cada cuenta?</Text>
            <Text style={s.cardDesc}>Elige el resultado de cada una por separado.</Text>
            {miembros.map(m => {
              const rSel = resultadosPorCliente[m.id];
              return (
                <View key={m.id} style={s.miembroBox}>
                  <View style={s.miembroHeaderRow}>
                    <Text style={s.miembroNombre}>{m.nombre}</Text>
                    {m.cuotaMensual > 0 && <Text style={s.miembroCuota}>Cuota: {fmt(m.cuotaMensual)}</Text>}
                  </View>
                  {m.saldo > 0 && <Text style={s.miembroSaldo}>Saldo pendiente: {fmt(m.saldo)}</Text>}
                  <View style={s.chipsWrap}>
                    {RESULTADOS.map(r => (
                      <TouchableOpacity
                        key={r.value}
                        style={[s.chip, rSel === r.value && { backgroundColor: r.bg, borderColor: r.color }]}
                        onPress={() => setResultadoDe(m.id, r.value)}
                        activeOpacity={0.75}
                      >
                        <Text style={s.chipIcon}>{r.icon}</Text>
                        <Text style={[s.chipLabel, rSel === r.value && { color: r.color, fontWeight: '800' }]}>
                          {r.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          /* ── Selector único (visita a un solo cliente) ── */
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
        )}

        {/* ── Fecha promesa (aplica a quien tenga "Prometió pagar") ── */}
        {algunoTienePromesa && (
          <View style={s.card}>
            <Text style={s.cardTitle}>¿Para cuándo prometió pagar? *</Text>
            <View style={s.visitaOpciones}>
              {[
                { key: '14', label: '14 días', sub: 'Defecto' },
                { key: '28', label: '28 días', sub: '4 semanas' },
                { key: 'custom', label: 'Elegir', sub: 'Fecha exacta' },
              ].map(op => (
                <TouchableOpacity
                  key={op.key}
                  style={[s.visitaOpcion, opcionPromesa === op.key && s.visitaOpcionOn]}
                  onPress={() => setOpcionPromesa(op.key)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.visitaOpcionLabel, opcionPromesa === op.key && { color: '#1565C0', fontWeight: '800' }]}>
                    {op.label}
                  </Text>
                  <Text style={[s.visitaOpcionSub, opcionPromesa === op.key && { color: '#1565C0' }]}>
                    {op.sub}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {opcionPromesa === 'custom' && (
              <>
                <TouchableOpacity style={s.dateBtn} onPress={() => setShowDatePicker(true)}>
                  <Text style={s.dateBtnIco}>📅</Text>
                  <Text style={s.dateBtnTxt}>{dateToStr(promesaCustomDate)}</Text>
                  <Text style={s.dateBtnArrow}>›</Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={promesaCustomDate}
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={(_, date) => {
                      setShowDatePicker(false);
                      if (date) setPromesaCustomDate(date);
                    }}
                  />
                )}
              </>
            )}
          </View>
        )}

        {/* ── Foto (solo si algún destino la requiere) ── */}
        {necesitaFoto && (
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
        )}

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

        {/* ── Resumen (modo individual) ── */}
        {!esGrupo && resultado && (
          <View style={[s.resumen, { borderColor: resObjIndividual?.color || '#eee' }]}>
            <Text style={[s.resumenTitulo, { color: resObjIndividual?.color }]}>{resObjIndividual?.icon} {resObjIndividual?.label}</Text>
            {foto && <Text style={s.resumenItem}>📷 Foto tomada</Text>}
            {ubicacion && <Text style={s.resumenItem}>📍 Ubicación registrada</Text>}
            {resultado === 'promesa_pago' && (
              <Text style={s.resumenItem}>📅 Promesa para: {calcPromesaFecha() || '—'}</Text>
            )}
          </View>
        )}

        {/* ── Avisos de validación (solo cuando se requiere evidencia) ── */}
        {necesitaFoto && todosTienenResultado && !foto && (
          <View style={s.avisoFoto}>
            <Text style={s.avisoFotoTxt}>📷 Falta tomar la foto del hogar para poder registrar</Text>
          </View>
        )}
        {necesitaFoto && foto && capturandoGps && (
          <View style={[s.avisoFoto, { backgroundColor: '#e3f2fd', borderColor: '#90caf9' }]}>
            <Text style={[s.avisoFotoTxt, { color: '#1565C0' }]}>📍 Obteniendo ubicación GPS, espera un momento...</Text>
          </View>
        )}
        {necesitaFoto && foto && !capturandoGps && !ubicacion && (
          <View style={s.avisoFoto}>
            <Text style={s.avisoFotoTxt}>📍 No se pudo obtener la ubicación. Quita la foto y vuelve a tomarla en exteriores.</Text>
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

  // Selector por cuenta (modo grupo)
  miembroBox: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  miembroHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  miembroNombre: { fontSize: 13, fontWeight: '800', color: '#1a1a1a' },
  miembroCuota: { fontSize: 12, fontWeight: '700', color: '#1565C0' },
  miembroSaldo: { fontSize: 11, color: '#888', marginTop: 2 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#e0e0e0', backgroundColor: '#fafafa',
  },
  chipIcon: { fontSize: 13, marginRight: 5 },
  chipLabel: { fontSize: 11, color: '#555', fontWeight: '600' },

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

  dateBtn:           { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 10, padding: 14, marginTop: 10, backgroundColor: '#e3f2fd' },
  dateBtnIco:        { fontSize: 18, marginRight: 10 },
  dateBtnTxt:        { flex: 1, fontSize: 15, fontWeight: '700', color: '#1565C0' },
  dateBtnArrow:      { fontSize: 20, color: '#1565C0' },

  visitaOpciones:    { flexDirection: 'row', gap: 8, marginTop: 6 },
  visitaOpcion:      { flex: 1, borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fafafa' },
  visitaOpcionOn:    { borderColor: '#1565C0', backgroundColor: '#e3f2fd' },
  visitaOpcionLabel: { fontSize: 13, fontWeight: '700', color: '#555' },
  visitaOpcionSub:   { fontSize: 10, color: '#aaa', marginTop: 2 },

  btnPrimary:     { marginHorizontal: 12, marginTop: 14, backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 16, alignItems: 'center', elevation: 2 },
  btnPrimaryTxt:  { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnSecondary:   { marginHorizontal: 12, marginTop: 10, borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  btnSecondaryTxt:{ color: '#1565C0', fontWeight: '700', fontSize: 15 },
});
