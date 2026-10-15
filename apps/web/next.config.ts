import path from 'node:path';

import type { NextConfig } from 'next';

const monorepoRoot = path.resolve(import.meta.dirname, '../..');

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // A self-contained server for the container image (apps/web/Dockerfile).
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  // Workspace packages export TypeScript source; Next compiles them with the app.
  transpilePackages: [
    '@tp/contracts',
    '@tp/db',
    '@tp/ledger',
    '@tp/money',
    '@tp/observability',
    '@tp/packets',
    '@tp/pricing',
    '@tp/rules',
    '@tp/triage',
    '@tp/ui',
  ],
};

export default config;
