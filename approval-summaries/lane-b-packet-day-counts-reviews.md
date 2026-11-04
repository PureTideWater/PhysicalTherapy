# PR #84 (packet day counts): review findings, regenerated 2026-11-01

## What this is

- The review findings from 2026-10-28 (workflow wf_5607bc50-a7b) were lost with their container. Their journal and the scratchpad notes (`pdc-review-*.md`, `pdc-capture.md`) are gone too. Only two things survive: the counts in the status file's 2026-10-28 07:45 entry, and the fix plan's "In particular" list in `workflow-scripts/lane-b-packet-day-counts-fix-round-wf_c661e0c2-b5e.js`. The section "Mapping to what survived" at the end matches both, item by item, to the findings below.
- This file holds the findings as regenerated on 2026-11-01 by the Lane B item session `session_01FcouKQVq7K3Np8pwNtDhew`, in review workflow wf_f8d58693-49a (`workflow-scripts/lane-b-packet-day-counts-reviews-2-wf_f8d58693-49a.js`).
- **HEAD 1c423691**: `co-001/wip-packet-day-counts-2`. This is the PR head e3299ea2 (build 9e25b11a plus a merge of base 56ed6279) with base 83d71fd6 merged in locally. **BASE 83d71fd6**: the base branch at #78. The change under review is `git diff 83d71fd6...1c423691`.
- Who did the work:
  - **Payment-engine reviewer** (ids PE-n). It applied the checklist in `.claude/agents/payment-engine-reviewer.md` in a fresh clone of 1c423691, reproduced the surviving blockers first, and ran the base's gateway check against the new one.
  - **Correctness reviewer** (ids CORR-n). Working in a fresh clone, it reproduced the surviving blockers and each should-fix item, then looked for new defects.
  - **Verifier A** (payment-engine lens: what a payer would receive) and **Verifier B** (correctness lens: it ran each reproduction exactly as written, then a variant). Each is an adversarial verifier with its own clone, and each tried to refute every PE and CORR finding by running its reproduction.
  - **Completeness critic** (ids CRIT-n). It checked every item of the surviving summary and of the should-fix list against the findings. For each gap it reproduced the defect itself, and it probed the code once more. CRIT findings had no verifier pass.
- How a finding is **confirmed**: at least two "real" votes out of three possible: Verifier A, Verifier B, and the reviewer's own reproduction. PE findings carry no reviewer flag, so they need both verifiers. A CRIT finding is confirmed by the critic's own reproduction alone.
- How **severity** is set: the highest severity any confirming verifier gave. A CRIT finding keeps the critic's severity. When the reviewer or a verifier gave a different severity, the finding says so.
- Line numbers are as the reviewers reported them. Where a line is near the code rather than on it, "At 1c423691" names the function and its line.
- Every probe used synthetic content from `@tp/packets/testing` and lived in a temporary test file that was deleted afterwards. All clones and base worktrees were removed.
- Progress files and probe copies are in this session's scratchpad (`/tmp/claude-0/-home-user-PhysicalTherapy/2c2b82ed-413a-5c90-8dd5-7354c4f665c6/scratchpad/progress/`): `pdc2-review-pe.md`, `pdc2-review-corr.md`, `pdc2-verify-verify-a.md`, `pdc2-verify-verify-b.md`, `pdc2-critic.md`, `pe-probe1.txt`, `pe-probe2.txt`, `zz-pe-probe.test.ts.keep` and `zz-pe-probe2.test.ts.keep`. They are not on any branch, and this file does not depend on them.
- Out of scope: the UX and brand review was **not** regenerated. Its surviving blocker is covered by CORR-5. Its 6 should-fix items and 2 nits are not; the fix round's UX review, which reads the shots, covers them.

## Harnesses used by the reproductions

**PE harness.** A temporary vitest file in `packages/model-gateway/src/functions`:
- Content: `assemblePacket(assemblyInput())` from `@tp/packets/testing`. Per line: expected $100.00, allowed $70.00, paid $56.00, shortfall $30.00.
- Check: `narrativeSpec.verify({content, identifiers: SYNTHETIC_CASE_IDENTIFIERS}, {paragraphs: [s]}).passed`. `SYNTHETIC_CASE_IDENTIFIERS` comes from `packages/model-gateway/src/testing.ts`.
- **Base check:** run `git show 83d71fd6:packages/model-gateway/src/functions/narrative-roles.ts > zz-base-roles.ts`. The base caught a swap when `roleMismatches(s, content).length > 0`.

**H (correctness harness).** A temporary file `packages/packets/src/zz.test.ts`:

```ts
import {it,expect} from 'vitest'; import {assemblePacket} from './assemble'; import {narrativeFacts} from './facts'; import {findMismatches} from './verifier/mismatches'; import {assemblyInput, contractCitation, contractWindowSource, line, promptPayRecord} from './test-support'; const v=(s,c=assemblePacket(assemblyInput()))=>findMismatches(s,narrativeFacts(c),[]).passed;
```

Run it with `npx vitest run --project unit packages/packets/src/zz.test.ts`. `v(...) -> true` means the sentence passed.

**Default content** (`assemblePacket(assemblyInput())`):
- Per line: $100.00 expected, $70.00 allowed, $30.00 shortfall, $56.00 paid.
- Totals: $300.00 expected, $210.00 allowed, $90.00 shortfall.
- Counts: 3 lines, 3 claims, 3 patients; 6 units in the pattern, 2 per line.
- Dates: services 2026-03-05 to 2026-03-07; paid 2026-04-08.
- Window: 3650 days, on page 1, with deadline 2036-04-05. Citation page 2.

**PP(overrides)**:
```ts
assemblePacket(assemblyInput({lines:[1,2,3].map(n=>line(n,{receivedOn:'2026-03-10'})),interest:{state:'ZZ',releaseNo:900003,record:promptPayRecord(overrides)}}))
```
The reviewer recorded that this gives days_to_pay 33 and days late of 0 and 187. Both verifiers, though, found 187 was not held in their interest content, which held 24 days late (see CORR-4). Before relying on a day-late value, check what the content actually holds.

## Counts

- **34 findings** (PE 9, CORR 21, CRIT 4): **34 confirmed, 0 refuted**. CORR-5 was confirmed 2 votes to 1; Verifier B refuted it as intended by ADR 0086.
- **Recorded severity:** 13 blocking, 17 should fix, 4 nit.
- **Reviewers' own severity:** 10 blocking (PE-1 to PE-5, CORR-1 to CORR-5), 21 should fix, 3 nit.
- **Severity changes:**
  - Raised to blocking by the confirming verifiers: PE-8, CORR-6, CORR-19.
  - Lowered to nit: CORR-17.
- **Duplicates:** CORR-1 = PE-1, CORR-2 = PE-8, CORR-3 = PE-3, CORR-17 = PE-9, CORR-18 = PE-7, CORR-19 = PE-5. That leaves 28 distinct defects. 9 of them are blocking: PE-1, PE-2, PE-3, PE-4, PE-5, PE-8, CORR-4, CORR-5 and CORR-6.

## Summary table

| Id | Severity | Confirmed or refuted | Title |
|---|---|---|---|
| PE-1 | blocking | confirmed | An amount is checked against every role its clause's cues name, so a dispute stated backwards passes the verifier and the export |
| PE-2 | blocking | confirmed | The gateway's check of a model's draft regressed: every amount swap the base caught now passes |
| PE-3 | blocking | confirmed | A quoted figure that fills a whole clause of its quote passes in any role (a code becomes window days, a page, a release or units) |
| PE-4 | blocking | confirmed | Day counts, dates, deadlines, pages and percentages take every role their clause's cues name, so a wrong deadline or interest figure reaches the payer |
| PE-5 | blocking | confirmed | Mutation gate fails: the packets-words shard is cancelled at the job's 30-minute limit |
| PE-6 | should fix | confirmed | Correct sentences fail: 'the first 3 claims', a fee-schedule year after a payment cue |
| PE-7 | should fix | confirmed | The property tests use only one-cue sentences, so the union defects cannot be caught |
| PE-8 | blocking (reviewer: should fix) | confirmed | A year word before a count noun makes the figure a year, so 'these 2026 claims' passes when 2026 is not a count |
| PE-9 | nit | confirmed | The editor reads the narrative twice per keystroke |
| CORR-1 | blocking | confirmed | An amount takes the union of every cue since the figure before it, so a dispute stated backwards passes; a regression against the base gateway check |
| CORR-2 | blocking | confirmed | A year lead, or 'the', before a count noun reads the number as a year, which reopens '2026 claims' |
| CORR-3 | blocking | confirmed | A quote's whole-clause match passes a figure in any role, and the quote's edge counts as reached while the narrative's clause goes on |
| CORR-4 | blocking | confirmed | Day counts take the union of every day cue in the whole clause, so two swapped day counts both pass |
| CORR-5 | blocking | confirmed (split: Verifier B refuted) | A stored version the new reading fails still shows 'Verifier passed' and can be requested and approved; only the export runs the verifier again |
| CORR-6 | blocking (reviewer: should fix) | confirmed | An amount after another figure with no cue between reads 'any', so 'respectively' and 'per line ... in total' pass in either order; also a gateway regression |
| CORR-7 | should fix | confirmed | Per-line values and totals share a role, so a total stated per line (or a line value stated as a total) passes |
| CORR-8 | should fix | confirmed | An ordinal before a noun that is not a row noun is read as a count: 'the sixth unit' passes, 'the first unit' and 'the second appeal' fail |
| CORR-9 | should fix | confirmed | Natural sentences fail: 'the first 3 claims', partitive numerators, 'patient paid', 'payment of the balance' |
| CORR-10 | should fix | confirmed | No cue reaches schedule_year, so a locked fee-schedule year after a payment or service cue fails |
| CORR-11 | should fix | confirmed | Business days to pay fail unless 'to pay' or 'pay within' is in the clause |
| CORR-12 | should fix | confirmed | 'appeal' as a label turns the verb 'We appeal 3 claims' into a dispute level |
| CORR-13 | should fix | confirmed | List inheritance across a comma gives a following number the label's role |
| CORR-14 | should fix | confirmed | The four-token quote rule passes a figure in a role the quote never gave it |
| CORR-15 | should fix | confirmed | Regression: en-dash ranges fail ('Lines 1–3') |
| CORR-16 | should fix | confirmed | A confusable letter in a cue removes the role silently, so a misfiled amount passes |
| CORR-17 | nit (reviewer: should fix) | confirmed | The editor reads the narrative twice per keystroke |
| CORR-18 | should fix | confirmed | The property test has coverage gaps: single-cue sentences only, missing date roles, and the deadline role is never expected to pass |
| CORR-19 | blocking (reviewer: should fix) | confirmed | The packets-words mutation shard is still cancelled at CI's 30-minute limit |
| CORR-20 | nit | confirmed | No total paid or total patient share is held, so a natural total fails |
| CORR-21 | nit | confirmed | The gateway notice names the first role in FIGURE_ROLES order, not the role the words gave |
| CRIT-1 | should fix | confirmed (critic reproduced; no verifier pass) | The property tests never write an edge-delimited quoted figure or a year lead before a count noun, so PE-3 and PE-8 cannot be caught |
| CRIT-2 | should fix | confirmed (critic reproduced; no verifier pass) | A verb cue sets an amount's role and ignores the subject noun, so a wrong shortfall or allowed total passes |
| CRIT-3 | should fix | confirmed (critic reproduced; no verifier pass) | A date that comes after another figure, or opens the sentence, is checked against no role, so a wrong payment date or deadline passes |
| CRIT-4 | should fix | confirmed (critic reproduced; no verifier pass) | Regression: a correct deadline written after 'days after payment' or 'days of payment' fails, because the date is read as a payment date |

### Duplicates and overlaps

- **PE-1 = CORR-1** (the amount cue union). Related: CORR-6, where the second figure gets no cue, as in "respectively". Also CRIT-2, where a verb cue is read without its subject; a nearest-cue fix alone does not cure CRIT-2.
- **PE-4 (dates, days, pages, percentages)** overlaps CORR-4, which adds two swapped day counts and a false failure. Related: CRIT-3 (a date with no cue at all) and CRIT-4 (a correct deadline after "days after payment" fails).
- **PE-3 = CORR-3** (a whole-clause quote match). Related: CORR-14 (the four-token quote rule).
- **PE-8 = CORR-2** (a year lead before a count noun).
- **PE-2** (the gateway regression) is caused by PE-1, PE-3 and PE-8: the gateway check is now just the verifier.
- **PE-6** overlaps CORR-8 ("the sixth unit"), CORR-9 ("the first 3 claims") and CORR-10 (a fee-schedule year).
- **PE-7 = CORR-18** (the property tests). CRIT-1 adds reproductions for the two gaps they only name.
- **PE-5 = CORR-19** (the Stryker shard).
- **PE-9 = CORR-17** (the editor reads twice).
- **CORR-7** (per line versus totals) is related to CORR-20 (no paid or patient-share totals) and CRIT-2.

## Reviewers' verdicts (as returned)

**Payment-engine reviewer:**

