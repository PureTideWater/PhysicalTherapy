import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CONTENT_IDS, ContentSummaryBuilder, type ContentId, type ReleaseCoverage, type RuleRecord, renderCoverageFile } from '@tp/rules';
import { CONTENT_CALENDAR, type CalendarEntry, type ContentCalendar, type DueItem } from '@tp/rules/calendar';
import { readRecordFile } from '@tp/rules/content';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type FetchAnswer, type Fetcher, RETRY_AFTER_MS, USER_AGENT, linkFileName, pageFileNames, watchSources } from './fetch';
import { runContentCalendar } from './index';
import { MAX_BODY, MAX_FINDINGS, findings, sourceBody } from './render';
import { readCalendarSources } from './sources';

/**
 * The content-calendar CLI (audit #59; docs/adr/0071; test matrix RCC-08): the sources it reads from a checkout (here a
 * temporary root holding SYNTHETIC records), the source watch through an injected fetcher, the findings file and the
 * exit codes. No network: every page is hand-written HTML.
 */

const REPOSITORY = path.resolve(import.meta.dirname, '../..');
const MUE_FIXTURE = path.join(REPOSITORY, 'fixtures/synthetic/rules/release-synth-900001/ncci_mue/2026/NCCI_MUE_SYNTHETIC.json');

const entryOf = (family: CalendarEntry['family']): CalendarEntry => CONTENT_CALENDAR.find((entry) => entry.family === family) as CalendarEntry;
const reviewed = (entry: CalendarEntry): CalendarEntry => ({ ...entry, review: { by: 'Synthetic Reviewer', on: '2026-10-01' } });

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'content-calendar-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(relative: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  writeFileSync(path.join(root, relative), text);
}

type Contents = ReleaseCoverage['contents'];
const content = (id: ContentId, from: string, to: string | null, retrieved = '2026-10-15'): Contents[number] => ({ content: id, records: 1, windows: [{ from, to }], newest_from: from, newest_retrieved: retrieved });

/** Every content open from 2020, so nothing is due but what a test changes. */
function everyContent(changes: Partial<Record<ContentId, Contents[number]>> = {}): Contents {
  return CONTENT_IDS.map((id) => changes[id] ?? content(id, '2020-01-01', null));
}

function writeCoverage(parent: 'content/releases' | 'content/outgoing', release: number, contents: Contents): void {
  const coverage: ReleaseCoverage = {
    format: 'tp-release-coverage/1',
    release,
    previous_release: null,
    prepared_on: '2026-10-20',
    look_back_years: 6,
    cutoff: '2020-01-01',
    contents,
    before_cutoff: [],
    closed_by_source: [],
    withdrawn: [],
  };
  write(`${parent}/${String(release)}/${'COVERAGE.md'}`, renderCoverageFile(coverage));
}

/** The SYNTHETIC MUE records of fixture release 900001, windowed [from, to] and retrieved on `retrieved`. */
function mueDraft(relative: string, from: string, to: string, retrieved: string): void {
  const records = (JSON.parse(readFileSync(MUE_FIXTURE, 'utf8')) as RuleRecord[]).map((record) => ({
    ...record,
    effective_from: from,
    effective_to: to,
    source: { ...record.source, retrieved },
  }));
  write(relative, JSON.stringify(records));
}

const ok = (text: string): FetchAnswer => ({ status: 200, text });
const page = (...hrefs: string[]) => `<html><body>${hrefs.map((href) => `<a href="${href}">link</a>`).join('\n')}</body></html>`;

