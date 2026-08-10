import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ActivityIndicator, TextInput, FlatList, Platform,
} from 'react-native';
import api from '../services/api';
import { useConnectivity } from '../services/connectivity';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const AVATAR_COLORS = ['#1565C0','#6a1b9a','#00695c','#e65100','#c62828','#283593','#4527a0','#2e7d32'];
const avatarColor = (name = '') => AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
const initials    = (name = '') => name.trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('');

export default function DirectorioClientesScreen({ navigation }) {
  const { isOnline } = useConnectivity();
  const [query,    setQuery]    = useState('');
  const [loading,  setLoading]  = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [error,    setError]    = useState('');
  const [rutas,    setRutas]    = useState([]); // [{ ruta, total_clientes, clientes }]
  const [totales,  setTotales]  = useState({ total_rutas: 0, total_clientes: 0 });
  const [rutaFiltro, setRutaFiltro] = useState(null); // null = todas
  const debounceRef = useRef(null);

  const cargar = useCallback(async (buscar = '') => {
    if (!isOnline) {
      setError('Necesitás conexión a internet para consultar el directorio.');
      setLoading(false);
      setBuscando(false);
      return;
    }
    setError('');
    try {
      const { data } = await api.get('/cobros/clientes', {
        params: buscar.trim() ? { buscar: buscar.trim() } : {},
      });
      setRutas(data.rutas || []);
      setTotales({ total_rutas: data.total_rutas || 0, total_clientes: data.total_clientes || 0 });
    } catch (e) {
      setError(e?.response?.data?.message || 'No se pudo cargar el directorio de clientes.');
    } finally {
      setLoading(false);
      setBuscando(false);
    }
  }, [isOnline]);

  useEffect(() => { cargar(); }, [cargar]);

  const onChangeQuery = (texto) => {
    setQuery(texto);
    setRutaFiltro(null);
    setBuscando(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => cargar(texto), 400);
  };

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const abrirPerfil = (cliente) => {
    navigation.navigate('PerfilCliente', { clienteId: cliente.id, clienteNombre: cliente.nombre });
  };

  const rutasFiltradas = rutaFiltro === null ? rutas : rutas.filter(r => r.ruta?.id === rutaFiltro);

  // El directorio puede traer 1000+ clientes. Antes se armaba una lista de
  // "rutas" (virtualizada por FlatList) donde cada renderItem pintaba TODOS
  // los clientes de esa ruta con un .map dentro de una View normal — eso
  // saca de la virtualización a los clientes (cientos de filas de golpe,
  // aunque no estén en pantalla) y es lo que hacía lenta la carga. Aplanando
  // todo a un solo array de filas (encabezado de ruta + cliente, cliente...)
  // cada fila individual entra a la virtualización real de FlatList.
  const filas = useMemo(() => {
    const out = [];
    rutasFiltradas.forEach(r => {
      out.push({ tipo: 'header', key: `h-${r.ruta?.id}`, ruta: r.ruta });
      (r.clientes || []).forEach(c => out.push({ tipo: 'cliente', key: `c-${c.id}`, cliente: c }));
    });
    return out;
  }, [rutasFiltradas]);

  const renderFila = ({ item }) => {
    if (item.tipo === 'header') {
      return (
        <Text style={s.rutaTitulo}>{item.ruta?.nombre} <Text style={s.rutaDia}>· {item.ruta?.dia_semana}</Text></Text>
      );
    }
    const c = item.cliente;
    const color = avatarColor(c.nombre);
    return (
      <TouchableOpacity style={s.card} onPress={() => abrirPerfil(c)} activeOpacity={0.8}>
        <View style={[s.avatar, { backgroundColor: color }]}>
          <Text style={s.avatarTxt}>{initials(c.nombre)}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.nombre}>{c.nombre}</Text>
          <Text style={s.meta}>
            {c.codigo_anterior ? `Código: ${c.codigo_anterior}` : ''}
            {c.codigo_anterior && c.telefono ? '  ·  ' : ''}
            {c.telefono || ''}
          </Text>
          {c.direccion ? <Text style={s.direccion} numberOfLines={1}>{c.direccion}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.saldo}>{fmt(c.saldo_total)}</Text>
          <Text style={{ fontSize: 18, color: '#ccc' }}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{top:10,bottom:10,left:10,right:10}}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>📖 Directorio de clientes</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={s.searchBox}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Buscar por nombre, código o teléfono..."
          placeholderTextColor="#aaa"
          value={query}
          onChangeText={onChangeQuery}
        />
        {buscando && <ActivityIndicator size="small" color="#1565C0" />}
      </View>

      {!loading && !error && (
        <Text style={s.countTxt}>{totales.total_clientes} cliente{totales.total_clientes !== 1 ? 's' : ''} · {totales.total_rutas} ruta{totales.total_rutas !== 1 ? 's' : ''}</Text>
      )}

      {!loading && !error && rutas.length > 1 && (
        <View style={s.chipsWrap}>
          <FlatList
            horizontal
            data={rutas}
            keyExtractor={(r) => String(r.ruta?.id)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, alignItems: 'center' }}
            ListHeaderComponent={
              <TouchableOpacity
                style={[s.chip, rutaFiltro === null && s.chipOn]}
                onPress={() => setRutaFiltro(null)}
              >
                <Text style={[s.chipTxt, rutaFiltro === null && s.chipTxtOn]} numberOfLines={1}>Todas</Text>
              </TouchableOpacity>
            }
            renderItem={({ item: r }) => (
              <TouchableOpacity
                style={[s.chip, rutaFiltro === r.ruta?.id && s.chipOn, { marginLeft: 8 }]}
                onPress={() => setRutaFiltro(r.ruta?.id)}
              >
                <Text style={[s.chipTxt, rutaFiltro === r.ruta?.id && s.chipTxtOn]} numberOfLines={1} ellipsizeMode="tail">
                  {r.ruta?.nombre}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#1565C0" /></View>
      ) : error ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>⚠️</Text>
          <Text style={s.errorTxt}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={filas}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          renderItem={renderFila}
          initialNumToRender={16}
          maxToRenderPerBatch={16}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Text style={{ fontSize: 44, marginBottom: 10 }}>🔍</Text>
              <Text style={{ color: '#888' }}>Sin resultados</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f6f8' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 50,
    paddingBottom: 14, paddingHorizontal: 16, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  backBtn: { width: 30 },
  backTxt: { fontSize: 22, color: '#1a1a1a' },
  title: { fontSize: 16, fontWeight: '800', color: '#1a1a1a' },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderRadius: 12, borderWidth: 1, borderColor: '#e0e0e0', gap: 8,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 14, color: '#1a1a1a' },

  countTxt: { color: '#888', fontSize: 12, marginTop: 10, marginBottom: 4, paddingHorizontal: 16 },

  chipsWrap: { height: 48, justifyContent: 'center' },
  chip: {
    height: 32, maxWidth: 160,
    paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#e0e0e0',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', flexShrink: 0,
  },
  chipOn: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  chipTxt: { fontSize: 12, fontWeight: '700', color: '#555' },
  chipTxtOn: { color: '#fff' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  errorTxt: { color: '#888', textAlign: 'center', fontSize: 13 },

  rutaTitulo: { fontSize: 13, fontWeight: '800', color: '#555', marginBottom: 8, marginTop: 6 },
  rutaDia: { fontWeight: '500', color: '#aaa', textTransform: 'capitalize' },

  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#eee',
  },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  nombre: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  meta: { fontSize: 11, color: '#888', marginTop: 2 },
  direccion: { fontSize: 11, color: '#aaa', marginTop: 2 },
  saldo: { fontSize: 13, fontWeight: '800', color: '#e53e3e' },
});
