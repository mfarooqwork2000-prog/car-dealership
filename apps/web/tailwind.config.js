const c = (v) => `rgb(var(${v}) / <alpha-value>)`;
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1280px" } },
    extend: {
      colors: { primary: c("--primary"), secondary: c("--secondary"), accent: c("--accent"), ink: c("--ink"), surface: c("--surface") },
      fontFamily: { heading: ["var(--font-heading)", "Georgia", "serif"], sans: ["var(--font-body)", "system-ui", "sans-serif"] },
      borderRadius: { btn: "var(--btn-radius)" },
      keyframes: { fadeUp: { "0%": { opacity: 0, transform: "translateY(12px)" }, "100%": { opacity: 1, transform: "none" } } },
      animation: { "fade-up": "fadeUp .5s ease-out both" },
    },
  },
  plugins: [],
};