> Request changes. Not mergeable: 4 blocking, 3 should fix, 1 nit. I reproduced both surviving blocking findings on 1c423691 with temporary vitest probes (since deleted; copies are in /tmp/claude-0/-home-user-PhysicalTherapy/2c2b82ed-413a-5c90-8dd5-7354c4f665c6/scratchpad/progress/zz-pe-probe*.test.ts.keep, output in pe-probe1.txt and pe-probe2.txt, notes in pdc2-review-pe.md). (1) Amounts, dates, percentages and day counts are checked against every role their clause's cues name, so a dispute stated backwards passes. It reaches the payer: the export's re-check runs the same verifier (apps/worker/src/packets/export.ts:198). I generated 246 sentences that state an amount in the wrong role. The base's gateway check caught all 246. The new gateway check passes all 246, because roleMismatches now reports only figures the verifier already failed. (2) A quoted figure that fills a whole clause of its quote passes in any role. With a clause shaped like the synthetic fixtures' ('97014, 97545, 92508 - 12 ...'), "within 97545 days", "page 97545" and "Release 97545" all pass. That reopens the code-as-page and code-as-days rows (I4, I5) this PR exists to close. (3) A year word before a count noun now beats the noun, so "these 2026 claims" passes. The base caught it. (4) The mutation gate fails on the PR's head: the packets-words shard was cancelled at the 30-minute limit, and nothing about that shard has changed since. Nothing changes under packages/pricing, packages/ledger or packages/money, and no floats were added. Both renumbered Stryker equivalents (facts.ts [] #6, mismatches.ts [] #12) match their text and are still equivalent. The packets and gateway unit suites pass (1,082 tests).

The verdict counts 4 blocking, but the reviewer's findings list has 5 at blocking: PE-1 to PE-5, with PE-1 and PE-2 forming its item (1). It also has 3 at should fix (PE-6 to PE-8) and 1 nit (PE-9).

**Correctness reviewer:**

> REQUEST CHANGES. I found five blocking defects, all reproduced against 1c423691. (1) Each amount, date and day count takes the union of every cue in its span, so a dispute stated backwards passes. The base gateway check, which used the nearest cue, rejected these sentences, so this is a regression. (2) A year lead, or "the", beats a count noun, so "The 2026 claims" passes. (3) A quote's whole-clause match passes a figure in any role. (4, new) Day counts take the union of the whole clause, so two swapped day counts both pass. (5) A stored version that the new reading fails still shows "Verifier passed" and can be requested and approved, because VERIFIER_FORMAT is still tp-packet-verifier/2. The only place the verifier runs again is the worker export (apps/worker/src/packets/export.ts:198), which refuses with verifier_failed after approval. Every should-fix item from the context reproduces, and I found new ones: confusable letters as cues, en-dash ranges (a regression from base), partitive numerators, "patient paid" and "payment of". Checks run under the lock: unit tests for packets, model-gateway, synth and the web packet files, 1603 passed; golden gate, 52 passed; typecheck, 22 projects passed; eslint on the touched files is clean, but only with an 8 GB heap (the default heap ran out of memory). Mutation run 40646243545 has the packets-words shard cancelled at the 30-minute limit, and it is the latest run for the branch. The property test's oracle (roleOracle) does not depend on facts.ts or roles.ts and is seeded, but it covers single-cue sentences only, and its oracle never records a deadline. [The harness H and the content are given under "Harnesses" above.] My probes and the base worktree are deleted, and the clone is clean at 1c423691. Progress file: /tmp/claude-0/-home-user-PhysicalTherapy/2c2b82ed-413a-5c90-8dd5-7354c4f665c6/scratchpad/progress/pdc2-review-corr.md

**Completeness critic:**

> Most items already have findings. Each blocking item in the surviving summary has one: PE-1/CORR-1 for the cue union, PE-2 for the gateway regression, PE-3/CORR-3 for whole-clause quotes, PE-8/CORR-2 for the year lead, and CORR-5 for the stale "Verifier passed" and approval. CORR-5 has a split verdict because ADR 0086 defers that work. Most should-fix items also have one: CORR-7 (per-line vs totals), CORR-6 ("respectively"), CORR-8 (ordinals), CORR-9/CORR-10/CORR-11/PE-6 (correct sentences that fail), CORR-13 (list inheritance), CORR-14 (four-token quote rule), CORR-12 ("appeal" as a label), PE-9/CORR-17 (editor reads twice), PE-7/CORR-18 (one-cue templates and missing date roles in the oracle) and PE-5/CORR-19 (Stryker). Two property-test gaps on the list had no finding: edge-delimited quoted figures, and the year lead before count nouns. They are now CRIT-1. A fresh probe of 1c423691 against base 83d71fd6 found three more defects. CRIT-2: a verb cue such as "comes to" sets an amount's role and ignores the subject, so a wrong shortfall or allowed total passes. CRIT-3: a date that comes after another figure, or opens the sentence, is not checked against any role, so a wrong payment date or deadline passes. CRIT-4 is a regression: a correct deadline written after "days after payment" now fails, though the base passes it. CRIT-2 and CRIT-3 are not regressions (the base passes them too), but in both a wrong figure reaches the payer. I also checked counts written as years before "payments", "disputes" and "remittances". They pass at both base and head, and "2026 payments" can fairly be read as a year, so I am not reporting them. All probes were temporary files, deleted afterwards, and the base worktree is removed. Progress is in /tmp/claude-0/-home-user-PhysicalTherapy/2c2b82ed-413a-5c90-8dd5-7354c4f665c6/scratchpad/progress/pdc2-critic.md.

## Confirmed findings

### PE-1: An amount is checked against every role its clause's cues name, so a dispute stated backwards passes the verifier and the export

- **Severity:** blocking. The reviewer and both verifiers agree.
- **Status:** confirmed. Both verifiers voted real. Duplicate: CORR-1.
- **File and line:**
  - `packages/packets/src/roles.ts:267`, `cued()`. At 1c423691, `since()` is at 256 and `after()` at 261.
  - `packages/packets/src/verifier/mismatches.ts:118`, `roles.some(held)`.
- **Detail:**
  - `Reader.cued()` collects every cue from the previous figure up to this one into a single set. `since()` reads straight through commas and colons, and `after()` adds the noun that follows the figure.
  - `inInputs()` then passes the figure if any of those roles holds it (`verifier/mismatches.ts:118`).
  - So when one clause holds two cues, a value held in the farther cue's role passes in the nearer cue's role. The base's gateway check took the nearest cue instead.
  - As a result, a model's draft that says the payer allowed the contract's amount, or that the shortfall equals the expected amount, is now stored and printed.
  - The export's re-check (`apps/worker/src/packets/export.ts:198`) runs the same verifier, so these drafts pass there too.
  - Interest and the patient's share are affected as well. A "respectively" sentence passes whatever order its figures come in.
- **Reproduction:** PE harness, default content.

  | Input | Observed at 1c423691 | Expected |
  |---|---|---|
  | `Under the contract, the payer allowed $100.00 per line [3].` | PASS (read as expected/allowed) | fail |
  | `Although the payer paid, the contract requires $56.00 per line [3].` | PASS | fail |
  | `The contract requires more, so the shortfall is $100.00 per line [3].` | PASS | fail |
  | `The remittance shows the contract rate of $56.00 per line [3].` | PASS | fail |
  | `After the coinsurance, the payer underpaid $14.00 per line [3].` | PASS | fail |
  | `The contract expected more than the payer allowed: $300.00 in all [3].` | PASS | fail |
  | `The payer allowed and the contract expected $100.00 and $70.00 per line respectively [3].` | PASS | fail |
  | Interest content (`promptPayRecord`, lines received 2026-02-10): `The payer owes $90.00 in interest [4].` | PASS ($90.00 is the shortfall; the interest is $5.76) | fail |
  | Control: `The payer allowed $100.00 per line` | fail | fail |

  Systematic run: three templates, `'Although {A}, {B} $v [3].'`, `'{A} less, so {B} $v [3].'` and `'Since {A}: {B} $v [3].'`, over every pair of expected, allowed, paid, shortfall and interest cues, with `$v` held only in A's role. Observed: 246 of 246 pass. Expected: all fail.
- **Recommended fix:**
  - Use the cue nearest the figure, as the base did: the last cue before the figure in its clause, or else the noun right after it.
  - Let a comma or colon end the window, unless only a list joins the figures.
  - Take a union only when one cue itself names two roles ("remittance shows").
  - Map "respectively" figures to their cues in order, or fail them.
  - Add property cases with two or more cues where the figure is held only in the farther cue's role.
- **Verifier A (payment-engine lens): real, blocking.**
  - Ran a temporary vitest probe in `packages/model-gateway/src/functions` with `narrativeSpec.verify`, plus the base `roleMismatches` from `git show 83d71fd6`. Every listed sentence PASSES at 1c423691. Examples:
    - "Under the contract, the payer allowed $100.00 per line [3]." reads as expected+allowed.
    - "...contract requires $56.00" reads as expected+paid.
    - "remittance shows the contract rate of $56.00" reads as expected+allowed+paid.
    - "$14.00" reads as variance+patient_share.
    - The "respectively" sentence passes.
    - "$90.00 in interest" reads as variance+interest.
  - The base gateway caught the first six sentences of the table. The control "The payer allowed $100.00 per line" fails.
  - Systematic run of 240 two-cue sentences (3 templates, 5 amount roles, 2 phrasings each), with the value held only in the farther cue's role: the new gate passed all 240, and the base caught 198.
  - ADR 0086 rejected nearest-cue-only on purpose (its B2). But taking every cue lets a dispute stated backwards pass the verifier and the export re-check, so a wrong figure reaches the payer.
- **Verifier B (reproduce lens): real, blocking.**
  - Ran `narrativeSpec.verify` at 1c423691. All 8 listed sentences PASS, and each figure is read with union roles: $100.00 as expected/allowed, $56.00 as expected/allowed/paid, $90.00 as variance/interest.
  - Variant: "Because the contract requires more, the payer paid $100.00 per line [3]." also PASSES.
  - The single-cue control "The payer allowed $100.00 per line" fails, so the union is the cause.
  - At base, the gateway's role check caught the first six sentences, so this is a regression.

### PE-2: The gateway's check of a model's draft regressed: every amount swap the base caught now passes

- **Severity:** blocking. The reviewer and both verifiers agree.
- **Status:** confirmed. Both verifiers voted real.
- **File and line:** `packages/model-gateway/src/functions/narrative-roles.ts:30` (`roleMismatches`). It feeds `narrative.ts:139`.
- **Detail:**
  - At base, `roleMismatches` was a separate reading: the nearest cue for amounts, the noun for counts. It blocked drafts the verifier passed (`narrative.ts:139`, `passed = report.passed && roles.length === 0`).
  - Now it only names figures the verifier has already failed. The draft gate is just the verifier, so PE-1's union and PE-3's quote match pass straight through.
  - ADR 0054's guarantee that a model's draft figures are "held to their roles" is gone.
- **Reproduction:** PE harness, with the base check (`git show 83d71fd6:packages/model-gateway/src/functions/narrative-roles.ts > zz-base-roles.ts`; the base caught a sentence when its `roleMismatches(s, content).length > 0`).
  - Systematic: the 246 generated amount swaps of PE-1. Observed: the base caught 246, and the new gate passes 246. Expected: the new gate fails every swap the base caught.
  - Hand-written swaps. In every row, observed is: base CAUGHT, new PASS. Expected: the new gate fails, as the base did.

  | Content | Input |
  |---|---|
  | default | `Although the payer paid, the contract requires $56.00 per line [3].` |
  | default | `The payer allowed less, so the contract requires $70.00 per line [3].` |
  | default | `The contract requires more, so the shortfall is $100.00 per line [3].` |
  | default | `Under the contract, the payer allowed $100.00 per line [3].` (with and without the comma) |
  | default | `The remittance shows the contract rate of $56.00 per line [3].` |
  | default | `After the coinsurance, the payer underpaid $14.00 per line [3].` |
  | default | `The contract expected more than the payer allowed: $300.00 in all [3].` |
  | interest content | `The interest owed is $30.00 per line [4].` |
  | default | `The payer underpaid these 2026 claims [3].` |
  | default | `The payer underpaid the 2026 claims [3].` |
  | default | `The payer owes for 2026 claims [3].` |
  | default | `The payer underpaid these 2036 claims [3].` |
  | clause quote `Fee schedule amount for 97110 per unit: $50.00` | `The payer paid $50.00 per line [3].` |
  | clause quote `Fee schedule amount for 97110 per unit: $50.00` | `The shortfall is $50.00 per line [3].` |
  | a clause ending `... up to 12 units, 4 claims a year` (the reviewer recorded only its end) | `The payer underpaid 4 claims a year [3].` |
  | window quote `Disputes are raised within 3650 days; see sections 4, 24, 90` | `There were 90 units [3].` |
- **Recommended fix:**
  - Fix PE-1 and PE-3 in the shared reader.
  - Until then, either keep the base's nearest-cue check as an extra gate on a model's draft, or add a test that runs the base's swap probes against the new gate and requires each one to fail.
