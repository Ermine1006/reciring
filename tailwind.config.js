/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Playfair Display', 'Georgia', 'serif'],
        brand:   ['Fraunces', 'Georgia', 'serif'],
      },
      colors: {
        luxury: {
          black:        '#0A0A0A',
          card:         '#111111',
          surface:      '#1C1C1E',
          gold:         '#C8A96A',
          'gold-light': '#E5C98B',
          'gold-dark':  '#A88245',
          text:         '#F0EDE8',
          muted:        '#6B6B6B',
        },
        reciprocity: {
          navy:  '#0f1729',
          teal:  '#0d9488',
          cream: '#faf8f5',
          warm:  '#f5f0e8',
          gold:  '#c9a227',
        },
      },
      animation: {
        'match-pop': 'matchPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        matchPop: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
