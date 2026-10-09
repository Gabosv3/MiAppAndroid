import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput, ScrollView,
  ActivityIndicator, StyleSheet, Alert, Linking,
} from 'react-native';
import api, { esErrorTransitorio } from '../services/api';
import * as offlineQueue from '../services/offlineQueue';

const REGEX_TEL = /^[0-9\-\s]{8,20}$/; // misma regla que valida el servidor
const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const Fila = ({ label, valor, onPress }) => {
  if (valor === null || valor === undefined || valor === '') return null;
  return (
    <View style={s.fila}>
      <Text style={s.filaLabel}>{label}</Text>
      {onPress ? (
        <TouchableOpacity onPress={onPress} style={{ flex: 1 }}>
          <Text style={[s.filaValor, s.filaLink]}>{valor}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={s.filaValor}>{valor}</Text>
      )}
    </View>
  );
};

/**
 * Datos de un cliente (ver) y edición de nombre y teléfonos, para abrir
 * desde cualquier pantalla que conozca el id del cliente (ej. el historial
 * de ventas). Usa los mismos endpoints que ya usa el resto de la app:
 * GET /clientes/{id}, PATCH /clientes/{id}/nombre y /telefonos.
 */
export default function ClienteDatosModal({ visible, clienteId, onClose, onActualizado }) {
  const [cliente, setCliente] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ nombre: '', apellido: '', telefono: '', whatsapp: '' });

  const cargar = useCallback(async () => {
    if (!clienteId) return;
    setCargando(true);
    setError('');
    setCliente(null);
    setEditando(false);
    try {
      const { data } = await api.get(`/clientes/${clienteId}`);
      setCliente(data);
    } catch (e) {
      setError(
        e?.response?.status === 404
          ? 'No tenés acceso a los datos de este cliente.'
          : (e?.message || 'No se pudieron cargar los datos del cliente.')
      );
    } finally {
      setCargando(false);
    }
  }, [clienteId]);

  useEffect(() => { if (visible) cargar(); }, [visible, cargar]);

  // Al cerrarse se limpia todo: si no, al abrir OTRO cliente se vería un
  // instante la información del anterior antes de que termine de cargar.
  useEffect(() => {
    if (!visible) {
      setCliente(null);
      setError('');
      setEditando(false);
    }
  }, [visible]);

  const empezarEdicion = () => {
    setForm({
      nombre: cliente?.nombre || '',
      apellido: cliente?.apellido || '',
      telefono: cliente?.telefono_normal || '',
      whatsapp: cliente?.telefono_whatsapp || '',
    });
    setEditando(true);
  };

  const guardar = async () => {
    const n = form.nombre.trim();
    const a = form.apellido.trim();
    const t = form.telefono.trim();
    const w = form.whatsapp.trim();

    if (!n) {
      Alert.alert('Falta el nombre', 'El nombre no puede quedar vacío.');
      return;
    }
    if ((t && !REGEX_TEL.test(t)) || (w && !REGEX_TEL.test(w))) {
      Alert.alert('Teléfono inválido', 'Usá solo números (mínimo 8 dígitos), por ejemplo 7777-8888.');
      return;
    }

    // Solo se manda lo que cambió, y solo valores con contenido — igual que
    // en el detalle del cliente: el servidor no acepta dejar un campo vacío.
    const peticiones = [];
    if (n !== (cliente.nombre || '') || (a && a !== (cliente.apellido || ''))) {
      peticiones.push({
        method: 'PATCH', url: `/clientes/${clienteId}/nombre`,
        label: `Nombre de ${n}`, data: { nombre: n, ...(a && { apellido: a }) },
      });
    }
    const datosTel = {
      ...(t && t !== (cliente.telefono_normal || '') && { telefono_normal: t }),
      ...(w && w !== (cliente.telefono_whatsapp || '') && { telefono_whatsapp: w }),
    };
    if (Object.keys(datosTel).length > 0) {
      peticiones.push({
        method: 'PATCH', url: `/clientes/${clienteId}/telefonos`,
        label: `Teléfonos de ${n}`, data: datosTel,
      });
    }

    if (peticiones.length === 0) {
      setEditando(false);
      return;
    }

    setGuardando(true);
    let guardadoSinConexion = false;
    try {
      for (const p of peticiones) {
        try {
          await api.patch(p.url, p.data);
        } catch (e) {
          if (!esErrorTransitorio(e)) throw e;
          await offlineQueue.enqueueRequest(p);
          guardadoSinConexion = true;
        }
      }

      const actualizado = {
        ...cliente,
        nombre: n,
        apellido: a || cliente.apellido,
        telefono_normal: t || cliente.telefono_normal,
        telefono_whatsapp: w || cliente.telefono_whatsapp,
      };
      setCliente(actualizado);
      setEditando(false);
      onActualizado?.(actualizado);

      Alert.alert(
        guardadoSinConexion ? '📴 Guardado sin conexión' : '✅ Listo',
        guardadoSinConexion
          ? 'Los cambios se enviarán cuando recuperes la señal.'
          : 'Datos del cliente actualizados.'
      );
    } catch (e) {
      Alert.alert('No se pudo guardar', e?.message || 'Intentá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const llamar = (numero) => Linking.openURL(`tel:${String(numero).replace(/\s/g, '')}`).catch(() => {});
  const abrirWhatsApp = (numero) => {
    const digitos = String(numero).replace(/\D/g, '');
    const completo = digitos.startsWith('503') ? digitos : `503${digitos}`;
    Linking.openURL(`https://wa.me/${completo}`).catch(() => {});
  };

  const direccion = cliente
    ? [cliente.direccion, cliente.municipio, cliente.departamento].filter(Boolean).join(', ')
    : '';
  const nombreCompleto = cliente ? `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim() : '';

  return (
    <Modal visible={!!visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.box}>
          <View style={s.header}>
            <Text style={s.titulo}>Datos del cliente</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Text style={s.cerrar}>✕</Text>
            </TouchableOpacity>
          </View>

          {cargando ? (
            <View style={s.centro}><ActivityIndicator size="large" color="#1565C0" /></View>
          ) : error ? (
            <View style={s.centro}>
              <Text style={{ fontSize: 34, marginBottom: 8 }}>😕</Text>
              <Text style={s.errorTxt}>{error}</Text>
              <TouchableOpacity style={s.btnReintentar} onPress={cargar}>
                <Text style={s.btnReintentarTxt}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : cliente ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
              {editando ? (
                <>
                  <Text style={s.inputLabel}>Nombre</Text>
                  <TextInput style={s.input} value={form.nombre} onChangeText={(v) => setForm(f => ({ ...f, nombre: v }))} />
                  <Text style={s.inputLabel}>Apellido</Text>
                  <TextInput style={s.input} value={form.apellido} onChangeText={(v) => setForm(f => ({ ...f, apellido: v }))} />
                  <Text style={s.inputLabel}>Teléfono</Text>
                  <TextInput style={s.input} value={form.telefono} keyboardType="phone-pad" onChangeText={(v) => setForm(f => ({ ...f, telefono: v }))} />
                  <Text style={s.inputLabel}>WhatsApp</Text>
                  <TextInput style={s.input} value={form.whatsapp} keyboardType="phone-pad" onChangeText={(v) => setForm(f => ({ ...f, whatsapp: v }))} />

                  <View style={s.botonesEdicion}>
                    <TouchableOpacity style={[s.btnSec, { flex: 1 }]} onPress={() => setEditando(false)} disabled={guardando}>
                      <Text style={s.btnSecTxt}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.btnPri, { flex: 1, marginTop: 0 }, guardando && { opacity: 0.6 }]} onPress={guardar} disabled={guardando}>
                      {guardando
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={s.btnPriTxt}>Guardar</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Fila label="Nombre" valor={nombreCompleto} />
                  <Fila label="DUI" valor={cliente.dui} />
                  <Fila label="NIT" valor={cliente.nit} />
                  <Fila label="Teléfono" valor={cliente.telefono_normal} onPress={cliente.telefono_normal ? () => llamar(cliente.telefono_normal) : null} />
                  <Fila label="WhatsApp" valor={cliente.telefono_whatsapp} onPress={cliente.telefono_whatsapp ? () => abrirWhatsApp(cliente.telefono_whatsapp) : null} />
                  <Fila label="Correo" valor={cliente.email} />
                  <Fila label="Dirección" valor={direccion} />
                  <Fila label="Saldo pendiente" valor={fmt(cliente.saldo)} />
                  {Number(cliente.limite_credito) > 0 && <Fila label="Límite de crédito" valor={fmt(cliente.limite_credito)} />}

                  <TouchableOpacity style={s.btnPri} onPress={empezarEdicion}>
                    <Text style={s.btnPriTxt}>✏️  Editar nombre y teléfonos</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  box: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%', minHeight: 260 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  titulo: { fontSize: 17, fontWeight: '800', color: '#1a1a1a' },
  cerrar: { fontSize: 20, color: '#aaa' },
  centro: { alignItems: 'center', justifyContent: 'center', padding: 36 },
  errorTxt: { color: '#555', textAlign: 'center', fontSize: 14, marginBottom: 14 },

  fila: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f3f3f3' },
  filaLabel: { width: 118, color: '#888', fontSize: 13 },
  filaValor: { flex: 1, color: '#1a1a1a', fontWeight: '600', fontSize: 14 },
  filaLink: { color: '#1565C0', textDecorationLine: 'underline' },

  inputLabel: { color: '#666', fontSize: 12, fontWeight: '700', marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#1a1a1a' },
  botonesEdicion: { flexDirection: 'row', gap: 10, marginTop: 20 },

  btnPri: { backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  btnPriTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnSec: { borderWidth: 1.5, borderColor: '#bbb', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 0 },
  btnSecTxt: { color: '#444', fontWeight: '700', fontSize: 14 },
  btnReintentar: { backgroundColor: '#1565C0', borderRadius: 10, paddingHorizontal: 22, paddingVertical: 11 },
  btnReintentarTxt: { color: '#fff', fontWeight: '800' },
});
