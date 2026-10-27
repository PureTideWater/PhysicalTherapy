import { type CmsQuarter, type QuarterlyRecordType, cmsQuarterOfDate, isIsoDate, quarterLabel } from '../schema';
import { conversionFactorParser } from './conversion-factor';
import { RuleImportError } from './delimited';
import { gpciParser } from './gpci';
import { localityParser } from './locality';
import { localityPlusFourParser, zipFileQuarter } from './locality-plus-four';
import { mpprParser } from './mppr';
import { ncciMueParser, ncciPtpParser } from './ncci';
import { pprrvuParser } from './pprrvu';
import type { ImportableType, RuleFileParser } from './types';
import { carcParser, claimStatusCodeParser, rarcParser } from './x12-code-list';

/** The parser for each record type that is loaded from a public file. */
export const PARSERS: Readonly<Record<ImportableType, RuleFileParser>> = {
  pfs_rvu: pprrvuParser,
  pfs_gpci: gpciParser,
  locality_map: localityParser,
  locality_map_plus_four: localityPlusFourParser,
  conversion_factor: conversionFactorParser,
  mppr_rate: mpprParser,
  ncci_ptp: ncciPtpParser,
  ncci_mue: ncciMueParser,
  carc: carcParser,
  rarc: rarcParser,
  claim_status_code: claimStatusCodeParser,
};

export { compareConversionFactorPasses, CONVERSION_FACTOR_HEADINGS } from './conversion-factor';
export { RuleImportError } from './delimited';
export { ZIP9_RECORD_LENGTH, zipFileQuarter } from './locality-plus-four';
export { IMPORTABLE_TYPES, type ImportWindow, type ImportableType, type ParseOptions, type ParseOutcome, type ParsedRow, type RuleFileParser, isImportableType } from './types';

// ---------------------------------------------------------------------------------------------
// The quarter a quarterly file states (audit #30, docs/adr/0071)

/** What a quarterly file states (R2): its quarter, and the day it takes effect when it states one. */
export interface StatedQuarter {
  readonly quarter: CmsQuarter;
  readonly effective: string | null;
}

const QUARTER_MONTHS: Readonly<Record<string, CmsQuarter['quarter']>> = { jan: 1, apr: 2, jul: 3, oct: 4, january: 1, april: 2, july: 3, october: 4 };

interface QuarterPattern {
  readonly pattern: RegExp;
  /** Read in the first 5 lines of the text only, never in a file name. */
  readonly titleOnly: boolean;
  readonly read: (match: RegExpExecArray) => CmsQuarter | { readonly date: readonly [month: string, day: string, year: string] };
}

/**
 * The patterns a quarter is read by (case-insensitive), each giving the quarter or, for an effective date, the date.
 * They are the contract until the first real download shows what CMS writes: a later parser pull request may add
 * patterns, and never removes the refusal. A token ends at anything but a letter or a digit, so an underscore, a dash or
 * a dot touching it (rvu26d_updated.zip, MUE_2026Q4_v2.csv) still separates it, where \b would count "_" as part of a
 * word; RVU tokens may carry CMS's revision letter R (RVU24AR), and an effective date may follow "Eff" with a space, an
 * underscore, a colon, a dot or a dash (MUE_Eff_10-01-2026.csv).
 */
const QUARTER_PATTERNS: readonly QuarterPattern[] = [
  {
    pattern: /(?<![A-Za-z0-9])RVU(\d{2})([A-D])R?(?![A-Za-z0-9])/gi,
    titleOnly: false,
    read: (m) => ({ year: 2000 + Number.parseInt(m[1] ?? '', 10), quarter: ('ABCD'.indexOf((m[2] ?? '').toUpperCase()) + 1) as CmsQuarter['quarter'] }),
  },
  { pattern: /(?:PPRRVU|GPCI)(\d{2})_(JAN|APR|JUL|OCT)/gi, titleOnly: false, read: (m) => ({ year: 2000 + Number.parseInt(m[1] ?? '', 10), quarter: QUARTER_MONTHS[(m[2] ?? '').toLowerCase()] ?? 1 }) },
  { pattern: /(20\d{2})[ _-]?Q([1-4])(?![A-Za-z0-9])/gi, titleOnly: false, read: (m) => ({ year: Number.parseInt(m[1] ?? '', 10), quarter: Number.parseInt(m[2] ?? '', 10) as CmsQuarter['quarter'] }) },
  { pattern: /(?<![A-Za-z0-9])(JAN|APR|JUL|OCT)[ _-]?(20\d{2})(?![A-Za-z0-9])/gi, titleOnly: false, read: (m) => ({ year: Number.parseInt(m[2] ?? '', 10), quarter: QUARTER_MONTHS[(m[1] ?? '').toLowerCase()] ?? 1 }) },
  {
    pattern: /(?<![A-Za-z0-9])(January|April|July|October)\s+(20\d{2})(?![A-Za-z0-9])/gi,
    titleOnly: true,
    read: (m) => ({ year: Number.parseInt(m[2] ?? '', 10), quarter: QUARTER_MONTHS[(m[1] ?? '').toLowerCase()] ?? 1 }),
  },
  { pattern: /(?<![A-Za-z0-9])Eff(?:ective)?[\s_:.-]+(\d{1,2})[-/](\d{1,2})[-/](20\d{2})(?![A-Za-z0-9])/gi, titleOnly: false, read: (m) => ({ date: [m[1] ?? '', m[2] ?? '', m[3] ?? ''] }) },
];

