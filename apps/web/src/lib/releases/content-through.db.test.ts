import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import { releaseContentSpans } from '@tp/worker/pricing';
import { PricingWorld, RELEASE } from '@tp/worker/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DATED_FAMILY_CONTENTS, contentSpansOf, contentWindowsOf, familiesLoadedThrough, forgetContentThrough, multirangeLiteral, releaseManifest, windowsInForce } from './content-through';

/**
 * The per-content windows the web reads (audit #7 and #59; docs/adr/0071; test matrix RCC-08), against a scratch
 * database under SYNTHETIC release 900001: each family's loaded-through date, the families typed in when they change
 * left out unless asked for; the windows read once per release and manifest, and again for another manifest; the span
 * contents' windows equal to rule_release_content_span()'s; and the windows' literal read back by PostgreSQL as itself.
 */

let w: PricingWorld;
let manifest: string;

/** A practice's scope whose client counts the queries it runs. */
async function counted<T>(read: (scope: PracticeScope<ScopeClient>, queries: () => number) => Promise<T>): Promise<T> {
  const target = await w.practice(`content-through-${randomUUID().slice(0, 8)}`);
  return withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, async (scope) => {
    let queries = 0;
    const original = scope.client.query.bind(scope.client);
    const counting = (...args: Parameters<ScopeClient['query']>) => {
      queries += 1;
      return original(...args);
    };
    const client = new Proxy(scope.client, {
      get: (target, key) => (key === 'query' ? counting : Reflect.get(target, key)) as unknown,
    });
    return read({ ...scope, client }, () => queries);
  });
}

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl());
  manifest = (await w.one<{ manifest_sha256: string }>('SELECT manifest_sha256 FROM rule_release WHERE release_no = $1', [RELEASE])).manifest_sha256;
}, 60_000);

afterAll(async () => {
  await w.close();
});

beforeEach(() => {
  forgetContentThrough();
});

describe('the loaded-through dates', () => {
  it('gives each dated family of 900001 its last loaded day, the MUE through 2026-12-31, and leaves the on_change families out', async () => {
    const rows = await counted(async (scope) => familiesLoadedThrough((await windowsInForce(scope.client))?.windows ?? null, '2026-11-20'));
    expect(rows.find((row) => row.family === 'ncci_mue')).toEqual({
      family: 'ncci_mue',
      title: 'Medicare unit limits (MUE)',
      through: '2026-12-31',
      open: false,
      ended: false,
      loaded: true,
      partly: false,
      from: null,
    });
    expect(rows.find((row) => row.family === 'fee_schedule')).toMatchObject({
      through: '2026-12-31',
      open: false,
      loaded: true,
    });
    expect(rows.map((row) => row.family)).not.toContain('sequestration');
    expect(rows.map((row) => row.family)).not.toContain('mppr_general');
  });

  it('lists every family when asked, and reads a release with nothing loaded as not loaded', async () => {
    const all = await counted(async (scope) => familiesLoadedThrough(await contentWindowsOf(scope.client, RELEASE, manifest), '2026-11-20', { onChange: true }));
    expect(all.map((row) => row.family)).toContain('sequestration');
    expect(familiesLoadedThrough(null, '2026-11-20').every((row) => !row.loaded && row.through === null && !row.open)).toBe(true);
  });

  it('gives a day after the content runs out the latest end before it', async () => {
    const rows = await counted(async (scope) => familiesLoadedThrough(await contentWindowsOf(scope.client, RELEASE, manifest), '2027-02-01'));
    expect(rows.find((row) => row.family === 'ncci_mue')).toMatchObject({
      through: '2026-12-31',
      open: false,
      ended: true,
      loaded: true,
    });
  });
});

