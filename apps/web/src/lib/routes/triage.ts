import { type PracticeScope, type ScopeClient, loadPracticeCipher, rolesPermit } from '@tp/db/runtime';
import { WRITE_OFF_REASONS, writeOffSchema } from '@tp/triage';
import { z } from 'zod';

import { practiceRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import {
  type AnomalyView,
  type CaseDetail,
  type CaseSummary,
  type FlaggedLine,
  RUN_NOT_IN_EFFECT,
  type RunChoice,
  anomalyOf,
  caseDetail,
  caseLineState,
  caseOf,
  currentStage,
  flaggedLines,
  isRunInEffect,
  listAnomalies,
  anomalyRuns,
  listCases,
  practiceTriageSettings,
  runsInEffect,
} from '../triage/queries';
import { pageParam } from '../http/paging';
import { type PayerOption, payerOptions } from '../remittances/queries';
import { opaqueId, optionalText, requiredText } from './schemas';

/**
 * The Anomalies and Cases screens (PRD 7: Anomalies "open a cohort; mark reviewed; convert to a
 * validation request; hidden for cohorts under the minimum size", Cases "list by stage, payer, owner,
 * deadline, actionable total; detail with lines, trace, deadline, pursuit cost ... write off a line
 * with reason ... a line past its window is struck through"; PRD 12; docs/adr/0038). In v0 a case is
 * report-only: triage opens it from a payer pattern; the workbench (assignment, packets, notes) is
 * milestone 8.
 *
 * Reading needs the workspace (practice.open); claim control numbers and people's words show to the
 * roles that read PHI. Working anomalies is anomaly.work; triaging a run, writing a case line off and
 * reopening it are case.work (the billing manager, the analysts, the firm principal). Each change is
 * made once: repeating it on a record already changed does nothing.
 */

const today = (now: Date) => now.toISOString().slice(0, 10);

export interface AnomaliesPageData {
  readonly practiceId: string;
  /** A page of the cohorts the filters admit. */
  readonly anomalies: readonly AnomalyView[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
  readonly filters: { readonly run?: string; readonly payer?: string };
  readonly runs: readonly { readonly id: string; readonly periodFrom: string; readonly periodTo: string }[];
  readonly payers: readonly PayerOption[];
  /** The cohort opened, with its flagged lines. */
  readonly open: { readonly anomaly: AnomalyView; readonly lines: readonly FlaggedLine[] } | null;
  readonly minimumCohort: number;
  readonly thresholdCents: string;
  readonly canWork: boolean;
  readonly canReadPhi: boolean;
}

export const anomaliesPage = practiceRoute({
  id: 'practice.anomalies',
  kind: 'page',
  path: '/p/[practiceId]/anomalies',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, anomaly: optionalText(opaqueId), run: optionalText(opaqueId), payer: optionalText(opaqueId), page: pageParam }),
  handle: async ({ scope, practiceId, params, request, access, services }): Promise<AnomaliesPageData> => {
    const settings = await practiceTriageSettings(scope, practiceId);
    const canReadPhi = rolesPermit(access.roles, 'phi.read');
    let open: AnomaliesPageData['open'] = null;
    if (params.anomaly !== undefined) {
      const anomaly = await anomalyOf(scope, practiceId, params.anomaly, settings.anomalyMinimumCohort, request.requestId);
      if (anomaly === undefined) {
        throw new NotFoundError();
      }
      const cipher = canReadPhi ? await loadPracticeCipher(scope, services.keys, practiceId) : null;
      open = { anomaly, lines: await flaggedLines(scope, practiceId, anomaly, cipher, request.requestId) };
    }
    const listed = await listAnomalies(scope, practiceId, settings.anomalyMinimumCohort, request.requestId, {
      ...(params.run === undefined ? {} : { runId: params.run }),
      ...(params.payer === undefined ? {} : { payerId: params.payer }),
      page: params.page,
    });
    return {
      practiceId,
      anomalies: listed.items,
      page: listed.page,
      pages: listed.pages,
      total: listed.total,
      filters: { ...(params.run === undefined ? {} : { run: params.run }), ...(params.payer === undefined ? {} : { payer: params.payer }) },
      runs: await anomalyRuns(scope, practiceId),
      payers: await payerOptions(scope, practiceId),
      open,
      minimumCohort: settings.anomalyMinimumCohort,
      thresholdCents: settings.anomalyThresholdCents.toString(),
      canWork: rolesPermit(access.roles, 'anomaly.work'),
      canReadPhi,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, anomaly: refs.anomalyId }) },
});

