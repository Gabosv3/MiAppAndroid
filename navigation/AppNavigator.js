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
import DirectorioClientesScreen from '../screens/DirectorioClientesScreen';
import PerfilClienteScreen from '../screens/PerfilClienteScreen';
import AbonoGrupoRegistradoScreen from '../screens/AbonoGrupoRegistradoScreen';
import ReporteDiarioScreen from '../screens/ReporteDiarioScreen';
import RegistrarPreventaScreen from '../screens/RegistrarPreventaScreen';
import MisPreventasScreen from '../screens/MisPreventasScreen';
import CambiarPinScreen from '../screens/CambiarPinScreen';
import MiDesempenoScreen from '../screens/MiDesempenoScreen';
import RutasSupervisadasScreen from '../screens/RutasSupervisadasScreen';
import HistorialRutaSupervisadaScreen from '../screens/HistorialRutaSupervisadaScreen';
import RegistrarSupervisionScreen from '../screens/RegistrarSupervisionScreen';
import DesempenoCobradoresScreen from '../screens/DesempenoCobradoresScreen';
import EncuestaClienteScreen from '../screens/EncuestaClienteScreen';

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
          <Stack.Screen name="DirectorioClientes" component={DirectorioClientesScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="PerfilCliente"    component={PerfilClienteScreen}    options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="AbonoGrupoRegistrado" component={AbonoGrupoRegistradoScreen} options={{ animation: 'fade' }} />
          <Stack.Screen name="ReporteDiario"    component={ReporteDiarioScreen}    options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="RegistrarPreventa" component={RegistrarPreventaScreen} options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="MisPreventas"     component={MisPreventasScreen}     options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="CambiarPin"       component={CambiarPinScreen}       options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="MiDesempeno"      component={MiDesempenoScreen}      options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="RutasSupervisadas" component={RutasSupervisadasScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="HistorialRutaSupervisada" component={HistorialRutaSupervisadaScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="RegistrarSupervision" component={RegistrarSupervisionScreen} options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="DesempenoCobradores" component={DesempenoCobradoresScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="EncuestaCliente"  component={EncuestaClienteScreen}  options={{ animation: 'slide_from_bottom' }} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
