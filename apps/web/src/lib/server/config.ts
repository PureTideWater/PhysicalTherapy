import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { developmentMasterKey } from '@tp/db/runtime';
import { z } from 'zod';

/**
 * The web server's settings, from the environment. In production every setting that picks an
 * implementation is required and has no default (the identity provider, the key provider, the cookie
 * sealing key), so a deployment can never fall back to the local ones by omission, and the local
 * identity and key providers are refused outright: a production build runs them only for the e2e
 * suite, which says so with TP_ALLOW_LOCAL_PROVIDERS=e2e (set by playwright.config.ts alone).
 * Development defaults are local and synthetic.
 */

const base64Key = z
  .string()
  .refine((value) => Buffer.from(value, 'base64').length === 32, 'a base64-encoded 32-byte key')
  .transform((value) => Buffer.from(value, 'base64'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.url(),
  APP_ORIGIN: z.url().default('http://localhost:3000'),
  WEBAUTHN_RP_ID: z.string().regex(/^[a-z0-9.-]+$/).optional(),
  TP_AUTH_PROVIDER: z.enum(['dev', 'cognito']).optional(),
  AUTH_COOKIE_SECRET: base64Key.optional(),
  TP_DEV_AUTH_DIR: z.string().min(1).optional(),
  COGNITO_USER_POOL_ID: z.string().regex(/^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]+$/).optional(),
  COGNITO_CLIENT_ID: z.string().regex(/^[a-z0-9]+$/).optional(),
  TP_KEY_PROVIDER: z.enum(['local', 'kms']).optional(),
  TP_ALLOW_LOCAL_PROVIDERS: z.literal('e2e').optional(),
  TP_LOCAL_MASTER_KEY: base64Key.optional(),
  KMS_KEY_ID: z.string().min(1).optional(),
  QUEUE_DATABASE_URL: z.url().optional(),
  DOCUMENTS_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/).optional(),
  DOCUMENTS_KMS_KEY_ID: z.string().min(1).optional(),
  DOCUMENTS_DIR: z.string().min(1).optional(),
  CONTENT_ROOT: z.string().min(1).optional(),
  TRUSTED_PROXY_HOPS: z.enum(['0', '1', '2', '3']).optional(),
  SUPPORT_EMAIL: z.email().optional(),
  ESIGN_PROVIDER: z.enum(['local', 'none']).optional(),
  ESIGN_LOCAL_SECRET: z.string().min(16).optional(),
  ESIGN_LOCAL_DIR: z.string().min(1).optional(),
  AGREEMENTS_DIR: z.string().min(1).optional(),
  COMPLIANCE_EXPORT_DIR: z.string().min(1).optional(),
  TP_ENVIRONMENT: z.enum(['dev', 'staging', 'production']).optional(),
});

export type AuthProviderSettings =
  | { readonly kind: 'dev'; readonly directory: string }
  | { readonly kind: 'cognito'; readonly userPoolId: string; readonly clientId: string; readonly region: string };

export type KeyProviderSettings = { readonly kind: 'local'; readonly masterKey: Buffer } | { readonly kind: 'kms'; readonly keyId: string };

/** Where uploads land: the documents bucket (presigned PUTs under SSE-KMS) or a local directory. */
export type DocumentSettings = { readonly kind: 's3'; readonly bucket: string; readonly kmsKeyId: string } | { readonly kind: 'local'; readonly dir: string };

/** Development only: the repository the server runs from (apps/web or the root), when it holds content/drafts. */
export function defaultContentRoot(cwd: string = process.cwd()): string | null {
  for (const candidate of [cwd, path.resolve(cwd, '../..')]) {
    if (existsSync(path.join(candidate, 'content', 'drafts'))) {
      return candidate;
    }
  }
  return null;
}

/** Development only: where uploads land locally, shared with the worker (its DOCUMENTS_DIR default). */
export function defaultDocumentsDirectory(): string {
  return path.join(tmpdir(), 'tp-documents');
}

