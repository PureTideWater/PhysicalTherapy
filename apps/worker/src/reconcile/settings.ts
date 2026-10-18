import { recordAuditEvent, requirePracticePermission, requireRole } from '@tp/db/runtime';
import { POSTING_TEMPLATE_KEY, PROOF_LEVEL_KEY, type PostingTemplate, type ProofLevel, ledgerSettings, postingTemplateSetting } from '@tp/ledger';

import { waitingExports } from './exports';
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

/**
 * Maps the practice's posting-export template (PRD 20: "one per practice-management system, mapped at
 * onboarding"; PRD 5, J10; docs/adr/0043): a person who reconciles postings (the billing manager, or a
 * firm's under its grant) saves a built-in template or the practice's own mapping of its system's
 * columns, in their own name and audited. Only the posting_export_template key changes, through the
 * database's own function (set_practice_posting_template), which checks the person again; the proof
 * level stays the practice administrator's (setLedgerSettings). Returns the posting exports waiting for
 * a template, which the caller queues the reconcile for.
 */
export async function setPostingTemplate(scope: Scope, input: { readonly practiceId: string; readonly template: PostingTemplate; readonly requestId: string }): Promise<{ readonly waiting: readonly string[] }> {
  requirePracticePermission(scope, input.practiceId, 'posting.reconcile');
  const stored = postingTemplateSetting(input.template);
  // Refuses a template the ledger cannot read back.
  ledgerSettings({ [POSTING_TEMPLATE_KEY]: stored });
  const { rows } = await scope.client.query<{ changed: boolean }>('SELECT set_practice_posting_template($1, $2::jsonb) AS changed', [input.practiceId, JSON.stringify(stored)]);
  if (rows[0]?.changed !== true) {
    throw new LedgerSettingsRefused('the practice’s posting template is mapped by a person who reconciles its postings');
  }
  await recordAuditEvent(scope, { action: 'posting_template_mapped', objectType: 'practice', objectId: input.practiceId, practiceId: input.practiceId, requestId: input.requestId });
  return { waiting: (await waitingExports(scope, input.practiceId)).filter((document) => document.kind === 'posting_export').map((document) => document.id) };
}
