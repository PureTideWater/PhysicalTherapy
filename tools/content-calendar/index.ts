import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { describeIssues, isIsoDate } from '@tp/rules';
import { CONTENT_CALENDAR, type ContentCalendar, contentCalendarSchema, contentDue } from '@tp/rules/calendar';

import { repositoryRoot } from '../content-files';
import { type Fetcher, type SourceFinding, httpFetcher, watchSources } from './fetch';
import { findings, findingsJson, summaryMarkdown } from './render';
import { readCalendarSources } from './sources';

/**
 * pnpm exec tsx tools/content-calendar/index.ts --today YYYY-MM-DD --out <findings.json> --summary <summary.md> [--no-fetch]
 *
 * The content calendar's check (audit #59; docs/adr/0071; docs/runbooks/content-updates.md): what is due on `--today`
 * against the newest published release, the prepared releases and the drafts, and (unless --no-fetch) what changed on
 * the source pages, written as the findings file the content-calendar workflow files issues from and as a summary.
 * Exit 0 when it ran, with or without findings; 1 when the calendar fails its schema, an input cannot be read or
 * --today is not a date; 2 for usage. It fails closed: an unreadable input never reads as "nothing due".
 */
export const USAGE = 'usage: pnpm exec tsx tools/content-calendar/index.ts --today YYYY-MM-DD --out <findings.json> --summary <summary.md> [--no-fetch]';

export interface CalendarRun {
  readonly root: string;
  readonly calendar?: ContentCalendar;
  readonly fetcher?: Fetcher;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

/** One run of the check; the exit code. */
export async function runContentCalendar(argv: readonly string[], run: CalendarRun): Promise<number> {
  let values: { today?: string; out?: string; summary?: string; 'no-fetch'?: boolean };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: { today: { type: 'string' }, out: { type: 'string' }, summary: { type: 'string' }, 'no-fetch': { type: 'boolean' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    run.stderr(`${USAGE}\n`);
    return 2;
  }
  const { today, out, summary } = values;
  if (today === undefined || out === undefined || summary === undefined) {
    run.stderr(`${USAGE}\n`);
    return 2;
  }
  if (!isIsoDate(today)) {
    run.stderr(`content-calendar: --today must be a calendar date written YYYY-MM-DD, not ${JSON.stringify(today)}\n`);
    return 1;
  }
  const parsed = contentCalendarSchema.safeParse(run.calendar ?? CONTENT_CALENDAR);
  if (!parsed.success) {
    run.stderr(`content-calendar: the calendar fails its schema:\n${describeIssues(parsed.error).map((issue) => `- ${issue}`).join('\n')}\n`);
    return 1;
  }
  const calendar = parsed.data;
  let read;
  try {
    read = readCalendarSources(run.root);
  } catch (error) {
    run.stderr(`content-calendar: the content cannot be read (${(error as NodeJS.ErrnoException).code ?? 'unknown error'})\n`);
    return 1;
  }
  if (read.problems.length > 0) {
    const shown = read.problems.slice(0, 20).map((problem) => `- ${problem}`);
    const more = read.problems.length > 20 ? [`- and ${String(read.problems.length - 20)} more`] : [];
    run.stderr(`content-calendar: the content cannot be read:\n${[...shown, ...more].join('\n')}\n`);
    return 1;
  }
  const items = contentDue(calendar, read.sources, today);
  const sources: SourceFinding[] = values['no-fetch'] === true ? [] : await watchSources(calendar, run.fetcher ?? httpFetcher, run.sleep);
  let list;
  try {
    list = findings(items, sources, calendar, { releaseNo: read.sources.releaseNo });
  } catch (error) {
    run.stderr(`content-calendar: ${(error as Error).message}\n`);
    return 1;
  }
  writeFileSync(out, findingsJson(list));
  writeFileSync(summary, summaryMarkdown(list, today, items.length + sources.length));
  run.stdout(`content-calendar: ${String(list.length)} findings on ${today}\n`);
  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const argv = process.argv.slice(2).map((arg, index, all) => (index > 0 && (all[index - 1] === '--out' || all[index - 1] === '--summary') ? path.resolve(cwd, arg) : arg));
  process.exitCode = await runContentCalendar(argv, {
    root: repositoryRoot,
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  });
}
