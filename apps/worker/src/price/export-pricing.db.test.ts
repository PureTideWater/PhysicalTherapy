import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { type EraFormatId, documentObjectKey, readDatabaseUrl, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { parseTrace, recompute } from '@tp/pricing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseHandler } from '../parse/job';
import { parseCoverage } from './coverage';
import { FIXTURES, type Practice, PricingWorld } from './test-support/pricing-world';

/**
 * A line loaded from a vendor ERA export prices as its 835 twin does (Change Order 001, CO-03: one shape for pricing;
 * docs/adr/0060): the seven SYNTHETIC source 835s of packages/synth's ERA fixtures loaded into one practice, the WebPT
 * Billing export of the same payments into another, each plan mapped to a signed 110%-of-Medicare contract, and one
 * run in each over the lines' service dates. The export carries the place of service the 835's CLP08 gives, so no
 * line stops for want of one (place_of_service_unmapped, which pages the operator), and every line's observed allowed,
 * expected allowed, variance and unpriced reason equal its twin's, every trace recomputing. Synthetic data only.
 */

const SOURCES = ['PAR-01/remit.835', 'PAR-08/original.835', 'PAR-08/correction.835', 'PAR-09/remit.835', 'PAR-12/remit.835', 'PAR-13/remit.835', 'PAR-22/remit.835'];

let w: PricingWorld;

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl());
}, 120_000);

afterAll(async () => {
  await w.close();
});

/** Loads an ERA export (a path under fixtures/synthetic) as intake leaves a clean one, through the parse job. */
async function loadExport(target: Practice, relative: string, formatId: EraFormatId): Promise<void> {
  const content = readFileSync(path.join(FIXTURES, relative));
  const id = randomUUID();
  await withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, (scope) =>
    scope.client.query("INSERT INTO source_document (id, practice_id, kind, format_id, size_bytes, content_type, uploaded_by) VALUES ($1, $2, 'era_export', $3, $4, 'text/csv', $5)", [
      id,
      target.practiceId,
      formatId,
      content.length,
      target.manager,
    ]),
  );
  await w.parseServices.documents.write(target.cipher, documentObjectKey(target.practiceId, id), Readable.from([content]));
  await asOwner(w.owner, [target.practiceId], () =>
    w.owner.query("UPDATE source_document SET sha256 = $2, scan_status = 'clean', scan_at = now(), status = 'scanned' WHERE id = $1", [id, createHash('sha256').update(content).digest('hex')]),
  );
  await parseHandler(w.parseServices)({ practice_id: target.practiceId, document_id: id }, w.jobContext(target.practiceId));
}

interface PricedRow {
  readonly service_date: string;
  readonly procedure_code: string;
  readonly units: string;
  readonly claim_status_code: string;
  readonly place_of_service: string | null;
  readonly observed_allowed_cents: string;
  readonly expected_allowed_cents: string | null;
  readonly variance_cents: string | null;
  readonly unpriced_reason: string | null;
  readonly trace: unknown;
}

/** A run's priced lines as their facts and figures, in a stable order, with whether each trace recomputes. */
async function priced(runId: string): Promise<{ readonly rows: Omit<PricedRow, 'trace'>[]; readonly differences: string[] }> {
  const { rows } = await w.owner.query<PricedRow>(
    `SELECT l.service_date::text AS service_date, l.procedure_code, l.units::text AS units, c.claim_status_code, l.place_of_service,
            p.observed_allowed_cents::text AS observed_allowed_cents, p.expected_allowed_cents::text AS expected_allowed_cents, p.variance_cents::text AS variance_cents,
            p.unpriced_reason, p.trace
       FROM priced_line p JOIN service_line l ON l.id = p.service_line_id JOIN claim c ON c.id = l.claim_id
      WHERE p.pricing_run_id = $1`,
    [runId],
  );
  const differences = rows.flatMap((row) => {
    parseTrace(row.trace);
    return recompute(row.trace).differences;
  });
  const key = (row: Omit<PricedRow, 'trace'>) => [row.service_date, row.procedure_code, row.claim_status_code, row.units, row.observed_allowed_cents].join('|');
  return { rows: rows.map(({ trace: _trace, ...row }) => row).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)), differences };
}

describe('a line loaded from an ERA export prices as its 835 twin (CO-03; docs/adr/0060)', () => {
  it('prices the WebPT Billing export’s lines under a percent-of-Medicare contract exactly as the same lines from the 835s', async () => {
    const x12 = await w.practice('export pricing 835');
    for (const source of SOURCES) {
      await w.load(x12, source);
    }
    const fromExport = await w.practice('export pricing export');
    await loadExport(fromExport, 'emr/webpt_billing_era_v0/era-export.csv', 'webpt_billing_era_v0');
    const places = await w.owner.query<{ place_of_service: string | null; n: number }>('SELECT place_of_service, count(*)::int AS n FROM service_line WHERE practice_id = $1 GROUP BY 1', [
      fromExport.practiceId,
    ]);
    expect(places.rows).toEqual([{ place_of_service: '11', n: 17 }]);

    const runs: string[] = [];
    for (const [target, planKey] of [
      [x12, 'CE:SYNPLAN-COMM-01'],
      [fromExport, 'PLAN:SYNPLAN-COMM-01'],
    ] as const) {
      const contract = await w.signedContract(target, '2026-01-01');
      await w.mapped(target, await w.planOf(target, planKey), 'contract', '2026-01-01', contract.versionId);
      const run = await w.createRun(target, '2026-03-01', '2026-05-31');
      await w.execute(target, run);
      runs.push(run);
    }
    const [from835, fromEra] = await Promise.all(runs.map(priced));
    expect(from835?.rows.length).toBeGreaterThan(0);
    expect(fromEra?.rows).toEqual(from835?.rows);
    expect([...(from835?.differences ?? []), ...(fromEra?.differences ?? [])]).toEqual([]);
    // PAR-01's 97110 of 2026-03-15 is priced, not stopped for a place of service, from either source.
    expect(fromEra?.rows.find((row) => row.service_date === '2026-03-15' && row.procedure_code === '97110')).toMatchObject({ place_of_service: '11', expected_allowed_cents: expect.stringMatching(/^\d+$/) });
    // The runs' coverage is the same; no line stopped for want of a place of service. (PAR-22's decimal units stop
    // the same way from either source: an 835's property, not an export's.)
    const [coverage835, coverageEra] = await Promise.all(runs.map(async (run) => parseCoverage((await w.one<{ coverage: unknown }>('SELECT coverage FROM pricing_run WHERE id = $1', [run])).coverage)));
    expect(coverageEra?.priced).toEqual(coverage835?.priced);
    expect(coverageEra?.reasons).toEqual(coverage835?.reasons);
    expect(coverageEra?.engine_errors).toEqual(coverage835?.engine_errors);
    expect(coverageEra?.engine_errors.map((entry) => entry.detail)).not.toContain('place_of_service_unmapped');
    expect(coverageEra?.priced.lines).toBeGreaterThan(0);
  }, 240_000);
});
