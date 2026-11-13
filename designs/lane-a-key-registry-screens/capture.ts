// SCRATCH, never committed: W53's walk of Queues item 37's five screens. Shots go to TOUR_DIR (the scratchpad), never a branch.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { type Browser, type BrowserContext, type Locator, type Page, expect, test } from '@playwright/test';

import { personaEmail } from '../scripts/synthetic-personas';
import { addVirtualKey, registerKeyAndSignIn, signInWithTotp, withDatabase } from './helpers';

const TOUR_DIR = process.env.TOUR_DIR ?? '';
const SERVER_LOG = process.env.SERVER_LOG ?? '';
const REQUESTER = 'key-removal-requester';
const CONFIRMER = 'key-removal-confirmer';
const MEMBER = 'key-removal-member';

interface Shot { id: string; screen: string; state: string; width: number; theme: string; file: string; crop?: string }
const shots: Shot[] = [];
const seen: Record<string, unknown> = {};
const consoleLines: string[] = [];

async function person(browser: Browser, name: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') consoleLines.push(`${name}: ${message.type()}: ${message.text().slice(0, 300)}`); });
  page.on('pageerror', (error) => consoleLines.push(`${name}: pageerror: ${error.message.slice(0, 300)}`));
  return { context, page };
}

const row = (page: Page, key: string) => page.locator(`tr[data-member="${personaEmail(key)}"]`);

/** One state at 390 light, 1280 light and 1280 dark: the whole page, and a crop of `crop` when given. */
async function shoot(page: Page, id: string, screen: string, state: string, crop?: Locator): Promise<void> {
  for (const [width, height, theme] of [[390, 844, 'light'], [1280, 800, 'dark'], [1280, 800, 'light']] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate((t) => (t === 'dark' ? document.documentElement.setAttribute('data-theme', 'dark') : document.documentElement.removeAttribute('data-theme')), theme);
    await page.waitForTimeout(200);
    const file = `${id}--${String(width)}-${theme}.png`;
    await page.screenshot({ path: path.join(TOUR_DIR, file), fullPage: true });
    const shot: Shot = { id, screen, state, width, theme, file };
    if (crop !== undefined && (await crop.count()) > 0) {
      shot.crop = `crops/${file}`;
      await crop.first().screenshot({ path: path.join(TOUR_DIR, shot.crop) });
    }
    if (width === 390 && crop !== undefined && (await crop.locator('td').count()) > 0) {
      // What a phone shows of the row: as loaded (the row at the top), then with the Actions cell brought into view.
      await crop.first().evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'start' }));
      await page.screenshot({ path: path.join(TOUR_DIR, 'v390', `${id}--as-scrolled-down.png`) });
      await crop.first().locator('td').last().evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'end' }));
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(TOUR_DIR, 'v390', `${id}--actions-in-view.png`) });
    }
    const overflow = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    seen[`overflow ${id} ${String(width)}`] = overflow.doc > overflow.win ? `page scrolls sideways: ${String(overflow.doc)} > ${String(overflow.win)}` : 'none';
    shots.push(shot);
  }
}

