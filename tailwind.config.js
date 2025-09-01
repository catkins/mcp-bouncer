/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-mode="dark"]'],
  theme: {
    extend: {
      colors: {
        gradient: {
          'blue-pink': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          'blue-purple': 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
          'cyan-pink': 'linear-gradient(135deg, #4facfe 0%, #00f2fe 50%, #f093fb 100%)',
          'violet-pink': 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
        },
      },
      backgroundImage: {
        'gradient-blue-pink': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'gradient-blue-purple': 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        'gradient-cyan-pink': 'linear-gradient(135deg, #4facfe 0%, #00f2fe 50%, #f093fb 100%)',
        'gradient-violet-pink': 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
        'gradient-radial': 'radial-gradient(ellipse at center, #667eea 0%, #764ba2 100%)',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, #667eea 0deg, #764ba2 180deg, #f093fb 360deg)',
      },
      animation: {
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        spin: 'spin 1s linear infinite',
        gradient: 'gradient 4s ease-in-out infinite',
        shimmer: 'shimmer 2s ease-in-out infinite',
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.5' },
        },
        spin: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        gradient: {
          '0%': { 'background-position': '0% 50%' },
          '100%': { 'background-position': '200% 50%' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
};
