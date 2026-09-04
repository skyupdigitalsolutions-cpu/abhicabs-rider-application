/**
 * metro.config.js
 *
 * Cold-start optimization: inlineRequires.
 *
 * By default Metro evaluates every required module at the top of the bundle,
 * during JS startup. With `inlineRequires` on, Metro rewrites `require`/`import`
 * calls so a module is evaluated the FIRST TIME it's actually used, not at boot.
 * On Hermes this measurably shrinks the "evaluate bundle" phase of cold start.
 */

const { getDefaultConfig } = require('expo/metro-config');

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

module.exports = config;