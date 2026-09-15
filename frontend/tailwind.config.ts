import type { Config } from "tailwindcss";

/**
 * Vantage — dark visual identity.
 *
 * Deep navy surfaces in four elevation steps, a violet "signal" accent for
 * anything the AI produced, and semantic status colours that each pair a
 * readable foreground with a tinted background for chips.
 *
 * `darkMode` is intentionally NOT set: this is a single-theme product, so
 * these are simply *the* colours rather than one half of a light/dark pair.
 * That keeps every component free of `dark:` variants.
 *
 * Contrast on `surface` (#111420): body 11:1, muted 5.6:1, accent 5.0:1 — all
 * pass WCAG AA. `faint` is ~3.4:1 and is therefore reserved for decoration
 * (axis ticks, dividers), never for text a user has to read.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces, dark to light by elevation
        base: "#06060A",      // app background
        surface: "#0C0D14",   // cards, and the opaque fallback behind blur
        raised: "#15161F",    // hovered rows, popovers, slide-over
        sunken: "#040409",    // input wells, code blocks

        // Glass fills for the card recipe. Literal rgba rather than a
        // solid colour: these are deliberately translucent so the page's
        // background glow reads through every card.
        glass: "rgba(255,255,255,0.028)",
        "glass-hover": "rgba(255,255,255,0.045)",

        // Hairlines. Expressed as white-at-alpha rather than a mixed navy so
        // dividers pick up whatever surface sits behind them instead of
        // banding against the background gradient.
        line: "rgb(255 255 255 / 0.07)",
        "line-strong": "rgb(255 255 255 / 0.12)",

        // Text
        hi: "#F3F5FA",        // headings, numbers
        body: "#C3C9D8",      // paragraphs
        muted: "#8A92A8",     // labels, captions
        faint: "#5C6478",     // decoration only — fails AA for body text

        // Primary accent: marks AI-produced content and primary actions
        accent: {
          DEFAULT: "#7C5CFF",
          hover: "#8F73FF",
          press: "#6A49F0",
          dim: "#5B3FE0",
          soft: "#1B1733",
        },

        /**
         * Second brand accent. Pairs with violet in gradients, chart series
         * and the rail's live indicators.
         *
         * Deliberately NOT merged with `info` (#38BDF8): `info` carries
         * semantic weight ("this is a notice"), while `cyan` is decorative
         * brand. Collapsing them would make every cyan gradient read as a
         * status message.
         */
        cyan: {
          DEFAULT: "#29D3EE",
          dim: "#1AA9C0",
          soft: "#06232B",
        },

        // Semantic status, each with a tinted background for chips
        ok: { DEFAULT: "#34D399", soft: "#0E2A21" },
        warn: { DEFAULT: "#FBBF24", soft: "#2A2110" },
        info: { DEFAULT: "#38BDF8", soft: "#0C2434" },
        danger: { DEFAULT: "#F87171", soft: "#2C1519" },
        neutral: { DEFAULT: "#8A92A8", soft: "#1A1E2C" },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        card: "16px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.03) inset, 0 1px 2px rgba(0,0,0,0.4)",
        glass: "0 1px 0 rgba(255,255,255,0.04) inset, 0 16px 40px -24px rgba(0,0,0,0.9)",
        raised: "0 8px 24px -8px rgba(0,0,0,0.6)",
        panel: "-24px 0 60px -20px rgba(0,0,0,0.75)",
        glow: "0 0 0 1px rgba(124,92,255,0.35), 0 0 24px -4px rgba(124,92,255,0.45)",
        "glow-cyan": "0 0 0 1px rgba(41,211,238,0.30), 0 0 24px -4px rgba(41,211,238,0.40)",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(0.86)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "step-fill": {
          from: { width: "0%" },
          to: { width: "100%" },
        },
        // A hairline of light travelling across the top of the summary strip,
        // marking it as the live/computed panel rather than a static card.
        sweep: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(320%)" },
        },
        "bar-rise": {
          from: { transform: "scaleY(0)" },
          to: { transform: "scaleY(1)" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        shimmer: "shimmer 1.6s infinite",
        "slide-in-right": "slide-in-right 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        "fade-in": "fade-in 160ms ease-out",
        sweep: "sweep 4.5s linear infinite",
        "bar-rise": "bar-rise 420ms cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
