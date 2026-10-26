import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { type AcceptOutcome, type AcceptRule, type ModelRun, PAID_WHOLE_RULE, RunModel, livenessViolations, lostLines, pricingInEffect, regressions } from './test-support/rerun-model';

/**
 * The re-run acceptance rule against a model of a practice's runs (combined audit #10; test matrix PRC-25 to PRC-28;
 * docs/adr/0037, amendment of 2026-10-26). Random sequences of loads, corrections and reversals, first runs of one to
 * three months, re-runs, pricing that begins and later commits or fails, acceptances that begin and later commit, and
 * release, withdrawal and mapping changes. After every step: (i) every line some eligible run priced, still priceable,
 * keeps pricing in effect; (ii) no acceptance moves a line's pricing in effect to older pricing; (iii) an accepted
 * re-run is the run in effect for its period; (iv) a re-run freshest by every measure is acceptable. Each rule the
 * design rejected fails one of them, shown on a named counter-example. rerun.db.test.ts ties the model to the SQL.
 */

type Step =
  | { readonly kind: 'load'; readonly month: number }
  | { readonly kind: 'correct' | 'reverse'; readonly pick: number }
  | { readonly kind: 'first'; readonly from: number; readonly months: number }
  | { readonly kind: 'rerun' | 'start' | 'fail' | 'begin_accept' | 'finish_accept' | 'accept'; readonly pick: number }
  | { readonly kind: 'race'; readonly first: number; readonly second: number }
  | { readonly kind: 'commit' | 'publish' | 'withdraw' | 'map' };

const MONTHS = 4;
const pick = fc.nat(1_000);
const step: fc.Arbitrary<Step> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('load' as const), month: fc.nat(MONTHS - 1) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constantFrom('correct' as const, 'reverse' as const), pick }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('first' as const), from: fc.nat(MONTHS - 1), months: fc.integer({ min: 1, max: 3 }) }) },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant('rerun' as const), pick }) },
  { weight: 5, arbitrary: fc.record({ kind: fc.constant('start' as const), pick }) },
  { weight: 5, arbitrary: fc.record({ kind: fc.constant('commit' as const) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('fail' as const), pick }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constantFrom('begin_accept' as const, 'finish_accept' as const), pick }) },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant('accept' as const), pick }) },
  // The interleaving of the design's §1.6.3: one acceptance begins, another begins and commits, then the first checks.
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('race' as const), first: pick, second: pick }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constantFrom('publish' as const, 'withdraw' as const, 'map' as const) }) },
);

const choose = <T>(items: readonly T[], at: number): T | undefined => (items.length === 0 ? undefined : items[at % items.length]);
const completeReruns = (model: RunModel) => model.runs.filter((run) => run.rerunOf !== null && run.status === 'complete');

/** What the sequences reached, so the property is known not to hold vacuously. */
const seen = new Map<string, number>();
const count = (key: string) => seen.set(key, (seen.get(key) ?? 0) + 1);

/** The invariants after every step; (ii) and (iii) after an acceptance that committed. */
function checkStep(model: RunModel, accepted: { readonly run: ModelRun; readonly before: ReadonlyMap<number, number | null> } | null): void {
  expect(lostLines(model), 'every line some eligible run priced keeps pricing in effect').toEqual([]);
  expect(livenessViolations(model), 'a re-run freshest by every measure is acceptable').toEqual([]);
  if (accepted !== null) {
    expect(regressions(model, accepted.before), 'no acceptance moves a line to older pricing').toEqual([]);
    expect(model.runInEffect(accepted.run), 'an accepted re-run is the run in effect for its period').toBe(true);
  }
}

function play(model: RunModel, steps: readonly Step[]): void {
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
      case 'commit': {
        const running = model.runs.find((run) => run.status === 'running');
        if (running !== undefined) {
          model.commitPricing(running.id);
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
      case 'map':
        model.correctMapping();
        break;
    }
    checkStep(model, accepted);
  }
}

describe('PRC-25 to PRC-28: the acceptance rule over random sequences of runs, lines, releases and acceptances', () => {
  it('keeps every priced line in effect, never regresses one, leaves an accepted re-run in effect and accepts a freshest re-run', () => {
    fc.assert(
      fc.property(fc.array(step, { minLength: 20, maxLength: 80 }), (steps) => {
        play(new RunModel(), steps);
      }),
      { numRuns: 3_000 },
    );
    // The sequences reached every outcome the rule can give, so none of the invariants held vacuously.
    for (const outcome of ['accept:accepted', 'accept:superseded', 'accept:newer_run_pending', 'accept:changed_meanwhile', 'rerun:created', 'rerun:not_in_effect', 'rerun:newer_run_pending']) {
      expect(seen.get(outcome) ?? 0, `${outcome} among ${JSON.stringify([...seen])}`).toBeGreaterThan(0);
    }
  });

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
  });
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
