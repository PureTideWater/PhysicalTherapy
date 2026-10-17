import path from 'node:path';

import type { NextConfig } from 'next';

import { STATIC_SECURITY_HEADERS, staticAssetOrigin } from './src/lib/http/security-headers';

const monorepoRoot = path.resolve(import.meta.dirname, '../..');

// The static host CloudFront serves /_next/static/ from (PRD 15, Compute: "CloudFront for static assets only";
// docs/adr/0055). Next writes it into the build, so the image is built with that environment's StaticAssetsOrigin
// (apps/web/Dockerfile, the STATIC_ASSET_ORIGIN build argument) and its task sets the same value for the CSP.
// Unset, every asset loads from the application's own host.
const assetOrigin = staticAssetOrigin(process.env);

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(assetOrigin === null ? {} : { assetPrefix: assetOrigin }),
  // A server action's body may carry a signed agreement's PDF (at most 10 MB, MAX_AGREEMENT_BYTES; docs/adr/0053);
  // every other upload goes straight to storage through a pre-signed URL. The proxy (src/proxy.ts) buffers no more
  // of any body than that largest one (docs/adr/0055); route handlers read theirs with their own, smaller bounds.
  experimental: { serverActions: { bodySizeLimit: '11mb' }, proxyClientMaxBodySize: '11mb' },
  // The fixed security headers on every response, static assets included; the per-request CSP with its nonce
  // comes from src/proxy.ts (docs/adr/0053).
  headers: () => Promise.resolve([{ source: '/:path*', headers: [...STATIC_SECURITY_HEADERS] }]),
  // No generated agent-instruction file (AGENTS.md): CLAUDE.md and .claude/ are the repository's.
  agentRules: false,
  // A self-contained server for the container image (apps/web/Dockerfile).
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  // Workspace packages export TypeScript source; Next compiles them with the app.
  transpilePackages: [
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
