/**
 * svg.d.ts
 *
 * Without this, TypeScript treats an .svg import as an untyped module and
 * errors on every icon. Declares them as React components, matching what
 * react-native-svg-transformer actually produces at build time.
 */

declare module '*.svg' {
  import type React from 'react';
  import type { SvgProps } from 'react-native-svg';

  const content: React.FC<SvgProps>;
  export default content;
}  