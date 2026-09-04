/// <reference types="nativewind/types" />

// NativeWind's types only add the `className` prop to RN components — they do
// NOT declare a module for `*.css`. Under Expo's "bundler" module resolution,
// the side-effect import `import './global.css'` therefore fails with ts(2882).
// This ambient declaration tells TypeScript that importing a .css file is valid.
declare module '*.css';