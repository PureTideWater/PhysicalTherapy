import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import { type Cents, sumCents } from '@tp/money';
import { BEHAVIOR_TEXT, type CandidateLine, type PatternKey, type TriageSettings, patternId, planCases, pursuitCost, triageSettings } from '@tp/triage';

import { candidateLines, candidateRows, insertCaseLines, lockPractice, openCase, openCases } from './execute';

/**
 * Payer patterns waiting for a case, and opening a case on one by hand (PRD 5, J8: "validated
 * discrepancies ... are grouped by payer pattern; the manager opens a case on a pattern, which attaches
 * its lines, sets the deadline from the earliest line's window, estimates pursuit cost, and assigns an
 * owner"; PRD 7, Cases: "Create from a pattern"; PRD 12; test matrix CAS-03, CAS-04; docs/adr/0044).
 *
 * The waiting lines are the validated lines in no case, each judged from its pricing in effect on the
 * day (as triage judges them), grouped by the same payer pattern triage detects from the trace. A
 * pattern whose actionable lines reach the practice's case materiality is ready: a person who works
 * cases may open its case now, without waiting for the next triage. A smaller one is held and keeps
 * accumulating (CAS-04 holds for people as for triage: lowering the practice's case materiality is the
 * way to open a smaller one). A pattern with an open case is shown as joining it at the next triage.
 * Nothing here computes an amount: totals are sums of the priced lines' variance.
 */

export type WaitingStatus = 'ready' | 'held' | 'joins_open_case';

export interface WaitingPattern {
  readonly pattern: PatternKey;
  readonly status: WaitingStatus;
  readonly payer: string;
  readonly plan: string;
  readonly behaviorText: string;
  /** Lines that would be actionable in the case, and their variance (stage three's figure once in a case). */
  readonly actionableLines: number;
  readonly actionableCents: Cents;
  /** Lines whose window has passed: a case opened by hand leaves them out; triage adds them struck through. */
  readonly windowPassedLines: number;
  /** The earliest window among the actionable lines: the deadline the case would open with. */
  readonly earliestWindow: string | null;
  /** The open case the pattern's lines join, for joins_open_case. */
  readonly openCaseId: string | null;
}

export interface WaitingPatterns {
  readonly patterns: readonly WaitingPattern[];
  readonly settings: TriageSettings;
}

interface Planned {
  readonly settings: TriageSettings;
  readonly candidates: readonly CandidateLine[];
  readonly plan: ReturnType<typeof planCases>;
}

async function settingsOf(client: ScopeClient, practiceId: string): Promise<TriageSettings> {
  const { rows } = await client.query<{ settings: unknown }>('SELECT settings FROM practice WHERE id = $1', [practiceId]);
  return triageSettings(rows[0]?.settings ?? {});
}

async function planWaiting(scope: PracticeScope<ScopeClient>, practiceId: string, asOf: string, requestId: string): Promise<Planned> {
  const settings = await settingsOf(scope.client, practiceId);
  const rows = await candidateRows(scope, practiceId, null, requestId);
  const candidates = rows.length === 0 ? [] : await candidateLines(scope.client, rows);
  return { settings, candidates, plan: planCases(candidates, await openCases(scope.client, practiceId), settings, asOf) };
}

