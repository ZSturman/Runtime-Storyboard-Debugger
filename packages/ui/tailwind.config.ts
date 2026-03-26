/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        rsd: {
          bg: '#0f1117',
          surface: '#161822',
          border: '#2a2d3a',
          text: '#c9cdd8',
          muted: '#6b7280',
          accent: '#3b82f6',
          branch: '#f59e0b',
          'branch-alt': '#6366f1',
          'side-effect': '#10b981',
          async: '#8b5cf6',
          error: '#ef4444',
          success: '#22c55e',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
