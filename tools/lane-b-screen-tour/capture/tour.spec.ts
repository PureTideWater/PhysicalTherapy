import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { type Browser, type BrowserContext, type Locator, type Page, type Route, expect, test } from '@playwright/test';

import { shownVersionId } from '/home/user/screens/apps/web/e2e/export-attempts';
import { addVirtualKey, enterPassword, registerKeyAndSignIn, signInWithKey, signInWithTotp, withDatabase } from '/home/user/screens/apps/web/e2e/helpers';
import { outboxFor } from '/home/user/screens/apps/web/e2e/outbox';
import { startLocalWorker } from '/home/user/screens/apps/web/e2e/worker';
import {
  CLEAN_ROWS,
  OUTSIDE_ROWS,
  SCREENING_ZIP,
  SCREENING_ZIP_PLUS_FOUR,
  SMALL_ROWS,
  dateOfServiceCsv,
  memberIdCsv,
  resultLinkIn,
  screeningCsv,
  startLocalScreeningConsumer,
} from '/home/user/screens/apps/web/e2e/screening';
import { personaEmail, personaPassword } from '/home/user/screens/apps/web/scripts/synthetic-personas';

/**
 * The whole-app screen tour (the Lane B UX/UI and brand baseline review; route map designs/lane-b-ux-review/route-map.json).
 * Every page the map marks reachable, as the map's first persona: 1280x800 light, 1280x800 dark (tokens only: data-theme
 * set on <html> after the light shot, as apps/web/e2e/brand.spec.ts does) and 390x844 light, full page at device scale
 * factor 1. Then each empty, loading, error and not-found state and each interaction the map names, at 1280 and 390
 * light. Synthetic data only: the seed and the repository's own journeys (the populate project) make every record; this
 * spec writes only what a person does on screen, and only the steps the map names (requests and tickets sent from the
 * public forms, the reviewer's support grants, the packet's approval request, the screening send and its conversion), with
 * the reversible operator steps (suspend, maintenance) last and undone at once.
 *
 * Each shot has a stable id, `<route key>.<variant>.<width>` (`.1280-dark` for the dark one). TOUR_ONLY (comma-separated
 * ids; a trailing * matches a prefix) restricts a run to those ids, for retakes; such a run merges its shots into the
 * existing shots.json. Every shot is independent: one that fails is recorded in `skipped` with its reason and the tour
 * goes on. A retake on the same database reuses the signed-in sessions kept in $TOUR_DIR/auth (an internal persona's
 * hardware key registers once per database); run.sh clears them whenever it populates a fresh database.
 */

const OUT = process.env.TOUR_DIR ?? '';
if (OUT === '') throw new Error('Set TOUR_DIR to the tour working directory (README, Set-up).');
const PNG = `${OUT}/png`;
const AUTH = `${OUT}/auth`;
const PROGRESS = `${OUT}/progress.log`;
const SHOTS_JSON = `${OUT}/shots.json`;
const ROUTE_MAP = process.env.TOUR_ROUTE_MAP ?? '/home/user/ops/designs/lane-b-ux-review/route-map.json';
const SCREENS = '/home/user/screens';
/**
 * Whether the ref under capture takes the payer's letter inside "Log a payer response" (PR #85, co-001/ux-payer-response;
 * designs/lane-b-ux-payer-response.md 6.2). One spec runs on a PR's base and its head: the steps whose page differs read
 * this (the new letter-scanning state, and the abstraction default's note), or what the page shows.
 */
const LETTER_IN_RESPONSE = existsSync(`${SCREENS}/apps/web/src/components/packets/response-letter.tsx`);
mkdirSync(PNG, { recursive: true });
mkdirSync(AUTH, { recursive: true });

const DESKTOP_CONTEXT = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const PHONE_CONTEXT = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const WIDTHS = [1280, 390] as const;
type Width = (typeof WIDTHS)[number];
const DARK = 'dark (tokens only)';
/** Internal personas sign in with a hardware key, which registers once per database in the context that registered it. */
const INTERNAL = new Set(['platform-admin', 'contract-specialist', 'reviewer', 'support', 'support-expiry']);
const NO_UUID = '00000000-0000-4000-8000-000000000000';

interface ShotEntry {
  readonly file: string;
  readonly id: string;
  readonly path: string;
  readonly routePattern: string;
  readonly role: string;
  readonly width: number;
  readonly theme: 'light' | typeof DARK;
  readonly state: string;
  readonly note: string;
}
interface Skip {
  readonly shot: string;
  readonly route: string;
  readonly reason: string;
}

const ONLY = (process.env.TOUR_ONLY ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter((item) => item !== '');
/** Whether this run takes the shot (TOUR_ONLY unset: every shot). */
function wanted(id: string): boolean {
  return ONLY.length === 0 || ONLY.some((item) => (item.endsWith('*') ? id.startsWith(item.slice(0, -1)) : id === item));
}
/** Whether this run takes any shot whose id starts with the prefix (for a step that shots of several routes need). */
function wantedPrefix(prefix: string): boolean {
  return ONLY.length === 0 || ONLY.some((item) => item.startsWith(prefix) || (item.endsWith('*') && prefix.startsWith(item.slice(0, -1))));
}
/**
 * Whether TOUR_ONLY names this dark id exactly. A full run takes the dark tokens of each route's default only; a pull
 * request's sample asks for every changed state at 1280 dark too (the UX and brand reviewer: "1280 and 390 px light and
 * 1280 px dark (tokens only)" of each changed screen and state), so a dark id named in full is taken for any state.
 */
function darkAsked(darkId: string): boolean {
  return ONLY.includes(darkId);
}
/**
 * A step's shot ids with the 1280 dark id of each that TOUR_ONLY names in full, for `attempt`: a step that fails then
 * records its dark shots with its own reason, not as "no step of this run took it" (UX PR 6's before run, 2026-11-01).
 */
function andDark(shotIds: readonly string[]): string[] {
  return shotIds.flatMap((id) => (id.endsWith('.1280') && darkAsked(`${id}-dark`) ? [id, `${id}-dark`] : [id]));
}

const shots: ShotEntry[] = [];
const skipped: Skip[] = [];
const taken = new Set<string>();
const emails: Record<string, string> = { monitoring: personaEmail('monitoring-manager') };

/**
 * Before the first test of a worker: a retake (TOUR_ONLY), or any run on the database the last run used (the same
 * journey practice IDs as ids.json), keeps the earlier shots and skips and replaces only those it takes. So a run cut
 * off part way, or a worker restarted after a failed test, resumes without losing what was shot.
 */
async function resume(): Promise<void> {
  if (shots.length > 0 || !existsSync(SHOTS_JSON)) return;
  const layoutNow = await one('SELECT id FROM practice WHERE name = $1', ['SYNTHETIC OTHER PRACTICE LAYOUT']);
  const previousIds = existsSync(`${OUT}/ids.json`) ? (JSON.parse(readFileSync(`${OUT}/ids.json`, 'utf8')) as Record<string, string>) : {};
  const sameDatabase = layoutNow !== '' && previousIds.layout === layoutNow;
  if (sameDatabase && Object.keys(ids).length === 0) Object.assign(ids, previousIds);
  if (ONLY.length === 0 && !sameDatabase) return;
  const previous = JSON.parse(readFileSync(SHOTS_JSON, 'utf8')) as { shots?: unknown[]; skipped?: unknown[]; emails?: Record<string, string> };
  shots.push(...((previous.shots ?? []).filter((item) => typeof item === 'object' && item !== null && 'id' in item) as ShotEntry[]));
  skipped.push(...((previous.skipped ?? []).filter((item) => typeof item === 'object' && item !== null && 'shot' in item) as Skip[]));
  Object.assign(emails, previous.emails ?? {});
  log(`RESUME ${String(shots.length)} earlier shots and ${String(skipped.length)} skips kept (${sameDatabase ? 'the same database' : 'a retake'})`);
}

function log(line: string): void {
  appendFileSync(PROGRESS, `${new Date().toISOString().slice(11, 19)} ${line}\n`);
  console.log(line);
}

function record(entry: ShotEntry): void {
  const at = shots.findIndex((item) => item.id === entry.id);
  if (at >= 0) shots.splice(at, 1);
  shots.push(entry);
  const skip = skipped.findIndex((item) => item.shot === entry.id);
  if (skip >= 0) skipped.splice(skip, 1);
  taken.add(entry.id);
  log(`SHOT ${entry.id} ${entry.path}`);
}

/** Records a shot this run could not take, with its reason (a retake that fails keeps the earlier shot). */
function skip(shot: string, route: string, reason: string): void {
  if (!wanted(shot) || taken.has(shot)) return;
  if (shots.some((item) => item.id === shot)) {
    log(`RETAKE FAILED ${shot} (the earlier shot is kept): ${reason}`);
    return;
  }
  const at = skipped.findIndex((item) => item.shot === shot);
  if (at >= 0) skipped.splice(at, 1);
  skipped.push({ shot, route, reason });
  log(`SKIP ${shot}: ${reason}`);
}

/** A state the map names that cannot be shown on synthetic data in this run: recorded for both widths, with the reason. */
function notReached(key: string, variant: string, route: string, reason: string): void {
  for (const width of WIDTHS) skip(`${key}.${variant}.${String(width)}`, route, reason);
}

/** notReached, and the 1280 dark id too (a pull request's sample names every changed state at 1280 dark). */
function notReachedAll(key: string, variant: string, route: string, reason: string): void {
  notReached(key, variant, route, reason);
  skip(`${key}.${variant}.1280-dark`, route, reason);
}

/**
 * Lets a form send its empty choices to the route (PR #85's sample): noValidate on every form inside the locator, and on
 * the form around it, so the browser's own bubble does not stop the press and the route's refusal shows. Returns the
 * names of the required selects still on their empty choice: a step presses only when one is, since then the route
 * refuses before any write. A ref whose selects start on a choice (before PR #85) would write, so the step shoots the
 * form as it starts and presses nothing.
 */
async function sendEmptyChoices(scope: ReturnType<Page['locator']>): Promise<string[]> {
  return scope.evaluate((root) => {
    const forms = new Set<HTMLFormElement>(root.querySelectorAll('form'));
    const around = root.closest('form');
    if (around !== null) forms.add(around);
    for (const form of forms) form.noValidate = true;
    return [...root.querySelectorAll('select[required]')].filter((select) => (select as HTMLSelectElement).value === '').map((select) => select.getAttribute('name') ?? '?');
  });
}

function reasonOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-control-regex
  return (text.replace(/\u001b\[[0-9;]*m/g, '').split('\n').find((line) => line.trim() !== '') ?? 'failed').trim().slice(0, 300);
}

function flush(): void {
  writeFileSync(SHOTS_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), only: ONLY, shots, skipped, emails }, null, 2));
}

// ---------------------------------------------------------------------------------------------------------------------
// The records the shots open (found as the journeys find them, through the e2e database's superuser).

const ids: Record<string, string> = {};
const SOURCES: Record<string, string> = {
  layout: 'layout-1280.spec.ts',
  packets: 'packets.spec.ts',
  deadlines: "packets.spec.ts's 'unverified deadline' test",
  ledger: 'reconciliation.spec.ts',
  monitoring: 'monitoring.spec.ts',
  reports: 'reports.spec.ts',
  deadlinesBlockedCase: "packets.spec.ts's 'unverified deadline' test (an approved packet whose export is blocked)",
  deadlinesExportedCase: "packets.spec.ts's 'unverified deadline' test (an exported packet awaiting attestation)",
  report: 'reports.spec.ts (the released audit report)',
  reference: "the PACKETS packet page's [data-reference]",
};
function need(key: string): string {
  const value = ids[key] ?? '';
  if (value === '') throw new Error(`no record "${key}" in the database (${SOURCES[key] ?? 'its populate journey did not leave it'})`);
  return value;
}

async function one(sql: string, params: readonly unknown[] = []): Promise<string> {
  if (params.includes('')) return '';
  return withDatabase(async (client) => (await client.query<{ id: string }>(sql, [...params])).rows[0]?.id ?? '');
}

/** The other group's practices by the lines a proof-level change would move (proofLevelPage's own count), most first. */
async function proofLevelPick(): Promise<{ id: string; name: string; moving: number } | undefined> {
  const rows = await withDatabase(
    async (client) =>
      (
        await client.query<{ id: string; name: string; moving: number }>(
          `WITH practices AS (
             SELECT p.id, p.name, coalesce(p.settings ->> 'proof_level', 'posted') AS level FROM practice p
              WHERE p.organization_id = (SELECT organization_id FROM practice WHERE id = $1)
           ), latest AS (
             SELECT pr.id AS practice_id, pr.level,
                    (SELECT s.stage FROM line_status s WHERE s.service_line_id = cl.service_line_id ORDER BY s.seq DESC LIMIT 1) AS stage,
                    coalesce((SELECT sum(e.amount_cents) FROM ledger_entry e WHERE e.service_line_id = cl.service_line_id AND e.stage = 'approved'), 0) AS approved,
                    coalesce((SELECT sum(e.amount_cents) FROM ledger_entry e
                               WHERE e.service_line_id = cl.service_line_id AND e.stage = (CASE WHEN pr.level = 'posted' THEN 'deposited' ELSE 'posted' END)
                                 AND NOT EXISTS (SELECT 1 FROM ledger_entry r WHERE r.stage = 'reversed' AND r.evidence_id = e.id)), 0) AS proved
               FROM practices pr JOIN case_line cl ON cl.practice_id = pr.id
           )
           SELECT pr.id, pr.name,
                  (SELECT count(*) FROM latest l WHERE l.practice_id = pr.id
                      AND ((l.level = 'posted' AND l.stage = 'recovered' AND l.proved < l.approved)
                        OR (l.level = 'deposited' AND l.stage = 'payer_approved' AND l.approved > 0 AND l.proved >= l.approved)))::int AS moving
             FROM practices pr
            ORDER BY moving DESC, (pr.name = 'SYNTHETIC OTHER PRACTICE LEDGER') DESC, pr.name`,
          [need('other')],
        )
      ).rows,
  );
  log(`RECORDS proof-level counts: ${rows.map((row) => `${row.name} ${String(row.moving)}`).join('; ')}`);
  return rows[0] !== undefined && rows[0].moving > 0 ? rows[0] : undefined;
}

/**
 * A support grant of the other group with no read under it (the support-access page's own count), open ones first, then
 * the newest. Every journey grant (SYN-JOURNEY-1 and -2) holds reads once populate has run (17 to 33 on 2026-10-26: the
 * journeys work under them), so the one with none is the reviewer's newest tour grant, SYN-TOUR-4 on LAYOUT, which the
 * console test opens on screen and nothing reads under before the writes test.
 */
async function unreadGrant(): Promise<{ practiceId: string; grantId: string; name: string; ticket: string } | undefined> {
  const rows = await withDatabase(
    async (client) =>
      (
        await client.query<{ practice_id: string; grant_id: string; name: string; ticket: string; reads: number; open: boolean }>(
          `SELECT g.practice_id, g.id AS grant_id, p.name, g.ticket, (now() < g.expires_at) AS open,
                  (SELECT count(*) FROM audit_event e WHERE e.grant_id = g.id AND e.practice_id = g.practice_id AND e.action = 'read')::int AS reads
             FROM support_grant g JOIN practice p ON p.id = g.practice_id
            WHERE p.organization_id = (SELECT organization_id FROM practice WHERE id = $1)
            ORDER BY reads, (now() < g.expires_at) DESC, g.created_at DESC, g.id`,
          [need('other')],
        )
      ).rows,
  );
  log(`RECORDS grant reads: ${rows.map((row) => `${row.ticket} on ${row.name} ${String(row.reads)}${row.open ? '' : ' (ended)'}`).join('; ')}`);
  const pick = rows[0];
  return pick !== undefined && pick.reads === 0 ? { practiceId: pick.practice_id, grantId: pick.grant_id, name: pick.name, ticket: pick.ticket } : undefined;
}

/** Synthetic checklist words by unpriced reason (no figure, no payer name: the gateway's verifier keeps such an item). */
const CHECKLIST_WORDS: Record<string, { readonly document: string; readonly why: string }> = {
  NO_AGREEMENT: { document: 'The signed agreement with this payer, with its fee schedule', why: 'Lines from this payer have no agreement on file, so they cannot be priced yet.' },
  NO_MAPPING: { document: 'The plan names this payer uses on its remittances', why: 'A plan on these lines is not mapped to an agreement yet.' },
  NO_RATE_FOR_CODE: { document: 'The fee schedule page that lists these procedure codes', why: 'The agreement on file names no rate for these codes.' },
  NO_PFS_VALUE: { document: 'The Medicare fee schedule year the agreement refers to', why: 'The schedule on file has no value for these codes.' },
  DATE_OUTSIDE_VERSIONS: { document: 'The agreement version in force on these dates of service', why: 'No version on file covers these dates.' },
  AMBIGUOUS_RATE: { document: 'The page of the agreement that settles which rate applies', why: 'More than a single rate on file could apply to these lines.' },
};

/**
 * The model's evidence checklist for a practice (route map, /p/[practiceId]/coverage, "Suggest what to obtain with the
 * model"). The server runs the gateway on the local deterministic provider, which answers only a request whose output was
 * written for its exact key, as the repository's model journeys do (e2e/models.ts, expectModelOutput). So the gaps the
 * server will send are computed with the product's own coverageGaps, in a practice scope as pricing-manager (one audited
 * read of the run in effect, as the coverage page itself makes), and a synthetic checklist of one item per gap is written
 * for them. The person then presses the button on screen. Imported when the step runs, so a ref without these modules
 * fails only this step. Returns the number of items written.
 */
async function expectChecklist(practiceId: string): Promise<number> {
  const models = (await import(`${SCREENS}/apps/web/e2e/models.ts`)) as { expectModelOutput: (purpose: 'suggestEvidenceRequests', input: unknown, output: unknown) => void };
  const evidence = (await import(`${SCREENS}/apps/web/src/lib/models/evidence-checklist.ts`)) as {
    coverageGaps: (scope: unknown, practiceId: string, requestId: string) => Promise<{ reason: string; count: number; payer: string | null; codes: string[] }[]>;
  };
  const environment = (await import(`${SCREENS}/apps/web/e2e/env.ts`)) as { e2eDatabaseUrl: () => string };
  const db = (await import('@tp/db')) as {
    appDevLoginUrl: (url: string) => string;
    openPool: (url: string, max?: number) => { end: () => Promise<void> };
    withPracticeScope: <T>(pool: unknown, scope: { actorId: string; practiceIds: string[] }, run: (scope: unknown) => Promise<T>) => Promise<T>;
  };
  const actorId = await one('SELECT id FROM "user" WHERE email = $1', [personaEmail('pricing-manager')]);
  if (actorId === '') throw new Error('no pricing-manager user on this database');
  const pool = db.openPool(db.appDevLoginUrl(environment.e2eDatabaseUrl()), 2);
  try {
    const gaps = await db.withPracticeScope(pool, { actorId, practiceIds: [practiceId] }, (scope) => evidence.coverageGaps(scope, practiceId, `tour-${randomBytes(8).toString('hex')}`));
    log(`RECORDS checklist gaps: ${gaps.map((gap) => `${gap.reason} ${String(gap.count)}`).join('; ') || 'none'}`);
    if (gaps.length === 0) throw new Error('the practice has no coverage gap, so the model is not asked (no_gaps)');
    const fallback = { document: 'The document the contract specialist names for these lines', why: 'Lines with this reason cannot be priced until it is on file.' };
    const items = gaps.map((gap) => ({ reason: gap.reason, ...(CHECKLIST_WORDS[gap.reason] ?? fallback) }));
    models.expectModelOutput('suggestEvidenceRequests', { gaps }, { items });
    return items.length;
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Pages, sessions and shots.

/** Lets the page finish: its requests settle, no loading state remains, the fonts are in. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await page
    .locator('[data-slot="loading-state"]')
    .first()
    .waitFor({ state: 'detached', timeout: 20_000 })
    .catch(() => undefined);
  await fontsReady(page);
  await page.waitForTimeout(400);
}

/** For a state held open on purpose (a loading state, a pending submit): the fonts, a moment, no network wait. */
async function settleHeld(page: Page): Promise<void> {
  await fontsReady(page);
  await page.waitForTimeout(400);
}

/** Where the page stands: the layout scroll, the visual viewport's place in the document, and the sticky header's. */
interface ViewState {
  readonly scrollX: number;
  readonly scrollY: number;
  readonly pageLeft: number;
  readonly pageTop: number;
  /** How far the app header's sticky position has moved it down the page: 0 at the top (and on a page without it). */
  readonly header: number;
  /** The focused element's tag ('' for none or the body). */
  readonly focused: string;
}
async function viewState(page: Page): Promise<ViewState> {
  return page.evaluate(() => {
    const header = document.querySelector('[data-slot="app-header"]');
    const active = document.activeElement;
    return {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      pageLeft: window.visualViewport?.pageLeft ?? window.scrollX,
      pageTop: window.visualViewport?.pageTop ?? window.scrollY,
      // The header is the shell's first child: its sticky shift is its distance below the shell's top.
      header: header === null ? 0 : header.getBoundingClientRect().top - (header.parentElement ?? document.body).getBoundingClientRect().top,
      focused: active === null || active === document.body ? '' : active.tagName.toLowerCase(),
    };
  });
}
const atTop = (state: ViewState): boolean => Math.max(Math.abs(state.scrollX), Math.abs(state.scrollY), Math.abs(state.pageLeft), Math.abs(state.pageTop), Math.abs(state.header)) < 1;
const stateText = (state: ViewState): string =>
  `scroll ${String(Math.round(state.scrollX))},${String(Math.round(state.scrollY))} visual ${String(Math.round(state.pageLeft))},${String(Math.round(state.pageTop))} header ${String(Math.round(state.header))}${state.focused === '' ? '' : ` focus ${state.focused}`}`;

/**
 * Brings the page, its visual viewport and its sticky header to the top before a full-page shot, and checks it.
 *
 * Why (2026-10-26, seven 390 px shots with the header painted mid-page): a full-page shot in Chromium resizes the view to
 * the whole page, and the resize keeps the visual viewport's place in the document, so a visual viewport left below the
 * top scrolls the page there during the shot and the sticky header is drawn at that place. In mobile emulation a page
 * wider than 390 px lets the visual viewport sit below the layout viewport's top; a click's scroll into view or a focus
 * puts it there, and window.scrollTo moves only the layout viewport. The steps, each tried only while the page is not yet
 * at the top: scrollTo; a blur of the focused element (a refusal focuses the field it names); a scrollIntoView of the
 * document (which moves the visual viewport too); a wheel; a touch swipe to the top. The page is at the top when the
 * layout scroll, the visual viewport's place and the header's place are all 0 at two checks in a row. If no step gets it
 * there, the shot fails with the numbers (a retake keeps the earlier shot) rather than being saved wrong.
 */
async function toTop(page: Page, id: string): Promise<{ readonly blurred: boolean }> {
  const frames = (): Promise<void> =>
    page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))).catch(() => undefined);
  const before = await viewState(page);
  let blurred = false;
  const steps: (readonly [string, () => Promise<unknown>])[] = [
    ['scrollTo', () => page.evaluate(() => window.scrollTo(0, 0))],
    [
      'blur',
      async () => {
        blurred = (await viewState(page)).focused !== '';
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
          window.scrollTo(0, 0);
        });
      },
    ],
    ['scrollIntoView', () => page.evaluate(() => document.documentElement.scrollIntoView({ block: 'start', inline: 'start', behavior: 'instant' }))],
    [
      'wheel',
      async () => {
        await page.mouse.move(0, 0);
        await page.mouse.wheel(-100_000, -100_000);
      },
    ],
    [
      'touch',
      async () => {
        const cdp = await page.context().newCDPSession(page);
        try {
          // Positive distances scroll towards the top and the left, from a point on the header.
          await cdp.send('Input.synthesizeScrollGesture', { x: 10, y: 10, xDistance: 100_000, yDistance: 100_000, gestureSourceType: 'touch', speed: 200_000 });
        } finally {
          await cdp.detach().catch(() => undefined);
        }
      },
    ],
  ];
  const used: string[] = [];
  let now = before;
  for (const [name, step] of steps) {
    await step().catch(() => undefined);
    used.push(name);
    await frames();
    await page.waitForTimeout(150);
    now = await viewState(page);
    if (!atTop(now)) continue;
    // Settled: still at the top a moment later.
    await frames();
    await page.waitForTimeout(250);
    now = await viewState(page);
    if (atTop(now)) break;
  }
  await page.mouse.move(0, 0).catch(() => undefined);
  if (!atTop(now)) throw new Error(`the page did not come back to the top for the full-page shot (before: ${stateText(before)}; after ${used.join(', ')}: ${stateText(now)})`);
  if (used.length > 1) log(`VIEWPORT ${id}: before ${stateText(before)}; at the top after ${used.join(', ')}`);
  return { blurred };
}

interface Meta {
  readonly key: string;
  readonly variant: string;
  readonly state: string;
  readonly route: string;
  readonly role: string;
  readonly note?: string;
}
const idOf = (meta: Meta, width: number, dark = false): string => `${meta.key}.${meta.variant}.${String(width)}${dark ? '-dark' : ''}`;
const variantOf = (state: string): string => (state.startsWith('interaction:') ? state.slice('interaction:'.length) : state);

function shown(page: Page): string {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}`;
}

/** Saves the page as the shot (and, at 1280 with `dark`, the dark-token shot after it). */
async function snap(page: Page, meta: Meta, options: { dark?: boolean; held?: boolean } = {}): Promise<void> {
  const width = page.viewportSize()?.width ?? 0;
  const id = idOf(meta, width);
  const darkId = idOf(meta, width, true);
  const takeLight = wanted(id);
  const takeDark = (options.dark === true || darkAsked(darkId)) && width === 1280 && wanted(darkId);
  if (!takeLight && !takeDark) return;
  if (options.held === true) {
    await settleHeld(page);
  } else {
    await settle(page);
    await page.mouse.move(0, 0).catch(() => undefined);
  }
  // A full-page shot of a scrolled page draws the sticky header where the viewport was (mid-page at 390 px after a form
  // step or a click low on the page): back to the top first, and checked (toTop, below).
  const top = await toTop(page, idOf(meta, width));
  const blurred = top.blurred ? ' The focused field was blurred so the full-page shot starts at the top (a mobile visual-viewport offset).' : '';
  const base = { path: shown(page), routePattern: meta.route, role: meta.role, width, state: meta.state, note: `${meta.note ?? ''}${blurred}`.trim() };
  if (takeLight) {
    const file = `${PNG}/${id}.png`;
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
    record({ file, id, theme: 'light', ...base });
  }
  if (takeDark) {
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    try {
      await settleHeld(page);
      const file = `${PNG}/${darkId}.png`;
      await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
      record({ file, id: darkId, theme: DARK, ...base });
    } finally {
      await page.evaluate(() => document.documentElement.removeAttribute('data-theme')).catch(() => undefined);
    }
  }
}

/** Runs the steps for these shots; a failure records each shot not taken as skipped with the reason. */
async function attempt(shotIds: readonly string[], route: string, run: () => Promise<void>, limitMs = 240_000): Promise<void> {
  if (!shotIds.some(wanted)) return;
  let timer: NodeJS.Timeout | undefined;
  try {
    // A bound on the whole step, past the action and navigation timeouts, so no single shot can stall the tour.
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`the step took over ${String(limitMs / 1000)} s and was given up`)), limitMs);
    });
    await Promise.race([run(), limit]);
  } catch (error) {
    for (const id of shotIds) skip(id, route, reasonOf(error));
  } finally {
    clearTimeout(timer);
  }
}

/** document.fonts.ready, bounded (it never resolves on a page whose font request is held or lost). */
async function fontsReady(page: Page): Promise<void> {
  await Promise.race([page.evaluate(() => document.fonts.ready.then(() => undefined)), new Promise<void>((resolve) => setTimeout(resolve, 5_000))]).catch(() => undefined);
}

const desktop = new Map<string, BrowserContext>();
const phones = new Map<string, BrowserContext>();
/** An internal persona's page that holds its virtual hardware key (kept open, so the persona can sign in again). */
const keyPages = new Map<string, Page>();

async function sessionLive(context: BrowserContext): Promise<boolean> {
  const page = await context.newPage();
  try {
    await page.goto('/account/devices');
    return !new URL(page.url()).pathname.startsWith('/sign-in');
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

/** The persona's desktop context, signed in once (a session kept from an earlier run on this database is reused). */
async function desktopOf(browser: Browser, persona: string): Promise<BrowserContext> {
  const known = desktop.get(persona);
  if (known !== undefined) return known;
  const cache = `${AUTH}/${persona}.json`;
  if (existsSync(cache)) {
    const restored = await browser.newContext({ ...DESKTOP_CONTEXT, storageState: cache });
    if (await sessionLive(restored)) {
      desktop.set(persona, restored);
      log(`AUTH ${persona}: the kept session is live`);
      return restored;
    }
    await restored.close();
  }
  const context = await browser.newContext(DESKTOP_CONTEXT);
  const page = await context.newPage();
  if (INTERNAL.has(persona)) {
    await registerKeyAndSignIn(page, persona);
    keyPages.set(persona, page);
  } else {
    await signInWithTotp(page, persona);
    await page.close();
  }
  await context.storageState({ path: cache });
  desktop.set(persona, context);
  return context;
}

/** The persona's phone-width context: the desktop session's cookies in a 390 px touch viewport. */
async function phoneOf(browser: Browser, persona: string): Promise<BrowserContext> {
  const known = phones.get(persona);
  if (known !== undefined) return known;
  const signed = await desktopOf(browser, persona);
  const context = await browser.newContext({ ...PHONE_CONTEXT, storageState: await signed.storageState() });
  phones.set(persona, context);
  return context;
}

async function open(browser: Browser, persona: string | null, width: Width): Promise<{ page: Page; dispose: () => Promise<void> }> {
  if (persona === null) {
    const context = await browser.newContext(width === 1280 ? DESKTOP_CONTEXT : PHONE_CONTEXT);
    return { page: await context.newPage(), dispose: () => context.close() };
  }
  const context = width === 1280 ? await desktopOf(browser, persona) : await phoneOf(browser, persona);
  const page = await context.newPage();
  return { page, dispose: () => page.close() };
}

/** A session that ended (30 idle minutes on PHI screens) signs in again. */
async function reauth(page: Page, persona: string): Promise<void> {
  log(`AUTH ${persona}: signing in again`);
  if (INTERNAL.has(persona)) {
    const keyPage = keyPages.get(persona);
    if (keyPage === undefined) throw new Error(`${persona}'s session ended and its hardware key is gone (a retake on the same database): prepare afresh`);
    await signInWithKey(keyPage, persona);
    await page.context().addCookies(await keyPage.context().cookies());
  } else {
    await signInWithTotp(page, persona, true);
  }
}

async function go(page: Page, persona: string | null, path: string): Promise<void> {
  await page.goto(path);
  if (persona !== null && !path.startsWith('/sign-in') && new URL(page.url()).pathname.startsWith('/sign-in')) {
    await reauth(page, persona);
    await page.goto(path);
  }
}

