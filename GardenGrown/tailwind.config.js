/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontSize: {
        '4.5xl': '38px', 
      },
      fontFamily: {
        zenloop: ["ZenLoop"],
        zenmaru: ["ZenMaruRegular"],
        "zenmaru-bold": ["ZenMaruBold"],
      },
    },
  },
  plugins: [],
};