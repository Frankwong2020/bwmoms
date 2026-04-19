/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        sage: {
          DEFAULT: '#7B9E87',
          light: '#EAF0EB',
          dark: '#4A6B56',
        },
        warm: {
          DEFAULT: '#C4956A',
          light: '#F5EDE3',
        },
        cream: '#FAF7F2',
        ink: {
          DEFAULT: '#1C1C1C',
          light: '#5A5A5A',
          muted: '#9A9A9A',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'PingFang SC', 'sans-serif'],
        serif: ['Noto Serif SC', 'serif'],
      },
      borderRadius: {
        'card': '16px',
        'chip': '10px',
      },
      boxShadow: {
        'soft': '0 2px 20px rgba(0,0,0,0.06)',
        'hover': '0 8px 40px rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
};
