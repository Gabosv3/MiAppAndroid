import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDebugLog } from './debugLog';

let SQLite = null;
let db = null;
let dbInitPromise = null;
const isWeb = Platform.OS === 'web';

const STORAGE_KEYS = {
  categories: 'offline_categories',
  products: 'offline_products',
  clients: 'offline_clients',
};

const loadSQLiteModule = () => {
  if (isWeb) return null;
  if (SQLite) return SQLite;

  try {
    const sqliteModule = require('expo-sqlite');
    SQLite = sqliteModule?.default || sqliteModule;
    return SQLite;
  } catch (error) {
    console.warn('expo-sqlite no disponible:', error);
    SQLite = null;
    return null;
  }
};

const openDatabase = async () => {
  const sqlite = loadSQLiteModule();
  if (!sqlite) return null;

  if (db) return db;

  try {
    if (sqlite.openDatabaseAsync) {
      db = await sqlite.openDatabaseAsync('miapp_offline.db');
      return db;
    }

    if (sqlite.openDatabaseSync) {
      db = sqlite.openDatabaseSync('miapp_offline.db');
      return db;
    }

    if (sqlite.openDatabase) {
      db = sqlite.openDatabase('miapp_offline.db');
      return db;
    }

    console.warn('expo-sqlite no exporta openDatabaseAsync/openDatabaseSync/openDatabase', Object.keys(sqlite || {}));
  } catch (error) {
    console.warn('Error abriendo SQLite, usando fallback AsyncStorage:', error);
  }

  db = null;
  return null;
};

const ensureDb = async () => {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = openDatabase().finally(() => {
    dbInitPromise = null;
  });

  return dbInitPromise;
};

const isLegacyDatabase = (database) => typeof database.transaction === 'function';

const executeSqlLegacy = async (database, sql, params = []) => new Promise((resolve, reject) => {
  database.transaction(
    (tx) => {
      tx.executeSql(
        sql,
        params,
        (_, result) => resolve({
          rows: Array.isArray(result.rows?._array) ? result.rows._array : [],
          changes: result.rowsAffected ?? 0,
          insertId: result.insertId ?? null,
        }),
        (_, error) => {
          reject(error);
          return false;
        }
      );
    },
    reject
  );
});

const executeSqlModern = async (database, sql, params = []) => {
  const statement = await database.prepareAsync(sql);
  try {
    const result = await statement.executeAsync(...params);
    const rows = await result.getAllAsync();
    return {
      rows: Array.isArray(rows) ? rows : [],
      changes: result.changes ?? 0,
      insertId: result.lastInsertRowId ?? null,
    };
  } finally {
    await statement.finalizeAsync();
  }
};

const executeSql = async (sql, params = []) => {
  const database = await ensureDb();
  if (!database) {
    throw new Error('SQLite no disponible');
  }

  if (isLegacyDatabase(database)) {
    return executeSqlLegacy(database, sql, params);
  }

  return executeSqlModern(database, sql, params);
};

export const initDb = async () => {
  const database = await ensureDb();
  if (!database) return;

  try {
    await executeSql('CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, data TEXT)');
    await executeSql('CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, data TEXT)');
    await executeSql('CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, data TEXT)');
  } catch (error) {
    console.warn('Error inicializando SQLite, usando fallback AsyncStorage:', error);
    db = null;
  }
};

const saveStorage = async (key, items) => {
  await AsyncStorage.setItem(STORAGE_KEYS[key], JSON.stringify(items || []));
};

const getStorage = async (key) => {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS[key]);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Error parseando almacenamiento offline:', error);
    return [];
  }
};

const saveItemsToTable = async (table, key, items = []) => {
  await saveStorage(key, items);
  const database = await ensureDb();
  if (!database) {
    return;
  }

  try {
    await initDb();
    await executeSql(`DELETE FROM ${table}`);

    for (const item of items) {
      await executeSql(
        `INSERT OR REPLACE INTO ${table} (id, data) VALUES (?, ?)`,
        [String(item.id), JSON.stringify(item)]
      );
    }
  } catch (error) {
    console.warn(`Error guardando en SQLite (${table}), ya se guardó en AsyncStorage:`, error);
  }
};

export const saveCategories = async (categories = []) => {
  return saveItemsToTable('categories', 'categories', categories);
};

export const saveProducts = async (products = []) => {
  const productList = products.map(p => ({
    id: p.id,
    nombre: p.nombre,
    stock: p.stock,
    stock_disponible: p.stock_disponible,
    stock_asignado: p.stock_asignado,
    cantidad_vendida: p.cantidad_vendida,
    precio_venta: p.precio_venta,
  }));
  console.log(`📥 Guardando ${products.length} productos offline:`, productList);
  await addDebugLog(`📥 Guardando ${products.length} productos`, productList);
  return saveItemsToTable('products', 'products', products);
};

export const saveClients = async (clients = []) => {
  return saveItemsToTable('clients', 'clients', clients);
};

const loadItemsFromTable = async (table, key) => {
  const database = await ensureDb();
  if (!database) {
    return getStorage(key);
  }

  try {
    await initDb();
    const result = await executeSql(`SELECT data FROM ${table} ORDER BY id ASC`);
    return result.rows.map((row) => {
      try {
        return JSON.parse(row.data);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch (error) {
    console.warn(`Error leyendo desde SQLite (${table}), usando fallback AsyncStorage:`, error);
    return getStorage(key);
  }
};

export const getLocalCategories = async () => {
  return loadItemsFromTable('categories', 'categories');
};

export const getLocalProducts = async () => {
  const products = await loadItemsFromTable('products', 'products');
  const productList = products.map(p => ({
    id: p.id,
    nombre: p.nombre,
    stock: p.stock,
    stock_disponible: p.stock_disponible,
    stock_asignado: p.stock_asignado,
    cantidad_vendida: p.cantidad_vendida,
    precio_venta: p.precio_venta,
  }));
  console.log(`📤 Cargados ${products.length} productos offline:`, productList);
  await addDebugLog(`📤 Cargados ${products.length} productos`, productList);
  return products;
};

export const getLocalClients = async () => {
  return loadItemsFromTable('clients', 'clients');
};

const getCountFromTable = async (table) => {
  try {
    const result = await executeSql(`SELECT COUNT(*) AS count FROM ${table}`);
    return result.rows[0]?.count ?? 0;
  } catch (error) {
    console.warn(`Error obteniendo conteo de ${table}:`, error);
    return null;
  }
};

export const getOfflineSummary = async () => {
  const storageCounts = {
    categories: (await getStorage('categories')).length,
    products: (await getStorage('products')).length,
    clients: (await getStorage('clients')).length,
  };

  const database = await ensureDb();
  if (!database) {
    return {
      sqliteAvailable: false,
      storageCounts,
      sqliteCounts: null,
    };
  }

  const sqliteCounts = {
    categories: await getCountFromTable('categories'),
    products: await getCountFromTable('products'),
    clients: await getCountFromTable('clients'),
  };

  return {
    sqliteAvailable: true,
    storageCounts,
    sqliteCounts,
  };
};

export const clearOfflineData = async () => {
  try {
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
  } catch (error) {
    console.warn('Error limpiando AsyncStorage offline:', error);
  }

  const database = await ensureDb();
  if (!database) return;

  try {
    await executeSql('DELETE FROM categories');
    await executeSql('DELETE FROM products');
    await executeSql('DELETE FROM clients');
  } catch (error) {
    console.warn('Error limpiando SQLite offline:', error);
  }
};
