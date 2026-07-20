import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Modal, ScrollView, Alert, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api from '../services/api';
import { useConnectivity } from '../services/connectivity';
import { useAuth } from '../context/AuthContext';
import { leerHistorial } from '../services/cobrosOffline';
import { fechaHoyLocal, fechaLocalDesdeISO, fmtFechaCorta } from '../services/dateUtils';

// Normaliza la respuesta real de GET /cobros/historial (items mezcla pagos
// y visitas, distinguidos por `tipo`) al mismo shape que usa el historial
// local, para que el resto de la pantalla no tenga que distinguir de dónde
// vino cada registro.
// Nota: numero_recibo no existe en ningún lado del backend todavía — la UI
// ya lo omite cuando falta, sin romperse.
const normalizarItemServidor = (fechaDia) => (it) => {
  const base = {
    id: `srv-${it.tipo}-${it.id}`,
    tipo: it.tipo,
    clienteId: it.cliente?.id,
    clienteNombre: it.cliente?.nombre,
    clienteCodigo: it.cliente?.codigo_anterior || null,
    clienteWhatsapp: it.cliente?.whatsapp || null,
    fecha: `${fechaDia}T${it.hora}:00`,
  };

  if (it.tipo === 'visita') {
    return {
      ...base,
      resultadoVisita: it.resultado || null,
      observaciones: it.observaciones || null,
      proximaVisita: it.promesa_fecha || null,
      fotoHogarUrl: it.foto_hogar_url || null,
      ventaNumero: null, numeroRecibo: null, producto: null, monto: 0, metodo: null,
    };
  }

  if (it.tipo === 'gasto') {
    return {
      ...base,
      clienteNombre: it.vehiculo ? `Vehículo ${it.vehiculo}` : 'Gasto',
      tipoGasto: it.tipo_gasto || null,
      categoriaVehiculo: it.categoria_vehiculo || null,
      monto: it.monto || 0,
      comprobanteUrl: it.comprobante_url || null,
      observaciones: it.descripcion || null,
      estadoGasto: it.estado || null,
      descuentaCobroDiario: !!it.descuenta_cobro_diario,
      ventaNumero: null, numeroRecibo: null, producto: null, metodo: null,
      resultadoVisita: null, proximaVisita: null,
    };
  }

  return {
    ...base,
    ventaNumero: it.numero_venta || null,
    numeroRecibo: null,
    producto: (it.productos || []).map(x => x.nombre).join(', ') || null,
    monto: it.monto || 0,
    metodo: it.metodo_pago || null,
    referencia: it.referencia || null,
    resultadoVisita: null,
    observaciones: null,
    proximaVisita: null,
  };
};

const fmt   = (n) => `$${Number(n || 0).toFixed(2)}`;
const hoy   = fechaHoyLocal;
const hora  = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return ''; }
};
// Solo para fechas simples "YYYY-MM-DD" (ej. proximaVisita) — se les agrega
// mediodía para evitar que la zona horaria las corra un día hacia atrás.
const fmtFecha = (iso) => {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-SV', { day: '2-digit', month: 'short' });
  } catch { return iso; }
};

// Para fechas-hora completas (ej. selected.fecha) — NO agregar 'T12:00:00',
// ya traen su propia hora y concatenarlo de nuevo produce una fecha inválida.
const fmtFechaHora = (iso) => {
  try {
    return new Date(iso).toLocaleDateString('es-SV', { day: '2-digit', month: 'short' });
  } catch { return iso; }
};

const METODO_ICON = { efectivo: '💵', transferencia: '📲', cheque: '📄', deposito: '🏦' };

const VISITA_INFO = {
  no_encontrado: { label: 'No estaba en casa',   icon: '🚪', color: '#1565C0', bg: '#e3f2fd' },
  sin_pago:      { label: 'Estaba pero no pagó', icon: '🚫', color: '#e65100', bg: '#fff3e0' },
  promesa_pago:  { label: 'Prometió pagar',      icon: '🤝', color: '#2e7d32', bg: '#e8f5e9' },
  rechazo:       { label: 'Se negó a atender',   icon: '⛔', color: '#c62828', bg: '#ffebee' },
  abono_previo:  { label: 'Ya abonó mensualidad',icon: '✅', color: '#00695c', bg: '#e0f2f1' },
};

