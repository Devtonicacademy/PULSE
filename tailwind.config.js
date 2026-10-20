import { accent, accent2, signal } from './src/theme/tokens.js';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // AA contrast: white text on accent-500 needs the deeper step (the raw brand coral is 3.3:1)
        accent: { ...accent, 500: accent[600], 600: accent[700], 700: accent[800] },
        accent2,
        signal,
        pulse: {
          dark: '#0A0E17',
          card: '#121927',
          glass: 'rgba(18, 25, 39, 0.75)',
          border: 'rgba(255, 255, 255, 0.08)',
          coral: '#FF4757',
          cyan: '#00F2FE',
          amber: '#FFA502',
          emerald: '#10B981',
          purple: '#8B5CF6',
          blue: '#3B82F6',
          orange: '#F97316',
          red: '#EF4444'
        }
      },
      fontFamily: {
        // SF Pro on Apple devices, Inter everywhere else
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      // Soft, multi-layered, diffused depth (replaces Tailwind's harsh defaults)
      boxShadow: {
        sm: '0 1px 2px rgb(0 0 0 / 0.08), 0 1px 1px rgb(0 0 0 / 0.04)',
        DEFAULT: '0 1px 3px rgb(0 0 0 / 0.1), 0 4px 12px rgb(0 0 0 / 0.06)',
        md: '0 2px 4px rgb(0 0 0 / 0.06), 0 8px 24px rgb(0 0 0 / 0.1)',
        lg: '0 4px 8px rgb(0 0 0 / 0.05), 0 12px 32px rgb(0 0 0 / 0.14)',
        xl: '0 8px 16px rgb(0 0 0 / 0.06), 0 20px 48px rgb(0 0 0 / 0.18)',
        '2xl': '0 12px 24px rgb(0 0 0 / 0.08), 0 32px 72px rgb(0 0 0 / 0.26)',
        hairline: 'inset 0 0 0 0.5px rgb(255 255 255 / 0.08)',
        'inset-top': 'inset 0 1px 0 rgb(255 255 255 / 0.06)',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-up': 'slideUp 0.42s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.985)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        slideUp: {
          '0%': { transform: 'translateY(24px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        }
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
