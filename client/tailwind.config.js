/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "linen-canvas": "#edede2",
        "bone-card": "#fffff3",
        "pure-white": "#ffffff",
        "ink-black": "#000000",
        charcoal: "#333333",
        "sage-mint": "#beedc0",
      },
      fontFamily: {
        display: ['"Playfair Display"', "Georgia", "serif"],
        sans: ["Rubik", "ui-sans-serif", "system-ui", "sans-serif"],
        micro: ["Arial", "system-ui", "sans-serif"],
      },
      fontSize: {
        caption: ["12px", { lineHeight: "1.6" }],
        "body-sm": ["17px", { lineHeight: "1.9" }],
        body: ["19px", { lineHeight: "1.9" }],
        "subheading-sm": ["21px", { lineHeight: "1.7" }],
        subheading: ["23px", { lineHeight: "1.54" }],
        "heading-sm": ["30px", { lineHeight: "1.41" }],
        heading: ["54px", { lineHeight: "1.48" }],
        display: ["74px", { lineHeight: "1.4" }],
      },
      borderRadius: {
        card: "10px",
        input: "7px",
        link: "30px",
        button: "40.5px",
        tag: "46px",
      },
      maxWidth: {
        page: "1200px",
        prose: "620px",
      },
      spacing: {
        section: "120px",
        card: "20px",
        element: "14px",
      },
    },
  },
  plugins: [],
};
