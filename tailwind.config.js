/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef8ff",
          100: "#d8eeff",
          200: "#badeff",
          300: "#8ac8ff",
          400: "#58abff",
          500: "#2f8bff",
          600: "#186df5",
          700: "#1057e1",
          800: "#1149b6",
          900: "#143f8f",
        },
      },
      boxShadow: {
        soft: "0 10px 30px rgba(2, 8, 23, 0.08)",
      },
    },
  },
  plugins: [],
};
