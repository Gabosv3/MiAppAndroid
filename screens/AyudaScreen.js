import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView,
} from 'react-native';
import { NODOS, NODO_INICIAL } from '../services/ayudaContenido';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Chatbot de ayuda 100% offline — sin IA, sin red. Es un árbol de nodos
// (services/ayudaContenido.js): el "bot" muestra mensajes fijos y el
// cobrador elige entre botones predefinidos, nunca escribe texto libre.
// El historial de la conversación se arma en memoria a medida que navega.
export default function AyudaScreen({ navigation }) {
  const [historial, setHistorial] = useState(() =>
    NODOS[NODO_INICIAL].mensajes.map(texto => ({ tipo: 'bot', texto }))
  );
  const [nodoActual, setNodoActual] = useState(NODO_INICIAL);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [historial]);

  const elegirOpcion = (opcion) => {
    const siguienteNodo = NODOS[opcion.ir];
    if (!siguienteNodo) return;

    setHistorial(prev => [
      ...prev,
      { tipo: 'usuario', texto: opcion.texto },
      ...siguienteNodo.mensajes.map(texto => ({ tipo: 'bot', texto })),
    ]);
    setNodoActual(opcion.ir);
  };

  const opcionesActuales = NODOS[nodoActual]?.opciones || [];

  const insets = useSafeAreaInsets();
  const s = styles();

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />

      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={s.headerTitle}>🤖 Ayuda</Text>
          <Text style={s.headerSub}>Funciona sin conexión</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {historial.map((msg, i) => (
          <View
            key={i}
            style={[
              s.burbujaWrap,
              msg.tipo === 'usuario' ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' },
            ]}
          >
            <View style={[s.burbuja, msg.tipo === 'usuario' ? s.burbujaUsuario : s.burbujaBot]}>
              <Text style={[s.burbujaTxt, msg.tipo === 'usuario' && { color: '#fff' }]}>{msg.texto}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Opciones (respuestas rápidas) */}
      <View style={s.opcionesWrap}>
        {opcionesActuales.map((op, i) => (
          <TouchableOpacity key={i} style={s.opcionBtn} onPress={() => elegirOpcion(op)} activeOpacity={0.8}>
            <Text style={s.opcionTxt}>{op.texto}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = () => StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    backgroundColor: '#1565C0', flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 32, // paddingTop real (insets.top) se aplica inline en el render
    paddingBottom: 16, paddingHorizontal: 16,
  },
  backBtn:    { paddingRight: 4 },
  backArrow:  { color: '#fff', fontSize: 24 },
  headerTitle:{ color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub:  { color: 'rgba(255,255,255,0.8)', fontSize: 12 },

  burbujaWrap: { marginBottom: 10 },
  burbuja: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  burbujaBot:     { backgroundColor: '#fff', borderBottomLeftRadius: 4, elevation: 1 },
  burbujaUsuario: { backgroundColor: '#1565C0', borderBottomRightRadius: 4 },
  burbujaTxt: { fontSize: 14, lineHeight: 20, color: '#1a1a1a' },

  opcionesWrap: {
    padding: 12, gap: 8, backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#eee',
  },
  opcionBtn: {
    borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 20,
    paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', backgroundColor: '#e3f2fd',
  },
  opcionTxt: { color: '#1565C0', fontWeight: '700', fontSize: 13 },
});
