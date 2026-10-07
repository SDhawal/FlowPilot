/** Design tokens live here once. Names are mirrored in src/ui/tokens.ts. */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        // Each semantic color has a light value (DEFAULT) and a dark value.
        background: { DEFAULT: "#ffffff", dark: "#0b0f19" },
        surface: { DEFAULT: "#f3f4f6", dark: "#161b2a" },
        foreground: { DEFAULT: "#111827", dark: "#f9fafb" },
        muted: { DEFAULT: "#4b5563", dark: "#9ca3af" },
        primary: { DEFAULT: "#4f46e5", dark: "#818cf8", foreground: "#ffffff" },
        border: { DEFAULT: "#d1d5db", dark: "#374151" },
        success: { DEFAULT: "#15803d", dark: "#4ade80" },
        danger: { DEFAULT: "#b91c1c", dark: "#f87171" },
      },
      spacing: {
        touch: "44px",
        gutter: "20px",
      },
      minHeight: {
        touch: "44px",
      },
      minWidth: {
        touch: "44px",
      },
      fontSize: {
        title: ["28px", { lineHeight: "34px", fontWeight: "700" }],
        body: ["16px", { lineHeight: "22px" }],
        caption: ["13px", { lineHeight: "18px" }],
      },
      borderRadius: {
        card: "16px",
        control: "12px",
      },
    },
  },
  plugins: [],
};