- **Verifier A (payment-engine lens): real, blocking.**
  - `narrative-roles.ts` now returns only figures that `checkedFigures` already failed (`figure.passed ? [] ...`), so the gateway check is just the verifier.
  - Base caught and new passed, for each of: the PE-1 sentences; "The payer allowed less, so the contract requires $70.00"; "The interest owed is $30.00 per line [4]"; all four "2026/2036 claims" sentences; the fee-schedule clause's $50.00 as paid and as shortfall; "4 claims a year"; and "90 units" with the window quote.
  - Its systematic run gave 198 of 240 caught by the base and 0 of 240 by the new gate. The reviewer and Verifier B counted 246 of 246 on their own template sets.
  - The gateway is less strict than the base.
- **Verifier B (reproduce lens): real, blocking.**
  - Ran the systematic swap probe (3 templates over every role pair) against the base `narrative-roles.ts` and the new gate: 246 wrong-role swaps, the base caught 246, the new gate passes 246.
  - In the base worktree (83d71fd6), `narrativeSpec` failed each of: PE-1's first six sentences, the "interest owed is $30.00" sentences, the two fee-schedule $50.00 sentences, the "2026/2036 claims" sentences and "There were 90 units". All of these pass at 1c423691.
  - The gateway is less strict than the base.

### PE-3: A quoted figure that fills a whole clause of its quote passes in any role (a code becomes window days, a page, a release or units)

- **Severity:** blocking. The reviewer and both verifiers agree.
- **Status:** confirmed. Both verifiers voted real. Duplicate: CORR-3.
- **File and line:** `packages/packets/src/roles.ts:520`. At 1c423691, `quotedHolds()` starts at 496, and the `left.edge && right.edge` shortcut is at 520.
- **Detail:**
  - `quotedHolds()` returns true when both sides of the figure reach the quote's clause edges (`left.edge && right.edge`). It does this before it checks `inRole`, and the narrative's own words are never checked.
  - So when a quoted figure sits between two edges, the narrative can state that value in any role, with any words. That covers a comma-separated code list, and a figure at the quote's start or end after a colon.
  - The contract clauses in `fixtures/synthetic` have exactly this shape: `97014, 97545, 92508 - 12 Manual services $73.75 per unit` and `92522, 97535 - - ...`.
  - This reopens design rows I4 and I5 (a code read as a page or as days), and A1 to A3, through the quote. It also lets a quoted amount be stated as paid, allowed or the shortfall.
- **Reproduction:** PE harness. Content: `assemblePacket(assemblyInput({citation: contractCitation({quote: '97014, 97545, 92508 - 12 Manual services $73.75 per unit'})}))`.

  | Input | Observed | Expected |
  |---|---|---|
  | `Disputes are raised within 97545 days [1].` | PASS (window_days) | fail |
  | `There were 97545 units [3].` | PASS | fail |
  | `The clause is on page 97545 [1].` | PASS | fail |
  | `Release 97545 priced the lines [2].` | PASS | fail |
  | `The payer paid 97014 days late [3].` | PASS | fail |
  | Clause quote `Fee schedule amount for 97110 per unit: $50.00`: `The payer paid $50.00 per line [3].` | PASS (paid is $56.00) | fail |
  | Window quote `Disputes are raised within 3650 days; see sections 4, 24, 90`: `The payer paid 24 days late [1].` | PASS | fail |
  | Same window quote: `There were 90 units [3].` | PASS | fail |
  | Same window quote: `Release 24 priced the lines [2].` | PASS | fail |

  The reviewer did not record how it set the window quote. CORR-3 sets one with `assemblyInput({deadlineSources:[contractWindowSource({quote})]})`.
- **Recommended fix:**
  - When the figure is in a role (`inRole`), a whole-clause match must also require the narrative's own clause to match: the narrative's tokens must reach an edge wherever the quote's do.
  - Otherwise, require a meaningful matched token, as the no-role branch does.
  - A bare figure that fills a quoted clause should pass only as a code, and only when the quote names codes.
  - Add CAS-43 rows for comma-list and colon-final quotes.
- **Verifier A (payment-engine lens): real, blocking.**
  - Reproduced with the quote '97014, 97545, 92508 - 12 Manual services $73.75 per unit'. All five pass in the role named: 97545 as window_days, units, citation_page and release, and 97014 as days_late.
  - With the fee-schedule clause, "$50.00" passes as paid (paid is $56.00).
  - With the window quote '...see sections 4, 24, 90', "24 days late", "90 units" and "Release 24" all pass.
  - A code or section number can reach the payer as a deadline day count, a page or a release.
- **Verifier B (reproduce lens): real, blocking.**
  - With the quote '97014, 97545, 92508 - 12 ...', 97545 passes as window_days, units, citation_page, release and claims, and 97014 passes as days_late.
  - With the window list quote, 24 passes as days_late and as release, and 90 passes as units. With the fee clause, $50.00 passes as paid and as variance.
  - The base also passed the code-list cases, but it had no day or page roles. "There were 90 units", "Release 24" and the $50.00 cases are regressions, because the base failed them.

### PE-4: Day counts, dates, deadlines, pages and percentages take every role their clause's cues name, so a wrong deadline or interest figure reaches the payer

- **Severity:** blocking. The reviewer and both verifiers agree.
- **Status:** confirmed. Both verifiers voted real. Overlaps CORR-4; related to CRIT-3 and CRIT-4.
- **File and line:** `packages/packets/src/roles.ts:411`. At 1c423691, `dayRoles()` is at 411, `pageRoles()` at 406 and `clause()` at 251.
- **Detail:**
  - `dayRoles()` and `pageRoles()` collect cues across the whole clause, from words on both sides of the figure. Dates and percentages use the same `cued()` union as amounts.
  - So one stray cue word makes a figure from another role pass.
  - This affects the figures ADR 0061 puts in the payer's copy: the dispute deadline, the window's day count, the interest days, the due date and the interest rate.
- **Reproduction:** PE harness.

  | Content | Input | Observed | Expected |
  |---|---|---|---|
  | default | `The payment dispute window ends on 2026-04-08 [1].` | PASS (2026-04-08 is the payment date; the deadline is 2036-04-05) | fail |
  | default | `The window, which opened when the payer paid, ends on April 8, 2026 [1].` | PASS | fail |
  | default | `The services were paid on 2026-03-05 [3].` | PASS (a service date) | fail |
  | default | `The payer paid the lines, with a deadline, on 2036-04-05 [3].` | PASS | fail |
  | default | `The payer paid 3650 days late on this dispute [1].` | PASS | fail |
  | default | `The dispute window clause is on page 2 [1].` | PASS (the window is on page 1) | fail |
  | interest content | `The payer paid 33 days late under the prompt pay rule [4].` | PASS (late is 24) | fail |
  | interest content | `Payment was due, and the dispute window ends, on 2026-03-15 [1].` | PASS (the due date stated as the deadline) | fail |
  | content with 112.5% of Medicare plus 9% interest | `Interest runs at 112.5% of the Medicare fee schedule [4].` | PASS | fail |
  | content with 112.5% of Medicare plus 9% interest | `The contract pays interest at 9% [1].` | PASS | fail |
- **Recommended fix:**
  - Use the same nearest-cue rule as PE-1 for days, pages, dates, months, years and percentages: take the cue nearest the figure on its side, not every cue in the clause.
  - Add property cases with two cues to `roles.property.test.ts`.
- **Verifier A (payment-engine lens): real, blocking.**
  - Every listed sentence PASSES:
    - "The payment dispute window ends on 2026-04-08" reads 2026-04-08 as paid_date+deadline.
    - "The services were paid on 2026-03-05" reads it as service_date+paid_date.
    - "The payer paid 3650 days late on this dispute" reads 3650 as window_days+days_late.
    - "The dispute window clause is on page 2" reads 2 as citation_page+window_page.
    - With interest, "33 days late" reads as days_to_pay+days_late, and "2026-03-15" as due_date+deadline.
    - With Medicare plus interest, "112.5%" and "9%" read as contract_percent+interest_rate.
  - So a wrong deadline, day count or rate passes into the payer's copy: these are ADR 0061 figures.
  - The base gateway did not read these roles, so this is not a regression. But it defeats the roles this PR adds.
- **Verifier B (reproduce lens): real, blocking.**
  - All 10 listed sentences PASS with union roles: 2026-04-08 as paid_date/deadline, 3650 as window_days/days_late, page 2 as citation_page/window_page, 2026-03-15 as paid_date/due_date/deadline, and 112.5% and 9% as contract_percent/interest_rate.
  - The single-cue controls fail, for example "The dispute window ends on 2026-04-08".
  - The base passed these too, so this is not a regression. But under the reading ADR 0086 adds, a wrong deadline, day count or rate reaches the payer's copy.

### PE-5: Mutation gate fails: the packets-words shard is cancelled at the job's 30-minute limit

- **Severity:** blocking. The reviewer and both verifiers agree.
- **Status:** confirmed. Both verifiers voted real. Duplicate: CORR-19.
- **File and line:** `stryker/shards.json:53`, the `packets-words` entry, whose name is on line 54.
- **Detail:**
  - At the PR head e3299ea2, "stryker (packets-words)" ran from 06:55:15 to 07:25:33 and was cancelled, and the "mutation" gate failed.
  - Nothing in `packages/packets`, `stryker` or `tools/stryker` changed between e3299ea2 and 1c423691. So the shard (`roles-words.ts`, 1,128 mutants) will be cancelled again.
  - The 100% score the build reported was measured locally (22 min 42 s). It is not a CI result.
- **Reproduction:**

  ```
  gh api repos/PureTideWater/PhysicalTherapy/commits/e3299ea2ec5634a08d6d8f79e38cb623636e0fa8/check-runs --jq '.check_runs[]|select(.name|test("stryker|mutation"))|[.name,.conclusion]'
  ```
  Observed: "stryker (packets-words)" cancelled; "mutation" failure. Expected: success.

  ```
  git diff --stat e3299ea2 1c423691 -- packages/packets stryker tools/stryker
  ```
  Observed: empty, so the cause is unchanged.
- **Recommended fix:**
  - Either split `roles-words.ts` across two shards (for example, the cue tables apart from the noun and label tables), or cut the tests each word mutant runs, using per-test coverage so that a mutant runs only the tests that read its word.
  - Then measure on CI before merging.
- **Verifier A (payment-engine lens): real, blocking.** `gh api` check-runs for e3299ea2: "stryker (packets-words)" was cancelled (06:55:15 to 07:25:33Z) and "mutation" failed; every other shard succeeded. `git diff --stat e3299ea2 1c423691 -- packages/packets stryker tools/stryker` is empty, so it will time out again. A required gate is red.
- **Verifier B (reproduce lens): real, blocking.** `gh` check-runs for e3299ea2: "stryker (packets-words)" was cancelled 06:55:15 to 07:25:33, and the "mutation" gate failed. `git diff --stat e3299ea2 1c423691` over `packages/packets`, `stryker` and `tools/stryker` is empty, so the shard will time out again. A required gate is red, which blocks the merge.

### PE-6: Correct sentences fail: 'the first 3 claims', a fee-schedule year after a payment cue

- **Severity:** should fix. The reviewer and both verifiers agree.
- **Status:** confirmed. Both verifiers voted real. Overlaps CORR-8, CORR-9 and CORR-10.
- **File and line:** `packages/packets/src/roles.ts:327`. At 1c423691, `isYear()` is at 327, `countNoun()` at 295, and the ordinal check at 371-372.
- **Detail:**
  - In "the first 3 claims", `countNoun` lets the figure 3 stand between "first" and "claims". "first" is then read as a count of 1 claim, and the sentence fails.
  - A fee-schedule year after "paid" takes the date cue (paid_date), and the schedule_year fact does not match it.
  - A person writing correct text is blocked, and the editor shows a misleading role.
  - "The sixth unit" is read as a count of 6 units. It passes only because the units happen to be 6.
- **Reproduction:** PE harness.

  | Content | Input | Observed | Expected |
  |---|---|---|---|
  | default | `The first 3 claims were underpaid [3].` | fail ("first" read as claims 1) | pass |
  | citation PERCENT_OF_MEDICARE, year_basis LOCKED:2025, quote `Payer pays 112.5% of the Medicare fee schedule` | `The payer paid less than the 2025 Medicare fee schedule requires [1].` | fail (2025 read as paid_date) | pass |
- **Recommended fix:**
  - Treat an ordinal directly before a figure as prose, not a count.
  - When a year comes before a year noun (fee schedule, Medicare, rates), use schedule_year ahead of the date cues.
- **Verifier A (payment-engine lens): real, should fix.**
  - "The first 3 claims were underpaid [3]." fails, with "first" read as claims.
  - With PERCENT_OF_MEDICARE LOCKED:2025, "The payer paid less than the 2025 Medicare fee schedule requires" fails, with 2025 read as paid_date.
  - "The sixth unit was not paid" passes on the default content only because units=6. With 3 units per line (9 in total) it fails, so it is read as a count.
  - These fail closed, so the person can reword.
- **Verifier B (reproduce lens): real, should fix.**
  - "The first 3 claims were underpaid [3]." fails ("first" read as claims). "The payer paid less than the 2025 Medicare fee schedule requires [1]." fails (2025 read as paid_date).
  - The base passes both, so this is a regression.
  - "The sixth unit" passes only because the units are 6: "The fifth unit" fails.

