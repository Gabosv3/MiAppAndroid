import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, AppState, StatusBar } from 'react-native';
import { hasPin, setPin, verifyPin } from '../services/appLock';
import PinPad from './PinPad';

// Overlay a pantalla completa que se monta encima de toda la app cuando hay
// sesión iniciada. La primera vez pide crear un PIN (dos veces, para
// confirmar); después, bloquea cada vez que la app vuelve de segundo plano o
// arranca en frío — el dispositivo se comparte entre cobradores y maneja
// efectivo, DUI de clientes y firmas, así que dejar la sesión abierta sin
// más protección que el login (que no vuelve a pedirse) era un hueco real.
export default function AppLockOverlay() {
  const [listo, setListo] = useState(false);
  const [modo, setModo] = useState('verificar'); // 'verificar' | 'crear1' | 'crear2'
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [pinTemp, setPinTemp] = useState('');
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);
  const appState = useRef(AppState.currentState);
  // Abrir el diálogo de imprimir, la cámara, el selector de imagen o el share
  // sheet también manda la app a background por un instante — sin este
  // margen, el PIN se pedía después de CUALQUIER acción que usara uno de
  // esos diálogos nativos, no solo al minimizar la app de verdad.
  const backgroundedAt = useRef(null);
  const GRACIA_MS = 120000;

  useEffect(() => {
    (async () => {
      const existe = await hasPin();
      setModo(existe ? 'verificar' : 'crear1');
      setListo(true);
    })();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next) => {
      const eraActiva = appState.current === 'active';
      const vaAFondo = eraActiva && next.match(/inactive|background/);
      const volvioActiva = appState.current.match(/inactive|background/) && next === 'active';
      appState.current = next;

      if (vaAFondo) {
        backgroundedAt.current = Date.now();
        return;
      }

      if (volvioActiva) {
        const elapsed = backgroundedAt.current ? Date.now() - backgroundedAt.current : Infinity;
        backgroundedAt.current = null;
        if (elapsed < GRACIA_MS) return; // fue un diálogo nativo, no un cambio de app real

        const existe = await hasPin();
        if (existe) {
          setDesbloqueado(false);
          setModo('verificar');
          setInput('');
        }
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (input.length !== 4) return;

    if (modo === 'crear1') {
      setPinTemp(input);
      setInput('');
      setModo('crear2');
      return;
    }

    if (modo === 'crear2') {
      if (input !== pinTemp) {
        setError(true);
        setTimeout(() => { setError(false); setInput(''); setPinTemp(''); setModo('crear1'); }, 500);
        return;
      }
      setPin(input).then(() => {
        setDesbloqueado(true);
        setInput('');
      });
      return;
    }

    if (modo === 'verificar') {
      verifyPin(input).then((ok) => {
        if (ok) {
          setDesbloqueado(true);
          setInput('');
        } else {
          setError(true);
          setTimeout(() => { setError(false); setInput(''); }, 500);
        }
      });
    }
  }, [input, modo, pinTemp]);

  if (!listo || desbloqueado) return null;

  const titulo = modo === 'crear1' ? 'Crea un PIN de seguridad'
    : modo === 'crear2' ? 'Confirma tu PIN'
    : 'Ingresa tu PIN';
  const subtitulo = modo === 'crear1'
    ? 'Protege el acceso a la app en este dispositivo compartido.'
    : modo === 'crear2'
      ? 'Escríbelo de nuevo para confirmar.'
      : 'La app se bloqueó por seguridad.';

  return (
    <View style={s.overlay}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <Text style={s.icono}>🔒</Text>
      <Text style={s.titulo}>{titulo}</Text>
      <Text style={s.subtitulo}>{subtitulo}</Text>
      <View style={{ marginTop: 24 }}>
        <PinPad valor={input} onCambiar={setInput} error={error} />
      </View>
      {error && <Text style={s.errorTxt}>{modo === 'crear2' ? 'No coincide, intenta de nuevo' : 'PIN incorrecto'}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24, zIndex: 9999, elevation: 9999,
  },
  icono: { fontSize: 40, marginBottom: 12 },
  titulo: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },
  subtitulo: { fontSize: 13, color: '#888', textAlign: 'center', marginTop: 6, maxWidth: 260 },
  errorTxt: { color: '#e53e3e', fontSize: 13, fontWeight: '600', marginTop: 16 },
});
