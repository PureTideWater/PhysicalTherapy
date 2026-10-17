import type { Config } from "tailwindcss";

/**
 * Tailwind preset that exposes the brand tokens as utilities (bg-ink, text-slate, font-display,
 * text-status-short ...). Every color points at a CSS variable from tokens.css, so dark mode and
 * print work without separate utility classes.
 *
 * apps/web/tailwind.config.ts:
 *   import brand from "@paidwhole/brand/tailwind-preset";
 *   export default { presets: [brand], content: [...] } satisfies Config;
 */
const preset = {
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ink: "var(--pw-ink)",
        brass: "var(--pw-brass)",
        paper: "var(--pw-paper)",
        slate: "var(--pw-slate)",
        line: "var(--pw-line)",
        bg: {
          DEFAULT: "var(--pw-bg)",
          raised: "var(--pw-bg-raised)",
          inset: "var(--pw-bg-inset)",
        },
        fg: {
          DEFAULT: "var(--pw-fg)",
          muted: "var(--pw-fg-muted)",
          inverse: "var(--pw-fg-inverse)",
        },
        border: {
          DEFAULT: "var(--pw-border)",
          strong: "var(--pw-border-strong)",
        },
        primary: {
          DEFAULT: "var(--pw-primary)",
          foreground: "var(--pw-primary-fg)",
          hover: "var(--pw-primary-hover)",
        },
        accent: "var(--pw-accent)",
        link: "var(--pw-link)",
        focus: "var(--pw-focus)",
        danger: "var(--pw-danger)",
        status: {
          whole: "var(--pw-whole)",
          short: "var(--pw-short)",
          unpriced: "var(--pw-unpriced)",
          "whole-bg": "var(--pw-whole-bg)",
          "short-bg": "var(--pw-short-bg)",
          "unpriced-bg": "var(--pw-unpriced-bg)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "IBM Plex Sans", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        display: "-0.02em",
        wordmark: "-0.03em",
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "10px",
        pill: "999px",
      },
      ringColor: {
        DEFAULT: "var(--pw-focus)",
      },
    },
  },
} satisfies Partial<Config>;

export default preset;
