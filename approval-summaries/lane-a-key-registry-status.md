# Status: Queues item 37, the key registry (Lane A)

## RESUME-BLOCK (2026-11-13, W68, session_019i9ifAYEWMkE9HKeMwZM8p; HANDED OVER at 12:45 UTC past the token mark): DRAFT PR #162 IS OPEN with the suggested approval line; a fresh session takes ONLY THE MERGE after the founder's commit of the line

**PR #162** `co-001/key-registry` db5d9f66 into claude/build-platform (base 17c234d2 merged in), draft. The suggested
approval line: https://github.com/PureTideWater/PhysicalTherapy/pull/162#discussion_r4563007837 (one comment, line
7864 of docs/product/domain-model.md; document SHA-256 c06bdce5...b78c765). W68 is subscribed to the PR.
**Done:** both typed /new-migration commands (a person typed them): `20261116090000_key_registry.sql` (every text by
`designs/lane-a-key-registry-reviews/w68/apply-texts.py`, byte-equal to the proved copy, then the header's lists) and
`20261116091000_key_registry_validate.sql`; N-1 taken (both triggers read the third; SGN-31 (g)); SEC-25's lists,
PROVIDER_SIGN_OUT_REASONS, SGN-22's filter, the owed-red notes dropped, matrix rows SGN-28 to SGN-31, SEC-28, JOB-09
and their fixtures, ADR 0095's new section and corrected residuals, the domain model and function files regenerated.
**The full suite, once, on db5d9f66's tree (PostgreSQL 18, Node 24):** unit 14843 passed, 4 skipped; db 10672 passed,
1 skipped, 0 failed; golden 381; e2e 88; typecheck, lint, lint:logs, verify-content pass.
**Seen in a browser:** the request form's four refusals, in place with their words. W53's walk (`capture.ts`) is
stale and was NOT re-run whole: it needs a third administrator aged (N1), `.first()` on the "key removal requested"
badge (the narrow layout's hidden copy) and the button name "Cancel removal request for ...".
**CI on db5d9f66 (12:20 UTC):** green but for `domain model` (the blank approval line only; its log says the
document and the 431 function files match the schema, hash c06bdce5...) and `all green`, which follows it; unit, db
4/4, e2e 2/2, build, lint, static, images, approval-of-record and the finished stryker shards pass; `capacity` and
`stryker (packets-scan)` were still running. W68 is unsubscribed, holds no scheduled task and no subagent.
**THE MERGE SESSION, exactly:**
1. Wait for the founder's OWN commit of the approval line on `co-001/key-registry` (the suggestion on line 7864 of
   docs/product/domain-model.md: `Approved by: Tyler Williams  Date: <the day he commits>  Document SHA-256:`
   `c06bdce55841bac4551a6f33b150b71c3bca6d7e23105bc60e6424e42b78c765`). Never write it; never approve or review.
2. On HIS commit: the required checks green (`all green`, `mutation`, `screening-capacity gate`,
   `approval-of-record`), `domain model` now green. If claude/build-platform moved past 17c234d2 and GitHub asks
   for an up-to-date branch, say so to the orchestrator first: a merge commit after his dismisses the approval.
   A unit job red only on redact.leaks.test.ts:1027 or denial-letter.test.ts:435/:447 timeouts: re-run once, note it.
3. Mark #162 ready, merge it (a merge commit, as #160 and #161), verify on the base: the two migrations
   `20261116090000_key_registry.sql` and `20261116091000_key_registry_validate.sql` are in
   origin/claude/build-platform and its domain model's last line carries his line.
4. Write here, at the top: FINAL STATE: MERGED (the merge commit, the time) and the queue list below unchanged;
   `lanes/STATE.md` as the orchestrator says; push ops from the hooked checkout
   (`cd /home/user/PhysicalTherapy && git push origin claude/build-ops`; pull --rebase on a refusal); one line to
   the orchestrator; unsubscribe; stand down. The WIP ref `co-001/wip-key-registry` (db5d9f66, the same commit) and
   `co-001/wip-key-registry-screens` are left for the orchestrator to delete.
No commit after his unless a required check is red, said first.

### Queue list (none taken)
- W67 N-2 and N-3; the third counted only if seven days in the role; `hardware_key_removal_target_acts` without words
  in `KEY_REFUSALS`; `now()` against `clock_timestamp()`; no index on `hardware_key_removal (requested_by)`; a cancel
  by another administrator untested; the expiry job's lock order and the unwatched columns not verified by review;
  the screen walk's script to be brought up to date and re-run; SGN-24's matrix row does not name the "user" trigger.
- N-1 is CLOSED by the ruling of 06:35 UTC (in the PR).

## Earlier RESUME-BLOCK (2026-11-13, W67; W68's above is the head, session_019i9ifBmZjDFYg8nNE1tL8N): THE PREPARATION IS CLOSED. The rulings of 05:50 UTC (S2, S3, N1; the refusals' closed list) have proved texts, owed-red tests, the web's words and the runbook's lines; the delta review found no blocker; what is left is the typed /new-migration and everything after it

**Ref `co-001/wip-key-registry` 267d48ac** (pushed through the hook; no PR; no migration file, no domain-model text, no
generated function touched). One commit on e1a7ac7e.
**The ONE command that applies every text of the item** (after the rename, on the first migration; W65's, W66's, W67's):
`python3 designs/lane-a-key-registry-reviews/w67/apply-texts.py <the first migration, or a copy> designs/lane-a-key-registry-reviews/a1-trigger.sql.txt`
must print `applied`; the typed result must equal that. `w67/migration.patch` (424 lines) is the same as a diff; `w66/`,
`w65/`, `w64/` are superseded. The texts and their lock analysis: `w64-migration-texts.md`, section "W67" (and "W66").
The review: `w67-review.md` (0 blockers, 0 should-fix, 3 notes, all queued below). **W67 adds no object: the
preflight's lists, section 14, SEC-25's maps and the header's function lists are exactly as W65's block says.**

### What W67 changed in the rules (say these with the migration)
- **S2:** `membership_removal_target_holds` binds under `user_removal_target_holds`' conditions, word for word (not
  past `expires_at` by the clock, the requester still passing `account_removes_keys`, only a requester's earliest
  confirmable request against a current platform administrator). Message: "... while the request can be confirmed".
- **S3:** `hardware_key_removal_request` refuses a request by an account that is the target of a request that can
  still be confirmed: 23514, `hardware_key_removal_target_asks`. **The advisory lock is now two, on requester and
  target, in the order of their IDs** (same key text), so two accounts asking against each other at once run one
  after the other and the second is refused.
- **N1:** a request against a platform administrator is refused when no account other than requester and target
  passes `account_removes_keys`: 23514, `hardware_key_removal_no_third_administrator`. First in the block, before
  W66's two limits. It writes no row and starts no wait.
- **The closed list:** `hardware_key_removal_refused` takes `one_administrator_request`, `asked_again_too_soon`,
  `target_asks`, `no_third_administrator` (eight reasons now). The web: `KEY_REMOVAL_REFUSALS` (route.ts) and
  `RECORDED_REFUSALS` the four; `KEY_REFUSALS` the two new names' words (`console-keys.test.ts`).
- The runbook (hardware key section): a named account cannot request; the third administrator and three from
  launch; who asks first holds the other; the counted reasons; `target_asks` as an incident.
- Test changes to W66's: the describe "two platform administrators, one compromised" is renamed (a third stood by
  all along); its mutual case (both accepted) is replaced by (e)'s forced case; the ordinary-accounts case also runs
  members first, then an administrator.

### Owed red on 267d48ac (each goes green with the texts; none skipped or loosened)
Everything in W66's and W65's lists below, and:
`packages/db/src/key-registry.db.test.ts`, in "SGN-31: a requested key removal binds its target only while it can
still be confirmed, and one requester holds one administrator once" (its parenthesis is longer now):
- "(d) the membership trigger binds under the same conditions as the account trigger": 3 cases;
- "(e) the target of a request that can still be confirmed requests no removal": 3 cases;
- "(f) a request against a platform administrator needs a third who could confirm it": the two-administrator case
  and the young-or-disabled-third case (its three-administrator case and its member case pin, they do not owe).
`packages/db/src/key-registry.db.test.ts`: "SEC-28 ... > takes the four refusals of a request that bound what a
request may hold, one row each" (1).
`apps/web/src/lib/routes/console-routes.db.test.ts`: "SGN-31: a second open request against another platform
administrator ..." (W66's, now also reading its two security events) and "SGN-31: a request by an account whose own
keys are asked for, and a request against a platform administrator that no third could confirm ..." (1 new).

### Proved
- **`pnpm test:db` whole, once, on a scratch worktree of 267d48ac with every text applied by the one script
  (PostgreSQL 18 on 5433, Node 24): 180 files, 10671 tests: 10666 passed, 4 failed, 1 skipped.** The four are the
  expected ones: the SGN-22 prefix case (the rename) and the three domain-model/function-file cases
  (`domain-model.db.test.ts > matches the schema`, `function-files.db.test.ts > DBF-01` and `> DBF-04 --check`).
- Each new case was seen red on its assertion against W66's texts (11: (d) 3, (e) 3, (f) 2, SEC-28 1, the web's 2)
  and green with W67's.
- On the WIP tree: `pnpm typecheck`, `pnpm lint:logs`, `pnpm lint:copy` pass; eslint passes on every changed file;
  unit `apps/web/src/lib/routes` and `apps/web/src/lib/http`: 586 passed. The whole unit suite, `pnpm lint` whole,
  golden and e2e: not run.

### Left for the last session
1. The two typed /new-migration commands with the rename (after `20261115090000_roi_statement_actionable_lines`;
   SGN-22's file filter if the prefix changes); in the first, the texts by the one script's order, then the header
   comment's lists by hand (W65's order, below, step 2; line 24's words on `membership_removal_target_holds` to match S2).
2. Outside it: SEC-25's lists (W65's step 3, unchanged by W66 and W67); `PROVIDER_SIGN_OUT_REASONS`; every "(owed
   red ...)" parenthesis dropped (now also SGN-31's longer one, SEC-28's new case, the web's new SGN-31 case); the
   matrix rows SGN-28 to SGN-31, SEC-28, JOB-09 and `pnpm synth --all`.
3. ADR 0095's records: W65's and W66's lists, and now S2, S3 (with the second advisory lock and its order), N1 (and
   that the product keeps three eligible administrators from launch), the closed list's eight reasons.
4. The domain model and the function files regenerated (never the approval line); the full suite once (unit, db,
   golden, e2e); the five screens seen in a browser after the fixes (the request form's four refusals among them);
   the PR from the template; the suggested approval line as one PR comment.
5. Expected then: `pnpm test:db` 10670 passed, 0 failed, 1 skipped.

### Queue list (lesser findings; none taken; no further preparation round)
- **W67 review N-1 (proved):** with exactly three administrators, A requests against B and then disables C: B stays
  bound for the rest of the 24 hours with no one able to confirm or cancel but A, and A may demote B meanwhile.
  Bounded (24 hours, not renewable against B for seven days; the owner path). Smallest change: N1's own test in both
  triggers' binding condition (a request no third could confirm binds no one).
- **W67 review N-2 (reasoned):** while A's request against B stands, neither can request against C (B by
  `target_asks`, A by `one_administrator_request`); any other administrator can, or A cancels and takes the
  seven-day wait against B. A runbook line at most.
- **W67 review N-3 (reasoned):** `membership_removal_target_holds` has no exemption for the target's own membership
  (the account trigger exempts its own row), so a bound target cannot step down. Older than W67. If not meant: `AND
  OLD.user_id <> app_actor_id()`.
- W67's own: N1 counts "could confirm" at the request's moment only; a third six days in the role does not count
  though it could confirm tomorrow (asked again then, it is accepted). A hash collision of two accounts' advisory
  keys could order two pairs differently (2^-64; a detected deadlock, nothing written). Not verified by the review:
  the expiry job's lock order; whether a bound target can void a request through columns the triggers do not watch
  (`mfa_enrolled`) or a membership INSERT.
- From W66, still open: `hardware_key_removal_target_acts` has no words in `KEY_REFUSALS`; `account_removes_keys`
  reads `now()`, the triggers `clock_timestamp()`; N6's rest ((a) would pass with "live membership"; a cancel by
  another administrator untested); no index on `hardware_key_removal (requested_by)`. Closed by W67: the two
  refusals' security events; the ordinary-accounts and mutual cases; the wrapper's locks (it takes only its
  `request_key` advisory lock before the call).

### Machine notes
Both PostgreSQL servers were down at start (stale postmaster.pid in /root/pgdata and /root/pgdata18: remove, then
`su postgres -c "<bin>/pg_ctl -D <dir> -l /tmp/pgNN.log -w start"`; 16 in /usr/lib/postgresql/16/bin, 18 in
/opt/pg18/bin); Node 24 at `/opt/node24/bin`; the checkout started detached at claude/build-platform. Scratch
worktrees `/home/user/w67-scratch` and `/home/user/w67-full` die with the container. W67 read, beyond its list:
`console-keys.ts` and `route.ts` around the refusal lists, the web test's `act` and `keyAdmin`, the runbook's
hardware key section, invoke.ts line 118. W67 holds no PR and no scheduled task; its one subagent has finished.

## Earlier RESUME-BLOCK (2026-11-13, W66; W67's above is the head, session_019i9ifAN8HwXxoQicPm7XvS): the rulings of 04:55 UTC (S6 a, b, c; S4; N2; N4) have proved texts, owed-red tests, the web's words and the runbook's lines; the delta review is done with one fix; what is left is the typed /new-migration and everything after it

**Ref `co-001/wip-key-registry` e1a7ac7e** (pushed through the hook; no PR; no migration file, no domain-model text, no
generated function touched). Two commits on 055407ae: 91a84d1f (the tests, the web's two refusals and its counted
line, the runbook) and e1a7ac7e (the review's S1 test, the runbook's wording).
**The ONE command that applies every text of the item** (after the rename, on the first migration; W65's and W66's):
`python3 designs/lane-a-key-registry-reviews/w66/apply-texts.py <the first migration, or a copy> designs/lane-a-key-registry-reviews/a1-trigger.sql.txt`
must print `applied`; the typed result must equal that. `w66/migration.patch` (362 lines) is the same as a diff; `w65/`
and `w64/` are superseded. The texts and their lock analysis: `w64-migration-texts.md`, section "W66". The review:
`w66-review.md`. **W66 adds no object: the preflight's lists, section 14, SEC-25's maps and the header's function
lists are exactly as W65's block (below) says.**

### What W66 changed in the rules (say these with the migration)
- **S6 (a):** `user_removal_target_holds` binds only while the request can still be confirmed: state requested,
  `expires_at > clock_timestamp()` (whatever the job marked), the requester still passing `account_removes_keys`.
- **S6 (b):** `hardware_key_removal_request`, against a target that holds a live platform_admin membership of an
  internal organization: at most one such request of a requester that can still be confirmed
  (`hardware_key_removal_one_administrator_request`), and not again against the same target for seven days after its
  request there expired (from `expires_at`) or was cancelled (from `decided_at`)
  (`hardware_key_removal_asked_again_too_soon`); both 23514. A transaction advisory lock on the requester, taken
  first. Other targets and a re-request after a confirmed removal are not limited.
- **The review's S1, taken (not in the ruling's words; the orchestrator may want to see it):** of one requester's
  confirmable requests against accounts that are platform administrators now, only the earliest binds its target, so
  a member asked against afterwards and then promoted is not held as well.
- **S6 (c):** no text; the owner path was never bound. Test SGN-31 (c); the runbook says when and by whom.
- **N2:** both sign-out functions store NULL for a request ID outside the CHECK's pattern.
- **S4:** proved by a test through a real opening: change 5's count commits when the web refuses afterwards;
  nothing changes in `recorded()`.
- **N3, and one thing built for it:** the ruling's "web's refusal line" did not exist (the web wrote a line only when
  the security event could not be recorded). W66 added it: `a refused act on a key removal` (warn; `user_id`,
  `request_id`, `error_code` `key_removal_refused_<why>`), one a refused act, in `invoke.ts`; the runbook names it as
  the count. No new log field. Name it in the PR.
- The web: `KEY_REFUSALS` gains the two names (words tested in `console-keys.test.ts`). Neither is a recorded
  refusal (no security event): see Queued.

### Owed red on e1a7ac7e (each goes green with the texts; none skipped or loosened)
Everything in W65's list below, and:
`packages/db/src/key-registry.db.test.ts`: "SGN-31: a requested key removal binds its target only while it can still
be confirmed, and one requester holds one administrator once" (11 of its 15: (a) 3, the S1 case 1, (b) 4, the
two-administrator scenario 3; green today: (c), and in (b) the lapsed-open, the ordinary-accounts and the
confirmed cases).
`packages/db/src/provider-sign-out.db.test.ts`: "SGN-28 ... > is never lost to its trace ID ..." (1; SGN-28 now 5).
`apps/web/src/lib/auth/sign-in.db.test.ts`: "SGN-30: the count of a wrong code refused at the registry's row is
committed when the web then refuses" (1).
`apps/web/src/lib/routes/console-routes.db.test.ts`: "SGN-31: a second open request against another platform
administrator ..." (1); "SEC-28: every refused act writes the web's line ..." (1: its lines pass, its event is owed).

### Proved
- **`pnpm test:db` whole, once, on a scratch worktree of e1a7ac7e with every text applied by the one script
  (PostgreSQL 18 on 5433, Node 24): 180 files, 10660 tests: 10655 passed, 4 failed, 1 skipped.** The four are the
  expected ones: the SGN-22 prefix case (the rename) and the three domain-model/function-file cases (`domain-model.db.test.ts
  > matches the schema`, `function-files.db.test.ts > DBF-01` and `> DBF-04 --check`). Every owed-red case is green there.
- Each new test was seen red first: SGN-31's (a), (b) and scenario cases and N2 on their assertions against W65's
  texts; S4 on its assertion on the WIP (0 tries, not 1). **Not seen red by W66:** the S1 case (the reviewer's probe
  proved the hole; W66 saw the case only green with the fix and red on the WIP for want of the trigger); (c) and N4's
  new assertion pass with and without the texts (they pin, they do not owe).
- On the WIP tree: `pnpm typecheck`, `pnpm lint:logs`, `pnpm lint:copy` pass; eslint passes on every changed file
  (`pnpm lint` whole ran once before the last one-line fix: packages and root passed, apps/web had that one error,
  since mended and linted by file). Unit: `apps/web/src/lib/routes`, `apps/web/src/lib/http`,
  `infra/test/monitoring.test.ts`, `packages/observability`: 807 passed. The whole unit suite, golden and e2e: not run.

### For the orchestrator's ruling (the delta review; W66's recommendation with each)
- **S2:** `membership_removal_target_holds` still binds on any row in state requested: past 24 hours with the job
  stalled, or after the requester was disabled, the target still cannot change an internal membership (it can disable
  accounts). Recommend the same two conditions in its EXISTS (`r.expires_at > clock_timestamp() AND
  account_removes_keys(r.requested_by)`), plus S1's NOT EXISTS, by one more pair in the script; not built: the ruling
  named the "user" trigger only.
- **S3 (older than W66):** the target may counter-request against its requester, and each then holds the other for
  24 hours. The runbook now says disable first, request second. Recommend also refusing a request by an account that
  is itself the target of a confirmable request; needs a ruling.
- **N1:** with exactly two platform administrators a request against the other can never be confirmed and is only a
  shield. Recommend refusing it when no third eligible administrator exists; needs a ruling.

