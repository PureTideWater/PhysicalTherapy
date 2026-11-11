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

/** The spans in text order, each run of overlapping spans as one (two that only touch stay two). */
export function joinedSpans(spans: readonly TextSpan[]): TextSpan[] {
  const out: TextSpan[] = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
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
 * What a token is to the matcher's second reading: one invisible character. The soft hyphen is the matcher's own
 * character for "something invisible was here", and a narrative's readable text never holds one (../readable.ts leaves
 * hidden characters out), so each one in the prose below is a token.
 */
const INVISIBLE = '­';

/** The text with each token as one invisible character, and where each of them stands in it with the length it had. */
function tokensAsInvisible(text: string, tokens: readonly TextSpan[]): { readonly prose: string; readonly places: readonly { readonly at: number; readonly length: number }[] } {
  const places: { readonly at: number; readonly length: number }[] = [];
  let prose = '';
  let cursor = 0;
  for (const token of joinedSpans(tokens)) {
    prose += text.slice(cursor, token.start);
    places.push({ at: prose.length, length: token.end - token.start });
    prose += INVISIBLE;
    cursor = token.end;
  }
  return { prose: prose + text.slice(cursor), places };
}

/**
 * The reading for a case's identifiers: the whole-word reading's spans and the letter reader's matcher's, joined where
 * they overlap, so it never finds less than either. The matcher reads the text twice.
 *
 * As it is written, where of its matches it keeps:
 * - none that touches a token (a placeholder, a citation marker, a fact token): nothing there is the narrative's words;
 * - no name in a dated figure: a month's name in a date is the date (docs/adr/0047);
 * - a number in a dated figure only when it holds the whole figure, which the matcher reads as the number only after a
 *   label that says so. A part of a date ("2026" in "2026-03-05", "03-05" there) is the date.
 *
 * And with each token as one invisible character, for an identifier written across a token ("Quar[1]rington",
 * "QQRS{{member_id:1}} TUVW"): a letter holds no token, so the matcher alone never reads across one, and it reads across
 * an invisible character as redaction does. Only a match that holds a token is kept from this reading (its span holds
 * the token too), under the same two rules for dated figures: the words around a token are otherwise read as written,
 * so a label is not a number's label through a placeholder ("Member ID {{member_id:1}} 2026-03-05" is a date).
 *
 * The whole-word reading skips tokens and dated figures alike, as it always has.
 */
export function identifierReader(identifiers: CaseIdentifiers): IdentifierReader {
  const all = [...identifiers.names, ...identifiers.numbers];
  if (all.length === 0) {
    return readsNoIdentifier;
  }
  return (text, skip) => {
    const found = identifierSpans(text, all, [...skip.tokens, ...skip.dated]);
    const isDate = (span: TextSpan, kind: 'name' | 'number') => {
      const dated = skip.dated.filter((figure) => overlaps(figure, span));
      return dated.length > 0 && (kind === 'name' || !dated.every((figure) => covers(span, figure)));
    };
    for (const match of nameOrNumberMatches(text, identifiers)) {
      if (!skip.tokens.some((token) => overlaps(token, match)) && !isDate(match, match.kind)) {
        found.push({ start: match.start, end: match.end });
      }
    }
    const { prose, places } = tokensAsInvisible(text, skip.tokens);
    /** Where a character of the prose is in the text: past each token before it, by the length the token had. */
    const inText = (position: number) => places.reduce((at, place) => (place.at < position ? at + place.length - 1 : at), position);
    for (const match of nameOrNumberMatches(prose, identifiers)) {
      const span = { start: inText(match.start), end: inText(match.end - 1) + 1 };
      if (prose.slice(match.start, match.end).includes(INVISIBLE) && !isDate(span, match.kind)) {
        found.push(span);
      }
    }
    return joinedSpans(found);
  };
}
