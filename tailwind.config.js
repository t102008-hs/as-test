/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./main.js",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        'milktea': {
          50: '#fdfbf9',
          100: '#f8f4ed',
          200: '#efe5d6', // 背景主色
          300: '#e1cdb3',
          400: '#cfa984',
          500: '#c18c5e', // 按鈕主色
          600: '#b2734a',
        }
      }
    },
  },
  plugins: [],
}