describe('sources', () => {
  it('reads the newest published release as in force, and the prepared releases and the drafts as pending', () => {
    writeCoverage('content/releases', 2, everyContent());
    writeCoverage('content/releases', 3, everyContent({ ncci_mue: content('ncci_mue', '2026-01-01', '2026-09-30') }));
    writeCoverage('content/outgoing', 4, everyContent({ ncci_mue: content('ncci_mue', '2026-01-01', '2026-12-31', '2026-10-20') }));
    mueDraft('content/drafts/ncci_mue/2027/q1.json', '2027-01-01', '2027-03-31', '2026-12-05');
    mueDraft('content/drafts/ncci_mue/2027/q2.json', '2027-04-01', '2027-06-30', '2027-03-05');
    write('content/drafts/README.md', '# Drafts\n');

    const { sources, problems } = readCalendarSources(root);
    expect(problems).toEqual([]);
    expect(sources.releaseNo).toBe(3);
    expect(sources.nextReleaseNo).toBe(5);
    expect(sources.inForce.ncci_mue).toEqual({ windows: [{ from: '2026-01-01', to: '2026-09-30' }], newestFrom: '2026-01-01', newestRetrieved: '2026-10-15' });
    expect(sources.pending?.ncci_mue).toEqual({ windows: [{ from: '2026-01-01', to: '2027-06-30' }], newestFrom: '2027-04-01', newestRetrieved: '2027-03-05' });
    expect(Object.keys(sources.inForce)).toHaveLength(CONTENT_IDS.length);
  });

  it('with no release, has no state in force, and the drafts alone pending', () => {
    mueDraft('content/drafts/ncci_mue/2026/q4.json', '2026-10-01', '2026-12-31', '2026-09-05');
    const { sources, problems } = readCalendarSources(root);
    expect(problems).toEqual([]);
    expect(sources).toEqual({
      releaseNo: null,
      inForce: {},
      pending: { ncci_mue: { windows: [{ from: '2026-10-01', to: '2026-12-31' }], newestFrom: '2026-10-01', newestRetrieved: '2026-09-05' } },
      nextReleaseNo: 1,
    });
  });

  it('fails closed on a COVERAGE.md that is missing, malformed or of another release, and on a draft that is not JSON', () => {
    mkdirSync(path.join(root, 'content/releases/3'), { recursive: true });
    expect(readCalendarSources(root).problems).toEqual(['content/releases/3/COVERAGE.md cannot be read']);
    write('content/releases/3/COVERAGE.md', '# Coverage of release 3\n\nNo block.\n');
    expect(readCalendarSources(root).problems).toEqual(['content/releases/3/COVERAGE.md: holds 0 ```json blocks: it must hold exactly one']);
    write('content/releases/3/COVERAGE.md', '```json\n{ "format": "tp-release-coverage/1" }\n```\n');
    expect(readCalendarSources(root).problems.length).toBeGreaterThan(0);
    writeCoverage('content/releases', 3, everyContent());
    write('content/releases/3/COVERAGE.md', readFileSync(path.join(root, 'content/releases/3/COVERAGE.md'), 'utf8').replace('"release": 3', '"release": 2'));
    expect(readCalendarSources(root).problems).toEqual(['content/releases/3/COVERAGE.md: names release 2, not 3']);
    writeCoverage('content/releases', 3, everyContent());
    write('content/outgoing/4/COVERAGE.md', 'nothing');
    expect(readCalendarSources(root).problems).toHaveLength(1);
    rmSync(path.join(root, 'content/outgoing'), { recursive: true });
    write('content/drafts/ncci_mue/2027/q1.json', '{ not json');
    expect(readCalendarSources(root).problems).toEqual(['content/drafts/ncci_mue/2027/q1.json: is not valid JSON']);
  });

  it('reads the drafts file by file: every file’s records go into the builder before the next file is read, and none is kept (review m8)', () => {
    mueDraft('content/drafts/ncci_mue/2026/q4.json', '2026-10-01', '2026-12-31', '2026-09-05');
    mueDraft('content/drafts/ncci_mue/2027/q1.json', '2027-01-01', '2027-03-31', '2026-12-05');
    mueDraft('content/drafts/ncci_mue/2027/q2.json', '2027-04-01', '2027-06-30', '2027-03-05');
    const events: string[] = [];
    const read = new Map<string, Set<RuleRecord>>();
    let current: Set<RuleRecord> | undefined;
    let added = 0;
    const builder = new ContentSummaryBuilder();
    const { sources } = readCalendarSources(root, {
      readRecordFile: (file, where) => {
        // The previous file's records were all added before this read.
        expect(current === undefined || current.size === 0).toBe(true);
        const contents = readRecordFile(file, where);
        current = new Set(contents.records.map((located) => located.record));
        read.set(where, new Set(current));
        events.push(`read ${where}`);
        return contents;
      },
      newBuilder: () => ({
        add: (record) => {
          // Every record added is one of the file read last.
          expect(current?.delete(record)).toBe(true);
          added += 1;
          builder.add(record);
        },
        summaries: () => builder.summaries(),
      }),
    });
    expect(events).toEqual(['read content/drafts/ncci_mue/2026/q4.json', 'read content/drafts/ncci_mue/2027/q1.json', 'read content/drafts/ncci_mue/2027/q2.json']);
    expect(added).toBe([...read.values()].reduce((sum, records) => sum + records.size, 0));
    // The result holds windows and dates, never a record.
    const records = new Set([...read.values()].flatMap((set) => [...set]));
    const holdsRecord = (value: unknown): boolean =>
      typeof value === 'object' && value !== null && (records.has(value as RuleRecord) || Object.values(value).some(holdsRecord));
    expect(holdsRecord(sources)).toBe(false);
    expect(sources.pending?.ncci_mue?.windows).toEqual([{ from: '2026-10-01', to: '2027-06-30' }]);
  });
});

