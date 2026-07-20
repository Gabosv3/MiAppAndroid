import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, ActivityIndicator, Linking, Modal, TextInput, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import api, { esErrorTransitorio } from '../services/api';
import { useConnectivity } from '../services/connectivity';
import { guardarClienteCache, leerClienteCache, generarNumeroRecibo, encolarPago, guardarEnHistorial, marcarClienteVisitado } from '../services/cobrosOffline';
import * as offlineQueue from '../services/offlineQueue';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
const initials = (name='') => name.trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('');

export default function DetalleClienteScreen({ navigation, route }) {
  const { clienteId, clienteNombre } = route.params;
  const { user } = useAuth();
  const nombreCobrador = user?.name || user?.full_name || user?.nombre || user?.usuario || 'Cobrador';
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

  // ── Grupo familiar (cuentas vinculadas) ───────────────────────────────────
  const [grupo,           setGrupo]           = useState(null); // { grupo_id, clientes, saldo_total_grupo }
  const [loadingGrupo,    setLoadingGrupo]    = useState(false);
  const [modalVincular,   setModalVincular]   = useState(false);
  const [buscarVincular,  setBuscarVincular]  = useState('');
  const [resultadosVinc,  setResultadosVinc]  = useState([]);
  const [buscandoVinc,    setBuscandoVinc]    = useState(false);
  const [vinculando,      setVinculando]      = useState(false);
  const [modalAbonoGrupo, setModalAbonoGrupo] = useState(false);
  const [montoAbonoGrupo, setMontoAbonoGrupo] = useState('');
  const [procesandoAbono, setProcesandoAbono] = useState(false);

  const cargarGrupo = useCallback(async () => {
    if (!isOnline) return;
    setLoadingGrupo(true);
    try {
      const { data } = await api.get(`/clientes/${clienteId}/grupo`);
      setGrupo(data);
    } catch { /* silencioso, sección opcional */ }
    finally { setLoadingGrupo(false); }
  }, [clienteId, isOnline]);

  useFocusEffect(useCallback(() => { cargarGrupo(); }, [cargarGrupo]));

  const buscarClienteParaVincular = useCallback(async (texto) => {
    if (!texto.trim()) { setResultadosVinc([]); return; }
    setBuscandoVinc(true);
    try {
      const { data } = await api.get('/cobros/clientes/buscar', { params: { codigo: texto.trim() } });
      const lista = Array.isArray(data) ? data : (data.clientes || []);
      setResultadosVinc(lista.filter(c => c.id !== clienteId));
    } catch { setResultadosVinc([]); }
    finally { setBuscandoVinc(false); }
  }, [clienteId]);

  const vincularCliente = async (otroId) => {
    setVinculando(true);
    try {
      if (isOnline) {
        await api.post(`/clientes/${clienteId}/vincular`, { cliente_id_vincular: otroId });
        await cargarGrupo();
        Alert.alert('✅ Vinculado', 'Las cuentas fueron vinculadas correctamente.');
      } else {
        await offlineQueue.enqueueRequest({
          method: 'POST', url: `/clientes/${clienteId}/vincular`,
          label: `Vincular cliente ${otroId}`, data: { cliente_id_vincular: otroId },
        });
        Alert.alert('📴 Guardado sin conexión', 'La vinculación se aplicará cuando recuperes la señal.');
      }
      setModalVincular(false);
      setBuscarVincular('');
      setResultadosVinc([]);
    } catch (e) {
      if (esErrorTransitorio(e)) {
        await offlineQueue.enqueueRequest({
          method: 'POST', url: `/clientes/${clienteId}/vincular`,
          label: `Vincular cliente ${otroId}`, data: { cliente_id_vincular: otroId },
        });
        setModalVincular(false);
        setBuscarVincular('');
        setResultadosVinc([]);
        Alert.alert('📴 Guardado sin conexión', 'La vinculación se aplicará cuando recuperes la señal.');
      } else {
        Alert.alert('Error', e?.response?.data?.message || 'No se pudo vincular.');
      }
    } finally {
      setVinculando(false);
    }
  };

  const desvincularCliente = (otroId, otroNombre) => {
    Alert.alert(
      'Desvincular cuenta',
      `¿Quitar a ${otroNombre} de este grupo familiar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Desvincular', style: 'destructive', onPress: async () => {
          const encolar = async () => {
            await offlineQueue.enqueueRequest({
              method: 'POST', url: `/clientes/${otroId}/desvincular`,
              label: `Desvincular cliente ${otroId}`, data: {},
            });
            Alert.alert('📴 Guardado sin conexión', 'Se desvinculará cuando recuperes la señal.');
          };
          try {
            if (isOnline) {
              await api.post(`/clientes/${otroId}/desvincular`);
              await cargarGrupo();
            } else {
              await encolar();
            }
          } catch (e) {
            if (esErrorTransitorio(e)) await encolar();
            else Alert.alert('Error', e?.response?.data?.message || 'No se pudo desvincular.');
          }
        }},
      ]
    );
  };

  // Reparte el monto ingresado entre las cuentas del grupo (más antigua primero)
  // y llama al mismo endpoint de pago que usa RegistrarPagoScreen, una vez por cuenta.
  const abonarATodasLasCuentas = async () => {
    const monto = parseFloat(montoAbonoGrupo);
    if (!monto || monto <= 0) {
      Alert.alert('Monto inválido', 'Ingresa un monto mayor a 0.');
      return;
    }
    if (!grupo?.clientes?.length) return;

    // Aplanar todas las cuentas de todos los clientes del grupo, ordenadas por venta_id (más antigua primero)
    const cuentas = grupo.clientes
      .flatMap(c => (c.cuentas || []).map(cta => ({ ...cta, cliente_id: c.id, clienteNombre: `${c.nombre} ${c.apellido || ''}`.trim() })))
      .sort((a, b) => a.venta_id - b.venta_id);

    if (cuentas.length === 0) {
      Alert.alert('Sin cuentas', 'No hay cuentas con saldo pendiente en este grupo.');
      return;
    }

    setProcesandoAbono(true);
    let restante = monto;
    const aplicados = []; // líneas que sí se cobraron, para el recibo consolidado
    let huboOffline = false;

    for (const cta of cuentas) {
      if (restante <= 0) break;
      const aPagar = Math.min(restante, cta.saldo);
      if (aPagar <= 0) continue;

      // Aplica el abono a UNA cuenta: si hay conexión intenta online; si no
      // hay conexión o el servidor falla momentáneamente, encola offline en
      // vez de descartar el pago — antes esto ni siquiera se intentaba sin red.
      const encolarLocal = async () => {
        const numeroRecibo = await generarNumeroRecibo(user?.id);
        const pagoEncolado = await encolarPago({
          clienteId: cta.cliente_id, clienteNombre: cta.clienteNombre,
          ventaId: cta.venta_id, ventaNumero: cta.venta_numero || null, numeroRecibo,
          monto: aPagar, metodo: 'efectivo',
        });
        await guardarEnHistorial({
          clienteId: cta.cliente_id, clienteNombre: cta.clienteNombre,
          ventaNumero: cta.venta_numero || null, numeroRecibo, producto: cta.producto,
          monto: aPagar, metodo: 'efectivo',
          pagoOfflineId: pagoEncolado.id,
          resultado: { ok: true, mensaje: 'Cobro pendiente de envío (offline)', proxima_cuota: null },
        });
        await marcarClienteVisitado(cta.cliente_id);
        return { numeroRecibo, ok: true, offline: true };
      };

      let resultado;
      if (!isOnline) {
        resultado = await encolarLocal();
      } else {
        try {
          const { data } = await api.post(`/cobros/clientes/${cta.cliente_id}/pagar`, {
            monto: aPagar,
            metodo_pago: 'efectivo',
            venta_id: cta.venta_id,
          });
          resultado = { numeroRecibo: data?.numero_recibo || null, ok: true, offline: false };
        } catch (e) {
          resultado = esErrorTransitorio(e) ? await encolarLocal() : { ok: false, offline: false };
        }
      }

      if (resultado.offline) huboOffline = true;
      aplicados.push({
        clienteNombre: cta.clienteNombre,
        producto: cta.producto,
        ventaNumero: cta.venta_numero || cta.venta_id,
        monto: aPagar,
        numeroRecibo: resultado.numeroRecibo || null,
        ok: resultado.ok,
      });
      if (resultado.ok) restante -= aPagar;
    }

    setProcesandoAbono(false);
    setModalAbonoGrupo(false);
    setMontoAbonoGrupo('');
    await cargarGrupo(); // no-op si está offline
    await cargar(); // ya maneja su propio fallback a caché si está offline

    const huboExito = aplicados.some(a => a.ok);
    if (huboExito) {
      await imprimirReciboGrupal({ monto, restante, aplicados });
      if (huboOffline) {
        Alert.alert('📴 Algunos abonos quedaron sin conexión', 'Se enviarán automáticamente cuando recuperes la señal.');
      }
    } else {
      Alert.alert('Sin aplicar', 'No se pudo aplicar el abono a ninguna cuenta.');
    }
  };

  // Recibo consolidado: una línea por cada cuenta abonada + total final.
  const imprimirReciboGrupal = async ({ monto, restante, aplicados }) => {
    try {
      const numeroReciboGrupo = await generarNumeroRecibo(user?.id);
      const fecha = new Date().toLocaleDateString('es-SV');
      const filasHtml = aplicados.map(a => `
        <div class="row"><span class="lbl">${a.ok ? '✅' : '❌'} ${a.clienteNombre}${a.producto ? ` — ${a.producto}` : ''}</span>
          <span class="val">${a.ok ? fmt(a.monto) : 'ERROR'}</span></div>
        ${a.ok && a.numeroRecibo ? `<div style="font-size:10px;color:#888;margin:-2px 0 4px">Recibo: ${a.numeroRecibo}</div>` : ''}
      `).join('');
      const totalAplicado = aplicados.filter(a => a.ok).reduce((s, a) => s + a.monto, 0);

      const html = `
        <html><head>
          <meta name="viewport" content="width=device-width,initial-scale=1"/>
          <style>
            *{box-sizing:border-box;margin:0;padding:0}
            body{font-family:Arial,sans-serif;width:220px;margin:0 auto;padding:8px 6px;font-size:11px}
            .center{text-align:center}
            .divider{border:none;border-top:1px dashed #bbb;margin:6px 0}
            .row{display:flex;justify-content:space-between;align-items:center;padding:3px 0}
            .lbl{flex:1;color:#333}
            .val{font-weight:700;text-align:right;white-space:nowrap;padding-left:6px}
            .total{background:#e8f5e9;border-radius:4px;padding:6px;margin-top:4px}
            .total .lbl{color:#2e7d32;font-weight:800}
            .total .val{font-size:15px;font-weight:900;color:#1b5e20}
          </style>
        </head><body>
          <div class="center" style="margin-bottom:6px">
            <div style="font-size:14px;font-weight:900">DISTRIBUIDORA BM</div>
            <div style="font-size:9px;color:#888">Muebles · Electrodomésticos</div>
          </div>
          <hr class="divider"/>
          <div class="center" style="font-size:11px;font-weight:800;margin-bottom:6px">RECIBO DE ABONO GRUPAL</div>
          <div class="row"><span class="lbl"><b>Recibo:</b></span><span class="val">${numeroReciboGrupo}</span></div>
          <div class="row"><span class="lbl"><b>Fecha:</b></span><span class="val">${fecha}</span></div>
          <div class="row"><span class="lbl"><b>Cobrador:</b></span><span class="val">${nombreCobrador}</span></div>
          <hr class="divider"/>
          <div style="font-size:10px;font-weight:700;color:#888;margin-bottom:4px">CUENTAS ABONADAS</div>
          ${filasHtml}
          <hr class="divider"/>
          <div class="row total"><span class="lbl">TOTAL ABONADO</span><span class="val">${fmt(totalAplicado)}</span></div>
          ${restante > 0 ? `<div class="row" style="margin-top:4px"><span class="lbl" style="color:#e65100">Sobrante sin aplicar</span><span class="val" style="color:#e65100">${fmt(restante)}</span></div>` : ''}
          <hr class="divider"/>
          <div class="center" style="font-weight:700;font-size:11px">Gracias por su pago!</div>
        </body></html>`;

      await Print.printAsync({ html });
    } catch (e) {
      console.warn('Error imprimiendo recibo grupal:', e?.message);
      Alert.alert('Error', 'No se pudo imprimir el recibo grupal.');
    }
  };

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

      const guardarOffline = async () => {
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
      };

      if (isOnline) {
        try {
          await api.patch(`/clientes/${clienteId}/ubicacion`, { latitud: lat, longitud: lng });
          Alert.alert('✅ Ubicación actualizada', `Lat: ${lat.toFixed(5)}\nLon: ${lng.toFixed(5)}`);
        } catch (e) {
          if (esErrorTransitorio(e)) await guardarOffline();
          else throw e;
        }
      } else {
        await guardarOffline();
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
    const payload = {
      ...(telNormal.trim()   && { telefono_normal:   telNormal.trim() }),
      ...(telWhatsapp.trim() && { telefono_whatsapp: telWhatsapp.trim() }),
    };
    const encolar = async () => {
      await offlineQueue.enqueueRequest({
        method: 'PATCH', url: `/clientes/${clienteId}/telefonos`,
        label: `Teléfonos de ${clienteNombre}`, data: payload,
      });
      setModalTel(false);
      Alert.alert('📴 Guardado sin conexión', 'Los teléfonos se actualizarán cuando recuperes la señal.');
    };
    try {
      if (isOnline) {
        await api.patch(`/clientes/${clienteId}/telefonos`, payload);
        setModalTel(false);
        setLoading(true);
        cargar();
        Alert.alert('✅ Listo', 'Teléfonos actualizados correctamente');
      } else {
        await encolar();
      }
    } catch (e) {
      if (esErrorTransitorio(e)) await encolar();
      else Alert.alert('Error', e?.response?.data?.message || 'No se pudo actualizar');
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
    const payload = { venta_id: modalRei.ventaId, motivo: reiMotivo.trim() };
    const encolar = async () => {
      await offlineQueue.enqueueRequest({
        method: 'POST', url: '/reintegros',
        label: `Reintegro venta ${modalRei.ventaNumero || modalRei.ventaId}`, data: payload,
      });
      setModalRei(null);
      setReiMotivo('');
      Alert.alert('📴 Guardado sin conexión', 'El reintegro se enviará cuando recuperes la señal.');
    };
    try {
      if (isOnline) {
        await api.post('/reintegros', payload);
        setModalRei(null);
        setReiMotivo('');
        Alert.alert('✅ Reintegro creado', 'La venta fue enviada a reintegros correctamente.');
      } else {
        await encolar();
      }
    } catch (e) {
      if (esErrorTransitorio(e)) await encolar();
      else Alert.alert('Error', e?.response?.data?.message || 'No se pudo crear el reintegro');
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
    const payload = { ...(n && { nombre: n }), ...(a && { apellido: a }) };
    const encolar = async () => {
      await offlineQueue.enqueueRequest({
        method: 'PATCH', url: `/clientes/${clienteId}/nombre`,
        label: `Nombre de ${clienteNombre}`, data: payload,
      });
      setModalNombre(false);
      // Optimista: usamos lo que el cobrador tecleó, ya que no hay respuesta
      // del servidor todavía. Se corrige solo si difiere al recargar online.
      setData(prev => ({
        ...prev,
        cliente: { ...prev.cliente, nombre: `${n} ${a}`.trim() },
      }));
      Alert.alert('📴 Guardado sin conexión', 'El nombre se actualizará cuando recuperes la señal.');
    };
    try {
      if (isOnline) {
        const { data: resp } = await api.patch(`/clientes/${clienteId}/nombre`, payload);
        setModalNombre(false);
        // Actualizar nombre en pantalla sin recargar todo
        setData(prev => ({
          ...prev,
          cliente: { ...prev.cliente, nombre: resp.cliente?.nombre_completo || `${n} ${a}`.trim() },
        }));
        Alert.alert('✅ Listo', 'Nombre actualizado correctamente.');
      } else {
        await encolar();
      }
    } catch (e) {
      if (esErrorTransitorio(e)) await encolar();
      else Alert.alert('Error', e?.response?.data?.message || 'No se pudo actualizar el nombre.');
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
                {cliente?.codigo_anterior && <Text style={s.clienteInfo}>Código:    {cliente.codigo_anterior}</Text>}
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

          {/* ── Grupo familiar (cuentas vinculadas) ── */}
          <View style={s.grupoHeaderRow}>
            <Text style={[s.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>Cuentas vinculadas</Text>
            <TouchableOpacity onPress={() => { setBuscarVincular(''); setResultadosVinc([]); setModalVincular(true); }}>
              <Text style={s.vincularBtnTxt}>🔗 Vincular</Text>
            </TouchableOpacity>
          </View>

          {loadingGrupo ? (
            <ActivityIndicator size="small" color="#1565C0" style={{ marginBottom: 12 }} />
          ) : grupo && grupo.clientes?.length > 1 ? (
            <View style={s.grupoCard}>
              {grupo.clientes.map(c => (
                <View key={c.id} style={[s.grupoItem, c.id === clienteId && s.grupoItemActual]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.grupoNombre}>{c.nombre} {c.apellido}{c.id === clienteId ? ' (este)' : ''}</Text>
                    <Text style={s.grupoSaldo}>Saldo: {fmt(c.saldo_total)} · {(c.cuentas||[]).length} cuenta{(c.cuentas||[]).length!==1?'s':''}</Text>
                  </View>
                  {c.id !== clienteId && (
                    <TouchableOpacity onPress={() => desvincularCliente(c.id, `${c.nombre} ${c.apellido}`)} hitSlop={{top:8,bottom:8,left:8,right:8}}>
                      <Text style={{ fontSize: 18, color: '#B71C1C' }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <View style={s.grupoTotalRow}>
                <Text style={s.grupoTotalLabel}>Total del grupo</Text>
                <Text style={s.grupoTotalVal}>{fmt(grupo.saldo_total_grupo)}</Text>
              </View>
              <TouchableOpacity
                style={s.abonarGrupoBtn}
                onPress={() => { setMontoAbonoGrupo(''); setModalAbonoGrupo(true); }}
              >
                <Text style={s.abonarGrupoBtnTxt}>💰 Abonar a todas las cuentas</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={s.grupoVacio}>Sin cuentas vinculadas. Usa "🔗 Vincular" si este cliente tiene otras cuentas a su nombre o de un familiar.</Text>
          )}

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
                      producto: venta.producto || null,
                      codigoCliente: cliente?.codigo_anterior || null,
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
      {/* Modal vincular cliente */}
      <Modal visible={modalVincular} transparent animationType="slide" onRequestClose={() => setModalVincular(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>🔗 Vincular cuenta</Text>
            <Text style={s.modalSub}>Busca al otro cliente (nombre, DUI o teléfono)</Text>

            <TextInput
              style={s.modalInput}
              value={buscarVincular}
              onChangeText={(t) => { setBuscarVincular(t); buscarClienteParaVincular(t); }}
              placeholder="Ej: Ana Escobar"
              autoFocus
            />

            {buscandoVinc ? (
              <ActivityIndicator size="small" color="#1565C0" style={{ marginTop: 16 }} />
            ) : (
              <ScrollView style={{ maxHeight: 260, marginTop: 12 }}>
                {resultadosVinc.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={s.resultadoVincItem}
                    onPress={() => vincularCliente(c.id)}
                    disabled={vinculando}
                  >
                    <Text style={s.resultadoVincNombre}>{c.nombre} {c.apellido}</Text>
                    {c.dui ? <Text style={s.resultadoVincSub}>{c.dui}</Text> : null}
                  </TouchableOpacity>
                ))}
                {buscarVincular.trim() && resultadosVinc.length === 0 && (
                  <Text style={{ color: '#999', textAlign: 'center', padding: 16, fontSize: 13 }}>Sin resultados</Text>
                )}
              </ScrollView>
            )}

            <TouchableOpacity style={s.cancelBtn} onPress={() => setModalVincular(false)}>
              <Text style={s.cancelBtnTxt}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal abono a todas las cuentas */}
      <Modal visible={modalAbonoGrupo} transparent animationType="slide" onRequestClose={() => setModalAbonoGrupo(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>💰 Abonar a todas las cuentas</Text>
            <Text style={s.modalSub}>Total del grupo: {fmt(grupo?.saldo_total_grupo)}</Text>

            <Text style={s.modalLabel}>Monto recibido *</Text>
            <TextInput
              style={s.modalInput}
              value={montoAbonoGrupo}
              onChangeText={setMontoAbonoGrupo}
              placeholder="Ej: 150.00"
              keyboardType="numeric"
              autoFocus
            />
            <Text style={{ color: '#888', fontSize: 12, marginTop: 8 }}>
              El monto se repartirá automáticamente entre las cuentas del grupo, empezando por la más antigua.
            </Text>

            <TouchableOpacity
              style={[s.guardarBtn, procesandoAbono && { opacity: 0.6 }]}
              onPress={abonarATodasLasCuentas}
              disabled={procesandoAbono}
            >
              <Text style={s.guardarBtnTxt}>{procesandoAbono ? 'Procesando...' : '💰 Aplicar abono'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setModalAbonoGrupo(false)}>
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

  // ── Grupo familiar ──
  grupoHeaderRow: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginHorizontal:16, marginTop:16, marginBottom:8 },
  vincularBtnTxt: { color:'#1565C0', fontWeight:'700', fontSize:13 },
  grupoCard: {
    backgroundColor:'#fff', marginHorizontal:12, marginBottom:10, borderRadius:16, padding:14,
    elevation:2, shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.06,
  },
  grupoItem: { flexDirection:'row', alignItems:'center', paddingVertical:8, borderBottomWidth:1, borderBottomColor:'#f0f0f0' },
  grupoItemActual: { backgroundColor:'#f3f7fd', borderRadius:8, paddingHorizontal:8 },
  grupoNombre: { color:'#1a1a1a', fontSize:13, fontWeight:'700' },
  grupoSaldo:  { color:'#888', fontSize:11, marginTop:2 },
  grupoTotalRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingTop:10, marginTop:4 },
  grupoTotalLabel: { color:'#666', fontSize:13, fontWeight:'700' },
  grupoTotalVal: { color:'#1565C0', fontSize:17, fontWeight:'900' },
  abonarGrupoBtn: { backgroundColor:'#2e7d32', borderRadius:10, paddingVertical:12, alignItems:'center', marginTop:12 },
  abonarGrupoBtnTxt: { color:'#fff', fontWeight:'800', fontSize:13 },
  grupoVacio: { color:'#999', fontSize:12, marginHorizontal:16, marginBottom:12, lineHeight:17 },
  resultadoVincItem: { paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#f0f0f0' },
  resultadoVincNombre: { color:'#1a1a1a', fontSize:14, fontWeight:'700' },
  resultadoVincSub: { color:'#999', fontSize:12, marginTop:2 },
});