### PE-7: The property tests use only one-cue sentences, so the union defects cannot be caught

- **Severity:** should fix. The reviewer and both verifiers agree.
- **Status:** confirmed. Both verifiers voted real. Duplicate: CORR-18. CRIT-1 adds reproductions for the quote and year-lead gaps.
- **File and line:** `packages/packets/src/roles.property.test.ts:110`. At 1c423691, `AMOUNT_TEMPLATES` is at 109, `NUMBER_TEMPLATES` at 91 and `DATE_TEMPLATES` at 117; the oracle is `roleOracle` in `packages/packets/src/role-examples.ts:418`.
- **Detail:**
  - Every amount, date and day template has a single cue, for example `'The contract requires {} [1].'` and `'The payer paid on {} [3].'`.
  - No generated sentence has two cues with the figure held only in the farther cue's role.
  - There are no edge-delimited quoted figures, no year lead before a count noun, and the oracle lacks some date roles.
  - That is why the 100% mutation score and the check that "every pair of roles is reached" both missed PE-1 to PE-4.
- **Reproduction:**
  - `grep -n "'The" packages/packets/src/roles.property.test.ts | sed -n '1,40p'` shows one-cue templates only.
  - The PE-1 sentences pass today while the whole suite stays green: `pnpm exec vitest run packages/packets packages/model-gateway/src/functions --project unit` reports 1082 passed.
  - Expected: a property fails on two-cue sentences with the value held only in the farther role.
- **Recommended fix:**
  - Add generators that combine two cue phrases, in either order and joined by a comma or colon, with a value held only in the farther role. Add quotes with comma-list and colon-final figures. Assert that each fails.
  - Add the base's swap probes as a regression test in model-gateway.
- **Verifier A (payment-engine lens): real, should fix.** In `roles.property.test.ts`, `AMOUNT_TEMPLATES`, `DATE_TEMPLATES` and `NUMBER_TEMPLATES` are all single-cue sentences. The oracle in `role-examples.ts` never adds deadline, due_date, as_of_date, interest_rate, contract_percent or schedule_year. The PE-1, PE-3 and PE-4 defects reproduce while the suite stays green.
- **Verifier B (reproduce lens): real, should fix.** `roles.property.test.ts` lines 92-122 have one cue per template. The oracle (`role-examples.ts`) never adds deadline, due_date, as_of_date, the percentages or schedule_year. Every PE-1 to PE-4 sentence passes while the suite stays green.

### PE-8: A year word before a count noun makes the figure a year, so 'these 2026 claims' passes when 2026 is not a count

- **Severity:** blocking. The reviewer recorded should fix; both verifiers raised it to blocking.
- **Status:** confirmed. Both verifiers voted real. Duplicate: CORR-2.
- **File and line:** `packages/packets/src/roles.ts:335`, the `YEAR_LEADS` test inside `isYear()` (327). `countNoun()` is at 295.
- **Detail:**
  - `isYear()` runs before `countNoun()`.
  - After a year lead ("these", "its", "for", "each", or "the" before a count noun), any figure from 1900 to 2199 becomes a year with no cue. A year with no cue passes against any date's year.
  - So a claim count equal to a date's year passes. The base's gateway check caught this.
- **Reproduction:** PE harness, default content (the claims count is 3; dates fall in 2026, and the deadline is in 2036).

  | Input | Observed at 1c423691 | Base check | Expected |
  |---|---|---|---|
  | `The payer underpaid these 2026 claims [3].` | PASS (read as a year with no role) | caught: claims:2026 | fail |
  | `The payer underpaid the 2026 claims [3].` | PASS | caught: claims:2026 | fail |
  | `The payer owes for 2026 claims [3].` | PASS | caught: claims:2026 | fail |
  | `The payer underpaid these 2036 claims [3].` | PASS | caught: claims:2036 | fail |
- **Recommended fix:**
  - Before a count noun, read a year-shaped figure as both the count and the year.
  - Pass it only if the year has a year noun or a cue. Otherwise, require the count.
- **Verifier A (payment-engine lens): real, blocking.**
  - "The payer underpaid these/the 2026 claims", "owes for 2026 claims" and "these 2036 claims" all PASS, with 2026 read with no role.
  - The base gateway reported 1 mismatch for each. The control "There were 2026 claims" fails.
  - This is a regression of the gateway against the base; the claims count is 3.
- **Verifier B (reproduce lens): real, blocking.**
  - "these/the/for 2026 claims" and "these 2036 claims" PASS as a year with no role.
  - The control "these 2027 claims" fails, so the figure passes because 2026 and 2036 are held years.
  - The base caught all of them (claims:2026, claims:2036). A wrong count can pass, and the gateway regressed.

### PE-9: The editor reads the narrative twice per keystroke

- **Severity:** nit. The reviewer and both verifiers agree.
- **Status:** confirmed. Both verifiers voted real. Duplicate: CORR-17.
- **File and line:** `apps/web/src/components/packets/narrative-editor.tsx:21`.
- **Detail:**
  - `checkNarrative()` and `checkFigures()` each rebuild `narrativeFacts(content)` and run `readFigures()` on the same text, which doubles the work on every keystroke.
  - The reviewer added that the two could drift if one were memoised differently from the other. Verifier B disputes this; see its verdict below.
- **Reproduction:** read `narrative-editor.tsx`. It has `useMemo(() => checkNarrative(text, content))` and a separate `checkFigures(text, content)`, and each calls `narrativeFacts` and `readFigures` (`packages/packets/src/check.ts:18-29`). Observed: two fact builds and two readings per keystroke. Expected: one of each.
- **Recommended fix:** expose one call that returns both the check and the figures from a single reading, and memoise `narrativeFacts` on `content`.
- **Verifier A (payment-engine lens): real, nit.** In `check.ts`, `checkNarrative` calls `findMismatches(narrativeFacts(content))` and `checkFigures` calls `checkedFigures(narrativeFacts(content))`. `narrative-editor.tsx` memoises both on `[text, content]`. That makes two fact builds and two readings per keystroke, a cost to performance only.
- **Verifier B (reproduce lens): real, nit.** `narrative-editor.tsx:21-23` has two `useMemo` calls, `checkNarrative` and `checkFigures`. Both call `narrativeFacts(content)`, and both read the figures. The cost is performance only: the two calls run the same function on the same input, so they cannot drift.

### CORR-1: An amount takes the union of every cue since the figure before it, so a dispute stated backwards passes; a regression against the base gateway check

- **Severity:** blocking. The reviewer and both verifiers agree.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. Duplicate of PE-1.
- **File and line:** `packages/packets/src/roles.ts:259`. At 1c423691, `since()` is at 256, `after()` at 261 and `cued()` at 267.
- **Detail:**
  - `cued()` takes the union of `cueRoles(since(index))` and `after()`, and `since()` crosses commas and colons back to the figure before.
  - A span that names both the contract and the payer reads as expected+allowed, so either value passes in either role.
  - The base gateway's `roleMismatches` used the nearest cue and rejected these sentences (83d71fd6: 1 mismatch each).
  - The new gateway check is only `checkedFigures`, so a model's draft that states the dispute backwards is now accepted too.
- **Reproduction:** H, default content.

  | Input | Observed | Expected |
  |---|---|---|
  | `v('The contract expected and the payer allowed $100.00 [1].')` | true (read as expected+allowed) | false ($100.00 is not the allowed amount; allowed is $70.00) |
  | `v('Under the contract the payer allowed $100.00 per line [1].')` | true | false |
  | `v('The contract requires more than the payer paid: $56.00 [1].')` | true | false |

  Base: `roleMismatches(s, assemblePacket(assemblyInput())).length` on the first sentence = 1.
- **Recommended fix:**
  - Use the cue nearest the figure, as the base did; when two cues end at the same place, take the longer one.
  - Take the union only when cues are explicitly coordinated under the reader's own rule.
  - Add property cases with two cues where the value is held only in the farther cue's role.
- **Verifier A (payment-engine lens): real, blocking.** Duplicate of PE-1.
  - "The contract expected and the payer allowed $100.00 [1]." PASSES (read as expected+allowed), and the base caught it.
  - "Under the contract the payer allowed $100.00" PASSES; the base caught it (1).
  - "The contract requires more than the payer paid: $56.00" PASSES, and the base passed it too (0).
- **Verifier B (reproduce lens): real, blocking.** This duplicates PE-1.
  - "The contract expected and the payer allowed $100.00 [1]." and "Under the contract the payer allowed $100.00 per line [1]." PASS (expected/allowed), and the base caught both.
  - "The contract requires more than the payer paid: $56.00 [1]." also PASSES, but the base passed it too.

### CORR-2: A year lead, or 'the', before a count noun reads the number as a year, which reopens '2026 claims'

- **Severity:** blocking. The reviewer and both verifiers agree.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. Duplicate of PE-8.
- **File and line:** `packages/packets/src/roles.ts:367`. At 1c423691, `isYear()` is at 327 with the `YEAR_LEADS` test at 335, and `countNoun()` is at 295.
- **Detail:**
  - `isYear()` runs before `countNoun()`. It returns true after any of `YEAR_LEADS` ("for", "its", "this", "in", ...), or after "the" when a count noun follows.
  - A year then reads as "any" of the date roles. 2026 is held as the year of the service, paid, as-of and effective dates, so a claim count of 2026 passes.
- **Reproduction:** H, default content (claims = 3).

  | Input | Observed | Expected |
  |---|---|---|
  | `v('The 2026 claims were underpaid [1].')` | true (2026 = year/any) | false |
  | `v('Its 2026 claims were underpaid [1].')` | true | false |
  | `v('For 2026 claims the payer paid short [1].')` | true | false |
  | `v('This 2026 claims batch was short [1].')` | true | false |
  | Control: `v('There were 2026 claims [1].')` | false | false |
- **Recommended fix:**
  - Let a count noun right after the figure win over a year lead: a year before a count noun is the count, unless a year noun follows.
  - Alternatively, treat the figure as ambiguous and fail it unless both readings hold.
  - Add the year lead before count nouns to the property test.
- **Verifier A (payment-engine lens): real, blocking.** Duplicate of PE-8. "The 2026 claims were underpaid" and "Its 2026 claims..." PASS (2026 read with no role), and the base caught both. The control "There were 2026 claims" fails.
- **Verifier B (reproduce lens): real, blocking.** "The/Its/For/This 2026 claims..." all PASS (2026 read with no role). The control "There were 2026 claims" fails. The base failed all four (claims:2026). This duplicates PE-8.

### CORR-3: A quote's whole-clause match passes a figure in any role, and the quote's edge counts as reached while the narrative's clause goes on

- **Severity:** blocking. The reviewer and both verifiers agree.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. Duplicate of PE-3.
- **File and line:** `packages/packets/src/roles.ts:522`. At 1c423691, `quotedHolds()` starts at 496 and the edge shortcut is at 520.
- **Detail:**
  - `quotedHolds` returns true when both sides reach the quote's edge, before it checks `inRole`.
  - The edges counted are the quote's own. So a short quoted clause ("$50.00 per unit", "90 days") lets that figure pass anywhere it has the same neighbour, in any role the narrative's words give it.
- **Reproduction:** H.

  | Content | Input | Observed | Expected |
  |---|---|---|---|
  | `assemblePacket(assemblyInput({citation:contractCitation({quote:'97110: $50.00 per unit.'})}))` | `The payer allowed $50.00 per unit [1].` | true | false (allowed is only $70.00) |
  | `assemblePacket(assemblyInput({deadlineSources:[contractWindowSource({quote:'Time to dispute: 90 days.'})]}))` | `The payer paid 90 days late [1].` | true (read as days_late; 90 is held in no role) | false |
- **Recommended fix:**
  - Apply the `inRole` rule before the whole-clause shortcut.
  - Count a whole-clause match only when the narrative's own clause edges coincide with the quote's, on both sides.
  - Add edge-delimited quoted figures to the property test.
- **Verifier A (payment-engine lens): real, blocking.** With the quote '97110: $50.00 per unit.', "The payer allowed $50.00 per unit [1]." PASSES, and the base caught it. With the window quote 'Time to dispute: 90 days.', "The payer paid 90 days late [1]." PASSES (read as days_late). The root cause is the same as PE-3.
- **Verifier B (reproduce lens): real, blocking.** This duplicates PE-3.
  - With the quote '97110: $50.00 per unit.', "The payer allowed $50.00 per unit" and the variant "The payer paid $50.00 per unit" PASS. The base failed both.
  - With the quote 'Time to dispute: 90 days.', "The payer paid 90 days late" PASSES (days_late). The base passed it too.

### CORR-4: Day counts take the union of every day cue in the whole clause, so two swapped day counts both pass

- **Severity:** blocking. The reviewer and both verifiers agree.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. Both verifiers refuted the example as written (see "Claims refuted inside confirmed findings") but confirmed the defect with the content's real values. Overlaps PE-4.
- **File and line:** `packages/packets/src/roles.ts:341`. At 1c423691, `dayRoles()` is at 411 and `clause()` at 251.
- **Detail:**
  - `dayRoles()` takes the union of `DAY_CUES` over `clause(index)`: all the words between the surrounding figures, on both sides.
  - In a clause that names both lateness and the window, each count reads as window_days+days_late, so the late days and the window's days can be exchanged.