export interface WebConfig {
  readonly production: boolean;
  readonly databaseUrl: string;
  /** The application's origin: what browsers sign for WebAuthn and what notices link to. */
  readonly origin: string;
  readonly rpId: string;
  /** Seals the sign-in state the browser carries between steps. */
  readonly cookieSecret: Buffer;
  readonly auth: AuthProviderSettings;
  readonly keys: KeyProviderSettings;
  /** pg-boss's login, which the web app queues jobs with; DATABASE_URL unless QUEUE_DATABASE_URL is set. */
  readonly queueDatabaseUrl: string;
  readonly documents: DocumentSettings;
  /**
   * The checkout whose content/ the internal console's Rule releases screen reads, checks and prepares
   * the next release in (CONTENT_ROOT; in development, the repository the server runs from). Null when
   * the server has none, as in production unless a checkout is mounted: the screen then says to use
   * the release commands (docs/adr/0037).
   */
  readonly contentRoot: string | null;
  /**
   * The proxies in front of the server that append the client's address to X-Forwarded-For (TRUSTED_PROXY_HOPS:
   * the load balancer, 1, in staging and production, where it is required; 0 elsewhere, trusting none).
   */
  readonly trustedProxyHops: number;
  /** The support address (PRD 19, Support): shown in every screen's help and on the error and status pages. */
  readonly supportEmail: string;
  /**
   * The e-signature vendor (docs/adr/0053): the local stand-in, or none (the webhook then refuses every event and
   * agreements are recorded in the console by upload or by reference). The plan names no vendor.
   */
  readonly esign: { readonly kind: 'local'; readonly secret: string; readonly directory: string } | { readonly kind: 'none' };
  /** Where uploaded agreements are kept locally (the documents bucket in staging and production). */
  readonly agreementsDir: string;
  /**
   * Where the evidence export is written for the compliance platform to collect (docs/adr/0053); null in staging
   * and production until the vendor is chosen (the console's download is then the export).
   */
  readonly complianceExportDir: string | null;
  /** The deployment this server runs in (the evidence export names it); dev outside staging and production. */
  readonly environment: 'dev' | 'staging' | 'production';
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/** Where `pnpm db:seed` and the development server keep the local identity provider's store. */
export function defaultDevAuthDirectory(): string {
  return path.join(tmpdir(), 'therapy-platform-dev-auth');
}

/** Development only: the fixed local master key the web app, the worker and the seed share (synthetic data only). */
export { developmentMasterKey };

/** Development only: a cookie key for one server process. */
function developmentCookieSecret(): Buffer {
  return createHash('sha256').update(`therapy-platform development cookie key ${String(process.pid)} ${String(Date.now())}`).digest();
}

/** Development only: the local e-signature stand-in's shared secret (synthetic events only). */
const DEVELOPMENT_ESIGN_SECRET = 'therapy-platform development e-signature secret';

function esignSettings(settings: z.output<typeof schema>, production: boolean): WebConfig['esign'] {
  const kind = settings.ESIGN_PROVIDER ?? (production ? 'none' : 'local');
  if (kind === 'none') {
    return { kind: 'none' };
  }
  if (production && settings.TP_ALLOW_LOCAL_PROVIDERS !== 'e2e') {
    throw new ConfigError('ESIGN_PROVIDER=local is refused in production (no vendor is chosen yet; record agreements in the console)');
  }
  return { kind: 'local', secret: settings.ESIGN_LOCAL_SECRET ?? DEVELOPMENT_ESIGN_SECRET, directory: settings.ESIGN_LOCAL_DIR ?? path.join(tmpdir(), 'tp-esign') };
}

export function readWebConfig(env: Readonly<Record<string, string | undefined>> = process.env): WebConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ');
    throw new ConfigError(`invalid settings: ${names}`);
  }
  const settings = parsed.data;
  const production = settings.NODE_ENV === 'production';
  const needed = <T>(value: T | undefined, name: string, when = 'in production'): T => {
    if (value === undefined) {
      throw new ConfigError(`${name} is required ${when}`);
    }
    return value;
  };
  const authKind = production ? needed(settings.TP_AUTH_PROVIDER, 'TP_AUTH_PROVIDER') : (settings.TP_AUTH_PROVIDER ?? 'dev');
  const keyKind = production ? needed(settings.TP_KEY_PROVIDER, 'TP_KEY_PROVIDER') : (settings.TP_KEY_PROVIDER ?? 'local');
  if (production && settings.TP_ALLOW_LOCAL_PROVIDERS !== 'e2e') {
    if (authKind === 'dev') {
      throw new ConfigError('TP_AUTH_PROVIDER=dev is refused in production (Cognito only, outside the e2e suite)');
    }
    if (keyKind === 'local') {
      throw new ConfigError('TP_KEY_PROVIDER=local is refused in production (KMS only, outside the e2e suite)');
    }
  }
  const cookieSecret = production ? needed(settings.AUTH_COOKIE_SECRET, 'AUTH_COOKIE_SECRET') : (settings.AUTH_COOKIE_SECRET ?? developmentCookieSecret());

  let auth: AuthProviderSettings;
  if (authKind === 'cognito') {
    const userPoolId = needed(settings.COGNITO_USER_POOL_ID, 'COGNITO_USER_POOL_ID', 'for Cognito');
    const clientId = needed(settings.COGNITO_CLIENT_ID, 'COGNITO_CLIENT_ID', 'for Cognito');
    auth = { kind: 'cognito', userPoolId, clientId, region: userPoolId.slice(0, userPoolId.indexOf('_')) };
  } else {
    auth = { kind: 'dev', directory: settings.TP_DEV_AUTH_DIR ?? defaultDevAuthDirectory() };
  }

  let keys: KeyProviderSettings;
  if (keyKind === 'kms') {
    keys = { kind: 'kms', keyId: needed(settings.KMS_KEY_ID, 'KMS_KEY_ID', 'for KMS') };
  } else {
    keys = { kind: 'local', masterKey: production ? needed(settings.TP_LOCAL_MASTER_KEY, 'TP_LOCAL_MASTER_KEY') : (settings.TP_LOCAL_MASTER_KEY ?? developmentMasterKey()) };
  }

  if (production && settings.TP_ALLOW_LOCAL_PROVIDERS !== 'e2e' && settings.DOCUMENTS_DIR !== undefined) {
    throw new ConfigError('DOCUMENTS_DIR is refused in production (S3 only, outside the e2e suite)');
  }
  let documents: DocumentSettings;
  if (settings.DOCUMENTS_BUCKET !== undefined) {
    if (settings.DOCUMENTS_DIR !== undefined) {
      throw new ConfigError('at most one of DOCUMENTS_BUCKET and DOCUMENTS_DIR is set');
    }
    documents = { kind: 's3', bucket: settings.DOCUMENTS_BUCKET, kmsKeyId: needed(settings.DOCUMENTS_KMS_KEY_ID, 'DOCUMENTS_KMS_KEY_ID', 'for DOCUMENTS_BUCKET') };
  } else if (production && settings.TP_ALLOW_LOCAL_PROVIDERS !== 'e2e') {
    throw new ConfigError('DOCUMENTS_BUCKET is required in production');
  } else {
    documents = { kind: 'local', dir: settings.DOCUMENTS_DIR ?? defaultDocumentsDirectory() };
  }

  return {
    production,
    databaseUrl: settings.DATABASE_URL,
    origin: new URL(settings.APP_ORIGIN).origin,
    rpId: settings.WEBAUTHN_RP_ID ?? new URL(settings.APP_ORIGIN).hostname,
    cookieSecret,
    auth,
    keys,
    queueDatabaseUrl: settings.QUEUE_DATABASE_URL ?? settings.DATABASE_URL,
    documents,
    contentRoot: settings.CONTENT_ROOT ?? (production ? null : defaultContentRoot()),
    supportEmail: production && settings.TP_ALLOW_LOCAL_PROVIDERS !== 'e2e' ? needed(settings.SUPPORT_EMAIL, 'SUPPORT_EMAIL') : (settings.SUPPORT_EMAIL ?? 'support@synthetic.test'),
    esign: esignSettings(settings, production),
    agreementsDir: settings.AGREEMENTS_DIR ?? path.join(tmpdir(), 'tp-agreements'),
    complianceExportDir: settings.COMPLIANCE_EXPORT_DIR ?? (production ? null : path.join(tmpdir(), 'tp-compliance-export')),
    environment: production && settings.TP_ALLOW_LOCAL_PROVIDERS !== 'e2e' ? needed(settings.TP_ENVIRONMENT, 'TP_ENVIRONMENT') : (settings.TP_ENVIRONMENT ?? 'dev'),
    trustedProxyHops: Number.parseInt(production && settings.TP_ALLOW_LOCAL_PROVIDERS !== 'e2e' ? needed(settings.TRUSTED_PROXY_HOPS, 'TRUSTED_PROXY_HOPS') : (settings.TRUSTED_PROXY_HOPS ?? '0'), 10),
  };
}
