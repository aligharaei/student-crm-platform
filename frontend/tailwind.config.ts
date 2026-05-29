import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        text: 'var(--text)',
        'text-h': 'var(--text-h)',
        border: 'var(--border)',
        accent: 'var(--accent)',
        'accent-bg': 'var(--accent-bg)',
        'accent-border': 'var(--accent-border)',
        'social-bg': 'var(--social-bg)'
      },
      boxShadow: {
        soft: 'var(--shadow)'
      }
    }
  },
  plugins: []
} satisfies Config

