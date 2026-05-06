/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        editor: {
          bg: '#1e1e1e',
          'bg-alt': '#252526',
          sidebar: '#252526',
          activitybar: '#333333',
          panel: '#1e1e1e',
          'panel-header': '#2d2d30',
          border: '#3c3c3c',
          'border-soft': '#2b2b2b',
          text: '#cccccc',
          'text-muted': '#858585',
          'text-strong': '#ffffff',
          accent: '#0098ff',
          'accent-active': '#007acc',
          warn: '#cca700',
          error: '#f48771',
          good: '#73c991',
          selection: '#264f78',
          'list-active': '#37373d',
          'list-hover': '#2a2d2e',
        },
        deco: {
          todo: '#dcdcaa',
          fixme: '#f48771',
          stub: '#9cdcfe',
          info: '#75beff',
          warn: '#cca700',
          error: '#f48771',
          frame: '#0098ff',
          branch: '#dcdcaa',
          await: '#c586c0',
          'side-effect': '#73c991',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['Menlo', 'Monaco', 'Cascadia Code', 'Consolas', 'monospace'],
      },
      fontSize: {
        editor: ['13px', '20px'],
        'editor-sm': ['12px', '18px'],
        'editor-xs': ['11px', '16px'],
      },
    },
  },
  plugins: [],
};
