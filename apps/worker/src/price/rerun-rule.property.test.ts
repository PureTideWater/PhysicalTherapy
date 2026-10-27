import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { type AcceptOutcome, type AcceptRule, type ModelRun, PAID_WHOLE_RULE, RunModel, livenessViolations, lostLines, pricingInEffect, regressions } from './test-support/rerun-model';

/**
 * The re-run acceptance rule against a model of a practice's runs (combined audit #10; test matrix PRC-25 to PRC-28;
 * docs/adr/0037, amendment of 2026-10-26). Random sequences of loads, corrections and reversals, first runs of one to
 * three months, re-runs, executions that run at once (each set running, its pricing transaction begun and stamped,
 * its inputs read under the execution lock, then committed or failed), acceptances that begin and later commit, and
 * release, withdrawal, split and mapping changes. After every step: (i) every line some eligible run priced, still
 * priceable, keeps pricing in effect; (ii) no acceptance moves a line's pricing in effect to pricing older in anything
 * it read or pinned; (iii) an accepted re-run is the run in effect for its period; (iv) a re-run freshest by every
 * measure is acceptable. Each rule the design rejected fails one of them, shown on a named counter-example, and so do
 * an execution that keeps a stamp from before the lock and a rule that leaves out the split. rerun.db.test.ts ties
 * the model to the SQL.
 */

type Step =
  | { readonly kind: 'load'; readonly month: number }
  | { readonly kind: 'correct' | 'reverse'; readonly pick: number }
  | { readonly kind: 'first'; readonly from: number; readonly months: number }
  | { readonly kind: 'rerun' | 'pair' | 'price' | 'start' | 'begin' | 'read' | 'fail' | 'begin_accept' | 'finish_accept' | 'accept'; readonly pick: number }
  | { readonly kind: 'race'; readonly first: number; readonly second: number }
  | { readonly kind: 'commit' | 'publish' | 'withdraw' | 'split' | 'map' };

const MONTHS = 4;
const pick = fc.nat(1_000);
const step: fc.Arbitrary<Step> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('load' as const), month: fc.nat(MONTHS - 1) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constantFrom('correct' as const, 'reverse' as const), pick }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('first' as const), from: fc.nat(MONTHS - 1), months: fc.integer({ min: 1, max: 3 }) }) },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant('rerun' as const), pick }) },
  // Two re-runs of one run, each priced: what a race needs, two complete re-runs, which single steps seldom leave.
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('pair' as const), pick }) },
  // A whole execution with nothing else holding the lock, and the four steps of executions that run at once.
  { weight: 4, arbitrary: fc.record({ kind: fc.constant('price' as const), pick }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('start' as const), pick }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('begin' as const), pick }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('read' as const), pick }) },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant('commit' as const) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('fail' as const), pick }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constantFrom('begin_accept' as const, 'finish_accept' as const), pick }) },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant('accept' as const), pick }) },
  // The interleaving of the design's §1.6.3: one acceptance begins, another begins and commits, then the first checks.
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('race' as const), first: pick, second: pick }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constantFrom('publish' as const, 'withdraw' as const, 'map' as const) }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('split' as const) }) },
);

/**
 * Executions at once and the inputs a run pins when it is created, without the corrections, withdrawals and
 * acceptance races of `step`: the sequences that reach a stamp out of step with the reads, or a newer split, often.
 */
const pinnedStep: fc.Arbitrary<Step> = fc.oneof(
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('load' as const), month: fc.nat(MONTHS - 1) }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('first' as const), from: fc.nat(MONTHS - 1), months: fc.integer({ min: 1, max: 3 }) }) },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant('rerun' as const), pick }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('price' as const), pick }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constantFrom('start' as const, 'begin' as const, 'read' as const), pick }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('commit' as const) }) },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant('accept' as const), pick }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constantFrom('split' as const, 'publish' as const, 'map' as const) }) },
);

