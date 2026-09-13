/**
 * metro.config.js
 *
 * Teaches Metro to treat .svg files as SOURCE rather than as assets.
 *
 * By default `svg` sits in `assetExts`, so require('icon.svg') returns an image
 * asset — which <Image> then cannot decode, and the icon renders as an empty
 * box. Moving it to `sourceExts` and running it through the transformer makes
 * an SVG import a React COMPONENT instead:
 *
 *     import OneWay from '../assets/icons/one-way.svg';
 *     <OneWay width={18} height={18} fill="#111" />
 *
 * Both halves are required. The transformer alone does nothing while the
 * extension is still classed as an asset.
 */

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer');
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts = [...config.resolver.sourceExts, 'svg'];

module.exports = config;