/** What holds the focus, as a person would name it, and whether a focus indicator is drawn. */
function active(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (el === null || el === document.body) return 'BODY (no element)';
    const cs = getComputedStyle(el);
    const label = el.getAttribute('aria-label') ?? (el as HTMLInputElement).labels?.[0]?.textContent ?? el.innerText ?? '';
    const where = el.closest('tr[data-member]')?.getAttribute('data-member') ?? el.closest('[data-slot="card"]')?.querySelector('[data-slot="card-title"]')?.textContent ?? el.closest('nav,header,footer,main')?.tagName.toLowerCase() ?? '';
    const ring = cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px' ? `outline ${cs.outlineWidth} ${cs.outlineColor}` : cs.boxShadow !== 'none' ? 'ring (box-shadow)' : 'NO VISIBLE INDICATOR';
    return `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role') ?? ''}]` : ''}${el.getAttribute('type') ? `[type=${el.getAttribute('type') ?? ''}]` : ''} "${label.replace(/\s+/g, ' ').trim().slice(0, 70)}" in <${where}> | ${el.matches(':focus-visible') ? 'focus-visible' : 'focus (not :focus-visible)'} | ${ring}`;
  });
}

/** Tab from the top of a page just loaded, to the end: the order observed. */
async function walk(page: Page, name: string, max = 260): Promise<void> {
  const order: string[] = [];
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    const at = await active(page);
    if (at.startsWith('BODY')) break;
    order.push(at);
  }
  seen[`focus order: ${name}`] = order;
}

/** Tab (keyboard only) until `target` holds the focus; the number of presses. */
async function tabTo(page: Page, target: Locator, max = 400): Promise<number> {
  for (let i = 1; i <= max; i += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return i;
  }
  throw new Error('the control was not reached by Tab');
}

async function focusCrop(page: Page, name: string): Promise<void> {
  const box = await page.evaluate(() => { const r = document.activeElement?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null; });
  if (box === null) return;
  await page.screenshot({ path: path.join(TOUR_DIR, 'crops', `focus-${name}.png`), clip: { x: Math.max(0, box.x - 24), y: Math.max(0, box.y - 24), width: box.width + 48, height: box.height + 48 } });
}

async function sevenDays(): Promise<void> {
  await withDatabase(async (client) => {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    const m = await client.query<{ id: string }>(`UPDATE membership m SET created_at = now() - interval '8 days' FROM "user" u WHERE u.id = m.user_id AND u.email = ANY($1::text[]) AND m.role = 'platform_admin' RETURNING m.id`, [[personaEmail(REQUESTER), personaEmail(CONFIRMER)]]);
    await client.query(`UPDATE audit_event SET at = at - interval '8 days' WHERE object_type = 'membership' AND object_id = ANY($1::uuid[]) AND purpose = 'role_escalation'`, [m.rows.map((r) => r.id)]);
    await client.query('COMMIT');
  });
}

test('walks the key registry’s five screens', async ({ browser }) => {
  test.setTimeout(780_000);
  expect(TOUR_DIR).not.toBe('');
  mkdirSync(path.join(TOUR_DIR, 'crops'), { recursive: true });
  mkdirSync(path.join(TOUR_DIR, 'v390'), { recursive: true });
  const requester = await person(browser, 'requester');
  const confirmer = await person(browser, 'confirmer');
  const member = await person(browser, 'member');
  const returning = await person(browser, 'returning');
  const urls: string[] = [];
  for (const one of [requester, confirmer, returning]) one.page.on('request', (request) => urls.push(request.url()));
  try {
    await registerKeyAndSignIn(member.page, MEMBER);
    await registerKeyAndSignIn(requester.page, REQUESTER);
    await registerKeyAndSignIn(confirmer.page, CONFIRMER);
    await requester.page.getByRole('link', { name: 'SYNTHETIC COMPANY (INTERNAL)' }).click();
    await requester.page.waitForURL(/\/console\/organizations\/[0-9a-f-]{36}$/);
    const consoleUrl = requester.page.url();
    const R = requester.page;
    const C = confirmer.page;
    const requestButton = (page: Page, key: string) => row(page, key).getByRole('button', { name: 'Request key removal' });

    // ---- Console 1: Request key removal ----
    await R.reload();
    await walk(R, 'console, Request key removal (resting, 1280)');
    await shoot(R, 'c1-request--resting', 'console: Request key removal', 'resting', row(R, MEMBER));
    await R.setViewportSize({ width: 390, height: 844 });
    await R.reload();
    await walk(R, 'console, Request key removal (resting, 390)');
    await R.reload();
    for (let i = 0; i < 6; i += 1) await R.keyboard.press('Tab');
    seen['c1 at 390: the sixth stop'] = await active(R);
    await R.screenshot({ path: path.join(TOUR_DIR, 'v390', 'c1-request--scroll-region-focused.png') });
    await R.reload();
    seen['c1 at 390: Tab presses to the member’s Request key removal'] = await tabTo(R, requestButton(R, MEMBER));
    await R.waitForTimeout(300);
    seen['c1 at 390: the focused button is inside the viewport'] = await requestButton(R, MEMBER).evaluate((el) => { const r = el.getBoundingClientRect(); return `left ${String(Math.round(r.left))} right ${String(Math.round(r.right))} top ${String(Math.round(r.top))} bottom ${String(Math.round(r.bottom))} of ${String(window.innerWidth)}x${String(window.innerHeight)}`; });
    await R.screenshot({ path: path.join(TOUR_DIR, 'v390', 'c1-request--focused-by-keyboard.png') });
    await R.keyboard.press('Enter');
    await expect(row(R, MEMBER).locator('[data-slot="alert"], [data-slot="refusal-summary"]')).toBeVisible();
    await R.waitForTimeout(400);
    await R.screenshot({ path: path.join(TOUR_DIR, 'v390', 'c1-request--refusal-by-keyboard.png') });
    await R.setViewportSize({ width: 1280, height: 800 });
    await R.reload();
    seen['c1: Tab presses from the top to the member’s Request key removal'] = await tabTo(R, requestButton(R, MEMBER));
    seen['c1: the button focused'] = await active(R);
    await focusCrop(R, 'c1-request-button');
    await R.keyboard.press('Enter');
    await expect(row(R, MEMBER).locator('[data-slot="alert"], [data-slot="refusal-summary"]')).toBeVisible();
    await R.waitForTimeout(400);
    seen['c1: focus after the refusal (under seven days)'] = await active(R);
    await focusCrop(R, 'c1-after-refusal');
    await shoot(R, 'c1-request--refusal', 'console: Request key removal', 'refusal: under seven days in the role', row(R, MEMBER));
    await R.reload();
    seen['c1: after a refresh, refusal still shown'] = (await row(R, MEMBER).locator('[data-slot="alert"], [data-slot="refusal-summary"]').count()) > 0;
    await shoot(R, 'c1-request--after-refresh', 'console: Request key removal', 'after a refresh', row(R, MEMBER));

    await sevenDays();

    // ---- The reader's own row while a request stands for it ----
    await R.reload();
    await tabTo(R, requestButton(R, CONFIRMER));
    await R.keyboard.press('Enter');
    await expect(row(R, CONFIRMER).getByText('key removal requested')).toBeVisible();
    await R.waitForTimeout(400);
    seen['own row: focus after a request succeeds (requester’s page)'] = await active(R);
    await C.goto(consoleUrl);
    seen['own row: words'] = (await row(C, CONFIRMER).locator('td').last().innerText()).replace(/\s+/g, ' ');
    await shoot(C, 'c0-own-row--resting', 'console: the reader’s own row under a request', 'resting', row(C, CONFIRMER));
    await R.reload();
    await tabTo(R, row(R, CONFIRMER).getByRole('button', { name: 'Cancel request' }));
    await R.keyboard.press('Enter');
    await expect(requestButton(R, CONFIRMER)).toBeVisible();
    await R.waitForTimeout(400);
    seen['c2: focus after Cancel request succeeds'] = await active(R);

    // ---- Console 2 and 3: requested, as the requester and as another administrator (first round, cancelled) ----
    await R.reload();
    await tabTo(R, requestButton(R, MEMBER));
    await R.keyboard.press('Enter');
    await expect(row(R, MEMBER).getByText('key removal requested')).toBeVisible();
    await R.reload();
    await walk(R, 'console, requested, as the requester (resting, 1280)');
    await shoot(R, 'c2-requested-requester--resting', 'console: requested, as the requester', 'resting', row(R, MEMBER));
    await R.reload();
    await shoot(R, 'c2-requested-requester--after-refresh', 'console: requested, as the requester', 'after a refresh', row(R, MEMBER));
    await C.goto(consoleUrl);
    await walk(C, 'console, requested, as another administrator (resting, 1280)');
    await shoot(C, 'c3-requested-other--resting', 'console: requested, as another administrator', 'resting', row(C, MEMBER));
    await C.reload();
    await shoot(C, 'c3-requested-other--after-refresh', 'console: requested, as another administrator', 'after a refresh', row(C, MEMBER));
    // The requester cancels; the other administrator's page is now out of date, and Confirm is refused.
    await R.reload();
    await tabTo(R, row(R, MEMBER).getByRole('button', { name: 'Cancel request' }));
    await R.keyboard.press('Enter');
    await expect(requestButton(R, MEMBER)).toBeVisible();
    // A page read before the cancel: a second tab opened earlier would hold it; here the request is made again and cancelled under a loaded page.
    await R.reload();
    await tabTo(R, requestButton(R, MEMBER));
    await R.keyboard.press('Enter');
    await expect(row(R, MEMBER).getByText('key removal requested')).toBeVisible();
    await C.goto(consoleUrl);
    await expect(row(C, MEMBER).getByRole('button', { name: 'Confirm key removal' })).toBeVisible();
    await R.reload();
    await tabTo(R, row(R, MEMBER).getByRole('button', { name: 'Cancel request' }));
    await R.keyboard.press('Enter');
    await expect(requestButton(R, MEMBER)).toBeVisible();
    seen['c3: Tab presses to Confirm key removal'] = await tabTo(C, row(C, MEMBER).getByRole('button', { name: 'Confirm key removal' }));
    await focusCrop(C, 'c3-confirm-button');
    await C.keyboard.press('Enter');
    await expect(row(C, MEMBER).locator('[data-slot="alert"], [data-slot="refusal-summary"]')).toBeVisible();
    await C.waitForTimeout(400);
    seen['c3: focus after the refusal (cancelled meanwhile)'] = await active(C);
    seen['c3: refusal words'] = (await row(C, MEMBER).locator('[data-slot="alert"], [data-slot="refusal-summary"]').first().innerText()).replace(/\s+/g, ' ');
    await shoot(C, 'c3-requested-other--refusal', 'console: requested, as another administrator', 'refusal: Confirm after the requester cancelled', row(C, MEMBER));
    await C.reload();
    seen['c3: after a refresh following the refusal, the row offers'] = (await row(C, MEMBER).locator('td').last().innerText()).replace(/\s+/g, ' ');

    // ---- Second round: requested, confirmed; the requester's out-of-date Cancel is refused ----
    await R.reload();
    await tabTo(R, requestButton(R, MEMBER));
    await R.keyboard.press('Enter');
    await expect(row(R, MEMBER).getByText('key removal requested')).toBeVisible();
    await C.reload();
    await tabTo(C, row(C, MEMBER).getByRole('button', { name: 'Confirm key removal' }));
    await C.keyboard.press('Enter');
    await expect(row(C, MEMBER).getByText('keys removed', { exact: true })).toBeVisible();
    await C.waitForTimeout(400);
    seen['c3: focus after Confirm key removal succeeds'] = await active(C);
    await tabTo(R, row(R, MEMBER).getByRole('button', { name: 'Cancel request' }));
    await R.keyboard.press('Enter');
    await expect(row(R, MEMBER).locator('[data-slot="alert"], [data-slot="refusal-summary"]')).toBeVisible();
    await R.waitForTimeout(400);
    seen['c2: focus after the refusal (confirmed meanwhile)'] = await active(R);
    seen['c2: refusal words'] = (await row(R, MEMBER).locator('[data-slot="alert"], [data-slot="refusal-summary"]').first().innerText()).replace(/\s+/g, ' ');
    await shoot(R, 'c2-requested-requester--refusal', 'console: requested, as the requester', 'refusal: Cancel after another confirmed', row(R, MEMBER));

    // ---- Console 4: keys removed, Open registration ----
    await C.reload();
    await walk(C, 'console, keys removed with Open registration (resting, 1280)');
    await shoot(C, 'c4-keys-removed--resting', 'console: keys removed, Open registration', 'resting', row(C, MEMBER));
    await C.reload();
    await shoot(C, 'c4-keys-removed--after-refresh', 'console: keys removed, Open registration', 'after a refresh', row(C, MEMBER));
    const stale = await confirmer.context.newPage();
    await stale.goto(consoleUrl);

    // ---- Sign-in: the registration code screen, before any opening ----
    const M = returning.page;
    await addVirtualKey(M);
    await signInWithTotp(M, MEMBER, true);
    await M.waitForURL(/\/sign-in\/register-key$/);
    await M.reload();
    await walk(M, 'sign-in, registration code (resting, 1280)', 40);
    seen['s1: page title'] = await M.title();
    await shoot(M, 's1-code--resting', 'sign-in: registration code', 'resting', M.locator('main'));
    await M.setViewportSize({ width: 390, height: 844 });
    await M.reload();
    await walk(M, 'sign-in, registration code (resting, 390)', 40);
    await M.setViewportSize({ width: 1280, height: 800 });
    await M.reload();
    const codeField = M.getByLabel('Code from PaidWhole');
    await tabTo(M, codeField, 40);
    await focusCrop(M, 's1-code-field');
    seen['s1: the field focused'] = await active(M);
    await M.keyboard.press('Enter');
    await M.waitForTimeout(600);
    seen['s1: empty field, Enter: focus'] = await active(M);
    seen['s1: empty field, Enter: native validity message'] = await codeField.evaluate((el) => (el as HTMLInputElement).validationMessage);
    seen['s1: empty field, Enter: main’s text'] = (await M.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 600);
    await shoot(M, 's1-code--empty', 'sign-in: registration code', 'refusal: empty', M.locator('main'));
    await M.waitForTimeout(6000);
    await M.keyboard.type('abc');
    await M.keyboard.press('Enter');
    await expect(M.getByText('enter the eight letters and digits of the code PaidWhole gave you').first()).toBeVisible();
    await M.waitForTimeout(400);
    seen['s1: wrong shape: focus'] = await active(M);
    seen['s1: wrong shape: field keeps'] = await codeField.inputValue();
    await shoot(M, 's1-code--wrong-shape', 'sign-in: registration code', 'refusal: not the shape of a code', M.locator('main'));
    await codeField.press('ControlOrMeta+a');
    await M.keyboard.type('ABCD EFGH');
    await M.keyboard.press('Enter');
    await expect(M.getByText('That code did not open registration')).toBeVisible();
    await M.waitForTimeout(400);
    seen['s1: wrong code: focus'] = await active(M);
    seen['s1: wrong code: field keeps'] = await codeField.inputValue();
    seen['s1: wrong code: main’s text'] = (await M.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 700);
    await focusCrop(M, 's1-after-refusal');
    await shoot(M, 's1-code--refusal', 'sign-in: registration code', 'refusal: a wrong code', M.locator('main'));
    await M.reload();
    seen['s1: after a refresh: refusal shown'] = (await M.getByText('That code did not open registration').count()) > 0;
    seen['s1: after a refresh: field holds'] = await codeField.inputValue();
    seen['s1: after a refresh: focus'] = await active(M);
    await shoot(M, 's1-code--after-refresh', 'sign-in: registration code', 'after a refresh', M.locator('main'));

    // ---- Console 5: the code panel, once ----
    await C.reload();
    seen['c4: Tab presses to Open registration'] = await tabTo(C, row(C, MEMBER).getByRole('button', { name: 'Open registration' }));
    await focusCrop(C, 'c4-open-button');
    await C.keyboard.press('Enter');
    const panel = C.getByRole('group', { name: `Registration code for ${personaEmail(MEMBER)}` });
    await expect(panel).toBeVisible();
    await C.waitForTimeout(400);
    seen['c5: focus after Open registration'] = await active(C);
    await focusCrop(C, 'c5-panel-focused');
    const shown = (await panel.locator('span.font-mono').innerText()).trim();
    const code = shown.replace(' ', '');
    seen['c5: code shape'] = shown.replace(/[0-9A-Z]/g, 'X');
    seen['c5: URL holds the code'] = C.url().includes(code);
    seen['c5: URL'] = C.url().replace(/[0-9a-f-]{36}/, '<organization>');
    seen['c5: title'] = await C.title();
    seen['c5: cookies hold the code'] = JSON.stringify(await confirmer.context.cookies()).includes(code);
    seen['c5: storage holds the code'] = (await C.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]))).includes(code);
    seen['c5: panel words'] = (await panel.innerText()).replace(shown, 'XXXX XXXX').replace(/\s+/g, ' ');
    await C.keyboard.press('Tab');
    seen['c5: next Tab after the panel'] = await active(C);
    await C.keyboard.press('Shift+Tab');
    seen['c5: Shift+Tab back'] = await active(C);
    await shoot(C, 'c5-code-panel--once', 'console: the registration code, shown once', 'resting (the code shown)', row(C, MEMBER));
    seen['c5: the panel survives the three viewport changes'] = (await panel.count()) > 0;
    // Refusal: Open registration again from a page read before the opening.
    await tabTo(stale, row(stale, MEMBER).getByRole('button', { name: 'Open registration' }));
    await stale.keyboard.press('Enter');
    await expect(row(stale, MEMBER).locator('[data-slot="alert"], [data-slot="refusal-summary"]')).toBeVisible();
    await stale.waitForTimeout(400);
    seen['c4: focus after the refusal (already open)'] = await active(stale);
    seen['c4: refusal words'] = (await row(stale, MEMBER).locator('[data-slot="alert"], [data-slot="refusal-summary"]').first().innerText()).replace(/\s+/g, ' ');
    await shoot(stale, 'c4-keys-removed--refusal', 'console: keys removed, Open registration', 'refusal: registration already open', row(stale, MEMBER));
    await stale.close();
    await C.reload();
    seen['c5: after a refresh: the code in the page'] = (await C.content()).includes(code);
    seen['c5: after a refresh: row words'] = (await row(C, MEMBER).innerText()).replace(/\s+/g, ' ');
    await walk(C, 'console, registration open, after a reload (1280)');
    await shoot(C, 'c5-code-panel--after-refresh', 'console: the registration code, shown once', 'after a refresh (open until; no code)', row(C, MEMBER));
    await R.reload();
    seen['c5: the other administrator: the code in the page'] = (await R.content()).includes(code);
    await shoot(R, 'c5-open--other-administrator', 'console: the registration code, shown once', 'as another administrator', row(R, MEMBER));

    // ---- Sign-in: a wrong code against the opening, then the right one ----
    await tabTo(M, codeField, 40);
    await M.keyboard.type('ABCD EFGH');
    await M.keyboard.press('Enter');
    await expect(M.getByText('That code did not open registration')).toBeVisible();
    await M.reload();
    await tabTo(M, codeField, 40);
    await M.keyboard.type(`${code.slice(0, 4).toLowerCase()} ${code.slice(4).toLowerCase()}`);
    await M.keyboard.press('Enter');
    await expect(M.getByRole('button', { name: 'Register hardware key' })).toBeVisible();
    await M.waitForTimeout(400);
    seen['s2: after the right code: focus'] = await active(M);
    seen['s2: after the right code: URL'] = M.url();
    seen['s2: after the right code: the code in the page'] = (await M.content()).toUpperCase().includes(code);
    seen['s2: after the right code: cookies hold the code'] = JSON.stringify(await returning.context.cookies()).toUpperCase().includes(code);
    await shoot(M, 's2-code-accepted--key-step', 'sign-in: registration code', 'after the right code (the key step)', M.locator('main'));
    await M.reload();
    seen['s2: after a refresh: asks for the code again'] = (await codeField.count()) > 0;
    await walk(M, 'sign-in, key step after the right code (1280)', 40);
    await M.reload();
    await tabTo(M, M.getByRole('button', { name: 'Register hardware key' }), 40);
    await M.keyboard.press('Enter');
    await M.waitForURL(/reason=key_registered$/);
    seen['s2: registered: lands on'] = M.url();
    await C.reload();
    seen['console after the member registered: row words'] = (await row(C, MEMBER).innerText()).replace(/\s+/g, ' ');

    seen['the code in any request URL'] = urls.some((url) => url.toUpperCase().includes(code));
    if (SERVER_LOG !== '') {
      const log = readFileSync(SERVER_LOG, 'utf8');
      seen['the code in the server’s log'] = log.toUpperCase().includes(code) || log.toUpperCase().includes(shown);
      seen['server log lines'] = log.split('\n').length;
    }
  } finally {
    seen['browser console errors and warnings'] = consoleLines;
    writeFileSync(path.join(TOUR_DIR, 'shots.json'), JSON.stringify(shots, null, 1));
    writeFileSync(path.join(TOUR_DIR, 'observed.json'), JSON.stringify(seen, null, 1));
    await Promise.all([requester, confirmer, member, returning].map((one) => one.context.close()));
  }
});
