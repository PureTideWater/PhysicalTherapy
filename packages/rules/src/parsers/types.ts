import type { RuleRecordType } from '../schema';

/** The record types loaded by parser from a public tabular file (never typed by hand). */
export const IMPORTABLE_TYPES = [
  'pfs_rvu',
  'pfs_gpci',
  'locality_map',
  'locality_map_plus_four',
  'conversion_factor',
  'mppr_rate',
  'ncci_ptp',
  'ncci_mue',
  'carc',
  'rarc',
  'claim_status_code',
] as const satisfies readonly RuleRecordType[];
export type ImportableType = (typeof IMPORTABLE_TYPES)[number];

export function isImportableType(value: string): value is ImportableType {
  return IMPORTABLE_TYPES.some((type) => type === value);
}

/** The window a file's rows take when the file itself carries no dates (most CMS tables). */
export interface ImportWindow {
  readonly year: number;
  readonly effectiveFrom: string;
  /** Inclusive; null for no end. */
  readonly effectiveTo: string | null;
}

/**
 * Choices a person makes for a file whose layout has more than one candidate column. The parser
 * never guesses; it refuses and names the choice to make.
 */
export interface ParseOptions {
  /**
   * GPCI files can carry two work GPCI columns, with and without the 1.0 work GPCI floor. Which one
   * Medicare applies in the year is a person's reading of the year's law and final rule.
   */
  readonly gpciWorkFloor?: 'with' | 'without';
}

/** One record's worth of a file: everything but the source and verification, which the importer adds. */
export interface ParsedRow {
  readonly key: Record<string, unknown>;
  readonly value: Record<string, unknown>;
  readonly effective_from: string;
  readonly effective_to: string | null;
  /** The row exactly as it appears in the file. */
  readonly quote: string;
  /**
   * Every line the record quotes, when it folds more than one line of the file (the ZIP+4 file's ranges quote the
   * first and last line of each); the record then quotes these in place of `quote`, which is the first of them.
   */
  readonly quotes?: readonly string[];
  /** Where in the file: "line 12". */
  readonly locator: string;
  readonly note?: string;
}

export interface ParseOutcome {
  readonly rows: readonly ParsedRow[];
  /** What the parser did besides producing rows (rows folded together or skipped, and why). */
  readonly notes: readonly string[];
}

export interface RuleFileParser {
  readonly type: ImportableType;
  /** Recorded as `source.parser` on every record it produces. */
  readonly parser: string;
  /** The default `source.title`. */
  readonly title: string;
  /** What a person must answer, reading the file, to raise its records to L2. */
  readonly reviewQuestions: readonly string[];
  parse(text: string, window: ImportWindow, options?: ParseOptions): ParseOutcome;
}
