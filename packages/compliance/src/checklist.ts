import { CONTROLS, PROGRAM_EVIDENCE, type Control, type ControlId, type EvidenceSource, type PolicyId, type RecordKind } from './controls';
import { POLICIES, policyApprovalSubject, type Policy } from './policies';

/**
 * The checklist's evaluation (docs/adr/0053): each control's evidence sources, each with a status, from the
 * records people kept and the restore drill's rows. Pure; the console reads the rows and passes them in with
 * today's date, and the export is this evaluation as it stood when it was taken.
 *
 * Repository evidence is "in_repository": controls.test.ts proved at build time that the file, the test or the
 * CI step exists. Nothing a person must do is assumed done: a policy without an approval of its current version
 * is "awaiting_approval", a review past its period is "stale", and evidence a later milestone builds is
 * "not_built".
 */

export type PersonRecordKind = Exclude<RecordKind, 'restore_drill'>;

export interface EvidenceRecord {
  readonly kind: PersonRecordKind;
  readonly subject: string;
  /** The calendar date it happened, YYYY-MM-DD. */
  readonly occurredOn: string;
  readonly documentRef: string;
  readonly sha256: string;
}

export interface RestoreDrillRow {
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly outcome: string;
  readonly catalogProblems: number | null;
}

export interface ChecklistInput {
  /** Today in UTC, YYYY-MM-DD. */
  readonly today: string;
  readonly records: readonly EvidenceRecord[];
  readonly restoreDrills: readonly RestoreDrillRow[];
  /** The internal workforce's user IDs (everyone with a platform role), each of whom attests yearly. */
  readonly workforce: readonly string[];
}

export type EvidenceStatus = 'in_repository' | 'current' | 'stale' | 'missing' | 'awaiting_approval' | 'failed' | 'collected_externally' | 'not_built';

export type ControlStatus = 'ready' | 'action_needed' | 'partial';

export interface EvaluatedEvidence {
  readonly source: EvidenceSource;
  readonly status: EvidenceStatus;
  /** The record or drill the status rests on, when there is one. */
  readonly latest: { readonly occurredOn: string; readonly documentRef: string | null; readonly sha256: string | null } | null;
  /** Who has not attested within the period, for a per-member record. */
  readonly outstanding: readonly string[];
  readonly note: string;
}

export interface EvaluatedControl {
  readonly control: Control;
  readonly status: ControlStatus;
  readonly evidence: readonly EvaluatedEvidence[];
}

export interface EvaluatedPolicy {
  readonly policy: Policy;
  readonly status: 'approved' | 'awaiting_approval' | 'stale';
  readonly approvedOn: string | null;
}

export interface Checklist {
  readonly today: string;
  readonly controls: readonly EvaluatedControl[];
  readonly program: readonly EvaluatedEvidence[];
  readonly policies: readonly EvaluatedPolicy[];
  readonly counts: Readonly<Record<ControlStatus, number>>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(date: string): number {
  if (!DATE.test(date)) {
    throw new Error('a date is YYYY-MM-DD');
  }
  const value = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(value)) {
    throw new Error('a date is YYYY-MM-DD');
  }
  return Math.round(value / 86_400_000);
}

/** The calendar date of a moment, in UTC. */
export function utcDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

function daysBetween(earlier: string, later: string): number {
  return dayNumber(later) - dayNumber(earlier);
}

function latestOf(records: readonly EvidenceRecord[], matches: (record: EvidenceRecord) => boolean): EvidenceRecord | null {
  let latest: EvidenceRecord | null = null;
  for (const record of records) {
    if (matches(record) && (latest === null || record.occurredOn > latest.occurredOn)) {
      latest = record;
    }
  }
  return latest;
}

function recordView(record: EvidenceRecord): EvaluatedEvidence['latest'] {
  return { occurredOn: record.occurredOn, documentRef: record.documentRef, sha256: record.sha256 };
}

function evaluatePolicy(policy: Policy, input: ChecklistInput): EvaluatedPolicy {
  const approval = latestOf(input.records, (record) => record.kind === 'policy_approval' && record.subject === policyApprovalSubject(policy));
  if (approval === null) {
    return { policy, status: 'awaiting_approval', approvedOn: null };
  }
  return { policy, status: daysBetween(approval.occurredOn, input.today) <= policy.reviewEveryDays ? 'approved' : 'stale', approvedOn: approval.occurredOn };
}

