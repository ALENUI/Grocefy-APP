// ESLint flat config with Expo's rules (eslint-config-expo/flat, Expo SDK 57).
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/', 'node_modules/', '.expo/', 'supabase/functions/', 'src/services/database.types.ts', 'expo-env.d.ts'] },
  {
    // Several screens reset a sheet's form state in an effect when the sheet opens, which costs one extra render.
    // This React Compiler-era rule arrived with the SDK 57 lint config; refactor those sheets before turning it on.
    rules: { 'react-hooks/set-state-in-effect': 'off' }
  },
  // Node scripts (tests, tooling) run outside React Native.
  { files: ['scripts/**', 'eslint.config.js'], languageOptions: { globals: globals.node } }
]);
