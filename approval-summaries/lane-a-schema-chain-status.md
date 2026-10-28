# Lane A schema chain: build status (SS-01, SUITE-CAP-1b, the interest fix)

Session: https://claude.ai/code/session_019i9ifCi6u3MV8sy7oAhUmy (started 2026-10-27 ~20:35 UTC by Lane A's orchestrator,
session_01TrKDxeLbxVo7t7zwRXFzrg, for the co-founder). Brief: `lanes/lane-b-session-brief.md`, with the schema-chain
differences in the session's prompt (this session adds migrations through the new-migration marker route; never the
approval line or approvers.json; one schema PR open at a time; no schema PR merges without the founder's approval).
GitHub login: PureTideWater.

## Now
- **2026-10-27 20:45 UTC.** Machine OK (tools/setup-container.sh, every line ok, Playwright's Chromium included).
  Worktree `/home/user/ss01` on `co-001/ss-01-suspension-refusal`, cut from #42's head 098636e3 and pushed.
  #42's fix round is on `co-001/wip-pr42-*`; its new head is merged into SS-01 with a merge commit as it moves.
- **Running: wf_8ee54e2b-824 (ss01-build; script `workflow-scripts/lane-a-ss01-build-wf_8ee54e2b-824.js`), from
  2026-10-27 20:45 UTC:** the design re-read against #42's 098636e3 (one reviewer), builder D (the migration
  20261108090000 via the marker route, packages/db, domain model, function files), then W (worker, SS-08), C (console),
  P (wrapper, customer surfaces, seed, e2e) and M (ADR 0080, amendments, matrix, synth) in parallel, then the
  integrator (adversarial seam read, the full local suite once, one push; no PR). Progress files in the session's
  scratchpad `progress/ss01-*.md`. Safety check-in: see below.
  If stopped: re-run the setup script if PostgreSQL is down, remove a leftover `/home/user/ss01/.claude/.allow-protected-edit`,
  resume with resumeFromRunId (same session only).
  At 21:25 UTC builder D had pushed d213416b (BIL-07/08 db tests, 39 failing on the base) and 7da01015 (the migration,
  domain model and function files); W, C, P and M were building.
- **Running: wf_6e2dedb0-b5e (suitecap1b-reread, one agent)** from 21:26 UTC: SUITE-CAP-1b's design re-read against
  SS-01's head, #42's and part 1a's state (light; no build yet).
- **Never force a push, WIP branches included** (the orchestrator, 21:31 UTC): a diverged WIP ref goes to a fresh name
  (co-001/wip-<item>-2, ...), recorded here.
- **SUITE-CAP-1b re-read done (wf_6e2dedb0-b5e, 21:38 UTC): build with deltas** (`approval-summaries/lane-a-suitecap1b-reread.json`):
  line_status_head gets an `id` primary key plus the unique index line_status_head_once (the cross-tenant factory needs a
  single-column key); one combined NOWAIT lock loop over claim and line_status; fields.test.ts's unit regex gains `mib`;
  JOB_HEAP_MESSAGE/METRIC in infra/lib/jobs.ts; CAS-40.7 migrates a partial set; claim_by_superseded stays in 1b and the
  interest PR drops its object 5. CAS-42 and the slice-1 gate need part 1a's readers, so they run after 1a merges
  (1a has no remote branch yet). Decision (recommended): build 1b's other slices on SS-01's branch after SS-01's build
  and #42's merge, so nothing waits idle; regenerate everything on the final tree.
- **#42 moved to 6f23c42b** (38 commits past 098636e3; mail_streams.sql +163/-62). After SS-01's builders finish: merge
  it into SS-01 (merge commit), re-check the audit_event_record policy body SS-01 recreates, regenerate the domain model
  and function files, re-run the affected db tests.
- **22:20 UTC: a container restart stopped wf_8ee54e2b-824 in its integrator** (after every builder had pushed, to
  3b26e73f; the integrator's checks, seam read and domain-model check done: SHA-256 12b0e87d…, approval line 7407; its
  revert of an out-of-scope comment in standing.ts committed locally as d763ba78; suite part 1 lost). Setup re-run (OK),
  no marker left, the script given a RESUMED note and **resumed at ~22:27 UTC** (the six finished agents from cache).
