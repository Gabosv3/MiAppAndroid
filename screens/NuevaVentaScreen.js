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
import api, { esErrorTransitorio, TIMEOUT_LECTURA_CACHE } from '../services/api';
import * as localDb from '../services/localDb';
import { guardarAsignacionCache, leerAsignacionCache } from '../services/localDb';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as offlineQueue from '../services/offlineQueue';
import { useConnectivity } from '../services/connectivity';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { extractTextFromImage } from '../services/ocr';
import { fmtFechaCorta } from '../services/dateUtils';
import FirmaPad from '../components/FirmaPad';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEscalaTexto } from '../hooks/useEscalaTexto';

const { width: SW } = Dimensions.get('window');

// ==================== FUNCIONES HELPER ====================
const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;


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
export default function NuevaVentaScreen({ navigation, route }) {
  const { colors } = useTheme();
  // Modo corrección: se abre desde "Mis ventas de hoy" sobre una venta que
  // ya existe — mismo catálogo/carrito que una venta nueva, pero con
  // cliente y productos precargados, y al guardar corrige esa venta
  // (PATCH) en vez de crear una nueva (POST).
  const modoEdicion = !!route?.params?.modoEdicion;
  const ventaEditId = route?.params?.ventaId;
  const ventaInicial = route?.params?.ventaInicial;
  const [motivoCorreccion, setMotivoCorreccion] = useState('');
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const insets = useSafeAreaInsets();
  const { escala, aumentar: aumentarTexto, disminuir: disminuirTexto, puedeAumentar, puedeDisminuir } = useEscalaTexto();

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
  const [cliente, setCliente] = useState({ id: null, nombre: 'Consumidor Final' });
  const [descuento, setDescuento] = useState('');
  const [pago, setPago] = useState('');
  const [usarPrima, setUsarPrima] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);

  // ── Pagaré (crédito) ─────────────────────────────────────────────────────────
  // Se genera ANTES de confirmar la venta — el cliente firma en papel antes
  // de llevarse el producto. Es solo una herramienta de apoyo: imprime/comparte
  // el PDF y no bloquea ni cambia el flujo de "Finalizar venta".
  const [pagareModalVisible, setPagareModalVisible] = useState(false);
  const [pagareNombreDeudor, setPagareNombreDeudor] = useState('');
  const [pagareDui, setPagareDui] = useState('');
  const [pagareDireccion, setPagareDireccion] = useState('');
  const [pagareLugar, setPagareLugar] = useState('Usulután');
  const [pagareFechaVenc, setPagareFechaVenc] = useState('');
  const [generandoPagare, setGenerandoPagare] = useState(false);
  const [firmaBase64, setFirmaBase64] = useState(null);
  const firmaPadRef = useRef(null);
  // Id que devuelve POST /pagares al guardarlo — se usa para enlazarlo con
  // la venta cuando esta se confirme (el pagaré se firma ANTES de la venta,
  // así que en ese momento todavía no hay venta_id).
  const [pagareGuardadoId, setPagareGuardadoId] = useState(null);

  const abrirPagare = () => {
    if (!cliente?.id) {
      Alert.alert('Selecciona un cliente', 'El pagaré necesita un cliente registrado (no "Consumidor Final") con DUI en su ficha.');
      return;
    }
    if (!cliente?.dui) {
      Alert.alert('Falta el DUI', 'Este cliente no tiene DUI registrado. Actualízalo en su ficha antes de generar el pagaré.');
      return;
    }
    setPagareNombreDeudor(cliente.nombre);
    setPagareDui(cliente.dui);
    setPagareDireccion('');
    setPagareLugar('Usulután');
    setFirmaBase64(null);
    setPagareGuardadoId(null);
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setPagareFechaVenc(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    setPagareModalVisible(true);
  };

  const onFirmaCapturada = (data) => {
    if (data === 'VACIA') {
      Alert.alert('Firma vacía', 'El cliente debe firmar en el recuadro antes de guardar.');
      return;
    }
    setFirmaBase64(data);
  };

  const limpiarFirma = () => {
    firmaPadRef.current?.limpiar();
    setFirmaBase64(null);
  };

  const generarPagare = async () => {
    if (!pagareNombreDeudor.trim() || !pagareDui.trim()) {
      Alert.alert('Faltan datos', 'Ingresa al menos el nombre y el DUI del deudor.');
      return;
    }
    if (!firmaBase64) {
      Alert.alert('Falta la firma', 'El cliente debe firmar en el recuadro y tocar "Guardar firma" antes de generar el pagaré.');
      return;
    }
    setGenerandoPagare(true);
    try {
      const itemsCredito = carrito.filter(i => Number(i.cuotas) > 0);
      const montoFinanciado = itemsCredito.reduce((s, i) => s + parseFloat(i.precio_venta || 0) * Number(i.cantidad || 1), 0);
      const primaAplicada = usarPrima ? (parseFloat(pago) || 0) : 0;
      const saldoAFinanciar = Math.max(0, montoFinanciado - primaAplicada);

      const productosHtml = itemsCredito.map(i => `
        <tr>
          <td>${i.nombre} (x${i.cantidad})</td>
          <td style="text-align:right">${i.cuotas} cuotas de ${fmt(i.precio_cuota)}</td>
        </tr>
      `).join('');

      const fechaHoy = fmtFechaCorta(new Date());
      const fechaVencFmt = pagareFechaVenc ? fmtFechaCorta(pagareFechaVenc) : '';

      const html = `
        <html><head>
          <meta name="viewport" content="width=device-width,initial-scale=1"/>
          <style>
            *{box-sizing:border-box}
            body{font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#111;padding:32px;max-width:700px;margin:0 auto}
            h1{font-size:20px;text-align:center;margin-bottom:24px;letter-spacing:1px}
            table{width:100%;border-collapse:collapse;margin:16px 0}
            td{padding:6px 4px;border-bottom:1px solid #ddd;font-size:13px}
            .firma{margin-top:50px;display:flex;justify-content:space-between;align-items:flex-end}
            .firma div{width:45%;text-align:center;border-top:1px solid #333;padding-top:6px;font-size:12px}
            .firma img{max-width:100%;max-height:70px;display:block;margin:0 auto 4px}
            .datos{margin:16px 0}
            .datos b{display:inline-block;min-width:140px}
          </style>
        </head><body>
          <h1>PAGARÉ</h1>

          <p>Lugar y fecha: <b>${pagareLugar}, ${fechaHoy}</b></p>

          <p style="margin-top:20px">
            Yo, <b>${pagareNombreDeudor}</b>, portador del Documento Único de Identidad
            número <b>${pagareDui}</b>, con domicilio en <b>${pagareDireccion || '_______________'}</b>,
            debo y pagaré incondicionalmente a la orden de <b>DISTRIBUIDORA BM</b> la cantidad
            de <b>${fmt(saldoAFinanciar)}</b> (${saldoAFinanciar.toFixed(2)} dólares de los Estados
            Unidos de América), por concepto de la compra de los productos detallados a
            continuación, obligándome a pagarla mediante cuotas mensuales según el plan
            acordado, venciendo la primera cuota el día <b>${fechaVencFmt || '_______________'}</b>.
          </p>

          <table>
            ${productosHtml}
          </table>

          ${primaAplicada > 0 ? `<p class="datos"><b>Prima inicial pagada:</b> ${fmt(primaAplicada)}</p>` : ''}
          <p class="datos"><b>Saldo a financiar:</b> ${fmt(saldoAFinanciar)}</p>

          <p style="margin-top:20px;font-size:12px;color:#555">
            En caso de mora en el pago de dos o más cuotas consecutivas, la totalidad de
            la deuda se dará por vencida y será exigible de inmediato, sin necesidad de
            requerimiento previo.
          </p>

          <div class="firma">
            <div><img src="${firmaBase64}"/>Firma del deudor<br/>DUI: ${pagareDui}</div>
            <div>Distribuidora BM</div>
          </div>
        </body></html>`;

      // Documento 100% digital: se genera el PDF y se comparte/guarda
      // directamente, sin pasar por el diálogo de impresión física.
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      // Guardar el PDF ya firmado en el servidor — todavía no hay venta_id
      // porque el pagaré se firma antes de confirmar la venta; se enlaza
      // después en finalizarVenta() si la venta se confirma con éxito.
      try {
        const camposPagare = { cliente_id: String(cliente.id), monto_financiado: saldoAFinanciar.toFixed(2) };
        if (isOnline) {
          const formData = new FormData();
          Object.entries(camposPagare).forEach(([k, v]) => formData.append(k, v));
          formData.append('pdf', { uri, name: `pagare_${Date.now()}.pdf`, type: 'application/pdf' });
          const { data } = await api.post('/pagares', formData, { timeout: 30000, headers: { 'Content-Type': 'multipart/form-data' } });
          setPagareGuardadoId(data?.pagare?.id || null);
        } else {
          await offlineQueue.enqueueRequest({
            method: 'POST', url: '/pagares', label: `Pagaré ${pagareNombreDeudor.trim()}`,
            useFormData: true,
            data: { ...camposPagare, pdf: { uri, name: `pagare_${Date.now()}.pdf`, type: 'application/pdf' } },
          });
          // Guardado offline: no hay id todavía para enlazar con la venta —
          // se puede enlazar manualmente desde el panel si hace falta.
        }
      } catch (e) {
        console.warn('No se pudo guardar el pagaré en el servidor:', e?.message);
        Alert.alert('Aviso', 'El PDF se generará igual, pero no se pudo guardar el pagaré en el sistema. Se seguirá con la venta normalmente.');
      }

      const puedeCompartir = await Sharing.isAvailableAsync();
      if (puedeCompartir) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Pagaré firmado', UTI: 'com.adobe.pdf' });
      } else {
        Alert.alert('Pagaré generado', `Guardado en:\n${uri}`);
      }
      setPagareModalVisible(false);
    } catch (e) {
      Alert.alert('Error', 'No se pudo generar el pagaré: ' + (e?.message || ''));
    } finally {
      setGenerandoPagare(false);
    }
  };

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

  // Campos opcionales adicionales (dirección y referencias personales) —
  // mismos nombres que en CrearClienteScreen.js y el panel Filament.
  const [ccMostrarOpcionales, setCcMostrarOpcionales] = useState(false);
  const [ccDireccion, setCcDireccion] = useState('');
  const [ccDepartamento, setCcDepartamento] = useState('');
  const [ccMunicipio, setCcMunicipio] = useState('');
  const [ccDistrito, setCcDistrito] = useState('');
  const [ccNombreConyuge, setCcNombreConyuge] = useState('');
  const [ccRefFam1Nombre, setCcRefFam1Nombre] = useState('');
  const [ccRefFam1Telefono, setCcRefFam1Telefono] = useState('');
  const [ccRefFam1Parentesco, setCcRefFam1Parentesco] = useState('');
  const [ccRefFam2Nombre, setCcRefFam2Nombre] = useState('');
  const [ccRefFam2Telefono, setCcRefFam2Telefono] = useState('');
  const [ccRefFam2Parentesco, setCcRefFam2Parentesco] = useState('');
  const [ccRefCon1Nombre, setCcRefCon1Nombre] = useState('');
  const [ccRefCon1Telefono, setCcRefCon1Telefono] = useState('');
  const [ccRefCon1Trabajo, setCcRefCon1Trabajo] = useState('');
  const [ccRefCon2Nombre, setCcRefCon2Nombre] = useState('');
  const [ccRefCon2Telefono, setCcRefCon2Telefono] = useState('');
  const [ccRefCon2Trabajo, setCcRefCon2Trabajo] = useState('');

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
    setCcMostrarOpcionales(false);
    setCcDireccion(''); setCcDepartamento(''); setCcMunicipio(''); setCcDistrito(''); setCcNombreConyuge('');
    setCcRefFam1Nombre(''); setCcRefFam1Telefono(''); setCcRefFam1Parentesco('');
    setCcRefFam2Nombre(''); setCcRefFam2Telefono(''); setCcRefFam2Parentesco('');
    setCcRefCon1Nombre(''); setCcRefCon1Telefono(''); setCcRefCon1Trabajo('');
    setCcRefCon2Nombre(''); setCcRefCon2Telefono(''); setCcRefCon2Trabajo('');
  };

  const ccCamposOpcionales = () => {
    const campos = {
      direccion: ccDireccion.trim(),
      departamento: ccDepartamento.trim(),
      municipio: ccMunicipio.trim(),
      distrito: ccDistrito.trim(),
      nombre_conyuge: ccNombreConyuge.trim(),
      ref_fam1_nombre: ccRefFam1Nombre.trim(),
      ref_fam1_telefono: ccRefFam1Telefono.trim(),
      ref_fam1_parentesco: ccRefFam1Parentesco.trim(),
      ref_fam2_nombre: ccRefFam2Nombre.trim(),
      ref_fam2_telefono: ccRefFam2Telefono.trim(),
      ref_fam2_parentesco: ccRefFam2Parentesco.trim(),
      ref_con1_nombre: ccRefCon1Nombre.trim(),
      ref_con1_telefono: ccRefCon1Telefono.trim(),
      ref_con1_trabajo: ccRefCon1Trabajo.trim(),
      ref_con2_nombre: ccRefCon2Nombre.trim(),
      ref_con2_telefono: ccRefCon2Telefono.trim(),
      ref_con2_trabajo: ccRefCon2Trabajo.trim(),
    };
    return Object.fromEntries(Object.entries(campos).filter(([, v]) => v));
  };

  useEffect(() => {
    AsyncStorage.getItem('POS_CONFIG').then(raw => {
      if (raw) { try { setCcEmailRequerido(!!JSON.parse(raw).emailRequerido); } catch {} }
    });
  }, []);

  // Precarga cliente y carrito cuando se abre en modo corrección — una sola
  // vez al entrar, no en cada re-render (el usuario puede seguir editando
  // el carrito libremente después de esto).
  useEffect(() => {
    if (!modoEdicion || !ventaInicial) return;

    if (ventaInicial.cliente) {
      setCliente({
        id: ventaInicial.cliente.id || null,
        nombre: ventaInicial.cliente.id
          ? `${ventaInicial.cliente.nombre || ''} ${ventaInicial.cliente.apellido || ''}`.trim()
          : 'Consumidor Final',
        whatsapp: ventaInicial.cliente.telefono_whatsapp || ventaInicial.cliente.telefono_normal || null,
        dui: ventaInicial.cliente.dui || null,
      });
    }

    const carritoInicial = (ventaInicial.detalles || []).map(d => {
      const cuotas = Number(d.cuotas || 0) || undefined;
      const precioCuota = d.precio_cuota !== null && d.precio_cuota !== undefined ? Number(d.precio_cuota) : undefined;
      // Igual que al agregar un producto nuevo: precio_venta guarda el
      // TOTAL de la línea (ya multiplicado por cuotas si es crédito), no
      // el precio por unidad — así calcularTotalItem() y el envío final
      // funcionan igual que con un producto agregado desde cero.
      const precioVenta = cuotas
        ? cuotas * (precioCuota || 0)
        : Number(d.precio_unitario || 0);

      return {
        id: d.producto_id,
        nombre: d.producto?.nombre || `Producto ${d.producto_id}`,
        codigo: d.producto?.codigo || null,
        cantidad: Number(d.cantidad || 1),
        cuotas,
        precio_cuota: precioCuota,
        precio_venta: precioVenta,
        planLabel: cuotas ? `${cuotas} cuotas de ${fmt(precioCuota)}` : undefined,
      };
    });
    setCarrito(carritoInicial);

    if (ventaInicial.prima > 0) {
      setPago(String(ventaInicial.prima));
      setUsarPrima(true);
    }
  }, [modoEdicion, ventaInicial]);

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
    } catch(e){ Alert.alert('Error','No se pudo abrir la cámara: ' + (e?.message || String(e))); }
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
    } catch(e){ Alert.alert('Error','No se pudo tomar la foto: ' + (e?.message || String(e))); }
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
    // Las fotos del DUI son opcionales — a veces la cámara falla y no debe
    // impedir crear el cliente por eso. Se puede completar después.
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
      Object.entries(ccCamposOpcionales()).forEach(([key, value]) => formData.append(key, value));
      const appendImg = (field, file) => { if(file?.uri) formData.append(field, { uri:file.uri, name:file.name||`${field}.jpg`, type:'image/jpeg' }); };
      appendImg('dui_foto_frente', ccDuiFrente);
      appendImg('dui_foto_reverso', ccDuiReverso);
      appendImg('foto_casa', ccFotoCasa);

      const { data } = await api.post('/clientes', formData, { timeout:30000, headers:{'Content-Type':'multipart/form-data'} });

      const nombreCompleto = `${data.nombre||ccNombre} ${data.apellido||ccApellido}`.trim();
      setCliente({ id: data.id, nombre: nombreCompleto, whatsapp: data.telefono_whatsapp||data.telefono_normal||null, dui: data.dui||ccDui||null });
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
            ...ccCamposOpcionales(),
            ...(ccDuiFrente&&{dui_foto_frente:ccDuiFrente}), ...(ccDuiReverso&&{dui_foto_reverso:ccDuiReverso}), ...(ccFotoCasa&&{foto_casa:ccFotoCasa}) } });
        const nombreCompleto = `${ccNombre} ${ccApellido}`.trim();
        setCliente({ id: null, nombre: nombreCompleto, whatsapp: ccWhatsapp||ccTelefono||null, dui: ccDui||null });
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
    (async () => {
      // Mismo criterio que en cargarClientes: si nunca se ha guardado nada
      // localmente en este dispositivo, el respaldo offline está vacío —
      // mejor esperar el timeout normal que fallar rápido a los 8s y
      // quedarse sin categorías sin ningún aviso.
      const localesPrevias = await localDb.getLocalCategories().catch(() => []);
      const timeoutConfig = (localesPrevias?.length > 0) ? { timeout: TIMEOUT_LECTURA_CACHE } : undefined;
      api.get('/categorias', timeoutConfig)
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
    })();
  }, []);

  // ── Cargar asignación activa ──────────────────────────────────────────────
  const cargarAsignacionHoy = useCallback(async () => {
    setAsignMsg('');
    setLoadingAsignacion(true);
    try {
      const { data } = await api.get('/asignacion/hoy', { timeout: TIMEOUT_LECTURA_CACHE });
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
        const cache = await leerAsignacionCache();
        if (cache && cache.esDeHoy) {
          setProductos(cache.productos);
          setCategorias(cache.categorias || []);
          setAsignacionId(cache.asignacionId);
          setAsignMsg('Sin conexión — mostrando asignación de hoy guardada');
        } else if (cache && !cache.esDeHoy) {
          // No se usa como sustituto de hoy — podría traer productos que ya
          // no están asignados o faltar los de hoy. Se bloquea con aviso
          // claro para que el vendedor verifique conexión antes de salir.
          setProductos([]);
          setAsignMsg('⚠️ No se pudo confirmar tu asignación de HOY.\nLo que tienes guardado es de un día anterior.\n\nConéctate a internet y verifica antes de salir a campo.');
          Alert.alert(
            '⚠️ Asignación desactualizada',
            'No se pudo confirmar tu asignación de productos de hoy — los datos guardados son de un día anterior. Conéctate a internet y verifica antes de salir a campo.',
            [{ text: 'Entendido' }]
          );
        } else {
          setAsignMsg('Sin conexión y no hay ninguna asignación guardada.\nConéctate una vez para cargar la asignación del día.');
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
  // Si este teléfono/usuario nunca ha tenido clientes guardados localmente
  // (típico en una instalación o inicio de sesión nuevo), el respaldo local
  // al que cae el catch de abajo está VACÍO — así que fallar rápido a los
  // 8s solo produce una lista vacía sin ningún aviso visible (parece que
  // "no hay clientes" cuando en realidad la búsqueda ni terminó de
  // responder). Se revisa una sola vez si hay algo útil en la caché local;
  // si no hay nada, se usa el timeout normal en vez del corto.
  const hayCacheLocalClientes = useRef(null); // null = todavía no se sabe
  const cargarClientes = useCallback(async (q = '') => {
    try {
      if (hayCacheLocalClientes.current === null) {
        const locales = await localDb.getLocalClients().catch(() => []);
        hayCacheLocalClientes.current = Array.isArray(locales) && locales.length > 0;
      }
      // contexto=venta le dice al servidor que, si no hay texto de búsqueda,
      // priorice clientes a los que este vendedor ya le vendió hoy — tiene
      // sentido acá (buscando un cliente recurrente de la misma jornada),
      // pero no en otras pantallas que también listan /clientes (ej.
      // Preventa), donde ese acotamiento no aplica.
      let qs = 'per_page=30&contexto=venta';
      if (q) qs += `&q=${encodeURIComponent(q)}`;
      const timeoutConfig = hayCacheLocalClientes.current ? { timeout: TIMEOUT_LECTURA_CACHE } : undefined;
      const { data } = await api.get(`/clientes?${qs}`, timeoutConfig);
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

    // Cliente es requerido, salvo "Consumidor Final" — y eso solo se permite
    // si la venta es 100% al contado (crédito/mixto siempre necesita un
    // cliente registrado, porque respalda el pagaré y la cobranza).
    if (!cliente.id && (cartTotals.tipoPago === 'credito' || cartTotals.esMixto)) {
      Alert.alert(
        '⚠️ Cliente requerido',
        'Una venta a crédito necesita un cliente registrado (no "Consumidor Final").',
        [{ text: 'Seleccionar cliente', onPress: () => setShowClienteModal(true) }]
      );
      return;
    }

    // Venta a crédito (o mixta) exige DUI del cliente en ficha — es lo que
    // respalda el pagaré y la cobranza posterior.
    if ((cartTotals.tipoPago === 'credito' || cartTotals.esMixto) && !cliente.dui) {
      Alert.alert(
        '⚠️ Falta el DUI del cliente',
        'Este cliente no tiene DUI registrado. No se puede vender a crédito sin DUI — actualiza su ficha antes de continuar.',
        [{ text: 'Seleccionar otro cliente', onPress: () => setShowClienteModal(true) }, { text: 'Cancelar', style: 'cancel' }]
      );
      return;
    }

    setConfirmModalVisible(true);
  }, [carrito.length, cliente.id, cliente.dui, cartTotals.tipoPago, cartTotals.esMixto]);

  // ── Corregir venta existente (modo edición) ─────────────────────────────────
  const enviarCorreccion = useCallback(async () => {
    const clienteId = cliente.id || 0;
    const payload = {
      motivo: motivoCorreccion.trim(),
      cliente_id: clienteId,
      prima: cartTotals.pagoVal > 0 ? cartTotals.pagoVal : 0,
      ...(cartTotals.descPct > 0 ? { descuento_porcentaje: parseFloat(cartTotals.descPct.toFixed(4)) } : {}),
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
          ...(esCredito ? { cuotas: Number(i.cuotas), precio_cuota: Number(i.precio_cuota) } : {}),
        };
      }),
    };

    setSubmitting(true);
    try {
      await api.patch(`/ventas/${ventaEditId}`, payload);
      limpiarVenta();
      setMotivoCorreccion('');
      Alert.alert('✅ Venta corregida', 'Los cambios se guardaron correctamente.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('No se pudo corregir', e?.response?.data?.mensaje || e.message || 'Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }, [cliente, cartTotals, carrito, motivoCorreccion, ventaEditId, navigation, limpiarVenta]);

  // ── Finalizar venta (enviar al servidor) ───────────────────────────────────
  const finalizarVenta = useCallback(async () => {
    if (modoEdicion && !motivoCorreccion.trim()) {
      Alert.alert('Falta el motivo', 'Escribe brevemente qué se corrigió antes de guardar.');
      return;
    }
    setConfirmModalVisible(false);

    if (modoEdicion) {
      await enviarCorreccion();
      return;
    }

    // Cliente_id: usar 0 para Consumidor Final (si id es null)
    const clienteId = cliente.id || 0;

    // Se genera UNA vez, antes del primer intento, y se reutiliza si la venta
    // termina encolada offline — así el servidor puede reconocer un reintento
    // de la MISMA venta (ej. tras un timeout) y no crear una venta duplicada.
    const idempotencyKey = `venta-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const payload = {
      sucursal_id: sucursalId,
      tipo_pago: cartTotals.tipoPago,
      idempotency_key: idempotencyKey,
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

      // Si se firmó un pagaré antes de confirmar esta venta, enlazarlo ahora
      // que ya existe venta_id. No bloquea la navegación — si falla, el
      // pagaré queda guardado igual, solo sin enlace automático.
      if (pagareGuardadoId && data?.id) {
        api.patch(`/pagares/${pagareGuardadoId}/venta`, { venta_id: data.id })
          .catch(e => console.warn('No se pudo enlazar el pagaré con la venta:', e?.message));
      }

      const carritoSnapshot = [...carrito];
      const totalsSnapshot  = { ...cartTotals, clienteNombre: cliente.nombre };
      limpiarVenta();
      setPagareGuardadoId(null);

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
            // Sin conexión el servidor no puede confirmar el vendedor todavía
            // — se usa el nombre del usuario logueado en este dispositivo,
            // que es quien realmente está haciendo la venta.
            vendedorNombre: user?.name || user?.nombre || '',
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
  }, [carrito, cartTotals, sucursalId, cliente.id, asignacionId, limpiarVenta, modoEdicion, motivoCorreccion, enviarCorreccion]);

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

      {/* Header — sin esto quedaba pegado a la barra de estado del
          teléfono (reloj, señal, batería), tapándose entre sí en equipos
          con status bar más alta. */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.hBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.hIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.hTitle}>{modoEdicion ? '✏️ Corregir venta' : 'Nueva Venta'}</Text>
        <View style={s.hRight}>
          <View style={[
            s.statusIndicator,
            { backgroundColor: isOnline ? '#10B981' : '#e53e3e' }
          ]}>
            <Text style={{ fontSize: 9 }}>{isOnline ? '●' : '●'}</Text>
          </View>
          {/* Tamaño de letra del catálogo — cada quien lo ajusta a su
              gusto, queda guardado en este teléfono.
              Antes usaba blanco fijo (#fff) asumiendo encabezado azul, pero
              el tema claro tiene encabezado blanco — quedaba invisible
              (texto blanco sobre fondo blanco). Se usan los colores del
              tema para que se vea en ambos modos. */}
          <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: 6, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            <TouchableOpacity
              onPress={disminuirTexto}
              disabled={!puedeDisminuir}
              style={{ paddingHorizontal: 8, paddingVertical: 6, opacity: puedeDisminuir ? 1 : 0.4 }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={{ color: colors.text, fontSize: 11, fontWeight: '800' }}>A-</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={aumentarTexto}
              disabled={!puedeAumentar}
              style={{ paddingHorizontal: 8, paddingVertical: 6, opacity: puedeAumentar ? 1 : 0.4, borderLeftWidth: 1, borderLeftColor: colors.border }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>A+</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={abrirConfig} style={[s.hBtn, { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6, paddingHorizontal: 8 }]}>
            <Text style={[s.hIcon, { fontSize: 12 }]}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('HistorialVentas')} style={[s.hBtn, { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6, paddingHorizontal: 8 }]}>
            <Text style={[s.hIcon, { fontSize: 16 }]}>📋</Text>
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
                {/* Sin límite de líneas — muchos productos comparten el mismo
                    nombre base y solo se diferencian por el color al final
                    (ej. "Sofá reclinable 3 plazas gris"), que se estaba
                    cortando con "...". La tarjeta simplemente crece según lo
                    que necesite el nombre, en vez de truncar. */}
                <Text style={[s.prodNombre, { fontSize: 11 * escala, lineHeight: 15 * escala, minHeight: 30 * escala }]}>{item.nombre}</Text>
                {item.codigo ? <Text style={[s.prodCodigo, { fontSize: 9 * escala }]}>{item.codigo}</Text> : null}
                {item.precios_cuotas && Array.isArray(item.precios_cuotas) && item.precios_cuotas.length > 0 ? (
                  <Text style={[s.prodCuotas, { fontSize: 9 * escala }]}>Pago: contado o cuotas</Text>
                ) : null}
                <View style={s.prodFooter}>
                  <Text style={[s.prodPrecio, { fontSize: 12 * escala }]}>{fmt(item.precio_venta)}</Text>
                  <View style={s.stockBadge}>
                    <Text style={[s.stockTxt, { fontSize: 9 * escala }]}>{(item.stock_disponible ?? item.stock ?? 0) > 0 ? `Stock: ${item.stock_disponible}` : 'Sin stock'}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[s.addBtn, (item.stock_disponible ?? 0) <= 0 && s.addBtnDisabled]}
                  onPress={() => agregarProducto(item)}
                  disabled={(item.stock_disponible ?? 0) <= 0}
                >
                  <Text style={s.addBtnTxt}>+</Text>
                </TouchableOpacity>
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
        <View style={[s.cartPanel, { paddingBottom: Math.max(8, insets.bottom + 4) }]}>
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

          {/* Generar pagaré — solo para ventas a crédito, antes de confirmar */}
          {(cartTotals.tipoPago === 'credito' || cartTotals.esMixto) && (
            <TouchableOpacity
              style={s.pagareBtn}
              onPress={abrirPagare}
              activeOpacity={0.85}
              disabled={carrito.length === 0}
            >
              <Text style={s.pagareBtnTxt}>📝 Generar pagaré</Text>
            </TouchableOpacity>
          )}

          {/* Botón finalizar */}
          <TouchableOpacity
            style={[s.finalizarBtn, submitting && { opacity: 0.7 }]}
            onPress={confirmarVenta}
            activeOpacity={0.85}
            disabled={submitting || carrito.length === 0}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.finalizarTxt}>FINALIZAR VENTA</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal generar pagaré */}
      <Modal visible={pagareModalVisible} animationType="slide" transparent onRequestClose={() => setPagareModalVisible(false)}>
        <View style={s.confirmModalOverlay}>
          <View style={[s.confirmModal, { backgroundColor: colors.surface }]}>
            <Text style={[s.confirmTitle, { color: colors.text }]}>📝 Generar Pagaré</Text>
            <ScrollView style={s.confirmContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[s.pagareLabel, { color: colors.textMuted }]}>Nombre completo del deudor *</Text>
              <TextInput
                style={[s.pagareInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
                value={pagareNombreDeudor}
                onChangeText={setPagareNombreDeudor}
                placeholder="Ej: Juan Carlos Pérez"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[s.pagareLabel, { color: colors.textMuted }]}>DUI (del cliente seleccionado)</Text>
              <View style={[s.pagareInput, { backgroundColor: colors.surfaceAlt || colors.border, justifyContent: 'center' }]}>
                <Text style={{ color: colors.text, fontSize: 14 }}>{pagareDui}</Text>
              </View>

              <Text style={[s.pagareLabel, { color: colors.textMuted }]}>Dirección</Text>
              <TextInput
                style={[s.pagareInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
                value={pagareDireccion}
                onChangeText={setPagareDireccion}
                placeholder="Dirección del deudor"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[s.pagareLabel, { color: colors.textMuted }]}>Lugar de firma</Text>
              <TextInput
                style={[s.pagareInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
                value={pagareLugar}
                onChangeText={setPagareLugar}
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[s.pagareLabel, { color: colors.textMuted }]}>Fecha de la primera cuota (YYYY-MM-DD)</Text>
              <TextInput
                style={[s.pagareInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
                value={pagareFechaVenc}
                onChangeText={setPagareFechaVenc}
                placeholder="2026-08-20"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 10 }}>
                El monto y las cuotas se toman automáticamente de los productos a crédito en el carrito.
              </Text>
            </ScrollView>

            {/* Fuera del ScrollView a propósito: si el pad de firma queda dentro
                de un contenedor con scroll, el gesto de arrastrar para firmar
                se lo roba el scroll y no se puede dibujar nada. */}
            <Text style={[s.pagareLabel, { color: colors.textMuted, marginTop: 4, paddingHorizontal: 20 }]}>Firma del cliente *</Text>
            <View style={{ paddingHorizontal: 20 }}>
              <FirmaPad ref={firmaPadRef} onFirma={onFirmaCapturada} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity
                  style={[s.pagareFirmaBtn, { borderColor: colors.border }]}
                  onPress={limpiarFirma}
                >
                  <Text style={{ color: colors.textMuted, fontWeight: '600', fontSize: 12 }}>🗑️ Limpiar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.pagareFirmaBtn, { borderColor: colors.accent, flex: 1 }]}
                  onPress={() => firmaPadRef.current?.exportar()}
                >
                  <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 12 }}>
                    {firmaBase64 ? '✅ Firma guardada — tocar para actualizar' : '💾 Guardar firma'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={s.confirmButtons}>
              <TouchableOpacity style={[s.confirmBtn, s.confirmBtnCancel]} onPress={() => setPagareModalVisible(false)}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBtn, s.confirmBtnConfirm, { backgroundColor: colors.accent }, (generandoPagare || !firmaBase64) && { opacity: 0.5 }]}
                onPress={generarPagare}
                disabled={generandoPagare || !firmaBase64}
              >
                {generandoPagare ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Generar pagaré</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de confirmación de venta */}
      <Modal visible={confirmModalVisible} animationType="fade" transparent>
        <View style={s.confirmModalOverlay}>
          <View style={[s.confirmModal, { backgroundColor: colors.surface }]}>
            <Text style={[s.confirmTitle, { color: colors.text }]}>{modoEdicion ? '✏️ Confirmar corrección' : '📋 Confirmar Venta'}</Text>

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

              {/* Motivo — solo al corregir una venta existente */}
              {modoEdicion && (
                <View style={s.confirmSection}>
                  <Text style={[s.confirmLabel, { color: colors.textMuted }]}>Motivo de la corrección *</Text>
                  <TextInput
                    style={{
                      borderWidth: 1, borderColor: colors.border, borderRadius: 10,
                      padding: 10, fontSize: 14, color: colors.text, minHeight: 60,
                      textAlignVertical: 'top', marginTop: 4,
                    }}
                    value={motivoCorreccion}
                    onChangeText={setMotivoCorreccion}
                    placeholder="Ej: Se quitó producto de más, prima corregida a $10"
                    placeholderTextColor={colors.textMuted}
                    multiline
                  />
                </View>
              )}
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
                disabled={submitting}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {submitting ? 'Guardando...' : modoEdicion ? '✓ Guardar corrección' : '✓ Confirmar'}
                </Text>
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
                      setCliente({ id: item.id, nombre, whatsapp: item.whatsapp || item.telefono || null, dui: item.dui || null });
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
              <Text style={[s.ccCardTitle, { color: colors.text }]}>🪪 Fotos del DUI <Text style={{ fontSize:11, fontWeight:'400', color: colors.textMuted }}>(opcional)</Text></Text>
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

            {/* Dirección y referencias personales (opcional) */}
            <View style={s.ccCard}>
              <TouchableOpacity
                style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}
                onPress={() => setCcMostrarOpcionales(v => !v)}
              >
                <Text style={[s.ccCardTitle, { color: colors.text, marginBottom:0 }]}>🏘️ Dirección y referencias</Text>
                <Text style={{ fontSize:11, color: colors.textMuted, fontStyle:'italic' }}>{ccMostrarOpcionales ? '▲ Ocultar' : '▼ Opcional'}</Text>
              </TouchableOpacity>

              {ccMostrarOpcionales && (
                <View style={{ marginTop:12 }}>
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                    placeholder="Dirección (calle, colonia, número de casa)" placeholderTextColor={colors.textMuted}
                    value={ccDireccion} onChangeText={setCcDireccion} multiline />
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                    placeholder="Departamento" placeholderTextColor={colors.textMuted} value={ccDepartamento} onChangeText={setCcDepartamento} />
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                    placeholder="Municipio" placeholderTextColor={colors.textMuted} value={ccMunicipio} onChangeText={setCcMunicipio} />
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                    placeholder="Distrito" placeholderTextColor={colors.textMuted} value={ccDistrito} onChangeText={setCcDistrito} />
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                    placeholder="Nombre del cónyuge" placeholderTextColor={colors.textMuted} value={ccNombreConyuge} onChangeText={setCcNombreConyuge} />

                  <Text style={{ fontSize:12, fontWeight:'700', color: colors.accent, marginTop:10, marginBottom:6 }}>👨‍👩‍👧 Referencia familiar 1</Text>
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="Nombre" placeholderTextColor={colors.textMuted} value={ccRefFam1Nombre} onChangeText={setCcRefFam1Nombre} />
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="Teléfono" placeholderTextColor={colors.textMuted} value={ccRefFam1Telefono} onChangeText={setCcRefFam1Telefono} keyboardType="phone-pad" />
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="Parentesco" placeholderTextColor={colors.textMuted} value={ccRefFam1Parentesco} onChangeText={setCcRefFam1Parentesco} />

                  <Text style={{ fontSize:12, fontWeight:'700', color: colors.accent, marginTop:10, marginBottom:6 }}>👨‍👩‍👧 Referencia familiar 2</Text>
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="Nombre" placeholderTextColor={colors.textMuted} value={ccRefFam2Nombre} onChangeText={setCcRefFam2Nombre} />
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="Teléfono" placeholderTextColor={colors.textMuted} value={ccRefFam2Telefono} onChangeText={setCcRefFam2Telefono} keyboardType="phone-pad" />
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="Parentesco" placeholderTextColor={colors.textMuted} value={ccRefFam2Parentesco} onChangeText={setCcRefFam2Parentesco} />

                  <Text style={{ fontSize:12, fontWeight:'700', color: colors.accent, marginTop:10, marginBottom:6 }}>🧑‍🤝‍🧑 Referencia persona conocida 1</Text>
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="Nombre" placeholderTextColor={colors.textMuted} value={ccRefCon1Nombre} onChangeText={setCcRefCon1Nombre} />
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="Teléfono" placeholderTextColor={colors.textMuted} value={ccRefCon1Telefono} onChangeText={setCcRefCon1Telefono} keyboardType="phone-pad" />
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="Lugar de trabajo" placeholderTextColor={colors.textMuted} value={ccRefCon1Trabajo} onChangeText={setCcRefCon1Trabajo} />

                  <Text style={{ fontSize:12, fontWeight:'700', color: colors.accent, marginTop:10, marginBottom:6 }}>🧑‍🤝‍🧑 Referencia persona conocida 2</Text>
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="Nombre" placeholderTextColor={colors.textMuted} value={ccRefCon2Nombre} onChangeText={setCcRefCon2Nombre} />
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} placeholder="Teléfono" placeholderTextColor={colors.textMuted} value={ccRefCon2Telefono} onChangeText={setCcRefCon2Telefono} keyboardType="phone-pad" />
                  <TextInput style={[s.ccInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface, marginBottom:0 }]} placeholder="Lugar de trabajo" placeholderTextColor={colors.textMuted} value={ccRefCon2Trabajo} onChangeText={setCcRefCon2Trabajo} />
                </View>
              )}
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
    width: '48.5%', position: 'relative',
    backgroundColor: c.surface, borderRadius: 10,
    borderWidth: 1, borderColor: c.border, padding: 8, paddingRight: 30, overflow: 'visible',
  },
  prodImgBox: {
    backgroundColor: c.surfaceAlt, borderRadius: 8, height: 56,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  prodEmoji:  { fontSize: 28 },
  prodNombre: { fontSize: 11, color: c.text, fontWeight: '600', minHeight: 30, lineHeight: 15 },
  prodCodigo: { fontSize: 9, color: c.textMuted, marginBottom: 2 },
  prodCuotas: { fontSize: 9, color: '#0B5FFF', marginBottom: 2 },
  // Precio y stock en su propia fila (sin el botón +, que ahora flota aparte)
  // — antes los tres compartían una sola fila y en tarjetas angostas el
  // botón terminaba empujado fuera del borde de la tarjeta.
  prodFooter: { marginTop: 4, gap: 3 },
  prodPrecio: { fontSize: 12, fontWeight: '700', color: c.accent },
  stockBadge: { backgroundColor: c.surfaceAlt, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, alignSelf: 'flex-start' },
  stockTxt:   { fontSize: 9, color: c.textMuted, fontWeight: '600' },
  addBtn:     {
    position: 'absolute', bottom: 8, right: 8,
    backgroundColor: '#10B981', width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
  },
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

  pagareBtn: {
    borderWidth: 1.5, borderColor: c.accent, borderRadius: 10, paddingVertical: 9,
    alignItems: 'center', marginTop: 8, marginBottom: 2,
  },
  pagareBtnTxt: { color: c.accent, fontSize: 13, fontWeight: '700' },
  pagareLabel: { fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  pagareInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14 },
  pagareFirmaBtn: { borderWidth: 1.5, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 14, alignItems: 'center' },

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