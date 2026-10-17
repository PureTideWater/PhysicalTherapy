import localFont from 'next/font/local';

/**
 * The brand's fonts through next/font/local, from the woff2 files bundled in @paidwhole/brand (SIL Open
 * Font License, the license text beside them in packages/brand/assets/fonts). Next copies them into the
 * build and serves them from the app's own origin, so nothing is fetched from a font service at build
 * time or run time, and a browser on a PHI page never contacts a third party (docs/brand/BRAND.md,
 * section 5). Do not add a Google Fonts <link>, next/font/google or any other font source in apps/web.
 *
 * The variables are the ones tokens.css reads (--pw-font-display, --pw-font-sans and --pw-font-mono fall
 * back through them); src/app/layout.tsx puts fontClassName on <html>. The paths are relative to this
 * file, as next/font/local requires.
 */
export const display = localFont({
  src: [
    { path: '../../../../packages/brand/assets/fonts/schibsted-grotesk-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../../../../packages/brand/assets/fonts/schibsted-grotesk-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../../../../packages/brand/assets/fonts/schibsted-grotesk-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
  fallback: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
});

export const sans = localFont({
  src: [
    { path: '../../../../packages/brand/assets/fonts/ibm-plex-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../../../../packages/brand/assets/fonts/ibm-plex-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../../../../packages/brand/assets/fonts/ibm-plex-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-sans',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

export const mono = localFont({
  src: [
    { path: '../../../../packages/brand/assets/fonts/ibm-plex-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../../../../packages/brand/assets/fonts/ibm-plex-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'monospace'],
});

export const fontClassName = `${display.variable} ${sans.variable} ${mono.variable}`;
