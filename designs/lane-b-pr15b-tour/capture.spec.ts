import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { type Browser, type BrowserContext, type Page, test } from '@playwright/test';

import { registerKeyAndSignIn, signInWithTotp } from '/home/user/screens/apps/web/e2e/helpers';

/**
 * PR 15b's before/after capture (designs/lane-b-pr15b-tour; design 5.1), after ledger-tour.spec.ts populated the
 * LED-14, LED-15 and LED-18 practices (their ids in $TOUR_DIR/led-<case>.json). The sign-in and shots.json pattern of
 * tools/lane-b-screen-tour/capture/tour.spec.ts: each route at 1280x800 and 390x844 (mobile), light, full page, device
 * scale factor 1; the same file names in both runs so they pair. The ledger manager shoots the practice's pages; the
 * contract specialist (hardware key, under the journey's support grant) the specialist's ledger review. The audit
 * report's and the ROI statement's PDFs (route handlers, not pages) are rendered with pdftoppm, pages 1 and 2, 1280 px
 * wide, after every page shot (a download is recorded in the Reports screen's export history). The fix round's re-check adds
 * LED-15's mixed variant (led-15mixed.json: reconciliation, reconciliation-case, case) and LED-18's "Log a payer response"
 * region alone (case-submissions-form). Synthetic data only.
 */

const OUT = process.env.TOUR_DIR ?? '';
if (OUT === '') throw new Error('Set TOUR_DIR');
const PNG = `${OUT}/png`;
const PROGRESS = `${OUT}/progress.log`;
const SHOTS_JSON = `${OUT}/shots.json`;
mkdirSync(PNG, { recursive: true });

const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const CASES = ['14', '15', '18'] as const;

interface Shot { file: string; id: string; name: string; path: string; routePattern: string; practice: string; role: string; width: number; theme: 'light'; note: string }
interface Skip { shot: string; route: string; practice: string; reason: string }
const shots: Shot[] = [];
const skipped: Skip[] = [];

function log(line: string): void {
  appendFileSync(PROGRESS, `${new Date().toISOString().slice(11, 19)} ${line}\n`);
}
function flush(): void {
  writeFileSync(SHOTS_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), shots, skipped }, null, 2));
}
function reasonOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-control-regex
  return (text.replace(/\u001b\[[0-9;]*m/g, '').split('\n').find((line) => line.trim() !== '') ?? 'failed').trim().slice(0, 300);
}

function idsOf(caseKey: string): Record<string, string> {
  const file = `${OUT}/led-${caseKey}.json`;
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>) : {};
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(400);
}

interface Persona { readonly role: string; readonly desktop: BrowserContext; readonly phone: BrowserContext }

async function persona(browser: Browser, role: string, internal: boolean): Promise<Persona> {
  const desktop = await browser.newContext(DESKTOP);
  const page = await desktop.newPage();
  if (internal) await registerKeyAndSignIn(page, role);
  else await signInWithTotp(page, role);
  await page.close();
  const phone = await browser.newContext({ ...PHONE, storageState: await desktop.storageState() });
  return { role, desktop, phone };
}