const choose = <T>(items: readonly T[], at: number): T | undefined => (items.length === 0 ? undefined : items[at % items.length]);
const completeReruns = (model: RunModel) => model.runs.filter((run) => run.rerunOf !== null && run.status === 'complete');

/** What the sequences reached, so the property is known not to hold vacuously. */
const seen = new Map<string, number>();

/** The invariants after every step; (ii) and (iii) after an acceptance that committed. */
function checkStep(model: RunModel, accepted: { readonly run: ModelRun; readonly before: ReadonlyMap<number, number | null> } | null): void {
  expect(lostLines(model), 'every line some eligible run priced keeps pricing in effect').toEqual([]);
  expect(livenessViolations(model), 'a re-run freshest by every measure is acceptable').toEqual([]);
  if (accepted !== null) {
    expect(regressions(model, accepted.before), 'no acceptance moves a line to older pricing').toEqual([]);
    expect(model.runInEffect(accepted.run), 'an accepted re-run is the run in effect for its period').toBe(true);
  }
}

function play(model: RunModel, steps: readonly Step[], tally: Map<string, number> = seen): void {
  const count = (key: string) => tally.set(key, (tally.get(key) ?? 0) + 1);
  for (const next of steps) {
    let accepted: { readonly run: ModelRun; readonly before: ReadonlyMap<number, number | null> } | null = null;
    const acceptance = (run: ModelRun | undefined, outcome: () => AcceptOutcome) => {
      const before = pricingInEffect(model);
      const result = outcome();
      count(`accept:${result}`);
      if (result === 'accepted' && run !== undefined) {
        accepted = { run, before };
      }
    };
    switch (next.kind) {
      case 'load':
        model.loadLine(next.month);
        break;
      case 'correct':
      case 'reverse': {
        const line = choose(model.lines, next.pick);
        if (line !== undefined) {
          if (next.kind === 'correct') {
            model.correct(line.id);
          } else {
            model.reverse(line.id);
          }
        }
        break;
      }
      case 'first':
        model.createFirstRun(next.from, Math.min(next.from + next.months - 1, MONTHS - 1));
        break;
      case 'rerun': {
        const run = choose(
          model.runs.filter((candidate) => candidate.status === 'complete'),
          next.pick,
        );
        if (run !== undefined) {
          const created = model.createRerun(run.id);
          count('refused' in created ? `rerun:${created.refused}` : 'rerun:created');
        }
        break;
      }
      case 'pair': {
        const run = choose(
          model.runs.filter((candidate) => candidate.status === 'complete'),
          next.pick,
        );
        for (let made = 0; run !== undefined && made < 2; made += 1) {
          const created = model.createRerun(run.id);
          count('refused' in created ? `rerun:${created.refused}` : 'rerun:created');
          if ('created' in created) {
            model.price(created.created);
            checkStep(model, null);
          }
        }
        break;
      }
      case 'price': {
        const run = choose(
          model.runs.filter((candidate) => model.canStart(candidate)),
          next.pick,
        );
        if (run !== undefined) {
          model.price(run.id);
        }
        break;
      }
      case 'start': {
        const run = choose(
          model.runs.filter((candidate) => model.canStart(candidate)),
          next.pick,
        );
        if (run !== undefined) {
          model.startPricing(run.id);
        }
        break;
      }
      case 'begin': {
        const run = choose(
          model.runs.filter((candidate) => candidate.status === 'running' && candidate.completedAt === null),
          next.pick,
        );
        if (run !== undefined) {
          model.beginPricing(run.id);
        }
        break;
      }
      case 'read': {
        const run = choose(
          model.runs.filter((candidate) => candidate.status === 'running' && candidate.completedAt !== null && candidate.readAt === null),
          next.pick,
        );
        if (run !== undefined) {
          count(`read:${model.readInputs(run.id)}`);
        }
        break;
      }
      case 'commit': {
        const holder = model.lockHolder();
        if (holder !== undefined) {
          model.commitPricing(holder.id);
        }
        break;
      }
      case 'fail': {
        const run = choose(
          model.runs.filter((candidate) => candidate.status === 'queued' || candidate.status === 'running'),
          next.pick,
        );
        if (run !== undefined) {
          model.fail(run.id);
        }
        break;
      }
      case 'begin_accept': {
        const run = choose(completeReruns(model), next.pick);
        if (run !== undefined) {
          model.beginAcceptance(run.id);
        }
        break;
      }
      case 'finish_accept': {
        const id = choose(model.openAcceptances(), next.pick);
        if (id !== undefined) {
          acceptance(model.acceptanceOf(id), () => model.finishAcceptance(id));
        }
        break;
      }
      case 'accept': {
        const run = choose(completeReruns(model), next.pick);
        if (run !== undefined) {
          acceptance(run, () => model.accept(run.id));
        }
        break;
      }
      case 'race': {
        const [waiting, racing] = [choose(completeReruns(model), next.first), choose(completeReruns(model), next.second)];
        if (waiting !== undefined && racing !== undefined && waiting.id !== racing.id) {
          const opened = model.beginAcceptance(waiting.id);
          acceptance(racing, () => model.accept(racing.id));
          checkStep(model, accepted);
          accepted = null;
          acceptance(waiting, () => model.finishAcceptance(opened));
        }
        break;
      }
      case 'publish':
        model.publish();
        break;
      case 'withdraw':
        model.withdraw();
        break;
      case 'split':
        model.approveSplit();
        break;
      case 'map':
        model.correctMapping();
        break;
    }
    checkStep(model, accepted);
  }
}

