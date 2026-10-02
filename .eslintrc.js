// Expo SDK 52's lint config (ESLint 8). Move to a flat eslint.config.js with the next Expo SDK upgrade.
module.exports = {
  root: true,
  extends: 'expo',
  ignorePatterns: ['dist/', 'node_modules/', '.expo/', 'supabase/functions/', 'src/services/database.types.ts', 'expo-env.d.ts'],
  overrides: [{ files: ['scripts/**', '.eslintrc.js'], env: { node: true } }]
};
