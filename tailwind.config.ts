import type { Config } from 'tailwindcss'

/**
 * Heights and insets that more than one component has to agree on live here as
 * spacing tokens, so `h-app-bar`, `top-header` and `pb-dock` all resolve to the
 * same numbers. A sticky chip row pinned to a hand-written `top-[3.75rem]` is
 * how the old header ended up covering it on small screens.
 */
const APP_BAR = '3.5rem'
const DOCK = '3.25rem'

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'Roboto', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      spacing: {
        /** The app bar itself, excluding the notch. */
        'app-bar': APP_BAR,
        /** The bottom tab bar, excluding the home indicator. */
        dock: DOCK,
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
        /** Where the app bar ends — what sticky rows below it pin to. */
        header: `calc(${APP_BAR} + env(safe-area-inset-top))`,
        /** Bottom padding that clears the dock and the home indicator. */
        'dock-safe': `calc(${DOCK} + env(safe-area-inset-bottom))`,
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        /** YouTube red, for the watched-progress bar and live badges. */
        brand: '#ff0000',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
