import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { compareRuns } from './diff';
import { createRerun } from './rerun';
import { PLUS_FOUR_RELEASE, PricingWorld } from './test-support/pricing-world';

/**
 * The causes of a re-run's changed lines when the practice's location and the release both changed (docs/adr/0064;
 * test matrix PRC-19 and PRC-21): a month priced at 00011 under SYNTHETIC release 900001, then re-run at 00012-5000
 * under 900006, which added the ZIP+4 file of 00012 and the GPCI of locality 99999-02. The new location's records the
 * new release added are release causes beside the settings; the location records both releases hold alike are not.
 * Its own scratch database, since it publishes another release.
 */

let w: PricingWorld;

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

describe('a re-run after the location and the release both changed', () => {
  it('names the ZIP+4 file and the GPCI the new release added for the new location, and the settings, never the records both releases hold alike', async () => {
    const target = await w.practice('diff-location');
    await w.load(target, 'MAP-05/remit.835');
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    const first = await w.createRun(target, '2026-02-01', '2026-02-28');
    await w.execute(target, first);
    await w.loadPlusFourRelease();
    expect(await w.setLocation(target, '00012', '5000')).toBe('ready');
    const scope = <T>(work: Parameters<typeof withPracticeScope<typeof w.app, T>>[2]) => withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, work);
    const second = (await scope((s) => createRerun(s, { practiceId: target.practiceId, pricingRunId: first, releaseNo: PLUS_FOUR_RELEASE, requestId: `test-${randomUUID()}` }))).pricingRunId;
    await w.execute(target, second);
    const diff = await scope((s) => compareRuns(s, { practiceId: target.practiceId, beforeRunId: first, afterRunId: second, requestId: `test-${randomUUID()}` }));
    expect(diff.lines).toHaveLength(3);
    const sha = async (type: string, key: object) =>
      (await w.one<{ sha256: string }>('SELECT sha256 FROM rule_record WHERE release_no = $1 AND record_type = $2 AND key = $3::jsonb', [PLUS_FOUR_RELEASE, type, JSON.stringify(key)])).sha256;
    const added = async (type: string, key: Record<string, string>) => ({
      kind: 'release_record',
      recordType: type,
      key,
      before: null,
      after: { sha256: await sha(type, key), effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' },
    });
    const causes = [
      await added('locality_map_plus_four', { zip: '00012' }),
      await added('pfs_gpci', { carrier: '99999', locality: '02' }),
      { kind: 'settings', fields: ['zip', 'zip_plus_four'], before: { zip: '00011', zip_plus_four: null }, after: { zip: '00012', zip_plus_four: '5000' } },
    ];
    for (const line of diff.lines) {
      expect(line.causes).toEqual(causes);
    }
  });
});

describe('a re-run under another approval of the place-of-service split (review of PR 6b-2, finding 16)', () => {
  it('reads when each run’s split was approved, and none for a run that pinned none', async () => {
    const target = await w.practice('diff-split');
    await w.load(target, 'MAP-05/remit.835');
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
    const scope = <T>(work: Parameters<typeof withPracticeScope<typeof w.app, T>>[2]) => withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, work);
    const rerun = async (of: string) => {
      const created = (await scope((s) => createRerun(s, { practiceId: target.practiceId, pricingRunId: of, releaseNo: PLUS_FOUR_RELEASE, requestId: `test-${randomUUID()}` }))).pricingRunId;
      await w.execute(target, created);
      return created;
    };
    const compare = (before: string, after: string) => scope((s) => compareRuns(s, { practiceId: target.practiceId, beforeRunId: before, afterRunId: after, requestId: `test-${randomUUID()}` }));
    const approvedAt = async (id: string) => (await w.one<{ approved_at: Date }>('SELECT approved_at FROM place_of_service_split WHERE id = $1', [id])).approved_at;
    // Priced before any split was approved: it pinned none.
    const first = await w.createRun(target, '2026-02-01', '2026-02-28', PLUS_FOUR_RELEASE);
    await w.execute(target, first);
    const earlier = await w.approveSplit({ '11': 'non_facility', '22': 'facility' });
    const second = await rerun(first);
    const later = await w.approveSplit({ '11': 'non_facility', '21': 'facility' });
    const third = await rerun(second);
    const added = await compare(first, second);
    expect([added.before, added.after].map((run) => [run.placeOfServiceSplitId, run.placeOfServiceSplitApprovedAt])).toEqual([
      [null, null],
      [earlier, await approvedAt(earlier)],
    ]);
    const both = await compare(second, third);
    expect([both.before, both.after].map((run) => [run.placeOfServiceSplitId, run.placeOfServiceSplitApprovedAt])).toEqual([
      [earlier, await approvedAt(earlier)],
      [later, await approvedAt(later)],
    ]);
  });
});
