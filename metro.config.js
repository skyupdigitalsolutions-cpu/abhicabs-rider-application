/**
 * metro.config.js
 *
 * Cold-start optimization: inlineRequires  (PRESERVED)  +  NativeWind (added).
 *
 * By default Metro evaluates every required module at the top of the bundle,
 * during JS startup. With `inlineRequires` on, Metro rewrites `require`/`import`
 * calls so a module is evaluated the FIRST TIME it's actually used, not at boot.
 * On Hermes this measurably shrinks the "evaluate bundle" phase of cold start.
 *
 * `withNativeWind` wraps the finished config to add Tailwind processing. Order
 * matters: apply your transformer options first, then wrap.
 */

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

module.exports = withNativeWind(config, { input: './global.css' });