### Left for the last session
1. The two typed /new-migration commands with the rename (after `20261115090000_roi_statement_actionable_lines`; SGN-22's
   file filter if the prefix changes); in the first, the texts by the one script's order, then the header comment's
   lists by hand (W65's order, below, step 2).
2. Outside it: SEC-25's lists (W65's step 3, unchanged by W66); `PROVIDER_SIGN_OUT_REASONS`; every "(owed red ...)"
   parenthesis dropped (now also SGN-31's two, SGN-30's web describe, SEC-28's line case); the matrix rows SGN-28 to
   SGN-31, SEC-28, JOB-09 and `pnpm synth --all`.
3. ADR 0095's records: W65's list, and now S6 (a), (b) and S1 (ADR 0095 says a request binds "until the job marks
   it": no longer), the advisory lock, the two refusal names, N2, the web's counted line.
4. The domain model and the function files regenerated (never the approval line); the full suite once (unit, db,
   golden, e2e); the five screens seen in a browser after the fixes (the request form's two new refusals among them);
   the PR from the template; the suggested approval line as one PR comment.
5. Expected then: `pnpm test:db` 10659 passed, 0 failed, 1 skipped.

### Queued by W66 (lesser findings; none taken)
- The two new refusals leave no security event, though a requester refused a second hold or a repeat is probing the
  shield: adding `one_administrator_request` and `asked_again_too_soon` to `hardware_key_removal_refused`'s closed list
  and to `RECORDED_REFUSALS` would record them (the runbook already calls the pattern an incident).
- `hardware_key_removal_target_acts` has no words in `KEY_REFUSALS`: a bound target's refused act in the console
  surfaces as the raw error. Not looked into further.
- Review N4: `account_removes_keys` reads `now()`, the trigger `clock_timestamp()` (theoretical). N6: SGN-31's
  weaker cases (the ordinary-accounts case by order of asks; the mutual case asserts one side and does not force a
  deadlock; (a) would pass with "live membership" for `account_removes_keys`; a cancel by another administrator is
  untested). Not verified by the review: whether the web's wrapper locks the actor's own "user" row before the call
  (two administrators requesting against each other ran at once in SGN-31 without deadlock, through `withActor`).
- No index on `hardware_key_removal (requested_by)` (the table is small; an index is a new object).

### Machine notes
As W65's below (both PostgreSQL servers were down at start; `runuser -u postgres -- pg_ctl ... -w start`; Node 24 at
`/opt/node24/bin`). W66's scratch worktree `/home/user/w66-scratch` dies with the container. W66 read, beyond its
list: `invoke.ts` around `keyRemovalRefused`, `sign-in.ts` around `recorded()`, the runbook's hardware key section,
`app_actor_is_platform_admin`. W66 holds no PR and no scheduled task; its one subagent has finished.

## Earlier RESUME-BLOCK (2026-11-13, W65; W66's above is the head, session_019i9if9qjSJt3AGpHV86RSa): every ruling now has a proved text and an owed-red test (ruling 3 REFINED, change 5 done), the app-side code is built, the adversarial review and its one fix round are done; what is left is the typed /new-migration and everything after it

**Ref `co-001/wip-key-registry` 055407ae** (pushed through the hook; no PR; no migration file, no domain-model text and
no generated function touched). On 77ded21e, nine commits: edb3929d (JOB-09 and JOB-07 to the refined ruling 3),
then SGN-30, the web, the worker, the console, the runbook, a lint mend, aee95a66 (the source-contract tests),
the fix round's tests, 055407ae (the runbook's wording).
**The texts:** `designs/lane-a-key-registry-reviews/w64-migration-texts.md` (revised in place; read its head and "The
adversarial review's fix round" first), **`w65/apply-texts.py`** (the record: exact old/new pairs; scratch copies only)
and `w65/migration.patch` (the same as a diff, 289 lines). `w64/` is superseded. The review: `w65-review.md`.

### What changed in the rules (say these to the co-founder with the migration)
- **Ruling 3 as refined, and one step stricter after the review (S2):** LATE by age (undone, queued over 15 minutes,
  whatever tries or lease). GAVE_UP at 30 tries, or at 24 hours **only once one try was ANSWERED as failed**
  (`last_error_code IS NOT NULL`), never under a running lease. The claim counts a try before the provider is called,
  so "attempts >= 1" was true of a row whose worker stopped before sending anything; the answered try closes that. A
  row never tried is never given up. Oldest first needed no text change (the claim's order; JOB-09 holds it).
- **A waiting row is paged LATE again every day (S3):** the sweep clears `late_reported_at` 24 hours after the
  acknowledgement for a row neither done nor given up. Not in the ruling's words; it is what stops an untried row
  being paged once and then silent for ever. **The orchestrator may want the founder to see this one.**
- **The unrecorded reset's guard (S1):** a waiting row covers a later call only if it was never tried (`attempts = 0`).
- **Change 5 (A4):** a wrong code against a usable opening counts a try in `hardware_key_record`, records the refusal
  once an hour and returns NO ROW (no raise, so the count commits); no code or no opening still raises. The web
  treats no row as the refusal (built).
- **Change 7 is not built as W64 sketched it:** a signed-in handler has no pool by design, so `refused()` names the
  reason on its `InputError` and the routes' wrapper (`refusal()` in `apps/web/src/lib/http/invoke.ts`) calls
  `hardware_key_removal_refused` after the rollback, bounded, as the acting account.
- **A new log field `sqlstate_code`** (`packages/observability/src/fields.ts`; five upper-case letters or digits from
  a database error's code, on the worker's step-failed line). A reviewed list: name it in the PR.

### Owed red on 055407ae (each goes green with the texts; none skipped or loosened)
`packages/db/src/key-registry.db.test.ts`: "SGN-24: the target of a requested key removal changes no other account"
(3); "SGN-29: a step judged with no beginning is no guess ..." (1); "SEC-28: a refused act on a key removal leaves a
security event ..." (2); "SGN-30: a wrong code offered to hardware_key_record is a counted guess" (4); and "SGN-22 >
adds nothing to the request path in the database ..." (the shared `20261115` prefix; goes with the rename).
`packages/db/src/provider-sign-out.db.test.ts`: "SGN-28: a reset whose own transaction was never recorded ..." (4);
"JOB-09: the sweep judges late by the row's age whatever its tries, and gives up by age only a row whose try was
answered" (4); "JOB-07: the claim names the cause" (1); "JOB-07: the answers and the sweep > gives up at 30 tries, and
at 24 hours only a row that had a try ..." (1; its lines are already reworded).
`apps/web/src/lib/auth/sign-in.db.test.ts`: "SGN-28: a reset whose own transaction fails twice still queues the
provider sign-out, alone, and the line says it did" (1).
`apps/web/src/lib/routes/console-routes.db.test.ts`: "SEC-28: a refused act on a key removal leaves a security event
for the acting account, in a transaction of its own ..." (1).
`apps/worker/src/platform/provider-sign-outs.db.test.ts`: "JOB-07: a failed try's line names the request of the event
that queued the row ..." (1).

### Proved
- **`pnpm test:db` whole, once, on a scratch copy of 055407ae's tree with every text applied by the script
  (PostgreSQL 18 on 5433, Node 24): 180 files, 10641 tests: 10636 passed, 4 failed, 1 skipped.** The four, all
  expected: the SGN-22 prefix case (the rename); `domain-model.db.test.ts > docs/product/domain-model.md (CO-02) >
  matches the schema ...`, `function-files.db.test.ts > DBF-01 ... matches the functions ...` and `DBF-04: the CLI
  (T5) > --check passes ...` (the domain model and `packages/db/functions` are stale against the patched migration
  and are regenerated with it). Every owed-red case above is green there.
- On 055407ae itself: `pnpm typecheck`, `pnpm lint` and `pnpm lint:logs` pass. `pnpm test` (unit) ran whole once
  before the last three commits: 14400 passed, 7 failed, all seven source-contract tests my changes moved
  (`infra/test/monitoring.test.ts`, `fields.test.ts`, `lock-timeout.test.ts`); they are updated and their five files
  pass (229). The whole unit suite was NOT run again after that. e2e and golden: not run.

### The order for the next session (the co-founder's typed /new-migration, one command a file)
1. Rename the two migrations to sort after `20261115090000_roi_statement_actionable_lines`; if the new names leave
   the `20261115` prefix, change SGN-22's file filter with them.
2. In the first, apply the texts in the script's order (it is the file's order): the reason CHECK (section 1); A1's
   trigger (6); the trigger's WHEN and the two functions (7); `hardware_key_record`'s comment and check (8, change 5);
   the judge's early return (8); `hardware_key_removal_refused` (9); the claim's fifth column, the sweep's two
   conditions, its re-arm statement and its comment (10); the reserved action (13); the preflight's two names;
   section 14's REVOKE and two GRANTs. Then the header comment's lists, by hand in that command.
   Check: `python3 w65/apply-texts.py <a copy of the unrenamed file> a1-trigger.sql.txt` must print `applied`, and the
   typed result must equal that copy.
3. Outside it: SEC-25's maps (`user_removal_target_holds()` forNone and the trigger arrays;
   `provider_sign_out_unrecorded_reset(text)` and `hardware_key_removal_refused(text,text)` forApp;
   `operator_provider_sign_out_request(uuid,text)` forOperator); `PROVIDER_SIGN_OUT_REASONS` in
   `packages/db/src/schema/identity.ts`; every "(owed red ...)" parenthesis dropped (five test files); the worker's
   `Claimed.cause_request_id` made required if wanted; the matrix rows SGN-28, SGN-29, SGN-30, SEC-28, JOB-09 and
   `pnpm synth --all`; `pnpm db:domain-model` and the function files regenerated (never the approval line).
4. Expected then: the two db files 66 passed, 0 failed; `pnpm test:db` 10640 passed, 0 failed, 1 skipped.

### Left
- The rename and the texts by the typed command (above); SEC-25's lists; ADR 0095's missing records (the keyed
  digest, the algorithms, alarm filters 42 to 46, the "user" trigger, and now: the refined ruling 3 with the answered
  try and the daily LATE line, change 5's no-row answer, the wrapper's record of a refused act, `outcome_code` on the
  reset's paging line, `sqlstate_code`); the domain model regenerated; the full suite once (unit, db, golden, e2e);
  the five screens seen in a browser after the fixes; the PR from the template; the suggested approval line as one
  PR comment.
- **For the founder (review S6, not changed here: it is A1's ruled design):** while a removal request is open, its
  target can change no other account, so with two platform administrators a compromised one can request the other's
  removal and cannot then be disabled by them until the request expires (longer if the expiry job stalls), and
  nothing seen limits asking again. The reviewer's smallest change: the trigger binds only while the request can
  still be confirmed (`expires_at > now()` and the requester still able). `w65-review.md`, S6.

### Queued (the review's lesser findings; none taken into the texts)
- S4: a web test through a real closed registration that reads `registration_code_tries = 1` after the web refused a
  wrong code. By reading: `recorded()` throws after `withActor` returned, so the count has committed.
- N1: two concurrent unrecorded-reset calls can queue two rows (bounded, harmless). N2: the two request functions
  raise 23514 on a request ID that fails the outbox CHECK. N3: the once-an-hour guard hides the count, not the fact,
  of later probes. N5: after a day's outage a throttled backlog gets one answered try each and is then GAVE_UP (the
  runbook says so). N6: SGN-24 does not test a bound administrator confirming another removal through a definer
  door, nor that a bound target cannot write another account's `locked_at`, `sign_in_not_before` or email.
- No metric filter counts `security event: a refused act on a key removal was not recorded`, the `outcome_code` of
  the reset's line, or `provider sign-out step failed`; whether any should page is for the alarm records (ADR 0095).

### Machine notes
Both PostgreSQL servers were down again at this session's start (HANDOFF.md's `pg_ctl` recipe, as `runuser -u postgres
--`); Node 24 is `/opt/node24/bin`. A bare `npx eslint <files>` runs out of memory here: use `pnpm lint`. A db test run
without `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres` in the same shell reports its tests skipped,
not failed. W65 read, beyond its list: the worker job's file, `console-keys.ts`, parts of `invoke.ts`, `services.ts`
and the three contract tests. W65 holds no PR, no scheduled task; its one subagent has finished.

## RESUME-BLOCK (2026-11-13, W64, session_019i9ifBKYJayza89rg9KE3j): the base is merged, five of the six rulings have a proved migration text and an owed-red test; the app-side code, A4 and the adversarial review are NOT done (handed over at the token limit)

**Ref `co-001/wip-key-registry` 77ded21e** (pushed through the hook; no PR; no migration, domain-model hunk beyond the
merge's conflict, or generated function touched). On 282895dd: 04a62fed the merge of 979a21b8 (schema PR 5); 3dbf14ec
the owed-red tests; 77ded21e a lint mend in one of them.
**The merge:** one conflict, `docs/product/domain-model.md`, three generated hunks (header counts, migration rows 53 and
54, the approval paragraph). Resolved to THIS ref's side, so the approval line is blank (`Approved by: ________`) and
the founder's line for PR 5 is not carried onto a text it does not describe. The file is stale and is regenerated.
**The texts:** `designs/lane-a-key-registry-reviews/w64-migration-texts.md` (a section a change, the lists, locks,
proof), `w64/apply-texts.py` (exact old/new pairs; scratch copies only) and `w64/migration.patch` (the same as a diff).

### What is red on 77ded21e and why (the two files run alone: 46 passed, 14 failed)
`packages/db/src/key-registry.db.test.ts`:
- "SGN-24: the target of a requested key removal changes no other account (owed red ...)": 3 cases, A1's trigger.
- "SGN-29: a step judged with no beginning is no guess ... (owed red ...)": 1 case (`expected 1 to be +0`), change 4.
- "SEC-28: a refused act on a key removal leaves a security event ... (owed red ...)": 2 cases, change 7 (one fails on
  `function hardware_key_removal_refused(unknown, unknown) does not exist`, thrown, not on an assertion).
- "SGN-22 > adds nothing to the request path in the database ...": **red only because PR 5's
  `20261115090000_roi_statement_actionable_lines.sql` shares the item's `20261115` prefix** (3 files, 2 expected). Goes
  with the rename; if the new names leave that prefix, change the test's filter with them.
`packages/db/src/provider-sign-out.db.test.ts`:
- "SGN-28: a reset whose own transaction was never recorded ... (owed red ...)": 4 cases, change 2 (two throw 42883).
- "JOB-09: the sweep judges late and given up by the row's age ... (owed red ...)": 2 cases, change 3.
- "JOB-07: the claim names the cause (owed red ...)": 1 case, change 6.
**With the texts applied in a scratch copy: 58 passed, 2 failed:** the SGN-22 prefix case above, and "JOB-07 > gives up
at 30 tries, and at 24 hours only a row that had its four tries", whose first five lines assert the rule ruling 3
replaced; the next session rewords them with the migration (JOB-09 holds the new rule).
**Added after hand-over: the whole `pnpm test:db` finished (started on 04a62fed, the two test files edited under it): 180 files; 10,612 passed, 1 skipped, 16 failed:** the 14 above, plus one case each in `domain-model/domain-model.db.test.ts` and `domain-model/function-files.db.test.ts`. Those two were not read; the likely cause is the stale domain model and generated function files after the merge, which the regeneration mends. Check them first.
**Was not known at hand-over:** the whole `pnpm test:db` on the merged tree. One run was started on 04a62fed and had not finished at
hand-over (its files were edited under it, so its counts would not be clean anyway). `pnpm typecheck` passed on
04a62fed (24 projects) before the tests were added; `eslint` on the two test files is clean. The migration-order check
was not run by name. Unit, e2e, golden: not run.

### The order for the next session (the co-founder's typed /new-migration, one command a file)
1. Rename the two migrations to sort after `20261115090000_roi_statement_actionable_lines`.
2. In the first, apply the texts in file order (the script's order is the file's): the reason CHECK (section 1); A1's
   trigger (6); the trigger's WHEN and the two functions (7); the judge's early return (8); `hardware_key_removal_refused`
   (9); the claim's fifth column and the sweep's two conditions and comment (10); the reserved action (13); the
   preflight's two names; section 14's REVOKE and two GRANTs. Then the header comment's lists, by hand in that command.
3. Outside it: SEC-25's maps (`user_removal_target_holds()` forNone and the trigger arrays;
   `provider_sign_out_unrecorded_reset(text)` and `hardware_key_removal_refused(text,text)` forApp;
   `operator_provider_sign_out_request(uuid,text)` forOperator); `PROVIDER_SIGN_OUT_REASONS` in
   `packages/db/src/schema/identity.ts`; the old JOB-07 case's five lines; every "(owed red ...)" parenthesis dropped;
   the matrix rows SGN-28, SGN-29, SEC-28, JOB-09 and `pnpm synth --all`.
4. Expected then, the two files: 60 passed, 0 failed.

### Left
- **Change 5 (A4), not started:** no text, no test; the design reached is in the texts file.
- **App-side code, not started:** the web's third transaction in `endedByReset` calling
  `provider_sign_out_unrecorded_reset` and the runbook's step naming `operator_provider_sign_out_request`; the worker's
  warn line with the cause's request_id and a `sqlstate` field (a reviewed change to `fields.ts`); `refused()` in
  `console-keys.ts` calling `hardware_key_removal_refused` in its own transaction. Each needs its own failing-first test.
- **The adversarial review of the texts and tests (step 4): not run.** It should run before the texts are applied.
- **A consequence of ruling 3 for the founder:** after a day's outage of the job, rows older than 24 hours that the
  first run does not reach are given up untried and paged, where before they were claimed late.
- As before: ADR 0095's missing records (the keyed digest, the algorithms, alarm filters 42 to 46, the "user" trigger,
  and now these changes); the domain model regenerated (never the approval line); the full suite once; the PR from the
  template; the suggested approval line as one PR comment.

### Machine notes
Both PostgreSQL servers were down at this session's start and were started by hand (`runuser -u postgres -- pg_ctl ...
-w start`, HANDOFF.md's recipe); Node 24 is `/opt/node24/bin`, not on the default PATH. W64 read, beyond its list: ten
lines of review A (A4, A5) and the worker job's file. W64 holds no PR, no subagent, no scheduled task; one background
`pnpm test:db` may still be running in this container and can be ignored.


## RESUME-BLOCK (2026-11-13, W61, session_019i9ifD4ZD9pKYb8nEukCQm): the two refs are merged, the three reviews and two fix rounds are DONE; one BLOCKER is owed to the migration (a trigger, its text below, its test committed RED); then PR 5's base, the rename, the domain model and the PR

**Ref `co-001/wip-key-registry` 282895dd** (pushed; no PR; no migration touched; the screens ref 07807b33 is merged in by
914ad07b and is no longer needed). Commits on 3187bda3, in order: 914ad07b the merge; ad684695 SGN-20, 21, 23, 24 and 27
name `apps/web/e2e/key-registry.spec.ts` in `registry.ts` (5 `expected.json` rewritten by `pnpm synth --all`); 9d55a61a
the dev twin's algorithms; 980d5e7b the owed-red test; fe7047bc, e3406211, 288740e7, c505ad28 fix round 1; 07019b19,
282895dd fix round 2. The reviews' reports, the scratch test and the trigger's text are in
`designs/lane-a-key-registry-reviews/` (seven files).

### What is green (PostgreSQL 18 on 5433, Node 24; ONE run, on the tree of 282895dd, typecheck cold)
- `pnpm verify-content`: passes. `pnpm typecheck`: passed, 24 projects. `pnpm lint`: 1,964 files, 0 errors, 0 warnings.
  `pnpm lint:logs`: 1,210 files, every call allowlisted.
- `pnpm test`: **513 files; 14,404 passed, 4 skipped, 0 failed.**
- `pnpm test:db` whole: **175 files; 10,586 passed, 1 skipped, 3 FAILED: exactly the three owed-red cases** of
  `packages/db/src/key-registry.db.test.ts`, the describe "SGN-24: the target of a requested key removal changes no
  other account (owed red until the trigger hardware_key_removal_target_acts is in the migration)". Nothing else fails.
- `pnpm test:e2e --trace off`: **88 passed, 0 failed.** `pnpm test:golden`: 5 files, 381 passed.
- The baseline before any fix (ad684695): the same suites green (14,376 unit; 10,572 db) **except e2e, 67 passed and 21
  failed**, every one at key registration; the cause and its mend are the first finding below.
- e2e needs `E2E_ADMIN_URL=postgres://postgres:test@localhost:5433/postgres`; test:db and golden were run with
  `DATABASE_URL` of the same. `/tmp/setup-container.sh` re-run starts both PostgreSQL servers **and moves the checkout to
  claude/build-platform**: check the branch after it.

