/**
 * metro.config.js
 *
 * Cold-start optimization: inlineRequires.
 *
 * By default Metro evaluates every required module at the top of the bundle,
 * during JS startup. With `inlineRequires` on, Metro rewrites `require`/`import`
 * calls so a module is evaluated the FIRST TIME it's actually used, not at boot.
 * On Hermes this measurably shrinks the "evaluate bundle" phase of cold start,
 * because large modules on screens the user hasn't opened yet (maps, etc.) don't
 * run their top-level code until needed.
 *
 * This composes with the React.lazy screen splitting in App.tsx: lazy defers the
 * screen component, inlineRequires defers everything else module-by-module.
 *
 * Safe for this app. The one caveat with inlineRequires is modules with import
 * side-effects that MUST run at startup; this app has none on the hot path
 * (the session bridge is called explicitly, not via import side-effect).
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