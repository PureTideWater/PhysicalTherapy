import { type PracticeScope, type ScopeClient, loadPracticeCipher, readWithAudit, rolesPermit } from '@tp/db/runtime';
import { z } from 'zod';

import { type ContractOption, type QuestionView, contractOptions, listQuestions } from '../contracts/contract-queries';
import { OBTAIN_TOPICS } from '../contracts/display';
import { type UnconfirmedFormatSource, unconfirmedFormatSources } from '../contracts/format-sources';
import { letterCodes, requestToPayerLetter } from '../contracts/letter';
import { type PricingReadiness, type Totals, type WaitingPage, lineTotals, pricingReadiness, waitingPlans, waitingTotals } from '../contracts/mapping-queries';
import { UNPRICED_REASON_TEXT, type UnpricedReasonText } from '../contracts/remedies';
import { coverageInEffect } from '../coverage/in-effect';
import { practiceRoute } from '../http/invoke';
import { type ChecklistView, latestChecklist } from '../models/evidence-checklist';
import { modelFeatures } from '../models/path';
import { latestRunInEffect, runCount } from '../pricing/queries';
import { type Download, InputError, NotFoundError } from '../http/route';
import { type PayerOption, payerOptions } from '../remittances/queries';
import type { Services } from '../server/services';
import { MODEL_NOTICES, type ModelNotice } from './models';
import { opaqueId, optionalText } from './schemas';

/**
 * The Coverage screen (PRD 7: "share of lines and dollars priced; the unpriced reasons by count; what
 * to obtain to raise coverage ... create a request-to-payer letter for a missing schedule ... links
 * each reason to its remedy screen"; PRD 5, J5 and J6; test matrix MAP-01). The priced shares and the
 * unpriced reasons by count are each line's result in its pricing in effect, across every run in effect
 * (lib/coverage/in-effect.ts, the digest's coverage), so a month priced under a "no agreement" mapping
 * never hides the months priced under contracts; the run that took effect last is named beside them.
 * Before the first run takes effect, they are zero and the screen says why. Beside them: the dollars waiting on mappings (per
 * plan), whether a pricing run over every line would be refused for an unmapped plan (the run's own
 * guard), and the specialist's open questions that ask the practice to obtain a document. The letter is
 * plain text from a fixed template (no model), downloaded as a file. Lines read from an ERA export whose
 * format is unconfirmed are flagged with the format's name and why (CO-03; docs/adr/0060).
 */

const page = z.coerce.number().int().min(1).max(100_000).default(1);

export interface ReasonCount extends UnpricedReasonText {
  readonly lines: number;
}

/** The run in effect that took effect last (named beside the shares; its own lines are on its page). */
export interface CoverageRun {
  readonly id: string;
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly releaseNo: number;
  readonly completedAt: string;
  /** Its lines and their billed dollars. */
  readonly lines: number;
  readonly chargeCents: string;
}

export interface CoveragePageData {
  readonly practiceId: string;
  readonly lines: Totals;
  /** Lines and billed dollars priced, each line at its pricing in effect; zero while no run is in effect. */
  readonly priced: { readonly lines: number; readonly chargeCents: string };
  /** What the priced share is of: every line a run in effect priced, the runs, and the service dates they cover. */
  readonly share: { readonly runs: number; readonly periodFrom: string | null; readonly periodTo: string | null; readonly of: { readonly lines: number; readonly chargeCents: string } };
  /** The run in effect that took effect last; null before the first completes. */
  readonly run: CoverageRun | null;
  /** Pricing runs of the practice, in any state. */
  readonly pricingRuns: number;
  readonly reasons: readonly ReasonCount[];
  readonly waiting: Totals;
  readonly waitingPlans: WaitingPage;
  readonly readiness: PricingReadiness;
  /** For each unconfirmed ERA export format the practice has loaded remittances from: its counts, billed dollars and payers (CO-03). */
  readonly unconfirmedFormats: readonly UnconfirmedFormatSource[];
  /** Open questions whose answer is a document to obtain (J5). */
  readonly obtain: readonly QuestionView[];
  readonly payers: readonly PayerOption[];
  readonly contracts: readonly ContractOption[];
  readonly canMap: boolean;
  /** Whether the person may generate the coverage report (its PDF and CSV; case.work, as every report document). */
  readonly canGenerateReport: boolean;
  /** The model's checklist of what to obtain (kept or awaiting review), whether a model may suggest one now (MOD-06), and whether the person may ask. */
  readonly checklist: ChecklistView | null;
  readonly canSuggest: boolean;
  readonly modelNotice: ModelNotice | null;
}

