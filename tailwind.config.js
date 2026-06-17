/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'space-bg': '#0a0a1a',
        'player': '#4fc3f7',
        'enemy-a': '#ef5350',
        'enemy-b': '#66bb6a',
        'neutral': '#78909c',
      },
      fontFamily: {
        'game': ['Rajdhani', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