const h1 = async (page: Page): Promise<void> => {
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
};
const denied = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-state="permission"]').first()).toBeVisible();
};
const notFound = async (page: Page): Promise<void> => {
  await expect(page.getByText('Not found', { exact: true }).first()).toBeVisible();
};
async function refused(page: Page, text: RegExp = /Not done|Check the fields|Not sent|Not signed in|Account locked|Nothing was uploaded/): Promise<void> {
  await expect(page.locator('[data-slot="alert"], [role="alert"]').filter({ hasText: text }).first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Moves a sign-in step's page clock (installed before its navigation) forward ten seconds at a time until the step's
 * timer shows the phase, for at most 1,000 seconds (key registration's 15 minutes). Before co-001/ux-sign-in-time a step
 * has no timer, so the shot is skipped with that reason.
 */
async function toStepPhase(page: Page, phase: 'warning' | 'closed'): Promise<void> {
  const timer = page.locator('[data-slot="step-timer"]');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  if ((await timer.count()) === 0) throw new Error(`${shown(page)} states no time limit (before co-001/ux-sign-in-time, ADR 0081)`);
  await expect(timer).toHaveAttribute('data-phase', /^(open|warning|closed)$/);
  for (let moved = 0; moved < 1_000 && (await timer.getAttribute('data-phase')) !== phase; moved += 10) {
    await page.clock.fastForward(10_000);
    // A real pause for React to commit the phase the jump's check set (its scheduler is not on the fake clock), so the
    // loop reads it before the next jump and never carries a 'warning' wait past the warning into 'closed'.
    await page.waitForTimeout(100);
  }
  await expect(timer).toHaveAttribute('data-phase', phase);
}

/**
 * The sign-in page's Email field holds the persona's address, kept from a step that closed or was started again. Before
 * co-001/ux-sign-in-time nothing is kept, so the shot is skipped saying so (the error never prints the field's value).
 */
async function emailKept(page: Page, persona: string): Promise<void> {
  const field = page.getByLabel('Email');
  await expect(field).toBeVisible();
  try {
    await expect(field).toHaveValue(personaEmail(persona), { timeout: 5_000 });
  } catch {
    const empty = (await field.inputValue()) === '';
    throw new Error(`${shown(page)} keeps no email: the Email field is ${empty ? 'empty' : 'not the persona’s'} (before co-001/ux-sign-in-time, ADR 0081)`);
  }
}

/**
 * Enters the persona's password and waits for its next step. A persona the ref does not seed (time-mfa and time-staff
 * come with co-001/ux-sign-in-time) is refused on /sign-in, and the shot is skipped saying so rather than with a URL
 * mismatch.
 */
async function passwordTo(page: Page, persona: string, step: RegExp): Promise<void> {
  await enterPassword(page, persona);
  // The next step's URL, or a refusal on /sign-in (so an unseeded persona does not wait out the 20 s).
  await Promise.race([
    page.waitForURL((url) => url.pathname !== '/sign-in', { timeout: 20_000 }),
    page.locator('[data-slot="alert"], [role="alert"]').filter({ hasText: /did not match|Not done|Account locked|Too many/ }).first().waitFor({ timeout: 20_000 }),
  ]).catch(() => undefined);
  if (new URL(page.url()).pathname === '/sign-in') {
    const refusedHere = await page.getByText(/did not match/).first().isVisible().catch(() => false);
    throw new Error(refusedHere ? `${persona} is not seeded on this ref: its password did not match (a persona of co-001/ux-sign-in-time)` : `${persona} stayed on /sign-in after its password`);
  }
  await expect(page).toHaveURL(step);
}

/** A reason notice opened by its URL; a reason the ref does not know is a 404, and the shot is skipped saying so. */
function reasonShown(reason: string): (page: Page) => Promise<void> {
  return async (page) => {
    if (await page.getByText('Not found', { exact: true }).first().isVisible().catch(() => false)) {
      throw new Error(`${shown(page)} is a 404 on this ref (${reason} is not one of its sign-in reasons)`);
    }
    await expect(page.locator(`[data-reason="${reason}"]`).first()).toBeVisible();
  };
}

/**
 * A guard for an upload step that must send nothing (files chosen before their kind or system, PR #75): every request
 * for upload targets is aborted and counted, and `sent()` throws when one was made, so the shot is skipped with the
 * reason, never taken over a write.
 */
async function noUploadRequest(page: Page): Promise<{ readonly sent: () => void }> {
  let count = 0;
  await page.route(
    (url) => url.pathname.endsWith('/uploads/request'),
    async (route) => {
      count += 1;
      await route.abort();
    },
  );
  return {
    sent: () => {
      if (count > 0) throw new Error(`${String(count)} upload request(s) were made (aborted) by a step that must send nothing: not taken`);
    },
  };
}

/** The Contracts upload card: named "Upload a contract or exhibit" before PR #75's fix round, by its title from it on (the review's N-3). */
const CONTRACT_UPLOAD = /^Upload a contract(, exhibit or payer letter| or exhibit)$/;
/** Files waiting in the browser for their kind or system, and for Upload (PR #75's fix round, the review's UX-1). */
const WAITING = /^Waiting to upload/;

/**
 * A synthetic PDF (CON-01 version-1.pdf) chosen on the Contracts panel before its kind, on either side of PR #75's fix
 * round: before it the file is refused in the browser ("Nothing was uploaded", "Choose the kind of document first, then
 * choose the files again."); from it on the file waits in the browser ("Waiting to upload: 1 file"), the kind select
 * marked invalid, described by the words under it and focused. Says which it met. A build whose panel starts with a
 * kind would upload the file, so the step stops there before any file is chosen.
 */
async function noKind(page: Page): Promise<'refused' | 'held'> {
  const panel = page.getByRole('region', { name: CONTRACT_UPLOAD });
  const select = panel.getByLabel('Kind of document');
  const kind = await select.inputValue();
  if (kind !== '') throw new Error(`the panel starts with the kind ${kind}, so choosing a file would upload it: not taken on this build`);
  await panel.getByLabel('Choose files to upload').setInputFiles({ name: 'version-1.pdf', mimeType: 'application/pdf', buffer: readFileSync(`${SCREENS}/fixtures/synthetic/CON-01/version-1.pdf`) });
  const held = panel.getByRole('group', { name: WAITING });
  const refusal = panel.locator('[data-state="error"]').filter({ hasText: 'Nothing was uploaded' });
  await expect(held.or(refusal).first()).toBeVisible({ timeout: 15_000 });
  if ((await held.count()) === 0) {
    await expect(refusal).toContainText('Choose the kind of document first, then choose the files again.');
    return 'refused';
  }
  await expect(held).toContainText('version-1.pdf');
  await expect(panel.locator('#upload-kind-error')).toHaveText('Choose the kind of document for this file, then upload it.');
  await expect(select).toHaveAttribute('aria-invalid', 'true');
  await expect(select).toBeFocused();
  return 'held';
}

/** The refusal of a page out of date: "could not be checked against your session" before co-001/ux-forms, "out of date" from it. */
const STALE = /out of date|could not be checked/;

/**
 * A page out of date, as a person meets it once their session's token has changed (another tab, a new sign-in): the
 * form's hidden CSRF token is altered on the page, as the forms journey does (apps/web/e2e/forms-keep-input.spec.ts, the
 * support form's second step), so the server refuses the post before any write.
 */
async function staleToken(form: Locator): Promise<void> {
  await form
    .locator('input[name="csrfToken"]')
    .first()
    .evaluate((input) => {
      (input as HTMLInputElement).value = 'SYNTHETIC-STALE-TOKEN';
    });
}

/**
 * A refused download opened as a browser navigation (a link, a GET form or page.goto), on either side of UX PR 5
 * (co-001/ux-download-refusals; designs/lane-b-ux-download-refusals.md). Before it (claude/build-platform e908c21 and
 * earlier) the download handler answers with its raw JSON outcome at the download's own URL, a page with no frame. From
 * it on, it answers with 303 to the page the download is opened from, with `?refused=<status>` in that page's URL and
 * the notice (or the marked field) on it; a notice then takes the key out of the URL. This waits for either and says which; the shot's path records it too.
 */
async function downloadRefusal(page: Page): Promise<'json' | 'page'> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    await page.waitForLoadState('load').catch(() => undefined);
    // A shown refusal leaves the address bar on a timer (ForgetRefusal), the notice's page and a permission state's
    // alike, so the notice and the permission state count too; the JSON page of the base has neither.
    const landed =
      new URL(page.url()).searchParams.has('refused') || (await page.locator('[data-download-refusal], [data-state="permission"]').count()) > 0;
    if (landed) {
      await expect(page.getByRole('heading', { level: 1 }).or(page.locator('[data-state="permission"]')).first()).toBeVisible();
      return 'page';
    }
    const json = await page.evaluate(() => document.contentType === 'application/json').catch(() => false);
    if (json) return 'json';
    if (Date.now() > deadline) throw new Error(`neither the download handler's JSON nor a page with ?refused= came back (at ${shown(page)})`);
    await page.waitForTimeout(250);
  }
}

/** The letter form (the form that holds the codes field), found the same way on both sides of UX PR 5. */
const LETTER_FORM = 'form:has(#letter-codes)';
/**
 * Sends the letter form past the browser's own check and waits for the server's answer on either side of UX PR 5: the
 * form's noValidate is set first (from that PR on the codes field has a pattern that blocks a malformed code before
 * submit; before it the form has nothing to block, so this is a no-op), then the step waits for the /coverage/letter URL
 * (before: the raw JSON) or a /coverage URL with refused= (after: back on Coverage, the values kept, the field marked).
 */
async function sendLetter(page: Page): Promise<void> {
  await page.evaluate((selector) => {
    for (const form of document.querySelectorAll(selector)) if (form instanceof HTMLFormElement) form.noValidate = true;
  }, LETTER_FORM);
  await press(page.locator(LETTER_FORM).getByRole('button', { name: 'Download the letter' }).first());
  await page.waitForURL((url) => url.pathname.endsWith('/coverage/letter') || (url.pathname.endsWith('/coverage') && url.searchParams.has('refused')), { timeout: 15_000 });
  await downloadRefusal(page);
}

interface Cap {
  readonly key: string;
  readonly route: string;
  readonly persona: string | null;
  readonly path: string | (() => string | Promise<string>);
  readonly state?: string;
  readonly variant?: string;
  readonly widths?: readonly Width[];
  readonly dark?: boolean;
  readonly ready?: (page: Page) => Promise<void>;
  readonly act?: (page: Page, width: Width) => Promise<void>;
  /**
   * Installs Playwright's fake clock in the page (page.clock.install()) before its first navigation, so `act` can move
   * the page's own timers forward (a sign-in step's warning and closed state, UX PR 6; ADR 0081). Installed, it runs on
   * from real time until moved; the server's clock and the cookies stay real.
   */
  readonly clock?: boolean;
  readonly note?: string;
}

/**
 * The screens that list every organization to the platform administrator. The writes test makes SYNTHETIC CONSOLE EMPTY
 * GROUP last, so no other shot lists it; a retake on the same database after it would (the checkers found it on five
 * 390 px console shots, 2026-10-26), so such a retake fails with the reason and keeps the earlier shot.
 */
const LISTS_ORGANIZATIONS = new Set(['console.organizations', 'console.billing']);
let groupMade = false;

/** One state of one route: opened as the persona at each width, readied, acted on, saved (dark too for a default). */
async function cap(browser: Browser, c: Cap): Promise<void> {
  const state = c.state ?? 'default';
  const meta: Meta = { key: c.key, variant: c.variant ?? variantOf(state), state, route: c.route, role: c.persona ?? 'public', note: c.note };
  const dark = c.dark ?? state === 'default';
  for (const width of c.widths ?? WIDTHS) {
    const shotIds = [idOf(meta, width), ...((dark || darkAsked(idOf(meta, width, true))) && width === 1280 ? [idOf(meta, width, true)] : [])];
    await attempt(shotIds, c.route, async () => {
      if (groupMade && c.persona === 'platform-admin' && LISTS_ORGANIZATIONS.has(c.key)) {
        throw new Error('SYNTHETIC CONSOLE EMPTY GROUP, which the run makes last, is on this database and the screen would list it: retake on a fresh prepare');
      }
      const { page, dispose } = await open(browser, c.persona, width);
      try {
        if (c.clock === true) await page.clock.install();
        await go(page, c.persona, typeof c.path === 'function' ? await c.path() : c.path);
        await (c.ready ?? h1)(page);
        await c.act?.(page, width);
        await snap(page, meta, { dark });
      } finally {
        await dispose();
      }
    });
  }
}

/** Clicks the first visible match; at 390 px the rail is inside the header's Menu, which is opened first. */
async function clickVisible(page: Page, selector: string, prefetchFirst = false): Promise<string> {
  for (let round = 0; round < 2; round += 1) {
    const all = page.locator(selector);
    const count = await all.count();
    for (let index = 0; index < count; index += 1) {
      const item = all.nth(index);
      if (await item.isVisible()) {
        const href = (await item.getAttribute('href')) ?? '';
        if (prefetchFirst) {
          // A link is prefetched (up to its loading boundary) once it is in view; the router shows the loading state on
          // the click only once that prefetch has settled in its cache. A probe at 390 px: the click right after the
          // Menu opened showed no loading state; three seconds later it did.
          await item.scrollIntoViewIfNeeded();
          await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
          await page.waitForTimeout(3_000);
        }
        await press(item);
        return href;
      }
    }
    const menu = page.locator('header summary').filter({ hasText: /^Menu$/ });
    if (round === 0 && (await menu.count()) > 0 && (await menu.first().isVisible())) {
      await menu.first().click();
      // Links that come into view are prefetched (up to their loading boundary); let that finish before the click.
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    } else {
      break;
    }
  }
  throw new Error(`nothing visible matches ${selector} on ${shown(page)}`);
}

/**
 * A route's loading.tsx, held on a client navigation (route map, "Loading states"): a direct goto streams the fallback and
 * the page in one response, so the tour opens another page of the same practice, holds only the navigation's RSC request
 * to the target (header rsc: 1, no next-router-prefetch), clicks the in-app link, shoots once the loading state shows,
 * then lets the request go.
 */
interface LoadCap {
  readonly key: string;
  readonly route: string;
  readonly persona: string | null;
  readonly from: () => string;
  /** The link to click on the `from` page; its href is the target. */
  readonly link: () => string;
  readonly note?: string;
}
async function capLoading(browser: Browser, c: LoadCap): Promise<void> {
  const meta: Meta = { key: c.key, variant: 'loading', state: 'loading', route: c.route, role: c.persona ?? 'public', note: c.note ?? 'The route’s loading.tsx, held on a client navigation (page.route holds the RSC request).' };
  for (const width of WIDTHS) {
    await attempt([idOf(meta, width), ...(width === 1280 && darkAsked(idOf(meta, width, true)) ? [idOf(meta, width, true)] : [])], c.route, async () => {
      const { page, dispose } = await open(browser, c.persona, width);
      try {
        await go(page, c.persona, c.from());
        await settle(page);
        const selector = c.link();
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        let target = '';
        const match = (url: URL): boolean => target !== '' && url.pathname === target;
        const handler = async (route: Route): Promise<void> => {
          const headers = route.request().headers();
          if ((headers.rsc === '1' || route.request().url().includes('_rsc=')) && headers['next-router-prefetch'] === undefined) await gate;
          await route.continue().catch(() => undefined);
        };
        // The target is the link's own pathname, read before the click.
        const first = page.locator(selector);
        const count = await first.count();
        for (let index = 0; index < count && target === ''; index += 1) {
          const href = await first.nth(index).getAttribute('href');
          if (href !== null) target = new URL(href, 'http://tour.invalid').pathname;
        }
        if (target === '') throw new Error(`no link matches ${selector} on ${shown(page)}`);
        await page.route(match, handler);
        try {
          await clickVisible(page, selector, true);
          await page.locator('[data-slot="loading-state"]').first().waitFor({ state: 'visible', timeout: 15_000 });
          await snap(page, meta, { held: true });
        } finally {
          release();
          await page.unroute(match, handler).catch(() => undefined);
        }
      } finally {
        await dispose();
      }
    });
  }
}

/** Holds a form's submit (a server action's POST, or the request `match` names) and shoots the pending state. */
async function heldShot(
  page: Page,
  meta: Meta,
  options: { readonly submit: () => Promise<void>; readonly busy: RegExp; readonly after: 'abort' | 'continue'; readonly match?: (url: URL) => boolean },
): Promise<void> {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const here = new URL(page.url()).pathname;
  const custom = options.match !== undefined;
  const match = options.match ?? ((url: URL): boolean => url.pathname === here);
  let held = 0;
  let settled: () => void = () => undefined;
  const handled = new Promise<void>((resolve) => {
    settled = resolve;
  });
  const handler = async (route: Route): Promise<void> => {
    const request = route.request();
    if (!custom && !(request.method() === 'POST' && request.headers()['next-action'] !== undefined)) {
      await route.continue().catch(() => undefined);
      return;
    }
    held += 1;
    await gate;
    if (options.after === 'abort') await route.abort().catch(() => undefined);
    else await route.continue().catch(() => undefined);
    settled();
  };
  await page.route(match, handler);
  try {
    await options.submit();
    // Pending shows as the button's own words ("Working...", "Waiting for the key...") before co-001/ux-forms (ADR 0077),
    // and from it as a status line beside a button that keeps its words ([data-slot="pending-status"]: "Working…",
    // "Waiting for your hardware key. …"). Either is the pending state, so one spec shoots a PR's before and after.
    const busy = page.getByRole('button', { name: options.busy }).or(page.locator('[data-slot="pending-status"]').filter({ hasText: options.busy }));
    await expect(busy.first()).toBeVisible({ timeout: 10_000 });
    if (held === 0) throw new Error('the submit was not held (no matching request), so its pending state is not shown');
    await snap(page, meta, { held: true });
  } finally {
    release();
    // Unrouting while the handler still waits would let the held request through (the first run sent its "aborted"
    // submits this way): wait for the handler to abort or continue it first.
    if (held > 0) await Promise.race([handled, new Promise<void>((resolve) => setTimeout(resolve, 5_000))]);
    await page.unroute(match, handler).catch(() => undefined);
  }
}

interface HeldCap {
  readonly key: string;
  readonly route: string;
  readonly persona: string | null;
  readonly path: string | (() => string);
  readonly prepare?: (page: Page) => Promise<void>;
  readonly submit: (page: Page) => Promise<void>;
  readonly busy: RegExp;
  readonly match?: (url: URL) => boolean;
  readonly note?: string;
}
/** A pending submit ('Working...', 'Sending...', 'Waiting for the key...'), held and then aborted: nothing is sent. */
async function capHeld(browser: Browser, c: HeldCap): Promise<void> {
  const meta: Meta = { key: c.key, variant: 'loading', state: 'loading', route: c.route, role: c.persona ?? 'public', note: c.note ?? 'The pending submit, held with page.route and then aborted (nothing was sent).' };
  for (const width of WIDTHS) {
    await attempt([idOf(meta, width), ...(width === 1280 && darkAsked(idOf(meta, width, true)) ? [idOf(meta, width, true)] : [])], c.route, async () => {
      const { page, dispose } = await open(browser, c.persona, width);
      try {
        await go(page, c.persona, typeof c.path === 'function' ? c.path() : c.path);
        await settle(page);
        await c.prepare?.(page);
        await heldShot(page, meta, { submit: () => c.submit(page), busy: c.busy, after: 'abort', match: c.match });
      } finally {
        await dispose();
      }
    });
  }
}

const HELP = async (page: Page): Promise<void> => {
  await page.locator('main summary').filter({ hasText: 'Help with this screen' }).first().click();
  await expect(page.locator('main details[data-help][open]').first()).toBeVisible();
};
/**
 * The header's two menus, reached by their slots (data-slot, from PR #77, which names both summaries from their content)
 * or, on a tree before it, by their old aria-labels, so the tour runs on either side of it; each waits for its open panel.
 */
const ACCOUNT = async (page: Page): Promise<void> => {
  await page.locator('header [data-slot="account-menu"], header summary[aria-label="Account menu"]').first().click();
  await expect(page.locator('header details[open] button[type="submit"]').filter({ hasText: 'Sign out' }).first()).toBeVisible();
};
const SWITCHER = async (page: Page): Promise<void> => {
  await page.locator('header [data-slot="practice-switcher"], header summary[aria-label="Practice switcher"]').first().click();
  await expect(page.locator('header details[open] ul[aria-label="Practices"]').first()).toBeVisible();
};
const MENU = async (page: Page): Promise<void> => {
  await page.locator('header summary').filter({ hasText: /^Menu$/ }).first().click();
};

/** The shell's own controls the map names on a route: Help with this screen, the Account menu, the 390 px Menu. */
async function shellControls(browser: Browser, c: { key: string; route: string; persona: string; path: string | (() => string); help?: boolean; account?: boolean; menu?: boolean }): Promise<void> {
  if (c.help !== false) await cap(browser, { key: c.key, route: c.route, persona: c.persona, path: c.path, state: 'interaction:help', act: HELP });
  if (c.account === true) await cap(browser, { key: c.key, route: c.route, persona: c.persona, path: c.path, state: 'interaction:account-menu', act: ACCOUNT });
  if (c.menu === true) await cap(browser, { key: c.key, route: c.route, persona: c.persona, path: c.path, state: 'interaction:menu', widths: [390], act: MENU });
}

/** A URL notice (?notice=, ?saved=1 ...): the success alert the product shows after a write, opened without the write. */
function notice(browser: Browser, c: { key: string; route: string; persona: string; path: () => string; name?: string; ready?: (page: Page) => Promise<void>; dark?: boolean }): Promise<void> {
  return cap(browser, { key: c.key, route: c.route, persona: c.persona, path: c.path, state: `interaction:${c.name ?? 'notice'}`, ready: c.ready, dark: c.dark, note: 'The success alert, opened by its URL without the write that would show it.' });
}

/**
 * A list's filtered empty state, reached through its filter form as a person reaches it: each option of the select in
 * turn (the preferred ones first), Filter pressed (the form is a GET), until the list says nothing matches. The checkers
 * (2026-10-26) found the URL-only shots wrong: ?state=resolved matched PACKETS' one case, and an ?run= of a run without
 * cohorts left the Pricing run select reading Every run (it lists only runs with cohorts), so no filter showed.
 */
async function filterToEmpty(page: Page, form: string, select: string, prefer: RegExp, empty: string): Promise<void> {
  const field = page.locator(`${form} ${select}`).first();
  const name = (await field.getAttribute('name')) ?? '';
  const options = await field.locator('option').evaluateAll((items) => items.map((item) => ({ value: (item as HTMLOptionElement).value, label: (item.textContent ?? '').trim() })));
  const choices = options.filter((option) => option.value !== '');
  const order = [...choices.filter((option) => prefer.test(option.label)), ...choices.filter((option) => !prefer.test(option.label))];
  const tried: string[] = [];
  for (const option of order) {
    await page.locator(`${form} ${select}`).first().selectOption(option.value);
    await press(page.locator(`${form} button[type="submit"]`).first());
    await page.waitForURL((url) => url.searchParams.get(name) === option.value);
    // The list renders after the URL changes (a check at once missed every message in the first try): settle first.
    await settle(page);
    const shows = await page
      .getByText(empty, { exact: true })
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(
        () => true,
        () => false,
      );
    if (shows) return;
    tried.push(option.label);
  }
  throw new Error(`every option of ${select} matches something (${tried.join(' | ')})`);
}

/**
 * Presses a button. At 390 px in mobile emulation a filled date field's label subtree takes the pointer over the submit
 * button below it (Playwright: "label ... intercepts pointer events"; a candidate finding for the 390 px reviewer), so a
 * click that cannot land is dispatched to the button itself.
 */
async function press(button: ReturnType<Page['locator']>): Promise<void> {
  try {
    await button.click({ timeout: 5_000 });
  } catch {
    await button.dispatchEvent('click');
  }
}

async function optionIndex(page: Page, label: string | RegExp, text: RegExp): Promise<number> {
  const options = await page.getByLabel(label).first().locator('option').allTextContents();
  const index = options.findIndex((option) => text.test(option));
  if (index < 0) throw new Error(`no option matching ${String(text)} in ${String(label)} (${options.join(' | ')})`);
  return index;
}

// ---------------------------------------------------------------------------------------------------------------------

// The tests run in order in one worker (run.sh passes --workers 1), not as a serial group: a test that fails (a hang past
// its timeout) does not skip the ones after it. A restarted worker resumes from shots.json and ids.json (resume()).
let consumer: { close: () => Promise<void> } | undefined;

test.beforeAll(async () => {
  await resume();
});

test.afterAll(async () => {
  await consumer?.close().catch(() => undefined);
  for (const context of [...desktop.values(), ...phones.values()]) await context.close().catch(() => undefined);
  if (ONLY.length === 0) coverageCheck();
  else unreached();
  flush();
  log(`DONE ${String(taken.size)} shots taken this run; shots.json holds ${String(shots.length)} shots and ${String(skipped.length)} skipped`);
});

test.afterEach(() => {
  flush();
});

test('the records', async () => {
  test.setTimeout(5 * 60_000);
  const practice = (name: string): Promise<string> => one('SELECT id FROM practice WHERE name = $1', [name]);
  ids.north = await practice('SYNTHETIC PHYSICAL THERAPY NORTH');
  ids.south = await practice('SYNTHETIC PHYSICAL THERAPY SOUTH');
  ids.other = await practice('SYNTHETIC OTHER PRACTICE');
  ids.layout = await practice('SYNTHETIC OTHER PRACTICE LAYOUT');
  ids.packets = await practice('SYNTHETIC OTHER PRACTICE PACKETS');
  ids.deadlines = await practice('SYNTHETIC OTHER PRACTICE PACKET DEADLINES');
  ids.ledger = await practice('SYNTHETIC OTHER PRACTICE LEDGER');
  ids.monitoring = await practice('SYNTHETIC OTHER PRACTICE MONITORING');
  ids.reports = await practice('SYNTHETIC OTHER PRACTICE REPORTS');
  const organization = (name: string): Promise<string> => one('SELECT id FROM organization WHERE name = $1', [name]);
  ids.group = await one('SELECT organization_id AS id FROM practice WHERE id = $1', [ids.north]);
  ids.otherGroup = await one('SELECT organization_id AS id FROM practice WHERE id = $1', [ids.other]);
  ids.firm = await organization('SYNTHETIC BILLING FIRM');
  ids.internal = await organization('SYNTHETIC COMPANY (INTERNAL)');
  const firstCase = (practiceId: string): Promise<string> => one('SELECT case_id AS id FROM case_line WHERE practice_id = $1 ORDER BY created_at LIMIT 1', [practiceId]);
  ids.layoutCase = await firstCase(ids.layout);
  ids.packetsCase = await firstCase(ids.packets);
  ids.ledgerCase = await firstCase(ids.ledger);
  ids.monitoringCase = await firstCase(ids.monitoring);
  ids.version = await one("SELECT id FROM contract_version WHERE practice_id = $1 AND status = 'signed_off' ORDER BY created_at LIMIT 1", [ids.layout]);
  ids.layoutContract = await one('SELECT contract_id AS id FROM contract_version WHERE id = $1', [ids.version]);
  ids.otherVersion = await one("SELECT id FROM contract_version WHERE practice_id = $1 AND status = 'signed_off' ORDER BY created_at LIMIT 1", [ids.other]);
  ids.otherContract = await one("SELECT id FROM contract WHERE practice_id = $1 AND title = 'SYNTHETIC PAYER C AGREEMENT'", [ids.other]);
  const run = (month: string): Promise<string> => one("SELECT id FROM pricing_run WHERE practice_id = $1 AND period_from = $2 AND status = 'complete' ORDER BY created_at LIMIT 1", [ids.layout, month]);
  ids.marchRun = await run('2026-03-01');
  ids.aprilRun = await run('2026-04-01');
  ids.marchLine = await one('SELECT service_line_id AS id FROM priced_line WHERE pricing_run_id = $1 ORDER BY created_at, id LIMIT 1', [ids.marchRun]);
  ids.ledgerLine = await one('SELECT service_line_id AS id FROM priced_line WHERE practice_id = $1 ORDER BY created_at, id LIMIT 1', [ids.ledger]);
  ids.otherLine = await one('SELECT id FROM service_line WHERE practice_id = $1 ORDER BY created_at, id LIMIT 1', [ids.other]);
  ids.remittance = await one("SELECT id FROM remittance WHERE practice_id = $1 AND trn02 = 'SYNEFTCAS08001' LIMIT 1", [ids.layout]);
  ids.ledgerRemittance = await one('SELECT id FROM remittance WHERE practice_id = $1 ORDER BY created_at LIMIT 1', [ids.ledger]);
  ids.ledgerPlbRemittance = await one('SELECT id FROM remittance WHERE practice_id = $1 AND plb_total_cents <> 0 ORDER BY created_at LIMIT 1', [ids.ledger]);
  ids.layoutDocument = await one('SELECT source_document_id AS id FROM remittance WHERE id = $1', [ids.remittance]);
  ids.ledgerExportDocument = await one("SELECT id FROM source_document WHERE practice_id = $1 AND kind = 'posting_export' ORDER BY created_at LIMIT 1", [ids.ledger]);
  ids.planFix = await one("SELECT id FROM plan WHERE practice_id = $1 AND plan_key = 'CE:SYNPLAN-FIX-ONE'", [ids.layout]);
  ids.planOon = await one("SELECT id FROM plan WHERE practice_id = $1 AND plan_key = 'CE:SYNPLAN-OON-CAS'", [ids.layout]);
  ids.anomaly = await one('SELECT id FROM anomaly WHERE practice_id = $1 ORDER BY created_at LIMIT 1', [ids.layout]);
  ids.digest = await one('SELECT id FROM digest WHERE practice_id = $1 ORDER BY created_at DESC LIMIT 1', [ids.monitoring]);
  ids.roi = await one('SELECT id FROM roi_statement WHERE practice_id = $1 ORDER BY created_at DESC LIMIT 1', [ids.ledger]);
  ids.report = await one('SELECT id FROM audit_report WHERE practice_id = $1 ORDER BY created_at LIMIT 1', [ids.reports]);
  ids.reportDocument = await one('SELECT id FROM report_document WHERE practice_id = $1 ORDER BY (printed_at IS NULL), created_at LIMIT 1', [ids.reports]);
  ids.layoutReportDocument = await one('SELECT id FROM report_document WHERE practice_id = $1 ORDER BY created_at DESC LIMIT 1', [ids.layout]);
  ids.packetsVersion = await one(
    'SELECT v.id FROM packet_version v JOIN packet p ON p.id = v.packet_id WHERE p.case_id = $1 AND v.exported_at IS NOT NULL ORDER BY v.version_no DESC LIMIT 1',
    [ids.packetsCase],
  );
  ids.deadlinesBlockedCase = await one(
    'SELECT p.case_id AS id FROM packet p JOIN packet_version v ON v.id = p.current_version_id WHERE p.practice_id = $1 AND v.approved_at IS NOT NULL AND v.exported_at IS NULL ORDER BY v.created_at LIMIT 1',
    [ids.deadlines],
  );
  ids.deadlinesExportedVersion = await one(
    'SELECT v.id FROM packet p JOIN packet_version v ON v.id = p.current_version_id WHERE p.practice_id = $1 AND v.exported_at IS NOT NULL ORDER BY v.exported_at DESC LIMIT 1',
    [ids.deadlines],
  );
  ids.deadlinesExportedCase = await one('SELECT p.case_id AS id FROM packet_version v JOIN packet p ON p.id = v.packet_id WHERE v.id = $1', [ids.deadlinesExportedVersion]);
  const grant = (practiceId: string, ticket: string): Promise<string> => one('SELECT id FROM support_grant WHERE practice_id = $1 AND ticket = $2 ORDER BY created_at LIMIT 1', [practiceId, ticket]);
  ids.grantConE2E = await grant(ids.other, 'SYN-CON-E2E');
  ids.grantMonitoring = await grant(ids.monitoring, 'SYN-JOURNEY-1');
  ids.grantLayout = await grant(ids.layout, 'SYN-JOURNEY-1');
  // The keys the retake specs (contract.spec.ts, mapping.spec.ts) and the 2026-10-25 tour read, kept.
  writeFileSync(`${OUT}/ids.json`, JSON.stringify(ids, null, 2));
  const missing = Object.entries(ids).filter(([, value]) => value === '');
  log(`RECORDS ${String(Object.keys(ids).length - missing.length)} found; missing: ${missing.map(([key]) => key).join(', ') || 'none'}`);
});

// ---------------------------------------------------------------------------------------------------------------------
test('public pages and sign-in', async ({ browser }) => {
  test.setTimeout(40 * 60_000);
  const R = { signIn: '/sign-in', mfa: '/sign-in/mfa', newPassword: '/sign-in/new-password', enroll: '/sign-in/enroll', key: '/sign-in/hardware-key', register: '/sign-in/register-key' };

  // /sign-in
  await cap(browser, { key: 'sign-in', route: R.signIn, persona: null, path: '/sign-in', ready: async (page) => expect(page.getByLabel('Email')).toBeVisible(), note: 'Legacy tour shot 01-sign-in (1280).' });
  // restarted: UX PR 6 (co-001/ux-sign-in-time; ADR 0081); a 404 before it.
  for (const reason of ['idle', 'step_expired', 'restarted']) {
    await cap(browser, {
      key: 'sign-in',
      route: R.signIn,
      persona: null,
      path: `/sign-in?reason=${reason}`,
      state: `interaction:reason-${reason.replace('_', '-')}`,
      ready: reasonShown(reason),
      note: 'A notice the product redirects to, opened by its URL.',
    });
  }
  await cap(browser, {
    key: 'sign-in',
    route: R.signIn,
    persona: null,
    path: '/sign-in',
    state: 'error',
    variant: 'error-wrong-password',
    note: 'One wrong synthetic password for the lockout persona (its ten-failure lock is taken last).',
    act: async (page) => {
      await page.getByLabel('Email').fill(personaEmail('lockout'));
      await page.getByLabel('Password').fill('Wrong-Synthetic-Pass-2026!');
      await page.getByRole('button', { name: 'Continue' }).click();
      await refused(page, /did not match/);
    },
  });
  await capHeld(browser, {
    key: 'sign-in',
    route: R.signIn,
    persona: null,
    path: '/sign-in',
    prepare: async (page) => {
      await page.getByLabel('Email').fill(personaEmail('analyst'));
      await page.getByLabel('Password').fill(personaPassword('analyst'));
    },
    submit: (page) => page.getByRole('button', { name: 'Continue' }).click(),
    busy: /^Working/,
  });

  // The root not-found page, public (GET /console has no page: route map, "Paths with no page").
  await cap(browser, { key: 'not-found', route: '/console', persona: null, path: '/console', state: 'not-found', variant: 'public', ready: notFound, note: 'app/not-found.tsx as anyone sees it; /console has no page. Every route’s unknown-ID not-found is this page.' });

  // /sign-in/mfa (billing-manager): the step before the code, in throwaway contexts (no code is consumed).
  await mfaShots(browser);
  // UX PR 6 (co-001/ux-sign-in-time; ADR 0081): the code step's warning and closed state on the page's own clock, and the
  // sign-in page after Start again and after a step closed, the email kept. time-mfa is this PR's persona: no code is
  // consumed, and nothing else signs it in on the tour's database. Before it the persona is not seeded, and each shot is
  // skipped saying so.
  for (const phase of ['warning', 'closed'] as const) {
    await cap(browser, {
      key: 'sign-in-mfa',
      route: R.mfa,
      persona: null,
      path: R.signIn,
      clock: true,
      state: `interaction:${phase}`,
      note: phase === 'warning' ? 'A minute before the code step closes; the page’s clock moved forward, the server’s real.' : 'The code step closed; the page’s clock moved forward, the server’s real.',
      act: async (page) => {
        await passwordTo(page, 'time-mfa', /\/sign-in\/mfa$/);
        await toStepPhase(page, phase);
      },
    });
  }
  await cap(browser, {
    key: 'sign-in',
    route: R.signIn,
    persona: null,
    path: R.signIn,
    clock: true,
    state: 'interaction:restarted-kept',
    note: 'Start again pressed during the code step’s warning: the notice focused, the email kept, the password empty.',
    act: async (page) => {
      await passwordTo(page, 'time-mfa', /\/sign-in\/mfa$/);
      await toStepPhase(page, 'warning');
      await page.locator('[data-slot="step-timer"]').getByRole('link', { name: 'Start again' }).click();
      await expect(page).toHaveURL(/\/sign-in\?reason=restarted$/);
      await emailKept(page, 'time-mfa');
    },
  });
  await cap(browser, {
    key: 'sign-in',
    route: R.signIn,
    persona: null,
    path: R.signIn,
    state: 'interaction:step-expired-kept',
    note: 'A code step past its limit, reloaded once its step cookie is gone (deleted here, as the browser does at its Max-Age): the email kept.',
    act: async (page) => {
      await passwordTo(page, 'time-mfa', /\/sign-in\/mfa$/);
      await page.context().clearCookies({ name: 'tp_sign_in' });
      await page.reload();
      await expect(page).toHaveURL(/\/sign-in\?reason=step_expired$/);
      await emailKept(page, 'time-mfa');
    },
  });
  // /sign-in/new-password and /sign-in/enroll (invited): before and after choosing a password.
  await invitedShots(browser);
  // UX PR 6: an invited staff member's first setup step of three (time-staff, this PR's persona; it never saves).
  await cap(browser, {
    key: 'sign-in-new-password',
    route: R.newPassword,
    persona: null,
    path: R.signIn,
    state: 'interaction:invited-staff',
    note: 'An invited staff member’s first setup step of three (the password is not saved).',
    act: async (page) => {
      await passwordTo(page, 'time-staff', /\/sign-in\/new-password$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Step 1 of 3: Choose a password' })).toBeVisible();
    },
  });
  // /sign-in/register-key (reviewer's first sign-in) and its no-authenticator refusal (support-expiry).
  await registerKeyShots(browser);
  // /sign-in/hardware-key
  await cap(browser, { key: 'sign-in-hardware-key', route: R.key, persona: null, path: R.key, ready: async (page) => expect(page.getByLabel('Email')).toBeVisible() });
  // step_expired: the key surface's words from UX PR 6 (co-001/ux-sign-in-time, review R-04); before it, the password words.
  for (const reason of ['key_registered', 'hardware_key_required', 'step_expired']) {
    await cap(browser, {
      key: 'sign-in-hardware-key',
      route: R.key,
      persona: null,
      path: `${R.key}?reason=${reason}`,
      state: `interaction:reason-${reason.replace(/_/g, '-')}`,
      ready: reasonShown(reason),
      note: 'A notice the product redirects to, opened by its URL.',
    });
  }
  await capHeld(browser, {
    key: 'sign-in-hardware-key',
    route: R.key,
    persona: null,
    path: R.key,
    prepare: async (page) => page.getByLabel('Email').fill(personaEmail('support')),
    submit: (page) => page.getByRole('button', { name: 'Sign in with hardware key' }).click(),
    busy: /Waiting for (the|your hardware) key/,
    match: (url) => url.pathname === '/api/sign-in/hardware-key/options',
    note: 'The busy state while the key is asked: the options request held, then aborted.',
  });
  await cap(browser, {
    key: 'sign-in-hardware-key',
    route: R.key,
    persona: null,
    path: R.key,
    state: 'error',
    variant: 'error-no-credential',
    note: 'A virtual authenticator that holds no credential for the reviewer (its key lives in another browser context): the browser refuses and the page says so.',
    act: async (page) => {
      await addVirtualKey(page);
      await page.getByLabel('Email').fill(personaEmail('reviewer'));
      await page.getByRole('button', { name: 'Sign in with hardware key' }).click();
      await expect(page.locator('[data-slot="alert"], [role="alert"]').filter({ hasText: /Not signed in/ }).first()).toBeVisible({ timeout: 90_000 });
    },
  });

  // '/': only an internal person with no practice and no grant stays there (support).
  await cap(browser, { key: 'home', route: '/', persona: 'support', path: '/', ready: async (page) => expect(page.getByText('No practice to open').first()).toBeVisible(), note: 'The only rendered state of / is its empty state; every other persona is redirected away.' });
  await shellControls(browser, { key: 'home', route: '/', persona: 'support', path: '/', account: true, menu: true });

  // Public pages.
  await cap(browser, { key: 'security', route: '/security', persona: null, path: '/security', note: 'Outside production the two draft legal surfaces show (legal surface awaiting review, hidden in production).' });
  await cap(browser, { key: 'status', route: '/status', persona: null, path: '/status' });
  await cap(browser, { key: 'maintenance', route: '/maintenance', persona: null, path: '/maintenance', note: 'Maintenance off: where a customer lands after maintenance ends. The on state is taken last.' });

  // /request-audit
  const requestForm = async (page: Page, organization: string, email: string): Promise<void> => {
    await page.getByLabel('Your name').fill('Synthetic Contact');
    await page.getByLabel('Work email').fill(email);
    await page.getByLabel('Organization').fill(organization);
    await page.getByLabel('Locations').fill('2');
    await page.getByLabel('Payers you bill').fill('Synthetic Payer One\nSynthetic Payer Two');
    await page.getByLabel('How you bill').selectOption('in_house');
  };
  const tag = randomBytes(4).toString('hex');
  await cap(browser, { key: 'request-audit', route: '/request-audit', persona: null, path: '/request-audit' });
  await cap(browser, {
    key: 'request-audit',
    route: '/request-audit',
    persona: null,
    path: '/request-audit',
    state: 'error',
    note: 'The no-patient-information screen: a calendar-date shape in Organization.',
    act: async (page) => {
      await requestForm(page, 'SYNTHETIC CLINIC 2026-01-01', `refused-${tag}@synthetic.test`);
      await page.getByRole('button', { name: 'Send request' }).click();
      await refused(page);
    },
  });
  await capHeld(browser, {
    key: 'request-audit',
    route: '/request-audit',
    persona: null,
    path: '/request-audit',
    prepare: (page) => requestForm(page, 'SYNTHETIC HELD CLINIC', `held-${tag}@synthetic.test`),
    submit: (page) => page.getByRole('button', { name: 'Send request' }).click(),
    busy: /^Working/,
  });
  await cap(browser, {
    key: 'request-audit',
    route: '/request-audit',
    persona: null,
    path: '/request-audit',
    state: 'interaction:attribution',
    note: 'The billing-firm attribution filled in (not sent).',
    act: async (page) => {
      await requestForm(page, 'SYNTHETIC ATTRIBUTION CLINIC', `attribution-${tag}@synthetic.test`);
      const heard = page.getByLabel('How did you hear about us?');
      await heard.selectOption({ index: await optionIndex(page, 'How did you hear about us?', /billing firm/i) });
      await page.getByLabel('Referring billing firm').fill('SYNTHETIC BILLING PARTNERS');
    },
  });
  await cap(browser, {
    key: 'request-audit',
    route: '/request-audit',
    persona: null,
    path: '/request-audit',
    state: 'interaction:sent',
    widths: [1280],
    note: 'Sent once through the product with synthetic values; it is the new row on /console/prospects.',
    act: async (page) => {
      await requestForm(page, `SYNTHETIC TOUR CLINIC ${tag.toUpperCase()}`, `request-tour-${tag}@synthetic.test`);
      await page.getByRole('button', { name: 'Send request' }).click();
      await expect(page.getByText('Request received')).toBeVisible();
    },
  });
  await cap(browser, { key: 'request-audit', route: '/request-audit', persona: null, path: '/request-audit?sent=1', state: 'interaction:sent', widths: [390], ready: async (page) => expect(page.getByText('Request received')).toBeVisible(), note: 'The sent state by its URL (the page reads only the URL).' });

  // /screening and /screening/results/[resultId]
  await screeningShots(browser);
});

async function mfaShots(browser: Browser): Promise<void> {
  const route = '/sign-in/mfa';
  const base: Omit<Meta, 'variant' | 'state'> = { key: 'sign-in-mfa', route, role: 'billing-manager' };
  if (!['default', 'error', 'loading'].some((variant) => WIDTHS.some((width) => wanted(`sign-in-mfa.${variant}.${String(width)}`) || wanted(`sign-in-mfa.${variant}.1280-dark`)))) return;
  const context = await browser.newContext(DESKTOP_CONTEXT);
  let phone: BrowserContext | undefined;
  try {
    const page = await context.newPage();
    await attempt(['sign-in-mfa.default.1280', 'sign-in-mfa.default.1280-dark', 'sign-in-mfa.default.390', 'sign-in-mfa.error.1280', 'sign-in-mfa.error.390', 'sign-in-mfa.loading.1280', 'sign-in-mfa.loading.390'], route, async () => {
      await enterPassword(page, 'billing-manager');
      await expect(page).toHaveURL(/\/sign-in\/mfa$/);
      await snap(page, { ...base, variant: 'default', state: 'default' }, { dark: true });
      phone = await browser.newContext({ ...PHONE_CONTEXT, storageState: await context.storageState() });
      const small = await phone.newPage();
      await small.goto(route);
      await expect(small.getByLabel('Six-digit code')).toBeVisible();
      await snap(small, { ...base, variant: 'default', state: 'default' });
      for (const view of [page, small]) {
        await attempt([`sign-in-mfa.loading.${String(view.viewportSize()?.width)}`], route, async () => {
          await view.getByLabel('Six-digit code').fill('000000');
          await heldShot(view, { ...base, variant: 'loading', state: 'loading', note: 'The pending submit, held and aborted.' }, { submit: () => view.getByRole('button', { name: 'Sign in', exact: true }).click(), busy: /^Working/, after: 'abort' });
          await view.goto(route);
        });
        await attempt([`sign-in-mfa.error.${String(view.viewportSize()?.width)}`], route, async () => {
          await view.getByLabel('Six-digit code').fill('000000');
          await view.getByRole('button', { name: 'Sign in', exact: true }).click();
          await refused(view, /did not match/);
          await snap(view, { ...base, variant: 'error', state: 'error', note: 'A wrong code (000000).' });
        });
      }
    });
  } finally {
    await phone?.close();
    await context.close();
  }
}

async function invitedShots(browser: Browser): Promise<void> {
  const np = '/sign-in/new-password';
  const en = '/sign-in/enroll';
  const all = [
    ...['default', 'error-mismatch', 'error-policy', 'loading'].flatMap((variant) => WIDTHS.map((width) => `sign-in-new-password.${variant}.${String(width)}`)),
    'sign-in-new-password.default.1280-dark',
    ...['default', 'error', 'loading'].flatMap((variant) => WIDTHS.map((width) => `sign-in-enroll.${variant}.${String(width)}`)),
    'sign-in-enroll.default.1280-dark',
    // UX PR 6 (co-001/ux-sign-in-time; ADR 0081): the kept-email notices and enrolment's warning and closed state.
    ...['step-expired-temporary', 'step-expired-chosen'].flatMap((variant) => WIDTHS.map((width) => `sign-in.${variant}.${String(width)}`)),
    ...['warning', 'closed'].flatMap((variant) => WIDTHS.map((width) => `sign-in-enroll.${variant}.${String(width)}`)),
  ];
  if (!all.some(wanted)) return;
  const npMeta = (variant: string, state: string, note = ''): Meta => ({ key: 'sign-in-new-password', variant, state, route: np, role: 'invited', note });
  const enMeta = (variant: string, state: string, note = ''): Meta => ({ key: 'sign-in-enroll', variant, state, route: en, role: 'invited', note });
  const signInMeta = (variant: string, note: string): Meta => ({ key: 'sign-in', variant, state: `interaction:${variant}`, route: '/sign-in', role: 'invited', note });
  const context = await browser.newContext(DESKTOP_CONTEXT);
  const phonesOpen: BrowserContext[] = [];
  const phoneNow = async (): Promise<Page> => {
    const phone = await browser.newContext({ ...PHONE_CONTEXT, storageState: await context.storageState() });
    phonesOpen.push(phone);
    return phone.newPage();
  };
  const CHOSEN = 'Chosen-Synthetic-Pass-2026!';
  try {
    const page = await context.newPage();
    await attempt(all, np, async () => {
      await enterPassword(page, 'invited');
      await page.waitForURL((url) => url.pathname !== '/sign-in', { timeout: 20_000 }).catch(() => undefined);
      if (!/\/sign-in\/new-password$/.test(page.url())) throw new Error(`the invited persona did not reach ${np} (it chose its password in an earlier run on this database): prepare afresh`);
      await snap(page, npMeta('default', 'default'), { dark: true });
      const small = await phoneNow();
      await small.goto(np);
      await snap(small, npMeta('default', 'default'));
      for (const view of [page, small]) {
        const width = String(view.viewportSize()?.width);
        await attempt([`sign-in-new-password.error-mismatch.${width}`], np, async () => {
          await view.getByLabel('New password', { exact: true }).fill('Synthetic-Pass-One-2026!');
          await view.getByLabel('New password again').fill('Synthetic-Pass-Two-2026!');
          await view.getByRole('button', { name: 'Save password' }).click();
          await refused(view);
          await snap(view, npMeta('error-mismatch', 'error', 'The two passwords differ.'));
        });
        await attempt([`sign-in-new-password.error-policy.${width}`], np, async () => {
          await view.goto(np);
          await view.getByLabel('New password', { exact: true }).fill('syntheticpassword');
          await view.getByLabel('New password again').fill('syntheticpassword');
          await view.getByRole('button', { name: 'Save password' }).click();
          await refused(view, /policy|Not done|Check the fields/);
          await snap(view, npMeta('error-policy', 'error', 'Twelve characters or more that miss the policy’s classes.'));
        });
      }
      // UX PR 6: a closed new-password step, from copies of the browser, so the live step stays for the shots after it.
      for (const width of WIDTHS) {
        await attempt(andDark([`sign-in.step-expired-temporary.${String(width)}`]), '/sign-in', async () => {
          const copy = await browser.newContext({ ...(width === 1280 ? DESKTOP_CONTEXT : PHONE_CONTEXT), storageState: await context.storageState() });
          phonesOpen.push(copy);
          await copy.clearCookies({ name: 'tp_sign_in' });
          const view = await copy.newPage();
          await view.goto(np);
          await expect(view).toHaveURL(/\/sign-in\?reason=step_expired$/);
          await emailKept(view, 'invited');
          await snap(view, signInMeta('step-expired-temporary', 'A new-password step that closed (a copy of the browser with its step cookie gone): the email kept, and the temporary password named.'));
        });
      }
      // Pending: the phone's submit is aborted; the desktop's goes through and moves the account to enrollment.
      await attempt(['sign-in-new-password.loading.390'], np, async () => {
        await small.goto(np);
        await small.getByLabel('New password', { exact: true }).fill(CHOSEN);
        await small.getByLabel('New password again').fill(CHOSEN);
        await heldShot(small, npMeta('loading', 'loading', 'The pending submit, held and aborted.'), { submit: () => small.getByRole('button', { name: 'Save password' }).click(), busy: /^Working/, after: 'abort' });
      });
      await page.goto(np);
      await page.getByLabel('New password', { exact: true }).fill(CHOSEN);
      await page.getByLabel('New password again').fill(CHOSEN);
      await heldShot(page, npMeta('loading', 'loading', 'The pending submit, held, then let through: the password is saved and the account moves to enrollment.'), {
        submit: () => page.getByRole('button', { name: 'Save password' }).click(),
        busy: /^Working/,
        after: 'continue',
      });
      await expect(page).toHaveURL(/\/sign-in\/enroll$/, { timeout: 20_000 });
      await snap(page, enMeta('default', 'default', 'The setup key is a fresh synthetic TOTP secret for the synthetic invited account.'), { dark: true });
      const enrollPhone = await phoneNow();
      await enrollPhone.goto(en);
      await expect(enrollPhone.getByLabel('Six-digit code')).toBeVisible();
      await snap(enrollPhone, enMeta('default', 'default'));
      // UX PR 6: enrolment's warning and closed state on the page's own clock, well inside the step's 3 minutes, which
      // count from the saved password. Before it the step states no limit, and both are skipped saying so. Taken from
      // copies of the browser (as key registration's warning is), so the fake clock, moved minutes ahead (Date and
      // performance.now both), never reaches the live pages the pending and refusal shots below use.
      for (const width of WIDTHS) {
        await attempt(andDark([`sign-in-enroll.warning.${String(width)}`, `sign-in-enroll.closed.${String(width)}`]), en, async () => {
          const copy = await browser.newContext({ ...(width === 1280 ? DESKTOP_CONTEXT : PHONE_CONTEXT), storageState: await context.storageState() });
          try {
            const view = await copy.newPage();
            await view.clock.install();
            await view.goto(en);
            await toStepPhase(view, 'warning');
            await snap(view, enMeta('warning', 'interaction:warning', 'A minute before enrolment closes; the page’s clock moved forward, the server’s real.'));
            await toStepPhase(view, 'closed');
            await snap(view, enMeta('closed', 'interaction:closed', 'Enrolment closed: the setup key no longer works.'));
          } finally {
            await copy.close();
          }
        });
      }
      for (const view of [page, enrollPhone]) {
        const width = String(view.viewportSize()?.width);
        await attempt([`sign-in-enroll.loading.${width}`], en, async () => {
          await view.getByLabel('Six-digit code').fill('000000');
          await heldShot(view, enMeta('loading', 'loading', 'The pending submit, held and aborted.'), { submit: () => view.getByRole('button', { name: /Verify/ }).click(), busy: /^Working/, after: 'abort' });
          await view.goto(en);
        });
        await attempt([`sign-in-enroll.error.${width}`], en, async () => {
          await view.getByLabel('Six-digit code').fill('000000');
          await view.getByRole('button', { name: /Verify/ }).click();
          await refused(view, /did not match/);
          await snap(view, enMeta('error', 'error', 'A wrong code (000000).'));
        });
      }
      // UX PR 6: enrolment closed after the new password was saved: the kept email names the chosen password.
      for (const view of [page, enrollPhone]) {
        const width = String(view.viewportSize()?.width);
        await attempt(andDark([`sign-in.step-expired-chosen.${width}`]), '/sign-in', async () => {
          await view.context().clearCookies({ name: 'tp_sign_in' });
          await view.goto(en);
          await expect(view).toHaveURL(/\/sign-in\?reason=step_expired$/);
          await emailKept(view, 'invited');
          await snap(view, signInMeta('step-expired-chosen', 'Enrolment closed after the new password was saved: the email kept, and the chosen password named.'));
        });
      }
    });
  } finally {
    for (const phone of phonesOpen) await phone.close().catch(() => undefined);
    await context.close();
  }
}

async function registerKeyShots(browser: Browser): Promise<void> {
  const route = '/sign-in/register-key';
  const meta = (variant: string, state: string, role: string, note = ''): Meta => ({ key: 'sign-in-register-key', variant, state, route, role, note });
  const reviewerIds = ['sign-in-register-key.default.1280', 'sign-in-register-key.default.1280-dark', 'sign-in-register-key.default.390', 'sign-in-register-key.loading.1280', 'sign-in-register-key.loading.390'];
  if (reviewerIds.some(wanted) && !desktop.has('reviewer')) {
    if (existsSync(`${AUTH}/reviewer.json`)) {
      for (const id of reviewerIds) skip(id, route, 'the reviewer registered its key in an earlier run on this database (a key registers once per database): prepare afresh to retake');
    } else {
      const context = await browser.newContext(DESKTOP_CONTEXT);
      let phone: BrowserContext | undefined;
      await attempt(reviewerIds, route, async () => {
        const page = await context.newPage();
        await addVirtualKey(page);
        await signInWithTotp(page, 'reviewer');
        await expect(page).toHaveURL(/\/sign-in\/register-key$/);
        await snap(page, meta('default', 'default', 'reviewer'), { dark: true });
        phone = await browser.newContext({ ...PHONE_CONTEXT, storageState: await context.storageState() });
        const small = await phone.newPage();
        await small.goto(route);
        await expect(small.getByRole('button', { name: 'Register hardware key' })).toBeVisible();
        await snap(small, meta('default', 'default', 'reviewer'));
        await attempt(['sign-in-register-key.loading.390'], route, async () => {
          await heldShot(small, meta('loading', 'loading', 'reviewer', 'The busy state while the key answers: the options request held, then aborted.'), {
            submit: () => small.getByRole('button', { name: 'Register hardware key' }).click(),
            busy: /Waiting for (the|your hardware) key/,
            after: 'abort',
            match: (url) => url.pathname === '/api/sign-in/register-key/options',
          });
        });
        await heldShot(page, meta('loading', 'loading', 'reviewer', 'The busy state while the key answers: the options request held, then let through (the key registers).'), {
          submit: () => page.getByRole('button', { name: 'Register hardware key' }).click(),
          busy: /Waiting for (the|your hardware) key/,
          after: 'continue',
          match: (url) => url.pathname === '/api/sign-in/register-key/options',
        });
        await expect(page).toHaveURL(/\/sign-in\/hardware-key\?reason=key_registered$/, { timeout: 30_000 });
        await signInWithKey(page, 'reviewer');
        keyPages.set('reviewer', page);
        await context.storageState({ path: `${AUTH}/reviewer.json` });
        desktop.set('reviewer', context);
      });
      await phone?.close();
      if (!desktop.has('reviewer')) await context.close();
    }
  }
  // The refusal when no authenticator answers: support-expiry (used by no populate spec) in a context with no virtual key.
  const errorIds = ['sign-in-register-key.error.1280', 'sign-in-register-key.error.390'];
  // UX PR 6 (co-001/ux-sign-in-time; ADR 0081): the warning two minutes before the 15, from copies of support-expiry's browser.
  const warnIds = ['sign-in-register-key.warning.1280', 'sign-in-register-key.warning.390'];
  if (![...errorIds, ...warnIds].some(wanted)) return;
  const bare = await browser.newContext(DESKTOP_CONTEXT);
  let barePhone: BrowserContext | undefined;
  try {
    await attempt([...errorIds, ...warnIds], route, async () => {
      const page = await bare.newPage();
      await signInWithTotp(page, 'support-expiry');
      if (!/\/sign-in\/register-key$/.test(page.url())) throw new Error(`support-expiry did not reach ${route} (its key was registered earlier on this database)`);
      for (const width of WIDTHS) {
        await attempt(andDark([`sign-in-register-key.warning.${String(width)}`]), route, async () => {
          const copy = await browser.newContext({ ...(width === 1280 ? DESKTOP_CONTEXT : PHONE_CONTEXT), storageState: await bare.storageState() });
          try {
            const view = await copy.newPage();
            await view.clock.install();
            await view.goto(route);
            await toStepPhase(view, 'warning');
            await snap(view, meta('warning', 'interaction:warning', 'support-expiry', 'Two minutes before key registration’s 15 minutes end; the page’s clock moved forward, the server’s real. The copy registers nothing.'));
          } finally {
            await copy.close();
          }
        });
      }
      barePhone = await browser.newContext({ ...PHONE_CONTEXT, storageState: await bare.storageState() });
      const small = await barePhone.newPage();
      for (const view of [page, small]) {
        await attempt([`sign-in-register-key.error.${String(view.viewportSize()?.width)}`], route, async () => {
          if (view !== page) await view.goto(route);
          // With no authenticator at all, Chrome waits out the ceremony's whole timeout (over 90 s in the first run). A
          // virtual key that cannot verify the user cannot meet the server's userVerification: 'required', so the
          // browser refuses at once: the same refusal a person sees when their key does not answer.
          const cdp = await view.context().newCDPSession(view);
          await cdp.send('WebAuthn.enable');
          await cdp.send('WebAuthn.addVirtualAuthenticator', {
            options: { protocol: 'ctap2', transport: 'usb', hasResidentKey: true, hasUserVerification: false, isUserVerified: false, automaticPresenceSimulation: true },
          });
          await view.getByRole('button', { name: 'Register hardware key' }).click();
          await expect(view.locator('[data-slot="alert"], [role="alert"]').filter({ hasText: /Not signed in|Not registered/ }).first()).toBeVisible({ timeout: 60_000 });
          await snap(view, meta('error', 'error', 'support-expiry', 'The key does not answer the ceremony (a virtual key that cannot verify the user, so the browser refuses): the refusal and its next step.'));
        });
      }
    });
  } finally {
    await barePhone?.close();
    await bare.close();
  }
}

async function screeningShots(browser: Browser): Promise<void> {
  const route = '/screening';
  const tag = randomBytes(4).toString('hex');
  const fill = async (page: Page, options: { name?: string; zip?: string; email: string; file: Buffer }): Promise<void> => {
    await page.getByLabel('Practice name').fill(options.name ?? 'SYNTHETIC SCREENING CLINIC');
    await page.getByLabel('State').selectOption('MN');
    await page.getByLabel('ZIP code', { exact: true }).fill(options.zip ?? SCREENING_ZIP);
    await page.getByLabel('Work email').fill(options.email);
    await page.getByLabel('How did you hear about us?').selectOption('billing_firm');
    await page.getByLabel('Referring billing firm').fill('SYNTHETIC BILLING PARTNERS');
    await page.getByLabel('File to screen').setInputFiles({ name: 'totals.csv', mimeType: 'text/csv', buffer: options.file });
  };
  const clean = (): Buffer => screeningCsv([...CLEAN_ROWS, ...SMALL_ROWS, ...OUTSIDE_ROWS]);
  const ready = async (page: Page): Promise<void> => expect(page.getByRole('heading', { level: 1 })).toHaveText('A free screening of your allowed amounts');
  await cap(browser, { key: 'screening', route, persona: null, path: route, ready, note: 'Legacy tour shots 20-screening (1280) and 29-phone-screening (390).' });
  await cap(browser, {
    key: 'screening',
    route,
    persona: null,
    path: route,
    ready,
    state: 'interaction:file-ready',
    note: 'The SYNTHETIC fixture file chosen: file-ready, left-out and outside-content lines (legacy tour shot 21-screening-form).',
    act: async (page, width) => {
      await fill(page, { email: `screening-ready-${tag}-${String(width)}@clinic-e2e.synthetic.test`, file: clean() });
      await expect(page.locator('[data-state="file-ready"]')).toBeVisible();
    },
  });
  for (const [variant, file, note] of [
    ['error-member-id', memberIdCsv, 'Refused in the browser: a member-ID column (SYNTHETIC values); nothing is sent.'],
    ['error-dos', dateOfServiceCsv, 'Refused in the browser: a date-of-service column; nothing is sent.'],
  ] as const) {
    await cap(browser, {
      key: 'screening',
      route,
      persona: null,
      path: route,
      ready,
      state: 'error',
      variant,
      note,
      act: async (page, width) => {
        await fill(page, { email: `screening-refused-${tag}-${String(width)}@clinic-e2e.synthetic.test`, file: file() });
        await expect(page.locator('[data-state="file-refused"]')).toBeVisible();
      },
    });
  }
  for (const [variant, options, note] of [
    ['error-zip', { zip: SCREENING_ZIP_PLUS_FOUR }, 'Refused by the server: a ZIP code whose ZIP+4 list is not loaded.'],
    ['error-no-phi', { name: 'SYNTHETIC CLINIC 2026-01-01' }, 'Refused by the server: a date shape in Practice name (the no-patient-information screen).'],
  ] as const) {
    await cap(browser, {
      key: 'screening',
      route,
      persona: null,
      path: route,
      ready,
      state: 'error',
      variant,
      note,
      act: async (page, width) => {
        await fill(page, { ...options, email: `screening-${variant}-${tag}-${String(width)}@clinic-e2e.synthetic.test`, file: clean() });
        await page.getByRole('button', { name: 'Screen the file' }).click();
        await refused(page);
      },
    });
  }
  await capHeld(browser, {
    key: 'screening',
    route,
    persona: null,
    path: route,
    prepare: (page) => fill(page, { email: `screening-held-${tag}@clinic-e2e.synthetic.test`, file: clean() }),
    submit: (page) => page.getByRole('button', { name: 'Screen the file' }).click(),
    busy: /^Sending/,
  });
  notReached('screening', 'loading-reading', route, "'Reading the file in this browser...' is a FileReader step inside the browser that page.route cannot hold; with the small fixture it lasts milliseconds");

  // The one real send of the run, then the result its email links to.
  const resultIds = [
    ...['sent-soon', 'sent-minutes', 'sent-waiting', 'sent-sent'].flatMap((variant) => WIDTHS.map((width) => `screening.${variant}.${String(width)}`)),
    ...['default', 'error-name', 'loading', 'converted'].flatMap((variant) => WIDTHS.map((width) => `screening-result.${variant}.${String(width)}`)),
    'screening-result.default.1280-dark',
  ];
  const contact = `screening-tour-${tag}@clinic-e2e.synthetic.test`;
  if (resultIds.some(wanted)) {
    emails.screening = contact;
    const started = await startLocalScreeningConsumer();
    consumer = started;
    const context = await browser.newContext(DESKTOP_CONTEXT);
    try {
      const page = await context.newPage();
      let link = '';
      await attempt(resultIds, route, async () => {
        await page.goto(route);
        await fill(page, { email: contact, file: clean() });
        await expect(page.locator('[data-state="file-ready"]')).toBeVisible();
        await page.getByRole('button', { name: 'Screen the file' }).click();
        await expect(page).toHaveURL(/\/screening\?sent=1/);
        await snap(page, { key: 'screening', variant: 'sent-soon', state: 'interaction:sent-soon', route, role: 'public', note: 'The one real send of the run (legacy probe screening-sent).' });
        await expect.poll(() => outboxFor(contact).length, { timeout: 120_000, intervals: [500] }).toBe(1);
        const [message] = outboxFor(contact);
        link = new URL(resultLinkIn(message as NonNullable<typeof message>)).pathname;
      });
      for (const wait of ['soon', 'minutes', 'waiting', 'sent']) {
        await cap(browser, {
          key: 'screening',
          route,
          persona: null,
          path: `/screening?sent=1&wait=${wait}`,
          state: `interaction:sent-${wait}`,
          widths: wait === 'soon' ? [390] : WIDTHS,
          ready: async (p) => expect(p.locator('[data-state="sent"]').first()).toBeVisible(),
          note: 'The sent alert’s wait wording, by the URL the product redirects to.',
        });
      }
      if (link !== '') {
        const resultRoute = '/screening/results/[resultId]';
        const readyResult = async (p: Page): Promise<void> => expect(p.getByRole('heading', { level: 1, name: 'Your free screening' })).toBeVisible();
        await cap(browser, { key: 'screening-result', route: resultRoute, persona: null, path: link, ready: readyResult, note: 'The emailed link of the run’s one send (legacy tour shot 22-screening-result).' });
        await cap(browser, {
          key: 'screening-result',
          route: resultRoute,
          persona: null,
          path: link,
          ready: readyResult,
          state: 'error',
          variant: 'error-name',
          note: 'The convert form refused: Your name as spaces only.',
          act: async (p) => {
            await p.getByLabel('Your name').fill('   ');
            await p.getByLabel('Locations').fill('2');
            await p.getByLabel('Payers you bill').fill('SYNTHETIC PAYER A');
            await p.getByRole('button', { name: 'Request an audit' }).click();
            await refused(p);
          },
        });
        await capHeld(browser, {
          key: 'screening-result',
          route: resultRoute,
          persona: null,
          path: link,
          prepare: async (p) => {
            await p.getByLabel('Your name').fill('SYNTHETIC CONTACT');
            await p.getByLabel('Locations').fill('2');
            await p.getByLabel('Payers you bill').fill('SYNTHETIC PAYER A\nSYNTHETIC PAYER B');
          },
          submit: (p) => p.getByRole('button', { name: 'Request an audit' }).click(),
          busy: /^Working/,
        });
        await cap(browser, {
          key: 'screening-result',
          route: resultRoute,
          persona: null,
          path: link,
          ready: readyResult,
          state: 'interaction:converted',
          widths: [1280],
          note: 'Converted once through the product (synthetic values): the audit request it records is a row on /console/prospects.',
          act: async (p) => {
            await p.getByLabel('Your name').fill('SYNTHETIC CONTACT');
            await p.getByLabel('Locations').fill('2');
            await p.getByLabel('Payers you bill').fill('SYNTHETIC PAYER A\nSYNTHETIC PAYER B');
            await p.getByRole('button', { name: 'Request an audit' }).click();
            await expect(p.locator('[data-state="requested"]')).toBeVisible();
          },
        });
        await cap(browser, { key: 'screening-result', route: resultRoute, persona: null, path: link, ready: readyResult, state: 'interaction:converted', widths: [390], note: 'The same result reopened after its conversion: it says an audit was requested.' });
      }
    } finally {
      await context.close();
      await started.close().catch(() => undefined);
      consumer = undefined;
    }
  }
  await cap(browser, {
    key: 'screening-result',
    route: '/screening/results/[resultId]',
    persona: null,
    path: `/screening/results/${'a'.repeat(32)}`,
    state: 'not-found',
    ready: async (page) => expect(page.locator('[data-state="screening-not-found"]').first()).toBeVisible(),
    note: 'The screening result’s own not-found page (an unissued 32-letter token).',
  });
  notReached('screening', 'closed', route, "'Screening is not open yet' needs no release or no approved split; prepare.ts always loads release 900001 and approves the split");
  notReached('screening-result', 'pager', '/screening/results/[resultId]', 'the anomalies pager needs more than 50 groups; no repository fixture has that many and rows are never invented');
}

// ---------------------------------------------------------------------------------------------------------------------
test('console and account', async ({ browser }) => {
  test.setTimeout(40 * 60_000);
  const A = 'platform-admin';
  groupMade = (await one("SELECT id FROM organization WHERE name = 'SYNTHETIC CONSOLE EMPTY GROUP'")) !== '';

  // The reviewer's support grants, opened on screen by the platform administrator (route map, "How to use it").
  // p.support-access.empty shoots the newest of them (SYN-TOUR-4 on LAYOUT, which nothing reads before the writes test).
  if (['console.support', 'p.packet-review', 'p.report-review', 'p.support-access.empty'].some(wantedPrefix)) {
    const page = await (await desktopOf(browser, A)).newPage();
    try {
      for (const [index, practiceKey] of (['packets', 'deadlines', 'reports', 'layout'] as const).entries()) {
        const id = ids[practiceKey] ?? '';
        if (id === '') continue;
        const ticket = `SYN-TOUR-${String(index + 1)}`;
        if ((await one("SELECT id FROM support_grant WHERE practice_id = $1 AND ticket = $2 AND expires_at > now()", [id, ticket])) !== '') continue;
        await go(page, A, '/console/support');
        const name = await one('SELECT name AS id FROM practice WHERE id = $1', [id]);
        await page.getByLabel('Practice').selectOption({ label: name });
        await page.getByLabel('Support engineer or contract specialist').selectOption({ label: `${personaEmail('reviewer')} (Reimbursement reviewer)` });
        await page.getByLabel('Ticket').fill(ticket);
        await page.getByLabel('Reason').fill('SYNTHETIC SCREEN TOUR');
        await press(page.getByRole('button', { name: 'Create support grant' }));
        await expect(page.getByRole('table', { name: 'Support grants' }).locator(`tr[data-ticket="${ticket}"]`).first()).toBeVisible();
        log(`GRANT ${ticket} reviewer on ${practiceKey}`);
      }
    } catch (error) {
      log(`GRANT failed (the reviewer's shots will say why): ${reasonOf(error)}`);
    } finally {
      await page.close();
    }
  }

  // /console/organizations (the console's landing)
  const orgs = '/console/organizations';
  await cap(browser, { key: 'console.organizations', route: orgs, persona: A, path: orgs, note: 'The console’s landing: / as the platform administrator redirects here (legacy tour shot 23-console-home).' });
  await cap(browser, {
    key: 'console.organizations',
    route: orgs,
    persona: A,
    path: orgs,
    state: 'error',
    note: 'Create organization with a name of spaces only (creates nothing).',
    act: async (page) => {
      await page.getByLabel('Name', { exact: true }).fill('   ');
      await press(page.getByRole('button', { name: 'Create organization' }));
      await refused(page);
    },
  });
  await cap(browser, { key: 'console.organizations', route: orgs, persona: 'contract-specialist', path: orgs, state: 'error', variant: 'error-forbidden', ready: denied });
  await shellControls(browser, { key: 'console.organizations', route: orgs, persona: A, path: orgs, account: true, menu: true });
  notReached('console.organizations', 'empty', orgs, 'the seed always holds four organizations, so No organizations yet never shows');

  // /console/organizations/[organizationId]
  const org = '/console/organizations/[organizationId]';
  await cap(browser, { key: 'console.organization', route: org, persona: A, path: () => `/console/organizations/${need('group')}`, note: 'SYNTHETIC THERAPY GROUP: a group’s six cards.' });
  await cap(browser, { key: 'console.organization', route: org, persona: A, path: () => `/console/organizations/${need('internal')}`, state: 'empty', note: 'SYNTHETIC COMPANY (INTERNAL): no agreements, no grants, no invitations.' });
  await cap(browser, { key: 'console.organization', route: org, persona: A, path: () => `/console/organizations/${need('firm')}`, state: 'interaction:firm', note: 'A firm’s layout (no Practices card, firm roles).' });
  await notice(browser, { key: 'console.organization', route: org, persona: A, path: () => `/console/organizations/${need('group')}?created=${need('north')}`, name: 'created' });
  await cap(browser, {
    key: 'console.organization',
    route: org,
    persona: A,
    path: () => `/console/organizations/${need('group')}`,
    state: 'error',
    note: 'An internal address invited to a practice group (refused before anything is sent).',
    act: async (page) => {
      await page.getByLabel('Email', { exact: true }).first().fill(personaEmail('support'));
      await press(page.getByRole('button', { name: 'Send invitation' }));
      await refused(page);
    },
  });
  await shellControls(browser, { key: 'console.organization', route: org, persona: A, path: () => `/console/organizations/${need('group')}`, menu: true });
  notReached('console.organization', 'locked-member', org, "the locked badge needs sign-in.spec.ts's ten-failure test on lockout (not a populate spec; the tour's own lockout lock comes last)");

  // /console/practices/[practiceId]
  const cp = '/console/practices/[practiceId]';
  await cap(browser, { key: 'console.practice', route: cp, persona: A, path: () => `/console/practices/${need('layout')}`, note: 'SYNTHETIC OTHER PRACTICE LAYOUT (legacy tour shot 24-console-practice).' });
  await cap(browser, { key: 'console.practice', route: cp, persona: A, path: () => `/console/practices/${need('north')}`, state: 'empty', note: 'A seeded practice with no settings: the blank form.' });
  await capLoading(browser, { key: 'console.practice', route: cp, persona: A, from: () => `/console/organizations/${need('otherGroup')}`, link: () => `a[href="/console/practices/${need('layout')}"]` });
  await cap(browser, {
    key: 'console.practice',
    route: cp,
    persona: A,
    path: () => `/console/practices/${need('north')}`,
    state: 'error',
    note: 'Pricing location with a four-digit ZIP (refused before any write).',
    act: async (page) => {
      await page.getByLabel('Billing ZIP (ZIP+4 if Medicare needs one)').fill('0001');
      await press(page.getByRole('button', { name: 'Save the location' }));
      await refused(page);
    },
  });
  await notice(browser, { key: 'console.practice', route: cp, persona: A, path: () => `/console/practices/${need('layout')}?saved=1`, name: 'saved' });
  await notice(browser, { key: 'console.practice', route: cp, persona: A, path: () => `/console/practices/${need('layout')}?location=saved`, name: 'location-saved' });

  // /console/prospects (rows from the public request and the screening's conversion above)
  const pr = '/console/prospects';
  await cap(browser, { key: 'console.prospects', route: pr, persona: A, path: pr, note: 'New requests: the tour’s own /request-audit send and the screening’s conversion.' });
  await cap(browser, { key: 'console.prospects', route: pr, persona: A, path: `${pr}?status=contacted`, state: 'empty' });
  await cap(browser, { key: 'console.prospects', route: pr, persona: A, path: `${pr}?status=all`, state: 'interaction:all' });
  notReached('console.prospects', 'declined-select-open', pr, "a native select's open list is drawn by the browser outside the page, so a screenshot cannot show it");

  // /console/rule-releases
  const rr = '/console/rule-releases';
  await cap(browser, { key: 'console.rule-releases', route: rr, persona: A, path: rr, note: 'The tour server has no content checkout (CONTENT_ROOT), so the drafts card says so.' });
  await capLoading(browser, { key: 'console.rule-releases', route: rr, persona: A, from: () => orgs, link: () => `a[href="${rr}"]` });
  await cap(browser, { key: 'console.rule-releases', route: rr, persona: A, path: rr, state: 'interaction:notes-open', act: async (page) => page.locator('summary').filter({ hasText: 'RELEASE.md' }).first().click() });
  await cap(browser, { key: 'console.rule-releases', route: rr, persona: A, path: `${rr}?release=900001`, state: 'interaction:release' });
  await notice(browser, { key: 'console.rule-releases', route: rr, persona: A, path: () => `${rr}?prepared=900002`, name: 'prepared' });
  notReached('console.rule-releases', 'empty', rr, "'No practice has a complete run' shows only before populate, and 'No release is published' never (prepare.ts loads 900001)");

  // /console/billing
  const cb = '/console/billing';
  await cap(browser, { key: 'console.billing', route: cb, persona: A, path: cb });
  await capLoading(browser, { key: 'console.billing', route: cb, persona: A, from: () => orgs, link: () => `a[href="${cb}"]` });
  await cap(browser, {
    key: 'console.billing',
    route: cb,
    persona: A,
    path: cb,
    state: 'error',
    note: 'An audit invoice for the firm, which has no payment method (refused; no invoice).',
    act: async (page) => {
      await page.getByLabel('Organization').selectOption({ label: 'SYNTHETIC BILLING FIRM' });
      await press(page.getByRole('button', { name: 'Issue audit invoice' }));
      await refused(page);
    },
  });
  notReached('console.billing', 'empty', cb, 'the seed always has three customer organizations');

  // /console/compliance
  const cc = '/console/compliance';
  await cap(browser, { key: 'console.compliance', route: cc, persona: A, path: cc, note: "Records kept reads 'Nothing recorded yet' (its empty state) inside this page." });
  await cap(browser, {
    key: 'console.compliance',
    route: cc,
    persona: A,
    path: cc,
    state: 'error',
    note: 'Evidence dated in the future (refused; nothing recorded).',
    act: async (page) => {
      await page.getByLabel('What', { exact: true }).selectOption({ index: await optionIndex(page, 'What', /Policy approved/i) });
      await page.getByLabel('Policy (for an approval)').selectOption({ index: 1 });
      await page.getByLabel('Date it happened').fill('2030-01-01');
      await page.getByLabel('Document reference').fill('records:synthetic-refused');
      await page.getByLabel('SHA-256').fill('a'.repeat(64));
      await press(page.getByRole('button', { name: 'Record', exact: true }));
      await refused(page);
    },
  });
  await notice(browser, { key: 'console.compliance', route: cc, persona: A, path: () => `${cc}?sent=tp-compliance-evidence-20261025000000-000000000000.json`, name: 'sent' });

  // /console/models
  const cm = '/console/models';
  await cap(browser, { key: 'console.models', route: cm, persona: A, path: cm, note: 'No model flag is set (its empty state); the global kill switch is never used in a capture.' });
  await cap(browser, {
    key: 'console.models',
    route: cm,
    persona: A,
    path: cm,
    state: 'error',
    note: 'A daily budget written in words, "5 dollars", for Everyone (refused: the budget is dollars and cents such as 5.00; nothing set).',
    act: async (page) => {
      // Since the budget became dollars (by e908c21), "5.00" is accepted and set a global budget (2026-10-27, the PR #74
      // before run, undone on that synthetic database): the value is now one the form refuses on every ref.
      const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Set the flag' }) });
      await form.getByLabel('Flag', { exact: true }).selectOption({ index: await optionIndex(page, /^Flag$/, /budget/i) });
      await form.getByLabel('Applies to', { exact: true }).selectOption({ index: await optionIndex(page, /^Applies to$/, /Everyone/) });
      await form.getByLabel('Value', { exact: true }).fill('5 dollars');
      await press(form.getByRole('button', { name: 'Set the flag' }));
      await refused(page);
    },
  });
  await notice(browser, { key: 'console.models', route: cm, persona: A, path: () => `${cm}?notice=set`, name: 'notice' });
  notReached('console.models', 'populated', cm, 'flag and spend rows need models.spec.ts (not in the populate set)');

  // /console/status (maintenance on is taken last)
  const cs = '/console/status';
  await cap(browser, { key: 'console.status', route: cs, persona: A, path: cs, note: 'No incident (the card holds only the form); maintenance off.' });
  await cap(browser, {
    key: 'console.status',
    route: cs,
    persona: A,
    path: cs,
    state: 'error',
    note: 'Open incident with no component ticked (refused; nothing opened).',
    act: async (page) => {
      await page.getByLabel('Title').fill('SYNTHETIC STATUS CHECK');
      await page.getByLabel('First update').fill('SYNTHETIC CHECK');
      await press(page.getByRole('button', { name: 'Open incident' }));
      await refused(page);
    },
  });
  await cap(browser, {
    key: 'console.status',
    route: cs,
    persona: A,
    path: cs,
    state: 'error',
    variant: 'error-row',
    note: 'The first component’s status row (a one-line flex form) refused: its CSRF token altered on the page, so the page is out of date and nothing is set. Its Status select offers only valid choices, so no field of the row can be refused by a person.',
    act: async (page) => {
      const row = page.getByRole('table', { name: 'Components' }).locator('form').first();
      await staleToken(row);
      await press(row.getByRole('button', { name: 'Set', exact: true }));
      await refused(page, STALE);
    },
  });
  notReached('console.status', 'incident', cs, 'an open incident is an optional operator write that also changes /status; not taken');

  // /console/support
  const su = '/console/support';
  await cap(browser, { key: 'console.support', route: su, persona: A, path: su, note: 'The journeys’ grants and the tour’s reviewer grants (SYN-TOUR-*).' });
  await cap(browser, {
    key: 'console.support',
    route: su,
    persona: A,
    path: su,
    state: 'error',
    note: 'A reason of spaces only (refused; no grant).',
    act: async (page) => {
      await page.getByLabel('Ticket').fill('SYN-REFUSED-1');
      await page.getByLabel('Reason').fill('   ');
      await press(page.getByRole('button', { name: 'Create support grant' }));
      await refused(page);
    },
  });
  await shellControls(browser, { key: 'console.support', route: su, persona: A, path: su, menu: true });
  notReached('console.support', 'empty', su, "'No support grants' shows only before populate; the journeys' grants always fill the table");

  // /console/terms
  const ct = '/console/terms';
  await cap(browser, { key: 'console.terms', route: ct, persona: A, path: ct, note: 'A new version is never published in a capture (it would send every customer to /terms).' });
  await cap(browser, {
    key: 'console.terms',
    route: ct,
    persona: A,
    path: ct,
    state: 'error',
    note: 'A version name with a space (refused by the field check; nothing published).',
    act: async (page) => {
      await page.getByLabel('Version', { exact: true }).fill('2026 11');
      await page.getByLabel('Document reference').fill('terms/synthetic-refused');
      await page.getByLabel('SHA-256').fill('a'.repeat(64));
      await press(page.getByRole('button', { name: 'Publish version' }));
      await refused(page);
    },
  });
  notReached('console.terms', 'empty', ct, 'the seed always publishes synthetic-2026-10');

  // /support (a customer's), and the ticket it sends, which is /console/tickets' row.
  const sp = '/support';
  await cap(browser, { key: 'support', route: sp, persona: 'billing-manager', path: '/support?from=remittances' });
  await cap(browser, {
    key: 'support',
    route: sp,
    persona: 'billing-manager',
    path: '/support?from=remittances',
    state: 'error',
    note: 'The no-patient-information screen: the words "date of birth" in Subject (nothing sent).',
    act: async (page) => {
      await page.getByLabel('Subject').fill('A question about the date of birth column');
      await page.getByLabel('What happened, and what you expected').fill('SYNTHETIC CHECK');
      await press(page.getByRole('button', { name: 'Open ticket' }));
      await refused(page);
    },
  });
  // A dropped connection and a page out of date, with the form filled (co-001/ux-forms, design 10.1; the forms journey's
  // support steps): nothing reaches the server, or the server refuses before any write.
  const ticketDraft = async (page: Page): Promise<void> => {
    await page.getByLabel('Subject').fill('SYNTHETIC A QUESTION ABOUT THE STATEMENT');
    await page.getByLabel('What happened, and what you expected').fill('SYNTHETIC CHECK the statement page');
  };
  await cap(browser, {
    key: 'support',
    route: sp,
    persona: 'billing-manager',
    path: '/support?from=remittances',
    state: 'error',
    variant: 'error-unconfirmed',
    note: 'The connection dropped before an answer came back: the post aborted by page.route as a lost connection (nothing reached the server).',
    act: async (page) => {
      await ticketDraft(page);
      const post = (url: URL): boolean => url.pathname === '/support';
      const drop = async (route: Route): Promise<void> => {
        if (route.request().method() === 'POST') await route.abort('internetdisconnected').catch(() => undefined);
        else await route.continue().catch(() => undefined);
      };
      await page.route(post, drop);
      try {
        await press(page.getByRole('button', { name: 'Open ticket' }));
        // From co-001/ux-forms the form says "Not confirmed" and keeps what was typed; before it, the error page shows.
        await expect(page.getByText(/^(Not confirmed|Something went wrong)$/).first()).toBeVisible({ timeout: 15_000 });
      } finally {
        await page.unroute(post, drop).catch(() => undefined);
      }
    },
  });
  await cap(browser, {
    key: 'support',
    route: sp,
    persona: 'billing-manager',
    path: '/support?from=remittances',
    state: 'error',
    variant: 'error-stale',
    note: 'A page out of date: the form’s CSRF token altered on the page, so the server refuses before any write.',
    act: async (page) => {
      await ticketDraft(page);
      await staleToken(page.locator('form').filter({ has: page.getByRole('button', { name: 'Open ticket' }) }));
      await press(page.getByRole('button', { name: 'Open ticket' }));
      await refused(page, STALE);
    },
  });
  await capHeld(browser, {
    key: 'support',
    route: sp,
    persona: 'billing-manager',
    path: '/support?from=remittances',
    prepare: async (page) => {
      await page.getByLabel('Subject').fill('SYNTHETIC HELD TICKET');
      await page.getByLabel('What happened, and what you expected').fill('SYNTHETIC CHECK');
    },
    submit: (page) => page.getByRole('button', { name: 'Open ticket' }).click(),
    busy: /^Working/,
  });
  let ticketUrl = '';
  await cap(browser, {
    key: 'support',
    route: sp,
    persona: 'remittances-viewer',
    path: '/support?from=remittances',
    state: 'interaction:ticket-opened',
    widths: [1280],
    note: 'A ticket opened through the product as remittances-viewer (the wording onboarding.spec.ts uses); it is /console/tickets’ row.',
    act: async (page) => {
      await page.getByLabel('Subject').fill('Where is the receipt?');
      await page.getByLabel('What happened, and what you expected').fill('I uploaded a file and want its receipt.');
      await press(page.getByRole('button', { name: 'Open ticket' }));
      await expect(page.getByText(/Ticket \d+ opened/)).toBeVisible();
      ticketUrl = shown(page);
    },
  });
  await cap(browser, { key: 'support', route: sp, persona: 'remittances-viewer', path: () => ticketUrl || '/support?from=remittances', state: 'interaction:ticket-opened', widths: [390], note: 'The same page at 390 px after the ticket.' });
  await shellControls(browser, { key: 'support', route: sp, persona: 'billing-manager', path: '/support?from=remittances', account: true, menu: true });

  // /console/tickets (the support desk)
  const tk = '/console/tickets';
  await cap(browser, { key: 'console.tickets', route: tk, persona: 'support', path: tk, note: 'The ticket the tour opened on /support.' });
  await cap(browser, { key: 'console.tickets', route: tk, persona: 'support', path: `${tk}?status=answered`, state: 'empty' });
  await cap(browser, { key: 'console.tickets', route: tk, persona: 'support', path: `${tk}?status=all`, state: 'interaction:all' });

  // /console/screening and /console/specialist-queue (the contract specialist's)
  const sc = '/console/screening';
  const CS = 'contract-specialist';
  await cap(browser, { key: 'console.screening', route: sc, persona: CS, path: sc });
  await cap(browser, {
    key: 'console.screening',
    route: sc,
    persona: CS,
    path: sc,
    state: 'error',
    note: 'Place of service 22 typed as non-facility too: the live list of problems (nothing submitted).',
    act: async (page) => {
      const field = page.getByLabel(/Non-facility places of service/);
      await field.fill(`${await field.inputValue()} 22`);
      await expect(page.locator('[data-state="split-problems"]').first()).toBeVisible();
    },
  });
  await notice(browser, { key: 'console.screening', route: sc, persona: CS, path: () => `${sc}?approved=1`, name: 'approved' });
  await cap(browser, { key: 'console.screening', route: sc, persona: A, path: sc, state: 'error', variant: 'error-forbidden', ready: denied });
  notReached('console.screening', 'empty', sc, 'prepare.ts approves the split before any spec, so No split approved yet never shows');
  const sq = '/console/specialist-queue';
  await cap(browser, { key: 'console.specialist-queue', route: sq, persona: CS, path: sq, note: 'Journey practices with open SYN-JOURNEY-1 grants.' });
  await capLoading(browser, { key: 'console.specialist-queue', route: sq, persona: CS, from: () => sc, link: () => `a[href="${sq}"]` });
  await cap(browser, { key: 'console.specialist-queue', route: sq, persona: CS, path: `${sq}?all=1`, state: 'interaction:all' });
  await cap(browser, { key: 'console.specialist-queue', route: sq, persona: A, path: sq, state: 'error', variant: 'error-forbidden', ready: denied });
  notReached('console.specialist-queue', 'empty', sq, "'Nothing waiting' shows only on a fresh prepare before populate (the journeys give the specialist grants and work)");

  // Account pages
  const dv = '/account/devices';
  await cap(browser, { key: 'account.devices', route: dv, persona: 'practice-admin', path: dv });
  await cap(browser, { key: 'account.devices', route: dv, persona: A, path: dv, state: 'interaction:internal-shell', note: 'The same page in the internal shell.' });
  notReached('account.devices', 'empty', dv, 'the session that opens the page is itself a device, so No devices yet never shows');
  const nt = '/account/notifications';
  await cap(browser, { key: 'account.notifications', route: nt, persona: 'billing-manager', path: nt, note: 'Both boxes ticked: no persona has saved preferences (the default and only seeded state).' });
  await capLoading(browser, { key: 'account.notifications', route: nt, persona: 'billing-manager', from: () => dv, link: () => `a[href="${nt}"]` });
  await notice(browser, { key: 'account.notifications', route: nt, persona: 'billing-manager', path: () => `${nt}?saved=1`, name: 'saved' });
  await cap(browser, { key: 'account.notifications', route: nt, persona: A, path: nt, state: 'interaction:internal-shell', note: 'The same page in the internal shell.' });

  // Billing (organization administrators)
  const sb = '/settings/billing';
  await cap(browser, { key: 'settings.billing', route: sb, persona: 'practice-admin', path: sb });
  await cap(browser, { key: 'settings.billing', route: sb, persona: 'billing-manager', path: sb, state: 'empty', note: 'A person who administers no organization.' });
  await capLoading(browser, { key: 'settings.billing', route: sb, persona: 'practice-admin', from: () => dv, link: () => `a[href="${sb}"]` });
  await cap(browser, { key: 'settings.billing', route: sb, persona: 'firm-principal', path: sb, state: 'interaction:firm', note: 'The firm principal’s single card.' });
  const sbo = '/settings/billing/[organizationId]';
  await cap(browser, { key: 'settings.billing-org', route: sbo, persona: 'practice-admin', path: () => `/settings/billing/${need('group')}`, note: 'After billing.spec.ts: test ACH, monthly plan, a paid invoice (legacy tour shot 25-billing).' });
  await cap(browser, { key: 'settings.billing-org', route: sbo, persona: 'other-admin', path: () => `/settings/billing/${need('otherGroup')}`, state: 'empty' });
  await capLoading(browser, { key: 'settings.billing-org', route: sbo, persona: 'practice-admin', from: () => sb, link: () => `a[href="/settings/billing/${need('group')}"]` });
  await cap(browser, {
    key: 'settings.billing-org',
    route: sbo,
    persona: 'other-admin',
    path: () => `/settings/billing/${need('otherGroup')}`,
    state: 'error',
    note: 'A five-digit routing number (refused before the handler; nothing added).',
    act: async (page) => {
      await page.getByLabel('Routing number').fill('12345');
      await press(page.getByRole('button', { name: 'Add test bank account (ACH)' }));
      await refused(page);
    },
  });
  await cap(browser, { key: 'settings.billing-org', route: sbo, persona: 'billing-manager', path: () => `/settings/billing/${need('group')}`, state: 'error', variant: 'error-forbidden', ready: async (page) => expect(page.locator('[data-state="permission"]').or(page.getByText('Not found', { exact: true })).first()).toBeVisible() });
  notReached('settings.billing-org', 'past-due', sbo, "the past-due layout is expected from the code but exercised by no spec (the simulator's failing account); not taken");

  // Users and roles
  const us = '/settings/organizations/[organizationId]/users';
  await cap(browser, { key: 'settings.users', route: us, persona: 'practice-admin', path: () => `/settings/organizations/${need('group')}/users` });
  await cap(browser, {
    key: 'settings.users',
    route: us,
    persona: 'practice-admin',
    path: () => `/settings/organizations/${need('group')}/users`,
    state: 'error',
    note: 'An address already in use (refused by the database; nothing sent).',
    act: async (page) => {
      const email = page.getByLabel('Email', { exact: true });
      await email.fill(personaEmail('viewer'));
      // Enter submits the form as a person would; at 390 px the button's click timed out in the first run.
      await email.press('Enter');
      await refused(page);
    },
  });
  await notice(browser, { key: 'settings.users', route: us, persona: 'practice-admin', path: () => `/settings/organizations/${need('group')}/users?notice=invited`, name: 'notice-invited' });
  await cap(browser, {
    key: 'settings.users',
    route: us,
    persona: 'practice-admin',
    path: () => `/settings/organizations/${need('group')}/users`,
    state: 'interaction:end-membership-ticked',
    note: 'End membership’s confirmation ticked on the first member row, not submitted.',
    act: async (page) => page.getByRole('table', { name: 'Members' }).getByRole('checkbox').first().check(),
  });
  await cap(browser, { key: 'settings.users', route: us, persona: 'firm-principal', path: () => `/settings/organizations/${need('firm')}/users`, state: 'interaction:firm', note: 'The firm’s roles.' });
  await cap(browser, { key: 'settings.users', route: us, persona: 'billing-manager', path: () => `/settings/organizations/${need('group')}/users`, state: 'error', variant: 'error-forbidden', ready: async (page) => expect(page.locator('[data-state="permission"]').or(page.getByText('Not found', { exact: true })).first()).toBeVisible() });

  // /terms
  const tm = '/terms';
  await cap(browser, { key: 'terms', route: tm, persona: 'practice-admin', path: tm, note: 'Accepted: every seeded person accepted synthetic-2026-10.' });
  await cap(browser, { key: 'terms', route: tm, persona: A, path: tm, state: 'interaction:internal', note: 'The internal variant (the PaidWhole staff alert).' });
  await shellControls(browser, { key: 'terms', route: tm, persona: 'practice-admin', path: tm, account: true, menu: true });
  notReached('terms', 'accept-form', tm, 'the accept form needs a person who owes the version in force; the one product path (publishing a newer version) would send every customer to /terms, so it is never taken mid-capture');
});

// ---------------------------------------------------------------------------------------------------------------------
test('practice workflow', async ({ browser }) => {
  test.setTimeout(60 * 60_000);
  const L = (rest = ''): string => `/p/${need('layout')}${rest}`;
  const PK = (rest = ''): string => `/p/${need('packets')}${rest}`;
  const LG = (rest = ''): string => `/p/${need('ledger')}${rest}`;
  const MN = (rest = ''): string => `/p/${need('monitoring')}${rest}`;
  const N = (rest = ''): string => `/p/${need('north')}${rest}`;
  const O = (rest = ''): string => `/p/${need('other')}${rest}`;
  const RP = (rest = ''): string => `/p/${need('reports')}${rest}`;
  const DL = (rest = ''): string => `/p/${need('deadlines')}${rest}`;
  const rail = (path: () => string) => (): string => `a[href="${path()}"]`;

  // /p/[practiceId]
  const home = '/p/[practiceId]';
  await cap(browser, { key: 'p.home', route: home, persona: 'ledger-manager', path: () => LG(), note: 'SYNTHETIC OTHER PRACTICE LEDGER: recovered after reconciliation (legacy tour shot 27-phone-home-ledger at 390).' });
  await cap(browser, { key: 'p.home', route: home, persona: 'billing-manager', path: () => N(), state: 'empty', note: 'NORTH before any upload.' });
  await cap(browser, { key: 'p.home', route: home, persona: 'monitoring-manager', path: () => MN(), state: 'error', variant: 'error-last-run-failed', note: 'MONITORING: the last run failed (monitoring.spec.ts fails a parse three times); the notifications card shows here too.' });
  await cap(browser, { key: 'p.home', route: home, persona: 'contract-specialist', path: () => L(), state: 'error', variant: 'error-forbidden', ready: denied });
  await cap(browser, { key: 'p.home', route: home, persona: 'packet-approver', path: () => PK(), state: 'interaction:tiles', note: 'PACKETS: payer approved $60.00 in the tiles.' });
  await cap(browser, { key: 'p.home', route: home, persona: 'other-admin', path: () => L(), state: 'interaction:support-access', ready: async (page) => expect(page.getByText('Support access').first()).toBeVisible(), note: 'The practice administrator’s Support access card.' });

  // Abstraction (the contract specialist's, under the journeys' grants)
  const CS = 'contract-specialist';
  const ab = '/p/[practiceId]/abstraction';
  await cap(browser, { key: 'p.abstraction', route: ab, persona: CS, path: () => PK('/abstraction'), note: LETTER_IN_RESPONSE ? 'PACKETS: its acceptance letter, which a response names, is not awaiting abstraction.' : 'PACKETS: the payer letter awaiting abstraction.' });
  await cap(browser, { key: 'p.abstraction', route: ab, persona: CS, path: () => L('/abstraction'), state: 'empty' });
  await capLoading(browser, { key: 'p.abstraction', route: ab, persona: CS, from: () => PK('/abstraction/regulations'), link: rail(() => PK('/abstraction')) });
  await cap(browser, { key: 'p.abstraction', route: ab, persona: 'pricing-manager', path: () => L('/abstraction'), state: 'error', variant: 'error-forbidden', ready: denied });
  await cap(browser, {
    key: 'p.abstraction',
    route: ab,
    persona: CS,
    path: () => PK('/abstraction'),
    state: 'error',
    variant: 'error-tag',
    note: 'Tag the letter with a payer and no title or date (refused; nothing written).',
    act: async (page) => {
      await page.getByLabel('Payer').first().selectOption({ index: 0 });
      await page.getByRole('button', { name: 'Tag to the payer' }).first().click();
      await refused(page);
    },
  });
  notReached('p.abstraction', 'questions', ab, 'Questions to the practice needs a question a specialist asks on a version page; no spec asks one');
  const abl = '/p/[practiceId]/abstraction/ledger';
  await cap(browser, { key: 'p.abstraction-ledger', route: abl, persona: CS, path: () => LG('/abstraction/ledger') });
  await cap(browser, { key: 'p.abstraction-ledger', route: abl, persona: CS, path: () => L('/abstraction/ledger'), state: 'empty' });
  await capLoading(browser, { key: 'p.abstraction-ledger', route: abl, persona: CS, from: () => LG('/abstraction'), link: () => `a[href="${LG('/abstraction/ledger')}"]` });
  await cap(browser, { key: 'p.abstraction-ledger', route: abl, persona: 'ledger-manager', path: () => LG('/abstraction/ledger'), state: 'error', variant: 'error-forbidden', ready: denied });
  const openAdjust = async (page: Page): Promise<void> => {
    await page.locator('summary').filter({ hasText: /^Adjust$/ }).first().click();
  };
  // At 390 px the entries table scrolls sideways inside its card, and the Adjust form opens in its last column (Correct).
  // The click's own scroll into view stops the table part way, as far as the summary needs, which cut the opened form at
  // the right edge (checkers, 2026-10-26); the product draws the whole form in that column (error-adjust-zero.390, where
  // the focused field brings it in). A person swipes the table to read the form they opened: the step does the same.
  const showAdjust = async (page: Page): Promise<void> => {
    await openAdjust(page);
    await page
      .locator('details[open]')
      .filter({ has: page.locator('summary').filter({ hasText: /^Adjust$/ }) })
      .first()
      .evaluate((details) => {
        const scroller = details.closest('.overflow-x-auto');
        if (scroller instanceof HTMLElement) scroller.scrollLeft = scroller.scrollWidth;
      });
  };
  await cap(browser, {
    key: 'p.abstraction-ledger',
    route: abl,
    persona: CS,
    path: () => LG('/abstraction/ledger'),
    state: 'interaction:adjust-open',
    act: showAdjust,
    note: 'The Adjust form opened, not submitted; at 390 px the entries table, which scrolls sideways, is swiped to its end so the form shows whole.',
  });
  await cap(browser, {
    key: 'p.abstraction-ledger',
    route: abl,
    persona: CS,
    path: () => LG('/abstraction/ledger'),
    state: 'error',
    variant: 'error-adjust-zero',
    note: 'An adjustment of 0.00 (refused; nothing written).',
    act: async (page) => {
      await openAdjust(page);
      const form = page.locator('details[open]').filter({ has: page.getByRole('button', { name: 'Adjust the amount' }) }).first();
      await form.getByLabel(/Change in dollars/).fill('0.00');
      await form.getByLabel(/Why the amount is corrected/).fill('SYNTHETIC CHECK');
      await form.getByRole('checkbox').first().check();
      await press(form.getByRole('button', { name: 'Adjust the amount' }));
      await refused(page);
    },
  });
  await notice(browser, { key: 'p.abstraction-ledger', route: abl, persona: CS, path: () => LG('/abstraction/ledger?notice=adjusted'), name: 'notice' });
  const abr = '/p/[practiceId]/abstraction/regulations';
  await cap(browser, { key: 'p.abstraction-regulations', route: abr, persona: CS, path: () => L('/abstraction/regulations'), note: 'Its default is its empty state: No regulation waits for confirmation (the only state populated data reaches).' });
  await capLoading(browser, { key: 'p.abstraction-regulations', route: abr, persona: CS, from: () => L('/abstraction'), link: () => `a[href="${L('/abstraction/regulations')}"]` });
  await cap(browser, { key: 'p.abstraction-regulations', route: abr, persona: 'pricing-manager', path: () => L('/abstraction/regulations'), state: 'error', variant: 'error-forbidden', ready: denied });
  await notice(browser, { key: 'p.abstraction-regulations', route: abr, persona: CS, path: () => L('/abstraction/regulations?notice=confirmed'), name: 'notice' });
  const abv = '/p/[practiceId]/abstraction/versions/[versionId]';
  await cap(browser, { key: 'p.abstraction-version', route: abv, persona: CS, path: () => L(`/abstraction/versions/${need('version')}`), note: 'LAYOUT’s signed-off version: publication blocked, because the journey’s schedule document has no stored bytes.' });
  await cap(browser, {
    key: 'p.abstraction-version',
    route: abv,
    persona: CS,
    path: () => L(`/abstraction/versions/${need('version')}`),
    state: 'error',
    variant: 'error-amend',
    note: 'An amendment starting inside the amended version’s window (refused; nothing written).',
    act: async (page) => {
      await page.getByLabel('Amendment effective from').fill('2026-01-01');
      await press(page.getByRole('button', { name: 'Draft the amendment' }));
      await refused(page);
    },
  });
  await cap(browser, { key: 'p.abstraction-version', route: abv, persona: 'pricing-manager', path: () => L(`/abstraction/versions/${need('version')}`), state: 'error', variant: 'error-forbidden', ready: denied });
  await notice(browser, { key: 'p.abstraction-version', route: abv, persona: CS, path: () => L(`/abstraction/versions/${need('version')}?model=proposed`), name: 'model-notice', dark: true });
  // The contract screen's refusals (PR #75; docs/adr/0070, Part 3), opened by their URL as the notice above. A build
  // that does not know a code shows no notice (the route's ?model= falls back to none), which is that build's screen.
  // screen_failed and screen_limited came with the PR's fix round (the review's UX-3), and too_long (the request's
  // byte cap, P11) with its second.
  for (const code of ['names_patient', 'screen_unavailable', 'screen_failed', 'screen_limited', 'too_long']) {
    await cap(browser, {
      key: 'p.abstraction-version',
      route: abv,
      persona: CS,
      path: () => L(`/abstraction/versions/${need('version')}?model=${code}`),
      state: `interaction:model-${code.replace('_', '-')}`,
      dark: true,
      note: `The model notice ?model=${code}, opened by its URL without the model step that would show it (a build that does not know the code shows none).`,
    });
  }
  notReached('p.abstraction-version', 'loading', abv, 'not holdable on populated data: the versions are signed off, so neither /abstraction nor the specialist queue links to one');
  notReached('p.abstraction-version', 'draft-forms', abv, 'the draft forms need a draft or proposed version, which no populate spec leaves');

  // Anomalies
  const an = '/p/[practiceId]/anomalies';
  await cap(browser, { key: 'p.anomalies', route: an, persona: 'pricing-manager', path: () => L('/anomalies'), note: 'Legacy tour shot 12-anomalies.' });
  await cap(browser, { key: 'p.anomalies', route: an, persona: 'billing-manager', path: () => N('/anomalies'), state: 'empty' });
  await cap(browser, {
    key: 'p.anomalies',
    route: an,
    persona: 'pricing-manager',
    path: () => L('/anomalies'),
    state: 'empty',
    variant: 'empty-filtered',
    act: (page) => filterToEmpty(page, 'form[aria-label="Filter the cohorts"]', 'select[name="payer"]', /SYNTHETIC PAYER Q/, 'No cohort matches these filters.'),
    note: 'Filtered with the Payer select and Filter to a payer of LAYOUT with no cohort: the select shows the filter beside the message.',
  });
  await capLoading(browser, { key: 'p.anomalies', route: an, persona: 'pricing-manager', from: () => L('/claims'), link: rail(() => L('/anomalies')) });
  await cap(browser, { key: 'p.anomalies', route: an, persona: 'pricing-manager', path: () => L(`/anomalies?anomaly=${need('anomaly')}`), state: 'interaction:cohort', note: 'A cohort opened (its Flagged lines and the two actions, not pressed).' });
  await cap(browser, { key: 'p.anomalies', route: an, persona: 'ledger-viewer', path: () => L(`/anomalies?anomaly=${need('anomaly')}`), state: 'interaction:cohort-viewer', note: 'The open cohort as a viewer.' });

  // Cases
  const cs = '/p/[practiceId]/cases';
  await cap(browser, { key: 'p.cases', route: cs, persona: 'packet-approver', path: () => PK('/cases'), note: 'Legacy tour shot 13-cases.' });
  await cap(browser, { key: 'p.cases', route: cs, persona: 'billing-manager', path: () => N('/cases'), state: 'empty' });
  await cap(browser, {
    key: 'p.cases',
    route: cs,
    persona: 'packet-approver',
    path: () => PK('/cases'),
    state: 'empty',
    variant: 'empty-filtered',
    act: (page) => filterToEmpty(page, 'form[aria-label="Filter the cases"]', 'select[name="state"]', /^Open$/i, 'No case matches these filters.'),
    note: 'Filtered with the State select and Filter to a state no PACKETS case is in (its one case is resolved).',
  });
  await capLoading(browser, { key: 'p.cases', route: cs, persona: 'packet-approver', from: () => PK(), link: rail(() => PK('/cases')) });
  await cap(browser, {
    key: 'p.cases',
    route: cs,
    persona: 'packet-approver',
    path: () => PK('/cases'),
    state: 'error',
    note: 'Materiality per line as letters (refused; nothing written).',
    act: async (page) => {
      await page.getByLabel('Per line (dollars)').fill('abc');
      await press(page.getByRole('button', { name: 'Save the thresholds' }));
      await refused(page);
    },
  });
  await notice(browser, { key: 'p.cases', route: cs, persona: 'packet-approver', path: () => PK('/cases?notice=materiality'), name: 'notice' });
  await cap(browser, { key: 'p.cases', route: cs, persona: 'monitoring-manager', path: () => MN('/cases?deadline=14'), state: 'interaction:deadline-14', note: 'The dashboard’s deadline deep link (a case due within 14 days).' });

  // A case
  const cz = '/p/[practiceId]/cases/[caseId]';
  const casePath = (): string => PK(`/cases/${need('packetsCase')}`);
  await cap(browser, { key: 'p.case', route: cz, persona: 'packet-approver', path: casePath, note: 'Legacy tour shots 14-case (1280) and 28-phone-case (390).' });
  await cap(browser, { key: 'p.case', route: cz, persona: 'monitoring-manager', path: () => MN(`/cases/${need('monitoringCase')}`), state: 'empty', note: 'MONITORING’s case: no packet, not submitted, no note.' });
  await cap(browser, { key: 'p.case', route: cz, persona: 'ledger-viewer', path: () => LG(`/cases/${need('ledgerCase')}`), state: 'interaction:viewer', note: 'A viewer: no forms, lines named by number, note words hidden.' });
  await capLoading(browser, { key: 'p.case', route: cz, persona: 'packet-approver', from: () => PK('/cases'), link: () => `a[href="${casePath()}"]` });
  const openWriteOff = async (page: Page): Promise<void> => {
    await page.locator('summary').filter({ hasText: 'Write this line off' }).first().click();
  };
  await cap(browser, { key: 'p.case', route: cz, persona: 'packet-approver', path: casePath, state: 'interaction:write-off-open', act: openWriteOff, note: 'Write this line off opened, not submitted.' });
  await cap(browser, {
    key: 'p.case',
    route: cz,
    persona: 'packet-approver',
    path: casePath,
    state: 'error',
    note: "Write off with reason Other and no words (refused before anything is written).",
    act: async (page) => {
      await openWriteOff(page);
      const form = page.locator('details[open]').filter({ has: page.getByRole('button', { name: 'Write off' }) }).first();
      await form.locator('select').first().selectOption({ label: 'Other' });
      await form.getByRole('checkbox').first().check();
      await press(form.getByRole('button', { name: 'Write off' }));
      await refused(page);
    },
  });
  // The write-off pressed with Reason on its empty first option (PR #85's sample, gap 1): the browser's check off
  // (noValidate) and the consequence ticked, so the route refuses on Reason alone ("Reason: choose the reason") before any
  // write. Before PR #85 Reason starts on a reason and a press with the box ticked would write the line off, so there the
  // step ticks and presses nothing and the shot shows the form opened as it starts.
  await cap(browser, {
    key: 'p.case',
    route: cz,
    persona: 'packet-approver',
    path: casePath,
    state: 'error',
    variant: 'error-unchosen',
    note: LETTER_IN_RESPONSE
      ? 'Write off pressed with the browser’s check off (noValidate), the consequence ticked and Reason on “Choose the reason”: refused by the route on Reason, nothing written.'
      : 'Before PR #85 Reason starts on a reason, so no empty choice can be sent: Write this line off opened as it starts, not pressed (a press would write the line off).',
    act: async (page) => {
      await openWriteOff(page);
      const form = page.locator('details[open]').filter({ has: page.getByRole('button', { name: 'Write off' }) }).first();
      const empty = await sendEmptyChoices(form);
      if (!empty.includes('reason')) {
        log('NOTE write-off: Reason starts on a reason at this ref, so nothing is ticked or pressed (it would write)');
        return;
      }
      await form.getByRole('checkbox').first().check();
      await press(form.getByRole('button', { name: 'Write off' }));
      await refused(page);
    },
  });
  // "Window passed" refused (gap 2): from PR #85 the page withholds the option while a line's window is open or unknown,
  // so no person can send it; only an altered request could, and the route's refusals are asserted by
  // workbench-routes.db.test.ts (CAS-46). Before it the option is offered and a press would write the line off.
  notReachedAll('p.case', 'error-window-passed', cz, 'the “Window passed” option is withheld on every line whose window is open (PACKETS’ lines), so the route’s refusal cannot be reached on screen; workbench-routes.db.test.ts asserts it (before PR #85 a press would write the line off)');
  // The hint for a line with no known window (gap 2): triage adds a line only with a known window (design 2.2), so it is
  // shot only if the database holds such a line on PACKETS' case.
  if (['p.case.write-off-unknown-window.1280', 'p.case.write-off-unknown-window.390', 'p.case.write-off-unknown-window.1280-dark'].some(wanted)) {
    const unknown = await one(
      'SELECT cl.case_id AS id FROM case_line cl JOIN priced_line p ON p.id = cl.priced_line_id WHERE cl.practice_id = $1 AND cl.written_off_reason IS NULL AND p.window_ends_on IS NULL ORDER BY cl.created_at LIMIT 1',
      [ids.packets ?? ''],
    );
    const anywhere = await one('SELECT count(*)::text AS id FROM case_line cl JOIN priced_line p ON p.id = cl.priced_line_id WHERE cl.written_off_reason IS NULL AND p.window_ends_on IS NULL');
    log(`RECORDS case lines with no known window: ${anywhere === '' ? '?' : anywhere} in all; PACKETS ${unknown === '' ? 'none' : unknown}`);
    if (unknown === '') {
      notReachedAll('p.case', 'write-off-unknown-window', cz, `no case line open to a write-off has an unknown dispute window (${anywhere === '' ? '?' : anywhere} on the database): triage adds a line only with a known window (design 2.2), so the hint is defensive; write-off.test.ts asserts its words`);
    } else {
      await cap(browser, { key: 'p.case', route: cz, persona: 'packet-approver', path: () => PK(`/cases/${unknown}`), state: 'interaction:write-off-unknown-window', dark: true, act: openWriteOff, note: 'A PACKETS line with no known dispute window: Write this line off opened, the hint under Reason.' });
    }
  }
  notReached('p.case', 'struck-lines', cz, 'struck-through WINDOW_PASSED lines need triage.spec.ts (not in the populate set)');

  // The packet
  const pkt = '/p/[practiceId]/cases/[caseId]/packet';
  const packetPath = (): string => `${casePath()}/packet`;
  const layoutPacket = (): string => L(`/cases/${need('layoutCase')}/packet`);
  await cap(browser, { key: 'p.packet', route: pkt, persona: 'packet-approver', path: packetPath, note: 'PACKETS: approved, exported, attested (legacy probe packet-exported).' });
  await cap(browser, { key: 'p.packet', route: pkt, persona: 'monitoring-manager', path: () => MN(`/cases/${need('monitoringCase')}/packet`), state: 'empty', note: 'MONITORING’s case: No packet yet, with the first version’s form.' });
  await capLoading(browser, { key: 'p.packet', route: pkt, persona: 'packet-approver', from: casePath, link: () => `a[href="${packetPath()}"]` });
  await cap(browser, {
    key: 'p.packet',
    route: pkt,
    persona: 'pricing-manager',
    path: layoutPacket,
    state: 'error',
    variant: 'error-live-check',
    note: 'A figure not in the input typed into the narrative: the live check’s mismatch (not saved).',
    act: async (page) => {
      const narrative = page.getByRole('textbox', { name: 'Narrative', exact: true });
      await narrative.fill(`${await narrative.inputValue()} The payer also withheld 1234.56 on these claims [1].`);
      await expect(page.getByText(/Live check: 1 mismatch/).first()).toBeVisible({ timeout: 15_000 });
    },
  });
  // A figure the input holds, written in a role its record does not give it (ADR 0086, co-001/packet-day-counts): the
  // year of the draft's own service date written as a count of claims. Before that change the year passed as a number;
  // from it on the live check fails and says what the figure was read as. The same step serves both sides.
  await cap(browser, {
    key: 'p.packet',
    route: pkt,
    persona: 'pricing-manager',
    path: layoutPacket,
    state: 'error',
    variant: 'error-wrong-role',
    note: 'The year of the draft’s service date typed into the narrative as a count of claims (“The payer underpaid <year> claims [3].”, synthetic; not saved): from ADR 0086 on the live check fails with “read as a count of claims”; before it the year passed as a number.',
    act: async (page) => {
      const narrative = page.getByRole('textbox', { name: 'Narrative', exact: true });
      const text = await narrative.inputValue();
      const year = /\b((?:19|20)\d{2})-\d{2}-\d{2}\b/.exec(text)?.[1];
      if (year === undefined) throw new Error('no service date in the LAYOUT draft narrative');
      await narrative.fill(`${text} The payer underpaid ${year} claims [3].`);
      await expect(page.locator('#narrative-check').getByText(/^Live check (passes|: \d+ mismatch(es)?)$/).first()).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(300);
      log(`RECORDS wrong-role live check: ${(await page.locator('#narrative-check').innerText()).replace(/\s+/g, ' ')}`);
    },
  });
  // The same editor with a typed figure in the role its record gives it: the count of lines as lines. Passes on both sides.
  await cap(browser, {
    key: 'p.packet',
    route: pkt,
    persona: 'pricing-manager',
    path: layoutPacket,
    state: 'interaction:live-check-pass',
    note: 'The draft’s count of lines typed again as a count of lines (“The shortfall is on <n> lines [3].”, synthetic; not saved): the live check passes.',
    act: async (page) => {
      const narrative = page.getByRole('textbox', { name: 'Narrative', exact: true });
      const text = await narrative.inputValue();
      const lines = /\bfor (\d+) lines?\b/.exec(text)?.[1];
      if (lines === undefined) throw new Error('no count of lines in the LAYOUT draft narrative');
      await narrative.fill(`${text} The shortfall is on ${lines} ${lines === '1' ? 'line' : 'lines'} [3].`);
      await expect(page.locator('#narrative-check').getByText(/^Live check passes$/).first()).toBeVisible({ timeout: 15_000 });
    },
  });
  await cap(browser, { key: 'p.packet', route: pkt, persona: 'packet-deadline-approver', path: () => DL(`/cases/${need('deadlinesBlockedCase')}/packet`), state: 'error', variant: 'error-export-blocked', ready: async (page) => expect(page.locator('[data-export="blocked"]').first()).toBeVisible(), note: 'PACKET DEADLINES: the export blocked by an unverified deadline, with its reason and fix.' });
  await cap(browser, { key: 'p.packet', route: pkt, persona: 'other-admin', path: packetPath, state: 'error', variant: 'error-forbidden', ready: denied });
  // The exported PDF opened by its URL: by a role without phi.export (the practice administrator, who is refused the
  // packet page too, so after UX PR 5 the notice lands on its permission state), and by the approver for a version that
  // is not there (a stale link: the file not available, the page readable).
  await cap(browser, {
    key: 'p.packet',
    route: pkt,
    persona: 'other-admin',
    path: () => `${packetPath()}/${need('packetsVersion')}/pdf`,
    state: 'error',
    variant: 'refused-forbidden',
    dark: true,
    ready: async (page) => {
      await downloadRefusal(page);
    },
    note: 'The practice administrator (no phi.export) opens the exported PDF by its URL: before UX PR 5 (co-001/ux-download-refusals) the download handler’s raw 403 JSON at /pdf, with no frame; from it on, the packet page again (?refused=forbidden), which this role is refused too.',
  });
  await cap(browser, {
    key: 'p.packet',
    route: pkt,
    persona: 'packet-approver',
    path: () => `${packetPath()}/${NO_UUID}/pdf`,
    state: 'error',
    variant: 'refused-not-found',
    dark: true,
    ready: async (page) => {
      await downloadRefusal(page);
    },
    note: 'The approver opens a PDF link of a version that is not there (a stale link): before UX PR 5 the download handler’s raw 404 JSON at /pdf, with no frame; from it on, the packet page again (?refused=not_found) with the notice.',
  });
  // The drafter asks for approval (a write the 2026-10-25 tour made too); a second billing manager sees the approve step.
  await attempt(['p.packet.drafter.1280', 'p.packet.drafter.390', 'p.packet.approver-ready.1280', 'p.packet.approver-ready.390', 'p.packet.drafter.1280-dark'], pkt, async () => {
    const page = await (await desktopOf(browser, 'pricing-manager')).newPage();
    try {
      await go(page, 'pricing-manager', layoutPacket());
      await settle(page);
      const request = page.getByRole('region', { name: 'Approval' }).getByRole('button', { name: 'Request approval' });
      if ((await request.count()) > 0) {
        await request.click();
        await expect(page.locator('[data-notice="requested"]')).toBeVisible();
        log('WRITE approval requested on the LAYOUT packet');
      }
    } finally {
      await page.close();
    }
  });
  await cap(browser, { key: 'p.packet', route: pkt, persona: 'pricing-manager', path: layoutPacket, state: 'interaction:drafter', note: 'The drafter after asking for approval: Approve disabled, with its reason (legacy probe packet-drafter-view).' });
  await cap(browser, { key: 'p.packet', route: pkt, persona: 'packet-approver', path: layoutPacket, state: 'interaction:approver-ready', ready: async (page) => expect(page.getByRole('region', { name: 'Approval' }).locator('[data-approval="ready"]')).toBeVisible(), note: 'A second billing manager sees the approve step (legacy tour shot 15-packet-approve).' });
  for (const name of ['requested', 'exported']) {
    await notice(browser, { key: 'p.packet', route: pkt, persona: 'packet-approver', path: () => `${packetPath()}?notice=${name}`, name: `notice-${name}` });
  }
  notReached('p.packet', 'notice-written-unchanged-approved-export-requested', pkt, 'the same notice alert as notice-requested and notice-exported; two representative notices are shot');
  // The payer's copy (a route handler's PDF, not a page): its first page rendered 1280 px wide.
  await attempt(['p.packet-pdf.default.1280'], '/p/[practiceId]/cases/[caseId]/packet/[versionId]/pdf', async () => {
    const page = await (await desktopOf(browser, 'packet-approver')).newPage();
    try {
      await go(page, 'packet-approver', packetPath());
      await settle(page);
      const versionId = ids.packetsVersion || (await shownVersionId(page));
      if (versionId === '') throw new Error('no exported version on the PACKETS packet');
      const response = await page.request.get(`${packetPath()}/${versionId}/pdf`);
      expect(response.status()).toBe(200);
      const pdf = `${OUT}/payer-copy.pdf`;
      writeFileSync(pdf, await response.body());
      const id = 'p.packet-pdf.default.1280';
      execFileSync('pdftoppm', ['-png', '-f', '1', '-l', '1', '-singlefile', '-scale-to-x', '1280', '-scale-to-y', '-1', pdf, `${PNG}/${id}`]);
      record({ file: `${PNG}/${id}.png`, id, path: `${packetPath()}/${versionId}/pdf (page 1)`, routePattern: '/p/[practiceId]/cases/[caseId]/packet/[versionId]/pdf', role: 'packet-approver', width: 1280, theme: 'light', state: 'default', note: 'The payer’s copy PDF (a route handler, not a page), page 1 rendered 1280 px wide (legacy tour shot 16-payer-copy).' });
    } finally {
      await page.close();
    }
  });

  // The reviewer's packet review (under the tour's on-screen grants)
  const rv = '/p/[practiceId]/cases/[caseId]/packet/[versionId]/review';
  const reviewPath = (): string => `${packetPath()}/${need('packetsVersion')}/review`;
  const deadlineReview = (): string => DL(`/cases/${need('deadlinesExportedCase')}/packet/${need('deadlinesExportedVersion')}/review`);
  await cap(browser, { key: 'p.packet-review', route: rv, persona: 'reviewer', path: reviewPath, note: 'PACKETS’ export, attested by packet-reviewer in populate.' });
  await capLoading(browser, { key: 'p.packet-review', route: rv, persona: 'reviewer', from: () => DL('/packet-reviews'), link: () => `a[href="${deadlineReview()}"]` });
  await cap(browser, { key: 'p.packet-review', route: rv, persona: 'reviewer', path: deadlineReview, state: 'error', variant: 'error-needs-downloads', ready: async (page) => expect(page.locator('[data-attestation="needs_downloads"]').first()).toBeVisible(), note: 'PACKET DEADLINES’ export: attest blocked until the reviewer downloads both files.' });
  await cap(browser, { key: 'p.packet-review', route: rv, persona: 'packet-approver', path: reviewPath, state: 'error', variant: 'error-forbidden', ready: denied });
  await notice(browser, { key: 'p.packet-review', route: rv, persona: 'reviewer', path: () => `${reviewPath()}?notice=attested`, name: 'notice' });
  notReached('p.packet-review', 'stale-export', rv, 'a stale, never-attested export needs unattested.spec.ts (not in the populate set)');

  // Submissions
  const sb = '/p/[practiceId]/cases/[caseId]/submissions';
  const subPath = (): string => `${casePath()}/submissions`;
  await cap(browser, { key: 'p.submissions', route: sb, persona: 'packet-approver', path: subPath, note: 'PACKETS: one submission with a partial response (legacy probe submissions).' });
  await cap(browser, { key: 'p.submissions', route: sb, persona: 'pricing-manager', path: () => L(`/cases/${need('layoutCase')}/submissions`), state: 'empty', note: 'LAYOUT’s case: not submitted, nothing to submit yet.' });
  await capLoading(browser, { key: 'p.submissions', route: sb, persona: 'packet-approver', from: casePath, link: () => `a[href="${subPath()}"]` });
  await cap(browser, {
    key: 'p.submissions',
    route: sb,
    persona: 'packet-approver',
    path: subPath,
    state: 'error',
    note: 'A partial response with no amount (refused before any write); the first letter listed is chosen first where the form asks for it (PR #85).',
    act: async (page) => {
      const form = page.getByRole('region', { name: 'Log a payer response' });
      // From PR #85 the Payer’s letter select comes first, required and on its empty choice, so the browser would stop the
      // press before the route's refusal on the amount: choose the first letter listed (design 4.8). Before it the form has
      // a Document select already on a letter, and no such field.
      const letter = form.getByLabel('Payer’s letter', { exact: true });
      if ((await letter.count()) > 0) await letter.selectOption({ index: 1 });
      await form.getByLabel('Response', { exact: true }).selectOption({ index: await optionIndex(page, /^Response$/, /Partial/i) });
      const received = form.getByLabel('Received on');
      if ((await received.inputValue()) === '') await received.fill('2026-10-01');
      // Every required select the press submits is chosen, or the browser's bubble stops it and the shot would wait in vain.
      const unchosen = await form.locator('select[required]').evaluateAll((selects) => selects.filter((select) => (select as HTMLSelectElement).value === '').map((select) => select.getAttribute('name') ?? '?'));
      if (unchosen.length > 0) throw new Error(`a required select is still unchosen: ${unchosen.join(', ')}`);
      await press(form.getByRole('button', { name: 'Record the response' }));
      await refused(page);
    },
  });
  // The refused empty choices (PR #85's sample, gap 1): the form's browser check switched off (noValidate), then pressed
  // with Response and the Payer’s letter, or Channel, on their first, empty option, so the route's refusal names each on
  // its field ("Response: choose the payer’s answer", "Payer’s letter: choose the payer’s letter", "Channel: choose the
  // channel") under the Not done summary. Before PR #85 those selects start on a choice and the press would write, so the
  // step presses nothing there and the shot shows the form as it starts (the before of the same state).
  const emptyChoices = (region: string, button: string) => async (page: Page): Promise<void> => {
    const form = page.getByRole('region', { name: region });
    const empty = await sendEmptyChoices(form);
    if (empty.length === 0) {
      log(`NOTE ${region}: every required select starts on a choice at this ref, so nothing is pressed (it would write)`);
      return;
    }
    await press(form.getByRole('button', { name: button }));
    await refused(page);
  };
  await cap(browser, {
    key: 'p.submissions',
    route: sb,
    persona: 'packet-approver',
    path: subPath,
    state: 'error',
    variant: 'error-unchosen-response',
    note: LETTER_IN_RESPONSE
      ? 'Log a payer response pressed with the browser’s check off (noValidate) and Response and the Payer’s letter on their empty first options: refused by the route on each field, nothing written.'
      : 'Before PR #85 Response starts on Accepted and Document on a letter, so no empty choice can be sent: the form as it starts, not pressed (a press would record a response).',
    act: emptyChoices('Log a payer response', 'Record the response'),
  });
  await cap(browser, {
    key: 'p.submissions',
    route: sb,
    persona: 'packet-approver',
    path: subPath,
    state: 'error',
    variant: 'error-unchosen-channel',
    note: LETTER_IN_RESPONSE
      ? 'Log a submission pressed with the browser’s check off (noValidate) and Channel on its empty first option: refused by the route on Channel, nothing written.'
      : 'Before PR #85 Channel starts on a channel, so no empty choice can be sent: the form as it starts, not pressed (a press would log a submission).',
    act: emptyChoices('Log a submission', 'Log the submission'),
  });
  // The letter list with its groups drawn open (gap 5): the select's size set, as a list box shows its optgroups. Before
  // PR #85 the same act shows the Document select's flat list.
  await cap(browser, {
    key: 'p.submissions',
    route: sb,
    persona: 'packet-approver',
    path: subPath,
    state: 'interaction:letter-list',
    note: 'The letter select drawn as a list box (its size attribute set by the tour, and its fixed one-row height lifted) so its groups show; nothing chosen or sent.',
    act: async (page) => {
      const select = page.getByRole('region', { name: 'Log a payer response' }).locator('select[name="documentId"]').first();
      await select.evaluate((element) => {
        const list = element as HTMLSelectElement;
        list.size = Math.max(2, list.querySelectorAll('option, optgroup').length);
        // The field's classes fix its height to one row; a list box takes the height of its rows.
        list.style.height = 'auto';
        list.style.maxHeight = 'none';
      });
    },
  });
  await notice(browser, { key: 'p.submissions', route: sb, persona: 'packet-approver', path: () => `${subPath()}?notice=recorded`, name: 'notice' });
  // The payer's letter uploaded inside the form (PR #85; design 6.2): last among PACKETS' submissions shots, since the letter
  // stays in intake (no worker runs in the tour), and no later shot lists PACKETS' uploads. Each width uploads its own
  // bytes (a comment after %%EOF), so the second is not a duplicate of the first.
  if (LETTER_IN_RESPONSE) {
    // A zip chosen in the letter's uploader (gap 4): refused in the browser in its single mode; any upload request is
    // aborted and the shot then skipped (the input takes one file, so two PDFs cannot be set; a zip is the other refusal).
    await cap(browser, {
      key: 'p.submissions',
      route: sb,
      persona: 'packet-approver',
      path: subPath,
      state: 'interaction:letter-refused',
      note: 'A SYNTHETIC zip chosen as the payer’s letter: refused in the browser under Nothing was uploaded (one PDF only); nothing uploaded.',
      act: async (page) => {
        const form = page.getByRole('region', { name: 'Log a payer response' });
        const guard = await noUploadRequest(page);
        // An empty zip archive (its end-of-central-directory record alone): 22 bytes, no entry.
        const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(18)]);
        await form.locator('input[type="file"]').first().setInputFiles({ name: 'SYNTHETIC-letters.zip', mimeType: 'application/zip', buffer: zip });
        await expect(form.locator('[data-state="error"]').filter({ hasText: 'Nothing was uploaded' }).filter({ hasText: 'Choose one PDF' }).first()).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(500);
        guard.sent();
      },
    });
    await cap(browser, {
      key: 'p.submissions',
      route: sb,
      persona: 'packet-approver',
      path: subPath,
      state: 'interaction:letter-scanning',
      note: 'A SYNTHETIC payer letter uploaded inside Log a payer response after Partially accepted was chosen and a note typed; no worker runs in the tour, so it stays in intake and the form says it is being scanned.',
      act: async (page, width) => {
        const form = page.getByRole('region', { name: 'Log a payer response' });
        await form.getByLabel('Response', { exact: true }).selectOption({ index: await optionIndex(page, /^Response$/, /Partial/i) });
        await form.getByLabel('Notes (kept encrypted)').fill('SYNTHETIC: the payer accepts part of the amount disputed.');
        const pdf = Buffer.concat([readFileSync(`${SCREENS}/fixtures/synthetic/CON-01/version-1.pdf`), Buffer.from(`\n% SYNTHETIC tour letter ${String(width)}\n`)]);
        // The input is aria-hidden (its button opens the picker), so it is found by its type, not its label.
        await form.locator('input[type="file"]').first().setInputFiles({ name: 'SYNTHETIC-letter.pdf', mimeType: 'application/pdf', buffer: pdf });
        await expect(form.locator('[data-letter-status="scanning"]')).toBeVisible({ timeout: 30_000 });
      },
    });
    // The letter's states after intake (gap 3): each needs the intake worker's receipt (stored, duplicate or held), and the
    // tour runs no worker during the practice shots; the browser harness (response-letter.browser.test.tsx) and
    // e2e/packets.spec.ts assert them.
    const afterIntake = 'needs the intake worker to settle the upload’s receipt, and no worker runs during the tour’s practice shots (one would also take PACKETS’ letter-scanning upload out of intake); response-letter.browser.test.tsx and e2e/packets.spec.ts assert it';
    notReachedAll('p.submissions', 'letter-chosen', sb, `the letter stored and chosen ${afterIntake}`);
    notReachedAll('p.submissions', 'letter-uploaded-here', sb, `the “(uploaded here)” option is the stored letter this form uploaded: it ${afterIntake}`);
    notReachedAll('p.submissions', 'letter-duplicate-chosen', sb, `a duplicate of a letter no response names, chosen, ${afterIntake}`);
    notReachedAll('p.submissions', 'letter-duplicate-other-case', sb, `a duplicate of another case’s response letter, chosen, ${afterIntake}; the populated data also has one case with a response`);
    notReachedAll('p.submissions', 'letter-duplicate-unusable', sb, `a duplicate of a contract’s document ${afterIntake}`);
    notReachedAll('p.submissions', 'letter-held', sb, `a letter held at intake ${afterIntake}`);
  } else {
    const before = 'not at this ref: Log a payer response takes no upload before PR #85 (co-001/ux-payer-response); the letter is uploaded on Uploads or Contracts';
    for (const variant of ['letter-scanning', 'letter-refused', 'letter-chosen', 'letter-uploaded-here', 'letter-duplicate-chosen', 'letter-duplicate-other-case', 'letter-duplicate-unusable', 'letter-held']) {
      notReachedAll('p.submissions', variant, sb, before);
    }
  }
  // The letter field's hint with no letter on file (gap 6): a case with a logged submission in a practice with no letter a
  // response may carry, found on the database (PACKETS has its letter). Before PR #85 the same case shows the form's
  // "No response document yet" state.
  if (['p.submissions.no-letter.1280', 'p.submissions.no-letter.390', 'p.submissions.no-letter.1280-dark'].some(wanted)) {
    const candidates: readonly (readonly [string, string])[] = [
      ['deadlines', 'packet-deadline-approver'],
      ['ledger', 'ledger-manager'],
      ['layout', 'pricing-manager'],
      ['monitoring', 'monitoring-manager'],
      ['reports', 'reports-manager'],
    ];
    let found: { practice: string; persona: string; caseId: string } | null = null;
    const seen: string[] = [];
    for (const [practice, persona] of candidates) {
      const practiceId = ids[practice] ?? '';
      const caseId = await one('SELECT s.case_id AS id FROM submission s WHERE s.practice_id = $1 ORDER BY s.created_at DESC LIMIT 1', [practiceId]);
      const letters = await one(
        "SELECT count(*)::text AS id FROM source_document d WHERE d.practice_id = $1 AND d.parent_document_id IS NULL AND d.kind IN ('payer_letter', 'other') AND d.status = 'stored'",
        [practiceId],
      );
      seen.push(`${practice}: case with a submission ${caseId === '' ? 'none' : 'yes'}, letters ${letters === '' ? '?' : letters}`);
      if (found === null && caseId !== '' && letters === '0') found = { practice, persona, caseId };
    }
    log(`RECORDS no-letter candidates: ${seen.join('; ')}`);
    if (found === null) {
      notReachedAll('p.submissions', 'no-letter', sb, `no populated practice but PACKETS has a case with a logged submission and no letter on file (${seen.join('; ')}); PACKETS has its letter`);
    } else {
      const target = found;
      await cap(browser, {
        key: 'p.submissions',
        route: sb,
        persona: target.persona,
        path: () => `/p/${need(target.practice)}/cases/${target.caseId}/submissions`,
        state: 'interaction:no-letter',
        dark: true,
        note: `A case of ${target.practice.toUpperCase()} with a logged submission and no payer’s letter on file: the letter field’s hint (before PR #85, the form’s empty state).`,
      });
    }
  }
  await cap(browser, { key: 'p.submissions', route: sb, persona: 'packet-deadline-approver', path: () => DL(`/cases/${need('deadlinesExportedCase')}/submissions`), state: 'interaction:attestation-waiting', note: 'PACKET DEADLINES: waiting for the reviewer’s attestation of the export.' });

  // Packet by reference
  const br = '/p/[practiceId]/cases/by-reference';
  if (wantedPrefix('p.by-reference')) {
    const page = await (await desktopOf(browser, 'packet-approver')).newPage();
    try {
      await go(page, 'packet-approver', packetPath());
      await settle(page);
      ids.reference = (await page.locator('[data-reference]').first().getAttribute('data-reference')) ?? '';
    } catch (error) {
      log(`REFERENCE not read: ${reasonOf(error)}`);
    } finally {
      await page.close();
    }
  }
  await cap(browser, { key: 'p.by-reference', route: br, persona: 'packet-approver', path: () => PK(`/cases/by-reference?reference=${need('reference')}`), note: 'PACKETS’ approved packet found by its reference.' });
  await cap(browser, { key: 'p.by-reference', route: br, persona: 'packet-approver', path: () => PK('/cases/by-reference?reference=ZZZZZ-ZZZZZ'), state: 'empty' });
  await cap(browser, { key: 'p.by-reference', route: br, persona: 'packet-approver', path: () => PK('/cases/by-reference?reference=hello'), state: 'error', ready: async (page) => expect(page.getByText('Not a reference').first()).toBeVisible() });
  await cap(browser, {
    key: 'p.by-reference',
    route: br,
    persona: 'packet-approver',
    path: () => PK('/cases'),
    state: 'interaction:typed',
    note: 'Typed on /cases in lower case without the hyphen, as a person would, and found.',
    act: async (page) => {
      await page.getByLabel('Find a packet by its reference').fill(need('reference').toLowerCase().replace('-', ''));
      await page.getByRole('form', { name: 'Packet reference lookup' }).getByRole('button').click();
      await expect(page).toHaveURL(/by-reference/);
      await h1(page);
    },
  });
  notReached('p.by-reference', 'loading', br, "the lookup is a plain GET form: a document navigation streams cases/loading.tsx and the page in one response, so the loading state cannot be held");

  // Claims and lines
  const cl = '/p/[practiceId]/claims';
  await cap(browser, { key: 'p.claims', route: cl, persona: 'pricing-manager', path: () => L('/claims'), note: 'Legacy probe claims.' });
  await cap(browser, { key: 'p.claims', route: cl, persona: 'billing-manager', path: () => N('/claims'), state: 'empty' });
  await cap(browser, { key: 'p.claims', route: cl, persona: 'pricing-manager', path: () => L('/claims?code=99999'), state: 'empty', variant: 'empty-filtered' });
  await capLoading(browser, { key: 'p.claims', route: cl, persona: 'pricing-manager', from: () => L('/remittances'), link: rail(() => L('/claims')) });
  await cap(browser, {
    key: 'p.claims',
    route: cl,
    persona: 'pricing-manager',
    path: () => L('/claims'),
    state: 'error',
    note: 'Find the claim with a clearly synthetic number that matches nothing.',
    act: async (page) => {
      await page.getByLabel('Payer claim control number').fill('SYNNOMATCH0001');
      await press(page.getByRole('button', { name: 'Find the claim' }));
      await refused(page);
    },
  });
  await cap(browser, { key: 'p.claims', route: cl, persona: 'ledger-viewer', path: () => LG('/claims'), state: 'interaction:viewer', note: 'A viewer: identifiers hidden for the role.' });
  await cap(browser, {
    key: 'p.claims',
    route: cl,
    persona: 'pricing-manager',
    path: () => L('/claims'),
    state: 'interaction:patient',
    note: 'One synthetic patient’s claims (the row link).',
    act: async (page) => {
      await press(page.locator('main a[href*="patient="]').first());
      await expect(page).toHaveURL(/patient=/);
    },
  });

  // Contracts
  const ct = '/p/[practiceId]/contracts';
  await cap(browser, { key: 'p.contracts', route: ct, persona: 'era-manager', path: () => O('/contracts'), note: 'SYNTHETIC OTHER PRACTICE after contracts.spec.ts: version 1 in force, a document left to tag.' });
  await cap(browser, { key: 'p.contracts', route: ct, persona: 'pricing-manager', path: () => L('/contracts'), state: 'interaction:layout', note: 'LAYOUT’s contracts with their coverage share (legacy tour shot 06-contracts).' });
  await cap(browser, { key: 'p.contracts', route: ct, persona: 'billing-manager', path: () => N('/contracts'), state: 'empty' });
  await cap(browser, { key: 'p.contracts', route: ct, persona: 'era-manager', path: () => O('/contracts?status=superseded'), state: 'empty', variant: 'empty-filtered' });
  await capLoading(browser, { key: 'p.contracts', route: ct, persona: 'era-manager', from: () => O(), link: rail(() => O('/contracts')) });
  const overlap = async (page: Page, button: string): Promise<void> => {
    await page.getByLabel('Effective from').first().fill('2026-07-01');
    await page.getByLabel('Last day (optional)').first().fill('2027-06-30');
    await press(page.getByRole('button', { name: button }).first());
    await refused(page);
  };
  await cap(browser, {
    key: 'p.contracts',
    route: ct,
    persona: 'era-manager',
    path: () => O('/contracts'),
    state: 'error',
    note: 'The leftover version-2.pdf tagged over the version in force: versions never overlap (refused; nothing written).',
    act: async (page) => {
      await page.getByLabel('Payer').first().selectOption({ label: 'SYNTHETIC PAYER C' });
      await page.getByLabel('Contract', { exact: true }).first().selectOption({ index: await optionIndex(page, /^Contract$/, /SYNTHETIC PAYER C AGREEMENT/) });
      await overlap(page, 'Tag to the payer');
    },
  });
  // The upload panel's kind (PR #75; docs/adr/0070, Part 3): a panel of several kinds starts with none, and a file chosen
  // before the kind is refused in the browser (the PR's head) or waits there for the kind and Upload (its fix round,
  // the review's UX-1). A build whose panel starts with a kind would upload the file, so the step stops there with the
  // reason, before any file is chosen. Any upload request is aborted, and the shot then skipped (noUploadRequest).
  await cap(browser, {
    key: 'p.contracts',
    route: ct,
    persona: 'era-manager',
    path: () => O('/contracts'),
    state: 'interaction:no-kind',
    dark: true,
    note: 'A synthetic PDF (CON-01 version-1.pdf) chosen before the kind: from PR #75’s fix round it waits in the browser, the kind select marked and focused (before it, refused in the browser). Nothing uploaded.',
    act: async (page) => {
      const guard = await noUploadRequest(page);
      await noKind(page);
      guard.sent();
    },
  });
  // From the fix round on: the same file waiting, then the kind chosen. The words under the select go and Upload 1 file
  // shows beside Clear; the select's change sends nothing. Upload is not pressed. A build that refuses the file instead
  // has nothing waiting, so the step stops with the reason.
  await cap(browser, {
    key: 'p.contracts',
    route: ct,
    persona: 'era-manager',
    path: () => O('/contracts'),
    state: 'interaction:held-ready',
    dark: true,
    note: 'The synthetic PDF chosen before the kind, then Contract chosen: Upload 1 file beside Clear, the words under the select gone. Upload not pressed; nothing uploaded.',
    act: async (page) => {
      const guard = await noUploadRequest(page);
      if ((await noKind(page)) !== 'held') throw new Error('this build refuses a file chosen before the kind instead of keeping it, so nothing waits to upload: not taken on this build');
      const panel = page.getByRole('region', { name: CONTRACT_UPLOAD });
      await panel.getByLabel('Kind of document').selectOption('contract');
      await expect(panel.locator('#upload-kind-error')).toHaveCount(0);
      await expect(panel.getByRole('group', { name: WAITING }).getByRole('button', { name: 'Upload 1 file' })).toBeVisible();
      await page.waitForTimeout(500);
      guard.sent();
    },
  });
  // The payer letter kind chosen with no file (PR #85's sample, gap 7): the select reads "Payer’s terms or policy letter"
  // from PR #85 ("Payer letter" before it). Choosing a kind sends nothing; any upload request is aborted and the shot skipped.
  await cap(browser, {
    key: 'p.contracts',
    route: ct,
    persona: 'era-manager',
    path: () => O('/contracts'),
    state: 'interaction:kind-letter',
    note: 'The upload panel’s Kind of document set to the payer letter kind, no file chosen; nothing uploaded.',
    act: async (page) => {
      const guard = await noUploadRequest(page);
      await page.getByRole('region', { name: CONTRACT_UPLOAD }).getByLabel('Kind of document').selectOption('payer_letter');
      await page.waitForTimeout(500);
      guard.sent();
    },
  });
  // PACKETS' contracts (gap 8): its Documents to tag listed the acceptance letter before PR #85; from it the letter a
  // response names is not a contract's document and is not listed.
  await cap(browser, { key: 'p.contracts', route: ct, persona: 'packet-approver', path: () => PK('/contracts'), state: 'interaction:packets', note: 'SYNTHETIC OTHER PRACTICE PACKETS after packets.spec.ts: its acceptance letter, which its partial response names, listed among the documents to tag before PR #85 and not from it.' });
  await cap(browser, { key: 'p.contracts', route: ct, persona: CS, path: () => L('/contracts'), state: 'error', variant: 'error-forbidden', ready: denied });
  await cap(browser, { key: 'p.contracts', route: ct, persona: 'ledger-viewer', path: () => O('/contracts'), state: 'interaction:viewer' });
  await shellControls(browser, { key: 'p.contracts', route: ct, persona: 'era-manager', path: () => O('/contracts') });
  const cn = '/p/[practiceId]/contracts/[contractId]';
  await cap(browser, { key: 'p.contract', route: cn, persona: 'era-manager', path: () => O(`/contracts/${need('otherContract')}`) });
  await capLoading(browser, { key: 'p.contract', route: cn, persona: 'era-manager', from: () => O('/contracts'), link: () => `a[href="${O(`/contracts/${need('otherContract')}`)}"]` });
  await cap(browser, { key: 'p.contract', route: cn, persona: 'era-manager', path: () => O(`/contracts/${need('otherContract')}`), state: 'error', note: 'version-2.pdf added over the version in force (refused; nothing written).', act: (page) => overlap(page, 'Add to this contract') });
  await cap(browser, { key: 'p.contract', route: cn, persona: 'ledger-viewer', path: () => O(`/contracts/${need('otherContract')}`), state: 'interaction:viewer' });
  await cap(browser, { key: 'p.contract', route: cn, persona: 'pricing-manager', path: () => L(`/contracts/${need('layoutContract')}`), state: 'interaction:layout', note: 'LAYOUT’s contract.' });
  notReached('p.contract', 'empty', cn, 'tagging always creates version 1, so No version yet is not reachable');
  const cv = '/p/[practiceId]/contracts/versions/[versionId]';
  const versionPath = (): string => O(`/contracts/versions/${need('otherVersion')}`);
  const cited = async (page: Page): Promise<void> => {
    await h1(page);
    await expect(page.locator('[data-page-text] mark').first()).toBeVisible({ timeout: 30_000 });
  };
  await cap(browser, { key: 'p.contract-version', route: cv, persona: 'era-manager', path: versionPath, ready: cited, note: 'The cited page with the quote marked (legacy tour shot 07-contract-version).' });
  await capLoading(browser, { key: 'p.contract-version', route: cv, persona: 'era-manager', from: () => O('/contracts'), link: () => `a[href="${versionPath()}"]` });
  await cap(browser, { key: 'p.contract-version', route: cv, persona: 'pricing-manager', path: () => L(`/contracts/versions/${need('version')}`), state: 'error', variant: 'error-unresolved', note: 'LAYOUT’s version: the cited page does not resolve (the journey’s document has no stored bytes) and publication is blocked.' });
  await cap(browser, {
    key: 'p.contract-version',
    route: cv,
    persona: 'era-manager',
    path: versionPath,
    state: 'error',
    variant: 'error-page-missing',
    note: 'A page past the document’s end (?page=99).',
    act: async (page) => {
      const href = (await page.locator('main a[href*="document="]').first().getAttribute('href')) ?? '';
      if (href === '') throw new Error('no document link on the version page');
      const url = new URL(href, 'http://tour.invalid');
      url.searchParams.set('page', '99');
      await page.goto(`${url.pathname}${url.search}`);
      await h1(page);
    },
  });
  await notice(browser, { key: 'p.contract-version', route: cv, persona: 'era-manager', path: () => `${versionPath()}?notice=signed_off`, name: 'notice', ready: cited });
  await cap(browser, {
    key: 'p.contract-version',
    route: cv,
    persona: 'era-manager',
    path: versionPath,
    ready: cited,
    state: 'interaction:cited-page-2',
    act: async (page) => {
      const next = page.getByRole('link', { name: 'Next page' }).first();
      const previous = page.getByRole('link', { name: 'Previous page' }).first();
      if ((await next.count()) > 0) await next.click();
      else await previous.click();
      await page.waitForLoadState('load');
    },
    note: 'The other page of the two-page agreement.',
  });
  notReached('p.contract-version', 'sign-off', cv, 'the approved, awaiting sign-off and superseded states are not reachable: contracts.spec.ts signs its version off and nothing supersedes one');

  // Coverage
  const cg = '/p/[practiceId]/coverage';
  await cap(browser, { key: 'p.coverage', route: cg, persona: 'pricing-manager', path: () => L('/coverage'), note: 'Legacy probe coverage.' });
  await cap(browser, { key: 'p.coverage', route: cg, persona: 'billing-manager', path: () => N('/coverage'), state: 'empty' });
  await capLoading(browser, { key: 'p.coverage', route: cg, persona: 'pricing-manager', from: () => L(), link: rail(() => L('/coverage')) });
  await cap(browser, {
    key: 'p.coverage',
    route: cg,
    persona: 'pricing-manager',
    path: () => L('/coverage'),
    state: 'error',
    variant: 'error-letter-codes',
    dark: true,
    note: 'A malformed procedure code (ABC) in the letter form, sent past the browser’s own check (the form’s noValidate set first), so the shot shows the server’s refusal: before UX PR 5 (co-001/ux-download-refusals) the download handler’s raw JSON at /coverage/letter, with no frame; from it on, Coverage again (?refused= in the path) with the codes kept and the field marked.',
    act: async (page) => {
      await page.locator('#letter-codes').fill('ABC');
      await sendLetter(page);
    },
  });
  // The letter with a payer and a contract of another payer (the contract select lists every payer's contracts): on
  // LAYOUT, payer N has no contract and payer Q's SYNTHETIC FIXED SCHEDULE AGREEMENT is listed (route map, coverage
  // "error"). Reachable with one payer that has a contract and any other payer; the step reads both from the page.
  const letterSeed = wantedPrefix('p.coverage.error-letter-contract')
    ? await withDatabase(async (client) => {
        const row = (
          await client.query<{ payers: number; contracts: number }>(
            'SELECT (SELECT count(*) FROM payer WHERE practice_id = $1)::int AS payers, (SELECT count(*) FROM contract WHERE practice_id = $1 AND payer_id IS NOT NULL)::int AS contracts',
            [need('layout')],
          )
        ).rows[0];
        return { payers: row?.payers ?? 0, contracts: row?.contracts ?? 0 };
      }).catch((error: unknown) => {
        log(`RECORDS letter seed not read: ${reasonOf(error)}`);
        return { payers: 2, contracts: 1 };
      })
    : { payers: 0, contracts: 0 };
  if (letterSeed.payers >= 2 && letterSeed.contracts >= 1) {
    await cap(browser, {
      key: 'p.coverage',
      route: cg,
      persona: 'pricing-manager',
      path: () => L('/coverage'),
      state: 'error',
      variant: 'error-letter-contract',
      dark: true,
      note: 'The letter with a payer and a contract of another payer (the contract select lists every payer’s contracts), codes blank: before UX PR 5 the download handler’s raw JSON (field contract) at /coverage/letter; from it on, Coverage again with the payer and the contract kept and the contract marked.',
      act: async (page) => {
        const choice = await page.evaluate(() => {
          const payers = [...document.querySelectorAll<HTMLOptionElement>('#letter-payer option')].map((option) => ({ value: option.value, label: (option.textContent ?? '').trim() }));
          for (const group of document.querySelectorAll<HTMLOptGroupElement>('#letter-contract optgroup')) {
            const contract = group.querySelector('option');
            const other = payers.find((payer) => payer.value !== '' && payer.label !== group.label.trim());
            if (contract !== null && other !== undefined) return { payer: other.value, payerName: other.label, contract: contract.value, contractPayer: group.label.trim() };
          }
          return null;
        });
        if (choice === null) throw new Error('not reachable on this page: no contract listed under one payer while another payer is listed');
        log(`RECORDS letter: payer ${choice.payerName} with a contract of ${choice.contractPayer}`);
        await page.locator('#letter-payer').selectOption(choice.payer);
        await page.locator('#letter-contract').selectOption(choice.contract);
        await page.locator('#letter-codes').fill('');
        await sendLetter(page);
      },
    });
  } else if (wantedPrefix('p.coverage.error-letter-contract')) {
    notReached('p.coverage', 'error-letter-contract', cg, `not reachable on this seed: LAYOUT has ${String(letterSeed.payers)} payer(s) and ${String(letterSeed.contracts)} contract(s) with a payer; the refusal needs a contract of one payer and another payer`);
  }
  // The letter's URL with a payer that is not this practice's (a stale or edited link; DLR-01's unknown payer).
  await cap(browser, {
    key: 'p.coverage',
    route: cg,
    persona: 'pricing-manager',
    path: () => L(`/coverage/letter?payer=${NO_UUID}&contract=&codes=`),
    state: 'error',
    variant: 'error-letter-payer',
    dark: true,
    ready: async (page) => {
      await downloadRefusal(page);
    },
    note: 'The letter’s URL opened with a payer that is not this practice’s (a stale or edited link): before UX PR 5 the download handler’s raw JSON (not_found) at /coverage/letter; from it on, Coverage again with the payer select marked.',
  });
  await notice(browser, { key: 'p.coverage', route: cg, persona: 'pricing-manager', path: () => L('/coverage?model=proposed'), name: 'model-notice' });
  await cap(browser, { key: 'p.coverage', route: cg, persona: 'ledger-viewer', path: () => L('/coverage'), state: 'interaction:viewer' });
  await cap(browser, { key: 'p.coverage', route: cg, persona: 'era-manager', path: () => O('/coverage'), state: 'interaction:no-run', note: 'Lines but no run yet (SYNTHETIC OTHER PRACTICE).' });
  notReached('p.coverage', 'refused-and-unconfirmed', cg, 'the refused state, months waiting on the ZIP and unconfirmed export formats need specs outside the populate set (uploads, onboarding, era-exports)');
  // The model's checklist and its review form (writes, taken after LAYOUT's other coverage shots): Suggest pressed on
  // screen once the model's synthetic answer for LAYOUT's gaps is written (expectChecklist), then Keep the checked items
  // with every item ticked, which records the review, or is refused where the form carries no FormKeys (before
  // co-001/ux-forms). Each width makes its own checklist, so the 390 px review form is a fresh one.
  for (const width of WIDTHS) {
    const review: Meta = {
      key: 'p.coverage',
      variant: 'checklist-review',
      state: 'interaction:checklist-review',
      route: cg,
      role: 'pricing-manager',
      note: 'The model’s checklist awaiting its review: the tour wrote the local provider’s synthetic answer for LAYOUT’s coverage gaps (as e2e/models.ts does), then pressed Suggest what to obtain with the model.',
    };
    const sent: Meta = {
      ...review,
      variant: 'checklist-review-sent',
      state: 'interaction:checklist-review-sent',
      note: 'Keep the checked items pressed with every item ticked: the review is recorded, or the form is refused.',
    };
    const reviewIds = [idOf(review, width), idOf(sent, width), ...(width === 1280 ? [idOf(review, width, true), idOf(sent, width, true)] : [])];
    await attempt(reviewIds, cg, async () => {
      const { page, dispose } = await open(browser, 'pricing-manager', width);
      try {
        await go(page, 'pricing-manager', L('/coverage'));
        await h1(page);
        const items = await expectChecklist(need('layout'));
        await press(page.getByRole('button', { name: 'Suggest what to obtain with the model' }));
        await page.waitForURL(/[?&]model=/, { timeout: 30_000 });
        if (!/[?&]model=suggested/.test(page.url())) throw new Error(`the model proposed no checklist (${shown(page)}; ${String(items)} items written)`);
        const keep = page.getByRole('button', { name: 'Keep the checked items' });
        await expect(keep).toBeVisible();
        await snap(page, review);
        await press(keep);
        await Promise.any([page.waitForURL(/[?&]model=(kept|dismissed|reviewed_already)/, { timeout: 20_000 }), refused(page)]);
        await snap(page, sent);
      } finally {
        await dispose();
      }
    });
  }

  // Digest
  const dg = '/p/[practiceId]/digests/[digestId]';
  await cap(browser, { key: 'p.digest', route: dg, persona: 'monitoring-manager', path: () => MN(`/digests/${need('digest')}`), ready: async (page) => expect(page.getByRole('heading', { level: 1 })).toContainText('Monitoring digest for'), note: 'Legacy tour shot 18-monitoring-digest.' });
  await capLoading(browser, { key: 'p.digest', route: dg, persona: 'monitoring-manager', from: () => MN('/reports/monthly'), link: () => `a[href="${MN(`/digests/${need('digest')}`)}"]` });
  await cap(browser, { key: 'p.digest', route: dg, persona: CS, path: () => MN(`/digests/${need('digest')}`), state: 'error', variant: 'error-forbidden', ready: denied });

  // A line
  const ln = '/p/[practiceId]/lines/[lineId]';
  await cap(browser, { key: 'p.line', route: ln, persona: 'pricing-manager', path: () => L(`/lines/${need('marchLine')}?run=${need('marchRun')}`), ready: async (page) => expect(page.getByRole('list', { name: 'Trace steps' })).toBeVisible(), note: 'A March line’s trace (legacy tour shot 11-line-trace).' });
  await cap(browser, { key: 'p.line', route: ln, persona: 'era-manager', path: () => O(`/lines/${need('otherLine')}`), state: 'empty', variant: 'empty-not-priced', note: 'A line no complete run has priced (SYNTHETIC OTHER PRACTICE).' });
  await cap(browser, { key: 'p.line', route: ln, persona: 'ledger-viewer', path: () => LG(`/lines/${need('ledgerLine')}`), state: 'interaction:viewer' });
  await capLoading(browser, { key: 'p.line', route: ln, persona: 'pricing-manager', from: () => L(`/pricing-runs/${need('marchRun')}`), link: () => `main a[href^="${L('/lines/')}"]` });
  await cap(browser, {
    key: 'p.line',
    route: ln,
    persona: 'pricing-manager',
    path: () => L(`/lines/${need('marchLine')}?run=${need('marchRun')}`),
    state: 'error',
    note: 'A note of spaces only (refused).',
    act: async (page) => {
      await page.getByLabel('Note', { exact: true }).fill('   ');
      await press(page.getByRole('button', { name: 'Add the note' }));
      await refused(page);
    },
  });

  // Mapping
  const mp = '/p/[practiceId]/mapping';
  await cap(browser, { key: 'p.mapping', route: mp, persona: 'pricing-manager', path: () => L('/mapping'), note: 'The default view (waiting on mapping) shows its empty state: every populated plan is mapped.' });
  await cap(browser, { key: 'p.mapping', route: mp, persona: 'pricing-manager', path: () => L('/mapping?view=all'), state: 'interaction:all-plans', note: 'All plans (legacy tour shot 08-mapping).' });
  await cap(browser, { key: 'p.mapping', route: mp, persona: 'billing-manager', path: () => N('/mapping?view=all'), state: 'empty', note: 'NORTH, all plans: no plans yet.' });
  await capLoading(browser, { key: 'p.mapping', route: mp, persona: 'pricing-manager', from: () => L(), link: rail(() => L('/mapping')) });
  const pl = '/p/[practiceId]/mapping/[planId]';
  await cap(browser, { key: 'p.plan', route: pl, persona: 'pricing-manager', path: () => L(`/mapping/${need('planFix')}`), note: 'CE:SYNPLAN-FIX-ONE, priced from the contract’s rate record.' });
  await cap(browser, { key: 'p.plan', route: pl, persona: 'pricing-manager', path: () => L(`/mapping/${need('planOon')}`), state: 'interaction:no-agreement', note: 'CE:SYNPLAN-OON-CAS, mapped as no agreement, with its remedy.' });
  await capLoading(browser, { key: 'p.plan', route: pl, persona: 'pricing-manager', from: () => L('/mapping?view=all'), link: () => `a[href="${L(`/mapping/${need('planFix')}`)}"]` });
  await cap(browser, {
    key: 'p.plan',
    route: pl,
    persona: 'pricing-manager',
    path: () => L(`/mapping/${need('planFix')}`),
    state: 'error',
    note: 'A contract mapping with no version chosen (refused; nothing written).',
    act: async (page) => {
      await page.getByLabel('Agreement', { exact: true }).selectOption({ index: await optionIndex(page, /^Agreement$/, /contract/i) });
      // The version select opens on 'None (not a contract mapping)', which is the refusal's cause.
      await page.getByLabel('Effective from').fill('2026-01-01');
      await press(page.getByRole('button', { name: 'Save the mapping' }));
      await refused(page);
    },
  });
  await notice(browser, { key: 'p.plan', route: pl, persona: 'pricing-manager', path: () => L(`/mapping/${need('planFix')}?notice=mapped`), name: 'notice' });
  await cap(browser, { key: 'p.plan', route: pl, persona: 'ledger-viewer', path: () => L(`/mapping/${need('planFix')}`), state: 'interaction:viewer' });

  // Notifications
  const nf = '/p/[practiceId]/notifications';
  await cap(browser, { key: 'p.notifications', route: nf, persona: 'monitoring-manager', path: () => MN('/notifications'), note: 'Unread: shot before anything marks them read.' });
  await cap(browser, { key: 'p.notifications', route: nf, persona: 'billing-manager', path: () => N('/notifications'), state: 'empty' });
  await capLoading(browser, { key: 'p.notifications', route: nf, persona: 'monitoring-manager', from: () => MN(), link: rail(() => MN('/notifications')) });

  // Packets to attest (the reviewer's)
  const pr = '/p/[practiceId]/packet-reviews';
  await cap(browser, { key: 'p.packet-reviews', route: pr, persona: 'reviewer', path: () => DL('/packet-reviews'), note: 'PACKET DEADLINES: an export waiting for attestation.' });
  await cap(browser, { key: 'p.packet-reviews', route: pr, persona: 'reviewer', path: () => PK('/packet-reviews'), state: 'empty', note: 'PACKETS: its export is attested.' });
  await capLoading(browser, { key: 'p.packet-reviews', route: pr, persona: 'reviewer', from: () => DL('/reports'), link: rail(() => DL('/packet-reviews')) });
  await cap(browser, { key: 'p.packet-reviews', route: pr, persona: 'packet-approver', path: () => PK('/packet-reviews'), state: 'error', variant: 'error-forbidden', ready: denied });

  // Pricing runs
  const rn = '/p/[practiceId]/pricing-runs';
  await cap(browser, { key: 'p.pricing-runs', route: rn, persona: 'pricing-manager', path: () => L('/pricing-runs'), note: 'Legacy tour shot 09-pricing-runs.' });
  await cap(browser, { key: 'p.pricing-runs', route: rn, persona: 'billing-manager', path: () => N('/pricing-runs'), state: 'empty' });
  await capLoading(browser, { key: 'p.pricing-runs', route: rn, persona: 'pricing-manager', from: () => L(), link: rail(() => L('/pricing-runs')) });
  await cap(browser, {
    key: 'p.pricing-runs',
    route: rn,
    persona: 'pricing-manager',
    path: () => L('/pricing-runs'),
    state: 'error',
    note: 'A last month before the first (refused before anything is written).',
    act: async (page) => {
      await page.getByLabel('First month of service').fill('2026-04');
      await page.getByLabel(/^Last month/).fill('2026-03');
      await press(page.getByRole('button', { name: 'Create the run' }));
      await refused(page);
    },
  });
  await cap(browser, { key: 'p.pricing-runs', route: rn, persona: 'ledger-viewer', path: () => LG('/pricing-runs'), state: 'interaction:viewer', note: 'Without the create form.' });
  const run = '/p/[practiceId]/pricing-runs/[runId]';
  await cap(browser, { key: 'p.pricing-run', route: run, persona: 'pricing-manager', path: () => L(`/pricing-runs/${need('marchRun')}`), note: 'March (legacy tour shot 10-pricing-run).' });
  await cap(browser, { key: 'p.pricing-run', route: run, persona: 'pricing-manager', path: () => L(`/pricing-runs/${need('aprilRun')}`), state: 'interaction:april', note: 'April: the unpriced reasons table (NO_AGREEMENT).' });
  await cap(browser, { key: 'p.pricing-run', route: run, persona: 'pricing-manager', path: () => L(`/pricing-runs/${need('marchRun')}?lines=unpriced`), state: 'empty', variant: 'empty-filtered' });
  await capLoading(browser, { key: 'p.pricing-run', route: run, persona: 'pricing-manager', from: () => L('/pricing-runs'), link: () => `a[href="${L(`/pricing-runs/${need('marchRun')}`)}"]` });
  notReached('p.pricing-run', 'unfinished', run, "'This run has not finished' needs a run created with no worker (a write that would add a run to LAYOUT's lists); not taken");
  const cmp = '/p/[practiceId]/pricing-runs/compare';
  const comparePath = (): string => L(`/pricing-runs/compare?before=${need('marchRun')}&after=${need('aprilRun')}`);
  await cap(browser, { key: 'p.compare', route: cmp, persona: 'pricing-manager', path: comparePath, note: 'March against April.' });
  await cap(browser, {
    key: 'p.compare',
    route: cmp,
    persona: 'pricing-manager',
    path: comparePath,
    state: 'interaction:diff-filter',
    act: async (page) => {
      await press(page.getByRole('navigation', { name: 'Diff filter' }).getByRole('link').nth(2));
      await expect(page).toHaveURL(/lines=/);
    },
    note: 'A diff filter chosen (In the first run only).',
  });
  notReached('p.compare', 'loading', cmp, "not holdable: the Compare form on /pricing-runs is a plain GET form (a document navigation streams compare/loading.tsx with the page), and the page's own Diff filter links change only its search parameters, which keep the current screen (tried with the request held: no loading state in 15 s)");
  notReached('p.compare', 'incomplete', cmp, "'A run is still being priced' needs an incomplete run (a write that adds a run); not taken");

  // Reconciliation
  const rc = '/p/[practiceId]/reconciliation';
  await cap(browser, { key: 'p.reconciliation', route: rc, persona: 'ledger-manager', path: () => LG('/reconciliation'), ready: async (page) => expect(page.locator('[data-figure="recovered"]')).toBeVisible(), note: 'Legacy tour shot 17-reconciliation.' });
  await cap(browser, { key: 'p.reconciliation', route: rc, persona: 'billing-manager', path: () => N('/reconciliation'), state: 'empty' });
  await capLoading(browser, { key: 'p.reconciliation', route: rc, persona: 'ledger-manager', from: () => LG(), link: rail(() => LG('/reconciliation')) });
  await cap(browser, {
    key: 'p.reconciliation',
    route: rc,
    persona: 'ledger-manager',
    path: () => LG('/reconciliation'),
    state: 'error',
    variant: 'error-empty-file',
    note: 'An empty synthetic posting export chosen: refused in the browser, nothing uploaded.',
    act: async (page) => {
      await page.getByLabel('Kind of document').first().selectOption({ index: await optionIndex(page, 'Kind of document', /Posting export/i) });
      await page.locator('input[type="file"]').first().setInputFiles({ name: 'posting.csv', mimeType: 'text/csv', buffer: Buffer.alloc(0) });
      await refused(page, /Nothing was uploaded|empty/);
    },
  });
  const openReverse = async (page: Page): Promise<void> => {
    await page.locator('summary').filter({ hasText: 'Reverse this match' }).first().click();
  };
  await cap(browser, { key: 'p.reconciliation', route: rc, persona: 'ledger-manager', path: () => LG('/reconciliation'), state: 'interaction:reverse-open', act: openReverse, note: 'Reverse this match opened, not submitted.' });
  await cap(browser, {
    key: 'p.reconciliation',
    route: rc,
    persona: 'ledger-manager',
    path: () => LG('/reconciliation'),
    state: 'error',
    variant: 'error-reverse',
    note: 'A reversal with a reason of spaces only (refused).',
    act: async (page) => {
      await openReverse(page);
      const form = page.locator('details[open]').filter({ has: page.getByRole('button', { name: 'Reverse the match' }) }).first();
      await form.locator('textarea').first().fill('   ');
      await form.getByRole('checkbox').first().check();
      await press(form.getByRole('button', { name: 'Reverse the match' }));
      await refused(page);
    },
  });
  await cap(browser, { key: 'p.reconciliation', route: rc, persona: 'ledger-manager', path: () => LG(`/reconciliation?case=${need('ledgerCase')}`), state: 'interaction:case-ledger', note: 'The case ledger (?case=).' });
  await cap(browser, { key: 'p.reconciliation', route: rc, persona: 'ledger-viewer', path: () => LG('/reconciliation'), state: 'interaction:viewer' });
  const tp = '/p/[practiceId]/reconciliation/template';
  await cap(browser, { key: 'p.template', route: tp, persona: 'ledger-manager', path: () => LG('/reconciliation/template'), note: 'SYNTHETIC PM SYSTEM mapped.' });
  await cap(browser, { key: 'p.template', route: tp, persona: 'billing-manager', path: () => N('/reconciliation/template'), state: 'empty' });
  await capLoading(browser, { key: 'p.template', route: tp, persona: 'ledger-manager', from: () => LG('/reconciliation'), link: () => `a[href="${LG('/reconciliation/template')}"]` });
  const ownExport = async (page: Page): Promise<void> => {
    await page.getByLabel(/Our own practice-management system/).first().check();
  };
  await cap(browser, {
    key: 'p.template',
    route: tp,
    persona: 'ledger-manager',
    path: () => LG('/reconciliation/template'),
    state: 'error',
    note: 'An empty sample file for the preview (read in the browser only).',
    act: async (page) => {
      await ownExport(page);
      await page.getByLabel(/A sample export, for the preview/).setInputFiles({ name: 'sample.csv', mimeType: 'text/csv', buffer: Buffer.alloc(0) });
      await expect(page.locator('[data-state="sample-problem"]').first()).toBeVisible();
    },
  });
  await cap(browser, {
    key: 'p.template',
    route: tp,
    persona: 'ledger-manager',
    path: () => LG('/reconciliation/template'),
    state: 'interaction:preview',
    note: 'The repository’s SYNTHETIC LED-06 posting export as the sample, columns mapped: the preview (read in the browser; nothing saved).',
    act: async (page) => {
      await ownExport(page);
      await page.getByLabel(/A sample export, for the preview/).setInputFiles(`${SCREENS}/fixtures/synthetic/LED-06/posting-export.csv`);
      await page.getByLabel('Posting date (required)').selectOption('Post Date');
      await page.getByLabel('Check or EFT trace number (required)').selectOption('Check/EFT #');
      await page.getByLabel('Amount posted (required)').selectOption('Paid Amount');
      await expect(page.getByRole('region', { name: 'Preview' })).toBeVisible();
    },
  });
  await notice(browser, { key: 'p.template', route: tp, persona: 'ledger-manager', path: () => LG('/reconciliation/template?notice=saved'), name: 'notice' });

  // Release notes
  const rl = '/p/[practiceId]/releases';
  await cap(browser, { key: 'p.releases', route: rl, persona: 'pricing-manager', path: () => L('/releases') });
  await cap(browser, { key: 'p.releases', route: rl, persona: 'billing-manager', path: () => N('/releases'), state: 'empty', note: 'Partly empty: no run in effect pinned to another release, NORTH with 0 runs (No rule release is published is not reachable).' });
  await capLoading(browser, { key: 'p.releases', route: rl, persona: 'pricing-manager', from: () => L('/pricing-runs'), link: () => `main a[href^="${L('/releases')}"]` });
  await cap(browser, { key: 'p.releases', route: rl, persona: 'pricing-manager', path: () => L('/releases?release=900001'), state: 'interaction:release' });

  // Remittances
  const rm = '/p/[practiceId]/remittances';
  await cap(browser, { key: 'p.remittances', route: rm, persona: 'pricing-manager', path: () => L('/remittances'), note: 'Legacy tour shot 04-remittances.' });
  await cap(browser, { key: 'p.remittances', route: rm, persona: 'billing-manager', path: () => N('/remittances'), state: 'empty' });
  await cap(browser, { key: 'p.remittances', route: rm, persona: 'pricing-manager', path: () => L('/remittances?from=2020-01&to=2020-01'), state: 'empty', variant: 'empty-filtered' });
  await capLoading(browser, { key: 'p.remittances', route: rm, persona: 'pricing-manager', from: () => L(), link: rail(() => L('/remittances')) });
  const re = '/p/[practiceId]/remittances/[remittanceId]';
  await cap(browser, { key: 'p.remittance', route: re, persona: 'pricing-manager', path: () => L(`/remittances/${need('remittance')}`), note: 'CAS-08 (legacy tour shot 05-remittance).' });
  await cap(browser, { key: 'p.remittance', route: re, persona: 'ledger-manager', path: () => LG(`/remittances/${need('ledgerPlbRemittance')}`), state: 'interaction:plb', note: 'LEDGER’s recoupment: the PLB card.' });
  await cap(browser, { key: 'p.remittance', route: re, persona: 'ledger-viewer', path: () => LG(`/remittances/${need('ledgerRemittance')}`), state: 'interaction:viewer' });
  await capLoading(browser, { key: 'p.remittance', route: re, persona: 'pricing-manager', from: () => L('/remittances'), link: () => `a[href="${L(`/remittances/${need('remittance')}`)}"]` });
  notReached('p.remittance', 'empty', re, "'No claims in this remittance' needs a PLB-only remittance; no populate spec loads one");

  // Reports
  const rp = '/p/[practiceId]/reports';
  await cap(browser, { key: 'p.reports', route: rp, persona: 'ledger-manager', path: () => LG('/reports') });
  await cap(browser, { key: 'p.reports', route: rp, persona: 'reports-manager', path: () => RP('/reports'), state: 'interaction:audit-reports', note: 'SYNTHETIC OTHER PRACTICE REPORTS: the audit report list and printed documents.' });
  await cap(browser, { key: 'p.reports', route: rp, persona: 'billing-manager', path: () => N('/reports'), state: 'empty' });
  await capLoading(browser, { key: 'p.reports', route: rp, persona: 'ledger-manager', from: () => LG(), link: rail(() => LG('/reports')) });
  await cap(browser, { key: 'p.reports', route: rp, persona: 'ledger-viewer', path: () => LG('/reports'), state: 'interaction:viewer' });
  const rpt = '/p/[practiceId]/reports/[reportId]';
  await cap(browser, { key: 'p.report', route: rpt, persona: 'reports-manager', path: () => RP(`/reports/${need('report')}`), note: 'The released audit report.' });
  await capLoading(browser, { key: 'p.report', route: rpt, persona: 'reports-manager', from: () => RP('/reports'), link: () => `a[href="${RP(`/reports/${need('report')}`)}"]` });
  await cap(browser, { key: 'p.report', route: rpt, persona: 'reports-viewer', path: () => RP(`/reports/${need('report')}`), state: 'interaction:viewer', note: 'A viewer: without the line CSV.' });
  // The viewer opens the line CSV anyway (a shared or bookmarked link), as reports.spec.ts's refusal does, but by a
  // navigation: the e2e reads it with page.request (no Fetch Metadata, JSON either side of UX PR 5).
  await cap(browser, {
    key: 'p.report',
    route: rpt,
    persona: 'reports-viewer',
    path: () => RP(`/reports/${need('report')}/csv`),
    state: 'error',
    variant: 'refused-forbidden',
    dark: true,
    ready: async (page) => {
      await downloadRefusal(page);
    },
    note: 'A viewer opens the report’s line CSV (phi.export) by its URL: before UX PR 5 (co-001/ux-download-refusals) the download handler’s raw 403 JSON at /csv, with no frame; from it on, the report page again (?refused=forbidden) with the notice.',
  });
  const rpr = '/p/[practiceId]/reports/[reportId]/review';
  await cap(browser, { key: 'p.report-review', route: rpr, persona: 'reviewer', path: () => RP(`/reports/${need('report')}/review`), note: 'Signed over its files (reports.spec.ts).' });
  await cap(browser, { key: 'p.report-review', route: rpr, persona: 'reports-manager', path: () => RP(`/reports/${need('report')}/review`), state: 'error', variant: 'error-forbidden', ready: denied });
  notReached('p.report-review', 'loading', rpr, "not holdable: the report page links to the checklist only while it is unattested, and the populated report is signed");
  const rd = '/p/[practiceId]/reports/documents/[documentId]';
  await cap(browser, { key: 'p.report-document', route: rd, persona: 'pricing-manager', path: () => RP(`/reports/documents/${need('reportDocument')}`), note: 'A document reports.spec.ts printed.' });
  await cap(browser, { key: 'p.report-document', route: rd, persona: 'pricing-manager', path: () => L(`/reports/documents/${need('layoutReportDocument')}`), state: 'interaction:layout-coverage', note: 'LAYOUT’s coverage report (printed only if another spec’s worker took the job).' });
  await capLoading(browser, { key: 'p.report-document', route: rd, persona: 'pricing-manager', from: () => RP('/reports'), link: () => `a[href="${RP(`/reports/documents/${need('reportDocument')}`)}"]` });
  const mo = '/p/[practiceId]/reports/monthly';
  await cap(browser, { key: 'p.monthly', route: mo, persona: 'monitoring-manager', path: () => MN('/reports/monthly'), note: 'MONITORING with its monthly digest listed.' });
  await cap(browser, { key: 'p.monthly', route: mo, persona: 'pricing-manager', path: () => L('/reports/monthly?month=2026-03'), state: 'interaction:month', note: 'LAYOUT, March 2026.' });
  await cap(browser, { key: 'p.monthly', route: mo, persona: 'billing-manager', path: () => N('/reports/monthly'), state: 'empty' });
  await capLoading(browser, { key: 'p.monthly', route: mo, persona: 'monitoring-manager', from: () => MN('/reports'), link: () => `main a[href^="${MN('/reports/monthly')}"]` });
  const ro = '/p/[practiceId]/reports/roi';
  await cap(browser, { key: 'p.roi', route: ro, persona: 'ledger-manager', path: () => LG('/reports/roi') });
  await cap(browser, { key: 'p.roi', route: ro, persona: 'billing-manager', path: () => N('/reports/roi'), state: 'empty' });
  await capLoading(browser, { key: 'p.roi', route: ro, persona: 'ledger-manager', from: () => LG('/reports'), link: () => `main a[href="${LG('/reports/roi')}"]` });
  await cap(browser, {
    key: 'p.roi',
    route: ro,
    persona: 'ledger-manager',
    path: () => LG('/reports/roi'),
    state: 'error',
    note: 'A period ending before it starts (refused before anything is written).',
    act: async (page) => {
      await page.getByLabel('First day').fill('2026-09-30');
      await page.getByLabel('Last day').fill('2026-04-01');
      await press(page.getByRole('button', { name: 'Generate the statement' }));
      await refused(page);
    },
  });
  await cap(browser, { key: 'p.roi', route: ro, persona: 'ledger-viewer', path: () => LG('/reports/roi'), state: 'interaction:viewer' });
  const rs = '/p/[practiceId]/reports/roi/[statementId]';
  await cap(browser, { key: 'p.roi-statement', route: rs, persona: 'ledger-manager', path: () => LG(`/reports/roi/${need('roi')}`), ready: async (page) => expect(page.getByRole('heading', { level: 1 })).toContainText('ROI statement'), note: 'Legacy tour shots 19-roi-statement (1280) and 30-phone-roi-statement (390).' });
  await capLoading(browser, { key: 'p.roi-statement', route: rs, persona: 'ledger-manager', from: () => LG('/reports/roi'), link: () => `a[href="${LG(`/reports/roi/${need('roi')}`)}"]` });
  notReached('p.roi-statement', 'mismatch', rs, "'A figure is not what its entries give' needs a tampered ledger; never faked");

  // Uploads
  const up = '/p/[practiceId]/uploads';
  const receipts = async (page: Page): Promise<void> => {
    await h1(page);
    await expect(page.getByRole('table', { name: 'Receipts' }).or(page.getByRole('region', { name: 'Receipts' })).first()).toBeVisible();
  };
  await cap(browser, { key: 'p.uploads', route: up, persona: 'pricing-manager', path: () => L('/uploads'), ready: receipts, note: 'Legacy tour shot 03-uploads.' });
  await cap(browser, { key: 'p.uploads', route: up, persona: 'billing-manager', path: () => N('/uploads'), state: 'empty' });
  // Loading: the receipts list's own client fetch, held on a direct open.
  for (const width of WIDTHS) {
    const meta: Meta = { key: 'p.uploads', variant: 'loading', state: 'loading', route: up, role: 'pricing-manager', note: 'The receipts list’s client loading state: its fetch held with page.route.' };
    await attempt([idOf(meta, width)], up, async () => {
      const { page, dispose } = await open(browser, 'pricing-manager', width);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const handler = async (route: Route): Promise<void> => {
        await gate;
        await route.continue().catch(() => undefined);
      };
      try {
        await page.route('**/uploads/receipts**', handler);
        await go(page, 'pricing-manager', L('/uploads'));
        await page.locator('[data-slot="loading-state"]').first().waitFor({ state: 'visible', timeout: 15_000 });
        await snap(page, meta, { held: true });
      } finally {
        release();
        await page.unroute('**/uploads/receipts**', handler).catch(() => undefined);
        await dispose();
      }
    });
  }
  for (const width of WIDTHS) {
    const meta: Meta = { key: 'p.uploads', variant: 'error-receipts', state: 'error', route: up, role: 'pricing-manager', note: 'The receipts fetch answered 500 (page.route): the list’s error state with Try again.' };
    await attempt([idOf(meta, width)], up, async () => {
      const { page, dispose } = await open(browser, 'pricing-manager', width);
      const handler = (route: Route): Promise<void> => route.fulfill({ status: 500, body: '' });
      try {
        await page.route('**/uploads/receipts**', handler);
        await go(page, 'pricing-manager', L('/uploads'));
        await expect(page.getByText('The receipts could not be loaded').first()).toBeVisible({ timeout: 15_000 });
        await snap(page, meta);
      } finally {
        await page.unroute('**/uploads/receipts**', handler).catch(() => undefined);
        await dispose();
      }
    });
  }
  const eraKind = async (page: Page): Promise<void> => {
    await page.getByLabel('Kind of document').first().selectOption({ index: await optionIndex(page, 'Kind of document', /ERA export/i) });
  };
  await cap(browser, {
    key: 'p.uploads',
    route: up,
    persona: 'pricing-manager',
    path: () => L('/uploads'),
    ready: receipts,
    state: 'error',
    variant: 'error-era-system',
    note: 'An ERA export chosen without its system: from PR #75’s fix round it waits in the browser, the system select marked and focused (before it, refused in the browser). Nothing uploaded.',
    act: async (page) => {
      const guard = await noUploadRequest(page);
      await eraKind(page);
      await page.locator('input[type="file"]').first().setInputFiles({ name: 'export.csv', mimeType: 'text/csv', buffer: Buffer.from('SYNTHETIC\n') });
      await refused(page, /Nothing was uploaded|then upload it/);
      if ((await page.getByRole('group', { name: WAITING }).count()) > 0) {
        const system = page.getByLabel('Which system’s export');
        await expect(page.locator('#upload-format-error')).toHaveText('Choose which system’s ERA export this file is, then upload it.');
        await expect(system).toHaveAttribute('aria-invalid', 'true');
        await expect(system).toBeFocused();
      }
      guard.sent();
    },
  });
  await cap(browser, {
    key: 'p.uploads',
    route: up,
    persona: 'pricing-manager',
    path: () => L('/uploads'),
    ready: receipts,
    state: 'interaction:era-format',
    note: 'An ERA export’s system chosen: the Format unconfirmed note.',
    act: async (page) => {
      await eraKind(page);
      await page.getByLabel(/Which system/).selectOption({ index: 1 });
      await expect(page.getByText(/Format unconfirmed/).first()).toBeVisible();
    },
  });
  await cap(browser, { key: 'p.uploads', route: up, persona: 'ledger-viewer', path: () => LG('/uploads'), state: 'interaction:viewer' });
  const ud = '/p/[practiceId]/uploads/[documentId]';
  await cap(browser, { key: 'p.upload', route: ud, persona: 'pricing-manager', path: () => L(`/uploads/${need('layoutDocument')}`), note: 'CAS-08’s receipt: a clean 835.' });
  await cap(browser, { key: 'p.upload', route: ud, persona: 'ledger-manager', path: () => LG(`/uploads/${need('ledgerExportDocument')}`), state: 'interaction:export-receipt', note: 'A posting or EFT export’s receipt (no parse report card).' });
  await capLoading(browser, { key: 'p.upload', route: ud, persona: 'pricing-manager', from: () => L('/uploads'), link: () => `a[href="${L(`/uploads/${need('layoutDocument')}`)}"]` });
  notReached('p.upload', 'zip', ud, "a zip with a held file needs uploads.spec.ts, which writes NORTH (kept out of the populate set so NORTH's empty states hold)");

  // The root not-found page, signed in (any unknown practice or record ID).
  await cap(browser, { key: 'not-found', route: '/p/[practiceId]/cases', persona: 'packet-approver', path: `/p/${NO_UUID}/cases`, state: 'not-found', variant: 'signed-in', ready: notFound, note: 'app/not-found.tsx from an unknown practice ID, signed in: every route’s unknown-ID not-found renders this page.' });
});

