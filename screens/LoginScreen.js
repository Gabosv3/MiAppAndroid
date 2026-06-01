import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableNativeFeedback,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const FEATURES = [
  'Control de inventario en tiempo real',
  'Gestión de productos y categorías',
  'Reportes y estadísticas avanzadas',
  'Seguimiento de movimientos de stock',
];

function RippleButton({ onPress, style, children, disabled }) {
  if (Platform.OS === 'android' && !disabled) {
    return (
      <TouchableNativeFeedback
        onPress={onPress}
        background={TouchableNativeFeedback.Ripple('rgba(0,0,0,0.2)', false)}
        useForeground
      >
        <View style={style}>{children}</View>
      </TouchableNativeFeedback>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} style={[style, disabled && { opacity: 0.6 }]} activeOpacity={0.85} disabled={disabled}>
      {children}
    </TouchableOpacity>
  );
}

export default function LoginScreen() {
  const { colors, mode, toggleTheme } = useTheme();
  const { login, loading, error } = useAuth();
  const isDark = mode === 'dark';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  const handleLogin = () => {
    login(email, password);
  };

  const s = styles(colors, isDark);

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0d0d0d" translucent={false} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Cabecera oscura (siempre oscura) ── */}
        <View style={s.header}>
          {/* Toggle de tema */}
          <TouchableOpacity style={s.themeToggle} onPress={toggleTheme} activeOpacity={0.7}>
            <Text style={s.themeToggleIcon}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>

          <View style={s.appChip}>
            <View style={s.chipIconWrap}>
              <View style={s.chipSquareBig} />
              <View style={s.chipSquaresCol}>
                <View style={s.chipSquareSmall} />
                <View style={s.chipSquareSmall} />
              </View>
            </View>
            <Text style={s.chipText}>SIDB</Text>
          </View>

          <Text style={s.heroTitle}>Sistema de{'\n'}Inventario</Text>
          <Text style={s.heroSubtitle}>Distribuidora Birancesco Menijvar</Text>

          <View style={s.featuresWrap}>
            {FEATURES.map((f, i) => (
              <View key={i} style={s.featureChip}>
                <View style={s.chipDot} />
                <Text style={s.featureChipText}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Superficie Material (formulario) ── */}
        <View style={s.surface}>
          <View style={s.handleBar} />

          <Text style={s.sectionLabel}>ACCESO AL SISTEMA</Text>
          <Text style={s.formTitle}>Entre a su cuenta</Text>

          {/* Error */}
          {error ? (
            <View style={s.errorBanner}>
              <Text style={s.errorIcon}>⚠️</Text>
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Campo correo */}
          <View style={[s.fieldWrap, emailFocused && s.fieldWrapFocused]}>
            <Text style={[s.floatLabel, (emailFocused || email) && s.floatLabelUp]}>
              Correo electrónico <Text style={s.required}>*</Text>
            </Text>
            <TextInput
              style={s.fieldInput}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              selectionColor="#F5A623"
              cursorColor="#F5A623"
              editable={!loading}
            />
          </View>

          {/* Campo contraseña */}
          <View style={[s.fieldWrap, passFocused && s.fieldWrapFocused]}>
            <Text style={[s.floatLabel, (passFocused || password) && s.floatLabelUp]}>
              Contraseña <Text style={s.required}>*</Text>
            </Text>
            <View style={s.passRow}>
              <TextInput
                style={[s.fieldInput, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                onFocus={() => setPassFocused(true)}
                onBlur={() => setPassFocused(false)}
                selectionColor="#F5A623"
                cursorColor="#F5A623"
                editable={!loading}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={s.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Recordarme */}
          <TouchableOpacity
            style={s.rememberRow}
            onPress={() => setRemember(!remember)}
            activeOpacity={0.6}
          >
            <View style={[s.toggle, remember && s.toggleOn]}>
              <View style={[s.toggleThumb, remember && s.toggleThumbOn]} />
            </View>
            <Text style={s.rememberText}>Recordarme</Text>
          </TouchableOpacity>

          {/* Botón */}
          <View style={s.btnWrap}>
            <RippleButton onPress={handleLogin} style={s.loginBtn} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={s.loginBtnText}>ENTRAR</Text>
              )}
            </RippleButton>
          </View>

          <Text style={s.footer}>© 2026 Distribuidora Birancesco Menijvar</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = (c, isDark) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  scroll: {
    flexGrow: 1,
  },

  /* ── Cabecera ── */
  header: {
    backgroundColor: '#0d0d0d',
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 16 : 48,
    paddingBottom: 32,
    paddingHorizontal: 24,
    minHeight: SCREEN_HEIGHT * 0.44,
    justifyContent: 'center',
  },
  themeToggle: {
    position: 'absolute',
    top: StatusBar.currentHeight ? StatusBar.currentHeight + 12 : 44,
    right: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  themeToggleIcon: {
    fontSize: 17,
  },
  appChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  chipIconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 6,
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
  },
  chipSquareSmall: {
    width: 6,
    height: 6,
    backgroundColor: '#555',
    borderRadius: 1,
  },
  chipText: {
    color: '#ccc',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 42,
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    color: '#666',
    fontSize: 13,
    marginBottom: 20,
  },
  featuresWrap: {
    marginTop: 4,
  },
  featureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F5A623',
    marginRight: 10,
    opacity: 0.7,
  },
  featureChipText: {
    color: '#666',
    fontSize: 13,
  },

  /* ── Superficie Material ── */
  surface: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingBottom: 40,
    paddingHorizontal: 24,
    flex: 1,
    elevation: 16,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
    alignSelf: 'center',
    marginBottom: 24,
  },
  sectionLabel: {
    color: '#F5A623',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 6,
  },
  formTitle: {
    color: c.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 24,
    letterSpacing: -0.3,
  },

  /* Error */
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e53e3e20',
    borderWidth: 1,
    borderColor: '#e53e3e50',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  errorText: {
    color: '#e53e3e',
    fontSize: 13,
    flex: 1,
  },

  /* Campos outlined Material */
  fieldWrap: {
    borderWidth: 1.5,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 10,
    marginBottom: 18,
    backgroundColor: isDark ? '#222' : c.surfaceAlt,
    position: 'relative',
  },
  fieldWrapFocused: {
    borderColor: '#F5A623',
  },
  floatLabel: {
    position: 'absolute',
    top: 14,
    left: 14,
    color: c.inputLabel,
    fontSize: 15,
  },
  floatLabelUp: {
    top: 6,
    fontSize: 11,
    color: '#F5A623',
  },
  fieldInput: {
    color: c.text,
    fontSize: 15,
    paddingTop: 4,
    paddingBottom: 0,
  },
  passRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eyeIcon: {
    fontSize: 18,
    paddingLeft: 8,
  },
  required: {
    color: '#e53e3e',
  },

  /* Toggle */
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },
  toggle: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: c.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
    marginRight: 10,
  },
  toggleOn: {
    backgroundColor: '#F5A62350',
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: isDark ? '#555' : '#bbb',
    alignSelf: 'flex-start',
  },
  toggleThumbOn: {
    backgroundColor: '#F5A623',
    alignSelf: 'flex-end',
  },
  rememberText: {
    color: c.textSec,
    fontSize: 14,
  },

  /* Botón */
  btnWrap: {
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 28,
  },
  loginBtn: {
    backgroundColor: '#F5A623',
    paddingVertical: 15,
    alignItems: 'center',
    borderRadius: 10,
    minHeight: 50,
    justifyContent: 'center',
  },
  loginBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  footer: {
    textAlign: 'center',
    color: c.textMuted,
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
