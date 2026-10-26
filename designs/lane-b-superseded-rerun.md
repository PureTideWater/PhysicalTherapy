# Lane B design: an older re-run can no longer be accepted over newer pricing (combined audit #10)

- **Item:** combined audit #10, "Accepting an older re-run can drop newer lines from a month" (`/home/user/ops/audits/combined/combined-report.md`, section 10).
- **Branch:** `co-001/superseded-rerun`, cut from `claude/build-platform` at 6ddd587. Checkout `/home/user/superseded-rerun`. Every `file:line` below was re-read there at 6ddd587 during the revision (review finding 4).
- **Lane rules applied:** no migration, nothing under `packages/db/migrations`; no non-test change under `packages/pricing`; no file of open PR #42 (`/tmp/claude-0/pr42-files.txt`); the founder's standing rule (best option only, never weighted by build effort).
- **Revision:** revised 2026-10-26 after the adversarial review (`/home/user/ops/designs/lane-b-superseded-rerun/review.md`). Every finding is applied; §12 lists each one with its disposition.
- **Short answer:** a re-run is accepted only when nothing in effect for overlapping service dates is newer than it. "Newer" is judged by *when a run was priced* and by its pinned rule release, not by when it took effect. A run is newer if it was priced after the re-run, or is pinned to a later release that has not been withdrawn, or (for the same service dates) holds lines loaded after the re-run's cut-off. Acceptance is also refused while an overlapping first run is being priced, and when a run of overlapping dates took effect while the acceptance was being made. The check runs under the practice's existing `pricing_current` lock, at READ COMMITTED. Only the run in effect for its service dates can be re-run. The run page and the compare page say why, link to the run to use and show the diff against the pricing the acceptance would actually replace. No migration. The database mirror goes to Lane A as a recommendation.

---

## 1. The defect, restated

### 1.1 What the code does today

- **Which run is in effect.**
  - A run is eligible when it is complete and is either a first run or an accepted re-run (`apps/worker/src/price/in-effect.ts:11`).
  - It takes effect at `coalesce(accepted_at, completed_at)` (`in-effect.ts:14`).
  - For an exact `(period_from, period_to)`, the run in effect is the eligible run that took effect last (`in-effect.ts:17-20`).
  - A service line's pricing in effect is its priced line in the in-effect run, of any period, that took effect last (`PRICED_IN_EFFECT`, `in-effect.ts:29-33`).
  - The database keeps the same rule in `pricing_run_in_effect()` (`packages/db/migrations/20261021090000_run_diffs_and_runs_in_effect.sql:48-57`) and `service_line_priced_in_effect()` (`20261103090000_deadline_verification_and_export_attestation.sql:629-636`).
- **What a run prices, and when its inputs are fixed.**
  - A re-run keeps its original's cut-off. The insert copies `coalesce(o.lines_loaded_by, o.created_at)` (`apps/worker/src/price/create.ts:143-149`), the trigger requires it (`20261105090000_pricing_location_and_zip_plus_four.sql:557-559`), and execution prices only the lines loaded by that cut-off (`apps/worker/src/price/execute.ts:258`; `apps/worker/src/price/lines.ts:121-125`).
  - The rule release is pinned when the run is created; `current_rule_release()` is the newest published release not withdrawn (`20261019150000_reruns_and_release_withdrawal.sql:49-53`), and a withdrawal is permanent (`:55-60`).
  - Mappings, contract versions, settings and location are read when the run is **priced**, as the first statements of the pricing transaction, after the practice's execution lock (`execute.ts:253-275`). The same transaction sets `completed_at = now()` (`execute.ts:297`), and `now()` is the transaction's start, so `completed_at` records when the pricing began.
  - Two facts of a line are read live at pricing, whatever the cut-off: a claim that a correction superseded is not priced, and a claim with a reversal now loaded is priced as reversed (`lines.ts:121-129`). So a re-run priced after a correction or reversal arrives can lack a line its original priced, or price it as reversed. These facts only move forward in time, like the other inputs, and the resulting difference is intended: a corrected claim is priced through its correction, and the monitor plans the correction's month (`apps/worker/src/monitor/plan.ts:89`).
- **What acceptance checks.** `acceptRun` (`apps/worker/src/price/rerun.ts:134-166`) locks only the re-run's own row (`rerun.ts:138`). It checks that the run is found, is a re-run, is complete, is not already accepted and is not pinned to a withdrawn release (`rerun.ts:142-156`), then sets `accepted_at = now()` (`rerun.ts:157-160`). It never asks whether the pricing the re-run would replace is older than the re-run. `createRerun` (`rerun.ts:82-106`) accepts any complete run of the practice, including a run that has already been replaced and a re-run nobody accepted.
- **What the monitor plans.** `uncoveredMonths` plans a month only when no queued, running or complete run of the practice holds the whole month with a cut-off at or after the month's newest line (`plan.ts:91-112`). It never asks which run is in effect. So once a monitor run covers a late line, the monitor never plans that month again, even if the line later loses its pricing in effect.

### 1.2 Sequence A: a late line, then acceptance (the audit's first sequence)

| Time | Event | State after |
| --- | --- | --- |
| t1 | First run F of February is created (cut-off t1) and completes | F is in effect for February |
| t2 | Release 6 is published. A person re-runs F, which creates R (cut-off t1, release 6) | R completes, awaiting acceptance |
| t3 | A late February line L loads (created_at t3) | No run covers L |
| t4 | The monitor plans February (L is newer than every cut-off) and creates first run X (cut-off t4, release 6), which completes | X took effect after F, so X is in effect for February. L is priced by X |
| t5 | The person opens R's page and accepts it (accepted_at t5) | R took effect last, so R is in effect for February. L is priced only in X, which is not in effect, so **L has no pricing in effect** |
| later | The monitor runs again | X holds February with cut-off t4 ≥ t3 (`plan.ts:103-107`), so nothing is planned. L stays lost |

L is gone from Coverage, triage, Claims and lines, and the audit report. They all read the run in effect (`in-effect.ts:5-6`). Its dispute window keeps running.

### 1.3 Sequence B: two re-runs accepted out of order (the audit's second sequence)

| Time | Event | State after |
| --- | --- | --- |
| t1 | First run F of February completes under release 5 | F in effect |
| t2 | Re-run R1 of F is created under release 5 (for example after a mapping correction) and completes | awaiting |
| t3 | Release 6 is published. Re-run R2 of F is created under release 6 and completes | awaiting |
| t4 | R2 is accepted | R2 in effect (release 6) |
| t5 | R1 is accepted | R1 took effect last, so **February is back on release 5** and the mapping state as of t2 |

No line is lost here, because R1 and R2 have the same cut-off. But every line regresses to older pricing.

The reverse order must stay allowed: R1 accepted at t4, then R2 at t5. R2 was priced after R1 under a later release, with the same cut-off, so accepting it improves every line (review finding 1).

### 1.4 Sequence C: overlapping periods (found while testing the audit's rule)

A person may price a multi-month period (the create form takes `fromMonth` and `toMonth`, `apps/web/src/lib/routes/pricing.ts:57-70,300-345`), while the monitor prices single months (`plan.ts:17-22`). `RUN_IN_EFFECT` compares exact periods (`in-effect.ts:19`), so runs of different periods are each in effect for their own period. Per line, `PRICED_IN_EFFECT` takes the one that took effect last (`in-effect.ts:33`).

