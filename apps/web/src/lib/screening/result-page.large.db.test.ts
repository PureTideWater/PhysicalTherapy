import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';

import { shapeRows, screeningRows } from '@tp/tools/screening-capacity/uploads';
import { screeningTokenHash } from '@tp/worker/screening';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SCREENING_GROUPS_PER_PAGE, type ScreeningResultData, screeningResult, screeningSubmit } from './routes';
import { ScreeningWorld, submitInput } from './test-support/screening-world';

/**
 * The result page at the capacity test's worst shape (audit #53 part 1; docs/adr/0062, "Capacity under production
 * limits"): 50,000 priced rows over 15,000 and more codes, which group into 20,507 groups by payer product and code.
 * Its first local run found the page reading and rendering every group, which exhausted the web task's heap, so the
 * link did not open and the task exited. Here the database pages the groups and sums the rest; the route reads one
 * page; and the page, read and rendered in a process of its own under a 512 MiB heap (the web task's memory), lists 50
 * groups and stays small whichever page is asked. The worst shape's rows are uploaded through the route; their
 * figures are SYNTHETIC, recorded by the operator functions the pricing job calls (this test is about the page's
 * read, not the engine, which the capacity test runs at this shape). Synthetic data only.
 */

/**
 * Each step's time limit, measured, with room for GitHub's 4-core runner, where test:db runs three files at once beside
 * PostgreSQL. At 7bcb5fc the first test took 109.6 s there against its 120 s, so it timed out under load: every page read
 * ranks all 20,507 groups from the 50,000 rows (0.47 s a read), and that test reads 214 pages, 206 of them one after
 * another in the sweep; the setup took about 11 s and was never the cost. Two changes cut the reads, and nothing asserted
 * changed: screening_standing() is inlined (0.2 s a read; migration 20261104090000), and the sweep reads four pages at a
 * time. Measured on PostgreSQL 18 on 4 cores at a load of 9 to 10, beside three other db test files: setup 10 s, the
 * paging test 17 to 22 s, the route 3 to 4 s, the render 6 to 11 s. Each limit is about five times that, rounded up.
 */
const TIMEOUTS = { setup: 90_000, paging: 120_000, route: 30_000, render: 60_000 } as const;

const exec = promisify(execFile);
const REPOSITORY = path.resolve(import.meta.dirname, '../../../../..');
const WEB = path.join(REPOSITORY, 'apps/web');
const WORST_GROUPS = 20_507;
const PAGES = Math.ceil(WORST_GROUPS / SCREENING_GROUPS_PER_PAGE);

let world: ScreeningWorld;
let token: string;
let hash: string;

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** Each priced row's SYNTHETIC figures, as the job would record them: one line's figure, and for every other row a fully reduced one. */
function figures(rowNo: number, claims: number, observed: bigint) {
  const line = 2_000n + BigInt((rowNo * 7_919) % 18_000);
  const pooled = rowNo % 2 === 0;
  const reducedLine = line - (line * 3n) / 10n;
  const expected = line * BigInt(claims);
  const reduced = reducedLine * BigInt(claims);
  return {
    line: line.toString(),
    lineUnrounded: `${line.toString()}.4`,
    expected: expected.toString(),
    difference: (expected - observed).toString(),
    pooled,
    reducedLine: pooled ? reducedLine.toString() : null,
    reducedUnrounded: pooled ? `${reducedLine.toString()}.4` : null,
    reduced: pooled ? reduced.toString() : null,
    reducedDifference: pooled ? (reduced - observed).toString() : null,
    reducedTrace: pooled ? sha(`reduced-${String(rowNo)}`) : null,
    trace: sha(`trace-${String(rowNo)}`),
  };
}

