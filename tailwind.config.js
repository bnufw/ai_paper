/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // 使用 CSS 变量驱动，支持主题切换
        gray: {
          50: 'rgb(var(--gray-50) / <alpha-value>)',
          100: 'rgb(var(--gray-100) / <alpha-value>)',
          200: 'rgb(var(--gray-200) / <alpha-value>)',
          300: 'rgb(var(--gray-300) / <alpha-value>)',
          400: 'rgb(var(--gray-400) / <alpha-value>)',
          500: 'rgb(var(--gray-500) / <alpha-value>)',
          600: 'rgb(var(--gray-600) / <alpha-value>)',
          700: 'rgb(var(--gray-700) / <alpha-value>)',
          800: 'rgb(var(--gray-800) / <alpha-value>)',
          900: 'rgb(var(--gray-900) / <alpha-value>)',
          950: 'rgb(var(--gray-950) / <alpha-value>)',
        },
        blue: {
          50: 'rgb(var(--blue-50) / <alpha-value>)',
          100: 'rgb(var(--blue-100) / <alpha-value>)',
          200: 'rgb(var(--blue-200) / <alpha-value>)',
          300: 'rgb(var(--blue-300) / <alpha-value>)',
          400: 'rgb(var(--blue-400) / <alpha-value>)',
          500: 'rgb(var(--blue-500) / <alpha-value>)',
          600: 'rgb(var(--blue-600) / <alpha-value>)',
          700: 'rgb(var(--blue-700) / <alpha-value>)',
          800: 'rgb(var(--blue-800) / <alpha-value>)',
        },
        green: {
          50: 'rgb(var(--green-50) / <alpha-value>)',
          100: 'rgb(var(--green-100) / <alpha-value>)',
          500: 'rgb(var(--green-500) / <alpha-value>)',
          600: 'rgb(var(--green-600) / <alpha-value>)',
        },
        red: {
          50: 'rgb(var(--red-50) / <alpha-value>)',
          100: 'rgb(var(--red-100) / <alpha-value>)',
          200: 'rgb(var(--red-200) / <alpha-value>)',
          400: 'rgb(var(--red-400) / <alpha-value>)',
          500: 'rgb(var(--red-500) / <alpha-value>)',
          600: 'rgb(var(--red-600) / <alpha-value>)',
        },
        yellow: {
          50: 'rgb(var(--yellow-50) / <alpha-value>)',
          100: 'rgb(var(--yellow-100) / <alpha-value>)',
          200: 'rgb(var(--yellow-200) / <alpha-value>)',
          400: 'rgb(var(--yellow-400) / <alpha-value>)',
          500: 'rgb(var(--yellow-500) / <alpha-value>)',
          600: 'rgb(var(--yellow-600) / <alpha-value>)',
        },
        orange: {
          100: 'rgb(var(--orange-100) / <alpha-value>)',
          200: 'rgb(var(--orange-200) / <alpha-value>)',
          400: 'rgb(var(--orange-400) / <alpha-value>)',
          500: 'rgb(var(--orange-500) / <alpha-value>)',
          600: 'rgb(var(--orange-600) / <alpha-value>)',
        },
      },
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        'cute': '0 4px 14px -3px rgb(var(--blue-500) / 0.25)',
        'cute-lg': '0 8px 25px -5px rgb(var(--blue-500) / 0.3)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
