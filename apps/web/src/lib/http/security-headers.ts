/**
 * The security headers every response carries (milestone 11: "security headers on every response (the full
 * set, with CSP nonces for any inline script)"; docs/adr/0053). Pure, so the unit tests read the policy as
 * the browser does.
 *
 * - Content-Security-Policy, per request: scripts only from this origin and those carrying the request's nonce
 *   (Next attaches it to its own scripts; 'strict-dynamic' lets them load the code they import); styles from
 *   this origin and the nonce; no plugins, no framing, no base-URI change, forms posting only here. Stripe's
 *   own form (production billing) is the one third party: its script, frame and API. A presigned upload goes
 *   to the documents bucket, which connect-src names when it is configured.
 * - The rest are fixed: HSTS (two years, subdomains), no MIME sniffing, no framing, a referrer that never
 *   carries a path off this origin, no powerful features but WebAuthn and Stripe's payment request, cross-
 *   origin isolation of windows and resources, no DNS prefetch, no cross-domain policy files.
 */

export interface CspOptions {
  readonly nonce: string;
  /** Next's development server needs eval for its error overlay; production never does. */
  readonly development: boolean;
  /** Origins scripts send uploads to (the documents bucket's presigned PUTs). */
  readonly uploadOrigins: readonly string[];
  /** Whether the application is served over https (upgrade-insecure-requests). */
  readonly https: boolean;
}

const STRIPE_SCRIPTS = 'https://js.stripe.com';
const STRIPE_FRAMES = ['https://js.stripe.com', 'https://hooks.stripe.com'];
const STRIPE_API = 'https://api.stripe.com';

export function contentSecurityPolicy(options: CspOptions): string {
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", `'nonce-${options.nonce}'`, "'strict-dynamic'", STRIPE_SCRIPTS, ...(options.development ? ["'unsafe-eval'"] : [])]],
    ['style-src', ["'self'", `'nonce-${options.nonce}'`]],
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['font-src', ["'self'"]],
    ['connect-src', ["'self'", STRIPE_API, ...options.uploadOrigins]],
    ['frame-src', STRIPE_FRAMES],
    ['worker-src', ["'self'", 'blob:']],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
    ['manifest-src', ["'self'"]],
  ];
  const policy = directives.map(([name, values]) => `${name} ${values.join(' ')}`);
  if (options.https) {
    policy.push('upgrade-insecure-requests');
  }
  return policy.join('; ');
}

/** The fixed headers, the same on every response, static assets included. */
export const STATIC_SECURITY_HEADERS: readonly { readonly key: string; readonly value: string }[] = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value:
      'accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), usb=(), serial=(), bluetooth=(), ' +
      'payment=(self "https://js.stripe.com"), publickey-credentials-get=(self), publickey-credentials-create=(self)',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'Origin-Agent-Cluster', value: '?1' },
];

/** The documents bucket's origins a presigned upload is sent to, from the server's settings (none locally). */
export function uploadOrigins(env: Readonly<Record<string, string | undefined>>): string[] {
  const bucket = env.DOCUMENTS_BUCKET;
  const region = env.AWS_REGION ?? env.AWS_DEFAULT_REGION;
  if (bucket === undefined || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    return [];
  }
  return region !== undefined && /^[a-z]{2}(-[a-z]+)+-\d$/.test(region) ? [`https://${bucket}.s3.${region}.amazonaws.com`] : [`https://${bucket}.s3.amazonaws.com`];
}

/** A fresh nonce: 128 random bits, base64. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
