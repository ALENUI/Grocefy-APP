import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import type * as WidgetLibrary from 'react-native-android-widget';
import type * as ToBuyWidgetModule from './ToBuyWidget';

/**
 * react-native-android-widget throws as soon as it is imported when its native module is missing (Expo Go, iOS), so
 * it, and the widget built with it, are loaded only on Android builds that include it.
 */
export function loadWidget(): { library: typeof WidgetLibrary; widget: typeof ToBuyWidgetModule } | null {
  if (Platform.OS !== 'android' || !(TurboModuleRegistry.get('AndroidWidget') || NativeModules.AndroidWidget)) return null;
  /* eslint-disable @typescript-eslint/no-require-imports */
  return { library: require('react-native-android-widget'), widget: require('./ToBuyWidget') };
  /* eslint-enable @typescript-eslint/no-require-imports */
}
