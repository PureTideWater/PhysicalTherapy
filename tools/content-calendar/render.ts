import type { CalendarEntry, ContentCalendar, DueItem } from '@tp/rules/calendar';

import type { SourceFinding } from './fetch';

/**
 * The content calendar's findings as the workflow files them (audit #59; docs/adr/0071): one `{ title, body }` per
 * finding, the due items in DUE_STAGES order and then the source watch's, every one of them (fix round SB-5: the
 * notify job, which knows which titles are open, opens at most MAX_OPENED_PER_RUN new issues a run and lists the rest
 * in one issue). A title is one line and the issue's dedupe key; a body is Markdown of at most MAX_BODY characters, the
 * file at most MAX_FILE_BYTES so its base64 fits a job output. Bodies hold only calendar data, repository release
 * numbers, public page addresses and file names seen on public pages, plain or percent-encoded (fetch.ts).
 */

/** The most new issues the notify job opens in one run (.github/workflows/content-calendar.yml holds the same number). */
export const MAX_OPENED_PER_RUN = 20;
export const MAX_BODY = 6_000;
/** The findings file's bound in bytes: its base64 stays under 1 MB, GitHub's limit on a job output. */
export const MAX_FILE_BYTES = 700_000;
export const RUNBOOK = 'docs/runbooks/content-updates.md';
const UNREVIEWED = 'These dates are not yet confirmed against the source page (the calendar entry has no review).';
/** Where the rest of a cut body is, per kind of body (fix round S2: no command prints a body whole). */
const REST_OF_DUE = 'The calendar entry in packages/rules/src/calendar.ts holds the import templates, and the runbook below says what to do.';
const REST_OF_SOURCE = 'The source page named below lists every file.';

export interface Finding {
  readonly title: string;
  readonly body: string;
}

/** Where the judged content came from, as a body names it. */
export interface Basis {
  /** The newest published release in the repository; null before release 1, when the drafts are judged. */
  readonly releaseNo: number | null;
}

/**
 * A body of at most MAX_BODY characters. When `lines` are longer, the first line and the last `tail` lines are kept
 * whole and lines are cut from the end of the rest, a code fence left open is closed, and a line says how many were cut
 * and where the rest is.
 */
function bounded(lines: readonly string[], tail: number, rest: string): string {
  const body = lines.join('\n');
  if (body.length <= MAX_BODY) {
    return body;
  }
  const kept = lines.slice(lines.length - tail);
  const cuttable = lines.slice(0, lines.length - tail);
  for (let keep = cuttable.length - 1; keep >= 1; keep -= 1) {
    const head = cuttable.slice(0, keep);
    const fences = head.filter((line) => line.startsWith('```')).length;
    const note = `${String(cuttable.length - keep)} more lines were cut to keep this issue under ${MAX_BODY.toLocaleString('en-US')} characters. ${rest}`;
    const text = [...head, ...(fences % 2 === 1 ? ['```'] : []), '', note, ...kept].join('\n');
    if (text.length <= MAX_BODY) {
      return text;
    }
  }
  return body.slice(0, MAX_BODY);
}

function heldIn(basis: Basis): string {
  return basis.releaseNo === null ? 'the drafts and the prepared releases (no release is published yet)' : `the newest published release (${String(basis.releaseNo)})`;
}

/** 5.8.3's body: the statement, the dates, the source, the commands, the runbook and, unreviewed, the caveat. */
export function dueBody(item: DueItem, calendar: ContentCalendar, basis: Basis): string {
  const entry = item.family === null ? undefined : calendar.find((one) => one.family === item.family);
  const [statement = '', ...rest] = item.lines;
  const lines = [statement, ...rest, ''];
  if (item.loadedThrough !== null) {
    lines.push(`Loaded through: ${item.loadedThrough}, in ${heldIn(basis)}`);
  }
  if (item.period !== null) {
    lines.push(`Period: ${item.period.label}, ${item.period.from} to ${item.period.to}`);
  }
  if (item.dueOn !== null) {
    lines.push(`Due by: ${item.dueOn}`);
  }
  if (entry !== undefined) {
    lines.push(`Source: ${entry.source.title} (${entry.source.page})`);
  }
  if (item.commands.length > 0) {
    lines.push('', '```sh', ...item.commands, '```');
  }
  const tail = ['', `Runbook: ${RUNBOOK}`, ...(entry?.review === null ? ['', UNREVIEWED] : [])];
  return bounded([...lines, ...tail], tail.length, REST_OF_DUE);
}

const SOURCE_STATEMENTS: Readonly<Record<SourceFinding['kind'], string>> = {
  source_unreachable:
    'The source page did not answer with a page, twice, 5 seconds apart: it timed out, failed, answered other than 2xx, redirected off https or off the calendar’s hosts, or passed 5 MiB.',
  source_unrecorded: 'The calendar entry records no file names for its source page yet. The page links to these files matching the entry’s pattern:',
  source_changed: 'The source page links to files the calendar entry has not recorded, matching its pattern; a new period’s files may be out:',
  source_lost:
    'The source page no longer links to any file matching the entry’s pattern, though the entry records some: the watch cannot see this source. Review the page, then the entry’s pattern and recorded files.',
};

