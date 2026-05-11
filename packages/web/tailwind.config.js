/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          green: '#0d4d2b',
          red: '#8b0000',
          blue: '#1a3a5c',
        },
        card: {
          white: '#ffffff',
          back: '#1e40af',
        },
        gold: '#d4af37',
        chip: {
          red: '#dc2626',
          blue: '#2563eb',
          green: '#16a34a',
          black: '#1f2937',
          white: '#f3f4f6',
        },
      },
      fontFamily: {
        card: ['Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
