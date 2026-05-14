import path from "path";
import type { Config } from "tailwindcss";

// https://magicui.design/docs/components/shimmer-button
const shimmerButton = {
  animation: {
    "shimmer-slide": "shimmer-slide var(--speed) ease-in-out infinite alternate",
    "spin-around": "spin-around calc(var(--speed) * 2) infinite linear",
  },
  keyframes: {
    "spin-around": {
      "0%": {
        transform: "translateZ(0) rotate(0)",
      },
      "15%, 35%": {
        transform: "translateZ(0) rotate(90deg)",
      },
      "65%, 85%": {
        transform: "translateZ(0) rotate(270deg)",
      },
      "100%": {
        transform: "translateZ(0) rotate(360deg)",
      },
    },
    "shimmer-slide": {
      to: {
        transform: "translate(calc(100cqw - 100%), 0)",
      },
    },
  },
};

// https://magicui.design/docs/components/retro-grid
const retroGrid = {
  animation: {
    grid: "grid 15s linear infinite",
  },
  keyframes: {
    grid: {
      "0%": { transform: "translateY(-50%)" },
      "100%": { transform: "translateY(0)" },
    },
  },
};

const spinner = {
  keyframes: {
    "ios-opacity-spin": {
      "0%, 100%": { opacity: "1" },
      "8.33%": { opacity: "0.9" },
      "16.67%": { opacity: "0.8" },
      "25%": { opacity: "0.7" },
      "33.33%": { opacity: "0.6" },
      "41.67%": { opacity: "0.5" },
      "50%": { opacity: "0.4" },
      "58.33%": { opacity: "0.3" },
      "66.67%": { opacity: "0.2" },
      "75%": { opacity: "0.1" },
      "83.33%": { opacity: "0.05" },
      "91.67%": { opacity: "0.025" },
    },
  },
  animation: {
    "ios-opacity-spin": "ios-opacity-spin 1s linear infinite",
  },
};

