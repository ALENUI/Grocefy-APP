// App entry: Expo Router, plus the background task that draws the Android home-screen widget.
import 'expo-router/entry';
import { registerWidget } from './src/widget';

registerWidget();
