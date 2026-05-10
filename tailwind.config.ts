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
        500: '#8b5cf6',  // purple, for example
        600: '#7c3aed',
        700: '#6d28d9',
      }
    }
  }
},
  plugins: [],
}

export default config
