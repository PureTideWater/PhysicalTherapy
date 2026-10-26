import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CONTENT_IDS, ContentSummaryBuilder, type ContentId, type ReleaseCoverage, type RuleRecord, renderCoverageFile } from '@tp/rules';
import { CONTENT_CALENDAR, type CalendarEntry, type ContentCalendar, type DueItem } from '@tp/rules/calendar';
import { readRecordFile } from '@tp/rules/content';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type FetchAnswer,
  type FetchFunction,
  type Fetcher,
  MAX_PAGE_BYTES,
  MAX_REDIRECTS,
  RETRY_AFTER_MS,
  USER_AGENT,
  encodedName,
  httpFetcherFor,
  linkFileName,
  pageFileNames,
  sourceHosts,
  watchSources,
} from './fetch';
import { runContentCalendar } from './index';
import { MAX_BODY, MAX_FILE_BYTES, MAX_OPENED_PER_RUN, findings, findingsJson, sourceBody, summaryMarkdown } from './render';
import { pendingFingerprint, readCalendarSources, readPendingStatesCached } from './sources';

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

describe('the pending state, kept while the checkout is unchanged (int-surfaces improvement 2)', () => {
  it('reads the drafts once while nothing under content/drafts or content/outgoing changes, and again after any change', () => {
    mueDraft('content/drafts/ncci_mue/2027/q1.json', '2027-01-01', '2027-03-31', '2026-12-05');
    let reads = 0;
    const readers = {
      readRecordFile: (file: string, where: string) => {
        reads += 1;
        return readRecordFile(file, where);
      },
    };
    const first = readPendingStatesCached(root, readers);
    expect(reads).toBe(1);
    expect(first.pending.ncci_mue?.windows).toEqual([{ from: '2027-01-01', to: '2027-03-31' }]);
    expect(readPendingStatesCached(root, readers)).toBe(first);
    expect(reads).toBe(1);
    // A new draft, a prepared release and a rewritten draft each read it all again.
    const before = pendingFingerprint(root);
    mueDraft('content/drafts/ncci_mue/2027/q2.json', '2027-04-01', '2027-06-30', '2027-03-05');
    expect(pendingFingerprint(root)).not.toBe(before);
    expect(readPendingStatesCached(root, readers).pending.ncci_mue?.windows).toEqual([{ from: '2027-01-01', to: '2027-06-30' }]);
    expect(reads).toBe(3);
    writeCoverage('content/outgoing', 4, everyContent());
    readPendingStatesCached(root, readers);
    expect(reads).toBe(5);
    rmSync(path.join(root, 'content/outgoing'), { recursive: true });
    mueDraft('content/drafts/ncci_mue/2027/q2.json', '2027-04-01', '2027-05-31', '2027-03-05');
    expect(readPendingStatesCached(root, readers).pending.ncci_mue?.windows).toEqual([{ from: '2027-01-01', to: '2027-05-31' }]);
    expect(reads).toBe(7);
  });

  it('fingerprints a checkout with no drafts or prepared releases as empty, the same each time', () => {
    expect(pendingFingerprint(root)).toBe(pendingFingerprint(root));
    expect(readPendingStatesCached(root).pending).toEqual({});
  });
});

