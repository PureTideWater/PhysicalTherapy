/**
 * A model of a practice's pricing runs, for the re-run acceptance rule's property test and its tie to the SQL (test
 * matrix PRC-25 to PRC-28; combined audit #10; docs/adr/0037, amendment of 2026-10-26). Time is a counter: every
 * event takes the next tick, so no two stamps tie. It models what the rule reads and what it protects:
 *
 * - Lines load into months (0 is January 2026), and a correction (the corrected claim's line is superseded and its
 *   correction loads) or a reversal later arrives for one; both are read live when a run is priced (lines.ts).
 * - A first run's cut-off is its creation; a re-run keeps its original's (create.ts). Each run pins, when it is
 *   created, the inputs fixed at creation (FIXED_AT_CREATION): the release in force (a release is published, or the
 *   one in force withdrawn for good, and the one before it is in force again) and the place-of-service split in force
 *   (a later approval is in force from then on). The triage date is not modelled: it changes nothing a line's
 *   pricing in effect is read for (in-effect.ts, NEWER_PRICING).
 * - Pricing, as execute.ts runs it, with any number of executions at once: the run is set running; its pricing
 *   transaction begins, and that start is its completed_at; later, under the practice's execution lock (one run at a
 *   time, until it commits or fails), it reads the lines and the live inputs (its readAt), unless a run that began
 *   after it has already completed, when the transaction begins again (execute.ts's restart; `orderGuard: false`
 *   leaves it out, for the counter-example); then it commits (complete) or fails. A first run is not priced while a
 *   first run of its period created before it is still open: the model's scope is acceptance and re-run creation,
 *   and same-period first runs priced out of order are a gap of their own.
 * - An acceptance begins (its transaction's now(), which becomes accepted_at) and later checks and commits under the
 *   lock, atomically, against what has committed by then.
 * - Which run is in effect (RUN_IN_EFFECT) and each line's pricing in effect (PRICED_IN_EFFECT), as in-effect.ts.
 *
 * The invariants judge newness by what each run read and pinned (readAt and FIXED_AT_CREATION), never by the rule's
 * own completed_at, so a gap between the stamp and the reads, or an input the rule leaves out, fails them. The
 * acceptance rule is pluggable, so the property test can show each rejected rule of the design failing. Synthetic:
 * months and counters only, no line content.
 */

export type ModelStatus = 'queued' | 'running' | 'complete' | 'failed';

export interface ModelRun {
  readonly id: number;
  /** First and last month of the period, inclusive. */
  readonly from: number;
  readonly to: number;
  readonly cutOff: number;
  readonly release: number;
  /** The place-of-service split it pinned: the approvals counted from 1, 0 for none. */
  readonly split: number;
  readonly rerunOf: number | null;
  readonly createdAt: number;
  status: ModelStatus;
  /** When its pricing transaction began (completed_at); set once that transaction begins, again on a restart. */
  completedAt: number | null;
  /** When it read the lines and the live inputs under the execution lock; set once it has. */
  readAt: number | null;
  acceptedAt: number | null;
  /** The lines it priced. */
  readonly lines: Set<number>;
}

export interface ModelLine {
  readonly id: number;
  readonly month: number;
  readonly loadedAt: number;
  superseded: boolean;
  reversed: boolean;
}

/** What an acceptance rule decides for a complete, unaccepted re-run not pinned to a withdrawn release. */
export type RuleOutcome = 'accepted' | 'superseded' | 'newer_run_pending' | 'changed_meanwhile';

/** An acceptance rule: the re-run, and the accepting transaction's now(). */
export type AcceptRule = (model: RunModel, rerun: ModelRun, now: number) => RuleOutcome;

export type AcceptOutcome = RuleOutcome | 'not_found' | 'not_rerun' | 'not_complete' | 'already_accepted' | 'release_withdrawn';

export type CreateOutcome = { readonly created: number } | { readonly refused: 'not_found' | 'not_complete' | 'not_in_effect' | 'newer_run_pending' };

/** What a pricing transaction's read under the lock came to: read, begun again (execute.ts's restart), or not its turn. */
export type ReadOutcome = 'read' | 'restarted' | 'blocked';

/** Whether run `b`'s pinned input is older than run `a`'s, for each input fixed at creation. */
export interface FixedInput {
  readonly name: string;
  older(model: RunModel, b: ModelRun, a: ModelRun): boolean;
}