- **Reproduction:** H, with `c = PP({})`.

  | Input | Observed | Expected |
  |---|---|---|
  | As recorded: `v('The payer paid 3650 days late and we dispute within 187 days [1].', c)` | Reviewer: true (both read as window_days+days_late). Both verifiers: false, because 187 was not held in their content. | false (3650 is the window; 187 days late) |
  | As the verifiers ran it, with the content's held days late (24): `The payer paid 3650 days late and we dispute within 24 days [1].` | PASS (both read as window_days+days_late) | fail |
  | The same with 24 and 3650 swapped | PASS | fail |
  | `v('Interest accrues on claims not paid within 33 days [1].', c)` | false (33 read as window_days+days_late) | true (33 is days_to_pay; the base passes it) |

  Use the days-late value the content actually holds; see the note on PP under "Harnesses".
- **Recommended fix:**
  - Use the nearest day cue on the figure's own side: the words between the previous figure and the count, then the words just after "days". Never use the whole clause.
  - Add a property with two day counts in one clause.
- **Verifier A (payment-engine lens): real, blocking.**
  - The finding's own example does not reproduce as written: 187 is held in no role, so that sentence fails.
  - With the record's real numbers, the defect does reproduce. "The payer paid 3650 days late and we dispute within 24 days [1]." PASSES, and so does the reverse with 24 and 3650: both figures read as window_days+days_late, so the two day counts swap freely.
  - The legitimate "Interest accrues on claims not paid within 33 days" fails (33 read as window_days+days_late).
- **Verifier B (reproduce lens): real, blocking.**
  - As written, 187 is not held in its content (days late is 24), so the sentence fails.
  - The variant "The payer paid 3650 days late and we dispute within 24 days [1]." PASSES, with both counts read as window_days/days_late, so swapped day counts pass. The base also passes it.
  - The legitimate "Interest accrues on claims not paid within 33 days [1]." fails at the new head and passes at the base, which is a regression.

### CORR-5: A stored version the new reading fails still shows 'Verifier passed' and can be requested and approved; only the export runs the verifier again

- **Severity:** blocking. The reviewer recorded blocking, and so did the one confirming verifier (A). Verifier B voted not real and gave should fix.
- **Status:** confirmed, 2 votes to 1: the reviewer reproduced it and Verifier A voted real; Verifier B refuted it as intended and tracked by ADR 0086. This was the surviving UX blocker of 2026-10-28.
- **File and line:** `apps/web/src/components/packets/display.tsx:357`, the badge `verifier.passed ? 'Verifier passed' : 'Verifier failed'`.
- **Detail:**
  - `VERIFIER_FORMAT` is still `'tp-packet-verifier/2'` (`packages/packets/src/format.ts:29`).
  - The stored `verifier_passed` and report are trusted in four places:
    1. `display.tsx:357`: the badge.
    2. `approval.ts` `approvalState`: `verifierCurrent` compares only the format, so it stays true.
    3. `requestApprovalAction`, through `requestApproval` and the database check in migration `20261024110000:102`, which looks at `verifier_passed` only.
    4. `approvePacketVersionAction`, through `approveOnce`, the `packet_version_approval_needs_verifier` CHECK and the format guard in migration `20261027090000:336`, which accepts format /2.
  - `cases/workbench.ts` also shows the stored `verifier_passed`.
  - The only place the verifier runs again is the worker's export (`apps/worker/src/packets/export.ts:198`). It refuses with `verifier_failed`, but only after the version is approved, and an approval cannot be withdrawn.
  - The web app never runs the check again on a stored version; the editor checks only typed text. ADR 0086 acknowledges this and leaves the /3 format to Lane A.
- **Reproduction:**
  - At base 83d71fd6: `verifyNarrative('The payer paid $100.00 for each line [1].', narrativeFacts(assemblePacket(assemblyInput())), [])` gives passed true, format `tp-packet-verifier/2`.
  - At 1c423691, H: `v('The payer paid $100.00 for each line [1].')` gives false.
  - Observed: a version stored before the merge with this narrative keeps `verifier_passed=true` and format /2. It renders "Verifier passed", `approvalState` is "ready", and the export job refuses it with `verifier_failed`.
  - Expected: the version is blocked as `verifier_outdated` before approval.
- **Recommended fix:**
  - Bump `VERIFIER_FORMAT` to /3, together with the migration that accepts it, so stored /2 reports become `verifier_outdated`.
  - Until then, run `checkNarrative` again on the stored narrative in `builderView`, `approveOnce` and `requestApproval`, and block when it fails.
  - The /3 migration (and any Postgres-side part) belongs to Lane A, as design proposal 1. The fix plan asks this PR to build the handler and display parts.
- **Verifier A (payment-engine lens): real, blocking.**
  - `VERIFIER_FORMAT` is still 'tp-packet-verifier/2' (`format.ts:29`). `display.tsx` shows the stored `verifier.passed` as the badge, and `approval.ts`' `verifierCurrent` compares only the format. The only re-run is the worker export (`export.ts:198`, `verifier_failed`).
  - The probe shows "The payer paid $100.00 for each line [1]." now fails (paid read as $56.00). The base gateway also flagged it, which shows the base verifier did not read roles.
  - ADR 0086 defers /3 to Lane A, and the export guard stops the figure reaching the payer. Even so, a stored version that the current reading fails still shows "Verifier passed" and can be approved into a dead end.
- **Verifier B (reproduce lens): NOT real, should fix.**
  - The mechanics reproduce. `VERIFIER_FORMAT` is still 'tp-packet-verifier/2', `display.tsx` shows the stored `verifier.passed`, and `approval.ts` `approvalState` trusts it. "The payer paid $100.00 for each line [1]." passed at the base and fails now.
  - But ADR 0086 (lines 83-87 and 113-114) and the design (lines 376-378 and 420-421) defer the /3 format bump to Lane A on purpose. The export's re-check refuses such a version (`verifier_failed`), and no real version exists before launch.
  - So this is intended and tracked, not a defect of this PR.

### CORR-6: An amount after another figure with no cue between reads 'any', so 'respectively' and 'per line ... in total' pass in either order; also a gateway regression

- **Severity:** blocking. The reviewer recorded should fix. Verifier A gave blocking and Verifier B should fix; the highest confirming severity is used.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. Related to PE-1.
- **File and line:** `packages/packets/src/roles.ts:239`. At 1c423691, `since()` is at 256.
- **Detail:**
  - `since()` stops at the previous figure, so the second amount in a pair has no cue and passes in any role.
  - "respectively" is not handled.
- **Reproduction:** H, default content.

  | Input | Observed | Base | Expected |
  |---|---|---|---|
  | `v('The contract expected and the payer allowed $70.00 and $100.00, respectively [1].')` | true | passes | false |
  | `v('The payer allowed $70.00 per line and $100.00 in total [1].')` | true | passes | false (the allowed total is $210.00) |
  | `v('The payer allowed, not the contract amount of $70.00, only $100.00 [1].')` | true | gateway: 1 mismatch (expected:$70.00) | false |
- **Recommended fix:**
  - Carry the clause's cue across a list: in "X and Y, respectively", map the cues to the figures in order.
  - An amount after a figure, with no cue of its own, should take the cue before the previous figure, or be marked ambiguous.
- **Verifier A (payment-engine lens): real, blocking.**
  - All three PASS. In "expected and allowed $70.00 and $100.00, respectively", the second amount gets no role.
  - In "The payer allowed $70.00 per line and $100.00 in total", $100.00 gets no role, though the allowed total is $210.00.
  - The base gateway caught "The payer allowed, not the contract amount of $70.00, only $100.00" (1), so that one is a gateway regression.
- **Verifier B (reproduce lens): real, should fix.**
  - "...$70.00 and $100.00, respectively" and "$70.00 per line and $100.00 in total" PASS; the second figure is read with no role. The base passes both too.
  - "The payer allowed, not the contract amount of $70.00, only $100.00" PASSES here, while the base caught it (expected:$70.00), which is a regression.

### CORR-7: Per-line values and totals share a role, so a total stated per line (or a line value stated as a total) passes

- **Severity:** should fix. The reviewer and both verifiers agree.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. Not a regression.
- **File and line:** `packages/packets/src/facts.ts:272`. At 1c423691, the amount facts are at 226-272: pattern totals at 226-227, and per-line values at 248-251 and 272.
- **Detail:**
  - The expected, allowed and variance roles each hold both the pattern totals and each line's amounts.
  - The reader has no notion of "each line" versus "in total" for amounts or units.
- **Reproduction:** H, default content.

  | Input | Observed | Expected |
  |---|---|---|
  | `v('Each line was expected at $300.00 [1].')` | true ($300.00 is the total) | false |
  | `v('The shortfall on each line is $90.00 [1].')` | true | false |
  | `v('The 3 lines billed 2 units [1].')` | true (the total is 6) | false |
- **Recommended fix:**
  - Split the amount roles into line_* and total_*, as units and line_units already are.
  - Read "each/per line" versus "in total/across/all" beside the amount.
- **Verifier A (payment-engine lens): real, should fix.**
  - These PASS: "Each line was expected at $300.00", "The shortfall on each line is $90.00" and "The 3 lines billed 2 units" (2 is held as line_units; the pattern total is 6).
  - The base gateway did not catch them either (0), so this is an existing gap, not a regression. A wrong per-line figure can still go out, so it should be fixed.
- **Verifier B (reproduce lens): real, should fix.** "Each line was expected at $300.00", "The shortfall on each line is $90.00" and "The 3 lines billed 2 units" all PASS. The base passes them too, so this is not a regression, but a total stated per line passes.

### CORR-8: An ordinal before a noun that is not a row noun is read as a count: 'the sixth unit' passes, 'the first unit' and 'the second appeal' fail

- **Severity:** should fix. The reviewer and both verifiers agree.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. Verifier B refuted the claim that the base passes "the first unit". Overlaps PE-6.
- **File and line:** `packages/packets/src/roles.ts:389`. At 1c423691, the `ORDINAL_NOUNS` lookup is at 371, and `ROW_LABELS` is at 389.
- **Detail:**
  - `ORDINAL_NOUNS` lacks "unit" and "appeal".
  - So an ordinal falls through to `countNoun` (units) or to `LEVEL_WORDS` (level).
- **Reproduction:** H, default content (6 units).

  | Input | Observed | Expected |
  |---|---|---|
  | `v('The sixth unit was not paid [1].')` | true, but read as units=6, the pattern's count; with 9 units it fails | true, read as prose |
  | `v('The first unit was paid at the contract rate [1].')` | false | true. The reviewer said the base passes it; Verifier B found the base fails it too. |
  | `v('This is the second appeal on these lines [1].')` | false ("second" read as level) | true; the base passes it |
- **Recommended fix:** an ordinal before any noun is never a count. Read it as prose, as "first" already is, unless the noun is a row noun.
- **Verifier A (payment-engine lens): real, should fix.**
  - "The sixth unit was not paid" passes only when units=6. With 9 units it fails, so it is read as a count.
  - "The first unit was paid at the contract rate" fails ("first" read as units). "This is the second appeal on these lines" fails ("second" read as level).
  - Correct prose fails, and it fails closed.
- **Verifier B (reproduce lens): real, should fix.**
  - "The sixth unit was not paid" PASSES ("sixth" read as units).
  - "The first unit..." fails, but the base failed it too, so the finding's claim that the base passes it is wrong.
  - "This is the second appeal on these lines" fails ("second" read as level), and the base passes it, which is a regression.

### CORR-9: Natural sentences fail: 'the first 3 claims', partitive numerators, 'patient paid', 'payment of the balance'

- **Severity:** should fix. The reviewer and both verifiers agree.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. Verifier B found the last two sentences fail at the base too, so they are not regressions. Overlaps PE-6.
- **File and line:** `packages/packets/src/roles.ts:372`, the ordinal check.
- **Detail:**
  - "first" before a count noun is read as a claim count of 1.
  - A partitive gives its numerator the noun's role.
  - "paid" and "payment" act as cues for what the payer paid, even after "patient" or before a demand.
  - The reviewer said each of these sentences passes at the base; Verifier B found this true for the first three only.
- **Reproduction:** H, default content.

  | Input | Observed | Expected | Base |
  |---|---|---|---|
  | `v('The first 3 claims were each underpaid by $30.00 [1].')` | false ("first" = claims) | true | passes |
  | `v('2 of the 3 claims were short [1].')` | false (2 read as claims) | true | passes |
  | `v('Of the 3 claims, 2 were paid on 2026-04-08 [1].')` | false (2 has no role) | true | passes |
  | `v('The patient paid $14.00 of the $70.00 allowed [1].')` | false ($14.00 read as paid) | true | fails too |
  | `v('We request payment of the $90.00 balance within 30 days [1].')` | false on $90.00 ($90.00 read as paid; 30 read as window_days) | $90.00 passes | fails too |