describe('the source watch', () => {
  const fee = (knownFiles: string[] | null): CalendarEntry => ({ ...entryOf('fee_schedule'), knownFiles });

  it('names the files on a page never recorded, and the new ones on a recorded page; names that left are not findings', async () => {
    const html = page('/files/zip/rvu27a.zip', 'https://www.cms.gov/files/zip/RVU26D.zip?x=1#top', 'RVU26C.zip', '/other/PFREV26.zip', '/medicare/payment/', 'RVU26D.zip');
    const fetcher: Fetcher = () => Promise.resolve(ok(html));
    const [unrecorded] = await watchSources([fee(null)], fetcher);
    expect(unrecorded).toMatchObject({ kind: 'source_unrecorded', title: 'Content source files not recorded: Medicare fee schedule (relative values and GPCIs)', names: ['RVU26C.zip', 'RVU26D.zip', 'rvu27a.zip'], encoded: [], unlisted: 0 });
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

  it('shows plain names as they are and any other matching name only percent-encoded: a hostile href never reaches a body (review m6)', async () => {
    const long = `RVU27A${' '.repeat(300)}.zip`;
    const hostile = ['/files/@founder.zip', '/files/RVU27A](https://example.com).zip', '/files/RVU27A`b.zip', `/files/${encodeURIComponent(long)}`, '/files/RVU%2327%20A.zip', '/files/RVU27%40A.zip', '/files/RVU27A&amp;x.zip', '/files/%E0%A4%A.zip'];
    const html = page(...hostile, '/files/RVU27B.zip');
    const [finding] = await watchSources([fee(null)], () => Promise.resolve(ok(html)));
    expect(finding?.names).toEqual(['RVU27B.zip']);
    // Only the names the pattern matches are counted: @founder.zip, example.com).zip, RVU#27 A.zip, RVU27@A.zip and the undecodable one are not.
    expect(finding?.encoded).toEqual([encodedName(long), 'RVU27A%26x.zip', 'RVU27A%60b.zip']);
    expect(encodedName(long)).toMatch(/^RVU27A(%20)+\.\.\.$/);
    expect(encodedName(long).length).toBeLessThanOrEqual(203);
    const body = sourceBody(finding as NonNullable<typeof finding>);
    for (const text of ['@', 'founder', 'example.com', 'RVU27A`b', long, '#27', '](', '&', ' .zip']) {
      expect(body, text).not.toContain(text);
    }
    expect(body).toContain('`RVU27B.zip`\n`RVU27A%20%20');
    expect(body).toContain('3 of these names hold characters other than letters, digits, dot, underscore and hyphen, so they are shown percent-encoded; record them in the entry as shown.');
    // Every line in a code span holds only letters, digits and . _ - %.
    for (const line of body.split('\n').filter((one) => one.startsWith('`'))) {
      expect(line).toMatch(/^`[A-Za-z0-9._%-]+`$/);
    }
    const [{ body: filed = '' } = { body: '' }] = findings([], [finding as NonNullable<typeof finding>], CONTENT_CALENDAR, { releaseNo: 3 });
    expect(filed).toBe(body);
  });

  it('finds a new file whatever its name holds: a matching name that is not plain is a change, counted and shown encoded (fix round SB-1)', async () => {
    const html = page('/f/RVU26A.zip', '/f/RVU27A%20updated.zip', '/f/RVU27B(1).zip');
    const fetcher: Fetcher = () => Promise.resolve(ok(html));
    const [changed, ...rest] = await watchSources([fee(['RVU26A.zip'])], fetcher);
    expect(rest).toEqual([]);
    expect(changed).toMatchObject({ kind: 'source_changed', names: [], encoded: ['RVU27A%20updated.zip', 'RVU27B%281%29.zip'], unlisted: 0 });
    expect(sourceBody(changed as NonNullable<typeof changed>)).toContain('`RVU27A%20updated.zip`\n`RVU27B%281%29.zip`');
    // Recorded as the issue shows them, or as the page names them, they are known.
    expect(await watchSources([fee(['RVU26A.zip', 'RVU27A%20updated.zip', 'RVU27B%281%29.zip'])], fetcher)).toEqual([]);
    expect(await watchSources([fee(['RVU26A.zip', 'RVU27A updated.zip', 'RVU27B(1).zip'])], fetcher)).toEqual([]);
    const [unrecorded] = await watchSources([fee(null)], fetcher);
    expect(unrecorded).toMatchObject({ kind: 'source_unrecorded', names: ['RVU26A.zip'], encoded: ['RVU27A%20updated.zip', 'RVU27B%281%29.zip'] });
  });

  it('counts no link that does not match the pattern: a page’s mailto:, javascript: and other links are not findings (fix round SB-6)', async () => {
    const noise = page('mailto:a@b.gov', 'javascript:void(0)', '/about%20us', '/f/RVU26A.zip');
    const [unrecorded] = await watchSources([fee(null)], () => Promise.resolve(ok(noise)));
    expect(unrecorded).toMatchObject({ names: ['RVU26A.zip'], encoded: [], unlisted: 0 });
    expect(sourceBody(unrecorded as NonNullable<typeof unrecorded>)).not.toContain('percent-encoded');
    expect(await watchSources([fee(['RVU26A.zip'])], () => Promise.resolve(ok(noise)))).toEqual([]);
  });

  it('reads single-quoted and unquoted hrefs, and reports a recorded page that lists no matching file any more (fix round SB-2)', async () => {
    const quoted = `<a href='/f/RVU27A.zip'>x</a> <a href=/f/RVU27B.zip>y</a> <a href = "/f/RVU27C.zip">z</a>`;
    expect(pageFileNames(quoted)).toEqual(['RVU27A.zip', 'RVU27B.zip', 'RVU27C.zip']);
    expect(await watchSources([fee(['RVU27A.zip', 'RVU27B.zip', 'RVU27C.zip'])], () => Promise.resolve(ok(quoted)))).toEqual([]);
    // A page moved its files elsewhere: nothing matches, though the entry records files.
    const moved = page('/medicare/payment/rvu27a', '/medicare/payment/rvu27b');
    const [lost, ...rest] = await watchSources([fee(['RVU27A.zip'])], () => Promise.resolve(ok(moved)));
    expect(rest).toEqual([]);
    expect(lost).toMatchObject({ kind: 'source_lost', title: 'Content source no longer lists its files: Medicare fee schedule (relative values and GPCIs)', names: [], encoded: [] });
    expect(sourceBody(lost as NonNullable<typeof lost>)).toContain('the watch cannot see this source');
    // Some recorded names left, others stay: not a finding; an entry that records none is not lost.
    expect(await watchSources([fee(['RVU26D.zip', 'RVU27A.zip', 'RVU27B.zip', 'RVU27C.zip'])], () => Promise.resolve(ok(quoted)))).toEqual([]);
    expect(await watchSources([fee([])], () => Promise.resolve(ok(moved)))).toEqual([]);
  });

  it('cuts a long list of names at 6,000 characters, keeping the source and the runbook and saying how many lines were cut and where the rest is (fix round S2)', async () => {
    const names = Array.from({ length: 400 }, (_, index) => `/f/RVU27A-${String(index).padStart(3, '0')}.zip`);
    const [changed] = await watchSources([fee(['RVU26A.zip'])], () => Promise.resolve(ok(page(...names))));
    const body = sourceBody(changed as NonNullable<typeof changed>);
    expect(body.length).toBeLessThanOrEqual(MAX_BODY);
    const lines = body.split('\n');
    expect(lines.slice(-6)).toEqual([
      '',
      `Source: ${entryOf('fee_schedule').source.title} (${entryOf('fee_schedule').source.page})`,
      '',
      'Runbook: docs/runbooks/content-updates.md',
      '',
      'These dates are not yet confirmed against the source page (the calendar entry has no review).',
    ]);
    const shownNames = lines.filter((line) => line.startsWith('`RVU27A-')).length;
    const note = lines.find((line) => line.includes('more lines were cut')) ?? '';
    // The statement, a blank line and the names make the 402 lines before the tail.
    expect(note).toBe(`${String(402 - 2 - shownNames)} more lines were cut to keep this issue under 6,000 characters. The source page named below lists every file.`);
    expect(body).not.toContain('tools/content-calendar/index.ts');
  });

  it('reduces an href to its decoded last segment, without query or fragment', () => {
    expect(linkFileName('https://www.cms.gov/files/zip/rvu27a.zip?download=1#x')).toBe('rvu27a.zip');
    expect(linkFileName('/files/RVU%2027A.zip')).toBe('RVU 27A.zip');
    expect(linkFileName('a.zip?x=1&amp;y=2')).toBe('a.zip');
    expect(linkFileName('/files/')).toBeNull();
    expect(pageFileNames('<a HREF = "x/Y.zip">')).toEqual(['Y.zip']);
  });

  it('sends the calendar’s User-Agent', () => {
    expect(USER_AGENT).toBe('PaidWhole content calendar');
  });
});

describe('the fetcher (fix round SB-3, SB-4)', () => {
  const HOSTS = sourceHosts(CONTENT_CALENDAR);
  const PAGE = entryOf('fee_schedule').source.page;
  const OPTIONS = { timeoutMs: 20_000 };

  /** A fetch answering by URL, recording what it was asked. */
  function answering(answer: (url: string) => Response) {
    const asked: { url: string; init: RequestInit }[] = [];
    const fetchFunction: FetchFunction = (url, init) => {
      asked.push({ url, init });
      return Promise.resolve(answer(url));
    };
    return { asked, fetcher: httpFetcherFor(HOSTS, fetchFunction) };
  }
  const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });

  it('reads only from the calendar’s hosts', () => {
    expect([...HOSTS].sort()).toEqual(['www.cms.gov', 'www.federalregister.gov', 'www.ncdoi.gov', 'x12.org']);
  });

  it('follows a redirect itself, on the same https host, with the User-Agent and no automatic redirect', async () => {
    const { asked, fetcher } = answering((url) => (url === PAGE ? redirect('/files/listing?x=1') : new Response(page('/f/RVU27A.zip'))));
    expect(await fetcher(PAGE, OPTIONS)).toEqual({ status: 200, text: page('/f/RVU27A.zip') });
    expect(asked.map(({ url }) => url)).toEqual([PAGE, 'https://www.cms.gov/files/listing?x=1']);
    for (const { init } of asked) {
      expect(init.redirect).toBe('manual');
      expect(init.headers).toEqual({ 'user-agent': USER_AGENT });
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('refuses a redirect to plain http, to another host, to a port or with credentials, and more than three redirects; each reads as unreachable', async () => {
    for (const location of ['http://www.cms.gov/files/listing', 'https://example.com/files/listing', 'https://www.cms.gov:8443/files/listing', 'https://user:pass@www.cms.gov/files/listing']) {
      const { asked, fetcher } = answering((url) => (url === PAGE ? redirect(location, 301) : new Response(page('/f/RVU27A.zip'))));
      await expect(fetcher(PAGE, OPTIONS), location).rejects.toThrow('a page is read over https from the calendar’s hosts only');
      expect(asked, location).toHaveLength(1);
      const [finding] = await watchSources([{ ...entryOf('fee_schedule'), knownFiles: ['RVU27A.zip'] }], fetcher, () => Promise.resolve());
      expect(finding?.kind, location).toBe('source_unreachable');
    }
    const hops = (count: number) => answering((url) => {
      const hop = Number(new URL(url).searchParams.get('hop') ?? '0');
      return hop < count ? redirect(`/files?hop=${String(hop + 1)}`) : new Response('done');
    });
    expect((await hops(MAX_REDIRECTS).fetcher(PAGE, OPTIONS)).text).toBe('done');
    await expect(hops(MAX_REDIRECTS + 1).fetcher(PAGE, OPTIONS)).rejects.toThrow('more than 3 redirects');
    const { asked, fetcher } = answering(() => new Response('never'));
    await expect(fetcher('https://example.com/', OPTIONS)).rejects.toThrow();
    expect(asked).toEqual([]);
  });

  it('reads at most 5 MiB of a page, declared or streamed', async () => {
    const chunk = new Uint8Array(1024 * 1024).fill(0x61);
    const streamed = (chunks: number, extra = 0) => {
      let pulled = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (pulled < chunks) {
            pulled += 1;
            controller.enqueue(chunk);
          } else {
            if (extra > 0) controller.enqueue(new Uint8Array(extra).fill(0x62));
            controller.close();
          }
        },
      });
      return { body, pulled: () => pulled };
    };
    const exact = streamed(5);
    expect((await answering(() => new Response(exact.body)).fetcher(PAGE, OPTIONS)).text).toHaveLength(MAX_PAGE_BYTES);
    const over = streamed(5, 1);
    await expect(answering(() => new Response(over.body)).fetcher(PAGE, OPTIONS)).rejects.toThrow('the page passes 5242880 bytes');
    const endless = streamed(1_000);
    await expect(answering(() => new Response(endless.body)).fetcher(PAGE, OPTIONS)).rejects.toThrow('the page passes');
    expect(endless.pulled()).toBeLessThanOrEqual(7);
    const declared = streamed(1);
    await expect(answering(() => new Response(declared.body, { headers: { 'content-length': String(MAX_PAGE_BYTES + 1) } })).fetcher(PAGE, OPTIONS)).rejects.toThrow('the page declares');
    expect(declared.pulled()).toBeLessThanOrEqual(1);
  });

  it('against a local server through the real fetch: follows a same-host redirect, refuses one to http and stops a page past 5 MiB (sec-boundary improvement 4)', async () => {
    const server = createServer((request, response) => {
      if (request.url === '/start') {
        response.writeHead(302, { location: '/listing' }).end();
      } else if (request.url === '/listing') {
        response.writeHead(200, { 'content-type': 'text/html' }).end(page('/f/RVU27A.zip'));
      } else if (request.url === '/downgrade') {
        response.writeHead(302, { location: 'http://www.cms.gov/listing' }).end();
      } else {
        response.writeHead(200, { 'content-type': 'text/html' });
        const block = Buffer.alloc(1024 * 1024, 0x61);
        let sent = 0;
        const more = () => {
          while (sent < 64 && !response.destroyed) {
            sent += 1;
            if (!response.write(block)) {
              response.once('drain', more);
              return;
            }
          }
          response.end();
        };
        more();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    // The calendar's https host, served here over http: every hop is checked as the https address it names.
    const local: FetchFunction = (url, init) => fetch(url.replace(/^https:\/\/www\.cms\.gov/, `http://127.0.0.1:${String(port)}`), init);
    const fetcher = httpFetcherFor(HOSTS, local);
    try {
      expect(await fetcher('https://www.cms.gov/start', OPTIONS)).toEqual({ status: 200, text: page('/f/RVU27A.zip') });
      await expect(fetcher('https://www.cms.gov/downgrade', OPTIONS)).rejects.toThrow('a page is read over https from the calendar’s hosts only');
      await expect(fetcher('https://www.cms.gov/big', OPTIONS)).rejects.toThrow('the page passes 5242880 bytes');
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
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
          'Medicare unit limits (MUE) is loaded through 2026-12-31, 30 days after 2026-12-01. Q1 2027 (Jan–Mar) starts on 2027-01-01 and is due in a published release by 2026-12-18.',
          '',
          'Loaded through: 2026-12-31, in the newest published release (3)',
          'Period: Q1 2027 (Jan–Mar), 2027-01-01 to 2027-03-31',
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

  it('files every finding, each body at most 6,000 characters with its runbook kept, and the summary says how many a run opens (fix round SB-5)', () => {
    const items: DueItem[] = Array.from({ length: 25 }, (_, index) => ({
      family: 'ncci_mue',
      stage: 'ended',
      title: `Finding ${String(index)}`,
      loadedThrough: null,
      period: null,
      dueOn: null,
      commands: Array.from({ length: 60 }, (_, line) => `pnpm rules:import --type ncci_mue --year ${String(2000 + line)} --file ${'y'.repeat(60)}`),
      lines: ['x'.repeat(100)],
    }));
    const list = findings(items, [], CONTENT_CALENDAR, { releaseNo: null });
    expect(list).toHaveLength(25);
    for (const finding of list) {
      expect(finding.body.length).toBeLessThanOrEqual(MAX_BODY);
      const lines = finding.body.split('\n');
      expect(lines.slice(-4)).toEqual(['', 'Runbook: docs/runbooks/content-updates.md', '', 'These dates are not yet confirmed against the source page (the calendar entry has no review).']);
      expect(lines.find((line) => line.includes('more lines were cut'))).toMatch(
        /^\d+ more lines were cut to keep this issue under 6,000 characters\. The calendar entry in packages\/rules\/src\/calendar\.ts holds the import templates, and the runbook below says what to do\.$/,
      );
      // The cut closes the commands' code block.
      expect(lines.filter((line) => line.startsWith('```')).length % 2).toBe(0);
    }
    const summary = summaryMarkdown(list, '2026-12-01');
    expect(summary.split('\n').filter((line) => line.startsWith('- Finding '))).toHaveLength(25);
    expect(summary).toContain(`A run opens at most ${String(MAX_OPENED_PER_RUN)} new issues; the notify job lists the others in the issue "Content calendar: findings not filed" and opens them on later runs.`);
    expect(summaryMarkdown(list.slice(0, MAX_OPENED_PER_RUN), '2026-12-01')).not.toContain('A run opens');
  });

  it('refuses a findings file past its bound, so the check fails rather than hand on a cut list', () => {
    const one = { title: 'Finding', body: 'x'.repeat(MAX_BODY) };
    const fits = Math.floor(MAX_FILE_BYTES / (MAX_BODY + 60));
    expect(() => findingsJson(Array.from({ length: fits }, () => one))).not.toThrow();
    expect(() => findingsJson(Array.from({ length: fits + 20 }, () => one))).toThrow(RangeError);
    // Its base64 fits GitHub's 1 MB job output.
    expect(Math.ceil(MAX_FILE_BYTES / 3) * 4).toBeLessThan(1_000_000);
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
