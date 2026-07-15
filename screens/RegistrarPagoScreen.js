import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Print from 'expo-print';
import api from '../services/api';
import { useConnectivity } from '../services/connectivity';
import { encolarPago, guardarEnHistorial, marcarClienteVisitado, generarNumeroRecibo } from '../services/cobrosOffline';
import { useAuth } from '../context/AuthContext';

const fmt = (n) => `$${Number(n||0).toFixed(2)}`;
const initials = (name='') => name.trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('');

const imprimirReciboCobro = async ({ cliente, ventaNumero, monto, metodo, proximaVisita, saldoAntes, saldoDespues, nombreCobrador }) => {
  try {
    const fecha   = new Date().toLocaleDateString('es-SV');
    const proxFmt = proximaVisita
      ? new Date(proximaVisita + 'T12:00:00').toLocaleDateString('es-SV', { day:'2-digit', month:'long', year:'numeric' })
      : '';

    const html = `
      <html><head>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <style>
          *{box-sizing:border-box;margin:0;padding:0}
          body{font-family:Arial,sans-serif;width:220px;margin:0 auto;padding:8px 6px;font-size:11px}
          .center{text-align:center}
          .divider{border:none;border-top:1px dashed #bbb;margin:6px 0}
          .row{display:flex;flex-direction:row;justify-content:space-between;align-items:center;padding:3px 0}
          .row .lbl{flex:1;color:#333}
          .row .val{font-weight:700;text-align:right;white-space:nowrap;padding-left:6px}
          .abono{background:#e8f5e9;border-radius:4px;padding:5px 6px;margin:3px 0}
          .abono .lbl{color:#2e7d32;font-weight:800}
          .abono .val{font-size:15px;font-weight:900;color:#1b5e20}
          .sep{border:none;border-top:1px solid #eee;margin:1px 0}
        </style>
      </head><body>
        <div class="center" style="margin-bottom:6px">
          <div style="font-size:14px;font-weight:900">DISTRIBUIDORA BM</div>
          <div style="font-size:9px;color:#888">Muebles · Electrodomésticos</div>
        </div>
        <hr class="divider"/>
        <div class="center" style="font-size:11px;font-weight:800;margin-bottom:6px">RECIBO DE COBRO</div>

        <div class="row"><span class="lbl"><b>Fecha:</b></span><span class="val">${fecha}</span></div>
        <div class="row"><span class="lbl"><b>Cliente:</b></span><span class="val">${cliente?.nombre || ''}</span></div>
        <div class="row"><span class="lbl"><b>Venta:</b></span><span class="val">${ventaNumero || 'N/A'}</span></div>
        <div class="row"><span class="lbl"><b>Cobrador:</b></span><span class="val">${nombreCobrador}</span></div>
        <div class="row"><span class="lbl"><b>Método:</b></span><span class="val">${metodo}</span></div>

        <hr class="divider"/>

        <div class="row"><span class="lbl">Lo que debía:</span><span class="val" style="color:#c62828">${fmt(saldoAntes)}</span></div>
        <hr class="sep"/>
        <div class="row abono"><span class="lbl">Lo que abona:</span><span class="val">${fmt(monto)}</span></div>
        <hr class="sep"/>
        <div class="row"><span class="lbl">Lo que resta:</span><span class="val" style="color:#e65100">${fmt(saldoDespues)}</span></div>

        <hr class="divider"/>
        ${proxFmt ? `
        <div class="center" style="margin:6px 0">
          <div style="font-size:9px;color:#888">PROXIMA VISITA</div>
          <div style="font-size:12px;font-weight:900;color:#1565C0">${proxFmt}</div>
        </div>
        <hr class="divider"/>` : ''}

        <div class="center" style="font-weight:700;font-size:11px">Gracias por su pago!</div>
      </body></html>`;

    await Print.printAsync({ html });
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
  const { cliente, ventaId, ventaNumero, producto, saldoPendiente, cuotasVencidas } = route.params;
  const { user } = useAuth();
  const nombreCobrador = user?.name || user?.full_name || user?.nombre || user?.usuario || 'Cobrador';

  const saldoNum = parseFloat(String(saldoPendiente || '0').replace(',', '.')) || 0;
  const [monto,          setMonto]          = useState('');
  const [metodo,         setMetodo]         = useState('efectivo');
  const [referencia,     setReferencia]     = useState('');
  const [notas,          setNotas]          = useState('');
  const [submitting,     setSubmitting]     = useState(false);
  const [showMetodos,    setShowMetodos]    = useState(false);
  const [opcionVisita,    setOpcionVisita]    = useState('14'); // '14' | '28' | 'custom'
  const [fechaCustomDate, setFechaCustomDate] = useState(new Date());
  const [showDatePicker,  setShowDatePicker]  = useState(false);
  const { isOnline } = useConnectivity();

  const pad = n => String(n).padStart(2, '0');
  const dateToStr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  const calcProximaVisita = () => {
    if (opcionVisita === 'custom') return dateToStr(fechaCustomDate);
    const d = new Date();
    d.setDate(d.getDate() + Number(opcionVisita));
    return dateToStr(d);
  };

  const montoNum = parseFloat(monto)||0;
  const metodoObj = METODOS.find(m=>m.value===metodo)||METODOS[0];

  const ejecutarRegistro = async () => {
    setSubmitting(true);

    if (!isOnline) {
      try {
        // Sin conexión, el servidor no puede asignar el correlativo real —
        // se genera uno TEMPORAL local solo para poder imprimir en el momento.
        // Al sincronizar, el número real que asigna el servidor (ligado al
        // cobrador, no al teléfono) reemplaza a este en el historial.
        const numeroRecibo = await generarNumeroRecibo(user?.id);
        const saldoAntes = saldoNum;
        const saldoDespues = Math.max(0, saldoAntes - montoNum);
        const proxVisita = calcProximaVisita();
        const pagoEncolado = await encolarPago({
          clienteId: cliente.id, clienteNombre: cliente.nombre,
          ventaId, ventaNumero, numeroRecibo,
          monto: montoNum, metodo,
          referencia: referencia.trim(), notas: notas.trim(),
        });
        await guardarEnHistorial({
          clienteId: cliente.id, clienteNombre: cliente.nombre,
          clienteWhatsapp: cliente.whatsapp || cliente.telefono || null,
          ventaNumero, numeroRecibo, monto: montoNum, metodo,
          proximaVisitaFecha: proxVisita,
          pagoOfflineId: pagoEncolado.id,
          resultado: {
            ok: true,
            mensaje: 'Cobro pendiente de envío (offline)',
            proxima_cuota: null,
          },
        });
        await marcarClienteVisitado(cliente.id);
        navigation.replace('PagoRegistrado', {
          isOffline: true,
          autoImprimir: true,
          clienteId: cliente.id,
          clienteNombre: cliente.nombre,
          clienteWhatsapp: cliente.whatsapp || cliente.telefono,
          montoTotal: montoNum,
          metodoPago: metodo,
          ventaNumero,
          producto,
          numeroRecibo,
          proximaVisita: proxVisita,
          saldoAntes,
          saldoDespues,
          nombreCobrador,
        });
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
      // El servidor asigna el correlativo real, ligado al cobrador (no al
      // teléfono) — si por algún motivo no lo devuelve, se genera uno local
      // como respaldo para no dejar el recibo sin número.
      const numeroRecibo = data.numero_recibo || await generarNumeroRecibo(user?.id);
      const proxVisita = calcProximaVisita();
      const histItem = await guardarEnHistorial({
        clienteId: cliente.id, clienteNombre: cliente.nombre,
        clienteWhatsapp: cliente.whatsapp || cliente.telefono || null,
        ventaNumero, numeroRecibo, monto: montoNum, metodo, resultado: data,
        proximaVisitaFecha: proxVisita,
      });
      await marcarClienteVisitado(cliente.id);
      const saldoAntes   = saldoNum;
      const saldoDespues = Math.max(0, saldoAntes - montoNum);

      navigation.replace('PagoRegistrado', {
        autoImprimir: true,
        resultado: data,
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
        clienteWhatsapp: cliente.whatsapp || cliente.telefono,
        montoTotal: montoNum,
        metodoPago: metodo,
        ventaNumero,
        producto,
        numeroRecibo,
        proximaVisita: histItem.proximaVisita,
        saldoAntes,
        saldoDespues,
        nombreCobrador,
      });
    } catch(e) {
      if (!e.response) {
        Alert.alert(
          'Sin conexión',
          '¿Deseas guardar el cobro para enviarlo cuando recuperes la conexión?',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Guardar offline', onPress: async () => {
              const numeroRecibo = await generarNumeroRecibo(user?.id);
              const proxVisita = calcProximaVisita();
              const pagoEncolado = await encolarPago({
                clienteId: cliente.id, clienteNombre: cliente.nombre,
                ventaId, ventaNumero, numeroRecibo,
                monto: montoNum, metodo,
                referencia: referencia.trim(), notas: notas.trim(),
              });
              await guardarEnHistorial({
                clienteId: cliente.id, clienteNombre: cliente.nombre,
                clienteWhatsapp: cliente.whatsapp || cliente.telefono || null,
                ventaNumero, numeroRecibo, monto: montoNum, metodo,
                proximaVisitaFecha: proxVisita,
                pagoOfflineId: pagoEncolado.id,
                resultado: { ok: true, mensaje: 'Cobro pendiente de envío (offline)', proxima_cuota: null },
              });
              await marcarClienteVisitado(cliente.id);
              navigation.goBack();
            }},
          ]
        );
      } else {
        Alert.alert('Error al registrar pago', e?.message||'Ocurrió un error');
      }
    } finally { setSubmitting(false); }
  };

  const registrar = () => {
    if (!montoNum || montoNum <= 0) { Alert.alert('Monto inválido','Ingresa un monto mayor a 0'); return; }
    if (!ventaId)                   { Alert.alert('Error','No se especificó la venta'); return; }
    if (saldoNum > 0 && montoNum > saldoNum) {
      Alert.alert('Monto excede el saldo', `El monto ($${montoNum.toFixed(2)}) supera el saldo pendiente ($${saldoNum.toFixed(2)}). ¿Deseas continuar?`,
        [
          { text: 'Corregir', style: 'cancel' },
          { text: 'Continuar igual', onPress: () => confirmar() },
        ]
      );
      return;
    }
    confirmar();
  };

  const confirmar = () => {
    Alert.alert(
      '¿Confirmar pago?',
      `Cliente: ${cliente?.nombre}\nVenta: ${ventaNumero || 'N/A'}\nMonto: $${montoNum.toFixed(2)}\nMétodo: ${metodoObj.label}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sí, registrar', style: 'default', onPress: ejecutarRegistro },
      ],
      { cancelable: true }
    );
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

          {/* Próxima visita */}
          <Text style={[s.label, { marginTop: 18 }]}>📅 Próxima visita</Text>
          <View style={s.visitaOpciones}>
            {[
              { key: '14', label: '14 días', sub: 'Defecto' },
              { key: '28', label: '28 días', sub: '4 semanas' },
              { key: 'custom', label: 'Elegir', sub: 'Fecha exacta' },
            ].map(op => (
              <TouchableOpacity
                key={op.key}
                style={[s.visitaOpcion, opcionVisita === op.key && s.visitaOpcionOn]}
                onPress={() => setOpcionVisita(op.key)}
                activeOpacity={0.75}
              >
                <Text style={[s.visitaOpcionLabel, opcionVisita === op.key && { color: '#1565C0', fontWeight: '800' }]}>
                  {op.label}
                </Text>
                <Text style={[s.visitaOpcionSub, opcionVisita === op.key && { color: '#1565C0' }]}>
                  {op.sub}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {opcionVisita === 'custom' && (
            <>
              <TouchableOpacity style={s.dateBtn} onPress={() => setShowDatePicker(true)}>
                <Text style={s.dateBtnIco}>📅</Text>
                <Text style={s.dateBtnTxt}>{dateToStr(fechaCustomDate)}</Text>
                <Text style={s.dateBtnArrow}>›</Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={fechaCustomDate}
                  mode="date"
                  display="default"
                  minimumDate={new Date()}
                  onChange={(_, date) => {
                    setShowDatePicker(false);
                    if (date) setFechaCustomDate(date);
                  }}
                />
              )}
            </>
          )}
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

  dateBtn:          { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 10, padding: 14, marginTop: 8, backgroundColor: '#e3f2fd' },
  dateBtnIco:       { fontSize: 18, marginRight: 10 },
  dateBtnTxt:       { flex: 1, fontSize: 15, fontWeight: '700', color: '#1565C0' },
  dateBtnArrow:     { fontSize: 20, color: '#1565C0' },

  visitaOpciones:   { flexDirection: 'row', gap: 8, marginTop: 6 },
  visitaOpcion:     { flex: 1, borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fafafa' },
  visitaOpcionOn:   { borderColor: '#1565C0', backgroundColor: '#e3f2fd' },
  visitaOpcionLabel:{ fontSize: 13, fontWeight: '700', color: '#555' },
  visitaOpcionSub:  { fontSize: 10, color: '#aaa', marginTop: 2 },

  btnPrimary:    { marginHorizontal:12, backgroundColor:'#1565C0', borderRadius:12, paddingVertical:16, alignItems:'center', marginBottom:10, elevation:2 },
  btnPrimaryTxt: { color:'#fff', fontWeight:'800', fontSize:15 },
  btnSecondary:  { marginHorizontal:12, borderWidth:1.5, borderColor:'#1565C0', borderRadius:12, paddingVertical:16, alignItems:'center' },
  btnSecondaryTxt:{ color:'#1565C0', fontWeight:'700', fontSize:15 },
});