// ---------------------------------------------------------------------------------------------------------------------
test('practice set-up', async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  const P = (key: string, rest = ''): string => `/p/${need(key)}${rest}`;

  const st = '/p/[practiceId]/settings';
  await cap(browser, { key: 'p.settings', route: st, persona: 'practice-admin', path: () => P('north', '/settings'), note: 'NORTH: the Getting started checklist.' });
  await cap(browser, { key: 'p.settings', route: st, persona: 'billing-manager', path: () => P('north', '/settings'), state: 'empty', note: 'A non-administrator: the heading, the role and the sections, no checklist.' });
  await cap(browser, { key: 'p.settings', route: st, persona: 'other-admin', path: () => P('packets', '/settings'), state: 'interaction:mostly-done', note: 'PACKETS: uploads and correspondence done (legacy probe settings).' });
  await cap(browser, { key: 'p.settings', route: st, persona: 'practice-admin', path: () => P('north', '/settings'), state: 'interaction:practice-switcher', act: SWITCHER, note: 'The practice switcher open on NORTH: the practices the administrator reaches, NORTH current.' });

  const al = '/p/[practiceId]/settings/access-log';
  await cap(browser, { key: 'p.access-log', route: al, persona: 'other-admin', path: () => P('packets', '/settings/access-log'), note: 'Legacy tour shot 26-access-log.' });
  await cap(browser, { key: 'p.access-log', route: al, persona: 'other-admin', path: () => P('packets', `/settings/access-log?object_type=claim&object_id=${NO_UUID}`), state: 'empty', note: 'Filtered to a record nobody read.' });
  await cap(browser, { key: 'p.access-log', route: al, persona: 'pricing-manager', path: () => P('layout', '/settings/access-log'), state: 'error', variant: 'error-forbidden', ready: denied });
  await cap(browser, {
    key: 'p.access-log',
    route: al,
    persona: 'other-admin',
    path: () => P('packets', '/settings/access-log'),
    state: 'interaction:record-filter',
    act: async (page) => {
      await press(page.locator('main a[href*="object_id="]').first());
      await expect(page).toHaveURL(/object_id=/);
    },
    note: 'One record’s reads (the Record link).',
  });
  await cap(browser, {
    key: 'p.access-log',
    route: al,
    persona: 'other-admin',
    path: () => P('packets', '/settings/access-log'),
    state: 'interaction:older',
    act: async (page) => {
      const older = page.getByRole('link', { name: /Older entries/ });
      if ((await older.count()) === 0) throw new Error('fewer than 50 entries on PACKETS: no Older entries link');
      await press(older.first());
      await expect(page).toHaveURL(/before=/);
    },
    note: 'Past the first 50 entries.',
  });

  const ag = '/p/[practiceId]/settings/agreements';
  await cap(browser, { key: 'p.agreements', route: ag, persona: 'practice-admin', path: () => P('north', '/settings/agreements'), note: 'NORTH: the chain (two on file, two missing) and the firm’s grant.' });
  await cap(browser, { key: 'p.agreements', route: ag, persona: 'practice-admin', path: () => P('south', '/settings/agreements'), state: 'empty', note: 'SOUTH: no grants.' });
  await cap(browser, { key: 'p.agreements', route: ag, persona: 'billing-manager', path: () => P('north', '/settings/agreements'), state: 'interaction:non-admin' });
  await notice(browser, { key: 'p.agreements', route: ag, persona: 'practice-admin', path: () => P('north', '/settings/agreements?notice=confirmed'), name: 'notice' });
  notReached('p.agreements', 'confirm-form', ag, 'the confirm form needs the terms and data-rights agreements on file, which only onboarding.spec.ts records');

  const co = '/p/[practiceId]/settings/correspondence';
  await cap(browser, { key: 'p.correspondence', route: co, persona: 'other-admin', path: () => P('packets', '/settings/correspondence'), note: 'PACKETS: the contact packets.spec.ts set.' });
  await cap(browser, { key: 'p.correspondence', route: co, persona: 'other-admin', path: () => P('other', '/settings/correspondence'), state: 'empty', note: 'SYNTHETIC OTHER PRACTICE: no contact, so no packet is exported yet.' });
  await cap(browser, { key: 'p.correspondence', route: co, persona: 'pricing-manager', path: () => P('layout', '/settings/correspondence'), state: 'interaction:read-only' });
  await cap(browser, { key: 'p.correspondence', route: co, persona: 'practice-admin', path: () => P('north', '/settings/correspondence'), state: 'interaction:set', note: 'NORTH: what the payer’s copy prints.' });
  await cap(browser, {
    key: 'p.correspondence',
    route: co,
    persona: 'other-admin',
    path: () => P('other', '/settings/correspondence'),
    state: 'error',
    note: 'An @ in Name or office (refused; nothing written).',
    act: async (page) => {
      await page.getByLabel('Name or office').fill('SYNTHETIC@OFFICE');
      await page.getByLabel('Phone', { exact: true }).fill('(919) 555-0100');
      await page.getByLabel('Street').fill('1 SYNTHETIC WAY');
      await page.getByLabel('City').fill('SYNTHETIC CITY');
      await page.getByLabel('State', { exact: true }).selectOption({ index: 1 });
      await page.getByLabel('ZIP', { exact: true }).fill('27601');
      await press(page.getByRole('button', { name: 'Save the contact' }));
      await refused(page);
    },
  });
  await notice(browser, { key: 'p.correspondence', route: co, persona: 'other-admin', path: () => P('packets', '/settings/correspondence?notice=saved'), name: 'notice' });

  const da = '/p/[practiceId]/settings/data';
  await cap(browser, { key: 'p.data', route: da, persona: 'practice-admin', path: () => P('north', '/settings/data'), note: 'A placeholder: not built yet (milestone 12).' });
  await cap(browser, { key: 'p.data', route: da, persona: 'billing-manager', path: () => P('north', '/settings/data'), state: 'interaction:non-admin' });

  const df = '/p/[practiceId]/settings/defaults';
  await cap(browser, { key: 'p.defaults', route: df, persona: 'billing-manager', path: () => P('north', '/settings/defaults'), note: 'NORTH: no pursuit cost set.' });
  await cap(browser, { key: 'p.defaults', route: df, persona: 'practice-admin', path: () => P('north', '/settings/defaults'), state: 'interaction:admin-view', note: 'The practice administrator reads them; no forms.' });
  await cap(browser, {
    key: 'p.defaults',
    route: df,
    persona: 'billing-manager',
    path: () => P('north', '/settings/defaults'),
    state: 'error',
    note: 'A staff rate without both times (refused; nothing written).',
    act: async (page) => {
      await page.getByLabel('Staff rate per hour (dollars)').fill('42.00');
      await press(page.getByRole('button', { name: 'Save pursuit cost' }));
      await refused(page);
    },
  });
  await notice(browser, { key: 'p.defaults', route: df, persona: 'billing-manager', path: () => P('north', '/settings/defaults?notice=pursuit'), name: 'notice' });

  const ps = '/p/[practiceId]/settings/pricing';
  await cap(browser, { key: 'p.pricing-settings', route: ps, persona: 'practice-admin', path: () => P('north', '/settings/pricing'), note: 'NORTH: ZIP 27601, no month waiting.' });
  await cap(browser, { key: 'p.pricing-settings', route: ps, persona: 'pricing-manager', path: () => P('layout', '/settings/pricing'), state: 'interaction:places', note: 'LAYOUT: the places of service in effect.' });
  await cap(browser, { key: 'p.pricing-settings', route: ps, persona: 'viewer', path: () => P('north', '/settings/pricing'), state: 'interaction:viewer' });
  await cap(browser, {
    key: 'p.pricing-settings',
    route: ps,
    persona: 'billing-manager',
    path: () => P('north', '/settings/pricing'),
    state: 'error',
    note: 'A four-digit ZIP (refused; nothing written).',
    act: async (page) => {
      await page.getByLabel('Billing ZIP (ZIP+4 if Medicare needs one)').fill('1234');
      await press(page.getByRole('button', { name: 'Save the billing ZIP' }));
      await refused(page);
    },
  });
  await notice(browser, { key: 'p.pricing-settings', route: ps, persona: 'practice-admin', path: () => P('north', '/settings/pricing?notice=saved'), name: 'notice' });

  const pv = '/p/[practiceId]/settings/proof-level';
  // Its default shows a real, non-zero count of lines the change would move. LEDGER's is 0 on the populated data (no line
  // is posted, so lowering its deposited level moves nothing), which read the same as the empty state (checkers,
  // 2026-10-26): the shot opens the practice of the other group (other-admin's) with the most, by the page's own count.
  let proof = { id: ids.ledger ?? '', name: 'SYNTHETIC OTHER PRACTICE LEDGER', moving: 0 };
  if (['p.proof-level.default.1280', 'p.proof-level.default.1280-dark', 'p.proof-level.default.390'].some(wanted)) proof = (await proofLevelPick()) ?? proof;
  await cap(browser, {
    key: 'p.proof-level',
    route: pv,
    persona: 'other-admin',
    path: () => `/p/${proof.id}/settings/proof-level`,
    note:
      proof.moving > 0
        ? `${proof.name}: the change would move ${String(proof.moving)} line${proof.moving === 1 ? '' : 's'}, the most of the other group's practices (LEDGER's count is 0).`
        : 'LEDGER: 0 is the real count; no practice of the other group has a line the change would move on the populated data, so this default reads like the empty state.',
  });
  await cap(browser, { key: 'p.proof-level', route: pv, persona: 'practice-admin', path: () => P('north', '/settings/proof-level'), state: 'empty', note: 'NORTH: the change would move 0 lines.' });
  await cap(browser, { key: 'p.proof-level', route: pv, persona: 'ledger-manager', path: () => P('ledger', '/settings/proof-level'), state: 'interaction:read-only' });
  await notice(browser, { key: 'p.proof-level', route: pv, persona: 'other-admin', path: () => P('ledger', '/settings/proof-level?notice=saved'), name: 'notice' });

  const sa = '/p/[practiceId]/support-access/[supportGrantId]';
  await cap(browser, { key: 'p.support-access', route: sa, persona: 'other-admin', path: () => P('other', `/support-access/${need('grantConE2E')}`), note: 'SYN-CON-E2E: the contract specialist’s reads.' });
  // The empty state needs a grant nothing was read under. MONITORING's SYN-JOURNEY-1 had 17 reads (checkers, 2026-10-26),
  // and so does every journey grant once populate has run: the grant is chosen when the shot is taken (unreadGrant).
  const emptyGrant = ['p.support-access.empty.1280', 'p.support-access.empty.390'].some(wanted) ? await unreadGrant() : undefined;
  await cap(browser, {
    key: 'p.support-access',
    route: sa,
    persona: 'other-admin',
    path: () => {
      if (emptyGrant === undefined) throw new Error('every support grant of the other group has a read (the console test opens the reviewer’s SYN-TOUR grants)');
      return `/p/${emptyGrant.practiceId}/support-access/${emptyGrant.grantId}`;
    },
    state: 'empty',
    note:
      emptyGrant === undefined
        ? ''
        : `${emptyGrant.ticket} on ${emptyGrant.name}: a grant nothing was read under when the shot was taken (every journey grant holds the journeys’ reads).`,
  });
  await cap(browser, { key: 'p.support-access', route: sa, persona: 'pricing-manager', path: () => P('layout', `/support-access/${need('grantLayout')}`), state: 'error', variant: 'error-forbidden', ready: denied });
});

