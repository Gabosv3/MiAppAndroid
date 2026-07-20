import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  StatusBar,
  Alert,
  Dimensions,
  ActivityIndicator,
  Modal,
  Platform,
  Switch,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import api, { esErrorTransitorio } from '../services/api';
import * as localDb from '../services/localDb';
import { guardarAsignacionCache, leerAsignacionCache } from '../services/localDb';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import escpos from '../services/escpos';
import * as offlineQueue from '../services/offlineQueue';
import { useConnectivity } from '../services/connectivity';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { extractTextFromImage } from '../services/ocr';

const { width: SW } = Dimensions.get('window');

// ==================== FUNCIONES HELPER ====================
const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const normalizePaymentPlans = (plans) => {
  if (!plans) return null;
  if (Array.isArray(plans)) return plans;
  if (typeof plans === 'string') {
    try {
      const parsed = JSON.parse(plans);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }
  return null;
};

// ==================== COMPONENTE PRINCIPAL ====================
export default function NuevaVentaScreen({ navigation }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();

  const sucursalId = user?.sucursales?.[0]?.id || 1;

  // ── Estados de API ──────────────────────────────────────────────────────────
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [asignacionId, setAsignacionId] = useState(null);
  const [asignMsg, setAsignMsg] = useState('');
  const [loadingAsignacion, setLoadingAsignacion] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [loadingProds, setLoadingProds] = useState(false);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [busquedaCliente, setBusquedaCliente] = useState('');

  // ── Estados UI ──────────────────────────────────────────────────────────────
  const [busqueda, setBusqueda] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState(null);
  const [carrito, setCarrito] = useState([]);
  const [cuotasModalVisible, setCuotasModalVisible] = useState(false);
  const [cuotasProduct, setCuotasProduct] = useState(null);
  const [cuotasEditingId, setCuotasEditingId] = useState(null);
  const [precioEspecial, setPrecioEspecial] = useState('');
  const [cambioPrecioStep, setCambioPrecioStep] = useState(false);
  const [ticketLogoUri, setTicketLogoUri] = useState(null);
  const [ticketQrUri, setTicketQrUri] = useState(null);
  const [cliente, setCliente] = useState({ id: null, nombre: 'Consumidor Final' });
  const [descuento, setDescuento] = useState('');
  const [pago, setPago] = useState('');
  const [usarPrima, setUsarPrima] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printerModalVisible, setPrinterModalVisible] = useState(false);
  const [printerAddr, setPrinterAddr] = useState('');
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);

  // ── Crear Cliente integrado ─────────────────────────────────────────────────
  const [crearClienteVisible, setCrearClienteVisible] = useState(false);
  const [ccNombre, setCcNombre] = useState('');
  const [ccApellido, setCcApellido] = useState('');
  const [ccDui, setCcDui] = useState('');
  const [ccTelefono, setCcTelefono] = useState('');
  const [ccWhatsapp, setCcWhatsapp] = useState('');
  const [ccEmail, setCcEmail] = useState('');
  const [ccLatitud, setCcLatitud] = useState('');
  const [ccLongitud, setCcLongitud] = useState('');
  const [ccFotoCasa, setCcFotoCasa] = useState(null);
  const [ccDuiFrente, setCcDuiFrente] = useState(null);
  const [ccDuiReverso, setCcDuiReverso] = useState(null);
  const [ccLoading, setCcLoading] = useState(false);
  const [ccLocationLoading, setCcLocationLoading] = useState(false);
  const [ccScanningOcr, setCcScanningOcr] = useState(false);
  const [ccPreviewVisible, setCcPreviewVisible] = useState(false);
  const [ccPreviewImage, setCcPreviewImage] = useState(null);
  const [ccEmailRequerido, setCcEmailRequerido] = useState(false);
  const [ccNombreError, setCcNombreError] = useState('');
  const [ccApellidoError, setCcApellidoError] = useState('');
  const [ccDuiError, setCcDuiError] = useState('');
  const [ccTelefonoError, setCcTelefonoError] = useState('');
  const [ccWhatsappError, setCcWhatsappError] = useState('');
  const [ccEmailError, setCcEmailError] = useState('');
  const [ccLatError, setCcLatError] = useState('');
  const [ccLongError, setCcLongError] = useState('');
  const [ccFrenteError, setCcFrenteError] = useState('');
  const [ccReversoError, setCcReversoError] = useState('');

  const ccDuiRegex = /^\d{8}-\d$/;
  const ccPhoneRegex = /^\d{4}-\d{4}$/;

  const ccFormatDui = (v) => { const d = v.replace(/\D/g,'').slice(0,9); return d.length<=8?d:`${d.slice(0,8)}-${d.slice(8)}`; };
  const ccFormatPhone = (v) => { const d = v.replace(/\D/g,'').slice(0,8); return d.length<=4?d:`${d.slice(0,4)}-${d.slice(4)}`; };

  const ccReset = () => {
    setCcNombre(''); setCcApellido(''); setCcDui(''); setCcTelefono('');
    setCcWhatsapp(''); setCcEmail(''); setCcLatitud(''); setCcLongitud('');
    setCcFotoCasa(null); setCcDuiFrente(null); setCcDuiReverso(null);
    setCcNombreError(''); setCcApellidoError(''); setCcDuiError('');
    setCcTelefonoError(''); setCcWhatsappError(''); setCcEmailError('');
    setCcLatError(''); setCcLongError(''); setCcFrenteError(''); setCcReversoError('');
  };

  useEffect(() => {
    AsyncStorage.getItem('POS_CONFIG').then(raw => {
      if (raw) { try { setCcEmailRequerido(!!JSON.parse(raw).emailRequerido); } catch {} }
    });
  }, []);

  const ccHandleDuiChange = (t) => {
    const f = ccFormatDui(t); setCcDui(f);
    if (!f) setCcDuiError('Requerido');
    else if (!ccDuiRegex.test(f)) setCcDuiError('Formato: 12345678-9');
    else setCcDuiError('');
  };
  const ccHandleTelChange = (t) => { const f=ccFormatPhone(t); setCcTelefono(f); setCcTelefonoError(!f?'Requerido':!ccPhoneRegex.test(f)?'Formato: 1234-5678':''); };
  const ccHandleWaChange  = (t) => { const f=ccFormatPhone(t); setCcWhatsapp(f);  setCcWhatsappError(!f?'Requerido':!ccPhoneRegex.test(f)?'Formato: 1234-5678':''); };

  const ccEscanearDui = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permiso requerido','Necesitamos acceso a la cámara.'); return; }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 1.0 });
      if (!result.canceled && result.assets?.[0]) {
        setCcScanningOcr(true);
        try {
          const datos = await extractTextFromImage(result.assets[0].uri);
          if (datos) {
            const campos = [];
            if (datos.dui && !ccDui)       { ccHandleDuiChange(datos.dui);                    campos.push(`✅ DUI: ${datos.dui}`); }
            if (datos.nombre && !ccNombre) { setCcNombre(datos.nombre); setCcNombreError(''); campos.push(`✅ Nombre: ${datos.nombre}`); }
            if (datos.apellido && !ccApellido) { setCcApellido(datos.apellido); setCcApellidoError(''); campos.push(`✅ Apellido: ${datos.apellido}`); }
            if (!datos.nombre && !ccNombre)     campos.push('✏️ Nombre: escríbelo manualmente');
            if (!datos.apellido && !ccApellido) campos.push('✏️ Apellido: escríbelo manualmente');
            Alert.alert(campos.length?'📋 Resultado':'⚠️ Sin datos', campos.length?campos.join('\n'):'No se pudo leer el DUI.');
          }
        } catch(e){ console.warn('OCR:',e.message); } finally { setCcScanningOcr(false); }
      }
    } catch(e){ Alert.alert('Error','No se pudo abrir la cámara.'); }
  };

  const ccTomarFoto = async (tipo) => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permiso requerido','Necesitamos acceso a la cámara.'); return; }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
      if (!result.canceled && result.assets?.[0]) {
        const file = { uri: result.assets[0].uri, name: `${tipo}_${Date.now()}.jpg`, type: 'image/jpeg' };
        if (tipo === 'dui_frente')  { setCcDuiFrente(file);  setCcFrenteError(''); }
        else if (tipo === 'dui_reverso') { setCcDuiReverso(file); setCcReversoError(''); }
        else if (tipo === 'casa')   { setCcFotoCasa(file); }
      }
    } catch(e){ Alert.alert('Error','No se pudo tomar la foto.'); }
  };

  const ccGetLocation = async () => {
    setCcLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permiso denegado','Debe permitir el acceso a la ubicación.'); return; }
      const pos = await Location.getCurrentPositionAsync({});
      setCcLatitud(pos.coords.latitude.toString());
      setCcLongitud(pos.coords.longitude.toString());
      Alert.alert('✅ Ubicación capturada','Coordenadas registradas correctamente.');
    } catch(e){ Alert.alert('Error', e.message||'No se pudo obtener la ubicación.'); }
    finally { setCcLocationLoading(false); }
  };

  const ccValidate = () => {
    let ok = true;
    if (!ccNombre.trim())                { setCcNombreError('Requerido'); ok=false; }
    if (!ccApellido.trim())              { setCcApellidoError('Requerido'); ok=false; }
    if (!ccDuiRegex.test(ccDui.trim())) { setCcDuiError('Formato: 12345678-9'); ok=false; }
    if (!ccPhoneRegex.test(ccTelefono.trim())) { setCcTelefonoError('Formato: 1234-5678'); ok=false; }
    if (!ccPhoneRegex.test(ccWhatsapp.trim()))  { setCcWhatsappError('Formato: 1234-5678'); ok=false; }
    if (!ccLatitud.trim())  { setCcLatError('Requerido'); ok=false; }
    if (!ccLongitud.trim()) { setCcLongError('Requerido'); ok=false; }
    if (!ccDuiFrente)  { setCcFrenteError('Toma la foto del frente del DUI'); ok=false; }
    if (!ccDuiReverso) { setCcReversoError('Toma la foto del reverso del DUI'); ok=false; }
    if (ccEmailRequerido && !ccEmail.trim()) { setCcEmailError('El email es requerido'); ok=false; }
    else if (ccEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ccEmail.trim())) { setCcEmailError('Formato inválido'); ok=false; }
    return ok;
  };

  const ccHandleSubmit = async () => {
    if (!ccValidate()) return;
    setCcLoading(true);
    try {
      const formData = new FormData();
      formData.append('nombre', ccNombre.trim());
      formData.append('apellido', ccApellido.trim());
      formData.append('dui', ccDui.trim());
      formData.append('telefono_normal', ccTelefono.trim());
      formData.append('telefono_whatsapp', ccWhatsapp.trim());
      formData.append('latitud', ccLatitud.trim());
      formData.append('longitud', ccLongitud.trim());
      if (ccEmail.trim()) formData.append('email', ccEmail.trim());
      const appendImg = (field, file) => { if(file?.uri) formData.append(field, { uri:file.uri, name:file.name||`${field}.jpg`, type:'image/jpeg' }); };
      appendImg('dui_foto_frente', ccDuiFrente);
      appendImg('dui_foto_reverso', ccDuiReverso);
      appendImg('foto_casa', ccFotoCasa);

      const { data } = await api.post('/clientes', formData, { timeout:30000, headers:{'Content-Type':'multipart/form-data'} });

      const nombreCompleto = `${data.nombre||ccNombre} ${data.apellido||ccApellido}`.trim();
      setCliente({ id: data.id, nombre: nombreCompleto, whatsapp: data.telefono_whatsapp||data.telefono_normal||null });
      setCrearClienteVisible(false);
      setShowClienteModal(false);
      setBusquedaCliente('');
      ccReset();
      Alert.alert('✅ Cliente creado', `${nombreCompleto} fue agregado y seleccionado.`);
    } catch(error) {
      const isOffline = esErrorTransitorio(error);
      if (isOffline) {
        await offlineQueue.enqueueRequest({ method:'POST', url:'/clientes', label:'Crear cliente', useFormData:true,
          data:{ nombre:ccNombre.trim(), apellido:ccApellido.trim(), dui:ccDui.trim(), telefono_normal:ccTelefono.trim(),
            telefono_whatsapp:ccWhatsapp.trim(), latitud:ccLatitud.trim(), longitud:ccLongitud.trim(),
            ...(ccDuiFrente&&{dui_foto_frente:ccDuiFrente}), ...(ccDuiReverso&&{dui_foto_reverso:ccDuiReverso}), ...(ccFotoCasa&&{foto_casa:ccFotoCasa}) } });
        const nombreCompleto = `${ccNombre} ${ccApellido}`.trim();
        setCliente({ id: null, nombre: nombreCompleto, whatsapp: ccWhatsapp||ccTelefono||null });
        setCrearClienteVisible(false);
        setShowClienteModal(false);
        setBusquedaCliente('');
        ccReset();
        Alert.alert('Guardado offline', 'El cliente se guardó localmente y se sincronizará cuando haya conexión.');
      } else {
        const msg = error.response?.data?.errors ? Object.values(error.response.data.errors).flat().join('\n') : error.response?.data?.message || error.message || 'Error al crear cliente.';
        Alert.alert('Error', msg);
      }
    } finally { setCcLoading(false); }
  };

  // ── Configuraciones POS ─────────────────────────────────────────────────────
  const CONFIG_KEY = 'POS_CONFIG';
  const CONFIG_PASSWORD = '01041998';
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [passModalVisible, setPassModalVisible] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState('');
  const [cfgEmailRequerido, setCfgEmailRequerido] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CONFIG_KEY).then(raw => {
      if (raw) {
        try { const cfg = JSON.parse(raw); setCfgEmailRequerido(!!cfg.emailRequerido); } catch {}
      }
    });
  }, []);

  const guardarConfig = async (nuevaCfg) => {
    await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(nuevaCfg));
  };

  const abrirConfig = () => {
    setPassInput('');
    setPassError('');
    setPassModalVisible(true);
  };

  const verificarPassword = () => {
    if (passInput === CONFIG_PASSWORD) {
      setPassModalVisible(false);
      setConfigModalVisible(true);
    } else {
      setPassError('Contraseña incorrecta');
    }
  };

  // ── Cálculos memorizados ────────────────────────────────────────────────────
  const cartTotals = useMemo(() => {
    const subtotal = carrito.reduce((s, i) => {
      // precio_venta ya tiene el total correcto (normal, cuotas o vendedor)
      return s + (parseFloat(i.precio_venta || 0) * Number(i.cantidad || 1));
    }, 0);
    
    const descVal = parseFloat(descuento) || 0;
    const descPct = subtotal > 0 ? (descVal / subtotal) * 100 : 0;
    const total = Math.max(0, subtotal - descVal);
    const anyCredito = carrito.some(i => Number(i.cuotas) > 0);
    const allCredito = carrito.length > 0 && carrito.every(i => Number(i.cuotas) > 0);
    const tipoPago = anyCredito ? 'credito' : 'contado';
    const pagoVal = (usarPrima || tipoPago === 'contado') ? (parseFloat(pago) || 0) : 0;
    const vuelto = Math.max(0, pagoVal - total);
    const esMixto = anyCredito && !allCredito;

    return { subtotal, descVal, descPct, total, pagoVal, vuelto, tipoPago, esMixto };
  }, [carrito, descuento, pago, usarPrima]);

  // ── Cargar categorías ─────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/categorias')
      .then(({ data }) => setCategorias(data))
      .catch(async (error) => {
        const isOffline = esErrorTransitorio(error);
        if (isOffline) {
          const categoriasLocales = await localDb.getLocalCategories();
          if (Array.isArray(categoriasLocales) && categoriasLocales.length > 0) {
            setCategorias(categoriasLocales);
          }
        }
      });
  }, []);

  // ── Cargar imágenes del ticket con caché ───────────────────────────────────
  const loadTicketImages = useCallback(async () => {
    // Si ya tenemos las imágenes, no las cargamos de nuevo
    if (ticketLogoUri && ticketQrUri) return;

    const toBase64 = async (uri) => {
      if (!uri) return null;
      if (Platform.OS === 'web') {
        try {
          const response = await fetch(uri);
          const blob = await response.blob();
          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          const chunkSize = 0x8000;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          return btoa(binary);
        } catch (err) {
          console.warn('No se pudo convertir imagen a base64 en web:', err);
          return null;
        }
      }
      return FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    };

    try {
      const logoAsset = Asset.fromModule(require('../assets/img/logo.png'));
      const qrAsset = Asset.fromModule(require('../assets/img/OC25Mc.png'));
      if (!logoAsset.localUri) await logoAsset.downloadAsync();
      if (!qrAsset.localUri) await qrAsset.downloadAsync();

      const logoUri = logoAsset.localUri || logoAsset.uri;
      const qrUri = qrAsset.localUri || qrAsset.uri;
      const logoBase64 = logoUri ? await toBase64(logoUri) : null;
      const qrBase64 = qrUri ? await toBase64(qrUri) : null;

      setTicketLogoUri(logoBase64 ? `data:image/png;base64,${logoBase64}` : logoUri || null);
      setTicketQrUri(qrBase64 ? `data:image/png;base64,${qrBase64}` : qrUri || null);
    } catch (e) {
      console.warn('Error cargando imágenes del ticket:', e);
    }
  }, [ticketLogoUri, ticketQrUri]);

  useEffect(() => {
    loadTicketImages();
  }, [loadTicketImages]);

  // ── Imprimir ticket ────────────────────────────────────────────────────────
  const printTicket = useCallback(async (sale, totals, cartItems) => {
    setPrinting(true);
    
    try {
      await loadTicketImages();
      
      const date = new Date(sale.fecha_venta || Date.now()).toLocaleString();
      const clienteNombre = sale.cliente?.nombre || cliente?.nombre || 'Consumidor Final';
      const tipoPagoLabel = (sale.tipo_pago || totals.tipoPago) === 'credito' ? 'Crédito' : 'Contado';
      const detalles = sale.detalles || cartItems || [];
      const cajaNombre = escapeHtml(String(sale.caja || sale.caja_numero || sale.caja_id || '01'));
      const sucursalNombre = escapeHtml(String(sale.sucursal?.nombre || sale.sucursal_nombre || sale.sucursal || user?.sucursales?.[0]?.nombre || 'Casa Matriz'));
      const vendedorNombre = escapeHtml(String(sale.vendedor?.nombre || sale.vendedor || user?.name || user?.nombre || 'Vendedor'));
      const ventaNumero = escapeHtml(String(sale.numero_venta || sale.id || 'N/A'));
      
      const logoHtml = ticketLogoUri ? `<div style="text-align:center; margin-bottom:12px"><img src="${ticketLogoUri}" style="max-width:180px; width:180px; height:auto; display:block; margin:0 auto" /></div>` : '';
      const qrHtml = ticketQrUri ? `<div style="background:#f0f0f0; color:#555; text-align:center; padding:18px 0; font-size:12px; margin-bottom:10px"><img src="${ticketQrUri}" style="max-width:180px; width:180px; height:auto; display:block; margin:0 auto" /></div>` : '<div style="background:#f0f0f0; color:#555; text-align:center; padding:18px 0; font-size:12px; margin-bottom:10px">[ QR ]</div>';

      const itemsHtml = detalles.map(d => {
        const name = escapeHtml(d.nombre || d.producto?.nombre || `ID:${d.producto_id || ''}`);
        const priceNormal = parseFloat(d.precio_unitario || d.precio_venta || 0);
        const qty = Number(d.cantidad || 1);
        const planEnabled = Number(d.cuotas || 0) > 0 && Number(d.precio_cuota || 0) > 0;
        const cambioPrecioVendedor = String(d.planLabel || '').toLowerCase().includes('cambio de precio');

        let priceText = `<div style="font-size:12px; margin-top:3px;">Precio: ${fmt(priceNormal)}</div>`;
        let planText = '';

        if (planEnabled) {
          priceText = `<div style="font-size:12px; margin-top:3px;">Precio cuota: ${fmt(d.precio_cuota)}</div>`;
          planText = `<div style="margin-top:4px; font-size:12px; font-weight:700;">Plan de financiamiento:</div><div style="font-size:12px;">${d.cuotas} cuotas de ${fmt(d.precio_cuota)}</div>`;
        } else if (cambioPrecioVendedor) {
          priceText = `<div style="font-size:12px; margin-top:3px;">Precio vendedor: ${fmt(priceNormal)}</div>`;
        }

        return `
          <div style="margin-bottom:8px;">
            <div style="font-size:13px; font-weight:700;">${name}</div>
            <div style="font-size:12px; margin-top:3px; color:#555">Cantidad: ${qty}</div>
            ${priceText}
            ${planText}
          </div>
          <div style="border-top:1px dashed #555; margin:8px 0"></div>
        `;
      }).join('');

      const html = `
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            * { box-sizing: border-box; }
            body{ font-family: Arial, Helvetica, sans-serif; font-size:14px; width:100%; max-width:380px; margin:0 auto; padding:12px; }
            h3{ margin:0; font-size:22px }
            .center{ text-align:center }
            .right{ text-align:right }
            .small{ font-size:13px; color:#555 }
            .label{ font-size:14px; font-weight:700 }
            .divider{ border-top:2px dashed #333; margin:12px 0 }
            .section-title{ font-size:14px; font-weight:700; margin-bottom:8px }
            .text-sm{ font-size:13px; }
            .product-name{ font-size:15px; font-weight:700; }
            td{ vertical-align: top; padding: 4px 2px; font-size: 13px; word-break: break-word; }
            table{ width: 100%; border-collapse: collapse; table-layout: fixed; }
            td:first-child{ width: 60%; }
            td:last-child{ width: 40%; text-align: right; }
          </style>
        </head>
        <body>
          ${logoHtml}
          <div class="center">
            <div style="font-size:22px; font-weight:800; margin-bottom:6px">DISTRIBUIDORA BM</div>
            <div style="font-size:13px; margin-bottom:4px; color:#555">Muebles • Electrodomésticos</div>
          </div>
          <div style="font-size:12px; margin-top:8px; line-height:18px; color:#555">
            Teléfono: +503 7777-7777<br />
            WhatsApp: +503 7777-7777<br />
            Correo: ventas@bmdistribuidora.com<br />
            Web: www.bmdistribuidora.com
          </div>
          <div style="font-size:12px; margin-top:8px; color:#555">Dirección:<br />Usulután, El Salvador</div>
          <div class="divider"></div>
          <div style="font-size:14px; font-weight:700; text-align:center; margin-bottom:8px">━ TICKET DE VENTA ━</div>
          <div style="font-size:12px; margin-bottom:3px"><strong>Venta No:</strong> ${ventaNumero}</div>
          <div style="font-size:12px; margin-bottom:3px"><strong>Fecha:</strong> ${escapeHtml(date)}</div>
          <div style="font-size:12px; margin-bottom:3px"><strong>Caja:</strong> ${cajaNombre}</div>
          <div style="font-size:12px; margin-bottom:3px"><strong>Sucursal:</strong> ${sucursalNombre}</div>
          <div style="font-size:12px; margin-top:6px"><strong>Vendedor:</strong> ${vendedorNombre}</div>
          <div style="font-size:12px; margin-top:4px"><strong>Cliente:</strong> ${escapeHtml(clienteNombre)}</div>
          <div class="divider"></div>
          <div style="font-size:16px; font-weight:700; margin-bottom:10px">PRODUCTOS</div>
          ${itemsHtml}
          <div class="divider"></div>
          <table>
            <tr><td style="font-size:13px">Subtotal</td><td style="text-align:right;font-weight:600;font-size:13px">${fmt(totals.subtotal)}</td></tr>
            <tr><td style="font-size:13px">Descuento</td><td style="text-align:right;font-weight:600;font-size:13px">${fmt(totals.descVal)}</td></tr>
            <tr><td style="font-size:16px;font-weight:800"><strong>TOTAL</strong></td><td style="text-align:right;font-size:16px;font-weight:800">${fmt(totals.total)}</td></tr>
          </table>
          <div class="divider"></div>
          <div style="font-size:13px; margin-bottom:6px"><strong>Forma de pago:</strong> ${escapeHtml(tipoPagoLabel)}</div>
          <table>
            ${totals.tipoPago === 'credito'
              ? `<tr><td style="font-weight:700;font-size:13px">Prima inicial</td><td style="text-align:right;font-weight:800;font-size:14px">${totals.pagoVal > 0 ? fmt(totals.pagoVal) : 'Sin prima'}</td></tr>`
              : `<tr><td style="font-size:13px">Pago recibido</td><td style="text-align:right;font-weight:600;font-size:13px">${fmt(totals.pagoVal)}</td></tr>
                 <tr><td style="font-size:13px">Vuelto</td><td style="text-align:right;font-weight:600;font-size:13px">${fmt(totals.vuelto)}</td></tr>`
            }
          </table>
          <div class="divider"></div>
          <div style="font-size:14px; font-weight:700; margin-bottom:6px">GARANTÍA Y CONSULTAS</div>
          <div style="font-size:13px; line-height:19px; margin-bottom:10px; color:#555">
            Conserve este comprobante para cambios, garantías y consultas.<br />
            Escanee el código QR para:<br />
            • Consultar su compra<br />
            • Ver estado de cuotas<br />
            • Descargar comprobante<br />
            • Contactar soporte
          </div>
          ${qrHtml}
          <div class="divider"></div>
          <div style="text-align:center; font-size:15px; font-weight:700; margin-bottom:6px">¡Gracias por su compra!</div>
          <div style="text-align:center; font-size:13px; color:#555">DISTRIBUIDORA BM<br />"Equipando su hogar con calidad"</div>
        </body>
        </html>
      `;

      await Print.printAsync({ html });
    } catch (error) {
      console.error('Error printing ticket:', error);
      Alert.alert('Error', 'No se pudo imprimir el ticket');
    } finally {
      setPrinting(false);
    }
  }, [ticketLogoUri, ticketQrUri, cliente?.nombre, user, loadTicketImages]);

  // ── Impresión ESC/POS ──────────────────────────────────────────────────────
  const attemptEscPosPrint = useCallback(async (sale) => {
    try {
      // Intentar con dirección guardada
      const addr = await escpos.getSavedPrinterAddress().catch(() => null);
      if (addr) {
        try {
          await escpos.connect(addr);
          await escpos.printSaleEscPos(sale);
          return true;
        } catch (e) {
          console.warn('Fallo al conectar/usar impresora guardada:', e?.message || e);
        }
      }

      // Escanear dispositivos y probar el primero
      const devices = await escpos.listBluetoothDevices();
      let list = devices;
      if (devices && typeof devices === 'object' && !Array.isArray(devices)) {
        list = devices.paired || devices.devices || Object.values(devices);
      }
      if (Array.isArray(list) && list.length > 0) {
        const first = list[0];
        const address = first.address || first.deviceAddress || first.mac || first;
        if (address) {
          await escpos.connect(address);
          await escpos.printSaleEscPos(sale);
          await escpos.savePrinterAddress(address).catch(() => {});
          return true;
        }
      }
    } catch (e) {
      console.warn('Error al escanear/usar dispositivos Bluetooth:', e?.message || e);
    }
    return false;
  }, []);

  // ── Guardar configuración de impresora ─────────────────────────────────────
  const savePrinter = useCallback(async () => {
    if (!printerAddr.trim()) {
      Alert.alert('Error', 'Ingrese una dirección válida');
      return;
    }
    await escpos.savePrinterAddress(printerAddr).catch(() => {});
    setPrinterModalVisible(false);
    Alert.alert('Impresora guardada', `Dirección: ${printerAddr}`);
  }, [printerAddr]);

  // ── Cargar asignación activa ──────────────────────────────────────────────
  const cargarAsignacionHoy = useCallback(async () => {
    setAsignMsg('');
    setLoadingAsignacion(true);
    try {
      const { data } = await api.get('/asignacion/hoy');
      const asignacion = data.asignacion;

      if (!asignacion || !asignacion.productos || asignacion.productos.length === 0) {
        setAsignMsg('No hay asignación activa para hoy');
        setProductos([]);
        setAsignacionId(null);
        setLoadingAsignacion(false);
        return;
      }

      setAsignacionId(asignacion.id || null);

      const mapped = (asignacion.productos || []).map(p => {
        const stock_disponible = Number(p.cantidad_asignada ?? 0) - Number(p.cantidad_vendida ?? 0);
        const paymentPlans = normalizePaymentPlans(p.precios_cuotas || null);

        return {
          id: p.producto_id,
          nombre: p.nombre,
          codigo: p.codigo || null,
          descripcion: null,
          unidad_medida: p.unidad_medida || null,
          precio_venta: Number(p.precio_venta ?? 0),
          precios_cuotas: Array.isArray(paymentPlans) ? paymentPlans : null,
          stock_global: null,
          stock_asignado: Number(p.cantidad_asignada ?? 0),
          stock_disponible: Math.max(0, stock_disponible),
          cantidad_vendida: Number(p.cantidad_vendida ?? 0),
          categoria: p.categoria || null,
          categoria_id: p.categoria_id || null,
          sucursal_id: asignacion.sucursal_id || sucursalId,
          imagen: p.imagen || null,
          asignacion_detalle_id: p.id || null,
        };
      });

      // Extraer categorías únicas de los productos
      const uniqueCategories = Array.from(new Map(
        mapped
          .filter(p => p.categoria_id && p.categoria)
          .map(p => [p.categoria_id, { id: p.categoria_id, nombre: p.categoria }])
      ).values());

      setAsignMsg('');
      setProductos(mapped);
      setCategorias(uniqueCategories);

      // Guardar caché con fecha de hoy para uso offline
      await guardarAsignacionCache({
        productos: mapped,
        categorias: uniqueCategories,
        asignacionId: asignacion.id || null,
        sucursalId: asignacion.sucursal_id || sucursalId,
      });
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || String(e);
      const isOffline = esErrorTransitorio(e);

      if (msg.includes('No hay asignación') || e?.response?.status === 404) {
        setAsignMsg('No hay asignación activa para hoy');
        setProductos([]);
      } else if (isOffline) {
        // Usar caché de la asignación de HOY solamente
        const cache = await leerAsignacionCache();
        if (cache) {
          setProductos(cache.productos);
          setCategorias(cache.categorias || []);
          setAsignacionId(cache.asignacionId);
          setAsignMsg('Sin conexión — mostrando asignación de hoy guardada');
        } else {
          setAsignMsg('Sin conexión y no hay asignación de hoy guardada.\nConéctate una vez para cargar la asignación del día.');
          setProductos([]);
        }
      } else {
        setAsignMsg(`Error: ${msg}`);
        setProductos([]);
      }
      setAsignacionId(null);
    } finally {
      setLoadingAsignacion(false);
    }
  }, [sucursalId]);

  // ── Efectos de carga ──────────────────────────────────────────────────────
  useFocusEffect(useCallback(() => { cargarAsignacionHoy(); }, [cargarAsignacionHoy]));

  // ── Cargar clientes ───────────────────────────────────────────────────────
  const cargarClientes = useCallback(async (q = '') => {
    try {
      let qs = 'per_page=30';
      if (q) qs += `&q=${encodeURIComponent(q)}`;
      const { data } = await api.get(`/clientes?${qs}`);
      setClientes(Array.isArray(data) ? data : (data.data || []));
    } catch (error) {
      const isOffline = esErrorTransitorio(error);
      if (isOffline) {
        // Offline: buscar en la BD local filtrado por query
        const clientesLocales = await localDb.searchLocalClients(q);
        setClientes(Array.isArray(clientesLocales) ? clientesLocales : []);
      }
    }
  }, []);

  useEffect(() => {
    if (!showClienteModal) return;
    const timer = setTimeout(() => cargarClientes(busquedaCliente), 350);
    return () => clearTimeout(timer);
  }, [busquedaCliente, showClienteModal, cargarClientes]);

  // ── Operaciones del carrito ───────────────────────────────────────────────
  const agregarProducto = useCallback((producto) => {
    const paymentPlans = normalizePaymentPlans(producto.precios_cuotas || producto.preciosCuotas || null);

    // Siempre mostrar modal de forma de pago (con o sin planes)
    setCuotasProduct({
      ...producto,
      precios_cuotas: (paymentPlans && paymentPlans.length > 0) ? paymentPlans : []
    });
    setCuotasModalVisible(true);
  }, []);

  const calcularTotalItem = useCallback((item) => {
    // precio_venta ya contiene el total correcto del plan elegido
    return parseFloat(item.precio_venta || 0) * Number(item.cantidad || 1);
  }, []);

  const cambiarCantidad = useCallback((id, delta) => {
    setCarrito(prev =>
      prev.map(i => {
        if (i.id !== id) return i;
        const prod = productos.find(p => p.id === id) || i;
        
        if (delta > 0) {
          const available = (prod.stock_disponible || 0) - i.cantidad;
          if (available <= 0) {
            Alert.alert('Stock insuficiente', 'No hay suficiente stock disponible para aumentar la cantidad.');
            return i;
          }
        }
        
        return { ...i, cantidad: Math.max(0, i.cantidad + delta) };
      }).filter(i => i.cantidad > 0)
    );
  }, [productos]);

  const iniciarCambioPrecioVendedor = useCallback(() => {
    setPrecioEspecial('');
    setCambioPrecioStep(true);
  }, []);

  const cancelarCambioPrecioVendedor = useCallback(() => {
    setPrecioEspecial('');
    setCambioPrecioStep(false);
  }, []);

  const confirmarCambioPrecioVendedor = useCallback(() => {
    const precio = parseFloat(String(precioEspecial).replace(',', '.'));
    if (isNaN(precio) || precio <= 0) {
      Alert.alert('Precio inválido', 'Ingresa un precio válido mayor a 0.');
      return;
    }
    seleccionarPlanCuotas({ tipo: 'cambio_precio_vendedor', precio_venta: precio });
  }, [precioEspecial]);

  const seleccionarPlanCuotas = useCallback((plan) => {
    const producto = cuotasProduct;
    if (!producto) return;
    
    setCuotasModalVisible(false);
    setCambioPrecioStep(false);
    setPrecioEspecial('');
    
    const planObj = plan === null ? null : plan;
    const esCuotas = planObj && planObj.tipo !== 'cambio_precio_vendedor';
    const esCambioPrecio = planObj?.tipo === 'cambio_precio_vendedor';

    const numCuotas = esCuotas ? Number(planObj.cuotas) : undefined;
    const precioCuota = esCuotas ? Number(planObj.precio_cuota ?? planObj.precio ?? 0) : undefined;

    // Precio que se muestra y se envía:
    // - Si hay cuotas: total = cuotas × precio_cuota
    // - Si es cambio de precio vendedor: el precio especial
    // - Si es precio normal: precio_venta del producto
    let precioVenta;
    if (esCuotas) {
      precioVenta = numCuotas * precioCuota; // Total del plan, ej: 6 × $12 = $72
    } else if (esCambioPrecio) {
      precioVenta = Number(planObj.precio_venta ?? planObj.precio ?? producto.precio_venta);
    } else {
      precioVenta = Number(producto.precio_venta ?? 0);
    }

    const planLabel = esCambioPrecio
      ? 'Cambio de precio de vendedor'
      : esCuotas
        ? `${numCuotas} cuotas de ${fmt(precioCuota)}`
        : undefined;

    // Si estamos editando un item existente
    if (cuotasEditingId) {
      setCarrito(prev => prev.map(i => {
        if (String(i.id) !== String(cuotasEditingId)) return i;
        return {
          ...i,
          cuotas: numCuotas,
          precio_cuota: precioCuota,
          precio_venta: precioVenta,
          planLabel,
        };
      }));
      setCuotasEditingId(null);
      setCuotasProduct(null);
      return;
    }

    // Agregar nuevo producto al carrito (o actualizar plan si ya existe)
    setCarrito(prev => {
      const productId = producto.producto_id || producto.id;
      const existe = prev.find(i => i.id === productId);
      const planData = {
        cuotas: numCuotas,
        precio_cuota: precioCuota,
        precio_venta: precioVenta,
        planLabel,
      };

      if (existe) {
        return prev.map(i => i.id === productId
          ? { ...i, cantidad: i.cantidad + 1, ...planData }
          : i
        );
      }
      return [...prev, { ...producto, id: productId, cantidad: 1, ...planData }];
    });
    setCuotasProduct(null);
  }, [cuotasProduct, cuotasEditingId]);

  const abrirEditarPlan = useCallback((cartItem) => {
    const product = productos.find(p => String(p.id) === String(cartItem.id)) || cartItem;
    const paymentPlans = normalizePaymentPlans(product.precios_cuotas || product.preciosCuotas || null);

    setCuotasProduct({
      ...product,
      precios_cuotas: (paymentPlans && paymentPlans.length > 0) ? paymentPlans : []
    });
    setCuotasEditingId(cartItem.id);
    setCuotasModalVisible(true);
  }, [productos]);

  const limpiarVenta = useCallback(() => {
    setCarrito([]);
    setPago('');
    setDescuento('');
    setCliente({ id: null, nombre: 'Consumidor Final' });
  }, []);

  // ── Confirmar venta (mostrar resumen) ─────────────────────────────────────
  const confirmarVenta = useCallback(async () => {
    if (carrito.length === 0) {
      Alert.alert('Sin productos', 'Agrega al menos un producto.');
      return;
    }

    // Cliente es requerido
    if (!cliente.id) {
      Alert.alert(
        '⚠️ Cliente requerido',
        'Debes seleccionar un cliente antes de confirmar la venta.',
        [{ text: 'Seleccionar cliente', onPress: () => setShowClienteModal(true) }]
      );
      return;
    }

    setConfirmModalVisible(true);
  }, [carrito.length, cliente.id]);

  // ── Finalizar venta (enviar al servidor) ───────────────────────────────────
  const finalizarVenta = useCallback(async () => {
    setConfirmModalVisible(false);

    // Cliente_id: usar 0 para Consumidor Final (si id es null)
    const clienteId = cliente.id || 0;

    const payload = {
      sucursal_id: sucursalId,
      tipo_pago: cartTotals.tipoPago,
      ...(cartTotals.tipoPago === 'credito' ? { dias_credito: 30 } : {}),
      cliente_id: clienteId,
      ...(cartTotals.pagoVal > 0
        ? cartTotals.tipoPago === 'credito'
          ? { abono_inicial: cartTotals.pagoVal, prima: cartTotals.pagoVal }
          : { pago_recibido: cartTotals.pagoVal }
        : {}),
      ...(cartTotals.descPct > 0 ? { descuento_porcentaje: parseFloat(cartTotals.descPct.toFixed(4)) } : {}),
      ...(asignacionId ? { asignacion_id: asignacionId } : {}),
      detalles: carrito.map(i => {
        const esCredito = Number(i.cuotas) > 0;
        const precio_unitario = esCredito && i.precio_cuota
          ? Number(i.cuotas) * Number(i.precio_cuota)
          : parseFloat(i.precio_venta || 0);

        return {
          producto_id: i.id,
          cantidad: i.cantidad,
          precio_unitario,
          descuento_porcentaje: 0,
          tipo_pago: esCredito ? 'credito' : 'contado',
          ...(i.asignacion_detalle_id ? { asignacion_detalle_id: i.asignacion_detalle_id } : {}),
          ...(esCredito ? { cuotas: Number(i.cuotas), precio_cuota: Number(i.precio_cuota) } : {}),
        };
      }),
    };

    setSubmitting(true);
    
    try {
      const { data } = await api.post('/ventas', payload);

      const carritoSnapshot = [...carrito];
      const totalsSnapshot  = { ...cartTotals, clienteNombre: cliente.nombre };
      limpiarVenta();

      navigation.replace('VentaRegistrada', {
        venta:           data,
        carrito:         carritoSnapshot,
        totals:          totalsSnapshot,
        clienteWhatsapp: cliente.whatsapp || cliente.telefono || null,
      });
      
    } catch (e) {
      const offlineError = esErrorTransitorio(e);
      if (offlineError) {
        try {
          await offlineQueue.enqueueRequest({
            method: 'POST',
            url: '/ventas',
            label: 'Venta pendiente',
            data: payload,
          });

          const carritoSnap = [...carrito];
          const totalsSnap  = { ...cartTotals, clienteNombre: cliente.nombre };
          const tempData    = {
            numero_venta: `OFFLINE-${Date.now()}`,
            total: cartTotals.total,
            subtotal: cartTotals.subtotal,
            fecha_venta: new Date().toISOString(),
          };
          limpiarVenta();
          navigation.replace('VentaRegistrada', {
            venta:           tempData,
            carrito:         carritoSnap,
            totals:          totalsSnap,
            clienteWhatsapp: cliente.whatsapp || cliente.telefono || null,
          });
          return;
        } catch (queueError) {
          console.warn('Error guardando venta offline:', queueError);
          Alert.alert('Error offline', queueError.message || 'No se pudo guardar la venta offline.');
          return;
        }
      }
      Alert.alert('Error al registrar', e.message || 'Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }, [carrito, cartTotals, sucursalId, cliente.id, asignacionId, limpiarVenta, printTicket, attemptEscPosPrint]);

  // ── Restaurar dirección de impresora guardada ─────────────────────────────
  useEffect(() => {
    (async () => {
      const addr = await escpos.getSavedPrinterAddress().catch(() => null);
      if (addr) setPrinterAddr(addr);
    })();
  }, []);

  // ── Productos visibles (filtrados) ───────────────────────────────────────
  const productosVisibles = useMemo(() => {
    return productos.filter((p) => {
      const texto = `${p.nombre || ''} ${p.codigo || ''}`.toLowerCase();
      const coincideBusqueda = texto.includes(busqueda.toLowerCase());
      const coincideCategoria = !categoriaActiva || String(p.categoria_id) === String(categoriaActiva);
      return coincideBusqueda && coincideCategoria;
    });
  }, [productos, busqueda, categoriaActiva]);

  const s = styles(colors);
  const catList = [{ id: null, nombre: 'Todos' }, ...categorias];

  // ──────────────────────────────── RENDER ────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.headerBg} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.hBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.hIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.hTitle}>Nueva Venta</Text>
        <View style={s.hRight}>
          <View style={[
            s.statusIndicator,
            { backgroundColor: isOnline ? '#10B981' : '#e53e3e' }
          ]}>
            <Text style={{ fontSize: 9 }}>{isOnline ? '●' : '●'}</Text>
          </View>
          <TouchableOpacity onPress={abrirConfig} style={[s.hBtn, { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6, paddingHorizontal: 8 }]}>
            <Text style={[s.hIcon, { fontSize: 12 }]}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('HistorialVentas')} style={[s.hBtn, { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6, paddingHorizontal: 8 }]}>
            <Text style={[s.hIcon, { fontSize: 12 }]}>📋 Historial</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.hBtn}>
            <Text style={[s.hIcon, { fontSize: 18 }]}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal contraseña configuraciones */}
      <Modal visible={passModalVisible} transparent animationType="fade">
        <View style={s.cfgOverlay}>
          <View style={[s.cfgBox, { backgroundColor: colors.surface }]}>
            <Text style={[s.cfgTitle, { color: colors.text }]}>🔒 Configuraciones</Text>
            <Text style={[s.cfgSubtitle, { color: colors.textMuted }]}>Ingresa la contraseña de administrador</Text>
            <TextInput
              style={[s.cfgInput, { borderColor: passError ? '#e53e3e' : colors.border, color: colors.text, backgroundColor: colors.bg }]}
              value={passInput}
              onChangeText={t => { setPassInput(t); setPassError(''); }}
              secureTextEntry
              placeholder="Contraseña"
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={verificarPassword}
              autoFocus
            />
            {passError ? <Text style={s.cfgError}>{passError}</Text> : null}
            <View style={s.cfgBtnRow}>
              <TouchableOpacity style={[s.cfgBtn, { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }]} onPress={() => setPassModalVisible(false)}>
                <Text style={[s.cfgBtnText, { color: colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.cfgBtn, { backgroundColor: colors.accent }]} onPress={verificarPassword}>
                <Text style={[s.cfgBtnText, { color: '#fff' }]}>Entrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal configuraciones */}
      <Modal visible={configModalVisible} transparent animationType="slide">
        <View style={s.cfgOverlay}>
          <View style={[s.cfgBox, { backgroundColor: colors.surface }]}>
            <Text style={[s.cfgTitle, { color: colors.text }]}>⚙️ Configuraciones POS</Text>

            <View style={s.cfgRow}>
              <View style={{ flex: 1 }}>
                <Text style={[s.cfgRowLabel, { color: colors.text }]}>Requerir email al registrar clientes</Text>
                <Text style={[s.cfgRowSub, { color: colors.textMuted }]}>Si está activo, el email es obligatorio al crear un cliente nuevo</Text>
              </View>
              <Switch
                value={cfgEmailRequerido}
                onValueChange={val => {
                  setCfgEmailRequerido(val);
                  setCcEmailRequerido(val); // mantener sincronizado sin esperar a remontar la pantalla
                  guardarConfig({ emailRequerido: val });
                }}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            </View>

            <TouchableOpacity style={[s.cfgBtn, { backgroundColor: colors.accent, alignSelf: 'flex-end', marginTop: 16 }]} onPress={() => setConfigModalVisible(false)}>
              <Text style={[s.cfgBtnText, { color: '#fff' }]}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal selección de cuotas */}
      <Modal visible={cuotasModalVisible} animationType="slide" transparent>
        <View style={s.modalOverlayCuotas}>
          <View style={[s.modalBox, { maxHeight: '75%', padding: 16 }]}> 
            <View style={s.modalHeaderCuotas}>
              <Text style={[s.modalTitle, { fontSize: 17 }]}>Forma de pago</Text>
              <TouchableOpacity 
                onPress={() => { 
                  setCuotasModalVisible(false); 
                  setCuotasProduct(null); 
                  cancelarCambioPrecioVendedor(); 
                }} 
                style={s.modalCloseBtn}
              >
                <Text style={s.modalCloseTxt}>Cerrar</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.modalSubtitle}>Selecciona el precio o el plan de cuotas para este producto.</Text>
            
            {cambioPrecioStep ? (
              <View style={s.modalActionBox}>
                <Text style={s.modalOptionTitle}>{cuotasProduct?.nombre || 'Precio especial'}</Text>
                <Text style={s.modalOptionDesc}>Precio actual: {fmt(cuotasProduct?.precio_venta)}</Text>
                <TextInput
                  style={s.modalInput}
                  value={precioEspecial}
                  onChangeText={setPrecioEspecial}
                  keyboardType="numeric"
                  placeholder="Nuevo precio"
                  placeholderTextColor={colors.textMuted}
                />
                <View style={s.modalActionsRow}>
                  <TouchableOpacity style={[s.modalActionBtn, s.modalCancelBtn]} onPress={cancelarCambioPrecioVendedor}>
                    <Text style={s.modalActionBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.modalActionBtn} onPress={confirmarCambioPrecioVendedor}>
                    <Text style={s.modalActionBtnText}>Aplicar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <ScrollView contentContainerStyle={s.modalScrollContent}>
                <TouchableOpacity style={s.modalOption} onPress={() => seleccionarPlanCuotas(null)}>
                  <Text style={s.modalOptionTitle}>Precio normal</Text>
                  <Text style={s.modalOptionDesc}>Pago al contado sin cuotas</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalOption} onPress={iniciarCambioPrecioVendedor}>
                  <Text style={s.modalOptionTitle}>Cambio de precio de vendedor</Text>
                  <Text style={s.modalOptionDesc}>Aplicar precio especial por vendedor</Text>
                </TouchableOpacity>
                {cuotasProduct && Array.isArray(cuotasProduct.precios_cuotas) && cuotasProduct.precios_cuotas.map((p, idx) => {
                  const cuotaPrice = Number(p.precio_cuota ?? p.precio ?? 0);
                  const totalPlan = Number(p.cuotas || 0) * cuotaPrice;
                  return (
                    <TouchableOpacity key={idx} style={s.modalOption} onPress={() => seleccionarPlanCuotas(p)}>
                      <Text style={s.modalOptionTitle}>{p.cuotas} cuotas</Text>
                      <Text style={s.modalOptionDesc}>{p.cuotas} x {fmt(cuotaPrice)} = {fmt(totalPlan)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Buscador */}
      <View style={s.searchWrap}>
        <Text style={s.searchIco}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Buscar producto o código..."
          placeholderTextColor={colors.textMuted}
          value={busqueda}
          onChangeText={setBusqueda}
        />
        {busqueda.length > 0 && (
          <TouchableOpacity onPress={() => setBusqueda('')}>
            <Text style={{ color: colors.textMuted, fontSize: 16, paddingHorizontal: 8 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Categorías */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catRow} contentContainerStyle={s.catContent}>
        {catList.map(cat => (
          <TouchableOpacity
            key={String(cat.id)}
            onPress={() => setCategoriaActiva(cat.id)}
            style={[s.catChip, categoriaActiva === cat.id && s.catChipOn]}
            activeOpacity={0.75}
          >
            <Text style={[s.catLabel, categoriaActiva === cat.id && s.catLabelOn]}>{cat.nombre}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Cuerpo principal */}
      <View style={s.body}>
        {/* ═══ IZQUIERDA: Grid de productos ═══════════════════════════════ */}
        {loadingAsignacion ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color={colors.accent} size="large" />
            {asignMsg ? <Text style={{ color: colors.textMuted, marginTop: 8 }}>{asignMsg}</Text> : null}
          </View>
        ) : (
          <FlatList
            data={productosVisibles}
            keyExtractor={i => String(i.id)}
            numColumns={2}
            style={s.grid}
            contentContainerStyle={{ padding: 6 }}
            columnWrapperStyle={{ justifyContent: 'space-between' }}
            ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[s.prodCard, (item.stock_disponible ?? 0) <= 0 && { opacity: 0.6 }]}
                onPress={() => (item.stock_disponible ?? 0) > 0 && agregarProducto(item)}
                activeOpacity={0.8}
                disabled={(item.stock_disponible ?? 0) <= 0}
              >
                <View style={s.prodImgBox}>
                  <Text style={s.prodEmoji}>📦</Text>
                </View>
                <Text style={s.prodNombre} numberOfLines={2}>{item.nombre}</Text>
                {item.codigo ? <Text style={s.prodCodigo}>{item.codigo}</Text> : null}
                {item.precios_cuotas && Array.isArray(item.precios_cuotas) && item.precios_cuotas.length > 0 ? (
                  <Text style={s.prodCuotas}>Pago: contado o cuotas</Text>
                ) : null}
                <View style={s.prodFooter}>
                  <Text style={s.prodPrecio}>{fmt(item.precio_venta)}</Text>
                  <View style={s.stockBadge}>
                    <Text style={s.stockTxt}>{(item.stock_disponible ?? item.stock ?? 0) > 0 ? `Stock: ${item.stock_disponible}` : 'Sin stock'}</Text>
                  </View>
                  <TouchableOpacity
                    style={[s.addBtn, (item.stock_disponible ?? 0) <= 0 && s.addBtnDisabled]}
                    onPress={() => agregarProducto(item)}
                    disabled={(item.stock_disponible ?? 0) <= 0}
                  >
                    <Text style={s.addBtnTxt}>+</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingTop: 40 }}>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  {asignMsg || 'Sin productos disponibles'}
                </Text>
              </View>
            }
          />
        )}

        {/* ═══ DERECHA: Panel de venta ════════════════════════════════════ */}
        <View style={s.cartPanel}>
          <Text style={s.cartTitle}>Venta Actual</Text>

          {/* Cliente */}
          <TouchableOpacity
            style={s.clienteBtn}
            onPress={() => { setShowClienteModal(true); cargarClientes(); }}
            activeOpacity={0.8}
          >
            <Text style={s.clienteIco}>👤</Text>
            <Text style={s.clienteTxt} numberOfLines={1}>{cliente.nombre}</Text>
            <Text style={s.clienteChev}>▾</Text>
          </TouchableOpacity>

          {/* Items carrito */}
          <ScrollView style={s.cartList} showsVerticalScrollIndicator={false}>
            {carrito.length === 0 ? (
              <Text style={s.cartEmpty}>Selecciona productos{'\n'}del catálogo</Text>
            ) : (
              carrito.map(item => (
                <View key={item.id} style={s.cartItem}>
                  <Text style={s.cartItemEmoji}>📦</Text>
                  <View style={s.cartItemInfo}>
                    <View style={s.cartItemHeader}>
                      <Text style={s.cartItemNom} numberOfLines={1}>{item.nombre}</Text>
                      <Text style={s.cartItemPrc}>{fmt(calcularTotalItem(item))}</Text>
                    </View>
                    <View style={[s.itemTipoBadge, { backgroundColor: Number(item.cuotas) > 0 ? '#fff8e1' : '#e8f5e9' }]}>
                      <Text style={[s.itemTipoBadgeTxt, { color: Number(item.cuotas) > 0 ? '#F5A623' : '#2e7d32' }]}>
                        {Number(item.cuotas) > 0 ? 'Crédito' : 'Contado'}
                      </Text>
                    </View>
                    {item.precios_cuotas && Array.isArray(item.precios_cuotas) && item.precios_cuotas.length > 0 ? (
                      <TouchableOpacity onPress={() => abrirEditarPlan(item)}>
                        <Text style={{ fontSize: 11, color: colors.textMuted }}>
                          {item.planLabel ? item.planLabel : item.cuotas ? `Cuotas: ${item.cuotas} x ${fmt(item.precio_cuota)}` : 'Elegir forma de pago'}
                        </Text>
                      </TouchableOpacity>
                    ) : item.cuotas ? (
                      <Text style={{ fontSize: 11, color: colors.textMuted }}>
                        {item.cuotas} cuotas de {fmt(item.precio_cuota)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={s.qtyRow}>
                    <TouchableOpacity style={s.qtyBtn} onPress={() => cambiarCantidad(item.id, -1)}>
                      <Text style={s.qtyBtnTxt}>−</Text>
                    </TouchableOpacity>
                    <Text style={s.qtyNum}>{item.cantidad}</Text>
                    <TouchableOpacity
                      style={[s.qtyBtn, ((((productos.find(p => p.id === item.id) || {}).stock_disponible || 0) - item.cantidad) <= 0) && { opacity: 0.5 }]}
                      onPress={() => {
                        const prod = productos.find(p => p.id === item.id) || {};
                        const available = (prod.stock_disponible || 0) - item.cantidad;
                        if (available <= 0) {
                          Alert.alert('Stock insuficiente', 'No hay suficiente stock disponible para aumentar la cantidad.');
                          return;
                        }
                        cambiarCantidad(item.id, 1);
                      }}
                      disabled={(((productos.find(p => p.id === item.id) || {}).stock_disponible || 0) - item.cantidad) <= 0}
                    >
                      <Text style={s.qtyBtnTxt}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {/* Totales */}
          <View style={s.totalesBox}>
            <View style={s.totRow}>
              <Text style={s.totLabel}>Subtotal</Text>
              <Text style={s.totVal}>{fmt(cartTotals.subtotal)}</Text>
            </View>
            <View style={s.totRow}>
              <Text style={s.totLabel}>Descuento $</Text>
              <TextInput
                style={s.descInput}
                value={descuento}
                onChangeText={setDescuento}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={[s.totRow, s.totRowFinal]}>
              <Text style={s.totFinalLabel}>TOTAL</Text>
              <Text style={s.totFinalVal}>{fmt(cartTotals.total)}</Text>
            </View>
          </View>

          {/* Pago / Prima */}
          <View style={s.pagoBox}>
            {cartTotals.tipoPago === 'credito' && (
              <TouchableOpacity
                style={s.primaToggleRow}
                onPress={() => { setUsarPrima(p => !p); if (usarPrima) setPago(''); }}
                activeOpacity={0.7}
              >
                <View style={[s.toggleBox, usarPrima && { backgroundColor: '#F5A623', borderColor: '#F5A623' }]}>
                  {usarPrima && <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>✓</Text>}
                </View>
                <Text style={[s.primaToggleTxt, usarPrima && { color: '#F5A623' }]}>
                  {usarPrima ? 'Con prima inicial' : 'Sin prima'}
                </Text>
              </TouchableOpacity>
            )}
            {(cartTotals.tipoPago === 'contado' || usarPrima) && (
              <View style={s.pagoRow}>
                <Text style={[s.pagoLabel, cartTotals.tipoPago === 'credito' && { color: '#F5A623', fontWeight: '700' }]}>
                  {cartTotals.tipoPago === 'credito' ? 'Prima' : 'Pago'}
                </Text>
                <TextInput
                  style={s.pagoInput}
                  value={pago}
                  onChangeText={setPago}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity style={s.efectivoBtn} onPress={() => setPago(cartTotals.total.toFixed(2))}>
                  <Text style={s.efectivoBtnTxt}>{cartTotals.tipoPago === 'credito' ? 'Todo' : 'Efectivo'}</Text>
                </TouchableOpacity>
              </View>
            )}
            {cartTotals.tipoPago === 'contado' && (
              <View style={s.totRow}>
                <Text style={s.totLabel}>Vuelto</Text>
                <Text style={[s.totVal, { color: '#4CAF50' }]}>{fmt(cartTotals.vuelto)}</Text>
              </View>
            )}
            {cartTotals.esMixto && (
              <View style={s.mixtoInfo}>
                <Text style={s.mixtoTxt}>⚡ Venta mixta: contado + crédito</Text>
              </View>
            )}
          </View>

          {/* Botón finalizar */}
          <TouchableOpacity
            style={[s.finalizarBtn, (submitting || printing) && { opacity: 0.7 }]}
            onPress={confirmarVenta}
            activeOpacity={0.85}
            disabled={submitting || printing || carrito.length === 0}
          >
            {submitting || printing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.finalizarTxt}>FINALIZAR VENTA</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal configuración impresora */}
      <Modal visible={printerModalVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 8, padding: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8, color: colors.text }}>Configurar impresora</Text>
            <Text style={{ marginBottom: 6, color: colors.textMuted }}>Introduce IP:PUERTO (ej. 192.168.1.100:9100) o identificador USB</Text>
            <TextInput 
              value={printerAddr} 
              onChangeText={setPrinterAddr} 
              placeholder="192.168.1.100:9100 or usb:..." 
              placeholderTextColor={colors.textMuted}
              style={{ 
                borderWidth: 1, 
                borderColor: colors.border, 
                padding: 8, 
                borderRadius: 6, 
                marginBottom: 10,
                color: colors.text,
                backgroundColor: colors.surface
              }} 
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <TouchableOpacity onPress={() => setPrinterModalVisible(false)} style={{ padding: 8, marginRight: 8 }}>
                <Text style={{ color: colors.text }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={savePrinter} style={{ padding: 8 }}>
                <Text style={{ color: colors.accent }}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de confirmación de venta */}
      <Modal visible={confirmModalVisible} animationType="fade" transparent>
        <View style={s.confirmModalOverlay}>
          <View style={[s.confirmModal, { backgroundColor: colors.surface }]}>
            <Text style={[s.confirmTitle, { color: colors.text }]}>📋 Confirmar Venta</Text>

            <ScrollView style={s.confirmContent} showsVerticalScrollIndicator={false}>
              {/* Cliente */}
              <View style={s.confirmSection}>
                <Text style={[s.confirmLabel, { color: colors.textMuted }]}>Cliente</Text>
                <Text style={[s.confirmValue, { color: colors.text }]}>{cliente.nombre}</Text>
              </View>

              {/* Productos */}
              <View style={s.confirmSection}>
                <Text style={[s.confirmLabel, { color: colors.textMuted }]}>Productos ({carrito.length})</Text>
                {carrito.map((item, idx) => (
                  <View key={idx} style={s.confirmItem}>
                    <Text style={{ color: colors.text, fontWeight: '500', flex: 1 }}>{item.nombre}</Text>
                    <Text style={{ color: colors.textMuted }}>x{item.cantidad}</Text>
                    <Text style={{ color: colors.text, fontWeight: '600', marginLeft: 8 }}>{fmt(calcularTotalItem(item))}</Text>
                  </View>
                ))}
              </View>

              {/* Totales */}
              <View style={[s.confirmSection, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }]}>
                <View style={s.confirmTotalRow}>
                  <Text style={{ color: colors.textMuted }}>Subtotal</Text>
                  <Text style={{ color: colors.text }}>${cartTotals.subtotal.toFixed(2)}</Text>
                </View>
                {cartTotals.descVal > 0 && (
                  <View style={s.confirmTotalRow}>
                    <Text style={{ color: colors.textMuted }}>Descuento</Text>
                    <Text style={{ color: '#10B981' }}>-${cartTotals.descVal.toFixed(2)}</Text>
                  </View>
                )}
                <View style={[s.confirmTotalRow, { marginTop: 6 }]}>
                  <Text style={[{ color: colors.text, fontWeight: '700', fontSize: 16 }]}>Total</Text>
                  <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 16 }}>${cartTotals.total.toFixed(2)}</Text>
                </View>
                {cartTotals.tipoPago === 'credito' ? (
                  <View style={[s.confirmTotalRow, { marginTop: 10, backgroundColor: '#fff8e1', borderRadius: 8, padding: 10 }]}>
                    <Text style={{ color: '#7a5900', fontWeight: '700', fontSize: 13 }}>💰 Prima inicial</Text>
                    <Text style={{ color: cartTotals.pagoVal > 0 ? '#F5A623' : '#aaa', fontWeight: '800', fontSize: 14 }}>
                      {cartTotals.pagoVal > 0 ? fmt(cartTotals.pagoVal) : 'Sin prima'}
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={s.confirmTotalRow}>
                      <Text style={{ color: colors.textMuted }}>Pago recibido</Text>
                      <Text style={{ color: colors.text }}>{fmt(cartTotals.pagoVal)}</Text>
                    </View>
                    <View style={s.confirmTotalRow}>
                      <Text style={{ color: colors.textMuted }}>Vuelto</Text>
                      <Text style={{ color: '#4CAF50', fontWeight: '700' }}>{fmt(cartTotals.vuelto)}</Text>
                    </View>
                  </>
                )}
              </View>
            </ScrollView>

            {/* Botones */}
            <View style={s.confirmButtons}>
              <TouchableOpacity
                style={[s.confirmBtn, s.confirmBtnCancel]}
                onPress={() => setConfirmModalVisible(false)}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.confirmBtn, s.confirmBtnConfirm, { backgroundColor: colors.accent }]}
                onPress={finalizarVenta}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>✓ Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de clientes */}
      <Modal
        visible={showClienteModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowClienteModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.text }]}>Seleccionar cliente</Text>
              <TouchableOpacity onPress={() => { setShowClienteModal(false); setBusquedaCliente(''); }}>
                <Text style={{ color: colors.textMuted, fontSize: 20 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[s.modalSearch, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
              placeholder="Nombre, DUI, teléfono..."
              placeholderTextColor={colors.textMuted}
              value={busquedaCliente}
              onChangeText={setBusquedaCliente}
              autoFocus
            />
            <FlatList
              data={[{ id: null, nombre: 'Consumidor Final', apellido: '' }, ...clientes]}
              keyExtractor={i => String(i.id ?? 'cf')}
              renderItem={({ item }) => {
                const nombre = item.id ? `${item.nombre} ${item.apellido || ''}`.trim() : 'Consumidor Final';
                return (
                  <TouchableOpacity
                    style={[s.clienteRow, { borderBottomColor: colors.border }]}
                    onPress={() => {
                      setCliente({ id: item.id, nombre, whatsapp: item.whatsapp || item.telefono || null });
                      setShowClienteModal(false);
                      setBusquedaCliente('');
                    }}
                  >
                    <Text style={[s.clienteRowNom, { color: colors.text }]}>{nombre}</Text>
                    {item.dui ? <Text style={[s.clienteRowSub, { color: colors.textMuted }]}>{item.dui}</Text> : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: 'center', padding: 20, fontSize: 12 }}>Sin resultados</Text>}
            />
            <TouchableOpacity
              style={[s.crearClienteBtn, { backgroundColor: colors.accent }]}
              onPress={() => { ccReset(); setCrearClienteVisible(true); }}
            >
              <Text style={s.crearClienteBtnText}>➕ Crear nuevo cliente</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal crear cliente integrado */}
      <Modal visible={crearClienteVisible} animationType="slide" transparent={false} onRequestClose={() => setCrearClienteVisible(false)}>
        <View style={{ flex:1, backgroundColor: colors.bg }}>
          <View style={[s.header, { paddingTop: Platform.OS==='android'?30:50 }]}>
            <TouchableOpacity onPress={() => setCrearClienteVisible(false)} style={s.hBtn}>
              <Text style={s.hIcon}>←</Text>
            </TouchableOpacity>
            <Text style={s.hTitle}>Nuevo Cliente</Text>
            <Text style={{ color:'rgba(255,255,255,0.5)', fontSize:11, marginRight:6 }}>desde POS</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding:16, paddingBottom:40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* OCR */}
            <View style={s.ccCard}>
              <Text style={[s.ccCardTitle, { color: colors.text }]}>🪪 Escanear DUI</Text>
              <TouchableOpacity style={[s.ccActionBtn, { borderColor: colors.accent, opacity: ccScanningOcr?0.6:1 }]} onPress={ccEscanearDui} disabled={ccScanningOcr}>
                <Text style={[s.ccActionBtnText, { color: colors.accent }]}>{ccScanningOcr ? '⏳ Escaneando...' : '📷 Escanear DUI (auto-rellenar)'}</Text>
              </TouchableOpacity>
            </View>

            {/* Datos personales */}
            <View style={s.ccCard}>
              <Text style={[s.ccCardTitle, { color: colors.text }]}>👤 Datos personales</Text>
              <View style={{ flexDirection:'row', gap:8 }}>
                <View style={{ flex:1 }}>
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: ccNombreError?'#dc2626':colors.border, backgroundColor: colors.surface }]}
                    placeholder="Nombre *" placeholderTextColor={colors.textMuted} value={ccNombre}
                    onChangeText={t => { setCcNombre(t); setCcNombreError(t.trim()?'':'Requerido'); }} />
                  {ccNombreError ? <Text style={s.ccErr}>{ccNombreError}</Text> : null}
                </View>
                <View style={{ flex:1 }}>
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: ccApellidoError?'#dc2626':colors.border, backgroundColor: colors.surface }]}
                    placeholder="Apellido *" placeholderTextColor={colors.textMuted} value={ccApellido}
                    onChangeText={t => { setCcApellido(t); setCcApellidoError(t.trim()?'':'Requerido'); }} />
                  {ccApellidoError ? <Text style={s.ccErr}>{ccApellidoError}</Text> : null}
                </View>
              </View>
              <TextInput style={[s.ccInput, { color: colors.text, borderColor: ccDuiError?'#dc2626':colors.border, backgroundColor: colors.surface }]}
                placeholder="DUI (12345678-9) *" placeholderTextColor={colors.textMuted} value={ccDui} onChangeText={ccHandleDuiChange} />
              {ccDuiError ? <Text style={s.ccErr}>{ccDuiError}</Text> : null}
            </View>

            {/* Contacto */}
            <View style={s.ccCard}>
              <Text style={[s.ccCardTitle, { color: colors.text }]}>📞 Contacto</Text>
              <TextInput style={[s.ccInput, { color: colors.text, borderColor: ccTelefonoError?'#dc2626':colors.border, backgroundColor: colors.surface }]}
                placeholder="Teléfono (1234-5678) *" placeholderTextColor={colors.textMuted} value={ccTelefono} onChangeText={ccHandleTelChange} keyboardType="phone-pad" />
              {ccTelefonoError ? <Text style={s.ccErr}>{ccTelefonoError}</Text> : null}
              <TextInput style={[s.ccInput, { color: colors.text, borderColor: ccWhatsappError?'#dc2626':colors.border, backgroundColor: colors.surface }]}
                placeholder="WhatsApp (1234-5678) *" placeholderTextColor={colors.textMuted} value={ccWhatsapp} onChangeText={ccHandleWaChange} keyboardType="phone-pad" />
              {ccWhatsappError ? <Text style={s.ccErr}>{ccWhatsappError}</Text> : null}
              <TextInput style={[s.ccInput, { color: colors.text, borderColor: ccEmailError?'#dc2626':colors.border, backgroundColor: colors.surface }]}
                placeholder={ccEmailRequerido?'Email (requerido)':'Email (opcional)'} placeholderTextColor={colors.textMuted} value={ccEmail}
                onChangeText={t => { setCcEmail(t); setCcEmailError(''); }} keyboardType="email-address" autoCapitalize="none" />
              {ccEmailError ? <Text style={s.ccErr}>{ccEmailError}</Text> : null}
            </View>

            {/* Ubicación */}
            <View style={s.ccCard}>
              <Text style={[s.ccCardTitle, { color: colors.text }]}>📍 Ubicación</Text>
              <TouchableOpacity style={[s.ccActionBtn, { borderColor: colors.border, opacity: ccLocationLoading?0.6:1 }]} onPress={ccGetLocation} disabled={ccLocationLoading}>
                <Text style={[s.ccActionBtnText, { color: colors.text }]}>{ccLocationLoading ? '⏳ Obteniendo...' : '📍 Capturar ubicación actual'}</Text>
              </TouchableOpacity>
              {(ccLatitud && ccLongitud) ? <Text style={{ fontSize:11, color: colors.textMuted, textAlign:'center', marginTop:6 }}>{ccLatitud}, {ccLongitud}</Text> : null}
              {(ccLatError||ccLongError) ? <Text style={s.ccErr}>{ccLatError||ccLongError}</Text> : null}
            </View>

            {/* Fotos DUI */}
            <View style={s.ccCard}>
              <Text style={[s.ccCardTitle, { color: colors.text }]}>🪪 Fotos del DUI <Text style={{ fontSize:11, fontWeight:'400', color: colors.textMuted }}>* Ambos lados</Text></Text>
              <View style={{ flexDirection:'row', gap:10 }}>
                <TouchableOpacity style={[s.ccPhotoCard, { borderColor: ccDuiFrente?colors.accent:ccFrenteError?'#dc2626':colors.border, backgroundColor: ccDuiFrente?(colors.accent+'12'):colors.surface }]} onPress={() => ccTomarFoto('dui_frente')}>
                  <Text style={{ fontSize:26 }}>{ccDuiFrente ? '✓' : '📸'}</Text>
                  <Text style={{ fontSize:11, color: colors.text, marginTop:4 }}>{ccDuiFrente ? 'Frente ✓' : 'Tomar frente'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.ccPhotoCard, { borderColor: ccDuiReverso?colors.accent:ccReversoError?'#dc2626':colors.border, backgroundColor: ccDuiReverso?(colors.accent+'12'):colors.surface }]} onPress={() => ccTomarFoto('dui_reverso')}>
                  <Text style={{ fontSize:26 }}>{ccDuiReverso ? '✓' : '📸'}</Text>
                  <Text style={{ fontSize:11, color: colors.text, marginTop:4 }}>{ccDuiReverso ? 'Reverso ✓' : 'Tomar reverso'}</Text>
                </TouchableOpacity>
              </View>
              {(ccFrenteError||ccReversoError) ? <Text style={s.ccErr}>{ccFrenteError||ccReversoError}</Text> : null}
            </View>

            {/* Foto casa */}
            <View style={s.ccCard}>
              <Text style={[s.ccCardTitle, { color: colors.text }]}>🏠 Foto de la casa <Text style={{ fontSize:11, fontWeight:'400', color: colors.textMuted }}>(opcional)</Text></Text>
              <TouchableOpacity style={[s.ccPhotoCard, { borderColor: ccFotoCasa?colors.accent:colors.border, backgroundColor: ccFotoCasa?(colors.accent+'12'):colors.surface, paddingVertical:18 }]} onPress={() => ccTomarFoto('casa')}>
                <Text style={{ fontSize:26 }}>{ccFotoCasa ? '✓' : '📷'}</Text>
                <Text style={{ fontSize:11, color: colors.text, marginTop:4 }}>{ccFotoCasa ? 'Foto tomada (toca para cambiar)' : 'Tomar foto de la casa'}</Text>
              </TouchableOpacity>
            </View>

            {/* Botón guardar */}
            <TouchableOpacity
              style={[{ borderRadius:12, paddingVertical:14, alignItems:'center', marginTop:8 }, ccLoading?{ backgroundColor: colors.accent, opacity:0.7 }:{ backgroundColor: colors.accent }]}
              onPress={ccHandleSubmit} disabled={ccLoading}
            >
              {ccLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color:'#fff', fontSize:15, fontWeight:'700' }}>✅ Guardar y seleccionar</Text>}
            </TouchableOpacity>
          </ScrollView>

          {/* Preview imagen */}
          <Modal visible={ccPreviewVisible} transparent onRequestClose={() => setCcPreviewVisible(false)}>
            <TouchableOpacity style={{ flex:1, backgroundColor:'rgba(0,0,0,0.95)', justifyContent:'center', alignItems:'center', padding:16 }} activeOpacity={1} onPress={() => setCcPreviewVisible(false)}>
              <Image source={{ uri: ccPreviewImage }} style={{ width:'100%', height:400, resizeMode:'contain' }} />
              <TouchableOpacity onPress={() => setCcPreviewVisible(false)} style={{ marginTop:20, backgroundColor: colors.accent, paddingHorizontal:24, paddingVertical:12, borderRadius:10 }}>
                <Text style={{ color:'#fff', fontWeight:'700' }}>✕ Cerrar</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        </View>
      </Modal>
    </View>
  );
}