// Formato compacto — igual al recibo original al momento de cobrar. No
// incluye DEBE/SALDO porque el historial no guarda saldo antes/después,
// solo el monto cobrado — evita mostrar datos que no tenemos certeza son
// correctos.
const buildReciboHtml = ({ clienteNombre, clienteCodigo, ventaNumero, producto, numeroRecibo, monto, metodo, proximaVisita, fecha, nombreCobrador }) => {
  const fechaFmt = fmtFechaCorta(fecha);
  const proxFmt = proximaVisita ? fmtFechaCorta(proximaVisita) : '';
  return `<html><head>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,Helvetica,sans-serif;width:220px;margin:0 auto;padding:6px 4px;font-size:11px;line-height:1.5;color:#111}
      .c{text-align:center}
      .b{font-weight:700}
      .row{display:flex;justify-content:space-between;align-items:center}
      .div{border-top:1px solid #999;margin:5px 0}
      .tot{font-size:14px}
    </style>
  </head><body>
    <div class="c b" style="font-size:14px">DISTRIBUIDORA BM</div>
    <div class="c">6047-9762</div>
    <div style="height:8px"></div>
    <div class="row"><span class="b">${numeroRecibo||'N/A'}</span><span>${fechaFmt}</span></div>
    <div class="div"></div>
    <div><span class="b">${clienteNombre}</span>${clienteCodigo ? ` (${clienteCodigo})` : ''}</div>
    ${producto ? `<div>${producto}</div>` : ''}
    <div class="row"><span>Venta:</span><span>${ventaNumero||'N/A'}</span></div>
    <div class="row"><span>Cobrador:</span><span>${nombreCobrador||''}</span></div>
    <div class="row"><span>Pago:</span><span>${metodo ? metodo.charAt(0).toUpperCase()+metodo.slice(1) : ''}</span></div>
    <div class="div"></div>
    <div class="row tot"><span class="b">Abona:</span><span class="b">$${Number(monto).toFixed(2)}</span></div>
    <div class="div"></div>
    ${proxFmt ? `<div class="row"><span>Próx. visita:</span><span>${proxFmt}</span></div><div class="div"></div>` : ''}
    <div class="c">Gracias por su pago</div>
  </body></html>`;
};

const abrirWhatsApp = async (telefono, mensaje) => {
  const num = (telefono || '').replace(/\D/g, '');
  if (!num) { Alert.alert('Sin teléfono', 'El cliente no tiene número registrado.'); return; }
  const numero = num.startsWith('503') ? num : `503${num}`;
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
  const puede = await Linking.canOpenURL(url);
  if (puede) { await Linking.openURL(url); }
  else { Alert.alert('WhatsApp no disponible', 'No se encontró WhatsApp en este dispositivo.'); }
};