| Time | Event | State after |
| --- | --- | --- |
| t1 | First run Q of January to March completes under release 5 | Q in effect for Jan–Mar |
| t2 | Re-run R of Q is created under release 5 and completes | awaiting |
| t3 | A mapping is corrected. A late February line L loads. The monitor's first run X of February completes, priced with the corrected mapping | X in effect for February. February lines read X (it took effect after Q) |
| t4 | R is accepted (the audit's rule passes, because Q is still the run in effect for Jan–Mar) | R took effect last, so every February line R priced reads R again, **with the mapping as it stood before the correction** |

L itself is not lost: X stays in effect for February, its own period, and R has no line for L. But every February line common to R and X regresses to the older state. Apart from the live facts of §1.1, a line common to both runs differs only by the state each run was priced under. So the damage under overlap is a regression, and it happens only when X was priced after R, or under a later release.

The opposite case must stay allowed. If X was priced before R, R read every input at least as new as X's. Accepting R improves the common lines, and X keeps L.

### 1.5 Sequence D: a re-run of a re-run nobody accepted

`createRerun` lets a person re-run any complete run (`rerun.ts:91-93`), so R2 can be created as a re-run of R1, which is unaccepted. R2 copies R1's cut-off, which is F's (`create.ts:146`). R1 was never in effect. Two things go wrong:

- (i) R2's diff on its page is against R1 (`routes/pricing.ts:146,155-157`), not against F, the pricing it would actually replace. So the person reads the wrong diff before accepting.
- (ii) Any rule keyed on "the original was in effect" is meaningless for R2. Walking the chain to the eligible ancestor F would fix (ii) but not (i).

### 1.6 Sequence E: races

1. **Two acceptances at once.** R1 and R2 of F are accepted concurrently. Each `acceptRun` locks only its own row (`rerun.ts:138`). Each reads the other as unaccepted, so a check of either kind passes in both, and both commit. The later `accepted_at` wins: Sequence B without anyone choosing it.
2. **A run completing during an acceptance.** The pricing transaction's completion sets `completed_at = now()` (`execute.ts:297`), which the trigger requires (`20261105090000_...sql:601`). `now()` is the transaction's start, and the pricing transaction starts before it takes the practice's execution lock (`execute.ts:251-253`) and before it prices every batch. So `completed_at` can be minutes before the commit. An acceptance whose transaction starts after X's pricing transaction began, but checks while X is still running, sees X as `running` (not eligible) and passes. It commits with `accepted_at` later than X's eventual `completed_at`. X then commits, and R ranks after X. That is Sequence A again, with no human in the wrong order.
3. **An acceptance whose `now()` is older than a rival's commit.** `accepted_at` must equal the transaction's `now()` (`20261105090000_...sql:583`). An acceptance whose transaction began *before* a rival acceptance began, and that waits for the rival to commit, would stamp an `accepted_at` earlier than the rival's. If it is then accepted, it ranks *before* the rival and is not in effect, although the person was just told it was accepted. This race appears only once acceptance is allowed over an accepted rival (§1.3, reverse order), so the rule must handle it (§2.1, condition 4).

### 1.7 Why it matters

Lost lines are lost findings, invisible, while their windows run (audit #10, "Why it matters"). A regression to an older release or mapping puts wrong expected amounts back in front of triage and packets. CLAUDE.md rule 3 says every expected amount traces to a signed-off rate record and a numbered release. A silent regression keeps that trace, but to the wrong release.

---

## 2. The rule

### 2.1 Definitions

Let **R** be the re-run being accepted and **O** = `R.rerun_of_id` its original. Let `since(x)` = `coalesce(x.accepted_at, x.completed_at)` (`IN_EFFECT_SINCE`), the moment a run took effect. Runs **overlap** when they belong to the same practice and their periods share a service date.

**Run X's pricing is newer than R's** when either holds:

- X was priced no earlier than R: `X.completed_at >= R.completed_at`. Both pricing transactions take the practice's execution lock before they read anything (`execute.ts:253-275`), so this is the order in which they read mappings, contract versions, settings, location and the live line facts. A tie counts as newer, to stay on the safe side.
- X is pinned to a later rule release that has not been withdrawn: `X.release_no > R.release_no AND NOT withdrawn(X.release_no)`. A withdrawn release is never newer in intent: after a content rollback, a re-run under the reinstated release is the one wanted (`rerun.db.test.ts:351-408`).

**R is superseded** when either holds:

1. **O is not eligible.** O is an unaccepted re-run (Sequence D) or not complete. R's diff is then not against any pricing in effect.
2. **Some run X in effect after O is newer than R, or holds lines R lacks.** X is eligible, X ≠ O, X overlaps R, and X took effect after O (`(since(X), X.id) > (since(O), O.id)`). In addition, either:
   - X's pricing is newer than R's (Sequences A, B, C); or
   - X has R's exact period and a later cut-off than R's (`coalesce(X.lines_loaded_by, X.created_at) > coalesce(R.lines_loaded_by, R.created_at)`). X then holds lines loaded after R's cut-off, which R lacks (Sequence A, even when X was priced before R).

**A newer run is being priced for R** when some first run (`rerun_of_id IS NULL`) of an overlapping period is `running`. Its pricing may have begun before the acceptance did. Once it completes, it will be newer than R, so R would be superseded. If it fails, R is acceptable again.

A **queued** first run does not stop an acceptance. If the acceptance's check, made under the lock, sees it queued, its status change to `running` commits after that check, and its pricing transaction begins after that. So its `completed_at` is later than the acceptance's `now()`. It ranks after R, and it was priced after R, with every line by its own cut-off. Its completion then takes effect over R, which is right.

**A run took effect meanwhile** when some eligible run X ≠ R overlapping R has `since(X) >= now()`, the acceptance transaction's own start. X committed while the acceptance waited for the lock, from a transaction that began later. Accepting R now would stamp an `accepted_at` that ranks *before* X (§1.6.3). The acceptance is refused, and the person looks again. A new attempt starts a new transaction, and its `now()` is later than X's. X is then judged under condition 2 like any other run.

**R can be accepted** when it is complete, unaccepted and not pinned to a withdrawn release (unchanged), and, read under the lock:

- R is not superseded (`superseded`);
- no newer run is being priced for it (`newer_run_pending`);
- no run took effect meanwhile (`changed_meanwhile`).

Once accepted, R is the run in effect for its period at its commit. Every eligible run of its period took effect before R's `now()`, by the last condition. So R holds the lines and the newest pricing of every run it replaces, and of every run of another period that wins any line R shares.

**A run T may be re-run** when `RUN_IN_EFFECT(T)` holds (`not_in_effect` otherwise) and no first run of a period overlapping T's is `queued` or `running` (`newer_run_pending` otherwise). Re-running the run in effect keeps the re-run's diff honest: its diff is against the pricing it replaces (§1.5 (i)). Refusing while a first run is queued or running avoids a re-run that would be superseded as soon as that run completes. It also closes, for first runs, the residual window of §4.3.

### 2.2 SQL, over the existing fragments (added to `apps/worker/src/price/in-effect.ts`)

```ts
/** Two runs of one practice whose periods share a service date. */
const OVERLAPS = (a: string, b: string) => `(${a}.practice_id = ${b}.practice_id AND ${a}.period_from <= ${b}.period_to AND ${a}.period_to >= ${b}.period_from)`;
const SAME_PERIOD = (a: string, b: string) => `(${a}.period_from = ${b}.period_from AND ${a}.period_to = ${b}.period_to)`;
const CUT_OFF = (a: string) => `coalesce(${a}.lines_loaded_by, ${a}.created_at)`;

/**
 * Run `x` was priced no earlier than complete run `r` (both read their inputs under the practice's execution
 * lock, in the order of their completed_at), or is pinned to a later rule release that is not withdrawn.
 */
const NEWER_PRICING = (x: string, r: string) => `(${x}.completed_at >= ${r}.completed_at
    OR (${x}.release_no > ${r}.release_no AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = ${x}.release_no)))`;

/**
 * Run `x` makes re-run `rr` (of original `o`) stale: eligible, neither of them, overlapping, in effect after the
 * original, and either newer in pricing than the re-run or, for the same period, holding lines loaded after its cut-off.
 */
export const SUPERSEDES_RERUN = (x: string, rr: string, o: string) => `(${x}.id <> ${o}.id AND ${x}.id <> ${rr}.id AND ${OVERLAPS(x, rr)} AND ${ELIGIBLE_RUN(x)}
    AND (${IN_EFFECT_SINCE(x)}, ${x}.id) > (${IN_EFFECT_SINCE(o)}, ${o}.id)
    AND (${NEWER_PRICING(x, rr)} OR (${SAME_PERIOD(x, rr)} AND ${CUT_OFF(x)} > ${CUT_OFF(rr)})))`;

/** Re-run `rr` can no longer be accepted: its original is not eligible, or some run supersedes it. */
export const RERUN_SUPERSEDED = (rr: string) => `EXISTS (
    SELECT 1 FROM pricing_run o
     WHERE o.id = ${rr}.rerun_of_id AND o.practice_id = ${rr}.practice_id
       AND (NOT ${ELIGIBLE_RUN('o')}
            OR EXISTS (SELECT 1 FROM pricing_run x WHERE x.practice_id = ${rr}.practice_id AND ${SUPERSEDES_RERUN('x', rr, 'o')})))`;

/** A first run of a period overlapping run `r`'s is being priced: its pricing may have begun before an acceptance of `r`. */
export const NEWER_RUN_RUNNING = (r: string) => `EXISTS (
    SELECT 1 FROM pricing_run x
     WHERE x.practice_id = ${r}.practice_id AND x.id <> ${r}.id AND x.rerun_of_id IS NULL AND x.status = 'running' AND ${OVERLAPS('x', r)})`;

/** A first run of a period overlapping run `r`'s is queued or being priced: a re-run of `r` waits for it. */
export const NEWER_RUN_PENDING = (r: string) => `EXISTS (
    SELECT 1 FROM pricing_run x
     WHERE x.practice_id = ${r}.practice_id AND x.id <> ${r}.id AND x.rerun_of_id IS NULL AND x.status IN ('queued', 'running') AND ${OVERLAPS('x', r)})`;

/** An eligible run overlapping re-run `rr` took effect at or after this transaction began: accepting now would rank before it. */
export const TOOK_EFFECT_MEANWHILE = (rr: string) => `EXISTS (
    SELECT 1 FROM pricing_run x
     WHERE x.practice_id = ${rr}.practice_id AND x.id <> ${rr}.id AND ${ELIGIBLE_RUN('x')} AND ${OVERLAPS('x', rr)} AND ${IN_EFFECT_SINCE('x')} >= now())`;
```

Notes:

- `NEWER_PRICING` compares `completed_at`, which is set for every eligible run and for R, because R is complete before any of these checks.
- The tuple ordering `(since, id)` is the one `RUN_IN_EFFECT` and `PRICED_IN_EFFECT` already use (`in-effect.ts:20,33`), so the check agrees with what the reads will show.
- When no run of another period overlaps, `RERUN_SUPERSEDED` is never weaker than "a run of R's period in effect after O holds newer pricing or more lines", and is `false` whenever O is the run in effect and nothing of another period is newer. The parity test of §6.2 checks it against `RUN_IN_EFFECT` and the database's `pricing_run_in_effect()`.
- `TOOK_EFFECT_MEANWHILE` reads `now()`, so it is meaningful only inside the accepting transaction. The pages never show it.

### 2.3 Alternatives considered

| Option | Why not |
| --- | --- |
| The audit's rule alone: refuse when O is not in effect for its exact period | Closes A, B and D, but lets Sequence C through: common lines regress under overlapping periods, which the diff on R's page never shows. It also refuses the reverse order of Sequence B, where accepting improves every line |
| The first design: newness judged by when a run took effect (`since(X) > greatest(since(O), R.created_at)`, and "O not in effect" refused outright) | Treats the moment a person clicks Accept as the age of the pricing. Accepting one of two re-runs refuses the other even when the other was priced later, and then tells the person something false (review finding 1) |
| The review's form: newness judged by `X.completed_at > R.created_at` | Correct, but it refuses a valid acceptance when R was created before X was priced and priced after it (both queued together). Comparing the two pricing stamps, plus the pinned release, is exact under the same lock argument, and accepts strictly more valid acceptances at the same safety. It also needs the "took effect meanwhile" guard (§1.6.3), which the review did not name |
| Strict overlap: refuse when any overlapping eligible run other than O took effect after O | Over-refuses. A person's multi-month run is re-runnable only until the monitor prices one late line in any of its months, and then never again |
| Compare cut-offs only | Fails Sequence B: R1 and R2 of one original share a cut-off |
| Walk `rerun_of_id` to the eligible ancestor and test that | Makes R2 of an unaccepted R1 acceptable while its diff is against R1, not against the pricing it replaces (§1.5 (i)). Refusing such chains, and no longer creating them, is honest |
| Let acceptance through and change the reads (for example, `PRICED_IN_EFFECT` falls back to an older run for a line the newest run lacks) | Changes what "in effect" means across triage, reports, Coverage, Claims and lines, and the database's own functions, which only a migration could keep in step. It would still not fix Sequence B or C |
| Accept, then automatically queue a fresh first run of the period | Hides the problem behind a second run nobody asked for, with no diff before it takes effect. Wrong under J17 |
| Refuse while a first run is queued, as well as running | Adds no safety (§2.1), and a run stuck in `queued` would block acceptance indefinitely (review finding 8). Kept for re-run creation, where it avoids a wasted re-run |
| Refuse re-run creation while any overlapping run, re-runs included, is running | Would close the last theoretical window of §4.3 for re-runs too. But it refuses a person's second re-run for as long as the first is being priced, for example on the release note, to close a window of under a millisecond. Not taken; recorded in the ADR |
| Judge "newer" by whether anything changed between the two pricings (mappings, versions, settings, location) | Would refuse less, but settings and location carry no change stamps that the code reads today. A wrong "nothing changed" would let a regression through. The pricing stamp is exact and conservative |

### 2.4 The rule judged against the standing rule's criteria

- **Accuracy:** no line loses its pricing in effect through acceptance, and no line regresses through acceptance to older pricing. An accepted re-run is always the run in effect for its period when its acceptance commits.
- **User experience:** a re-run priced after the pricing it would replace is accepted, whichever acceptance came first. Every refusal names the run to use instead (§3.5, §8), and says plainly when there is nothing left to accept (review finding 2). The page shows the diff against the pricing the acceptance would replace.
- **Dispute success:** findings stay visible while their windows run.
- **Reliability:** a run stuck in `queued` no longer blocks acceptance. A run stuck in `running` does, and the refusal names it (§10.1).
- **Cost to serve:** a few indexed `EXISTS` lookups over the practice's runs, per acceptance and per run listed.
- **Maintainability:** one fragment family in `in-effect.ts`, next to the rule it refines, shared by the service and the pages.

---

## 3. Where it lives

### 3.1 `apps/worker/src/price/in-effect.ts`

- Add `SUPERSEDES_RERUN`, `RERUN_SUPERSEDED`, `NEWER_RUN_RUNNING`, `NEWER_RUN_PENDING` and `TOOK_EFFECT_MEANWHILE` (§2.2). `OVERLAPS`, `SAME_PERIOD`, `CUT_OFF` and `NEWER_PRICING` stay private.
- Extend the header comment (`in-effect.ts:1-8`) with one paragraph: a re-run is accepted only while nothing in effect for overlapping dates is newer than it, judged by when runs were priced (docs/adr/0037, amendment of 2026-10-26).
- Export the five from `apps/worker/src/price/public.ts`, next to the existing re-exports (`public.ts:58-61`). `apps/web/src/lib/pricing/queries.ts:4,23` already imports `ELIGIBLE_RUN`, `IN_EFFECT_SINCE` and `RUN_IN_EFFECT` from `@tp/worker/pricing`.

### 3.2 `apps/worker/src/price/rerun.ts`

**`RerunRefusedError` (`rerun.ts:45-55`).** The `reason` union gains `'superseded' | 'newer_run_pending' | 'not_in_effect' | 'changed_meanwhile'`. Messages are shown to the person through `refusal()` (`routes/pricing.ts:227-229`) after the form's label (§3.5), so they follow §8.

**A new exported function, the one source for the service and the pages:**

```ts
export type RerunBlock =
  | { readonly state: 'acceptable'; readonly replacesId: string }
  | { readonly state: 'superseded'; readonly originalEligible: boolean; readonly samePeriodIds: readonly string[]; readonly otherPeriodIds: readonly string[]; readonly inEffectId: string | null }
  | { readonly state: 'newer_run_pending'; readonly runningIds: readonly string[] };

/** Whether a complete, unaccepted re-run can be accepted now, with the runs to name; read in the caller's scope. */
export async function rerunBlock(client: ScopeClient, practiceId: string, rerunId: string): Promise<RerunBlock>
```

- `replacesId` is the run in effect for R's exact period: O, or a run of the same period that took effect after O but is not newer than R. It is what the acceptance replaces, and what the page diffs against (§3.3).
- `samePeriodIds` and `otherPeriodIds` are the superseding runs of condition 2, split by period. `inEffectId` is the run in effect for R's exact period, which the page offers to re-run.
- `originalEligible: false` is condition 1 (a legacy chain).
- `runningIds` are the overlapping first runs being priced.
- It runs one query. Superseded wins over pending, because the remedy for superseded is the one that lasts.

**`acceptRun` (`rerun.ts:134-166`), in this order:**

1. Refuse unless `current_setting('transaction_isolation') = 'read committed'`. The error is a plain `Error` (a programming fault, not a person's refusal), with the same reason `pricing_current_read_lock()` gives (`20261103090000_...sql:752-756`): an earlier snapshot would read past a change made since (review finding 7).
2. `SELECT pg_advisory_xact_lock(hashtextextended('pricing_current:' || $1::uuid::text, 0))` with the practice, in a statement of its own (§4.1). The `::uuid::text` cast gives the canonical lower-case form, the same text the trigger hashes from `NEW.practice_id::text` (`20261103090000_...sql:767`).
3. The existing `SELECT ... FOR UPDATE` of the re-run row (`rerun.ts:135-140`), unchanged. It runs after the lock, so it takes a fresh snapshot.
4. The existing refusals, unchanged and in the same order (`rerun.ts:142-156`): `not_found`, `not_rerun`, `not_complete`, then already accepted (idempotent return), then `release_withdrawn`. Withdrawn stays ahead of superseded, because its remedy is the more basic one, and `rerun.db.test.ts:389` asserts it.
5. **New:** `rerunBlock(...)`. `superseded` throws `RerunRefusedError('superseded', ...)`, with the message for its kind (§8.2). `newer_run_pending` throws `RerunRefusedError('newer_run_pending', ...)`.
6. **New:** `TOOK_EFFECT_MEANWHILE('r')` for the re-run. True throws `RerunRefusedError('changed_meanwhile', ...)`.
7. The existing `UPDATE ... accepted_at = now()` (`rerun.ts:157-160`).

The doc comment (`rerun.ts:129-133`) and the module header (`rerun.ts:19-21`) say what is refused and why.

**`createRerun` (`rerun.ts:82-106`).**

- After the `not_complete` check (`rerun.ts:91-93`), read `RUN_IN_EFFECT('r')` and `NEWER_RUN_PENDING('r')` for the run asked, in one statement.
- Not in effect throws `RerunRefusedError('not_in_effect', ...)`. This covers a run replaced by a later run or an accepted re-run, and a re-run nobody accepted.
- A first run queued or running throws `RerunRefusedError('newer_run_pending', ...)`.
- These go before the release check (`rerun.ts:94-97`), so the person is not told to reload for a release when the run itself cannot be re-run.
- No lock is needed. A re-run created alongside a completion is judged at acceptance, under the lock.
- The doc comment (`rerun.ts:76-81`) and the module header (`rerun.ts:15-18`) are updated: "a re-run prices again the run in effect for its period".

> PRD 9 step 4 says "a re-run of any earlier run under the new release" (`docs/product/PRD.md:408`). This design reads "earlier run" as the practice's runs in effect that are pinned to an earlier release: the ones the release note lists (`apps/web/src/lib/routes/releases.ts:54`, `runsInEffect`). A run already replaced is priced again by re-running the run that replaced it, whose diff is against the pricing a person would actually replace. The refusal names that run. This reading is reported in the PR description. It is a product reading, not a cost or security trade-off, so it is decided here.

### 3.3 `apps/web/src/lib/routes/pricing.ts`

- **`refusal()` (`routes/pricing.ts:220-233`):** unchanged in shape. `RerunRefusedError` already maps to the `runId` field with its message, so the four new reasons need no new branch.
- **`PricingRunPageData` gains three fields:**
  - `acceptance: RerunAcceptanceView | null`, for a complete, unaccepted re-run that is not pinned to a withdrawn release. Its shape is `{ state: 'acceptable'; replaces: RunSummary } | { state: 'superseded'; kind: 'same_period' | 'other_period' | 'original_not_in_effect'; superseding: RunSummary[]; inEffect: RunSummary | null; original: RunSummary } | { state: 'newer_run_pending'; running: RunSummary[] }`. It is built from `rerunBlock` and `runSummary` (`apps/web/src/lib/pricing/queries.ts:152-155`).
  - `periodInEffect: RunSummary | null`: the run in effect for this run's exact period, when this run is complete and is not it. That is the run the page offers to re-run instead.
  - `rerunPending: RunSummary[]`: the first runs of overlapping periods that are queued or running, read with `NEWER_RUN_PENDING`'s condition, for a complete run in effect. The page names them in place of the Re-run form.
- **The diff base.** Today the re-run's diff is against `rerunOfId` (`routes/pricing.ts:146,155-157`). For an acceptable re-run whose `replaces` is not its original, the diff is against `replaces`, the pricing its acceptance would replace. `compareRuns` already compares any two complete runs, so `diff.ts` does not change. For any other re-run, the diff stays against the original.
- **`comparePricingRunsPage` (`routes/pricing.ts:186-214`):** `canAccept` (`routes/pricing.ts:210`) becomes true only when `after` is acceptable (`acceptance.state === 'acceptable'`) and `before.id` is `acceptance.replaces.id`. When `after` is acceptable but `before` is not what it replaces, the page shows a link to the right comparison instead. `RunComparisonPageData` (`routes/pricing.ts:168-175`) gains `acceptance: RerunAcceptanceView | null`, filled when `after` is a complete, unaccepted re-run that is not withdrawn and `before` is its original or the run its acceptance would replace.
- **Doc comments.** The screen comment (`routes/pricing.ts:50-54`) and the accept action's comment say that a re-run is accepted only while nothing in effect for overlapping dates is newer.

### 3.4 `apps/web/src/lib/pricing/queries.ts`

- `RunSummary` (`queries.ts:36-63`) gains `acceptance: 'awaiting' | 'superseded' | 'newer_run_pending' | null`. It is null unless the run is a complete, unaccepted re-run. It is computed in the shared run columns (`RUN_COLUMNS`, `queries.ts:87-89`) as:

  ```sql
  CASE WHEN r.rerun_of_id IS NULL OR r.status <> 'complete' OR r.accepted_at IS NOT NULL THEN NULL
       WHEN ${RERUN_SUPERSEDED('r')} THEN 'superseded'
       WHEN ${NEWER_RUN_RUNNING('r')} THEN 'newer_run_pending'
       ELSE 'awaiting' END AS acceptance
  ```

  Every list then shows it: the run list, a run's re-runs (`rerunsOf`, `queries.ts:163-166`), the compare heads and the release note.
- A new `rerunAcceptance(scope, practiceId, run, requestId)` turns `rerunBlock` into `RunSummary`s for the links.
- A new `periodRunInEffect(scope, practiceId, periodFrom, periodTo, requestId)` reads `RUN_IN_EFFECT` for one exact period.
- Both read runs through `readRuns` (`queries.ts:141-148`), so every run they return is an audited read (`readWithAudit`, purpose `pricing_runs`), like the module's other reads (`queries.ts:7-10`). The first design said run summaries were not audited reads. That was wrong, and it is corrected here.

### 3.5 The pages and the form

**`apps/web/src/components/action-form.tsx` (not a #42 file).** Add an opt-in prop `refreshOnError?: boolean`. When it is set and a refusal arrives, the form calls `router.refresh()` (`next/navigation`, as `components/packets/export-status.tsx:21-27` does). The page is read again:

- If the form is still rendered, it keeps its state and its error.
- If the page now renders an explanation in the form's place, that explanation is an `Alert`. `Alert` has `role="alert"` by default (`packages/ui/src/components/alert.tsx:18`), so it is announced when it appears.

Nothing changes for forms that do not set the prop.

**`apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx`**

- **The Accept form (`page.tsx:98-104`)** gets `labels={{ runId: 'This re-run' }}` and `refreshOnError`. A refusal then reads "This re-run: ..." (§8.2) instead of the parameter name `runId` (review finding 3).
- **The Re-run card's action area (`page.tsx:94-107`):**
  - `acceptable`, with `replaces` the original: the Accept form, as now.
  - `acceptable`, with `replaces` another run: the Accept form, and above the diff a line naming the run it replaces (§8.2). The card's description still names the run it prices again.
  - `superseded`, `same_period`: an `Alert` (not destructive; `data-state="rerun-superseded"`) with the condition-2 same-period wording and a link to the run in effect.
    - If that run's `rerun` reasons are empty, the wording says it already prices these lines under what is in force now, and there is nothing more to accept. No re-run button (review finding 2).
    - Otherwise the wording says to re-run it, followed by its Re-run form for a person who may re-run (`canRerun`), unless a first run is pending for it.
  - `superseded`, `other_period`: the other-period wording, a link to each superseding run, and the Re-run form for the original. Re-running the original again is always useful here: the new re-run is priced after the superseding runs, so it can be accepted and carries R's changes for every line.
  - `superseded`, `original_not_in_effect`: the legacy-chain wording, with a link to the run in effect for these service dates and its Re-run form.
  - `newer_run_pending`: the pending wording and a link to each running run. No Accept form.
  - A person without `mapping.edit` sees the same explanations, without forms. The "A billing manager or firm principal accepts a re-run" line (`page.tsx:105-106`) shows only while the re-run is acceptable.
- **The Run card's re-run offer (`page.tsx:132-147`).** The "rerun-offered" paragraph and the Re-run form show only when `run.inEffect` is true and no first run is pending for it. Otherwise, for a complete run, one line says "Only the run in effect for these service dates is priced again:" with a link to `periodInEffect`, or names the pending run. This replaces a button that would now be refused. The Re-run form gets `labels={{ runId: 'This run', releaseNo: 'Rule release' }}` and `refreshOnError`.
- **The withdrawal alert (`page.tsx:56-64`).** "; re-run it to price it under the release in force" shows only when `run.inEffect`. For a run that is not in effect, it reads "; re-run the run in effect for these service dates to price them under the release in force", with the link.
- **The re-runs list (`page.tsx:148-169`).** Each item's state text "awaiting acceptance" becomes "can no longer be accepted" for `acceptance === 'superseded'`, and "waiting for a newer run to finish" for `newer_run_pending`.
- **The page comment (`page.tsx:22-30`)** says a re-run is accepted only while nothing in effect is newer.

**`apps/web/src/app/p/[practiceId]/pricing-runs/compare/page.tsx`**

- When `canAccept` is true, the Accept card (`compare/page.tsx:103-117`) is as now, with `labels={{ runId: 'This re-run' }}` and `refreshOnError` on its form.
- When `acceptance` is `superseded` or `newer_run_pending`, a card titled "This re-run can no longer be accepted" (or "Wait for the newer run") takes the Accept card's place, with the same wording and links as the run page.
- When `acceptance` is `acceptable` but `before` is not what the re-run replaces, a card titled "Compare with the run in effect" links to the comparison with that run, where Accept is offered.
- The page comment (`compare/page.tsx:45-51`) is updated.

**`apps/web/src/components/pricing/display.tsx` (`RunStateBadges`, `display.tsx:52-78`; not a #42 file)**

`run.rerunOfId !== null && run.acceptedAt === null` (`display.tsx:62`) splits three ways:

- `acceptance === 'superseded'`: badge "Can no longer be accepted" (`variant="secondary"`, `data-state="rerun-superseded"`).
- `newer_run_pending`: "Re-run waiting for a newer run" (`data-state="rerun-waiting"`).
- Otherwise: "Re-run awaiting acceptance", as now.

The existing `data-state="superseded"` on "Not in effect" (`display.tsx:67`) is kept, so nothing that selects it breaks. The new values have new names.

**The release note (`apps/web/src/lib/routes/releases.ts`, `apps/web/src/app/p/[practiceId]/releases/page.tsx:91-104`; neither is a #42 file).** It lists only runs in effect (`releases.ts:54`), so its re-run button stays right. Two changes:

- While a first run is pending for a listed run, the button is replaced by the pending line. The route reads `NEWER_RUN_PENDING` for each listed run.
- Its Re-run form gets the same `labels` and `refreshOnError`.

### 3.6 Not touched

- `packages/pricing` (engine freeze).
- `packages/db/**`.
- `apps/web/src/lib/http/next.ts`. Its generic "Check the fields marked below." (`next.ts:161-162`) is wrong for a form whose only field is hidden. But changing it touches every form, so it is a proposal (§10.2).
- `apps/web/src/components/help.ts` (a #42 file). Its `pricing_runs` text (`help.ts:16`) does not describe acceptance, so it needs no change and no proposal.
- `apps/worker/src/monitor/plan.ts` (§5.3).
- `diff.ts` and `impact.ts`. The diff is right once chains are no longer created (§1.5), and once the page picks the right base (§3.3).

---

## 4. Concurrency

### 4.1 The lock: the practice's `pricing_current` key, taken first, at READ COMMITTED

The database already takes `pg_advisory_xact_lock(hashtextextended('pricing_current:' || practice_id, 0))` **exclusively** whenever a pricing run is accepted or completes. That is the BEFORE UPDATE trigger `pricing_run_pricing_current_lock` (`20261103090000_...sql:772-775`) running `pricing_current_change_lock()` (`:764-771`). Packet approvals and exports take the same key shared, so they serialize against pricing changes (`:744-756`, ADR 0061). Acceptance today takes it only at its UPDATE, after its reads.

`acceptRun` takes the same key itself, in a statement of its own, before its checks (§3.2 step 2). The trigger later takes it again in the same transaction, re-entrantly.

At READ COMMITTED, each statement after the lock takes a fresh snapshot, which sees every acceptance and completion that committed before the lock was granted. `acceptRun` now enforces that level itself (§3.2 step 1). It is exported from `@tp/worker/pricing` (`apps/worker/src/price/public.ts:60`) and called directly by tests and helpers in eleven files besides the route (for example `apps/web/e2e/unattested.ts:83`). The web routes never run a mutation under one snapshot (`apps/web/src/lib/http/invoke.ts:464-466`), but nothing stopped a caller from doing so until now.

Why this key and not `execute.ts`'s `pricing_run:<practice>` (`execute.ts:253`):

- The execution key is held for the whole pricing transaction: every batch of a run, up to two minutes for 100,000 lines (PRC-20). A person's Accept request would wait behind it.
- The `pricing_current` key is held by a completion only from its completion UPDATE (`execute.ts:297`) to commit, a moment.
- It already means "a write that changes which pricing is in effect", and acceptance is exactly that.
- Taking it a few statements earlier than the trigger does delays a packet approval's shared lock by the time of a few indexed SELECTs.

**Deadlock analysis.**

- Acceptance takes the advisory lock, then R's row lock.
- A completing pricing transaction holds X's row lock (`execute.ts:254`), then takes the advisory lock (the trigger, at `execute.ts:297`).
- They would cycle only if acceptance needed X's row or the completion needed R's. Neither does. Acceptance reads X without locking it. R is complete, so no execution locks it beyond the instant `lockRun` takes to return `already_finished` (`execute.ts:235-236`).
- Two acceptances take the advisory lock first and their own rows second. No cycle.
- Mapping corrections, version updates and withdrawals take `pricing_current` keys exclusively and lock no `pricing_run` row (`20261103090000_...sql:777-786`). Packet steps take them shared and lock no `pricing_run` row.
- `pricing-race.db.test.ts` holds `acceptRun`'s transaction open while packet steps wait on the shared side (`apps/worker/src/packets/pricing-race.db.test.ts:84-90`). The exclusive lock is the same lock, now taken slightly earlier, so that test's expectations hold unchanged.
- **Rolling deploy (review finding 11).** Today's `acceptRun` takes R's row lock (`rerun.ts:138`) and then, at its UPDATE, the `pricing_current` lock. The new code takes them in the other order. While old and new web tasks serve together, two acceptances of the **same** re-run, one on each version, can deadlock. Postgres aborts one with 40P01, and that person sees a server error. No data is wrong, and a resubmit succeeds or returns "already accepted". The PR description says so. No code change.

### 4.2 What it closes

- **Two acceptances (§1.6.1, §1.6.3).** The second waits for the first to commit, then reads the first re-run eligible. The checks run in the order superseded, pending, meanwhile.
  - If the first re-run is newer in pricing than the second, the second is refused `superseded`, whatever the timestamps.
  - Otherwise, if the second acceptance's transaction began after the first's, the first re-run's `since` is earlier than its `now()`. It is accepted and ranks after the first.
  - Otherwise (it began before the first's), the first re-run's `since` is at or after its `now()`. It is refused `changed_meanwhile`, and a new attempt, in a new transaction, is accepted.
  - Either way, the period ends on the re-run priced last, whichever acceptance commits first. Neither acceptance can leave an accepted re-run that is not in effect.
- **A completion during an acceptance (§1.6.2)**, by the running check and the meanwhile guard, not by trusting timestamps:
  - X's status `running` is committed in a transaction of its own (`execute.ts:230-246`) that finishes before the pricing transaction begins (`execute.ts:251`). So whenever X's pricing transaction has started, and with it the `now()` that becomes `completed_at`, an acceptance's check reads X as `running`, or as `complete` once it has committed. If running, the acceptance is refused `newer_run_pending`. If complete, X is newer in pricing than R, because R completed before. So R is refused `superseded`, or `changed_meanwhile` if X's `completed_at` is at or after the acceptance's `now()`.
  - If X is still queued at the check, X's status change to `running` commits after the check, so X's pricing transaction begins after the acceptance's own transaction began. X's `completed_at` is later than `accepted_at`, and X ranks after R. That is right: X was priced after R and holds every line by its own cut-off.
  - If the completion's UPDATE has run but not committed when acceptance asks for the lock, acceptance waits, then reads X `complete`.
- **A completion during `createRerun`.** No lock is needed. A re-run created next to a completing X is judged at acceptance, under the lock.

### 4.3 What remains

- **One theoretical window, for an X that is a re-run, regression only, no line lost.**
  - The pricing order is read from `completed_at`, which is when X's pricing transaction began. X reads its inputs a few statements later, after the execution lock (`execute.ts:251-275`).
  - **For a first run X, the window is closed.** X's `running` status commits before X's pricing transaction begins. So any R created after that sees X running, and `createRerun` refuses it (`newer_run_pending`, §2.1; review finding 6). PRC-27(e) tests it.
  - **For an X that is a re-run** (later accepted), the window remains. R would have to be created, queued, picked up by the worker and take the execution lock inside the gap between X's `BEGIN` and X's lock statement, a few statements and well under a millisecond, while X ranks as priced first. The damage would be a common line keeping R's state where X's was a moment newer. No line would be lost. Closing it would mean refusing re-runs while any overlapping re-run is running (§2.3), which costs more than the window. Recorded in the ADR amendment as accepted.
- **A first run stuck in `running`** blocks acceptance, and re-runs, of overlapping dates for as long as it stays there. A run stuck in `queued` now blocks only new re-runs. On a job's last attempt, if marking the run failed itself fails, the worker logs `PRICING_RUN_NOT_MARKED` (`apps/worker/src/price/job.ts:38-43`) and the run stays `running` with no job left to finish it. The refusal names the run with a link. There is no operator path today to clear such a run: `failRun` is called only by the worker (`job.ts:40`, `execute.ts`), and no runbook covers it. A new price job for the same run finishes it, because `executePricingRun` resumes a `running` run (`execute.ts:242-245,251-256`). See Q1 (§10.1) and the proposals (§10.2).
- **A path that sets `accepted_at` outside `acceptRun`.** None exists today (`grep accepted_at` under `apps/` finds only `rerun.ts:158`). The application role has `UPDATE (accepted_by, accepted_at)` (`20261019150000_reruns_and_release_withdrawal.sql:188`), so a future code path or hand-written SQL could skip the check. That is what the trigger mirror would close (§5.2).

---

## 5. Migration

### 5.1 No migration: confirmed

- Every input the rule reads already exists: `pricing_run`'s `practice_id`, `period_from`, `period_to`, `status`, `rerun_of_id`, `release_no`, `lines_loaded_by`, `completed_at`, `accepted_at`, `created_at`, and `rule_release_withdrawal`.
- The lock key and its trigger exist (`20261103090000_...sql:764-775`).
- No new table, column, function, grant or policy is needed. The fragments are application SQL like `RUN_IN_EFFECT`.
- `docs/product/domain-model.md` (a #42 file) and the catalog are unchanged, because no schema changes. The schema gate (CO-02) does not apply.

### 5.2 The optional database mirror: recommendation to Lane A

**What it is.**

- **Acceptance.** In `pricing_run_rules()`'s acceptance branch (`20261105090000_...sql:581-591`), refuse with SQLSTATE 23514 when the re-run is superseded, a newer first run is running, or a run took effect meanwhile. Use a new `pricing_run_rerun_acceptable(run uuid)` built from the same predicate as the service, in its `completed_at` and release form (§2.2).
- **Creation (review finding 12).** In the INSERT branch (`20261105090000_...sql:551-563`), refuse a re-run of a run that is not in effect for its period, reusing the existing `pricing_run_in_effect()` (`20261021090000_...sql:48-57`). Today that branch accepts a re-run of any complete run, so a future path or hand-written SQL could create the chains of §1.5.

**Why it works.**

- Trigger order is by name: `pricing_run_pricing_current_lock` fires before `pricing_run_rules` ("p" < "r"), so the exclusive lock is already held when the acceptance check runs.
- A plpgsql function is volatile by default, so each of its queries takes a fresh snapshot at READ COMMITTED and sees what committed while it waited. Like `pricing_current_read_lock()`, it should refuse any other isolation level.
- Inside the trigger, `now()` is the transaction's start, the same `now()` the service's meanwhile guard reads.

**Recommendation: take it**, in Lane A's next migration PR that touches `pricing_run`, under the founder's freeze exception the audit names (it touches a pricing table). Reasons:

- It is the house pattern. `acceptRun`'s own comment says "The database checks the same" (`rerun.ts:132`), and every other acceptance rule is mirrored in the trigger (`20261105090000_...sql:581-597`).
- It closes the one remaining gap: a future path that sets `accepted_at`, or inserts a re-run, without the service (§4.3).
- It carries no new data and no new privilege.

Priority: after this PR, not blocking. The service check fixes the defect for every path that exists. The mirror should:

- name its rules in `docs/product/domain-model.md`'s rule list: "a re-run prices again only the run in effect for its period", and "a re-run is accepted only while nothing in effect for overlapping service dates was priced after it, is pinned to a later release, or (for its own service dates) holds lines it lacks";
- get database tests in `packages/db/src`: setting `accepted_at` as the owner role on a superseded re-run expects 23514, and so does inserting a re-run of a replaced run;
- reuse the service's predicate text, so a parity test can compare them, as `report.db.test.ts:479-485` does for `pricing_run_in_effect()`.

### 5.3 The monitor and lines already lost (gaps e and f)

**(e) Should the monitor also plan lines with no pricing in effect? No, not in this PR.**

- After this fix, acceptance can no longer take a line's pricing out of effect, and no other path does. A first run's completion ranks after everything it replaces and holds every line by its cut-off.
- A predicate for "a line that should have pricing in effect" would have to repeat `claimPage`'s filter (`lines.ts:121-125`): reversals (status 22) are never priced, a corrected claim is priced through its correction, and lines of failed months are waiting. Done wrong, it plans the same month every day. The location rule took a whole design for the same reason (`plan.ts:114-127`).
- It belongs with the detection below, if anywhere.

**(f) Lines already lost in existing data.**

- No customer data exists yet. CLAUDE.md forbids real PHI anywhere before launch, and only synthetic databases exist. Within this repository, the one place the defect is exercised is a test: `rerun.db.test.ts:339-347` creates a fresh first run of February and then accepts the older re-run `runB` (§6.4). So no repair is needed now.
- **Proposal (later Lane B item, read-only, no migration):** a detection for staging and production before the first real audit.
  - What it counts: per practice, the service lines that some eligible run priced, that have no pricing in effect (`PRICED_IN_EFFECT` returns no row), and whose claim is neither a reversal nor superseded.
  - Where it reports: as a count in the operator console's practice health. Counts only, no line identifiers, no PHI.
  - Repair, if it ever finds any: a person creates a new run of the month. It ranks last, holds every line, and restores pricing in effect, with no data edited.

---

## 6. Tests

### 6.1 Test-matrix rows PRC-25 to PRC-28 (exact wording, in the style of `docs/product/test-matrix.md:85-91`)

| ID | Case | Expected |
| --- | --- | --- |
| PRC-25 | A late line priced by a newer run of the month, then the older re-run accepted | Refused as `superseded`, in the worker and through the screens. The late line keeps its pricing in effect and the newer run stays in effect. The re-run's page says a newer run of these service dates is in effect, links to it and offers no Accept button. When that run would price nothing differently now, the page says there is nothing more to accept and offers no re-run |
| PRC-26 | Two re-runs of one run, the second priced after the first, accepted in either order and at once | Whichever acceptance commits first, the month ends on the second re-run. Accepting the first after the second is refused as `superseded`. Accepting the second after the first succeeds, and its page lists the changes against the first. Of two acceptances made at once, the first re-run's is refused as `superseded` whatever the timestamps. The second re-run's, when its transaction began before the other acceptance's, is refused as `changed_meanwhile`, and made again it succeeds. An accepted re-run is the run in effect for its period, and nothing deadlocks |
| PRC-27 | A re-run whose service dates overlap a run of another period, or a run still being priced | A run of another period that took effect after the original and was priced after the re-run, or under a later release, refuses it (`superseded`). No shared line goes back to older pricing, and re-running the original again is accepted. One priced before the re-run does not refuse it, and its own lines stay in effect. A run pinned to a withdrawn release does not count as newer. A first run of overlapping dates being priced refuses acceptance (`newer_run_pending`). One queued refuses new re-runs but not acceptance, and when it completes it takes effect after the accepted re-run |
| PRC-28 | Re-running a run that is not in effect | A run that a later run or an accepted re-run replaced, and a re-run nobody accepted, are not re-run (`not_in_effect`). Their pages offer the run in effect for those service dates instead. A run in effect is re-run as before. A re-run of a re-run nobody accepted, left from before this rule, is not accepted (`superseded`) |

**Where they land: in this PR** (the orchestrator's correction of 2026-10-26 ~00:24 UTC). `docs/product/test-matrix.md`, its word-for-word mirror `packages/synth/src/cases/matrix.ts` (kept identical by `packages/synth/src/fixtures.test.ts:33`) and the registry `packages/synth/src/cases/registry.ts` are shared documents. #42 changes them too, but LANES.md lets shared documents follow rule 6: this PR adds its rows to all three, and whichever PR merges second keeps both lanes' rows. The registry entries use `none(...)` like PRC-24 (`registry.ts:141-146`): "No file of its own: SYNTHETIC 835s the pricing world already loads", with `assertedBy` naming the test files below. The tests carry the IDs in their `describe` names.

### 6.2 `apps/worker/src/price/rerun.db.test.ts` (new `describe` blocks; the pricing world's SYNTHETIC 835s, no new fixture)

- **PRC-25.**
  - Set-up: first run of February. Re-run it under release 900004. Load the later SYNTHETIC 835 the PRC-19 case already loads for its "lines loaded since" step (`rerun.db.test.ts:339-342`). Create and execute a first run of February.
  - `accept(re-run)` is refused with reason `superseded`.
  - The late line's `PRICED_IN_EFFECT` row is the newer run's.
  - `rerunBlock` returns `{ state: 'superseded', samePeriodIds: [newer run], inEffectId: newer run }`.
  - The newer run's `rerunReasons` are empty, which is what the page's "nothing more to accept" reads.
  - After a mapping is corrected, re-running the run in effect is allowed and its acceptance succeeds.
- **PRC-26 (out of order).**
  - Two re-runs, R1 (900001) then R2 (900004), of one run. R2 is created after R1 completes.
  - Accepting R2, then R1: R1 is refused `superseded`, and the lines read R2's release.
  - In a second practice, accepting R1, then R2: R2 is accepted, `rerunBlock` before the acceptance returns `replacesId = R1`, and the lines read R2's release.
- **PRC-26 (at once).** This uses the `hold` pattern of `apps/worker/src/packets/unattested-submission.db.test.ts:404-417`, and the wait check of `pricing-race.db.test.ts:22-23` (`WAIT_MS`).
  - (i) Transaction B opens first and pins its `now()` with `SELECT now()`. Transaction A opens, accepts R2 and is held open. B calls `acceptRun` for R1, and is shown still waiting after `WAIT_MS`. A commits. B is refused `superseded`, because R2 is newer in pricing, although B's `now()` is earlier than R2's `accepted_at`.
  - (ii) The same with the re-runs swapped: B (opened first) accepts R2 after A accepted R1. R1 is not newer than R2, but R1's `since` is after B's `now()`, so B is refused `changed_meanwhile`. Made again in a new transaction, it is accepted, and R2 is the run in effect.
  - (iii) A opens first and accepts R1, held open. B opens after A, calls `acceptRun` for R2, waits, and A commits. B is accepted (its `now()` is after R1's `since`), and R2 is in effect.
  - In every case, both promises settle and neither rejects with 40P01. After every accepted case, `RUN_IN_EFFECT` holds for the re-run just accepted.
- **PRC-27.**
  - **(a)** A January-to-March run, re-run as R. A mapping is corrected, then a February first run executes. Accepting R is refused `superseded` with `otherPeriodIds = [February run]`. February's common lines keep the February run's terms. A second re-run of the January-to-March run is then accepted, and every line it prices reads it.
  - **(b)** A February first run completes before a re-run of the January-to-March run is created. Acceptance succeeds, and a line only the February run priced keeps its pricing in effect.
  - **(b2)** Pricing order, not creation order, decides. R of January to March is created, then a February first run X is created (creating a first run is not refused). X is executed first, then R. X took effect after the original but was priced before R, under the same release, so R is accepted. Under the review's `X.completed_at > R.created_at` form it would have been refused. Every line R and X share reads R, and a line only X priced keeps X.
  - **(c)** A complete re-run of January to March exists. Then a February first run is created and left queued (not executed). Creating another re-run of January to March is refused `newer_run_pending`. Accepting the existing re-run succeeds. The queued run then executes, and it is in effect for February, ranking after the accepted re-run (`since` later).
  - **(d)** The race of §1.6.2, made deterministic. A February first run is set to `running` by an owner-role `UPDATE pricing_run SET status = 'running'`, which the trigger allows (`20261105090000_...sql:596-599`). Acceptance of the January-to-March re-run is refused `newer_run_pending`, never accepted ahead of it. Once the run is failed (`failRun`), the re-run is accepted.
  - **(e)** Review finding 6. With a February first run held at `running` the same way, `createRerun` of an overlapping run in effect is refused `newer_run_pending`.
  - **(f)** A withdrawn release is not newer. With 900004 in force, a February first run X is created and executed. 900004 is withdrawn, so 900001 is in force again. A re-run R of the January-to-March run (pinned to 900001) is created under 900001 and executed. X is pinned to a higher release, but it is withdrawn, and X was priced before R. So R is accepted, and the February lines R shares read R under the reinstated release, which is what the rollback intends.
- **PRC-28.**
  - Re-running a run that an accepted re-run replaced is refused `not_in_effect`.
  - So is re-running an unaccepted re-run.
  - A legacy chain, R2 of an unaccepted R1, inserted as the owner role to stand for data made before this fix, is refused `superseded` on acceptance (`originalEligible: false`).
- **Isolation (review finding 7).** `acceptRun` inside a `REPEATABLE READ` scope is refused before it reads anything, and nothing changes.
- **Parity (review finding 10).** Over every run of the file's practices at the end, wherever no run of another period overlaps, `RUN_IN_EFFECT(o)` agrees with the database's `pricing_run_in_effect(o)`. Wherever O is in effect and nothing of another period overlaps, a complete re-run R of O that is newer in pricing than every run of its period is not superseded. This is compared in the same way `report.db.test.ts:479` compares the database's rule with the application's.
- **Model tie (§6.3).** A small DB check runs the property model and the SQL fragments over the same three hand-built sequences, so the model cannot drift from the SQL.

### 6.3 A property test

`apps/worker/src/price/rerun-rule.property.test.ts`, a pure test with fast-check (`apps/worker/package.json:62`; a `*.test.ts` file run by `pnpm test`, `vitest.config.ts:73`).

- **The model.** A TypeScript model of runs: period, cut-off, pinned release, pricing stamp (`completed_at`), status, `rerun_of`, `since`. It also models releases and withdrawals, and `PRICED_IN_EFFECT`. It takes random sequences of these steps:
  - load a line into a month;
  - a correction or a reversal arrives for a loaded line (review finding 9);
  - create a first run of one to three months, and later price it;
  - re-run a run, and later price it;
  - try to accept a re-run;
  - change the state (publish a release, withdraw the one in force, correct a mapping).
- **The rule under test.** The model's acceptance and creation consult a TypeScript transcription of §2.1. The test asserts after every step:
  - (i) every line that some eligible run priced, and that is still priceable (not reversed, not superseded by a correction), keeps pricing in effect;
  - (ii) no accepted step moves a line's pricing in effect to a run with an older pricing stamp, or to an older release that is not a reinstatement after a withdrawal;
  - (iii) after an accepted step, the accepted re-run is the run in effect for its period;
  - (iv) liveness: a re-run of the run in effect, priced after every other run of overlapping dates, with none running, is acceptable.
- **Named counter-examples.** Each rule below fails the property, and the test includes each as a named counter-example:
  - the audit's rule alone fails (ii) under overlap (Sequence C);
  - the first design's effect-time rule fails (iv) in the reverse order of Sequence B;
  - the review's `completed_at > created_at` form fails (iv) when two re-runs are created before either is priced;
  - the rule without the meanwhile guard fails (iii) in the interleaving of §1.6.3. The model can represent this because it gives each acceptance a start stamp and a commit point.
  - the strict-overlap rule fails (iv).

### 6.4 Existing tests that change with the rule

These are correct changes, recorded so a reviewer sees why each moved:

- **`apps/worker/src/price/rerun.db.test.ts:339-347`.** It creates a fresh first run of February (`fresh`), executes it, re-runs `runA` and then accepts `runB`. That is Sequence A inside the test. The new rule refuses both the re-run of `runA` (`not_in_effect`, since `fresh` replaced it) and the acceptance of `runB` (`superseded`, `fresh` holds later lines and was priced after it). Rewrite:
  - accept `runB` before anything else in that tail;
  - make the pending re-run a re-run of `runB` under 900004;
  - move the fresh-run assertion (7 lines priced) to its own practice, in its own `it`. It is not placed after the rollback block, because there `RELEASE` is back in force and "under release 2" would change meaning (review finding 10).

  The rollback assertions (`:351-408`) then hold as written, with `back` a re-run of `runB`, which stays in effect. The final `rerun(prc19, runB, RERUN_RELEASE)` still meets the release mismatch, because `runB` is in effect and nothing is pending.
- **`apps/worker/src/price/diff-location.db.test.ts:81`.** It re-runs `second`, an unaccepted re-run. Accept `second` first. The test is about each run's split (`:82-91`) and is unaffected.
- **`apps/web/src/lib/routes/reruns-routes.db.test.ts:330`.** It re-runs `first` after `second` was accepted (`:304`). Re-run `second` instead, and compare `second` with `pending` at `:342`.

### 6.5 `apps/web/src/lib/routes/reruns-routes.db.test.ts` (new `describe`, PRC-25 to PRC-28 through the screens)

- `acceptPricingRunAction` on a superseded re-run is refused with `runId: can no longer be accepted, because a newer run of these service dates is in effect...`. The route's issue keeps the field key, and the page's label replaces it on screen.
- `pricingRunPage` returns `acceptance.state === 'superseded'` with `superseding[0].id` the newer run. The run's `acceptance` is `'superseded'` in `rerunsOf` and in the run list.
- `comparePricingRunsPage` returns `canAccept: false` with the same `acceptance`.
- For an acceptable re-run whose original was replaced by an older re-run, `pricingRunPage`'s diff is against the replaced run (`acceptance.replaces`). `comparePricingRunsPage` with `before` = the original gives `canAccept: false` and names the run to compare with. With `before` = the run in effect, it gives `canAccept: true`.
- `rerunPricingRunAction` on a replaced run is refused with `runId: is no longer the run in effect...`, and its page's `periodInEffect` names the run in effect.
- Pending: a running first run of the month gives `acceptance.state === 'newer_run_pending'` and refuses both actions. A queued one refuses only the re-run.
- The audit event is not written for a refused action (the route's existing transaction rollback, `invoke.ts:254-263`).

### 6.6 e2e (a screen changes)

`apps/web/e2e/pricing.spec.ts` (not a #42 file) gets a step after its acceptance step (`pricing.spec.ts:143-170`). The superseded state is built as Sequence A, through the screens (review finding 1):

- After the manager re-runs the first run, and before accepting, the manager creates a new run of the same months on the Pricing runs screen. It completes, priced after the re-run.
- The re-run's page then shows the explanation, the link to the run in effect and no "Accept this run" button. Its badge reads "Can no longer be accepted".
- The first run's page shows no Re-run button and links to the run in effect.
- A second browser context, opened on the re-run's page before the new run was created, clicks Accept after it completes. It sees the refusal read "This re-run: ...", and the page refreshes to the explanation (review finding 3).
- axe runs on each page as the journeys already do (`apps/web/e2e/a11y.ts`).

### 6.7 Synthetic fixtures

None needed. Every case uses 835s the pricing world already loads. The registry and matrix entries are added in this PR (§6.1).

### 6.8 Commands for the PR

`pnpm typecheck`, `pnpm lint`, `pnpm lint:logs`, `pnpm lint:copy`, `pnpm test`, `pnpm test:db` (the catalog and cross-tenant tests, unchanged), `pnpm test:e2e` for `pricing.spec.ts`, and the engine-freeze check (no `packages/pricing` change).

---

## 7. Docs to update

- **ADR: amend 0037, do not open 0069.** The change refines 0037's own decision, "A re-run is in effect only once accepted" (`docs/adr/0037-re-run-a-complete-run-for-the-same-lines-diff-it-from-the-traces-accept-it-by-hand-and-roll-content-back-by-withdrawal.md`). Readers look for acceptance rules there, and the repository amends ADRs in place with a dated note (ADR 0061's and 0064's amendments, `docs/product/reconciliation-001.md:463`). The amendment, "Amended 2026-10-26 (combined audit #10)", adds:
  - the rule of §2.1, with newness judged by the pricing stamp and the pinned release, and the reason (the moment of acceptance is not the age of the pricing);
  - the refusal codes;
  - the `pricing_current` lock, READ COMMITTED, and the race analysis of §4, including the meanwhile guard;
  - the residual window for re-runs (§4.3), stated as accepted, and why it is closed for first runs;
  - the reading of PRD 9 step 4 (§3.2);
  - the diff base: a re-run's page lists the changes against the pricing its acceptance replaces for its period;
  - a row in "Alternatives considered" for each rejected option of §2.3;
  - a consequence line (PRC-25 to PRC-28);
  - "Revisit when": the trigger mirror lands (Lane A).

  ADR 0069 stays unused.
- **Code comments that describe acceptance:** `apps/worker/src/price/rerun.ts:6-22,76-81,129-133`, `in-effect.ts:1-8`, `apps/web/src/lib/routes/pricing.ts:50-54` and the compare and accept comments, the page comments at `[runId]/page.tsx:22-30` and `compare/page.tsx:45-51`, and the `ActionForm` comment for its new prop.
- **`docs/product`:**
  - `PRD.md:219,408` states the requirement. Not edited (the reading goes in the ADR).
  - `domain-model.md:2315-2318` lists the database's acceptance rules. It is a #42 file and changes only with a migration, so it is not edited. The mirror (§5.2) adds its lines there.
  - `reconciliation-001.md` does not list item #10 (searched for "#10", "superseded" and "older re-run"; its milestone-7 row at `:16` names ADR 0037 only), and it is a #42 file, so it is not edited.
  - `test-matrix.md`, `packages/synth/src/cases/matrix.ts` and `registry.ts`: PRC-25 to PRC-28 in this PR (§6.1; shared documents, rule 6).
- **Help text:** `apps/web/src/components/help.ts:16` (`pricing_runs`) says nothing about acceptance. No change and no proposal.
- **PR description:** the wording choices (§8), the PRD reading, the rolling-deploy note (§4.1), and the stuck-run note with its present remedy (§4.3, Q1).

---

## 8. Visible changes and wording

The wording follows `.claude/rules/brand.md` and `docs/brand/BRAND.md` §1 (serious, exact, warm, plain). The audit's phrase is kept, and refined for periods that are not one month: "these service dates" is the run page's own term (`[runId]/page.tsx:118`). Each line says what happened and gives the next step. No figure is promised, and nothing is said to be lost. None of it trips the copy lint (`tools/brand-copy/scan.ts:115-120`). Every claim is true under the rule as revised: "newer" means priced later, under a later release, or holding later lines (review finding 1).

### 8.1 Before

- A superseded re-run's page shows "Re-run awaiting acceptance" and the button "Accept this run" with "Accepting makes this run the one in effect for its period..." (`[runId]/page.tsx:98-104`). Accepting succeeds silently, and the lost lines vanish from Coverage and from Claims and lines.
- Every complete run, replaced or unaccepted, offers "Re-run under release N" (`[runId]/page.tsx:137-147`).
- The compare page offers "Accept the second run" (`compare/page.tsx:103-117`).
- A refusal on these forms reads "Check the fields marked below." then "runId: ..." (`next.ts:161-162`, `action-form.tsx:76`).

### 8.2 After (the exact text)

**Badges (`RunStateBadges`):**

- "Can no longer be accepted": a superseded re-run.
- "Re-run waiting for a newer run": a first run of overlapping dates is being priced.
- "Re-run awaiting acceptance", "In effect" and "Not in effect" are unchanged.

**Re-run card, an acceptable re-run whose original was replaced (above the diff):**

- "Since this re-run was created, [Pricing run, {from} to {to}, rule release {n}] took effect for these service dates. Accepting this re-run replaces that run, so the lines below are compared with it."

**Re-run card, superseded by a run of the same service dates (an alert, title then body):**

- **Title:** "A newer run of these service dates is in effect"
- **Body, when that run would price differently now:** "[Pricing run, {from} to {to}, rule release {n}] took effect after the run this re-run prices again, and it was priced after this re-run or holds lines loaded since. Accepting this re-run would replace newer pricing, so it can no longer be accepted. Re-run that run to price its lines under what is in force now."
  - The re-run button for that run follows, for a person who may re-run.
- **Body, when it would not:** "[Pricing run, {from} to {to}, rule release {n}] took effect after the run this re-run prices again. It already prices these lines under rule release {n} and the mappings and contract versions in force now. There is nothing more to accept."
  - No button.

**Re-run card, superseded by a run of other service dates:**

- **Title:** "A run of some of these service dates was priced after this re-run"
- **Body:** "[Pricing run, {from} to {to}] was priced after this re-run, so accepting this re-run would put older pricing back on the lines they share. This re-run can no longer be accepted. Re-run [the earlier run] again: the new re-run is priced after it, and can then be accepted."
  - With more than one run, each is linked in a list after the first sentence's subject: "These runs were priced after this re-run:".
  - The re-run button for the original follows, for a person who may re-run.

**Re-run card, the original never in effect (a re-run left from before this rule):**

- **Title:** "This re-run prices a run that was never in effect"
- **Body:** "The run this re-run prices again was never accepted, so its changes are not listed against the pricing it would replace. This re-run can no longer be accepted. Re-run [Pricing run, {from} to {to}, rule release {n}], the run in effect for these service dates, instead."

**Re-run card, pending:**

- **Title:** "A newer run of these service dates is being priced"
- **Body:** "[Pricing run, {from} to {to}] is being priced. Wait until it finishes: once it completes, re-run the run in effect; if it fails, this re-run can still be accepted."

**Run card, a run not in effect:** "Only the run in effect for these service dates is priced again: [Pricing run, {from} to {to}, rule release {n}]."

**Run card and release note, pending:** "A newer run of these service dates is {waiting to be priced | being priced}: [link]. Re-run once it finishes."

**Withdrawal alert, a run not in effect:** "...This run keeps every line as it was priced; re-run [the run in effect for these service dates] to price them under the release in force."

**Re-runs list:** "can no longer be accepted", or "waiting for a newer run to finish", in place of "awaiting acceptance".

**Compare page:**

- When the re-run cannot be accepted: a card titled "This re-run can no longer be accepted" (or "Wait for the newer run"), with the same body as the run page, in place of "Accept the re-run".
- When it can be accepted but the first run shown is not what it replaces: a card titled "Compare with the run in effect", with "Accepting this re-run replaces [Pricing run, {from} to {to}, rule release {n}], the run in effect for these service dates, not the first run here. [Compare it with that run] to see exactly what accepting changes, and to accept it."

**Form refusals.** The service's message is the text after "This re-run: " or "This run: "; the form adds the label. The messages are shown after the form's label: "This re-run" on the Accept forms, "This run" on the Re-run forms (review finding 3). The alert's first line stays the app's generic "Check the fields marked below." for now (§10.2).

- `superseded`, same service dates: "This re-run: can no longer be accepted, because a newer run of these service dates is in effect; the page now names it"
- `superseded`, other service dates: "This re-run: can no longer be accepted, because a run of some of these service dates was priced after it; re-run the earlier run again"
- `superseded`, original never in effect: "This re-run: can no longer be accepted, because the run it prices again was never in effect; re-run the run in effect for these service dates"
- `newer_run_pending`, on acceptance: "This re-run: cannot be accepted yet, because a newer run of these service dates is being priced; wait until it finishes"
- `changed_meanwhile`: "This re-run: was not accepted, because a run of these service dates took effect while it was being accepted; check the page again and accept it if it is still offered"
- `newer_run_pending`, on a re-run: "This run: is not priced again yet, because a newer run of these service dates is waiting to be priced or being priced; re-run once it finishes"
- `not_in_effect`: "This run: is no longer the run in effect for its service dates, so it is not priced again; re-run the run in effect instead"
- The release field on the Re-run forms is labelled "Rule release", so the existing mismatch refusal reads "Rule release: ... reload the page to price under the release in force".

After a refusal, the form refreshes the page (§3.5). The explanation card, with its links, then replaces the Accept button, and it is announced as an alert.

**Links.** Link text is the run's name ("Pricing run, 2026-02-01 to 2026-02-28, rule release 900004"), never "here", so it reads alone (WCAG 2.4.4). Dates render as the run page already renders them.

### 8.3 For the screenshot step

Before and after, at 1280 px and 390 px:

1. The superseded re-run's page (Re-run card), in both bodies: "re-run that run" and "nothing more to accept".
2. An acceptable re-run whose original was replaced (the "replaces that run" line above the diff).
3. The original's page (Run card and re-runs list).
4. The compare page of the original and the superseded re-run, and the "Compare with the run in effect" card.
5. The pricing-runs list (badges).
6. The pending state of a re-run's page.
7. A refusal after a stale Accept, before and after the refresh.

Built by extending `pricing.spec.ts`'s flow in the screen tour the UX brief names (`/home/user/ops/designs/lane-b-ux-review-brief.md`, "Then", item 2).

---

## 9. Reviews needed

- **payment-engine-reviewer** (`.claude/agents/payment-engine-reviewer.md`). The change decides which pricing is in effect, so which expected amounts reach triage and packets. Ask it to check:
  - the rule against Sequences A to E, including §1.6.3;
  - the claim that `completed_at` order is pricing order under the execution lock, and the residual window of §4.3;
  - that no path lets a line lose pricing in effect or regress;
  - that nothing under `packages/pricing` changed;
  - the property test's invariants and counter-examples (its checklist asks for a property test).

  No golden line is needed, because no amount's arithmetic changes. That is stated for it.
- **security-reviewer** (`.claude/agents/security-reviewer.md`). Ask it to check:
  - every new query runs in the practice-scoped transaction and filters by `practice_id` (`rerunBlock`, the `RunSummary` column, `periodRunInEffect`, `TOOK_EFFECT_MEANWHILE`), and returned runs are audited reads;
  - the role check stays in the handler (`mapping.edit` on both actions, `routes/pricing.ts:242,277`) and in Postgres (the restrictive policy, `20261019150000_reruns_and_release_withdrawal.sql:183`);
  - the lock key carries only the practice ID;
  - refusal messages name states, never values, as `RerunRefusedError` requires (`rerun.ts:45`), and carry no PHI;
  - nothing new is logged.
- **UX and brand review** (`/home/user/ops/designs/lane-b-ux-review-brief.md`, "Then", item 2). Screens change (§8), so one of the two adversarial reviews is the UX and brand review, with the before and after screenshots of §8.3, against `.claude/rules/brand.md` and the baseline's open findings.
- **Wording:** each choice in §8 is the recommended option, taken under the co-founder's ruling (2026-10-25, ~21:34 UTC), and listed in the PR description.

---

## 10. Questions for the co-founder, and proposals

### 10.1 Questions (cost or security trade-offs only)

None is open.

- **Q1 is decided, not asked** (the co-founder's standing ruling of 2026-10-26 ~00:20 UTC, relayed by the orchestrator: "Don't ask for approvals anymore just build and optimize"; take the recommended option, the safer one for security). **Decision: keep the refusal.** It is the safer option: accepting while an overlapping first run is being priced could leave the month on the older run (§4.2). The PR description names the remedy available now, which is a new price job for the stuck run, and the operator action is a proposal (§10.2). No questions remain open.

### 10.2 Proposals outside this PR

| For | Proposal | Why |
| --- | --- | --- |
| Lane A | The trigger mirror in `pricing_run_rules()` (§5.2): acceptance refused unless acceptable, through a `pricing_run_rerun_acceptable(run)` in the `completed_at` and release form of §2.2, and re-run insertion refused unless the original is in effect, through the existing `pricing_run_in_effect()`. Domain-model rule lines and database tests. Needs the founder's exception for a pricing table | The house pattern ("the database checks the same"), and it closes any future path that sets `accepted_at` or inserts a re-run without the service. **Take it**, not urgent |
| Lane B, before the first real audit | A read-only detection of lines that an eligible run priced but that have no pricing in effect, as counts in the operator console (§5.3 f) | Finds damage from before this fix, or from any future path. There is no real data today |
| Lane B, later | The operator console's count of first runs `queued` or `running` for more than an hour, and an audited operator action that fails a stuck run (`failRun`, `job_failed`), with a runbook line (Q1) | Makes a stuck run visible and clearable before a person meets the refusal |
| Lane B, later (UX) | `runAction`'s generic "Check the fields marked below." (`apps/web/src/lib/http/next.ts:161-162`) should not be shown when every issue names a hidden field. For example: "Not done." with the issues only | Every form with only hidden fields shows a sentence that points at nothing. It touches every form, so not in this PR |
| Not proposed | The monitor planning lines with no pricing in effect (§5.3 e) | It needs a "should be priced" predicate that repeats `claimPage`'s filter, with a daily-loop risk. After this fix no path takes pricing out of effect |

---

## 11. Check against reconciliation-001's "What must not change, as checks" (`docs/product/reconciliation-001.md:440-480`)

| Check | This PR |
| --- | --- |
| Engine arithmetic: no non-test change under `packages/pricing/src`; the golden tests, `recompute(trace)` (PRC-16), unpriced reasons and Medicare flag defaults unchanged (`:444-450`) | Holds. Nothing under `packages/pricing` changes. No amount, flag, reason or trace is computed differently: the change decides only which complete run is accepted, and which run a page diffs against. `tools/engine-freeze` passes with no exception |
| Ledger semantics: no migration, trigger or policy on the ledger tables; stage CHECK; recovered only at posted or deposited; LED-01 to LED-11 (`:452-457`) | Holds. No ledger file or table is touched |
| Content pipeline: no hand edit under `content/releases/**`; `verify-content`, the hooks and the publish workflow unchanged; no DDL on rule tables (`:459-464`) | Holds. No content and no DDL. The release-withdrawal lock trigger is unchanged and is relied on as is (§4.1) |
| Security program: `pnpm test:db` passes; catalog rules unchanged; new PHI tables meet the rules; no BYPASSRLS; headers unchanged; role matrix changes only in PR 14 (`:466-474`) | Holds. No table, policy, role or header changes. `mapping.edit` stays the permission for both actions, and the matrix is untouched |
| Milestones and gate dates unchanged (`:476-480`) | Holds. No milestone, check or date changes. AUDIT-01 (`audit-e2e.db.test.ts`) creates first runs only and never accepts a re-run, so the new refusals cannot reach it |

---

## 12. Review and dispositions

The review (`/home/user/ops/designs/lane-b-superseded-rerun/review.md`) raised 1 blocking finding, 6 should-fix findings and 5 nits. Each was checked against the code at 6ddd587. Two further corrections came from the revision itself.

| # | Finding | Disposition | Reason and evidence |
| --- | --- | --- | --- |
| 1 | Blocking: newness measured by when a run took effect, so valid acceptances are refused and the refusal says something false | **Applied, sharpened, with one addition** | Verified: `completed_at = now()` is set by the pricing transaction, which reads its inputs under the execution lock (`execute.ts:251-275,297`), while `accepted_at` is the click. The rule now judges newness by the pricing stamp. Instead of the review's `X.completed_at > R.created_at`, it compares the two pricing stamps (`X.completed_at >= R.completed_at`) plus the pinned release (`X.release_no > R.release_no`, not withdrawn). This is exact under the same lock argument and accepts strictly more valid acceptances. The release clause stands for "created later" without its false refusals. Withdrawn releases are excluded, because after a rollback the reinstated release is the one wanted (`current_rule_release()`, `20261019150000_...sql:49-53`). **Addition:** allowing acceptance over an accepted rival opens a race the review did not name. An acceptance whose transaction began before a rival's commit would stamp an earlier `accepted_at` and rank before the rival, so it would be accepted but not in effect (§1.6.3; the trigger requires `accepted_at = now()`, `20261105090000_...sql:583`). The new `changed_meanwhile` guard closes it (§2.1, §4.2). Also: when acceptance replaces a run other than the original, the page's diff is against that run (§3.3), so J17's "lists exactly which lines would change" stays true. PRC-26, the property invariants and the e2e step are rewritten as the review asks, and the wording now truthfully says "newer" |
| 2 | Should-fix: "re-run that run" is usually pointless | **Applied, in part; one sub-point kept with reason** | Verified: `rerunReasons` (`rerun.ts:33-43`) is surfaced as `RunSummary.rerun` (`queries.ts:53`). The same-period card uses the run in effect's `rerun` reasons. Empty: "There is nothing more to accept", and no button. Otherwise: re-run that run, with the button. **Kept:** for the other-period case, the review suggests offering "re-run the earlier run again" only when the original's re-run would differ since R's creation. Under the revised rule, R was refused because a run was priced after it. A new re-run of the original is priced after that run, so it can be accepted and carries R's changes for every line, even if nothing changed since R. So the offer is always useful there, and it stays |
| 3 | Should-fix: refusal reads "Check the fields marked below." then "runId: ..." | **Applied; generic sentence as proposal** | Verified: `next.ts:161-162`, `action-form.tsx:76`, no `labels` at `[runId]/page.tsx:99,138`, `refusal()` at `routes/pricing.ts:227-229`. Labels "This re-run" and "This run" (plus "Rule release" for the hidden release field, an improvement in the same forms) on the run page, compare page and release note forms. The messages are rewritten to read after the label (§8.2). An opt-in `refreshOnError` on `ActionForm` (not a #42 file) refreshes the page after a refusal, so the explanation card with its links replaces a stale Accept button. `Alert` defaults to `role="alert"` (`packages/ui/src/components/alert.tsx:18`), so the card is announced. The generic sentence touches every form, so it is a proposal (§10.2) |
| 4 | Should-fix: many `file:line` citations do not match 6ddd587 | **Applied** | Verified each row of the review's table, all correct (`rerun.ts` 134-166, 138, 45-55, 82-106, 6-22, 76-81, 129-133, 157-160; `execute.ts` 253-254, 297, 230-246, 251-299, 235-236, 259-275; `releases.ts:54`). Every citation in this design was re-read and re-pinned, including ones the review did not list (`withdrawal` test lines `rerun.db.test.ts:351-408`, `queries.ts` line ranges) |
| 5 | Should-fix: PRC-26 "whichever way the timestamps fall" is not tested | **Applied** | Verified: the waiting transaction always began after the held one, so its `now()` was always later. The test now opens the waiting transaction first, pins its `now()`, then holds the other (§6.2, PRC-26 at once (i) and (ii)). It also covers the ordinary order (iii), asserts the outcome by pricing order, and asserts no 40P01. Under the revised rule this is also the test of the `changed_meanwhile` guard |
| 6 | Nit: the "one theoretical window" is already closed for first runs | **Applied** | Verified: `running` commits in its own transaction (`execute.ts:230-246`) before the pricing transaction begins (`execute.ts:251`), so `createRerun`'s pending check refuses any R created inside the window. §4.3 is rewritten: closed for first runs, sub-millisecond for re-runs, accepted. PRC-27(e) tests it. The ADR amendment says so |
| 7 | Should-fix: correctness depends on READ COMMITTED, but nothing enforces it | **Applied** | Verified: `acceptRun` is exported (`public.ts:60`) and called directly from eleven other files. The database's own helper refuses other levels (`20261103090000_...sql:752-756`). `acceptRun` refuses anything but `read committed` before the lock (§3.2 step 1), and a test runs it under REPEATABLE READ (§6.2) |
| 8 | Should-fix: Q1 underestimates the stuck run, which can stay `running` forever | **Applied, and the impact reduced** | Verified: `job.ts:38-43` leaves the run `running` when `failRun` fails on the last attempt. Re-analysis showed that a **queued** first run cannot cause the race (§2.1), so acceptance now refuses only while one is `running`. A stuck queued run no longer blocks acceptance. Re-run creation still refuses on queued or running, to avoid a wasted re-run. The review's "existing operator path" does not exist (`failRun` is called only from `job.ts` and `execute.ts`; no runbook mentions pricing runs). So the PR description names the present remedy, a new price job for the run, which resumes it (`execute.ts:242-256`). An audited operator action and the console count of runs `queued` or `running` for over an hour are proposals. Q1 stays a co-founder question |
| 9 | Nit: §1.1 and §1.4 say a line's facts never differ between runs | **Applied** | Verified: `lines.ts:121-129` reads the correction exclusion and the reversal live. The two sentences are corrected (§1.1, §1.4). The property model gains a correction-or-reversal step, and invariant (i) is restricted to lines that are still priceable |
| 10 | Nit: the test plan leaves choices open | **Applied** | The fresh-run assertion moves to its own practice (§6.4). PRC-27(d) uses the owner-role `UPDATE ... SET status = 'running'`, which the trigger allows (`20261105090000_...sql:596-599`). The parity test lives in `rerun.db.test.ts` and compares against `pricing_run_in_effect()` as well as `RUN_IN_EFFECT` (§6.2) |
| 11 | Nit: lock-order inversion during a rolling deploy | **Applied (description only)** | Verified: old order is row (`rerun.ts:138`) then the lock (trigger at the UPDATE). No code change. §4.1 and the PR description say a double submit during the deploy can fail once, and a resubmit is safe |
| 12 | Nit: the Lane A trigger mirror should cover re-run creation too | **Applied** | Verified: the INSERT branch (`20261105090000_...sql:551-563`) accepts a re-run of any complete run. The Lane A proposal now covers creation through `pricing_run_in_effect()`, carries the `completed_at` and release form of the predicate, and lists both domain-model rule lines (§5.2, §10.2) |
| R1 | Revision's own: §3.4 said run summaries are not audited reads | **Corrected** | `queries.ts:7-10` and `readRuns` (`queries.ts:141-148`) make every run returned an audited read through `readWithAudit`. The new reads go through `readRuns`, so they are audited too (§3.4, §9) |
| R2 | Revision's own: after finding 1, a re-run can replace a run other than its original, and its diff was against the original | **Applied** | Under the first design, acceptance always replaced the original, so the diff was right. Under the revised rule, acceptance may replace a later run of the same period. The page now diffs against `replaces`, and the compare page offers Accept only against that run (§3.3, §3.5). `diff.ts` is unchanged, because it already compares any two complete runs. Over other periods, the diff still lists changes against the original only, as it did under the first design's allowed case. That is recorded in the ADR |
