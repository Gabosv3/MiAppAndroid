import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api from '../services/api';
import { useConnectivity } from '../services/connectivity';
import { encolarPago } from '../services/cobrosOffline';

const fmt = (n) => `$${Number(n||0).toFixed(2)}`;
const initials = (name='') => name.trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('');

const imprimirReciboCobro = async ({ cliente, ventaNumero, monto, metodo, resultado }) => {
  try {
    const fecha = new Date().toLocaleString('es-SV', { dateStyle:'short', timeStyle:'short' });
    const cuotasPagadas = resultado?.cuotas_pagadas || [];
    const proxima = resultado?.proxima_cuota;

    const cuotasHtml = cuotasPagadas.map(c => {
      const estado = c.estado === 'cobrado' ? '✓ Cobrado' : c.estado === 'parcialmente_cobrado' ? '~ Parcial' : '○ Pendiente';
      return `
        <tr>
          <td style="padding:5px 0;font-size:15px;color:#333">${c.cuota}</td>
          <td style="padding:5px 0;font-size:15px;text-align:right">${fmt(c.monto_aplicado)}</td>
          <td style="padding:5px 0;font-size:13px;text-align:right;color:${c.estado==='cobrado'?'#2e7d32':'#e65100'}">${estado}</td>
        </tr>`;
    }).join('');

    const proximaHtml = proxima ? `
      <div style="margin-top:14px;padding:12px;background:#f5f5f5;border-radius:6px;font-size:14px">
        <div style="font-weight:700;margin-bottom:6px">Próxima cuota:</div>
        <div>Cuota: <strong>${proxima.cuota}</strong></div>
        <div>Saldo: <strong style="color:#e65100">${fmt(proxima.saldo_pendiente)}</strong></div>
        <div>Vencimiento: <strong>${proxima.fecha_vencimiento}</strong></div>
      </div>` : '';

    const html = `
      <html><head>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <style>
          body{font-family:Arial,sans-serif;width:320px;margin:0 auto;padding:16px;font-size:16px}
          .center{text-align:center} .divider{border-top:2px dashed #aaa;margin:14px 0}
          table{width:100%;border-collapse:collapse}
        </style>
      </head><body>
        <div class="center" style="margin-bottom:12px">
          <div style="font-size:24px;font-weight:900">DISTRIBUIDORA BM</div>
          <div style="font-size:13px;color:#666">Muebles · Electrodomésticos</div>
        </div>
        <div class="divider"></div>
        <div class="center" style="font-size:17px;font-weight:800;margin-bottom:12px">━ RECIBO DE COBRO ━</div>

        <table style="font-size:14px;margin-bottom:4px">
          <tr><td><strong>Fecha:</strong></td><td style="text-align:right">${fecha}</td></tr>
          <tr><td><strong>Cliente:</strong></td><td style="text-align:right">${cliente?.nombre || ''}</td></tr>
          <tr><td><strong>Venta:</strong></td><td style="text-align:right">${ventaNumero || ''}</td></tr>
          <tr><td><strong>Método:</strong></td><td style="text-align:right">${metodo}</td></tr>
        </table>

        <div class="divider"></div>
        <div style="font-size:15px;font-weight:700;margin-bottom:8px">PAGO RECIBIDO</div>
        <div style="font-size:26px;font-weight:900;text-align:center;margin:8px 0">${fmt(monto)}</div>
        <div style="font-size:13px;color:#666;text-align:center">Distribuido en ${cuotasPagadas.length} cuota(s)</div>

        <div class="divider"></div>
        <div style="font-size:15px;font-weight:700;margin-bottom:8px">CUOTAS APLICADAS</div>
        <table>${cuotasHtml}</table>

        ${proximaHtml}

        <div class="divider"></div>
        <div class="center" style="font-size:15px;font-weight:700">¡Gracias por su pago!</div>
        <div class="center" style="font-size:12px;color:#888;margin-top:4px">DISTRIBUIDORA BM</div>
      </body></html>`;

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
  } catch (e) {
    console.warn('Error imprimiendo recibo:', e?.message);
    Alert.alert('Error', 'No se pudo imprimir el recibo');
  }
};

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
  const { isOnline } = useConnectivity();

  const montoNum = parseFloat(monto)||0;
  const metodoObj = METODOS.find(m=>m.value===metodo)||METODOS[0];

  const registrar = async () => {
    if (!montoNum || montoNum <= 0) { Alert.alert('Monto inválido','Ingresa un monto mayor a 0'); return; }
    if (!ventaId)                   { Alert.alert('Error','No se especificó la venta'); return; }
    setSubmitting(true);

    if (!isOnline) {
      // Guardar en cola offline
      try {
        await encolarPago({
          clienteId: cliente.id, clienteNombre: cliente.nombre,
          ventaId, ventaNumero,
          monto: montoNum, metodo,
          referencia: referencia.trim(), notas: notas.trim(),
        });
        Alert.alert(
          '✅ Cobro guardado',
          `El pago de $${montoNum.toFixed(2)} se enviará automáticamente cuando recuperes la conexión.`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } catch (e) {
        Alert.alert('Error', 'No se pudo guardar el cobro offline.');
      } finally { setSubmitting(false); }
      return;
    }

    try {
      const { data } = await api.post(`/cobros/clientes/${cliente.id}/pagar`, {
        monto: montoNum,
        metodo_pago: metodo,
        venta_id: ventaId,
        ...(referencia.trim() && { referencia: referencia.trim() }),
        ...(notas.trim()      && { observaciones: notas.trim() }),
      });
      navigation.replace('PagoRegistrado',{ resultado:data, clienteId:cliente.id, clienteNombre:cliente.nombre, clienteWhatsapp:cliente.whatsapp||cliente.telefono, montoTotal:montoNum, metodoPago:metodo, ventaNumero });
      // Imprimir recibo en segundo plano
      (async () => {
        await imprimirReciboCobro({ cliente, ventaNumero, monto: montoNum, metodo, resultado: data });
      })();
    } catch(e) {
      // Si falla por red, ofrecer guardar offline
      if (!e.response) {
        Alert.alert(
          'Sin conexión',
          '¿Deseas guardar el cobro para enviarlo cuando recuperes la conexión?',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Guardar offline', onPress: async () => {
              await encolarPago({
                clienteId: cliente.id, clienteNombre: cliente.nombre,
                ventaId, ventaNumero,
                monto: montoNum, metodo,
                referencia: referencia.trim(), notas: notas.trim(),
              });
              navigation.goBack();
            }},
          ]
        );
      } else {
        Alert.alert('Error al registrar pago', e?.message||'Ocurrió un error');
      }
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

      {!isOnline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>📴 Sin conexión — el cobro se guardará y enviará al reconectarte</Text>
        </View>
      )}

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
  offlineBanner:{ backgroundColor:'#fff3cd', paddingHorizontal:16, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#ffeaa7' },
  offlineTxt:   { color:'#856404', fontSize:12, fontWeight:'600', textAlign:'center' },
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
