import { QUESTION_TOPICS } from '@tp/db/runtime';
import { EVIDENCE_GAP_CODES, canonicalNumber, readableText, scanText } from '@tp/packets';
import { UNPRICED_REASONS } from '@tp/pricing';
import { z } from 'zod';

import { InputRefusedError } from '../errors';
import { jsonSha256 } from '../hash';
import { PROMPTS } from '../prompts';
import type { PurposeSpec, Verified } from '../spec';
import { frameFacts } from '../untrusted';

/**
 * suggestEvidenceRequests (PRD 14): unpriced reasons and coverage gaps in, a checklist of documents to
 * obtain out, phrased for the customer. The reasons are the closed lists the product already holds:
 * the unpriced reasons (docs/product/unpriced-reasons.md, @tp/pricing), the topics of a specialist's
 * question about a contract that could not be abstracted (PRD 5, J5: missing pages, an undefined
 * method), and a packet's evidence gaps (@tp/packets). Counts, codes and payer names only: no patient,
 * claim or line identifier is ever an input.
 *
 * The verifier: every item maps to a known reason code, and to one of the reasons the input gave; and
 * its customer-facing text (the document and the why, read by the packets verifier's own scanner)
 * states no figure but its gap's own: a procedure code the gap names and the gap's count. Any amount,
 * percentage, date, modifier, other number, identifier or another code is the model's own (CLAUDE.md
 * rule 1: a model never produces a dollar amount), and so is a payer of the input that is not its gap's.
 * An item that fails is rejected and left out of the checklist.
 */

export const KNOWN_REASON_CODES: readonly string[] = [...UNPRICED_REASONS, ...QUESTION_TOPICS.map((topic) => `contract_${topic}`), ...EVIDENCE_GAP_CODES];
const KNOWN = new Set(KNOWN_REASON_CODES);

export const evidenceRequestsOutput = z.strictObject({
  items: z
    .array(z.strictObject({ reason: z.string().min(1).max(64), document: z.string().min(1).max(300), why: z.string().min(1).max(600) }))
    .max(100),
});
export type EvidenceRequestsOutput = z.output<typeof evidenceRequestsOutput>;

export interface EvidenceGap {
  /** A known reason code (KNOWN_REASON_CODES). */
  readonly reason: string;
  /** How many lines (or items) the reason holds. */
  readonly count: number;
  /** The payer's name as the remittances carry it, when the gap is one payer's. */
  readonly payer: string | null;
  /** Procedure codes the gap concerns. */
  readonly codes: readonly string[];
}

export interface EvidenceRequestsInput {
  readonly gaps: readonly EvidenceGap[];
}

export const EVIDENCE_ITEM_PROBLEMS = ['unknown_reason', 'reason_not_in_input', 'figure_not_in_gap', 'payer_not_in_gap'] as const;
export type EvidenceItemProblem = (typeof EVIDENCE_ITEM_PROBLEMS)[number];

export interface EvidenceRequest {
  readonly reason: string;
  readonly document: string;
  readonly why: string;
}

export interface EvidenceRequestsProposal {
  /** The checklist: every item that maps to one of the input's reasons. */
  readonly items: readonly EvidenceRequest[];
  /** Items the verifier rejected, by their place in the answer. */
  readonly rejected: readonly { readonly index: number; readonly problems: readonly EvidenceItemProblem[] }[];
}

const CODE = /^[0-9A-Z]{5}$/;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether every figure of the text is a code the item's gaps name or one of their counts. */
function onlyGapFigures(text: string, gaps: readonly EvidenceGap[]): boolean {
  const codes = new Set(gaps.flatMap((gap) => gap.codes));
  const counts = new Set(gaps.map((gap) => canonicalNumber(String(gap.count))));
  return scanText(readableText(text).text).figures.every((figure) => (figure.kind === 'code' && codes.has(figure.value)) || (figure.kind === 'number' && counts.has(figure.value)));
}

/** Whether the text names a payer of the input that none of the item's gaps is about. */
function namesAnotherPayer(text: string, gaps: readonly EvidenceGap[], payers: readonly string[]): boolean {
  const own = new Set(gaps.flatMap((gap) => (gap.payer === null ? [] : [gap.payer.toUpperCase()])));
  return payers.some((payer) => !own.has(payer.toUpperCase()) && new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(payer).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu').test(text.normalize('NFKC')));
}

export function verifyEvidenceRequests(input: EvidenceRequestsInput, output: EvidenceRequestsOutput): Verified<EvidenceRequestsProposal> {
  const given = new Set(input.gaps.map((gap) => gap.reason));
  const payers = [...new Set(input.gaps.flatMap((gap) => (gap.payer === null || gap.payer.trim() === '' ? [] : [gap.payer.trim()])))];
  const items: EvidenceRequest[] = [];
  const rejected: { index: number; problems: EvidenceItemProblem[] }[] = [];
  output.items.forEach((item, index) => {
    const problems: EvidenceItemProblem[] = [];
    if (!KNOWN.has(item.reason)) {
      problems.push('unknown_reason');
    } else if (!given.has(item.reason)) {
      problems.push('reason_not_in_input');
    } else {
      const gaps = input.gaps.filter((gap) => gap.reason === item.reason);
      const text = `${item.document}\n${item.why}`;
      if (!onlyGapFigures(text, gaps)) {
        problems.push('figure_not_in_gap');
      }
      if (namesAnotherPayer(text, gaps, payers)) {
        problems.push('payer_not_in_gap');
      }
    }
    if (problems.length === 0) {
      items.push({ reason: item.reason, document: item.document.trim(), why: item.why.trim() });
    } else {
      rejected.push({ index, problems });
    }
  });
  return { proposal: { items, rejected }, passed: rejected.length === 0, citations: [] };
}

export const evidenceRequestsSpec = Object.freeze<PurposeSpec<EvidenceRequestsInput, EvidenceRequestsOutput, EvidenceRequestsProposal>>({
  purpose: 'suggestEvidenceRequests',
  prompt: PROMPTS.suggestEvidenceRequests,
  output: evidenceRequestsOutput,
  prepare(input) {
    if (input.gaps.length === 0) {
      throw new InputRefusedError('no_gaps', 'there are no unpriced reasons or coverage gaps to ask for evidence about');
    }
    if (input.gaps.some((gap) => !KNOWN.has(gap.reason) || !Number.isInteger(gap.count) || gap.count < 0 || gap.codes.some((code) => !CODE.test(code)))) {
      throw new InputRefusedError('input_invalid', 'a gap names a known reason code, a count and procedure codes only');
    }
    const facts = { gaps: input.gaps.map((gap) => ({ reason: gap.reason, count: gap.count, payer: gap.payer, codes: [...gap.codes] })) };
    return {
      user: `Suggest the documents the practice should obtain for the gaps below, in the JSON the schema describes.\n\n${frameFacts('coverage_gaps', facts)}`,
      inputHashes: [jsonSha256(facts)],
      variant: 'default',
      context: undefined,
    };
  },
  verify: verifyEvidenceRequests,
});
