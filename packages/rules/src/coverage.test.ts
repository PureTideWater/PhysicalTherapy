import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  COVERAGE_FILE,
  COVERAGE_WITHDRAWN_FILE,
  type CoverageLoss,
  type DateRange,
  LOOK_BACK_YEARS,
  type ReleaseCoverage,
  contentGaps,
  contentSummaries,
  coverageMap,
  coverageRegression,
  coverageWithdrawnNoteSchema,
  dayAfter,
  lookBackCutoff,
  lossIdentity,
  lossText,
  mergeRanges,
  readJsonBlock,
  releaseCoverageSchema,
  renderCoverageFile,
  subtractRanges,
} from './records';
import type { RuleRecord, RuleRecordType } from './schema';
import { exampleRecord } from './testing';

/**
 * Release coverage (audit #30 R3, R4 and R5; docs/adr/0071; test matrix RCC-02 and RCC-03): window arithmetic, the
 * gaps inside a content, the coverage regression against the previous release, COVERAGE.md, and the map's memory.
 */

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function record(type: RuleRecordType, key: Record<string, unknown>, from: string, to: string | null): RuleRecord {
  return exampleRecord(type, { key, effective_from: from, effective_to: to } as Partial<RuleRecord>);
}

const RVU = { hcpcs: '97110', modifier: '' };
const PAIR = { column1: '97140', column2: '97530' };

/** Days as offsets from 2026-01-01, so a property can count them. */
const BASE = Date.UTC(2026, 0, 1);
const HORIZON = 80;
const dayOf = (offset: number): string => new Date(BASE + offset * 86_400_000).toISOString().slice(0, 10);
const offsetOf = (date: string): number => (Date.parse(`${date}T00:00:00Z`) - BASE) / 86_400_000;
const rangeArb = fc
  .tuple(fc.integer({ min: 0, max: 60 }), fc.option(fc.integer({ min: 0, max: 60 })))
  .map(([a, b]): DateRange => (b === null ? { from: dayOf(a), to: null } : { from: dayOf(Math.min(a, b)), to: dayOf(Math.max(a, b)) }));

/** The days a list covers up to the horizon, and whether it runs on for ever. */
function daysOf(ranges: readonly DateRange[]): { days: Set<number>; open: boolean } {
  const days = new Set<number>();
  for (const range of ranges) {
    const last = range.to === null ? HORIZON : offsetOf(range.to);
    for (let day = offsetOf(range.from); day <= last; day += 1) {
      days.add(day);
    }
  }
  return { days, open: ranges.some((range) => range.to === null) };
}

/** Sorted, apart (never touching), and each from <= to. */
function isMerged(ranges: readonly DateRange[]): boolean {
  return ranges.every((range, index) => {
    const before = ranges[index - 1];
    const ordered = range.to === null ? index === ranges.length - 1 : range.from <= range.to;
    return ordered && (before === undefined || (before.to !== null && dayAfter(before.to) < range.from));
  });
}

