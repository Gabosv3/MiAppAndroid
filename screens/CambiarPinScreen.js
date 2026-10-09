import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Alert, Switch } from 'react-native';
import { verifyPin, setPin, isLockEnabled, setLockEnabled } from '../services/appLock';
import PinPad from '../components/PinPad';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 'actual' -> 'nuevo1' -> 'nuevo2' -> listo
export default function CambiarPinScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [paso, setPaso] = useState('actual');
  const [input, setInput] = useState('');
  const [nuevoTemp, setNuevoTemp] = useState('');
  const [error, setError] = useState(false);
  const [bloqueoActivo, setBloqueoActivo] = useState(true);
  const [cargandoToggle, setCargandoToggle] = useState(false);

  useEffect(() => {
    isLockEnabled().then(setBloqueoActivo);
  }, []);

  const alCambiarToggle = async (valor) => {
    setCargandoToggle(true);
    setBloqueoActivo(valor);
    await setLockEnabled(valor);
    setCargandoToggle(false);
  };

  const onCambiar = async (valor) => {
    setInput(valor);
    if (valor.length !== 4) return;

    if (paso === 'actual') {
      const ok = await verifyPin(valor);
      if (!ok) {
        setError(true);
        setTimeout(() => { setError(false); setInput(''); }, 500);
        return;
      }
      setInput('');
      setPaso('nuevo1');
      return;
    }

    if (paso === 'nuevo1') {
      setNuevoTemp(valor);
      setInput('');
      setPaso('nuevo2');
      return;
    }

    if (paso === 'nuevo2') {
      if (valor !== nuevoTemp) {
        setError(true);
        setTimeout(() => { setError(false); setInput(''); setNuevoTemp(''); setPaso('nuevo1'); }, 500);
        return;
      }
      await setPin(valor);
      Alert.alert('✅ PIN actualizado', 'Tu nuevo PIN ya está activo.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  };

  const titulo = paso === 'actual' ? 'Ingresa tu PIN actual'
    : paso === 'nuevo1' ? 'Crea tu nuevo PIN'
    : 'Confirma tu nuevo PIN';

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Seguridad</Text>
      </View>

      <View style={s.toggleRow}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={s.toggleTitulo}>Bloquear la app con PIN</Text>
          <Text style={s.toggleSub}>
            {bloqueoActivo
              ? 'Pide el PIN al abrir la app o volver de segundo plano.'
              : 'La app queda libre — cualquiera que la abra entra directo.'}
          </Text>
        </View>
        <Switch
          value={bloqueoActivo}
          onValueChange={alCambiarToggle}
          disabled={cargandoToggle}
          trackColor={{ true: '#1565C0' }}
        />
      </View>

      <View style={s.center}>
        <Text style={s.titulo}>{titulo}</Text>
        <View style={{ marginTop: 24 }}>
          <PinPad valor={input} onCambiar={onCambiar} error={error} />
        </View>
        {error && <Text style={s.errorTxt}>{paso === 'actual' ? 'PIN incorrecto' : 'No coincide, intenta de nuevo'}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    backgroundColor: '#1565C0', flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 32, // paddingTop real (insets.top) se aplica inline en el render
    paddingBottom: 16, paddingHorizontal: 16,
  },
  backBtn: {},
  backArrow: { color: '#fff', fontSize: 24 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  titulo: { fontSize: 16, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },
  errorTxt: { color: '#e53e3e', fontSize: 13, fontWeight: '600', marginTop: 16 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16,
    borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e5e7eb',
  },
  toggleTitulo: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  toggleSub: { fontSize: 12, color: '#888', marginTop: 3, lineHeight: 16 },
});
