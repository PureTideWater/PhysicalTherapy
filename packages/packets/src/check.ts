import { narrativeFacts } from './facts';
import type { PacketContent } from './format';
import { type NarrativeCheck, findMismatches } from './verifier/mismatches';

/**
 * The verifier's check for the packet builder's narrative editor (@tp/packets/check; PRD 7, Packet
 * builder: "narrative editor with verifier results"), run in the browser on every keystroke against the
 * version's own content: the same check, with the same facts, that verifyNarrative runs and stores
 * when the version is written. What it shows is advice for the person typing; the stored result is the
 * server's, computed again when the version is written, and only that one gates approval. Nothing here
 * reads a Node module, a clock or the network.
 */
export { MISMATCH_CODES, type Mismatch, type MismatchCode, type NarrativeCheck } from './verifier/mismatches';

export function checkNarrative(narrative: string, content: PacketContent): NarrativeCheck {
  return findMismatches(narrative, narrativeFacts(content));
}
