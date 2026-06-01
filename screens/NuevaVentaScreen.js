import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import escpos from '../services/escpos';
import diag from '../services/diag';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SW } = Dimensions.get('window');
const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

// Componente
export default function NuevaVentaScreen({ navigation }) {
  const { colors } = useTheme();
  const { user } = useAuth();

  const sucursalId = user?.sucursales?.[0]?.id || 1;

  // ── Datos de API ──────────────────────────────────────────────────────────
  const [categorias, setCategorias]             = useState([]);
  const [productos, setProductos]               = useState([]);
  const [asignacionId, setAsignacionId]         = useState(null);
  const [asignMsg, setAsignMsg]                 = useState('');
  const [loadingAsignacion, setLoadingAsignacion] = useState(false);
  const [clientes, setClientes]                 = useState([]);
  const [loadingProds, setLoadingProds]         = useState(false);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [busquedaCliente, setBusquedaCliente]   = useState('');

  // ── UI ────────────────────────────────────────────────────────────────────
  const [busqueda, setBusqueda]               = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState(null); // null = Todos
  const [carrito, setCarrito]                 = useState([]);
  const [cuotasModalVisible, setCuotasModalVisible] = useState(false);
  const [cuotasProduct, setCuotasProduct] = useState(null);
  const [cuotasEditingId, setCuotasEditingId] = useState(null);
  const [cachedFallback, setCachedFallback] = useState(false);
  const [cachedTs, setCachedTs] = useState(null);
  const [cliente, setCliente]                 = useState({ id: null, nombre: 'Consumidor Final' });
  const [descuento, setDescuento]             = useState('');
  const [pago, setPago]                       = useState('');
  const [tipoPago, setTipoPago]               = useState('contado');
  const [diasCredito, setDiasCredito]         = useState('30');
  const [submitting, setSubmitting]           = useState(false);

  // ── Cargar categorías ─────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/categorias').then(({ data }) => setCategorias(data)).catch(() => {});
  }, []);

  // Cargar asignación activa del día para el vendedor (según backend POS logic)
  const cargarAsignacionHoy = useCallback(async (retry = 0) => {
    setAsignMsg('');
    setLoadingAsignacion(true);
    try {
      const { data } = await api.get('/asignacion/hoy');
      console.log('cargarAsignacionHoy response:', data);
      // backend may return different key names: asign, asignacion, asignación, etc.
      const asign = data?.asign || data?.asignacion || data?.['asignación'] || data || null;
      if (!asign) {
        if (retry < 2) {
          setAsignMsg(`No hay asignación activa. Reintentando... (${retry + 1})`);
          setTimeout(() => cargarAsignacionHoy(retry + 1), 1000);
          return;
        }
        setAsignMsg('No hay asignación activa para hoy');
        setAsignacionId(null);
        return;
      }
      // the actual assignment object may be nested (asign: { asignacion: {...} })
      const asignObj = asign?.asignacion || asign?.['asignación'] || asign;
      if (!asignObj) {
        setAsignMsg('No hay asignación activa para hoy');
        setAsignacionId(null);
        return;
      }
      // clear message when we have a valid assignment
      setAsignMsg('');
      setAsignacionId(asignObj.id || null);
      setAsignMsg('');
      console.log('Asignación encontrada:', asignObj);
      // detalles may be under multiple keys: detalles, detalle_asignaciones, productos
      const detalles = asignObj.detalles || asignObj.detalle_asignaciones || asignObj.productos || asignObj.productos_asignados || [];
      const mapped = (detalles || []).map(d => {
        const producto = d.producto || {};
        const stock_asignado = Number(d.cantidad_asignada ?? d.cantidad ?? producto.stock_asignado ?? 0);
        const cantidad_vendida = Number(d.cantidad_vendida ?? d.cantidad_vendida ?? 0);
        const stock_disponible = Math.max(0, stock_asignado - cantidad_vendida);
        const productId = d.producto_id || producto.id || d.productoId || d.id;
        return {
          id: productId,
          nombre: producto.nombre || d.nombre || producto.nombre_comercial || d.producto_nombre,
          codigo: producto.codigo || producto.sku || d.codigo || null,
          descripcion: producto.descripcion || producto.description || null,
          unidad_medida: producto.unidad_medida || null,
          precio_venta: Number(d.precio_venta ?? producto.precio_venta ?? 0),
          precios_cuotas: producto.precios_cuotas || null,
          stock_global: producto.stock_global ?? producto.stock ?? null,
          stock_asignado,
          stock_disponible,
          cantidad_vendida,
          categoria: producto.categoria || producto.categoria_nombre || null,
          categoria_id: producto.categoria_id || producto.categoria?.id || null,
          sucursal_id: asignObj.sucursal_id || producto.sucursal_id || sucursalId,
          imagen: producto.imagen || producto.image || null,
          asignacion_detalle_id: d.id || d.detalle_id || null,
        };
      });
      console.log('Productos mapeados de asignación:', mapped.length, mapped.map(p => ({ id: p.id, nombre: p.nombre, stock_disponible: p.stock_disponible })));
      setProductos(mapped);
      // persist mapped asignación for fallback
      try {
        const key = `pos:lastAsignacion:${user?.id || 'anon'}:${sucursalId}`;
        const payload = { ts: Date.now(), asignacionId: asignObj.id || null, productos: mapped };
        await AsyncStorage.setItem(key, JSON.stringify(payload));
        setCachedFallback(false);
        setCachedTs(payload.ts);
      } catch (e) {
        console.warn('No se pudo guardar asignación en cache:', e?.message || e);
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || String(e);
      console.warn('cargarAsignacionHoy error:', msg, e);
      setAsignMsg(String(msg));
      setAsignacionId(null);
      // try fallback from AsyncStorage
      try {
        const key = `pos:lastAsignacion:${user?.id || 'anon'}:${sucursalId}`;
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.productos) && parsed.productos.length > 0) {
            setProductos(parsed.productos);
            setAsignMsg('Mostrando asignación desde caché (datos antiguos)');
            setCachedFallback(true);
            setCachedTs(parsed.ts || null);
            return;
          }
        }
      } catch (ce) {
        console.warn('Error leyendo cache de asignación:', ce?.message || ce);
      }
    } finally {
      setLoadingAsignacion(false);
    }
  }, [sucursalId]);

  // Cargar asignación al montar y cada vez que la pantalla vuelve a enfocarse
  useEffect(() => { cargarAsignacionHoy(); }, [cargarAsignacionHoy, user?.id]);
  useFocusEffect(useCallback(() => { cargarAsignacionHoy(); }, [cargarAsignacionHoy]));


  // ── Cargar productos (con debounce al buscar/filtrar) ─────────────────────
  const cargarProductos = useCallback(async (q, catId) => {
    setLoadingProds(true);
    try {
      let qs = `per_page=50&sucursal_id=${sucursalId}`;
      if (q)     qs += `&q=${encodeURIComponent(q)}`;
      if (catId) qs += `&categoria_id=${catId}`;
      const { data } = await api.get(`/productos?${qs}`);
      // Normalize list and compute stock_asignado / vendido_hoy / stock_disponible
      const list = Array.isArray(data) ? data : (data.data || []);
      const todayISO = new Date().toISOString().slice(0,10);
      const sellerId = user?.id ?? null;

      function assignedTodayToSeller(p) {
        // Check boolean shortcut
        if (p.asignado_hoy === true || p.assigned_today === true) return true;
        // check assigned date fields
        const dateRaw = p.asignado_fecha || p.assigned_date || p.assigned_at || p.asignado_on || p.assigned_on || null;
        if (dateRaw) {
          try {
            const d = new Date(String(dateRaw));
            if (!isNaN(d.getTime())) {
              if (d.toISOString().slice(0,10) === todayISO) return true;
            }
          } catch (e) { /* ignore */ }
        }
        return false;
      }

      function assignedToSellerId(p) {
        if (!sellerId) return false;
        const assignedTo = p.asignado_por ?? p.vendedor_id ?? p.assigned_to ?? p.assigned_user_id ?? p.seller_id ?? null;
        if (!assignedTo) return false;
        return String(assignedTo) === String(sellerId);
      }

      const mapped = (list || []).map(p => {
        const stock_asignado = Number(p.stock_asignado ?? p.stock_assigned ?? p.stock ?? 0);
        const vendido_hoy = Number(p.vendido_hoy ?? p.sold_today ?? 0);
        const stock_disponible = Math.max(0, stock_asignado - vendido_hoy);
        return { ...p, stock_asignado, vendido_hoy, stock_disponible };
      }).filter(p => {
        // must be assigned flag true, be for this branch, and be assigned today to this seller
        if (!p.asignado && p.asignado !== true) return false;
        if (Number(p.sucursal_id) !== Number(sucursalId)) return false;
        // require assignment today and to current seller
        if (!assignedTodayToSeller(p)) return false;
        if (!assignedToSellerId(p)) return false;
        return true;
      });

      setProductos(mapped);
    } catch {
      setProductos([]);
    } finally {
      setLoadingProds(false);
    }
  }, [sucursalId, user?.id]);
    async function printTicket(sale) {
      const date = new Date(sale.fecha_venta || Date.now()).toLocaleString();
      const detalles = sale.detalles || carrito || [];
      const itemsHtml = detalles.map(d => {
        const name = escapeHtml(d.nombre || d.producto?.nombre || `ID:${d.producto_id || ''}`);
        const price = fmt(parseFloat(d.precio_unitario || d.precio_venta || 0));
        const qty = d.cantidad || 1;
        const line = `<tr><td style="padding:6px 0; font-size:13px">${name}</td><td style="padding:6px 0; font-size:13px; text-align:right">${price}</td><td style="padding:6px 0; font-size:13px; text-align:right">x${qty}</td></tr>`;
        const cuotasHtml = (d.cuotas || d.precio_cuota) ? `<tr><td colspan="3" style="padding:2px 0; font-size:11px; color:#666">Cuotas: ${d.cuotas || ''} x ${fmt(d.precio_cuota || 0)}</td></tr>` : '';
        return line + cuotasHtml;
      }).join('');

      const html = `
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            body{ font-family: Arial, Helvetica, sans-serif; font-size:12px; width:320px; margin:0; padding:10px }
            .center{ text-align:center }
            .right{ text-align:right }
            table{ width:100%; border-collapse:collapse }
            .divider{ border-top:1px dashed #333; margin:8px 0 }
          </style>
        </head>
        <body>
          <div class="center">
            <h3 style="margin:0">Distribuidora Birancesco Menijvar</h3>
            <div style="margin-top:6px">Ticket</div>
          </div>
          <div style="margin-top:8px">Fecha: ${escapeHtml(date)}</div>
          <div class="divider"></div>
          <table>
            ${itemsHtml}
          </table>
          <div class="divider"></div>
          <table>
            <tr><td>Subtotal</td><td class="right">${fmt(subtotal)}</td></tr>
            <tr><td>Descuento</td><td class="right">${fmt(descVal)}</td></tr>
            <tr><td><strong>TOTAL</strong></td><td class="right"><strong>${fmt(total)}</strong></td></tr>
            <tr><td>Pago</td><td class="right">${fmt(pagoVal)}</td></tr>
            <tr><td>Vuelto</td><td class="right">${fmt(vuelto)}</td></tr>
          </table>
          <div class="center" style="margin-top:10px">Gracias por su compra</div>
        </body>
        </html>
      `;

      // Generar archivo PDF y compartir/abrir diálogo de impresión
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
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Intentar conectar a impresora guardada o emparejada y enviar impresión ESC/POS
    async function attemptEscPosPrint(sale) {
      // 1) Try saved address
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

      // 2) Scan devices and try the first paired device
      try {
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
    }

  useEffect(() => {
    // El POS solo debe usar productos de la asignación diaria.
  }, []);

  // ── Cargar clientes ───────────────────────────────────────────────────────
  const cargarClientes = useCallback(async (q = '') => {
    try {
      let qs = 'per_page=30';
      if (q) qs += `&q=${encodeURIComponent(q)}`;
      const { data } = await api.get(`/clientes?${qs}`);
      setClientes(Array.isArray(data) ? data : (data.data || []));
    } catch {
      setClientes([]);
    }
  }, []);

  useEffect(() => { cargarClientes(); }, [cargarClientes]);

  useEffect(() => {
    if (!showClienteModal) return;
    const timer = setTimeout(() => cargarClientes(busquedaCliente), 350);
    return () => clearTimeout(timer);
  }, [busquedaCliente, showClienteModal, cargarClientes]);

  // ── Carrito helpers ───────────────────────────────────────────────────────
  const agregarProducto = (producto) => {
    // If product has financing options, show modal to pick cuotas
    if (producto.precios_cuotas && Array.isArray(producto.precios_cuotas) && producto.precios_cuotas.length > 0) {
      setCuotasProduct(producto);
      setCuotasModalVisible(true);
      return;
    }

    setCarrito(prev => {
      const existe = prev.find(i => i.id === producto.id);
      const alreadyQty = existe ? existe.cantidad : 0;
      const available = (producto.stock_disponible || 0) - alreadyQty;
      if (available <= 0) {
        Alert.alert('Stock insuficiente', 'No hay suficiente stock disponible para agregar este producto.');
        return prev;
      }
      if (existe) return prev.map(i => i.id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i);
      return [...prev, { ...producto, cantidad: 1 }];
    });
  };

  const seleccionarPlanCuotas = (plan) => {
    const producto = cuotasProduct;
    if (!producto) return;
    setCuotasModalVisible(false);
    const planObj = plan === null ? null : plan; // null means contado
    // If editing an existing cart item, update it
    if (cuotasEditingId) {
      setCarrito(prev => prev.map(i => {
        if (String(i.id) !== String(cuotasEditingId)) return i;
        return {
          ...i,
          cuotas: planObj ? Number(planObj.cuotas) : undefined,
          precio_cuota: planObj ? Number(planObj.precio) : undefined,
        };
      }));
      setCuotasEditingId(null);
      setCuotasProduct(null);
      return;
    }

    // Otherwise add product to cart with selected plan
    setCarrito(prev => {
      const existe = prev.find(i => i.id === (producto.producto_id || producto.id));
      const productId = producto.producto_id || producto.id;
      const itemData = {
        ...producto,
        id: productId,
        cantidad: 1,
        cuotas: planObj ? Number(planObj.cuotas) : undefined,
        precio_cuota: planObj ? Number(planObj.precio) : undefined,
      };
      if (existe) return prev.map(i => i.id === productId ? { ...i, cantidad: i.cantidad + 1 } : i);
      return [...prev, itemData];
    });
    setCuotasProduct(null);
  };

  const abrirEditarPlan = (cartItem) => {
    const product = productos.find(p => String(p.id) === String(cartItem.id)) || cartItem;
    setCuotasProduct(product);
    setCuotasEditingId(cartItem.id);
    setCuotasModalVisible(true);
  };

  const cambiarCantidad = (id, delta) => {
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
  };

  const limpiarVenta = () => {
    setCarrito([]);
    setPago('');
    setDescuento('');
    setCliente({ id: null, nombre: 'Consumidor Final' });
  };

  // ── Cálculos ──────────────────────────────────────────────────────────────
  const subtotal = carrito.reduce((s, i) => s + parseFloat(i.precio_venta || 0) * i.cantidad, 0);
  const descVal  = parseFloat(descuento) || 0;
  const descPct  = subtotal > 0 ? (descVal / subtotal) * 100 : 0;
  const total    = Math.max(0, subtotal - descVal);
  const pagoVal  = parseFloat(pago) || 0;
  const vuelto   = Math.max(0, pagoVal - total);

  // ── Finalizar venta ───────────────────────────────────────────────────────
  const finalizarVenta = async () => {
    if (carrito.length === 0) {
      Alert.alert('Sin productos', 'Agrega al menos un producto.');
      return;
    }
    const payload = {
      sucursal_id: sucursalId,
      tipo_pago: tipoPago,
      ...(tipoPago === 'credito' ? { dias_credito: Number(diasCredito) || 30 } : {}),
      ...(cliente.id ? { cliente_id: cliente.id } : {}),
      ...(descPct > 0 ? { descuento_porcentaje: parseFloat(descPct.toFixed(4)) } : {}),
      ...(asignacionId ? { asignacion_id: asignacionId } : {}),
      detalles: carrito.map(i => ({
        producto_id: i.id,
        cantidad: i.cantidad,
        precio_unitario: parseFloat(i.precio_venta || 0),
        descuento_porcentaje: 0,
        ...(i.asignacion_detalle_id ? { asignacion_detalle_id: i.asignacion_detalle_id } : {}),
        ...(i.cuotas ? { cuotas: Number(i.cuotas), precio_cuota: Number(i.precio_cuota) } : {}),
      })),
    };
    setSubmitting(true);
    try {
      const { data } = await api.post('/ventas', payload);
      Alert.alert(
        '✅ Venta registrada',
        `N° ${data.numero_venta}\nTotal: ${fmt(data.total)}\nVuelto: ${fmt(vuelto)}`,
        [{ text: 'Nueva venta', onPress: limpiarVenta }]
      );

      // Intentar imprimir ticket automáticamente (no bloquear flujo)
      (async () => {
        try {
          await printTicket(data);
          // Intentar imprimir por Bluetooth ESC/POS si está configurada una impresora
          try {
            await attemptEscPosPrint(data);
          } catch (e) {
            console.warn('ESC/POS no disponible o fallo de impresión:', e.message || e);
          }
        } catch (err) {
          console.warn('Error imprimiendo ticket:', err?.message || err);
        }
      })();
      // clear cache after successful sale
      try {
        const key = `pos:lastAsignacion:${user?.id || 'anon'}:${sucursalId}`;
        await AsyncStorage.removeItem(key).catch(() => {});
        setCachedFallback(false);
        setCachedTs(null);
      } catch (ce) { console.warn('Error limpiando cache post-venta:', ce?.message || ce); }
    } catch (e) {
      Alert.alert('Error al registrar', e.message || 'Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };


  const s = styles(colors);
  const catList = [{ id: null, nombre: 'Todos' }, ...categorias];

  // Impresora integrada: modal para configurar dirección (IP:port o USB id)
  const [printerModalVisible, setPrinterModalVisible] = useState(false);
  const [printerAddr, setPrinterAddr] = useState('');
  // Diagnostic modal
  const [diagModalVisible, setDiagModalVisible] = useState(false);
  const [diagResult, setDiagResult] = useState(null);
  const [runningDiag, setRunningDiag] = useState(false);

  useEffect(() => {
    (async () => {
      const addr = await escpos.getSavedPrinterAddress().catch(() => null);
      if (addr) setPrinterAddr(addr);
    })();
  }, []);

  async function savePrinter() {
    await escpos.savePrinterAddress(printerAddr).catch(() => {});
    setPrinterModalVisible(false);
    Alert.alert('Impresora guardada', `Dirección: ${printerAddr}`);
  }

  const productosVisibles = productos.filter((p) => {
    const texto = `${p.nombre || ''} ${p.codigo || ''}`.toLowerCase();

    const coincideBusqueda = texto.includes(busqueda.toLowerCase());

    const coincideCategoria =
      !categoriaActiva || String(p.categoria_id) === String(categoriaActiva);

    return coincideBusqueda && coincideCategoria && Number(p.stock_disponible || 0) > 0;
  });

  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.headerBg} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.hBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.hIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.hTitle}>Nueva Venta</Text>
        <View style={s.hRight}>
          <TouchableOpacity style={s.hBtn} onPress={async () => {
            setRunningDiag(true);
            try {
              const me = await diag.getMe().catch(e => ({ error: e?.message || String(e) }));
              const asign = await diag.getAsignacionHoy().catch(e => ({ error: e?.message || String(e) }));
              const productosResp = await diag.getProductos().catch(e => ({ error: e?.message || String(e) }));
              setDiagResult({ me, asign, productos: productosResp });
            } catch (e) {
              setDiagResult({ error: e?.message || String(e) });
            } finally {
              setRunningDiag(false);
              setDiagModalVisible(true);
            }
          }}>
            <Text style={[s.hIcon, { fontSize: 16 }]}>🩺</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.hBtn} onPress={() => setPrinterModalVisible(true)}>
            <Text style={[s.hIcon, { fontSize: 16 }]}>🖨</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.hBtn} onPress={() => navigation.goBack()}>
            <Text style={[s.hIcon, { fontSize: 18 }]}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Diagnostic modal */}
      <Modal visible={diagModalVisible} animationType="slide" transparent>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', padding:12 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 8, padding: 12, maxHeight: '80%' }}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <Text style={{ fontSize:16, fontWeight:'700' }}>Diagnóstico POS</Text>
              <TouchableOpacity onPress={() => setDiagModalVisible(false)}>
                <Text style={{ color: colors.textMuted }}>Cerrar</Text>
              </TouchableOpacity>
            </View>
            {runningDiag ? (
              <View style={{ alignItems:'center', padding:20 }}>
                <ActivityIndicator color={colors.accent} size="large" />
              </View>
            ) : (
              <ScrollView>
                <Text style={{ fontSize:12, color: colors.text, fontFamily: 'monospace' }}>{JSON.stringify(diagResult, null, 2)}</Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal selección de cuotas */}
      <Modal visible={cuotasModalVisible} animationType="slide" transparent>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', padding:12 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 8, padding: 12, maxHeight: '70%' }}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <Text style={{ fontSize:16, fontWeight:'700' }}>Seleccionar plan de cuotas</Text>
              <TouchableOpacity onPress={() => { setCuotasModalVisible(false); setCuotasProduct(null); }}>
                <Text style={{ color: colors.textMuted }}>Cerrar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              <TouchableOpacity style={{ paddingVertical:8 }} onPress={() => seleccionarPlanCuotas(null)}>
                <Text style={{ fontSize:14 }}>Pago contado (sin cuotas)</Text>
              </TouchableOpacity>
              {cuotasProduct && Array.isArray(cuotasProduct.precios_cuotas) && cuotasProduct.precios_cuotas.map((p, idx) => (
                <TouchableOpacity key={idx} style={{ paddingVertical:8 }} onPress={() => seleccionarPlanCuotas(p)}>
                  <Text style={{ fontSize:14 }}>{p.cuotas} cuotas x {fmt(p.precio)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Buscador ───────────────────────────────────────────────────────── */}
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

      {/* ── Categorías ─────────────────────────────────────────────────────── */}
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

        {/* Banner cuando no hay asignación o hay mensaje del backend */}
            {(!asignacionId || asignMsg) && (
              <View style={{ position:'absolute', top:8, left:8, right:8, zIndex:20 }}>
                <View style={{ backgroundColor:'#FFF3CD', borderRadius:8, padding:10, borderWidth:1, borderColor:'#FFEEBA' }}>
                  <Text style={{ color:'#856404', marginBottom:8 }}>{asignMsg || 'No se encontró asignación activa.'}</Text>
                  <View style={{ flexDirection:'row', justifyContent:'flex-end' }}>
                    <TouchableOpacity onPress={() => { setAsignMsg(''); cargarAsignacionHoy(); }} style={{ paddingHorizontal:10, paddingVertical:6 }}>
                      <Text style={{ color: colors.accent }}>Reintentar asignación</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setAsignMsg(''); cargarProductos(); }} style={{ paddingHorizontal:10, paddingVertical:6 }}>
                      <Text style={{ color: colors.textMuted }}>Cargar catálogo</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

        {/* ═══ IZQUIERDA: Grid de productos ═══════════════════════════════ */}
        {loadingAsignacion ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color={colors.accent} size="large" />
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
                <View style={s.prodFooter}>
                  <Text style={s.prodPrecio}>{fmt(item.precio_venta)}</Text>
                  <View style={s.stockBadge}>
                    <Text style={s.stockTxt}>{(item.stock_disponible ?? item.stock ?? 0) > 0 ? `Disponible: ${item.stock_disponible}` : 'Sin stock'}</Text>
                  </View>
                  {item.precios_cuotas && Array.isArray(item.precios_cuotas) && item.precios_cuotas.length > 0 && (
                    <View style={{ marginLeft:8, backgroundColor:'#E8F0FF', paddingHorizontal:6, paddingVertical:2, borderRadius:6 }}>
                      <Text style={{ color: '#0B5FFF', fontSize:12 }}>Cuotas</Text>
                    </View>
                  )}
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
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>Sin resultados</Text>
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
                    <Text style={s.cartItemNom} numberOfLines={1}>{item.nombre}</Text>
                    <Text style={s.cartItemPrc}>{fmt(parseFloat(item.precio_venta || 0) * item.cantidad)}</Text>
                    {item.cuotas ? (
                      <TouchableOpacity onPress={() => abrirEditarPlan(item)}>
                        <Text style={{ fontSize: 11, color: colors.textMuted }}>Cuotas: {item.cuotas} x {fmt(item.precio_cuota)} (Editar)</Text>
                      </TouchableOpacity>
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
              <Text style={s.totVal}>{fmt(subtotal)}</Text>
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
            <View style={s.totRow}>
              <Text style={s.totLabel}>Tipo de pago</Text>
              <View style={s.tipoPagoRow}>
                <TouchableOpacity
                  style={[s.tipoPagoBtn, tipoPago === 'contado' && s.tipoPagoBtnOn]}
                  onPress={() => setTipoPago('contado')}
                >
                  <Text style={[s.tipoPagoBtnTxt, tipoPago === 'contado' && s.tipoPagoBtnTxtOn]}>Contado</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.tipoPagoBtn, tipoPago === 'credito' && s.tipoPagoBtnOn]}
                  onPress={() => setTipoPago('credito')}
                >
                  <Text style={[s.tipoPagoBtnTxt, tipoPago === 'credito' && s.tipoPagoBtnTxtOn]}>Crédito</Text>
                </TouchableOpacity>
              </View>
            </View>
            {tipoPago === 'credito' && (
              <View style={s.totRow}>
                <Text style={s.totLabel}>Días crédito</Text>
                <TextInput
                  style={s.descInput}
                  value={diasCredito}
                  onChangeText={setDiasCredito}
                  keyboardType="numeric"
                  placeholder="30"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}
            <View style={[s.totRow, s.totRowFinal]}>
              <Text style={s.totFinalLabel}>TOTAL</Text>
              <Text style={s.totFinalVal}>{fmt(total)}</Text>
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
              <TouchableOpacity style={s.efectivoBtn} onPress={() => setPago(total.toFixed(2))}>
                <Text style={s.efectivoBtnTxt}>Efectivo</Text>
              </TouchableOpacity>
            </View>
            <View style={s.totRow}>
              <Text style={s.totLabel}>Vuelto</Text>
              <Text style={[s.totVal, { color: '#4CAF50' }]}>{fmt(vuelto)}</Text>
            </View>
          </View>

          {/* Botón finalizar */}
          <TouchableOpacity
            style={[s.finalizarBtn, submitting && { opacity: 0.7 }]}
            onPress={finalizarVenta}
            activeOpacity={0.85}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.finalizarTxt}>FINALIZAR VENTA</Text>
            }
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal simple para configurar impresora integrada/network */}
      <Modal visible={printerModalVisible} animationType="slide" transparent>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'center', padding:20 }}>
          <View style={{ backgroundColor:colors.card, borderRadius:8, padding:12 }}>
            <Text style={{ fontSize:16, fontWeight:'600', marginBottom:8 }}>Configurar impresora</Text>
            <Text style={{ marginBottom:6, color:colors.textMuted }}>Introduce IP:PUERTO (ej. 192.168.1.100:9100) o identificador USB</Text>
            <TextInput value={printerAddr} onChangeText={setPrinterAddr} placeholder="192.168.1.100:9100 or usb:..." style={{ borderWidth:1, borderColor:'#ccc', padding:8, borderRadius:6, marginBottom:10 }} />
            <View style={{ flexDirection:'row', justifyContent:'flex-end' }}>
              <TouchableOpacity onPress={() => setPrinterModalVisible(false)} style={{ padding:8, marginRight:8 }}>
                <Text>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={savePrinter} style={{ padding:8 }}>
                <Text style={{ color:colors.accent }}>Guardar</Text>
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
  hRight: { flexDirection: 'row', alignItems: 'center' },

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

  // Grid productos (izquierda)
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
  prodFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  prodPrecio: { fontSize: 12, fontWeight: '700', color: c.accent },
  stockBadge: { backgroundColor: c.surfaceAlt, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  stockTxt:   { fontSize: 9, color: c.textMuted, fontWeight: '600' },
  addBtn:     { backgroundColor: '#10B981', width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  addBtnDisabled: { backgroundColor: '#94D3B2', opacity: 0.6 },
  addBtnTxt:  { color: '#fff', fontSize: 18, lineHeight: 22, fontWeight: '700' },

  // Panel carrito (derecha)
  cartPanel: {
    width: SW * 0.42, backgroundColor: c.surface, borderLeftWidth: 1, borderLeftColor: c.border,
    paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4, flexShrink: 0,
  },
  cartTitle: { fontSize: 13, fontWeight: '700', color: c.text, marginBottom: 6 },

  // Cliente
  clienteBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceAlt,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 6,
    borderWidth: 1, borderColor: c.border,
  },
  clienteIco:  { fontSize: 14, marginRight: 5 },
  clienteTxt:  { flex: 1, fontSize: 11, color: c.text, fontWeight: '500' },
  clienteChev: { fontSize: 12, color: c.textMuted },

  // Lista carrito
  cartList:      { flex: 1, marginBottom: 4 },
  cartEmpty:     { textAlign: 'center', color: c.textMuted, fontSize: 11, paddingTop: 20, lineHeight: 18 },
  cartItem:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: c.border },
  cartItemEmoji: { fontSize: 16, width: 22, marginRight: 5 },
  cartItemInfo:  { flex: 1, marginRight: 4 },
  cartItemNom:   { fontSize: 10, color: c.text, fontWeight: '600' },
  cartItemPrc:   { fontSize: 10, color: c.accent, fontWeight: '700' },
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
  tipoPagoRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' },
  tipoPagoBtn:   { paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: c.border, borderRadius: 8, marginLeft: 6, backgroundColor: c.surface },
  tipoPagoBtnOn: { backgroundColor: c.accent, borderColor: c.accent },
  tipoPagoBtnTxt: { fontSize: 11, color: c.text },
  tipoPagoBtnTxtOn: { color: '#fff' },

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

  // Modal clientes
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox:     { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '70%' },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle:   { fontSize: 15, fontWeight: '700' },
  modalSearch:  { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, marginBottom: 10 },
  clienteRow:   { paddingVertical: 10, borderBottomWidth: 1 },
  clienteRowNom: { fontSize: 13, fontWeight: '600' },
  clienteRowSub: { fontSize: 11, marginTop: 2 },
});
