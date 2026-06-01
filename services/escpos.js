import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// NOTE: This file is a thin wrapper around a native ESC/POS Bluetooth library.
// You must install a native module (example: react-native-bluetooth-escpos-printer)
// and rebuild the app (expo prebuild + native build or eject + react-native run-android).

const { BluetoothManager, BluetoothEscposPrinter } = NativeModules || {};
const { AonPrinter } = NativeModules || {};

const STORAGE_KEY_LAST_PRINTER = '@pos:last_printer_address';

function ensureNative() {
  if (!BluetoothManager || !BluetoothEscposPrinter) {
    throw new Error('Módulo nativo de impresión no instalado. Instala "react-native-bluetooth-escpos-printer" y reconstruye la app.');
  }
}

export async function listBluetoothDevices() {
  ensureNative();
  // many libs return a single string or an object; we normalize if possible
  const res = await BluetoothManager.scanDevices();
  try {
    const parsed = typeof res === 'string' ? JSON.parse(res) : res;
    // parsed may contain paired and found lists
    const devices = parsed?.paired || parsed?.devices || parsed || [];
    return devices;
  } catch (e) {
    return res;
  }
}

export async function savePrinterAddress(address) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_LAST_PRINTER, String(address));
    return true;
  } catch (e) {
    return false;
  }
}

export async function getSavedPrinterAddress() {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY_LAST_PRINTER);
    return v;
  } catch (e) {
    return null;
  }
}

export async function connect(address) {
  ensureNative();
  return BluetoothManager.connect(address);
}

export async function disconnect() {
  ensureNative();
  return BluetoothManager.disconnect();
}

export async function printText(text, options = {}) {
  ensureNative();
  // Example usage for react-native-bluetooth-escpos-printer
  // BluetoothEscposPrinter.printerAlign(options.align || 'left');
  // BluetoothEscposPrinter.printText(text + '\n', {});
  return BluetoothEscposPrinter.printText(text + '\n', {});
}

export async function printSaleEscPos(sale = {}) {
  ensureNative();
  // Basic ESC/POS print flow using BluetoothEscposPrinter methods (may vary by library)
  const lines = [];
  lines.push('\n');
  lines.push('Distribuidora Birancesco Menijvar\n');
  lines.push(`Venta: ${sale.numero_venta || ''}\n`);
  lines.push(`Fecha: ${sale.fecha_venta || ''}\n`);
  lines.push('-----------------------------\n');
  (sale.detalles || []).forEach(d => {
    const name = d.nombre || d.producto?.nombre || `ID:${d.producto_id || ''}`;
    const qty = d.cantidad || 1;
    const price = Number(d.precio_unitario || d.precio_venta || 0).toFixed(2);
    lines.push(`${name}\n${qty} x ${price}\n`);
  });
  lines.push('-----------------------------\n');
  lines.push(`TOTAL: ${sale.total || ''}\n`);
  lines.push('\n\n');

  // Send lines sequentially
  for (const ln of lines) {
    await BluetoothEscposPrinter.printText(ln, {});
  }

  // Some libs have paperCut or feed commands; try to feed
  try { await BluetoothEscposPrinter.printAndFeed(3); } catch (e) { /* ignore if not available */ }

  return true;
}