export const coveragePage = practiceRoute({
  id: 'practice.coverage',
  kind: 'page',
  path: '/p/[practiceId]/coverage',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, page, model: z.enum(MODEL_NOTICES).optional().catch(undefined) }),
  handle: async ({ scope, practiceId, params, request, services, access }): Promise<CoveragePageData> => {
    const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
    const latest = await latestRunInEffect(scope, practiceId, request.requestId);
    const coverage = latest?.coverage ?? null;
    const inEffect = await coverageInEffect(scope, practiceId);
    const counts = new Map(inEffect.reasons.map((entry) => [entry.reason, entry.lines]));
    return {
      practiceId,
      lines: await lineTotals(scope, practiceId),
      priced: inEffect.priced,
      share: { runs: inEffect.runs, periodFrom: inEffect.periodFrom, periodTo: inEffect.periodTo, of: inEffect.of },
      run:
        latest === undefined || coverage === null || latest.completedAt === null
          ? null
          : { id: latest.id, periodFrom: latest.periodFrom, periodTo: latest.periodTo, releaseNo: latest.releaseNo, completedAt: latest.completedAt, lines: coverage.lines, chargeCents: coverage.charge_cents },
      pricingRuns: await runCount(scope, practiceId),
      reasons: UNPRICED_REASON_TEXT.map((reason) => ({ ...reason, lines: counts.get(reason.reason) ?? 0 })),
      waiting: await waitingTotals(scope, practiceId),
      waitingPlans: await waitingPlans(scope, practiceId, params.page, request.requestId),
      readiness: await pricingReadiness(scope, practiceId, request.requestId),
      unconfirmedFormats: await unconfirmedFormatSources(scope, practiceId),
      obtain: await listQuestions(scope, practiceId, cipher, request.requestId, { openOnly: true, topics: OBTAIN_TOPICS }),
      payers: await payerOptions(scope, practiceId),
      contracts: await contractOptions(scope, practiceId, request.requestId),
      canMap: rolesPermit(access.roles, 'mapping.edit'),
      canGenerateReport: rolesPermit(access.roles, 'case.work'),
      checklist: await latestChecklist(scope, practiceId),
      canSuggest: rolesPermit(access.roles, 'case.work') && (await modelFeatures(scope, services, practiceId)).suggestEvidenceRequests,
      modelNotice: params.model ?? null,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

async function letterParties(scope: PracticeScope<ScopeClient>, practiceId: string, payerId: string, contractId: string | undefined, requestId: string) {
  const [practice] = await readWithAudit(
    scope,
    { objectType: 'practice', purpose: 'payer_letter', requestId },
    async (client) => (await client.query<{ id: string; name: string; npi: string | null }>('SELECT id, name, npi FROM practice WHERE id = $1', [practiceId])).rows,
    (row) => ({ objectId: row.id, practiceId: row.id }),
  );
  const [payer] = await readWithAudit(
    scope,
    { objectType: 'payer', purpose: 'payer_letter', requestId },
    async (client) =>
      (await client.query<{ id: string; practice_id: string; name_raw: string; payer_id_raw: string }>('SELECT id, practice_id, name_raw, payer_id_raw FROM payer WHERE id = $1 AND practice_id = $2', [payerId, practiceId])).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  if (practice === undefined || payer === undefined) {
    throw new NotFoundError();
  }
  if (contractId === undefined) {
    return { practice, payer, contract: null };
  }
  const [contract] = await readWithAudit(
    scope,
    { objectType: 'contract', purpose: 'payer_letter', requestId },
    async (client) =>
      (
        await client.query<{ id: string; practice_id: string; title: string; billing_entity: string | null }>(
          'SELECT id, practice_id, title, billing_entity FROM contract WHERE id = $1 AND practice_id = $2 AND payer_id = $3',
          [contractId, practiceId, payerId],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  if (contract === undefined) {
    throw new InputError([{ field: 'contract', message: 'a contract with this payer' }]);
  }
  return { practice, payer, contract };
}

function todayOf(services: Services): string {
  return services.now().toISOString().slice(0, 10);
}

export const payerLetter = practiceRoute({
  id: 'practice.coverage.letter',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/coverage/letter',
  rateLimit: 'export',
  phi: true,
  permission: 'practice.open',
  params: z.object({
    practiceId: opaqueId,
    payer: opaqueId,
    contract: optionalText(opaqueId),
    codes: optionalText(z.string().max(400)),
  }),
  handle: async ({ scope, practiceId, params, request, services }): Promise<Download> => {
    let codes: string[];
    try {
      codes = letterCodes((params.codes ?? '').split(/[\s,;]+/));
    } catch {
      throw new InputError([{ field: 'codes', message: 'procedure codes of five letters or digits, separated by commas' }]);
    }
    const parties = await letterParties(scope, practiceId, params.payer, params.contract, request.requestId);
    const body = requestToPayerLetter({
      date: todayOf(services),
      practice: { name: parties.practice.name, npi: parties.practice.npi },
      payer: { name: parties.payer.name_raw, identifier: parties.payer.payer_id_raw },
      contract: parties.contract === null ? null : { title: parties.contract.title, billingEntity: parties.contract.billing_entity },
      codes,
    });
    // The file's name carries the payer's opaque ID only.
    return { download: { filename: `request-to-payer-${params.payer}.txt`, contentType: 'text/plain; charset=utf-8', body } };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, payer: refs.payerId, contract: refs.signedOffContractId, codes: '97110, 97140' }) },
});

export const COVERAGE_ROUTES = [coveragePage, payerLetter] as const;
