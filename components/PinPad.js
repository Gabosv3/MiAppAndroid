import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export default function PinPad({ valor, longitud = 4, onCambiar, error }) {
  const presionar = (tecla) => {
    if (tecla === '') return;
    if (tecla === '⌫') { onCambiar(valor.slice(0, -1)); return; }
    if (valor.length >= longitud) return;
    onCambiar(valor + tecla);
  };

  return (
    <View>
      <View style={s.dots}>
        {Array.from({ length: longitud }).map((_, i) => (
          <View key={i} style={[s.dot, i < valor.length && s.dotOn, error && s.dotError]} />
        ))}
      </View>

      <View style={s.grid}>
        {TECLAS.map((t, i) => (
          <TouchableOpacity
            key={i}
            style={[s.key, t === '' && { opacity: 0 }]}
            onPress={() => presionar(t)}
            disabled={t === ''}
            activeOpacity={0.6}
          >
            <Text style={s.keyTxt}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 32 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#ccc' },
  dotOn: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  dotError: { backgroundColor: '#e53e3e', borderColor: '#e53e3e' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 264, alignSelf: 'center' },
  key: { width: 88, height: 72, alignItems: 'center', justifyContent: 'center' },
  keyTxt: { fontSize: 26, fontWeight: '600', color: '#1a1a1a' },
});
