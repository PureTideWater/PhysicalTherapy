import { centsToString, formatUsd } from '@tp/money';
import { ADJUSTMENT_BEHAVIORS, type PatternKey } from '@tp/triage';
import { openCaseOnPattern, todayUtc } from '@tp/worker/triage';
import { z } from 'zod';

import { addNote, assignOwner } from '../cases/workbench';
import { practiceRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { underPacketRules } from '../cases/refusals';
import { dollarsField } from '../money-input';
import { opaqueId, optionalText, requiredText } from './schemas';

/**
 * The case workbench's steps on the Cases screens (PRD 5, J8: "the manager opens a case on a pattern,
 * which attaches its lines, sets the deadline from the earliest line's window, estimates pursuit cost,
 * and assigns an owner. Materiality thresholds (per line and per case) are practice settings with
 * defaults"; PRD 7, Cases: "Create from a pattern; assign; set materiality"; PRD 12; docs/adr/0044).
 * Every one is case.work (the billing manager, the analysts, the firm principal), checked here and again
 * in the database, in the person's own name, with an audit event; each is made once (repeating it on a
 * record already changed does nothing).
 */

const caseExists = async (scope: Parameters<typeof addNote>[0], practiceId: string, caseId: string): Promise<void> => {
  const { rowCount } = await scope.client.query('SELECT 1 FROM "case" WHERE id = $1 AND practice_id = $2', [caseId, practiceId]);
  if (rowCount !== 1) {
    throw new NotFoundError();
  }
};

/** A payer pattern as a form names it: its opaque IDs and its adjustment behavior. */
const patternInput = z.object({
  payerId: opaqueId,
  planId: opaqueId,
  mappingKind: z.enum(['contract', 'ma_noncontracted']),
  contractVersionId: optionalText(opaqueId),
  rateRecordId: optionalText(opaqueId),
  behavior: z.enum(ADJUSTMENT_BEHAVIORS),
});

export function patternOf(input: z.output<typeof patternInput>): PatternKey {
  return {
    payer_id: input.payerId,
    plan_id: input.planId,
    mapping_kind: input.mappingKind,
    contract_version_id: input.contractVersionId ?? null,
    rate_record_id: input.rateRecordId ?? null,
    behavior: input.behavior,
  };
}

/** Why a pattern was not opened, as the person sees it. */
export const PATTERN_NOT_WAITING = 'no validated line in no case carries this pattern now; triage the run in effect again, or reload the page';

/**
 * Opens a case on a payer pattern whose actionable lines reach the practice's case materiality
 * (@tp/worker/triage openCaseOnPattern), with an owner when one is named. A pattern that already has an
 * open case goes to that case (nothing is opened); one below the case materiality waits (CAS-04: the
 * refusal says by how much, and lowering the practice's case materiality is the way to open it).
 */
export const openCaseAction = practiceRoute({
  id: 'practice.cases.open',
  kind: 'action',
  path: '/p/[practiceId]/cases/open',
  phi: true,
  permission: 'case.work',
  params: z.object({ practiceId: opaqueId }),
  input: patternInput.extend({ ownerUserId: optionalText(opaqueId) }),
  audit: { action: 'case_opened', objectType: 'case' },
  handle: async ({ scope, practiceId, input, request, services }): Promise<MutationResult> => {
    const opened = await underPacketRules(() => openCaseOnPattern(scope, { practiceId, pattern: patternOf(input), asOf: todayUtc(services.now()), requestId: request.requestId }));
    if (opened.outcome === 'not_found') {
      throw new InputError([{ field: 'pattern', message: PATTERN_NOT_WAITING }]);
    }
    if (opened.outcome === 'below_materiality') {
      throw new InputError([
        {
          field: 'pattern',
          message: `its actionable lines total ${formatUsd(opened.actionableCents)}, below the case materiality of ${formatUsd(opened.materialityCents)}, so it keeps accumulating; lower the case materiality to open it`,
        },
      ]);
    }
    if (opened.outcome === 'opened' && input.ownerUserId !== undefined) {
      await underPacketRules(() => assignOwner(scope, { practiceId, caseId: opened.caseId, ownerUserId: input.ownerUserId ?? null }));
    }
    return { objectId: opened.caseId, redirect: `/p/${practiceId}/cases/${opened.caseId}` };
  },
  sample: {
    params: (refs) => ({ practiceId: refs.practiceId }),
    // The world's case's own pattern: it has an open case, so this goes to it and opens nothing.
    input: (refs) => ({ payerId: refs.payerId, planId: refs.planId, mappingKind: 'contract', contractVersionId: refs.signedOffVersionId, rateRecordId: refs.caseRateRecordId, behavior: 'BELOW_CONTRACT_RATE' }),
  },
});

/**
 * Assigns a case to a person who works the practice's cases now, or leaves it unassigned (blank). The
 * database records the assignment in the case's activity and makes it the case's owner; assigning the
 * owner it has records nothing.
 */
export const assignCaseAction = practiceRoute({
  id: 'practice.cases.assign',
  kind: 'action',
  path: '/p/[practiceId]/cases/assign',
  phi: true,
  permission: 'case.work',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ caseId: opaqueId, ownerUserId: optionalText(opaqueId) }),
  audit: { action: 'case_assigned', objectType: 'case' },
  handle: async ({ scope, practiceId, input }): Promise<MutationResult> => {
    await caseExists(scope, practiceId, input.caseId);
    await underPacketRules(() => assignOwner(scope, { practiceId, caseId: input.caseId, ownerUserId: input.ownerUserId ?? null }));
    return { objectId: input.caseId, redirect: `/p/${practiceId}/cases/${input.caseId}` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ caseId: refs.caseId, ownerUserId: '' }) },
});