// ─── Estilos ───────────────────────────────────────────────────────────────────
const styles = (c) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: c.headerBg,
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  hBtn:   { padding: 6 },
  hIcon:  { fontSize: 20, color: c.text },
  hTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: c.text, marginLeft: 8 },
  hRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusIndicator: { width: 10, height: 10, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },

  // Búsqueda
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface,
    marginHorizontal: 10, marginTop: 8, marginBottom: 4, borderRadius: 10,
    borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, height: 38,
  },
  searchIco:   { fontSize: 14, marginRight: 6, color: c.textMuted },
  searchInput: { flex: 1, fontSize: 13, color: c.text, paddingVertical: 0 },

  // Categorías
  catRow:     { maxHeight: 40, marginBottom: 4 },
  catContent: { paddingHorizontal: 10, alignItems: 'center', flexDirection: 'row' },
  catChip:    { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, marginRight: 6 },
  catChipOn:  { backgroundColor: c.accent, borderColor: c.accent },
  catLabel:   { fontSize: 12, color: c.textSec, fontWeight: '500' },
  catLabelOn: { color: '#fff', fontWeight: '700' },

  // Cuerpo
  body:       { flex: 1, flexDirection: 'row' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Grid productos
  grid: { flex: 1 },
  prodCard: {
    width: '48.5%',
    backgroundColor: c.surface, borderRadius: 10,
    borderWidth: 1, borderColor: c.border, padding: 8, overflow: 'hidden',
  },
  prodImgBox: {
    backgroundColor: c.surfaceAlt, borderRadius: 8, height: 56,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  prodEmoji:  { fontSize: 28 },
  prodNombre: { fontSize: 11, color: c.text, fontWeight: '600', minHeight: 30, lineHeight: 15 },
  prodCodigo: { fontSize: 9, color: c.textMuted, marginBottom: 2 },
  prodCuotas: { fontSize: 9, color: '#0B5FFF', marginBottom: 2 },
  prodFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  prodPrecio: { fontSize: 12, fontWeight: '700', color: c.accent },
  stockBadge: { backgroundColor: c.surfaceAlt, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  stockTxt:   { fontSize: 9, color: c.textMuted, fontWeight: '600' },
  addBtn:     { backgroundColor: '#10B981', width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  addBtnDisabled: { backgroundColor: '#94D3B2', opacity: 0.6 },
  addBtnTxt:  { color: '#fff', fontSize: 18, lineHeight: 22, fontWeight: '700' },

  // Panel carrito
  cartPanel: {
    width: SW * 0.42, backgroundColor: c.surface, borderLeftWidth: 1, borderLeftColor: c.border,
    paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4, flexShrink: 0,
  },
  cartTitle: { fontSize: 13, fontWeight: '700', color: c.text, marginBottom: 6 },

  // Cliente
  clienteBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceAlt,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, marginBottom: 6,
    borderWidth: 1, borderColor: c.border,
  },
  clienteIco:  { fontSize: 16, marginRight: 6 },
  clienteTxt:  { flex: 1, fontSize: 13, color: c.text, fontWeight: '700' },
  clienteChev: { fontSize: 13, color: c.textMuted },

  // Lista carrito
  cartList:      { flex: 1, marginBottom: 4 },
  cartEmpty:     { textAlign: 'center', color: c.textMuted, fontSize: 11, paddingTop: 20, lineHeight: 18 },
  cartItem:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: c.border },
  cartItemEmoji: { fontSize: 16, width: 22, marginRight: 5 },
  cartItemInfo:  { flex: 1, marginRight: 4, minWidth: 0 },
  cartItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTipoBadge:    { borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, alignSelf: 'flex-start', marginTop: 2 },
  itemTipoBadgeTxt: { fontSize: 8, fontWeight: '700' },
  cartItemNom:   { fontSize: 10, color: c.text, fontWeight: '600', flexShrink: 1, flexBasis: 0, marginRight: 6, minWidth: 0 },
  cartItemPrc:   { fontSize: 10, color: c.accent, fontWeight: '700', flexShrink: 0 },
  qtyRow:        { flexDirection: 'row', alignItems: 'center' },
  qtyBtn:        { width: 20, height: 20, borderRadius: 5, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2 },
  qtyBtnTxt:     { fontSize: 13, color: c.text, lineHeight: 17 },
  qtyNum:        { fontSize: 11, color: c.text, fontWeight: '700', minWidth: 16, textAlign: 'center' },

  // Totales
  totalesBox:    { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 6, marginBottom: 4 },
  totRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3, flexWrap: 'wrap' },
  totRowFinal:   { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 5, marginTop: 2 },
  totLabel:      { fontSize: 11, color: c.textSec, minWidth: 90 },
  totVal:        { fontSize: 11, color: c.text, fontWeight: '700' },
  totFinalLabel: { fontSize: 13, fontWeight: '800', color: c.text },
  totFinalVal:   { fontSize: 14, fontWeight: '800', color: c.accent },
  descInput:     { fontSize: 11, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, width: 60, textAlign: 'right' },

  // Pago
  pagoBox:        { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 5, marginBottom: 6 },
  pagoRow:        { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  pagoLabel:      { fontSize: 11, color: c.textSec, width: 30 },
  pagoInput:      { flex: 1, fontSize: 11, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3, textAlign: 'right' },
  efectivoBtn:    { backgroundColor: c.surfaceAlt, borderRadius: 5, borderWidth: 1, borderColor: c.border, paddingHorizontal: 6, paddingVertical: 4 },
  efectivoBtnTxt: { fontSize: 10, color: c.text, fontWeight: '600' },

  primaToggleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, paddingVertical: 2 },
  toggleBox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  primaToggleTxt: { fontSize: 11, color: '#aaa', fontWeight: '600' },
  mixtoInfo: { backgroundColor: '#fff8e1', borderRadius: 6, padding: 5, marginTop: 4 },
  mixtoTxt:  { fontSize: 10, color: '#7a5900', fontWeight: '600' },

  // Finalizar
  finalizarBtn: {
    backgroundColor: '#1565C0', borderRadius: 10, paddingVertical: 11,
    alignItems: 'center', marginTop: 2, shadowColor: '#1565C0',
    shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
  finalizarTxt: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },

  // Modales
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalOverlayCuotas: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 18 },
  modalBox: { borderRadius: 16, padding: 16, maxHeight: '70%', backgroundColor: c.surface, shadowColor: '#000', shadowOffset: { width:0, height:3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalHeaderCuotas: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 15, fontWeight: '700' },
  modalCloseBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  modalCloseTxt: { fontSize: 12, color: c.textMuted },
  modalSubtitle: { fontSize: 12, color: c.textMuted, marginBottom: 14, lineHeight: 18 },
  modalScrollContent: { paddingBottom: 8 },
  modalOption: { backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: c.border },
  modalOptionTitle: { fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 4 },
  modalOptionDesc: { fontSize: 12, color: c.textMuted },
  modalActionBox: { backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: c.border, marginBottom: 10 },
  modalInput: { fontSize: 13, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 10, marginBottom: 10 },
  modalActionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  modalActionBtn: { flex: 1, backgroundColor: c.accent, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginHorizontal: 4 },
  modalCancelBtn: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  modalActionBtnText: { fontSize: 12, fontWeight: '700', color: c.text },
  modalSearch: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, marginBottom: 10 },
  clienteRow: { paddingVertical: 10, borderBottomWidth: 1 },
  clienteRowNom: { fontSize: 13, fontWeight: '600' },
  clienteRowSub: { fontSize: 11, marginTop: 2 },

  // Modal de confirmación
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  confirmModal: {
    borderRadius: 16,
    padding: 0,
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
    overflow: 'hidden',
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  confirmContent: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  confirmSection: {
    marginBottom: 16,
  },
  confirmLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  confirmValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  confirmItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    fontSize: 13,
  },
  confirmTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  confirmButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
  },
  confirmBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnCancel: {
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
  },
  // Crear cliente integrado
  crearClienteBtn: { margin:12, marginTop:4, borderRadius:10, paddingVertical:11, alignItems:'center' },
  crearClienteBtnText: { color:'#fff', fontWeight:'700', fontSize:13 },
  ccCard: { backgroundColor:c.surface, borderRadius:12, padding:14, marginBottom:12, borderWidth:1, borderColor:c.border },
  ccCardTitle: { fontSize:13, fontWeight:'700', marginBottom:10 },
  ccInput: { borderWidth:1, borderRadius:9, paddingHorizontal:11, paddingVertical:9, marginBottom:6, fontSize:13 },
  ccErr: { color:'#dc2626', fontSize:11, marginBottom:6, marginTop:-2 },
  ccActionBtn: { borderWidth:1, borderRadius:9, paddingVertical:10, alignItems:'center', marginBottom:4 },
  ccActionBtnText: { fontSize:13, fontWeight:'600' },
  ccPhotoCard: { flex:1, borderWidth:1.5, borderStyle:'dashed', borderRadius:10, paddingVertical:14, alignItems:'center', justifyContent:'center' },

  // Configuraciones
  cfgOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  cfgBox: { width: '100%', borderRadius: 14, padding: 20 },
  cfgTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  cfgSubtitle: { fontSize: 13, marginBottom: 14 },
  cfgInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 15, marginBottom: 6 },
  cfgError: { color: '#e53e3e', fontSize: 12, marginBottom: 8 },
  cfgBtnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  cfgBtn: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  cfgBtnText: { fontWeight: '600', fontSize: 14 },
  cfgRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border, gap: 12 },
  cfgRowLabel: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  cfgRowSub: { fontSize: 12 },

  confirmBtnConfirm: {
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
});