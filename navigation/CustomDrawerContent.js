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
  Platform,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useConnectivity } from '../services/connectivity';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(320, SCREEN_WIDTH * 0.85);

const NAV_ITEMS = [
  { name: 'Inicio', icon: '🏠', active: true },
  { name: 'Inventario', icon: '📦', disabled: true },
  { name: 'Productos', icon: '🏷️', disabled: true },
  { name: 'Movimientos', icon: '🔄', disabled: true },
  { name: 'Reportes', icon: '📊', disabled: true },
];

export default function CustomDrawer({ visible, onClose, navigation }) {
  const { colors, mode, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { isOnline } = useConnectivity();
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

  const handleCambiarPin = () => {
    onClose();
    setTimeout(() => navigation?.navigate('CambiarPin'), 300);
  };

  const s = styles(colors);

  if (!visible && translateX._value === -DRAWER_WIDTH) return null;

  return (
    <View style={[s.root, Platform.OS === 'web' ? { pointerEvents: 'box-none' } : null]}>
      {/* Overlay oscuro */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[s.overlay, { opacity: overlayOpacity }]} />
      </TouchableWithoutFeedback>

      {/* Panel del menú */}
      <Animated.View style={[s.drawer, { transform: [{ translateX }] }]}>
        {/* Header Minimal */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <Text style={s.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Navigation */}
        <ScrollView style={s.navScroll} showsVerticalScrollIndicator={false}>
          <Text style={s.navSection}>MENÚ</Text>
          {NAV_ITEMS.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={[s.navItem, item.active && s.navItemActive, item.disabled && s.navItemDisabled]}
              onPress={() => !item.disabled && onClose()}
              activeOpacity={item.disabled ? 1 : 0.7}
            >
              <Text style={s.navItemIcon}>{item.icon}</Text>
              <Text style={[s.navItemText, item.active && s.navItemTextActive, item.disabled && s.navItemTextDisabled]}>
                {item.name}
              </Text>
              {item.disabled && <Text style={s.badgeLabel}>Próximo</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Footer */}
        <View style={s.footer}>
          {/* Theme Toggle */}
          <View style={s.themeToggle}>
            <Text style={s.themeIcon}>{mode === 'dark' ? '🌙' : '☀️'}</Text>
            <Text style={s.themeLabel}>Tema</Text>
            <Switch
              value={mode === 'dark'}
              onValueChange={toggleTheme}
              trackColor={{ false: '#ddd', true: colors.accent + '60' }}
              thumbColor={mode === 'dark' ? colors.accent : '#ccc'}
            />
          </View>

          <TouchableOpacity style={s.pinButton} onPress={handleCambiarPin} activeOpacity={0.7}>
            <Text style={s.pinIcon}>🔒</Text>
            <Text style={s.pinLabel}>Cambiar PIN</Text>
          </TouchableOpacity>

          <View style={s.footerDivider} />

          {/* Logout */}
          <TouchableOpacity style={s.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
            <Text style={s.logoutIcon}>🚪</Text>
            <Text style={s.logoutLabel}>Cerrar sesión</Text>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawer: {
    width: DRAWER_WIDTH,
    height: '100%',
    backgroundColor: c.bg,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 16,
  },

  // ── HEADER ──────────────────────────────────────────────────────────────
  header: {
    backgroundColor: c.bg,
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 8 : 32,
    paddingBottom: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  closeBtn: {
    color: c.text,
    fontSize: 24,
    fontWeight: '600',
    opacity: 0.7,
  },

  // ── NAVIGATION ───────────────────────────────────────────────────────────
  navScroll: {
    flex: 1,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  navSection: {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginLeft: 12,
    marginBottom: 8,
    marginTop: 8,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  navItemActive: {
    backgroundColor: c.accent + '15',
  },
  navItemDisabled: {
    opacity: 0.5,
  },
  navItemIcon: {
    fontSize: 20,
    marginRight: 14,
    width: 24,
    textAlign: 'center',
  },
  navItemText: {
    color: c.textSec,
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  navItemTextActive: {
    color: c.accent,
    fontWeight: '700',
  },
  navItemTextDisabled: {
    color: c.textMuted,
  },
  badgeLabel: {
    color: c.accent,
    fontSize: 9,
    fontWeight: '700',
    backgroundColor: c.accent + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },

  // ── FOOTER ──────────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 12,
    paddingBottom: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  themeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  themeIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  themeLabel: {
    color: c.textSec,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  pinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  pinIcon: { fontSize: 18, marginRight: 12 },
  pinLabel: { color: c.textSec, fontSize: 13, fontWeight: '500', flex: 1 },
  footerDivider: {
    height: 1,
    backgroundColor: c.border,
    marginVertical: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#e53e3e10',
  },
  logoutIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  logoutLabel: {
    color: '#e53e3e',
    fontSize: 13,
    fontWeight: '600',
  },
});