// Each property plays thousands of sequences: seconds, and more under CI's coverage instrumentation, so each has
// its own bound rather than the unit project's five-second default (the CI run of c637dfd stopped one at 5 s).
const PROPERTY_TIMEOUT_MS = 60_000;

/** Every outcome the rule and the steps around it can give. */
const OUTCOMES = [
  'accept:accepted',
  'accept:superseded',
  'accept:newer_run_pending',
  'accept:changed_meanwhile',
  'rerun:created',
  'rerun:not_in_effect',
  'rerun:newer_run_pending',
  'read:read',
  'read:restarted',
] as const;

/**
 * One sequence that reaches every outcome, played first as the property's example, so each invariant is checked under
 * each outcome on every run whatever the random sequences reach: two re-runs of a February run raced (accepted, then
 * changed_meanwhile), a third re-run of that run, no longer in effect (not_in_effect), a quarter run re-run while a
 * February first run is queued and then running (newer_run_pending twice), the February run read (read) and committed,
 * the quarter's re-run then accepted (superseded), and a March and an April run begun in order and read in reverse
 * (read, then restarted).
 */
const EVERY_OUTCOME: readonly Step[] = [
  { kind: 'load', month: 1 },
  { kind: 'first', from: 1, months: 1 },
  { kind: 'price', pick: 0 },
  { kind: 'rerun', pick: 0 },
  { kind: 'price', pick: 0 },
  { kind: 'rerun', pick: 0 },
  { kind: 'price', pick: 0 },
  { kind: 'race', first: 1, second: 0 },
  { kind: 'rerun', pick: 0 },
  { kind: 'first', from: 0, months: 3 },
  { kind: 'price', pick: 0 },
  { kind: 'rerun', pick: 3 },
  { kind: 'price', pick: 0 },
  { kind: 'first', from: 1, months: 1 },
  { kind: 'rerun', pick: 3 },
  { kind: 'start', pick: 0 },
  { kind: 'accept', pick: 2 },
  { kind: 'begin', pick: 0 },
  { kind: 'read', pick: 0 },
  { kind: 'commit' },
  { kind: 'accept', pick: 2 },
  { kind: 'first', from: 2, months: 1 },
  { kind: 'first', from: 3, months: 1 },
  { kind: 'start', pick: 0 },
  { kind: 'start', pick: 0 },
  { kind: 'begin', pick: 0 },
  { kind: 'begin', pick: 0 },
  { kind: 'read', pick: 1 },
  { kind: 'commit' },
  { kind: 'read', pick: 0 },
  { kind: 'read', pick: 0 },
  { kind: 'commit' },
];

