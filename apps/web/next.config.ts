import path from 'node:path';

import type { NextConfig } from 'next';

import { PUBLIC_BRAND_ASSET_HEADERS, PUBLIC_BRAND_ASSET_SOURCE, STATIC_SECURITY_HEADERS } from './src/lib/http/security-headers';

const monorepoRoot = path.resolve(import.meta.dirname, '../..');

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // A server action's body may carry a signed agreement's PDF (at most 10 MB, MAX_AGREEMENT_BYTES; docs/adr/0053);
  // every other upload goes straight to storage through a pre-signed URL.
  experimental: { serverActions: { bodySizeLimit: '11mb' } },
  // The fixed security headers on every response, static assets included; the per-request CSP with its nonce
  // comes from src/proxy.ts (docs/adr/0053). The public brand art alone may be embedded cross-origin (the email's
  // header lockup); a later rule's header replaces an earlier one's of the same name.
  headers: () =>
    Promise.resolve([
      { source: '/:path*', headers: [...STATIC_SECURITY_HEADERS] },
      { source: PUBLIC_BRAND_ASSET_SOURCE, headers: [...PUBLIC_BRAND_ASSET_HEADERS] },
    ]),
  // No generated agent-instruction file (AGENTS.md): CLAUDE.md and .claude/ are the repository's.
  agentRules: false,
  // A self-contained server for the container image (apps/web/Dockerfile).
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  // Workspace packages export TypeScript source; Next compiles them with the app.
  transpilePackages: [
    '@paidwhole/brand',
    '@tp/compliance',
    '@tp/contracts',
    '@tp/db',
    '@tp/ledger',
    '@tp/model-gateway',
    '@tp/money',
    '@tp/observability',
    '@tp/packets',
    '@tp/pricing',
    '@tp/rules',
    '@tp/tools',
    '@tp/triage',
    '@tp/ui',
    '@tp/worker',
  ],
};

export default config;