/** The anomaly, locked for the change; not found when it is not the practice's. */
async function lockedAnomaly(scope: PracticeScope<ScopeClient>, practiceId: string, anomalyId: string) {
  const { rows } = await scope.client.query<{ reviewed_by: string | null; validation_requested_by: string | null }>(
    'SELECT reviewed_by, validation_requested_by FROM anomaly WHERE id = $1 AND practice_id = $2 FOR UPDATE',
    [anomalyId, practiceId],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new NotFoundError();
  }
  return row;
}

/** Marks a cohort reviewed, in the reviewer's own name (once; again does nothing). */
export const reviewAnomalyAction = practiceRoute({
  id: 'practice.anomalies.review',
  kind: 'action',
  path: '/p/[practiceId]/anomalies/review',
  phi: true,
  permission: 'anomaly.work',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ anomalyId: opaqueId }),
  audit: { action: 'anomaly_reviewed', objectType: 'anomaly' },
  handle: async ({ scope, practiceId, input }): Promise<MutationResult> => {
    const anomaly = await lockedAnomaly(scope, practiceId, input.anomalyId);
    if (anomaly.reviewed_by === null) {
      await scope.client.query('UPDATE anomaly SET reviewed_by = app_actor_id() WHERE id = $1 AND practice_id = $2', [input.anomalyId, practiceId]);
    }
    return { objectId: input.anomalyId, redirect: `/p/${practiceId}/anomalies?anomaly=${input.anomalyId}` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ anomalyId: refs.anomalyId }) },
});

/**
 * Converts a cohort to a validation request (PRD 12, Anomaly screening: "the only action it offers is
 * 'validate': obtain the agreement, map the plan, and price"): recorded in the person's own name, once,
 * and the browser goes to Coverage, which says what to obtain and drafts the request to the payer.
 */
export const requestValidationAction = practiceRoute({
  id: 'practice.anomalies.request_validation',
  kind: 'action',
  path: '/p/[practiceId]/anomalies/request-validation',
  phi: true,
  permission: 'anomaly.work',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ anomalyId: opaqueId }),
  audit: { action: 'anomaly_validation_requested', objectType: 'anomaly' },
  handle: async ({ scope, practiceId, input }): Promise<MutationResult> => {
    const anomaly = await lockedAnomaly(scope, practiceId, input.anomalyId);
    if (anomaly.validation_requested_by === null) {
      await scope.client.query('UPDATE anomaly SET validation_requested_by = app_actor_id() WHERE id = $1 AND practice_id = $2', [input.anomalyId, practiceId]);
    }
    return { objectId: input.anomalyId, redirect: `/p/${practiceId}/coverage` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ anomalyId: refs.anomalyId }) },
});

/** The Cases screen's deadline filter: open cases whose deadline falls within so many days. */
export const DEADLINE_FILTERS = ['14', '30', '90'] as const;