describe('mergeRanges and subtractRanges', () => {
  it('merge overlapping and adjacent ranges, and an open one swallows what follows', () => {
    expect(
      mergeRanges([
        { from: '2026-07-01', to: '2026-09-30' },
        { from: '2026-01-01', to: '2026-03-31' },
        { from: '2026-04-01', to: '2026-04-30' },
        { from: '2026-04-15', to: '2026-05-31' },
        { from: '2026-10-02', to: '2026-12-31' },
      ]),
    ).toEqual([
      { from: '2026-01-01', to: '2026-05-31' },
      { from: '2026-07-01', to: '2026-09-30' },
      { from: '2026-10-02', to: '2026-12-31' },
    ]);
    expect(mergeRanges([{ from: '2026-04-01', to: null }, { from: '2026-01-01', to: '2026-03-31' }, { from: '2026-05-01', to: '2026-12-31' }])).toEqual([{ from: '2026-01-01', to: null }]);
    expect(mergeRanges([])).toEqual([]);
  });

  it('subtract the days of one list from another', () => {
    const year = [{ from: '2026-01-01', to: '2026-12-31' }];
    expect(subtractRanges(year, [{ from: '2026-07-01', to: '2026-09-30' }])).toEqual([
      { from: '2026-01-01', to: '2026-06-30' },
      { from: '2026-10-01', to: '2026-12-31' },
    ]);
    expect(subtractRanges([{ from: '2024-01-01', to: null }], [{ from: '2024-01-01', to: '2026-09-30' }])).toEqual([{ from: '2026-10-01', to: null }]);
    expect(subtractRanges(year, [{ from: '2025-01-01', to: null }])).toEqual([]);
    expect(subtractRanges(year, [])).toEqual(year);
    expect(subtractRanges([], year)).toEqual([]);
  });

  it('merge to the same days, sorted and apart, whatever the order, and merging again changes nothing (property)', () => {
    fc.assert(
      fc.property(fc.array(rangeArb, { maxLength: 8 }), fc.integer(), (ranges, seed) => {
        const merged = mergeRanges(ranges);
        const shuffled = [...ranges].sort((a, b) => ((a.from.charCodeAt(9) * 31 + seed) % 7) - ((b.from.charCodeAt(9) * 31 + seed) % 7));
        expect(isMerged(merged)).toBe(true);
        expect(mergeRanges(merged)).toEqual(merged);
        expect(mergeRanges(shuffled)).toEqual(merged);
        expect(daysOf(merged)).toEqual(daysOf(ranges));
      }),
    );
  });

  it('leave exactly the days of a that b does not hold: a - b and b are disjoint, and with the part of a in b they make a (property)', () => {
    fc.assert(
      fc.property(fc.array(rangeArb, { maxLength: 6 }), fc.array(rangeArb, { maxLength: 6 }), (a, b) => {
        const left = subtractRanges(a, b);
        const inA = daysOf(a);
        const inB = daysOf(b);
        const leftDays = daysOf(left);
        expect(isMerged(left)).toBe(true);
        expect(leftDays.days).toEqual(new Set([...inA.days].filter((day) => !inB.days.has(day))));
        expect(leftDays.open).toBe(inA.open && !inB.open);
        expect([...leftDays.days].some((day) => inB.days.has(day))).toBe(false);
      }),
    );
  });
});

describe('contentGaps', () => {
  it('names each hole inside a content, and none for locality_map_plus_four or one key\'s own holes', () => {
    const records = [
      record('ncci_mue', { hcpcs: '97110' }, '2026-01-01', '2026-03-31'),
      record('ncci_mue', { hcpcs: '97112' }, '2026-04-01', '2026-06-30'),
      record('ncci_mue', { hcpcs: '97110' }, '2026-10-01', '2026-12-31'),
      record('pfs_rvu', RVU, '2026-01-01', '2026-03-31'),
      record('pfs_rvu', { hcpcs: '97112', modifier: '' }, '2026-04-01', '2026-06-30'),
      record('pfs_rvu', RVU, '2026-07-01', '2026-09-30'),
      record('locality_map_plus_four', { zip: '00012' }, '2026-01-01', '2026-03-31'),
      record('locality_map_plus_four', { zip: '00012' }, '2026-07-01', '2026-09-30'),
      record('mppr_rate', { component: 'practice_expense' }, '2025-01-01', '2025-12-31'),
      record('mppr_rate', { component: 'practice_expense' }, '2026-02-01', null),
    ];
    expect(contentGaps(records)).toEqual([
      { content: 'mppr_general', from: '2026-01-01', to: '2026-01-31' },
      { content: 'ncci_mue', from: '2026-07-01', to: '2026-09-30' },
    ]);
    expect(contentGaps([])).toEqual([]);
  });

  it('finds every day between a content\'s first start and last end that no window holds, and only those (property)', () => {
    fc.assert(
      fc.property(fc.array(rangeArb, { minLength: 1, maxLength: 8 }), (ranges) => {
        const records = ranges.map((range) => record('ncci_mue', { hcpcs: '97110' }, range.from, range.to));
        const gaps = contentGaps(records);
        const covered = daysOf(ranges).days;
        const first = Math.min(...ranges.map((range) => offsetOf(range.from)));
        const last = ranges.some((range) => range.to === null) ? HORIZON : Math.max(...ranges.map((range) => offsetOf(range.to as string)));
        const holes = new Set<number>();
        for (let day = first; day <= last; day += 1) {
          if (!covered.has(day)) {
            holes.add(day);
          }
        }
        expect(daysOf(gaps).days).toEqual(holes);
        expect(gaps.every((gap) => gap.content === 'ncci_mue')).toBe(true);
      }),
    );
  });
});

