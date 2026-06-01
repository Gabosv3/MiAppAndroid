import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import CustomDrawer from '../navigation/CustomDrawerContent';

const STAT_CARDS = [
  { label: 'Productos', value: '—', icon: '🏷️', color: '#F5A623' },
  { label: 'Stock total', value: '—', icon: '📦', color: '#4CAF50' },
  { label: 'Movimientos hoy', value: '—', icon: '🔄', color: '#2196F3' },
  { label: 'Alertas', value: '—', icon: '⚠️', color: '#e53e3e' },
];

export default function HomeScreen({ navigation }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

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

        <Text style={s.appBarTitle}>Dashboard</Text>

        <View style={s.avatar}>
          <Text style={s.avatarText}>{user?.name?.charAt(0) || 'U'}</Text>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Saludo */}
        <View style={s.greetingCard}>
          <Text style={s.greetingLabel}>Bienvenido,</Text>
          <Text style={s.greetingName}>{user?.name || 'Usuario'} 👋</Text>
          <Text style={s.greetingDate}>
            {new Date().toLocaleDateString('es-SV', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>

        {/* Tarjetas de estadísticas */}
        <Text style={s.sectionTitle}>Resumen general</Text>
        <View style={s.statsGrid}>
          {STAT_CARDS.map((card, i) => (
            <View key={i} style={s.statCard}>
              <View style={[s.statIconWrap, { backgroundColor: card.color + '20' }]}>
                <Text style={s.statIcon}>{card.icon}</Text>
              </View>
              <Text style={[s.statValue, { color: card.color }]}>{card.value}</Text>
              <Text style={s.statLabel}>{card.label}</Text>
            </View>
          ))}
        </View>

        {/* Acceso rápido */}
        <Text style={s.sectionTitle}>Acceso rápido</Text>

        {/* POS - Nueva Venta (destacado) */}
        <TouchableOpacity
          style={s.posBtn}
          onPress={() => navigation.navigate('NuevaVenta')}
          activeOpacity={0.85}
        >
          <Text style={s.posIcon}>🛒</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.posLabel}>Nueva Venta (POS)</Text>
            <Text style={s.posDesc}>Punto de venta · Cobro rápido</Text>
          </View>
          <Text style={{ color: '#fff', fontSize: 18 }}>→</Text>
        </TouchableOpacity>

        <View style={s.quickGrid}>
          {[
            { icon: '📦', label: 'Inventario' },
            { icon: '🏷️', label: 'Productos' },
            { icon: '🔄', label: 'Movimientos' },
            { icon: '📊', label: 'Reportes' },
          ].map((item, i) => (
            <TouchableOpacity key={i} style={s.quickItem} activeOpacity={0.7}>
              <Text style={s.quickIcon}>{item.icon}</Text>
              <Text style={s.quickLabel}>{item.label}</Text>
              <View style={s.comingSoon}>
                <Text style={s.comingSoonText}>Próximo</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Menú lateral con Animated nativo */}
      {drawerOpen && (
        <CustomDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
      )}
    </View>
  );
}

const styles = (c) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: c.bg,
  },
  appBar: {
    backgroundColor: c.headerBg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 8 : 48,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    elevation: 4,
  },
  menuBtn: {
    padding: 4,
    marginRight: 12,
  },
  hamburger: {
    gap: 5,
  },
  bar: {
    height: 2,
    backgroundColor: c.text,
    borderRadius: 1,
  },
  appBarTitle: {
    color: c.text,
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F5A623',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 14,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  greetingCard: {
    backgroundColor: '#0d0d0d',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  greetingLabel: {
    color: '#888',
    fontSize: 13,
    marginBottom: 2,
  },
  greetingName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 6,
  },
  greetingDate: {
    color: '#666',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  sectionTitle: {
    color: c.textSec,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 16,
    width: '47%',
    elevation: 2,
    borderWidth: 1,
    borderColor: c.border,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statIcon: { fontSize: 20 },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 2,
  },
  statLabel: {
    color: c.textMuted,
    fontSize: 12,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickItem: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 16,
    width: '47%',
    alignItems: 'center',
    elevation: 2,
    borderWidth: 1,
    borderColor: c.border,
    opacity: 0.7,
  },
  quickIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  quickLabel: {
    color: c.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  comingSoon: {
    backgroundColor: '#F5A62320',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  comingSoonText: {
    color: '#F5A623',
    fontSize: 9,
    fontWeight: '700',
  },
  posBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1565C0',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    gap: 12,
    elevation: 4,
    shadowColor: '#1565C0',
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  posIcon:  { fontSize: 30 },
  posLabel: { color: '#fff', fontSize: 15, fontWeight: '800' },
  posDesc:  { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
});