export interface CasesPageData {
  readonly practiceId: string;
  readonly asOf: string;
  /** A page of the cases the filters admit. */
  readonly cases: readonly CaseSummary[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
  readonly filters: { readonly state?: string; readonly payer?: string; readonly deadline?: string };
  readonly payers: readonly PayerOption[];
  /** The open cases the filters admit, over every page, and their actionable total (stage three only). */
  readonly openCases: number;
  readonly actionableCents: string;
  readonly runs: readonly RunChoice[];
  readonly canTriage: boolean;
}

export const casesPage = practiceRoute({
  id: 'practice.cases',
  kind: 'page',
  path: '/p/[practiceId]/cases',
  phi: true,
  permission: 'practice.open',
  params: z.object({
    practiceId: opaqueId,
    state: optionalText(z.enum(['open', 'submitted', 'awaiting_response', 'partially_resolved', 'resolved', 'closed_written_off'])),
    payer: optionalText(opaqueId),
    deadline: optionalText(z.enum(DEADLINE_FILTERS)),
    page: pageParam,
  }),
  handle: async ({ scope, practiceId, params, request, access, services }): Promise<CasesPageData> => {
    const asOf = today(services.now());
    const listed = await listCases(scope, practiceId, asOf, request.requestId, {
      ...(params.state === undefined ? {} : { state: params.state }),
      ...(params.payer === undefined ? {} : { payerId: params.payer }),
      ...(params.deadline === undefined ? {} : { deadlineWithinDays: Number.parseInt(params.deadline, 10) }),
      page: params.page,
    });
    const canTriage = rolesPermit(access.roles, 'case.work');
    return {
      practiceId,
      asOf,
      cases: listed.items,
      page: listed.page,
      pages: listed.pages,
      total: listed.total,
      filters: {
        ...(params.state === undefined ? {} : { state: params.state }),
        ...(params.payer === undefined ? {} : { payer: params.payer }),
        ...(params.deadline === undefined ? {} : { deadline: params.deadline }),
      },
      payers: await payerOptions(scope, practiceId),
      openCases: listed.openCases,
      actionableCents: listed.openActionableCents,
      runs: canTriage ? await runsInEffect(scope, practiceId) : [],
      canTriage,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

export interface CasePageData {
  readonly practiceId: string;
  readonly asOf: string;
  readonly case: CaseSummary;
  readonly detail: CaseDetail;
  readonly canWork: boolean;
  readonly canReadPhi: boolean;
}

export const casePage = practiceRoute({
  id: 'practice.cases.case',
  kind: 'page',
  path: '/p/[practiceId]/cases/[caseId]',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, caseId: opaqueId, page: pageParam }),
  handle: async ({ scope, practiceId, params, request, access, services }): Promise<CasePageData> => {
    const asOf = today(services.now());
    const found = await caseOf(scope, practiceId, params.caseId, asOf, request.requestId);
    if (found === undefined) {
      throw new NotFoundError();
    }
    const canReadPhi = rolesPermit(access.roles, 'phi.read');
    const cipher = canReadPhi ? await loadPracticeCipher(scope, services.keys, practiceId) : null;
    return { practiceId, asOf, case: found, detail: await caseDetail(scope, practiceId, params.caseId, cipher, request.requestId, params.page), canWork: rolesPermit(access.roles, 'case.work'), canReadPhi };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, caseId: refs.caseId }) },
});

/**
 * Triages the run in effect for its period (PRD 12; docs/adr/0037: a re-run counts only once accepted):
 * queues the triage job, which screens its unpriced lines for anomalies, judges its priced lines on
 * today's date and opens or adds to cases by payer pattern.
 */
export const triageRunAction = practiceRoute({
  id: 'practice.cases.triage',
  kind: 'action',
  path: '/p/[practiceId]/cases/triage',
  phi: true,
  permission: 'case.work',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ runId: opaqueId }),
  audit: { action: 'triage_requested', objectType: 'pricing_run' },
  handle: async ({ scope, practiceId, input, services }): Promise<MutationResult> => {
    if (!(await isRunInEffect(scope, practiceId, input.runId))) {
      throw new InputError([{ field: 'runId', message: RUN_NOT_IN_EFFECT }]);
    }
    await services.queue.enqueue('triage', { practice_id: practiceId, pricing_run_id: input.runId });
    return { objectId: input.runId, redirect: `/p/${practiceId}/cases` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ runId: refs.pricingRunId }) },
});

/** What a write-off does, stated before it is confirmed (PRD 7: "every destructive action ... confirms with the consequence stated"). */
export const WRITE_OFF_CONSEQUENCE =
  'The line leaves the case’s actionable total and stays in the case, struck through, with its reason. A person who works cases can reopen it, with a reason, while its dispute window is open.';

/**
 * Writes a case line off with a reason from the closed list ("other" says why; PRD 12, Write-offs and
 * reopening): the line stays in the case, struck through and out of its total. The person confirms the
 * consequence first (WRITE_OFF_CONSEQUENCE). The words are kept encrypted with the practice's key. A
 * line already written off is left as it is.
 */
