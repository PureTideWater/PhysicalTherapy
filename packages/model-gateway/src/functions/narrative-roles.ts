import { FIGURE_ROLES, type FigureKind, type FigureRole, type PacketContent, checkedFigures, narrativeFacts } from '@tp/packets';

/**
 * Which figures of a model's narrative are inputs stated in another role (PRD 14, draftPacketNarrative: "Every number,
 * date, code and count in the text must match the inputs exactly"; PRD 5, J9: "verified field by field by code";
 * docs/adr/0054, docs/adr/0086). The packets verifier itself reads every figure in the role its own words give it
 * (@tp/packets roles.ts) and fails one its inputs do not hold in that role, so a narrative that says the dispute
 * backwards ("the payer allowed" the contract's amount, "4 lines" when 4 is the claim count) fails it
 * (figure_not_in_input). This is the same reading of the same facts, for the gateway's notice: of the figures the
 * verifier failed, those whose value the inputs hold in another role, so the person sees that the figure is misstated
 * rather than missing. A figure the verifier passes is never one; a figure in no input at all is the verifier's alone.
 * Mismatches carry codes and positions only.
 */

export { FIGURE_ROLES, type FigureRole };

export interface RoleMismatch {
  readonly code: 'figure_in_wrong_role';
  /** The role the figure's words give it (the first, when they give it more than one). */
  readonly role: FigureRole;
  readonly kind: FigureKind;
  /** The sentence it is in, from 0. */
  readonly sentence: number;
  /** Its position in the narrative, [start, end). */
  readonly start: number;
  readonly end: number;
}

/** Every figure of the narrative whose words give it a role the inputs do not hold it in, though they hold it in another. */
export function roleMismatches(narrative: string, content: PacketContent): RoleMismatch[] {
  return checkedFigures(narrative, narrativeFacts(content)).flatMap((figure) => {
    const role = figure.roles?.[0];
    return figure.passed || role === undefined || figure.heldAs.length === 0
      ? []
      : [{ code: 'figure_in_wrong_role' as const, role, kind: figure.kind, sentence: figure.sentence, start: figure.start, end: figure.end }];
  });
}
