import { nameOrNumberMatches } from '@tp/redact';

import type { TextSpan } from '../readable';
import { type IdentifierReader, identifierSpans, readsNoIdentifier } from './mismatches';

/**
 * The server's reading of a narrative for the case's own identifiers (docs/adr/0047, amendment of 2026-11-11): the
 * verifier's whole-word reading (./mismatches.ts identifierSpans) and, beside it, the reading the letter reader's
 * redaction has of a name or a number (@tp/redact nameOrNumberMatches; docs/adr/0054), which the narrative drafter's
 * check of its facts shares. A person types "Zoe" for ZOË and a keyboard writes "O’Quill" for O'QUILL; the first
 * reading alone passed both.
 *
 * What the second reading adds, each as redaction reads it:
 * - a name with its marks, case, apostrophes and dashes written any way ("Zoe", "STRAUSS" for Strauß, "O’Quill",
 *   "OQuill", "Van–Treeby", "Van Treeby"), each part of it alone ("Treeby"), a part hyphenated at a line break, and a
 *   part in capitalized pieces ("Jo Ann" for JOANN);
 * - a member ID or claim number with its characters joined any way ("ZZ-123-4567", "ZZ 1234567", "SYN.CCN.0001"),
 *   glued to a label ("ICNSYNCCN0001"), and written as a calendar date after a label that says it is the number
 *   ("Claim 2026-03-05" for 20260305).
 * No Social Security or phone number is read by its pattern: a narrative's every digit is a figure the inputs must
 * hold (./mismatches.ts), and a payer's phone number quoted from a contract is one of them.
 *
 * This file is the server's only: it imports the matcher, which ./mismatches.ts and ../check.ts (the browser's
 * modules) never do. They take the reading as an argument, and the browser's finds nothing.
 */

/**
 * The case's own identifiers, as the records hold them: the patients' and insureds' last and first names, and the
 * numbers (member IDs, the payer's claim control numbers and the practice's patient control numbers). The two are read
 * differently (a space joins a number's characters anywhere, a name's only between capitalized pieces), so the caller
 * says which is which; it knows, having read each from its own column.
 */
export interface CaseIdentifiers {
  readonly names: readonly string[];
  readonly numbers: readonly string[];
}

/** No identifier at all: what a screen verifies with (the stored report read for them, and each step reads for today's). */
export const NO_CASE_IDENTIFIERS: CaseIdentifiers = Object.freeze({ names: Object.freeze([]), numbers: Object.freeze([]) });

const overlaps = (a: TextSpan, b: TextSpan) => a.start < b.end && b.start < a.end;
const covers = (outer: TextSpan, inner: TextSpan) => outer.start <= inner.start && inner.end <= outer.end;

/** The spans in text order, each run of overlapping spans as one. */
function joined(spans: readonly TextSpan[]): TextSpan[] {
  const out: TextSpan[] = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = out.at(-1);
    if (last !== undefined && span.start < last.end) {
      out[out.length - 1] = { start: last.start, end: Math.max(last.end, span.end) };
    } else {
      out.push({ start: span.start, end: span.end });
    }
  }
  return out;
}

/**
 * The reading for a case's identifiers: both readings' spans, joined where they overlap, so it never finds less than
 * either. Of the letter reader's matches it keeps:
 * - none that touches a token (a placeholder, a citation marker, a fact token): nothing there is the narrative's words;
 * - no name in a dated figure: a month's name in a date is the date (docs/adr/0047);
 * - a number in a dated figure only when it holds the whole figure, which the matcher reads as the number only after a
 *   label that says so. A part of a date ("2026" in "2026-03-05", "03-05" there) is the date.
 * The whole-word reading skips tokens and dated figures alike, as it always has.
 */
export function identifierReader(identifiers: CaseIdentifiers): IdentifierReader {
  const all = [...identifiers.names, ...identifiers.numbers];
  if (all.length === 0) {
    return readsNoIdentifier;
  }
  return (text, skip) => {
    const found = identifierSpans(text, all, [...skip.tokens, ...skip.dated]);
    for (const match of nameOrNumberMatches(text, identifiers)) {
      if (skip.tokens.some((token) => overlaps(token, match))) {
        continue;
      }
      const dated = skip.dated.filter((figure) => overlaps(figure, match));
      if (dated.length > 0 && (match.kind === 'name' || !dated.every((figure) => covers(match, figure)))) {
        continue;
      }
      found.push({ start: match.start, end: match.end });
    }
    return joined(found);
  };
}
