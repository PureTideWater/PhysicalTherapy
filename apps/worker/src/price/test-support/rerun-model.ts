/**
 * A model of a practice's pricing runs, for the re-run acceptance rule's property test and its tie to the SQL (test
 * matrix PRC-25 to PRC-28; combined audit #10; docs/adr/0037, amendment of 2026-10-26). Time is a counter: every
 * event takes the next tick, so no two stamps tie. It models what the rule reads and what it protects:
 *
 * - Lines load into months (0 is January 2026), and a correction (the corrected claim's line is superseded and its
 *   correction loads) or a reversal later arrives for one; both are read live when a run is priced (lines.ts).
 * - A first run's cut-off is its creation; a re-run keeps its original's (create.ts). Each run pins the release in
 *   force when it is created; a release is published, or the one in force withdrawn for good (the one before it is in
 *   force again).
 * - Pricing begins (status running, then the pricing transaction, whose start is completed_at and which reads the
 *   lines under the practice's execution lock, so one run at a time) and later commits (complete) or fails. A first
 *   run is not priced while a first run of its period created before it is still open: the model's scope is
 *   acceptance and re-run creation, and same-period first runs priced out of order are a gap of their own.
 * - An acceptance begins (its transaction's now(), which becomes accepted_at) and later checks and commits under the
 *   lock, atomically, against what has committed by then.
 * - Which run is in effect (RUN_IN_EFFECT) and each line's pricing in effect (PRICED_IN_EFFECT), as in-effect.ts.
 *
 * The acceptance rule is pluggable, so the property test can show each rejected rule of the design failing.
 * Synthetic: months and counters only, no line content.
 */

export type ModelStatus = 'queued' | 'running' | 'complete' | 'failed';

export interface ModelRun {
  readonly id: number;
  /** First and last month of the period, inclusive. */
  readonly from: number;
  readonly to: number;
  readonly cutOff: number;
  readonly release: number;
  readonly rerunOf: number | null;
  readonly createdAt: number;
  status: ModelStatus;
  /** When its pricing transaction began (completed_at); set once pricing begins. */
  completedAt: number | null;
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
  /** Mapping, contract-version, settings and location changes: inputs read at pricing, ordered by completed_at. */
  stateChanges = 0;
  private readonly open = new Map<number, OpenAcceptance>();
  private nextAcceptance = 0;

  constructor(readonly rule: AcceptRule = PAID_WHOLE_RULE) {}

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

  /** NEWER_PRICING: priced no earlier than complete run `r`, or pinned to a later release not withdrawn. */
  newerPricing(x: ModelRun, r: ModelRun): boolean {
    return (x.completedAt ?? Number.NaN) >= (r.completedAt ?? Number.NaN) || (x.release > r.release && !this.withdrawn.has(x.release));
  }

  supersedesRerun(x: ModelRun, rr: ModelRun, o: ModelRun): boolean {
    return (
      x.id !== o.id &&
      x.id !== rr.id &&
      this.overlaps(x, rr) &&
      this.eligible(x) &&
      this.tookEffectAfter(x, o) &&
      (this.newerPricing(x, rr) || (this.samePeriod(x, rr) && x.cutOff > rr.cutOff))
    );
  }

  rerunSuperseded(rr: ModelRun): boolean {
    const o = rr.rerunOf === null ? undefined : this.run(rr.rerunOf);
    if (o === undefined) {
      return false;
    }
    return !this.eligible(o) || this.runs.some((x) => this.supersedesRerun(x, rr, o));
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

  createFirstRun(from: number, to: number): number {
    const at = this.tick();
    const run: ModelRun = { id: this.runs.length, from, to, cutOff: at, release: this.inForce(), rerunOf: null, createdAt: at, status: 'queued', completedAt: null, acceptedAt: null, lines: new Set() };
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
      rerunOf: of,
      createdAt: at,
      status: 'queued',
      completedAt: null,
      acceptedAt: null,
      lines: new Set(),
    };
    this.runs.push(run);
    return { created: run.id };
  }

  /** Whether the run's pricing can begin: queued, no run being priced, and no earlier first run of its period open. */
  canStart(run: ModelRun): boolean {
    return (
      run.status === 'queued' &&
      !this.runs.some((other) => other.status === 'running') &&
      (run.rerunOf !== null || !this.runs.some((other) => other.rerunOf === null && other.id < run.id && this.samePeriod(other, run) && (other.status === 'queued' || other.status === 'running')))
    );
  }

  /** Pricing begins: running, completed_at stamped, the lines loaded by the cut-off read (not a superseded claim's). */
  startPricing(id: number): boolean {
    const run = this.run(id);
    if (run === undefined || !this.canStart(run)) {
      return false;
    }
    run.status = 'running';
    run.completedAt = this.tick();
    for (const line of this.lines) {
      if (line.month >= run.from && line.month <= run.to && line.loadedAt <= run.cutOff && !line.superseded) {
        run.lines.add(line.id);
      }
    }
    return true;
  }

  commitPricing(id: number): boolean {
    const run = this.run(id);
    if (run?.status !== 'running') {
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
    run.lines.clear();
    this.tick();
    return true;
  }

  price(id: number): boolean {
    return this.startPricing(id) && this.commitPricing(id);
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
 * (ii) Lines an acceptance moved, from the pricing in effect `before`, to a run with an older pricing stamp, or to an
 * older release that is not a reinstatement after a withdrawal. Only lines still priceable: a corrected claim is priced
 * through its correction, as intended.
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
      if (a === undefined || b === undefined) {
        return true;
      }
      return (b.completedAt ?? 0) < (a.completedAt ?? 0) || (b.release < a.release && !model.withdrawn.has(a.release));
    })
    .map((line) => line.id);
}

/**
 * (iv) Re-runs that are freshest by every measure and yet the model's rule would refuse: complete, unaccepted, not
 * withdrawn, the original eligible, no overlapping first run being priced, priced after every other complete run of
 * overlapping dates, pinned to a release no older than any of theirs not withdrawn, with a cut-off no earlier than any
 * complete run of its period, judged by an acceptance that begins now.
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
          ((x.completedAt ?? 0) < (r.completedAt ?? 0) && (x.release <= r.release || model.withdrawn.has(x.release)) && (!model.samePeriod(x, r) || x.cutOff <= r.cutOff)),
      );
      return freshest && rule(model, r, now) !== 'accepted';
    })
    .map((r) => r.id);
}
