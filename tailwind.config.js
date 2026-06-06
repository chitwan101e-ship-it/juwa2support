/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fffbeb',
          100: '#fef3c7',
          300: '#fcd34d',
          500: '#d4af37',
          600: '#b8860b',
          700: '#92700a',
        },
        juwa2: {
          bg: '#000000',
          surface: '#0c0c0c',
          gold: '#d4af37',
          'gold-light': '#f5d040',
          'gold-dark': '#b8860b',
          red: '#e63946',
          blue: '#2563eb',
          green: '#16a34a',
        },
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'juwa2-gradient': 'linear-gradient(135deg, #f5d040 0%, #d4af37 45%, #b8860b 100%)',
        'juwa2-radial': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(212,175,55,0.12), transparent 55%), #000000',
        'juwa2-brand': 'linear-gradient(135deg, #e63946 0%, #2563eb 100%)',
      },
    },
  },
  plugins: [],
}