// ---------------------------------------------------------------------------------------------------------------------
test('writes last, each undone', async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  const A = 'platform-admin';

  // A queued audit report (no worker runs during the capture): the report's Generating state, and the reviewer's empty checklist.
  const rpt = '/p/[practiceId]/reports/[reportId]';
  let queued = '';
  await attempt(['p.report.generating.1280', 'p.report.generating.390', 'p.report-review.empty.1280', 'p.report-review.empty.390'], rpt, async () => {
    const page = await (await desktopOf(browser, 'pricing-manager')).newPage();
    try {
      await go(page, 'pricing-manager', `/p/${need('layout')}/reports`);
      await page.getByRole('button', { name: 'Generate the report', exact: true }).click();
      await page.waitForURL(/\/reports\/[0-9a-f-]{36}/, { timeout: 20_000 });
      queued = new URL(page.url()).pathname;
      log(`WRITE audit report queued on LAYOUT: ${queued}`);
    } finally {
      await page.close();
    }
  });
  if (queued !== '') {
    await cap(browser, { key: 'p.report', route: rpt, persona: 'pricing-manager', path: queued, state: 'interaction:generating', note: 'Generated from LAYOUT’s run with no worker running: the report waits in Generating.' });
    await cap(browser, { key: 'p.report-review', route: '/p/[practiceId]/reports/[reportId]/review', persona: 'reviewer', path: `${queued}/review`, state: 'empty', note: 'The queued report’s checklist: it opens once the report is ready (the reviewer’s SYN-TOUR-4 grant on LAYOUT).' });
  }

  // The SYN-CON-E2E grant ended (after every specialist shot): the console row and the administrator's page.
  const su = '/console/support';
  await attempt(['console.support.ended.1280'], su, async () => {
    const page = await (await desktopOf(browser, A)).newPage();
    try {
      await go(page, A, su);
      const row = page.locator('tr[data-ticket="SYN-CON-E2E"]').first();
      const end = row.getByRole('button', { name: 'End now' });
      if ((await end.count()) > 0) {
        await end.click();
        await expect(row).toContainText('Ended');
        log('WRITE SYN-CON-E2E ended');
      }
      await snap(page, { key: 'console.support', variant: 'ended', state: 'interaction:ended', route: su, role: A, note: 'SYN-CON-E2E ended (after every specialist shot).' });
    } finally {
      await page.close();
    }
  });
  await cap(browser, { key: 'console.support', route: su, persona: A, path: su, state: 'interaction:ended', widths: [390] });
  await cap(browser, { key: 'p.support-access', route: '/p/[practiceId]/support-access/[supportGrantId]', persona: 'other-admin', path: () => `/p/${need('other')}/support-access/${need('grantConE2E')}`, state: 'interaction:ended', note: 'The grant after the platform administrator ended it.' });

  // The firm suspended, shot, reinstated (it owns no practice another shot uses).
  const org = '/console/organizations/[organizationId]';
  await attempt(['console.organization.suspended.1280', 'console.organization.suspended.390', 'settings.billing-org.suspended.1280', 'settings.billing-org.suspended.390'], org, async () => {
    const page = await (await desktopOf(browser, A)).newPage();
    const firmPath = `/console/organizations/${need('firm')}`;
    try {
      await go(page, A, firmPath);
      await page.getByRole('button', { name: 'Suspend the organization' }).click();
      await expect(page.getByRole('button', { name: 'Reinstate the organization' })).toBeVisible();
      log('WRITE SYNTHETIC BILLING FIRM suspended');
      try {
        await snap(page, { key: 'console.organization', variant: 'suspended', state: 'interaction:suspended', route: org, role: A, note: 'SYNTHETIC BILLING FIRM suspended, then reinstated at once.' });
        await cap(browser, { key: 'console.organization', route: org, persona: A, path: firmPath, state: 'interaction:suspended', widths: [390] });
        await cap(browser, { key: 'settings.billing-org', route: '/settings/billing/[organizationId]', persona: 'firm-principal', path: `/settings/billing/${need('firm')}`, state: 'interaction:suspended', note: 'The firm’s billing while it is suspended: New runs have stopped.' });
      } finally {
        await go(page, A, firmPath);
        await page.getByRole('button', { name: 'Reinstate the organization' }).click();
        await expect(page.getByRole('button', { name: 'Suspend the organization' })).toBeVisible();
        log('WRITE SYNTHETIC BILLING FIRM reinstated');
      }
    } finally {
      await page.close();
    }
  });

  // PACKETS' own organization suspended, shot, reinstated (PR #85's sample, gaps 6 and 9): uploadGate reads the practice's
  // own organization, so the firm's suspension above gates nothing. While it lasts, the letter field's hint for a person
  // who cannot upload here and the uploader's "Uploads are paused" note show on PACKETS' submissions, and the same note on
  // its Contracts and Reconciliation panels (from PR #85; before it those two panels stay open). Reinstated in finally,
  // after the last practice shot of the run; the unmapped plan test after this one needs the organization active.
  const pausedIds = ['p.submissions', 'p.contracts', 'p.reconciliation'].flatMap((key) => [`${key}.uploads-paused.1280`, `${key}.uploads-paused.390`, `${key}.uploads-paused.1280-dark`]);
  if (pausedIds.some(wanted)) {
    const packetsOrganization = await one('SELECT organization_id AS id FROM practice WHERE id = $1', [ids.packets ?? '']);
    const pausedNote = (where: string): string => `${where} while SYNTHETIC OTHER PRACTICE PACKETS’ own organization is suspended (then reinstated at once).`;
    await attempt(pausedIds, org, async () => {
      if (packetsOrganization === '') throw new Error('no organization found for SYNTHETIC OTHER PRACTICE PACKETS');
      const page = await (await desktopOf(browser, A)).newPage();
      const orgPath = `/console/organizations/${packetsOrganization}`;
      try {
        await go(page, A, orgPath);
        await page.getByRole('button', { name: 'Suspend the organization' }).click();
        await expect(page.getByRole('button', { name: 'Reinstate the organization' })).toBeVisible();
        log("WRITE PACKETS' organization suspended");
        try {
          const P = (rest: string): string => `/p/${need('packets')}${rest}`;
          await cap(browser, { key: 'p.submissions', route: '/p/[practiceId]/cases/[caseId]/submissions', persona: 'packet-approver', path: () => P(`/cases/${need('packetsCase')}/submissions`), state: 'interaction:uploads-paused', dark: true, note: pausedNote('PACKETS’ submissions') });
          await cap(browser, { key: 'p.contracts', route: '/p/[practiceId]/contracts', persona: 'packet-approver', path: () => P('/contracts'), state: 'interaction:uploads-paused', dark: true, note: pausedNote('PACKETS’ contracts') });
          await cap(browser, { key: 'p.reconciliation', route: '/p/[practiceId]/reconciliation', persona: 'packet-approver', path: () => P('/reconciliation'), state: 'interaction:uploads-paused', dark: true, note: pausedNote('PACKETS’ reconciliation') });
        } finally {
          await go(page, A, orgPath);
          await page.getByRole('button', { name: 'Reinstate the organization' }).click();
          await expect(page.getByRole('button', { name: 'Suspend the organization' })).toBeVisible();
          log("WRITE PACKETS' organization reinstated");
        }
      } finally {
        await page.close();
      }
    }, 480_000);
  }

  // A new, empty practice group (the console's own create): No practices yet, No members yet.
  await attempt(['console.organization.empty-new-group.1280', 'console.organization.empty-new-group.390'], org, async () => {
    const page = await (await desktopOf(browser, A)).newPage();
    try {
      let groupPath = '';
      const existing = await one("SELECT id FROM organization WHERE name = 'SYNTHETIC CONSOLE EMPTY GROUP'");
      if (existing !== '') {
        groupPath = `/console/organizations/${existing}`;
      } else {
        await go(page, A, '/console/organizations');
        await page.getByLabel('Kind').selectOption({ index: await optionIndex(page, 'Kind', /group/i) });
        await page.getByLabel('Name', { exact: true }).fill('SYNTHETIC CONSOLE EMPTY GROUP');
        await press(page.getByRole('button', { name: 'Create organization' }));
        await page.waitForURL(/\/console\/organizations\/[0-9a-f-]{36}/);
        groupPath = new URL(page.url()).pathname;
        log('WRITE SYNTHETIC CONSOLE EMPTY GROUP created');
      }
      await cap(browser, { key: 'console.organization', route: org, persona: A, path: groupPath, state: 'empty', variant: 'empty-new-group', note: 'A group created in the run: No practices yet, No members yet.' });
    } finally {
      await page.close();
    }
  });

  // The lockout persona locked by ten wrong passwords, then its hardware-key refusal.
  const si = '/sign-in';
  await attempt(['sign-in.error-locked.1280', 'sign-in.error-locked.390', 'sign-in-hardware-key.error-locked.1280', 'sign-in-hardware-key.error-locked.390'], si, async () => {
    for (const width of WIDTHS) {
      await attempt([`sign-in.error-locked.${String(width)}`], si, async () => {
        const { page, dispose } = await open(browser, null, width);
        try {
          for (let tries = 0; tries < 12; tries += 1) {
            await page.goto(si);
            await page.getByLabel('Email').fill(personaEmail('lockout'));
            await page.getByLabel('Password').fill('Wrong-Synthetic-Pass-2026!');
            await page.getByRole('button', { name: 'Continue' }).click();
            await refused(page);
            if ((await page.locator('[data-slot="alert"], [role="alert"]').filter({ hasText: 'Account locked' }).count()) > 0) break;
          }
          await expect(page.locator('[data-slot="alert"], [role="alert"]').filter({ hasText: 'Account locked' }).first()).toBeVisible();
          await snap(page, { key: 'sign-in', variant: 'error-locked', state: 'error', route: si, role: 'public', note: 'The lockout persona after ten wrong synthetic passwords.' });
        } finally {
          await dispose();
        }
      });
    }
    await cap(browser, {
      key: 'sign-in-hardware-key',
      route: '/sign-in/hardware-key',
      persona: null,
      path: '/sign-in/hardware-key',
      state: 'error',
      variant: 'error-locked',
      note: 'The locked account’s email typed on the key sign-in.',
      act: async (page) => {
        await page.getByLabel('Email').fill(personaEmail('lockout'));
        await page.getByRole('button', { name: 'Sign in with hardware key' }).click();
        await refused(page, /Account locked/);
      },
    });
  });

  // Maintenance on, the screens it changes, then off at once (the flag is cached up to 5 s per server process).
  const cs = '/console/status';
  const ids4 = ['console.status.maintenance-on.1280', 'console.status.maintenance-on.390', 'maintenance.on.1280', 'maintenance.on.390', 'maintenance.redirected.1280', 'status.maintenance.1280', 'status.maintenance.390'];
  await attempt(ids4, cs, async () => {
    const page = await (await desktopOf(browser, A)).newPage();
    try {
      await go(page, A, cs);
      await page.getByRole('button', { name: 'Turn maintenance on' }).click();
      await expect(page.getByRole('button', { name: 'Turn maintenance off' })).toBeVisible();
      log('WRITE maintenance on');
      try {
        await snap(page, { key: 'console.status', variant: 'maintenance-on', state: 'interaction:maintenance-on', route: cs, role: A, note: 'Maintenance on (turned off again at once).' });
        await cap(browser, { key: 'console.status', route: cs, persona: A, path: cs, state: 'interaction:maintenance-on', widths: [390] });
        await page.waitForTimeout(6_000);
        await cap(browser, { key: 'maintenance', route: '/maintenance', persona: null, path: '/maintenance', state: 'interaction:on', note: 'Maintenance on (an operator step, undone at once).' });
        await cap(browser, { key: 'maintenance', route: '/maintenance', persona: 'billing-manager', path: '/', state: 'interaction:redirected', widths: [1280], ready: async (p) => expect(p).toHaveURL(/\/maintenance/), note: 'A customer’s / lands on /maintenance while it is on.' });
        await cap(browser, { key: 'status', route: '/status', persona: null, path: '/status', state: 'interaction:maintenance', note: 'The public status line while maintenance is on.' });
      } finally {
        await go(page, A, cs);
        const off = page.getByRole('button', { name: 'Turn maintenance off' });
        if ((await off.count()) > 0) await off.click();
        await expect(page.getByRole('button', { name: 'Turn maintenance on' })).toBeVisible();
        log('WRITE maintenance off');
        await page.waitForTimeout(6_000);
      }
    } finally {
      await page.close();
    }
  });
  notReached('status', 'degraded', '/status', 'a degraded component and an incident are optional operator writes; not taken');
});

