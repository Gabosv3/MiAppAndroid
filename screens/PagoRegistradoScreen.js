import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView } from 'react-native';

const fmt = (n) => `$${Number(n||0).toFixed(2)}`;

const CFG = {
  cobrado:               { label:'Cobrado',  color:'#2e7d32', bg:'#e8f5e9', icon:'✅' },
  parcialmente_cobrado:  { label:'Parcial',  color:'#e65100', bg:'#fff3e0', icon:'⏳' },
  pendiente:             { label:'Pendiente',color:'#1565C0', bg:'#e3f2fd', icon:'🕐' },
};

export default function PagoRegistradoScreen({ navigation, route }) {
  const { resultado, clienteId, clienteNombre } = route.params;
  const cuotas   = resultado?.cuotas_pagadas || [];
  const proxima  = resultado?.proxima_cuota;
  const cobradas = cuotas.filter(c => c.estado === 'cobrado').length;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0"/>

      <View style={s.header}>
        <Text style={s.headerTitle}>Pago registrado</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:40}}>

        {/* ── Hero ── */}
        <View style={s.heroCard}>
          <View style={s.checkCircle}>
            <Text style={{fontSize:44,color:'#2e7d32'}}>✓</Text>
          </View>
          <Text style={s.heroLabel}>Pago registrado correctamente</Text>
          <Text style={s.heroMonto}>Monto total: <Text style={s.heroMontoVal}>{fmt(resultado?.monto_total)}</Text></Text>
          <Text style={s.heroSub}>Distribuido en <Text style={{fontWeight:'800',color:'#1565C0'}}>{cuotas.length}</Text> cuota(s)</Text>
        </View>

        {/* ── Cuotas ── */}
        {cuotas.length > 0 && <>
          <Text style={s.sectionTitle}>Cuotas pagadas</Text>
          <View style={s.cuotasCard}>
            {cuotas.map((c,i) => {
              const cfg = CFG[c.estado]||CFG.pendiente;
              return (
                <View key={i} style={[s.cuotaRow, i<cuotas.length-1 && s.cuotaBorder]}>
                  <Text style={s.cuotaNum}>{c.cuota}</Text>
                  <View style={s.cuotaMiddle}>
                    <Text style={s.cuotaSubLabel}>Monto aplicado</Text>
                    <Text style={s.cuotaMonto}>{fmt(c.monto_aplicado)}</Text>
                  </View>
                  <View style={[s.estadoBadge,{backgroundColor:cfg.bg}]}>
                    <Text style={[s.estadoTxt,{color:cfg.color}]}>{cfg.icon} {cfg.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>}

        {/* ── Próxima cuota ── */}
        {proxima && (
          <View style={s.proximaCard}>
            <View style={s.proximaHeader}>
              <View style={s.proximaIconBox}>
                <Text style={{fontSize:22}}>📅</Text>
              </View>
              <Text style={s.proximaTitle}>Próxima cuota</Text>
            </View>
            <View style={s.proximaGrid}>
              <View style={s.proximaItem}>
                <Text style={s.proximaLabel}>Cuota</Text>
                <Text style={s.proximaVal}>{proxima.cuota}</Text>
              </View>
              <View style={s.proximaItem}>
                <Text style={s.proximaLabel}>Saldo pendiente:</Text>
                <Text style={[s.proximaVal,{color:'#F5A623',fontWeight:'800'}]}>{fmt(proxima.saldo_pendiente)}</Text>
              </View>
              <View style={s.proximaItem}>
                <Text style={s.proximaLabel}>Fecha vencimiento:</Text>
                <Text style={s.proximaVal}>{proxima.fecha_vencimiento}</Text>
              </View>
              <View style={s.proximaItem}>
                <Text style={s.proximaLabel}>Estado:</Text>
                <View style={[s.estadoBadge,{backgroundColor:CFG[proxima.estado]?.bg||'#e3f2fd'}]}>
                  <Text style={[s.estadoTxt,{color:CFG[proxima.estado]?.color||'#1565C0'}]}>
                    {proxima.estado?.replace(/_/g,' ')}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ── Botones ── */}
        <View style={s.btns}>
          <TouchableOpacity style={s.btnPrimary} onPress={()=>navigation.navigate('Cobros')}>
            <Text style={s.btnPrimaryTxt}>Volver a ruta</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.btnSecondary}
            onPress={()=>navigation.navigate('DetalleCliente',{clienteId,clienteNombre})}
          >
            <Text style={s.btnSecondaryTxt}>Ver cliente</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex:1, backgroundColor:'#f5f6fa' },
  header: {
    backgroundColor:'#1565C0',
    paddingTop:(StatusBar.currentHeight||0)+10, paddingBottom:18, paddingHorizontal:20,
  },
  headerTitle: { color:'#fff', fontSize:22, fontWeight:'800' },

  heroCard: {
    backgroundColor:'#fff', margin:12, borderRadius:16, padding:28, alignItems:'center',
    elevation:3, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.08,
  },
  checkCircle: {
    width:80,height:80,borderRadius:40, backgroundColor:'#e8f5e9',
    alignItems:'center',justifyContent:'center', marginBottom:16,
    borderWidth:2, borderColor:'#a5d6a7',
  },
  heroLabel:   { color:'#2e7d32', fontSize:16, fontWeight:'700', marginBottom:10, textAlign:'center' },
  heroMonto:   { color:'#444', fontSize:15, marginBottom:6 },
  heroMontoVal:{ color:'#1a1a1a', fontSize:22, fontWeight:'900' },
  heroSub:     { color:'#888', fontSize:13 },

  sectionTitle: { color:'#1a1a1a', fontSize:14, fontWeight:'800', marginHorizontal:16, marginTop:16, marginBottom:8 },

  cuotasCard: {
    backgroundColor:'#fff', marginHorizontal:12, borderRadius:16, overflow:'hidden',
    elevation:3, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.08,
  },
  cuotaRow:    { flexDirection:'row', alignItems:'center', padding:14 },
  cuotaBorder: { borderBottomWidth:1, borderBottomColor:'#f5f5f5' },
  cuotaNum:    { color:'#1565C0', fontSize:15, fontWeight:'800', width:56 },
  cuotaMiddle: { flex:1 },
  cuotaSubLabel:{ color:'#999', fontSize:10 },
  cuotaMonto:  { color:'#1a1a1a', fontSize:14, fontWeight:'700' },
  estadoBadge: { borderRadius:12, paddingHorizontal:10, paddingVertical:5 },
  estadoTxt:   { fontSize:12, fontWeight:'700' },

  proximaCard: {
    backgroundColor:'#e8eaf6', marginHorizontal:12, marginTop:10, borderRadius:16, padding:16,
  },
  proximaHeader:  { flexDirection:'row', alignItems:'center', gap:10, marginBottom:14 },
  proximaIconBox: { width:42,height:42,borderRadius:21,backgroundColor:'#c5cae9',alignItems:'center',justifyContent:'center' },
  proximaTitle:   { color:'#1565C0', fontSize:15, fontWeight:'800' },
  proximaGrid:    { gap:12 },
  proximaItem:    { flexDirection:'row', alignItems:'center' },
  proximaLabel:   { color:'#555', fontSize:13, width:150 },
  proximaVal:     { color:'#1a1a1a', fontSize:13, fontWeight:'600' },

  btns:          { marginHorizontal:12, marginTop:16, gap:10 },
  btnPrimary:    { backgroundColor:'#1565C0', borderRadius:12, paddingVertical:16, alignItems:'center', elevation:2 },
  btnPrimaryTxt: { color:'#fff', fontWeight:'800', fontSize:15 },
  btnSecondary:  { borderWidth:1.5, borderColor:'#1565C0', borderRadius:12, paddingVertical:16, alignItems:'center' },
  btnSecondaryTxt:{ color:'#1565C0', fontWeight:'700', fontSize:15 },
});
