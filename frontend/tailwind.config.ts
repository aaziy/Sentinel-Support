import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        display: ["'Syne'", "var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        surface: {
          950: "#09090b",
          900: "#18181b",
          850: "#1c1c1f",
          800: "#27272a",
          700: "#3f3f46",
        },
        brand: {
          DEFAULT: "#7C5CFC",
          50:  "#f3f0ff",
          100: "#e9e2ff",
          200: "#d4c7ff",
          300: "#b8a1ff",
          400: "#9b7eff",
          500: "#7C5CFC",
          600: "#6344e0",
          700: "#4c32b8",
          800: "#3a2591",
          900: "#271a66",
        },
        accent: {
          DEFAULT: "#7C5CFC",
          50:  "#f3f0ff",
          100: "#e9e2ff",
          200: "#d4c7ff",
          300: "#b8a1ff",
          400: "#9b7eff",
          500: "#7C5CFC",
          600: "#6344e0",
          700: "#4c32b8",
          800: "#3a2591",
          900: "#271a66",
        },
        sentinel: {
          violet: "#7C5CFC",
          cyan:  "#38BDF8",
          green: "#34D399",
          red:   "#F43F5E",
        },
        crisis: {
          DEFAULT: "#F43F5E",
          bg: "rgba(244,63,94,0.04)",
          border: "rgba(244,63,94,0.15)",
        },
      },
      boxShadow: {
        "glow-accent":  "0 0 32px 6px rgba(124,92,252,0.15)",
        "glow-brand":   "0 0 32px 6px rgba(124,92,252,0.15)",
        "glow-indigo":  "0 0 24px 4px rgba(124,92,252,0.10)",
        "glow-emerald": "0 0 24px 4px rgba(52,211,153,0.10)",
        "glow-amber":   "0 0 24px 4px rgba(245,158,11,0.10)",
        "glow-rose":    "0 0 24px 4px rgba(244,63,94,0.10)",
        "glow-crisis":  "0 0 40px 8px rgba(244,63,94,0.18), inset 0 0 0 1px rgba(244,63,94,0.12)",
        "panel":        "0 1px 2px 0 rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03)",
        "panel-lg":     "0 4px 16px 0 rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)",
        "elevation-1":  "0 1px 3px 0 rgba(0,0,0,0.5)",
        "elevation-2":  "0 4px 12px -2px rgba(0,0,0,0.6)",
        "elevation-3":  "0 8px 32px -4px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)",
        "inner-glow":   "inset 0 1px 0 0 rgba(255,255,255,0.04)",
      },
      animation: {
        "fade-in":       "fadeIn 0.3s ease-out",
        "slide-up":      "slideUp 0.3s cubic-bezier(.21,1.02,.73,1)",
        "slide-in-left": "slideInLeft 0.35s cubic-bezier(.21,1.02,.73,1)",
        "slide-out-r":   "slideOutR 0.35s cubic-bezier(.36,.07,.19,.97) forwards",
        "pulse-slow":    "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "breathing":     "breathing 3s ease-in-out infinite",
        "crisis-pulse":  "crisisPulse 2s ease-in-out infinite",
        "count-up":      "countUp 0.8s cubic-bezier(.16,1,.3,1)",
        "shimmer":       "shimmer 2s linear infinite",
        "slide-down":    "slideDown 0.3s cubic-bezier(.21,1.02,.73,1)",
        "spin-slow":     "spin 3s linear infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        slideInLeft: {
          from: { opacity: "0", transform: "translateX(-12px)" },
          to:   { opacity: "1", transform: "translateX(0)" },
        },
        slideOutR: {
          from: { opacity: "1", transform: "translateX(0)" },
          to:   { opacity: "0", transform: "translateX(60px)" },
        },
        breathing: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%":      { opacity: "0.7", transform: "scale(1.05)" },
        },
        crisisPulse: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(255,59,48,0)" },
          "50%":      { boxShadow: "0 0 24px 4px rgba(255,59,48,0.15)" },
        },
        countUp: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        slideDown: {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