describe('coverageMap', () => {
  it('keeps one compact string per identity, with a source-dated open record\'s start', () => {
    const map = coverageMap([
      record('pfs_rvu', RVU, '2026-04-01', '2026-06-30'),
      record('pfs_rvu', RVU, '2026-01-01', '2026-03-31'),
      record('pfs_rvu', RVU, '2026-10-01', '2026-12-31'),
      record('ncci_ptp', PAIR, '2020-01-01', '2023-12-31'),
      record('ncci_ptp', PAIR, '2024-01-01', null),
      record('mppr_rate', { component: 'practice_expense' }, '2026-01-01', null),
    ]);
    expect(Object.fromEntries(map)).toEqual({
      'pfs_rvu {"hcpcs":"97110","modifier":""}': '2026-01-01..2026-06-30,2026-10-01..2026-12-31',
      'ncci_ptp {"column1":"97140","column2":"97530"}': '2020-01-01..@2024-01-01',
      'mppr_rate {"component":"practice_expense"}': '2026-01-01..',
    });
  });
});

describe('coverageRegression', () => {
  const CUTOFF = '2020-01-01';
  const regression = (before: RuleRecord[], after: RuleRecord[]) => coverageRegression(coverageMap(before), coverageMap(after), after, CUTOFF);
  const loss = (type: RuleRecordType, key: Record<string, string>, from: string, to: string | null): CoverageLoss => ({ record_type: type, key, from, to });
  const quarters = (key: Record<string, string>, ...windows: [string, string][]) => windows.map(([from, to]) => record('pfs_rvu', key, from, to));
  const Q1: [string, string] = ['2026-01-01', '2026-03-31'];
  const Q2: [string, string] = ['2026-04-01', '2026-06-30'];
  const Q3: [string, string] = ['2026-07-01', '2026-09-30'];
  const Q4: [string, string] = ['2026-10-01', '2026-12-31'];

  it('finds no loss when the next release covers everything', () => {
    expect(regression(quarters(RVU, Q1, Q2), quarters(RVU, Q1, Q2, Q3))).toEqual({ beforeCutoff: [], closedBySource: [], unexplained: [] });
  });

  it('names a quarter dropped', () => {
    expect(regression(quarters(RVU, Q1, Q2, Q3, Q4), quarters(RVU, Q1, Q2, Q4)).unexplained).toEqual([loss('pfs_rvu', RVU, '2026-07-01', '2026-09-30')]);
  });

  it('names an identity dropped, with all it had, sorted by type, key and start', () => {
    const other = { hcpcs: '97112', modifier: '' };
    const result = regression([...quarters(other, Q1, Q3), ...quarters(RVU, Q1), record('ncci_mue', { hcpcs: '97110' }, ...Q1)], quarters(RVU, Q1));
    expect(result.unexplained).toEqual([
      loss('ncci_mue', { hcpcs: '97110' }, '2026-01-01', '2026-03-31'),
      loss('pfs_rvu', other, '2026-01-01', '2026-03-31'),
      loss('pfs_rvu', other, '2026-07-01', '2026-09-30'),
    ]);
  });

  it('splits a loss across the cutoff: the older part is allowed, the rest is not', () => {
    const result = regression(quarters(RVU, ['2019-07-01', '2019-09-30'], ['2019-10-01', '2019-12-31'], ['2020-01-01', '2020-03-31'], Q1), quarters(RVU, Q1));
    expect(result.beforeCutoff).toEqual([loss('pfs_rvu', RVU, '2019-07-01', '2019-12-31')]);
    expect(result.unexplained).toEqual([loss('pfs_rvu', RVU, '2020-01-01', '2020-03-31')]);
    expect(regression(quarters(RVU, ['2018-01-01', '2018-03-31'], Q1), quarters(RVU, Q1)).beforeCutoff).toEqual([loss('pfs_rvu', RVU, '2018-01-01', '2018-03-31')]);
  });

  it('allows a PTP pair closed by its own deletion date', () => {
    const result = regression([record('ncci_ptp', PAIR, '2024-01-01', null)], [record('ncci_ptp', PAIR, '2024-01-01', '2026-09-30')]);
    expect(result).toEqual({ beforeCutoff: [], closedBySource: [loss('ncci_ptp', PAIR, '2026-10-01', null)], unexplained: [] });
  });

  it('does not allow a PTP pair closed by a record with a different start', () => {
    const result = regression([record('ncci_ptp', PAIR, '2024-01-01', null)], [record('ncci_ptp', PAIR, '2024-04-01', '2026-09-30')]);
    expect(result.closedBySource).toEqual([]);
    expect(result.unexplained).toEqual([loss('ncci_ptp', PAIR, '2024-01-01', '2024-03-31'), loss('ncci_ptp', PAIR, '2026-10-01', null)]);
  });

  it('does not allow an RVU code closed: a quarterly type has no carve-out', () => {
    const result = regression([record('pfs_rvu', RVU, '2026-01-01', null)], [record('pfs_rvu', RVU, '2026-01-01', '2026-09-30')]);
    expect(result.closedBySource).toEqual([]);
    expect(result.unexplained).toEqual([loss('pfs_rvu', RVU, '2026-10-01', null)]);
  });

  it('finds no loss when an open hand-typed record is closed and continued by its successor', () => {
    const general = { component: 'practice_expense' };
    expect(
      regression([record('mppr_rate', general, '2026-01-01', null)], [record('mppr_rate', general, '2026-01-01', '2026-06-30'), record('mppr_rate', general, '2026-07-01', null)]),
    ).toEqual({ beforeCutoff: [], closedBySource: [], unexplained: [] });
  });

  it('cuts six years back to January 1', () => {
    expect(LOOK_BACK_YEARS).toBe(6);
    expect(lookBackCutoff('2026-10-26')).toBe('2020-01-01');
    expect(lookBackCutoff('2027-01-01')).toBe('2021-01-01');
  });
});

