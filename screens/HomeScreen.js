import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  Platform,
  RefreshControl,
  Modal,
  Alert,
  Image,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import * as localDb from '../services/localDb';
import * as offlineQueue from '../services/offlineQueue';
import CustomDrawer from '../navigation/CustomDrawerContent';
import { useConnectivity } from '../services/connectivity';
import { getDebugLogs, clearDebugLogs } from '../services/debugLog';

export default function HomeScreen({ navigation }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [offlineStatus, setOfflineStatus] = useState('');
  const [downloadedCount, setDownloadedCount] = useState({ categories: 0, products: 0, clients: 0 });
  const [queueCount, setQueueCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [debugModalVisible, setDebugModalVisible] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]);
  const [debugTitle, setDebugTitle] = useState(0);

  // Estado mejorado para estadísticas
  const [stats, setStats] = useState({
    products: { value: null, loading: true },
    stock: { value: null, loading: true },
    movements: { value: null, loading: true },
    alerts: { value: null, loading: true }
  });

  const lastSyncRef = useRef(0);
  const SYNC_INTERVAL = 30000; // 30 segundos

  const openDebugModal = async () => {
    const logs = await getDebugLogs();
    const summary = await localDb.getOfflineSummary();
    setDebugLogs(logs);
    setDebugModalVisible(true);
  };

  const handleTitlePress = () => {
    setDebugTitle(prev => {
      if (prev >= 4) {
        openDebugModal();
        return 0;
      }
      return prev + 1;
    });
  };

  const loadQueueCount = async () => {
    try {
      const count = await offlineQueue.getQueueCount();
      setQueueCount(count);
    } catch (err) {
      console.warn('Error cargando cola offline:', err);
    }
  };

  const loadStats = async () => {
    setStats({
      products:  { value: null, loading: false },
      stock:     { value: null, loading: false },
      movements: { value: null, loading: false },
      alerts:    { value: 0,    loading: false },
    });
  };

  const syncOfflineQueue = async () => {
    setSyncing(true);
    setOfflineStatus('⏳ Sincronizando con servidor...');

    try {
      // Timeout de 30 segundos para toda la sincronización
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout - La sincronización tardó demasiado')), 30000)
      );

      const syncPromise = offlineQueue.syncQueue();
      const result = await Promise.race([syncPromise, timeoutPromise]);

      if (result.total === 0) {
        setOfflineStatus('ℹ️ Sin pedidos pendientes');
      } else if (result.synced === result.total) {
        setOfflineStatus(`✅ ${result.synced} venta(s) sincronizada(s) correctamente`);
      } else if (result.synced > 0) {
        setOfflineStatus(`⚠️ ${result.synced}/${result.total} sincronizado(s). Pendientes: ${result.remaining}`);
      } else {
        setOfflineStatus(`❌ No se sincronizó nada. Verifica tu conexión`);
      }

      // Recargar estadísticas después de sincronizar
      if (result.synced > 0) {
        await loadStats();
      }
    } catch (err) {
      console.warn('Error sincronizando cola:', err);

      if (err.message?.includes('Timeout')) {
        setOfflineStatus('❌ Timeout - Verifica tu conexión y vuelve a intentar');
      } else {
        setOfflineStatus(`❌ Error: ${err.message || 'No se pudo sincronizar'}`);
      }
    } finally {
      setSyncing(false);
      loadQueueCount();
    }
  };

  const syncAsignacionHoy = async () => {
    setDownloading(true);
    setOfflineStatus('Sincronizando asignación de hoy...');
    try {
      const { data } = await api.get('/asignacion/hoy');
      const asignacion = data.asignacion;

      if (!asignacion?.productos || asignacion.productos.length === 0) {
        setOfflineStatus('No hay asignación activa para hoy');
        return;
      }

      // Mapear productos de la asignación
      const mapped = asignacion.productos.map(p => ({
        id: p.producto_id,
        nombre: p.nombre,
        codigo: p.codigo || null,
        descripcion: null,
        unidad_medida: p.unidad_medida || null,
        precio_venta: Number(p.precio_venta ?? 0),
        precios_cuotas: p.precios_cuotas || null,
        stock_global: null,
        stock_asignado: Number(p.cantidad_asignada ?? 0),
        stock_disponible: Math.max(0, Number(p.cantidad_asignada ?? 0) - Number(p.cantidad_vendida ?? 0)),
        cantidad_vendida: Number(p.cantidad_vendida ?? 0),
        categoria: null,
        categoria_id: null,
        sucursal_id: asignacion.sucursal_id || 1,
        imagen: p.imagen || null,
        asignacion_detalle_id: p.id || null,
      }));

      await localDb.saveProducts(mapped);
      setDownloadedCount(prev => ({ ...prev, products: mapped.length }));
      setOfflineStatus(`✅ Asignación sincronizada (${mapped.length} productos)`);
    } catch (error) {
      console.warn('Error sincronizando asignación:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Error desconocido';
      setOfflineStatus(`Error: ${errorMessage}`);
    } finally {
      setDownloading(false);
    }
  };

  const downloadOfflineData = async () => {
    setDownloading(true);
    setOfflineStatus('Descargando datos...');
    try {
      await localDb.clearOfflineData();
      await localDb.initDb();
      const [catResponse, prodResponse, cliResponse] = await Promise.all([
        api.get('/categorias'),
        api.get('/productos?per_page=200'),
        api.get('/clientes?per_page=200'),
      ]);

      const categorias = Array.isArray(catResponse.data)
        ? catResponse.data
        : Array.isArray(catResponse.data?.data)
          ? catResponse.data.data
          : [];
      const productos = Array.isArray(prodResponse.data)
        ? prodResponse.data
        : Array.isArray(prodResponse.data?.data)
          ? prodResponse.data.data
          : [];
      const clientes = Array.isArray(cliResponse.data)
        ? cliResponse.data
        : Array.isArray(cliResponse.data?.data)
          ? cliResponse.data.data
          : [];

      await Promise.all([
        localDb.saveCategories(categorias),
        localDb.saveProducts(productos),
        localDb.saveClients(clientes),
      ]);

      setDownloadedCount({
        categories: categorias.length,
        products: productos.length,
        clients: clientes.length,
      });
      setOfflineStatus('Datos descargados y guardados localmente.');

      // Recargar estadísticas después de descargar
      await loadStats();
    } catch (error) {
      console.warn('Error descargando datos offline:', error);
      const errorMessage =
        error.response?.data?.message ||
        error.response?.statusText ||
        error.message ||
        'No se pudo descargar los datos. Revisa tu conexión.';
      setOfflineStatus(`Error: ${errorMessage}`);
    } finally {
      setDownloading(false);
    }
  };

  const clearOfflineCache = async () => {
    setClearingCache(true);
    setOfflineStatus('Limpiando cache offline...');
    try {
      await localDb.clearOfflineData();
      await offlineQueue.clearQueue();
      setDownloadedCount({ categories: 0, products: 0, clients: 0 });
      setOfflineStatus('Cache offline limpiada.');
      await loadQueueCount();
    } catch (error) {
      console.warn('Error limpiando cache offline:', error);
      setOfflineStatus(`Error limpiando cache: ${error.message || String(error)}`);
    } finally {
      setClearingCache(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadStats(), syncOfflineQueue(), loadQueueCount()]);
    } catch (error) {
      console.warn('Error en refresh:', error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadQueueCount();
    if (user) loadStats();
  }, [user]);

  useFocusEffect(useCallback(() => {
    loadQueueCount();
    
    const now = Date.now();
    if (now - lastSyncRef.current > SYNC_INTERVAL) {
      syncOfflineQueue();
      lastSyncRef.current = now;
    }
  }, []));

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

        <TouchableOpacity onPress={handleTitlePress} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image
            source={require('../assets/img/logo.png')}
            style={{ width: 40, height: 40, resizeMode: 'contain' }}
          />
          <View>
            <Text style={s.appBarTitle}>SIDB</Text>
            <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: -4 }}>Distribuidora</Text>
          </View>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[
            s.statusIndicator,
            { backgroundColor: isOnline ? '#10B981' : '#e53e3e' }
          ]}>
            <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>
              {isOnline ? '●' : '●'}
            </Text>
          </View>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{user?.name?.charAt(0) || 'U'}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} />
        }
      >
        {/* Saludo mejorado */}
        <View style={s.greetingCard}>
          <View style={s.greetingTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.greetingLabel}>Bienvenido,</Text>
              <Text style={s.greetingName}>{user?.name || 'Usuario'}</Text>
            </View>
            <Text style={s.greetingEmoji}>👋</Text>
          </View>
          <View style={s.greetingDivider} />
          <Text style={s.greetingDate}>
            {new Date().toLocaleDateString('es-SV', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            }).charAt(0).toUpperCase() + new Date().toLocaleDateString('es-SV', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            }).slice(1)}
          </Text>
          {user?.sucursales?.[0] && (
            <Text style={s.sucursalBadge}>📍 {user.sucursales[0].nombre}</Text>
          )}
        </View>

        {/* Tarjetas de estadísticas mejoradas */}
        <Text style={s.sectionTitle}>
          Resumen general
          <Text style={s.sectionSubtitle}> · Hoy</Text>
        </Text>

        <View style={s.statsGrid}>
          {/* Productos */}
          <View style={s.statCard}>
            <View style={[s.statIconWrap, { backgroundColor: '#F5A62320' }]}>
              <Text style={s.statIcon}>🏷️</Text>
            </View>
            {stats.products.loading ? (
              <View style={s.skeleton}>
                <View style={s.skeletonLine} />
              </View>
            ) : (
              <>
                <Text style={[s.statValue, { color: '#F5A623' }]}>
                  {stats.products.value ?? '—'}
                </Text>
                <Text style={s.statLabel}>Productos activos</Text>
              </>
            )}
          </View>

          {/* Stock Total */}
          <View style={s.statCard}>
            <View style={[s.statIconWrap, { backgroundColor: '#4CAF5020' }]}>
              <Text style={s.statIcon}>📦</Text>
            </View>
            {stats.stock.loading ? (
              <View style={s.skeleton}>
                <View style={s.skeletonLine} />
              </View>
            ) : (
              <>
                <Text style={[s.statValue, { color: '#4CAF50' }]}>
                  {stats.stock.value ?? '—'}
                </Text>
                <Text style={s.statLabel}>Unidades en stock</Text>
              </>
            )}
          </View>

          {/* Movimientos Hoy */}
          <View style={s.statCard}>
            <View style={[s.statIconWrap, { backgroundColor: '#2196F320' }]}>
              <Text style={s.statIcon}>🔄</Text>
            </View>
            {stats.movements.loading ? (
              <View style={s.skeleton}>
                <View style={s.skeletonLine} />
              </View>
            ) : (
              <>
                <Text style={[s.statValue, { color: '#2196F3' }]}>
                  {stats.movements.value ?? '—'}
                </Text>
                <Text style={s.statLabel}>Movimientos hoy</Text>
              </>
            )}
          </View>

          {/* Alertas */}
          <View style={[s.statCard, stats.alerts.value > 0 && s.alertCard]}>
            <View style={[s.statIconWrap, { backgroundColor: stats.alerts.value > 0 ? '#e53e3e20' : '#10B98120' }]}>
              <Text style={s.statIcon}>{stats.alerts.value > 0 ? '⚠️' : '✅'}</Text>
            </View>
            {stats.alerts.loading ? (
              <View style={s.skeleton}>
                <View style={s.skeletonLine} />
              </View>
            ) : (
              <>
                <Text style={[s.statValue, { color: stats.alerts.value > 0 ? '#e53e3e' : '#10B981' }]}>
                  {stats.alerts.value > 0 ? stats.alerts.value : '0'}
                </Text>
                <Text style={s.statLabel}>
                  {stats.alerts.value > 0 ? 'Alertas activas' : 'Sin alertas'}
                </Text>
                {stats.alerts.value > 0 && (
                  <TouchableOpacity style={s.viewAlertsBtn}>
                    <Text style={s.viewAlertsText}>Ver detalles →</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>

        {/* KPI Adicionales - Tarjeta de resumen rápido */}
        <View style={s.kpiCard}>
          <View style={s.kpiRow}>
            <View style={s.kpiItem}>
              <Text style={s.kpiValue}>
                {stats.products.loading ? '—' : (stats.products.value ?? '—')}
              </Text>
              <Text style={s.kpiLabel}>Productos activos</Text>
            </View>
            <View style={s.kpiDivider} />
            <View style={s.kpiItem}>
              <Text style={s.kpiValue}>
                {stats.movements.loading ? '—' : (stats.movements.value ?? '—')}
              </Text>
              <Text style={s.kpiLabel}>Movimientos hoy</Text>
            </View>
          </View>
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

        <Text style={s.sectionTitle}>Acciones rápidas</Text>
        <View style={s.actionGrid}>
          <TouchableOpacity
            style={s.actionCard}
            onPress={() => navigation.navigate('CrearCliente')}
            activeOpacity={0.85}
          >
            <Text style={s.actionIcon}>👤</Text>
            <Text style={s.actionTitle}>Crear cliente</Text>
            <Text style={s.actionSubtitle}>Registrar nuevo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.actionCard}
            onPress={downloadOfflineData}
            activeOpacity={0.85}
            disabled={downloading}
          >
            <Text style={s.actionIcon}>{downloading ? '⏳' : '📥'}</Text>
            <Text style={s.actionTitle}>
              {downloading ? 'Descargando...' : 'Descargar'}
            </Text>
            <Text style={s.actionSubtitle}>
              {downloading ? 'Guardando...' : 'Datos offline'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.actionCard}
            onPress={syncAsignacionHoy}
            activeOpacity={0.85}
            disabled={downloading}
          >
            <Text style={s.actionIcon}>{downloading ? '⏳' : '📋'}</Text>
            <Text style={s.actionTitle}>
              {downloading ? 'Sincronizando...' : 'Asignación'}
            </Text>
            <Text style={s.actionSubtitle}>
              {downloading ? 'Actualizando...' : 'Hoy'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.actionCard}
            onPress={syncOfflineQueue}
            activeOpacity={0.85}
            disabled={syncing}
          >
            <Text style={s.actionIcon}>{syncing ? '⏳' : '🔄'}</Text>
            <Text style={s.actionTitle}>
              {syncing ? 'Sincronizando...' : 'Sincronizar'}
            </Text>
            {queueCount > 0 && (
              <View style={s.badge}>
                <Text style={s.badgeText}>{queueCount}</Text>
              </View>
            )}
            {queueCount === 0 && (
              <Text style={s.actionSubtitle}>Sin pendientes</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={s.actionCard}
            onPress={clearOfflineCache}
            activeOpacity={0.85}
            disabled={clearingCache}
          >
            <Text style={s.actionIcon}>{clearingCache ? '⏳' : '🧹'}</Text>
            <Text style={s.actionTitle}>
              {clearingCache ? 'Limpiando...' : 'Limpiar'}
            </Text>
            <Text style={s.actionSubtitle}>
              {clearingCache ? 'Borrando...' : 'Cache local'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.actionCard} activeOpacity={0.85} disabled>
            <Text style={s.actionIcon}>⭐</Text>
            <Text style={s.actionTitle}>Próximo</Text>
            <Text style={s.actionSubtitle}>Función futura</Text>
          </TouchableOpacity>
        </View>

        {/* Estado offline y resumen de descarga */}
        {offlineStatus ? (
          <View style={s.statusCard}>
            <Text style={s.statusIcon}>{offlineStatus.includes('Error') ? '⚠️' : '✅'}</Text>
            <Text style={[s.offlineStatus, offlineStatus.includes('Error') && s.errorText]}>
              {offlineStatus}
            </Text>
          </View>
        ) : null}

        {downloadedCount.categories + downloadedCount.products + downloadedCount.clients > 0 && (
          <View style={s.downloadSummary}>
            <Text style={s.downloadSummaryTitle}>📥 Datos almacenados localmente</Text>
            <View style={s.downloadSummaryGrid}>
              <View style={s.downloadSummaryItem}>
                <Text style={s.downloadSummaryNumber}>{downloadedCount.categories}</Text>
                <Text style={s.downloadSummaryLabel}>Categorías</Text>
              </View>
              <View style={s.downloadSummaryItem}>
                <Text style={s.downloadSummaryNumber}>{downloadedCount.products}</Text>
                <Text style={s.downloadSummaryLabel}>Productos</Text>
              </View>
              <View style={s.downloadSummaryItem}>
                <Text style={s.downloadSummaryNumber}>{downloadedCount.clients}</Text>
                <Text style={s.downloadSummaryLabel}>Clientes</Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Menú lateral con Animated nativo */}
      {drawerOpen && (
        <CustomDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
      )}

      {/* Modal de Debug */}
      <Modal
        visible={debugModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDebugModalVisible(false)}
      >
        <View style={s.debugModal}>
          <View style={s.debugHeader}>
            <Text style={s.debugTitle}>🔍 Panel de Debug</Text>
            <TouchableOpacity onPress={() => setDebugModalVisible(false)}>
              <Text style={s.debugClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.debugContent} showsVerticalScrollIndicator={false}>
            <Text style={s.debugSectionTitle}>📋 Logs (Últimos 50)</Text>
            {debugLogs.length === 0 ? (
              <Text style={s.debugText}>Sin logs aún</Text>
            ) : (
              debugLogs.map(log => (
                <View key={log.id} style={s.debugLogItem}>
                  <Text style={s.debugLogTime}>{log.timestamp}</Text>
                  <Text style={s.debugLogMsg}>{log.message}</Text>
                  {log.data && (
                    <View style={s.debugDataTable}>
                      {Array.isArray(log.data) ? (
                        <View>
                          <View style={s.tableRow}>
                            <Text style={[s.tableCell, s.tableHeader, { flex: 2 }]}>Producto</Text>
                            <Text style={[s.tableCell, s.tableHeader, { flex: 1 }]}>Asignada</Text>
                            <Text style={[s.tableCell, s.tableHeader, { flex: 1 }]}>Vendida</Text>
                            <Text style={[s.tableCell, s.tableHeader, { flex: 1 }]}>Disponible</Text>
                          </View>
                          {log.data.map((p, idx) => (
                            <View key={idx} style={s.tableRow}>
                              <Text style={[s.tableCell, { flex: 2 }]}>{p.nombre}</Text>
                              <Text style={[s.tableCell, { flex: 1 }]}>{p.stock_asignado || 0}</Text>
                              <Text style={[s.tableCell, { flex: 1 }]}>{p.cantidad_vendida || 0}</Text>
                              <Text style={[s.tableCell, { flex: 1, color: p.stock_disponible === 0 ? '#e53e3e' : '#10B981' }]}>{p.stock_disponible || 0}</Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={s.debugLogData}>{JSON.stringify(log.data, null, 2)}</Text>
                      )}
                    </View>
                  )}
                </View>
              ))
            )}

            <TouchableOpacity
              style={s.debugButton}
              onPress={async () => {
                await clearDebugLogs();
                setDebugLogs([]);
                Alert.alert('✅', 'Logs limpiados');
              }}
            >
              <Text style={s.debugButtonText}>Limpiar logs</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
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
    justifyContent: 'space-between',
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 12 : 52,
    paddingBottom: 16,
    paddingHorizontal: 14,
    gap: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
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
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
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
  
  // Greeting Card
  greetingCard: {
    backgroundColor: '#0d0d0d',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  greetingTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  greetingLabel: {
    color: '#888',
    fontSize: 13,
    marginBottom: 6,
    lineHeight: 16,
  },
  greetingName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
  },
  greetingEmoji: {
    fontSize: 28,
    marginRight: -4,
  },
  greetingDivider: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginBottom: 12,
  },
  greetingDate: {
    color: '#666',
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 16,
    textTransform: 'capitalize',
  },
  sucursalBadge: {
    color: '#F5A623',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: '#F5A62310',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  
  // Sections
  sectionTitle: {
    color: c.textSec,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    lineHeight: 16,
    marginBottom: 14,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  sectionSubtitle: {
    color: c.textMuted,
    fontSize: 10,
    fontWeight: '400',
  },
  
  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 16,
    width: '47%',
    elevation: 2,
    borderWidth: 1.5,
    borderColor: c.border,
    overflow: 'hidden',
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
  
  // Skeletons
  skeleton: {
    marginVertical: 8,
  },
  skeletonLine: {
    height: 32,
    width: '80%',
    backgroundColor: c.border,
    borderRadius: 8,
    opacity: 0.3,
  },
  
  // Trends
  statTrend: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  trendUp: {
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: '700',
  },
  trendPeriod: {
    color: c.textMuted,
    fontSize: 10,
  },
  
  // Progress Bar
  statProgress: {
    marginTop: 8,
    height: 4,
    backgroundColor: c.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  progressLabel: {
    color: c.textMuted,
    fontSize: 10,
    marginTop: 4,
  },
  
  // Time Indicator
  statTime: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  timeIcon: {
    fontSize: 10,
  },
  timeText: {
    color: c.textMuted,
    fontSize: 10,
  },
  
  // Alert Card
  alertCard: {
    borderWidth: 1,
    borderColor: '#e53e3e40',
    backgroundColor: '#e53e3e08',
  },
  viewAlertsBtn: {
    marginTop: 8,
    paddingVertical: 4,
  },
  viewAlertsText: {
    color: '#e53e3e',
    fontSize: 11,
    fontWeight: '600',
  },
  
  // KPI Card
  kpiCard: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: c.border,
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  kpiItem: {
    flex: 1,
    alignItems: 'center',
  },
  kpiDivider: {
    width: 1,
    height: 40,
    backgroundColor: c.border,
  },
  kpiValue: {
    color: c.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  kpiLabel: {
    color: c.textMuted,
    fontSize: 11,
  },
  
  // Action Grid
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },
  actionCard: {
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: 14,
    width: '48%',
    minHeight: 120,
    justifyContent: 'space-between',
    elevation: 2,
    borderWidth: 1,
    borderColor: c.border,
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  actionTitle: {
    color: c.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  actionSubtitle: {
    color: c.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  
  // Badge
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    backgroundColor: c.accent,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  badgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
  },
  
  // POS Button
  posBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1565C0',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    gap: 14,
    elevation: 8,
    shadowColor: '#1565C0',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    boxShadow: Platform.OS === 'web' ? '0px 6px 16px rgba(21, 101, 192, 0.3)' : undefined,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  posIcon: { fontSize: 36 },
  posLabel: { color: '#fff', fontSize: 16, fontWeight: '800' },
  posDesc: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  
  // Status Card
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: c.border,
  },
  statusIcon: {
    fontSize: 20,
  },
  offlineStatus: {
    flex: 1,
    color: c.text,
    fontSize: 13,
  },
  errorText: {
    color: '#e53e3e',
  },
  
  // Download Summary
  downloadSummary: {
    backgroundColor: '#10B98110',
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#10B98130',
  },
  downloadSummaryTitle: {
    color: c.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  downloadSummaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  downloadSummaryItem: {
    alignItems: 'center',
  },
  downloadSummaryNumber: {
    color: '#10B981',
    fontSize: 20,
    fontWeight: '800',
  },
  downloadSummaryLabel: {
    color: c.textMuted,
    fontSize: 11,
    marginTop: 4,
  },

  // Debug Modal
  debugModal: {
    flex: 1,
    backgroundColor: c.bg,
    paddingTop: StatusBar.currentHeight || 0,
  },
  debugHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.headerBg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  debugTitle: {
    color: c.text,
    fontSize: 16,
    fontWeight: '700',
  },
  debugClose: {
    color: c.text,
    fontSize: 20,
    fontWeight: '700',
  },
  debugContent: {
    flex: 1,
    padding: 16,
  },
  debugSectionTitle: {
    color: c.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  debugText: {
    color: c.textMuted,
    fontSize: 12,
  },
  debugLogItem: {
    backgroundColor: c.surface,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: c.border,
  },
  debugLogTime: {
    color: '#F5A623',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  debugLogMsg: {
    color: c.text,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  debugLogData: {
    color: c.textMuted,
    fontSize: 10,
    fontFamily: 'monospace',
  },
  debugDataTable: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  tableCell: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    fontSize: 11,
    color: c.textMuted,
  },
  tableHeader: {
    backgroundColor: c.accent + '20',
    color: c.accent,
    fontWeight: '700',
    paddingVertical: 10,
  },
  debugButton: {
    backgroundColor: c.accent,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  debugButtonText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 12,
  },
});