import AsyncStorage from '@react-native-async-storage/async-storage';

const DEBUG_LOGS_KEY = 'debug_logs';
const MAX_LOGS = 100;

export const addDebugLog = async (message, data = null) => {
  try {
    const timestamp = new Date().toLocaleTimeString();
    const log = {
      id: Date.now(),
      timestamp,
      message,
      data,
    };

    const logsRaw = await AsyncStorage.getItem(DEBUG_LOGS_KEY);
    let logs = logsRaw ? JSON.parse(logsRaw) : [];

    logs.push(log);

    // Mantener solo los últimos MAX_LOGS
    if (logs.length > MAX_LOGS) {
      logs = logs.slice(-MAX_LOGS);
    }

    await AsyncStorage.setItem(DEBUG_LOGS_KEY, JSON.stringify(logs));
    console.log(`[${timestamp}] ${message}`, data);
  } catch (error) {
    console.warn('Error guardando debug log:', error);
  }
};

export const getDebugLogs = async () => {
  try {
    const logsRaw = await AsyncStorage.getItem(DEBUG_LOGS_KEY);
    return logsRaw ? JSON.parse(logsRaw) : [];
  } catch (error) {
    console.warn('Error leyendo debug logs:', error);
    return [];
  }
};

export const clearDebugLogs = async () => {
  try {
    await AsyncStorage.removeItem(DEBUG_LOGS_KEY);
  } catch (error) {
    console.warn('Error limpiando debug logs:', error);
  }
};
