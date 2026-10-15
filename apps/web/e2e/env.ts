import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Where the e2e run lives: its own database (recreated by prepare.ts on every run), the local
 * identity provider's directory, and the server's origin. localhost, not 127.0.0.1: WebAuthn refuses
 * an IP address as the relying party.
 */

export const E2E_PORT = 3100;
export const E2E_ORIGIN = `http://localhost:${String(E2E_PORT)}`;
export const E2E_DATABASE = 'tp_e2e';
export const E2E_DEV_AUTH_DIR = path.join(tmpdir(), 'tp-e2e-dev-auth');

/** The superuser (or CREATEDB and owner-capable) login the run prepares its database with. */
export function e2eAdminUrl(): string {
  return process.env.E2E_ADMIN_URL ?? process.env.DATABASE_URL ?? 'postgres://postgres:test@localhost:5432/postgres';
}

export function e2eDatabaseUrl(adminUrl: string = e2eAdminUrl()): string {
  const url = new URL(adminUrl);
  url.pathname = `/${E2E_DATABASE}`;
  return url.toString();
}
