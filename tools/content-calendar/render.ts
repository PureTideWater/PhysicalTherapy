import type { CalendarEntry, ContentCalendar, DueItem } from '@tp/rules/calendar';

import type { SourceFinding } from './fetch';

/**
 * The content calendar's findings as the workflow files them (audit #59; docs/adr/0071): one `{ title, body }` per
 * finding, the due items in DUE_STAGES order and then the source watch's, at most MAX_FINDINGS. A title is one line and
 * the issue's dedupe key; a body is Markdown of at most MAX_BODY characters. Bodies hold only calendar data, repository
 * release numbers, public page addresses and plain file names seen on public pages.
 */

export const MAX_FINDINGS = 20;
export const MAX_BODY = 6_000;
export const RUNBOOK = 'docs/runbooks/content-updates.md';
const UNREVIEWED = 'These dates are not yet confirmed against the source page (the calendar entry has no review).';
const CUT = `The rest of this finding was cut at ${MAX_BODY.toLocaleString('en-US')} characters; \`pnpm exec tsx tools/content-calendar/index.ts\` prints it whole.`;

export interface Finding {
  readonly title: string;
  readonly body: string;
}

/** Where the judged content came from, as a body names it. */
export interface Basis {
  /** The newest published release in the repository; null before release 1, when the drafts are judged. */
  readonly releaseNo: number | null;
}

/** A body cut to MAX_BODY characters, its last line saying so. */
function bounded(lines: readonly string[]): string {
  const body = lines.join('\n');
  if (body.length <= MAX_BODY) {
    return body;
  }
  const room = MAX_BODY - CUT.length - 2;
  const kept = body.slice(0, room);
  return `${kept.slice(0, Math.max(0, kept.lastIndexOf('\n')))}\n\n${CUT}`;
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
    lines.push(`Period: ${item.period.label} (${item.period.from} to ${item.period.to})`);
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
  lines.push('', `Runbook: ${RUNBOOK}`);
  if (entry?.review === null) {
    lines.push('', UNREVIEWED);
  }
  return bounded(lines);
}

const SOURCE_STATEMENTS: Readonly<Record<SourceFinding['kind'], string>> = {
  source_unreachable: 'The source page did not answer with a page, twice, 5 seconds apart.',
  source_unrecorded: 'The calendar entry records no file names for its source page yet. The page links to these files matching the entry’s pattern:',
  source_changed: 'The source page links to files the calendar entry has not recorded, matching its pattern; a new period’s files may be out:',
};

/** A source finding's body: the statement, the names in code spans one per line, the count not shown, the source and the runbook. */
export function sourceBody(finding: SourceFinding): string {
  const lines = [SOURCE_STATEMENTS[finding.kind]];
  if (finding.kind !== 'source_unreachable') {
    lines.push('', ...(finding.names.length === 0 ? ['(none)'] : finding.names.map((name) => `\`${name}\``)));
  }
  if (finding.notShown > 0) {
    lines.push('', `${String(finding.notShown)} link names were not shown because they hold characters other than letters, digits, dot, underscore and hyphen.`);
  }
  lines.push('', `Source: ${finding.entry.source.title} (${finding.entry.source.page})`, '', `Runbook: ${RUNBOOK}`);
  if (finding.entry.review === null) {
    lines.push('', UNREVIEWED);
  }
  return bounded(lines);
}

/** The findings file's entries: due items first, in their order, then the source findings; at most MAX_FINDINGS. Throws on a title that is not one line. */
export function findings(items: readonly DueItem[], sources: readonly SourceFinding[], calendar: ContentCalendar, basis: Basis): Finding[] {
  const all = [...items.map((item) => ({ title: item.title, body: dueBody(item, calendar, basis) })), ...sources.map((finding) => ({ title: finding.title, body: sourceBody(finding) }))];
  for (const finding of all) {
    if (/[\r\n]/.test(finding.title)) {
      throw new RangeError(`a finding's title must be one line: ${JSON.stringify(finding.title)}`);
    }
  }
  return all.slice(0, MAX_FINDINGS);
}

/** The findings file's text: two-space JSON. */
export function findingsJson(list: readonly Finding[]): string {
  return `${JSON.stringify(list, null, 2)}\n`;
}

/** The same findings as a list, for the job's step summary. */
export function summaryMarkdown(list: readonly Finding[], today: string, total: number): string {
  const lines = [`## Content calendar, ${today}`, ''];
  if (list.length === 0) {
    lines.push('Nothing is due.');
  } else {
    lines.push(...list.map((finding) => `- ${finding.title}`));
    if (total > list.length) {
      lines.push('', `${String(total - list.length)} more findings were left out; the first ${String(MAX_FINDINGS)} are filed.`);
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