### THE BLOCKER (the orchestrator's ruling, 2026-11-13 02:05 UTC): review A1, fixed in this item's own migration before the PR
**Verified** (scratch test, `a1-scratch.db.test.ts.txt`): while a removal of T's keys requested by B is `requested`, T,
as tp_app with `app.actor_id` = T, runs `UPDATE "user" SET status = 'disabled' WHERE id = B` (accepted, 1 row) and C's
confirmation is then refused `hardware_key_removal_requester_left`. `hardware_key_required` of B is accepted too
(tp_app holds the column; `user_guarded_columns` passes a platform administrator). `mfa_enrolled` is refused already
(42501, `20261015180000_tenancy_hardening.sql:481`). Ruling 16.4 closed this through `membership` only. No web route
makes the change today. DELETE of a membership is not a way round: tp_app holds INSERT and UPDATE (role, ends_at) only.
**The test is committed (980d5e7b), 8 cases, 3 red today on their assertion** (`expected { rows: 1 } to deeply equal
{ code: '23514', constraint: 'hardware_key_removal_target_acts' }`), 5 green (the account's own row; an unrelated
administrator; after cancel, confirm, expiry). **With the trigger below applied in a scratch database: 8 passed.** Do
not skip or loosen it; when the trigger lands, drop the title's parenthesis.
**The exact text** (also `a1-trigger.sql.txt`, with its conventions, lock analysis and proof). It belongs in
`20261115090000_key_registry.sql` section 6, directly after `CREATE TRIGGER membership_removal_target_holds …`, applied
by the co-founder's typed `/new-migration` in the last session, together with the rename (one command a file):
```sql

-- While a removal of an account's keys is requested, that account changes the status and the hardware-key rule of no
-- other account: as a platform administrator it could otherwise disable the requester, which voids the request
-- (hardware_key_removal_requester_left), or any administrator who could confirm it. Its own row it may still change,
-- and once the request is decided (confirmed, cancelled or marked expired) the rules that stood before decide alone.
-- It takes no lock. By name it fires after user_guarded_columns and before user_updated_at; the order changes no
-- outcome, since only a platform administrator reaches another account's row and user_guarded_columns passes one.
CREATE FUNCTION user_removal_target_holds() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF app_actor_id() IS NOT NULL
     AND OLD.id <> app_actor_id()
     AND EXISTS (SELECT 1 FROM hardware_key_removal r WHERE r.user_id = app_actor_id() AND r.state = 'requested') THEN
    RAISE EXCEPTION 'an account whose key removal is requested changes no other account''s status or hardware-key rule until the request is decided'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_target_acts';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION user_removal_target_holds() FROM PUBLIC;
CREATE TRIGGER user_removal_target_holds BEFORE UPDATE ON "user" FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status OR NEW.hardware_key_required IS DISTINCT FROM OLD.hardware_key_required)
  EXECUTE FUNCTION user_removal_target_holds();

```
**With it, in the same migration:** the header's trigger list (about line 24); the preflight's `proname IN (...)` (about
line 80); section 14's `REVOKE ALL ON FUNCTION … FROM PUBLIC` list (about line 1537; the REVOKE above is then folded
in). **And outside it:** SEC-25 in `key-registry.db.test.ts` (the functions map, `'user_removal_target_holds()':
forNone`, about line 230; the trigger name array and expected list, about line 260); `packages/db/functions/
user_removal_target_holds.sql` and `docs/product/domain-model.md` by the generator, never by hand; one sentence in ADR
0095 beside `membership_removal_target_holds` (lines 78 and 239). **Residual, as the membership trigger's:** a request
not yet committed when the target's statement takes its snapshot does not bind it (closing it needs a second row lock
that can deadlock; not proposed). The delta review attacked the text and found no bypass and nothing legitimate
blocked; the target can still change another account's email (it redirects notices, voids nothing).

