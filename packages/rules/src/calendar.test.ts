import { readFileSync } from 'node:fs';
import path from 'node:path';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  CONTENT_CALENDAR,
  type CalendarEntry,
  type ContentCalendar,
  type ContentStates,
  DUE_STAGES,
  type DueItem,
  type DueSources,
  contentCalendarSchema,
  contentDue,
  familyLoadedThrough,
  loadedThrough,
} from './calendar';
import { IMPORTABLE_TYPES } from './parsers';
import { CONTENT_IDS, type ContentId, dayAfter, dayBefore } from './records';
import { QUARTERLY_RECORD_TYPES, cmsQuarterOfDate, insideOneYear, quarterWindowProblem } from './schema';

/**
 * The content calendar (audit #59; docs/adr/0071; test matrix RCC-08): the calendar's schema and entries, and
 * contentDue()'s stages, titles and commands.
 */

/** The calendar with every entry reviewed, so a test sees only the stages it sets up. */
const REVIEWED: ContentCalendar = CONTENT_CALENDAR.map((entry) => ({ ...entry, review: { by: 'Synthetic Reviewer', on: '2026-10-01' } }));

const entryOf = (family: CalendarEntry['family']): CalendarEntry => CONTENT_CALENDAR.find((entry) => entry.family === family) as CalendarEntry;

/** Every content in force, open from 2020 and retrieved on `retrieved`, so nothing is due but what a test changes. */
function allLoaded(retrieved = '2030-01-01', changes: ContentStates = {}): ContentStates {
  const states: Partial<Record<ContentId, ContentStates[ContentId]>> = {};
  for (const content of CONTENT_IDS) {
    states[content] = { windows: [{ from: '2020-01-01', to: null }], newestFrom: '2020-01-01', newestRetrieved: retrieved };
  }
  return { ...states, ...changes };
}

function without(states: ContentStates, contents: readonly ContentId[]): ContentStates {
  return Object.fromEntries(Object.entries(states).filter(([content]) => !(contents as readonly string[]).includes(content)));
}

const window = (from: string, to: string | null, retrieved = '2026-09-01') => ({ windows: [{ from, to }], newestFrom: from, newestRetrieved: retrieved });

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const of = (items: readonly DueItem[], family: CalendarEntry['family']) => items.filter((item) => item.family === family);

describe('the calendar', () => {
  it('parses, with every entry unreviewed and no source files recorded (5.8.1)', () => {
    expect(contentCalendarSchema.safeParse(CONTENT_CALENDAR).success).toBe(true);
    expect(CONTENT_CALENDAR.map((entry) => entry.family)).toEqual([
      'fee_schedule',
      'conversion_factor',
      'zip_locality',
      'mppr',
      'mppr_general',
      'ncci_mue',
      'ncci_ptp',
      'code_lists',
      'therapy_thresholds',
      'assistant_modifiers',
      'sequestration',
      'state_prompt_pay',
      'dispute_windows',
    ]);
    expect(CONTENT_CALENDAR.every((entry) => entry.review === null && entry.knownFiles === null)).toBe(true);
  });

  it('names every content but PaidWhole’s own denial categories in exactly one entry', () => {
    for (const content of CONTENT_IDS) {
      const owners = CONTENT_CALENDAR.filter((entry) => entry.contents.includes(content));
      expect(owners, content).toHaveLength(content === 'denial_category' ? 0 : 1);
    }
  });

  it('refuses a family twice, a content twice, a lead out of step with the cadence, a bad pattern, a day not every year has and a page not on https', () => {
    const fee = entryOf('fee_schedule');
    const refused = (calendar: unknown) => contentCalendarSchema.safeParse(calendar).success;
    expect(refused([fee, fee])).toBe(false);
    expect(refused([fee, { ...entryOf('ncci_mue'), contents: ['ncci_mue', 'pfs_gpci'] }])).toBe(false);
    expect(refused([{ ...fee, publicationLeadDays: null }])).toBe(false);
    expect(refused([{ ...entryOf('sequestration'), publicationLeadDays: 30 }])).toBe(false);
    expect(refused([{ ...fee, filePattern: '([' }])).toBe(false);
    expect(refused([{ ...entryOf('mppr'), cadence: { kind: 'annual', effective: '02-29' } }])).toBe(false);
    expect(refused([{ ...entryOf('code_lists'), cadence: { kind: 'dates', effective: ['03-01', '03-01'] } }])).toBe(false);
    expect(refused([{ ...fee, source: { ...fee.source, page: 'http://www.cms.gov/' } }])).toBe(false);
    expect(refused([{ ...fee, importCommands: ['pnpm release:load 1'] }])).toBe(false);
    expect(refused([fee])).toBe(true);
  });
});

