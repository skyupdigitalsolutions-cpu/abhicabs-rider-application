/**
 * babel.config.js
 *
 * You had no babel.config.js before (Expo used its default preset implicitly).
 * NativeWind needs an explicit one so it can add the `nativewind/babel` preset
 * and set `jsxImportSource: "nativewind"` on babel-preset-expo.
 *
 * Note: babel-preset-expo (SDK 54) auto-injects the react-native-reanimated /
 * worklets plugin when reanimated is installed, so you do NOT add it manually.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};