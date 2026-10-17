import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type Page, type Response, expect, test } from '@playwright/test';

import { signInWithTotp, withDatabase } from './helpers';
import { journeyPractice, pricedAndTriaged, signedOffSchedule, untilLoaded, uploadedEarlier } from './journeys';
import { startLocalWorker } from './worker';

/**
 * What a viewer's browser receives (PRD 3: a viewer reads dashboards, reports, the ledger and ROI
 * statements; PRD 7, Claims and lines: "PHI columns visible only to PHI roles"; the screen tour's P1):
 * in a practice of its own in the other group, a billing manager uploads SYNTHETIC CAS-08 (three
 * claims, one 97110 line each, 30.00 short), its schedule is signed off beside the browser, and March
 * is priced and triaged by the worker into one case. The other group's viewer then opens the case: each
 * line is named by its number, and the page the server sent (its HTML and the data streamed with it)
 * holds none of the 835's service dates, claim control numbers, names or member IDs, sent private,
 * no-store. So does every other screen the tour opened as the viewer. The billing manager's case page
 * names the lines by their service dates. Synthetic data only.
 */

const FIXTURE = path.resolve(import.meta.dirname, '../../../fixtures/synthetic/CAS-08/remit.835');
const PRACTICE = 'SYNTHETIC OTHER PRACTICE VIEWER PHI';
const SETTINGS = { place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT', case_materiality_cents: '1000' };
const MANAGER = 'triage-manager';
const VIEWER = 'ledger-viewer';

/** The PHI the 835 carries: service dates (DTM*472), claim control numbers (CLP01, CLP07), names and member IDs (NM1*QC). */
function phiOf835(text: string): { readonly serviceDates: readonly string[]; readonly identifiers: readonly string[] } {
  const serviceDates = new Set<string>();
  const identifiers = new Set<string>();
  for (const segment of text.split('~').map((part) => part.trim())) {
    const fields = segment.split('*');
    if (fields[0] === 'DTM' && fields[1] === '472' && fields[2] !== undefined) {
      serviceDates.add(`${fields[2].slice(0, 4)}-${fields[2].slice(4, 6)}-${fields[2].slice(6, 8)}`);
    }
    const named = fields[0] === 'CLP' ? [fields[1], fields[7]] : fields[0] === 'NM1' && (fields[1] === 'QC' || fields[1] === 'IL') ? [fields[3], fields[4], fields[9]] : [];
    for (const value of named) {
      if (value !== undefined && value !== '') {
        identifiers.add(value);
      }
    }
  }
  return { serviceDates: [...serviceDates], identifiers: [...identifiers] };
}

const CAS08 = readFileSync(FIXTURE);
const PHI = phiOf835(CAS08.toString('utf8'));

/** Opens `url` and returns what the server sent: the response (its headers) and its whole body. */
async function sent(page: Page, url: string): Promise<{ readonly response: Response; readonly body: string }> {
  const response = await page.goto(url);
  if (response === null) {
    throw new Error(`no response for ${url}`);
  }
  expect(response.status(), url).toBe(200);
  return { response, body: await response.text() };
}

test('a viewer’s case detail names each line by its number, and no screen the viewer opens carries the 835’s PHI (the screen tour, P1)', async ({ page, browser }) => {
  test.setTimeout(420_000);
  expect(PHI.serviceDates).toEqual(['2026-03-05', '2026-03-06', '2026-03-07']);
  const practiceId = await journeyPractice({ name: PRACTICE, settings: SETTINGS });
  await signInWithTotp(page, MANAGER);
  const local = await startLocalWorker();
  try {
    await test.step('CAS-08 loads, its schedule is signed off, and March is priced and triaged into one case', async () => {
      const files = [{ name: 'march.835', mimeType: 'application/octet-stream', buffer: CAS08 }];
      // A retry finds the attempt before's upload: it is waited for, not uploaded again (it would be a duplicate of itself).
      const earlier = await uploadedEarlier(practiceId, files);
      if (earlier.size === 0) {
        await page.goto(`/p/${practiceId}/uploads`);
        await page.getByLabel('Choose files to upload').setInputFiles(files);
        await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'march.835' })).toContainText('Loaded 1 remittance', { timeout: 90_000 });
      }
      for (const documentId of earlier.values()) {
        await untilLoaded(documentId);
      }
      await signedOffSchedule({ practiceId, managerKey: MANAGER, planKey: 'CE:SYNPLAN-FIX-ONE' });
      await pricedAndTriaged({ practiceId, managerKey: MANAGER, periodFrom: '2026-03-01', periodTo: '2026-03-31' });
    });
  } finally {
    await local.close();
  }
  const { caseId, remittanceId, lineId } = await withDatabase(async (client) => {
    const one = async (sql: string) => (await client.query<{ id: string }>(sql, [practiceId])).rows[0]?.id ?? '';
    return {
      caseId: await one('SELECT id FROM "case" WHERE practice_id = $1 ORDER BY opened_at LIMIT 1'),
      remittanceId: await one('SELECT id FROM remittance WHERE practice_id = $1 ORDER BY created_at LIMIT 1'),
      lineId: await one('SELECT l.id FROM service_line l WHERE l.practice_id = $1 ORDER BY l.id LIMIT 1'),
    };
  });
  expect(caseId).not.toBe('');

  await test.step('the billing manager, who reads PHI, sees each line by its service date', async () => {
    await page.goto(`/p/${practiceId}/cases/${caseId}`);
    const lines = page.getByRole('list', { name: 'Case lines' }).getByRole('listitem');
    await expect(lines).toHaveCount(3);
    for (const [index, date] of PHI.serviceDates.entries()) {
      await expect(lines.getByRole('link', { name: `Line ${String(index + 1)} of 3, ${date}`, exact: true })).toHaveCount(1);
    }
  });

  const context = await browser.newContext();
  const viewer = await context.newPage();
  try {
    await signInWithTotp(viewer, VIEWER);

    await test.step('the viewer’s case detail: each line by its number, no service date or claim number in what the server sent, private, no-store', async () => {
      const { response, body } = await sent(viewer, `/p/${practiceId}/cases/${caseId}`);
      expect(response.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
      const lines = viewer.getByRole('list', { name: 'Case lines' }).getByRole('listitem');
      await expect(lines).toHaveCount(3);
      // Each line's link names it uniquely on the page (its place in the schedule), though each is line 1 of its own claim.
      for (const name of ['Line 1 of 3', 'Line 2 of 3', 'Line 3 of 3']) {
        await expect(lines.getByRole('link', { name, exact: true })).toHaveCount(1);
      }
      expect([...PHI.serviceDates, ...PHI.identifiers].filter((value) => body.includes(value)), 'PHI in the viewer’s case detail').toEqual([]);
    });

    await test.step('every other screen the tour opened as the viewer carries none of it either', async () => {
      for (const screen of [
        '',
        '/remittances',
        `/remittances/${remittanceId}`,
        '/claims',
        `/lines/${lineId}`,
        '/coverage',
        '/cases',
        `/cases/${caseId}/submissions`,
        '/anomalies',
        '/reconciliation',
        '/reports',
      ]) {
        const url = `/p/${practiceId}${screen}`;
        const { response, body } = await sent(viewer, url);
        expect(response.headers()['cache-control'], url).toMatch(/private.*no-store|no-store.*private/);
        expect([...PHI.serviceDates, ...PHI.identifiers].filter((value) => body.includes(value)), `PHI on ${url}`).toEqual([]);
      }
    });

    await test.step('the packet builder, whose schedule names claims and dates, is not the viewer’s to open', async () => {
      const { body } = await sent(viewer, `/p/${practiceId}/cases/${caseId}/packet`);
      await expect(viewer.getByText(/do this here/)).toBeVisible();
      expect([...PHI.serviceDates, ...PHI.identifiers].filter((value) => body.includes(value))).toEqual([]);
    });
  } finally {
    await context.close();
  }
});