describe('a family the release does not load, or loads only later (review S1)', () => {
  it('is listed all the same: 900001 has no ZIP+4 file, so the ZIP locality family is only partly loaded', async () => {
    const rows = await counted(async (scope) => familiesLoadedThrough((await windowsInForce(scope.client, DATED_FAMILY_CONTENTS))?.windows ?? null, '2026-11-20'));
    expect(rows.find((row) => row.family === 'zip_locality')).toEqual({ family: 'zip_locality', title: expect.any(String) as string, through: null, open: false, ended: false, loaded: false, partly: true, from: null });
    expect(rows.map((row) => row.family)).toEqual(familiesLoadedThrough(null, '2026-11-20').map((row) => row.family));
  });

  it('gives a family loaded only from a later day the first day it is loaded', async () => {
    const rows = await counted(async (scope) => familiesLoadedThrough(await contentWindowsOf(scope.client, RELEASE, manifest), '2025-06-01'));
    expect(rows.find((row) => row.family === 'ncci_mue')).toEqual({ family: 'ncci_mue', title: 'Medicare unit limits (MUE)', through: null, open: false, ended: false, loaded: true, partly: false, from: '2026-01-01' });
  });
});

describe('the contents a page reads (sec-app improvement)', () => {
  it('reads only the record types of the contents asked, kept apart from the whole release, with the same families', async () => {
    await counted(async (scope, queries) => {
      const whole = await contentWindowsOf(scope.client, RELEASE, manifest);
      const fee = await contentWindowsOf(scope.client, RELEASE, manifest, ['pfs_rvu']);
      expect([...fee.keys()]).toEqual(['pfs_rvu']);
      expect(fee.get('pfs_rvu')).toEqual(whole.get('pfs_rvu'));
      const dated = await contentWindowsOf(scope.client, RELEASE, manifest, DATED_FAMILY_CONTENTS);
      expect(dated.has('sequestration')).toBe(false);
      expect([...dated.keys()]).toEqual(expect.arrayContaining(['mppr_code', 'mppr_general', 'ncci_mue', 'pfs_gpci']));
      expect(familiesLoadedThrough(dated, '2026-11-20')).toEqual(familiesLoadedThrough(whole, '2026-11-20'));
      const afterReads = queries();
      expect(await contentWindowsOf(scope.client, RELEASE, manifest, ['pfs_rvu'])).toBe(fee);
      expect(queries()).toBe(afterReads);
    });
  });
});

describe('the cache', () => {
  it('reads a release’s windows and spans once per release and manifest, and again under another manifest', async () => {
    await counted(async (scope, queries) => {
      const first = await contentWindowsOf(scope.client, RELEASE, manifest);
      const afterFirst = queries();
      expect(afterFirst).toBe(1);
      expect(await contentWindowsOf(scope.client, RELEASE, manifest)).toBe(first);
      expect(queries()).toBe(afterFirst);
      await contentWindowsOf(scope.client, RELEASE, 'f'.repeat(64));
      expect(queries()).toBe(afterFirst + 1);
      const spans = await contentSpansOf(scope.client, RELEASE, manifest);
      expect(await contentSpansOf(scope.client, RELEASE, manifest)).toBe(spans);
      expect(queries()).toBe(afterFirst + 2);
    });
  });

  it('knows no manifest for a release not published', async () => {
    expect(await counted(async (scope) => releaseManifest(scope.client, 900_099))).toBeNull();
  });
});

describe('one computation (design 5.9)', () => {
  it('holds the windows of mppr_code, mppr_general and ncci_mue equal to rule_release_content_span()’s', async () => {
    await counted(async (scope) => {
      const windows = await contentWindowsOf(scope.client, RELEASE, manifest);
      const spans = await releaseContentSpans(scope.client, RELEASE);
      for (const content of ['mppr_code', 'mppr_general', 'ncci_mue'] as const) {
        expect(windows.get(content)?.loaded).toEqual(spans[content]);
      }
    });
  });

  it('writes the windows as a literal PostgreSQL reads back as the same multirange', async () => {
    await counted(async (scope) => {
      const windows = await contentWindowsOf(scope.client, RELEASE, manifest);
      for (const window of windows.values()) {
        const { rows } = await scope.client.query<{ same: boolean }>(
          "SELECT $1::datemultirange = (SELECT range_agg(daterange(effective_from, effective_to, '[]')) FROM rule_record WHERE release_no = $2 AND CASE WHEN record_type = 'mppr_rate' AND key ? 'hcpcs' THEN 'mppr_code' WHEN record_type = 'mppr_rate' THEN 'mppr_general' ELSE record_type END = $3) AS same",
          [multirangeLiteral(window.loaded), RELEASE, window.content],
        );
        expect(rows[0]?.same).toBe(true);
      }
      expect(multirangeLiteral([])).toBe('{}');
    });
  });
});
