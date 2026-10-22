import { RuleImportError, textLines } from './delimited';
import type { ImportWindow, ParseOutcome, ParsedRow, RuleFileParser } from './types';

/**
 * The CMS ZIP+4 to carrier locality file (ZIP9, fixed-width text): the nine-digit codes of the ZIPs whose ZIP5
 * line carries the plus-four flag (the ZIP spans localities, so its ZIP+4 names the locality). Read by position
 * as the ZIP5 parser reads its file: positions 1-21 as ZIP5's (state 1-2, ZIP 3-7, carrier 8-12, pricing locality
 * 13-14, rural indicator 15, plus-four flag 21, here always 1), then one plus-four code in 22-25, and the year and
 * quarter (YYYYQ) in 76-80 of an 80-character record. That layout is the one docs/adr/0064 records from a third-party
 * copy of CMS's ZIP9 record layout; CMS's own layout document could not be read when this parser was written, so the
 * first review question asks for it (open item O1). Until it is read, a line holding a second four-digit code in
 * 26-29 (the layout of a low and high code per line, which would make every code inside each pair "not in the file")
 * is refused rather than read as one code.
 *
 * The file is one quarter's: every line carries the same year and quarter, the quarter the import window starts in,
 * so a file of another quarter never takes this window's localities.
 *
 * One record per ZIP: its codes in order, folded into ranges of consecutive codes with one carrier, locality and
 * rural indicator. A code the file does not list is in no range, so it never takes a neighbour's locality. Each
 * record quotes the first and the last line of each of its ranges.
 */

/** A ZIP9 record's length: CMS's ZIP5 and ZIP9 files are 80-character records. */
export const ZIP9_RECORD_LENGTH = 80;
/** The plus-four code ends at 25. */
const LAYOUT_END = 25;
const PLUS_FOUR = /^\d{4}$/;
/** The year and quarter, YYYYQ, at 76-80 of the ZIP5 and ZIP9 records. */
const YEAR_QUARTER = /^\d{4}[1-4]$/;

/**
 * The year and quarter (YYYYQ, positions 76-80) a ZIP5 or ZIP9 record carries, or null when the line has none; the
 * release's ZIP+4 completeness check matches a ZIP's ZIP5 and ZIP9 records by it (tools/release/assemble.ts).
 */
export function zipFileQuarter(line: string): string | null {
  const field = line.slice(75, 80);
  return line.length === ZIP9_RECORD_LENGTH && YEAR_QUARTER.test(field) ? field : null;
}

/** The year and quarter (YYYYQ) a YYYY-MM-DD date falls in. */
function quarterOf(date: string): string {
  return `${date.slice(0, 4)}${String(Math.floor((Number.parseInt(date.slice(5, 7), 10) - 1) / 3) + 1)}`;
}

interface CodeLine {
  readonly code: string;
  readonly carrier: string;
  readonly locality: string;
  readonly rural: string;
  readonly raw: string;
  readonly line: number;
}

interface FoldedRange {
  readonly first: CodeLine;
  last: CodeLine;
}

function readLine(raw: string, line: number): { readonly state: string; readonly zip: string; readonly quarter: string; readonly entry: CodeLine } {
  const at = `line ${String(line)}`;
  if (raw.length !== ZIP9_RECORD_LENGTH) {
    throw new RuleImportError(`${at}: ${String(raw.length)} characters; a ZIP9 record is ${String(ZIP9_RECORD_LENGTH)} (the plus-four code at 22-${String(LAYOUT_END)}, the year and quarter at 76-80)`);
  }
  const state = raw.slice(0, 2);
  const zip = raw.slice(2, 7);
  const carrier = raw.slice(7, 12);
  const locality = raw.slice(12, 14);
  if (!/^[A-Z]{2}$/.test(state) || !/^\d{5}$/.test(zip) || !/^\d{5}$/.test(carrier) || !/^\d{2}$/.test(locality)) {
    throw new RuleImportError(`${at}: does not fit the ZIP9 layout (state, ZIP, carrier, locality in positions 1-14)`);
  }
  const rural = raw.charAt(14).trim();
  if (!['', 'R', 'B'].includes(rural)) {
    throw new RuleImportError(`${at}: rural indicator ${JSON.stringify(rural)} is not blank, R or B`);
  }
  const flag = raw.charAt(20);
  if (flag !== '1') {
    throw new RuleImportError(`${at}: plus-four flag ${JSON.stringify(flag)} is not 1; the ZIP9 file lists only ZIPs whose ZIP+4 names the locality`);
  }
  const code = raw.slice(21, LAYOUT_END);
  if (!PLUS_FOUR.test(code)) {
    throw new RuleImportError(`${at}: plus-four ${JSON.stringify(code)} is not four digits`);
  }
  const second = raw.slice(LAYOUT_END, LAYOUT_END + 4);
  if (PLUS_FOUR.test(second)) {
    throw new RuleImportError(
      `${at}: positions 26-29 hold a second four-digit code, ${second}: the file may give a low and high code per line, which this parser does not read until CMS's ZIP9 layout is confirmed (docs/adr/0064, open item O1)`,
    );
  }
  const quarter = raw.slice(75, 80);
  if (!YEAR_QUARTER.test(quarter)) {
    throw new RuleImportError(`${at}: year and quarter ${JSON.stringify(quarter)} at 76-80 is not YYYYQ`);
  }
  return { state, zip, quarter, entry: { code, carrier, locality, rural, raw, line } };
}

