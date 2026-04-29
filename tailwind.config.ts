import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        trainium: {
          primary: "#12BFA6",
          primaryHover: "#0E9B88",
          primaryActive: "#0C7C6E",
          accent: "#24E3C2",
          dark: "#0D1B2A",
          darkSoft: "#1F2937",
          background: "#F4F6F8",
          backgroundSoft: "#F8FAFC",
          surface: "#FFFFFF",
          border: "#E5E7EB",
          text: "#111827",
          muted: "#6B7280"
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: "hsl(var(--surface))",
        "surface-alt": "hsl(var(--surface-alt))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        popover: "hsl(var(--popover))",
        "popover-foreground": "hsl(var(--popover-foreground))",
        primary: "hsl(var(--primary))",
        "primary-hover": "hsl(var(--primary-hover))",
        "primary-active": "hsl(var(--primary-active))",
        "primary-soft": "hsl(var(--primary-soft))",
        "primary-muted": "hsl(var(--primary-muted))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        "text-primary": "hsl(var(--text-primary))",
        "text-secondary": "hsl(var(--text-secondary))",
        "text-muted": "hsl(var(--text-muted))",
        "metal-light": "hsl(var(--metal-light))",
        "metal-mid": "hsl(var(--metal-mid))",
        "metal-dark": "hsl(var(--metal-dark))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        error: "hsl(var(--error))",
        info: "hsl(var(--info))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        destructive: "hsl(var(--destructive))",
        "destructive-foreground": "hsl(var(--destructive-foreground))",
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))"
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "var(--font-sans)", "system-ui", "sans-serif"]
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(circle at top left, rgba(18, 191, 166, 0.10), transparent 24%), radial-gradient(circle at bottom right, rgba(56, 189, 248, 0.08), transparent 30%)",
        "trainium-hero":
          "radial-gradient(circle at top right, rgba(36, 227, 194, 0.22), transparent 32%), linear-gradient(135deg, #0D1B2A 0%, #111827 55%, #0E9B88 140%)",
        "trainium-ai":
          "linear-gradient(135deg, rgba(18, 191, 166, 0.12), rgba(56, 189, 248, 0.12))"
      }
    }
  },
  plugins: []
}

export default config
