import uiConfig from "@typr/ui/tailwind.config";
import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config = {
  darkMode: ["class"],
  content: [
    "src/**/*.{js,ts,jsx,tsx}",
    "index.html",
    // Include UI package components
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  presets: [uiConfig], // Use UI config as preset
  theme: {
    extend: {
      fontFamily: {
        "racing-sans": [
          "Racing Sans One",
          "cursive",
        ],
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        composer: "var(--radius-composer)",
        "floating-pill": "var(--radius-floating-pill)",
        "floating-surface": "var(--radius-floating-surface)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        "blue-dark": {
          DEFAULT: "hsl(var(--blue-dark))",
          foreground: "hsl(var(--blue-dark-foreground))",
        },
        marker: {
          neutral: {
            DEFAULT: "hsl(var(--marker-neutral) / <alpha-value>)",
            surface: "hsl(var(--marker-neutral-surface) / <alpha-value>)",
          },
          ink: {
            DEFAULT: "hsl(var(--marker-ink) / <alpha-value>)",
            surface: "hsl(var(--marker-ink-surface) / <alpha-value>)",
          },
          indigo: {
            DEFAULT: "hsl(var(--marker-indigo) / <alpha-value>)",
            surface: "hsl(var(--marker-indigo-surface) / <alpha-value>)",
          },
          blue: {
            DEFAULT: "hsl(var(--marker-blue) / <alpha-value>)",
            surface: "hsl(var(--marker-blue-surface) / <alpha-value>)",
          },
          teal: {
            DEFAULT: "hsl(var(--marker-teal) / <alpha-value>)",
            surface: "hsl(var(--marker-teal-surface) / <alpha-value>)",
          },
          violet: {
            DEFAULT: "hsl(var(--marker-violet) / <alpha-value>)",
            surface: "hsl(var(--marker-violet-surface) / <alpha-value>)",
          },
          rose: {
            DEFAULT: "hsl(var(--marker-rose) / <alpha-value>)",
            surface: "hsl(var(--marker-rose-surface) / <alpha-value>)",
          },
          amber: {
            DEFAULT: "hsl(var(--marker-amber) / <alpha-value>)",
            surface: "hsl(var(--marker-amber-surface) / <alpha-value>)",
          },
        },
      },
    },
  },
  plugins: [animate, typography],
} satisfies Config;

export default config;