async function shoot(who: Persona, caseKey: string, key: string, routePattern: string, path: string | undefined, note = ''): Promise<void> {
  for (const width of [1280, 390] as const) {
    const name = `led${caseKey}.${key}.${String(width)}`;
    if (path === undefined || path.includes('undefined')) {
      skipped.push({ shot: name, route: routePattern, practice: `LED-${caseKey}`, reason: 'the record it opens was not made by the populate step' });
      log(`SKIP ${name}`);
      continue;
    }
    const page = await (width === 1280 ? who.desktop : who.phone).newPage();
    try {
      const response = await page.goto(path, { waitUntil: 'load' });
      await settle(page);
      const file = `${PNG}/${name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      shots.push({ file, id: name, name, path, routePattern, practice: `LED-${caseKey}`, role: who.role, width, theme: 'light', note: `${note}${note === '' ? '' : ' '}HTTP ${String(response?.status() ?? 0)}` });
      log(`SHOT ${name} ${path} ${String(response?.status() ?? 0)}`);
    } catch (error) {
      skipped.push({ shot: name, route: routePattern, practice: `LED-${caseKey}`, reason: reasonOf(error) });
      log(`SKIP ${name}: ${reasonOf(error)}`);
    } finally {
      await page.close();
    }
    flush();
  }
}

/** One region of a page, shot alone (an element screenshot) so its words read at full size: the UX re-check's form. */
async function shootRegion(who: Persona, caseKey: string, key: string, routePattern: string, path: string | undefined, region: string, note = ''): Promise<void> {
  for (const width of [1280, 390] as const) {
    const name = `led${caseKey}.${key}.${String(width)}`;
    if (path === undefined || path.includes('undefined')) {
      skipped.push({ shot: name, route: routePattern, practice: `LED-${caseKey}`, reason: 'the record it opens was not made by the populate step' });
      log(`SKIP ${name}`);
      continue;
    }
    const page = await (width === 1280 ? who.desktop : who.phone).newPage();
    try {
      const response = await page.goto(path, { waitUntil: 'load' });
      await settle(page);
      const file = `${PNG}/${name}.png`;
      await page.getByRole('region', { name: region }).screenshot({ path: file });
      shots.push({ file, id: name, name, path, routePattern, practice: `LED-${caseKey}`, role: who.role, width, theme: 'light', note: `${note}${note === '' ? '' : ' '}The region "${region}" alone. HTTP ${String(response?.status() ?? 0)}` });
      log(`SHOT ${name} ${path} ${String(response?.status() ?? 0)}`);
    } catch (error) {
      skipped.push({ shot: name, route: routePattern, practice: `LED-${caseKey}`, reason: reasonOf(error) });
      log(`SKIP ${name}: ${reasonOf(error)}`);
    } finally {
      await page.close();
    }
    flush();
  }
}

async function pdfPages(who: Persona, caseKey: string, key: string, routePattern: string, path: string | undefined, pages: number): Promise<void> {
  const names = Array.from({ length: pages }, (_, index) => `led${caseKey}.${key}.page${String(index + 1)}.1280`);
  if (path === undefined || path.includes('undefined')) {
    for (const name of names) skipped.push({ shot: name, route: routePattern, practice: `LED-${caseKey}`, reason: 'the record it opens was not made by the populate step' });
    return;
  }
  const page = await who.desktop.newPage();
  try {
    const response = await page.request.get(path);
    if (response.status() !== 200) throw new Error(`HTTP ${String(response.status())}`);
    const pdf = `${OUT}/pdf/led${caseKey}.${key}.pdf`;
    mkdirSync(`${OUT}/pdf`, { recursive: true });
    writeFileSync(pdf, await response.body());
    const count = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf]).toString())?.[1] ?? '1');
    for (const [index, name] of names.entries()) {
      if (index + 1 > count) {
        skipped.push({ shot: name, route: routePattern, practice: `LED-${caseKey}`, reason: `the PDF has ${String(count)} page(s)` });
        continue;
      }
      execFileSync('pdftoppm', ['-png', '-f', String(index + 1), '-l', String(index + 1), '-singlefile', '-scale-to-x', '1280', '-scale-to-y', '-1', pdf, `${PNG}/${name}`]);
      shots.push({ file: `${PNG}/${name}.png`, id: name, name, path: `${path} (page ${String(index + 1)} of ${String(count)})`, routePattern, practice: `LED-${caseKey}`, role: who.role, width: 1280, theme: 'light', note: 'A route handler’s PDF, rendered 1280 px wide with pdftoppm.' });
      log(`SHOT ${name} ${path}`);
    }
  } catch (error) {
    for (const name of names) skipped.push({ shot: name, route: routePattern, practice: `LED-${caseKey}`, reason: reasonOf(error) });
    log(`SKIP ${key} pdf: ${reasonOf(error)}`);
  } finally {
    await page.close();
    flush();
  }
}

test('PR 15b screens for LED-14, LED-15 and LED-18', async ({ browser }) => {
  test.setTimeout(1_500_000);
  const manager = await persona(browser, 'ledger-manager', false);
  let specialist: Persona | undefined;
  try {
    specialist = await persona(browser, 'contract-specialist', true);
  } catch (error) {
    log(`SPECIALIST sign-in failed: ${reasonOf(error)}`);
  }
  for (const caseKey of CASES) {
    const ids = idsOf(caseKey);
    const P = ids.practiceId === undefined ? undefined : `/p/${ids.practiceId}`;
    const at = (suffix: string, ...need: (string | undefined)[]) => (P === undefined || need.some((item) => item === undefined) ? undefined : `${P}${suffix}`);
    await shoot(manager, caseKey, 'dashboard', '/p/[practiceId]', at(''));
    await shoot(manager, caseKey, 'reconciliation', '/p/[practiceId]/reconciliation', at('/reconciliation'));
    await shoot(manager, caseKey, 'reconciliation-case', '/p/[practiceId]/reconciliation?case=[caseId]', at(`/reconciliation?case=${ids.caseId}`, ids.caseId));
    await shoot(manager, caseKey, 'case', '/p/[practiceId]/cases/[caseId]', at(`/cases/${ids.caseId}`, ids.caseId));
    await shoot(manager, caseKey, 'case-submissions', '/p/[practiceId]/cases/[caseId]/submissions', at(`/cases/${ids.caseId}/submissions`, ids.caseId));
    await shoot(manager, caseKey, 'roi', '/p/[practiceId]/reports/roi', at('/reports/roi'));
    await shoot(manager, caseKey, 'roi-statement', '/p/[practiceId]/reports/roi/[statementId]', at(`/reports/roi/${ids.statementId}`, ids.statementId));
    await shoot(manager, caseKey, 'reports', '/p/[practiceId]/reports', at('/reports'));
    await shoot(manager, caseKey, 'audit-report', '/p/[practiceId]/reports/[reportId]', at(`/reports/${ids.reportId}`, ids.reportId));
    if (specialist === undefined) {
      for (const width of [1280, 390]) skipped.push({ shot: `led${caseKey}.abstraction-ledger.${String(width)}`, route: '/p/[practiceId]/abstraction/ledger', practice: `LED-${caseKey}`, reason: 'the contract specialist could not sign in' });
    } else {
      await shoot(specialist, caseKey, 'abstraction-ledger', '/p/[practiceId]/abstraction/ledger', at('/abstraction/ledger'));
    }
  }
  // The UX re-check's additions (the fix round): LED-15's mixed patient-balance line (UX-1) on Reconciliation and its
  // case page, and LED-18's payer-response form on its own (UX-4's label).
  {
    const ids = idsOf('15mixed');
    const P = ids.practiceId === undefined ? undefined : `/p/${ids.practiceId}`;
    const at = (suffix: string, ...need: (string | undefined)[]) => (P === undefined || need.some((item) => item === undefined) ? undefined : `${P}${suffix}`);
    const note = 'LED-15 mixed (original.835 then mixed-adjusted.835, a practice of its own): the fix round only.';
    await shoot(manager, '15mixed', 'reconciliation', '/p/[practiceId]/reconciliation', at('/reconciliation'), note);
    await shoot(manager, '15mixed', 'reconciliation-case', '/p/[practiceId]/reconciliation?case=[caseId]', at(`/reconciliation?case=${ids.caseId}`, ids.caseId), note);
    await shoot(manager, '15mixed', 'case', '/p/[practiceId]/cases/[caseId]', at(`/cases/${ids.caseId}`, ids.caseId), note);
    const led18 = idsOf('18');
    await shootRegion(manager, '18', 'case-submissions-form', '/p/[practiceId]/cases/[caseId]/submissions', led18.practiceId === undefined || led18.caseId === undefined ? undefined : `/p/${led18.practiceId}/cases/${led18.caseId}/submissions`, 'Log a payer response', 'The fix round only.');
  }
  // The PDFs last: each download is recorded in the export history the Reports screen lists.
  for (const caseKey of CASES) {
    const ids = idsOf(caseKey);
    const P = ids.practiceId === undefined ? undefined : `/p/${ids.practiceId}`;
    await pdfPages(manager, caseKey, 'audit-report-pdf', '/p/[practiceId]/reports/[reportId]/pdf', P === undefined || ids.reportId === undefined ? undefined : `${P}/reports/${ids.reportId}/pdf`, 2);
    await pdfPages(manager, caseKey, 'roi-statement-pdf', '/p/[practiceId]/reports/roi/[statementId]/pdf', P === undefined || ids.statementId === undefined ? undefined : `${P}/reports/roi/${ids.statementId}/pdf`, 1);
  }
  log(`DONE ${String(shots.length)} shots, ${String(skipped.length)} skips`);
  flush();
});
