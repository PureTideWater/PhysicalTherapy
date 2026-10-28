import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

import { type Page, expect } from '@playwright/test';
import { LocalKeyProvider, OWNER_ROLE, databaseClient, developmentMasterKey, provisionPracticeKey } from '@tp/db';
import { asOwner, createPracticeWithLocation } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { LocalMailEventSource, LocalMailSender, type MailEventsResult, MemoryMailControl, runMailEvents, sendSupportGrantNotices } from '@tp/worker/runtime';

import { FileDevStore } from '../src/lib/auth/dev-store';
import { hashPassword } from '../src/lib/auth/password';
import { personaPassword, personaTotpCode, personaTotpSecret } from '../scripts/synthetic-personas';
import { E2E_MAIL_EVENTS_DIR, E2E_MAIL_OUTBOX_DIR, E2E_MAIL_STREAM_PREFIX, E2E_ORIGIN, e2eDatabaseUrl } from './env';
import { refusal, registerOrRestoreKeyAndSignIn, withDatabase } from './helpers';

/**
 * The mail journeys' world (audit #76; docs/adr/0065; test matrix SCR-21 and SEC-19): two accounts e2e/prepare.ts
 * creates before the server starts, and the platform's jobs run once on demand, as the platform task runs them every
 * minute, on the local sender's outbox and its simulator-shaped events (SES's mailbox simulator, by the local part
 * before any `+`).
 *
 * - The notice journey's practice administrator, whose address is SES's suppression-list simulator: the practice is its
 *   group's only one, and the administrator its only one, so its support-access notice reaches no one.
 * - The cut-off journey's platform administrator, who resumes the screening stream in the console.
 *
 * Their passwords and TOTP secrets are derived from their keys as the personas' are (scripts/synthetic-personas.ts);
 * synthetic accounts, never a real person. The cut-off journey pauses the one screening stream every screening shares,
 * so it holds the stream alone (holdScreeningStream): every other screening test holds it shared.
 */

export interface MailAccount {
  readonly key: string;
  readonly email: string;
}

/** The notice journey's practice administrator: SES's suppression-list simulator, labelled for this journey. */
export const MAIL_NOTICE_ADMIN: MailAccount = { key: 'mail-notice-admin', email: 'suppressionlist+e2e-notice@simulator.amazonses.com' };
/** The cut-off journey's platform administrator. */
export const MAIL_CONSOLE_ADMIN: MailAccount = { key: 'mail-console-admin', email: 'mail-console-admin@synthetic.test' };
/** The notice journey's practice, its group's only one. */
export const MAIL_NOTICE_PRACTICE = 'SYNTHETIC MAIL NOTICE PRACTICE';

/** A user, active, with MFA (or, internal, a hardware key to register), its membership and the terms accepted. */
async function createAccount(client: ReturnType<typeof databaseClient>, account: MailAccount, organizationId: string, role: 'practice_admin' | 'platform_admin'): Promise<{ readonly id: string; readonly sub: string }> {
  const id = randomUUID();
  const sub = randomUUID();
  await asOwner(client, [], async () => {
    await client.query('INSERT INTO "user" (id, cognito_sub, email, mfa_enrolled, hardware_key_required, status) VALUES ($1, $2, $3, true, $4, $5)', [
      id,
      sub,
      account.email,
      role === 'platform_admin',
      'active',
    ]);
    await client.query('INSERT INTO membership (organization_id, user_id, role) VALUES ($1, $2, $3)', [organizationId, id, role]);
    await client.query("INSERT INTO terms_acceptance (user_id, terms_version_id, request_id) SELECT $1, id, 'e2e-mail' FROM terms_version", [id]);
  });
  return { id, sub };
}

/**
 * Before the server starts (e2e/prepare.ts, after the seed): the two mail accounts in the database and in the local
 * identity provider's store, and the notice journey's group and practice. Synthetic data only.
 */
export async function prepareMailAccounts(databaseUrl: string, devAuthDirectory: string): Promise<void> {
  const client = databaseClient(databaseUrl);
  await client.connect();
  let accounts: { readonly account: MailAccount; readonly sub: string }[];
  try {
    const organization = randomUUID();
    await asOwner(client, [], () => client.query("INSERT INTO organization (id, kind, name) VALUES ($1, 'group', 'SYNTHETIC MAIL NOTICE GROUP')", [organization]));
    // The group's administrator first: the database refuses a practice in a group with none (practice_has_administrator).
    const notice = await createAccount(client, MAIL_NOTICE_ADMIN, organization, 'practice_admin');
    const practice = randomUUID();
    const key = await provisionPracticeKey(new LocalKeyProvider(developmentMasterKey()), practice);
    await asOwner(client, [practice], async () => {
      await createPracticeWithLocation(client, { id: practice, organizationId: organization, name: MAIL_NOTICE_PRACTICE, dataKeyRef: key.dataKeyRef, zip: '27601' });
      for (const kind of ['baa', 'engagement'] as const) {
        await client.query(
          `INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
           VALUES ($1, $2, $3, '1', now() - interval '30 days', 'SYNTHETIC SIGNER', $4, $5)`,
          [organization, practice, kind, `esign:synthetic-${practice}-${kind}`, createHash('sha256').update(`${MAIL_NOTICE_PRACTICE} ${kind}`).digest('hex')],
        );
      }
    });
    const internal = (await client.query<{ id: string }>("SELECT id FROM organization WHERE kind = 'internal' ORDER BY created_at LIMIT 1")).rows[0]?.id ?? '';
    const console_ = await createAccount(client, MAIL_CONSOLE_ADMIN, internal, 'platform_admin');
    accounts = [
      { account: MAIL_NOTICE_ADMIN, sub: notice.sub },
      { account: MAIL_CONSOLE_ADMIN, sub: console_.sub },
    ];
  } finally {
    await client.end();
  }
  const store = new FileDevStore(path.join(devAuthDirectory, 'store.json'));
  for (const { account, sub } of accounts) {
    await store.put({
      sub,
      email: account.email,
      passwordHash: await hashPassword(personaPassword(account.key)),
      temporary: false,
      totpSecret: personaTotpSecret(account.key),
      totpLastStep: -1,
      credentials: [],
    });
  }
}