const mensajeCobro = (item) => {
  const fechaFmt = new Date(item.fecha).toLocaleDateString('es-SV');
  const proxFmt = item.proximaVisita
    ? new Date(item.proximaVisita + 'T12:00:00').toLocaleDateString('es-SV', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';
  return `🏪 *DISTRIBUIDORA BM*
📋 *RECIBO DE COBRO*
━━━━━━━━━━━━━━━━━━━━
🧾 Recibo: ${item.numeroRecibo || 'N/A'}
📅 Fecha: ${fechaFmt}
📞 Teléfono: 6047-9762
👤 Cliente: ${item.clienteNombre}${item.clienteCodigo ? ` (Código: ${item.clienteCodigo})` : ''}
🔖 Venta: ${item.ventaNumero || 'N/A'}${item.producto ? `\n📦 Producto: ${item.producto}` : ''}
💳 Método: ${item.metodo}

💰 *Monto abonado: ${fmt(item.monto)}*
${proxFmt ? `\n📅 *Próxima visita: ${proxFmt}*` : ''}
━━━━━━━━━━━━━━━━━━━━
¡Gracias por su pago! 🙏`;
};

const mensajeVisita = (item) => {
  const info = VISITA_INFO[item.resultadoVisita] || { label: item.resultadoVisita, icon: '📍' };
  const fechaFmt = new Date(item.fecha).toLocaleDateString('es-SV');
  const horaFmt = new Date(item.fecha).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `🏪 *DISTRIBUIDORA BM*
📋 *REGISTRO DE VISITA*
━━━━━━━━━━━━━━━━━━━━
📅 Fecha: ${fechaFmt} ${horaFmt}
👤 Cliente: ${item.clienteNombre}
${info.icon} Resultado: ${info.label}
${item.observaciones ? `📝 Obs: ${item.observaciones}` : ''}
━━━━━━━━━━━━━━━━━━━━
_Distribuidora BM_`;
};

export default function HistorialDiaScreen({ navigation }) {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [esCache,  setEsCache]  = useState(false);
  const { isOnline } = useConnectivity();
  const { user } = useAuth();
  const nombreCobrador = user?.name || user?.full_name || user?.nombre || user?.usuario || 'Cobrador';

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);

      // Fuente principal: servidor (sobrevive logout, cambio de teléfono,
      // etc.) — trae pagos Y visitas mezclados, ya ordenados por hora.
      // La caché local solo se usa como respaldo cuando no hay conexión.
      if (isOnline) {
        try {
          const { data } = await api.get('/cobros/historial'); // sin ?fecha= = hoy
          const deServidor = (data.items || []).map(normalizarItemServidor(data.fecha));
          setItems(deServidor);
          setEsCache(false);
          setLoading(false);
          return;
        } catch {
          // Si falla la petición (ej. endpoint caído), cae al local
        }
      }

      const todos = await leerHistorial();
      const fechaHoy = hoy();
      // Filtrar solo los del día de hoy (en hora de El Salvador, no UTC)
      const deHoy = todos.filter(h => fechaLocalDesdeISO(h.fecha) === fechaHoy);
      setItems(deHoy);
      setEsCache(true);
      setLoading(false);
    })();
  }, [isOnline]));

  const cobros  = items.filter(h => h.tipo === 'pago');
  const visitas = items.filter(h => h.tipo === 'visita');
  const gastos  = items.filter(h => h.tipo === 'gasto');
  const totalCobrado = cobros.reduce((s, h) => s + Number(h.monto || 0), 0);
  const totalGastado = gastos.filter(h => h.descuentaCobroDiario).reduce((s, h) => s + Number(h.monto || 0), 0);

  const imprimir = async (item) => {
    try {
      const html = buildReciboHtml({ ...item, nombreCobrador });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      try {
        await Print.printAsync({ uri });
      } catch (printError) {
        const msg = String(printError?.message || '');
        if (msg.includes('not available') || msg.includes('unavailable')) {
          const puedeCompartir = await Sharing.isAvailableAsync();
          if (puedeCompartir) {
            await Sharing.shareAsync(uri, {
              mimeType: 'application/pdf',
              dialogTitle: 'Recibo de cobro',
              UTI: 'com.adobe.pdf',
            });
          }
        } else if (!msg.includes('cancel') && !msg.includes('canceled')) {
          throw printError;
        }
      }
    } catch (e) {
      const msg = String(e?.message || '');
      if (!msg.includes('cancel') && !msg.includes('canceled')) {
        Alert.alert('Error', 'No se pudo imprimir');
      }
    }
  };

  const ESTADO_GASTO = {
    pendiente: { label: 'Pendiente', color: '#e65100' },
    aprobado:  { label: 'Aprobado',  color: '#2e7d32' },
    rechazado: { label: 'Rechazado', color: '#c62828' },
  };

  const renderItem = ({ item, index }) => {
    if (item.tipo === 'gasto') {
      const est = ESTADO_GASTO[item.estadoGasto] || { label: item.estadoGasto, color: '#666' };
      return (
        <TouchableOpacity style={s.card} onPress={() => setSelected(item)} activeOpacity={0.7}>
          <View style={[s.cardLeft, { backgroundColor: '#fff3e0' }]}>
            <Text style={{ fontSize: 18 }}>🧾</Text>
          </View>
          <View style={s.cardBody}>
            <View style={s.cardRow}>
              <Text style={s.cardNombre} numberOfLines={1}>{item.clienteNombre}</Text>
              <Text style={[s.cardMonto, { color: '#e65100' }]}>-{fmt(item.monto)}</Text>
            </View>
            <View style={s.cardRow}>
              <Text style={s.cardMeta} numberOfLines={1}>
                {item.categoriaVehiculo || item.tipoGasto} · <Text style={{ color: est.color, fontWeight: '700' }}>{est.label}</Text>
              </Text>
              <Text style={s.cardHora}>{hora(item.fecha)}</Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    }
    if (item.tipo === 'visita') {
      const v = VISITA_INFO[item.resultadoVisita] || { label: item.resultadoVisita, icon: '📍', color: '#666', bg: '#f5f5f5' };
      return (
        <TouchableOpacity style={s.card} onPress={() => setSelected(item)} activeOpacity={0.7}>
          <View style={[s.cardLeft, { backgroundColor: v.bg }]}>
            <Text style={{ fontSize: 18 }}>{v.icon}</Text>
          </View>
          <View style={s.cardBody}>
            <View style={s.cardRow}>
              <Text style={s.cardNombre} numberOfLines={1}>{item.clienteNombre}</Text>
              <Text style={[s.cardMonto, { color: v.color, fontSize: 13 }]}>{v.label}</Text>
            </View>
            <View style={s.cardRow}>
              <Text style={s.cardMeta} numberOfLines={1}>{item.observaciones || 'Sin observaciones'}</Text>
              <Text style={s.cardHora}>{hora(item.fecha)}</Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity style={s.card} onPress={() => setSelected(item)} activeOpacity={0.7}>
        <View style={s.cardLeft}>
          <Text style={s.cardNum}>#{index + 1}</Text>
        </View>
        <View style={s.cardBody}>
          <View style={s.cardRow}>
            <Text style={s.cardNombre} numberOfLines={1}>{item.clienteNombre}</Text>
            <Text style={s.cardMonto}>{fmt(item.monto)}</Text>
          </View>
          <View style={s.cardRow}>
            <Text style={s.cardMeta}>
              {METODO_ICON[item.metodo] || '💳'} {item.metodo}
              {item.ventaNumero ? `  ·  ${item.ventaNumero}` : ''}
            </Text>
            <Text style={s.cardHora}>{hora(item.fecha)}</Text>
          </View>
          {item.proximaVisita ? (
            <Text style={s.cardProxima}>📅 Próx. visita: {fmtFecha(item.proximaVisita)}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0"/>

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>Historial del día</Text>
          <Text style={s.headerSub}>
            {cobros.length} cobro{cobros.length !== 1 ? 's' : ''}
            {visitas.length > 0 ? `  ·  ${visitas.length} visita${visitas.length !== 1 ? 's' : ''}` : ''}
            {gastos.length > 0 ? `  ·  ${gastos.length} gasto${gastos.length !== 1 ? 's' : ''}` : ''}
          </Text>
        </View>
      </View>

      {esCache && !loading && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>📴 Sin conexión — mostrando historial guardado en este teléfono</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color="#1565C0" style={{ marginTop: 40 }}/>
      ) : items.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📋</Text>
          <Text style={s.emptyTxt}>Sin cobros registrados hoy</Text>
        </View>
      ) : (<>
        {items.length > 0 && (
          <>
            <View style={s.totalRow}>
              <View style={s.totalCard}>
                <Text style={s.totalLabel}>Cobrado hoy</Text>
                <Text style={s.totalValor}>{fmt(totalCobrado)}</Text>
              </View>
              {gastos.length > 0 && (
                <View style={[s.totalCard, { backgroundColor: '#e65100' }]}>
                  <Text style={s.totalLabel}>Gastado hoy</Text>
                  <Text style={s.totalValor}>{fmt(totalGastado)}</Text>
                </View>
              )}
            </View>
            {gastos.length > 0 && (
              <View style={s.entregaCard}>
                <Text style={s.entregaLabel}>💵 Efectivo a entregar</Text>
                <Text style={s.entregaValor}>{fmt(totalCobrado - totalGastado)}</Text>
              </View>
            )}
          </>
        )}
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      </>)}

      {/* Modal detalle */}
      {selected && (
        <Modal visible animationType="slide" transparent onRequestClose={() => setSelected(null)}>
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>
                  {selected.tipo === 'visita' ? 'Detalle de la visita' : selected.tipo === 'gasto' ? 'Detalle del gasto' : 'Detalle del cobro'}
                </Text>
                <TouchableOpacity onPress={() => setSelected(null)} style={s.modalClose}>
                  <Text style={s.modalCloseTxt}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                <View style={s.modalSection}>
                  {selected.tipo !== 'gasto' && (
                    <View style={s.modalRow}>
                      <Text style={s.modalLabel}>Cliente</Text>
                      <Text style={s.modalValue}>{selected.clienteNombre}{selected.clienteCodigo ? ` (${selected.clienteCodigo})` : ''}</Text>
                    </View>
                  )}

                  {selected.tipo === 'visita' ? (
                    <>
                      <View style={s.modalRow}>
                        <Text style={s.modalLabel}>Resultado</Text>
                        <Text style={[s.modalValue, { color: (VISITA_INFO[selected.resultadoVisita]||{}).color || '#666', fontWeight: '800' }]}>
                          {(VISITA_INFO[selected.resultadoVisita]||{}).icon} {(VISITA_INFO[selected.resultadoVisita]||{}).label || selected.resultadoVisita}
                        </Text>
                      </View>
                      <View style={s.modalRow}>
                        <Text style={s.modalLabel}>Observaciones</Text>
                        <Text style={[s.modalValue, { flex: 1, textAlign: 'right' }]}>{selected.observaciones || '—'}</Text>
                      </View>
                    </>
                  ) : selected.tipo === 'gasto' ? (
                    <>
                      <View style={s.modalRow}>
                        <Text style={s.modalLabel}>Monto</Text>
                        <Text style={[s.modalValue, {color:'#e65100',fontWeight:'800'}]}>{fmt(selected.monto)}</Text>
                      </View>
                      <View style={s.modalRow}>
                        <Text style={s.modalLabel}>Tipo</Text>
                        <Text style={s.modalValue}>{selected.tipoGasto === 'vehiculo' ? `🏍️ ${selected.clienteNombre}` : '🧾 Consumo'}</Text>
                      </View>
                      {selected.categoriaVehiculo && (
                        <View style={s.modalRow}>
                          <Text style={s.modalLabel}>Categoría</Text>
                          <Text style={s.modalValue}>{selected.categoriaVehiculo}</Text>
                        </View>
                      )}
                      <View style={s.modalRow}>
                        <Text style={s.modalLabel}>Estado</Text>
                        <Text style={[s.modalValue, { color: (ESTADO_GASTO[selected.estadoGasto]||{}).color || '#666', fontWeight: '800' }]}>
                          {(ESTADO_GASTO[selected.estadoGasto]||{}).label || selected.estadoGasto}
                        </Text>
                      </View>
                      {selected.observaciones && (
                        <View style={s.modalRow}>
                          <Text style={s.modalLabel}>Descripción</Text>
                          <Text style={[s.modalValue, { flex: 1, textAlign: 'right' }]}>{selected.observaciones}</Text>
                        </View>
                      )}
                    </>
                  ) : (
                    <>
                      <View style={s.modalRow}>
                        <Text style={s.modalLabel}>Monto</Text>
                        <Text style={[s.modalValue, {color:'#2e7d32',fontWeight:'800'}]}>{fmt(selected.monto)}</Text>
                      </View>
                      <View style={s.modalRow}>
                        <Text style={s.modalLabel}>Método</Text>
                        <Text style={s.modalValue}>{(METODO_ICON[selected.metodo] || '💳')} {selected.metodo}</Text>
                      </View>
                      {selected.numeroRecibo && (
                        <View style={s.modalRow}>
                          <Text style={s.modalLabel}>Recibo</Text>
                          <Text style={s.modalValue}>{selected.numeroRecibo}</Text>
                        </View>
                      )}
                      {selected.ventaNumero && (
                        <View style={s.modalRow}>
                          <Text style={s.modalLabel}>Venta</Text>
                          <Text style={s.modalValue}>{selected.ventaNumero}</Text>
                        </View>
                      )}
                      {selected.producto && (
                        <View style={s.modalRow}>
                          <Text style={s.modalLabel}>Producto</Text>
                          <Text style={s.modalValue}>{selected.producto}</Text>
                        </View>
                      )}
                    </>
                  )}

                  <View style={s.modalRow}>
                    <Text style={s.modalLabel}>Fecha & Hora</Text>
                    <Text style={s.modalValue}>{fmtFechaHora(selected.fecha)} {hora(selected.fecha)}</Text>
                  </View>
                  {selected.proximaVisita && (
                    <View style={s.modalRow}>
                      <Text style={s.modalLabel}>Próxima visita</Text>
                      <Text style={[s.modalValue, {color:'#1565C0'}]}>{fmtFecha(selected.proximaVisita)}</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
              <View style={s.modalBtns}>
                {selected.tipo === 'pago' && (
                  <TouchableOpacity style={s.btnImprimir} onPress={() => { imprimir(selected); setSelected(null); }}>
                    <Text style={s.btnImprimirTxt}>🖨️  Reimprimir</Text>
                  </TouchableOpacity>
                )}
                {selected.tipo !== 'gasto' && (
                  <TouchableOpacity
                    style={s.btnWhatsapp}
                    onPress={() => {
                      const msg = selected.tipo === 'visita' ? mensajeVisita(selected) : mensajeCobro(selected);
                      abrirWhatsApp(selected.clienteWhatsapp, msg);
                    }}
                  >
                    <Text style={s.btnWhatsappTxt}>💬  Enviar por WhatsApp</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={s.btnSecondary} onPress={() => setSelected(null)}>
                  <Text style={s.btnSecondaryTxt}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    backgroundColor: '#1565C0',
    paddingTop: (StatusBar.currentHeight || 0) + 10,
    paddingBottom: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn:     { paddingRight: 4 },
  backTxt:     { color: '#fff', fontSize: 24, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSub:   { color: 'rgba(255,255,255,0.75)', fontSize: 13 },

  offlineBanner:{ backgroundColor: '#fff3cd', margin: 12, borderRadius: 10, padding: 10 },
  offlineTxt:   { color: '#856404', fontSize: 12, fontWeight: '600', textAlign: 'center' },

  totalRow: { flexDirection: 'row', marginHorizontal: 12, marginTop: 12, gap: 8 },
  totalCard: {
    flex: 1, backgroundColor: '#1565C0',
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16,
    opacity: 0.9,
  },
  totalLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },
  totalValor: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 2 },

  entregaCard: {
    backgroundColor: '#2e7d32', marginHorizontal: 12, marginTop: 8,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  entregaLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },
  entregaValor: { color: '#fff', fontSize: 20, fontWeight: '900' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 10,
    flexDirection: 'row', overflow: 'hidden', elevation: 2,
  },
  cardLeft: {
    backgroundColor: '#e3f2fd', width: 42,
    alignItems: 'center', justifyContent: 'center',
  },
  cardNum:  { color: '#1565C0', fontWeight: '800', fontSize: 13 },
  cardBody: { flex: 1, padding: 12 },
  cardRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  cardNombre:{ color: '#1a1a1a', fontWeight: '700', fontSize: 15, flex: 1, marginRight: 8 },
  cardMonto: { color: '#2e7d32', fontWeight: '900', fontSize: 16 },
  cardMeta:  { color: '#666', fontSize: 12 },
  cardHora:  { color: '#999', fontSize: 12 },
  cardProxima:{ color: '#1565C0', fontSize: 12, marginTop: 4 },

  empty:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon:{ fontSize: 48, marginBottom: 12 },
  emptyTxt: { color: '#888', fontSize: 16 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#fff', maxHeight: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 20, elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  modalTitle: { color: '#1a1a1a', fontSize: 16, fontWeight: '800' },
  modalClose: { padding: 8 },
  modalCloseTxt: { color: '#999', fontSize: 20, fontWeight: '700' },

  modalSection: { padding: 20 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  modalLabel: { color: '#666', fontSize: 13, fontWeight: '600' },
  modalValue: { color: '#1a1a1a', fontSize: 13, fontWeight: '600' },

  modalBtns: { paddingHorizontal: 20, gap: 10 },
  btnImprimir: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#1565C0' },
  btnImprimirTxt: { color: '#1565C0', fontWeight: '700', fontSize: 14 },
  btnWhatsapp: { backgroundColor: '#25D366', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnWhatsappTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnSecondary: { backgroundColor: '#f5f6fa', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnSecondaryTxt: { color: '#666', fontWeight: '700', fontSize: 14 },
});
