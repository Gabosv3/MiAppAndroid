import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import api from '../services/api';

const fmt = (n) => `$${Number(n||0).toFixed(2)}`;
const initials = (name='') => name.trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('');

const METODOS = [
  { value:'efectivo',      label:'Efectivo',      icon:'💵' },
  { value:'transferencia', label:'Transferencia', icon:'📲' },
  { value:'cheque',        label:'Cheque',        icon:'📄' },
  { value:'deposito',      label:'Depósito',      icon:'🏦' },
];

export default function RegistrarPagoScreen({ navigation, route }) {
  const { cliente, ventaId, ventaNumero, saldoPendiente, cuotasVencidas } = route.params;

  const [monto,       setMonto]       = useState(saldoPendiente ? String(Number(saldoPendiente).toFixed(2)) : '');
  const [metodo,      setMetodo]      = useState('efectivo');
  const [referencia,  setReferencia]  = useState('');
  const [notas,       setNotas]       = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [showMetodos, setShowMetodos] = useState(false);

  const montoNum = parseFloat(monto)||0;
  const metodoObj = METODOS.find(m=>m.value===metodo)||METODOS[0];

  const registrar = async () => {
    if (!montoNum || montoNum <= 0) { Alert.alert('Monto inválido','Ingresa un monto mayor a 0'); return; }
    if (!ventaId)                   { Alert.alert('Error','No se especificó la venta'); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post(`/cobros/clientes/${cliente.id}/pagar`, {
        monto: montoNum,
        metodo_pago: metodo,
        venta_id: ventaId,
        ...(referencia.trim() && { referencia: referencia.trim() }),
        ...(notas.trim()      && { observaciones: notas.trim() }),
      });
      navigation.replace('PagoRegistrado',{ resultado:data, clienteId:cliente.id, clienteNombre:cliente.nombre });
    } catch(e) {
      Alert.alert('Error al registrar pago', e?.message||'Ocurrió un error');
    } finally { setSubmitting(false); }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0"/>

      <View style={s.header}>
        <TouchableOpacity onPress={()=>navigation.goBack()} style={s.backBtn} hitSlop={{top:10,bottom:10,left:10,right:10}}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Registrar pago</Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* ── Info cliente ── */}
        <View style={s.clienteCard}>
          <View style={s.clienteRow}>
            <View style={s.avatar}>
              <Text style={s.avatarTxt}>{initials(cliente?.nombre)}</Text>
            </View>
            <View style={{flex:1,marginLeft:12}}>
              <Text style={s.clienteNombre}>{cliente?.nombre}</Text>
              {ventaNumero && <Text style={s.clienteSub}>Venta: {ventaNumero}</Text>}
            </View>
          </View>
          <View style={s.clienteStats}>
            <View style={s.clienteStat}>
              <Text style={s.clienteStatLabel}>Saldo pendiente</Text>
              <Text style={[s.clienteStatVal,{color:'#2e7d32'}]}>{fmt(saldoPendiente)}</Text>
            </View>
            {cuotasVencidas > 0 &&
              <View style={s.clienteStat}>
                <Text style={s.clienteStatLabel}>Cuotas vencidas</Text>
                <Text style={[s.clienteStatVal,{color:'#F5A623'}]}>{cuotasVencidas}</Text>
              </View>
            }
          </View>
        </View>

        {/* ── Formulario ── */}
        <View style={s.formCard}>
          <Text style={s.formTitle}>Datos del pago</Text>

          {/* Monto */}
          <Text style={s.label}>Monto a pagar</Text>
          <View style={s.montoWrap}>
            <TextInput
              style={s.montoInput}
              value={monto}
              onChangeText={setMonto}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#bbb"
            />
            <View style={s.montoSuffix}>
              <Text style={{fontSize:22}}>💲</Text>
            </View>
          </View>

          {/* Método */}
          <Text style={s.label}>Método de pago</Text>
          <TouchableOpacity style={s.selectBtn} onPress={()=>setShowMetodos(!showMetodos)}>
            <Text style={s.selectIcon}>{metodoObj.icon}</Text>
            <Text style={s.selectTxt}>{metodoObj.label}</Text>
            <Text style={{color:'#aaa',fontSize:12}}>{showMetodos?'▴':'▾'}</Text>
          </TouchableOpacity>
          {showMetodos && (
            <View style={s.dropdown}>
              {METODOS.map(m=>(
                <TouchableOpacity
                  key={m.value}
                  style={[s.dropItem, m.value===metodo && s.dropItemActive]}
                  onPress={()=>{setMetodo(m.value);setShowMetodos(false);}}
                >
                  <Text style={{fontSize:16,marginRight:10}}>{m.icon}</Text>
                  <Text style={[s.dropTxt, m.value===metodo && {color:'#1565C0',fontWeight:'700'}]}>{m.label}</Text>
                  {m.value===metodo && <Text style={{color:'#1565C0',marginLeft:'auto'}}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Venta */}
          {ventaNumero && <>
            <Text style={s.label}>Venta seleccionada</Text>
            <View style={[s.selectBtn,{opacity:0.7}]}>
              <Text style={{fontSize:16,marginRight:10}}>📋</Text>
              <Text style={[s.selectTxt,{flex:1}]}>{ventaNumero}</Text>
              <Text style={{color:'#aaa',fontSize:12}}>▾</Text>
            </View>
          </>}

          {/* Referencia */}
          <Text style={s.label}>Referencia <Text style={{color:'#bbb',fontWeight:'400'}}>(opcional)</Text></Text>
          <TextInput
            style={s.input}
            value={referencia}
            onChangeText={setReferencia}
            placeholder="Ej: Pago en el hogar"
            placeholderTextColor="#bbb"
          />

          {/* Observaciones */}
          <Text style={s.label}>Observaciones <Text style={{color:'#bbb',fontWeight:'400'}}>(opcional)</Text></Text>
          <TextInput
            style={[s.input,{height:80,textAlignVertical:'top',paddingTop:12}]}
            value={notas}
            onChangeText={setNotas}
            placeholder="Notas adicionales..."
            placeholderTextColor="#bbb"
            multiline
          />

          {/* Aviso */}
          <View style={s.infoBox}>
            <Text style={s.infoIcon}>ℹ️</Text>
            <Text style={s.infoTxt}>El sistema distribuirá el pago automáticamente entre las cuotas pendientes por fecha de vencimiento.</Text>
          </View>
        </View>

        {/* ── Resumen ── */}
        <View style={s.resumenCard}>
          <Text style={s.formTitle}>Resumen antes de guardar</Text>
          {[
            { icon:'👤', label:'Cliente',     val: cliente?.nombre },
            { icon:'💲', label:'Monto',       val: fmt(montoNum), valStyle:{color:'#2e7d32',fontWeight:'800'} },
            { icon:'💵', label:'Método',      val: `${metodoObj.icon} ${metodoObj.label}` },
            ...(ventaNumero ? [{ icon:'📋', label:'Aplicación', val:`Venta ${ventaNumero}` }] : []),
          ].map((row,i,arr)=>(
            <View key={i} style={[s.resumenRow, i<arr.length-1 && s.resumenBorder]}>
              <Text style={{fontSize:18,marginRight:12}}>{row.icon}</Text>
              <Text style={s.resumenLabel}>{row.label}</Text>
              <Text style={[s.resumenVal, row.valStyle||{}]}>{row.val}</Text>
            </View>
          ))}
        </View>

        {/* Botones */}
        <TouchableOpacity
          style={[s.btnPrimary, (submitting||!montoNum)&&{opacity:0.6}]}
          onPress={registrar}
          disabled={submitting||!montoNum}
        >
          {submitting
            ? <ActivityIndicator color="#fff"/>
            : <Text style={s.btnPrimaryTxt}>Registrar pago</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={s.btnSecondary} onPress={()=>navigation.goBack()}>
          <Text style={s.btnSecondaryTxt}>Cancelar</Text>
        </TouchableOpacity>

        <View style={{height:32}}/>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex:1, backgroundColor:'#f5f6fa' },
  header: {
    backgroundColor:'#1565C0', flexDirection:'row', alignItems:'center',
    paddingTop:(StatusBar.currentHeight||0)+8, paddingBottom:16, paddingHorizontal:16,
  },
  backBtn:   { marginRight:12 },
  backArrow: { color:'#fff', fontSize:24 },
  headerTitle:{ color:'#fff', fontSize:18, fontWeight:'700' },

  clienteCard: {
    backgroundColor:'#fff', margin:12, borderRadius:16, padding:16,
    elevation:3, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.08,
  },
  clienteRow:      { flexDirection:'row', alignItems:'center', marginBottom:12 },
  avatar:          { width:46,height:46,borderRadius:23,backgroundColor:'#ffcdd2',alignItems:'center',justifyContent:'center' },
  avatarTxt:       { color:'#c62828', fontSize:16, fontWeight:'800' },
  clienteNombre:   { color:'#1a1a1a', fontSize:15, fontWeight:'700' },
  clienteSub:      { color:'#999', fontSize:12, marginTop:3 },
  clienteStats:    { flexDirection:'row', gap:24, backgroundColor:'#f8f9fc', borderRadius:10, padding:12 },
  clienteStat:     {},
  clienteStatLabel:{ color:'#999', fontSize:11, marginBottom:3 },
  clienteStatVal:  { fontSize:18, fontWeight:'800' },

  formCard: {
    backgroundColor:'#fff', marginHorizontal:12, borderRadius:16, padding:16,
    elevation:3, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.08, marginBottom:10,
  },
  formTitle: { color:'#1a1a1a', fontSize:15, fontWeight:'800', marginBottom:16 },
  label:     { color:'#666', fontSize:12, fontWeight:'700', marginBottom:6, marginTop:14 },

  montoWrap:   { flexDirection:'row', borderWidth:2, borderColor:'#1565C0', borderRadius:10, overflow:'hidden' },
  montoInput:  { flex:1, fontSize:22, fontWeight:'800', color:'#1a1a1a', padding:14, backgroundColor:'#fff' },
  montoSuffix: { backgroundColor:'#e3f2fd', paddingHorizontal:16, alignItems:'center', justifyContent:'center' },

  selectBtn:  { flexDirection:'row', alignItems:'center', borderWidth:1.5, borderColor:'#e0e0e0', borderRadius:10, padding:14, backgroundColor:'#fff' },
  selectIcon: { fontSize:18, marginRight:10 },
  selectTxt:  { flex:1, fontSize:14, color:'#1a1a1a' },
  dropdown:   { borderWidth:1, borderColor:'#e0e0e0', borderRadius:10, marginTop:2, overflow:'hidden', backgroundColor:'#fff', elevation:4 },
  dropItem:   { flexDirection:'row', alignItems:'center', padding:14, borderBottomWidth:1, borderBottomColor:'#f0f0f0' },
  dropItemActive:{ backgroundColor:'#e3f2fd' },
  dropTxt:    { fontSize:14, color:'#333' },

  input: {
    borderWidth:1.5, borderColor:'#e0e0e0', borderRadius:10, padding:14,
    fontSize:14, color:'#1a1a1a', backgroundColor:'#fff',
  },
  infoBox:  { flexDirection:'row', alignItems:'flex-start', backgroundColor:'#e3f2fd', borderRadius:10, padding:12, marginTop:14 },
  infoIcon: { fontSize:16, marginRight:8 },
  infoTxt:  { flex:1, color:'#1565C0', fontSize:12, lineHeight:18 },

  resumenCard: {
    backgroundColor:'#fff', marginHorizontal:12, borderRadius:16, padding:16,
    elevation:3, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.08, marginBottom:12,
  },
  resumenRow:    { flexDirection:'row', alignItems:'center', paddingVertical:12 },
  resumenBorder: { borderBottomWidth:1, borderBottomColor:'#f0f0f0' },
  resumenLabel:  { flex:1, color:'#888', fontSize:13 },
  resumenVal:    { color:'#1a1a1a', fontSize:13, fontWeight:'600' },

  btnPrimary:    { marginHorizontal:12, backgroundColor:'#1565C0', borderRadius:12, paddingVertical:16, alignItems:'center', marginBottom:10, elevation:2 },
  btnPrimaryTxt: { color:'#fff', fontWeight:'800', fontSize:15 },
  btnSecondary:  { marginHorizontal:12, borderWidth:1.5, borderColor:'#1565C0', borderRadius:12, paddingVertical:16, alignItems:'center' },
  btnSecondaryTxt:{ color:'#1565C0', fontWeight:'700', fontSize:15 },
});
