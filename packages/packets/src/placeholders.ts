import { IDENTIFIER_KINDS, type IdentifierKind, type PacketContent, type ScheduleLine } from './format';

/**
 * Identifier placeholders (PRD 12: "Identifiers (patient name, member ID, claim numbers) are held as
 * placeholders in drafts and inserted from the record at export"; CAS-11). A placeholder names the
 * identifier and the schedule row it belongs to: {{claim_control_number:3}}. Drafts, the stored
 * version and the verifier see only placeholders; insertIdentifiers fills them in from the canonical
 * record when the export is printed, and nowhere else.
 */

/** A placeholder anywhere in text: its kind (letters and underscores) and its row. */
export const PLACEHOLDER_PATTERN = /\{\{([a-z_]+):(\d{1,6})\}\}/g;

export function placeholder(kind: IdentifierKind, row: number): string {
  return `{{${kind}:${String(row)}}}`;
}

export function isIdentifierKind(value: string): value is IdentifierKind {
  return (IDENTIFIER_KINDS as readonly string[]).includes(value);
}

/** Whether a schedule line's identifier fields are exactly its own row's placeholders. */
export function lineHoldsOnlyPlaceholders(line: ScheduleLine): boolean {
  return IDENTIFIER_KINDS.every((kind) => line[kind] === placeholder(kind, line.row));
}

/** The canonical identifiers of one schedule row, read from the claim and patient records at export. */
export type RowIdentifiers = Readonly<Record<IdentifierKind, string | null>>;

/** What a missing identifier prints as (a remittance need not carry a member ID). */
export const NOT_ON_RECORD = 'not on the remittance';

export class IdentifierInsertionError extends Error {
  override readonly name = 'IdentifierInsertionError';
}

/** Replaces every placeholder in `text` from the rows' identifiers; a placeholder naming no row is refused. */
export function fillPlaceholders(text: string, identifiers: ReadonlyMap<number, RowIdentifiers>): string {
  return text.replace(PLACEHOLDER_PATTERN, (_match, kind: string, row: string) => {
    const found = identifiers.get(Number.parseInt(row, 10));
    if (!isIdentifierKind(kind) || found === undefined) {
      throw new IdentifierInsertionError('a placeholder names no identifier of the schedule');
    }
    return found[kind] ?? NOT_ON_RECORD;
  });
}

/** A schedule line with its identifiers inserted: what the export prints. */
export interface ExportLine extends Omit<ScheduleLine, IdentifierKind> {
  readonly claim_control_number: string;
  readonly patient_control_number: string;
  readonly patient_name: string;
  readonly member_id: string;
}

export interface ExportedPacket {
  readonly content: PacketContent;
  readonly narrative: string;
  readonly lines: readonly ExportLine[];
}

/**
 * Inserts identifiers at export: every schedule row needs its identifiers, and the narrative's
 * placeholders are filled from the same rows. The version itself is never changed.
 */
export function insertIdentifiers(content: PacketContent, narrative: string, identifiers: ReadonlyMap<number, RowIdentifiers>): ExportedPacket {
  const lines = content.lines.map((line): ExportLine => {
    const found = identifiers.get(line.row);
    if (found === undefined || !lineHoldsOnlyPlaceholders(line)) {
      throw new IdentifierInsertionError('every schedule row is inserted from its own canonical record');
    }
    return {
      ...line,
      claim_control_number: found.claim_control_number ?? NOT_ON_RECORD,
      patient_control_number: found.patient_control_number ?? NOT_ON_RECORD,
      patient_name: found.patient_name ?? NOT_ON_RECORD,
      member_id: found.member_id ?? NOT_ON_RECORD,
    };
  });
  return { content, narrative: fillPlaceholders(narrative, identifiers), lines };
}
