import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { z } from 'zod';

/**
 * The web server's settings, from the environment. In production every setting that picks an
 * implementation is required and has no default (the identity provider, the key provider, the cookie
 * sealing key), so a deployment can never fall back to the local ones by omission. Development
 * defaults are local and synthetic.
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
  TP_LOCAL_MASTER_KEY: base64Key.optional(),
  KMS_KEY_ID: z.string().min(1).optional(),
});

export type AuthProviderSettings =
  | { readonly kind: 'dev'; readonly directory: string }
  | { readonly kind: 'cognito'; readonly userPoolId: string; readonly clientId: string; readonly region: string };

export type KeyProviderSettings = { readonly kind: 'local'; readonly masterKey: Buffer } | { readonly kind: 'kms'; readonly keyId: string };

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
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/** Where `pnpm db:seed` and the development server keep the local identity provider's store. */
export function defaultDevAuthDirectory(): string {
  return path.join(tmpdir(), 'therapy-platform-dev-auth');
}

/** Development only: a fixed local master key, derived rather than written down (synthetic data only). */
export function developmentMasterKey(): Buffer {
  return createHash('sha256').update('therapy-platform local development master key').digest();
}

/** Development only: a cookie key for one server process. */
function developmentCookieSecret(): Buffer {
  return createHash('sha256').update(`therapy-platform development cookie key ${String(process.pid)} ${String(Date.now())}`).digest();
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

  return {
    production,
    databaseUrl: settings.DATABASE_URL,
    origin: new URL(settings.APP_ORIGIN).origin,
    rpId: settings.WEBAUTHN_RP_ID ?? new URL(settings.APP_ORIGIN).hostname,
    cookieSecret,
    auth,
    keys,
  };
}