export const writeOffLineAction = practiceRoute({
  id: 'practice.cases.write_off',
  kind: 'action',
  path: '/p/[practiceId]/cases/write-off',
  phi: true,
  permission: 'case.work',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ caseLineId: opaqueId, reason: z.enum(WRITE_OFF_REASONS), text: optionalText(z.string().max(500)), confirm: z.literal('on', 'confirm what a write-off does') }),
  audit: { action: 'case_line_written_off', objectType: 'case_line' },
  handle: async ({ scope, practiceId, input, services }): Promise<MutationResult> => {
    const checked = writeOffSchema.safeParse({ reason: input.reason, text: input.text });
    if (!checked.success) {
      throw new InputError(checked.error.issues.map((issue) => ({ field: issue.path.join('.') || 'text', message: issue.message })));
    }
    const line = await caseLineState(scope, practiceId, input.caseLineId);
    if (line === undefined) {
      throw new NotFoundError();
    }
    if (line.writtenOffReason === null) {
      const words = checked.data.text;
      const text = words === null ? null : (await loadPracticeCipher(scope, services.keys, practiceId)).encrypt('case_line.written_off_text', words);
      await scope.client.query('UPDATE case_line SET written_off_reason = $3, written_off_text = $4, written_off_by = app_actor_id() WHERE id = $1 AND practice_id = $2', [
        line.id,
        practiceId,
        checked.data.reason,
        text,
      ]);
    }
    return { objectId: line.id, redirect: `/p/${practiceId}/cases/${line.caseId}` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ caseLineId: refs.caseLineId, reason: 'not_worth_pursuit', text: '', confirm: 'on' }) },
});

/**
 * Reopens a written-off line (PRD 8: "a reopen is an explicit action with a reason and an audit
 * event"): back in its case's total, with the reopener's reason kept encrypted on the case line and
 * on a reopen event of the line's stage (reopened_from: the stage it was at). Refused for a line past
 * its window, or with none: it cannot be actionable. A line not written off is left as it is.
 */
export const reopenLineAction = practiceRoute({
  id: 'practice.cases.reopen',
  kind: 'action',
  path: '/p/[practiceId]/cases/reopen',
  phi: true,
  permission: 'case.work',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ caseLineId: opaqueId, reason: requiredText(500) }),
  audit: { action: 'case_line_reopened', objectType: 'case_line' },
  handle: async ({ scope, practiceId, input, services }): Promise<MutationResult> => {
    const line = await caseLineState(scope, practiceId, input.caseLineId);
    if (line === undefined) {
      throw new NotFoundError();
    }
    if (line.writtenOffReason !== null) {
      if (line.windowEndsOn === null || line.windowPassed) {
        throw new InputError([{ field: 'caseLineId', message: 'a line past its window, or without one, cannot be actionable, so it is not reopened' }]);
      }
      const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
      await scope.client.query(
        'UPDATE case_line SET written_off_reason = NULL, written_off_text = NULL, written_off_by = NULL, reopen_reason = $3, reopened_by = app_actor_id() WHERE id = $1 AND practice_id = $2',
        [line.id, practiceId, cipher.encrypt('case_line.reopen_reason', input.reason)],
      );
      const stage = await currentStage(scope, line.serviceLineId);
      if (stage !== null) {
        await scope.client.query('INSERT INTO line_status (practice_id, service_line_id, stage, set_by, reason, reopened_from) VALUES ($1, $2, $3, app_actor_id(), $4, $3)', [
          practiceId,
          line.serviceLineId,
          stage,
          cipher.encrypt('line_status.reason', input.reason),
        ]);
      }
    }
    return { objectId: line.id, redirect: `/p/${practiceId}/cases/${line.caseId}` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ caseLineId: refs.caseLineId, reason: 'SYNTHETIC reopen: the payer asked for it again' }) },
});

export const TRIAGE_ROUTES = [anomaliesPage, reviewAnomalyAction, requestValidationAction, casesPage, casePage, triageRunAction, writeOffLineAction, reopenLineAction] as const;
