import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { fontClassName } from '../lib/fonts';
import { BRAND_NAME, BRAND_TAGLINE, BRAND_THEME_COLOR } from '../lib/brand';
import './globals.css';

/**
 * Every page renders per request: pages can carry PHI, so none is prerendered or cached, and Next
 * sends each dynamic response with Cache-Control: private, no-cache, no-store (the e2e tests check
 * it). The layout holds no authorization: each page runs its own registered route (src/lib/routes),
 * which resolves the session and the practice scope on every request. The full security-header set
 * arrives in milestone 11.
 *
 * The brand's fonts are self-hosted through next/font/local (src/lib/fonts.ts) and set on <html>; the
 * favicon (app/icon.svg), touch icon (app/apple-icon.png) and manifest (app/manifest.ts) are Next's file
 * conventions. Nothing on any page is requested from a third-party origin for the brand.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: BRAND_NAME, template: `%s | ${BRAND_NAME}` },
  applicationName: BRAND_NAME,
  description: `Contract-payment verification for outpatient therapy practices and their billing firms. ${BRAND_TAGLINE}`,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: BRAND_THEME_COLOR };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={fontClassName}>
      <body className="min-h-screen bg-background text-foreground">{children}</body>
    </html>
  );
}
