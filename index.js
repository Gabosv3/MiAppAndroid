import { registerRootComponent } from 'expo';

import App from './App';

// En producción cada console.log serializa objetos y cuesta CPU/RAM en
// teléfonos de 3 GB; se silencian log/info/debug (warn y error se conservan).
if (!__DEV__) {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
