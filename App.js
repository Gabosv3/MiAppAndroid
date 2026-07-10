import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ConnectivityProvider } from './services/connectivity';
import AppNavigator from './navigation/AppNavigator';

export default function App() {
  return (
    <ThemeProvider>
      <ConnectivityProvider>
        <AuthProvider>
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
        </AuthProvider>
      </ConnectivityProvider>
    </ThemeProvider>
  );
}
