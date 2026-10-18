import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Where the e2e run lives: its own database (recreated by prepare.ts on every run), the local
 * identity provider's directory, and the server's origin. localhost, not 127.0.0.1: WebAuthn refuses
 * an IP address as the relying party.
 */

/**
 * E2E_DATABASE and E2E_PORT name another run's database and port, so two runs on one machine never
 * drop each other's database; its directories follow the database's name.
 */
function databaseName(): string {
  const name = process.env.E2E_DATABASE ?? 'tp_e2e';
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) {
    throw new Error('E2E_DATABASE is not a plain lowercase database name');
  }
  return name;
}

export const E2E_PORT = Number(process.env.E2E_PORT ?? '3100');
export const E2E_ORIGIN = `http://localhost:${String(E2E_PORT)}`;
export const E2E_DATABASE = databaseName();
const DIRECTORY = E2E_DATABASE === 'tp_e2e' ? 'tp-e2e' : `tp-e2e-${E2E_DATABASE}`;
export const E2E_DEV_AUTH_DIR = path.join(tmpdir(), `${DIRECTORY}-dev-auth`);
/** Where the e2e server's local upload receiver and the in-test worker keep sealed documents. */
export const E2E_DOCUMENTS_DIR = path.join(tmpdir(), `${DIRECTORY}-documents`);
/**
 * Where the e2e server's local model provider reads its fixed outputs (MODEL_LOCAL_FIXTURES_DIR, one
 * <key>.json per request, read on each call): the model features' journey writes the outputs it expects.
 */
export const E2E_MODEL_OUTPUTS_DIR = path.join(tmpdir(), `${DIRECTORY}-model-outputs`);
/** Where the in-test worker's digests are emailed (the local mail sender's outbox: one JSON file per message). */
export const E2E_MAIL_OUTBOX_DIR = path.join(tmpdir(), `${DIRECTORY}-mail`);
/** The local billing simulator's state for this run (BILLING_LOCAL_DIR): its customers, invoices and events (docs/adr/0050). */
export const E2E_BILLING_DIR = path.join(tmpdir(), `${DIRECTORY}-billing`);

/** The superuser (or CREATEDB and owner-capable) login the run prepares its database with. */
export function e2eAdminUrl(): string {
  return process.env.E2E_ADMIN_URL ?? process.env.DATABASE_URL ?? 'postgres://postgres:test@localhost:5432/postgres';
}

export function e2eDatabaseUrl(adminUrl: string = e2eAdminUrl()): string {
  const url = new URL(adminUrl);
  url.pathname = `/${E2E_DATABASE}`;
  return url.toString();
}
/** The local e-signature stand-in's signed documents and its webhook secret for this run (docs/adr/0053; synthetic only). */
export const E2E_ESIGN_DIR = path.join(tmpdir(), `${DIRECTORY}-esign`);
export const E2E_ESIGN_SECRET = 'synthetic-e2e-esign-webhook-secret';
/** Where uploaded agreements are kept, and where the evidence export is sent. */
export const E2E_AGREEMENTS_DIR = path.join(tmpdir(), `${DIRECTORY}-agreements`);
export const E2E_COMPLIANCE_DIR = path.join(tmpdir(), `${DIRECTORY}-compliance`);
