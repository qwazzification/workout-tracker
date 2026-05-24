import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
  extend: {
    colors: {
      brand: {
        50:  '#fff3ed',
        100: '#ffdecb',
        200: '#ffbf99',
        300: '#ff9e69',
        400: '#ff8450',
        500: '#ff6e35',
        600: '#e55422',
        700: '#c23d12',
        800: '#8f2908',
        900: '#5c1604',
        950: '#330a02',
      }
    }
  }
},
  plugins: [],
}

export default config
