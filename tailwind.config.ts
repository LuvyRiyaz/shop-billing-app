import type { Config } from "tailwindcss"

// Deliverable 6, since upgraded for the Stripe/Linear-style visual
// overhaul. Note on what's deliberately NOT here: thermal (58/80mm) vs A4
// page sizing is a CSS `@page { size: ... }` at-rule, which Tailwind has no
// token/plugin surface for — faking a "print variant" config entry that
// doesn't actually drive anything would be worse than not having one. That
// sizing lives directly in components/billing/InvoicePrint.tsx (an inline
// <style> per layout) and the print-isolation rules in app/globals.css.
// Tailwind's built-in `print:` variant (e.g. `print:hidden` to hide
// on-screen chrome) needs no config at all.
const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "var(--color-primary)",
          light: "var(--color-primary-light)",
          foreground: "var(--color-primary-foreground)",
        },
        accent: "var(--color-accent)",
        surface: {
          DEFAULT: "var(--color-surface)",
          raised: "var(--color-surface-raised)",
        },
        border: "var(--color-border)",
        bg: "var(--color-bg)",
        fg: "var(--color-fg)",
        // Semantic status colors — fixed (emerald/amber/rose/indigo), not
        // per-shop-type. Prefer these over Tailwind's bare red-600/amber-600
        // etc. in new code so a future palette tweak is one CSS var, not a
        // grep across every component.
        success: {
          DEFAULT: "var(--color-success)",
          light: "var(--color-success-light)",
        },
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
        info: "var(--color-info)",
      },
      fontFamily: {
        // Plus Jakarta Sans, via next/font/google in app/layout.tsx.
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        // Clash Display, loaded from Fontshare's CDN (not Google Fonts, so
        // not next/font) in app/layout.tsx's <head> — see .font-display in
        // globals.css for the actual font-family declaration.
        display: ['"Clash Display"', "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        raised: "var(--shadow-raised)",
        "glow-primary": "var(--shadow-glow-primary)",
      },
      // Named per the spec's "touch targets >= 44px" rule, so new code can
      // write `min-h-touch` instead of a magic `h-11`/`min-h-[44px]`.
      minHeight: {
        touch: "2.75rem",
      },
      minWidth: {
        touch: "2.75rem",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
}

export default config
