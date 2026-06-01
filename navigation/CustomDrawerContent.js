import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ScrollView,
  Animated,
  Dimensions,
  StatusBar,
  TouchableWithoutFeedback,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(300, SCREEN_WIDTH * 0.78);

const NAV_ITEMS = [
  { name: 'Inicio', icon: '🏠', active: true },
  { name: 'Inventario', icon: '📦', disabled: true },
  { name: 'Productos', icon: '🏷️', disabled: true },
  { name: 'Movimientos', icon: '🔄', disabled: true },
  { name: 'Reportes', icon: '📊', disabled: true },
];

export default function CustomDrawer({ visible, onClose }) {
  const { colors, mode, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
          speed: 20,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -DRAWER_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleLogout = () => {
    onClose();
    setTimeout(() => logout(), 300);
  };

  const s = styles(colors);

  if (!visible && translateX._value === -DRAWER_WIDTH) return null;

  return (
    <View style={s.root} pointerEvents="box-none">
      {/* Overlay oscuro */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[s.overlay, { opacity: overlayOpacity }]} />
      </TouchableWithoutFeedback>

      {/* Panel del menú */}
      <Animated.View style={[s.drawer, { transform: [{ translateX }] }]}>
        {/* Cabecera */}
        <View style={s.header}>
          <View style={s.logoRow}>
            <View style={s.chipSquareBig} />
            <View style={s.chipSquaresCol}>
              <View style={s.chipSquareSmall} />
              <View style={s.chipSquareSmall} />
            </View>
            <Text style={s.logoText}>SIDB</Text>
          </View>
          <Text style={s.appName}>Sistema de{'\n'}Inventario</Text>

          {/* Info usuario */}
          <View style={s.userChip}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{user?.name?.charAt(0) || 'U'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.userName}>{user?.name || 'Usuario'}</Text>
              <Text style={s.userEmail} numberOfLines={1}>{user?.email}</Text>
            </View>
          </View>
        </View>

        {/* Navegación */}
        <ScrollView style={s.nav} showsVerticalScrollIndicator={false}>
          <Text style={s.sectionLabel}>MENÚ PRINCIPAL</Text>
          {NAV_ITEMS.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={[s.navItem, item.active && s.navItemActive, item.disabled && s.navItemDisabled]}
              onPress={() => !item.disabled && onClose()}
              activeOpacity={item.disabled ? 1 : 0.7}
            >
              <Text style={s.navIcon}>{item.icon}</Text>
              <Text style={[s.navLabel, item.active && s.navLabelActive, item.disabled && s.navLabelDisabled]}>
                {item.name}
              </Text>
              {item.disabled && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>Próximo</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Pie */}
        <View style={s.footer}>
          <View style={s.themeRow}>
            <Text style={s.themeIcon}>{mode === 'dark' ? '🌙' : '☀️'}</Text>
            <Text style={s.themeLabel}>Modo {mode === 'dark' ? 'oscuro' : 'claro'}</Text>
            <Switch
              value={mode === 'dark'}
              onValueChange={toggleTheme}
              trackColor={{ false: '#ddd', true: colors.accent + '60' }}
              thumbColor={mode === 'dark' ? colors.accent : '#ccc'}
            />
          </View>
          <View style={s.divider} />
          <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
            <Text style={s.logoutIcon}>🚪</Text>
            <Text style={s.logoutText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = (c) => StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    flexDirection: 'row',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  drawer: {
    width: DRAWER_WIDTH,
    height: '100%',
    backgroundColor: c.drawerBg,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 20,
  },
  header: {
    backgroundColor: '#0d0d0d',
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 16 : 48,
    paddingBottom: 20,
    paddingHorizontal: 18,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  chipSquareBig: {
    width: 14,
    height: 14,
    backgroundColor: '#F5A623',
    borderRadius: 3,
    marginRight: 3,
  },
  chipSquaresCol: {
    flexDirection: 'column',
    gap: 2,
    marginRight: 8,
  },
  chipSquareSmall: {
    width: 6,
    height: 6,
    backgroundColor: '#555',
    borderRadius: 1,
  },
  logoText: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  appName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 23,
    marginBottom: 14,
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F5A623',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 15,
  },
  userName: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  userEmail: {
    color: '#666',
    fontSize: 11,
  },
  nav: {
    flex: 1,
    paddingTop: 12,
    paddingHorizontal: 12,
  },
  sectionLabel: {
    color: c.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginLeft: 8,
    marginBottom: 8,
    marginTop: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 2,
  },
  navItemActive: {
    backgroundColor: c.accent + '20',
  },
  navItemDisabled: {
    opacity: 0.45,
  },
  navIcon: {
    fontSize: 18,
    marginRight: 12,
    width: 24,
    textAlign: 'center',
  },
  navLabel: {
    color: c.textSec,
    fontSize: 15,
    flex: 1,
  },
  navLabelActive: {
    color: c.accent,
    fontWeight: '700',
  },
  navLabelDisabled: {
    color: c.textMuted,
  },
  badge: {
    backgroundColor: c.accent + '30',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    color: c.accent,
    fontSize: 9,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 30,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  themeIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  themeLabel: {
    color: c.textSec,
    fontSize: 14,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: c.border,
    marginVertical: 6,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  logoutIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  logoutText: {
    color: '#e53e3e',
    fontSize: 15,
    fontWeight: '600',
  },
});
