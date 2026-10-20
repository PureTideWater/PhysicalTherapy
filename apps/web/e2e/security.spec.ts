import { expect, test } from '@playwright/test';

import { DISCLOSURE_PATH, SECURITY_TXT_PATH, parseSecurityTxt } from '../src/lib/security/disclosure';
import { expectAccessible } from './a11y';

/**
 * The security contact in the production build (audit item #20 (f)): /.well-known/security.txt is served as plain
 * text and parses under RFC 9116, from the server's configuration (the e2e run's synthetic security address and its
 * own origin), and the disclosure page it names as its policy loads without a session, holds no form and gives the
 * same address. Synthetic configuration only.
 */
test('serves security.txt under RFC 9116, and the disclosure page it names, without a session', async ({ page, request, baseURL }) => {
  const origin = new URL(baseURL ?? '').origin;
  const response = await request.get(SECURITY_TXT_PATH);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('text/plain; charset=utf-8');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['content-disposition']).toBeUndefined();
  const parsed = parseSecurityTxt(await response.text(), { now: new Date(), fetchedFrom: `${origin}${SECURITY_TXT_PATH}` });
  expect(parsed.problems).toEqual([]);
  expect(parsed.fields.get('Contact')).toEqual(['mailto:security@synthetic.test']);
  expect(parsed.fields.get('Policy')).toEqual([`${origin}${DISCLOSURE_PATH}`]);
  expect(parsed.fields.get('Preferred-Languages')).toEqual(['en']);
  expect(parsed.fields.get('Canonical')).toEqual([`${origin}${SECURITY_TXT_PATH}`]);

  const policy = parsed.fields.get('Policy')?.[0] ?? '';
  const loaded = await page.goto(policy);
  expect(loaded?.status()).toBe(200);
  await expect(page).toHaveURL(policy);
  await expect(page.getByRole('heading', { level: 1, name: 'Report a security vulnerability' })).toBeVisible();
  for (const heading of ['How to report', 'What to include', 'What not to do', 'What you can expect from us', 'Research in good faith']) {
    await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'security@synthetic.test' }).first()).toHaveAttribute('href', 'mailto:security@synthetic.test');
  await expect(page.getByRole('link', { name: 'security.txt' })).toHaveAttribute('href', SECURITY_TXT_PATH);
  // Nothing on the page collects anything: no form and no field.
  await expect(page.locator('form, input, textarea, select')).toHaveCount(0);
  await expect(page.locator('[data-legal-surface="good-faith-research"]')).toContainText('we consider your research authorized');
  await expectAccessible(page, 'Disclosure page');
});
