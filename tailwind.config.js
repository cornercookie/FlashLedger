/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        red: {
          500: '#ef4444',
          600: '#dc2626',
        },
        green: {
          500: '#22c55e',
          600: '#16a34a',
        },
        blue: {
          600: '#2563eb',
        },
      },
      fontFamily: {
        sans: ['Microsoft JhengHei', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