/** The last path segment of a URL, percent-decoded, with its query and fragment dropped. */
function urlFileName(url: string): string {
  const segment = url.replace(/[?#].*$/s, '').split('/').at(-1) ?? '';
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * The quarter a quarterly file states (R2). ZIP5 and ZIP9: the year and quarter (YYYYQ) at 76-80 of the first line
 * that is not blank; the parsers check every other line. PPRRVU, GPCI and MUE: every match of the patterns above in
 * the first 5 lines of the text, the file's base name, and the last path segment of `--url` (the address the file was
 * downloaded from: for a file taken out of a zip, the zip's, whose name carries CMS's token). Null when the file
 * states no quarter; throws RuleImportError when it states two, two effective days, or an effective day that is no
 * date.
 */
export function statedQuarter(type: QuarterlyRecordType, source: { readonly fileName: string; readonly url: string; readonly text: string }): StatedQuarter | null {
  const name = source.fileName.split('/').at(-1) ?? source.fileName;
  if (type === 'locality_map' || type === 'locality_map_plus_four') {
    const first = source.text.split(/\r?\n/).find((line) => line.trim() !== '');
    const field = first === undefined ? null : zipFileQuarter(first);
    return field === null ? null : { quarter: { year: Number.parseInt(field.slice(0, 4), 10), quarter: Number.parseInt(field.slice(4), 10) as CmsQuarter['quarter'] }, effective: null };
  }
  const titles = source.text.split(/\r?\n/, 5).join('\n');
  const quarters = new Map<string, CmsQuarter>();
  const effectives = new Set<string>();
  const notDates: string[] = [];
  for (const [text, isTitle] of [[titles, true], [name, false], [urlFileName(source.url), false]] as const) {
    for (const { pattern, titleOnly, read } of QUARTER_PATTERNS) {
      if (titleOnly && !isTitle) {
        continue;
      }
      for (const match of text.matchAll(pattern)) {
        const stated = read(match);
        if ('date' in stated) {
          const [month, day, year] = stated.date;
          const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          if (!isIsoDate(iso)) {
            notDates.push(JSON.stringify(match[0]));
            continue;
          }
          effectives.add(iso);
          const quarter = cmsQuarterOfDate(iso);
          quarters.set(quarterLabel(quarter), quarter);
        } else {
          quarters.set(quarterLabel(stated), stated);
        }
      }
    }
  }
  const labels = [...quarters.keys()];
  if (notDates.length > 0) {
    // An effective date that is no date states a quarter of none, so it never agrees with anything.
    const other = labels[0] ?? notDates[1];
    throw new RuleImportError(
      other === undefined
        ? `${name} states an effective date that is no date (${notDates[0] ?? ''}): import the file CMS published, or fix the parser in a pull request if CMS writes its dates another way (content/sources/README.md)`
        : `${name} states two quarters (${notDates[0] ?? ''}, which is no date, and ${other}); import each quarter's file on its own`,
    );
  }
  if (labels.length > 1) {
    throw new RuleImportError(`${name} states two quarters (${labels[0] ?? ''} and ${labels[1] ?? ''}); import each quarter's file on its own`);
  }
  const days = [...effectives].sort();
  if (days.length > 1) {
    throw new RuleImportError(`${name} states two quarters (effective ${days[0] ?? ''} and effective ${days[1] ?? ''}); import each quarter's file on its own`);
  }
  const [quarter] = quarters.values();
  return quarter === undefined ? null : { quarter, effective: days[0] ?? null };
}