describe('the source watch', () => {
  const fee = (knownFiles: string[] | null): CalendarEntry => ({ ...entryOf('fee_schedule'), knownFiles });

  it('names the files on a page never recorded, and the new ones on a recorded page; names that left are not findings', async () => {
    const html = page('/files/zip/rvu27a.zip', 'https://www.cms.gov/files/zip/RVU26D.zip?x=1#top', 'RVU26C.zip', '/other/PFREV26.zip', '/medicare/payment/', 'RVU26D.zip');
    const fetcher: Fetcher = () => Promise.resolve(ok(html));
    const [unrecorded] = await watchSources([fee(null)], fetcher);
    expect(unrecorded).toMatchObject({ kind: 'source_unrecorded', title: 'Content source files not recorded: Medicare fee schedule (relative values and GPCIs)', names: ['RVU26C.zip', 'RVU26D.zip', 'rvu27a.zip'], notShown: 0 });
    const [changed, ...rest] = await watchSources([fee(['RVU26B.zip', 'RVU26C.zip', 'RVU26D.zip'])], fetcher);
    expect(rest).toEqual([]);
    expect(changed).toMatchObject({ kind: 'source_changed', title: 'Content source changed: Medicare fee schedule (relative values and GPCIs)', names: ['rvu27a.zip'] });
    expect(await watchSources([fee(['RVU26C.zip', 'RVU26D.zip', 'rvu27a.zip'])], fetcher)).toEqual([]);
    // No pattern: watched for reachability alone.
    expect(await watchSources([entryOf('conversion_factor')], fetcher)).toEqual([]);
  });

  it('retries once after 5 s, then reports the page unreachable on a non-2xx answer or a timeout', async () => {
    const calls: { url: string; timeoutMs: number }[] = [];
    const sleeps: number[] = [];
    const sleep = (ms: number) => {
      sleeps.push(ms);
      return Promise.resolve();
    };
    const answers: (FetchAnswer | Error)[] = [{ status: 503, text: '' }, ok(page('RVU27A.zip'))];
    const fetcher: Fetcher = (url, { timeoutMs }) => {
      calls.push({ url, timeoutMs });
      const answer = answers.shift() ?? new Error('timeout');
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    };
    expect((await watchSources([fee(['RVU27A.zip'])], fetcher, sleep))).toEqual([]);
    expect(calls).toEqual([
      { url: entryOf('fee_schedule').source.page, timeoutMs: 20_000 },
      { url: entryOf('fee_schedule').source.page, timeoutMs: 20_000 },
    ]);
    expect(sleeps).toEqual([RETRY_AFTER_MS]);
    const [unreachable, ...rest] = await watchSources([fee(['RVU27A.zip'])], fetcher, sleep);
    expect(rest).toEqual([]);
    expect(unreachable).toMatchObject({ kind: 'source_unreachable', title: 'Content source unreachable: Medicare fee schedule (relative values and GPCIs)' });
    expect(calls).toHaveLength(4);
  });

  it('reads a page several entries share once', async () => {
    let calls = 0;
    const fetcher: Fetcher = () => {
      calls += 1;
      return Promise.resolve(ok(page('MPPR27.zip')));
    };
    const therapy = CONTENT_CALENDAR.filter((entry) => entry.source.page === entryOf('mppr').source.page);
    expect(therapy.length).toBeGreaterThan(1);
    await watchSources(therapy, fetcher);
    expect(calls).toBe(1);
  });

  it('keeps only plain names: a hostile href never reaches a body, and the count of names not shown does (review m6)', async () => {
    const long = `RVU${'A'.repeat(197)}.zip`;
    const hostile = ['/files/@founder.zip', '/files/RVU27A](https://example.com).zip', '/files/RVU27A`b.zip', `/files/${long}`, '/files/RVU%2327%20A.zip', '/files/RVU27%40A.zip', '/files/RVU27A&amp;x.zip', '/files/%E0%A4%A.zip'];
    const html = page(...hostile, '/files/RVU27B.zip');
    const [finding] = await watchSources([fee(null)], () => Promise.resolve(ok(html)));
    expect(finding?.names).toEqual(['RVU27B.zip']);
    expect(finding?.notShown).toBe(hostile.length);
    const body = sourceBody(finding as NonNullable<typeof finding>);
    for (const text of ['@', 'founder', 'example.com', 'RVU27A`b', long, '#27', '](', 'x.zip']) {
      expect(body, text).not.toContain(text);
    }
    expect(body).toContain('`RVU27B.zip`');
    expect(body).toContain(`${String(hostile.length)} link names were not shown because they hold characters other than letters, digits, dot, underscore and hyphen.`);
    const [{ body: filed = '' } = { body: '' }] = findings([], [finding as NonNullable<typeof finding>], CONTENT_CALENDAR, { releaseNo: 3 });
    expect(filed).toBe(body);
  });

  it('reduces an href to its decoded last segment, without query or fragment', () => {
    expect(linkFileName('https://www.cms.gov/files/zip/rvu27a.zip?download=1#x')).toBe('rvu27a.zip');
    expect(linkFileName('/files/RVU%2027A.zip')).toBe('RVU 27A.zip');
    expect(linkFileName('a.zip?x=1&amp;y=2')).toBe('a.zip');
    expect(linkFileName('/files/')).toBeNull();
    expect(pageFileNames('<a HREF = "x/Y.zip">').names).toEqual(['Y.zip']);
  });

  it('sends the calendar’s User-Agent', () => {
    expect(USER_AGENT).toBe('PaidWhole content calendar');
  });
});

