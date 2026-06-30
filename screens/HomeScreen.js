import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, Image,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useConnectivity } from '../services/connectivity';
import * as offlineQueue from '../services/offlineQueue';
import CustomDrawer from '../navigation/CustomDrawerContent';

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
  const syncing = useRef(false);

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

  return (
    <View style={s.root}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.headerBg} />

      {/* App Bar */}
      <View style={s.appBar}>
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
        </View>

        {/* Módulos principales */}
        <Text style={s.sectionTitle}>Módulos</Text>

        <TouchableOpacity
          style={[s.mainBtn, { backgroundColor: '#F5A623' }]}
          onPress={() => navigation.navigate('NuevaVenta')}
          activeOpacity={0.85}
        >
          <Text style={s.mainBtnIcon}>🛒</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.mainBtnLabel}>Nueva Venta</Text>
            <Text style={s.mainBtnDesc}>Punto de venta · Registro de ventas</Text>
          </View>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.mainBtn, { backgroundColor: '#1565C0', marginTop: 10 }]}
          onPress={() => navigation.navigate('Cobros')}
          activeOpacity={0.85}
        >
          <Text style={s.mainBtnIcon}>💰</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.mainBtnLabel}>Cobros del día</Text>
            <Text style={s.mainBtnDesc}>Rutas · Registrar pagos</Text>
          </View>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.mainBtn, { backgroundColor: '#B71C1C', marginTop: 10 }]}
          onPress={() => navigation.navigate('Reintegros')}
          activeOpacity={0.85}
        >
          <Text style={s.mainBtnIcon}>📦</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.mainBtnLabel}>Reintegros</Text>
            <Text style={s.mainBtnDesc}>Recuperación de productos</Text>
          </View>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>→</Text>
        </TouchableOpacity>

        {/* Acciones rápidas */}
        <Text style={[s.sectionTitle, { marginTop: 28 }]}>Acciones rápidas</Text>

        <View style={s.quickGrid}>
          <TouchableOpacity
            style={s.quickCard}
            onPress={() => navigation.navigate('CrearCliente')}
            activeOpacity={0.85}
          >
            <Text style={s.quickIcon}>👤</Text>
            <Text style={s.quickTitle}>Crear cliente</Text>
            <Text style={s.quickSub}>Registrar nuevo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.quickCard}
            onPress={() => navigation.navigate('Cobros')}
            activeOpacity={0.85}
          >
            <Text style={s.quickIcon}>🗺️</Text>
            <Text style={s.quickTitle}>Mapa de ruta</Text>
            <Text style={s.quickSub}>Ver clientes</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {drawerOpen && (
        <CustomDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
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
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 50,
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
  mainBtnIcon:  { fontSize: 34 },
  mainBtnLabel: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 2 },
  mainBtnDesc:  { color: 'rgba(255,255,255,0.75)', fontSize: 12 },

  quickGrid: { flexDirection: 'row', gap: 12 },
  quickCard: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: 16,
    minHeight: 110,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: c.border,
    elevation: 2,
  },
  quickIcon:  { fontSize: 28, marginBottom: 6 },
  quickTitle: { color: c.text, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  quickSub:   { color: c.textMuted, fontSize: 11 },
});
