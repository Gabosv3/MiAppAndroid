import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { useConnectivity } from '../services/connectivity';
import { leerPagosPendientes, eliminarPago, sincronizarPagosPendientes, leerRutaCache, contarClientesConRespaldo } from '../services/cobrosOffline';
import * as offlineQueue from '../services/offlineQueue';
import * as backupOffline from '../services/backupOffline';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Misma contraseña que ya usan los vendedores para "Configuraciones POS" en
// Nueva Venta — no es para bloquear al dueño de la app, es para que un
// cobrador cualquiera no entre por curiosidad y vea montos/clientes de
// otros compañeros pendientes de enviar.
const DIAG_PASSWORD = '01041998';

const fmtFecha = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
};

export default function DiagnosticoScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isOnline } = useConnectivity();
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState('');

  const [cargando, setCargando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [pagosPend, setPagosPend] = useState([]);
  const [colaGenerica, setColaGenerica] = useState([]);
  const [carpetaConfigurada, setCarpetaConfigurada] = useState(false);
  const [configurandoCarpeta, setConfigurandoCarpeta] = useState(false);
  const [respaldoClientes, setRespaldoClientes] = useState({ conRespaldo: 0, totalRuta: 0 });

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [pagos, cola, hayCarpeta, rutaCache] = await Promise.all([
        leerPagosPendientes(), offlineQueue.getQueue(), backupOffline.hayCarpetaConfigurada(),
        leerRutaCache(),
      ]);
      setPagosPend(pagos);
      setColaGenerica(cola);
      setCarpetaConfigurada(hayCarpeta);
      // Solo los clientes de la ruta de hoy (la caché guarda también los de
      // días anteriores y no deben contar como "cubiertos").
      const idsRuta = [...new Set((rutaCache?.data?.rutas || []).flatMap((r) => (r.clientes || []).map((c) => c.id)))];
      const conRespaldo = await contarClientesConRespaldo(idsRuta);
      setRespaldoClientes({ conRespaldo, totalRuta: idsRuta.length });
    } finally {
      setCargando(false);
    }
  }, []);

  const configurarRespaldo = async () => {
    setConfigurandoCarpeta(true);
    try {
      const resultado = await backupOffline.configurarCarpetaRespaldo();
      if (resultado.ok) {
        setCarpetaConfigurada(true);
        Alert.alert('✅ Respaldo activado', 'De ahora en adelante, cada cobro/venta guardado sin conexión también se anota en un archivo de texto en la carpeta que elegiste — ese archivo sobrevive aunque se desinstale la app.');
      } else {
        Alert.alert('No se pudo activar', resultado.mensaje || 'Intentá de nuevo.');
      }
    } finally {
      setConfigurandoCarpeta(false);
    }
  };

  useFocusEffect(useCallback(() => { if (desbloqueado) cargar(); }, [desbloqueado, cargar]));

  const verificarPassword = () => {
    if (passInput === DIAG_PASSWORD) {
      setDesbloqueado(true);
      setPassError('');
      cargar();
    } else {
      setPassError('Contraseña incorrecta');
    }
  };

  const reintentarTodo = async () => {
    // No se bloquea aquí por isOnline — ese estado puede tardar hasta 15s en
    // refrescarse tras recuperar señal (el ping periódico), y con eso el
    // botón rechazaba el intento con "Sin conexión" aunque el teléfono ya
    // tuviera datos/wifi de verdad. Mejor intentar directo: cada envío ya
    // tiene su propio timeout y si de verdad no hay señal, el resultado
    // simplemente muestra 0 enviados en vez de bloquear sin ni probar.
    setSincronizando(true);
    try {
      const resultado = await sincronizarPagosPendientes(api);
      await offlineQueue.syncQueue();
      await cargar();
      Alert.alert(
        'Sincronización terminada',
        `Cobros: ${resultado.synced}/${resultado.total} enviados.` +
          (resultado.errores?.length ? `\n\n${resultado.errores.length} con error (se eliminaron de la cola):\n` +
            resultado.errores.map(e => `• ${e.cliente}: ${e.error}`).join('\n') : '')
      );
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo sincronizar.');
    } finally {
      setSincronizando(false);
    }
  };

  const quitarPago = (item) => {
    Alert.alert(
      '¿Quitar este cobro de la cola?',
      `${item.clienteNombre} · $${Number(item.monto || 0).toFixed(2)}\n\nEsto NO lo registra en el servidor — solo deja de intentarlo desde este teléfono. Úsalo únicamente si estás seguro de que este cobro ya se registró de otra forma, o si los datos están mal y nunca va a poder enviarse.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Quitar', style: 'destructive', onPress: async () => { await eliminarPago(item.id); cargar(); } },
      ]
    );
  };

  const quitarGenerico = (item) => {
    Alert.alert(
      '¿Quitar este envío de la cola?',
      `${item.label}\n\nEsto NO lo registra en el servidor — solo deja de intentarlo desde este teléfono.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Quitar', style: 'destructive', onPress: async () => { await offlineQueue.removeRequest(item.id); cargar(); } },
      ]
    );
  };

  const s = styles();

  if (!desbloqueado) {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor="#1565C0" />
        <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Diagnóstico</Text>
        </View>
        <View style={s.lockWrap}>
          <Text style={{ fontSize: 44, marginBottom: 12 }}>🔒</Text>
          <Text style={s.lockTitle}>Área restringida</Text>
          <Text style={s.lockSub}>Contraseña de administrador</Text>
          <TextInput
            style={[s.passInput, passError && { borderColor: '#e53e3e' }]}
            value={passInput}
            onChangeText={(t) => { setPassInput(t); setPassError(''); }}
            secureTextEntry
            placeholder="Contraseña"
            placeholderTextColor="#bbb"
            onSubmitEditing={verificarPassword}
            autoFocus
          />
          {!!passError && <Text style={s.lockError}>{passError}</Text>}
          <TouchableOpacity style={s.lockBtn} onPress={verificarPassword}>
            <Text style={s.lockBtnTxt}>Entrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const totalPend = pagosPend.length + colaGenerica.length;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Diagnóstico — Cola pendiente</Text>
      </View>

      {!isOnline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>📴 El teléfono cree que no hay conexión — si ya tienes señal, el botón de abajo igual va a intentar enviarlo</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={undefined}
      >
        {respaldoClientes.totalRuta > 0 && (
          <View style={[
            s.respaldoBox,
            respaldoClientes.conRespaldo < respaldoClientes.totalRuta && s.respaldoBoxAlerta,
          ]}>
            <Text style={s.respaldoTitulo}>📦 Respaldo local de clientes</Text>
            <Text style={s.respaldoTxt}>
              {respaldoClientes.conRespaldo} de {respaldoClientes.totalRuta} clientes de tu ruta de hoy tienen copia guardada en este teléfono.
            </Text>
            {respaldoClientes.conRespaldo < respaldoClientes.totalRuta && (
              <Text style={s.respaldoAlertaTxt}>
                ⚠️ A {respaldoClientes.totalRuta - respaldoClientes.conRespaldo} todavía les falta — abrí la pantalla de Cobros con buena señal para que se completen antes de salir a zonas sin cobertura.
              </Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[s.retryBtn, sincronizando && { opacity: 0.5 }]}
          onPress={reintentarTodo}
          disabled={sincronizando}
        >
          {sincronizando
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.retryBtnTxt}>🔄 Reintentar envío de todo ahora</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.backupBtn, carpetaConfigurada && s.backupBtnOk, configurandoCarpeta && { opacity: 0.5 }]}
          onPress={configurarRespaldo}
          disabled={configurandoCarpeta}
        >
          {configurandoCarpeta
            ? <ActivityIndicator color={carpetaConfigurada ? '#2e7d32' : '#1565C0'} size="small" />
            : <Text style={[s.backupBtnTxt, carpetaConfigurada && { color: '#2e7d32' }]}>
                {carpetaConfigurada ? '✅ Respaldo en texto activado' : '💾 Activar respaldo en texto (recomendado)'}
              </Text>}
        </TouchableOpacity>
        {!carpetaConfigurada && (
          <Text style={s.backupHint}>
            Elegí una carpeta (recomendado: Descargas) donde cada cobro/venta pendiente se anota también en un .txt — ese archivo NO se borra aunque se desinstale la app.
          </Text>
        )}

        <Text style={s.explica}>
          Si un cobro pendiente falla, se detiene el envío de los que están detrás de él en la
          cola (para no enviarlos fuera de orden) — por eso a veces quedan varios "por sync" aunque
          solo uno tenga el problema real. Revisa el primero de la lista; si sigue fallando después
          de reintentar, puede que tenga un dato roto (ej. la venta ya no existe) y haya que quitarlo
          a mano para destrabar a los demás.
        </Text>

        {cargando ? (
          <ActivityIndicator color="#1565C0" style={{ marginTop: 24 }} />
        ) : totalPend === 0 ? (
          <View style={s.vacio}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>✅</Text>
            <Text style={s.vacioTxt}>No hay nada pendiente de enviar.</Text>
          </View>
        ) : (
          <>
            {pagosPend.length > 0 && (
              <>
                <Text style={s.seccionTitulo}>Cobros pendientes ({pagosPend.length})</Text>
                {pagosPend.map((p, idx) => (
                  <View key={p.id} style={s.card}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.cardTitulo}>{idx === 0 ? '① ' : ''}{p.clienteNombre || 'Cliente sin nombre'}</Text>
                        <Text style={s.cardMonto}>${Number(p.monto || 0).toFixed(2)} · {p.metodo || '—'}</Text>
                        <Text style={s.cardMeta}>Venta: {p.ventaNumero || p.ventaId || '—'}</Text>
                        <Text style={s.cardMeta}>Recibo temporal: {p.numeroRecibo || '—'}</Text>
                        <Text style={s.cardMeta}>Guardado: {fmtFecha(p.creadoEn)}</Text>
                        {!!p.referencia && <Text style={s.cardMeta}>Ref: {p.referencia}</Text>}
                        {!!p.notas && <Text style={s.cardMeta}>Notas: {p.notas}</Text>}
                        <Text style={[s.cardMeta, { fontSize: 10, color: '#bbb', marginTop: 4 }]}>ID: {p.id}</Text>
                      </View>
                      <TouchableOpacity style={s.quitarBtn} onPress={() => quitarPago(p)}>
                        <Text style={s.quitarBtnTxt}>Quitar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}

            {colaGenerica.length > 0 && (
              <>
                <Text style={[s.seccionTitulo, { marginTop: 16 }]}>Otros envíos pendientes ({colaGenerica.length})</Text>
                {colaGenerica.map((item) => (
                  <View key={item.id} style={s.card}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.cardTitulo}>{item.label}</Text>
                        <Text style={s.cardMeta}>{item.method} {item.url}</Text>
                        <Text style={s.cardMeta}>Guardado: {fmtFecha(item.createdAt)}</Text>
                        <Text style={[s.cardMeta, { fontSize: 10, color: '#bbb', marginTop: 4 }]}>ID: {item.id}</Text>
                      </View>
                      <TouchableOpacity style={s.quitarBtn} onPress={() => quitarGenerico(item)}>
                        <Text style={s.quitarBtnTxt}>Quitar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = () => StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    backgroundColor: '#1565C0', flexDirection: 'row', alignItems: 'center',
    paddingTop: 32, // paddingTop real (insets.top) se aplica inline en el render
    paddingBottom: 16, paddingHorizontal: 16, gap: 12,
  },
  backBtn:    { paddingRight: 4 },
  backArrow:  { color: '#fff', fontSize: 24 },
  headerTitle:{ color: '#fff', fontSize: 16, fontWeight: '800', flexShrink: 1 },

  offlineBanner: { backgroundColor: '#fff3cd', padding: 10, borderBottomWidth: 1, borderBottomColor: '#ffeaa7' },
  offlineTxt:    { color: '#856404', fontSize: 12, fontWeight: '600', textAlign: 'center' },

  lockWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  lockTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', marginBottom: 4 },
  lockSub:   { fontSize: 13, color: '#888', marginBottom: 18 },
  passInput: {
    width: '100%', borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10,
    padding: 14, fontSize: 16, textAlign: 'center', backgroundColor: '#fff',
  },
  lockError: { color: '#e53e3e', fontSize: 12, marginTop: 8, fontWeight: '600' },
  lockBtn:   { marginTop: 18, backgroundColor: '#1565C0', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 40 },
  lockBtnTxt:{ color: '#fff', fontWeight: '800', fontSize: 15 },

  retryBtn:    { backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  retryBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  respaldoBox:      { backgroundColor: '#e8f5e9', borderWidth: 1.5, borderColor: '#2e7d32', borderRadius: 12, padding: 14, marginBottom: 14 },
  respaldoBoxAlerta:{ backgroundColor: '#fff8e1', borderColor: '#F5A623' },
  respaldoTitulo:   { fontSize: 13, fontWeight: '800', color: '#333', marginBottom: 4 },
  respaldoTxt:      { fontSize: 12, color: '#555' },
  respaldoAlertaTxt:{ fontSize: 11, color: '#8a6100', marginTop: 6, lineHeight: 15 },

  backupBtn:    { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 6 },
  backupBtnOk:  { borderColor: '#2e7d32', backgroundColor: '#2e7d3208' },
  backupBtnTxt: { color: '#1565C0', fontWeight: '800', fontSize: 13 },
  backupHint:   { color: '#999', fontSize: 11, marginBottom: 12, lineHeight: 15 },
  explica:     { color: '#888', fontSize: 12, lineHeight: 17, marginBottom: 16 },

  vacio:    { alignItems: 'center', paddingVertical: 40 },
  vacioTxt: { color: '#888', fontSize: 14 },

  seccionTitulo: { fontSize: 13, fontWeight: '800', color: '#1a1a1a', marginBottom: 8 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#eee', elevation: 1,
  },
  cardTitulo: { fontSize: 14, fontWeight: '800', color: '#1a1a1a' },
  cardMonto:  { fontSize: 15, fontWeight: '800', color: '#2e7d32', marginTop: 2 },
  cardMeta:   { fontSize: 11, color: '#888', marginTop: 2 },

  quitarBtn:    { borderWidth: 1, borderColor: '#e53e3e', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 8 },
  quitarBtnTxt: { color: '#e53e3e', fontWeight: '700', fontSize: 11 },
});
