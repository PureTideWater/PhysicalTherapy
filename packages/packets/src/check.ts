import { type NarrativeFacts, narrativeFacts } from './facts';
import type { PacketContent } from './format';
import { type NarrativeCheck, type NarrativeReading, findMismatches, readNarrative } from './verifier/mismatches';

/**
 * The verifier's check for the packet builder's narrative editor (@tp/packets/check; PRD 7, Packet builder: "narrative
 * editor with verifier results"), run in the browser on every keystroke against the version's own content: the same
 * check, with the same facts, that verifyNarrative runs and stores when the version is written. What it shows is advice
 * for the person typing; the stored result is the server's, computed again when the version is written and again at
 * each step (request approval, approve, export), and only the server's gates approval. Nothing here reads a Node
 * module, a clock or the network. The browser never holds the case's identifiers (they are placeholders on every
 * screen), so it checks for none: the server's check compares the narrative with them.
 *
 * The editor builds the version's facts once (narrativeFacts, memoised on its content) and reads the narrative once per
 * keystroke (checkReading: the check and every figure as read, from one reading; the review of 2026-11-01, PE-9).
 */
export { type CheckedFigure, type FigureNeeds, MISMATCH_CODES, type Mismatch, type MismatchCode, type NarrativeCheck, type NarrativeReading } from './verifier/mismatches';
export { type NarrativeFacts, narrativeFacts } from './facts';
export { FIGURE_ROLES, type FigureRole } from './roles';

export function checkNarrative(narrative: string, content: PacketContent): NarrativeCheck {
  return findMismatches(narrative, narrativeFacts(content), []);
}

/**
 * The check and every figure of the narrative as it read them (docs/adr/0086), from one reading against the version's
 * facts: whether it passes, each mismatch, and for each figure the roles its words give it, whether the content holds it
 * so and, when it failed, the roles its value is held in, so the editor can say beside a failing figure what it was read
 * as and what the records hold it as. The stored result does not carry the figures; they are advice while typing.
 */
export function checkReading(narrative: string, facts: NarrativeFacts): NarrativeReading {
  return readNarrative(narrative, facts, []);
}
