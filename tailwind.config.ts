import type { Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

const rw = (name: string) => `rgb(var(--rw-${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem" },
    extend: {
      fontFamily: {
        // NotoSansSinhala (globals.css) covers Sinhala glyphs Plus Jakarta lacks
        sans: ["var(--font-jakarta)", "NotoSansSinhala", ...fontFamily.sans],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        // Rawana owner-console tokens — values live in globals.css
        rw: {
          sidebar: rw("sidebar"),
          "sidebar-text": rw("sidebar-text"),
          hero: rw("hero"),
          lime: rw("lime"),
          "on-lime": rw("on-lime"),
          green: rw("green"),
          page: rw("page"),
          card: rw("card"),
          border: rw("border"),
          soft: rw("soft"),
          ink: rw("ink"),
          muted: rw("muted"),
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        rw: "22px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
