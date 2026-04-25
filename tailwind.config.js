/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './src/**/*.css',
    './public/index.html',
  ],
  theme: {
    extend: {
      colors: {
        mind: {
          pink: '#FF66A3', // Rosa suave - punto del logo
          'pink-light': '#FF8FB8', // Rosa más claro para gradientes
          blue: '#2D2F3A', // Azul grisáceo oscuro - texto principal
          celeste: '#C9F0D1', // Celeste grisáceo - calma y serenidad
          menta: '#D8F3DC', // Verde menta claro - bienestar y natural
          crema: '#FAF9F6', // Crema cálido - fondos neutros
        },
        // Alias para uso directo según especificaciones
        'primary': '#FF66A3', // Rosa principal
        'primary-light': '#FF8FB8',
        'secondary': '#2D2F3A', // Azul grisáceo
        'accent': '#C9F0D1', // Celeste
        'mint': '#D8F3DC', // Verde menta
        'cream': '#FAF9F6', // Crema
        // Grises para texto según especificaciones
        'text-main': '#2D2F3A',
        'text-body': '#555',
        'text-body-light': '#666',
      },
      fontFamily: {
        // DM Sans para cuerpo (según especificaciones)
        sans: ['DM Sans', 'Inter', 'Lato', 'ui-sans-serif', 'system-ui', 'Arial', 'sans-serif'],
        // Poppins Bold para títulos (según especificaciones)
        poppins: ['Poppins', 'ui-sans-serif', 'system-ui', 'Arial', 'sans-serif'],
        inter: ['Inter', 'ui-sans-serif', 'system-ui', 'Arial', 'sans-serif'],
        lato: ['Lato', 'ui-sans-serif', 'system-ui', 'Arial', 'sans-serif'],
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'fade-in': 'fadeIn 0.6s ease-out forwards',
        'fade-in-up': 'fadeInUp 0.8s ease-out forwards',
        'slide-in-left': 'slideInLeft 0.8s ease-out forwards',
        'slide-in-right': 'slideInRight 0.8s ease-out forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-50px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(50px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
