/** @type {import('tailwindcss').Config} */
module.exports = {
  // Your components live under src/, and App.tsx is at the root.
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Your strict 3-colour palette (from src/theme/index.ts), exposed as
      // utilities: bg-amber, text-ink, border-line, bg-surface-alt, etc.
      colors: {
        ink: '#111111',
        amber: { DEFAULT: '#FFC107', light: '#FFD54F', dark: '#FFB300' },
        muted: '#6B6B6B',
        line: '#E6E6E6',
        surface: { DEFAULT: '#FFFFFF', alt: '#F5F5F5' },
        danger: '#C0392B',
      },
      borderRadius: {
        pill: '999px',
      },
    },
  },
  plugins: [],
};