describe('PRC-25 to PRC-28: the acceptance rule over random sequences of runs, lines, releases and acceptances', () => {
  it('keeps every priced line in effect, never regresses one, leaves an accepted re-run in effect and accepts a freshest re-run', () => {
    const example = new Map<string, number>();
    fc.assert(
      fc.property(fc.array(step, { minLength: 20, maxLength: 80 }), (steps) => {
        play(new RunModel(), steps, steps === EVERY_OUTCOME ? example : seen);
      }),
      { numRuns: 3_000, examples: [[EVERY_OUTCOME]] },
    );
    // The example reached every outcome, so no invariant holds vacuously on any run; and so did the random sequences.
    // Measured over 30 seeds of 3,000 sequences, each outcome is reached 28 times or more (changed_meanwhile 32 to 62
    // times, through the pair step; 0 to 6 times without it, which once failed this check), so a random run that
    // reaches one no time at all is a change to the steps, not chance.
    for (const outcome of OUTCOMES) {
      expect(example.get(outcome) ?? 0, `${outcome} in the example among ${JSON.stringify([...example])}`).toBeGreaterThan(0);
      expect(seen.get(outcome) ?? 0, `${outcome} among ${JSON.stringify([...seen])}`).toBeGreaterThan(0);
    }
  }, PROPERTY_TIMEOUT_MS);

  it('holds over executions at once and newer pinned inputs: no acceptance regresses a line to pricing read or pinned earlier', () => {
    fc.assert(
      fc.property(fc.array(pinnedStep, { minLength: 30, maxLength: 60, size: 'max' }), (steps) => {
        play(new RunModel(), steps);
      }),
      { numRuns: 6_000 },
    );
  }, PROPERTY_TIMEOUT_MS);

  it('checks an acceptance that began before others committed: every finished acceptance leaves its re-run in effect', () => {
    fc.assert(
      fc.property(fc.array(step, { minLength: 20, maxLength: 80 }), (steps) => {
        const model = new RunModel();
        play(model, steps);
        // Whatever stayed open finishes now, each checked as it commits.
        for (const id of model.openAcceptances()) {
          const before = pricingInEffect(model);
          const run = model.acceptanceOf(id);
          const outcome = model.finishAcceptance(id);
          checkStep(model, outcome === 'accepted' && run !== undefined ? { run, before } : null);
        }
      }),
      { numRuns: 500 },
    );
  }, PROPERTY_TIMEOUT_MS);
});

// The rules the design rejected (§2.3), each over the same model.

/** The audit's rule alone: refuse only when the original is not the run in effect for its exact period. */
const AUDIT_RULE: AcceptRule = (model, rerun) => {
  const original = rerun.rerunOf === null ? undefined : model.run(rerun.rerunOf);
  return original !== undefined && model.runInEffect(original) ? 'accepted' : 'superseded';
};

/** The first design: newness by when a run took effect, and an original not in effect refused outright. */
const EFFECT_TIME_RULE: AcceptRule = (model, rerun) => {
  const original = rerun.rerunOf === null ? undefined : model.run(rerun.rerunOf);
  if (original === undefined || !model.runInEffect(original)) {
    return 'superseded';
  }
  const stale = model.runs.some(
    (x) => x.id !== original.id && x.id !== rerun.id && model.eligible(x) && model.overlaps(x, rerun) && model.since(x) > Math.max(model.since(original), rerun.createdAt),
  );
  return stale ? 'superseded' : 'accepted';
};

