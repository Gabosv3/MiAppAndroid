import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, TextInput, ActivityIndicator, Alert, Modal, FlatList,
} from 'react-native';
import api, { esErrorTransitorio, TIMEOUT_LECTURA_CACHE } from '../services/api';
import { useConnectivity } from '../services/connectivity';
import * as offlineQueue from '../services/offlineQueue';
import * as localDb from '../services/localDb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');

export default function RegistrarPreventaScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isOnline } = useConnectivity();

  const [cliente, setCliente] = useState(null);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [clientes, setClientes] = useState([]);
  const [buscandoCliente, setBuscandoCliente] = useState(false);

  // No quiere que lo registren — solo nombre y teléfono, sin crear cliente.
  const [noQuiereRegistrarse, setNoQuiereRegistrarse] = useState(false);
  const [nombreNoRegistrado, setNombreNoRegistrado] = useState('');
  const [telefonoNoRegistrado, setTelefonoNoRegistrado] = useState('');

  const [carrito, setCarrito] = useState([]); // [{ id, nombre, codigo, precio_venta, cantidad }]
  const [showProductoModal, setShowProductoModal] = useState(false);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [productos, setProductos] = useState([]);
  const [buscandoProducto, setBuscandoProducto] = useState(false);

  const [observaciones, setObservaciones] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef(null);

  // Igual que en Nueva Venta: si este dispositivo/usuario nunca ha tenido
  // clientes guardados localmente, el respaldo al que cae el catch de abajo
  // está vacío — fallar rápido a los 8s solo deja la lista vacía sin
  // ningún aviso. Se revisa una sola vez si hay algo útil en la caché.
  const hayCacheLocalClientes = useRef(null);
  const buscarClientes = useCallback(async (q) => {
    setBuscandoCliente(true);
    try {
      if (hayCacheLocalClientes.current === null) {
        const locales = await localDb.getLocalClients().catch(() => []);
        hayCacheLocalClientes.current = Array.isArray(locales) && locales.length > 0;
      }
      let qs = 'per_page=30';
      if (q) qs += `&q=${encodeURIComponent(q)}`;
      const timeoutConfig = hayCacheLocalClientes.current ? { timeout: TIMEOUT_LECTURA_CACHE } : undefined;
      const { data } = await api.get(`/clientes?${qs}`, timeoutConfig);
      setClientes(Array.isArray(data) ? data : (data.data || []));
    } catch (e) {
      console.warn("[Preventa] buscar clientes:", e?.message || e);
      if (esErrorTransitorio(e)) {
        const locales = await localDb.searchLocalClients(q);
        setClientes(Array.isArray(locales) ? locales : []);
      }
    } finally {
      setBuscandoCliente(false);
    }
  }, []);

  useEffect(() => {
    if (!showClienteModal) return;
    const t = setTimeout(() => buscarClientes(busquedaCliente), 350);
    return () => clearTimeout(t);
  }, [busquedaCliente, showClienteModal, buscarClientes]);

  const buscarProductos = useCallback(async (q) => {
    setBuscandoProducto(true);
    try {
      // preventa=1: catálogo completo de origen manual, sin restringir a la
      // asignación diaria ni al stock — en preventa se está registrando el
      // interés del cliente para encargar el producto, no despachándolo
      // ahora mismo.
      let qs = 'per_page=30&preventa=1';
      if (q) qs += `&q=${encodeURIComponent(q)}`;
      const { data } = await api.get(`/productos?${qs}`, { timeout: TIMEOUT_LECTURA_CACHE });
      const lista = Array.isArray(data) ? data : (data.data || []);
      setProductos(lista);
    } catch (e) {
      console.warn("[Preventa] cargar productos:", e?.message || e); if (!esErrorTransitorio(e)) setProductos([]);
      // Sin conexión no hay catálogo local para preventas — se avisa en la UI vacía
    } finally {
      setBuscandoProducto(false);
    }
  }, []);

  useEffect(() => {
    if (!showProductoModal) return;
    const t = setTimeout(() => buscarProductos(busquedaProducto), 350);
    return () => clearTimeout(t);
  }, [busquedaProducto, showProductoModal, buscarProductos]);

  const agregarProducto = (p) => {
    setCarrito(prev => {
      const existe = prev.find(i => i.id === p.id);
      if (existe) {
        return prev.map(i => i.id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i);
      }
      return [...prev, { id: p.id, nombre: p.nombre, codigo: p.codigo, precio_venta: p.precio_venta, cantidad: 1 }];
    });
    setShowProductoModal(false);
    setBusquedaProducto('');
  };

  const cambiarCantidad = (id, delta) => {
    setCarrito(prev => prev
      .map(i => i.id === id ? { ...i, cantidad: i.cantidad + delta } : i)
      .filter(i => i.cantidad > 0));
  };

  const totalEstimado = carrito.reduce((s, i) => s + Number(i.precio_venta || 0) * i.cantidad, 0);

  const enviar = async () => {
    if (noQuiereRegistrarse) {
      if (!nombreNoRegistrado.trim()) {
        Alert.alert('Falta el nombre', 'Escribe el nombre completo de la persona interesada.');
        return;
      }
    } else if (!cliente) {
      Alert.alert('Falta el cliente', 'Selecciona el cliente interesado en comprar, o marca "No quiere que lo registren".');
      return;
    }
    if (carrito.length === 0) {
      Alert.alert('Sin productos', 'Agrega al menos un producto de interés.');
      return;
    }
    setSubmitting(true);
    // Generada una vez, antes del primer intento, y reutilizada si la
    // preventa termina encolada offline — evita que un reintento tras
    // timeout cree una preventa duplicada.
    const idempotencyKey = `preventa-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const nombreParaLabel = noQuiereRegistrarse ? nombreNoRegistrado.trim() : cliente.nombre;
    const payload = {
      idempotency_key: idempotencyKey,
      ...(noQuiereRegistrarse
        ? {
            nombre_no_registrado: nombreNoRegistrado.trim(),
            ...(telefonoNoRegistrado.trim() && { telefono_no_registrado: telefonoNoRegistrado.trim() }),
          }
        : { cliente_id: cliente.id }),
      ...(observaciones.trim() && { observaciones: observaciones.trim() }),
      detalles: carrito.map(i => ({ producto_id: i.id, cantidad: i.cantidad })),
    };

    const guardarOffline = async () => {
      await offlineQueue.enqueueRequest({
        method: 'POST',
        url: '/preventas',
        label: `Preventa ${nombreParaLabel}`,
        data: payload,
      });
      Alert.alert(
        '📴 Guardada sin conexión',
        'La preventa se enviará automáticamente cuando recuperes la señal.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    };

    try {
      if (isOnline) {
        try {
          await api.post('/preventas', payload);
          Alert.alert(
            '✅ Preventa registrada',
            'Un administrador la asignará a un vendedor para cerrar la venta.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        } catch (e) {
          if (esErrorTransitorio(e)) await guardarOffline();
          else Alert.alert('Error', e?.message || 'No se pudo registrar la preventa.');
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
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Registrar preventa</Text>
      </View>

      {!isOnline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>📴 Sin conexión — se guardará y enviará al reconectarte</Text>
        </View>
      )}

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={s.card}>
          <Text style={s.cardTitle}>Cliente interesado</Text>

          {!noQuiereRegistrarse && (
            cliente ? (
              <TouchableOpacity style={s.clienteSel} onPress={() => setShowClienteModal(true)}>
                <View style={[s.avatar, { backgroundColor: '#1565C0' }]}>
                  <Text style={s.avatarTxt}>{initials(cliente.nombre)}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={s.clienteNombre}>{cliente.nombre}</Text>
                  {cliente.codigo_anterior ? <Text style={s.clienteSub}>Código: {cliente.codigo_anterior}</Text> : null}
                </View>
                <Text style={{ color: '#1565C0', fontWeight: '700', fontSize: 12 }}>Cambiar</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.selectBtn} onPress={() => setShowClienteModal(true)}>
                <Text style={{ fontSize: 18, marginRight: 10 }}>👤</Text>
                <Text style={s.selectBtnTxt}>Buscar cliente...</Text>
              </TouchableOpacity>
            )
          )}

          <TouchableOpacity
            style={s.checkRow}
            onPress={() => {
              setNoQuiereRegistrarse(v => !v);
              setCliente(null);
            }}
          >
            <View style={[s.checkbox, noQuiereRegistrarse && s.checkboxOn]}>
              {noQuiereRegistrarse && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
            </View>
            <Text style={s.checkLabel}>No quiere que lo registren — solo tomar nombre y teléfono</Text>
          </TouchableOpacity>

          {noQuiereRegistrarse && (
            <View style={{ marginTop: 10 }}>
              <TextInput
                style={s.input}
                value={nombreNoRegistrado}
                onChangeText={setNombreNoRegistrado}
                placeholder="Nombre completo *"
                placeholderTextColor="#bbb"
              />
              <TextInput
                style={s.input}
                value={telefonoNoRegistrado}
                onChangeText={setTelefonoNoRegistrado}
                placeholder="Teléfono (opcional)"
                placeholderTextColor="#bbb"
                keyboardType="phone-pad"
              />
            </View>
          )}
        </View>

        <View style={s.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={s.cardTitle}>Productos de interés</Text>
            <TouchableOpacity onPress={() => setShowProductoModal(true)}>
              <Text style={{ color: '#1565C0', fontWeight: '700', fontSize: 13 }}>+ Agregar</Text>
            </TouchableOpacity>
          </View>

          {carrito.length === 0 ? (
            <Text style={{ color: '#aaa', fontSize: 13, textAlign: 'center', paddingVertical: 10 }}>Sin productos agregados</Text>
          ) : carrito.map(item => (
            <View key={item.id} style={s.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemNombre}>{item.nombre}</Text>
                <Text style={s.itemPrecio}>{fmt(item.precio_venta)} c/u</Text>
              </View>
              <View style={s.cantidadCtrl}>
                <TouchableOpacity style={s.cantidadBtn} onPress={() => cambiarCantidad(item.id, -1)}>
                  <Text style={s.cantidadBtnTxt}>−</Text>
                </TouchableOpacity>
                <Text style={s.cantidadVal}>{item.cantidad}</Text>
                <TouchableOpacity style={s.cantidadBtn} onPress={() => cambiarCantidad(item.id, 1)}>
                  <Text style={s.cantidadBtnTxt}>+</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.itemSubtotal}>{fmt(item.precio_venta * item.cantidad)}</Text>
            </View>
          ))}

          {carrito.length > 0 && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Monto estimado</Text>
              <Text style={s.totalVal}>{fmt(totalEstimado)}</Text>
            </View>
          )}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Observaciones <Text style={{ color: '#bbb', fontWeight: '400' }}>(opcional)</Text></Text>
          <TextInput
            style={[s.input, { height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
            value={observaciones}
            onChangeText={setObservaciones}
            placeholder="Ej: interesado en pagar a crédito, visitar por la tarde..."
            placeholderTextColor="#bbb"
            multiline
          />
        </View>

        <View style={s.infoBox}>
          <Text style={s.infoTxt}>ℹ️ Esto NO es una venta — solo registra el interés del cliente. Un administrador la asignará a un vendedor para cerrar la venta real.</Text>
        </View>

        <TouchableOpacity style={[s.btnPrimary, submitting && { opacity: 0.6 }]} onPress={enviar} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryTxt}>Registrar preventa</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.btnSecondary} onPress={() => navigation.goBack()}>
          <Text style={s.btnSecondaryTxt}>Cancelar</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal buscar cliente */}
      <Modal visible={showClienteModal} animationType="slide" transparent onRequestClose={() => setShowClienteModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Buscar cliente</Text>
            <TextInput
              style={s.modalInput}
              placeholder="Nombre, código o teléfono..."
              placeholderTextColor="#bbb"
              value={busquedaCliente}
              onChangeText={setBusquedaCliente}
              autoFocus
            />
            {buscandoCliente && <ActivityIndicator style={{ marginTop: 10 }} color="#1565C0" />}
            <FlatList
              data={clientes}
              keyExtractor={c => String(c.id)}
              style={{ maxHeight: 320, marginTop: 10 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.resultItem}
                  onPress={() => { setCliente(item); setShowClienteModal(false); setBusquedaCliente(''); }}
                >
                  <Text style={s.resultNombre}>{item.nombre}</Text>
                  {item.codigo_anterior ? <Text style={s.resultSub}>Código: {item.codigo_anterior}</Text> : null}
                </TouchableOpacity>
              )}
              ListEmptyComponent={!buscandoCliente ? <Text style={{ color: '#aaa', textAlign: 'center', padding: 16 }}>Sin resultados</Text> : null}
            />
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowClienteModal(false)}>
              <Text style={s.cancelBtnTxt}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal buscar producto */}
      <Modal visible={showProductoModal} animationType="slide" transparent onRequestClose={() => setShowProductoModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Buscar producto</Text>
            <TextInput
              style={s.modalInput}
              placeholder="Nombre o código..."
              placeholderTextColor="#bbb"
              value={busquedaProducto}
              onChangeText={setBusquedaProducto}
              autoFocus
            />
            {buscandoProducto && <ActivityIndicator style={{ marginTop: 10 }} color="#1565C0" />}
            {!isOnline && (
              <Text style={{ color: '#e65100', fontSize: 12, marginTop: 8, textAlign: 'center' }}>
                Sin conexión — el catálogo de productos no está disponible offline.
              </Text>
            )}
            <FlatList
              data={productos}
              keyExtractor={p => String(p.id)}
              style={{ maxHeight: 320, marginTop: 10 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.resultItem} onPress={() => agregarProducto(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.resultNombre}>{item.nombre}</Text>
                    <Text style={s.resultSub}>{item.codigo}</Text>
                  </View>
                  <Text style={{ color: '#1565C0', fontWeight: '800' }}>{fmt(item.precio_venta)}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={!buscandoProducto ? <Text style={{ color: '#aaa', textAlign: 'center', padding: 16 }}>Sin resultados</Text> : null}
            />
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowProductoModal(false)}>
              <Text style={s.cancelBtnTxt}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    backgroundColor: '#1565C0', flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 32, // paddingTop real (insets.top) se aplica inline en el render
    paddingBottom: 16, paddingHorizontal: 16,
  },
  backBtn: {},
  backArrow: { color: '#fff', fontSize: 24 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },

  offlineBanner: { backgroundColor: '#fff3cd', padding: 10, borderBottomWidth: 1, borderBottomColor: '#ffeaa7' },
  offlineTxt: { color: '#856404', fontSize: 12, fontWeight: '600', textAlign: 'center' },

  card: { backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12, borderRadius: 16, padding: 16, elevation: 2 },
  cardTitle: { color: '#1a1a1a', fontSize: 14, fontWeight: '800' },

  selectBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, padding: 14, marginTop: 10, borderStyle: 'dashed' },
  selectBtnTxt: { color: '#888', fontSize: 14 },

  checkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: '#bbb', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  checkboxOn: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  checkLabel: { flex: 1, color: '#555', fontSize: 13 },

  clienteSel: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  clienteNombre: { color: '#1a1a1a', fontWeight: '700', fontSize: 14 },
  clienteSub: { color: '#888', fontSize: 11, marginTop: 2 },

  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', gap: 8 },
  itemNombre: { color: '#1a1a1a', fontWeight: '700', fontSize: 13 },
  itemPrecio: { color: '#888', fontSize: 11, marginTop: 2 },
  cantidadCtrl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cantidadBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#e3f2fd', alignItems: 'center', justifyContent: 'center' },
  cantidadBtnTxt: { color: '#1565C0', fontWeight: '900', fontSize: 15 },
  cantidadVal: { fontWeight: '800', fontSize: 14, minWidth: 18, textAlign: 'center' },
  itemSubtotal: { color: '#1a1a1a', fontWeight: '800', fontSize: 13, minWidth: 60, textAlign: 'right' },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, marginTop: 4 },
  totalLabel: { color: '#666', fontWeight: '700', fontSize: 13 },
  totalVal: { color: '#1565C0', fontWeight: '900', fontSize: 16 },

  input: { borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, padding: 12, fontSize: 14, color: '#1a1a1a', marginTop: 10 },

  infoBox: { backgroundColor: '#e3f2fd', marginHorizontal: 12, marginTop: 12, borderRadius: 12, padding: 12 },
  infoTxt: { color: '#1565C0', fontSize: 12, lineHeight: 18 },

  btnPrimary: { marginHorizontal: 12, marginTop: 16, backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnSecondary: { marginHorizontal: 12, marginTop: 10, borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  btnSecondaryTxt: { color: '#1565C0', fontWeight: '700', fontSize: 15 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#1a1a1a' },
  modalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, marginTop: 12, fontSize: 14 },
  resultItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  resultNombre: { color: '#1a1a1a', fontWeight: '700', fontSize: 14 },
  resultSub: { color: '#888', fontSize: 11, marginTop: 2 },
  cancelBtn: { marginTop: 14, alignItems: 'center', paddingVertical: 10 },
  cancelBtnTxt: { color: '#666', fontWeight: '700' },
});