/**
 * The inputs a run pins when it is created: the rule release (older unless `a`'s is withdrawn, after which the
 * reinstated release is the one wanted) and the place-of-service split (a later approval is newer).
 */
export const FIXED_AT_CREATION: readonly FixedInput[] = [
  { name: 'release', older: (model, b, a) => b.release < a.release && !model.withdrawn.has(a.release) },
  { name: 'split', older: (_model, b, a) => b.split < a.split },
];

/** Whether `x` holds newer pricing than `r` (NEWER_PRICING, or a variant of it a rejected rule uses). */
export type NewerPricing = (x: ModelRun, r: ModelRun) => boolean;

export interface ModelOptions {
  /** execute.ts's restart of a pricing transaction that a run which began later completed ahead of (default true). */
  readonly orderGuard?: boolean;
}

interface OpenAcceptance {
  readonly rerunId: number;
  readonly startedAt: number;
}

/** The rule of in-effect.ts and rerun.ts (the design's §2.1), transcribed: superseded, then pending, then meanwhile. */
export const PAID_WHOLE_RULE: AcceptRule = (model, rerun, now) => {
  if (model.rerunSuperseded(rerun)) {
    return 'superseded';
  }
  if (model.newerRunRunning(rerun)) {
    return 'newer_run_pending';
  }
  return model.tookEffectMeanwhile(rerun, now) ? 'changed_meanwhile' : 'accepted';
};

export class RunModel {
  clock = 0;
  readonly runs: ModelRun[] = [];
  readonly lines: ModelLine[] = [];
  readonly releases: number[] = [1];
  readonly withdrawn = new Set<number>();
  /** The place-of-service split in force: approvals counted from 1, 0 before the first. */
  split = 0;
  /** Pricing transactions begun again by execute.ts's restart. */
  restarts = 0;
  private readonly orderGuard: boolean;
  /** Mapping, contract-version, settings and location changes: inputs read at pricing, ordered by completed_at. */
  stateChanges = 0;
  private readonly open = new Map<number, OpenAcceptance>();
  private nextAcceptance = 0;

  constructor(
    readonly rule: AcceptRule = PAID_WHOLE_RULE,
    options: ModelOptions = {},
  ) {
    this.orderGuard = options.orderGuard ?? true;
  }

  private tick(): number {
    this.clock += 1;
    return this.clock;
  }

  run(id: number): ModelRun | undefined {
    return this.runs[id];
  }

  // What in-effect.ts reads.

  eligible(run: ModelRun): boolean {
    return run.status === 'complete' && (run.rerunOf === null || run.acceptedAt !== null);
  }

  since(run: ModelRun): number {
    return run.acceptedAt ?? run.completedAt ?? Number.NaN;
  }

  /** (since(a), a.id) > (since(b), b.id), the order RUN_IN_EFFECT and PRICED_IN_EFFECT read. */
  tookEffectAfter(a: ModelRun, b: ModelRun): boolean {
    return this.since(a) > this.since(b) || (this.since(a) === this.since(b) && a.id > b.id);
  }

  overlaps(a: ModelRun, b: ModelRun): boolean {
    return a.from <= b.to && a.to >= b.from;
  }

  samePeriod(a: ModelRun, b: ModelRun): boolean {
    return a.from === b.from && a.to === b.to;
  }

  inForce(): number {
    return Math.max(...this.releases.filter((release) => !this.withdrawn.has(release)));
  }

  runInEffect(run: ModelRun): boolean {
    return this.eligible(run) && !this.runs.some((later) => later.id !== run.id && this.samePeriod(later, run) && this.eligible(later) && this.tookEffectAfter(later, run));
  }

  /** The run whose priced line is the line's pricing in effect, or null. */
  pricedInEffect(lineId: number): number | null {
    let best: ModelRun | null = null;
    for (const run of this.runs) {
      if (run.lines.has(lineId) && this.runInEffect(run) && (best === null || this.tookEffectAfter(run, best))) {
        best = run;
      }
    }
    return best?.id ?? null;
  }

