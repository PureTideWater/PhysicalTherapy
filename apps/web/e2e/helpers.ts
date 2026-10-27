import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { type DatabaseClient, databaseClient } from '@tp/db';
import { type CDPSession, type Page, expect } from '@playwright/test';

import { SYNTHETIC_PRACTICES, personaEmail, personaPassword, personaTotpCode } from '../scripts/synthetic-personas';
import { E2E_DEV_AUTH_DIR, e2eDatabaseUrl } from './env';

/** The e2e database, as its superuser: to find records and to move clocks the tests cannot wait for. */
export async function withDatabase<T>(run: (client: DatabaseClient) => Promise<T>): Promise<T> {
  const client = databaseClient(e2eDatabaseUrl());
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export function practiceId(name: keyof typeof SYNTHETIC_PRACTICES): Promise<string> {
  return withDatabase(async (client) => {
    const { rows } = await client.query<{ id: string }>('SELECT id FROM practice WHERE name = $1', [SYNTHETIC_PRACTICES[name]]);
    const [row] = rows;
    if (row === undefined) {
      throw new Error('the seeded practice is missing');
    }
    return row.id;
  });
}

export async function enterPassword(page: Page, key: string, password: string = personaPassword(key)): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(personaEmail(key));
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Continue' }).click();
}

/**
 * Email, password, then the TOTP code (a step ahead when `ahead`, for a second sign-in in the same 30
 * seconds). A code is accepted once: when a spec running in parallel signed the same persona in during
 * this step, the code is refused, and the next step's code is entered instead.
 */
export async function signInWithTotp(page: Page, key: string, ahead = false): Promise<void> {
  await enterPassword(page, key);
  await expect(page).toHaveURL(/\/sign-in\/mfa$/);
  const at = Date.now() + (ahead ? 30_000 : 0);
  await page.getByLabel('Six-digit code').fill(personaTotpCode(key, new Date(at)));
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
    await page.getByLabel('Six-digit code').fill(personaTotpCode(key, new Date(at + 30_000)));
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await signedIn;
}

/** The form's refusal (the alert component; Next's route announcer is an alert too). */
export function refusal(page: Page) {
  return page.locator('[data-slot="alert"]');
}

/** A virtual hardware key in a page's browser: the DevTools session that holds it, and its authenticator's ID. */
export interface VirtualKey {
  readonly cdp: CDPSession;
  readonly authenticatorId: string;
}

/** A virtual hardware key (CTAP2, USB, user verification) in this page's browser. */
export async function addVirtualKey(page: Page): Promise<VirtualKey> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'usb', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return { cdp, authenticatorId };
}

export async function signInWithKey(page: Page, key: string): Promise<void> {
  await page.goto('/sign-in/hardware-key');
  await page.getByLabel('Email').fill(personaEmail(key));
  await page.getByRole('button', { name: 'Sign in with hardware key' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

/**
 * Where an account's virtual key is kept between a test's attempts: beside the local identity provider's store that
 * registered it, which prepare.ts empties with it before every run, so a key never outlives the registration it matches.
 * SYNTHETIC accounts and a virtual authenticator's own keys only.
 */
export function keptKeyPath(account: string): string {
  if (!/^[a-z0-9-]{1,64}$/.test(account)) {
    throw new Error('a kept key is named by an account key of lowercase letters, digits and hyphens');
  }
  return path.join(E2E_DEV_AUTH_DIR, 'virtual-keys', `${account}.json`);
}

/** The authenticator's credentials, kept for a later attempt: after the registration, and again after each sign-in. */
async function keepKey(key: VirtualKey, account: string): Promise<void> {
  const { credentials } = await key.cdp.send('WebAuthn.getCredentials', { authenticatorId: key.authenticatorId });
  mkdirSync(path.dirname(keptKeyPath(account)), { recursive: true });
  writeFileSync(keptKeyPath(account), JSON.stringify(credentials), { mode: 0o600 });
}

/**
 * The key an earlier attempt registered and kept, put back in this browser's authenticator; false when none was kept.
 * Its counter goes one past the kept one: at most one sign-in (the one after the last keeping) can have moved the
 * provider's counter since, and the provider refuses a counter that does not move forward.
 */
async function restoreKey(key: VirtualKey, account: string): Promise<boolean> {
  if (!existsSync(keptKeyPath(account))) {
    return false;
  }
  // As WebAuthn.getCredentials gave them, which WebAuthn.addCredential takes back.
  const credentials = JSON.parse(readFileSync(keptKeyPath(account), 'utf8')) as { readonly credentialId: string; readonly isResidentCredential: boolean; readonly privateKey: string; readonly signCount: number }[];
  for (const credential of credentials) {
    await key.cdp.send('WebAuthn.addCredential', { authenticatorId: key.authenticatorId, credential: { ...credential, signCount: credential.signCount + 1 } });
  }
  return credentials.length > 0;
}

/**
 * An internal account's first sign-in with its hardware key, safe to retry: password and TOTP (`signIn`), then register
 * a key and sign in with it. A test's retry runs in a fresh browser, while the local identity provider still holds the
 * key the first attempt registered, so the TOTP sign-in asks for that key instead of offering to register one; the key
 * the attempt kept is put back in this browser's authenticator and signs in, as a person brings back the key they
 * registered. Without a kept key the account's key is unknown to the run, and the call fails saying so.
 */
export async function registerOrRestoreKeyAndSignIn(page: Page, account: { readonly name: string; readonly email: string }, signIn: () => Promise<void>): Promise<void> {
  const key = await addVirtualKey(page);
  await signIn();
  await expect(page).toHaveURL(/\/sign-in\/(?:register-key|hardware-key\?reason=hardware_key_required)$/);
  if (new URL(page.url()).pathname === '/sign-in/register-key') {
    await page.getByRole('button', { name: 'Register hardware key' }).click();
    await expect(page).toHaveURL(/\/sign-in\/hardware-key\?reason=key_registered$/);
    await keepKey(key, account.name);
  } else if (!(await restoreKey(key, account.name))) {
    throw new Error(`${account.name} has a hardware key that no attempt of this run kept; run e2e/prepare.ts for a fresh database`);
  }
  await page.goto('/sign-in/hardware-key');
  await page.getByLabel('Email').fill(account.email);
  await page.getByRole('button', { name: 'Sign in with hardware key' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
  await keepKey(key, account.name);
}

/** An internal persona's first sign-in: password and TOTP, register a key, then sign in with it (safe to retry). */
export async function registerKeyAndSignIn(page: Page, key: string): Promise<void> {
  await registerOrRestoreKeyAndSignIn(page, { name: key, email: personaEmail(key) }, () => signInWithTotp(page, key));
}
