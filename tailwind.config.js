/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f4f6f9",
          100: "#e8ecf2",
          200: "#c5d0e0",
          300: "#9aadc4",
          400: "#6b86a8",
          500: "#4a6485",
          600: "#354d6b",
          700: "#243a55",
          800: "#162a42",
          900: "#0F1B2D",
        },
        accent: {
          400: "#f7b84d",
          500: "#F5A623",
          600: "#d48912",
        },
      },
      boxShadow: {
        soft: "0 10px 30px rgba(2, 8, 23, 0.08)",
        "soft-md":
          "0 8px 24px rgba(2, 8, 23, 0.07), 0 2px 6px rgba(2, 8, 23, 0.04)",
        "soft-lg":
          "0 14px 42px rgba(2, 8, 23, 0.095), 0 4px 12px rgba(2, 8, 23, 0.055)",
        "soft-xl":
          "0 22px 52px rgba(2, 8, 23, 0.11), 0 8px 18px rgba(2, 8, 23, 0.065)",
      },
    },
  },
  plugins: [],
};
