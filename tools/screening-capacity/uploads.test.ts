import { SCALE_RELEASE_SHAPE, SYNTH_SCREENING_MAX_ROWS, scalePlusFourRanges, scaleZips, smallUploadRows } from '@tp/synth';
import { describe, expect, it } from 'vitest';

import { SCREENING_WAIT_STATES, screeningSentPath } from '../../apps/web/src/lib/screening/sent';
import { ORACLE_UPLOADS, REPETITIONS, oracleKind } from './report';
import { SENT_PAGE, scenarios, splitZip, typedZip, uploadAccountDomain } from './uploads';

/**
 * The capacity test's uploads (audit #53 part 1; PR 6b, docs/adr/0064): every upload from its own ZIP, the five-digit
 * ones from ZIPs that need no ZIP+4, and S1-2 from a ZIP the release splits across localities, typed with a ZIP+4 in
 * the next locality's range, so its run is compared with the whole-release oracle; and every upload from a domain of
 * its own, a prospect of its own (PR 6b-3, Q7). S4 runs three times with the same uploads, each run's from prospects of
 * its own (the founder's ruling of 2026-10-23).
 */

describe('the capacity uploads', () => {
  it('sends S1-2 from a split ZIP with a ZIP+4 in the other locality’s range, typed as ZIP+4, behind S1-1', () => {
    const split = splitZip();
    const zip = scaleZips(SCALE_RELEASE_SHAPE).find((entry) => entry.zip === split.zip);
    expect(zip?.plusFour).toBe(true);
    const range = zip === undefined ? undefined : scalePlusFourRanges(SCALE_RELEASE_SHAPE, zip).find((entry) => entry.from <= split.zipPlusFour && split.zipPlusFour <= entry.to);
    expect(range?.localityIndex).not.toBe(zip?.localityIndex);
    const [s1] = scenarios();
    expect(s1?.uploads.map((upload) => [upload.id, upload.shape, upload.behind, typedZip(upload)])).toEqual([
      ['S1-1', 'worst', false, s1?.uploads[0]?.zip],
      ['S1-2', 'small', true, `${split.zip}-${split.zipPlusFour}`],
    ]);
  });

  it('keeps every other upload at a five-digit ZIP that needs no ZIP+4, no ZIP twice but in S4’s repeated runs', () => {
    const uploads = scenarios().flatMap((scenario) => scenario.uploads);
    const flagged = new Set(scaleZips(SCALE_RELEASE_SHAPE).filter((zip) => zip.plusFour).map((zip) => zip.zip));
    expect(uploads.filter((upload) => upload.id !== 'S1-2').every((upload) => upload.zipPlusFour === null && !flagged.has(upload.zip) && typedZip(upload) === upload.zip)).toBe(true);
    // Each distinct upload (S4's first run's for S4) from a ZIP of its own; S4's later runs send the same uploads.
    const distinct = scenarios().filter((scenario) => scenario.repetition === null || scenario.repetition === 1).flatMap((scenario) => scenario.uploads);
    expect(new Set(distinct.map((upload) => upload.zip)).size).toBe(distinct.length);
    // A practice name of its own for every upload of every run, so no screening replaces another (the same practice name
    // at the same ZIP, or the same address).
    expect(new Set(uploads.map((upload) => upload.practiceName)).size).toBe(uploads.length);
    // Each upload the oracle compares is one the scenarios send.
    expect(ORACLE_UPLOADS.every((id) => uploads.some((upload) => upload.id === id))).toBe(true);
    expect(uploads.filter((upload) => upload.zipPlusFour !== null).map((upload) => [upload.id, oracleKind(upload.id)])).toEqual([['S1-2', 'whole_release']]);
  });

  it('sends every upload from a domain of its own, so each is its own rate-limit account and none crosses a share (Q7)', () => {
    const uploads = scenarios().flatMap((scenario) => scenario.uploads);
    const domains = uploads.map((upload) => uploadAccountDomain(upload));
    expect(new Set(domains).size).toBe(uploads.length);
    expect(domains.every((domain) => domain.endsWith('.synthetic.test'))).toBe(true);
    expect(new Set(uploads.map((upload) => upload.contactEmail)).size).toBe(uploads.length);
    expect(uploadAccountDomain(uploads.find((upload) => upload.id === 'S4-3') ?? { contactEmail: '' })).toBe('capacity-s4r1-upload3.synthetic.test');
    // No account sends more than one upload: each of S4's runs sends its three worst files as three prospects, never one
    // past its 100,000 rows.
    for (const run of scenarios().filter((scenario) => scenario.id === 'S4')) {
      expect(run.uploads.filter((upload) => upload.shape === 'worst')).toHaveLength(3);
    }
  });

  it('keeps every upload of the run inside the day’s cap of normal rows, S4’s three runs included, so none waits (Q7)', () => {
    // screening_wait_limits(): 1,000,000 rows a UTC day of uploads within their shares. Each run starts from a fresh database.
    const rows = scenarios()
      .flatMap((scenario) => scenario.uploads)
      .reduce((sum, upload) => sum + (upload.shape === 'small' ? smallUploadRows().length : SYNTH_SCREENING_MAX_ROWS), 0);
    expect(rows).toBeLessThanOrEqual(1_000_000);
  });

  it('sends S4 three times, the same uploads in each run from prospects of their own (the founder’s ruling of 2026-10-23)', () => {
    const runs = scenarios().filter((scenario) => scenario.id === 'S4');
    expect(REPETITIONS).toBe(3);
    expect(runs.map((run) => run.repetition)).toEqual([1, 2, 3]);
    const same = (run: (typeof runs)[number]) => run.uploads.map((upload) => [upload.id, upload.shape, upload.variant, upload.behind, upload.zip, upload.zipPlusFour]);
    expect(runs.map(same)).toEqual([same(runs[0]!), same(runs[0]!), same(runs[0]!)]);
    expect(runs[0]?.uploads.map((upload) => upload.id)).toEqual(['S4-1', 'S4-2', 'S4-3', 'S4-4']);
    expect(runs[1]?.uploads.map((upload) => [upload.practiceName, upload.contactEmail])).toEqual([
      ['Synthetic Capacity Therapy ebc', 'capacity.s4r2.upload1@capacity-s4r2-upload1.synthetic.test'],
      ['Synthetic Capacity Therapy ecc', 'capacity.s4r2.upload2@capacity-s4r2-upload2.synthetic.test'],
      ['Synthetic Capacity Therapy edc', 'capacity.s4r2.upload3@capacity-s4r2-upload3.synthetic.test'],
      ['Synthetic Capacity Therapy eec', 'capacity.s4r2.upload4@capacity-s4r2-upload4.synthetic.test'],
    ]);
  });

  it('waits for the "sent" page the web lands an accepted upload on, in each of its four states (Q12)', () => {
    expect(SCREENING_WAIT_STATES.filter((wait) => !SENT_PAGE.test(`http://127.0.0.1:4931${screeningSentPath(wait)}`))).toEqual([]);
    expect(SENT_PAGE.test('http://127.0.0.1:4931/screening')).toBe(false);
  });

  it('starts every cold scenario, each of S4’s runs among them, and S2, from a fresh consumer, and S3 from the one that priced S2', () => {
    expect(scenarios().map((scenario) => [scenario.id, scenario.repetition, scenario.freshConsumer, scenario.freshPostgres])).toEqual([
      ['S1', null, true, true],
      ['S2', null, true, false],
      ['S3', null, false, false],
      ['S4', 1, true, true],
      ['S4', 2, true, true],
      ['S4', 3, true, true],
      ['S5', null, true, true],
    ]);
  });
});