  /** NEWER_PRICING: priced no earlier than complete run `r`, or pinned to a later release not withdrawn or a later split. */
  newerPricing(x: ModelRun, r: ModelRun): boolean {
    return (x.completedAt ?? Number.NaN) >= (r.completedAt ?? Number.NaN) || (x.release > r.release && !this.withdrawn.has(x.release)) || x.split > r.split;
  }

  supersedesRerun(x: ModelRun, rr: ModelRun, o: ModelRun, newer: NewerPricing = (a, b) => this.newerPricing(a, b)): boolean {
    return (
      x.id !== o.id &&
      x.id !== rr.id &&
      this.overlaps(x, rr) &&
      this.eligible(x) &&
      this.tookEffectAfter(x, o) &&
      (newer(x, rr) || (this.samePeriod(x, rr) && x.cutOff > rr.cutOff))
    );
  }

  rerunSuperseded(rr: ModelRun, newer?: NewerPricing): boolean {
    const o = rr.rerunOf === null ? undefined : this.run(rr.rerunOf);
    if (o === undefined) {
      return false;
    }
    return !this.eligible(o) || this.runs.some((x) => this.supersedesRerun(x, rr, o, newer));
  }

  private overlappingFirstRun(r: ModelRun, statuses: readonly ModelStatus[]): boolean {
    return this.runs.some((x) => x.id !== r.id && x.rerunOf === null && statuses.includes(x.status) && this.overlaps(x, r));
  }

  newerRunRunning(r: ModelRun): boolean {
    return this.overlappingFirstRun(r, ['running']);
  }

  newerRunPending(r: ModelRun): boolean {
    return this.overlappingFirstRun(r, ['queued', 'running']);
  }

  tookEffectMeanwhile(rr: ModelRun, now: number): boolean {
    return this.runs.some((x) => x.id !== rr.id && this.eligible(x) && this.overlaps(x, rr) && this.since(x) >= now);
  }

  /** What rerunBlock says of a complete re-run, judged by the model's rule as a new acceptance would be. */
  acceptance(run: ModelRun): 'acceptable' | 'superseded' | 'newer_run_pending' {
    if (this.rerunSuperseded(run)) {
      return 'superseded';
    }
    return this.newerRunRunning(run) ? 'newer_run_pending' : 'acceptable';
  }

  // Events.

  loadLine(month: number): number {
    const line: ModelLine = { id: this.lines.length, month, loadedAt: this.tick(), superseded: false, reversed: false };
    this.lines.push(line);
    return line.id;
  }

  /** A correction of the line's claim arrives: the line is superseded, and its correction loads. */
  correct(lineId: number): number | null {
    const line = this.lines[lineId];
    if (line === undefined || line.superseded) {
      return null;
    }
    line.superseded = true;
    return this.loadLine(line.month);
  }

  reverse(lineId: number): void {
    const line = this.lines[lineId];
    if (line !== undefined) {
      line.reversed = true;
      this.tick();
    }
  }

  publish(): number {
    const release = Math.max(...this.releases) + 1;
    this.releases.push(release);
    this.tick();
    return release;
  }

  /** Withdraws the release in force, when one before it is still published and not withdrawn. */
  withdraw(): boolean {
    const current = this.inForce();
    if (!this.releases.some((release) => release < current && !this.withdrawn.has(release))) {
      return false;
    }
    this.withdrawn.add(current);
    this.tick();
    return true;
  }

  correctMapping(): void {
    this.stateChanges += 1;
    this.tick();
  }

  /** A contract specialist approves a place-of-service split: the split in force for every run created from now on. */
  approveSplit(): number {
    this.split += 1;
    this.tick();
    return this.split;
  }

  createFirstRun(from: number, to: number): number {
    const at = this.tick();
    const run: ModelRun = {
      id: this.runs.length,
      from,
      to,
      cutOff: at,
      release: this.inForce(),
      split: this.split,
      rerunOf: null,
      createdAt: at,
      status: 'queued',
      completedAt: null,
      readAt: null,
      acceptedAt: null,
      lines: new Set(),
    };
    this.runs.push(run);
    return run.id;
  }

