import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import NuevaVentaScreen from '../screens/NuevaVentaScreen';
import CrearClienteScreen from '../screens/CrearClienteScreen';
import CobrosScreen from '../screens/CobrosScreen';
import DetalleClienteScreen from '../screens/DetalleClienteScreen';
import RegistrarPagoScreen from '../screens/RegistrarPagoScreen';
import PagoRegistradoScreen from '../screens/PagoRegistradoScreen';
import MapaCobrosScreen from '../screens/MapaCobrosScreen';
import HistorialDiaScreen from '../screens/HistorialDiaScreen';
import HistorialVentasScreen from '../screens/HistorialVentasScreen';
import VentaRegistradaScreen from '../screens/VentaRegistradaScreen';
import ReintegrosScreen from '../screens/ReintegrosScreen';
import RegistrarVisitaScreen from '../screens/RegistrarVisitaScreen';
import RegistrarGastoScreen from '../screens/RegistrarGastoScreen';
import MisValesScreen from '../screens/MisValesScreen';

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
          <Stack.Screen name="Home"            component={HomeScreen} />
          <Stack.Screen name="CrearCliente"    component={CrearClienteScreen}    options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="NuevaVenta"      component={NuevaVentaScreen}      options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="Cobros"          component={CobrosScreen}          options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="DetalleCliente"  component={DetalleClienteScreen}  options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="RegistrarPago"   component={RegistrarPagoScreen}   options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="PagoRegistrado"  component={PagoRegistradoScreen}  options={{ animation: 'fade' }} />
          <Stack.Screen name="MapaCobros"      component={MapaCobrosScreen}      options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="HistorialDia"    component={HistorialDiaScreen}     options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="HistorialVentas"   component={HistorialVentasScreen}   options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="VentaRegistrada"  component={VentaRegistradaScreen}   options={{ animation: 'fade' }} />
          <Stack.Screen name="Reintegros"       component={ReintegrosScreen}       options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="RegistrarVisita"  component={RegistrarVisitaScreen}  options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="RegistrarGasto"   component={RegistrarGastoScreen}   options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="MisVales"         component={MisValesScreen}         options={{ animation: 'slide_from_right' }} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
