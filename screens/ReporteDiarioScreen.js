import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api from '../services/api';
import { useConnectivity } from '../services/connectivity';
import { useAuth } from '../context/AuthContext';
import { leerRutaCache, leerHistorial } from '../services/cobrosOffline';
import { fechaHoyLocal, fechaLocalDesdeISO, fmtFechaCorta } from '../services/dateUtils';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
const DUI_STORAGE_KEY = 'COBRADOR_DUI_GUARDADO';

const NO_PAGO = new Set(['no_encontrado', 'sin_pago', 'rechazo']);
const PAGO_INDIRECTO = new Set(['abono_previo']); // ya abonó por otra vía — cuenta como pagó
const SIN_SALDO = new Set(['sin_saldo']); // cuenta vinculada que ya estaba en $0 — no es "pagó" ni "no pagó"

export default function ReporteDiarioScreen({ navigation }) {
  const { isOnline } = useConnectivity();
  const { user } = useAuth();
  const nombreCobrador = user?.name || user?.full_name || user?.nombre || user?.usuario || 'Cobrador';

  const [cargando, setCargando] = useState(true);
  const [dui, setDui] = useState('');
  const [rutaNombre, setRutaNombre] = useState('');
  const [totalClientes, setTotalClientes] = useState(0);
  const [pagaron, setPagaron] = useState(0);
  const [noPagaron, setNoPagaron] = useState(0);
  const [sinSaldo, setSinSaldo] = useState(0);
  const [cancelaron, setCancelaron] = useState('0');
  const [aRecoger, setARecoger] = useState('0');
  const [totalCobrado, setTotalCobrado] = useState(0);
  const [generando, setGenerando] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      setCargando(true);
      const duiGuardado = await AsyncStorage.getItem(DUI_STORAGE_KEY);
      if (duiGuardado) setDui(duiGuardado);

      // Ruta de hoy — de dónde sale el "cuántas cuentas llevaba al inicio"
      const cache = await leerRutaCache();
      if (cache?.esDeHoy) {
        const rutas = cache.data?.rutas || [];
        setRutaNombre(rutas.map(r => r.nombre).join(', '));
        setTotalClientes(rutas.reduce((s, r) => s + (r.clientes || []).length, 0));
      }

      // Gestiones de hoy — servidor primero (más completo), caché local de respaldo
      let items = [];
      if (isOnline) {
        try {
          const { data } = await api.get('/cobros/historial');
          items = (data.items || []).map(it => ({
            tipo: it.tipo,
            clienteId: it.cliente?.id,
            monto: it.monto || 0,
            resultado: it.resultado || null,
          }));
        } catch { /* cae al local */ }
      }
      if (items.length === 0) {
        const todos = await leerHistorial();
        const hoy = fechaHoyLocal();
        items = todos
          .filter(h => fechaLocalDesdeISO(h.fecha) === hoy)
          .map(h => ({ tipo: h.tipo, clienteId: h.clienteId, monto: h.monto || 0, resultado: h.resultadoVisita || null }));
      }

      const idsPagaron = new Set(
        items.filter(i => i.tipo === 'pago' || PAGO_INDIRECTO.has(i.resultado)).map(i => i.clienteId)
      );
      const idsSinSaldo = new Set(
        items.filter(i => i.tipo === 'visita' && SIN_SALDO.has(i.resultado) && !idsPagaron.has(i.clienteId)).map(i => i.clienteId)
      );
      const idsNoPagaron = new Set(
        items
          .filter(i => i.tipo === 'visita' && NO_PAGO.has(i.resultado) && !idsPagaron.has(i.clienteId) && !idsSinSaldo.has(i.clienteId))
          .map(i => i.clienteId)
      );
      setPagaron(idsPagaron.size);
      setNoPagaron(idsNoPagaron.size);
      setSinSaldo(idsSinSaldo.size);
      setTotalCobrado(items.filter(i => i.tipo === 'pago').reduce((s, i) => s + Number(i.monto || 0), 0));

      setCargando(false);
    })();
  }, [isOnline]));

  const guardarDui = async (valor) => {
    setDui(valor);
    await AsyncStorage.setItem(DUI_STORAGE_KEY, valor);
  };

  const generarReporte = async () => {
    if (!dui.trim()) {
      Alert.alert('Falta el DUI', 'Ingresa tu número de DUI para generar el reporte.');
      return;
    }
    if (!rutaNombre.trim()) {
      Alert.alert('Falta la ruta', 'No se detectó la ruta visitada hoy. Verifica que tengas la ruta cargada.');
      return;
    }
    setGenerando(true);
    try {
      const fecha = fmtFechaCorta(new Date());
      const cancelaronNum = parseInt(cancelaron, 10) || 0;
      const aRecogerNum = parseInt(aRecoger, 10) || 0;

      const html = `<html><head>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <style>
          *{box-sizing:border-box}
          body{font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.7;padding:40px 50px}
          .centro{text-align:center}
          .titulo{font-size:16px;font-weight:800;text-transform:uppercase;margin-bottom:30px}
          .parrafo{text-align:justify;margin-bottom:20px}
          .b{font-weight:700}
          table{width:100%;border-collapse:collapse;margin:20px 0}
          td,th{border:1px solid #999;padding:8px 10px;font-size:13px}
          th{background:#f0f0f0;text-align:left}
          .firma{margin-top:70px}
          .linea-firma{border-top:1px solid #333;width:260px;margin:0 auto;padding-top:6px;text-align:center;font-size:13px}
        </style>
      </head><body>
        <div class="centro titulo">Reporte diario de cobro</div>

        <div class="parrafo">
          Yo, <span class="b">${nombreCobrador}</span>, con Documento Único de Identidad (DUI) número
          <span class="b">${dui}</span>, hago constar por medio de la presente que el día
          <span class="b">${fecha}</span> visité la ruta <span class="b">${rutaNombre}</span>,
          la cual cuenta con un total de <span class="b">${totalClientes}</span> cliente${totalClientes !== 1 ? 's' : ''} asignados.
        </div>

        <div class="parrafo">
          De los clientes visitados, <span class="b">${pagaron}</span> realizaron su pago correspondiente,
          <span class="b">${noPagaron}</span> no realizaron ningún pago,
          <span class="b">${sinSaldo}</span> cuenta${sinSaldo !== 1 ? 's' : ''} vinculada${sinSaldo !== 1 ? 's' : ''} ya estaba${sinSaldo !== 1 ? 'n' : ''} al día sin nada que cobrar,
          <span class="b">${cancelaronNum}</span> cancelaron su cuenta en su totalidad,
          y <span class="b">${aRecogerNum}</span> cuenta${aRecogerNum !== 1 ? 's' : ''} quedaron pendientes de recuperación de mercadería (recoger).
        </div>

        <table>
          <tr><th>Concepto</th><th>Cantidad</th></tr>
          <tr><td>Total de cuentas en la ruta</td><td>${totalClientes}</td></tr>
          <tr><td>Clientes que pagaron</td><td>${pagaron}</td></tr>
          <tr><td>Clientes que no pagaron</td><td>${noPagaron}</td></tr>
          <tr><td>Cuentas vinculadas ya al día (sin saldo)</td><td>${sinSaldo}</td></tr>
          <tr><td>Cuentas canceladas en su totalidad</td><td>${cancelaronNum}</td></tr>
          <tr><td>Cuentas a recoger</td><td>${aRecogerNum}</td></tr>
        </table>

        <div class="parrafo">
          Dando como resultado un pago total recaudado al final del día de
          <span class="b">${fmt(totalCobrado)}</span>, mismo que hago entrega a la administración de
          Distribuidora BM para su respectivo registro y control.
        </div>

        <div class="parrafo">
          Para que conste, firmo la presente en la fecha antes indicada.
        </div>

        <div class="firma centro">
          <div class="linea-firma">${nombreCobrador}<br/>DUI: ${dui}</div>
        </div>
      </body></html>`;

      // A diferencia de los tickets de cobro (que sí van directo a la
      // impresora térmica), este reporte es un documento tipo carta — se
      // genera como PDF y se comparte/guarda, no se manda a imprimir.
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const puedeCompartir = await Sharing.isAvailableAsync();
      if (puedeCompartir) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Reporte diario de cobro', UTI: 'com.adobe.pdf' });
      } else {
        Alert.alert('PDF generado', `El archivo se guardó en:\n${uri}`);
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo generar el reporte: ' + (e?.message || ''));
    } finally {
      setGenerando(false);
    }
  };

  if (cargando) {
    return (
      <View style={s.center}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <ActivityIndicator size="large" color="#1565C0" />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Reporte diario</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={s.card}>
          <Text style={s.cardTitle}>Tu DUI</Text>
          <TextInput
            style={s.input}
            value={dui}
            onChangeText={guardarDui}
            placeholder="00000000-0"
            placeholderTextColor="#bbb"
          />
          <Text style={s.hint}>Se guarda en este teléfono para que no lo tengas que escribir cada día.</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Ruta visitada hoy</Text>
          <Text style={s.rutaTxt}>{rutaNombre || 'No se detectó ninguna ruta cargada hoy'}</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Resumen del día (automático)</Text>
          <View style={s.filaResumen}><Text style={s.filaLabel}>Total de cuentas en la ruta</Text><Text style={s.filaVal}>{totalClientes}</Text></View>
          <View style={s.filaResumen}><Text style={s.filaLabel}>Pagaron</Text><Text style={[s.filaVal, { color: '#2e7d32' }]}>{pagaron}</Text></View>
          <View style={s.filaResumen}><Text style={s.filaLabel}>No pagaron</Text><Text style={[s.filaVal, { color: '#e53e3e' }]}>{noPagaron}</Text></View>
          <View style={s.filaResumen}><Text style={s.filaLabel}>Sin saldo (cuentas vinculadas al día)</Text><Text style={[s.filaVal, { color: '#00695c' }]}>{sinSaldo}</Text></View>
          <View style={s.filaResumen}><Text style={s.filaLabel}>Total cobrado</Text><Text style={[s.filaVal, { color: '#1565C0' }]}>{fmt(totalCobrado)}</Text></View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Completa manualmente</Text>
          <Text style={s.label}>Cuentas canceladas en su totalidad</Text>
          <TextInput style={s.inputNum} value={cancelaron} onChangeText={setCancelaron} keyboardType="number-pad" />
          <Text style={[s.label, { marginTop: 12 }]}>Cuentas a recoger (mercadería)</Text>
          <TextInput style={s.inputNum} value={aRecoger} onChangeText={setARecoger} keyboardType="number-pad" />
        </View>

        <TouchableOpacity style={[s.btnGenerar, generando && { opacity: 0.6 }]} onPress={generarReporte} disabled={generando}>
          {generando
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnGenerarTxt}>📄 Generar reporte</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f6fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  header: {
    backgroundColor: '#1565C0', flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: (StatusBar.currentHeight || 0) + 8, paddingBottom: 16, paddingHorizontal: 16,
  },
  backBtn: {},
  backArrow: { color: '#fff', fontSize: 24 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#1a1a1a', marginBottom: 10 },
  input: { borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, padding: 12, fontSize: 14, color: '#1a1a1a' },
  inputNum: { borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, padding: 12, fontSize: 14, color: '#1a1a1a', width: 100 },
  hint: { color: '#aaa', fontSize: 11, marginTop: 6 },
  label: { color: '#666', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  rutaTxt: { color: '#333', fontSize: 14, fontWeight: '600' },

  filaResumen: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  filaLabel: { color: '#666', fontSize: 13 },
  filaVal: { color: '#1a1a1a', fontSize: 14, fontWeight: '800' },

  btnGenerar: { backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 16, alignItems: 'center', elevation: 2, marginTop: 4 },
  btnGenerarTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