/** The longest note a case takes. */
export const NOTE_MAX_LENGTH = 4000;

/** Adds a note to a case, in the person's own name; its words are kept encrypted with the practice's key. */
export const addNoteAction = practiceRoute({
  id: 'practice.cases.note',
  kind: 'action',
  path: '/p/[practiceId]/cases/note',
  phi: true,
  permission: 'case.work',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ caseId: opaqueId, text: requiredText(NOTE_MAX_LENGTH) }),
  audit: { action: 'case_note_added', objectType: 'case_activity' },
  handle: async ({ scope, practiceId, input, services }): Promise<MutationResult> => {
    await caseExists(scope, practiceId, input.caseId);
    const noteId = await underPacketRules(() => addNote(scope, services.keys, { practiceId, caseId: input.caseId, text: input.text }));
    return { objectId: noteId, redirect: `/p/${practiceId}/cases/${input.caseId}#notes` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ caseId: refs.caseId, text: 'SYNTHETIC note: called provider relations' }) },
});

/** What setting the materiality does, stated before it is saved (PRD 7: an action's consequence is stated). */
export const MATERIALITY_CONSEQUENCE =
  'Triage judges lines and opens cases with these thresholds from its next run, and a waiting pattern that reaches the case materiality can be opened now; cases already open keep the materiality they opened with.';

/**
 * Sets the practice's materiality thresholds, per line and per case (PRD 5, J8; PRD 12: defaults $5 and
 * $250), in practice.settings through the database's function, which checks the role again.
 */
export const setMaterialityAction = practiceRoute({
  id: 'practice.cases.materiality',
  kind: 'action',
  path: '/p/[practiceId]/cases/materiality',
  phi: true,
  permission: 'case.work',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ lineMateriality: dollarsField, caseMateriality: dollarsField }),
  audit: { action: 'materiality_set', objectType: 'practice' },
  handle: async ({ scope, practiceId, input }): Promise<MutationResult> => {
    await underPacketRules(() => scope.client.query('SELECT practice_set_materiality($1, $2, $3)', [practiceId, centsToString(input.lineMateriality), centsToString(input.caseMateriality)]));
    return { objectId: practiceId, redirect: `/p/${practiceId}/cases?notice=materiality` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: () => ({ lineMateriality: '5.00', caseMateriality: '250.00' }) },
});

export const WORKBENCH_ROUTES = [openCaseAction, assignCaseAction, addNoteAction, setMaterialityAction] as const;