- **Recommended fix:**
  - Make "first/last N" prose.
  - Give a partitive numerator no count role, since it is a subset.
  - Add "patient paid/pays" to patient_share.
  - Do not let "payment" cue an amount after "request" or "of the".
- **Verifier A (payment-engine lens): real, should fix.**
  - Each fails as described. In "first 3 claims", "first" is read as claims. In "2 of the 3 claims", 2 is read as claims. In "Of the 3 claims, 2 were paid", 2 has no role and fails.
  - In "The patient paid $14.00", $14.00 is read as paid. In "We request payment of the $90.00 balance within 30 days", $90.00 is read as paid and 30 as window_days.
  - These are natural sentences that fail closed.
- **Verifier B (reproduce lens): real, should fix.**
  - "The first 3 claims...", "2 of the 3 claims were short" and "Of the 3 claims, 2 were paid on 2026-04-08" fail now and pass at the base: regressions.
  - "The patient paid $14.00 of the $70.00 allowed" and the "$90.00 balance" sentence fail at the base too, so they are not new.

### CORR-10: No cue reaches schedule_year, so a locked fee-schedule year after a payment or service cue fails

- **Severity:** should fix. The reviewer and both verifiers agree.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. It is a regression. Overlaps PE-6; CRIT-4 is its deadline counterpart.
- **File and line:** `packages/packets/src/roles-words.ts:340`. At 1c423691, `DATE_CUES` starts at 309 and `YEAR_NOUNS` at 130.
- **Detail:**
  - A year is read with `DATE_CUES`, and none of them maps to schedule_year.
  - Any "paid" or "services" cue in the span forces a date role.
- **Reproduction:** H, with `c = assemblePacket(assemblyInput({citation:contractCitation({parameters:{amount_cents:'5000',year_basis:'LOCKED:2025'}})}))`.

  | Input | Observed | Expected |
  |---|---|---|
  | `v('The payer paid under the 2025 fee schedule [1].', c)` | false (2025 = year/paid_date) | true |
  | `v('These services were paid at 2025 rates [1].', c)` | false (service_date+paid_date) | true |
  | Control: `The 2025 fee schedule applies` | passes | passes |
- **Recommended fix:** a year followed by one of `YEAR_NOUNS` (fee schedule, rates, Medicare) takes schedule_year from the noun, before the date cues.
- **Verifier A (payment-engine lens): real, should fix.** With year_basis LOCKED:2025, "The payer paid under the 2025 fee schedule" fails (2025 read as paid_date), and "These services were paid at 2025 rates" fails (service_date+paid_date). The control "The 2025 fee schedule applies" passes.
- **Verifier B (reproduce lens): real, should fix.** With year_basis LOCKED:2025, "The payer paid under the 2025 fee schedule" (2025 read as paid_date) and "These services were paid at 2025 rates" fail. The base passes both, so this is a regression. The control "The contract uses the 2025 fee schedule" passes.

### CORR-11: Business days to pay fail unless 'to pay' or 'pay within' is in the clause

- **Severity:** should fix. The reviewer and both verifiers agree.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. It is a regression.
- **File and line:** `packages/packets/src/roles-words.ts:170`, inside `DAY_CUES` (from line 165).
- **Detail:**
  - "within" alone is a window_days cue, and business days pass only as days_to_pay.
  - So a correct statement of the business-day prompt-pay rule fails.
- **Reproduction:** H, with `c = PP({day_basis:'business',days_to_pay:15,annual_rate_percent:null})`.

  | Input | Observed | Expected |
  |---|---|---|
  | `v('The statute requires payment within 15 business days [1].', c)` | false (15 read as window_days) | true; the base passes it |
  | Variant: `The payer must pay within 15 business days` | passes | passes |
- **Recommended fix:**
  - Make "payment within", "require(s) payment" and "must pay" days_to_pay cues.
  - Business days only ever count days to pay, so read a business-day count as days_to_pay.
- **Verifier A (payment-engine lens): real, should fix.** With day_basis business and days_to_pay 15, "The statute requires payment within 15 business days [1]." fails (15 read as window_days).
- **Verifier B (reproduce lens): real, should fix.** With business days and 15 days to pay, "The statute requires payment within 15 business days" fails (15 read as window_days). The base passes it, so this is a regression. The variant "The payer must pay within 15 business days" passes.

### CORR-12: 'appeal' as a label turns the verb 'We appeal 3 claims' into a dispute level

- **Severity:** should fix. The reviewer and both verifiers agree.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. It is a regression.
- **File and line:** `packages/packets/src/roles-words.ts:39`, `['appeal', ['level']]` in `LABELS` (from line 28).
- **Detail:**
  - `LABELS` maps "appeal" to level, and the label check runs before `countNoun`.
  - So a number after the verb "appeal" is read as a level.
- **Reproduction:** H, default content.

  | Input | Observed | Expected |
  |---|---|---|
  | `v('We appeal 3 claims that were paid short [1].')` | false (3 = level) | true; the base passes it |
  | `v('We appeal 6 units billed under 97110 [1].')` | false (6 = level) | true; the base passes it |
- **Recommended fix:** read "appeal" as a label only when the number is not followed by a count noun, or only in "level/tier" forms. Let a count noun win.
- **Verifier A (payment-engine lens): real, should fix.** "We appeal 3 claims that were paid short" fails (3 read as level), and "We appeal 6 units billed under 97110" fails (6 read as level).
- **Verifier B (reproduce lens): real, should fix.** "We appeal 3 claims that were paid short" and "We appeal 6 units billed under 97110" fail, with 3 and 6 read as level. The base passes both, so this is a regression.

### CORR-13: List inheritance across a comma gives a following number the label's role

- **Severity:** should fix. The reviewer and both verifiers agree.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. It is a regression.
- **File and line:** `packages/packets/src/roles.ts:413`. At 1c423691, `listed()` is at 400-403 and `LIST_JOINERS` is at `roles-words.ts:126`.
- **Detail:**
  - `listed()` treats "," as a list joiner.
  - So a number that follows a labelled figure and a comma inherits the label's role, even when the comma starts a new clause.
- **Reproduction:** H, default content.

  | Input | Observed | Expected |
  |---|---|---|
  | `v('Under version 1, 2 of them were short [1].')` | false (2 = version) | true; the base passes it |
- **Recommended fix:** inherit across a comma only when the list continues with "and", "or" or "to" to a final item, or when the label is plural. Never inherit when the comma starts a clause.
- **Verifier A (payment-engine lens): real, should fix.** "Under version 1, 2 of them were short [1]." fails: 2 inherits the version role across the comma.
- **Verifier B (reproduce lens): real, should fix.** "Under version 1, 2 of them were short [1]." fails (2 read as version). The base passes it, so this is a regression.

### CORR-14: The four-token quote rule passes a figure in a role the quote never gave it

- **Severity:** should fix. The reviewer and both verifiers agree.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. Not a regression. Shares a root cause with PE-3 and CORR-3.
- **File and line:** `packages/packets/src/roles.ts:526`, inside `quotedHolds()`, which starts at 496; the four-token rule follows the edge shortcut.
- **Detail:**
  - A figure in a role passes when four tokens around it match the quote, whatever role the narrative's words give it.
  - So a quoted days-to-pay figure passes as the dispute window.
- **Reproduction:** H, with `c = PP({statute:'Clean claims are paid within 33 days of receipt.'})`.

  | Input | Observed | Expected |
  |---|---|---|
  | `v('Disputes are raised within 33 days of receipt [1].', c)` | true (read as window_days; the window is 3650) | false |
  | Control without the quote's words: `Disputes are raised within 33 days` | fails | fails |
- **Recommended fix:**
  - For a figure in a role, require that the quote's own words give it the same role, by reading the quote with the same reader.
  - Alternatively, require the whole quoted clause, with the narrative's edges matching.
- **Verifier A (payment-engine lens): real, should fix.** With the statute 'Clean claims are paid within 33 days of receipt.', "Disputes are raised within 33 days of receipt [1]." PASSES as window_days (the window is 3650 days). The base gateway did not catch it either (0). So a wrong figure gets through a quote, but this is not a regression. It shares a root cause with PE-3's quote rule.
- **Verifier B (reproduce lens): real, should fix.** With the statute 'Clean claims are paid within 33 days of receipt.', "Disputes are raised within 33 days of receipt" PASSES as window_days (the window is 3650). Without the quote's words, "Disputes are raised within 33 days" fails, so the four-token quote match is the cause. The base also passes it.

### CORR-15: Regression: en-dash ranges fail ('Lines 1–3')

- **Severity:** should fix. The reviewer and both verifiers agree.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. It is a regression.
- **File and line:** `packages/packets/src/roles.ts:413`. At 1c423691, `listed()` is at 400 and `LIST_JOINERS` at `roles-words.ts:126`.
- **Detail:**
  - `LIST_JOINERS` has "to" and "through" but not the en dash.
  - So the number after the dash has no role.
- **Reproduction:** H, default content. The sentence uses U+2013, the en dash.

  | Input | Observed | Expected |
  |---|---|---|
  | `v('Lines 1–3 were short [1].')` | false (1 read as a row; 3 has no role) | true; the base passes it |
  | Variant: `Lines 1 to 3 were short` | passes | passes |
- **Recommended fix:** treat "–" and "-" between two numbers, after a label or row noun, as a range joiner. The tokenizer must keep the dash as a token.
- **Verifier A (payment-engine lens): real, should fix.** "Lines 1–3 were short [1]." fails: 1 is read as a row, and 3 gets no role.
- **Verifier B (reproduce lens): real, should fix.** "Lines 1–3 were short [1]." fails (3 has no role). The base passes it, so this is a regression. The variant "Lines 1 to 3" passes.

### CORR-16: A confusable letter in a cue removes the role silently, so a misfiled amount passes

- **Severity:** should fix. The reviewer recorded should fix. Verifier A gave should fix and Verifier B nit; the highest confirming severity is used.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. Not a regression.
- **File and line:** `packages/packets/src/readable.ts:1`.
- **Detail:**
  - `readableText` flags invisible characters only.
  - A Cyrillic letter inside "allowed" stops the word acting as a cue, so the amount reads as "any". No hidden_character mismatch is raised.
- **Reproduction:** H, default content. The "а" in "аllowed" is U+0430, Cyrillic small a.

  | Input | Observed | Expected |
  |---|---|---|
  | `v('The payer аllowed $100.00 per line [1].')` | true (amount/any; no hidden_character mismatch) | false, or a hidden-character or unreadable mismatch |
  | Control with the Latin "a": `The payer allowed $100.00 per line [1].` | false | false |
- **Recommended fix:** flag a letter from a script other than Latin inside a Latin word (a confusable check), or fold confusables to Latin before reading the cues.
- **Verifier A (payment-engine lens): real, should fix.** "The payer аllowed $100.00 per line [1]." (Cyrillic a) PASSES: $100.00 gets no role, and no hidden-character mismatch is raised. It needs an unusual character in the input, so it is less likely in normal use.
- **Verifier B (reproduce lens): real, nit.** "The payer аllowed $100.00 per line" (Cyrillic а) PASSES with no role and no hidden_character mismatch, while the Latin control fails. The base passes it too. It needs a deliberately confusable letter, so it is unlikely in normal drafting.

### CORR-17: The editor reads the narrative twice per keystroke

- **Severity:** nit. The reviewer recorded should fix; both verifiers gave nit.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. Duplicate of PE-9.
- **File and line:** `apps/web/src/components/packets/narrative-editor.tsx:22`. The two `useMemo` calls are at 21-24.
- **Detail:**
  - `checkNarrative` and `checkFigures` each build `narrativeFacts(content)` and run `readFigures(text)`.
  - `vocabulary()` is rebuilt on every read, so each keystroke reads the narrative twice.
- **Reproduction:** by inspection. `narrative-editor.tsx:22` has `useMemo(checkNarrative)` and line 24 `useMemo(checkFigures)`. `packages/packets/src/check.ts` calls `findMismatches` (with `checkFigures` inside it) and `checkedFigures`, and each calls `narrativeFacts` and `readFigures`. Observed: two readings per keystroke. Expected: one.
- **Recommended fix:** expose one call that returns `{check, figures}` from a single `readFigures`, and memoise `narrativeFacts(content)` separately.
- **Verifier A (payment-engine lens): real, nit.** Duplicate of PE-9. `check.ts` builds `narrativeFacts` and reads the narrative twice per keystroke. This is a performance cost with no wrong result.
- **Verifier B (reproduce lens): real, nit.** The same as PE-9: confirmed by inspection, the cost is performance only, and the two calls cannot drift.

### CORR-18: The property test has coverage gaps: single-cue sentences only, missing date roles, and the deadline role is never expected to pass

- **Severity:** should fix. The reviewer and both verifiers agree.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. Duplicate of PE-7; CRIT-1 adds reproductions.
- **File and line:** `packages/packets/src/roles.property.test.ts:127`. At 1c423691, `DATE_TEMPLATES` is at 117 and `roleOracle` in `role-examples.ts` at 418 (418-503).
- **Detail:**
  - The oracle (`role-examples.ts` `roleOracle`) is independent of `facts.ts` and `roles.ts`. The test is seeded (SEED 20261028) with a pinned numRuns, so it is deterministic.
  - But every template has one cue. There is no case with two or more cues where the value is held only in the farther cue's role, no year before a count noun, and no edge-delimited quoted figure.
  - `DATE_TEMPLATES` lacks due_date and as_of_date.
  - `roleOracle` never adds deadline, interest_rate, contract_percent or schedule_year, so the deadline template is only ever expected to fail.
