import { recordAuditEvent, requirePracticePermission, requireRole } from '@tp/db/runtime';
import { POSTING_TEMPLATE_KEY, PROOF_LEVEL_KEY, type PostingTemplate, type ProofLevel, ledgerSettings, postingTemplateSetting } from '@tp/ledger';

import type { Scope } from './ledger';

/**
 * The practice's ledger settings, set at onboarding (PRD 5, J2; PRD 13, Matching steps 2 and 3; PRD 20:
 * "Proof level for 'recovered': posted, with deposited where exports exist" and "Posting-export
 * templates: one per practice-management system, mapped at onboarding"; Data dictionary,
 * practice.settings: proof level). The practice administrator sets them, in practice.settings beside the
 * pricing and triage settings (any other key is kept); the database lets only the practice's
 * administrators change the practice row and refuses a proof level other than posted or deposited.
 */

export class LedgerSettingsRefused extends Error {
  override readonly name = 'LedgerSettingsRefused';
}

export async function setLedgerSettings(
  scope: Scope,
  input: { readonly practiceId: string; readonly proofLevel?: ProofLevel; readonly postingTemplate?: PostingTemplate; readonly requestId: string },
): Promise<void> {
  const access = requirePracticePermission(scope, input.practiceId, 'practice.open');
  requireRole(access.roles, ['practice_admin'], 'practice.open');
  const changes: Record<string, unknown> = {};
  if (input.proofLevel !== undefined) {
    changes[PROOF_LEVEL_KEY] = input.proofLevel;
  }
  if (input.postingTemplate !== undefined) {
    changes[POSTING_TEMPLATE_KEY] = postingTemplateSetting(input.postingTemplate);
  }
  // Refuses anything the ledger cannot read back, by its key.
  ledgerSettings(changes);
  const { rowCount } = await scope.client.query('UPDATE practice SET settings = settings || $2::jsonb WHERE id = $1', [input.practiceId, JSON.stringify(changes)]);
  if (rowCount !== 1) {
    throw new LedgerSettingsRefused('the practice’s ledger settings are its administrators’ to set');
  }
  await recordAuditEvent(scope, { action: 'ledger_settings_changed', objectType: 'practice', objectId: input.practiceId, practiceId: input.practiceId, requestId: input.requestId });
}
