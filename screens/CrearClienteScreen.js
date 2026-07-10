import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, Alert, ActivityIndicator, Platform, Image,
  ScrollView, Modal
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import api from '../services/api';
import * as offlineQueue from '../services/offlineQueue';
import { useTheme } from '../context/ThemeContext';
import { extractTextFromImage } from '../services/ocr';

export default function CrearClienteScreen({ navigation }) {
  const { colors } = useTheme();
  
  // Estados del formulario
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [dui, setDui] = useState('');
  const [telefonoNormal, setTelefonoNormal] = useState('');
  const [telefonoWhatsapp, setTelefonoWhatsapp] = useState('');
  const [latitud, setLatitud] = useState('');
  const [longitud, setLongitud] = useState('');
  const [fotoCasa, setFotoCasa] = useState(null);
  const [duiFrente, setDuiFrente] = useState(null);
  const [duiReverso, setDuiReverso] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [scanningOcr, setScanningOcr] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailRequerido, setEmailRequerido] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('POS_CONFIG').then(raw => {
      if (raw) { try { setEmailRequerido(!!JSON.parse(raw).emailRequerido); } catch {} }
    });
  }, []);

  // Estados de error
  const [nombreError, setNombreError] = useState('');
  const [apellidoError, setApellidoError] = useState('');
  const [duiError, setDuiError] = useState('');
  const [telefonoError, setTelefonoError] = useState('');
  const [whatsappError, setWhatsappError] = useState('');
  const [latError, setLatError] = useState('');
  const [longError, setLongError] = useState('');
  const [frenteError, setFrenteError] = useState('');
  const [reversoError, setReversoError] = useState('');

  // Validaciones
  const duiRegex = /^\d{8}-\d$/;
  const phoneRegex = /^\d{4}-\d{4}$/;
  
  // ==================== FUNCIONES DE FORMATEO ====================
  const formatDui = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    if (digits.length <= 8) return digits;
    return `${digits.slice(0, 8)}-${digits.slice(8)}`;
  };

  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  };

  // ==================== MANEJADORES DE CAMBIOS ====================
  const handleNombreChange = (text) => {
    setNombre(text);
    setNombreError(text.trim() ? '' : 'Requerido');
  };

  const handleApellidoChange = (text) => {
    setApellido(text);
    setApellidoError(text.trim() ? '' : 'Requerido');
  };

  const handleDuiChange = (text) => {
    const formatted = formatDui(text);
    setDui(formatted);
    if (!formatted) setDuiError('Requerido');
    else if (!duiRegex.test(formatted)) setDuiError('Formato: 12345678-9');
    else setDuiError('');
  };

  const handleTelefonoNormalChange = (text) => {
    const formatted = formatPhone(text);
    setTelefonoNormal(formatted);
    if (!formatted) setTelefonoError('Requerido');
    else if (!phoneRegex.test(formatted)) setTelefonoError('Formato: 1234-5678');
    else setTelefonoError('');
  };

  const handleTelefonoWhatsappChange = (text) => {
    const formatted = formatPhone(text);
    setTelefonoWhatsapp(formatted);
    if (!formatted) setWhatsappError('Requerido');
    else if (!phoneRegex.test(formatted)) setWhatsappError('Formato: 1234-5678');
    else setWhatsappError('');
  };

  // ==================== UBICACIÓN ====================
  const handleGetLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Debe permitir el acceso a la ubicación.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      setLatitud(position.coords.latitude.toString());
      setLongitud(position.coords.longitude.toString());
      Alert.alert('Ubicación capturada', 'Coordenadas registradas correctamente.');
    } catch (error) {
      Alert.alert('Error', error.message || 'No se pudo obtener la ubicación.');
    } finally {
      setLocationLoading(false);
    }
  };

  // ==================== ESCANEAR DUI CON OCR ====================
  const escanearDui = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 1.0 });
      if (!result.canceled && result.assets?.[0]) {
        setScanningOcr(true);
        try {
          const datos = await extractTextFromImage(result.assets[0].uri);
          if (datos) {
            const campos = [];
            if (datos.dui && !dui)           { handleDuiChange(datos.dui);           campos.push(`✅ DUI: ${datos.dui}`); }
            if (datos.nombre && !nombre)     { handleNombreChange(datos.nombre);     campos.push(`✅ Nombre: ${datos.nombre}`); }
            if (datos.apellido && !apellido) { handleApellidoChange(datos.apellido); campos.push(`✅ Apellido: ${datos.apellido}`); }
            if (!datos.nombre && !nombre)     campos.push('✏️ Nombre: escríbelo manualmente');
            if (!datos.apellido && !apellido) campos.push('✏️ Apellido: escríbelo manualmente');
            Alert.alert(
              campos.length > 0 ? '📋 Resultado del escaneo' : '⚠️ Sin datos',
              campos.length > 0 ? campos.join('\n') : 'No se pudo leer el DUI. Intenta con mejor iluminación.'
            );
          }
        } catch (e) { console.warn('OCR error:', e.message); }
        finally { setScanningOcr(false); }
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo abrir la cámara.');
    }
  };

  // ==================== FOTOS DUI ====================
  const tomarFotoDui = async (side) => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara.'); return; }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
      if (!result.canceled && result.assets?.[0]) {
        const imageFile = { uri: result.assets[0].uri, name: `dui_${side}_${Date.now()}.jpg`, type: 'image/jpeg' };
        if (side === 'frente') { setDuiFrente(imageFile); setFrenteError(''); }
        else                   { setDuiReverso(imageFile); setReversoError(''); }
      }
    } catch (e) { Alert.alert('Error', 'No se pudo tomar la foto.'); }
  };

  // ==================== FOTO DE CASA ====================
  const tomarFotoCasa = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
      if (!result.canceled && result.assets?.[0]) {
        setFotoCasa({
          uri: result.assets[0].uri,
          name: `casa_${Date.now()}.jpg`,
          type: 'image/jpeg',
        });
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo tomar la foto.');
    }
  };

  // ==================== SUBIR IMAGEN CORRECTAMENTE ====================
  const appendImageToFormData = (formData, fieldName, imageFile) => {
    if (!imageFile || !imageFile.uri) return false;

    try {
      // Para React Native, el formato correcto es:
      // { uri, name, type }
      const imageData = {
        uri: imageFile.uri,
        name: imageFile.name || `${fieldName}.jpg`,
        type: imageFile.type || 'image/jpeg',
      };
      
      formData.append(fieldName, imageData);
      console.log(`✅ Imagen adjuntada: ${fieldName} - ${imageData.name}`);
      return true;
    } catch (error) {
      console.error(`Error al adjuntar ${fieldName}:`, error);
      return false;
    }
  };

  // ==================== ENVIAR FORMULARIO ====================
  const handleSubmit = async () => {
    // Validar campos
    if (!validate()) return;
    
    setLoading(true);
    
    try {
      // Crear FormData
      const formData = new FormData();
      
      // Agregar datos del cliente
      formData.append('nombre', nombre.trim());
      formData.append('apellido', apellido.trim());
      formData.append('dui', dui.trim());
      formData.append('telefono_normal', telefonoNormal.trim());
      formData.append('telefono_whatsapp', telefonoWhatsapp.trim());
      formData.append('latitud', latitud.trim());
      formData.append('longitud', longitud.trim());
      if (email.trim()) formData.append('email', email.trim());

      if (duiFrente)  appendImageToFormData(formData, 'dui_foto_frente', duiFrente);
      if (duiReverso) appendImageToFormData(formData, 'dui_foto_reverso', duiReverso);
      if (fotoCasa)   appendImageToFormData(formData, 'foto_casa', fotoCasa);
      
      // Enviar al servidor (multipart/form-data para que axios incluya las imágenes correctamente)
      const response = await api.post('/clientes', formData, {
        timeout: 30000,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      Alert.alert(
        '✅ Éxito', 
        `Cliente ${response.data.nombre} ${response.data.apellido} creado correctamente.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
      
    } catch (error) {
      console.error('❌ Error:', error);
      
      let errorMessage = error.message || 'No se pudo crear el cliente.';
      
      if (error.response?.data?.errors) {
        const errors = error.response.data.errors;
        errorMessage = Object.values(errors).flat().join('\n');
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      const offlineError = !error.response || error.message === 'Sin conexión con el servidor' || error.message === 'Tiempo de espera agotado';
      if (offlineError) {
        await offlineQueue.enqueueRequest({
          method: 'POST',
          url: '/clientes',
          label: 'Crear cliente',
          useFormData: true,
          data: {
            nombre: nombre.trim(),
            apellido: apellido.trim(),
            dui: dui.trim(),
            telefono_normal: telefonoNormal.trim(),
            telefono_whatsapp: telefonoWhatsapp.trim(),
            latitud: latitud.trim(),
            longitud: longitud.trim(),
            ...(duiFrente  && { dui_foto_frente:  duiFrente }),
            ...(duiReverso && { dui_foto_reverso: duiReverso }),
            ...(fotoCasa   && { foto_casa:         fotoCasa }),
          },
        });

        Alert.alert(
          'Guardado offline',
          'El cliente se guardó localmente y se sincronizará cuando haya conexión.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  // ==================== VALIDACIÓN ====================
  const validate = () => {
    let valid = true;

    if (!nombre.trim()) {
      setNombreError('Requerido');
      valid = false;
    }
    if (!apellido.trim()) {
      setApellidoError('Requerido');
      valid = false;
    }
    if (!duiRegex.test(dui.trim())) {
      setDuiError('Formato: 12345678-9');
      valid = false;
    }
    if (!phoneRegex.test(telefonoNormal.trim())) {
      setTelefonoError('Formato: 1234-5678');
      valid = false;
    }
    if (!phoneRegex.test(telefonoWhatsapp.trim())) {
      setWhatsappError('Formato: 1234-5678');
      valid = false;
    }
    if (!latitud.trim()) {
      setLatError('Requerido');
      valid = false;
    }
    if (!longitud.trim()) {
      setLongError('Requerido');
      valid = false;
    }
    if (!duiFrente)  { setFrenteError('Toma la foto del frente del DUI');   valid = false; }
    if (!duiReverso) { setReversoError('Toma la foto del reverso del DUI'); valid = false; }
    if (emailRequerido && !email.trim()) {
      setEmailError('El email es requerido');
      valid = false;
    } else if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError('Formato de email inválido');
      valid = false;
    }

    return valid;
  };

  // Verificar si puede enviar
  const canSubmit = () => {
    return (
      nombre.trim() &&
      apellido.trim() &&
      duiRegex.test(dui) &&
      phoneRegex.test(telefonoNormal) &&
      phoneRegex.test(telefonoWhatsapp) &&
      latitud.trim() &&
      longitud.trim() &&
      duiFrente &&
      duiReverso &&
      !loading
    );
  };

  // ==================== RENDER ====================
  const s = styles(colors);
  
  return (
    <ScrollView 
      style={[s.root, { backgroundColor: colors.bg }]} 
      contentContainerStyle={s.container}
      showsVerticalScrollIndicator={false}
    >
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.headerBg} />
      
      {/* Header mejorado */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backBtnIcon}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={s.title}>Nuevo Cliente</Text>
          <Text style={s.subtitle}>Completa todos los datos requeridos</Text>
        </View>
      </View>

      {/* Datos personales */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>👤 Datos Personales</Text>
          <Text style={s.cardRequired}>* Requerido</Text>
        </View>

        <TextInput
          style={[s.input, nombreError && s.inputError]}
          placeholder="Nombre completo"
          placeholderTextColor={colors.textMuted}
          value={nombre}
          onChangeText={handleNombreChange}
        />
        {nombreError ? <Text style={s.errorText}>{nombreError}</Text> : null}

        <TextInput
          style={[s.input, apellidoError && s.inputError]}
          placeholder="Apellido"
          placeholderTextColor={colors.textMuted}
          value={apellido}
          onChangeText={handleApellidoChange}
        />
        {apellidoError ? <Text style={s.errorText}>{apellidoError}</Text> : null}
      </View>
      
      {/* Identificación */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>🪪 Identificación</Text>
          <Text style={s.cardRequired}>* Requerido</Text>
        </View>

        <View style={s.inputWithButton}>
          <TextInput
            style={[s.input, s.inputWithButtonInput, duiError && s.inputError]}
            placeholder="DUI (12345678-9)"
            placeholderTextColor={colors.textMuted}
            value={dui}
            onChangeText={handleDuiChange}
            keyboardType="default"
          />
          <TouchableOpacity
            style={s.inlineButton}
            onPress={async () => {
              try {
                const text = await navigator?.clipboard?.readText?.() || '';
                if (text) {
                  const duiMatch = text.match(/\d{8}-\d/);
                  if (duiMatch) {
                    handleDuiChange(duiMatch[0]);
                    Alert.alert('✅', 'DUI pegado');
                  } else {
                    Alert.alert('⚠️', 'DUI no válido');
                  }
                }
              } catch (e) {
                Alert.alert('ℹ️', 'Pega manualmente el DUI');
              }
            }}
          >
            <Text style={s.inlineButtonText}>📋</Text>
          </TouchableOpacity>
        </View>
        {duiError ? <Text style={s.errorText}>{duiError}</Text> : null}
      </View>

      {/* Contacto */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>📞 Contacto</Text>
          <Text style={s.cardRequired}>* Requerido</Text>
        </View>

        <TextInput
          style={[s.input, telefonoError && s.inputError]}
          placeholder="Teléfono (1234-5678)"
          placeholderTextColor={colors.textMuted}
          value={telefonoNormal}
          onChangeText={handleTelefonoNormalChange}
          keyboardType="phone-pad"
        />
        {telefonoError ? <Text style={s.errorText}>{telefonoError}</Text> : null}

        <TextInput
          style={[s.input, whatsappError && s.inputError]}
          placeholder="WhatsApp (1234-5678)"
          placeholderTextColor={colors.textMuted}
          value={telefonoWhatsapp}
          onChangeText={handleTelefonoWhatsappChange}
          keyboardType="phone-pad"
        />
        {whatsappError ? <Text style={s.errorText}>{whatsappError}</Text> : null}

        <TextInput
          style={[s.input, { marginTop: 8 }, emailError && s.inputError]}
          placeholder={emailRequerido ? 'Email (requerido)' : 'Email (opcional)'}
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={t => { setEmail(t); setEmailError(''); }}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        {emailError ? <Text style={s.errorText}>{emailError}</Text> : null}
      </View>

      {/* Ubicación */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>📍 Ubicación</Text>
          <Text style={s.cardRequired}>* Requerido</Text>
        </View>

        <TextInput
          style={[s.input, latError && s.inputError]}
          placeholder="Latitud"
          placeholderTextColor={colors.textMuted}
          value={latitud}
          onChangeText={setLatitud}
          keyboardType="numeric"
        />

        <TextInput
          style={[s.input, longError && s.inputError]}
          placeholder="Longitud"
          placeholderTextColor={colors.textMuted}
          value={longitud}
          onChangeText={setLongitud}
          keyboardType="numeric"
        />
        {(latError || longError) ? <Text style={s.errorText}>{latError || longError}</Text> : null}

        <TouchableOpacity
          style={[s.locationBtn, locationLoading && s.locationBtnLoading]}
          onPress={handleGetLocation}
          disabled={locationLoading}
        >
          <Text style={s.locationBtnText}>
            {locationLoading ? '⏳ Obteniendo...' : '📍 Capturar ubicación'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Escanear DUI */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>🪪 Escanear DUI</Text>
          <Text style={s.cardRequired}>Opcional</Text>
        </View>
        <TouchableOpacity
          style={[s.locationBtn, scanningOcr && s.locationBtnLoading]}
          onPress={escanearDui}
          disabled={scanningOcr}
        >
          <Text style={s.locationBtnText}>
            {scanningOcr ? '⏳ Escaneando...' : '📷 Escanear DUI (auto-rellenar)'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Fotos del DUI */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>🪪 Fotos del DUI</Text>
          <Text style={s.cardRequired}>* Ambos lados</Text>
        </View>
        <View style={s.photoGrid}>
          <TouchableOpacity style={[s.photoCard, duiFrente && s.photoCardDone]} onPress={() => tomarFotoDui('frente')}>
            <Text style={s.photoCardIcon}>{duiFrente ? '✓' : '📸'}</Text>
            <Text style={s.photoCardText}>{duiFrente ? 'Frente\ntomado' : 'Tomar\nfrente'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.photoCard, duiReverso && s.photoCardDone]} onPress={() => tomarFotoDui('reverso')}>
            <Text style={s.photoCardIcon}>{duiReverso ? '✓' : '📸'}</Text>
            <Text style={s.photoCardText}>{duiReverso ? 'Reverso\ntomado' : 'Tomar\nreverso'}</Text>
          </TouchableOpacity>
        </View>
        {(frenteError || reversoError) && <Text style={s.errorText}>{frenteError || reversoError}</Text>}
        {(duiFrente || duiReverso) && (
          <View style={s.previewContainer}>
            {duiFrente && (
              <TouchableOpacity onPress={() => { setPreviewImage(duiFrente.uri); setPreviewVisible(true); }} style={s.previewItem}>
                <Image source={{ uri: duiFrente.uri }} style={s.previewImage} />
                <Text style={s.previewLabel}>Frente</Text>
              </TouchableOpacity>
            )}
            {duiReverso && (
              <TouchableOpacity onPress={() => { setPreviewImage(duiReverso.uri); setPreviewVisible(true); }} style={s.previewItem}>
                <Image source={{ uri: duiReverso.uri }} style={s.previewImage} />
                <Text style={s.previewLabel}>Reverso</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Foto de la casa */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>🏠 Foto de la casa</Text>
          <Text style={s.cardRequired}>Opcional</Text>
        </View>
        <TouchableOpacity
          style={[s.photoCard, fotoCasa && s.photoCardDone]}
          onPress={tomarFotoCasa}
        >
          <Text style={s.photoCardIcon}>{fotoCasa ? '✓' : '📸'}</Text>
          <Text style={s.photoCardText}>{fotoCasa ? 'Foto tomada\n(toca para cambiar)' : 'Tomar foto\nde la casa'}</Text>
        </TouchableOpacity>
        {fotoCasa && (
          <TouchableOpacity onPress={() => { setPreviewImage(fotoCasa.uri); setPreviewVisible(true); }} style={s.previewItem}>
            <Image source={{ uri: fotoCasa.uri }} style={s.previewImage} />
          </TouchableOpacity>
        )}
      </View>

      {/* Botón submit */}
      <TouchableOpacity
        style={[
          s.submitBtn,
          (!canSubmit()) && s.submitBtnDisabled,
          loading && s.submitBtnLoading
        ]}
        onPress={handleSubmit}
        disabled={!canSubmit() || loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={s.submitBtnText}>✅ Crear Cliente</Text>
        )}
      </TouchableOpacity>

      {/* Modal de previsualización */}
      <Modal
        visible={previewVisible}
        transparent={true}
        onRequestClose={() => setPreviewVisible(false)}
      >
        <TouchableOpacity 
          style={s.modalContainer}
          activeOpacity={1}
          onPress={() => setPreviewVisible(false)}
        >
          <View style={s.modalContent}>
            <Image source={{ uri: previewImage }} style={s.modalImage} />
            <TouchableOpacity 
              style={s.modalCloseBtn}
              onPress={() => setPreviewVisible(false)}
            >
              <Text style={s.modalCloseText}>✕ Cerrar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

// ==================== ESTILOS ====================
const styles = (colors) => StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },

  // ── HEADER ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 28,
    paddingTop: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  backBtnIcon: {
    fontSize: 20,
    color: colors.text,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    fontWeight: '500',
  },

  // ── TARJETAS ─────────────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  cardRequired: {
    fontSize: 10,
    color: colors.textMuted,
    fontStyle: 'italic',
  },

  // ── INPUTS ──────────────────────────────────────────────────────────────
  input: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 8,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
  },
  inputNoMargin: {
    marginBottom: 0,
  },
  inputError: {
    borderColor: '#dc2626',
    backgroundColor: '#dc262608',
  },
  inputWithButton: {
    position: 'relative',
    marginBottom: 8,
  },
  inputWithButtonInput: {
    paddingRight: 48,
  },
  inlineButton: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineButtonText: {
    fontSize: 16,
  },

  // ── ERRORES ──────────────────────────────────────────────────────────────
  errorText: {
    color: '#dc2626',
    fontSize: 12,
    marginBottom: 8,
    marginTop: -4,
    marginLeft: 2,
    fontWeight: '500',
  },

  // ── UBICACIÓN ────────────────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6,
  },
  halfInput: {
    flex: 1,
  },
  locationBtn: {
    backgroundColor: colors.accent + '15',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 2,
    borderWidth: 1,
    borderColor: colors.accent + '30',
  },
  locationBtnLoading: {
    opacity: 0.6,
  },
  locationBtnText: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 13,
  },

  // ── FOTOS ────────────────────────────────────────────────────────────────
  photoGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 2,
  },
  photoCard: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  photoCardDone: {
    backgroundColor: colors.accent + '12',
    borderColor: colors.accent,
    borderStyle: 'solid',
  },
  photoCardIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  photoCardText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 14,
  },

  // ── PREVISUALIZACIONES ───────────────────────────────────────────────────
  previewContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    marginBottom: 4,
  },
  previewItem: {
    flex: 1,
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: 90,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewLabel: {
    marginTop: 6,
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },

  // ── BOTÓN ENVÍO ──────────────────────────────────────────────────────────
  submitBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  submitBtnDisabled: {
    opacity: 0.48,
  },
  submitBtnLoading: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // ── MODAL ────────────────────────────────────────────────────────────────
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    alignItems: 'center',
  },
  modalImage: {
    width: '100%',
    height: 400,
    resizeMode: 'contain',
  },
  modalCloseBtn: {
    marginTop: 24,
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalCloseText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});