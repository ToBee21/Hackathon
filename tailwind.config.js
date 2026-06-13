/**
 * tailwind.config.js — konfiguracja stylów i motywu graficznego UI (Moduł C).
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ["./src/**/*.{ts,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif"
        ]
      },
      colors: {
        // Akcenty motywu "Cloak & Dagger" zgodne z kolorami modułów.
        ghost: "#a78bfa", // DataGhost (violet)
        blur: "#22d3ee", // Bionic Blur — mysz (cyan)
        keys: "#34d399" // Bionic Blur — klawiatura (emerald)
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(-4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        fadeIn: "fadeIn 0.25s ease-out"
      }
    }
  },
  plugins: []
}
