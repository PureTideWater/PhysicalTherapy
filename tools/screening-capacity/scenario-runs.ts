/**
 * The capacity test's scenarios and how often each runs (audit #53 part 1; docs/adr/0062, "Capacity under production
 * limits"), with no import of its own, so the uploads (which the web's large tests import) and the report share them.
 *
 * S4, the three worst uploads at once with a small one behind them, runs three times in every capacity run, each run
 * from a cold Postgres and fresh services with the same uploads, and its time is judged on the middle run: the founder's
 * ruling of 2026-10-23 ("Stay free: median of 3"), which keeps GitHub's free 4-CPU runner, whose shared CPUs swing S4's
 * times with the host's speed. Every other scenario runs once.
 */

/** The scenarios a passing run measures, every one of them. */
export const ALL_SCENARIOS = ['S1', 'S2', 'S3', 'S4', 'S5'] as const;
export type ScenarioId = (typeof ALL_SCENARIOS)[number];

/** The scenario every run measures REPETITIONS times, its time judged on the middle run (the founder's ruling of 2026-10-23). */
export const REPEATED_SCENARIO: ScenarioId = 'S4';
export const REPETITIONS = 3;

/** A scenario's name in the report and the log: S4#1 to S4#3 for the repeated scenario's runs, else its id. */
export function scenarioLabel(id: string, repetition: number | null): string {
  return repetition === null ? id : `${id}#${String(repetition)}`;
}

/** The scenarios a passing run measures, in order: S1 to S5 with S4's three runs (S4#1, S4#2, S4#3). */
export const MEASURED_SCENARIOS: readonly string[] = ALL_SCENARIOS.flatMap((id) =>
  id === REPEATED_SCENARIO ? Array.from({ length: REPETITIONS }, (_, at) => scenarioLabel(id, at + 1)) : [id],
);
