import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ActivityIndicator, ScrollView, Linking, Platform, Image, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import api, { esErrorTransitorio } from '../services/api';
import { useConnectivity } from '../services/connectivity';
import * as offlineQueue from '../services/offlineQueue';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const RESULTADO_VISITA = {
  no_encontrado: '🚪 No encontrado',
  se_negó: '🙅 Se negó a pagar',
  prometio_pago: '🤝 Prometió pago',
  visitado: '✅ Visitado',
  sin_saldo: '💚 Cuenta al día (sin saldo)',
};

export default function PerfilClienteScreen({ route, navigation }) {
  const { clienteId, clienteNombre } = route.params || {};
  const { isOnline } = useConnectivity();
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [data,    setData]    = useState(null); // { cliente, ventas, resumen, historial_ruta, visitas_sin_cobro }
  const [ventaAbierta, setVentaAbierta] = useState(null); // id de la venta expandida
  const [updatingUbic, setUpdatingUbic] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: resp } = await api.get(`/cobros/clientes/${clienteId}/perfil`);
      setData(resp);
    } catch (e) {
      setError(e?.response?.data?.message || 'No se pudo cargar el perfil del cliente.');
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const abrirDireccion = () => {
    const lat = data?.cliente?.latitud;
    const lng = data?.cliente?.longitud;
    if (!lat || !lng) return;
    const label = encodeURIComponent(data?.cliente?.nombre || 'Cliente');
    const url = Platform.OS === 'ios'
      ? `maps:0,0?q=${label}@${lat},${lng}`
      : `geo:${lat},${lng}?q=${lat},${lng}(${label})`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
    });
  };

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
          label: `Ubicación de ${clienteNombre || data?.cliente?.nombre || ''}`,
          data: { latitud: lat, longitud: lng },
        });
        Alert.alert('📍 Ubicación guardada', `Se enviará al servidor cuando recuperes la conexión.\n\nLat: ${lat.toFixed(5)}\nLon: ${lng.toFixed(5)}`);
      };

      if (isOnline) {
        try {
          await api.patch(`/clientes/${clienteId}/ubicacion`, { latitud: lat, longitud: lng });
          Alert.alert('✅ Ubicación actualizada', `Lat: ${lat.toFixed(5)}\nLon: ${lng.toFixed(5)}`);
          await cargar();
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

  const llamar = (tel) => { if (tel) Linking.openURL(`tel:${tel}`); };
  const whatsapp = (tel) => { if (tel) Linking.openURL(`https://wa.me/503${tel.replace(/\D/g,'')}`); };

  if (loading) {
    return (
      <View style={s.center}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <ActivityIndicator size="large" color="#1565C0" />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={s.center}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <Text style={{ fontSize: 40, marginBottom: 8 }}>⚠️</Text>
        <Text style={{ color: '#888', textAlign: 'center', paddingHorizontal: 30 }}>{error}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.volverBtn}>
          <Text style={s.volverTxt}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const c = data.cliente;
  const r = data.resumen || {};

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 30 }} hitSlop={{top:10,bottom:10,left:10,right:10}}>
          <Text style={{ fontSize: 22, color: '#1a1a1a' }}>←</Text>
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{c.nombre || clienteNombre}</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Ficha del cliente */}
        <View style={s.card}>
          {c.foto_casa ? <Image source={{ uri: c.foto_casa }} style={s.fotoCasa} /> : null}
          <Text style={s.nombreGrande}>{c.nombre}</Text>
          {c.codigo_anterior ? <Text style={s.metaTxt}>Código: {c.codigo_anterior}</Text> : null}
          {c.direccion ? <Text style={s.metaTxt}>📍 {c.direccion}</Text> : null}
          {(c.departamento || c.municipio) ? (
            <Text style={s.metaTxt}>{[c.municipio, c.departamento].filter(Boolean).join(', ')}</Text>
          ) : null}
          {c.dui ? <Text style={s.metaTxt}>DUI: {c.dui}</Text> : null}
          {c.nit ? <Text style={s.metaTxt}>NIT: {c.nit}</Text> : null}
          {c.email ? <Text style={s.metaTxt}>✉️ {c.email}</Text> : null}
          <Text style={s.metaTxt}>Ruta: {c.ruta_nombre} · {c.ruta_dia}</Text>

          <View style={s.accionesRow}>
            {c.telefono ? (
              <TouchableOpacity style={s.accionBtn} onPress={() => llamar(c.telefono)}>
                <Text style={{ fontSize: 22 }}>📞</Text>
                <Text style={s.accionTxt}>Llamar</Text>
              </TouchableOpacity>
            ) : null}
            {c.whatsapp ? (
              <TouchableOpacity style={s.accionBtn} onPress={() => whatsapp(c.whatsapp)}>
                <Text style={{ fontSize: 22 }}>💬</Text>
                <Text style={s.accionTxt}>WhatsApp</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[s.accionBtn, updatingUbic && { opacity: 0.5 }]}
              onPress={(c.latitud && c.longitud) ? abrirDireccion : actualizarUbicacion}
              disabled={updatingUbic}
            >
              <Text style={{ fontSize: 22 }}>
                {updatingUbic ? '⏳' : (c.latitud && c.longitud) ? '🧭' : '📍'}
              </Text>
              <Text style={s.accionTxt}>
                {updatingUbic ? 'Actualizando...' : (c.latitud && c.longitud) ? 'Dirigir ubicación' : 'Actualizar ubicación'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Resumen de saldos */}
        <View style={s.resumenRow}>
          <View style={s.resumenBox}>
            <Text style={s.resumenLabel}>Ventas</Text>
            <Text style={s.resumenValor}>{r.total_ventas || 0}</Text>
          </View>
          <View style={s.resumenBox}>
            <Text style={s.resumenLabel}>Comprado</Text>
            <Text style={s.resumenValor}>{fmt(r.total_comprado)}</Text>
          </View>
          <View style={s.resumenBox}>
            <Text style={s.resumenLabel}>Pagado</Text>
            <Text style={[s.resumenValor, { color: '#2e7d32' }]}>{fmt(r.total_pagado)}</Text>
          </View>
          <View style={s.resumenBox}>
            <Text style={s.resumenLabel}>Pendiente</Text>
            <Text style={[s.resumenValor, { color: '#e53e3e' }]}>{fmt(r.total_pendiente)}</Text>
          </View>
        </View>

        {/* Referencias */}
        {(c.referencias_familiares?.length > 0 || c.referencias_conocidas?.length > 0) && (
          <View style={s.card}>
            <Text style={s.seccionTitulo}>Referencias</Text>
            {(c.referencias_familiares || []).map((ref, i) => (
              <Text key={`fam-${i}`} style={s.refTxt}>👪 {ref.nombre} ({ref.parentesco}) · {ref.telefono}</Text>
            ))}
            {(c.referencias_conocidas || []).map((ref, i) => (
              <Text key={`con-${i}`} style={s.refTxt}>🤝 {ref.nombre} ({ref.trabajo}) · {ref.telefono}</Text>
            ))}
          </View>
        )}

        {/* Ventas con línea de tiempo */}
        <Text style={s.seccionTitulo}>Ventas</Text>
        {(data.ventas || []).map((v) => {
          const abierta = ventaAbierta === v.id;
          return (
            <View key={v.id} style={s.card}>
              <TouchableOpacity onPress={() => setVentaAbierta(abierta ? null : v.id)} activeOpacity={0.8}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.ventaProducto}>{(v.productos || []).map(p => p.nombre).join(', ') || 'Venta'}</Text>
                    <Text style={s.ventaNum}>{v.numero_venta} · {v.fecha_venta}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.ventaEstado, { color: v.estado === 'activa' ? '#e65100' : '#2e7d32' }]}>
                      {v.estado === 'activa' ? 'Activa' : v.estado}
                    </Text>
                    <Text style={s.ventaTipo}>{v.tipo_pago}</Text>
                  </View>
                </View>

                <View style={s.ventaTotalesRow}>
                  <Text style={s.ventaTotalTxt}>Total: {fmt(v.total)}</Text>
                  <Text style={[s.ventaTotalTxt, { color: '#2e7d32' }]}>Pagado: {fmt(v.monto_pagado)}</Text>
                  <Text style={[s.ventaTotalTxt, { color: '#e53e3e' }]}>Pendiente: {fmt(v.saldo_pendiente)}</Text>
                </View>

                {v.cuotas_resumen ? (
                  <Text style={s.cuotasTxt}>
                    Cuotas: {v.cuotas_resumen.cobradas}/{v.cuotas_resumen.total} cobradas
                    {v.cuotas_resumen.vencidas > 0 ? ` · ${v.cuotas_resumen.vencidas} vencida${v.cuotas_resumen.vencidas !== 1 ? 's' : ''}` : ''}
                  </Text>
                ) : null}

                {v.proxima_cuota ? (
                  <Text style={s.proximaCuotaTxt}>
                    Próxima cuota #{v.proxima_cuota.numero_cuota}/{v.proxima_cuota.total_cuotas}: {fmt(v.proxima_cuota.monto_cuota)} — vence {v.proxima_cuota.fecha_vencimiento}
                  </Text>
                ) : null}

                <Text style={s.verMasTxt}>{abierta ? '▲ Ocultar historial' : '▼ Ver historial de pagos/visitas'}</Text>
              </TouchableOpacity>

              {abierta && (
                <View style={s.timeline}>
                  {(v.eventos || []).length === 0 ? (
                    <Text style={s.metaTxt}>Sin eventos registrados.</Text>
                  ) : (v.eventos || []).map((ev, i) => (
                    <View key={i} style={s.eventoRow}>
                      {ev.tipo === 'pago' ? (
                        <>
                          <Text style={s.eventoIcono}>💵</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={[s.eventoTxt, ev.anulado && s.eventoAnulado]}>
                              {ev.anulado ? 'Pago ANULADO' : 'Pago'} de {fmt(ev.monto)} ({ev.metodo_pago})
                            </Text>
                            <Text style={s.eventoMeta}>{ev.numero_recibo} · {ev.fecha}</Text>
                            {ev.anulado && ev.motivo_anulacion ? (
                              <Text style={s.eventoMeta}>Motivo: {ev.motivo_anulacion}</Text>
                            ) : null}
                          </View>
                        </>
                      ) : (
                        <>
                          <Text style={s.eventoIcono}>🚶</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={s.eventoTxt}>{RESULTADO_VISITA[ev.resultado] || ev.resultado}</Text>
                            <Text style={s.eventoMeta}>{ev.usuario} · {ev.fecha}</Text>
                          </View>
                        </>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {(data.ventas || []).length === 0 && (
          <View style={s.card}>
            <Text style={s.metaTxt}>Este cliente no tiene ventas registradas todavía.</Text>
          </View>
        )}

        {/* Visitas sin cobro (cliente sin ventas aún) */}
        {(data.visitas_sin_cobro || []).length > 0 && (
          <>
            <Text style={s.seccionTitulo}>Visitas (sin venta todavía)</Text>
            <View style={s.card}>
              {data.visitas_sin_cobro.map((v, i) => (
                <View key={i} style={s.eventoRow}>
                  <Text style={s.eventoIcono}>🚶</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.eventoTxt}>{RESULTADO_VISITA[v.resultado] || v.resultado}</Text>
                    <Text style={s.eventoMeta}>{v.usuario} · {v.fecha}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Historial de cambios de ruta */}
        {(data.historial_ruta || []).length > 0 && (
          <>
            <Text style={s.seccionTitulo}>Historial de ruta</Text>
            <View style={s.card}>
              {data.historial_ruta.map((h, i) => (
                <Text key={i} style={s.refTxt}>
                  {h.fecha}: {h.ruta_anterior || '—'} → {h.ruta_nueva} ({h.usuario})
                </Text>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f6f8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  volverBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#1565C0', borderRadius: 10 },
  volverTxt: { color: '#fff', fontWeight: '700' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 50,
    paddingBottom: 14, paddingHorizontal: 16, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#1a1a1a' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#eee',
  },
  fotoCasa: { width: '100%', height: 140, borderRadius: 10, marginBottom: 10, backgroundColor: '#eee' },
  nombreGrande: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', marginBottom: 6 },
  metaTxt: { fontSize: 13, color: '#666', marginBottom: 3 },

  accionesRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  accionBtn: { flex: 1, alignItems: 'center', backgroundColor: '#f5f6f8', borderRadius: 10, paddingVertical: 10 },
  accionTxt: { fontSize: 11, color: '#555', marginTop: 4, fontWeight: '600' },

  resumenRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  resumenBox: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#eee' },
  resumenLabel: { fontSize: 10, color: '#888', marginBottom: 4 },
  resumenValor: { fontSize: 13, fontWeight: '800', color: '#1a1a1a' },

  seccionTitulo: { fontSize: 13, fontWeight: '800', color: '#555', marginBottom: 8, marginTop: 4 },
  refTxt: { fontSize: 12, color: '#666', marginBottom: 4 },

  ventaProducto: { fontSize: 14, fontWeight: '800', color: '#1a1a1a' },
  ventaNum: { fontSize: 11, color: '#888', marginTop: 2 },
  ventaEstado: { fontSize: 11, fontWeight: '700' },
  ventaTipo: { fontSize: 10, color: '#aaa', marginTop: 2, textTransform: 'capitalize' },

  ventaTotalesRow: { flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  ventaTotalTxt: { fontSize: 11, color: '#666', fontWeight: '600' },

  cuotasTxt: { fontSize: 11, color: '#888', marginTop: 6 },
  proximaCuotaTxt: { fontSize: 11, color: '#e65100', marginTop: 4, fontWeight: '600' },
  verMasTxt: { fontSize: 12, color: '#1565C0', fontWeight: '700', marginTop: 10 },

  timeline: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  eventoRow: { flexDirection: 'row', gap: 10, marginBottom: 10, alignItems: 'flex-start' },
  eventoIcono: { fontSize: 16 },
  eventoTxt: { fontSize: 12, color: '#1a1a1a', fontWeight: '600' },
  eventoAnulado: { color: '#e53e3e', textDecorationLine: 'line-through' },
  eventoMeta: { fontSize: 11, color: '#aaa', marginTop: 2 },
});
