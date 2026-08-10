import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Alert } from 'react-native';
import { verifyPin, setPin, removePin, hasPin } from '../services/appLock';
import PinPad from '../components/PinPad';

// 'actual' -> 'nuevo1' -> 'nuevo2' -> listo
export default function CambiarPinScreen({ navigation }) {
  const [paso, setPaso] = useState('actual');
  const [input, setInput] = useState('');
  const [nuevoTemp, setNuevoTemp] = useState('');
  const [error, setError] = useState(false);

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

  const confirmarQuitarPin = () => {
    Alert.alert(
      '¿Quitar el PIN?',
      'Cualquiera que tenga el teléfono en mano podrá abrir la app sin pedir nada. ¿Seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar PIN', style: 'destructive', onPress: async () => {
            const existe = await hasPin();
            if (existe) await removePin();
            navigation.goBack();
          },
        },
      ]
    );
  };

  const titulo = paso === 'actual' ? 'Ingresa tu PIN actual'
    : paso === 'nuevo1' ? 'Crea tu nuevo PIN'
    : 'Confirma tu nuevo PIN';

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Cambiar PIN</Text>
      </View>

      <View style={s.center}>
        <Text style={s.titulo}>{titulo}</Text>
        <View style={{ marginTop: 24 }}>
          <PinPad valor={input} onCambiar={onCambiar} error={error} />
        </View>
        {error && <Text style={s.errorTxt}>{paso === 'actual' ? 'PIN incorrecto' : 'No coincide, intenta de nuevo'}</Text>}

        {paso === 'actual' && (
          <TouchableOpacity onPress={confirmarQuitarPin} style={{ marginTop: 32 }}>
            <Text style={s.quitarTxt}>Quitar PIN de este dispositivo</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    backgroundColor: '#1565C0', flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: (StatusBar.currentHeight || 0) + 8, paddingBottom: 16, paddingHorizontal: 16,
  },
  backBtn: {},
  backArrow: { color: '#fff', fontSize: 24 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  titulo: { fontSize: 16, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },
  errorTxt: { color: '#e53e3e', fontSize: 13, fontWeight: '600', marginTop: 16 },
  quitarTxt: { color: '#e53e3e', fontSize: 13, fontWeight: '600' },
});