// https://github.com/shadcn-ui/ui/blob/1081536246b44b6664f4c99bc3f1b3614e632841/tailwind.config.cjs
const shadcn = {
  colors: {
    border: "hsl(var(--border))",
    input: "hsl(var(--input))",
    ring: "hsl(var(--ring))",
    background: "hsl(var(--background))",
    foreground: "hsl(var(--foreground))",
    primary: {
      DEFAULT: "hsl(var(--primary))",
      foreground: "hsl(var(--primary-foreground))",
    },
    secondary: {
      DEFAULT: "hsl(var(--secondary))",
      foreground: "hsl(var(--secondary-foreground))",
    },
    destructive: {
      DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
      foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
    },
    success: {
      DEFAULT: "hsl(var(--success) / <alpha-value>)",
      foreground: "hsl(var(--success-foreground) / <alpha-value>)",
    },
    warning: {
      DEFAULT: "hsl(var(--warning) / <alpha-value>)",
      foreground: "hsl(var(--warning-foreground) / <alpha-value>)",
    },
    info: {
      DEFAULT: "hsl(var(--info) / <alpha-value>)",
      foreground: "hsl(var(--info-foreground) / <alpha-value>)",
    },
    "blue-dark": {
      DEFAULT: "hsl(var(--blue-dark) / <alpha-value>)",
      foreground: "hsl(var(--blue-dark-foreground) / <alpha-value>)",
    },
    muted: {
      DEFAULT: "hsl(var(--muted))",
      foreground: "hsl(var(--muted-foreground))",
    },
    accent: {
      DEFAULT: "hsl(var(--accent))",
      foreground: "hsl(var(--accent-foreground))",
    },
    popover: {
      DEFAULT: "hsl(var(--popover))",
      foreground: "hsl(var(--popover-foreground))",
    },
    card: {
      DEFAULT: "hsl(var(--card))",
      foreground: "hsl(var(--card-foreground))",
    },
    sidebar: {
      DEFAULT: "hsl(var(--sidebar))",
      foreground: "hsl(var(--sidebar-foreground))",
      primary: "hsl(var(--sidebar-primary))",
      "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
      accent: "hsl(var(--sidebar-accent))",
      "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
      border: "hsl(var(--sidebar-border))",
      ring: "hsl(var(--sidebar-ring))",
    },
    chart: {
      1: "hsl(var(--chart-1))",
      2: "hsl(var(--chart-2))",
      3: "hsl(var(--chart-3))",
      4: "hsl(var(--chart-4))",
      5: "hsl(var(--chart-5))",
    },
    "diff-added": "hsl(var(--diff-added))",
    "diff-added-foreground": "hsl(var(--diff-added-foreground))",
    "diff-added-bg": "hsl(var(--diff-added-bg))",
    "diff-removed": "hsl(var(--diff-removed))",
    "diff-removed-foreground": "hsl(var(--diff-removed-foreground))",
    "diff-removed-bg": "hsl(var(--diff-removed-bg))",
    /* Futuria brand accent */
    brand: {
      DEFAULT: "hsl(var(--brand))",
      foreground: "hsl(var(--brand-foreground))",
      hover: "hsl(var(--brand-hover))",
    },
    /* Futuria cursor aliases */
    cursor: {
      dark: "hsl(var(--cursor-dark))",
      cream: "hsl(var(--cursor-cream))",
      light: "hsl(var(--cursor-light))",
    },
    /* Futuria AI-state colors */
    thinking: "hsl(var(--thinking))",
    grep: "hsl(var(--grep))",
    read: "hsl(var(--read))",
    edit: "hsl(var(--edit))",
    /* Futuria object marker palette */
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
    /* Futuria surface scale */
    surface: {
      100: "hsl(var(--surface-100))",
      200: "hsl(var(--surface-200))",
      300: "hsl(var(--surface-300))",
      400: "hsl(var(--surface-400))",
      500: "hsl(var(--surface-500))",
      600: "hsl(var(--surface-600))",
    },
  },
  borderRadius: {
    composer: "var(--radius-composer)",
    "floating-pill": "var(--radius-floating-pill)",
    "floating-surface": "var(--radius-floating-surface)",
    xl: "calc(var(--radius) + 4px)",
    lg: "var(--radius)",
    md: "calc(var(--radius) - 2px)",
    sm: "calc(var(--radius) - 4px)",
  },
  boxShadow: {
    "2xs": "var(--shadow-2xs)",
    "xs": "var(--shadow-xs)",
    "sm": "var(--shadow-sm)",
    DEFAULT: "var(--shadow)",
    "md": "var(--shadow-md)",
    "lg": "var(--shadow-lg)",
    "xl": "var(--shadow-xl)",
    "2xl": "var(--shadow-2xl)",
    "focus": "var(--shadow-focus)",
    "float-pill": "var(--shadow-float-pill)",
    "float-surface": "var(--shadow-float-surface)",
    "float-dock": "var(--shadow-float-dock)",
  },
  animation: {
    "accordion-down": "accordion-down 0.2s ease-out",
    "accordion-up": "accordion-up 0.2s ease-out",
  },
  keyframes: {
    "accordion-down": {
      from: {
        height: "0",
      },
      to: {
        height: "var(--radix-accordion-content-height)",
      },
    },
    "accordion-up": {
      from: {
        height: "var(--radix-accordion-content-height)",
      },
      to: {
        height: "0",
      },
    },
  },
};

const config = {
  darkMode: ["class"],
  content: [path.resolve(__dirname, "src/components/**/*.tsx")],
  safelist: [
    "bg-blue-dark",
    "text-blue-dark",
    "border-blue-dark",
  ],
  theme: {
    extend: {
      animation: {
        ...shimmerButton.animation,
        ...retroGrid.animation,
        ...shadcn.animation,
        ...spinner.animation,
      },
      keyframes: {
        ...shimmerButton.keyframes,
        ...retroGrid.keyframes,
        ...shadcn.keyframes,
        ...spinner.keyframes,
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
        heading: ["var(--font-heading)"],
        body: ["var(--font-body)"],
      },
      fontWeight: {
        normal: "400",
        medium: "400",
        semibold: "500",
        bold: "600",
      },
      colors: shadcn.colors,
      borderRadius: shadcn.borderRadius,
      boxShadow: shadcn.boxShadow,
    },
  },
  plugins: [],
} satisfies Config;

export default config;
