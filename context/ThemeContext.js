import React, { createContext, useContext, useState } from 'react';
import { useColorScheme } from 'react-native';

const ThemeContext = createContext();

export const darkColors = {
  mode: 'dark',
  bg: '#0d0d0d',
  surface: '#1a1a1a',
  surfaceAlt: '#222222',
  border: '#2e2e2e',
  text: '#ffffff',
  textSec: '#aaaaaa',
  textMuted: '#555555',
  accent: '#F5A623',
  drawerBg: '#111111',
  headerBg: '#111111',
  statusBar: 'light-content',
  statusBarBg: '#0d0d0d',
  inputLabel: '#666666',
  shadow: 'rgba(0,0,0,0.5)',
};

export const lightColors = {
  mode: 'light',
  bg: '#f0f0f0',
  surface: '#ffffff',
  surfaceAlt: '#fafafa',
  border: '#e0e0e0',
  text: '#111111',
  textSec: '#555555',
  textMuted: '#999999',
  accent: '#F5A623',
  drawerBg: '#ffffff',
  headerBg: '#ffffff',
  statusBar: 'dark-content',
  statusBarBg: '#f0f0f0',
  inputLabel: '#888888',
  shadow: 'rgba(0,0,0,0.1)',
};

export function ThemeProvider({ children }) {
  const system = useColorScheme();
  const [mode, setMode] = useState(system === 'light' ? 'light' : 'dark');

  const colors = mode === 'dark' ? darkColors : lightColors;
  const toggleTheme = () => setMode(m => (m === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ mode, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