describe('COVERAGE.md', () => {
  const records = [record('pfs_rvu', RVU, ...(['2026-01-01', '2026-03-31'] as const)), record('ncci_ptp', PAIR, '2024-01-01', '2026-09-30')];
  const first: ReleaseCoverage = {
    format: 'tp-release-coverage/1',
    release: 1,
    previous_release: null,
    prepared_on: '2026-10-26',
    look_back_years: LOOK_BACK_YEARS,
    cutoff: lookBackCutoff('2026-10-26'),
    contents: contentSummaries(records).map((summary) => ({ ...summary, windows: [...summary.windows] })),
    before_cutoff: [],
    closed_by_source: [],
    withdrawn: [],
  };
  const second: ReleaseCoverage = {
    ...first,
    release: 2,
    previous_release: 1,
    before_cutoff: [{ record_type: 'pfs_rvu', key: RVU, from: '2019-01-01', to: '2019-03-31' }],
    closed_by_source: [{ record_type: 'ncci_ptp', key: PAIR, from: '2026-10-01', to: null }],
    withdrawn: [
      {
        record_type: 'denial_category',
        key: { rarc: null, group_code: 'CO', carc: '9001' },
        from: '2026-01-01',
        to: null,
        reason: 'SYNTHETIC category retired on purpose',
        withdrawn_by: 'Pat Example',
        confirmed_by: 'Sam Example',
        withdrawn_on: '2026-10-25',
      },
    ],
  };

  it('names its files', () => {
    expect([COVERAGE_FILE, COVERAGE_WITHDRAWN_FILE]).toEqual(['COVERAGE.md', 'COVERAGE-WITHDRAWN.md']);
  });

  it('renders a first release byte for byte', () => {
    const text = renderCoverageFile(first);
    expect(text.split('```json')[0]).toBe(
      [
        '# Coverage of release 1',
        '',
        'Prepared 2026-10-26 by `pnpm release:assemble 1`. The content checker recomputes everything in the block below',
        'from this release\'s records; never edit it by hand (content/sources/README.md, "Coverage").',
        '',
        '- 2 contents, each with the dates it is loaded for.',
        '- Release 1 is the first release: nothing to compare.',
        '',
        '',
      ].join('\n'),
    );
    expect(text.endsWith('\n```\n')).toBe(true);
    expect(text).toContain('```json\n{\n  "format": "tp-release-coverage/1",\n  "release": 1,\n  "previous_release": null,\n');
  });

  it('renders a second release with one loss of each kind, keys in schema order and key names sorted', () => {
    const text = renderCoverageFile(second);
    expect(text.split('```json')[0]).toBe(
      [
        '# Coverage of release 2',
        '',
        'Prepared 2026-10-26 by `pnpm release:assemble 2`. The content checker recomputes everything in the block below',
        'from this release\'s records and release 1\'s; never edit it by hand (content/sources/README.md, "Coverage").',
        '',
        '- 2 contents, each with the dates it is loaded for.',
        '- Against release 1: 1 range(s) before the look-back\'s cutoff (2020-01-01), 1 closed by the source\'s own dates,',
        '  1 withdrawn by a signed note.',
        '',
        '',
      ].join('\n'),
    );
    expect(text).toContain(
      '"withdrawn": [\n    {\n      "record_type": "denial_category",\n      "key": {\n        "carc": "9001",\n        "group_code": "CO",\n        "rarc": null\n      },\n      "from": "2026-01-01",\n      "to": null,\n      "reason"',
    );
  });

  it('reads back what it renders', () => {
    for (const coverage of [first, second]) {
      const block = readJsonBlock(renderCoverageFile(coverage));
      expect(block.problems).toEqual([]);
      expect(releaseCoverageSchema.parse(block.value)).toEqual(coverage);
    }
  });

  it('holds exactly one closed json block of valid JSON', () => {
    expect(readJsonBlock('# Coverage\n\nno block\n').problems).toEqual(['holds 0 ```json blocks: it must hold exactly one']);
    expect(readJsonBlock('```json\n{}\n```\n\n```json\n{}\n```\n').problems).toEqual(['holds 2 ```json blocks: it must hold exactly one']);
    expect(readJsonBlock('```json\n{}\n').problems).toEqual(['its ```json block is never closed by a ``` line']);
    expect(readJsonBlock('```json\n{ nope\n```\n').problems).toEqual(['its ```json block is not valid JSON']);
    expect(readJsonBlock('# Note\r\n\r\n```json\r\n{"a": 1}\r\n```\r\n')).toEqual({ value: { a: 1 }, problems: [] });
    expect(readJsonBlock('```js\n{}\n```\n').problems).toEqual(['holds 0 ```json blocks: it must hold exactly one']);
  });

  it('refuses a key named twice in one object, which JSON.parse would read as its last (INT-PIPE-4)', () => {
    const twice = (json: string) => readJsonBlock(`\`\`\`json\n${json}\n\`\`\`\n`).problems;
    const message = (key: string) => `its \`\`\`json block names ${JSON.stringify(key)} twice in one object: JSON keeps only the last, so a reader and the checker would read different values`;
    expect(twice('{"withdrawn": [], "format": "x", "withdrawn": [1]}')).toEqual([message('withdrawn')]);
    expect(twice('{"a": [{"k": 1, "k" : 2}]}')).toEqual([message('k')]);
    expect(twice('{"\\u0061": 1, "a": 2}')).toEqual([message('a')]);
    // The same key in two objects, a key's text as a value, and escaped quotes are all one key each.
    expect(twice('{"a": {"k": 1}, "b": {"k": 2}, "c": ["k", "k"], "d\\"": "a", "e": "x\\\\"}')).toEqual([]);
    expect(readJsonBlock(renderCoverageFile(second)).problems).toEqual([]);
  });

  it('names a loss and its identity once for the assembler and the checker', () => {
    const loss: CoverageLoss = { record_type: 'ncci_ptp', key: PAIR, from: '2026-10-01', to: null };
    expect(lossText(loss)).toBe(`ncci_ptp ${JSON.stringify(PAIR)} 2026-10-01 to open`);
    expect(lossIdentity({ ...loss, key: Object.fromEntries(Object.entries(PAIR).reverse()) })).toBe(lossIdentity(loss));
    expect(lossIdentity(second.withdrawn[0] as CoverageLoss)).toBe(lossIdentity({ record_type: 'denial_category', key: { carc: '9001', group_code: 'CO', rarc: null }, from: '2026-01-01', to: null }));
  });

  it('refuses a drafts note that withdraws one loss twice', () => {
    const note = { format: 'tp-coverage-withdrawn/1', previous_release: 1, withdrawn: second.withdrawn };
    expect(coverageWithdrawnNoteSchema.safeParse(note).success).toBe(true);
    const twice = coverageWithdrawnNoteSchema.safeParse({ ...note, withdrawn: [...second.withdrawn, { ...second.withdrawn[0], reason: 'the same loss, another reason' }] });
    expect(twice.success).toBe(false);
    expect(twice.error?.issues).toEqual([
      expect.objectContaining({ path: ['withdrawn', 1], message: 'withdraws denial_category {"carc":"9001","group_code":"CO","rarc":null} 2026-01-01 to open a second time: list each loss once' }),
    ]);
  });
});