/** A source finding's body: the statement, the names in code spans one per line (plain, then percent-encoded), what was not listed, the source and the runbook. */
export function sourceBody(finding: SourceFinding): string {
  const lines = [SOURCE_STATEMENTS[finding.kind]];
  if (finding.encoded.length > 0) {
    lines.push(
      `${String(finding.encoded.length)} of these names hold characters other than letters, digits, dot, underscore and hyphen, so they are shown percent-encoded; record them in the entry as shown.`,
    );
  }
  if (finding.kind === 'source_unrecorded' || finding.kind === 'source_changed') {
    const names = [...finding.names, ...finding.encoded];
    lines.push('', ...(names.length === 0 ? ['(none)'] : names.map((name) => `\`${name}\``)));
  }
  if (finding.unlisted > 0) {
    lines.push('', `${String(finding.unlisted)} more matching names were not listed.`);
  }
  const tail = ['', `Source: ${finding.entry.source.title} (${finding.entry.source.page})`, '', `Runbook: ${RUNBOOK}`, ...(finding.entry.review === null ? ['', UNREVIEWED] : [])];
  return bounded([...lines, ...tail], tail.length, REST_OF_SOURCE);
}

/** The findings file's entries: due items first, in their order, then the source findings, all of them. Throws on a title that is not one line. */
export function findings(items: readonly DueItem[], sources: readonly SourceFinding[], calendar: ContentCalendar, basis: Basis): Finding[] {
  const all = [...items.map((item) => ({ title: item.title, body: dueBody(item, calendar, basis) })), ...sources.map((finding) => ({ title: finding.title, body: sourceBody(finding) }))];
  for (const finding of all) {
    if (/[\r\n]/.test(finding.title)) {
      throw new RangeError(`a finding's title must be one line: ${JSON.stringify(finding.title)}`);
    }
  }
  return all;
}

/** The findings file's text: two-space JSON. Throws past MAX_FILE_BYTES of UTF-8, so the check fails rather than hand the notify job a cut list. */
export function findingsJson(list: readonly Finding[]): string {
  const text = `${JSON.stringify(list, null, 2)}\n`;
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > MAX_FILE_BYTES) {
    throw new RangeError(`the findings file holds ${String(bytes)} bytes, over ${String(MAX_FILE_BYTES)}`);
  }
  return text;
}

/** The same findings as a list, for the job's step summary. */
export function summaryMarkdown(list: readonly Finding[], today: string): string {
  const lines = [`## Content calendar, ${today}`, ''];
  if (list.length === 0) {
    lines.push('Nothing is due.');
  } else {
    lines.push(...list.map((finding) => `- ${finding.title}`));
    if (list.length > MAX_OPENED_PER_RUN) {
      lines.push('', `A run opens at most ${String(MAX_OPENED_PER_RUN)} new issues; the notify job lists the others in the issue "Content calendar: findings not filed" and opens them on later runs.`);
    }
  }
  return `${lines.join('\n')}\n`;
}

const cadenceText = (cadence: CalendarEntry['cadence']): string =>
  cadence.kind === 'quarterly' ? 'quarterly' : cadence.kind === 'annual' ? `yearly from ${cadence.effective}` : cadence.kind === 'dates' ? `on ${cadence.effective.join(', ')}` : 'when it changes';

/**
 * The calendar as docs/runbooks/content-updates.md lists it, between its `<!-- content-calendar -->` markers
 * (tools/content-calendar/runbook.test.ts holds the two equal). Leads and grace in days; "—" where a value does not apply.
 */
export function calendarTable(calendar: ContentCalendar): string {
  const days = (value: number | null) => (value === null ? '—' : String(value));
  const rows = calendar.map((entry) =>
    [
      `\`${entry.family}\``,
      entry.title,
      `[${entry.source.title}](${entry.source.page})`,
      entry.contents.map((content) => `\`${content}\``).join(', '),
      cadenceText(entry.cadence),
      entry.ends === 'window' ? 'its window' : 'never (open)',
      days(entry.publicationLeadDays),
      entry.cadence.kind === 'on_change' ? '—' : String(entry.loadLeadDays),
      entry.cadence.kind === 'on_change' ? '—' : String(entry.graceDays),
      entry.importCommands.length === 0 ? 'typed with `/new-rule-record`' : `${String(entry.importCommands.length)} import ${entry.importCommands.length === 1 ? 'command' : 'commands'}`,
      entry.review === null ? 'not yet' : `${entry.review.by}, ${entry.review.on}`,
    ].join(' | '),
  );
  return [
    '| Family | Title | Source | Contents | Published | Ends | Published ahead | Loaded ahead | Grace | Loaded by | Reviewed |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row} |`),
  ].join('\n');
}
