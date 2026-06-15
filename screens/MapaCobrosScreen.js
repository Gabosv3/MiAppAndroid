import React, { useState, useRef, useMemo, memo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, Dimensions, Linking, Alert,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

const { width, height } = Dimensions.get('window');

const markerColor = (vencidas) => {
  if (vencidas >= 6) return '#e53e3e';   // rojo
  if (vencidas >= 1) return '#F5A623';   // naranja
  return '#2e7d32';                       // verde
};

const markerLabel = (vencidas) => {
  if (vencidas >= 6) return 'URGENTE';
  if (vencidas >= 1) return 'PENDIENTE';
  return 'AL DÍA';
};

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const ClienteMarker = memo(({ cliente, onPress }) => (
  <Marker
    coordinate={{ latitude: cliente.ubicacion.latitud, longitude: cliente.ubicacion.longitud }}
    pinColor={markerColor(cliente.cuotas_vencidas)}
    onPress={() => onPress(cliente)}
    tracksViewChanges={false}
  />
));

const abrirNavegacion = (lat, lng, nombre) => {
  Alert.alert(
    '📍 Navegar a ' + nombre,
    'Elige la aplicación',
    [
      {
        text: 'Google Maps',
        onPress: () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`),
      },
      {
        text: 'Waze',
        onPress: () => Linking.openURL(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`),
      },
      {
        text: 'Otra app',
        onPress: () => Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(nombre)})`),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]
  );
};

export default function MapaCobrosScreen({ navigation, route }) {
  const { clientes = [] } = route.params;
  const mapRef = useRef(null);
  const [seleccionado, setSeleccionado] = useState(null);

  // Solo clientes con ubicación válida
  const conUbicacion = useMemo(() =>
    clientes.filter(c => c.ubicacion?.latitud && c.ubicacion?.longitud),
  [clientes]);

  // Centro del mapa: promedio de todas las coordenadas, o El Salvador por defecto
  const region = useMemo(() => {
    if (conUbicacion.length === 0) {
      return { latitude: 13.7942, longitude: -88.8965, latitudeDelta: 2, longitudeDelta: 2 };
    }
    const lats = conUbicacion.map(c => c.ubicacion.latitud);
    const lngs = conUbicacion.map(c => c.ubicacion.longitud);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    return {
      latitude:      (minLat + maxLat) / 2,
      longitude:     (minLng + maxLng) / 2,
      latitudeDelta:  Math.max((maxLat - minLat) * 1.4, 0.05),
      longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.05),
    };
  }, [conUbicacion]);

  const stats = useMemo(() => ({
    verde:   clientes.filter(c => c.cuotas_vencidas === 0).length,
    naranja: clientes.filter(c => c.cuotas_vencidas >= 1 && c.cuotas_vencidas <= 5).length,
    rojo:    clientes.filter(c => c.cuotas_vencidas >= 6).length,
  }), [clientes]);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" translucent />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{top:10,bottom:10,left:10,right:10}}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Mapa de ruta</Text>
        <View style={{width:36}}/>
      </View>

      {/* Leyenda */}
      <View style={s.leyenda}>
        <View style={s.leyendaItem}>
          <View style={[s.dot, {backgroundColor:'#2e7d32'}]}/>
          <Text style={s.leyendaTxt}>Al día ({stats.verde})</Text>
        </View>
        <View style={s.leyendaItem}>
          <View style={[s.dot, {backgroundColor:'#F5A623'}]}/>
          <Text style={s.leyendaTxt}>1–5 vencidas ({stats.naranja})</Text>
        </View>
        <View style={s.leyendaItem}>
          <View style={[s.dot, {backgroundColor:'#e53e3e'}]}/>
          <Text style={s.leyendaTxt}>6+ vencidas ({stats.rojo})</Text>
        </View>
      </View>

      {/* Mapa */}
      <MapView
        ref={mapRef}
        style={s.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton
        moveOnMarkerPress={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsIndoors={false}
        toolbarEnabled={false}
      >
        {conUbicacion.map(c => (
          <ClienteMarker
            key={c.id}
            cliente={c}
            onPress={setSeleccionado}
          />
        ))}
      </MapView>

      {/* Card flotante del cliente seleccionado */}
      {seleccionado && (() => {
        const color = markerColor(seleccionado.cuotas_vencidas);
        const label = markerLabel(seleccionado.cuotas_vencidas);
        const lat   = seleccionado.ubicacion?.latitud;
        const lng   = seleccionado.ubicacion?.longitud;
        return (
          <View style={s.floatingCard}>
            {/* Cabecera */}
            <View style={s.floatingCardTop}>
              <View style={[s.floatingDot, { backgroundColor: color }]}/>
              <View style={{flex:1, marginLeft:10}}>
                <Text style={s.floatingNombre} numberOfLines={1}>{seleccionado.nombre}</Text>
                {seleccionado.codigo_anterior
                  ? <Text style={s.floatingMeta}>Código: {seleccionado.codigo_anterior}</Text>
                  : null}
              </View>
              <View style={[s.floatingBadge, { backgroundColor: color + '22' }]}>
                <Text style={[s.floatingBadgeTxt, { color }]}>{label}</Text>
              </View>
              <TouchableOpacity onPress={() => setSeleccionado(null)} style={{marginLeft:8}} hitSlop={{top:8,bottom:8,left:8,right:8}}>
                <Text style={{fontSize:18, color:'#bbb'}}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Stats */}
            <View style={s.floatingStats}>
              <View style={s.floatingStat}>
                <Text style={s.floatingStatLabel}>Saldo total</Text>
                <Text style={[s.floatingStatVal, {color:'#e53e3e'}]}>{fmt(seleccionado.saldo_total)}</Text>
              </View>
              <View style={s.floatingStat}>
                <Text style={s.floatingStatLabel}>Vencidas</Text>
                <Text style={[s.floatingStatVal, {color}]}>{seleccionado.cuotas_vencidas}</Text>
              </View>
              <View style={s.floatingStat}>
                <Text style={s.floatingStatLabel}>Para al día</Text>
                <Text style={[s.floatingStatVal, {color:'#F5A623'}]}>{fmt(seleccionado.para_estar_al_dia)}</Text>
              </View>
            </View>

            {/* Teléfono si existe */}
            {seleccionado.telefono
              ? <Text style={s.floatingTel}>📞 {seleccionado.telefono}</Text>
              : null}

            {/* Botones */}
            <View style={s.floatingBtns}>
              <TouchableOpacity
                style={s.floatingBtnNav}
                onPress={() => abrirNavegacion(lat, lng, seleccionado.nombre)}
              >
                <Text style={s.floatingBtnNavTxt}>🧭  Navegar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.floatingBtnOutline}
                onPress={() => navigation.navigate('DetalleCliente', { clienteId: seleccionado.id, clienteNombre: seleccionado.nombre })}
              >
                <Text style={s.floatingBtnOutlineTxt}>Detalle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.floatingBtnSolid}
                onPress={() => navigation.navigate('RegistrarPago', {
                  cliente: seleccionado,
                  ventaId: seleccionado.ventas?.[0]?.id || null,
                  ventaNumero: seleccionado.ventas?.[0]?.numero_venta || null,
                  saldoPendiente: seleccionado.ventas?.[0]?.saldo_pendiente || seleccionado.saldo_total,
                  cuotasVencidas: seleccionado.cuotas_vencidas,
                })}
              >
                <Text style={s.floatingBtnSolidTxt}>Cobrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}

      {/* Aviso si no hay coordenadas */}
      {conUbicacion.length === 0 && (
        <View style={s.sinUbicacion}>
          <Text style={{fontSize:36, marginBottom:8}}>📍</Text>
          <Text style={{color:'#555', fontWeight:'700', fontSize:15}}>Sin ubicaciones registradas</Text>
          <Text style={{color:'#aaa', fontSize:13, marginTop:4}}>Los clientes no tienen coordenadas en la API</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex:1, backgroundColor:'#fff' },
  header: {
    backgroundColor:'#1565C0', flexDirection:'row', alignItems:'center',
    paddingTop:(StatusBar.currentHeight||0)+8, paddingBottom:14, paddingHorizontal:16,
    zIndex:10,
  },
  backBtn:     { marginRight:12 },
  backArrow:   { color:'#fff', fontSize:24 },
  headerTitle: { color:'#fff', fontSize:18, fontWeight:'700', flex:1 },

  leyenda: {
    flexDirection:'row', backgroundColor:'#fff', paddingHorizontal:16, paddingVertical:10,
    gap:12, borderBottomWidth:1, borderBottomColor:'#eee', zIndex:10,
  },
  leyendaItem: { flexDirection:'row', alignItems:'center', gap:6 },
  dot:         { width:12, height:12, borderRadius:6 },
  leyendaTxt:  { color:'#555', fontSize:12, fontWeight:'600' },

  map: { flex:1 },



  floatingCard: {
    position:'absolute', bottom:20, left:16, right:16,
    backgroundColor:'#fff', borderRadius:16, padding:16,
    elevation:8, shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.15,
  },
  floatingCardTop:     { flexDirection:'row', alignItems:'center', marginBottom:12 },
  floatingDot:         { width:14, height:14, borderRadius:7 },
  floatingNombre:      { color:'#1a1a1a', fontWeight:'800', fontSize:15 },
  floatingMeta:        { color:'#aaa', fontSize:11, marginTop:1 },
  floatingBadge:       { borderRadius:10, paddingHorizontal:8, paddingVertical:3 },
  floatingBadgeTxt:    { fontSize:11, fontWeight:'800' },
  floatingStats:       { flexDirection:'row', backgroundColor:'#f8f9fc', borderRadius:10, padding:10, marginBottom:10 },
  floatingStat:        { flex:1, alignItems:'center' },
  floatingStatLabel:   { color:'#aaa', fontSize:10, fontWeight:'600', marginBottom:3 },
  floatingStatVal:     { fontSize:14, fontWeight:'800' },
  floatingTel:         { color:'#666', fontSize:12, marginBottom:10 },
  floatingBtns:        { flexDirection:'row', gap:8 },
  floatingBtnNav:      { flex:1, borderRadius:10, paddingVertical:11, backgroundColor:'#00897B', alignItems:'center' },
  floatingBtnNavTxt:   { color:'#fff', fontWeight:'700', fontSize:13 },
  floatingBtnOutline:  { flex:1, borderRadius:10, paddingVertical:11, borderWidth:1.5, borderColor:'#1565C0', alignItems:'center' },
  floatingBtnOutlineTxt:{ color:'#1565C0', fontWeight:'700', fontSize:13 },
  floatingBtnSolid:    { flex:1, borderRadius:10, paddingVertical:11, backgroundColor:'#1565C0', alignItems:'center' },
  floatingBtnSolidTxt: { color:'#fff', fontWeight:'700', fontSize:13 },

  sinUbicacion: {
    position:'absolute', top:'40%', alignSelf:'center',
    alignItems:'center', backgroundColor:'#fff',
    padding:24, borderRadius:16, elevation:5,
  },
});