/** The review's form: newness by a run priced after the re-run was created, otherwise the rule as built. */
const REVIEW_RULE: AcceptRule = (model, rerun, now) => {
  const original = rerun.rerunOf === null ? undefined : model.run(rerun.rerunOf);
  if (original === undefined || !model.eligible(original)) {
    return 'superseded';
  }
  const stale = model.runs.some(
    (x) =>
      x.id !== original.id &&
      x.id !== rerun.id &&
      model.overlaps(x, rerun) &&
      model.eligible(x) &&
      model.tookEffectAfter(x, original) &&
      ((x.completedAt ?? 0) > rerun.createdAt || (model.samePeriod(x, rerun) && x.cutOff > rerun.cutOff)),
  );
  if (stale) {
    return 'superseded';
  }
  if (model.newerRunRunning(rerun)) {
    return 'newer_run_pending';
  }
  return model.tookEffectMeanwhile(rerun, now) ? 'changed_meanwhile' : 'accepted';
};

/** The rule as built, without the guard against a run that took effect while the acceptance waited. */
const NO_MEANWHILE_RULE: AcceptRule = (model, rerun) => {
  if (model.rerunSuperseded(rerun)) {
    return 'superseded';
  }
  return model.newerRunRunning(rerun) ? 'newer_run_pending' : 'accepted';
};

/** Strict overlap: refuse when any overlapping eligible run other than the original took effect after it. */
const STRICT_OVERLAP_RULE: AcceptRule = (model, rerun) => {
  const original = rerun.rerunOf === null ? undefined : model.run(rerun.rerunOf);
  if (original === undefined || !model.eligible(original)) {
    return 'superseded';
  }
  return model.runs.some((x) => x.id !== original.id && x.id !== rerun.id && model.eligible(x) && model.overlaps(x, rerun) && model.tookEffectAfter(x, original)) ? 'superseded' : 'accepted';
};

/** The rule as built, with NEWER_PRICING judging only the pricing stamp and the release, not the split. */
const NO_SPLIT_RULE: AcceptRule = (model, rerun, now) => {
  if (model.rerunSuperseded(rerun, (x, r) => (x.completedAt ?? Number.NaN) >= (r.completedAt ?? Number.NaN) || (x.release > r.release && !model.withdrawn.has(x.release)))) {
    return 'superseded';
  }
  if (model.newerRunRunning(rerun)) {
    return 'newer_run_pending';
  }
  return model.tookEffectMeanwhile(rerun, now) ? 'changed_meanwhile' : 'accepted';
};

const FEBRUARY = 1;

/** Runs a step and returns its value, failing on a refusal the sequence does not expect. */
function created(outcome: ReturnType<RunModel['createRerun']>): number {
  if ('refused' in outcome) {
    throw new Error(`the re-run was refused: ${outcome.refused}`);
  }
  return outcome.created;
}

/** Sequence C (the design's §1.4): a re-run of January to March, then a newer February run priced after it. */
function sequenceC(rule: AcceptRule): { readonly model: RunModel; readonly rerun: number; readonly february: number; readonly before: ReadonlyMap<number, number | null>; readonly outcome: AcceptOutcome } {
  const model = new RunModel(rule);
  model.loadLine(FEBRUARY);
  model.loadLine(FEBRUARY);
  const quarter = model.createFirstRun(0, 2);
  model.price(quarter);
  const rerun = created(model.createRerun(quarter));
  model.price(rerun);
  model.correctMapping();
  model.loadLine(FEBRUARY);
  const february = model.createFirstRun(FEBRUARY, FEBRUARY);
  model.price(february);
  const before = pricingInEffect(model);
  return { model, rerun, february, before, outcome: model.accept(rerun) };
}

/** Sequence B in the reverse order (§1.3): the second re-run, priced after the first under a later release, accepted after it. */
function reverseB(rule: AcceptRule): { readonly model: RunModel; readonly second: number } {
  const model = new RunModel(rule);
  model.loadLine(FEBRUARY);
  const first = model.createFirstRun(FEBRUARY, FEBRUARY);
  model.price(first);
  const r1 = created(model.createRerun(first));
  model.price(r1);
  model.publish();
  const second = created(model.createRerun(first));
  model.price(second);
  expect(model.accept(r1)).toBe('accepted');
  return { model, second };
}

