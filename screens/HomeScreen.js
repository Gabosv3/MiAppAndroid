import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, Image, ActivityIndicator,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useConnectivity } from '../services/connectivity';
import * as offlineQueue from '../services/offlineQueue';
import CustomDrawer from '../navigation/CustomDrawerContent';
import Constants from 'expo-constants';
import { verificarActualizacion, versionActual } from '../services/updateChecker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

const fechaHoy = () => {
  const hoy = new Date();
  return `${DIAS[hoy.getDay()]}, ${hoy.getDate()} de ${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`;
};

export default function HomeScreen({ navigation }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [buscandoUpdate, setBuscandoUpdate] = useState(false);
  const [descargandoPct, setDescargandoPct] = useState(null); // null = no descargando, 0-100 = progreso
  const syncing = useRef(false);
  const insets = useSafeAreaInsets();

  // Auto-sync silencioso: cada vez que vuelve la conexión, envía la cola pendiente
  useEffect(() => {
    if (!isOnline || syncing.current) return;
    (async () => {
      syncing.current = true;
      try {
        const count = await offlineQueue.getQueueCount();
        if (count > 0) await offlineQueue.syncQueue();
      } catch (_) {}
      syncing.current = false;
    })();
  }, [isOnline]);

  const s = styles(colors);

  const esVendedor = !!user?.perfil?.es_vendedor;
  const esCobrador = !!user?.perfil?.es_cobrador;
  const esSupervisor = !!user?.perfil?.es_supervisor;

  // Módulos principales: el rol del usuario decide cuál va primero.
  const modVenta = { key: 'venta', screen: 'NuevaVenta', color: '#F5A623', icon: '🛒', label: 'Nueva Venta', desc: 'Punto de venta · Registro de ventas' };
  const modCobros = { key: 'cobros', screen: 'Cobros', color: '#1565C0', icon: '💰', label: 'Cobros del día', desc: 'Rutas · Registrar pagos' };
  const modReintegros = { key: 'reintegros', screen: 'Reintegros', color: '#B71C1C', icon: '📦', label: 'Reintegros', desc: 'Recuperación de productos' };
  const modSupervision = { key: 'supervision', screen: 'RutasSupervisadas', color: '#5E35B1', icon: '🕵️', label: 'Rutas que superviso', desc: 'Historial, evaluación y desempeño' };

  const modulosPrincipales = [];
  if (esSupervisor) modulosPrincipales.push(modSupervision);
  if (esCobrador) modulosPrincipales.push(modCobros);
  if (esVendedor) modulosPrincipales.push(modVenta);
  if (!esVendedor) modulosPrincipales.push(modVenta);
  if (!esCobrador) modulosPrincipales.push(modCobros);
  modulosPrincipales.push(modReintegros);
  // Quita duplicados manteniendo el primer orden (rol primero).
  const vistos = new Set();
  const modulosOrdenados = modulosPrincipales.filter((m) => (vistos.has(m.key) ? false : (vistos.add(m.key), true)));

  const gruposAccesos = [
    esSupervisor && {
      titulo: '🕵️ Supervisión',
      items: [
        { key: 'desempeno-cobradores', screen: 'DesempenoCobradores', icon: '👥', tint: '#5E35B112', label: 'Desempeño cobradores', desc: 'Ruta bajo mi cargo' },
      ],
    },
    {
      titulo: '👤 Clientes',
      items: [
        { key: 'crear-cliente', screen: 'CrearCliente', icon: '👤', tint: '#F5A62312', label: 'Crear cliente', desc: 'Registrar nuevo' },
        { key: 'mapa-ruta', screen: 'Cobros', icon: '🗺️', tint: '#1565C012', label: 'Mapa de ruta', desc: 'Ver clientes' },
        { key: 'directorio', screen: 'DirectorioClientes', icon: '📖', tint: '#00897B12', label: 'Enciclopedia', desc: 'Directorio de clientes' },
        { key: 'preventas', screen: 'MisPreventas', icon: '📝', tint: '#F5A62312', label: 'Preventas', desc: 'Registrar interés de compra' },
      ],
    },
    {
      titulo: '📊 Mi trabajo',
      items: [
        { key: 'mi-desempeno', screen: 'MiDesempeno', icon: '📈', tint: '#1565C012', label: 'Mi desempeño', desc: 'Cobrado, mora y ruta de hoy' },
        { key: 'reporte-diario', screen: 'ReporteDiario', icon: '📄', tint: '#00897B12', label: 'Reporte diario', desc: 'Carta formal de cierre' },
        { key: 'mis-vales', screen: 'MisVales', icon: '📋', tint: '#B71C1C12', label: 'Mis vales', desc: 'Ver estado' },
        { key: 'registrar-gasto', screen: 'RegistrarGasto', icon: '🧾', tint: '#B71C1C12', label: 'Registrar gasto', desc: 'Vale de consumo/vehículo' },
      ],
    },
    {
      titulo: '🤖 Soporte',
      items: [
        { key: 'ayuda', screen: 'Ayuda', icon: '🤖', tint: '#5E35B112', label: 'Ayuda', desc: 'Guía paso a paso, sin conexión' },
      ],
    },
  ].filter(Boolean);

  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.headerBg} />

      {/* App Bar */}
      <View style={[s.appBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => setDrawerOpen(true)}
          style={s.menuBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={s.hamburger}>
            <View style={[s.bar, { width: 22 }]} />
            <View style={[s.bar, { width: 16 }]} />
            <View style={[s.bar, { width: 20 }]} />
          </View>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image
            source={require('../assets/img/logo.png')}
            style={{ width: 38, height: 38, resizeMode: 'contain' }}
          />
          <View>
            <Text style={s.appBarTitle}>SIDB</Text>
            <Text style={s.appBarSub}>Distribuidora BM</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[s.statusDot, { backgroundColor: isOnline ? '#10B981' : '#e53e3e' }]} />
          <View style={s.avatar}>
            <Text style={s.avatarText}>
              {(user?.name || user?.nombre || 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Saludo */}
        <View style={s.greetingCard}>
          <View style={s.greetingRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.greetingLabel}>Bienvenido,</Text>
              <Text style={s.greetingName}>
                {user?.name || user?.nombre || 'Usuario'}
              </Text>
            </View>
            <Text style={{ fontSize: 36 }}>👋</Text>
          </View>
          <View style={s.greetingDivider} />
          <Text style={s.greetingDate}>{fechaHoy()}</Text>
          {user?.sucursales?.[0] && (
            <Text style={s.sucursalBadge}>📍 {user.sucursales[0].nombre}</Text>
          )}
          <View style={s.conexionRow}>
            <View style={[s.statusDot, { backgroundColor: isOnline ? '#10B981' : '#e53e3e' }]} />
            <Text style={[s.conexionTxt, { color: isOnline ? '#10B981' : '#e53e3e' }]}>
              {isOnline ? 'Conectado al servidor' : 'Sin conexión'}
            </Text>
          </View>

          {/* Versión y botón de actualización */}
          <View style={s.versionRow}>
            <TouchableOpacity onPress={() => navigation.navigate('Diagnostico')} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Text style={s.versionTxt}>v{versionActual()} (build {Constants.expoConfig?.android?.versionCode ?? '?'}) · 🔧</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.updateBtn, buscandoUpdate && s.updateBtnDisabled]}
              disabled={buscandoUpdate}
              onPress={async () => {
                setBuscandoUpdate(true);
                await verificarActualizacion({ manual: true, onDescargando: setDescargandoPct });
                setBuscandoUpdate(false);
              }}
            >
              {descargandoPct !== null
                ? <Text style={s.updateBtnTxt}>⬇️ Descargando... {descargandoPct}%</Text>
                : buscandoUpdate
                  ? <ActivityIndicator size="small" color="#F5A623" />
                  : <Text style={s.updateBtnTxt}>🔄 Buscar actualización</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* Módulos principales — orden priorizado según el rol del usuario */}
        <Text style={s.sectionTitle}>Módulos principales</Text>

        {modulosOrdenados.map((m, i) => (
          <TouchableOpacity
            key={m.key}
            style={[s.mainBtn, { backgroundColor: m.color, marginTop: i === 0 ? 0 : 10 }]}
            onPress={() => navigation.navigate(m.screen)}
            activeOpacity={0.85}
          >
            <View style={s.mainBtnIconWrap}>
              <Text style={s.mainBtnIcon}>{m.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.mainBtnLabel}>{m.label}</Text>
              <Text style={s.mainBtnDesc}>{m.desc}</Text>
            </View>
            <Text style={s.mainBtnArrow}>→</Text>
          </TouchableOpacity>
        ))}

        {/* Accesos rápidos, agrupados por tema */}
        {gruposAccesos.map((grupo) => (
          <View key={grupo.titulo}>
            <Text style={[s.sectionTitle, { marginTop: 28 }]}>{grupo.titulo}</Text>
            <View style={s.quickGrid}>
              {grupo.items.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={s.quickCard}
                  onPress={() => navigation.navigate(item.screen)}
                  activeOpacity={0.85}
                >
                  <View style={[s.quickIconWrap, { backgroundColor: item.tint }]}>
                    <Text style={s.quickIcon}>{item.icon}</Text>
                  </View>
                  <Text style={s.quickTitle}>{item.label}</Text>
                  <Text style={s.quickSub}>{item.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>

      {drawerOpen && (
        <CustomDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} navigation={navigation} />
      )}
    </View>
  );
}

const styles = (c) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },

  appBar: {
    backgroundColor: c.headerBg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 32, // paddingTop real (insets.top) se aplica inline en el render
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  menuBtn:    { padding: 4 },
  hamburger:  { gap: 5 },
  bar:        { height: 2, backgroundColor: c.text, borderRadius: 1 },
  appBarTitle:{ color: c.text, fontSize: 17, fontWeight: '800' },
  appBarSub:  { color: c.textMuted, fontSize: 10, marginTop: -2 },

  statusDot:  { width: 10, height: 10, borderRadius: 5 },
  avatar:     { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F5A623', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#000', fontWeight: '800', fontSize: 14 },

  scroll:        { flex: 1 },
  scrollContent: { padding: 16 },

  greetingCard: {
    backgroundColor: '#0d0d0d',
    borderRadius: 18,
    padding: 20,
    marginBottom: 26,
    borderWidth: 1,
    borderColor: '#1c1c1c',
  },
  greetingRow:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  greetingLabel:  { color: '#888', fontSize: 13, marginBottom: 4 },
  greetingName:   { color: '#fff', fontSize: 24, fontWeight: '800' },
  greetingDivider:{ height: 1, backgroundColor: '#1c1c1c', marginBottom: 12 },
  greetingDate:   { color: '#666', fontSize: 12, textTransform: 'capitalize', marginBottom: 12 },
  sucursalBadge:  {
    color: '#F5A623', fontSize: 12, fontWeight: '600',
    backgroundColor: '#F5A62312', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, alignSelf: 'flex-start', marginBottom: 12,
  },
  conexionRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  conexionTxt:    { fontSize: 12, fontWeight: '600' },
  versionRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1c1c1c' },
  versionTxt:     { color: '#555', fontSize: 11 },
  updateBtn:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#333', minWidth: 44, minHeight: 30, justifyContent: 'center' },
  updateBtnDisabled: { opacity: 0.5 },
  updateBtnTxt:   { color: '#F5A623', fontSize: 12, fontWeight: '600' },

  sectionTitle: {
    color: c.textSec,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 14,
  },

  mainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 18,
    gap: 14,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  mainBtnIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  mainBtnIcon:  { fontSize: 26 },
  mainBtnLabel: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 2 },
  mainBtnDesc:  { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  mainBtnArrow: { color: '#fff', fontSize: 20, fontWeight: '700' },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quickCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: 16,
    minHeight: 116,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: c.border,
    elevation: 2,
  },
  quickIconWrap: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  quickIcon:  { fontSize: 20 },
  quickTitle: { color: c.text, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  quickSub:   { color: c.textMuted, fontSize: 11 },
});
