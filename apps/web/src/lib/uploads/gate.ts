import type { PracticeScope, ScopeClient } from '@tp/db/runtime';

/**
 * The upload gate's agreement half (PRD 6: "no upload without a BAA"; J1): whether the practice's BAA is
 * on file, asked of the database (practice_baa_on_file(): the practice's own BAA or its organization's,
 * signed by now), and the sentence a closed gate shows. Uploads, Contracts, Reconciliation and the
 * practice home read it, so they open and close together and say why in the same words; a hold on the
 * person's uploads is the other half (lib/billing/hold.ts workPause with file.upload, practice_run_refusal_for's question,
 * with whether it lifts; docs/adr/0050, 0080).
 */

/** Whether the practice's BAA is on file (practice_baa_on_file()). */
export async function baaOnFile(scope: PracticeScope<ScopeClient>, practiceId: string): Promise<boolean> {
  const { rows } = await scope.client.query<{ open: boolean }>('SELECT practice_baa_on_file($1) AS open', [practiceId]);
  return rows[0]?.open === true;
}

export const NO_BAA = 'Uploads open once the practice’s business associate agreement is on file. A platform administrator records it when it is signed.';
