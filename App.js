import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConnectivityProvider } from './services/connectivity';
import AppNavigator from './navigation/AppNavigator';
import AppLockOverlay from './components/AppLockOverlay';

function AppContent() {
  const { user } = useAuth();
  return (
    <>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
      {/* Solo se monta con sesión iniciada — nada que proteger antes del login */}
      {user && <AppLockOverlay />}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ConnectivityProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </ConnectivityProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