// ---------------------------------------------------------------------------------------------------------------------
/**
 * An unmapped plan beside mapped ones (combined audit #32, co-001/unmapped-plan; designs/lane-b-unmapped-plan.md §9).
 * No populate spec leaves a plan with lines and no mapping in a practice whose other plans are mapped and priced, so this
 * test makes one, last, because it adds a payer and a plan to LAYOUT: as pricing-manager it uploads the SYNTHETIC MAP-01
 * remittance (CE:SYNPLAN-UNMAPPED-01, SYNTHETIC PAYER M, two claims of 2026-03-12, in the March LAYOUT has priced) with
 * the e2e worker running (e2e/worker.ts, as e2e/mapping.spec.ts does; the monitor is a placeholder for LAYOUT, so nothing
 * prices on its own). Then, with the plan unmapped: Home, Coverage, Pricing runs, the mapping list's default view and the
 * plan's page; a coverage report generated from Coverage (its web view); a run created for March on screen (refused while
 * an unmapped plan blocks pricing, before #32; from it, the run is created and priced, and the shot is the page it lands
 * on); the latest complete March run's page. Then the plan mapped on screen as no agreement from 2026-01-01 (the page it
 * lands on), and Home, Coverage, Pricing runs and the mapping list again. Every step accepts either version's words: it
 * waits on headings, the URL and the refusal, never on the new regions. The upload, the run and the mapping are writes on
 * the tour database that are not undone, so the unmapped states retake only on a fresh prepare (the step says so).
 */
