import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import NuevaVentaScreen from '../screens/NuevaVentaScreen';
import CrearClienteScreen from '../screens/CrearClienteScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { user, initialized } = useAuth();

  if (!initialized) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {user ? (
        <>
          <Stack.Screen name="Home"           component={HomeScreen} />
          <Stack.Screen name="CrearCliente" component={CrearClienteScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="NuevaVenta"      component={NuevaVentaScreen} options={{ animation: 'slide_from_right' }} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
