import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

/**
 * Every page renders per request: pages can carry PHI, so none is prerendered or cached, and Next
 * sends each dynamic response with Cache-Control: private, no-cache, no-store (the e2e tests check
 * it). The layout holds no authorization: each page runs its own registered route (src/lib/routes),
 * which resolves the session and the practice scope on every request. The full security-header set
 * arrives in milestone 11.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Therapy contract-payment platform', template: '%s | Therapy contract-payment platform' },
  description: 'Contract-payment verification for outpatient therapy practices and their billing firms.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">{children}</body>
    </html>
  );
}