describe('the coverage map\'s memory (R5, review m8)', () => {
  it('holds 2,000,000 PTP identities in at most 320 MiB of heap after a full collection, and no record', () => {
    const records = pathToFileURL(path.join(REPO, 'packages/rules/src/records.ts')).href;
    // One record alive at a time: a generator feeds coverageMap. WeakRefs to a few records prove none is kept.
    const script = `
      const { coverageMap } = await import(${JSON.stringify(records)});
      const IDENTITIES = 2_000_000;
      const code = (n) => String(n).padStart(5, '0');
      const watched = [];
      function* ptp() {
        for (let index = 0; index < IDENTITIES; index += 1) {
          const closed = index % 3 === 0;
          const record = {
            record_type: 'ncci_ptp',
            key: { column1: code(Math.floor(index / 2000)), column2: code(10000 + (index % 2000)) },
            value: { modifier_indicator: '1', rationale: 'SYNTHETIC', in_existence_prior_to_1996: false },
            effective_from: closed ? '2024-01-01' : '2025-04-01',
            effective_to: closed ? '2026-06-30' : null,
          };
          if (index % 500_000 === 0) watched.push(new WeakRef(record));
          yield record;
        }
      }
      const used = () => { globalThis.gc(); globalThis.gc(); return process.memoryUsage().heapUsed; };
      const before = used();
      const map = coverageMap(ptp());
      await new Promise((resolve) => setTimeout(resolve, 0));
      const after = used();
      const values = [...map.values()];
      console.log(JSON.stringify({
        identities: map.size,
        distinct: new Set(values).size,
        allStrings: values.every((value) => typeof value === 'string'),
        recordsKept: watched.filter((ref) => ref.deref() !== undefined).length,
        watched: watched.length,
        growthMiB: (after - before) / 1048576,
      }));
    `;
    const child = spawnSync(process.execPath, ['--expose-gc', '--import', 'tsx', '--input-type=module', '--eval', script], { cwd: REPO, encoding: 'utf8', timeout: 240_000 });
    expect(child.status, child.stderr.slice(-2000)).toBe(0);
    const result = JSON.parse(child.stdout.trim().split('\n').at(-1) ?? '{}') as {
      identities: number;
      distinct: number;
      allStrings: boolean;
      recordsKept: number;
      watched: number;
      growthMiB: number;
    };
    expect(result).toMatchObject({ identities: 2_000_000, distinct: 2, allStrings: true, recordsKept: 0, watched: 4 });
    expect(result.growthMiB).toBeLessThanOrEqual(320);
  }, 300_000);
});
