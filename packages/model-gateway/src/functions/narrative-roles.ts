import { FIGURE_ROLES, type FigureKind, type FigureRole, type PacketContent, checkedFigures, narrativeFacts } from '@tp/packets';

/**
 * Which figures of a model's narrative are inputs stated in another role (PRD 14, draftPacketNarrative: "Every number,
 * date, code and count in the text must match the inputs exactly"; PRD 5, J9: "verified field by field by code";
 * docs/adr/0054, docs/adr/0086). The packets verifier itself reads every figure in the role its own words give it
 * (@tp/packets roles.ts), one cue's role and never the union of every cue in its clause, and fails one its inputs do
 * not hold in that role, so a narrative that says the dispute backwards ("the payer allowed" the contract's amount, "4
 * lines" when 4 is the claim count, "under the contract, the payer allowed" the contract's amount) fails it
 * (figure_not_in_input). This is the same reading of the same facts, for the gateway's notice: of the figures the
 * verifier failed, those whose value the inputs hold in another role, so the person sees that the figure is misstated
 * rather than missing. A figure the verifier passes is never one; a figure in no input at all is the verifier's alone.
 * The gateway's check before a model's draft is written is the verifier's, so it is at least as strict as the gateway's
 * own reading was before the verifier read roles (./narrative-roles.test.ts runs that reading,
 * ./narrative-roles.base.fixture.ts, over the review's swaps and requires each it caught to fail). Mismatches carry
 * codes and positions only.
 */

export { FIGURE_ROLES, type FigureRole };

export interface RoleMismatch {
  readonly code: 'figure_in_wrong_role';
  /** The role the figure's words give it: its nearest cue's (the first in FIGURE_ROLES order of a cue that names two). */
  readonly role: FigureRole;
  /** Every role its words give it: any of them, or, when `every`, each of them (its words name several and none is its own). */
  readonly roles: readonly FigureRole[];
  readonly every: boolean;
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
    const roles = figure.roles ?? [];
    const [role] = roles;
    return figure.passed || role === undefined || figure.heldAs.length === 0
      ? []
      : [{ code: 'figure_in_wrong_role' as const, role, roles, every: figure.every, kind: figure.kind, sentence: figure.sentence, start: figure.start, end: figure.end }];
  });
}