function evaluateRecord(source: Extract<EvidenceSource, { kind: 'record' }>, input: ChecklistInput): EvaluatedEvidence {
  if (source.record === 'restore_drill') {
    // Newest first, as console_restore_drills() returns them.
    const last = input.restoreDrills[0];
    if (last === undefined) {
      return { source, status: 'missing', latest: null, outstanding: [], note: 'no restore drill has run in this environment' };
    }
    if (last.outcome !== 'passed' || last.completedAt === null) {
      return { source, status: 'failed', latest: { occurredOn: utcDate(last.startedAt), documentRef: null, sha256: null }, outstanding: [], note: 'the latest drill did not pass' };
    }
    const current = daysBetween(utcDate(last.completedAt), input.today) <= source.withinDays;
    return {
      source,
      status: current ? 'current' : 'stale',
      latest: { occurredOn: utcDate(last.completedAt), documentRef: null, sha256: null },
      outstanding: [],
      note: current ? 'the latest drill passed within the period' : `no drill within ${String(source.withinDays)} days`,
    };
  }
  const kind = source.record;
  if (source.perWorkforceMember === true) {
    const outstanding = input.workforce.filter((member) => {
      const latest = latestOf(input.records, (record) => record.kind === kind && record.subject === member);
      return latest === null || daysBetween(latest.occurredOn, input.today) > source.withinDays;
    });
    const latest = latestOf(input.records, (record) => record.kind === kind && input.workforce.includes(record.subject));
    if (input.workforce.length === 0) {
      return { source, status: 'missing', latest: null, outstanding: [], note: 'no internal workforce is recorded' };
    }
    return {
      source,
      status: outstanding.length === 0 ? 'current' : latest === null ? 'missing' : 'stale',
      latest: latest === null ? null : recordView(latest),
      outstanding,
      note: outstanding.length === 0 ? 'every workforce member attested within the period' : `${String(outstanding.length)} of ${String(input.workforce.length)} have not attested within ${String(source.withinDays)} days`,
    };
  }
  const latest = latestOf(input.records, (record) => record.kind === kind);
  if (latest === null) {
    return { source, status: 'missing', latest: null, outstanding: [], note: 'not recorded yet' };
  }
  const current = daysBetween(latest.occurredOn, input.today) <= source.withinDays;
  return { source, status: current ? 'current' : 'stale', latest: recordView(latest), outstanding: [], note: current ? 'recorded within the period' : `last recorded more than ${String(source.withinDays)} days ago` };
}

function evaluateSource(source: EvidenceSource, input: ChecklistInput, policies: ReadonlyMap<PolicyId, EvaluatedPolicy>): EvaluatedEvidence {
  switch (source.kind) {
    case 'ci_job':
    case 'database_test':
    case 'unit_test':
    case 'e2e_test':
    case 'cdk_assertion':
    case 'runbook':
      return { source, status: 'in_repository', latest: null, outstanding: [], note: 'checked to exist on every build' };
    case 'policy': {
      const policy = policies.get(source.policy);
      if (policy === undefined) {
        throw new Error(`no policy ${source.policy}`);
      }
      return {
        source,
        status: policy.status === 'approved' ? 'current' : policy.status,
        latest: policy.approvedOn === null ? null : { occurredOn: policy.approvedOn, documentRef: policy.policy.file, sha256: null },
        outstanding: [],
        note: policy.status === 'approved' ? `version ${policy.policy.version} approved` : policy.status === 'stale' ? `version ${policy.policy.version} is past its yearly review` : `version ${policy.policy.version} is a draft awaiting the security official’s approval`,
      };
    }
    case 'record':
      return evaluateRecord(source, input);
    case 'external':
      return { source, status: 'collected_externally', latest: null, outstanding: [], note: `collected by the compliance platform from ${source.system === 'aws' ? 'the AWS account' : 'GitHub'}` };
    case 'not_built':
      return { source, status: 'not_built', latest: null, outstanding: [], note: `milestone ${String(source.milestone)} builds it` };
  }
}

const SETTLED: ReadonlySet<EvidenceStatus> = new Set(['in_repository', 'current', 'collected_externally']);

function controlStatus(evidence: readonly EvaluatedEvidence[]): ControlStatus {
  if (evidence.some((item) => !SETTLED.has(item.status) && item.status !== 'not_built')) {
    return 'action_needed';
  }
  return evidence.some((item) => item.status === 'not_built') ? 'partial' : 'ready';
}

export function evaluateChecklist(input: ChecklistInput, controls: readonly Control[] = CONTROLS): Checklist {
  dayNumber(input.today);
  const policies = POLICIES.map((policy) => evaluatePolicy(policy, input));
  const byId = new Map(policies.map((policy) => [policy.policy.id, policy] as const));
  const evaluated = controls.map((control) => {
    const evidence = control.evidence.map((source) => evaluateSource(source, input, byId));
    return { control, status: controlStatus(evidence), evidence };
  });
  const counts: Record<ControlStatus, number> = { ready: 0, action_needed: 0, partial: 0 };
  for (const control of evaluated) {
    counts[control.status] += 1;
  }
  return { today: input.today, controls: evaluated, program: PROGRAM_EVIDENCE.map((source) => evaluateRecord(source, input)), policies, counts };
}

export function controlById(id: ControlId): Control {
  const control = CONTROLS.find((candidate) => candidate.id === id);
  if (control === undefined) {
    throw new Error(`no control ${id}`);
  }
  return control;
}