beforeAll(async () => {
  world = await ScreeningWorld.create();
  const email = 'prospect.worst@clinic-worst.synthetic.test';
  const outcome = await world.call(screeningSubmit, { input: submitInput({ rows: screeningRows(shapeRows('worst')), zip: '00011', contactEmail: email }) });
  expect(outcome).toEqual({ status: 'ok', data: { redirect: '/screening?sent=1' } });
  const { owner } = world;
  const run = (
    await owner.query<{ id: string }>(
      'SELECT r.id FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1',
      [email],
    )
  ).rows[0]?.id;
  expect(run).toBeDefined();
  const claimed = (await owner.query<{ attempt: number }>('SELECT attempt FROM operator_screening_claim($1)', [run])).rows;
  expect(claimed).toHaveLength(1);
  const attempt = claimed[0]?.attempt;
  const rows = (
    await owner.query<{ row_no: number; claim_count: number; observed_allowed_cents: string; payer_product: string }>(
      'SELECT row_no, claim_count, observed_allowed_cents::text AS observed_allowed_cents, payer_product FROM screening_result WHERE run_id = $1 ORDER BY row_no',
      [run],
    )
  ).rows;
  // Every row of the worst shape is a Medicare row the engine prices.
  expect(rows.every((row) => row.payer_product === 'medicare_ffs' || row.payer_product === 'ma_noncontracted')).toBe(true);
  for (let at = 0; at < rows.length; at += 5_000) {
    const batch = rows.slice(at, at + 5_000).map((row) => ({ row, figures: figures(row.row_no, row.claim_count, BigInt(row.observed_allowed_cents)) }));
    const recorded = await owner.query<{ n: number }>(
      `SELECT operator_screening_record($1::uuid, $2::integer[], $3::text[], $4::bigint[], $5::numeric[], $6::bigint[], $7::bigint[], $8::boolean[], $9::bigint[],
                                        $10::numeric[], $11::bigint[], $12::bigint[], $13::text[], $14::text[], $15::text[], $16::text[], $17::integer) AS n`,
      [
        run,
        batch.map(({ row }) => row.row_no),
        batch.map(() => 'priced'),
        batch.map(({ figures: f }) => f.line),
        batch.map(({ figures: f }) => f.lineUnrounded),
        batch.map(({ figures: f }) => f.expected),
        batch.map(({ figures: f }) => f.difference),
        batch.map(({ figures: f }) => f.pooled),
        batch.map(({ figures: f }) => f.reducedLine),
        batch.map(({ figures: f }) => f.reducedUnrounded),
        batch.map(({ figures: f }) => f.reduced),
        batch.map(({ figures: f }) => f.reducedDifference),
        batch.map(({ figures: f }) => f.reducedTrace),
        batch.map(() => null),
        batch.map(() => null),
        batch.map(({ figures: f }) => f.trace),
        attempt,
      ],
    );
    expect(recorded.rows[0]?.n).toBe(batch.length);
  }
  token = randomBytes(32)
    .toString('hex')
    .replace(/[0-9]/g, (digit) => 'ghijklmnop'.charAt(Number(digit)))
    .slice(0, 32);
  hash = screeningTokenHash(token);
  expect((await owner.query('SELECT * FROM operator_screening_complete($1, $2, NULL, $3, $4, $5)', [run, hash, 'engine/synthetic', 'test-worst-shape', attempt])).rows).toHaveLength(1);
}, TIMEOUTS.setup);

afterAll(async () => {
  await world.close();
});

interface Totals {
  groups: number;
  anomaly_groups: number;
  within_reduction_groups: number;
  page_size: number;
  pages: number;
  page_no: number;
  first_group: number;
  last_group: number;
  other_groups: number;
  other_anomaly_groups: number;
  other_rows: number;
  other_claim_lines: string;
  other_expected_cents: string;
  other_lowest_cents: string;
  other_observed_cents: string;
  other_difference_cents: string;
  other_lowest_difference_cents: string;
}

interface Group {
  group_no: number;
  payer_product: string;
  procedure_code: string;
  rows: number;
  claim_lines: string;
  expected_cents: string;
  reduced_cents: string | null;
  observed_cents: string;
  difference_cents: string;
  reduced_difference_cents: string | null;
  in_reduction_pool: boolean;
  anomaly: boolean;
  standing: string;
}

