import { type DatabaseClient, databaseClient } from '@tp/db';
import { type Page, expect } from '@playwright/test';

import { SYNTHETIC_PRACTICES, personaEmail, personaPassword, personaTotpCode } from '../scripts/synthetic-personas';
import { e2eDatabaseUrl } from './env';

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

/** A virtual hardware key (CTAP2, USB, user verification) in this page's browser. */
export async function addVirtualKey(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'usb', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
}

export async function signInWithKey(page: Page, key: string): Promise<void> {
  await page.goto('/sign-in/hardware-key');
  await page.getByLabel('Email').fill(personaEmail(key));
  await page.getByRole('button', { name: 'Sign in with hardware key' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

/** An internal persona's first sign-in: password and TOTP, register a key, then sign in with it. */
export async function registerKeyAndSignIn(page: Page, key: string): Promise<void> {
  await addVirtualKey(page);
  await signInWithTotp(page, key);
  await expect(page).toHaveURL(/\/sign-in\/register-key$/);
  await page.getByRole('button', { name: 'Register hardware key' }).click();
  await expect(page).toHaveURL(/\/sign-in\/hardware-key\?reason=key_registered$/);
  await signInWithKey(page, key);
}
