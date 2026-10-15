import type { RuleRecordType } from '../schema';

/** The record types loaded by parser from a public tabular file (never typed by hand). */
export const IMPORTABLE_TYPES = [
  'pfs_rvu',
  'pfs_gpci',
  'locality_map',
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

/** One record's worth of a file: everything but the source and verification, which the importer adds. */
export interface ParsedRow {
  readonly key: Record<string, unknown>;
  readonly value: Record<string, unknown>;
  readonly effective_from: string;
  readonly effective_to: string | null;
  /** The row exactly as it appears in the file. */
  readonly quote: string;
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
  parse(text: string, window: ImportWindow): ParseOutcome;
}