describe('loadedThrough', () => {
  const state = { windows: [{ from: '2026-01-01', to: '2026-03-31' }, { from: '2026-07-01', to: '2026-09-30' }, { from: '2027-01-01', to: null }], newestFrom: '2027-01-01', newestRetrieved: '2026-12-01' };

  it('is the end of the window holding today, else the latest end before it; open has no end', () => {
    expect(loadedThrough(state, '2026-02-10')).toEqual({ through: '2026-03-31', open: false, loaded: true });
    expect(loadedThrough(state, '2026-05-10')).toEqual({ through: '2026-03-31', open: false, loaded: true });
    expect(loadedThrough(state, '2026-09-30')).toEqual({ through: '2026-09-30', open: false, loaded: true });
    expect(loadedThrough(state, '2026-10-01')).toEqual({ through: '2026-09-30', open: false, loaded: true });
    expect(loadedThrough(state, '2027-01-01')).toEqual({ through: null, open: true, loaded: true });
    expect(loadedThrough(undefined, '2026-10-01')).toEqual({ through: null, open: false, loaded: false });
    expect(loadedThrough({ windows: [{ from: '2027-01-01', to: '2027-03-31' }], newestFrom: null, newestRetrieved: null }, '2026-10-01')).toEqual({ through: null, open: false, loaded: true });
  });

  it('is a family’s earliest, open only when every content is', () => {
    const fee = entryOf('fee_schedule');
    expect(familyLoadedThrough(fee, { pfs_rvu: window('2026-10-01', '2026-12-31'), pfs_gpci: window('2026-10-01', '2027-03-31') }, '2026-11-01').through).toBe('2026-12-31');
    expect(familyLoadedThrough(fee, { pfs_rvu: window('2026-10-01', null), pfs_gpci: window('2026-10-01', '2027-03-31') }, '2026-11-01')).toEqual({ through: '2027-03-31', open: false, loaded: true });
    expect(familyLoadedThrough(fee, { pfs_rvu: window('2026-10-01', null), pfs_gpci: window('2026-10-01', null) }, '2026-11-01')).toEqual({ through: null, open: true, loaded: true });
    expect(familyLoadedThrough(fee, { pfs_rvu: window('2026-10-01', null) }, '2026-11-01').loaded).toBe(false);
  });
});