describe('the findings file', () => {
  const MUE_ONLY: ContentCalendar = [reviewed(entryOf('ncci_mue'))];

  async function run(argv: string[], calendar?: ContentCalendar): Promise<{ code: number; out: string; summary: string; stderr: string }> {
    let stderr = '';
    const code = await runContentCalendar([...argv, '--out', path.join(root, 'findings.json'), '--summary', path.join(root, 'summary.md')], {
      root,
      ...(calendar === undefined ? {} : { calendar }),
      fetcher: () => Promise.reject(new Error('no network in tests')),
      sleep: () => Promise.resolve(),
      stdout: () => undefined,
      stderr: (text) => {
        stderr += text;
      },
    });
    const read = (name: string) => {
      try {
        return readFileSync(path.join(root, name), 'utf8');
      } catch {
        return '';
      }
    };
    return { code, out: read('findings.json'), summary: read('summary.md'), stderr };
  }

  it('holds exactly this for MUE ending within 45 days of the newest published release', async () => {
    writeCoverage('content/releases', 3, everyContent({ ncci_mue: content('ncci_mue', '2026-01-01', '2026-12-31') }));
    const result = await run(['--today', '2026-12-01', '--no-fetch'], MUE_ONLY);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toEqual([
      {
        title: 'Content due: Medicare unit limits (MUE), loaded content ends within 45 days (2026-12-31)',
        body: [
          'Medicare unit limits (MUE) is loaded through 2026-12-31, 30 days after 2026-12-01. 2027-Q1 starts on 2027-01-01 and is due in a published release by 2026-12-18.',
          '',
          'Loaded through: 2026-12-31, in the newest published release (3)',
          'Period: 2027-Q1 (2027-01-01 to 2027-03-31)',
          'Due by: 2026-12-18',
          'Source: CMS, Medicare NCCI Medically Unlikely Edits (MUEs) (https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits/medicare-ncci-medically-unlikely-edits)',
          '',
          '```sh',
          'pnpm rules:import --type ncci_mue --year 2027 --effective-from 2027-01-01 --effective-to 2027-03-31 --url <download address> --file <the practitioner MUE table for 2027-Q1>',
          'pnpm verify-content',
          'pnpm release:assemble 4',
          '```',
          '',
          'Runbook: docs/runbooks/content-updates.md',
        ].join('\n'),
      },
    ]);
    expect(result.summary).toBe('## Content calendar, 2026-12-01\n\n- Content due: Medicare unit limits (MUE), loaded content ends within 45 days (2026-12-31)\n');
  });

  it('says nothing is due, and with the calendar unreviewed and the sources fetched, reports both', async () => {
    writeCoverage('content/releases', 3, everyContent());
    expect((await run(['--today', '2026-12-01', '--no-fetch'], MUE_ONLY)).summary).toBe('## Content calendar, 2026-12-01\n\nNothing is due.\n');
    const result = await run(['--today', '2026-12-01'], [entryOf('ncci_mue')]);
    expect(result.code).toBe(0);
    const filed = JSON.parse(result.out) as { title: string; body: string }[];
    expect(filed.map((finding) => finding.title)).toEqual(['Content calendar: entries not reviewed', 'Content source unreachable: Medicare unit limits (MUE)']);
    expect(filed[1]?.body).toContain('These dates are not yet confirmed against the source page (the calendar entry has no review).');
  });

  it('files at most 20 findings, each body at most 6,000 characters', () => {
    const items: DueItem[] = Array.from({ length: 25 }, (_, index) => ({
      family: 'ncci_mue',
      stage: 'ended',
      title: `Finding ${String(index)}`,
      loadedThrough: null,
      period: null,
      dueOn: null,
      commands: [],
      lines: ['x'.repeat(100), ...Array.from({ length: 100 }, () => 'y'.repeat(100))],
    }));
    const list = findings(items, [], CONTENT_CALENDAR, { releaseNo: null });
    expect(list).toHaveLength(MAX_FINDINGS);
    for (const finding of list) {
      expect(finding.body.length).toBeLessThanOrEqual(MAX_BODY);
      expect(finding.body.split('\n').at(-1)).toMatch(/^The rest of this finding was cut at 6,000 characters/);
    }
  });

  it('refuses a title that is not one line', async () => {
    const item: DueItem = { family: null, stage: 'no_release', title: 'Two\nlines', loadedThrough: null, period: null, dueOn: null, commands: [], lines: ['x'] };
    expect(() => findings([item], [], CONTENT_CALENDAR, { releaseNo: null })).toThrow(RangeError);
    const calendar = [{ ...reviewed(entryOf('ncci_mue')), title: 'Medicare unit\nlimits' }];
    writeCoverage('content/releases', 3, everyContent({ ncci_mue: content('ncci_mue', '2026-01-01', '2026-12-31') }));
    const result = await run(['--today', '2026-12-01', '--no-fetch'], calendar);
    expect(result.code).toBe(1);
    expect(result.out).toBe('');
  });

  it('exits 1 on an unreadable COVERAGE.md, a calendar that fails its schema or a today that is not a date, and 2 for usage', async () => {
    mkdirSync(path.join(root, 'content/releases/3'), { recursive: true });
    const unreadable = await run(['--today', '2026-12-01', '--no-fetch']);
    expect(unreadable).toMatchObject({ code: 1, out: '' });
    expect(unreadable.stderr).toContain('content/releases/3/COVERAGE.md cannot be read');
    writeCoverage('content/releases', 3, everyContent());
    expect((await run(['--today', '2026-12-01', '--no-fetch'], [entryOf('ncci_mue'), entryOf('ncci_mue')])).code).toBe(1);
    expect((await run(['--today', '2026-02-30', '--no-fetch'])).code).toBe(1);
    expect((await run(['--no-fetch'])).code).toBe(2);
    expect((await run(['--today', '2026-12-01', '--verbose'])).code).toBe(2);
    expect((await run(['--today', '2026-12-01', '--no-fetch'])).code).toBe(0);
  });
});
