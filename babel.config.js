/**
 * babel.config.js
 *
 * NativeWind preset + a fix for Hermes dev-mode.
 *
 * WHY THE EXTRA PLUGINS:
 * babel-preset-expo (targeting Hermes) intentionally leaves private class
 * fields/methods (`#field`, `#method()`) untranspiled, because Hermes's
 * production compiler supports them. But in DEV, Metro ships plain JS that
 * Hermes PARSES at runtime, and the runtime parser rejects that syntax with
 * "SyntaxError: private properties are not supported". Dependencies like
 * react-native-reanimated / react-native-worklets / react-native-css-interop
 * ship `#private` syntax, so we must downlevel it ourselves. These three
 * plugins do exactly that (into WeakMap/WeakSet), making the dev bundle safe.
 *
 * Note: reanimated 4's worklets plugin is auto-injected by babel-preset-expo on
 * SDK 54, so it is intentionally NOT listed here.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      '@babel/plugin-transform-class-properties',
      '@babel/plugin-transform-private-methods',
      '@babel/plugin-transform-private-property-in-object',
    ],
  };
};