- **~23:00 UTC: the account's 5-hour limit stopped the integrator in part 3; then a second container restart.** At
  d763ba78 the full local suite had passed: unit 6,439 passed, 1 failed (apps/worker/src/web-entries.test.ts, which
  fails identically on 098636e3: #42's, fixed by #42's 15189a50 guard), 4 skipped; golden 376; oracle 687 fixtures agree;
  test:db 4 shards 9,489 passed, 1 skipped, 0 failed; build; e2e 59 passed; Stryker packets-scan and its gate; content,
  synth and fixtures checks; domain model --check exact (99 tables, 375 function files, SHA-256 12b0e87d…, line 7407).
  Scope: 86 paths, all the design's section 13, tests or generated.
- **Resumed 2026-10-28 00:20 UTC** (the orchestrator's RESUME of 00:15): setup re-run (OK), no marker, the integrator
  given a second RESUMED note to run only Stryker packets-rest, packets-explain, pricing-engine, pricing-recompute,
  pricing-rest, the gate, then scope and its one push. Check-in moved to trig_015zUyNTQAE48NHK4vYz3Sw6 at 05:25 UTC.
- **00:25 UTC: wf_8ee54e2b-824 finished** (result: `approval-summaries/lane-a-ss01-build-result.json`); its integrator
  returned before Stryker's last five shards ran and before its push, so the session runs them itself
  (`scratchpad/ss01/suite/part3b.sh`, background, at d763ba78). Scope 74 paths at d763ba78, all section 13, tests or
  generated; one migration; nothing frozen touched. Handed-to-Lane-A items (a) to (j) are in the result's open items for
  the orchestrator (mail + Q13 PR next after SS-01; the tp_app status REVOKE after deploy; closure lifecycle and firm
  billing to milestone 12; UX PRs 78, 79, 57; model calls not refused).
- **01:04 UTC: SS-01's full local suite complete at d763ba78** (Stryker packets-rest, packets-explain, pricing-engine,
  pricing-recompute, pricing-rest, each with its gate, and the six-shard gate: all exit 0); **d763ba78 pushed.**
- **Running: wf_8bd6852a-2dd (script `workflow-scripts/lane-a-ss01-merge42-sc1b-build-wf_8bd6852a-2dd.js`), from
  01:07 UTC:** (1) #42's head (6f23c42b or newer) merged into SS-01 with a merge commit, generated files regenerated,
  SS-01's recreated objects re-read on #42's new body (the audit_event_record policy first), typecheck, lint, unit,
  test:db 4 shards, domain model, content, synth; push. (2) SUITE-CAP-1b on `co-001/suite-cap-1-triage-locks`
  (worktree /home/user/sc1b) cut from that merge: database (migration 20261109090000 with the re-read's deltas and 4.5
  under the granted Q1; CAS-40 first), then the heap line and alarm, CAS-42.3 and the harness code, documents
  (reconciliation-001's Q1 exception word for word), then the integrator (database suite; push; no PR).
  **Deferred until part 1a merges** (1a still building in session_019i9ifDUYaz9Hta77Vukkzo): the measurement gate
  (slice 1), CAS-42.1 and .2, the harness's real-size runs, ADR 0083's 1b section (1a creates the file), then 1b's
  full local suite.
- **03:55 UTC: wf_8bd6852a-2dd done** (result `approval-summaries/lane-a-ss01-merge42-sc1b-build-result.json`):
  - **SS-01 with #42's 6f23c42b merged: head f5bd6201** (pushed). Only conflict the generated domain model
    (regenerated). #42's new commits leave the audit_event_record policy, the organization table and SS-01's functions
    alone: SS-01's migration unchanged. Typecheck, lint (1,654), lint:copy, lint:logs, unit 6,492 passed + 4 skipped
    (web-entries.test.ts now passes), test:db 9,500 + 1 skipped (restore-drill's pg_dump 16 vs PG 18, environmental),
    billing.spec 6 passed, content, synth, fixtures. **Domain model SHA-256 6559c5b9…c2fadc, approval line 7413.**
  - **SUITE-CAP-1b: head 358dc53f** on `co-001/suite-cap-1-triage-locks` (worktree /home/user/sc1b): migration
    20261109090000 (line_status_head with id PK and line_status_head_once; one NOWAIT loop over claim and line_status;
    claim_by_superseded; line_status_rules as a definer writing the head row; 4.5's two ledger triggers on the practice's
    ledger: key, their files differing only in the lock line); CAS-40 15 tests (failed 15 of 15 on f5bd6201, pass after);
    heap line and alarm; CAS-42.3 and the harness code; ADR 0038 note, matrix and registry rows CAS-40 and CAS-42,
    runbooks, reconciliation-001's Q1 exception word for word. Checks: typecheck, lint 1,659, lint:copy, lint:logs,
    unit 6,522, golden 376, test:db 9,539, ledger oracle 10/10 unchanged, infra 702, content, synth, engine-freeze clean;
    scope 41 files. **Domain model SHA-256 81d0ac76…254065, approval line 7458.**
  - Decisions taken (recommended; recorded for the PR description and ADR 0083):
    - **line_status_head grants SELECT to tp_app** (the design said no grant): the access and cross-tenant suites read
      every tenant table as tp_app and must not be loosened; RLS forced, practice policy, no write grant to any role,
      CAS-40.8 asserts the exact ACL. Safer than exempting the table from the tenancy tests.
    - **CAS-42.3 runs 2,000 lines by default** (TP_LARGE_RECONCILE_LINES sets any size): a reconcile pass grows faster
      than its lines for reasons other than locks (6,000 lines 341.8 s), so 20,000 cannot fit a CI shard. Its lock
      bound (at most 1 advisory lock per backend) is the point under test and holds.
    - CAS-42.3's 835s come from LED-06's synthetic segments (no new @tp/synth dependency in the worker).
  - **Proposal (for the orchestrator; a new item, not this PR):** reconcile performance at real size: candidatesFor's
    two queries per open case line per pass (the by-patient one decrypting every claim of a code and date), claimLines'
    recursive read per line, syncLineStages' one-row stage inserts each refreshing the case. Until then the weekly
    run's step 7b at full size is expected to fail its attempt check. It sits beside the ledger freeze.
  - **Deferred until part 1a merges:** slice 1 (the measurement gate), CAS-42.1 and .2 (with SLOW_FIRST and
    tools/test/db-shards.test.ts's count, reconcile.large added beside triage.large), the harness's real-size runs
    (they need an 8-CPU runner: this container's 4 CPUs stop as RUNNER_TOO_SMALL), ADR 0083's 1b section, the shared
    documents merged with 1a's CAS-41 rows, then 1b's full local suite and a fresh domain model.
- **Superseded:** when Stryker and its gate pass, push d763ba78; then merge #42's head 6f23c42b into SS-01 (merge commit;
  domain model and function files regenerated, never hand-merged), re-check, push; then SUITE-CAP-1b's build on it.
- **Then:** read the build's result; the PR waits for #42 to merge (then merge #42's head and the latest
  claude/build-platform in, regenerate, open the draft PR, two reviews: security and tenancy, UX and brand).

## Items
| # | Item | Branch | State |
| --- | --- | --- | --- |
| 1 | SS-01 (`designs/ss-01-suspension.md`; ADR 0080; BIL-07 to BIL-10; synth module 15) | `co-001/ss-01-suspension-refusal` (on #42's branch) | Built; full local suite passed; #42's 6f23c42b merged (f5bd6201); PR waits on #42's merge |
| 2 | SUITE-CAP-1b (`designs/suite-cap-1-triage-locks.md` part 1b; ADR 0083; CAS-40, CAS-42) | `co-001/suite-cap-1-triage-locks` (on SS-01's); the ledger part (section 4.5) goes in the PR: Q1 granted | Built but the 1a-dependent parts (358dc53f); waits on 1a and SS-01 |
| 3 | The interest fix (`designs/ledger-interest-once.md`; ADR 0084; LED-23 to LED-25; synth module 6) | `co-001/ledger-interest-once` (on SUITE-CAP-1b's) | Not started; exception granted, PR opens after SS-01 and SUITE-CAP-1b merge |

## Decisions taken (recommended option; security: the safer), with reasons
- None yet.

## Waiting on someone
- #42's merge (SS-01's PR opens after it).
- The founder: each schema PR's domain-model approval.

## Rulings received
- **Founder (Tyler Williams), relayed by the co-founder, 2026-10-27 20:49 UTC** (`approval-summaries/founder-asks-2026-10-27.md`
  line 3; the orchestrator's message ~20:50 UTC): "Granted: the ledger freeze exceptions in designs/ledger-interest-once.md
  section 10.1 and designs/suite-cap-1-triage-locks.md section 4.5, as written." Each PR records it word for word, with
  who and when, in its ADR (0083, 0084) and reconciliation-001, and stays within the granted text.

## Log
- 2026-10-27 20:45 UTC: session started; setup OK; SS-01 branch cut from #42's 098636e3 and pushed; wf_8ee54e2b-824 started.
- 2026-10-27 20:52 UTC: both ledger freeze exceptions granted (above); SUITE-CAP-1b's ledger part goes into its PR, no WIP branch.
- 2026-10-27 21:26 UTC: SS-01's database slice pushed (d213416b, 7da01015); SUITE-CAP-1b re-read started (wf_6e2dedb0-b5e).
- 2026-10-27 21:40 UTC: SUITE-CAP-1b re-read: build with deltas; #42 at 6f23c42b, to merge into SS-01 after its build.
- 2026-10-27 22:27 UTC: container restart; setup re-run; wf_8ee54e2b-824 resumed in its integrator.
- 2026-10-28 00:20 UTC: resumed after the usage limit and a second restart; integrator finishing Stryker and pushing.
- 2026-10-28 00:27 UTC: SS-01 build workflow done; Stryker's remaining shards running in the session.
- 2026-10-28 01:07 UTC: SS-01 suite complete, d763ba78 pushed; wf_8bd6852a-2dd started (merge #42; SUITE-CAP-1b build).
- 2026-10-28 03:58 UTC: #42 merged into SS-01 (f5bd6201); SUITE-CAP-1b built but its 1a-dependent parts (358dc53f).
