import { performance } from 'node:perf_hooks';

import { formatCents } from '@tp/money';
import { SCREENING_MAX_ROWS, SCREENING_MIN_CLAIM_LINES, SCREENING_PAYER_PRODUCTS, type ScreeningRow, encodeScreeningRows, screenTable } from '@tp/worker/screening';
import { practiceShapeUpload } from '@tp/tools/screening-capacity/uploads';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { screeningResult, screeningSubmit } from './routes';
import { SCREENING_HEADERS, ScreeningWorld, screeningRow } from './test-support/screening-world';

/**
 * CO-04's acceptance, at its size: "a clean upload returns a result in under 60 seconds for 50,000 rows" (docs/adr/0062).
 * From the server action's call with 50,000 distinct rows to the result's link in the contact's email: the server's
 * check of every row, the one definer call that stores them, the job's claim, the release read, the engine over
 * every distinct Medicare line (twice for a code in the reduction across codes: alone, and as a later code of a
 * visit), the ten batches recorded, the completion and the email. Then the result page reads
 * its figures from the stored rows. SYNTHETIC release 900001, synthetic rows only.
 */

const CODES = ['97110', '97112', '97116', '97140', '97530', '97161', '97162', '97163', '97164', '97026', '97035', 'G0283'];
const MODIFIER_SETS: readonly (readonly string[])[] = [[], ['GP'], ['GO'], ['CQ', 'GP'], ['59', 'GP'], ['GP', 'KX'], ['CO', 'GO'], ['GN']];
const BANDS = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4', '2025-Q1', '2025-Q2', '2025-Q3', '2025-Q4'];

/** 50,000 distinct rows over the codes, modifier sets, units, places, products and bands, each of 11 to 50 claim lines. */
function rows(): ScreeningRow[] {
  const all: ScreeningRow[] = [];
  for (const payerProduct of SCREENING_PAYER_PRODUCTS) {
    for (const band of BANDS) {
      for (const code of CODES) {
        for (const modifiers of MODIFIER_SETS) {
          for (const place of ['11', '22']) {
            for (let units = 1; units <= 6; units += 1) {
              if (all.length < SCREENING_MAX_ROWS) {
                all.push(screeningRow(code, payerProduct, { modifiers, units, place, band, allowedCents: BigInt(1_000 + ((all.length * 37) % 90_000)), claims: SCREENING_MIN_CLAIM_LINES + (all.length % 40) }));
              }
            }
          }
        }
      }
    }
  }
  return all;
}

let world: ScreeningWorld;

beforeAll(async () => {
  world = await ScreeningWorld.create();
}, 60_000);

afterAll(async () => {
  await world.close();
});

describe('a screening of 50,000 rows', () => {
  it('uploads the practice shape the capacity test uploads (audit #53 part 1: packages/synth generates the same rows)', () => {
    expect(rows()).toEqual(practiceShapeUpload());
  });

  it('returns its result in under 60 seconds, from the upload to the emailed link', { timeout: 120_000 }, async () => {
    const upload = rows();
    expect(upload).toHaveLength(SCREENING_MAX_ROWS);
    // What the browser does before it sends: the file read and screened, in its own time.
    const cells = [[...SCREENING_HEADERS], ...upload.map((row) => [row.procedureCode, row.modifiers.join(' '), String(row.units), row.placeOfService, row.payerProduct, row.serviceBand, formatCents(row.allowedCents), String(row.claimCount)])];
    const browserStart = performance.now();
    const screened = screenTable(cells, new Date());
    const browserSeconds = (performance.now() - browserStart) / 1000;
    expect(screened.ok).toBe(true);
    const text = screened.ok ? screened.rows : '';
    expect(text).toBe(encodeScreeningRows(upload));
    const email = 'prospect.large@clinic-large.synthetic.test';
    const started = performance.now();
    const outcome = await world.call(screeningSubmit, {
      input: {
        practiceName: 'Synthetic Large Therapy Group',
        state: 'MN',
        zip: '00011',
        contactEmail: email,
        headers: JSON.stringify(SCREENING_HEADERS),
        rowCount: String(SCREENING_MAX_ROWS),
        rows: text,
      },
    });
    expect(outcome).toEqual({ status: 'ok', data: { redirect: '/screening?sent=1' } });
    const stored = performance.now();
    expect(await world.price()).toEqual({ complete: 1, failed: 0, skipped: 0 });
    const token = world.tokenFor(email);
    const seconds = (performance.now() - started) / 1000;
    expect(seconds).toBeLessThan(60);
    const result = await world.call(screeningResult, { params: { resultId: token } });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      const { summary } = result.data;
      expect(summary.rows).toBe(SCREENING_MAX_ROWS);
      expect(summary.priced.rows + summary.couldNotPrice.rows + summary.contractRequired.rows + summary.notScreened.rows).toBe(SCREENING_MAX_ROWS);
      expect(summary.priced.rows).toBeGreaterThan(4_000);
      // The codes in the reduction across codes were priced a second time, as a later code of a visit (the owner's
      // ruling of 2026-10-18): their fully reduced figures bring the lowest total below the total priced alone.
      expect(summary.priced.pooledRows).toBeGreaterThan(1_000);
      expect(summary.priced.reducedCents).toBeLessThan(summary.priced.expectedCents);
      expect(result.data.rows).toHaveLength(25);
    }
    const pending = await world.owner.query("SELECT count(*)::int AS n FROM screening_result WHERE disposition = 'pending'");
    expect(pending.rows).toEqual([{ n: 0 }]);
    process.stdout.write(
      `screening of ${String(SCREENING_MAX_ROWS)} rows: browser screen ${browserSeconds.toFixed(1)} s; stored in ${((stored - started) / 1000).toFixed(1)} s; result emailed ${seconds.toFixed(1)} s after the upload\n`,
    );
  });
});