/** As the application's login reads it, through the definer functions alone. */
async function asApp<T>(sql: string, values: readonly unknown[]): Promise<T[]> {
  const client = await world.app.connect();
  try {
    return (await client.query(sql, [...values])).rows as T[];
  } finally {
    client.release();
  }
}

const totalsOf = async (page: number, perPage: number = SCREENING_GROUPS_PER_PAGE) => asApp<Totals>('SELECT * FROM screening_result_group_totals($1, $2, $3)', [hash, page, perPage]);
const groupsOf = async (page: number, perPage: number = SCREENING_GROUPS_PER_PAGE) => asApp<Group>('SELECT * FROM screening_result_groups($1, $2, $3)', [hash, page, perPage]);
const big = (rows: readonly Group[], pick: (group: Group) => string | null) => rows.reduce((total, group) => total + BigInt(pick(group) ?? '0'), 0n);

describe('the result page at the worst shape (audit #53 part 1)', () => {
  it('pages the groups in the database, in one total order, and counts and sums every group the page does not show', { timeout: TIMEOUTS.paging }, async () => {
    // Every group, as the owner reads them straight from the stored rows, beside what the functions give.
    const all = (
      await world.owner.query<{ product: string; code: string; lowest_difference: string }>(
        `SELECT payer_product AS product, procedure_code AS code, sum(coalesce(reduced_difference_cents, difference_cents))::text AS lowest_difference
           FROM screening_result s JOIN screening_run r ON r.id = s.run_id WHERE r.result_token_sha256 = $1 AND s.disposition = 'priced'
          GROUP BY payer_product, procedure_code`,
        [hash],
      )
    ).rows;
    expect(all).toHaveLength(WORST_GROUPS);
    const [first] = await totalsOf(1);
    expect(first).toMatchObject({ groups: WORST_GROUPS, page_size: SCREENING_GROUPS_PER_PAGE, pages: PAGES, page_no: 1, first_group: 1, last_group: 50, other_groups: WORST_GROUPS - 50 });
    const page = await groupsOf(1);
    expect(page.map((group) => group.group_no)).toEqual(Array.from({ length: 50 }, (_, at) => at + 1));
    // The largest difference from the lowest figures first: no group off the page has a larger one.
    const lowest = (group: Group) => BigInt(group.reduced_difference_cents ?? group.difference_cents);
    const smallestShown = page.map(lowest).reduce((least, value) => (value < least ? value : least));
    expect(all.filter((group) => BigInt(group.lowest_difference) > smallestShown).length).toBeLessThanOrEqual(49);
    // The page's sums and the others' make the result's priced totals.
    const [summary] = await asApp<{ priced_rows: number; priced_claim_lines: string; expected_cents: string; reduced_cents: string; priced_observed_cents: string; difference_cents: string; reduced_difference_cents: string }>(
      'SELECT priced_rows, priced_claim_lines::text, expected_cents::text, reduced_cents::text, priced_observed_cents::text, difference_cents::text, reduced_difference_cents::text FROM screening_result_summary($1)',
      [hash],
    );
    expect(page.reduce((total, group) => total + group.rows, 0) + (first?.other_rows ?? 0)).toBe(summary?.priced_rows);
    expect(big(page, (group) => group.claim_lines) + BigInt(first?.other_claim_lines ?? '')).toBe(BigInt(summary?.priced_claim_lines ?? ''));
    expect(big(page, (group) => group.expected_cents) + BigInt(first?.other_expected_cents ?? '')).toBe(BigInt(summary?.expected_cents ?? ''));
    expect(big(page, (group) => group.reduced_cents ?? group.expected_cents) + BigInt(first?.other_lowest_cents ?? '')).toBe(BigInt(summary?.reduced_cents ?? ''));
    expect(big(page, (group) => group.observed_cents) + BigInt(first?.other_observed_cents ?? '')).toBe(BigInt(summary?.priced_observed_cents ?? ''));
    expect(big(page, (group) => group.difference_cents) + BigInt(first?.other_difference_cents ?? '')).toBe(BigInt(summary?.difference_cents ?? ''));
    expect(big(page, (group) => group.reduced_difference_cents ?? group.difference_cents) + BigInt(first?.other_lowest_difference_cents ?? '')).toBe(BigInt(summary?.reduced_difference_cents ?? ''));
    expect(page.filter((group) => group.anomaly).length + (first?.other_anomaly_groups ?? 0)).toBe(first?.anomaly_groups);
    expect(first?.anomaly_groups).toBeGreaterThan(0);
    // The last page holds the 7 groups left; a page past it is taken as the last; a page is never more than 100 groups.
    const [last] = await totalsOf(999_999);
    expect(last).toMatchObject({ page_no: PAGES, first_group: (PAGES - 1) * 50 + 1, last_group: WORST_GROUPS, other_groups: (PAGES - 1) * 50 });
    expect((await groupsOf(PAGES)).map((group) => group.group_no)).toEqual(Array.from({ length: WORST_GROUPS - (PAGES - 1) * 50 }, (_, at) => (PAGES - 1) * 50 + at + 1));
    expect(await groupsOf(PAGES + 1)).toEqual([]);
    expect(await groupsOf(1, 100_000)).toHaveLength(100);
    expect((await totalsOf(1, 100_000))[0]).toMatchObject({ page_size: 100, pages: Math.ceil(WORST_GROUPS / 100) });
    expect(await groupsOf(0, 0)).toHaveLength(1);
    // Every page in turn lists every group once, in one order (pages of 100, the largest the database gives): each page
    // holds the next 100 numbers, no group is listed twice, and the largest difference from the lowest figures comes
    // first throughout. The pages are read four at a time over the application's pool (its four connections), as
    // visitors reading at once would: each read ranks every group, so 206 of them one after another are most of this
    // test's time (see TIMEOUTS).
    const pagesOf100 = Math.ceil(WORST_GROUPS / 100);
    const pages: Group[][] = [];
    const waiting = Array.from({ length: pagesOf100 }, (_, at) => at + 1);
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let at = waiting.shift(); at !== undefined; at = waiting.shift()) {
          pages[at - 1] = await groupsOf(at, 100);
        }
      }),
    );
    const listed = new Map<string, number>();
    pages.forEach((onPage, index) => {
      const firstNo = index * 100 + 1;
      expect(
        onPage.map((group) => group.group_no),
        `page ${String(index + 1)}`,
      ).toEqual(Array.from({ length: Math.min(100, WORST_GROUPS - index * 100) }, (_, at) => firstNo + at));
      for (const group of onPage) {
        const key = `${group.payer_product}:${group.procedure_code}`;
        expect(listed.get(key), key).toBeUndefined();
        listed.set(key, group.group_no);
      }
    });
    expect(listed.size).toBe(WORST_GROUPS);
    const inOrder = pages.flat();
    expect(inOrder.every((group, at) => at === 0 || lowest(group) <= lowest(inOrder[at - 1] as Group))).toBe(true);
    // An unknown link has no groups and no counts.
    const unknown = screeningTokenHash('abcdefghijklmnopqrstuvwxyzabcdef');
    expect(await asApp('SELECT * FROM screening_result_group_totals($1, 1, 50)', [unknown])).toEqual([]);
    expect(await asApp('SELECT * FROM screening_result_groups($1, 1, 50)', [unknown])).toEqual([]);
  });

  it('reads one page of groups through the route, the first unless another is asked, the last for a page past it', { timeout: TIMEOUTS.route }, async () => {
    const read = async (groups?: string): Promise<ScreeningResultData> => {
      const outcome = await world.call(screeningResult, { params: { resultId: token, ...(groups === undefined ? {} : { groups }) } });
      if (outcome.status !== 'ok') {
        throw new Error(outcome.status);
      }
      return outcome.data;
    };
    const first = await read();
    expect(first.groups).toHaveLength(SCREENING_GROUPS_PER_PAGE);
    expect(first.groupPage).toMatchObject({ groups: WORST_GROUPS, pages: PAGES, page: 1, firstGroup: 1, lastGroup: 50 });
    expect(first.groupPage.others.groups).toBe(WORST_GROUPS - 50);
    expect(first.rows).toHaveLength(25);
    for (const asked of ['abc', '0', '-3', '1.5']) {
      expect((await read(asked)).groupPage.page, asked).toBe(1);
    }
    const last = await read('999999');
    expect(last.groupPage.page).toBe(PAGES);
    expect(last.groups.map((group) => group.groupNo)).toEqual(Array.from({ length: WORST_GROUPS - (PAGES - 1) * 50 }, (_, at) => (PAGES - 1) * 50 + at + 1));
  });

  it('reads and renders any page of the worst shape in a process under a 512 MiB heap, listing 50 groups and holding little', { timeout: TIMEOUTS.render }, async () => {
    const middle = String(Math.ceil(PAGES / 2));
    const support = path.join(WEB, 'src/lib/screening/test-support');
    const args = ['--tsconfig', path.join(support, 'render-result.tsconfig.json'), path.join(support, 'render-result.tsx'), world.database.appUrl, token, `1,${middle},${String(PAGES)},999999`];
    const { stdout } = await exec(path.join(REPOSITORY, 'node_modules/.bin/tsx'), args, {
      cwd: WEB,
      // The whole heap at 512 MiB, the web task's memory: 464 MiB of old space and three 16 MiB semi-spaces of young
      // (V8's heap_size_limit, which --max-old-space-size=512 alone would put at 704 MiB).
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=464 --max-semi-space-size=16 --expose-gc' },
      maxBuffer: 1024 * 1024,
      // The child's own limit, inside the test's, so a hung render ends with its output rather than as a bare timeout.
      timeout: TIMEOUTS.render - 5_000,
    });
    const measured = JSON.parse(stdout.trim().split('\n').at(-1) ?? '{}') as {
      heapLimitMiB: number;
      pages: { asked: string; page: number; groups: number; listed: number; othersRow: boolean; htmlBytes: number; heapBeforeMiB: number; heapAfterRenderMiB: number; heapAfterCollectionMiB: number; ms: number }[];
    };
    // The heap the process ran under, as V8 reports its limit.
    expect(measured.heapLimitMiB).toBe(512);
    expect(measured.pages.map((page) => [page.asked, page.page, page.groups, page.listed, page.othersRow])).toEqual([
      ['1', 1, WORST_GROUPS, 50, true],
      [middle, Number(middle), WORST_GROUPS, 50, true],
      [String(PAGES), PAGES, WORST_GROUPS, WORST_GROUPS - (PAGES - 1) * 50, true],
      ['999999', PAGES, WORST_GROUPS, WORST_GROUPS - (PAGES - 1) * 50, true],
    ]);
    for (const page of measured.pages) {
      // The page's HTML and what the read and the render add to the heap are the same small size whichever page: at
      // most a few hundred kilobytes and tens of megabytes, where listing all 20,507 groups exhausted the web task's heap.
      expect(page.htmlBytes, page.asked).toBeLessThan(512 * 1024);
      expect(page.heapAfterRenderMiB - page.heapBeforeMiB, page.asked).toBeLessThan(64);
      expect(page.heapAfterCollectionMiB - page.heapBeforeMiB, page.asked).toBeLessThan(8);
    }
    process.stdout.write(
      `result page at the worst shape (${String(WORST_GROUPS)} groups) under a ${measured.heapLimitMiB.toFixed(0)} MiB heap: ${measured.pages.map((page) => `page ${String(page.page)} ${(page.htmlBytes / 1024).toFixed(0)} KB, +${(page.heapAfterRenderMiB - page.heapBeforeMiB).toFixed(1)} MiB, ${page.ms.toFixed(0)} ms`).join('; ')}\n`,
    );
  });
});
