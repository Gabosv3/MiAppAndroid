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
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import * as localDb from '../services/localDb';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import escpos from '../services/escpos';
import * as offlineQueue from '../services/offlineQueue';
import { useConnectivity } from '../services/connectivity';

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
  const [submitting, setSubmitting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printerModalVisible, setPrinterModalVisible] = useState(false);
  const [printerAddr, setPrinterAddr] = useState('');
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);

  // ── Cálculos memorizados ────────────────────────────────────────────────────
  const cartTotals = useMemo(() => {
    const subtotal = carrito.reduce((s, i) => {
      // precio_venta ya tiene el total correcto (normal, cuotas o vendedor)
      return s + (parseFloat(i.precio_venta || 0) * Number(i.cantidad || 1));
    }, 0);
    
    const descVal = parseFloat(descuento) || 0;
    const descPct = subtotal > 0 ? (descVal / subtotal) * 100 : 0;
    const total = Math.max(0, subtotal - descVal);
    const pagoVal = parseFloat(pago) || 0;
    const vuelto = Math.max(0, pagoVal - total);
    const tipoPago = carrito.some(i => Number(i.cuotas) > 0) ? 'credito' : 'contado';
    
    return { subtotal, descVal, descPct, total, pagoVal, vuelto, tipoPago };
  }, [carrito, descuento, pago]);

  // ── Cargar categorías ─────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/categorias')
      .then(({ data }) => setCategorias(data))
      .catch(async (error) => {
        const isOffline = !error.response || error.message === 'Sin conexión con el servidor' || error.message === 'Tiempo de espera agotado';
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

        let priceText = `<div style="font-size:14px; margin-top:4px;">Precio: ${fmt(priceNormal)}</div>`;
        let planText = '';

        if (planEnabled) {
          priceText = `<div style="font-size:14px; margin-top:4px;">Precio cuota: ${fmt(d.precio_cuota)}</div>`;
          planText = `<div style="margin-top:8px; font-size:14px; font-weight:700;">Plan de financiamiento:</div><div style="font-size:14px;">${d.cuotas} cuotas de ${fmt(d.precio_cuota)}</div>`;
        } else if (cambioPrecioVendedor) {
          priceText = `<div style="font-size:14px; margin-top:4px;">Precio vendedor: ${fmt(priceNormal)}</div>`;
        }

        return `
          <div style="margin-bottom:12px;">
            <div style="font-size:16px; font-weight:700;">${name}</div>
            <div style="font-size:14px; margin-top:4px; color:#555">Cantidad: ${qty}</div>
            ${priceText}
            ${planText}
          </div>
          <div style="border-top:1px dashed #555; margin:10px 0"></div>
        `;
      }).join('');

      const html = `
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            body{ font-family: Arial, Helvetica, sans-serif; font-size:18px; width:360px; margin:0; padding:16px }
            h3{ margin:0; font-size:26px }
            .center{ text-align:center }
            .right{ text-align:right }
            .small{ font-size:15px; color:#555 }
            .label{ font-size:16px; font-weight:700 }
            .divider{ border-top:2px dashed #333; margin:16px 0 }
            .section-title{ font-size:16px; font-weight:700; margin-bottom:10px }
            .text-sm{ font-size:15px; }
            .product-name{ font-size:18px; font-weight:700; }
            td{ vertical-align: top; padding: 6px 0; font-size: 15px; }
            table{ width: 100%; border-collapse: collapse; }
          </style>
        </head>
        <body>
          ${logoHtml}
          <div class="center">
            <div style="font-size:32px; font-weight:800; margin-bottom:8px">DISTRIBUIDORA BM</div>
            <div style="font-size:17px; margin-bottom:4px; color:#555">Muebles • Electrodomésticos</div>
          </div>
          <div style="font-size:15px; margin-top:10px; line-height:22px; color:#555">
            Teléfono: +503 7777-7777<br />
            WhatsApp: +503 7777-7777<br />
            Correo: ventas@bmdistribuidora.com<br />
            Web: www.bmdistribuidora.com
          </div>
          <div style="font-size:14px; margin-top:10px; color:#555">Dirección:<br />Usulután, El Salvador</div>
          <div class="divider"></div>
          <div style="font-size:16px; font-weight:700; text-align:center; margin-bottom:10px">━ TICKET DE VENTA ━</div>
          <div style="font-size:14px; margin-bottom:4px"><strong>Venta No:</strong> ${ventaNumero}</div>
          <div style="font-size:14px; margin-bottom:4px"><strong>Fecha:</strong> ${escapeHtml(date)}</div>
          <div style="font-size:14px; margin-bottom:4px"><strong>Caja:</strong> ${cajaNombre}</div>
          <div style="font-size:14px; margin-bottom:4px"><strong>Sucursal:</strong> ${sucursalNombre}</div>
          <div style="font-size:14px; margin-top:8px"><strong>Vendedor:</strong><br />${vendedorNombre}</div>
          <div style="font-size:14px; margin-top:8px"><strong>Cliente:</strong><br />${escapeHtml(clienteNombre)}</div>
          <div class="divider"></div>
          <div style="font-size:16px; font-weight:700; margin-bottom:10px">PRODUCTOS</div>
          ${itemsHtml}
          <div class="divider"></div>
          <table>
            <tr><td>Subtotal</td><td class="right" style="font-weight:600">${fmt(totals.subtotal)}</td></tr>
            <tr><td>Descuento</td><td class="right" style="font-weight:600">${fmt(totals.descVal)}</td></tr>
            <tr><td style="font-size:18px; font-weight:800"><strong>TOTAL</strong></td><td class="right" style="font-size:18px; font-weight:800">${fmt(totals.total)}</td></tr>
          </table>
          <div class="divider"></div>
          <div style="font-size:14px; margin-bottom:6px"><strong>Forma de pago:</strong><br />${escapeHtml(tipoPagoLabel)}</div>
          <table>
            <tr><td>Pago recibido</td><td class="right" style="font-weight:600">${fmt(totals.pagoVal)}</td></tr>
            <tr><td>Vuelto</td><td class="right" style="font-weight:600">${fmt(totals.vuelto)}</td></tr>
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

      const file = await Print.printToFileAsync({ html });
      if (file?.uri) {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri);
        } else {
          await Print.printAsync({ uri: file.uri });
        }
      } else {
        await Print.printAsync({ html });
      }
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

      console.log('=== API ASIGNACION PRODUCTOS ===');
      console.log('total productos:', asignacion.productos?.length);
      if (asignacion.productos?.[0]) {
        console.log('=== PRIMER PRODUCTO COMPLETO ===');
        console.log(JSON.stringify(asignacion.productos[0], null, 2));
      }

      const mapped = (asignacion.productos || []).map(p => {
        const stock_disponible = Number(p.cantidad_asignada ?? 0) - Number(p.cantidad_vendida ?? 0);
        const paymentPlans = normalizePaymentPlans(p.precios_cuotas || null);
        console.log(`${p.nombre} → plans:`, JSON.stringify(paymentPlans));

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
          categoria: null,
          categoria_id: null,
          sucursal_id: asignacion.sucursal_id || sucursalId,
          imagen: p.imagen || null,
          asignacion_detalle_id: p.id || null,
        };
      });

      setAsignMsg('');
      console.log('=== PRODUCTOS DESPUÉS DEL MAPEO ===');
      console.log('Primer producto mapeado:', JSON.stringify(mapped[0], null, 2));
      setProductos(mapped);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || String(e);
      const isOffline = !e.response || msg === 'Sin conexión con el servidor' || msg === 'Tiempo de espera agotado';

      if (msg.includes('No hay asignación') || e?.response?.status === 404) {
        setAsignMsg('No hay asignación activa para hoy');
        setProductos([]);
      } else if (isOffline) {
        const productosLocales = await localDb.getLocalProducts();
        if (Array.isArray(productosLocales) && productosLocales.length > 0) {
          const detalles = productosLocales.map(p => ({ id: p.id, nombre: p.nombre, stock: p.stock_disponible }));
          console.log(`📥 Cargados en NuevaVenta (offline): ${productosLocales.length}`, detalles);
          setProductos(productosLocales);
          setAsignMsg('Usando productos locales (sin conexión)');
        } else {
          setAsignMsg('Sin conexión y no hay datos locales');
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
      const isOffline = !error.response || error.message === 'Sin conexión con el servidor' || error.message === 'Tiempo de espera agotado';
      if (isOffline) {
        const clientesLocales = await localDb.getLocalClients();
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
    console.log('=== AGREGAR PRODUCTO ===');
    console.log('nombre:', producto.nombre);
    console.log('precios_cuotas RAW:', JSON.stringify(producto.precios_cuotas));

    const paymentPlans = normalizePaymentPlans(producto.precios_cuotas || producto.preciosCuotas || null);
    console.log('paymentPlans normalizados:', JSON.stringify(paymentPlans));

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
      cliente_id: clienteId, // Siempre enviar cliente_id (0 para Consumidor Final)
      ...(cartTotals.descPct > 0 ? { descuento_porcentaje: parseFloat(cartTotals.descPct.toFixed(4)) } : {}),
      ...(asignacionId ? { asignacion_id: asignacionId } : {}),
      detalles: carrito.map(i => {
        // Si hay cuotas: precio_unitario = total del plan (cuotas × precio_cuota)
        // Si es precio normal o vendedor: precio_venta ya tiene el precio correcto
        const precio_unitario = i.cuotas && i.precio_cuota
          ? Number(i.cuotas) * Number(i.precio_cuota)
          : parseFloat(i.precio_venta || 0);

        return {
          producto_id: i.id,
          cantidad: i.cantidad,
          precio_unitario,
          descuento_porcentaje: 0,
          ...(i.asignacion_detalle_id ? { asignacion_detalle_id: i.asignacion_detalle_id } : {}),
          ...(i.cuotas ? { cuotas: Number(i.cuotas), precio_cuota: Number(i.precio_cuota) } : {}),
        };
      }),
    };

    setSubmitting(true);
    
    try {
      const { data } = await api.post('/ventas', payload);
      
      Alert.alert(
        '✅ Venta registrada',
        `N° ${data.numero_venta}\nTotal: ${fmt(data.total)}\nVuelto: ${fmt(cartTotals.vuelto)}`,
        [{ text: 'Nueva venta', onPress: limpiarVenta }]
      );

      // Imprimir ticket en segundo plano
      (async () => {
        try {
          await printTicket(data, cartTotals, carrito);
          await attemptEscPosPrint(data);
        } catch (err) {
          console.warn('Error en impresión:', err?.message || err);
        }
      })();
      
    } catch (e) {
      const offlineError = !e.response || e.message === 'Sin conexión con el servidor' || e.message === 'Tiempo de espera agotado';
      if (offlineError) {
        try {
          await offlineQueue.enqueueRequest({
            method: 'POST',
            url: '/ventas',
            label: 'Venta pendiente',
            data: payload,
          });

          // Imprimir ticket incluso en modo offline con número temporal
          (async () => {
            try {
              const tempTicketData = {
                numero_venta: `TEMP-${Date.now()}`,
                total: cartTotals.total,
                subtotal: cartTotals.subtotal,
                fecha_hora: new Date().toISOString(),
              };
              await printTicket(tempTicketData, cartTotals, carrito);
              await attemptEscPosPrint(tempTicketData);
            } catch (err) {
              console.warn('Error imprimiendo ticket offline:', err?.message || err);
            }
          })();

          Alert.alert(
            '✔️ Venta guardada offline',
            'No hay conexión. La venta se guardó localmente y se sincronizará cuando tengas internet.',
            [{ text: 'Aceptar', onPress: limpiarVenta }]
          );
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
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.hBtn}>
            <Text style={[s.hIcon, { fontSize: 18 }]}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

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

          {/* Pago */}
          <View style={s.pagoBox}>
            <View style={s.pagoRow}>
              <Text style={s.pagoLabel}>Pago</Text>
              <TextInput
                style={s.pagoInput}
                value={pago}
                onChangeText={setPago}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
              />
              <TouchableOpacity style={s.efectivoBtn} onPress={() => setPago(cartTotals.total.toFixed(2))}>
                <Text style={s.efectivoBtnTxt}>Efectivo</Text>
              </TouchableOpacity>
            </View>
            <View style={s.totRow}>
              <Text style={s.totLabel}>Vuelto</Text>
              <Text style={[s.totVal, { color: '#4CAF50' }]}>{fmt(cartTotals.vuelto)}</Text>
            </View>
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
                {cartTotals.tipoPago === 'credito' && (
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>Tipo: Crédito (30 días)</Text>
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
                      setCliente({ id: item.id, nombre });
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
          </View>
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
  confirmBtnConfirm: {
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
});