/** Consecutive codes of one carrier, locality and rural indicator, in code order. */
function fold(lines: readonly CodeLine[]): FoldedRange[] {
  const ranges: FoldedRange[] = [];
  for (const entry of [...lines].sort((a, b) => (a.code < b.code ? -1 : 1))) {
    const open = ranges.at(-1);
    if (
      open !== undefined &&
      Number.parseInt(entry.code, 10) === Number.parseInt(open.last.code, 10) + 1 &&
      entry.carrier === open.last.carrier &&
      entry.locality === open.last.locality &&
      entry.rural === open.last.rural
    ) {
      open.last = entry;
    } else {
      ranges.push({ first: entry, last: entry });
    }
  }
  return ranges;
}

function parse(text: string, window: ImportWindow): ParseOutcome {
  const byZip = new Map<string, { readonly state: string; readonly firstLine: number; readonly codes: Map<string, CodeLine> }>();
  const expected = quarterOf(window.effectiveFrom);
  let lineCount = 0;
  for (const { raw, line } of textLines(text)) {
    if (raw.trim() === '') {
      continue;
    }
    const { state, zip, quarter, entry } = readLine(raw, line);
    if (quarter !== expected) {
      throw new RuleImportError(
        `line ${String(line)}: the file is of year and quarter ${quarter}, and the import window starts ${window.effectiveFrom}, in ${expected}: import each quarter's ZIP9 file under that quarter's window`,
      );
    }
    const group = byZip.get(zip) ?? { state, firstLine: line, codes: new Map<string, CodeLine>() };
    if (group.state !== state) {
      throw new RuleImportError(`line ${String(line)}: ZIP ${zip} is in state ${state} here and ${group.state} on line ${String(group.firstLine)}`);
    }
    const twice = group.codes.get(entry.code);
    if (twice !== undefined) {
      throw new RuleImportError(`line ${String(line)}: ZIP+4 ${zip}-${entry.code} appears twice (line ${String(twice.line)})`);
    }
    group.codes.set(entry.code, entry);
    byZip.set(zip, group);
    lineCount += 1;
  }
  if (byZip.size === 0) {
    throw new RuleImportError('the file holds no ZIP+4 codes');
  }
  let rangeCount = 0;
  const rows: ParsedRow[] = [...byZip.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([zip, group]) => {
      const ranges = fold([...group.codes.values()]);
      rangeCount += ranges.length;
      const quotes = ranges.flatMap((range) => (range.first === range.last ? [range.first.raw] : [range.first.raw, range.last.raw]));
      const lineNumbers = [...group.codes.values()].map((entry) => entry.line);
      const [low, high] = [Math.min(...lineNumbers), Math.max(...lineNumbers)];
      return {
        key: { zip },
        value: {
          state: group.state,
          ranges: ranges.map(({ first, last }) => ({ from: first.code, to: last.code, carrier: first.carrier, locality: first.locality, rural_indicator: first.rural })),
        },
        effective_from: window.effectiveFrom,
        effective_to: window.effectiveTo,
        quote: quotes[0] ?? '',
        quotes,
        locator: low === high ? `line ${String(low)}` : `lines ${String(low)}-${String(high)}`,
      };
    });
  return { rows, notes: [`${String(lineCount)} lines folded into ${String(rangeCount)} ranges of ${String(rows.length)} ZIP codes`, `year and quarter ${expected} (positions 76-80), the quarter the window starts in`] };
}

export const localityPlusFourParser: RuleFileParser = {
  type: 'locality_map_plus_four',
  parser: 'cms_zip9_locality',
  title: 'CMS ZIP+4 to carrier locality file (ZIP9)',
  reviewQuestions: [
    'Does the ZIP9 record layout document shipped with the file put the plus-four code at 22-25, one code per line (not a low and high pair), after the ZIP5 positions 1-21 with the plus-four flag 1 at 21?',
    'Is every ZIP the same quarter’s ZIP5 file flags (plus_four_required) present here, and does each range name the locality its GPCI record carries?',
  ],
  parse,
};