  /** createRerun: only the run in effect for its period, and not while a first run of overlapping dates is open. */
  createRerun(of: number): CreateOutcome {
    const original = this.run(of);
    if (original === undefined) {
      return { refused: 'not_found' };
    }
    if (original.status !== 'complete') {
      return { refused: 'not_complete' };
    }
    if (!this.runInEffect(original)) {
      return { refused: 'not_in_effect' };
    }
    if (this.newerRunPending(original)) {
      return { refused: 'newer_run_pending' };
    }
    const at = this.tick();
    const run: ModelRun = {
      id: this.runs.length,
      from: original.from,
      to: original.to,
      cutOff: original.cutOff,
      release: this.inForce(),
      split: this.split,
      rerunOf: of,
      createdAt: at,
      status: 'queued',
      completedAt: null,
      readAt: null,
      acceptedAt: null,
      lines: new Set(),
    };
    this.runs.push(run);
    return { created: run.id };
  }

  /** Whether the run can be set running: queued, and no earlier first run of its period open. */
  canStart(run: ModelRun): boolean {
    return (
      run.status === 'queued' &&
      (run.rerunOf !== null || !this.runs.some((other) => other.rerunOf === null && other.id < run.id && this.samePeriod(other, run) && (other.status === 'queued' || other.status === 'running')))
    );
  }

  /** The price job's first transaction: the run is set running. */
  startPricing(id: number): boolean {
    const run = this.run(id);
    if (run === undefined || !this.canStart(run)) {
      return false;
    }
    run.status = 'running';
    this.tick();
    return true;
  }

  /** Its pricing transaction begins: completed_at is stamped (execute.ts: the transaction's now()). */
  beginPricing(id: number): boolean {
    const run = this.run(id);
    if (run?.status !== 'running' || run.completedAt !== null) {
      return false;
    }
    run.completedAt = this.tick();
    return true;
  }

  /** The run holding the practice's execution lock: it has read under it and not yet committed or failed. */
  lockHolder(): ModelRun | undefined {
    return this.runs.find((run) => run.status === 'running' && run.readAt !== null);
  }

  /**
   * Under the execution lock, once no other run holds it: begun again when a run that began after it has completed
   * (execute.ts's restart, unless `orderGuard` is off), otherwise the lines loaded by the cut-off (not a superseded
   * claim's) and the live inputs are read.
   */
  readInputs(id: number): ReadOutcome {
    const run = this.run(id);
    if (run?.status !== 'running' || run.completedAt === null || run.readAt !== null || this.lockHolder() !== undefined) {
      return 'blocked';
    }
    const stamp = run.completedAt;
    if (this.orderGuard && this.runs.some((other) => other.status === 'complete' && (other.completedAt ?? 0) > stamp)) {
      run.completedAt = this.tick();
      this.restarts += 1;
      return 'restarted';
    }
    run.readAt = this.tick();
    for (const line of this.lines) {
      if (line.month >= run.from && line.month <= run.to && line.loadedAt <= run.cutOff && !line.superseded) {
        run.lines.add(line.id);
      }
    }
    return 'read';
  }

  commitPricing(id: number): boolean {
    const run = this.run(id);
    if (run?.status !== 'running' || run.readAt === null) {
      return false;
    }
    run.status = 'complete';
    this.tick();
    return true;
  }

  fail(id: number): boolean {
    const run = this.run(id);
    if (run === undefined || (run.status !== 'queued' && run.status !== 'running')) {
      return false;
    }
    run.status = 'failed';
    run.completedAt = null;
    run.readAt = null;
    run.lines.clear();
    this.tick();
    return true;
  }

  /** A whole execution with nothing else running: set running, begin, read (again after a restart) and commit. */
  price(id: number): boolean {
    if (!this.startPricing(id) || !this.beginPricing(id)) {
      return false;
    }
    let read = this.readInputs(id);
    while (read === 'restarted') {
      read = this.readInputs(id);
    }
    return read === 'read' && this.commitPricing(id);
  }

  beginAcceptance(rerunId: number): number {
    const id = this.nextAcceptance++;
    this.open.set(id, { rerunId, startedAt: this.tick() });
    return id;
  }

  openAcceptances(): number[] {
    return [...this.open.keys()];
  }

  /** The re-run an open acceptance is of. */
  acceptanceOf(acceptanceId: number): ModelRun | undefined {
    const open = this.open.get(acceptanceId);
    return open === undefined ? undefined : this.run(open.rerunId);
  }

