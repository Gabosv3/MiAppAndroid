import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView,
  ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api, { TIMEOUT_LECTURA_CACHE } from '../services/api';
import { useConnectivity } from '../services/connectivity';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fechaHoyLocal } from '../services/dateUtils';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
// Hora de El Salvador, no UTC: pasadas las 6 pm el día UTC ya es "mañana".

export default function AdminAsignacionesScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isOnline } = useConnectivity();

  const [fecha] = useState(fechaHoyLocal());
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liquidandoId, setLiquidandoId] = useState(null);

  // ── Modal crear/editar ────────────────────────────────────────────────
  const [modalVisible, setModalVisible] = useState(false);
  const [editandoId, setEditandoId] = useState(null); // null = creando nueva
  const [cargandoModal, setCargandoModal] = useState(false);

  const [vendedores, setVendedores] = useState([]);
  const [cargandoListas, setCargandoListas] = useState(false);
  const [errorListas, setErrorListas] = useState('');
  const [errorProductos, setErrorProductos] = useState('');
  const [vendedorSel, setVendedorSel] = useState(null);

  const [categorias, setCategorias] = useState([]);
  const [categoriaSel, setCategoriaSel] = useState(null); // null = Todos
  const [busquedaProd, setBusquedaProd] = useState('');
  const [productos, setProductos] = useState([]);
  const [cargandoProductos, setCargandoProductos] = useState(false);

  const [carrito, setCarrito] = useState([]); // [{producto_id, nombre, codigo, stock, cantidad_asignada, precio_venta}]
  const [observaciones, setObservaciones] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!isOnline) {
      setError('Necesitás conexión a internet.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/asignaciones', { params: { fecha }, timeout: TIMEOUT_LECTURA_CACHE });
      setLista(res.data);
    } catch (e) {
      setError(
        e?.response?.status === 403
          ? 'Tu cuenta no tiene permiso de super admin.'
          : 'No se pudieron cargar las asignaciones.'
      );
    } finally {
      setLoading(false);
    }
  }, [isOnline, fecha]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  // ── Catálogo: se recarga cada vez que cambia búsqueda o categoría ──────
  const cargarProductos = useCallback(async (texto, categoriaId) => {
    setCargandoProductos(true);
    setErrorProductos('');
    try {
      const res = await api.get('/admin/productos-catalogo', {
        params: { buscar: texto || undefined, categoria_id: categoriaId || undefined },
        timeout: TIMEOUT_LECTURA_CACHE,
      });
      setProductos(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.warn('[AdminAsignacionesScreen] catálogo:', e?.message || e);
      setErrorProductos(e?.message || 'No se pudo cargar el catálogo.');
    } finally {
      setCargandoProductos(false);
    }
  }, []);

  useEffect(() => {
    if (!modalVisible) return;
    const t = setTimeout(() => cargarProductos(busquedaProd, categoriaSel?.id), 300);
    return () => clearTimeout(t);
  }, [busquedaProd, categoriaSel, modalVisible, cargarProductos]);

  const abrirNuevo = async () => {
    setEditandoId(null);
    setVendedorSel(null);
    setCarrito([]);
    setObservaciones('');
    setBusquedaProd('');
    setCategoriaSel(null);
    setModalVisible(true);
    cargarListasBase();
  };

  const abrirEditar = async (asignacion) => {
    setEditandoId(asignacion.id);
    setBusquedaProd('');
    setCategoriaSel(null);
    setModalVisible(true);
    setCargandoModal(true);
    cargarListasBase();
    try {
      const res = await api.get(`/admin/asignaciones/${asignacion.id}`, { timeout: TIMEOUT_LECTURA_CACHE });
      const d = res.data;
      setVendedorSel({ id: d.vendedor_id, nombre: d.vendedor, sucursal_id: d.sucursal_id });
      setObservaciones(d.observaciones || '');
      setCarrito(d.detalles.map(x => ({
        producto_id: x.producto_id,
        nombre: x.nombre,
        codigo: x.codigo,
        stock: x.stock,
        cantidad_asignada: String(x.cantidad_asignada),
        precio_venta: String(x.precio_venta),
      })));
    } catch (e) {
      Alert.alert('No se pudo cargar la asignación', String(e?.message || e));
      setModalVisible(false);
    } finally {
      setCargandoModal(false);
    }
  };

  const cargarListasBase = async () => {
    setCargandoListas(true);
    setErrorListas('');
    try {
      const [resV, resC] = await Promise.all([
        vendedores.length === 0 ? api.get('/admin/vendedores', { timeout: TIMEOUT_LECTURA_CACHE }) : Promise.resolve({ data: vendedores }),
        categorias.length === 0 ? api.get('/admin/categorias', { timeout: TIMEOUT_LECTURA_CACHE }) : Promise.resolve({ data: categorias }),
      ]);
      setVendedores(Array.isArray(resV.data) ? resV.data : []);
      setCategorias(Array.isArray(resC.data) ? resC.data : []);
    } catch (e) {
      console.warn('[AdminAsignacionesScreen] listas base:', e?.message || e);
      // Antes el fallo era silencioso y la lista de vendedores quedaba con el
      // spinner girando para siempre, sin decir por qué.
      setErrorListas(e?.message || 'No se pudieron cargar vendedores y categorías.');
    } finally {
      setCargandoListas(false);
    }
  };

  const agregarProducto = (p) => {
    if (carrito.some(c => c.producto_id === p.id)) return;
    setCarrito(prev => [...prev, {
      producto_id: p.id, nombre: p.nombre, codigo: p.codigo, stock: p.stock,
      cantidad_asignada: '1', precio_venta: String(p.precio_venta ?? 0),
    }]);
  };

  const cambiarCantidad = (producto_id, delta) => {
    setCarrito(prev => prev.map(c => {
      if (c.producto_id !== producto_id) return c;
      const nueva = Math.max(1, (parseInt(c.cantidad_asignada, 10) || 1) + delta);
      return { ...c, cantidad_asignada: String(nueva) };
    }));
  };

  const setCantidadManual = (producto_id, valor) => {
    setCarrito(prev => prev.map(c => c.producto_id === producto_id ? { ...c, cantidad_asignada: valor.replace(/[^0-9]/g, '') } : c));
  };

  const cambiarPrecio = (producto_id, valor) => {
    setCarrito(prev => prev.map(c => c.producto_id === producto_id ? { ...c, precio_venta: valor.replace(/[^0-9.]/g, '') } : c));
  };

  const quitarProducto = (producto_id) => {
    setCarrito(prev => prev.filter(c => c.producto_id !== producto_id));
  };

  const guardarAsignacion = async () => {
    if (!editandoId && !vendedorSel) {
      Alert.alert('Falta el vendedor', 'Selecciona a quién le vas a asignar productos.');
      return;
    }
    if (carrito.length === 0) {
      Alert.alert('Sin productos', 'Agrega al menos un producto.');
      return;
    }
    const detalles = carrito.map(c => {
      const precio = parseFloat(c.precio_venta);
      return {
        producto_id: c.producto_id,
        cantidad_asignada: Number(c.cantidad_asignada) || 0,
        // Vacío o 0: no se manda y el servidor usa el precio del catálogo.
        // Antes se mandaba 0 y el vendedor terminaba vendiendo a $0.
        ...(precio > 0 ? { precio_venta: precio } : {}),
      };
    });
    if (detalles.some(d => d.cantidad_asignada <= 0)) {
      Alert.alert('Cantidad inválida', 'Todas las cantidades deben ser mayores a 0.');
      return;
    }
    setGuardando(true);
    try {
      if (editandoId) {
        await api.patch(`/admin/asignaciones/${editandoId}`, {
          observaciones: observaciones.trim() || null,
          detalles,
        });
        Alert.alert('✅ Listo', 'Asignación actualizada.');
      } else {
        await api.post('/admin/asignaciones', {
          vendedor_id: vendedorSel.id,
          sucursal_id: vendedorSel.sucursal_id,
          fecha,
          observaciones: observaciones.trim() || undefined,
          detalles,
        });
        Alert.alert('✅ Listo', `Asignación creada para ${vendedorSel.nombre}.`);
      }
      setModalVisible(false);
      cargar();
    } catch (e) {
      Alert.alert('No se pudo guardar', e?.message || 'Intentá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const liquidar = (asignacion) => {
    Alert.alert(
      'Liquidar jornada',
      `¿Cerrar la asignación de ${asignacion.vendedor}? Se calculará lo vendido vs. lo devuelto.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Liquidar', style: 'destructive', onPress: async () => {
            setLiquidandoId(asignacion.id);
            try {
              await api.post(`/admin/asignaciones/${asignacion.id}/liquidar`, {});
              cargar();
            } catch (e) {
              Alert.alert('Error', e?.message || 'No se pudo liquidar.');
            } finally {
              setLiquidandoId(null);
            }
          },
        },
      ]
    );
  };

  const totalCarrito = carrito.reduce((acc, c) => acc + (Number(c.cantidad_asignada) || 0) * (Number(c.precio_venta) || 0), 0);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>📦 Asignaciones Diarias</Text>
      </View>

      <TouchableOpacity style={s.nuevaBtn} onPress={abrirNuevo} activeOpacity={0.85}>
        <Text style={s.nuevaBtnTxt}>+ Nueva asignación de hoy</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#1a1a1a" /></View>
      ) : error ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>⚠️</Text>
          <Text style={s.errorTxt}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {lista.length === 0 && (
            <Text style={s.vacioTxt}>Todavía no hay asignaciones registradas hoy.</Text>
          )}
          {lista.map((a) => (
            <View key={a.id} style={s.card}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.vendedorNombre}>{a.vendedor}</Text>
                  <Text style={s.sucursalTxt}>{a.sucursal || '—'}</Text>
                </View>
                <View style={[s.badge, a.estado === 'activa' ? s.badgeActiva : s.badgeLiquidada]}>
                  <Text style={s.badgeTxt}>{a.estado === 'activa' ? 'Activa' : 'Liquidada'}</Text>
                </View>
              </View>

              {a.productos.map((p, i) => (
                <View key={i} style={s.prodRow}>
                  <Text style={s.prodNombre} numberOfLines={1}>{p.nombre}</Text>
                  <Text style={s.prodCant}>{p.cantidad_vendida ?? 0}/{p.cantidad_asignada}</Text>
                </View>
              ))}

              {a.estado === 'liquidada' && (
                <Text style={s.totalVendido}>Vendido: {fmt(a.total_vendido)}</Text>
              )}

              {a.estado === 'activa' && (
                <View style={s.accionesRow}>
                  <TouchableOpacity style={s.editarBtn} onPress={() => abrirEditar(a)} activeOpacity={0.85}>
                    <Text style={s.editarBtnTxt}>✏️ Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.liquidarBtn}
                    onPress={() => liquidar(a)}
                    disabled={liquidandoId === a.id}
                    activeOpacity={0.85}
                  >
                    {liquidandoId === a.id
                      ? <ActivityIndicator size="small" color="#B71C1C" />
                      : <Text style={s.liquidarBtnTxt}>Liquidar</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Modal: nueva / editar asignación */}
      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={s.root}>
          <View style={[s.header, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.backArrow}>✕</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>{editandoId ? 'Editar asignación' : 'Nueva asignación'}</Text>
          </View>

          {cargandoModal ? (
            <View style={s.center}><ActivityIndicator size="large" color="#1a1a1a" /></View>
          ) : (
            <View style={{ flex: 1 }}>
              <View style={s.modalTop}>
                <Text style={s.label}>Vendedor</Text>
                {editandoId ? (
                  <View style={[s.vendedorSelChip, { backgroundColor: '#88888815' }]}>
                    <Text style={[s.vendedorSelTxt, { color: '#555' }]}>{vendedorSel?.nombre}</Text>
                  </View>
                ) : vendedorSel ? (
                  <TouchableOpacity style={s.vendedorSelChip} onPress={() => setVendedorSel(null)}>
                    <Text style={s.vendedorSelTxt}>{vendedorSel.nombre} ({vendedorSel.codigo})</Text>
                    <Text style={{ color: '#1565C0', fontWeight: '700' }}>Cambiar</Text>
                  </TouchableOpacity>
                ) : (
                  // ScrollView (antes un View con maxHeight + overflow hidden): con más
                  // vendedores de los que caben en 220px el resto quedaba cortado y no
                  // había forma de llegar a ellos.
                  <ScrollView
                    style={s.vendedorLista}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                  >
                    {vendedores.length === 0
                      ? (cargandoListas
                        ? <ActivityIndicator size="small" color="#1a1a1a" style={{ marginVertical: 12 }} />
                        : (
                          <View style={{ padding: 12, alignItems: 'center' }}>
                            <Text style={{ color: errorListas ? '#e53e3e' : '#888', textAlign: 'center', marginBottom: 8 }}>
                              {errorListas || 'No hay vendedores disponibles.'}
                            </Text>
                            <TouchableOpacity onPress={cargarListasBase}>
                              <Text style={{ color: '#1565C0', fontWeight: '700' }}>Reintentar</Text>
                            </TouchableOpacity>
                          </View>
                        ))
                      : vendedores.map(v => (
                        <TouchableOpacity key={v.id} style={s.vendedorItem} onPress={() => setVendedorSel(v)}>
                          <Text style={s.vendedorItemTxt}>{v.nombre} ({v.codigo})</Text>
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                )}
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                <Text style={s.label}>Buscar productos</Text>
                <TextInput
                  style={s.input}
                  value={busquedaProd}
                  onChangeText={setBusquedaProd}
                  placeholder="Buscar por nombre o código..."
                  placeholderTextColor="#bbb"
                />

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: 8 }}>
                  <TouchableOpacity
                    style={[s.catChip, !categoriaSel && s.catChipOn]}
                    onPress={() => setCategoriaSel(null)}
                  >
                    <Text style={[s.catChipTxt, !categoriaSel && s.catChipTxtOn]}>Todos</Text>
                  </TouchableOpacity>
                  {categorias.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      style={[s.catChip, categoriaSel?.id === c.id && s.catChipOn]}
                      onPress={() => setCategoriaSel(c)}
                    >
                      <Text style={[s.catChipTxt, categoriaSel?.id === c.id && s.catChipTxtOn]}>{c.nombre}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {cargandoProductos && <ActivityIndicator size="small" color="#1a1a1a" style={{ marginTop: 12 }} />}
                {!!errorProductos && <Text style={{ color: '#e53e3e', marginTop: 12 }}>{errorProductos}</Text>}

                <View style={s.grid}>
                  {productos.map(p => {
                    const yaAgregado = carrito.some(c => c.producto_id === p.id);
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[s.gridItem, yaAgregado && s.gridItemOn]}
                        onPress={() => agregarProducto(p)}
                        disabled={yaAgregado}
                        activeOpacity={0.85}
                      >
                        <View style={s.gridIcon}><Text style={{ fontSize: 22 }}>📦</Text></View>
                        <Text style={s.gridNombre} numberOfLines={2}>{p.nombre}</Text>
                        <Text style={s.gridSub}>{p.codigo} · Stock: {p.stock}</Text>
                        <Text style={s.gridPrecio}>{fmt(p.precio_venta)}</Text>
                        {yaAgregado && <Text style={s.gridAgregado}>✓ Agregado</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {carrito.length > 0 && (
                  <View style={{ marginTop: 20 }}>
                    <Text style={s.label}>Productos asignados ({carrito.length})</Text>
                    {carrito.map(c => (
                      <View key={c.producto_id} style={s.carritoCard}>
                        <View style={s.carritoTop}>
                          <Text style={s.carritoNombre} numberOfLines={1}>{c.nombre}</Text>
                          <TouchableOpacity onPress={() => quitarProducto(c.producto_id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={{ color: '#e53e3e', fontSize: 18, fontWeight: '800' }}>×</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={s.carritoCodigo}>{c.codigo} · Stock: {c.stock ?? '—'}</Text>
                        <View style={s.carritoBottom}>
                          <View style={s.precioBox}>
                            <Text style={s.precioLabel}>Precio</Text>
                            {editandoId ? (
                              <View style={s.precioInputWrap}>
                                <Text style={{ color: '#888', fontSize: 13 }}>$</Text>
                                <TextInput
                                  style={s.precioInput}
                                  value={c.precio_venta}
                                  onChangeText={(v) => cambiarPrecio(c.producto_id, v)}
                                  keyboardType="decimal-pad"
                                />
                              </View>
                            ) : (
                              // Al crear, el servidor usa el precio del catálogo; un
                              // campo editable aquí parecería funcionar y se ignoraría.
                              <Text style={s.precioFijo}>{fmt(c.precio_venta)}</Text>
                            )}
                          </View>
                          <View style={s.stepper}>
                            <TouchableOpacity style={s.stepperBtn} onPress={() => cambiarCantidad(c.producto_id, -1)}>
                              <Text style={s.stepperTxt}>−</Text>
                            </TouchableOpacity>
                            <TextInput
                              style={s.stepperInput}
                              value={String(c.cantidad_asignada)}
                              onChangeText={(v) => setCantidadManual(c.producto_id, v)}
                              keyboardType="number-pad"
                            />
                            <TouchableOpacity style={s.stepperBtn} onPress={() => cambiarCantidad(c.producto_id, 1)}>
                              <Text style={s.stepperTxt}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <Text style={s.carritoSubtotal}>
                          {fmt((Number(c.cantidad_asignada) || 0) * (Number(c.precio_venta) || 0))}
                        </Text>
                      </View>
                    ))}
                    <Text style={s.totalGeneral}>Total asignado: {fmt(totalCarrito)}</Text>
                  </View>
                )}

                <Text style={[s.label, { marginTop: 18 }]}>Observaciones (opcional)</Text>
                <TextInput
                  style={[s.input, { minHeight: 60, textAlignVertical: 'top' }]}
                  value={observaciones}
                  onChangeText={setObservaciones}
                  placeholder="Notas para el vendedor..."
                  placeholderTextColor="#bbb"
                  multiline
                />

                <TouchableOpacity
                  style={[s.guardarBtn, guardando && { opacity: 0.6 }]}
                  onPress={guardarAsignacion}
                  disabled={guardando}
                  activeOpacity={0.85}
                >
                  {guardando
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.guardarBtnTxt}>{editandoId ? 'Guardar cambios' : 'Crear asignación'}</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f6fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  errorTxt: { color: '#888', textAlign: 'center', fontSize: 13 },
  vacioTxt: { color: '#999', textAlign: 'center', fontSize: 13, marginTop: 30 },
  header: {
    backgroundColor: '#1a1a1a', flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 32, paddingBottom: 16, paddingHorizontal: 16,
  },
  backBtn: {},
  backArrow: { color: '#fff', fontSize: 22 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },

  nuevaBtn: { backgroundColor: '#F5A623', margin: 16, marginBottom: 0, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  nuevaBtnTxt: { color: '#1a1a1a', fontWeight: '800', fontSize: 14 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  vendedorNombre: { fontSize: 15, fontWeight: '800', color: '#1a1a1a' },
  sucursalTxt: { fontSize: 11, color: '#999', marginTop: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeActiva: { backgroundColor: '#2e7d3220' },
  badgeLiquidada: { backgroundColor: '#88888820' },
  badgeTxt: { fontSize: 11, fontWeight: '700', color: '#333' },

  prodRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  prodNombre: { flex: 1, fontSize: 12, color: '#444' },
  prodCant: { fontSize: 12, color: '#888', fontWeight: '700' },
  totalVendido: { marginTop: 8, fontSize: 12, color: '#2e7d32', fontWeight: '800' },

  accionesRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  editarBtn: { flex: 1, borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  editarBtnTxt: { color: '#1565C0', fontWeight: '800', fontSize: 13 },
  liquidarBtn: { flex: 1, borderWidth: 1.5, borderColor: '#B71C1C', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  liquidarBtnTxt: { color: '#B71C1C', fontWeight: '800', fontSize: 13 },

  modalTop: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  label: { fontSize: 12, fontWeight: '800', color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, padding: 12, fontSize: 14, color: '#1a1a1a' },

  vendedorSelChip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1565C012', borderRadius: 10, padding: 14 },
  vendedorSelTxt: { color: '#1565C0', fontWeight: '700', fontSize: 13 },
  vendedorLista: { borderWidth: 1.5, borderColor: '#eee', borderRadius: 10, maxHeight: 220, overflow: 'hidden' },
  vendedorItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  vendedorItemTxt: { fontSize: 13, color: '#333' },

  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: '#eee' },
  catChipOn: { backgroundColor: '#1a1a1a' },
  catChipTxt: { fontSize: 12, fontWeight: '700', color: '#555' },
  catChipTxtOn: { color: '#fff' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  gridItem: { width: '47%', backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: '#eee' },
  gridItemOn: { borderColor: '#2e7d32', backgroundColor: '#2e7d3208' },
  gridIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  gridNombre: { fontSize: 12, fontWeight: '700', color: '#1a1a1a', minHeight: 32 },
  gridSub: { fontSize: 10, color: '#999', marginTop: 4 },
  gridPrecio: { fontSize: 13, fontWeight: '800', color: '#F5A623', marginTop: 4 },
  gridAgregado: { fontSize: 10, fontWeight: '800', color: '#2e7d32', marginTop: 4 },

  carritoCard: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginTop: 8, borderWidth: 1, borderColor: '#eee' },
  carritoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  carritoNombre: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  carritoCodigo: { fontSize: 10, color: '#999', marginTop: 2 },
  carritoBottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10, gap: 10 },
  precioBox: { flex: 1 },
  precioLabel: { fontSize: 10, color: '#999', marginBottom: 4 },
  precioFijo: { fontSize: 14, fontWeight: '800', color: '#1a1a1a', paddingVertical: 8 },
  precioInputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 8, paddingHorizontal: 8 },
  precioInput: { flex: 1, paddingVertical: 8, fontSize: 13, color: '#1a1a1a' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepperBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' },
  stepperTxt: { fontSize: 16, fontWeight: '800', color: '#333' },
  stepperInput: { width: 40, textAlign: 'center', fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  carritoSubtotal: { textAlign: 'right', fontSize: 12, fontWeight: '800', color: '#F5A623', marginTop: 8 },
  totalGeneral: { textAlign: 'right', fontSize: 14, fontWeight: '900', color: '#1a1a1a', marginTop: 10 },

  guardarBtn: { backgroundColor: '#1a1a1a', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  guardarBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
