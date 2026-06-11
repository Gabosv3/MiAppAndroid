import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
const initials = (name='') => name.trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('');

export default function DetalleClienteScreen({ navigation, route }) {
  const { clienteId, clienteNombre } = route.params;
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const cargar = useCallback(async () => {
    try {
      setError('');
      const res = await api.get(`/cobros/clientes/${clienteId}`);
      setData(res.data);
    } catch(e) { setError(e?.message||'Error'); }
    finally { setLoading(false); }
  }, [clienteId]);

  useFocusEffect(useCallback(()=>{ setLoading(true); cargar(); },[cargar]));

  const cliente = data?.cliente;
  const resumen = data?.resumen;
  const ventas  = data?.ventas||[];

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0"/>

      <View style={s.header}>
        <TouchableOpacity onPress={()=>navigation.goBack()} style={s.backBtn} hitSlop={{top:10,bottom:10,left:10,right:10}}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>Detalle del cliente</Text>
        {cliente?.whatsapp
          ? <TouchableOpacity style={s.waBubble} onPress={()=>Linking.openURL(`https://wa.me/503${cliente.whatsapp}`)}>
              <Text style={{fontSize:18}}>💬</Text>
            </TouchableOpacity>
          : <View style={{width:40}}/>
        }
      </View>

      {loading
        ? <View style={s.centered}><ActivityIndicator size="large" color="#1565C0"/><Text style={{color:'#888',marginTop:12}}>Cargando...</Text></View>
        : error
          ? <View style={s.centered}>
              <Text style={{fontSize:40,marginBottom:10}}>😕</Text>
              <Text style={{color:'#333',fontWeight:'700',marginBottom:16}}>{error}</Text>
              <TouchableOpacity style={s.retryBtn} onPress={()=>{setLoading(true);cargar();}}>
                <Text style={s.retryTxt}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          : (
        <ScrollView showsVerticalScrollIndicator={false}>

          {/* ── Cliente card ── */}
          <View style={s.clienteCard}>
            <View style={s.clienteRow}>
              <View style={s.clienteAvatar}>
                <Text style={s.clienteAvatarTxt}>{initials(cliente?.nombre)}</Text>
              </View>
              <View style={{flex:1,marginLeft:14}}>
                <Text style={s.clienteNombre}>{cliente?.nombre}</Text>
                {cliente?.dui       && <Text style={s.clienteInfo}>DUI:       {cliente.dui}</Text>}
                {cliente?.telefono  && <Text style={s.clienteInfo}>Tel:       {cliente.telefono}</Text>}
                {cliente?.direccion && <Text style={s.clienteInfo}>Dirección: {cliente.direccion}</Text>}
                {cliente?.ruta      && <Text style={s.clienteInfo}>Ruta:      {cliente.ruta}</Text>}
              </View>
              <View style={s.saldoBox}>
                <Text style={s.saldoLabel}>Saldo total</Text>
                <Text style={s.saldoVal}>{fmt(cliente?.saldo_total)}</Text>
              </View>
            </View>
          </View>

          {/* ── Resumen stats ── */}
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statIcon}>🛍️</Text>
              <Text style={s.statLabel}>Total ventas</Text>
              <Text style={[s.statVal,{color:'#1565C0'}]}>{resumen?.total_ventas}</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statIcon}>⏳</Text>
              <Text style={s.statLabel}>Cuotas pendientes</Text>
              <Text style={[s.statVal,{color:'#F5A623'}]}>{resumen?.cuotas_pendientes}</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statIcon}>⚠️</Text>
              <Text style={s.statLabel}>Cuotas vencidas</Text>
              <Text style={[s.statVal,{color:'#e53e3e'}]}>{resumen?.cuotas_vencidas}</Text>
            </View>
          </View>

          {/* ── Ventas ── */}
          <Text style={s.sectionTitle}>Ventas activas</Text>

          {ventas.map(venta => {
            const pct = venta.total > 0 ? Math.round((venta.monto_pagado/venta.total)*100) : 0;
            return (
              <View key={venta.id} style={s.ventaCard}>
                {/* Venta header */}
                <View style={s.ventaHeader}>
                  <View style={s.ventaIconBox}>
                    <Text style={{fontSize:20}}>📋</Text>
                  </View>
                  <View style={{flex:1,marginLeft:12}}>
                    <Text style={s.ventaNum}>{venta.numero_venta}</Text>
                    <Text style={s.ventaFecha}>Fecha: {venta.fecha_venta}</Text>
                  </View>
                </View>

                {/* Montos */}
                <View style={s.montosRow}>
                  <View style={s.montoItem}>
                    <Text style={s.montoLabel}>Total</Text>
                    <Text style={[s.montoVal,{color:'#1565C0'}]}>{fmt(venta.total)}</Text>
                  </View>
                  <View style={s.montoItem}>
                    <Text style={s.montoLabel}>Pagado</Text>
                    <Text style={[s.montoVal,{color:'#2e7d32'}]}>{fmt(venta.monto_pagado)}</Text>
                  </View>
                  <View style={s.montoItem}>
                    <Text style={s.montoLabel}>Pendiente</Text>
                    <Text style={[s.montoVal,{color:'#F5A623'}]}>{fmt(venta.saldo_pendiente)}</Text>
                  </View>
                </View>

                {/* Badges */}
                <View style={s.ventaBadges}>
                  {(venta.resumen?.pendientes||0)>0 &&
                    <View style={[s.pill,{backgroundColor:'#fff8e1'}]}>
                      <Text style={[s.pillTxt,{color:'#f57f17'}]}>⏳ {venta.resumen.pendientes} pendientes</Text>
                    </View>
                  }
                  {(venta.resumen?.vencidas||0)>0 &&
                    <View style={[s.pill,{backgroundColor:'#fce4ec'}]}>
                      <Text style={[s.pillTxt,{color:'#c62828'}]}>⚠️ {venta.resumen.vencidas} vencidas</Text>
                    </View>
                  }
                </View>

                {/* Cuotas info */}
                <View style={s.cuotasInfo}>
                  <Text style={s.cuotasInfoTxt}>
                    🪙 {venta.resumen?.total_cuotas} cuotas · Estado: <Text style={{color:'#2e7d32',fontWeight:'700'}}>{venta.estado}</Text>
                  </Text>
                </View>

                <TouchableOpacity
                  style={s.cobrarBtn}
                  onPress={() => navigation.navigate('RegistrarPago',{
                    cliente: {id:clienteId, nombre:cliente?.nombre, ...cliente},
                    ventaId: venta.id,
                    ventaNumero: venta.numero_venta,
                    saldoPendiente: venta.saldo_pendiente,
                    cuotasVencidas: venta.resumen?.vencidas||0,
                  })}
                >
                  <Text style={s.cobrarBtnTxt}>Cobrar esta venta</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {/* ── Gestiones ── */}
          <TouchableOpacity style={s.gestionesRow}>
            <Text style={{fontSize:20}}>📋</Text>
            <Text style={s.gestionesTxt}>Ver gestiones pendientes</Text>
            <Text style={{fontSize:20,color:'#1565C0'}}>›</Text>
          </TouchableOpacity>

          <View style={{height:32}}/>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex:1, backgroundColor:'#f5f6fa' },
  centered:{ flex:1, alignItems:'center', justifyContent:'center', padding:24 },
  header: {
    backgroundColor:'#1565C0', flexDirection:'row', alignItems:'center',
    paddingTop:(StatusBar.currentHeight||0)+8, paddingBottom:16, paddingHorizontal:16,
  },
  backBtn:   { marginRight:12 },
  backArrow: { color:'#fff', fontSize:24 },
  headerTitle:{ color:'#fff', fontSize:18, fontWeight:'700', flex:1 },
  waBubble:  { width:40,height:40, borderRadius:20, backgroundColor:'rgba(255,255,255,0.15)', alignItems:'center', justifyContent:'center' },
  retryBtn:  { backgroundColor:'#1565C0', borderRadius:10, paddingHorizontal:28, paddingVertical:12 },
  retryTxt:  { color:'#fff', fontWeight:'700' },

  clienteCard: {
    backgroundColor:'#fff', margin:12, borderRadius:16, padding:16,
    elevation:3, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.08,
  },
  clienteRow:      { flexDirection:'row', alignItems:'flex-start' },
  clienteAvatar:   { width:50,height:50, borderRadius:25, backgroundColor:'#ffcdd2', alignItems:'center', justifyContent:'center' },
  clienteAvatarTxt:{ color:'#c62828', fontSize:18, fontWeight:'800' },
  clienteNombre:   { color:'#1a1a1a', fontSize:16, fontWeight:'800', marginBottom:6 },
  clienteInfo:     { color:'#666', fontSize:12, marginBottom:2 },
  saldoBox:        { alignItems:'flex-end' },
  saldoLabel:      { color:'#999', fontSize:10, fontWeight:'600', marginBottom:2 },
  saldoVal:        { color:'#e53e3e', fontSize:20, fontWeight:'900' },

  statsRow:  { flexDirection:'row', marginHorizontal:12, gap:8, marginBottom:4 },
  statCard:  { flex:1, backgroundColor:'#fff', borderRadius:12, padding:12, alignItems:'center', elevation:2, shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.06 },
  statIcon:  { fontSize:22, marginBottom:4 },
  statLabel: { color:'#999', fontSize:10, textAlign:'center', marginBottom:4 },
  statVal:   { fontSize:20, fontWeight:'800' },

  sectionTitle:{ color:'#1a1a1a', fontSize:15, fontWeight:'800', marginHorizontal:16, marginTop:16, marginBottom:8 },

  ventaCard: {
    backgroundColor:'#fff', marginHorizontal:12, marginBottom:10, borderRadius:16, padding:16,
    elevation:3, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.08,
  },
  ventaHeader:  { flexDirection:'row', alignItems:'center', marginBottom:14 },
  ventaIconBox: { width:42,height:42, borderRadius:21, backgroundColor:'#e3f2fd', alignItems:'center', justifyContent:'center' },
  ventaNum:     { color:'#1a1a1a', fontSize:15, fontWeight:'800' },
  ventaFecha:   { color:'#999', fontSize:12, marginTop:2 },
  montosRow:    { flexDirection:'row', backgroundColor:'#f8f9fc', borderRadius:10, padding:10, marginBottom:12 },
  montoItem:    { flex:1, alignItems:'center' },
  montoLabel:   { color:'#999', fontSize:10, fontWeight:'600', marginBottom:3 },
  montoVal:     { fontSize:14, fontWeight:'800' },
  ventaBadges:  { flexDirection:'row', gap:8, marginBottom:10, flexWrap:'wrap' },
  pill:         { borderRadius:12, paddingHorizontal:12, paddingVertical:5 },
  pillTxt:      { fontSize:12, fontWeight:'600' },
  cuotasInfo:   { backgroundColor:'#f5f6fa', borderRadius:8, padding:10, marginBottom:12 },
  cuotasInfoTxt:{ color:'#666', fontSize:12 },
  cobrarBtn:    { backgroundColor:'#1565C0', borderRadius:10, paddingVertical:13, alignItems:'center' },
  cobrarBtnTxt: { color:'#fff', fontWeight:'800', fontSize:14 },

  gestionesRow: {
    flexDirection:'row', alignItems:'center', gap:12,
    backgroundColor:'#fff', marginHorizontal:12, marginTop:4, borderRadius:14, padding:16,
    elevation:2,
  },
  gestionesTxt: { flex:1, color:'#1565C0', fontWeight:'700', fontSize:14 },
});