/** Two re-runs created before either is priced, the first then accepted. */
function createdTogether(rule: AcceptRule): { readonly model: RunModel; readonly second: number } {
  const model = new RunModel(rule);
  model.loadLine(FEBRUARY);
  const first = model.createFirstRun(FEBRUARY, FEBRUARY);
  model.price(first);
  const r1 = created(model.createRerun(first));
  const second = created(model.createRerun(first));
  model.price(r1);
  model.price(second);
  expect(model.accept(r1)).toBe('accepted');
  return { model, second };
}

/** The interleaving of §1.6.3: B begins accepting R2, A begins and commits R1, then B checks and commits. */
function interleaved(rule: AcceptRule): { readonly model: RunModel; readonly r2: number; readonly outcome: AcceptOutcome } {
  const model = new RunModel(rule);
  model.loadLine(FEBRUARY);
  const first = model.createFirstRun(FEBRUARY, FEBRUARY);
  model.price(first);
  const r1 = created(model.createRerun(first));
  model.price(r1);
  const r2 = created(model.createRerun(first));
  model.price(r2);
  const b = model.beginAcceptance(r2);
  expect(model.accept(r1)).toBe('accepted');
  return { model, r2, outcome: model.finishAcceptance(b) };
}

/** A February first run that took effect after a January-to-March run, which is then re-run. */
function lateOverlap(rule: AcceptRule): RunModel {
  const model = new RunModel(rule);
  model.loadLine(FEBRUARY);
  const quarter = model.createFirstRun(0, 2);
  model.price(quarter);
  model.loadLine(FEBRUARY);
  model.price(model.createFirstRun(FEBRUARY, FEBRUARY));
  model.price(created(model.createRerun(quarter)));
  return model;
}

/**
 * Payment-engine review F1: a re-run of January to March and a February first run picked up at once. The February
 * run's pricing transaction begins first, the re-run's takes the lock first and completes, a mapping is corrected,
 * then the February run reads.
 */
function pickedUpTogether(orderGuard: boolean): { readonly model: RunModel; readonly rerun: number; readonly february: number } {
  const model = new RunModel(PAID_WHOLE_RULE, { orderGuard });
  model.loadLine(FEBRUARY);
  model.loadLine(FEBRUARY);
  const quarter = model.createFirstRun(0, 2);
  model.price(quarter);
  const rerun = created(model.createRerun(quarter));
  const february = model.createFirstRun(FEBRUARY, FEBRUARY);
  expect([model.startPricing(february), model.startPricing(rerun), model.beginPricing(february), model.beginPricing(rerun)]).toEqual([true, true, true, true]);
  expect(model.readInputs(rerun)).toBe('read');
  expect(model.commitPricing(rerun)).toBe(true);
  model.correctMapping();
  let read = model.readInputs(february);
  while (read === 'restarted') {
    read = model.readInputs(february);
  }
  expect([read, model.commitPricing(february)]).toEqual(['read', true]);
  return { model, rerun, february };
}

/** Payment-engine review F2: the re-run pins the split in force; a later split is approved, and a February run pins it and is priced first. */
function laterSplit(rule: AcceptRule): { readonly model: RunModel; readonly before: ReadonlyMap<number, number | null>; readonly outcome: AcceptOutcome } {
  const model = new RunModel(rule);
  model.loadLine(FEBRUARY);
  const quarter = model.createFirstRun(0, 2);
  model.price(quarter);
  const rerun = created(model.createRerun(quarter));
  model.approveSplit();
  model.price(model.createFirstRun(FEBRUARY, FEBRUARY));
  model.price(rerun);
  const before = pricingInEffect(model);
  return { model, before, outcome: model.accept(rerun) };
}

