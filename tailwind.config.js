/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./{components,pages}/**/*.{js,ts,jsx,tsx}",
    "./**/*.tsx",
    "./**/*.ts",
    "!./node_modules/**/*"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Manrope',
          'ui-sans-serif',
          'system-ui',
          'sans-serif'
        ],
        display: [
          'Sora',
          'ui-sans-serif',
          'system-ui',
          'sans-serif'
        ],
      },
    },
  },
  plugins: [],
}