test('an unmapped plan on LAYOUT, last', async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  const PM = 'pricing-manager';
  const UNMAPPED_PLAN = 'CE:SYNPLAN-UNMAPPED-01';
  const prefixes = ['p.home.unmapped-plan', 'p.coverage.unmapped-plan', 'p.pricing-runs.unmapped-plan', 'p.pricing-run.unmapped-plan', 'p.mapping.unmapped-plan', 'p.plan.unmapped-plan', 'p.report-document.unmapped-plan'];
  if (!prefixes.some(wantedPrefix)) return;
  const layout = await one('SELECT id FROM practice WHERE name = $1', ['SYNTHETIC OTHER PRACTICE LAYOUT']);
  const L = (rest = ''): string => `/p/${layout}${rest}`;
  const planRow = async (): Promise<{ id: string; mapped: boolean }> =>
    withDatabase(async (client) => {
      const row = (
        await client.query<{ id: string; mapped: boolean }>(
          'SELECT p.id, EXISTS (SELECT 1 FROM payer_plan_mapping m WHERE m.plan_id = p.id) AS mapped FROM plan p WHERE p.practice_id = $1 AND p.plan_key = $2',
          [layout, UNMAPPED_PLAN],
        )
      ).rows[0];
      return { id: row?.id ?? '', mapped: row?.mapped ?? false };
    });
  const allIds = (variant: string, key: string): string[] => [`${key}.${variant}.1280`, `${key}.${variant}.1280-dark`, `${key}.${variant}.390`];
  const unmappedIds = [
    ...['p.home', 'p.coverage', 'p.pricing-runs', 'p.mapping', 'p.plan', 'p.pricing-run', 'p.report-document'].flatMap((key) => allIds('unmapped-plan', key)),
    ...allIds('unmapped-plan-create', 'p.pricing-runs'),
  ];
  const mappedIds = ['p.home', 'p.coverage', 'p.pricing-runs', 'p.mapping', 'p.plan'].flatMap((key) => allIds('unmapped-plan-mapped', key));
  const giveUp = (shotIds: readonly string[], route: string, reason: string): void => {
    for (const id of shotIds) skip(id, route, reason);
  };
  if (layout === '') {
    giveUp([...unmappedIds, ...mappedIds], '/p/[practiceId]', 'no SYNTHETIC OTHER PRACTICE LAYOUT on this database (layout-1280.spec.ts)');
    return;
  }

  const local = await startLocalWorker();
  try {
    // The upload, once per database.
    let plan = await planRow();
    if (plan.id === '') {
      const page = await (await desktopOf(browser, PM)).newPage();
      try {
        await go(page, PM, L('/uploads'));
        await page.getByLabel('Choose files to upload').setInputFiles([{ name: 'unmapped-plan.835', mimeType: 'application/octet-stream', buffer: readFileSync(`${SCREENS}/fixtures/synthetic/MAP-01/remit.835`) }]);
        await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'unmapped-plan.835' })).toContainText('Loaded 1 remittance', { timeout: 120_000 });
        log('WRITE MAP-01 loaded on LAYOUT (an unmapped plan beside the mapped ones)');
      } catch (error) {
        log(`RECORDS MAP-01 not loaded on LAYOUT: ${reasonOf(error)}`);
      } finally {
        await page.close();
      }
      plan = await planRow();
    }
    if (plan.id === '') {
      giveUp([...unmappedIds, ...mappedIds], '/p/[practiceId]/mapping/[planId]', `${UNMAPPED_PLAN} is not on LAYOUT: the MAP-01 upload did not load (see progress.log)`);
      return;
    }
    ids.planUnmapped = plan.id;
    log(`RECORDS planUnmapped ${plan.id}${plan.mapped ? ' (already mapped on this database)' : ''}`);
    const note = (what: string): string => `LAYOUT with ${UNMAPPED_PLAN} (SYNTHETIC MAP-01, payer M, March 2026) loaded and not mapped, beside its mapped plans: ${what}`;
    const mappedNote = (what: string): string => `LAYOUT after ${UNMAPPED_PLAN} was mapped on screen as no agreement from 2026-01-01: ${what}`;

    if (plan.mapped) {
      giveUp(unmappedIds, '/p/[practiceId]/mapping/[planId]', `${UNMAPPED_PLAN} is already mapped on this database (an earlier run mapped it): retake the unmapped states on a fresh prepare`);
    } else {
      await cap(browser, { key: 'p.home', route: '/p/[practiceId]', persona: PM, path: () => L(), state: 'interaction:unmapped-plan', dark: true, note: note('the practice home.') });
      await cap(browser, { key: 'p.coverage', route: '/p/[practiceId]/coverage', persona: PM, path: () => L('/coverage'), state: 'interaction:unmapped-plan', dark: true, note: note('Coverage.') });
      await cap(browser, { key: 'p.pricing-runs', route: '/p/[practiceId]/pricing-runs', persona: PM, path: () => L('/pricing-runs'), state: 'interaction:unmapped-plan', dark: true, note: note('Pricing runs.') });
      await cap(browser, { key: 'p.mapping', route: '/p/[practiceId]/mapping', persona: PM, path: () => L('/mapping'), state: 'interaction:unmapped-plan', dark: true, note: note('the default view (waiting on mapping).') });
      await cap(browser, { key: 'p.plan', route: '/p/[practiceId]/mapping/[planId]', persona: PM, path: () => L(`/mapping/${plan.id}`), state: 'interaction:unmapped-plan', dark: true, note: note('the unmapped plan’s page.') });

      // A coverage report generated now (a write: one report document), its web view at both widths.
      const rd = '/p/[practiceId]/reports/documents/[documentId]';
      let documentPath = '';
      await attempt(allIds('unmapped-plan', 'p.report-document'), rd, async () => {
        const page = await (await desktopOf(browser, PM)).newPage();
        try {
          await go(page, PM, L('/coverage'));
          await press(page.getByRole('region', { name: 'Coverage report' }).getByRole('button', { name: 'Generate the coverage report' }));
          await page.waitForURL(/\/reports\/documents\/[0-9a-f-]{36}$/, { timeout: 30_000 });
          documentPath = new URL(page.url()).pathname;
          log(`WRITE coverage report generated on LAYOUT: ${documentPath}`);
          // The page is not live: reload until the e2e worker has printed it (as reports.spec.ts's printed() does). The
          // before run of PR #32 (83d71fd6) waited 90 s here without a reload although the PDF had printed.
          await expect(async () => {
            await page.reload();
            await expect(page.locator('[data-document-status="ready"]').first()).toBeVisible({ timeout: 1_000 });
          })
            .toPass({ timeout: 90_000 })
            .catch(() => log('RECORDS the coverage report did not print within 90 s; its web view is shot as it stands'));
        } finally {
          await page.close();
        }
      });
      if (documentPath !== '') {
        await cap(browser, { key: 'p.report-document', route: rd, persona: PM, path: documentPath, state: 'interaction:unmapped-plan', dark: true, note: note('a coverage report generated from Coverage, its web view (the printed PDF carries the same sentence; not shot).') });
      }

      // A run created for March on screen: refused before #32; from it, created and priced. At 390 px after a run was
      // created at 1280, the page it landed on is opened instead of creating a second run.
      const rn = '/p/[practiceId]/pricing-runs';
      const createMeta: Meta = { key: 'p.pricing-runs', variant: 'unmapped-plan-create', state: 'interaction:unmapped-plan-create', route: rn, role: PM, note: note('Create the run pressed for March 2026 (blank last month): before #32 the refusal on Pricing runs; from it, the page the new run lands on.') };
      let landed = '';
      for (const width of WIDTHS) {
        await attempt([idOf(createMeta, width), ...(width === 1280 ? [idOf(createMeta, width, true)] : [])], rn, async () => {
          const { page, dispose } = await open(browser, PM, width);
          try {
            if (landed !== '') {
              await go(page, PM, landed);
              await h1(page);
              await snap(page, { ...createMeta, note: `${createMeta.note ?? ''} At 390 px the page the 1280 px press landed on (no second run).` }, { dark: true });
              return;
            }
            await go(page, PM, L('/pricing-runs'));
            await h1(page);
            await page.getByLabel('First month of service').fill('2026-03');
            await press(page.getByRole('button', { name: 'Create the run' }));
            const outcome = await Promise.any([
              refused(page).then(() => 'refused' as const),
              page.waitForURL(/\/pricing-runs\/[0-9a-f-]{36}/, { timeout: 30_000 }).then(() => 'created' as const),
            ]).catch(() => {
              throw new Error(`Create the run neither refused nor landed on a run within 30 s (${shown(page)})`);
            });
            if (outcome === 'created') {
              landed = shown(page);
              log(`WRITE a March run created on LAYOUT: ${landed}`);
              // Priced by the e2e worker: wait (bounded) for the run to leave queued and running, then reload.
              const runId = /\/pricing-runs\/([0-9a-f-]{36})/.exec(landed)?.[1] ?? '';
              for (let tries = 0; tries < 60; tries += 1) {
                const status = await one('SELECT status AS id FROM pricing_run WHERE id = $1', [runId]);
                if (status !== 'queued' && status !== 'running') break;
                await page.waitForTimeout(2_000);
              }
              await go(page, PM, landed);
              await h1(page);
            } else {
              log('RECORDS the March run was refused (nothing written)');
            }
            await snap(page, createMeta, { dark: true });
          } finally {
            await dispose();
          }
        });
      }

      // The latest complete March run's page (before #32 the run priced before the upload; from it, the new run).
      await cap(browser, {
        key: 'p.pricing-run',
        route: '/p/[practiceId]/pricing-runs/[runId]',
        persona: PM,
        path: async () => {
          const runId = await one("SELECT id FROM pricing_run WHERE practice_id = $1 AND period_from = '2026-03-01' AND status = 'complete' ORDER BY created_at DESC LIMIT 1", [layout]);
          if (runId === '') throw new Error('no complete March run on LAYOUT');
          return L(`/pricing-runs/${runId}`);
        },
        state: 'interaction:unmapped-plan',
        dark: true,
        note: note('the latest complete March run (before #32 the run priced before the upload, as nothing could run since; from it, the run created on screen above).'),
      });
    }

    // The plan mapped on screen at 1280 (as e2e/mapping.spec.ts does); at 390 the page it landed on.
    const pl = '/p/[practiceId]/mapping/[planId]';
    const mappedMeta: Meta = { key: 'p.plan', variant: 'unmapped-plan-mapped', state: 'interaction:unmapped-plan-mapped', route: pl, role: PM, note: mappedNote('Save the mapping pressed; the page it lands on.') };
    let mappedAt = '';
    for (const width of WIDTHS) {
      await attempt([idOf(mappedMeta, width), ...(width === 1280 ? [idOf(mappedMeta, width, true)] : [])], pl, async () => {
        const { page, dispose } = await open(browser, PM, width);
        try {
          if (mappedAt === '') {
            if ((await planRow()).mapped) throw new Error(`${UNMAPPED_PLAN} was mapped by an earlier run on this database: retake on a fresh prepare`);
            await go(page, PM, L(`/mapping/${plan.id}`));
            await h1(page);
            await page.getByLabel('Agreement', { exact: true }).selectOption({ label: 'No agreement (out of network)' });
            await page.getByLabel('Effective from', { exact: true }).fill('2026-01-01');
            await press(page.getByRole('button', { name: 'Save the mapping' }));
            await expect(page.locator('[data-notice]').first()).toBeVisible({ timeout: 20_000 });
            mappedAt = shown(page);
            log(`WRITE ${UNMAPPED_PLAN} mapped on LAYOUT as no agreement: ${mappedAt}`);
            await snap(page, mappedMeta, { dark: true });
          } else {
            await go(page, PM, mappedAt);
            await h1(page);
            await snap(page, { ...mappedMeta, note: `${mappedMeta.note ?? ''} At 390 px the URL the 1280 px save landed on.` }, { dark: true });
          }
        } finally {
          await dispose();
        }
      });
    }
    if ((await planRow()).mapped) {
      // Let a job the mapping queued (from #32 on) finish before the shots; the monitor is a placeholder for LAYOUT.
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      await cap(browser, { key: 'p.home', route: '/p/[practiceId]', persona: PM, path: () => L(), state: 'interaction:unmapped-plan-mapped', dark: true, note: mappedNote('the practice home.') });
      await cap(browser, { key: 'p.coverage', route: '/p/[practiceId]/coverage', persona: PM, path: () => L('/coverage'), state: 'interaction:unmapped-plan-mapped', dark: true, note: mappedNote('Coverage.') });
      await cap(browser, { key: 'p.pricing-runs', route: '/p/[practiceId]/pricing-runs', persona: PM, path: () => L('/pricing-runs'), state: 'interaction:unmapped-plan-mapped', dark: true, note: mappedNote('Pricing runs.') });
      await cap(browser, { key: 'p.mapping', route: '/p/[practiceId]/mapping', persona: PM, path: () => L('/mapping'), state: 'interaction:unmapped-plan-mapped', dark: true, note: mappedNote('the default view (waiting on mapping).') });
    } else {
      giveUp(mappedIds.filter((id) => !id.startsWith('p.plan.')), '/p/[practiceId]', `${UNMAPPED_PLAN} could not be mapped in this run (see its skip)`);
    }
  } finally {
    await local.close();
  }
});

