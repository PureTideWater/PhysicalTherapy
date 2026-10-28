import { narrativeFacts } from './facts';
import type { PacketContent } from './format';
import { type CheckedFigure, type NarrativeCheck, checkedFigures, findMismatches } from './verifier/mismatches';

/**
 * The verifier's check for the packet builder's narrative editor (@tp/packets/check; PRD 7, Packet
 * builder: "narrative editor with verifier results"), run in the browser on every keystroke against the
 * version's own content: the same check, with the same facts, that verifyNarrative runs and stores
 * when the version is written. What it shows is advice for the person typing; the stored result is the
 * server's, computed again when the version is written, and only that one gates approval. Nothing here
 * reads a Node module, a clock or the network. The browser never holds the case's identifiers (they are
 * placeholders on every screen), so it checks for none: the server's check, run when the version is
 * written, compares the narrative with them, and its stored result is what the screen shows after.
 */
export { type CheckedFigure, MISMATCH_CODES, type Mismatch, type MismatchCode, type NarrativeCheck } from './verifier/mismatches';
export { FIGURE_ROLES, type FigureRole } from './roles';

export function checkNarrative(narrative: string, content: PacketContent): NarrativeCheck {
  return findMismatches(narrative, narrativeFacts(content), []);
}

/**
 * Every figure of the narrative as the check reads it (docs/adr/0086): the roles its words give it and whether the
 * version's content holds it in one, so the editor can say beside a failing figure what it was read as ("read as a
 * count of claims"). The stored result does not carry it; it is advice while typing, as checkNarrative's is.
 */
export function checkFigures(narrative: string, content: PacketContent): CheckedFigure[] {
  return checkedFigures(narrative, narrativeFacts(content));
}