// --- Network / USB helpers (stubs) ---------------------------------
export async function printNetwork(addressWithPort, sale = {}) {
  // Example addressWithPort: '192.168.1.100:9100'
  // This implementation uses react-native-tcp-socket to open a TCP socket
  // to the printer and send raw ESC/POS bytes. The package must be
  // installed in the project: `yarn add react-native-tcp-socket` and
  // rebuilt if required by your workflow.
  try {
    const parts = String(addressWithPort || '').split(':');
    const host = parts[0];
    const port = parseInt(parts[1] || '9100', 10) || 9100;
    if (!host) throw new Error('Dirección inválida para printNetwork');

    const TcpSocket = require('react-native-tcp-socket');

    const escposLines = [];
    escposLines.push('\x1B\x40'); // Initialize printer
    escposLines.push('\n');
    escposLines.push('Distribuidora Birancesco Menijvar\n');
    escposLines.push(`Venta: ${sale.numero_venta || ''}\n`);
    escposLines.push(`Fecha: ${sale.fecha_venta || ''}\n`);
    escposLines.push('-----------------------------\n');
    (sale.detalles || []).forEach(d => {
      const name = d.nombre || d.producto?.nombre || `ID:${d.producto_id || ''}`;
      const qty = d.cantidad || 1;
      const price = Number(d.precio_unitario || d.precio_venta || 0).toFixed(2);
      escposLines.push(`${name}\n${qty} x ${price}\n`);
    });
    escposLines.push('-----------------------------\n');
    escposLines.push(`TOTAL: ${sale.total || ''}\n`);
    escposLines.push('\n\n');
    escposLines.push('\x1B\x64\x03'); // feed
    escposLines.push('\x1D\x56\x00'); // cut (may vary by printer)

    const payload = escposLines.join('');

    return await new Promise((resolve, reject) => {
      const client = TcpSocket.createConnection({ port, host, tls: false }, () => {
        try {
          client.write(payload, 'binary');
          // give printer brief time then close
          setTimeout(() => {
            try { client.destroy(); } catch (_) {}
            resolve(true);
          }, 300);
        } catch (e) {
          try { client.destroy(); } catch (_) {}
          reject(e);
        }
      });
      client.on('error', err => {
        try { client.destroy(); } catch (_) {}
        reject(err);
      });
      // safety timeout
      setTimeout(() => {
        try { client.destroy(); } catch (_) {}
        reject(new Error('Timeout conectando a impresora TCP')); 
      }, 5000);
    });
  } catch (e) {
    throw new Error(e?.message || 'Error en printNetwork');
  }
}

export async function printUsb(identifier, sale = {}) {
  // identifier puede ser un path o descriptor provisto por el módulo nativo
  throw new Error('Impresión USB no implementada en JS. Debes instalar un módulo nativo que exponga impresión por USB y adaptar este archivo.');
}

// --- Internal AON PAM1 printer helper (calls native bridge) ----------
export async function printInternalAon(sale = {}) {
  if (!AonPrinter) {
    throw new Error('Módulo nativo AonPrinter no encontrado. Implementa el bridge nativo Android que use el SDK de AON PAM1.');
  }

  // Prefer a high-level method if exposed by the native module
  if (typeof AonPrinter.printReceipt === 'function') {
    // enviar objeto serializado; el bridge nativo puede parsearlo
    return AonPrinter.printReceipt(JSON.stringify(sale));
  }

  // Fallback: intentar enviar texto RAW si el módulo lo expone
  if (typeof AonPrinter.printText === 'function') {
    const lines = [];
    lines.push('\n');
    lines.push('Distribuidora Birancesco Menijvar\n');
    lines.push(`Venta: ${sale.numero_venta || ''}\n`);
    lines.push(`Fecha: ${sale.fecha_venta || ''}\n`);
    lines.push('-----------------------------\n');
    (sale.detalles || []).forEach(d => {
      const name = d.nombre || d.producto?.nombre || `ID:${d.producto_id || ''}`;
      const qty = d.cantidad || 1;
      const price = Number(d.precio_unitario || d.precio_venta || 0).toFixed(2);
      lines.push(`${name}\n${qty} x ${price}\n`);
    });
    lines.push('-----------------------------\n');
    lines.push(`TOTAL: ${sale.total || ''}\n`);
    lines.push('\n\n');
    const text = lines.join('');
    return AonPrinter.printText(text);
  }

  throw new Error('El módulo nativo AonPrinter existe pero no expone métodos conocidos (printReceipt/printText).');
}

export default {
  listBluetoothDevices,
  connect,
  disconnect,
  savePrinterAddress,
  getSavedPrinterAddress,
  printText,
  printSaleEscPos,
  printNetwork,
  printUsb,
  printInternalAon,
};