describe('PRC-27: an execution that keeps its stamp from before the lock, and a rule without the split, fail the property', () => {
  it('without execute.ts’s restart, a run that began first and read last ranks as priced first, and the older re-run is accepted over it (invariant ii)', () => {
    for (const orderGuard of [false, true]) {
      const { model, rerun, february } = pickedUpTogether(orderGuard);
      const [r, x] = [model.run(rerun), model.run(february)];
      if (r === undefined || x === undefined) {
        throw new Error('the runs were not created');
      }
      expect((x.readAt ?? 0) > (r.readAt ?? 0)).toBe(true);
      expect((x.completedAt ?? 0) > (r.completedAt ?? 0)).toBe(orderGuard);
      expect(model.restarts).toBe(orderGuard ? 1 : 0);
      const before = pricingInEffect(model);
      const outcome = model.accept(rerun);
      expect(outcome).toBe(orderGuard ? 'superseded' : 'accepted');
      expect(regressions(model, before).length > 0).toBe(!orderGuard);
    }
  });

  it('a rule that leaves out the split accepts a re-run over a run pinned to a later split and priced first (invariant ii)', () => {
    const unsplit = laterSplit(NO_SPLIT_RULE);
    expect(unsplit.outcome).toBe('accepted');
    expect(regressions(unsplit.model, unsplit.before)).not.toEqual([]);
    const built = laterSplit(PAID_WHOLE_RULE);
    expect(built.outcome).toBe('superseded');
    expect(regressions(built.model, built.before)).toEqual([]);
    expect(lostLines(built.model)).toEqual([]);
  });
});

describe('PRC-25 to PRC-28: each rule the design rejected fails the property, on a named counter-example', () => {
  it('the audit’s rule alone puts older pricing back on February’s lines under overlapping periods (Sequence C, invariant ii)', () => {
    const audit = sequenceC(AUDIT_RULE);
    expect(audit.outcome).toBe('accepted');
    expect(regressions(audit.model, audit.before)).not.toEqual([]);
    const built = sequenceC(PAID_WHOLE_RULE);
    expect(built.outcome).toBe('superseded');
    expect(regressions(built.model, built.before)).toEqual([]);
    expect(lostLines(built.model)).toEqual([]);
  });

  it('the first design’s effect-time rule refuses the second re-run accepted after the first (Sequence B reversed, invariant iv)', () => {
    const first = reverseB(EFFECT_TIME_RULE);
    expect(livenessViolations(first.model)).toEqual([first.second]);
    const built = reverseB(PAID_WHOLE_RULE);
    expect(livenessViolations(built.model)).toEqual([]);
    expect(built.model.accept(built.second)).toBe('accepted');
  });

  it('the review’s completed-after-created form refuses a re-run created before the other was priced (invariant iv)', () => {
    const review = createdTogether(REVIEW_RULE);
    expect(livenessViolations(review.model)).toEqual([review.second]);
    const built = createdTogether(PAID_WHOLE_RULE);
    expect(livenessViolations(built.model)).toEqual([]);
    expect(built.model.accept(built.second)).toBe('accepted');
  });

  it('the rule without the meanwhile guard accepts a re-run that is then not in effect (§1.6.3, invariant iii)', () => {
    const unguarded = interleaved(NO_MEANWHILE_RULE);
    expect(unguarded.outcome).toBe('accepted');
    const run = unguarded.model.run(unguarded.r2);
    expect(run !== undefined && unguarded.model.runInEffect(run)).toBe(false);
    const built = interleaved(PAID_WHOLE_RULE);
    expect(built.outcome).toBe('changed_meanwhile');
    // Made again, in a new transaction, it is accepted and in effect.
    expect(built.model.accept(built.r2)).toBe('accepted');
    const again = built.model.run(built.r2);
    expect(again !== undefined && built.model.runInEffect(again)).toBe(true);
  });

  it('the strict-overlap rule refuses a re-run priced after the run of another period (invariant iv)', () => {
    const strict = lateOverlap(STRICT_OVERLAP_RULE);
    expect(livenessViolations(strict)).toHaveLength(1);
    expect(livenessViolations(lateOverlap(PAID_WHOLE_RULE))).toEqual([]);
  });
});
