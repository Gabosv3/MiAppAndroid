import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  RefreshControl, ActivityIndicator, TextInput, FlatList, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { useConnectivity } from '../services/connectivity';
import {
  guardarRutaCache, leerRutaCache, contarPagosPendientes, sincronizarPagosPendientes,
  guardarOrdenClientes, leerOrdenClientes, leerClientesVisitadosHoy,
} from '../services/cobrosOffline';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const AVATAR_COLORS = ['#1565C0','#6a1b9a','#00695c','#e65100','#c62828','#283593','#4527a0','#2e7d32'];
const avatarColor = (name = '') => AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
const initials    = (name = '') => name.trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('');

export default function CobrosScreen({ navigation }) {
  const [rutas,    setRutas]    = useState([]);
  const [dia,      setDia]      = useState('');
  const [loading,  setLoading]  = useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,    setError]    = useState('');
  const [query,    setQuery]    = useState('');
  const [rutaId,   setRutaId]   = useState(null);
  const [esCache,  setEsCache]  = useState(false);
  const [pagosPend,setPagosPend]= useState(0);
  const [ordenIds, setOrdenIds] = useState([]);
  const [visitadosIds, setVisitadosIds] = useState([]);
  // Modo reordenación
  const [modoReorden, setModoReorden] = useState(false);
  const [pickedId,    setPickedId]    = useState(null);
  const { isOnline } = useConnectivity();

  const cargar = useCallback(async () => {
    try {
      setError('');
      if (isOnline) {
        const { data } = await api.get('/cobros/ruta-hoy');
        await guardarRutaCache(data);
        setDia(data.dia || '');
        setRutas(data.rutas || []);
        if ((data.rutas||[]).length === 1) setRutaId(data.rutas[0].id);
        setEsCache(false);
        const pendientes = await contarPagosPendientes();
        if (pendientes > 0) {
          const result = await sincronizarPagosPendientes(api);
          console.log(`🔄 Cobros sincronizados: ${result.synced}/${result.total}`);
        }
      } else {
        const cache = await leerRutaCache();
        if (cache) {
          setDia(cache.data.dia || '');
          setRutas(cache.data.rutas || []);
          if ((cache.data.rutas||[]).length === 1) setRutaId(cache.data.rutas[0].id);
          setEsCache(true);
        } else {
          setError('Sin conexión y no hay datos guardados.\nConéctate para cargar tu ruta.');
        }
      }
    } catch (e) {
      const cache = await leerRutaCache();
      if (cache) {
        setDia(cache.data.dia || '');
        setRutas(cache.data.rutas || []);
        setEsCache(true);
      } else {
        setError(e?.message || 'Error');
      }
    } finally { setLoading(false); setRefreshing(false); }
  }, [isOnline]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    cargar();
    contarPagosPendientes().then(setPagosPend);
    leerOrdenClientes().then(setOrdenIds);
    leerClientesVisitadosHoy().then(setVisitadosIds);
  }, [cargar]));

  // Todos los clientes con orden aplicado (sin filtrar visitados)
  const todosOrdenados = useMemo(() => {
    const base = rutas
      .flatMap(r => (r.clientes||[]).map(c => ({ ...c, rutaNombre: r.nombre, rutaId: r.id })));
    if (!ordenIds.length) return base;
    const posicion = new Map(ordenIds.map((id, i) => [id, i]));
    return [...base].sort((a, b) => {
      const pa = posicion.has(a.id) ? posicion.get(a.id) : Infinity;
      const pb = posicion.has(b.id) ? posicion.get(b.id) : Infinity;
      return pa - pb;
    });
  }, [rutas, ordenIds]);

  // Lista normal (sin visitados) para cuando no hay búsqueda
  const todos = useMemo(() => {
    const visitadosSet = new Set(visitadosIds);
    return todosOrdenados.filter(c => !visitadosSet.has(c.id));
  }, [todosOrdenados, visitadosIds]);

  const lista = useMemo(() => {
    const buscando = query.trim().length > 0;
    const fuente = buscando ? todosOrdenados : todos;
    const visitadosSet = new Set(visitadosIds);
    let arr = rutaId ? fuente.filter(c => c.rutaId === rutaId) : fuente;
    if (buscando) {
      const q = query.toLowerCase();
      arr = arr.filter(c =>
        c.nombre?.toLowerCase().includes(q) ||
        c.codigo_anterior?.toLowerCase().includes(q) ||
        c.telefono?.includes(q)
      );
      arr = arr.map(c => ({ ...c, _visitadoHoy: visitadosSet.has(c.id) }));
    }
    return arr;
  }, [todos, todosOrdenados, query, rutaId, visitadosIds]);

  // Persiste el nuevo orden basado en la lista visible actual,
  // preservando la posición de clientes visitados (todosOrdenados).
  const persistirOrden = useCallback(async (nuevaLista) => {
    const nuevosIds = nuevaLista.map(c => c.id);
    const nuevosSet = new Set(nuevosIds);
    let cursor = 0;
    const ordenCompleto = todosOrdenados.map(c => {
      if (nuevosSet.has(c.id)) {
        const id = nuevosIds[cursor];
        cursor++;
        return id;
      }
      return c.id;
    });
    setOrdenIds(ordenCompleto);
    await guardarOrdenClientes(ordenCompleto);
  }, [todosOrdenados]);

  // Toca un cliente en modo reordenación:
  //   - Si no hay ninguno seleccionado → lo selecciona (picked)
  //   - Si el mismo → lo deselecciona
  //   - Si otro → mueve el picked justo antes del tocado
  const tocarEnReorden = useCallback(async (clienteId) => {
    if (!pickedId) {
      setPickedId(clienteId);
      return;
    }
    if (pickedId === clienteId) {
      setPickedId(null);
      return;
    }
    // Mover pickedId justo antes de clienteId dentro de la lista visible
    const origen = lista.findIndex(c => c.id === pickedId);
    const destino = lista.findIndex(c => c.id === clienteId);
    if (origen === -1 || destino === -1) { setPickedId(null); return; }
    const nueva = [...lista];
    const [movido] = nueva.splice(origen, 1);
    const insertEn = nueva.findIndex(c => c.id === clienteId);
    nueva.splice(insertEn, 0, movido);
    setPickedId(null);
    await persistirOrden(nueva);
  }, [pickedId, lista, persistirOrden]);

  const entrarReorden = () => {
    setQuery('');
    setPickedId(null);
    setModoReorden(true);
  };
  const salirReorden = () => {
    setPickedId(null);
    setModoReorden(false);
  };

  const totalClientes = todos.length;
  const totalRutas    = rutas.length;
  const pickedNombre  = pickedId ? (lista.find(c => c.id === pickedId)?.nombre || '') : '';

  const renderItem = ({ item: c }) => {
    const color  = avatarColor(c.nombre);
    const vencTotal = (c.ventas||[]).reduce((s,v)=>s+(v.cuotas_vencidas||0),0);
    const ventasAct = (c.ventas||[]).length;
    const esPicked  = modoReorden && c.id === pickedId;
    const esDestino = modoReorden && pickedId && c.id !== pickedId;

    if (modoReorden) {
      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => tocarEnReorden(c.id)}
          style={[
            s.card,
            esPicked  && s.cardPicked,
            esDestino && s.cardDestino,
          ]}
        >
          <View style={s.cardTop}>
            <View style={s.reordenHandle}>
              <Text style={s.reordenHandleTxt}>☰</Text>
            </View>
            <View style={[s.avatar, { backgroundColor: color }]}>
              <Text style={s.avatarTxt}>{initials(c.nombre)}</Text>
            </View>
            <View style={s.cardInfo}>
              <Text style={s.cardNombre} numberOfLines={1}>{c.nombre}</Text>
              {c.codigo_anterior
                ? <Text style={s.metaTxt}>Código: {c.codigo_anterior}</Text>
                : null}
            </View>
            {esPicked && (
              <View style={s.pickedBadge}>
                <Text style={s.pickedBadgeTxt}>Seleccionado</Text>
              </View>
            )}
            {esDestino && (
              <View style={s.destinoBadge}>
                <Text style={s.destinoBadgeTxt}>↑ Insertar aquí</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <View style={s.card}>
        {/* Top row */}
        <View style={s.cardTop}>
          <View style={[s.avatar, { backgroundColor: color }]}>
            <Text style={s.avatarTxt}>{initials(c.nombre)}</Text>
          </View>
          <View style={s.cardInfo}>
            <Text style={s.cardNombre} numberOfLines={1}>{c.nombre}</Text>
            <View style={s.cardMeta}>
              {c.codigo_anterior ? <Text style={s.metaTxt}>Código: {c.codigo_anterior}</Text> : null}
              {c.codigo_anterior && c.telefono ? <Text style={s.metaDot}>|</Text> : null}
              {c.telefono ? <Text style={s.metaTxt}>Tel: {c.telefono}</Text> : null}
            </View>
          </View>
        </View>

        {/* Stats row */}
        <View style={s.statsRow}>
          <View style={s.statBox}>
            <Text style={s.statLabel}>Saldo total</Text>
            <Text style={[s.statVal, {color:'#e53e3e'}]}>{fmt(c.saldo_total)}</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statLabel}>Cuotas vencidas</Text>
            <Text style={[s.statVal, {color:'#F5A623'}]}>{c.cuotas_vencidas}</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statLabel}>Para estar al día</Text>
            <Text style={[s.statVal, {color:'#F5A623'}]}>{fmt(c.para_estar_al_dia)}</Text>
          </View>
        </View>

        {/* Badges */}
        <View style={s.badgesRow}>
          {c._visitadoHoy && (
            <View style={[s.badge, {backgroundColor:'#e8f5e9'}]}>
              <Text style={[s.badgeTxt, {color:'#2e7d32'}]}>✓ Visitado hoy</Text>
            </View>
          )}
          {ventasAct > 0 && (
            <View style={[s.badge, {backgroundColor:'#e3f2fd'}]}>
              <Text style={[s.badgeTxt, {color:'#1565C0'}]}>🗓 {ventasAct} venta{ventasAct>1?'s':''} activa{ventasAct>1?'s':''}</Text>
            </View>
          )}
          {vencTotal > 0 && (
            <View style={[s.badge, {backgroundColor:'#fce4ec'}]}>
              <Text style={[s.badgeTxt, {color:'#c62828'}]}>⚠️ {vencTotal} vencida{vencTotal>1?'s':''}</Text>
            </View>
          )}
        </View>

        {/* Botones */}
        <View style={s.btnsRow}>
          <TouchableOpacity
            style={s.btnOutline}
            onPress={() => navigation.navigate('DetalleCliente', { clienteId: c.id, clienteNombre: c.nombre })}
          >
            <Text style={s.btnOutlineTxt}>Ver detalle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.btnSolid}
            onPress={() => navigation.navigate('RegistrarPago', {
              cliente: c,
              ventaId: c.ventas?.[0]?.id||null,
              ventaNumero: c.ventas?.[0]?.numero_venta||null,
              saldoPendiente: c.ventas?.[0]?.saldo_pendiente||c.saldo_total,
              cuotasVencidas: vencTotal,
            })}
          >
            <Text style={s.btnSolidTxt}>Cobrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) return (
    <View style={{flex:1,backgroundColor:'#f5f6fa'}}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0"/>
      <View style={s.header}/>
      <View style={{flex:1,alignItems:'center',justifyContent:'center'}}>
        <ActivityIndicator size="large" color="#1565C0"/>
        <Text style={{color:'#888',marginTop:12}}>Cargando ruta del día...</Text>
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={modoReorden ? '#e65100' : '#1565C0'}/>

      {/* ── HEADER ── */}
      <View style={[s.header, modoReorden && s.headerReorden]}>
        <View style={s.headerContent}>
          <View>
            <Text style={s.headerTitle}>{modoReorden ? 'Reordenar' : 'Cobros'}</Text>
            <Text style={s.headerSub}>
              {modoReorden
                ? 'Toca un cliente para seleccionarlo'
                : `Ruta de hoy · `}
              {!modoReorden && <Text style={{textTransform:'capitalize'}}>{dia}</Text>}
            </Text>
          </View>
          <View style={s.headerBtns}>
            {modoReorden ? (
              <TouchableOpacity style={s.mapBtn} onPress={salirReorden}>
                <Text style={s.mapBtnTxt}>✓ Listo</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={s.mapBtn} onPress={entrarReorden}>
                  <Text style={s.mapBtnTxt}>⇅ Orden</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.mapBtn} onPress={() => navigation.navigate('Home')}>
                  <Text style={s.mapBtnTxt}>🏠</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.mapBtn} onPress={() => navigation.navigate('HistorialDia')}>
                  <Text style={s.mapBtnTxt}>📋</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.mapBtn} onPress={() => navigation.navigate('MapaCobros', { clientes: todos })}>
                  <Text style={s.mapBtnTxt}>🗺️</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
        {!modoReorden && (
          <View style={s.chipsRow}>
            <View style={s.chip}><Text style={s.chipTxt}>📍 {totalRutas} ruta{totalRutas!==1?'s':''}</Text></View>
            <View style={s.chip}><Text style={s.chipTxt}>👥 {totalClientes} clientes</Text></View>
            {pagosPend > 0 && <View style={s.chipPend}><Text style={s.chipPendTxt}>⏳ {pagosPend} por sync</Text></View>}
          </View>
        )}
      </View>

      {/* Banner modo reordenar */}
      {modoReorden && (
        <View style={[s.offlineBanner, pickedId ? s.bannerPicked : s.bannerReorden]}>
          <Text style={[s.offlineTxt, {color: pickedId ? '#7b1fa2' : '#1a5276'}]}>
            {pickedId
              ? `📌 "${pickedNombre}" seleccionado — toca otro cliente para moverlo antes de ese`
              : '☰  Toca un cliente para seleccionarlo y luego toca dónde quieres colocarlo'}
          </Text>
        </View>
      )}

      {/* Banner offline */}
      {!modoReorden && (!isOnline || esCache) && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>
            {!isOnline ? '📴 Sin conexión' : '📦 Datos en caché'} — los cobros se guardarán y enviarán al reconectarte
          </Text>
        </View>
      )}

      {error ? (
        <View style={{flex:1,alignItems:'center',justifyContent:'center',padding:32}}>
          <Text style={{fontSize:48,marginBottom:12}}>😕</Text>
          <Text style={{fontSize:16,fontWeight:'700',color:'#222',marginBottom:6}}>Sin ruta disponible</Text>
          <Text style={{color:'#888',textAlign:'center',marginBottom:24}}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={()=>{setLoading(true);cargar();}}>
            <Text style={s.retryTxt}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Filtros de ruta (ocultos en modo reordenar) */}
          {!modoReorden && rutas.length > 1 && (
            <View style={s.rutaBar}>
              <TouchableOpacity
                style={[s.rutaChip, rutaId===null && s.rutaChipOn]}
                onPress={() => setRutaId(null)}
              >
                <Text style={[s.rutaChipTxt, rutaId===null && s.rutaChipTxtOn]}>Todas</Text>
              </TouchableOpacity>
              {rutas.map(r => (
                <TouchableOpacity
                  key={r.id}
                  style={[s.rutaChip, rutaId===r.id && s.rutaChipOn]}
                  onPress={() => setRutaId(r.id)}
                >
                  <Text style={[s.rutaChipTxt, rutaId===r.id && s.rutaChipTxtOn]}>{r.nombre}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Buscador (oculto en modo reordenar) */}
          {!modoReorden && (
            <View style={s.searchBox}>
              <Text style={s.searchIcon}>🔍</Text>
              <TextInput
                style={s.searchInput}
                placeholder="Buscar por nombre, código o teléfono..."
                placeholderTextColor="#aaa"
                value={query}
                onChangeText={setQuery}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={{top:8,bottom:8,left:8,right:8}}>
                  <Text style={{fontSize:16,color:'#aaa'}}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Contador */}
          <Text style={s.countTxt}>
            {lista.length} cliente{lista.length!==1?'s':''}
            {query ? ` · "${query}"` : ''}
            {modoReorden ? '  ·  Toca para mover' : ''}
          </Text>

          <FlatList
            data={lista}
            keyExtractor={i => String(i.id)}
            renderItem={renderItem}
            contentContainerStyle={{paddingHorizontal:16,paddingBottom:32}}
            showsVerticalScrollIndicator={false}
            refreshControl={
              !modoReorden
                ? <RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);cargar();}} colors={['#1565C0']}/>
                : undefined
            }
            ListEmptyComponent={
              <View style={{alignItems:'center',paddingVertical:60}}>
                <Text style={{fontSize:44,marginBottom:10}}>🔍</Text>
                <Text style={{fontSize:15,fontWeight:'700',color:'#444'}}>Sin resultados</Text>
                <Text style={{color:'#aaa',marginTop:4}}>Intenta con otro término</Text>
              </View>
            }
          />
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex:1, backgroundColor:'#f5f6fa' },
  header: {
    backgroundColor:'#1565C0',
    paddingTop: (StatusBar.currentHeight||0) + 12,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerReorden: { backgroundColor:'#e65100' },
  headerContent: { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 },
  headerBtns:{ flexDirection:'row', gap:8, flexWrap:'wrap', justifyContent:'flex-end' },
  mapBtn:    { backgroundColor:'rgba(255,255,255,0.2)', borderRadius:20, paddingHorizontal:14, paddingVertical:8, borderWidth:1, borderColor:'rgba(255,255,255,0.4)' },
  mapBtnTxt: { color:'#fff', fontSize:14, fontWeight:'600' },
  headerTitle: { color:'#fff', fontSize:30, fontWeight:'800' },
  headerSub:   { color:'rgba(255,255,255,0.75)', fontSize:13, marginTop:2 },
  chipsRow:    { flexDirection:'row', gap:8 },
  chip:        { backgroundColor:'rgba(255,255,255,0.2)', borderRadius:20, paddingHorizontal:14, paddingVertical:6 },
  chipTxt:     { color:'#fff', fontSize:12, fontWeight:'600' },
  chipPend:    { backgroundColor:'#F5A623', borderRadius:20, paddingHorizontal:14, paddingVertical:6 },
  chipPendTxt: { color:'#fff', fontSize:12, fontWeight:'700' },
  offlineBanner:{ backgroundColor:'#fff3cd', paddingHorizontal:16, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#ffeaa7' },
  offlineTxt:  { color:'#856404', fontSize:12, fontWeight:'600', textAlign:'center' },
  bannerReorden:{ backgroundColor:'#e3f2fd', borderBottomColor:'#90caf9' },
  bannerPicked: { backgroundColor:'#f3e5f5', borderBottomColor:'#ce93d8' },
  retryBtn:    { backgroundColor:'#1565C0', borderRadius:10, paddingHorizontal:32, paddingVertical:12 },
  retryTxt:    { color:'#fff', fontWeight:'700', fontSize:14 },
  rutaBar:     { flexDirection:'row', backgroundColor:'#fff', paddingHorizontal:16, paddingVertical:10, gap:8, borderBottomWidth:1, borderBottomColor:'#eee' },
  rutaChip:    { paddingHorizontal:14, paddingVertical:6, borderRadius:20, backgroundColor:'#f0f0f0', borderWidth:1.5, borderColor:'#e0e0e0' },
  rutaChipOn:  { backgroundColor:'#e3f2fd', borderColor:'#1565C0' },
  rutaChipTxt: { color:'#888', fontSize:12, fontWeight:'600' },
  rutaChipTxtOn:{ color:'#1565C0' },
  searchBox:   {
    flexDirection:'row', alignItems:'center', backgroundColor:'#fff',
    marginHorizontal:16, marginTop:14, marginBottom:4,
    borderRadius:12, paddingHorizontal:14, paddingVertical:Platform.OS==='ios'?12:0,
    borderWidth:1, borderColor:'#e8e8e8',
    elevation:2, shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.06,
  },
  searchIcon:  { fontSize:16, marginRight:8 },
  searchInput: { flex:1, fontSize:14, color:'#222', paddingVertical:12 },
  countTxt:    { color:'#999', fontSize:12, marginHorizontal:18, marginBottom:8, marginTop: 6 },

  /* ── Card normal ── */
  card: {
    backgroundColor:'#fff', borderRadius:16, marginBottom:12,
    elevation:3, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.08,
    overflow:'hidden',
  },
  cardTop:   { flexDirection:'row', alignItems:'center', padding:16, paddingBottom:12 },
  avatar:    { width:46, height:46, borderRadius:23, alignItems:'center', justifyContent:'center' },
  avatarTxt: { color:'#fff', fontSize:16, fontWeight:'800' },
  cardInfo:  { flex:1, marginLeft:12 },
  cardNombre:{ color:'#1a1a1a', fontSize:15, fontWeight:'700' },
  cardMeta:  { flexDirection:'row', alignItems:'center', gap:6, marginTop:3 },
  metaTxt:   { color:'#888', fontSize:12 },
  metaDot:   { color:'#ccc', fontSize:12 },

  statsRow:  { flexDirection:'row', marginHorizontal:16, marginBottom:10, backgroundColor:'#f8f9fc', borderRadius:10 },
  statBox:   { flex:1, alignItems:'center', paddingVertical:10 },
  statLabel: { color:'#999', fontSize:10, fontWeight:'600', marginBottom:4, textAlign:'center' },
  statVal:   { fontSize:14, fontWeight:'800' },

  badgesRow: { flexDirection:'row', gap:8, paddingHorizontal:16, marginBottom:12, flexWrap:'wrap' },
  badge:     { borderRadius:12, paddingHorizontal:10, paddingVertical:4 },
  badgeTxt:  { fontSize:12, fontWeight:'600' },

  btnsRow:   { flexDirection:'row', gap:10, paddingHorizontal:16, paddingBottom:16 },
  btnOutline:{ flex:1, borderRadius:10, paddingVertical:11, borderWidth:1.5, borderColor:'#1565C0', alignItems:'center' },
  btnOutlineTxt:{ color:'#1565C0', fontWeight:'700', fontSize:14 },
  btnSolid:  { flex:1, borderRadius:10, paddingVertical:11, backgroundColor:'#1565C0', alignItems:'center' },
  btnSolidTxt:{ color:'#fff', fontWeight:'700', fontSize:14 },

  /* ── Modo reordenar ── */
  cardPicked: {
    borderWidth:2, borderColor:'#7b1fa2',
    backgroundColor:'#f3e5f5',
    elevation:6,
  },
  cardDestino: {
    borderWidth:1.5, borderColor:'#e65100', borderStyle:'dashed',
  },
  reordenHandle: {
    width:36, height:36, borderRadius:8,
    backgroundColor:'#f0f0f0',
    alignItems:'center', justifyContent:'center',
    marginRight:10,
  },
  reordenHandleTxt: { fontSize:20, color:'#888' },
  pickedBadge: {
    backgroundColor:'#7b1fa2', borderRadius:10,
    paddingHorizontal:10, paddingVertical:4,
  },
  pickedBadgeTxt: { color:'#fff', fontSize:11, fontWeight:'700' },
  destinoBadge: {
    backgroundColor:'#fff3e0', borderRadius:10, borderWidth:1, borderColor:'#e65100',
    paddingHorizontal:10, paddingVertical:4,
  },
  destinoBadgeTxt: { color:'#e65100', fontSize:11, fontWeight:'700' },
});
