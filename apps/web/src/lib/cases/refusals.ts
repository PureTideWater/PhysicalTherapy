import { PacketRefusedError, PacketRuleError } from '@tp/worker/packets';

import { InputError } from '../http/route';
import type { ActionState } from '../http/next';

/**
 * Refusals of the workbench's steps, as the person sees them (PRD 7: "every error shown with a next
 * step"). The packet workflow (@tp/worker/packets) and the database refuse with fixed sentences that
 * name a rule, never a value: a packet that cannot be written as asked (PacketRefusedError), and a
 * database rule (PacketRuleError: a check, a role the database checks again, a key). Both become the
 * route's invalid outcome under the field "refused", which the forms show as the sentence itself.
 */

export const REFUSED_FIELD = 'refused';

/** Runs a step whose refusal is a packet rule, turning the rule into the route's invalid outcome. */
export async function underPacketRules<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PacketRefusedError || error instanceof PacketRuleError) {
      throw new InputError([{ field: REFUSED_FIELD, message: error.message }]);
    }
    if (isRuleViolation(error)) {
      throw new InputError([{ field: REFUSED_FIELD, message: error.message }]);
    }
    throw error;
  }
}

/** A database rule the workbench's own statements meet (a check or a role checked again in SQL). */
function isRuleViolation(error: unknown): error is Error {
  return error instanceof Error && 'code' in error && (error.code === '23514' || error.code === '42501');
}

/** An action's state with a refusal said as its sentence, the rest as the form shows any refusal. */
export function refusalState(state: ActionState): ActionState {
  const refused = state.issues?.find((issue) => issue.field === REFUSED_FIELD);
  if (refused === undefined) {
    return state;
  }
  const others = (state.issues ?? []).filter((issue) => issue !== refused);
  return others.length === 0 ? { error: `Refused: ${refused.message}.` } : { error: `Refused: ${refused.message}.`, issues: others };
}
