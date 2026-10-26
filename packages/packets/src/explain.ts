import { parseTrace } from '@tp/pricing';

import { traceSha256 } from './calculation';
import { type Audience, type ExplainCitation, type LineWords, WORDS_VERSION, type Worksheet, explainLine, feeScheduleWorksheets } from './explain/index';
import type { PacketContent, PacketContentV2 } from './format';

/**
 * A packet version's calculation in words (combined audit #38; docs/adr/0072): the words of each schedule row and the
 * fee-schedule worksheets, from the stored traces its approval names. The review page and the payer's PDF both call
 * this with the payer audience, so the reviewer reads what the payer reads.
 *
 * Nothing is worded until every row is bound to what was approved: each row's trace must hash to the SHA-256 its
 * calculation carries (inside the content, which approved_sha256 covers; ADR 0041), and must be priced by what the
 * packet cites (the contract citation's rate record, or Medicare Advantage non-contracted under the regulation;
 * finding m4). Otherwise ExplainBindingError names the row, and nothing is printed. The figures are bound to the
 * approval by the hash; the words around them by the WORDS_VERSION guards of the surfaces (design section 3.8).
 */

/** Why a row's trace cannot be worded for the packet: named by the row and a fixed reason, never a value. */
export type ExplainBindingReason = 'format' | 'trace_missing' | 'trace_differs' | 'not_priced' | 'rate_record_differs' | 'not_medicare_advantage';

export class ExplainBindingError extends Error {
  override readonly name = 'ExplainBindingError';

  constructor(
    readonly reason: ExplainBindingReason,
    readonly row: number | null,
  ) {
    super(row === null ? `the packet's calculation cannot be worded: ${reason}` : `row ${String(row)}'s calculation cannot be worded: ${reason}`);
  }
}

export interface RowWords {
  readonly row: number;
  readonly words: LineWords;
  /** The number of the worksheet its fee schedule is in, or null. */
  readonly worksheet: number | null;
}

export interface PacketWords {
  readonly rows: readonly RowWords[];
  readonly worksheets: readonly Worksheet[];
  /** The renderer that wrote them (WORDS_VERSION). */
  readonly wordsVersion: string;
}

/**
 * The words of a tp-packet/2 version's rows and its worksheets. `traces` holds each row's stored trace (the
 * `priced_line.trace` value as read) by its priced line's ID.
 */
export function explainPacket(content: PacketContent, traces: ReadonlyMap<string, unknown>, audience: Audience): PacketWords {
  if (content.format !== 'tp-packet/2') {
    throw new ExplainBindingError('format', null);
  }
  const v2: PacketContentV2 = content;
  const citation: ExplainCitation = v2.citation.kind === 'contract' ? { kind: 'contract', page: v2.citation.page } : { kind: 'regulation', reference: v2.citation.reference };
  const lines = v2.lines.map((line) => {
    const stored = traces.get(line.priced_line_id);
    if (stored === undefined) {
      throw new ExplainBindingError('trace_missing', line.row);
    }
    if (traceSha256(stored) !== line.calculation.trace_sha256) {
      throw new ExplainBindingError('trace_differs', line.row);
    }
    const trace = parseTrace(stored);
    if (trace.outcome.result !== 'priced') {
      throw new ExplainBindingError('not_priced', line.row);
    }
    if (v2.citation.kind === 'contract' ? trace.agreement?.rate_record_id !== v2.citation.rate_record_id : trace.agreement?.outcome !== 'MA_NONCONTRACTED') {
      throw new ExplainBindingError(v2.citation.kind === 'contract' ? 'rate_record_differs' : 'not_medicare_advantage', line.row);
    }
    return { row: line.row, claimId: line.claim_id, trace, citation };
  });
  const worksheets = feeScheduleWorksheets(lines, audience);
  const numberOf = new Map(worksheets.flatMap((sheet) => sheet.lines.map((row) => [row, sheet.number] as const)));
  const rows = lines.map((line) => {
    // The other lines of the same claim that are rows of the packet, by their line numbers: the words name them "claim line 2 (row 3)".
    const rowsOfClaim = new Map(lines.filter((other) => other.claimId === line.claimId && other !== line).map((other) => [other.trace.line.line_no, other.row] as const));
    const worksheet = numberOf.get(line.row) ?? null;
    return { row: line.row, words: explainLine(line.trace, line.citation, audience, { rowsOfClaim, ...(worksheet === null ? {} : { worksheet }) }), worksheet };
  });
  return { rows, worksheets, wordsVersion: WORDS_VERSION };
}