  /** The acceptance checks and commits under the lock, against what has committed: acceptRun's order of refusals. */
  finishAcceptance(acceptanceId: number, rule: AcceptRule = this.rule): AcceptOutcome {
    const open = this.open.get(acceptanceId);
    if (open === undefined) {
      return 'not_found';
    }
    this.open.delete(acceptanceId);
    this.tick();
    const run = this.run(open.rerunId);
    if (run === undefined) {
      return 'not_found';
    }
    if (run.rerunOf === null) {
      return 'not_rerun';
    }
    if (run.status !== 'complete') {
      return 'not_complete';
    }
    if (run.acceptedAt !== null) {
      return 'already_accepted';
    }
    if (this.withdrawn.has(run.release)) {
      return 'release_withdrawn';
    }
    const outcome = rule(this, run, open.startedAt);
    if (outcome === 'accepted') {
      run.acceptedAt = open.startedAt;
    }
    return outcome;
  }

  accept(rerunId: number, rule: AcceptRule = this.rule): AcceptOutcome {
    return this.finishAcceptance(this.beginAcceptance(rerunId), rule);
  }
}

// The invariants (the design's §6.3).

/** Each line's pricing in effect, by line. */
export function pricingInEffect(model: RunModel): Map<number, number | null> {
  return new Map(model.lines.map((line) => [line.id, model.pricedInEffect(line.id)]));
}

/** A line still priceable: not reversed, and its claim not superseded by a correction. */
const priceable = (line: ModelLine) => !line.superseded && !line.reversed;

/** (i) Lines some eligible run priced, still priceable, with no pricing in effect. */
export function lostLines(model: RunModel): number[] {
  return model.lines.filter((line) => priceable(line) && model.runs.some((run) => model.eligible(run) && run.lines.has(line.id)) && model.pricedInEffect(line.id) === null).map((line) => line.id);
}

/**
 * Whether run `b`'s pricing is older than run `a`'s in anything it read or pinned: it read the live inputs before
 * `a` did, or pinned an input fixed at creation that is older. Judged from what the runs did, not from the rule's
 * completed_at, so the invariants catch a stamp out of step with the reads and an input the rule leaves out.
 */
export function olderPricing(model: RunModel, b: ModelRun, a: ModelRun): boolean {
  return (b.readAt ?? 0) < (a.readAt ?? 0) || FIXED_AT_CREATION.some((input) => input.older(model, b, a));
}

/**
 * (ii) Lines an acceptance moved, from the pricing in effect `before`, to a run whose pricing is older in anything
 * it read or pinned (olderPricing). Only lines still priceable: a corrected claim is priced through its correction,
 * as intended.
 */
export function regressions(model: RunModel, before: ReadonlyMap<number, number | null>): number[] {
  return model.lines
    .filter((line) => {
      const was = before.get(line.id);
      const now = model.pricedInEffect(line.id);
      if (!priceable(line) || was === null || was === undefined || now === null || now === was) {
        return false;
      }
      const [a, b] = [model.run(was), model.run(now)];
      return a === undefined || b === undefined || olderPricing(model, b, a);
    })
    .map((line) => line.id);
}

/**
 * (iv) Re-runs that are freshest by every measure and yet the model's rule would refuse: complete, unaccepted, not
 * withdrawn, the original eligible, no overlapping first run being priced, newer than every other complete run of
 * overlapping dates in all it read and pinned (each read its inputs before it, and pinned no newer input), with a
 * cut-off no earlier than any complete run of its period, judged by an acceptance that begins now.
 */
export function livenessViolations(model: RunModel, rule: AcceptRule = model.rule): number[] {
  const now = model.clock + 1;
  return model.runs
    .filter((r) => {
      const o = r.rerunOf === null ? undefined : model.run(r.rerunOf);
      if (o === undefined || r.status !== 'complete' || r.acceptedAt !== null || model.withdrawn.has(r.release) || !model.eligible(o) || model.newerRunRunning(r)) {
        return false;
      }
      const freshest = model.runs.every(
        (x) =>
          x.id === r.id ||
          x.status !== 'complete' ||
          !model.overlaps(x, r) ||
          ((x.readAt ?? 0) < (r.readAt ?? 0) && !FIXED_AT_CREATION.some((input) => input.older(model, r, x)) && (!model.samePeriod(x, r) || x.cutOff <= r.cutOff)),
      );
      return freshest && rule(model, r, now) !== 'accepted';
    })
    .map((r) => r.id);
}