describe('contentDue', () => {
  const END = '2026-12-31';
  const feeEnding = (pending?: ContentStates): DueSources => ({
    releaseNo: 4,
    inForce: allLoaded(undefined, { pfs_rvu: window('2026-01-01', END), pfs_gpci: window('2026-01-01', END) }),
    ...(pending === undefined ? {} : { pending }),
  });

  it('throws on a today that is not a date', () => {
    expect(() => contentDue(REVIEWED, feeEnding(), '2026-02-30')).toThrow(RangeError);
    expect(() => contentDue(REVIEWED, feeEnding(), 'today')).toThrow(RangeError);
  });

  it('reports nothing when everything is loaded and reviewed', () => {
    expect(contentDue(REVIEWED, { releaseNo: 4, inForce: allLoaded() }, '2026-11-02')).toEqual([]);
  });

  it('steps through the stages at 46, 45, 15, 14, 0 and -1 days', () => {
    const stage = (days: number) => contentDue(REVIEWED, feeEnding(), addDays(END, -days)).map((item) => [item.family, item.stage]);
    expect(stage(46)).toEqual([]);
    expect(stage(45)).toEqual([['fee_schedule', 'ends_in_45']]);
    expect(stage(15)).toEqual([['fee_schedule', 'ends_in_45']]);
    expect(stage(14)).toEqual([['fee_schedule', 'ends_in_14']]);
    expect(stage(0)).toEqual([['fee_schedule', 'ends_in_14']]);
    expect(stage(-1)).toEqual([['fee_schedule', 'ended']]);
  });

  it('titles each stage without a day count, and fills the next period’s commands', () => {
    const [ends45] = contentDue(REVIEWED, feeEnding(), '2026-12-01');
    expect(ends45).toEqual({
      family: 'fee_schedule',
      stage: 'ends_in_45',
      title: 'Content due: Medicare fee schedule (relative values and GPCIs), loaded content ends within 45 days (2026-12-31)',
      loadedThrough: '2026-12-31',
      period: { label: '2027-Q1', from: '2027-01-01', to: '2027-03-31' },
      dueOn: '2026-12-18',
      commands: [
        'pnpm rules:import --type pfs_rvu --year 2027 --effective-from 2027-01-01 --effective-to 2027-03-31 --url <download address> --file <the PPRRVU file of RVU27A>',
        'pnpm rules:import --type pfs_gpci --year 2027 --effective-from 2027-01-01 --effective-to 2027-03-31 --url <download address> --file <the GPCI file of RVU27A>',
        'pnpm verify-content',
        'pnpm release:assemble 5',
      ],
      lines: ['Medicare fee schedule (relative values and GPCIs) is loaded through 2026-12-31, 30 days after 2026-12-01. 2027-Q1 starts on 2027-01-01 and is due in a published release by 2026-12-18.'],
    });
    expect(contentDue(REVIEWED, feeEnding(), '2026-12-20')[0]?.title).toBe('Content due: Medicare fee schedule (relative values and GPCIs), loaded content ends within 14 days (2026-12-31)');
    expect(contentDue(REVIEWED, feeEnding(), '2027-01-05')[0]?.title).toBe('Content ended: Medicare fee schedule (relative values and GPCIs), loaded content ended on 2026-12-31');
    expect(contentDue(REVIEWED, { ...feeEnding(), nextReleaseNo: 7 }, '2026-12-01')[0]?.commands.at(-1)).toBe('pnpm release:assemble 7');
  });

  it('reports no draft from the due day on (loadLeadDays before the period), until a pending window holds the period’s first day', () => {
    const dueOn = '2026-12-18';
    const stageOn = (today: string, pending: ContentStates) => contentDue(REVIEWED, feeEnding(pending), today).map((item) => item.stage);
    expect(stageOn(dayBefore(dueOn), {})).toEqual(['ends_in_14']);
    expect(stageOn(dueOn, {})).toEqual(['no_draft']);
    expect(contentDue(REVIEWED, feeEnding({}), dueOn)[0]?.title).toBe('Content due: Medicare fee schedule (relative values and GPCIs), 2027-Q1 has no draft (due 2026-12-18)');
    // One content drafted is not enough; both are.
    expect(stageOn(dueOn, { pfs_rvu: window('2027-01-01', '2027-03-31') })).toEqual(['no_draft']);
    expect(stageOn(dueOn, { pfs_rvu: window('2027-01-01', '2027-03-31'), pfs_gpci: window('2027-01-01', '2027-03-31') })).toEqual(['ends_in_14']);
    // Without pending (the console in production) there is no no_draft.
    expect(contentDue(REVIEWED, feeEnding(), dueOn).map((item) => item.stage)).toEqual(['ends_in_14']);
    // Ended outranks it.
    expect(stageOn('2027-01-01', {})).toEqual(['ended']);
  });

  it('reports an open family overdue when its newest files predate the expected publication, unless a draft has newer ones', () => {
    // 2027-Q1's PTP files are expected 30 days ahead, by 2026-12-02, and overdue after 5 days' grace, from 2026-12-07.
    const ptp = (retrieved: string, pending?: ContentStates): DueSources => ({
      releaseNo: 4,
      inForce: allLoaded('2026-12-20', { ncci_ptp: window('2020-01-01', null, retrieved) }),
      ...(pending === undefined ? {} : { pending }),
    });
    expect(contentDue(REVIEWED, ptp('2026-11-01'), '2026-12-06')).toEqual([]);
    const [overdue] = contentDue(REVIEWED, ptp('2026-11-01'), '2026-12-07');
    expect(overdue).toMatchObject({
      family: 'ncci_ptp',
      stage: 'overdue',
      title: 'Content overdue: Medicare coding edits (NCCI PTP), 2027-Q1 files not loaded',
      period: { label: '2027-Q1', from: '2027-01-01', to: '2027-03-31' },
      dueOn: '2026-12-18',
      commands: ['pnpm rules:import --type ncci_ptp --year 2027 --url <download address> --file <each practitioner PTP file for 2027-Q1>', 'pnpm verify-content', 'pnpm release:assemble 5'],
    });
    expect(contentDue(REVIEWED, ptp('2026-12-02'), '2026-12-07')).toEqual([]);
    expect(contentDue(REVIEWED, ptp('2026-11-01', { ncci_ptp: window('2020-01-01', null, '2026-12-03') }), '2026-12-07')).toEqual([]);
    expect(contentDue(REVIEWED, ptp('2026-11-01', { ncci_ptp: window('2020-01-01', null, '2026-11-30') }), '2026-12-07')).toHaveLength(1);
    // The code lists' dates cadence: the 2027-03-01 update, expected by 2027-01-30, overdue from 2027-02-06.
    const codes = { releaseNo: 4, inForce: allLoaded('2027-03-10', { rarc: window('2020-01-01', null, '2026-12-01') }) };
    expect(contentDue(REVIEWED, codes, '2027-02-05')).toEqual([]);
    expect(contentDue(REVIEWED, codes, '2027-02-06').map((item) => item.title)).toEqual(['Content overdue: X12 claim adjustment, remark and status codes, 2027-03-01 update files not loaded']);
  });

  it('reports a family with a content not loaded, and leaves on_change families alone', () => {
    const inForce = without(allLoaded(), ['conversion_factor', 'sequestration']);
    const items = contentDue(REVIEWED, { releaseNo: 4, inForce }, '2026-11-02');
    expect(items.map((item) => [item.stage, item.title])).toEqual([['not_loaded', 'Content not loaded: Medicare conversion factor']]);
    expect(items[0]?.commands[0]).toBe('pnpm rules:import --type conversion_factor --year 2026 --url <download address> --file <the conversion-factor CSV for 2026> --second-pass <its second, independent preparation>');
  });

  it('with no release and no pending, reports only that and the calendar’s own findings', () => {
    expect(contentDue(CONTENT_CALENDAR, { releaseNo: null, inForce: {} }, '2026-12-10').map((item) => item.stage)).toEqual(['no_release', 'calendar_unreviewed']);
    expect(contentDue(REVIEWED, { releaseNo: null, inForce: {} }, '2026-12-10').map((item) => item.title)).toEqual(['No rule release is published']);
  });

  it('with no release, judges the drafts and says so in the titles (review M5)', () => {
    const pending = without(allLoaded(undefined, { pfs_rvu: window('2026-10-01', END), pfs_gpci: window('2026-10-01', END), ncci_mue: window('2026-10-01', END) }), ['conversion_factor']);
    const due = (today: string) => contentDue(CONTENT_CALENDAR, { releaseNo: null, inForce: {}, pending }, today);
    expect(due('2026-12-10').map((item) => [item.stage, item.title])).toEqual([
      ['no_release', 'No rule release is published'],
      ['not_loaded', 'Content not in the drafts: Medicare conversion factor'],
      ['ends_in_45', 'Content due: Medicare fee schedule (relative values and GPCIs), content in the drafts ends within 45 days (2026-12-31)'],
      ['ends_in_45', 'Content due: Medicare unit limits (MUE), content in the drafts ends within 45 days (2026-12-31)'],
      ['calendar_unreviewed', 'Content calendar: entries not reviewed'],
    ]);
    const onDue = due('2026-12-18').filter((item) => item.stage === 'no_draft');
    expect(onDue.map((item) => item.title)).toEqual([
      'Content due: Medicare fee schedule (relative values and GPCIs), 2027-Q1 has no draft (due 2026-12-18)',
      'Content due: Medicare unit limits (MUE), 2027-Q1 has no draft (due 2026-12-18)',
    ]);
    expect(onDue[0]?.lines[0]).toContain('the drafts hold no window for the period');
    expect(of(due('2026-12-18'), 'ncci_mue')[0]?.commands.at(-1)).toBe('pnpm release:assemble 1');
  });

  it('lists every unreviewed entry in one item, and an entry reviewed more than 13 months ago on its own', () => {
    const [unreviewed] = contentDue(CONTENT_CALENDAR, { releaseNo: 4, inForce: allLoaded() }, '2026-11-02');
    expect(unreviewed?.stage).toBe('calendar_unreviewed');
    expect(unreviewed?.lines).toHaveLength(1 + CONTENT_CALENDAR.length);
    const calendar = REVIEWED.map((entry) => (entry.family === 'ncci_mue' ? { ...entry, review: { by: 'Synthetic Reviewer', on: '2025-09-30' } } : entry));
    const sources = { releaseNo: 4, inForce: allLoaded() };
    expect(contentDue(calendar, sources, '2026-10-30')).toEqual([]);
    expect(contentDue(calendar, sources, '2026-10-31').map((item) => [item.family, item.stage, item.title])).toEqual([['ncci_mue', 'calendar_review_due', 'Content calendar: Medicare unit limits (MUE) due for review']]);
  });

  it('never moves a windowed family’s stage backwards as today advances (none, 45, 14, no draft, ended)', () => {
    const rank = (items: readonly DueItem[]) => {
      const stage = of(items, 'ncci_mue')[0]?.stage;
      return stage === undefined ? 0 : ['ends_in_45', 'ends_in_14', 'no_draft', 'ended'].indexOf(stage) + 1;
    };
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 700 }), fc.integer({ min: 0, max: 400 }), fc.boolean(), fc.boolean(), (endOffset, length, withPending, drafted) => {
        const to = addDays('2026-01-01', endOffset);
        const from = addDays(to, -length);
        const pending = withPending ? (drafted ? { ncci_mue: window(dayAfter(to), addDays(to, 90)) } : {}) : undefined;
        const sources: DueSources = { releaseNo: 4, inForce: allLoaded('2030-01-01', { ncci_mue: window(from, to) }), ...(pending === undefined ? {} : { pending }) };
        let last = 0;
        for (let day = -60; day <= 20; day += 1) {
          const today = addDays(to, day);
          if (today < from) {
            continue;
          }
          const now = rank(contentDue(REVIEWED, sources, today));
          if (now < last) {
            return false;
          }
          last = now;
        }
        return true;
      }),
    );
  });

  it('fills commands the importer accepts for the period, using only the import command’s flags', () => {
    const cli = readFileSync(path.join(import.meta.dirname, 'cli/import.ts'), 'utf8');
    const flags = new Set([...cli.matchAll(/^\s+'?([a-z][a-z-]*)'?: \{ type: 'string' \}/gm)].map((match) => `--${match[1] ?? ''}`));
    expect([...flags]).toEqual(expect.arrayContaining(['--type', '--year', '--file', '--url', '--effective-from', '--effective-to', '--second-pass']));
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3 * 366 }), (offset) => {
        const today = addDays('2026-01-01', offset);
        // Nothing in force: every dated family is not loaded, with its commands for the period holding today.
        // Reviewed on the day, so the calendar's own findings (which carry no commands) stay out.
        const reviewed = REVIEWED.map((entry) => ({ ...entry, review: { by: 'Synthetic Reviewer', on: today } }));
        for (const item of contentDue(reviewed, { releaseNo: 4, inForce: {} }, today)) {
          const imports = item.commands.filter((command) => command.startsWith('pnpm rules:import '));
          expect(item.commands.slice(imports.length)).toEqual(['pnpm verify-content', 'pnpm release:assemble 5']);
          for (const command of imports) {
            const tokens = command.slice('pnpm rules:import '.length).replace(/<[^>]*>/g, '<placeholder>').split(' ');
            const options = new Map<string, string>();
            for (let index = 0; index < tokens.length; index += 2) {
              const flag = tokens[index] as string;
              expect(flags.has(flag), `${flag} in ${command}`).toBe(true);
              options.set(flag, tokens[index + 1] as string);
            }
            const type = options.get('--type') as string;
            expect(IMPORTABLE_TYPES).toContain(type);
            expect(['--file', '--url'].every((flag) => options.has(flag))).toBe(true);
            const period = item.period as { from: string; to: string };
            expect(options.get('--year')).toBe(period.from.slice(0, 4));
            const from = options.get('--effective-from');
            const to = options.get('--effective-to');
            if ((QUARTERLY_RECORD_TYPES as readonly string[]).includes(type)) {
              expect(quarterWindowProblem(cmsQuarterOfDate(period.from), null, from, to)).toBeNull();
            } else if (type === 'mppr_rate') {
              expect(from !== undefined && to !== undefined && insideOneYear(from, to)).toBe(true);
            } else {
              // Files that carry their own dates take no window.
              expect([from, to]).toEqual([undefined, undefined]);
            }
          }
        }
      }),
      { numRuns: 60 },
    );
  });

  it('orders items by stage', () => {
    const items = contentDue(CONTENT_CALENDAR, { releaseNo: 4, inForce: {} }, '2026-11-02');
    const order = items.map((item) => DUE_STAGES.indexOf(item.stage));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(items.at(-1)?.stage).toBe('calendar_unreviewed');
  });
});