- **Reproduction:**
  - Read `roles.property.test.ts` at `DATE_TEMPLATES` (the reviewer cited 127-133) and `role-examples.ts:418-503`; there is no `add('deadline', ...)`.
  - CORR-1, CORR-2, CORR-3 and CORR-4 all pass the current property suite (1603 tests green). Expected: a property fails on each.
- **Recommended fix:**
  - Add deadline, due_date, as_of_date, the percentages and schedule_year to the oracle.
  - Add two-cue templates (nearest role versus farther role), year-before-count-noun templates and edge-delimited quotes.
- **Verifier A (payment-engine lens): real, should fix.** Duplicate of PE-7. Every template has one cue, `DATE_TEMPLATES` lacks due_date and as_of_date, and the oracle never adds deadline, interest_rate, contract_percent or schedule_year.
- **Verifier B (reproduce lens): real, should fix.** Confirmed: the templates have one cue each, and `DATE_TEMPLATES` lacks due_date and as_of_date. The oracle's `add()` calls never include deadline, interest_rate, contract_percent or schedule_year. This duplicates PE-7.

### CORR-19: The packets-words mutation shard is still cancelled at CI's 30-minute limit

- **Severity:** blocking. The reviewer recorded should fix; both verifiers raised it to blocking.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. Duplicate of PE-5.
- **File and line:** `stryker/shards.json:53`.
- **Detail:**
  - In mutation run 40646243545 (2026-10-28, the latest for the branch), "stryker (packets-words)" ran from 06:55:15 to 07:25:33 and was cancelled, and the mutation job failed.
  - `docs/runbooks/ci.md` claims a time of 22 min 42 s.
- **Reproduction:** `gh run view 40646243545 -R PureTideWater/PhysicalTherapy --json jobs`. Observed: "stryker (packets-words)" cancelled. Expected: success.
- **Recommended fix:**
  - Either split `roles-words.ts` across two shards (the cue lists apart from the rest), or build the vocabulary once with per-word tests so the static mutants do not rerun every test.
  - The fix plan adds: do not raise the job's limit, and keep each shard under about 12 minutes locally on 4 shared CPUs.
- **Verifier A (payment-engine lens): real, blocking.** Duplicate of PE-5. packets-words was cancelled at the 30-minute limit and the mutation check failed at e3299ea2; nothing relevant changed by 1c423691. A required check is red.
- **Verifier B (reproduce lens): real, blocking.** The same CI evidence as PE-5: packets-words was cancelled at the 30-minute limit and the mutation gate failed, with no relevant change since. The red required gate blocks the merge.

### CORR-20: No total paid or total patient share is held, so a natural total fails

- **Severity:** nit. The reviewer and both verifiers agree.
- **Status:** confirmed. The reviewer reproduced it and both verifiers voted real. Not a regression.
- **File and line:** `packages/packets/src/facts.ts:254`. At 1c423691, paid is held per line at 251 and patient_share at 272.
- **Detail:** paid and patient_share are held per line only.
- **Reproduction:** H, default content (total paid $168.00; total patient share $42.00).

  | Input | Observed | Expected |
  |---|---|---|
  | `v('The payer paid $168.00 in total for the 3 lines [1].')` | false ($168.00 read as paid; no total held) | true |
  | `v('The patients owe $42.00 in coinsurance across the 3 lines [1].')` | false | true |
- **Recommended fix:** hold the sums of `paid_cents` and `patient_share_cents` as totals, under total roles (see CORR-7).
- **Verifier A (payment-engine lens): real, nit.** "The payer paid $168.00 in total for the 3 lines" fails ($168.00 read as paid), and "The patients owe $42.00 in coinsurance across the 3 lines" fails. No total is held. These fail closed.
- **Verifier B (reproduce lens): real, nit.** "The payer paid $168.00 in total for the 3 lines" and "The patients owe $42.00 in coinsurance across the 3 lines" fail. Both also fail at the base, so this is a gap in the facts, not a regression.

### CORR-21: The gateway notice names the first role in FIGURE_ROLES order, not the role the words gave

- **Severity:** nit. The reviewer and both verifiers agree.
- **Status:** confirmed. Both verifiers voted real. The reviewer did not reproduce it, and both verifiers found its own sentence gives single roles.
- **File and line:** `packages/model-gateway/src/functions/narrative-roles.ts:32`, `const role = figure.roles?.[0];`.
- **Detail:**
  - The notice uses `role = figure.roles?.[0]`.
  - With the cue union, a figure read as expected+allowed is always reported as "expected", whichever cue the sentence meant.
- **Reproduction:**
  - As recorded: `roleMismatches('The contract expected $70.00 and the payer allowed $100.00 [1].', content)`. The second figure's role would depend on `FIGURE_ROLES` order whenever the union holds more than one role. Not reproduced: this sentence gives single roles.
  - Variant (Verifier B): `roleMismatches('Under the contract, the payer allowed $56.00 per line [3].', assemblePacket(assemblyInput()))`. Observed: role "expected". Expected: "allowed", the cue nearest the figure, or all the roles.
- **Recommended fix:** report all the roles, or the nearest cue's role once CORR-1 is fixed.
- **Verifier A (payment-engine lens): real, nit.**
  - `narrative-roles.ts` uses `role = figure.roles?.[0]`. When the words give a figure two roles, the notice names whichever comes first in `FIGURE_ROLES` order (for example "expected" for expected+allowed), not the role the sentence meant. The docstring admits this.
  - The finding's own sentence has single roles, so the problem shows only with two cues. It affects the notice's wording only.
- **Verifier B (reproduce lens): real, nit.** The finding's own sentence gives correct single roles. The variant `roleMismatches('Under the contract, the payer allowed $56.00 per line [3].')` reports role "expected", though the words nearest the figure say "allowed". The wording is cosmetic, and it is moot once PE-1 is fixed.

### CRIT-1: The property tests never write an edge-delimited quoted figure or a year lead before a count noun, so PE-3 and PE-8 cannot be caught

