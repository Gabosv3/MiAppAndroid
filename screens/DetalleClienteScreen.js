import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, ActivityIndicator, Linking, Modal, TextInput, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { useConnectivity } from '../services/connectivity';
import { guardarClienteCache, leerClienteCache } from '../services/cobrosOffline';
import * as offlineQueue from '../services/offlineQueue';
import * as Location from 'expo-location';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
const initials = (name='') => name.trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('');

export default function DetalleClienteScreen({ navigation, route }) {
  const { clienteId, clienteNombre } = route.params;
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [esCache,      setEsCache]      = useState(false);
  const [updatingUbic,  setUpdatingUbic]  = useState(false);
  const [modalTel,      setModalTel]      = useState(false);
  const [telNormal,     setTelNormal]     = useState('');
  const [telWhatsapp,   setTelWhatsapp]   = useState('');
  const [savingTel,     setSavingTel]     = useState(false);
  const [modalRei,      setModalRei]      = useState(null); // { ventaId, ventaNumero }
  const [reiMotivo,     setReiMotivo]     = useState('');
  const [savingRei,     setSavingRei]     = useState(false);
  const [modalNombre,   setModalNombre]   = useState(false);
  const [editNombre,    setEditNombre]    = useState('');
  const [editApellido,  setEditApellido]  = useState('');
  const [savingNombre,  setSavingNombre]  = useState(false);
  const { isOnline } = useConnectivity();

  const cargar = useCallback(async () => {
    try {
      setError('');
      if (isOnline) {
        const res = await api.get(`/cobros/clientes/${clienteId}`);
        await guardarClienteCache(clienteId, res.data);
        setData(res.data);
        setEsCache(false);
      } else {
        const cache = await leerClienteCache(clienteId);
        if (cache) { setData(cache.data); setEsCache(true); }
        else setError('Sin conexión y no hay datos guardados para este cliente.');
      }
    } catch(e) {
      const cache = await leerClienteCache(clienteId);
      if (cache) { setData(cache.data); setEsCache(true); }
      else setError(e?.message||'Error');
    }
    finally { setLoading(false); }
  }, [clienteId, isOnline]);

  useFocusEffect(useCallback(()=>{ setLoading(true); cargar(); },[cargar]));

  const actualizarUbicacion = async () => {
    setUpdatingUbic(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Necesitamos acceso a la ubicación.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      if (isOnline) {
        await api.patch(`/clientes/${clienteId}/ubicacion`, { latitud: lat, longitud: lng });
        Alert.alert('✅ Ubicación actualizada', `Lat: ${lat.toFixed(5)}\nLon: ${lng.toFixed(5)}`);
      } else {
        // Sin red: encolar para sincronizar después
        await offlineQueue.enqueueRequest({
          method: 'PATCH',
          url: `/clientes/${clienteId}/ubicacion`,
          label: `Ubicación de ${clienteNombre}`,
          data: { latitud: lat, longitud: lng },
        });
        Alert.alert(
          '📍 Ubicación guardada',
          `Se enviará al servidor cuando recuperes la conexión.\n\nLat: ${lat.toFixed(5)}\nLon: ${lng.toFixed(5)}`
        );
      }
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo obtener la ubicación.');
    } finally {
      setUpdatingUbic(false);
    }
  };

  const guardarTelefonos = async () => {
    if (!telNormal.trim() && !telWhatsapp.trim()) {
      Alert.alert('Error', 'Ingresa al menos un número de teléfono');
      return;
    }
    setSavingTel(true);
    try {
      await api.patch(`/clientes/${clienteId}/telefonos`, {
        ...(telNormal.trim()   && { telefono_normal:   telNormal.trim() }),
        ...(telWhatsapp.trim() && { telefono_whatsapp: telWhatsapp.trim() }),
      });
      setModalTel(false);
      setLoading(true);
      cargar();
      Alert.alert('✅ Listo', 'Teléfonos actualizados correctamente');
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo actualizar');
    } finally {
      setSavingTel(false);
    }
  };

  const enviarReintegro = async () => {
    if (!reiMotivo.trim()) {
      Alert.alert('Motivo requerido', 'Indica el motivo del reintegro');
      return;
    }
    setSavingRei(true);
    try {
      await api.post('/reintegros', {
        venta_id: modalRei.ventaId,
        motivo:   reiMotivo.trim(),
      });
      setModalRei(null);
      setReiMotivo('');
      Alert.alert('✅ Reintegro creado', 'La venta fue enviada a reintegros correctamente.');
    } catch (e) {
      const msg = e?.response?.data?.message || 'No se pudo crear el reintegro';
      Alert.alert('Error', msg);
    } finally {
      setSavingRei(false);
    }
  };

  const cliente = data?.cliente;
  const resumen = data?.resumen;
  const ventas  = data?.ventas||[];

  const abrirModalTel = () => {
    setTelNormal(cliente?.telefono || '');
    setTelWhatsapp(cliente?.whatsapp || '');
    setModalTel(true);
  };

  const abrirModalNombre = () => {
    // Separar nombre completo en nombre y apellido si el servidor los devuelve juntos
    const partes = (cliente?.nombre || '').trim().split(/\s+/);
    setEditNombre(cliente?.nombre_solo || partes[0] || '');
    setEditApellido(cliente?.apellido || partes.slice(1).join(' ') || '');
    setModalNombre(true);
  };

  const guardarNombre = async () => {
    const n = editNombre.trim();
    const a = editApellido.trim();
    if (!n && !a) {
      Alert.alert('Error', 'Ingresa al menos el nombre o el apellido.');
      return;
    }
    setSavingNombre(true);
    try {
      const { data: resp } = await api.patch(`/clientes/${clienteId}/nombre`, {
        ...(n && { nombre: n }),
        ...(a && { apellido: a }),
      });
      setModalNombre(false);
      // Actualizar nombre en pantalla sin recargar todo
      setData(prev => ({
        ...prev,
        cliente: { ...prev.cliente, nombre: resp.cliente?.nombre_completo || `${n} ${a}`.trim() },
      }));
      Alert.alert('✅ Listo', 'Nombre actualizado correctamente.');
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.message || 'No se pudo actualizar el nombre.');
    } finally {
      setSavingNombre(false);
    }
  };

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

          {/* Banner offline */}
          {(!isOnline || esCache) && (
            <View style={s.offlineBanner}>
              <Text style={s.offlineTxt}>
                {!isOnline ? '📴 Sin conexión' : '📦 Datos en caché'} — los cobros se guardarán al reconectarte
              </Text>
            </View>
          )}

          {/* ── Cliente card ── */}
          <View style={s.clienteCard}>
            <View style={s.clienteRow}>
              <View style={s.clienteAvatar}>
                <Text style={s.clienteAvatarTxt}>{initials(cliente?.nombre)}</Text>
              </View>
              <View style={{flex:1,marginLeft:14}}>
                <View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:6}}>
                  <Text style={[s.clienteNombre,{marginBottom:0}]} numberOfLines={2}>{cliente?.nombre}</Text>
                  <TouchableOpacity onPress={abrirModalNombre} hitSlop={{top:8,bottom:8,left:8,right:8}}>
                    <Text style={{fontSize:16}}>✏️</Text>
                  </TouchableOpacity>
                </View>
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

          {/* Botones de acción */}
          <View style={s.accionRow}>
            <TouchableOpacity
              style={[s.ubicBtn, { flex: 1 }, updatingUbic && { opacity: 0.5 }]}
              onPress={actualizarUbicacion}
              disabled={updatingUbic}
            >
              <Text style={{ fontSize: 26 }}>{updatingUbic ? '⏳' : '📍'}</Text>
              <Text style={s.ubicBtnTxt}>{updatingUbic ? 'Actualizando...' : 'Actualizar\nubicación'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.telBtn, { flex: 1 }]} onPress={abrirModalTel}>
              <Text style={{ fontSize: 26 }}>📞</Text>
              <Text style={s.telBtnTxt}>{'Editar\nteléfonos'}</Text>
            </TouchableOpacity>
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

                <View style={s.ventaBtnRow}>
                  <TouchableOpacity
                    style={[s.cobrarBtn, { flex: 1 }]}
                    onPress={() => navigation.navigate('RegistrarPago',{
                      cliente: {id:clienteId, nombre:cliente?.nombre, ...cliente},
                      ventaId: venta.id,
                      ventaNumero: venta.numero_venta,
                      saldoPendiente: venta.saldo_pendiente,
                      cuotasVencidas: venta.resumen?.vencidas||0,
                    })}
                  >
                    <Text style={s.cobrarBtnTxt}>💰 Cobrar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.reintegroBtn}
                    onPress={() => { setModalRei({ ventaId: venta.id, ventaNumero: venta.numero_venta }); setReiMotivo(''); }}
                  >
                    <Text style={s.reintegroBtnTxt}>📦 Reintegro</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {/* ── Sin pago / No estaba ── */}
          <TouchableOpacity
            style={s.visitaBtn}
            onPress={() => navigation.navigate('RegistrarVisita', { cliente: { id: clienteId, nombre: cliente?.nombre } })}
          >
            <Text style={s.visitaBtnIco}>🚪</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.visitaBtnTxt}>Sin pago / No estaba</Text>
              <Text style={s.visitaBtnSub}>Registrar visita sin cobro</Text>
            </View>
            <Text style={{ fontSize: 18, color: '#e65100' }}>›</Text>
          </TouchableOpacity>

          {/* ── Gestiones ── */}
          <TouchableOpacity style={s.gestionesRow}>
            <Text style={{fontSize:20}}>📋</Text>
            <Text style={s.gestionesTxt}>Ver gestiones pendientes</Text>
            <Text style={{fontSize:20,color:'#1565C0'}}>›</Text>
          </TouchableOpacity>

          <View style={{height:32}}/>
        </ScrollView>
      )}

      {/* Modal reintegro */}
      <Modal visible={!!modalRei} transparent animationType="slide" onRequestClose={() => setModalRei(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>📦 Enviar a reintegro</Text>
            <Text style={s.modalSub}>{cliente?.nombre} · {modalRei?.ventaNumero}</Text>

            <Text style={s.modalLabel}>Motivo del reintegro *</Text>
            <TextInput
              style={[s.modalInput, { minHeight: 80, textAlignVertical: 'top' }]}
              value={reiMotivo}
              onChangeText={setReiMotivo}
              placeholder="Ej: Cliente no paga, no contesta llamadas, 6 cuotas vencidas..."
              multiline
            />

            <TouchableOpacity
              style={[s.guardarBtn, { backgroundColor: '#B71C1C' }, savingRei && { opacity: 0.6 }]}
              onPress={enviarReintegro}
              disabled={savingRei}
            >
              <Text style={s.guardarBtnTxt}>{savingRei ? 'Enviando...' : '📦 Confirmar reintegro'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setModalRei(null)}>
              <Text style={s.cancelBtnTxt}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal editar nombre */}
      <Modal visible={modalNombre} transparent animationType="slide" onRequestClose={() => setModalNombre(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>✏️ Editar nombre</Text>
            <Text style={s.modalSub}>{cliente?.nombre}</Text>

            <Text style={s.modalLabel}>Nombre *</Text>
            <TextInput
              style={s.modalInput}
              value={editNombre}
              onChangeText={setEditNombre}
              placeholder="Ej: Maria"
              autoCapitalize="words"
              maxLength={80}
            />

            <Text style={s.modalLabel}>Apellido *</Text>
            <TextInput
              style={s.modalInput}
              value={editApellido}
              onChangeText={setEditApellido}
              placeholder="Ej: Hernandez"
              autoCapitalize="words"
              maxLength={80}
            />

            <TouchableOpacity
              style={[s.guardarBtn, savingNombre && { opacity: 0.6 }]}
              onPress={guardarNombre}
              disabled={savingNombre}
            >
              <Text style={s.guardarBtnTxt}>{savingNombre ? 'Guardando...' : '💾 Guardar nombre'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setModalNombre(false)}>
              <Text style={s.cancelBtnTxt}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal editar teléfonos */}
      <Modal visible={modalTel} transparent animationType="slide" onRequestClose={() => setModalTel(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Editar teléfonos</Text>
            <Text style={s.modalSub}>{cliente?.nombre}</Text>

            <Text style={s.modalLabel}>Teléfono principal</Text>
            <TextInput
              style={s.modalInput}
              value={telNormal}
              onChangeText={setTelNormal}
              placeholder="Ej: 75123456"
              keyboardType="phone-pad"
              maxLength={20}
            />

            <Text style={s.modalLabel}>WhatsApp</Text>
            <TextInput
              style={s.modalInput}
              value={telWhatsapp}
              onChangeText={setTelWhatsapp}
              placeholder="Ej: 75123456"
              keyboardType="phone-pad"
              maxLength={20}
            />

            <TouchableOpacity
              style={[s.guardarBtn, savingTel && { opacity: 0.6 }]}
              onPress={guardarTelefonos}
              disabled={savingTel}
            >
              <Text style={s.guardarBtnTxt}>{savingTel ? 'Guardando...' : '💾 Guardar teléfonos'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setModalTel(false)}>
              <Text style={s.cancelBtnTxt}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  ventaBtnRow:    { flexDirection:'row', gap:8 },
  cobrarBtn:      { backgroundColor:'#1565C0', borderRadius:10, paddingVertical:13, alignItems:'center' },
  cobrarBtnTxt:   { color:'#fff', fontWeight:'800', fontSize:14 },
  reintegroBtn:   { backgroundColor:'#fff', borderWidth:1.5, borderColor:'#B71C1C', borderRadius:10, paddingVertical:13, paddingHorizontal:14, alignItems:'center' },
  reintegroBtnTxt:{ color:'#B71C1C', fontWeight:'800', fontSize:13 },

  gestionesRow: {
    flexDirection:'row', alignItems:'center', gap:12,
    backgroundColor:'#fff', marginHorizontal:12, marginTop:4, borderRadius:14, padding:16,
    elevation:2,
  },
  gestionesTxt: { flex:1, color:'#1565C0', fontWeight:'700', fontSize:14 },
  visitaBtn: {
    flexDirection:'row', alignItems:'center', gap:12,
    backgroundColor:'#fff8f0', marginHorizontal:12, marginTop:8, borderRadius:14, padding:16,
    elevation:2, borderWidth:1.5, borderColor:'#ffcc80',
  },
  visitaBtnIco: { fontSize:24 },
  visitaBtnTxt: { color:'#e65100', fontWeight:'800', fontSize:14 },
  visitaBtnSub: { color:'#bf360c', fontSize:11, marginTop:2 },
  offlineBanner:{ backgroundColor:'#fff3cd', margin:12, borderRadius:10, padding:10 },
  offlineTxt:   { color:'#856404', fontSize:12, fontWeight:'600', textAlign:'center' },
  accionRow:    { flexDirection:'row', marginHorizontal:12, marginTop:10, marginBottom:14, gap:10 },
  ubicBtn: {
    backgroundColor:'#e8f5e9', borderRadius:14, paddingVertical:16,
    alignItems:'center', justifyContent:'center',
    borderWidth:1, borderColor:'#a5d6a7',
    elevation:1,
  },
  ubicBtnTxt:   { color:'#2e7d32', fontWeight:'800', fontSize:13, marginTop:4 },
  telBtn: {
    backgroundColor:'#e3f2fd', borderRadius:14, paddingVertical:16,
    alignItems:'center', justifyContent:'center',
    borderWidth:1, borderColor:'#90caf9',
    elevation:1,
  },
  telBtnTxt:    { color:'#1565C0', fontWeight:'800', fontSize:13, marginTop:4 },

  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' },
  modalBox:     { backgroundColor:'#fff', borderTopLeftRadius:20, borderTopRightRadius:20, padding:24, paddingBottom:36 },
  modalTitle:   { fontSize:18, fontWeight:'900', color:'#1a1a1a', marginBottom:2 },
  modalSub:     { color:'#888', fontSize:13, marginBottom:16 },
  modalLabel:   { fontSize:13, fontWeight:'700', color:'#555', marginBottom:6, marginTop:12 },
  modalInput:   { borderWidth:1, borderColor:'#ddd', borderRadius:10, padding:12, fontSize:14, color:'#333' },
  guardarBtn:   { backgroundColor:'#1565C0', borderRadius:12, paddingVertical:14, alignItems:'center', marginTop:20 },
  guardarBtnTxt:{ color:'#fff', fontWeight:'800', fontSize:15 },
  cancelBtn:    { marginTop:10, alignItems:'center', paddingVertical:10 },
  cancelBtnTxt: { color:'#999', fontSize:14 },
});