/**
 * A restricted run (TOUR_ONLY): each id it names in full that this run neither took nor skipped is recorded as skipped,
 * so a mistyped id, or a dark id whose step failed after its light shot, is never silently missing from shots.json.
 */
function unreached(): void {
  for (const id of ONLY) {
    if (id.endsWith('*') || taken.has(id) || skipped.some((item) => item.shot === id)) continue;
    skip(id, shots.find((item) => item.id === id)?.routePattern ?? '', 'named in TOUR_ONLY, but no step of this run took it (check its key and variant in capture/tour.spec.ts, and the step’s other skips)');
  }
}

/** Every reachable route in the map has a shot, and every not-reachable one is listed with the map's reason. */
function coverageCheck(): void {
  if (!existsSync(ROUTE_MAP)) {
    log(`COVERAGE not checked: no route map at ${ROUTE_MAP}`);
    return;
  }
  const map = JSON.parse(readFileSync(ROUTE_MAP, 'utf8')) as { route: string; reachable: string; notReachableReason: string }[];
  const shotRoutes = new Set(shots.map((item) => item.routePattern));
  for (let index = skipped.length - 1; index >= 0; index -= 1) if (skipped[index]?.shot.startsWith('route:') === true) skipped.splice(index, 1);
  let missing = 0;
  for (const entry of map) {
    if (entry.reachable === 'not-reachable') {
      skip(`route:${entry.route}`, entry.route, `not reachable (route map): ${entry.notReachableReason}`.slice(0, 300));
    } else if (!shotRoutes.has(entry.route)) {
      missing += 1;
      skip(`route:${entry.route}`, entry.route, 'no shot of this reachable route was taken in this run (see the skips of its shots)');
    }
  }
  log(`COVERAGE ${String(map.filter((entry) => entry.reachable !== 'not-reachable').length - missing)} of ${String(map.filter((entry) => entry.reachable !== 'not-reachable').length)} reachable routes shot`);
}