### Each review's findings and what became of each
**Found by the suite, not a review.** No key registered in e2e on this machine's Chromium (156): the dev twin offered
the library's default algorithms, ML-DSA-44 first, and the registry refused the public key (`hardware_key_public_key`,
1,024 bytes). **Fixed** 9d55a61a (the twin), fe7047bc (the product: `KEY_REGISTRATION_ALGORITHMS = [-7, -257]`,
`auth/provider.ts`; the flow sends the intersection with the provider's list, refuses an empty one with
`KEY_ALGORITHMS_NOT_OFFERED`, verifies with the same list), 07019b19 (the completion's test, an Ed25519 key; the alarm).
**The ruling: the cap stays; recorded for the queue:** a post-quantum algorithm needs a verifier and a wider CHECK
together, in a later schema PR.

**Review A, auth and tenant isolation (`review-a-auth.md`; every two-person bypass on its list, the code's
generation and expiry, every session-insert path and the four tables' isolation were found sound).**
- A1 high: **the blocker above; needs the migration.**
- A2 medium (the judge counts a try with no code): **fixed** fe7047bc: a step with no code judges with `began = NULL`,
  which the function answers without counting. Said plainly: an ordinary sign-in already counted none (its step carries
  `codeRequired`); the counting path was a step without the flag, and the test strips the flag rather than building a
  removal of an account with no key row. **Recorded, needs a migration (delta D7):** that call still writes one
  `key_registration_refused` security event at the code screen; return before the INSERT when `began` is NULL.
- A3 medium (an unsalted SHA-256 of a 40-bit code): **fixed** fe7047bc: HMAC-SHA-256 under a key derived by HKDF from
  the sealing key (`Sealer.deriveKey`, label `paidwhole registration-code digest v1`), one value in
  `Services.registrationCodeKey` for the console's route and the sign-in flow; 32 bytes, the database untouched.
  Replacing the sealing key inside an opening's hour refuses that code like a wrong one. **Not checked:** whether
  PostgreSQL logs bind parameters for the app role in infra.
- A4 low (`hardware_key_record` an uncounted check for the app role): **recorded, needs a migration** (W47's point 3).
- A5 low, the orchestrator's point (a refused act leaves no trace): the review's answer: **neither the note's 4.5 and 6
  nor the rules require a trace of a refused removal.** Two ways need no migration (an IDs-only line in `refused()`,
  `console-keys.ts`, with a metric filter and alarm; a second transaction writing an audit row under a new,
  non-reserved action); a `security_event` row needs one. **Needs the orchestrator's ruling; not built.**
- A6 low (point 49): **fixed** fe7047bc, e3406211, 07019b19: the line carries `RELYING_PARTY_MISMATCH`, is written at
  every refused step, and `RelyingPartyMismatch` alarms on the web group.
- A7 low (point 50): **fixed** fe7047bc: options with no rpId are compared by the origin's host.
- A8 medium (`writtenBy: 'database'` unguarded): **fixed** fe7047bc: a registry test pins the four routes and their
  actions; their object type is now `'user'`, as the functions write. Note (delta D9): their `objectId` is still the
  removal's ID. **For the queue.**
- A9 to A11 notes (Postgres trusts the app role for which session acts, accepted by 16.5; `organizationId` is a UUID in
  a fixed redirect path, no open redirect; `sign_in_hardware_keys` and `sign_in_key_refused` act for any user id with
  no actor): **recorded.**
- The orchestrator's other points: the pool count 5 to 7 in `lock-timeout.test.ts` counts two new transaction sites in
  `sign-in.ts` (the judge, the record), not a pool size and not a leak (read from the diff, the test body not read).
  The marker that outlived one command is `.claude/.allow-protected-edit`: absent in both checkouts, and the diff
  changes nothing under `.claude/` or `tools/hooks`.
- **Not reached by review A:** the `routes/sign-in.ts` diff and `authenticated()`; the React component that holds the
  code; the timestamp `record_security_event` writes.

**Review B, the job, the outbox and deploy safety (`review-b-job-deploy.md`; the claim, lease and try logic, the
payloads (empty), the log lines (IDs and codes only) and the migrations' locks were found sound; W33's figures still
apply, no migration changed since).**
- B1 high (a slow provider with a backlog pages nobody for hours; an untried row is never given up): **partly fixed**
  e3406211: `ProviderSignOutAttemptsFailing` (3 failed tries in 15 minutes) and the run stops at its first timed-out
  call. **The full fix needs a migration, recorded:** the sweep marks a row LATE by age (undone and queued more than 15
  minutes ago, whatever `attempts` says) and GAVE_UP by age with no minimum of tries.
- B2 high, point 20 (a reset whose transaction fails twice queues no sign-out): **confirmed; needs a migration,
  recorded:** widen the outbox reason's CHECK with `password_reset_unrecorded`; a function
  `provider_sign_out_unrecorded_reset(request)` for tp_app that writes its own audit row so the trigger queues the
  sign-out; an operator function for the case where the database is unreachable. What is lost meanwhile: the provider's
  tokens issued before the reset, a key-registration grant begun before it included. The runbook's step covers it only
  through End membership. **Needs the orchestrator's ruling on whether it rides this item's migration.**
- B3 medium (two operator connections, one held through the provider's call): **fixed** e3406211: a connection a step,
  none during the call; a step that cannot connect is a failed step and the run line is still written.
  **For the queue:** `hardware-key-notices` (and probably `password_notices`, not opened) still send mail inside the
  claim-to-sent transaction.
- B4 medium ("no such user" counts as done): **partly fixed** e3406211: `ProviderSignOutNoSuchUser` (3 in 15 minutes).
  **For the queue (delta D1):** a wrong pool ID at low volume stays under it; a pool check at the worker's start needs
  an IAM action.
- B5 medium, B8 note: **fixed** e3406211 (the runbooks): expect `ProviderSignOutsNotRunning` to page twice in the
  deploy that creates it; a rollback also stops removal requests expiring, sends key notices late and leaves the
  previous web's failed provider call unpaged by name. The first-deploy page rests on how CloudWatch evaluates a new
  alarm with only missing data: not checked against its documentation.
- B6 low (the failed-try warning has no cause request_id; a database failure's SQLSTATE is lost): **recorded, needs a
  migration** (the claim returns the request_id). B7 note (two overlapping sweeps can deadlock; nothing is lost):
  **recorded.**
- **Suspected, not proven:** in a rolling deploy the previous image's session insert takes the device row then the
  account row; no path was found that takes them the other way, and W33's run did not mix images.

**The UX and brand review (`review-ux-brand.md`, `review-delta-ux.md`). Said plainly: the reviewer could not open the
two private galleries, so every judgement is from the markup or from W53's record; none is "seen". No shot was taken
after the fixes.** Contrast of "Confirm key removal" passes from the tokens (light 4.71:1, dark 5.86:1).
- U1 (F1, 390 px): **the small form fixed** c505ad28, 282895dd: below `sm` the Actions cell begins with the account
  and its key state (`[data-narrow-account]`, hidden from assistive technology), and e2e holds the account and the
  button in the window together. **For the queue:** the stacked list. The table and its scrolling region stay because
  TBL-02 and TBL-03 require them.
- U2 (F2): **fixed**: the email is the row's header; every key button, End membership and Unlock name their account;
  "Cancel removal request", "Open key registration".
- U3, U4 (F3, F4): **fixed**: focus on the row's state after Request, Cancel and Confirm (by a note of the press in
  memory, no fragment and no new input: the fragment redirect did not re-render the page), and "Code accepted." with
  focus on the heading.
- U5 to U8, U10 to U14, V1 to V6: **fixed** (the panel's heading and "Hide the code"; the lost-code, decided,
  cancelled, expired and seven-day words; the pending badge; the code in the mono face). U8 is one sentence, not two:
  the functions raise one 42501 for both causes.
- U18 to U20, V9 (the emails): **fixed**: "Your hardware key was removed"; never by email or text; "It is open until
  {time}" (the opening function writes the notice's time and the end from one clock reading).
- **For the queue:** U9 (the words when a key step fails for a fault of ours: `hardware-key.tsx` can tell 5xx from
  4xx); U15 (the page answering an empty code itself); U16, U17, V7 (shared form components; the refusals' full
  stops); V8 (a refresh of the key step moves focus to the heading); U20 for the console (it still says "hardware
  keys", "keys removed"; pinned widely); who cancelled, in the cancelled sentence; the opening's notice is written at
  the first opening only, so a second opening sends no email; whether an expired request gets a `decided_at` (if not,
  the page never lists it and the expired sentence never shows): not checked.
- **Two e2e assertions passed without being seen red:** the narrow copy's `aria-hidden` and Unlock's name.
- **Not judged by anyone:** a screen reader's speech, a headed browser, the page without JavaScript, the emails'
  rendered HTML, the 24-hour expiry and five-wrong-codes screens.

**The security delta review (`review-delta-security.md`): nothing in the fixes breaks a rule in force; every claimed
fix judged sound.** D1 (queue, above), D2, D3, D4 **fixed** 07019b19 (`KeyAlgorithmsNotOffered`; the line at every
step; the completion's test), D5 is the owed-red test, D6 the trigger (no bypass found), D7 (needs a migration, above),
D8 (the code key is a Buffer on `Services`; no path to a log, JSON or a client was found), D9 (above).
**Metric filters: 42 to 46** (`ProviderSignOutAttemptsFailing`, `ProviderSignOutNoSuchUser`, `RelyingPartyMismatch`,
`KeyAlgorithmsNotOffered`), each with its paragraph in `incident-response.md`.

### Needs a migration, in one list (none made here; the co-founder's typed command starts each)
1. **The trigger `user_removal_target_holds` (the blocker; this item's own migration; text above).**
2. Point 20 / B2: the unrecorded reset's sign-out (text above). 3. B1: LATE and GAVE_UP by age. 4. D7: no security
event for a step judged with no beginning. 5. A4: `hardware_key_record` counts its check. 6. B6: the claim returns the
cause's request_id. 7. For a later schema PR: `hardware_key_public_key` wider, with a post-quantum verifier.
**Needs the orchestrator's ruling:** whether 2 to 6 ride this item's migration or the contract migration; A5.

### Records the fix rounds left behind (the last session writes them, with the papers)
ADR 0095 does not yet say: the keyed digest (it says SHA-256); ES256 and RS256 only; the four alarms and the count 46;
the sign-out run's connection a step and its stop at a timeout; the "user" trigger. The test matrix rows were not
reworded (SGN-27's row says nothing false; SGN-24's does not name the "user" trigger: add it with the trigger and run
`pnpm synth --all`). `apps/web/e2e/key-registry.spec.ts` now also cancels and requests again, presses a late Cancel,
locks and unlocks the member (as the owner) and checks 390 px.

### What the last session does, after schema PR 5 has merged
1. Merge the base (`origin/claude/build-platform`) into `co-001/wip-key-registry`.
2. By the co-founder's typed `/new-migration`, one command a file: the two migrations renamed to sort after PR 5's
   `20261115090000_roi_statement_actionable_lines`, **and the trigger above added to the first** with its three lists;
   then SEC-25's lists, the describe's title, ADR 0095 and SGN-24's row. `pnpm test:db` must then be whole green
   (10,589 passed and 1 skipped on this tree, before PR 5's own tests).
3. The domain model regenerated (`pnpm db:domain-model`; `packages/db/functions/user_removal_target_holds.sql` comes
   from it), never the approval line.
4. The full local suite once (the commands and counts above).
5. The PR from `.github/pull_request_template.md`, opened with `pnpm -s db:domain-model --summary-since
   origin/claude/build-platform --function-diffs list`, with **"What the founder should know before approving"**: at
   least three platform administrators named before launch (two must confirm a removal and neither may be the account);
   a rollback of this release leaves staff unable to sign in until roll-forward (and stops removal requests expiring,
   sends key notices late); staff register their keys once at deploy; expect `ProviderSignOutsNotRunning` to page twice
   in that deploy; after a removal the account opens no session until an administrator reads it a one-time code; every
   session insert takes the account's row lock; W50's list below stands. The suggested approval line as ONE PR comment
   through the GitHub API, never a review; never approve, never merge before the founder's review of the latest commit.

### Machine notes
W61 read, beyond its list: the registry rows SGN-20 to 27 and their matrix lines; `registration-code.ts`; about 60
lines of `dev-provider.ts`, `e2e/helpers.ts` and two test files to mend type errors a fix left (288740e7); the reviews'
reports. Every fix and review ran as a subagent with its report read here, not its code. W61 holds nothing: no PR, no
subagent, no scheduled task, no running server or suite.

## RESUME-BLOCK (2026-11-12, W50, session_019i9ifDqnGxZb6EWNt5PoPf): the records, the absence alarm and green are done; the five SCREENS are NOT seen and SGN-22's test is owed; then the reviews, the domain model and the PR

### W53 adds (2026-11-12 to 13, session_019i9ifB1YL441uNkk6Azg9t): the five screens are SEEN, and the e2e journey is written and green

**Ref `co-001/wip-key-registry-screens` 07807b33** (one commit on 656854b1; W52's ref untouched; no PR). It adds
`apps/web/e2e/key-registry.spec.ts` and three personas of that one spec to `apps/web/scripts/synthetic-personas.ts`
(`key-removal-requester`, `key-removal-confirmer`, both platform administrators, and `key-removal-member`, a support
engineer). **No screen was changed: nothing was an outright break** (every screen rendered; every control was reached
and pressed by Tab and Enter alone).

**The gallery (private; only its owner opens or shares it; no PNG is on any branch):**
1,280 px, light and dark, 95 shots: https://claude.ai/artifact/88nQ5AtiTVMb5qAQvfiuiw ;
390 px, 79 shots: https://claude.ai/artifact/AXKH6eZjTSbQw9DtHYTtB8 .
The manifest is `designs/lane-a-key-registry-screens/shots.json` (174 entries: id, width, theme, state, role); what the
walk recorded is `observed.json` beside it (every focus order in full, the focus after each press); `capture.ts`,
`playwright.scratch.config.ts` and `serve.mts` there are the walk itself (copy the first two into `apps/web/e2e` and
`apps/web`, start the server with `serve.mts`, set `TOUR_DIR`; never commit them to the product). The code in the shots
is a synthetic one, spent in the same run. Shot ids, each at `--390-light`, `--1280-light`, `--1280-dark`, whole page
and `--crop` (the member's row, or the sign-in's main region):
- `c1-request--resting | --refusal | --after-refresh` (Request key removal; the refusal is under seven days in the role)
- `c2-requested-requester--resting | --refusal | --after-refresh` (the refusal: Cancel after another confirmed)
- `c3-requested-other--resting | --refusal | --after-refresh` (the refusal: Confirm after the requester cancelled)
- `c4-keys-removed--resting | --refusal | --after-refresh` (the refusal: Open registration while one is open)
- `c5-code-panel--once | --after-refresh`, `c5-open--other-administrator`
- `c0-own-row--resting` (the reader's own row while a request stands for it)
- `s1-code--resting | --empty | --wrong-shape | --refusal | --after-refresh`, `s2-code-accepted--key-step`
- `v390-<id>--as-scrolled-down | --actions-in-view` (what a 390 px window shows of the row, not the whole page),
  `v390-c1-request--focused-by-keyboard | --refusal-by-keyboard | --scroll-region-focused`
- `focus-c1-request-button`, `focus-c1-after-refusal`, `focus-c3-confirm-button`, `focus-c4-open-button`,
  `focus-c5-panel-focused`, `focus-s1-code-field`, `focus-s1-after-refusal`
**W53 itself looked at** (once each, as contact sheets): the 1,280 px light row crops of every console state above, the
code screen's resting, wrong-shape and refusal at 1,280 and 390 light, the key step after the code at 390, three dark
crops (c3 refusal, c5 code panel, s1 refusal), six 390 px window shots and three focus crops. **Stored and not looked
at by W53:** every whole-page shot, the after-refresh shots (their state was read from the page's text instead), the
other dark shots, the four button focus crops and the scroll region's focus shot.

**Observed focus orders (Tab from a fresh load; `observed.json` has every stop).**
- **Console, 1,280 px** (103 stops with 40 members): Skip to the content; PaidWhole; the account menu; the 15 console
  navigation links; Help with this screen; then the Members table row by row in email order, each row "End membership"
  then its key control; the invitation form (Email, Role, Send invitation); Invitations; Agreements. The member's key
  control is the 31st stop (30th when the reader's own row, which has no key control, sorts after it). Per state, in the
  member's row: *no removal*: End membership, Request key removal. *Requested, as the requester*: End membership,
  Cancel request. *Requested, as another administrator*: End membership, Confirm key removal, Cancel request. *Keys
  removed*: End membership, Open registration. *Code panel shown*: the panel takes the focus when it appears; it is
  not a Tab stop (Tab goes on to the next row's End membership; Shift+Tab from there returns to this row's End
  membership, not the panel). *Registration open, after a reload*: End membership only. *The reader's own row*: End
  membership only.
- **Console, 390 px** (91 stops): Skip; PaidWhole; the account menu; Menu; Help with this screen; the region "Members,
  scrolls sideways"; then the rows as above (the member's Request key removal is the 18th stop). A focused control in
  the Actions column is scrolled into the window by the browser (seen: left 137, right 307 of 390).
- **Sign-in, the code screen, 1,280 and 390 px** (3 stops, no skip link, no shell): Code from PaidWhole; Continue; the
  support address. **The key step after the right code** (1 stop): Register hardware key.
- **Focus is visible** on every stop of item 37's controls: a 2 px outline, rgb(47, 93, 168), by computed style at every
  stop, and seen in the crops of the refusal summary, the code panel and the code field. Two things that are **not item
  37's** read as having no indicator by computed style and were not looked at in a shot: the region "Members, scrolls
  sideways" at 390 px (`v390-c1-request--scroll-region-focused`), and one segment of each Agreements "Signed on" date
  field.
- **Where focus lands.** After a refusal in the console (all four seen): on the form's refusal summary ("Not done" and
  the rule's sentence, `role="alert"`), inside the member's row. After a wrong code: on the refusal summary. After a
  code of the wrong shape: on the field. After an empty Continue: the browser's own "Please fill out this field." on
  the field (the page's "fill this in" is never reached with JavaScript on). After Open registration: on the code
  panel. **After a press that succeeds** (Request, Cancel request, Confirm key removal) **and after the right code:
  nowhere** (the document body; the next Tab starts from the top).
- **What a refresh keeps and loses.** Console: every state is kept (requested, keys removed, registration open); a
  refusal is lost; the code is lost and the row reads "Registration of a new key is open until … The code was shown
  once to the administrator who opened it." Code screen: the step is kept, the refusal and the typed code are lost
  (the field is already emptied by any refusal, shape included); after the right code a refresh shows the key step
  and never asks for the code again.
- **The one-time code.** Shown once, in the panel only, as "XXXX XXXX" in the mono face. Not in the URL (the page's
  address does not change), not in the title ("Organization | PaidWhole"; the code screen's is "Register a hardware
  key | PaidWhole"), not in a cookie, localStorage or sessionStorage, not in any request's URL from the three browsers,
  not in the page after a reload, not in the other administrator's page, and after the member typed it not in the
  member's page, URL or cookies. **Logs: not shown either way.** The local server wrote 8 lines to stdout and stderr
  over the whole walk, none an application log line, so "never in a log line" is held here by nothing seen; the
  allowlist (`pnpm lint:logs`, green on 656854b1 by W50) is what holds it.

**Findings for the UX and brand review (W53's F1 to F19; each names screen, state, width, shot). F1 and F2 first.**
- **F1. At 390 px the row's account and its key controls are never on screen together.** Console, every state, 390:
  as loaded the table shows Email and Role only, with the state badge and all Actions off to the right
  (`v390-c5-code-panel--after-refresh--as-scrolled-down`: "registration open" is not visible at all); scrolled to
  Actions, the email is gone and the window is a column of identical "End membership" and "Request key removal"
  buttons with nothing saying whose (`v390-c1-request--focused-by-keyboard`), and the badge is cut ("moval
  requested", `v390-c3-requested-other--resting--actions-in-view`). Confirms and sharpens point 33.
- **F2. Every row's button has the same accessible name.** Console, all states, all widths: 40 buttons named "Request
  key removal" (and "End membership"); "Confirm key removal", "Cancel request" and "Open registration" name no account
  either. A screen-reader user moving by button, and the 390 px reader of F1, cannot tell which account a press acts
  on; only the paragraph above Confirm names it. (`observed.json`, the focus orders.)
- **F3. Focus is lost after every press that succeeds** (console: Request, Cancel request, Confirm key removal; 1,280
  and 390) **and after the right code** (sign-in). The page re-renders, focus is on the body, the row's new state is
  not announced and the keyboard user starts again from Skip to the content, 30 stops from the row. The code panel is
  the one success that takes focus.
- **F4. Nothing says the code was accepted.** Sign-in, after the right code, 390 and 1,280
  (`s2-code-accepted--key-step`): the card changes to the ordinary first-registration words ("Your role signs in with
  a hardware key only…") with no "code accepted" and no focus move (F3).
- **F5. A code of the wrong shape is emptied.** Sign-in, wrong shape (`s1-code--wrong-shape`): the field is cleared
  and marked "Emptied for your security." beside "enter the eight letters and digits…", so the person cannot see or
  mend what they mistyped, for a code that never reached the database.
- **F6. The empty field is answered by the browser, not the page.** Sign-in, empty Continue (`s1-code--empty`):
  Chromium's "Please fill out this field." bubble; the page's own "fill this in" is not reached. In the headless shots
  the bubble then stays over the wrong-shape and refusal shots, covering part of "Emptied for your security." and the
  hint (`s1-code--wrong-shape`, `s1-code--refusal`, 1,280 light and dark); whether it lingers for a person in a
  headed browser was not seen.
- **F7. The code panel leaves the old state above it.** Console, code shown, all widths (`c5-code-panel--once`): the
  badge still reads "keys removed" and the paragraph "Open registration only when you are speaking with the person…"
  still stands above "Registration is open for … until …", until a reload turns the badge to "registration open".
- **F8. The code panel cannot be returned to by keyboard.** Console, code shown: once focus leaves the panel no Tab
  or Shift+Tab stop brings it back (it is `tabindex="-1"`); a screen-reader user who moved on must find it by reading.
  And a reload to "find it again" destroys the code (point 36: the panel says so, but not what to do when lost).
- **F9. "Requested, as the requester" offers a refusal the page cannot explain.** Console, requester, after another
  administrator confirmed (`c2-requested-requester--refusal`): Cancel request answers "This removal is already
  decided; reload the page" while the row still reads "You asked… Another platform administrator confirms it". Same
  words for Confirm after a cancel (`c3-requested-other--refusal`): "decided" there means cancelled. The page does not
  read itself again after these refusals.
- **F10. The refusal named in W50's list cannot be met in the page.** "The requester pressing Confirm on their own
  request": the requester is offered no Confirm button in any state seen, so that sentence
  (`hardware_key_removal_two_people`) was not shot; it is reachable only by a forged post.
- **F11. The seven-day refusal tells the reader to do something that will not help.** Console, Request key removal,
  administrator under seven days (`c1-request--refusal`): one sentence covers both causes and ends "sign out, sign in
  again with your key, then try again", which changes nothing for an administrator five days in the role. Long, three
  lines at 1,280, seven at 390 (point 35).
- **F12. End membership and the key text read as one block.** Console, requested and keys removed, 1,280
  (`c3-requested-other--resting`, `c4-keys-removed--resting`): the "End membership" button sits directly above "… asked
  to remove this account's hardware keys…" with no heading or rule between, in a cell that grows to 290 px tall
  (368 px with a refusal; 450 and 568 px at 390) while the other rows stay 90 px.
- **F13. "Confirm key removal" is a pale tint with red words** (`focus-c3-confirm-button`, `c3-requested-other--resting`,
  light and dark): the destructive variant, as "End membership" is not. Contrast of the red on the tint was not
  measured. Point 34 stands: one press, no typed confirmation.
- **F14. Times are not in the mono face** by eye (`c2`, `c3`, `c4`, `c5` crops: "2026-11-12 20:43 UTC" in the text
  face; the code is mono). Not checked against computed style.
- **F15. The typed code is in the text face** (`s1-code--resting`): W45's point 3, seen.
- **F16. The refusal summary capitalises the rule's sentence** ("Only a platform administrator…", "This removal is
  already decided; reload the page") and gives it no full stop; the summary's heading is "Not done". Point 35, seen.
- **F17. The email wraps in the Account column at 1,280 px** once the Actions cell widens
  ("key-removal-" / "member@synthetic.test", every requested and removed state), and in the code panel's first line
  at both widths.
- **F18. The own-row note sits under End membership** (`c0-own-row--resting`): "Another administrator asked to remove
  your hardware keys. Two others decide it." in muted text below the button; there is no badge reason beyond "key
  removal requested". "Two others": one has already asked.
- **F19. Dark (tokens only) held** on the three dark crops looked at: badges, the refusal summary, the code panel and
  the code read clearly; nothing was found there.
Points 33 to 38 of W50's list: 33 seen (F1); 34 seen (F13); 35 seen (F11, F16); 36 seen (F8); 37 and 38 seen as
written ("It cannot be undone", "You asked"), no new observation.

**The e2e spec: `apps/web/e2e/key-registry.spec.ts`, one test, passing.** The journey of section 10: both
administrators and the member register keys through the app; an administrator under seven days is refused; one
requests (and is offered no Confirm); the other's second request is refused; the member is still signed in; the other
confirms; the member's session ends and the removed key is refused; password and authenticator code reach only the
code step (the console is not there for that cookie); a code before any opening and a code of the wrong shape are
refused; an administrator opens registration (the panel focused; the code in no URL, title, cookie or storage); a
second opening from a page read earlier is refused; a reload shows no code to either administrator; a wrong code is
refused and a refresh keeps the step; the right code, typed lower case with a hyphen, shows the key step; the member
registers a new key and signs in with it; the console offers Request again; the registry holds one confirmed removal
by two people and one key registered after it.
- `pnpm test:e2e e2e/key-registry.spec.ts e2e/hardware-key.spec.ts --trace off` (PostgreSQL 18, a full build):
  **4 passed** (the journey 10 s). `pnpm typecheck`: 24 projects passed. ESLint on the two files: clean.
  `apps/web/scripts/seed.db.test.ts`: passed.
- **Seen failing:** with `answerRegistrationCode` made to accept a refused code (a scratch change to
  `apps/web/src/lib/auth/sign-in.ts` line 889, reverted, never committed) the same command fails at the first code
  refusal the spec expects (`expectCodeRefused`).
- **The one clock it moves:** seven days in the role. As the owner, triggers off for that transaction (the pattern of
  monitoring, packets and screening specs), it back-dates the two memberships **and the `role_escalation` audit event
  the seed's insert recorded for each** (the rule reads both; W50's note named only the first). Nothing else is moved.
- **Not retry-safe after the confirmation:** a retried attempt finds the member closed. CI fails a flaky test anyway.
- **Not done:** the registry rows (SGN-20 to SGN-27) do not name this spec (`packages/synth/src/cases/registry.ts`
  and the fixtures are W52's on the other ref); the whole `pnpm test:e2e` and `pnpm test:golden` were not run.

**Not seen, and why.** The 24-hour expiry of a request and "this request has expired; ask again" (needs a second
moved clock); five wrong codes closing an opening (the spec and the walk type two); the 15-minute key-session refusal
(the same sentence as the seven-day one); the step timer's warning and closed states on the code screen (the tour's
own); `hardware_key_removal_requester_left` and `hardware_key_registration_not_closed`; the page without JavaScript;
a screen reader's own speech; any headed browser; contrast figures. The whole-page and after-refresh shots are in the
gallery unread by W53, as listed above.

**Machine notes.** PostgreSQL 18 was down again at start (`su postgres -c "/opt/pg18/bin/pg_ctl -D /root/pgdata18 -o
'-p 5433 -k /tmp' -l /tmp/pg18.log -w start"`); e2e needs `E2E_ADMIN_URL=postgres://postgres:test@localhost:5433/postgres`.
The standalone server's process is named `next-server`: free port 3100 by the port, not by the script's name. W53
holds no PR, no subagent, no scheduled task and no running server.

**W52 adds (2026-11-12, session_019i9ifCRjPnsiRtqtB38Vmm): SGN-22's test and W43's item 6 are BUILT and green; WIP
`co-001/wip-key-registry` is now 3187bda3 (one commit on 656854b1). No migration touched, no PR, no e2e spec or
screen touched. Items 1 and 4 of the list below are done; the rest of the list stands.**

*What is built*
- **SGN-22's own test** (`packages/db/src/key-registry.db.test.ts`, the last `describe`; 16 cases). Two connections of
  the application's role, the first holding the account's row uncommitted, the second **seen waiting on a lock**
  (`pg_stat_activity`), then the invariant read as the owner (no live session whose digest is not a live key; none
  begun at or before the mark): a sign-in first, then each of confirmation, End membership, reset (the session is
  ended); each of the three first, then a sign-in begun before it (refused: `user_session_hardware_key_live` after a
  confirmation, `user_session_sign_in_not_before` after the other two); each first, then a sign-in begun after its
  clock and before its commit (refused after a confirmation; opens after the other two, its key live); the six
  ordered pairs of the three (no session left, a step begun before either opens none); and the registry's two
  migrations do not name `resolve_session`.
- **The count** (`apps/web/src/lib/routes/session-end.db.test.ts`, the last `describe`): `resolveSession` issues
  **three statements, one read** (`BEGIN`, the resolving statement written out in the test, `COMMIT`) for a key
  session of the registry, a code session and an unknown cookie; none with no cookie. **No new round trip.** "The same
  as on the base": `resolveSession` and `withResolvedActor` have no diff from `origin/claude/build-platform`, and the
  test's literal is the base's `RESOLVE_SESSION`.
- **Shown red first, in scratch changes never committed** (the migrations were not edited: the function was replaced
  in the test's scratch database): the registry trigger's lock line removed, so its check runs before the lock the
  next trigger takes: 2 failed, the invariant with `without_a_live_key: 1, live: 1` and `second: accepted`; the
  mark's trigger disabled: 4 failed, `at_or_before_the_mark: 1`; one more read in `resolveSession`: the statement
  list failed with the fourth statement named.
- **The matrix:** SGN-22's assertion rewritten in `matrix.ts` and `docs/product/test-matrix.md`, the "not yet
  written" note dropped from `registry.ts`, which now names the two test files; `pnpm synth --all` rewrote
  `fixtures/synthetic/SGN-22/expected.json` (1 file).
- **Item 6 (a), the relying-party tie** (`apps/web/src/lib/auth/sign-in.ts`, `oneRelyingParty`,
  `RelyingPartyMismatch`): as the note's section 5 has it, the provider's ID is read from the options of the first key
  step that carries one (`rpId` at sign-in, `rp.id` at registration), compared once in the process, logged once at
  error (`configuration: the relying-party ID is not the provider’s; hardware-key steps are refused`, `request_id`
  only), and that step and every later key step (begin and complete, sign-in and registration) throws, the later
  ones before the provider is asked. The message names `WEBAUTHN_RP_ID`, the host of `APP_ORIGIN` and the stack's
  application domain name, and neither value. Tests first (3, in `sign-in.db.test.ts`): red on the missing class,
  then green.
  **The choice taken, said plainly: refuse, not warn; and at the first key step, not at boot.** The pool's ID is
  known to the web only from the provider's options, so the process starts and serves everything else; what it
  refuses is every hardware-key step, so no key session opens on a mismatch. Refusing at boot would need a provider
  read the web's role does not hold (`DescribeUserPool`), which the note does not ask for.
- **Item 6 (b), the infra ties** (`infra/test/identity.test.ts`): the pool's `WebAuthnUserVerification` is `required`
  exactly when `KEY_USER_VERIFICATION_REQUIRED` (read from `sign-in.ts`, declared once) is true, and both of the
  web's checks take the constant and no literal; the web task's `WEBAUTHN_RP_ID` is the pool's
  `WebAuthnRelyingPartyID` and its `APP_ORIGIN` is https on it. Red in scratch three ways (the constant false; the
  pool PREFERRED; the web's variable another host), then green.

*What is green (PostgreSQL 18, Node 24; one run on the tree of 3187bda3)*
- `pnpm typecheck`: passed, 24 projects. `pnpm lint`: 1,959 files, 0 errors, 0 warnings. `pnpm lint:logs`: 1,209
  files, every call allowlisted. `pnpm verify-content`: every content set passes.
- `pnpm test` (the whole unit suite, the web's among it): **510 files; 14,376 passed, 4 skipped, 0 failed** (W50's
  14,373 and infra's 3 new).
- Infra's tests (`vitest run --project unit infra/`): **29 files, 831 passed, 0 failed.**
- `pnpm test:db` whole, 25 minutes, alone on the machine: **175 files; 10,572 passed, 1 skipped, 0 failed** (W50's
  10,552 and 20 new: SGN-22's 16 and 1, the relying party's 3).
- **Not run:** `pnpm test:e2e`, `pnpm test:golden`.

*W52's points for the reviews (48 to 56, after W50's)*
48. **(auth review) The relying-party refusal is at the first key step of each process, not at start-up** (above);
    whether a boot-time read of the pool is wanted is a decision with an IAM grant behind it.
49. **(security and deploy review) The mismatch's error line pages nobody**: no metric filter counts it (the note
    names none; the filter count stays 42). On a mismatch every key step answers as an unexpected failure.
50. **(auth review) Options that carry no relying-party ID are not compared**, and the check stays open until one
    does. Whether the provider always sends `rpId` in its request options is unverified on this machine; if it
    never does at sign-in, only a registration compares.
51. **(auth review) A mismatch is latched until the process ends**; mending the setting is a deploy, which replaces
    the tasks.
52. **(UX review) What a person sees when a key step throws `RelyingPartyMismatch`** is whatever the routes show for
    an unexpected failure; W52 did not look (the screens were W53's).
53. **(database review) A sign-in begun after End membership's or a reset's clock and before its commit opens a
    session** (began after the mark, key live): the migration's comment says so and SGN-22 now pins it. One begun
    in the mark's own millisecond is refused (`sign_in_step_began` cuts to the millisecond).
54. **(database review) What SGN-22 was not shown red for:** the order "sign-in first, the mover waits" rests on each
    mover's own lock (the confirmation's `FOR NO KEY UPDATE`, the two UPDATEs of the account's row); those were not
    removed in scratch.
55. **(auth review) The user-verification tie reads the web's source text**, as the relying-party test beside it
    does; the provider twin's `'required'` literals are not held to the constant.
56. **(database review) SGN-22's cases wait up to five seconds to see the second connection on a lock** and fail if
    it never waits; on a slow machine that is the first place to look.

*Machine notes:* PostgreSQL was stopped again (the same `pg_ctl` line). The checkout is on a local branch
`co-001/wip-key-registry` at 3187bda3. W52 read, beyond its list, the registry migration's sections 5 and 6 and the
confirmation's body, and migration 20261112090000's session trigger, to write the interleavings. W52 holds nothing:
no PR, no subagent, no scheduled task; its one background run has ended.


**WIP `co-001/wip-key-registry` 656854b1** (three commits on 7f986ed0: 1d86db50 the records, 2d0e08b4 the absence
alarm, 656854b1 one alarm's words). No PR is open. No migration was touched, and none may be. W50 handed over at about
185k tokens, at Part 3's end, **before Part 4**: nobody has yet seen item 37's screens in a browser.

### What the next session does, in this order
1. **SGN-22's test (the orchestrator's ruling, 19:50 UTC: not a residual).** The interleaving invariant (over sign-in,
   a removal's confirmation, End membership and a reset on one account, two connections, each order of the account
   lock: never a live session whose digest is not a live key, never one begun at or before the mark) and the count
   that `resolveSession` issues the same statements as on the base. Failing first, by removing or reordering what it
   guards, then green. Today the row says "Not yet written" (`packages/synth/src/cases/matrix.ts` SGN-22, the note in
   `registry.ts`, `docs/product/test-matrix.md`): when the test exists, rewrite the row's assertion, drop the note,
   name the test file in the registry, write the same row into the `.md` (the fixtures test compares word for word),
   `pnpm synth --all`, and drop ADR 0095's nothing (it does not name SGN-22).
2. **See the five screens (Part 4, not started).** `/sign-in/register-key`'s code screen and the four console states
   on `/console/organizations/[organizationId]` (request key removal; requested, as the requester and as another
   administrator; keys removed with Open registration; the code panel once and after a reload). Each at 390 px and
   1,280 px light and 1,280 px dark, resting, a refusal, and after a refresh; each walked by keyboard with the focus
   order written down. Fix only an outright break; list the rest for the UX and brand review. What W50 found out:
   - `tools/lane-b-screen-tour/README.md` (ops), "From another lane": **the repository is public, so PNGs never go on
     a branch**; they go in a `TOUR_DIR` in the scratchpad and are published as a private gallery
     (`tools/lane-b-screen-gallery`); only findings, the manifest and small crops are committed to claude/build-ops.
     The app has dark tokens and no switch: the tour sets `data-theme` itself.
   - The tour already shoots `/sign-in/register-key`'s base states (`capture/tour.spec.ts` about line 1646) and
     `apps/web/e2e/helpers.ts` holds a virtual authenticator (CDP `WebAuthn.addVirtualAuthenticator`).
   - The console states need what the seed does not give: two platform administrators of the internal organization
     **more than seven days in the role with no `role_escalation` in seven days** (back-date as the owner), each in a
     **key session opened in the last 15 minutes with a registered key** (register through the app with the virtual
     authenticator: a key from before the registry has no row), and a target member. The refusals to shoot: the
     requester pressing Confirm on their own request; a wrong registration code; Open registration while one is open.
   - The screens' files: `apps/web/src/components/console/key-removal.tsx`, `open-registration.tsx`,
     `apps/web/src/app/sign-in/register-key/page.tsx`.
3. **The e2e journey** (request, confirm, open, the code typed, the new key registered) is not written; `pnpm
   test:e2e` and `pnpm test:golden` were not run by W50 or any session on this WIP.
4. **W43's item 6** (the relying-party tie and the infra test tying `KEY_USER_VERIFICATION_REQUIRED` to the pool's
   setting) is still not started. W50's brief did not list it; ask the orchestrator whether it rides this PR.
5. **The two adversarial reviews** (auth and tenant isolation; the job, the outbox and deploy safety) and the **UX and
   brand review**, on the one list below; at most two fix rounds.
6. **The domain model's regeneration**, right before the PR, and **the PR** from `.github/pull_request_template.md`,
   opened with `pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs list`, with
   "What the founder should know before approving" (below), the approval line posted as a suggestion, never written.

### What W50 built
- **ADR 0095** (`docs/adr/0095-remove-a-members-hardware-keys-…md`): D1 to D20, the eight decisions the migration
  took beyond the note, deploy and rollback, the amendments, "Open, said plainly" (points 20 and 21 below) and the
  residuals. ADRs 0093 and 0094 each end with a dated amendment that points to it (0093 D4, D6, "Not covered" 5;
  0094 D2 to D7, "left open", D3 moot).
- **Runbooks.** `deploy-and-rollback.md`: a new section "The key registry (ADR 0095; Queues item 37)" with both
  lock-loop lines as the deploy log shows them, what the deploy asks of staff (register keys again in the deploy's
  session; the operator's audit-log check), while the previous images serve, and "Rollback across the key registry"
  (**no staff sign-in until roll-forward**). `incident-response.md`: the two sections on a failed provider sign-out
  are replaced by "A provider sign-out not delivered", "The provider sign-out job not running" and "The hardware key
  section: removing a member's hardware keys"; triggers, End membership's paragraph, the sessions-not-ended section
  (no sign-out was queued: the founder's session sends it), the key-across-reset steps (the console, not break-glass)
  and the weekly review follow. `support-mail.md`: "Lost hardware key" and a new "A hardware-key email, I did not
  expect this".
- **Test matrix:** SGN-20 to SGN-27, SEC-25 to SEC-27, JOB-06 to JOB-08 in `matrix.ts`, `registry.ts`,
  `docs/product/test-matrix.md` and `fixtures/synthetic/<id>/expected.json`; SGN-16's and SGN-19's rows no longer
  describe the web asking the provider. Each row's words were checked against the tests' own titles.
- **The absence alarm (the ruling on point 26).** The job writes `provider sign-outs run` once a run at info, with
  `record_count` (rows claimed) and nothing else, whether or not a step failed. `PROVIDER_SIGN_OUTS_NOT_RUNNING_ALARM`
  (`infra/lib/security-events.ts`): metric `ProviderSignOutsRun` on the **platform** log group, alarm
  `ProviderSignOutsNotRunning` when two 300 s periods sum under 1, **missing data breaching**, operator topic on
  ALARM and on OK. Filter count 41 to 42. Tests first: infra's failed on the missing construct (6), then on the
  pinned count, then green. **Said plainly: the worker's new case was first run after the line existed** (PostgreSQL
  was down when the test was written); what was seen failing there is nine older cases that pinned every captured
  line, mended by holding the run's own line apart in the test's `capture()` (`lines` and `runs`), not by loosening
  any case.
- **`HardwareKeyRegisteredAcrossReset`'s description (the orchestrator's second ruling).** Old words: "so have the key
  removed through the founder's break-glass before anyone unlocks it" and "the key signs in, so go to the break-glass
  now". New: "so two platform administrators remove the account's keys in the console before anyone unlocks it" and
  "the key signs in, so end the membership now, then remove the keys", with docs/adr/0095 cited; the test's pinned
  words changed with it and now refuse "break-glass" there.

### What is green (PostgreSQL 18, Node 24)
The long run was on **2d0e08b4** with 656854b1's two infra files already edited in the tree when the unit suite
began (the typecheck of that run had started before the edit); typecheck, lint and infra's tests were then run again
on **656854b1**.
- `pnpm typecheck`: passed, 24 projects (on 656854b1). `pnpm lint`: 1,959 files, 0 errors, 0 warnings (on 656854b1).
  `pnpm lint:logs`: 1,209 files, every call allowlisted. `pnpm verify-content`: every content set passes.
- `pnpm test` (the whole unit suite): **510 files passed; 14,373 passed, 4 skipped, 0 failed.** The two
  `migrate.test.ts` failures, red since 03f0af53, are green by the runbook's two quoted lines; the test is unchanged.
- Infra's tests (`vitest run --project unit infra/`, on 656854b1): **29 files, 828 passed, 0 failed.**
- `pnpm test:db` whole, 26 minutes, alone on the machine: **175 files passed; 10,552 passed, 1 skipped, 0 failed.**
- **Not run:** `pnpm test:e2e`, `pnpm test:golden`.

### What the founder should know before approving (for the PR's section)
- Staff register their hardware keys again in this deploy's session; a rollback of this release means **no staff
  sign-in until the image rolls forward**.
- Key removal leaves the founder's break-glass: two platform administrators, neither the account, each seven days in
  the role; break-glass stays for fewer than two eligible administrators, and for a given-up provider sign-out.
- After a removal the account can open **no session at all** until an administrator opens registration with a
  one-time code read to the member by phone.
- Every session insert now takes the account's row lock (amends ADR 0093 D4).
- Two points are open by decision (20 and 21 below), and the migration took eight decisions beyond the design note
  (ADR 0095 lists them).

### Every named point for the reviews, in ONE list (W47's 1 to 39 with their numbers kept; W50's 40 to 47 after)
**What changed in W47's points:** 2 and 23 are now said in ADR 0095 ("Amendments to earlier records"). 20 and 21 are
recorded as open in ADR 0095: **20 goes to the security review** (closing it needs a migration, by the co-founder's
typed command) and **21 is queued as its own item before launch**; neither is this PR's to close. **26 is built**
(the absence alarm above): review the alarm itself (point 41). 32: the runbook now exists and says "by phone, on a
number PaidWhole already holds". 39: the incident runbook's hardware key section now exists; GAVE_UP still goes to
the founder's break-glass.

**For the security review, first, from the orchestrator:**
1. **A refused act leaves no trace.** A refused act writes no audit event because it rolls back (W46), so a refused
   key removal (the requester confirming their own request, an administrator under seven days, a stale key session,
   the account acting on itself) is recorded nowhere but a log line of the wrapper's. The security review says
   whether sections 4.5 and 6 of the note require a trace of a refused removal and, if so, how it survives the
   rollback (a second transaction after the refusal, an autonomous write by the function before it raises, or a
   counted log line with an alarm).

**Auth review**
2. (W33, the ruling's point 4) Every session insert now takes the account's row, the previous image's included,
   which ADR 0093 D4 had left unlocked on purpose. ADR 0095 needs the dated section amending D4, and "What the
   founder should know" a line.
3. (W33) `hardware_key_record` is an uncounted check of a code digest for whoever holds the application role
   (decision 7); the 40 bits and the hour bound it.
4. (W43) The job reads the provider's `UserNotFoundException` as `no_such_user` and marks the row done with no
   sign-out; a pool ID naming the wrong pool would turn every row into that answer. Nothing checks the pool at start.
5. (W43) The `removed` email tells the reader that support gives a one-time code: whether an email should say a code
   exists at all.
6. (W44, W45) `hardware_key_registration_judge` asked with no code counts a try, and the free "closed?" helper is
   granted to no role. The web reads closed from the registry's rows; the one case it cannot see is a removal
   confirmed for an account that never had a key row, whose first visit spends one of the five tries. Recorded for
   the contract migration, not built.
7. (W44) `codeRequired` and `code` live in the sealed step, but nothing trusts them: `judge` runs before each
   provider call and `hardware_key_record` judges again under the lock.
8. (W44) The cleaning skips a provider credential whose ID is not canonical base64url of 16 to 1,023 bytes; whether
   Cognito's `CredentialId` is exactly the browser's `id` is unverified; if not, the cleaning deletes nothing.
9. (W44) The cleaning measures "older than 15 minutes" from the database's clock against the provider's: two clocks.
10. (W44) A registration that fails for a reason that is not a refusal now answers `key_not_registered` after
    removing the key, where the base threw; the error's class name is logged.
11. (W45) The code action is counted in `mfa` by the sealed step, the same budget as the key routes; whether the
    code deserves a budget of its own.
12. (W45) A code typed for an account that is not closed is answered as a step forward (`not_closed`), not a refusal.
13. (W45) The shape's refusal differs from the wrong code's (a field issue against the one refusal).
14. (W46) `AuditSpec.writtenBy: 'database'` lets a route name an audit action the wrapper never writes; only the
    four key routes use it, each tested for exactly one event; no test yet refuses the flag on any other route.
15. (W46) `runAction`'s `answer` returns a server action's success state without a redirect. One caller.
16. (W46) 42501 from the functions is answered `invalid` with the rule's words, not `forbidden`.
17. (W46) The lost code: one administrator can hold an account closed an hour at a time by opening and discarding
    codes; each is audited and sends the member the opening's notice.
18. (W46) The page lists removals only beside an organization's members; an account with no membership row has no
    row to act on.
19. (W46) `organizationId` in the key routes' inputs is used for the redirect only and is not checked against the
    account's memberships.
20. **(W47) A reset that recorded nothing now signs out nowhere.** When both tries of `endedByReset` fail (or the
    database goes away after the provider took the new password), the previous web still asked the provider to sign
    the user out; now no cause committed, so no row exists and nothing asks. The password is changed at the
    provider, the app's sessions stand, and the one signal is `security event: password reset sessions not ended`
    (`PasswordResetSessionsNotEnded`, whose words now say no sign-out was queued). The provider's sign-out never
    ended the app's sessions, so what is lost is the provider's tokens ending for that account until the operator
    acts. Closing it would take a way to queue a sign-out without the reset's event (a function and a grant: a
    migration, closed to W47). The review says whether the runbook's step is enough.
21. **(W47) The web's task can still send the sign-out.** The web and the worker share one task role
    (`USER_POOL_ADMIN_ACTIONS`), so the web's credentials still hold `cognito-idp:AdminUserGlobalSignOut` though no
    code of the web sends it. Splitting the role is larger than this step.
22. **(W47) `whenCommitUnknown` is gone from the wrapper.** After a commit with no answer no handler work runs. No
    route but the two End memberships used it; any later route that wants work for that case must write a row.
23. **(W47) The Settings route no longer reads `cognito_sub`** under the administrator's scope before ending the
    membership; ADR 0094's note on reading the subject "while the membership stands" is now moot and ADR 0095
    should say so.

**Security review**
24. (W46) The registration code crosses the server-action response to the administrator's browser and lives in
    React state until the page goes; `autocomplete`, storage and the URL never see it.
25. **(W47) During a deploy the previous web's failure line pages nobody** once the new infra is in (its two alarms
    are gone); covered by the row and the job, as "Safe with the previous image" says. And the reverse order (new
    web, no job yet) asks the provider nothing until the worker is replaced.
26. **(W47, W43's open point, still open) Nothing by name alarms when `provider_sign_outs` does not run.** Section 7
    asks the build to confirm the platform schedule's missed-run alarm covers the job. W47 looked: `infra/lib` names
    the job in no alarm list; what exists is the platform heartbeat (the process is alive) and the final-failure
    filter on the platform group (`JobFailedOnLastAttempt`, a run that fails). A schedule that stops firing this one
    job while the process beats is heard by neither, and rows then wait unpaged (LATE needs tries). Not built: it
    needs a decision on a per-job missed-run signal (for example an alarm on rows undone past N minutes, written by
    another job, or a per-job beat).
27. (W43) The failed-try warning carries no cause `request_id` (`operator_provider_sign_out_claim()` does not return
    it; migrations closed). The LATE and GAVE_UP lines carry it.

**Database review**
28. (W33) `membership_removal_target_holds` holds while a request is `requested`, including one past its 24 hours
    that the job has not yet marked expired (at most a minute).
29. (W43) The run's 8 seconds are counted from the first claim and each call may take 10 seconds more; the operator
    pool has two connections and this job holds one for the run.
30. (W43) The worker's tests assert `operator_key_removals_expire` is called; they do not expire a real lapsed
    request (W32's database tests hold the function).

**Wording, UX and brand review**
31. (W43) The step-failed line's `error_code` is `<step>:<error name>`, a compound code.
32. (W45, W46) "by phone, on a number you already hold" states the runbook before it exists.
33. (W46) The Actions cell of a member under removal holds two paragraphs and two buttons in a table cell; at 390 px
    the table scrolls sideways, not seen.
34. (W46) "Confirm key removal" is one press with its consequence in the paragraph above, no typed confirmation.
35. (W46) The refusals are lower-case rule sentences in the form's error; the first is long.
36. (W46) If the code is lost the opening stands for its hour; the screen says "shown once" and not what to do then.
37. (W46) "It cannot be undone" on a button whose effect a new registration mends.
38. (W46) The requester sees their own request as "You asked".
39. **(W47) The two new alarm descriptions** (`ProviderSignOutNotDelivered`, `RemovedHardwareKeyUsed`) point at
    "docs/runbooks/incident-response.md, the hardware key section", which the runbook step has yet to write, and
    `ProviderSignOutNotDelivered` tells the operator to have the user signed out "through the founder's break-glass"
    for GAVE_UP (16.6: until an operator function exists the one resend left is the founder's).

**W50's points**
40. **(security and deploy review) SGN-22 has no test yet** (first in "What the next session does"); until it exists
    the invariant is held only by its parts (SGN-20's refusals, SGN-26 case 7).
41. **(deploy review) `ProviderSignOutsNotRunning` can raise once in the deploy that creates it**, between the alarm's
    creation and the new platform task's first run (missing data breaches, two 300 s periods), and pages for as long
    as a rolled-back platform image without the job runs. The deploy runbook says both. Whether ten minutes is the
    right window, and whether the line should be written at the run's end (as built: a hung run is heard too) or its
    start.
42. **(deploy review) The run line is one a minute at info** on the platform group, about 1,440 lines a day.
43. **(security review) The deploy runbook's staff check reads the audit log as the operator role**
    (`hardware_key_registered` since the migration's commit); the registry's own count of live keys is the owner's
    to read, since both runtime roles hold no privilege on the tables. Whether the founder's read belongs in every
    deploy of this release.
44. **(security review) `sign-in.ts` about line 1011 audits `hardware_key_registered` and `hardware_key_record`
    inserts the same action**: W50 saw both while writing the runbook's query (which groups by actor) and did not
    read whether one registration writes two rows.
45. **(wording review) The runbooks' new words** (the three incident sections, the deploy section, the two support
    bullets) and **the two alarm descriptions W50 wrote or changed** (`ProviderSignOutsNotRunning`,
    `HardwareKeyRegisteredAcrossReset`) have had no wording review.
46. **(wording review) The incident runbook tells the operator a lost code means waiting out its hour**: the database
    refuses a second opening while one is usable (`hardware_key_registration_open_once`); point 36's screen words
    should agree.
47. **(UX and brand review) Nothing of item 37's screens has been seen**: points 33 to 38 stand as unseen.

### Machine notes
As W47's (PostgreSQL 18 was stopped again when this container woke; the same `pg_ctl` line). The checkout is detached
at the WIP commit; push with `git push origin HEAD:refs/heads/co-001/wip-key-registry`. **Beyond what it was told to
read, W50 read about 20 lines of the design note's section 10** (the one-line definitions of the fourteen matrix
rows, and SGN-22's four lines), since no other record says what each row asserts. W50 holds nothing else: no PR, no
subagent, no scheduled task; its one background run (the suites) has ended.


## The earlier block (2026-11-12, W47, session_019i9if9pdiBq7WR2Rdf8ezT): the BUILD of item 37 is whole (W43's item 5 done: the web asks the provider for no sign-out, the alarms moved); what is left is seeing it in a browser, the two reviews, and the papers

**WIP `co-001/wip-key-registry` 7f986ed0** (three commits on 03f0af53). No PR is open. No migration was touched: the step
needed nothing the functions and grants did not already give (the row is queued by `audit_event_provider_sign_out`,
the trigger W33 built, on the audit event each act already wrote). The last session needs this block; W46's (the
console), W45's (the code screen), W44's (the flow), W43's (the job) and W33's (the database) are the references.

### What W47 built (W43's item 5, whole; commit 5b7729a4)
- **The three call sites.** `lib/routes/console.ts` `endMembership`, `lib/routes/settings.ts` `endMembershipAction`
  and `lib/auth/sign-in.ts` `endedByReset` no longer ask the provider anything. Each already wrote its audit event
  (`membership_ended`; `password_reset_completed` or `password_reset_outcome_unknown`) inside its own transaction,
  and the database's trigger queues one `provider_sign_out` row on that insert, so **the enqueue is the act's own
  transaction: a committed act has its row, a rolled-back act has none.** The job `provider_sign_outs` sends it.
  Nothing is sent from the web, after commit or otherwise. The Settings route no longer reads the person's provider
  subject at all (the trigger reads the account).
- **Removed with it:** `lib/auth/provider-sign-out.ts` and its test (`signOutAtProviderAfterCommit`,
  `NO_PROVIDER_SUBJECT`); `AuthProvider.globalSignOut` from the interface, the Cognito provider (with
  `signOutTimeoutMs`, `SIGN_OUT_TIMEOUT_MS` and the `AdminUserGlobalSignOutCommand` import) and the local twin, and
  their unit tests; `AfterCommitOptions.whenCommitUnknown` (`http/route.ts`, `http/invoke.ts`), which only the helper
  used: a commit that ends without an answer now runs no handler work at all, and what must follow it is the row's.
  `packages/synth/src/cases/registry.ts` SGN-19 lists the new test file in place of the deleted one.
- **The proof, kept as a test:** `lib/auth/no-provider-sign-out.test.ts` scans every `.ts`, `.tsx`, `.js`, `.mjs`,
  `.cjs` and `.json` file under `apps/web` (not `node_modules`, not dot-directories) and fails on any mention of the
  provider's sign-out, code or comment; the one allowed line is a test's `expect(provider).not.toHaveProperty(...)`.
  The grep (the same on 7f986ed0):
  ```
  $ grep -rn 'globalSignOut\|signOutAtProviderAfterCommit' apps/web/src
  apps/web/src/lib/auth/no-provider-sign-out.test.ts:20:const ALLOWED = /^\s*expect\(provider\)\.not\.toHaveProperty\('globalSignOut'\);$/;
  apps/web/src/lib/auth/sign-in.db.test.ts:591:    expect(provider).not.toHaveProperty('globalSignOut');
  apps/web/src/lib/routes/console-routes.db.test.ts:400:      expect(provider).not.toHaveProperty('globalSignOut');
  apps/web/src/lib/routes/console-routes.db.test.ts:1232:    expect(provider).not.toHaveProperty('globalSignOut');
  $ grep -rn 'GlobalSignOutCommand' apps packages --include=*.ts -l
  apps/worker/src/platform/cognito-sign-out.ts
  apps/worker/src/platform/cognito-sign-out.test.ts
  ```
  Four lines, all tests asserting the method does not exist; no call. The SDK's command is the worker's alone.
- **The alarms (same commit).** `infra/lib/security-events.ts`: `PasswordResetProviderSignOutFailed` and
  `MembershipEndProviderSignOutFailed` (and their two message constants) are gone from `RESET_AND_ENROLMENT_COUNTS`
  (the web's set, now 13 lines); `PROVIDER_SIGN_OUT_NOT_DELIVERED_ALARM` (`ProviderSignOutNotDelivered`, the job's
  words, 1 in 300 s) is new and `monitoring.ts` builds it on the **platform** log group
  (`monitoring.providerSignOutNotDeliveredAlarm`, namespace `TherapyPlatform/Worker`, filter on `$.msg` alone so
  LATE and GAVE_UP both count, operator topic, missing data not breaching). `RemovedHardwareKeyUsed` (W43's "plus")
  joined the web's set for the line `sign-in.ts` 502 writes. The filter count stays 41 (two out, two in).
  `PasswordResetSessionsNotEnded`'s words now also say no sign-out at Cognito was queued. `infra/test/monitoring
  .test.ts` ties the job's line to `apps/worker/src/platform/provider-sign-outs.ts` and holds that the three web
  sources hold no words about the provider's sign-out. `application-role.test.ts`: the web's provider sends
  `AdminCreateUser` and `AdminGetUser` only; the third action of the shared task role is the worker's.

### Tests first, and what was seen failing
- `no-provider-sign-out.test.ts`: failed on its assertion (`expected [ …(31) ] to deeply equal []`: 31 lines in 9
  files named the sign-out), then green.
- `sign-in.db.test.ts` and `console-routes.db.test.ts`, rewritten before the code: **4 failed, 114 passed**, each
  failure the assertion `expected DevAuthProvider{…} to not have property "globalSignOut"` (SGN-07's reset, SGN-19
  in both routes, the key removal's confirm). **Said plainly: the assertions on the queued row passed already before
  the change**, because the trigger has queued the row since W33's migration; what the change removes is the web's
  call, and that is what was red. (The first two runs of these files failed only because PostgreSQL was not
  running; those do not count and are not the failures above.)
- `infra/test/monitoring.test.ts`, rewritten before the infra change: 20 failed (the pinned list of counted lines
  by assertion; the web line's tie by assertion; the new alarm's tests because the construct did not exist yet),
  then green. `application-role.test.ts` then failed by assertion (the web's commands no longer equal the role's
  three) and was rewritten to say whose each action is.
- New cases: a reset's row carries IDs only (no address, no subject), `attempts` 0; a reset whose transaction fails
  twice, a reset made as the database goes away, a refused code and an unknown outcome with no account queue
  nothing; one retried try queues exactly one row; End membership through both routes writes one row tied to its
  audit event (`source_event_id`, `request_id`) and no line of the web's; a refused End membership queues nothing;
  **an End membership whose COMMIT the server refuses leaves no row, no audit event, the membership standing and
  the session active** (both routes).

### What is green (on 5b7729a4, PostgreSQL 18, Node 24)
The tip is **7f986ed0** (three commits on 03f0af53: 5b7729a4 the change; 34e84b87 and 7f986ed0 one generated file
each, `fixtures/synthetic/SGN-19/expected.json` by `pnpm synth --all` and `tools/screening-capacity/watched-paths
.txt` by its `--write`, which had not followed W45's `registration-code.ts`). Said exactly: typecheck, lint,
lint:logs, the web's unit tests, infra's tests and `pnpm test:db` ran on 5b7729a4, nothing edited while they ran;
the two later commits change one JSON line and one text line, and the whole unit suite ran on 34e84b87.
- `pnpm typecheck`: passed (exit 0). `pnpm lint`: 1,959 files, 0 errors, 0 warnings. `pnpm lint:logs`: 1,209 files,
  every call allowlisted. `pnpm verify-content`: every content set passes.
- The web's unit tests (`vitest run --project unit apps/web`): **126 files, 1,691 passed, 0 failed** (1,700 before:
  the deleted helper's and the provider method's tests out, the scan's two in).
- Infra's tests (`vitest run --project unit infra/`): **29 files, 825 passed, 0 failed.**
- `pnpm test:db` whole, 32 minutes, alone on the machine: **175 files passed; 10,551 tests passed, 1 skipped, 0
  failed.** `reconcile.large.db.test.ts` passed inside it; no re-run was needed.
- The worker's tests: none touched. `cognito-sign-out.test.ts` and `packages/synth` run again: passed.
- **The whole unit suite (`vitest run --project unit`, 510 files): 14,366 passed, 4 skipped, 4 failed on 34e84b87;
  2 of the 4 were the watched list, mended in 7f986ed0 (its file re-run: passed). The other 2 are NOT W47's and are
  red on 03f0af53 too (checked out and run there: the same 2 failed, 31 passed):** `packages/db/src/migrate.test.ts`,
  "the deploy runbook quotes 20261115090000_key_registry.sql's (and 20261115091000_key_registry_validate.sql's)
  lock-loop failure as the deploy log shows it". `docs/runbooks/deploy-and-rollback.md` does not yet hold those two
  quoted lines: **the runbook step's, and it must land before the PR's unit job can be green.** No earlier block
  names this (W46 ran only the web's unit tests).
- **Not run:** `pnpm test:e2e`, `pnpm test:golden`.

### Safe with the previous image running (both do it for one act)
The migration is already applied when either image runs, so the trigger queues the row whichever image ends the
membership or records the reset.
- **Previous web, new worker (a rolling deploy):** the previous web calls the provider after its commit *and* the
  row is queued; the job calls the provider again within about a minute. The provider's global sign-out is
  idempotent (design section 7: a second one ends tokens already ended; the app's own sessions are not the
  provider's and ended at the commit), so the person is signed out once in effect and loses nothing more. The job
  marks the row done on its own answer. If the previous web's call fails it writes its old line, **which no alarm
  counts any more once the new infra is deployed**; nothing is lost, because the row is there and the job delivers
  it or pages `ProviderSignOutNotDelivered`.
- **New web, previous worker (the worker not yet replaced, or rolled back):** nothing asks the provider until a
  worker with the job runs. The app's sessions and the account's mark moved at the commit, so what stays open is
  only what the provider's own tokens can do, and a code step or key registration in flight is refused by the mark.
  Rows wait, undone and untried (a row never tried is never given up: 16.6), and are claimed when the job exists.
  **Nothing pages for a job that is not there**: see the point on the missed-run alarm below. Deploy the worker
  with or before the web; the deploy runbook should say so.
- **A full rollback to the previous image and the previous infra:** the previous web asks the provider itself
  again and its two alarms return; the rows queue and wait as above.

### NOT seen in a browser (nothing of item 37's screens has been; said first to whoever reviews)
- **The code screen** (`app/sign-in/register-key/page.tsx`, W45): the code field after the password and the
  authenticator code, its refusals, the step forward when the account is not closed.
- **The four console screens** on `/console/organizations/[organizationId]`, the Members card (W46): request key
  removal; the requested state as the requester and as another administrator (confirm, cancel); keys removed with
  Open registration; the code panel shown once and what a reload shows.
- Each at **390 px and 1,280 px**, by **keyboard**, with **focus** watched (the code panel takes focus; the table
  scrolls sideways at 390 px inside `ScrollTable`; what a refusal and a refresh keep).
- W47 changed no screen and no word a person sees: End membership's and the reset's pages answer as before, without
  the wait on the provider. The alarm descriptions (operator-facing) are new words: see the wording point below.
- `pnpm test:e2e` has not been run on this WIP by any session, and the e2e journey (request, confirm, open, the code
  typed, the new key registered) is not written.

### Every named point for the two reviews, in one list (W33, W43, W44, W45, W46 carried over; W47's added)
Moved, whole and with its numbers kept, into W50's block at the top, which adds points 40 to 47 and says what changed in 2, 23, 26, 32 and 39.

### What is left of item 37 (no code of the build; in this order)
1. **See it in a browser** (the list above) and write the e2e journey; `pnpm test:e2e`.
2. **W43's item 6:** the relying-party tie (the web refusing to start when the pool's and the app's differ) and the
   infra test tying `KEY_USER_VERIFICATION_REQUIRED` to the pool's setting. (Small code; not started.)
3. **The two build reviews** (auth and security, with the database and wording points), on the list above.
4. **ADR 0095** (with the dated section amending ADR 0093 D4, ADR 0094's open case closed and its subject note
   moot, the decisions W33 lists under "Decisions the migration takes beyond the note").
5. **The runbooks** (first the two lock-loop lines `migrate.test.ts` wants in `deploy-and-rollback.md`, red today): `incident-response.md` (lines about 13, 30, 216 to 234, 282 to 297, 537 to 539 still describe
   the two old alarms; the hardware key section, `ProviderSignOutNotDelivered` LATE and GAVE_UP, a removed key
   used, `KEY_NOTICE_UNDELIVERED`), `support-mail.md` (65, 88), `deploy-and-rollback.md` (415 to 443; the worker
   with or before the web).
6. **The test-matrix rows:** `packages/synth/src/cases/matrix.ts` 931 and 949 still describe the web asking the
   provider and the two old alarms (SGN-16's row and SGN-19's); SGN-21 to SGN-27 and JOB-07, JOB-08 as W33 lists.
7. **The domain model's regeneration** and **the PR**, opened with `pnpm -s db:domain-model --summary-since
   origin/claude/build-platform --function-diffs list`, the approval line posted as a suggestion, never written.

### Machine notes
PostgreSQL 18 was stopped when this container woke: `cd / && runuser -u postgres -- /opt/pg18/bin/pg_ctl -D
/root/pgdata18 -l /root/pgdata18/server.log -w start -o "-p 5433 -k /tmp"`. Node 24 first on PATH
(`/opt/node24/bin`); `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres`. The checkout is detached at
the WIP commit; push with `git push origin HEAD:refs/heads/co-001/wip-key-registry`. To write this block W47 read,
beyond what it was told to read, the named-points sections of W45's, W44's, W43's and W33's blocks and W43's "Left
open" (about 75 lines), since the list above had to carry them. W47 holds nothing else: no PR, no subagent, no
scheduled task; its one background run (the database suite) has ended.

## The earlier block (2026-11-12, W46, session_019i9ifBCSRKBX2qnkTHphgZ): cut B's CONSOLE is built (four routes, their screens); the provider sign-out removal and the alarm swap are NOT started

**WIP `co-001/wip-key-registry` 03f0af53** (one commit on c2450a78). No PR is open. No migration was touched; every
route was built on the functions and grants as they are. W46 stopped at its token limit (about 185k) at a clean
boundary instead of leaving the sign-out removal half done. The successor needs this block, W45's below (the code
screen), W44's (the flow) and W43's item 5.

### What W46 built (W43's item 4; `apps/web` only)
- `lib/routes/console-keys.ts` (new): `console.request_key_removal`, `console.confirm_key_removal`,
  `console.cancel_key_removal`, `console.open_key_registration`. Each a `platformRoute`, action, path
  `/console/organizations/[organizationId]`, `phi: false`, permission `organization.manage`, Zod input of opaque IDs
  only (`organizationId` for the redirect, `userId` or `removalId`). Each passes `actor.sessionId` (this request's
  resolved session) as `acting_session` and the request's ID. In `CONSOLE_ROUTES` through `CONSOLE_KEY_ROUTES`.
- **Who may act, as built.** Handler: `organization.manage` against the actor's internal roles (a practice
  administrator: `forbidden`; an internal role on a code session: `hardware_key_required`, the wrapper's). Postgres,
  again: the four functions (`account_removes_keys`, `actor_key_session(acting_session)`, the constraints). The
  routes add no rule of their own. Scoped transaction: the wrapper's `withActor` (no practice in scope).
- **Audit.** The functions write the reserved actions themselves, so the wrapper must not write a second.
  `route.ts` had no such mode; W46 added `AuditSpec.writtenBy?: 'database'` and one condition in `invoke.ts` `run`
  (design section 6 asked for exactly this). The route still names its action, so the registry's "a mutation names an
  audit event" holds. Tests hold exactly one event for each act and none for a refusal (a refused act rolls back:
  **a refusal writes no audit event; the acceptance line "each with its audit event" is met as "each act has its one
  event, each refusal has none", said plainly**).
- **The code.** `openKeyRegistration` makes it (`newRegistrationCode`), passes `registrationCodeDigest` only, and
  returns `{ objectId, registrationCode, openUntil }` with **no redirect**. `lib/http/next.ts` `runAction` gained
  `options.answer` (success returns a state to the form that asked, nothing redirects), used by
  `openKeyRegistrationAction` alone. The client component `components/console/open-registration.tsx` holds the code
  in React state only: no URL, cookie, storage, log, job payload or error. Tested: not in the audit row, the log
  lines or the page's data; the stored digest equals the code's.
- **Refusals' words:** `KEY_REFUSALS` in `console-keys.ts`, by constraint name; 42501 is `not_permitted`; P0002 is
  not found; `hardware_key_removal_open_once` (23505) mapped. `cancel` returning false is answered as decided.
- **The list.** `organizationPage` (`console.ts`) calls `keyRemovalsByAccount` (`hardware_key_removals()` joined to
  the requester's email) and each `MemberSummary` gains `self` and `keyRemoval` (the account's latest removal).
- **Tests first.** `console-routes.db.test.ts`, describe "hardware key removals from the console (SGN-23, SGN-24,
  SGN-25, SGN-27)", 5 cases, written before the routes. **Seen failing only as a file that could not load** (the
  module did not exist: "no tests"), then 3 failed on wrong expectations of W46's own (a code session is
  `hardware_key_required` at the wrapper, not a database refusal; two seed mistakes), then green. Covered: the same
  person twice, the account itself (request, confirm, cancel), under seven days (3 and 6 days), a key session 16
  minutes old while a fresh one exists elsewhere, a code session, the console's administrator with no registered
  key, a practice administrator, no such account or removal, a second open request, an already decided removal, the
  ended session of the closed account (turned away, nothing written; Postgres opens it no new session by key or
  code), open before confirmation, open twice. No new SGN number was taken.
- **Test support, said plainly:** `lib/routes/test-support/key-holders.ts` (new: `recordKey`, `keySession`,
  `seedPlatformAdmin`, which inserts the membership with triggers off to give it an age, as W33's tests do). The
  generated route tests' world (`route-tests/world.ts`) changed: its platform administrator is seeded eight days in
  the role with a registered key and signs in with it, and each world gains a key holder, a second and third
  administrator, two requested removals and one confirmed. `SampleRefs` gained four refs. `registry.test.ts` lists
  the new module.

### What is green (on 03f0af53, PostgreSQL 18, Node 24)
All run on the committed tree 03f0af53, nothing edited while they ran, one after another.
- `pnpm typecheck`: 24 projects passed. `pnpm lint`: 1,960 files, 0 errors, 0 warnings. `pnpm lint:logs`: 1,210
  files, every call allowlisted.
- The web's unit tests (`vitest run --project unit apps/web`): **126 files, 1,700 passed, 0 failed.**
- `pnpm test:db` whole, 25 minutes: **175 files passed; 10,549 tests passed, 1 skipped, 0 failed.** The worker's
  `reconcile.large.db.test.ts` passed this time (nothing ran beside it).
- Within that: `console-routes.db.test.ts` 46 passed; the generated route tests of the four routes passed.
- **Not run:** `pnpm test:e2e`, `pnpm test:golden`, the unit suite outside `apps/web`, the infra tests.

### NOT done by W46
1. **W43's item 5, whole: the web still calls the provider's sign-out.** Not started, on purpose: half of it leaves
   `infra/test/monitoring.test.ts` red. The inventory, read on 03f0af53:
   - calls: `lib/routes/console.ts` 16 (import) and about 799 to 801 (the `sub` read and
     `signOutAtProviderAfterCommit`); `lib/routes/settings.ts` 30 and about 1117; `lib/auth/sign-in.ts` 1172 to 1174
     (`endedByReset`, the call and its error line);
   - then delete `lib/auth/provider-sign-out.ts` and `provider-sign-out.test.ts`, and the latter's line in
     `packages/synth/src/cases/registry.ts` 1175 (matrix rows at `matrix.ts` 931 and 949 describe the old behaviour);
   - tests that spy on `globalSignOut`: `console-routes.db.test.ts` 359 to 428 (the End membership case and the
     SGN-19 block of two routes; W46's confirm case already asserts the web calls nothing and one outbox row exists,
     the shape to reuse) and `sign-in.db.test.ts` 551, 586, 631 to 635, 683, 741, 935 to 940, 1438, 1486, 1512;
   - alarms: `infra/lib/security-events.ts` 65 to 78 and 135 to 136, `infra/lib/constructs/monitoring.ts` 617 to
     618, `infra/test/monitoring.test.ts` 65, 66, 152, 154, 178 to 194, 583 to 599; replaced by
     `ProviderSignOutNotDelivered` on the **platform** log group (`PROVIDER_SIGN_OUT_NOT_DELIVERED`,
     `apps/worker/src/platform/provider-sign-outs.ts` 77) and the `removed hardware key used` alarm;
   - `AuthProvider.globalSignOut` (`provider.ts` 167, `cognito-provider.ts` 683, `dev-provider.ts` 432) would then
     be called by nothing in the web: remove it or say why it stays;
   - the proof asked for: `grep -rn 'globalSignOut\|signOutAtProviderAfterCommit' apps/web/src` showing no call.
   - the runbooks name both old alarms (`incident-response.md` 13, 30, 216 to 234, 282 to 297, 537 to 539;
     `support-mail.md` 65, 88; `deploy-and-rollback.md` 415 to 443): the runbook step's.
2. **Nothing was seen in a browser**: W45's code screen and W46's console, at 390 px and 1,280 px, keyboard and
   focus. The e2e journey W45 describes can now be written the honest way (request, confirm, open, the code typed).
3. W43's item 6 and the rest of item 37: the relying-party and user-verification ties, the e2e spec, the two build
   reviews, ADR 0095, the runbooks, the test-matrix rows, the domain model's regeneration, the PR.

### For the UX and brand review: the console's screens and words (all on `/console/organizations/[organizationId]`, the Members card)
Files: `app/console/organizations/[organizationId]/page.tsx`, `components/console/key-removal.tsx`,
`components/console/open-registration.tsx`. No new page, no navigation change.
- Members card description, a sentence added: "Removing an account’s hardware keys takes two platform
  administrators, neither of them the account: one requests, another confirms within 24 hours."
- Account column, badges added: "key removal requested" (destructive), "keys removed" (destructive),
  "registration open" (outline).
- Actions column, per member, one of:
  - no removal standing: button "Request key removal" (outline). It asks for no confirmation: a request changes
    nothing by itself.
  - requested: "{You | requester's email} asked to remove this account’s hardware keys at {time UTC}. The request
    ends at {time UTC}." Then, to the requester: "Another platform administrator confirms it. You cannot confirm your
    own request." To anyone else: "Confirming removes every hardware key of {email}, ends their sessions at once and
    closes the account to sign-in until an administrator opens registration of a new key. It cannot be undone." and
    the button "Confirm key removal" (destructive). Both see "Cancel request" (outline).
  - confirmed and closed, nothing open: "Keys removed at {time UTC}. Open registration only when you are speaking
    with the person and are sure it is them: it lasts one hour and gives you a code to read to them." Button "Open
    registration" (outline).
  - after pressing it, in place of the form (the panel takes focus; `role="group"`, labelled "Registration code for
    {email}"): "Registration is open for {email} until {time UTC}." / "Code: XXXX XXXX" (mono, grouped in fours) /
    "Read it to the person by phone, on a number you already hold for them. It is shown once: PaidWhole keeps no
    copy, and it goes when you leave or reload this page." / "Never send the code by email or chat. They enter it
    after their password and authenticator code, then register the new key. Five wrong codes close this opening."
  - confirmed and open (after a reload, or to another administrator): "Registration of a new key is open until
    {time UTC}. The code was shown once to the administrator who opened it."
  - on the reader's own row: nothing, or while a request stands: "Another administrator asked to remove your
    hardware keys. Two others decide it."
- Refusals, shown by the form as its error (the nine sentences of `KEY_REFUSALS`), for example: "only a platform
  administrator who has held the role for seven days, signed in with their registered hardware key in the last 15
  minutes, does this; sign out, sign in again with your key, then try again"; "ask another platform administrator to
  confirm this removal; the one who requested it cannot"; "this request has expired; ask again".
- **What a refresh keeps:** every state but the code. The code panel is memory only; a reload shows "open until".
- **Points W46 names for that review:** (1) the Actions cell of a member under removal holds two paragraphs and two
  buttons inside a table cell; at 390 px the table scrolls sideways (`ScrollTable`), not seen. (2) "Confirm key
  removal" is one press with its consequence in the paragraph above, no typed confirmation. (3) The refusals are
  lower-case rule sentences in the form's error, as the unlock's is; the first is long. (4) "by phone, on a number
  you already hold" states the runbook before it exists (W45's point 2, the same). (5) If the code is lost (reload,
  a duplicate post), the opening still stands for its hour and cannot be reopened until it ends; the screen says
  "shown once" and not what to do then. (6) "It cannot be undone" on a destructive button whose effect a new
  registration mends. (7) The requester sees their own request as "You asked".

### Named points for the two reviews (W46 adds; W45's, W44's, W43's and W33's stand)
- **Auth review:** `AuditSpec.writtenBy: 'database'` lets a route name an audit action the wrapper never writes; a
  route that claimed it falsely would change records unaudited. Only the four key routes use it, and each has a test
  of exactly one event; no test yet refuses the flag on any other route.
- **Auth review:** `runAction`'s `answer` returns a server action's success state without a redirect. One caller.
- **Auth review:** 42501 from the functions is answered `invalid` with the rule's words, not `forbidden`: it names
  the three conditions together and so does not say which one failed.
- **Auth review:** the lost-code case above: one administrator can hold an account closed for an hour at a time by
  opening and discarding codes; each is on the audit log and sends the member the opening's notice.
- **Auth review:** the page lists removals only beside an organization's members (current and ended). An account
  with no membership row at all has no row to act on (the design's line on an account with no membership).
- **Auth review:** `organizationId` in the inputs is used for the redirect only and is not checked against the
  account's memberships (as `console.unlock_user` does).
- **Security review:** the code crosses the server-action response to the administrator's browser and lives in
  React state until the page goes; `autocomplete`, storage and the URL never see it.

### Machine notes
As W45's. `pnpm install --frozen-lockfile --offline` was needed again after checking out the WIP ref. W46 holds
nothing else: no PR, no subagent, no scheduled task; its one background run (the suites above) has ended.

## The earlier block (2026-11-12, W45, session_019i9ifCFdvWD98TKN6iy9fs): cut A is whole (the flow verified, the code SCREEN built); next is cut B, none of it started

**WIP `co-001/wip-key-registry` c2450a78** (one commit on dde86284). No PR is open. No migration was touched. The
successor needs this block, W44's below (the flow, its named points) and W43's "exact next step" items 4 to 6.

### What W45 built (W43's item 3; `apps/web` only)
- `lib/routes/sign-in.ts`: the action **`answerRegistrationCode`** (`sign_in.registration_code`, POST of the
  `/sign-in/register-key` form, rate limit `mfa` by the sealed step, in `SIGN_IN_ROUTES`). Zod: `registrationCode`
  (`lib/routes/schemas.ts`: at most 32 characters, spaces and hyphens dropped, upper-cased, then the shape, eight of
  the 32 symbols). It reads the sealed `register_key` step (none: the grant of an unstarted step is given back, then
  the restart), calls the flow's `answerRegistrationCode`, and settles: `open` seals the digest and returns to the
  same page, which now shows the key ceremony; `refused` is `MESSAGES.registration_code`, the step kept.
  `registerKeyPage` returns `codeRequired: true` and `supportEmail` only when the sealed step has `codeRequired` and
  no `code`; it asks the database nothing, so showing the screen counts no try. **The judge is never called without
  a code by anything W45 added.**
- `app/sign-in/actions.ts`: the server action `registrationCodeStep`. `app/sign-in/register-key/page.tsx`: the code
  form in place of the key ceremony when `codeRequired`.
- **Who may act, as built:** this is a sign-in step, so there is no session and no role. The handler requires the
  sealed step (password and authenticator code proven, the step begun after the mark, inside its limit); Postgres
  judges for `app_actor_id()` alone under the account's lock (`hardware_key_registration_judge`), counts a wrong code
  and records `key_registration_refused`; `hardware_key_record` judges again at the registration. The audit events
  are the functions' own. Nothing new is logged; the code is in no cookie, result or log line (tested).
- Tests first, seen failing (three on the missing route, one on the missing `codeRequired`), then green:
  `lib/routes/sign-in-routes.db.test.ts`, describe "SGN-27: the code screen" (4 cases; number SGN-27 reused, none
  new taken). Written after their code, said plainly: `lib/routes/schemas.test.ts` (2 cases) and
  `lib/auth/registration-code.test.ts` (2 cases; W44's helper had no unit test).

### What was red on dde86284, and what W45 did
- **`apps/web/src/lib/server/lock-timeout.test.ts` (unit; the flow's): fixed.** Its inventory of places that reach
  the application pool said 5 for `lib/auth/sign-in.ts`; the flow made it 7 (the judgement, whose counted try must
  commit, and the key's record; both before any session). The count and its comment now say so. Not loosened: the
  list is still exact by file and count.
- **`pnpm typecheck` failed in three projects only because this container had not installed W43's worker dependency**
  (`@aws-sdk/client-cognito-identity-provider`); `pnpm install --frozen-lockfile --offline` once, then green. A
  machine matter, not the code's. **The setup script should run that install after checking out a WIP ref.**
- **`pnpm test:db` whole: one suite's `afterAll` timed out at 30 s** (`apps/worker/src/reconcile/reconcile.large
  .db.test.ts`; its one test passed) while typecheck and lint ran beside it on this machine. Alone it passes. Not the
  web half's and not touched; told to the orchestrator.
- Nothing else was red.

### What is green (on c2450a78, PostgreSQL 18, Node 24)
- `pnpm typecheck`: 24 projects passed. `pnpm lint`: 1,956 files, 0 errors, 0 warnings. `pnpm lint:logs`: 1,206
  files, every call allowlisted.
- The web's unit tests (`vitest run --project unit apps/web`): **126 files, 1,696 passed, 0 failed** (run on the tree
  one type-only edit before the commit; the two unit files W45 added, 6 passed, run again after).
- `pnpm test:db` whole, 32 minutes, started on dde86284 and running while W45 edited (so a mixed tree; said, not
  hidden): **175 files, 174 passed and the one above failed in its hook; 10,416 tests passed, 1 skipped, 0 failed.**
- On the committed tree, alone: `sign-in-routes.db.test.ts` 38, `sign-in.db.test.ts` 72 and
  `reconcile.large.db.test.ts` 1: **3 files, 111 passed.**
- **Not run:** `pnpm test:e2e`, `pnpm test:golden`, the whole unit suite outside `apps/web`, and the whole database
  suite again on c2450a78 exactly.

### NOT done, said first to whoever reviews: the screen has not been seen in a browser
W45 stopped at its token limit before driving the page. Keyboard order, focus after a refusal and after the right
code, and the layout at 390 px and 1280 px are **read from the code and the shared components, not observed**. What
is needed: an e2e journey (best written with cut B's console route, which makes the removal and the code the honest
way; a persona of its own, since a removal would break every other spec's key) and before and after screenshots for
the UX and brand reviewer. Expected from the components, to be confirmed: Tab order is the code field, Continue,
then the timer's Start again, then the support link; the field is a secret one (`autoComplete="one-time-code"`), so
`ActionForm` empties it after a refusal and focuses the error as on the authenticator-code step; the right code
redirects to the same path, a full navigation, so focus starts at the top of the key step.

### For the UX and brand review: the screen and its words (`app/sign-in/register-key/page.tsx`)
- Title and h1, unchanged: "Register a hardware key" (with "Step n of n" when numbered). Card title: the email.
- Card text, new: "The hardware key for this account was removed. To register a new one, first enter the code
  PaidWhole gave you. Your password and authenticator code alone open nothing for this account."
- Field label: "Code from PaidWhole". Hint: "Eight letters and digits. Spaces, hyphens and lower case are fine."
  Button: "Continue".
- Field issues: "fill this in" (empty); "enter the eight letters and digits of the code PaidWhole gave you" (wrong
  shape; never reaches the database).
- Refusal (W44's words, now shown): "That code did not open registration. Check the code PaidWhole gave you and try
  again." One answer for no opening, a wrong code, a spent or dead opening. It names no account and no state.
- Under the card, new: "No code? A PaidWhole administrator gives it to you by phone. Write to {support address} from
  the address you sign in with."
- The timer and its two notes are the key step's, unchanged.
- **What a refresh keeps:** the step (the sealed cookie) and its time left; never the typed code. After the right
  code a refresh shows the key ceremony (the digest is sealed, not the code). Start again ends the step as before.
- **Points W45 names for that review:** (1) the card says the key "was removed" to a person who has proven password
  and authenticator code only; it is true whenever the screen shows, but the reviewer may prefer words that do not
  state it. (2) "by phone" states the runbook's channel before the runbook exists. (3) The code is set in the
  field's ordinary face, not mono; BRAND.md asks mono for codes shown, and this one is typed, as the six-digit field
  is. (4) `autoComplete="one-time-code"` is used for the secret-field behaviour; a phone may offer an SMS code there.

### Named points for the two reviews (W45 adds; W44's, W43's and W33's stand)
- **Auth review, W44's point stands and is not solved here:** `judge` asked with no code counts a try, and the free
  "closed?" helper is granted to no role. W45's screen and action never ask without a code; the one case W44 named
  (a removal confirmed for an account with no key row) still spends a try at the key routes' first judgement.
- **Auth review:** the code action is counted in `mfa` by the sealed step, the same budget as the key routes; a
  person who spends it on codes is refused by the rate limit before the database's five tries are reached or not,
  whichever is first. Whether the code deserves a budget of its own is the review's.
- **Auth review:** a code typed for an account that is not closed is answered as a step forward (`not_closed`), not
  a refusal; it reveals only what the page already showed that person.
- **Auth review:** the shape's refusal differs from the wrong code's (an issue on the field against the one
  refusal). The shape is public and the difference says nothing of an account or an opening; named for completeness.

### The exact next step: cut B (W43's items 4 and 5, none started; another session takes it)
The four console routes (request, confirm, cancel, open; `newRegistrationCode` and `registrationCodeDigest` from
`lib/auth/registration-code.ts`, the code shown once to the opener), the removal of `signOutAtProviderAfterCommit`
and the reset's provider call, the two alarms swapped; then W43's item 6; then the e2e journey and screenshots named
above, the two build reviews, ADR 0095, the test-matrix rows, the runbooks and the PR.

### Machine notes
PostgreSQL 18 was stopped when this container woke (W33's start command, in its block, brought it up). The shell's
default Node is 22: put `/opt/node24/bin` first on PATH. Database tests need `DATABASE_URL=postgres://postgres:test@
localhost:5433/postgres`. The ops worktree was one commit behind origin at the start (W44's block was not in it);
`git pull --rebase` first. W45 holds nothing else: no PR, no subagent, no scheduled task, no background run.

## The earlier block (2026-11-12, W44, session_019i9ifCbvaBHG1q7YBdjKGM): the web half's FLOW (cut A, items 1 and 2); still the reference for the flow and its named points

**WIP `co-001/wip-key-registry` dde86284** (one commit on e85c3b40). No PR is open. No migration was touched. W44
handed over at about 250k tokens, most of it reading. The successor needs this block, W43's below (its "exact next
step" items 3 to 6 are what is left) and W33's (signatures, refusals).

### What W44 built (W43's items 1 and 2)
- `apps/web/src/lib/auth/sign-in.ts`:
  - `authenticated()` reads `sign_in_hardware_keys` (one read, only for a key sign-in or an account that must hold a
    key) in place of `provider.hasHardwareKey`, which is gone from the interface and both providers.
  - A key sign-in, section 5's four steps: `registeredKey()` (well formed; a live row, else `sign_in_key_refused`
    `removed` or `not_registered`, the paging line `security event: removed hardware key used` for a removed one, and
    `cleaned()` with the grant; the app's own `verifyAuthenticationResponse` against the row's public key, counter
    zero, a failure logged as `security event: hardware key assertion refused by the registry` with the error's class
    name only and recorded `assertion`); then `openSession` with the digest. `user_session_hardware_key_live` is
    answered `expired` and recorded `removed`; `user_session_key_registration_closed` is answered
    `hardware_key_required` with the warn line `security event: code session refused while key registration is closed`.
  - The plumbing: `beginKey` seals `assertion` (the options' challenge) in the pending key step; `completeKey` passes
    the response and it down; a key step with no `assertion` (the previous image's) starts again (`expired`).
  - Registration: `judgeRegistration()` (`hardware_key_registration_judge` as the account) before
    `beginKeyRegistration` and before `completeKeyRegistration` ask the provider; `recorded()` verifies the
    registration response itself (the challenge sealed as `creation`) and calls `hardware_key_record` with the code's
    digest; a failure of either removes the key at the provider with the grant, logs `hardware key registered at the
    provider but not recorded` (`user_id`, `request_id`, `error_code` the constraint or a class name, `outcome_code`
    removed or not_removed) and answers `key_not_registered`. The flow no longer writes `hardware_key_registered`
    itself (the function does; the event's purpose is now empty, not `webauthn`). ADR 0093 D6's path is unchanged.
  - The code: `answerRegistrationCode(pending, typed, context)`; the pending `register_key` step gains `creation`,
    `codeRequired` and `code` (the digest in hex, only after `open`); a new refusal reason `registration_code`.
- `apps/web/src/lib/auth/registration-code.ts` (new): the alphabet (32 symbols, no 0 1 I O), `newRegistrationCode()`
  (8 symbols, `crypto.randomInt`), `normalizeRegistrationCode`, `isRegistrationCodeShaped`, `registrationCodeDigest`.
  **Cut B's console route uses `newRegistrationCode` and `registrationCodeDigest` from here.**
- `sessions.ts`: `openSession` carries `keyCredentialSha256` (the INSERT names the column, null for a code session);
  `KEY_NOT_LIVE_CONSTRAINT`, `KEY_REGISTRATION_CLOSED_CONSTRAINT`, `refusedConstraint()`.
- `provider.ts`, `cognito-provider.ts`, `dev-provider.ts`, `dev-store.ts`: `listHardwareKeys(grant)` (credential ID
  and creation time; Cognito's by `ListWebAuthnCredentials`, paged); the twin stores `createdAt`.
- `SignInDependencies.webauthn { rpId, origin }` (required); `services.ts` fills it from the configuration
  (`ServiceParts.rpId`, the origin's host when absent). `KEY_USER_VERIFICATION_REQUIRED = true` is the one constant.
- `apps/web/src/lib/routes/sign-in.ts`: ONLY the refusal's words, so the switch is whole (see the screen list). **The
  code screen itself is not built: a closed account that reaches `/sign-in/register-key` today is sent back to the
  same page with no options (nothing registers, nothing opens; a dead end until item 3 is built).**

### What is green, and what is not known
- `apps/web/src/lib/auth/sign-in.db.test.ts`: **72 passed** on PostgreSQL 18 (20 of them new or restated). Seen
  failing first: the file did not load without `registration-code.ts`, then 14 failed on missing behaviour, with the
  type errors naming `webauthn`, `answerRegistrationCode`, `codeRequired` and `creation`. `registration-code.ts` (a
  pure helper the tests import) was written between those two runs; nothing else preceded its tests.
- **Added after the background run ended, on the tree committed as dde86284:** `pnpm typecheck` passed (24
  projects); `pnpm lint` 1,955 files, 0 errors, 0 warnings; `pnpm lint:logs` 1,206 files, every call allowlisted; the
  web's unit tests under `lib/auth` and `lib/routes/sign-in`: 10 files, 136 passed; **the web's database tests, all
  of `apps/web`: 61 files, 7,656 passed, 0 failed** (the route tests that sign in with a key included).
- **Still not run by W44:** `pnpm test:db` whole (the packages' and the worker's database tests) and the full local
  suite. W43's whole-suite result on e85c3b40 is in W43's block, if it was added.
- Tests restated, none skipped or loosened: the first key test's event is `hardware_key_registered:` (no purpose);
  SGN-17's "audit write fails" case is now "the registry's record fails": removed at the provider, the new line,
  `key_not_registered` (it threw before); SEC-20's hand-made key step carries an `assertion`.
- Numbers used: SGN-20, SGN-21, SGN-26, SGN-27 (the flow's cases). None other taken.

### Session open: the round trips (acceptance)
A password-and-code sign-in of an account that need not hold a key: **none added** (no statement changed but the
INSERT's column list). A key sign-in: **one read added** (`sign_in_hardware_keys`), as section 5 states, and nothing
else on the accepted path (the app's verification is local). A password-and-code sign-in of an account that must
hold a key: the same one read **replaces** the provider's network call. `resolveSession` is untouched.

### The exact next step
1. W43's item 3: the code screen and `routes/sign-in.ts` (the register-key page shows the code form
   when the sealed step has `codeRequired` and no `code`; a server action with a Zod schema calls
   `answerRegistrationCode`; the `registration_code` refusal keeps the step and the typed value is not echoed;
   `isRegistrationCodeShaped` is for the field's own message, before the database is asked).
2. W43's items 4 and 5 (cut B, none started): the four console routes, the removal of `signOutAtProviderAfterCommit`
   and the reset's `globalSignOut`, the two alarms swapped. Then item 6.

### Named points for the two reviews (W44 adds; W43's and W33's stand)
- **Auth review, a property of `hardware_key_registration_judge` the web works around:** called with no code for a
  closed account with a usable opening, it counts a try. `account_key_registration_closed` is granted to no role, so
  the web cannot ask "closed?" for free. The flow therefore reads closed from the registry's rows (any row and none
  live means every key was removed) and seals `codeRequired`, and answers the code screen without asking the
  database; reaching the screen counts no try (tested). **The one case it cannot see: a removal confirmed for an
  account that never had a key row** (closed, no rows). Its first visit to the register-key step asks `judge` with no
  code and, if an opening stands, spends one of the five tries. Small; a free "closed?" answer would need a grant,
  so it is recorded for the contract migration, not built.
- **Auth review:** `codeRequired` and `code` live in the sealed step, but nothing trusts them: `judge` runs before
  each provider call and `hardware_key_record` judges again under the lock (the forged-step test).
- **Auth review:** the cleaning skips a provider credential whose ID is not canonical base64url of 16 to 1,023 bytes
  (never deleted). Whether Cognito's `CredentialId` in `ListWebAuthnCredentials` is exactly the browser's `id` is
  unverified from here; if it is not, the cleaning deletes nothing (the safe side) and removed keys stay at the
  provider, where they still open nothing.
- **Auth review:** the cleaning measures "older than 15 minutes" from the attempt's start (the database's clock)
  against the provider's creation time: two clocks.
- **Auth review:** a registration that fails for a reason that is not a refusal (the database unreachable) now
  answers `key_not_registered` after removing the key, where the base threw; the error's class name is logged.
- **Not done, W43's item 6:** the relying-party tie (the web refusing to start when the pool's and the app's
  differ) and the infra test tying `KEY_USER_VERIFICATION_REQUIRED` to the pool's setting.

### For the UX and brand review: what a person sees that W44 changed
- **Sign-in, the register-key step, one new error text** (`MESSAGES.registration_code`, `routes/sign-in.ts`): "That
  code did not open registration. Check the code PaidWhole gave you and try again." The same words for no opening
  and a wrong code. A refusal keeps the step (the person may type again); a refresh keeps it too (the sealed cookie).
  **No screen shows it yet: the code form is not built.**
- A key sign-in with an unknown or removed key, or one the registry's check refuses: the existing wrong-credential
  words ("That did not match."), no new text. A key step sealed by the previous image: the existing restart.
- A code sign-in of an account whose registration is closed and that need not hold a key: the existing
  hardware-key-required page.
- No other screen, email or PDF changed.

### Machine notes
As W33's, below; `pnpm install --offline --frozen-lockfile` was needed once here for W43's new worker dependency.
W44 holds nothing else: no PR, no subagent, no scheduled task; one background check run that ends on its own.

## RESUME-BLOCK (2026-11-12, W43, session_019i9ifCCuiEbFzA2DZGJFA1): step 3 is cut in two; the JOB half is built; next is the WEB half

**WIP `co-001/wip-key-registry` e85c3b40** (one commit on 969ac389). No PR is open. No migration was touched. The
successor needs this block, W33's block below (the functions' signatures, the refusals' names, the lock order), the
note's sections 16, 2, 5 and 8, and the files named here. Step 3 was plainly more than one session; it was cut at the
handlers/job line (told to the orchestrator at the start).

### What W43 built (the job half)
- `apps/worker/src/platform/provider-sign-outs.ts`: `runProviderSignOuts`. One run: (1) claim one row, call the
  provider with no transaction open, record `done` or `failed` for the try it names, for 8 seconds; (2) the overdue
  sweep, the paging line `security event: provider sign-out not delivered` (`sign_out_id`, `user_id`, the cause's
  `request_id`, `error_code` LATE or GAVE_UP) written **before** `operator_provider_sign_out_reported`; (3)
  `operator_key_removals_expire`; (4) `operator_provider_sign_outs_expire`. Each step in its own try; the run throws
  `ProviderSignOutRunFailed` naming the failed steps after the others ran.
- `apps/worker/src/platform/cognito-sign-out.ts`: the adapter (`AdminUserGlobalSignOut`, 10 second abort,
  `UserNotFoundException` read as `no_such_user`) and development's twin (asks no one).
- `apps/worker/src/platform/hardware-key-notices.ts`: `sendHardwareKeyNotices`, the password notice's job re-pointed,
  plus one branch: a claim that answers `undelivered` (AddressChanged) sends nothing, logs it and commits.
- `packages/auth-mail/src/words.ts`: `HARDWARE_KEY_NOTICE_SUBJECTS`, `hardwareKeyNoticeLines` (three kinds).
- `apps/worker/src/jobs/platform.ts`: the two jobs `provider_sign_outs` and `hardware_key_notices`, each `* * * * *`,
  payload `z.strictObject({})`. `PlatformDependencies.providerSignOut` (absent: the job throws
  `NoProviderSignOutError`); `wiring.ts` always gives it.
- `apps/worker/src/config.ts`: `providerSignOut` from `COGNITO_USER_POOL_ID`, **required in production**;
  `infra/lib/constructs/compute.ts` sets it on the platform task. `apps/worker/package.json` gains
  `@aws-sdk/client-cognito-identity-provider` (the web's version; the lockfile gained three lines;
  `pnpm toolchain:check` and `pnpm actions:check` passed).
- Log fields added (`packages/observability/src/fields.ts`): `sign_out_id`, `outcome_code`, `hardware_key_notice_id`.
  `MAIL_LOG_CODES.keyNoticeUndelivered = 'KEY_NOTICE_UNDELIVERED'`, a seventh platform mail code with its metric filter
  and alarm (`infra/lib/mail.ts`, `monitoring.ts`). `infra/test/application-role.test.ts` scans the worker's adapter.
  `tools/screening-capacity/watched-paths.txt` regenerated by its own generator (three files more).

### What is green (on e85c3b40)
- `apps/worker/src/platform/provider-sign-outs.db.test.ts` (15) and `hardware-key-notices.db.test.ts` (10), with the
  platform's other database tests: 8 files, 76 passed, 1 skipped. Infra: 29 files, 816 passed. The worker's, the mail
  words', the log fields' and the tools' unit tests: 1,132 passed in the last run of the worker and the two tools.
  `pnpm typecheck`, `pnpm lint`, `pnpm lint:logs`: 0 errors.
- **`pnpm test:db`, whole, on e85c3b40 (PostgreSQL 18): 175 files, 10,397 passed, 1 skipped, 0 failed** (28 minutes). That is W33's 173 files and 10,372 tests plus the two new files' 25; W32's 26, the catalog test and the cross-tenant test are in it.
- Numbers used: **JOB-08** only (the worker's rows). JOB-06 and JOB-07 are the database's (W32's). None other taken.
- **Said plainly:** `provider-sign-outs.ts` was written before its tests (a slip against "tests first"). Its tests
  were then seen failing only where the job was not yet registered (`handlers.provider_sign_outs is not a function`)
  and on one wrong expectation of the test's own. The key-notice tests failed first on their own seeding and on one
  wrong assumption (a successful send counts no try), not for missing behaviour. The two reviews should weigh the
  tests on what they assert, not on having been red.

### Acceptance, as far as the job half goes
- **Idempotent and safe to retry (16.6):** proved by the tests: a crash after the claim, after the provider's answer,
  while `failed` is recorded, between the sweep's mark and its line, and between the line and its acknowledgement; a
  stale worker's `done` and `failed`; two overlapping runs; a failing expiry step. The call is at-least-once by design.
- **Session open: no round trip added.** W43 changed no file under `apps/web`; W33's count stands (none added).
- **Safe with the previous image running:** the job half adds two job types and reads nothing the previous image
  writes differently. Not verified by W43: what the previous worker image does with the two new schedules during a
  rollback (the rows wait in the outbox meanwhile, and the previous web image still calls the provider itself).
- Synthetic data only: every address is `@synthetic.test`, every subject and ID a random UUID.

### The exact next step: the web half (none of it started)
1. `apps/web/src/lib/auth/sign-in.ts`, tests first in `sign-in.db.test.ts` (SGN-21, SGN-26's flow cases, SGN-27, the
   flow's SGN-19): `authenticated()` reads `sign_in_hardware_keys` in place of `provider.hasHardwareKey`; the key
   sign-in's four steps of section 5 (well-formed response; live row or `sign_in_key_refused` plus the cleaning with
   the grant; the app's own assertion check with `@simplewebauthn/server`, which needs the challenge sealed at
   `beginKey` and the response passed down from `completeKey`; `openSession` with the digest and the
   `user_session_hardware_key_live` refusal answered as a stale session). Registration: `hardware_key_registration_judge`
   before `beginKeyRegistration` and before `completeKeyRegistration` asks the provider (decision 7 below W33's
   block), the app's own verification of the registration response for the public key, then `hardware_key_record`
   with the code's digest; a failure removes the key at the provider with the grant. The provider interface needs a
   way to list credentials with their creation time (the cleaning) in both `cognito-provider.ts` and `dev-provider.ts`.
2. `apps/web/src/lib/auth/sessions.ts`: `openSession` carries `key_credential_sha256`.
3. The code screen ("the code PaidWhole gave you", the same screen with or without an opening) and
   `apps/web/src/lib/routes/sign-in.ts`; the pending step carries the code's digest only after `judge` said `open`.
4. The four console routes (`console.request_key_removal`, `confirm`, `cancel`, `open_key_registration`) with
   `acting_session` from the request's resolved session, the one-time code made by the web (8 of 32 symbols,
   `crypto`), shown once, only its SHA-256 passed; the list from `hardware_key_removals()`; tests in
   `console-routes.db.test.ts`.
5. Remove `signOutAtProviderAfterCommit` (both End membership routes) and the reset's `provider.globalSignOut` call
   in `endedByReset`; their tests and the two web lines go; in `infra/lib/security-events.ts` the alarms
   `MembershipEndProviderSignOutFailed` and `PasswordResetProviderSignOutFailed` are replaced by
   `ProviderSignOutNotDelivered` on the **platform** log group (the words are `PROVIDER_SIGN_OUT_NOT_DELIVERED` in
   `provider-sign-outs.ts`; the existing reset alarms read the web log group, so this one is built like the mail-code
   alarms), plus the `removed hardware key used` alarm.
6. Then the note's later steps: the relying-party and user-verification ties, the e2e spec, ADR 0095, the test-matrix
   rows, the runbooks, the two reviews, the PR.

### Left open in the job half (small, each for the next session or a ruling)
- **The failed-try line has no cause `request_id`** (section 7 names one): `operator_provider_sign_out_claim()` does
  not return it and the migrations are closed. The line carries `sign_out_id` and `user_id`; the LATE and GAVE_UP
  lines carry the cause's request. Enough without a migration change, in W43's reading; the orchestrator may rule.
- Section 7 asks the build to confirm that the platform schedule's missed-run alarm covers `provider_sign_outs`: not
  checked.
- The worker's tests assert `operator_key_removals_expire` is called and that its failure stops nothing; they do not
  expire a real lapsed request (W32's database tests hold the function).
- No runbook text yet for `KEY_NOTICE_UNDELIVERED`; its alarm's words point at the incident runbook's hardware-key
  section, which step 6 writes.

### For the UX and brand review: what a person sees that W43 added (emails only; no screen changed)
Three emails, the `account` variant, no link, Reply-To the support address, the account footer, subject followed by
the product's name: "Your hardware keys were removed", "Registration of a new hardware key is open", "A new hardware
key was registered" (`packages/auth-mail/src/words.ts`, `hardwareKeyNoticeLines`). **The `removed` email departs from
section 7's words on purpose:** v3 (16.2) closed registration after a removal, so "the next sign-in ... then registers
a new key" would be untrue; it says support opens registration and gives a one-time code. One operator alarm text
(`KEY_NOTICE_UNDELIVERED`).

### Named points for the build's two reviews (W33's three stand, below; W43 adds)
- **Auth review:** the job trusts the adapter's reading of `UserNotFoundException` as `no_such_user`, which marks
  the row done with no sign-out; a pool ID that names the wrong pool would turn every row into that answer. The
  worker and the web take the pool from the same stack output; nothing checks it at start.
- **Auth review:** `removed`'s email tells the reader that support gives a one-time code. Whether an email should
  say that a code exists at all (it tells a mailbox thief what to ask support for) is a wording decision.
- **Database review:** the run's 8 seconds are counted from the first claim, and each call may take 10 seconds more;
  the operator pool has two connections and this job holds one for the run, as `password_notices` does.
- **Wording review:** the step-failed line's `error_code` is `<step>:<error name>` (for example `sign_outs:Crash`),
  a compound code where every other line carries one name.

### Machine notes
As W33's, below. W43 holds nothing else: no PR, no subagent, no scheduled task.

## The earlier block (2026-11-12, W33, session_019i9ifBTTYtTEJn5cydNmex): the database half; still the reference for the functions, refusals, lock order and measurements

**WIP `co-001/wip-key-registry` 969ac389** (the base 1f652b6f, #156 included, merged in). No PR is open. The successor
needs this block, the note (`designs/lane-a-key-registry.md` v3; section 16 rules) and the files named here.

### What exists
- **Migrations, created by the co-founder's typed `/new-migration key_registry` and `key_registry_validate` in W33's
  session (2026-11-12):** `packages/db/migrations/20261115090000_key_registry.sql` and
  `20261115091000_key_registry_validate.sql`. They sort after #156's `20261114090000`. Applied nowhere but local
  scratch databases. **Any further change to either file needs the co-founder's command again** (the hook's marker).
- **Tables:** `hardware_key`, `hardware_key_removal`, `hardware_key_notice`, `provider_sign_out` (no `practice_id`;
  FORCE ROW LEVEL SECURITY, one policy for `tp_owner`, no privilege for `tp_app` or `tp_operator`);
  `user_session.key_credential_sha256` (insertable by `tp_app`); `mail_send`'s two kind CHECKs admit
  `hardware_keys_removed`.
- **Functions for the web (`tp_app`), signatures exact:** `hardware_key_record(new_credential bytea, new_public_key
  bytea, code_sha256 bytea, began timestamptz, request text) -> (key_id, first_after_removal)`;
  `hardware_key_registration_judge(code_sha256, began, request) -> text` (`not_closed` | `open` | `refused`);
  `sign_in_hardware_keys(target_user) -> (credential_sha256, public_key, removed)`;
  `sign_in_key_refused(target_user, why, request)` (`not_registered` | `removed` | `assertion` | `malformed`);
  `hardware_key_removal_request(target_user, acting_session, request) -> uuid`;
  `hardware_key_removal_confirm(removal, acting_session, request) -> (keys_removed, sessions_ended)`;
  `hardware_key_removal_cancel(removal, acting_session, request) -> boolean`;
  `hardware_key_removals() -> (removal_id, user_id, requested_by, requested_at, expires_at, state, decided_by,
  decided_at, live_keys, registration_open_until, registration_closed)`;
  `hardware_key_registration_open(removal, acting_session, code_sha256, request) -> timestamptz`.
- **For the jobs (`tp_operator`):** `operator_provider_sign_out_claim() -> (sign_out_id, account_id, subject, try)`,
  `_done(sign_out, try, outcome, request) -> boolean` (`signed_out` | `no_such_user`), `_failed(sign_out, try,
  error_name, request)`, `operator_provider_sign_outs_overdue(request) -> (sign_out_id, account_id,
  cause_request_id, code)` (`LATE` | `GAVE_UP`), `operator_provider_sign_out_reported(sign_out, code)`,
  `operator_provider_sign_outs_expire(at_most)`, `operator_key_removals_expire(at_most, request)`;
  `operator_key_notices_stale(at_most, request)`, `operator_key_notices_due(at_most)`,
  `operator_key_notice_claim(notice) -> (user_id, email, kind, event_at, undelivered)`,
  `operator_key_notice_sent(notice, message_id, request)`, `operator_key_notice_failed(notice, error_name, permanent,
  request)`. `operator_record_mail_event` and `operator_mail_expire` replaced in place (signatures unchanged).
- **Refusals the handlers map to words (SQLSTATE 23514 with this constraint name unless said):**
  `hardware_key_sign_in_not_before`, `hardware_key_one_live`, `hardware_key_credential_once` (23505),
  `hardware_key_registration_closed`, `hardware_key_removal_not_own_account`, `hardware_key_removal_open_once`
  (23505), `hardware_key_removal_two_people`, `hardware_key_removal_in_time`, `hardware_key_removal_decided`,
  `hardware_key_removal_requester_left`, `hardware_key_registration_not_closed`,
  `hardware_key_registration_open_once`, `hardware_key_removal_target_acts`, `user_session_hardware_key_live`,
  `user_session_key_registration_closed`, `user_session_key_digest`, `membership_ended_is_recorded_by_the_end`; not
  a platform administrator seven days in the role with a fresh key session: 42501; no such account or removal: P0002.
- **Also changed:** the Drizzle schema (`packages/db/src/schema/identity.ts`, `operations.ts`, `index.ts`: the four
  tables, the column, `MAIL_KINDS`), `packages/db/domain-model/areas.json`, `cross-check.ts` (the bytea custom type),
  and the regenerated `docs/product/domain-model.md` and `packages/db/functions` (35 files written). **The approval
  line is blank.** A later migration edit or schema change means regenerating again.

### What is green
- `pnpm test:db`, whole, on PostgreSQL 18: **173 files, 10,372 passed, 1 skipped, 0 failed** (30 minutes here; give
  it a budget over 25). That includes W32's 26, the catalog test and the cross-tenant test (both read the live
  catalog, so the four tables are covered), `pnpm db:domain-model --check`, `pnpm typecheck` and `pnpm lint`.
- **Tests changed, each to state the new truth, none skipped or loosened:**
  - `packages/db/src/key-registry.db.test.ts`: SGN-23's seeded stale session moves `expires_at` with `started_at`.
  - `packages/db/src/sign-in-not-before.db.test.ts` (ADR 0093 D4, the orchestrator's ruling of 06:55 UTC): "does not
    check a row with no start" stays; "nor locks" became what is locked (FOR NO KEY UPDATE: a second taker is refused,
    a key-share lock passes), until the transaction's end.
  - `packages/db/src/password-notice.db.test.ts`: the mail recorder's live body is 20261111090000's with exactly
    three additions. `hardening.db.test.ts` and `migrate.db.test.ts`: the reserved actions and the table list.
  - `apps/web/src/lib/auth/sign-in.db.test.ts`, SGN-19's two cases ("open until Queues item 37"): the step begun
    before End membership is now refused (`step_before_reset_mfa`, `step_before_reset_register_key`).

### Measured (step C; synthetic rows: 1,000,000 `audit_event`, 1,000,000 `mail_send`, 200,000 `user_session`)
- **File 1, whole, quiet database: 107 and 127 ms** (two runs); its five table locks are held for less than that.
  The note's bound (well under a second) holds. Beside a transaction that had read `user_session` and written
  `audit_event` and stayed open 4 s: applied 4.1 s after it started (it retried each second, NOWAIT), and a read of
  `user_session` plus a write of `audit_event` made meanwhile took 54 ms: nothing queued behind the migration.
- **File 2: 649 ms whole** (72, 424 and 324 ms a validation; SHARE UPDATE EXCLUSIVE); an insert into `mail_send`
  during a validation took 47 ms.
- **The session-open path: no round trip added** (no application statement changed; the check rides the session's
  INSERT in the trigger). One session insert with a start, alone: 1.03 ms before, 1.05 ms after. Eight in parallel
  for ONE account: 5.6 ms before, 6.4 ms after (they already queued on the account's row since ADR 0093). The
  previous image's insert (no start), eight in parallel for one account: 1.9 ms before, 5.8 ms after: it now queues
  on the same row, which is the ruling's point 3. No bound of the note is broken.
- **No deadlock:** 20 s, 12 clients, one target account: session inserts, End membership, a recorded reset, removal
  requests and confirmations mixed: 24,757 transactions, 0 failed, **0 deadlocks**, 1,426 removals confirmed, and no
  open session begun at or before the mark. **The lock order, for the note and ADR 0095:** a membership row (End
  membership only), then the account's `"user"` row (FOR NO KEY UPDATE), then the removal row, then key rows, then
  session rows, then outbox and notice rows. No path takes the account's row and then a membership row; the
  confirmation reads `membership` without a lock and locks only the target's account, never an administrator's.

### Decisions the migration takes beyond the note (each to be said in ADR 0095 and the PR)
1. `hardware_key_removal.address_sha256` (SHA-256 of the removal's ID, a colon, the lower-cased address at the
   request): the note's `"user".updated_at` moves with every sign-in and with the confirmation itself, so it cannot
   say whether the address changed. The notice's claim compares the digest and fails the notice as `AddressChanged`
   (reported; the row returned has no address and `undelivered = true`: the job logs it and commits).
2. `hardware_key_notice.event_at`, not `removed_at` (two of three kinds are not removals).
3. `operator_mail_expire` replaced in place so key notices expire (the note gave the column and no reader).
4. `hardware_key_removals()` asks `organization.manage`, not the seven days: a new administrator sees the list.
5. Two more helpers granted to no role: `hardware_key_opening_usable(uuid, timestamptz)`,
   `hardware_key_notice_report_undelivered(uuid, text)`. Code digests are compared after a second SHA-256 each side.
6. `operator_record_mail_event` keeps its seven columns: an undelivered key notice is on the audit log
   (`hardware_key_notice_undelivered`), not in a result column.
7. `hardware_key_record` raises on a wrong code, so it counts no try; only `judge` counts. **The flow must call
   `hardware_key_registration_judge` first** and pass the digest on only after `open`.
8. `provider_signed_out` does not record which outcome (`signed_out` or `no_such_user`); the job's log line should.

### Named points for the build's two reviews
- **Auth review (the ruling's point 4):** every session insert now takes the account's row, the previous image's
  included, which ADR 0093 D4 had left unlocked on purpose ("it would then always land after the reset, never
  swept"). What D4 protected still holds for the new image (its inserts carry a start and are refused after the
  mark). For the previous image's no-start insert during a deploy or a rollback, the lock makes "lands after the
  reset, unswept" certain where it was a matter of timing; against that, a removal's confirmation now always sees
  or refuses it. ADR 0095 needs the dated section amending D4 that says so, and "What the founder should know"
  a line (ADR 0093 was approved with #142).
- **Auth review:** `hardware_key_record` is an uncounted check of a code digest for whoever holds the application
  role (decision 7); the 40 bits and the hour bound it.
- **Database review:** `membership_removal_target_holds` holds while a request is `requested`, including one past
  its 24 hours that the job has not yet marked expired (at most a minute).

### What is left of item 37 (the note's steps 3 to 7; none started)
The handlers and `sign-in.ts` plumbing; the four console routes; the code screen; the worker's `provider_sign_outs`
and `hardware_key_notices` jobs and the sign-out adapter; removing `signOutAtProviderAfterCommit` and the reset's
call; the rest of the tests (SGN-21, SGN-22, SGN-26, the flow's SGN-19 and SGN-27, the notice's five functions,
JOB-08, the migration's own preflight and lock-loop tests); the two build reviews; ADR 0095; the test-matrix rows;
the runbooks; the PR with `pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs
list` and the approval line posted as a suggestion, never written.

### Machine notes
PostgreSQL 18 stops when the container sleeps: `cd / && runuser -u postgres -- /opt/pg18/bin/pg_ctl -D
/root/pgdata18 -l /root/pgdata18/server.log -w start -o "-p 5433 -k /tmp"`. Database tests:
`DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm -s vitest run --project db <files>`.
One slip, corrected at once and told: W33's first marker trap used a relative path after a `cd`, so the marker
outlived one command; nothing but W33's own rename was written while it stood. Use an absolute path in the trap.
**W33 holds nothing else:** no PR, no subagent, no scheduled task; its scratch databases and files are disposable.

## The earlier block (2026-11-12, W32, session_019i9ifC7PLenwLnTRu7ZVhZ; handed over at about 240k tokens)

- **Brief:** build item 37 from the note; the orchestrator's brief of 2026-11-12 06:20 UTC (steps 1 to 7) stands for
  the successor. Rulings: Q1 yes, Q3 yes; Q2 is the founder's. No PR until the orchestrator says #156 has merged.
- **The note:** `designs/lane-a-key-registry.md` **v3** (build-ops 83be44b6 or later). **Section 16 rules** where it
  differs from sections 2 to 14: one live key an account; registration after a removal closed until opened with a
  one-time code; a code session of a closed account refused in Postgres; the target of an open request changes no
  internal membership; the acting session as an argument (`actor_key_session`); the outbox's late and given-up arms.
- **Step 1, done:** `reviews/lane-a-key-registry-review-delta1.md` (R1 to R11; two blocking, both taken; it ran no
  SQL). Every finding verified and placed in section 16's table. No second round on the note. To the queue from it: a
  backup key from inside a session; an operator retry of a given-up sign-out; a second person for End membership in
  the internal organization; seven days measured on the person's key, not the membership row.
- **Step 2, half done. WIP `co-001/wip-key-registry` c0c43f2d** (base 93e137f9), two files, failing first (26 tests,
  each because the objects do not exist; type-check and lint clean):
  - `packages/db/src/key-registry.db.test.ts`: SEC-25, SEC-26, SEC-27, SGN-20, SGN-23, SGN-24, SGN-25, SGN-27.
  - `packages/db/src/provider-sign-out.db.test.ts`: JOB-06, JOB-07, SGN-19's database rows.
  They fix the names the migration must use: the function signatures (SEC-25's table, including the three helpers
  `account_removes_keys(uuid)`, `actor_key_session(uuid)`, `account_key_registration_closed(uuid)` and the two
  finality functions `hardware_key_is_final()` and `hardware_key_removal_is_final()`), and every constraint name.
  They were never run against a migration: expect to adjust details (for example `wait_minutes` after a claim).
- **BLOCKED: the migration.** `/new-migration` cannot be run by a session (the skill is for a person's typed command
  only; the hook refuses any write under `packages/db/migrations` without its marker). Told to the orchestrator
  2026-11-12. It needs the co-founder to type `/new-migration key_registry` in the building session, or their word
  there. No migration file, marker or draft SQL exists anywhere. Nobody routes around it.
- **Not started:** the rest of step 2's tests (SEC-25's lists in `catalog`, `cross-tenant`, `migrate.db.test.ts` and
  `hardening.db.test.ts`; SGN-21, SGN-22, SGN-26 and the flow's SGN-19 and SGN-27 in `sign-in.db.test.ts`; the
  notice's five functions; JOB-08; the migration tests); steps 3 to 7 entire (handlers, the four console routes, the
  flow's own assertion check and the code screen, the worker's two jobs and adapter, the measurements, the domain
  model, the two build reviews, ADR 0095, the test-matrix rows, the runbooks, the PR description).
- **What does not need the migration, for the successor to start on:** `sign-in.ts` plumbing (the challenge sealed at
  `beginKey`, the response passed to `authenticated()`, the app's own assertion and registration verification, the
  relying-party check), the dev provider twin's listing and deleting of credentials, the worker's sign-out adapter
  and job with fakes, the removal of `signOutAtProviderAfterCommit` and the reset's call.
- **Machine notes:** PostgreSQL 18 answers on `localhost:5433` and the `/tmp` socket, not `/var/run/postgresql`; run
  database tests with `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm -s vitest run --project db
  <file>`. The setup script moves the checkout to `claude/build-platform`: check out the WIP branch after it.
- **Numbers:** ADR 0095; SGN-20 to SGN-27; SEC-25 to SEC-27; JOB-06 to JOB-08. None released, none added.
- **For "What the founder should know" (to carry into the PR text):** a rollback leaves staff unable to sign in until
  roll-forward; staff re-register keys once at deploy, and no removal is possible until two administrators have;
  Q2 (at least three platform administrators, each seven days in the role); after a removal the member needs a
  one-time code from an administrator, by voice, to register the next key; one key an account for now.
- **W32 holds nothing else:** no PR, no open subagent, no scheduled task.