- **Severity:** should fix (the critic's; no verifier pass).
- **Status:** confirmed by the critic's own reproduction. Not adversarially verified, so re-run the reproduction before relying on it. Extends PE-7 and CORR-18.
- **File and line:** `packages/packets/src/roles.property.test.ts:93`, in `NUMBER_TEMPLATES` (from line 91).
- **Detail:**
  - The fix plan's should-fix list names two property-test gaps that no other finding gave a reproduction for. PE-7 and CORR-18 name them in passing but reproduce only the one-cue templates and the missing date roles in the oracle.
  - First gap: every quoted text the generator writes puts its figure in the middle of a clause ("Section N of the SYNTHETIC agreement ...", "Disputes are raised within N days of the payment date.") or after a label. None has a figure that fills a whole clause between edges (a list such as "30, 45, 60"), which is exactly where `quotedHolds()` passes a figure in any role.
  - Second gap: no template puts a year lead ("the", "these", "for", "its") before a count noun, which is where `isYear()` turns the count into a year.
  - With both defects live, the suite stays green.
- **Reproduction:** at 1c423691, `pnpm exec vitest run packages/packets/src/roles.property.test.ts` passes all 4 properties. In the same run:

  | Content | Input | Observed | Expected |
  |---|---|---|---|
  | clause quote `97110 is paid 50.00 per unit. Payment terms: 30, 45, 60 days` | `The payer paid 45 days late [3].` | PASS (45 read as days_late) | a property fails on it |
  | same | `There were 45 claims [3].` | PASS (45 read as claims) | a property fails on it |
  | default | `The payer underpaid the 2026 claims [3].` | PASS | a property fails on it |
  | default | `The payer underpaid these 2036 claims [3].` | PASS (read as a year with no role) | a property fails on it |
- **Recommended fix:**
  - Have the generator also write quotes whose figures are edge-delimited (lists after a colon, comma-separated values), and assert that such a figure fails in any role its quote does not label.
  - Add `NUMBER_TEMPLATES` variants with a year lead before each count noun ("the {} claims", "these {} lines", "for {} patients"), with values drawn from the held years, and expect them to pass only when the count is held.
- **Verifiers:** none (critic finding).

### CRIT-2: A verb cue sets an amount's role and ignores the subject noun, so a wrong shortfall or allowed total passes

- **Severity:** should fix (the critic's; no verifier pass).
- **Status:** confirmed by the critic's own reproduction. Not adversarially verified. Not a regression, and a nearest-cue fix for PE-1 alone does not cure it.
- **File and line:** `packages/packets/src/roles.ts:265`. At 1c423691, `cued()` is at 267 and `since()` at 256.
- **Detail:**
  - `cued()` reads `AMOUNT_CUES` only in `since()`: the words between the previous figure and this one.
  - When the subject has its own figure in front of it ("The shortfall of $30.00 per line ..."), the subject is cut off. The only cue left is the verb ("comes to", which names expected), so the total is checked against the expected amounts.
  - $300.00 is the expected total, so it passes, although the sentence states it as the shortfall; the real shortfall total is $90.00. An allowed total fails the same way ("allowance of $70.00 per line comes to $300.00", where the allowed total is $210.00).
  - This is not PE-1's union: only one cue is in range, so making the reader take the nearest cue would not fix it.
  - The base passes these too, so it is not a regression. But the PR claims every figure is read in the role its words give it, and here a wrong dispute amount reaches the payer.
- **Reproduction:** `narrativeSpec.verify`, via a temporary vitest probe in `packages/model-gateway/src/functions` (PE harness). Default content: per line $100.00 expected, $70.00 allowed, $30.00 short; totals $300.00, $210.00 and $90.00.

  | Input | Observed at 1c423691 | Base 83d71fd6 | Expected |
  |---|---|---|---|
  | `The shortfall of $30.00 per line comes to $300.00 [3].` | PASS ($300.00 read as expected) | passes | fail (the shortfall total is $90.00) |
  | `The payer's allowance of $70.00 per line comes to $300.00 [3].` | PASS ($300.00 read as expected) | passes | fail (the allowed total is $210.00) |
- **Recommended fix:**
  - When the words since the previous figure hold no role noun, also read the clause's subject noun phrase before the earlier figure (shortfall, allowance, interest, patient share).
  - Where the subject's role and the verb cue's role differ, the subject wins.
  - Add these sentences to `roles.test.ts`, and a two-cue template to the property test.
- **Verifiers:** none (critic finding).

### CRIT-3: A date that comes after another figure, or opens the sentence, is checked against no role, so a wrong payment date or deadline passes

- **Severity:** should fix (the critic's; no verifier pass).
- **Status:** confirmed by the critic's own reproduction. Not adversarially verified. Not a regression; it is the date counterpart of PE-4, and the single-cue fix for PE-4 would not cover it.
- **File and line:** `packages/packets/src/roles.ts:265`. At 1c423691, `cued()` is at 267, `since()` at 256 and `after()` at 261.
- **Detail:**
  - A date's role comes only from `since()`, which stops at the previous figure, and from `after()`, which looks only at the word right after the date.
  - So the most common English word orders give the date no cue at all: a date after an amount or count ("paid $56.00 on <date>"), and a date that opens the sentence ("On <date> the payer paid").
  - With no cue, the date reads as "any" and passes if a date in any role holds it. A service date then passes as the payment date or a deadline, and the deadline passes as the payment date.
  - In each probed sentence, the date reads with no role and passes. The control "The payer paid on 2026-03-05" fails, as it should.
  - The base passes these too, because it held dates to no role. But this is the date version of PE-4: a wrong deadline reaching the payer.
- **Reproduction:** `narrativeSpec.verify` (PE harness), default content: service dates 2026-03-05 to 03-07, paid 2026-04-08, deadline 2036-04-05.

  | Input | Observed at 1c423691 | Base | Expected |
  |---|---|---|---|
  | `The payer paid $56.00 on 2026-03-05 [3].` | PASS (date read with no role, "any") | passes | fail |
  | `On 2036-04-05 the payer paid $56.00 per line [3].` | PASS | passes | fail |
  | `The payer paid 3 lines on 2036-04-05 [3].` | PASS | passes | fail |
  | `We dispute $90.00 by 2026-03-05 [1].` | PASS | passes | fail |
  | Control: `The payer paid on 2026-03-05 [3].` | fail (paid_date) | n/a | fail |
- **Recommended fix:**
  - For dates and years, let the clause's verb cue reach past a figure that has no date role: read the date's cues over the whole clause, up to the edges on both sides (as `dayRoles()` does), or across the amount before it.
  - For a date that opens the sentence, read the cue words after it, up to the next figure or edge.
  - Add property templates with the date after an amount, and with the date first.
- **Verifiers:** none (critic finding).

### CRIT-4: Regression: a correct deadline written after 'days after payment' or 'days of payment' fails, because the date is read as a payment date

- **Severity:** should fix (the critic's; no verifier pass).
- **Status:** confirmed by the critic's own reproduction. Not adversarially verified. It is a regression, the deadline counterpart of PE-6 and CORR-10.
- **File and line:** `packages/packets/src/roles.ts:250`. At 1c423691, `since()` is at 256 and `DATE_CUES` at `roles-words.ts:309`.
- **Detail:**
  - `since()` reads back past commas and colons, and `DATE_CUES` maps "payment" to paid_date.
  - In the usual way of stating the window ("3650 days after payment, on <deadline>"), the deadline date therefore takes only the paid_date role, and it fails although it is the record's deadline. The base passes these sentences.
  - A fix that only adds a schedule_year cue would not cover this.
  - It also makes the gateway refuse a correct model draft.
- **Reproduction:** `narrativeSpec.verify` (PE harness), default content (window 3650 days, deadline 2036-04-05).

  | Input | Observed at 1c423691 | Base 83d71fd6 | Expected |
  |---|---|---|---|
  | `The window ends 3650 days after payment, on 2036-04-05 [1].` | fail (2036-04-05 read as paid_date, figure_not_in_input) | passes | pass |
  | `The dispute deadline is 3650 days after the payment date, 2036-04-05 [1].` | fail | passes | pass |
  | `Disputes are due within 3650 days of payment, by April 5, 2036 [1].` | fail | passes | pass |
  | Control: `Payment was made on 2026-04-08, so the window closes on 2036-04-05 [1].` | pass | n/a | pass |
- **Recommended fix:**
  - Do not let a cue that belongs to an earlier figure's phrase ("days after payment", "days of payment") name the role of a date after a comma.
  - For dates, stop `since()` at an edge, or give a date the deadline role when the clause has a deadline cue ("ends", "deadline", "due", "window") before the day count.
  - Add these sentences as passing cases.
- **Verifiers:** none (critic finding).

## Refuted findings

No finding was refuted: all 34 reached the two votes needed. The refutations recorded inside confirmed findings are listed below. The fix round should read them before trusting the original claims.

### Claims refuted inside confirmed findings

- **CORR-5, whole finding:** Verifier B voted not real (should fix). Its reason: ADR 0086 (lines 83-87 and 113-114) and the design (lines 376-378 and 420-421) defer the `tp-packet-verifier/3` bump to Lane A on purpose. The export's re-check refuses such a version with `verifier_failed`, and no real version exists before launch, so this is "intended and tracked, not a defect of this PR". It stays confirmed on the reviewer's reproduction and Verifier A's vote. The fix plan asks for the handler and display parts in this PR, and leaves any Postgres part to Lane A.
- **CORR-4, the example as written:** "The payer paid 3650 days late and we dispute within 187 days [1]." fails for both verifiers, because 187 was not held in their content. The defect reproduces with the held value (24) in either order.
- **CORR-8, the base claim:** "The first unit was paid at the contract rate [1]." fails at the base too (Verifier B), so for that sentence it is not a regression. "This is the second appeal on these lines" is a regression.
- **CORR-9, the base claim:** "The patient paid $14.00 of the $70.00 allowed [1]." and "We request payment of the $90.00 balance within 30 days [1]." fail at the base too (Verifier B). Only the first three sentences are regressions.
- **CORR-21, the example:** its own sentence gives single roles and does not show the defect (both verifiers). Verifier B's variant does.
- **CORR-1, third sentence:** the base also passes "The contract requires more than the payer paid: $56.00 [1]." (both verifiers), so that sentence is not a regression. The first two are.
- **CORR-3, the window case:** the base also passes "The payer paid 90 days late [1]." with the "Time to dispute: 90 days." quote (Verifier B). The $50.00 case is a regression.
- **CORR-6, regression scope:** the base passes the "respectively" and "per line ... in total" sentences (Verifier B). Only the "not the contract amount" sentence is a gateway regression.
- **PE-2, the systematic count:** Verifier A's own template set gave 198 of 240 caught by the base, not 246 of 246. It still found 0 caught by the new gate.
- **PE-3, regression scope:** the base also passed the code-list cases, though it had no day or page roles (Verifier B). "There were 90 units", "Release 24" and the $50.00 cases are regressions.
- **PE-9, drift claim:** Verifier B says the two calls run the same function on the same input, so they cannot drift; the cost is performance only.
- **Not regressions** (both the base and the head pass the wrong figure, or both fail the right one), though each is still a defect: PE-4, CORR-7, CORR-14, CORR-16, CORR-20, CRIT-2 and CRIT-3.

### Checked and not reported

- The critic checked counts written as years before "payments", "disputes" and "remittances". They pass at both the base and the head, and "2026 payments" can fairly be read as a year, so it did not report them.

## Mapping to what survived

### The 2026-10-28 summary (status file, entry of 07:45; plus the 07:25 CI entry)

| 2026-10-28 item | Finding ids | Note |
|---|---|---|
| Payment-engine blocking 1: an amount, date or day count takes the union of its clause's cues, so a dispute stated backwards passes | Amounts: PE-1, CORR-1. Dates, pages, percentages: PE-4. Day counts: PE-4, CORR-4. Related: CORR-6, CRIT-2, CRIT-3, CRIT-4 | All confirmed. CRIT-2 and CRIT-3 are not union defects, and a nearest-cue fix alone does not cure them. |
| Payment-engine blocking 1, second half: the gateway's pre-call check regressed against the base | PE-2. Also the gateway parts of PE-1, PE-3, PE-8, CORR-1, CORR-6, CRIT-4; CORR-21 (the notice wording) | Confirmed. The base caught 246 of 246 swaps (198 of 240 in Verifier A's set), and the new gate catches 0. |
| Payment-engine blocking 2: a whole-clause quote match passes in any role | PE-3, CORR-3. Related: CORR-14 | Confirmed. |
| Payment-engine: 1 should fix | Not named in the summary. Regenerated payment-engine should-fix findings: PE-6 and PE-7. PE-8 was recorded at should fix by the reviewer and raised to blocking. | Which one 2026-10-28 meant cannot be told. |
| Payment-engine: 1 nit | PE-9 | Confirmed. |
| Correctness blocking 1: the cue union | CORR-1 (= PE-1), CORR-4 (day counts) | Confirmed. |
| Correctness blocking 2: a year lead beats a count noun, reopening "2026 claims" | CORR-2, PE-8 | Confirmed. Recorded as blocking. |
| Correctness: 5 should fix | Not named in the summary; the fix plan's list (below) carries them. Regenerated correctness should-fix findings: CORR-7 to CORR-16 and CORR-18. CORR-6 and CORR-19 were raised to blocking, and CORR-17 lowered to nit. | |
| Correctness: nits | Not named. Regenerated: CORR-20, CORR-21 (and CORR-17 at nit). | |
| UX blocking: a version the new reading fails still shows "Verifier passed" and can be approved | CORR-5 | Confirmed 2 votes to 1 (Verifier B: intended by ADR 0086). |
| UX: 6 should fix, 2 nits | None. The UX review was not regenerated. | The fix round's UX review on the shots covers these; see fix plan item 17 below. |
| 07:25 CI: the packets-words shard was cancelled at the mutation job's 30-minute limit | PE-5, CORR-19 | Confirmed. Recorded as blocking. |

### The fix plan's list ("In particular", `workflow-scripts/lane-b-packet-day-counts-fix-round-wf_c661e0c2-b5e.js`, lines 20-27)

| # | Fix plan item | Finding ids |
|---|---|---|
| 1 | One role per figure, not the union of the clause's cues: the noun right after it first; else the nearest cue, with a verb cue for the payer's action winning over a noun cue for its object | PE-1, CORR-1, CORR-6; CRIT-2 (subject versus verb cue: the "nearest cue" rule alone leaves it open) |
| 2 | Day-count cues the same | PE-4, CORR-4 |
| 3 | The gateway's pre-call check at least as strict as the base's for every swap the base caught (prove it by running the base's `narrative-roles.ts` and the new check over the same probes) | PE-2 (its probe set: PE-1's 246 generated swaps plus PE-2's hand-written list), CORR-21 |
| 4 | Quoted texts: no whole-clause pass in any role (the clause-edge rule) | PE-3, CORR-3 |
| 5 | "No quoted figure is a role fact" | PE-3 (the fee-clause $50.00 passing as paid), CORR-14 (a quoted days-to-pay figure passing as the window). No finding tests this rule on its own. |
| 6 | A count noun after a year wins over the year lead ("2026 claims" fails against a 2026 date) | PE-8, CORR-2 |
| 7 | Per-line values versus totals | CORR-7; related CORR-20 (no paid or patient-share totals) and CRIT-2 (a total checked against the wrong role) |
| 8 | "respectively" | CORR-6; PE-1 (the "respectively" row of its reproduction) |
| 9 | Ordinals before other nouns ("the sixth unit") | CORR-8, PE-6 |
| 10 | Natural sentences that fail: "the first 3 claims" | PE-6, CORR-9 (with partitives, "patient paid" and "payment of") |
| 11 | Natural sentences that fail: a fee-schedule year after a payment cue | PE-6, CORR-10; the deadline counterpart is CRIT-4 |
| 12 | Natural sentences that fail: business days | CORR-11 |
| 13 | List inheritance | CORR-13; related CORR-15 (en-dash ranges, a regression) |
| 14 | The four-token quote rule | CORR-14 |
| 15 | "appeal" as a label | CORR-12 |
| 16 | The editor: one reading per keystroke (no double read) | PE-9, CORR-17 |
| 17 | The editor's words the UX review asks for: say what the records hold the figure as; plain words, not "in the role its words give it"; no rule-release example; mono for counts; shorter items at 390 px; a live region that does not re-announce everything on each keystroke | None. These are UX review items, and the UX review was not regenerated. |
| 18 | UX blocking: a version the current reading fails must not show "Verifier passed" and must not be approvable. Re-run the verifier in the approval handler and wherever the badge is shown; any Postgres part is a migration for Lane A. | CORR-5 |
| 19 | Property tests: sentences with two or more cues where the figure is held only in the farther one's role | PE-7, CORR-18 |
| 20 | Property tests: edge-delimited quoted figures | CRIT-1 (named in PE-7 and CORR-18 without a reproduction) |
| 21 | Property tests: the year lead before count nouns | CRIT-1 (likewise) |
| 22 | Property tests: the missing date roles in the oracle | PE-7, CORR-18 |
| 23 | Property tests seeded per the repo's convention; run each property over many seeds (for example 40) and report zero failures | No defect. CORR-18 records that the test is already seeded (SEED 20261028) with a pinned numRuns, and that its oracle is independent of the reader. |
| 24 | CI: split the packets-words vocabulary by word family into shards, each under about 12 minutes locally; do not raise the job's limit | PE-5, CORR-19 |
| 25 | Update ADR 0086 and its amendments, the design's section 7, and the CAS-43/CAS-44 rows; add every review reproduction as a named CAS-43/CAS-44 example | Process, not a finding. Every reproduction in this file is meant to become a named example. |

### Findings on neither list (new in this regeneration)

- CORR-4's swapped day counts and its false failure ("within 33 days").
- CORR-15: en-dash ranges, a regression.
- CORR-16: a confusable letter in a cue.
- CORR-9: the partitive, "patient paid" and "payment of" sentences.
- CORR-20: no paid or patient-share totals.
- CORR-21: the gateway notice names the wrong role.
- CRIT-2: a verb cue ignores the subject noun.
- CRIT-3: a date after a figure, or opening the sentence, gets no role.
- CRIT-4: a correct deadline after "days after payment" fails, a regression.
- The percentage, page and due-date parts of PE-4.

## Re-review of the fix round, 2026-11-04 (acting S2; wf_4ca2cf69-8dc, delta 1c423691..ac727b15)
Each finding checked by two skeptics (reproduce; intent and scope). The payment-engine review returned no result (it ran out of room on a fuzz dump); it is redone at d7d587a2 in round 2 (wf_d831f69a-b19).
| Id | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| CORR-D1 | blocking | A "respectively" list with its cues after it: the swapped dispute passed, the correct one failed (CORR-6 incomplete; the gateway shares the reader). | Fixed in d7d587a2 (cues after the list map in order); rechecked fixed. |
| CORR-D2 | should fix | "per line"/"in total" beside a "respectively" list applied to one figure only. | Fixed in d7d587a2 (amountScope); rechecked fixed. |
| UX-D1 | should fix | "Fails now" said "cannot be approved" on an approved, exported or earlier version. | Fixed in d7d587a2 (wording by state; Export blocked alert); rechecked fixed. |
| UX-D3 | nit | The refusal listed mismatches by kind only, repeated items, nested colons. | Fixed in d7d587a2; rechecked fixed. |
| UX-D2, UX-D4 | nit | Counts not in mono; an internal role named. | Refuted (one of two skeptics). |
| NEW-N1 | blocking | d7d587a2's list scope reaches past the clause edge, so a total read as per line passes (regression). | Round 2. |
| NEW-N2 | should fix | A scope stated with each cue after a list is flattened to one. | Round 2. |
| NEW-N3 | nit | Export-blocked and hash-only texts name marked figures when none are marked. | Round 2. |
The UX review read code only this round (no screen tour capture).