/** Email, password, then the TOTP code, as signInWithTotp does for a persona (e2e/helpers.ts). */
export async function signInAs(page: Page, account: MailAccount): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(personaPassword(account.key));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/sign-in\/mfa$/);
  await page.getByLabel('Six-digit code').fill(personaTotpCode(account.key));
  await page.getByRole('button', { name: 'Sign in' }).click();
  const signedIn = page.waitForURL((url) => url.pathname !== '/sign-in/mfa').then(() => true);
  const refused = refusal(page)
    .filter({ hasText: 'That did not match' })
    .waitFor()
    .then(
      () => false,
      () => true,
    );
  if (!(await Promise.race([signedIn, refused])) && new URL(page.url()).pathname === '/sign-in/mfa') {
    await page.getByLabel('Six-digit code').fill(personaTotpCode(account.key, new Date(Date.now() + 30_000)));
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await signedIn;
}

/**
 * An internal account's first sign-in: password and TOTP, register a key, then sign in with it; safe to retry, as
 * registerKeyAndSignIn is (a retry puts back the key the first attempt registered).
 */
export async function registerKeyAndSignInAs(page: Page, account: MailAccount): Promise<void> {
  await registerOrRestoreKeyAndSignIn(page, { name: account.key, email: account.email }, () => signInAs(page, account));
}

/** The local sender with its simulator-shaped events, as the platform and the consumer send in the journeys. */
export function localMail(): LocalMailSender {
  return new LocalMailSender(E2E_MAIL_OUTBOX_DIR, null, { eventsDir: E2E_MAIL_EVENTS_DIR, streamPrefix: E2E_MAIL_STREAM_PREFIX });
}

/** The platform's support_notices job, once, on the e2e database (its superuser, which switches to tp_operator). */
export async function sendSupportNoticesOnce(): Promise<void> {
  await withDatabase(async (client) => {
    await sendSupportGrantNotices({ client, mail: localMail(), origin: E2E_ORIGIN, requestId: `e2e-notices-${randomUUID()}`, logger: createLogger({ sink: () => undefined }) });
  });
}

/** SES's account and the screening set, as the journeys' platform sees them (one per spec process). */
export const MAIL_CONTROL = new MemoryMailControl();

/** The platform's mail_events job, once: the reconcile, the probes, and every event the local sender wrote. */
export async function recordMailEventsOnce(): Promise<MailEventsResult> {
  return withDatabase((client) =>
    runMailEvents({
      client,
      source: new LocalMailEventSource(E2E_MAIL_EVENTS_DIR),
      control: MAIL_CONTROL,
      mail: localMail(),
      streamPrefix: E2E_MAIL_STREAM_PREFIX,
      probes: true,
      requestId: `e2e-mail-events-${randomUUID()}`,
      logger: createLogger({ sink: () => undefined }),
    }),
  );
}

/** The advisory lock every screening holds shared, and the cut-off journey alone (it pauses the one stream). */
const SCREENING_STREAM_LOCK = 760_065;

/**
 * Holds the screening stream for a test: shared by every screening journey, alone by the cut-off journey, which pauses
 * it. Postgres queues a waiting exclusive request ahead of later shared ones, so the cut-off is never starved.
 */
export async function holdScreeningStream(mode: 'shared' | 'exclusive'): Promise<() => Promise<void>> {
  const client = databaseClient(e2eDatabaseUrl());
  await client.connect();
  await client.query(mode === 'shared' ? 'SELECT pg_advisory_lock_shared($1)' : 'SELECT pg_advisory_lock($1)', [SCREENING_STREAM_LOCK]);
  return async () => {
    try {
      await client.query(mode === 'shared' ? 'SELECT pg_advisory_unlock_shared($1)' : 'SELECT pg_advisory_unlock($1)', [SCREENING_STREAM_LOCK]);
    } finally {
      await client.end();
    }
  };
}

/** The screening stream sending and confirmed again, whatever a failed attempt left (the cut-off journey's cleanup). */
export async function screeningStreamSending(): Promise<void> {
  await withDatabase(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
      await client.query(
        `UPDATE mail_stream SET paused_at = NULL, paused_reason = NULL, paused_by = NULL, pause_sends = NULL, pause_bounces = NULL, pause_complaints = NULL,
                                ses_enabled_confirmed_at = coalesce(ses_enabled_confirmed_at, now())
          WHERE stream = 'screening'`,
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
  MAIL_CONTROL.sending = true;
}