/** The validated lines in no case, by payer pattern: ready to open, held below the case materiality, or joining an open case. */
export async function waitingPatterns(scope: PracticeScope<ScopeClient>, practiceId: string, asOf: string, requestId: string): Promise<WaitingPatterns> {
  const { settings, candidates, plan } = await planWaiting(scope, practiceId, asOf, requestId);
  const windows = new Map(candidates.map((line) => [line.serviceLineId, line.windowEndsOn]));
  const keys = [...plan.created, ...plan.added, ...plan.held].map((entry) => entry.pattern);
  const { rows: names } = await scope.client.query<{ plan_id: string; payer: string; plan: string }>(
    'SELECT pl.id AS plan_id, py.name_raw AS payer, coalesce(pl.name, pl.plan_key) AS plan FROM plan pl JOIN payer py ON py.id = pl.payer_id WHERE pl.practice_id = $1 AND pl.id = ANY ($2::uuid[])',
    [practiceId, [...new Set(keys.map((key) => key.plan_id))]],
  );
  const named = new Map(names.map((row) => [row.plan_id, row]));
  const earliest = (lines: readonly { readonly serviceLineId: string; readonly windowPassed: boolean }[]) =>
    lines
      .filter((line) => !line.windowPassed)
      .map((line) => windows.get(line.serviceLineId) ?? null)
      .filter((value): value is string => value !== null)
      .sort()[0] ?? null;
  const describe = (pattern: PatternKey) => ({ payer: named.get(pattern.plan_id)?.payer ?? '', plan: named.get(pattern.plan_id)?.plan ?? '', behaviorText: BEHAVIOR_TEXT[pattern.behavior] });
  /** A held pattern's lines that wait for nothing but the pattern (actionable), or only for a window that passed. */
  const heldLines = (pattern: PatternKey, windowPassed: boolean) => {
    const id = patternId(pattern);
    return candidates.filter((line) => {
      const reasons = plan.waiting.get(line.serviceLineId);
      return patternId(line.pattern) === id && reasons !== undefined && (windowPassed ? reasons.length === 1 && reasons[0] === 'WINDOW_PASSED' : reasons.length === 0);
    });
  };
  const patterns: WaitingPattern[] = [
    ...plan.created.map((entry) => ({
      pattern: entry.pattern,
      status: 'ready' as const,
      ...describe(entry.pattern),
      actionableLines: entry.lines.filter((line) => !line.windowPassed).length,
      actionableCents: entry.actionableCents,
      windowPassedLines: entry.lines.filter((line) => line.windowPassed).length,
      earliestWindow: earliest(entry.lines),
      openCaseId: null,
    })),
    ...plan.held.map((entry) => ({
      pattern: entry.pattern,
      status: 'held' as const,
      ...describe(entry.pattern),
      actionableLines: entry.actionableLines,
      actionableCents: entry.actionableCents,
      windowPassedLines: heldLines(entry.pattern, true).length,
      earliestWindow: earliest(heldLines(entry.pattern, false).map((line) => ({ serviceLineId: line.serviceLineId, windowPassed: false }))),
      openCaseId: null,
    })),
    ...plan.added.map((entry) => ({
      pattern: entry.pattern,
      status: 'joins_open_case' as const,
      ...describe(entry.pattern),
      actionableLines: entry.lines.filter((line) => !line.windowPassed).length,
      actionableCents: entry.actionableCents,
      windowPassedLines: entry.lines.filter((line) => line.windowPassed).length,
      earliestWindow: earliest(entry.lines),
      openCaseId: entry.caseId,
    })),
  ];
  return { patterns, settings };
}

export type OpenOnPatternOutcome =
  | { readonly outcome: 'opened'; readonly caseId: string; readonly lines: number; readonly actionableCents: Cents }
  /** The pattern already has an open case: that is the case to work (nothing is opened). */
  | { readonly outcome: 'exists'; readonly caseId: string }
  /** Its actionable lines total less than the practice's case materiality: it waits (CAS-04). */
  | { readonly outcome: 'below_materiality'; readonly actionableCents: Cents; readonly materialityCents: Cents }
  /** No validated line in no case carries the pattern. */
  | { readonly outcome: 'not_found' };

/**
 * Opens a case on a ready pattern in the caller's scope (a person who works cases; the database checks
 * the role again): its actionable lines join, judged on `asOf`, each moved to actionable in the
 * person's name; the case takes the case materiality in force and the pursuit-cost estimate of the
 * practice's settings, and its deadline and total are the database's, from its lines. A line whose
 * window has passed is left out (a person never adds a line struck through; triage adds it, window
 * passed, at its next run). One triage or opening of a practice at a time.
 */
export async function openCaseOnPattern(
  scope: PracticeScope<ScopeClient>,
  input: { readonly practiceId: string; readonly pattern: PatternKey; readonly asOf: string; readonly requestId: string },
): Promise<OpenOnPatternOutcome> {
  const { client } = scope;
  await lockPractice(client, input.practiceId);
  const id = patternId(input.pattern);
  const open = (await openCases(client, input.practiceId)).get(id);
  if (open !== undefined) {
    return { outcome: 'exists', caseId: open };
  }
  const { settings, plan } = await planWaiting(scope, input.practiceId, input.asOf, input.requestId);
  const ready = plan.created.find((entry) => patternId(entry.pattern) === id);
  if (ready === undefined) {
    const held = plan.held.find((entry) => patternId(entry.pattern) === id);
    return held === undefined ? { outcome: 'not_found' } : { outcome: 'below_materiality', actionableCents: held.actionableCents, materialityCents: settings.caseMaterialityCents };
  }
  const lines = ready.lines.filter((line) => !line.windowPassed);
  const caseId = await openCase(client, input.practiceId, ready.pattern, settings, pursuitCost(settings.pursuit));
  await insertCaseLines(client, input.practiceId, caseId, lines);
  await client.query(
    `INSERT INTO line_status (practice_id, service_line_id, stage, priced_line_id, set_by)
     SELECT $1, t.service_line_id, 'actionable', t.priced_line_id, CASE WHEN app_actor_is_person() THEN app_actor_id() END
       FROM unnest($2::uuid[], $3::uuid[]) AS t (service_line_id, priced_line_id)
      ORDER BY t.service_line_id`,
    [input.practiceId, lines.map((line) => line.serviceLineId), lines.map((line) => line.pricedLineId)],
  );
  return { outcome: 'opened', caseId, lines: lines.length, actionableCents: sumCents(lines.map((line) => line.varianceCents)) };
}
