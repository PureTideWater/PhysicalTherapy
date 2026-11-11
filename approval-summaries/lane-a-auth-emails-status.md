W9 holds part 2 (password-changed-notice, schema PR 1 of the queue; draft PR #140) from 2026-11-11 09:15 UTC; W6 (https://claude.ai/code/session_019i9if9f2m3xyLBavfHUgui) stood down then.

## RESUME-BLOCK: password-changed-notice (schema PR 1), written by W6 as it stood down, 2026-11-11 09:15 UTC
W6 (session_019i9if9f2m3xyLBavfHUgui) holds nothing more. **W9 has PR #140 from here** (it holds the PR's event
subscription). Nothing is unpushed; W6's container and scratchpad can be lost.

- **PR: draft #140**, https://github.com/PureTideWater/PhysicalTherapy/pull/140, branch `co-001/password-changed-notice`,
  head **abdc2192** (= WIP ref `co-001/wip-pwnotice`). The base `claude/build-platform` = 2e26a416 is an ancestor.
- **The schema is final unless a later commit changes the migration:** migration SHA-256 e1288b9c…a0eb; document hash
  **6002e2afb2b830a519e6edc5de428f312ef3ada3591fa10b18f861cf83beea33**; the approval line is the LAST line of
  `docs/product/domain-model.md`, line **7536**. No commit after ffa44ea9 touched the migration, the document or the
  function files (7da699b1 is one test file; abdc2192 is records, infra and `.gitattributes`).
- **Done:** the three reviews (33 findings: 28 fixed, 5 deferred), the fix round (e4a6e8c1 to ffa44ea9), the full local
  suite once (all green; the reset journey's trigger-disabled red run failed as it must), CI green on 7da699b1 but for
  `domain model` (the blank approval line) and `all green` with it, and the review of the fix round's delta (two
  reviewers, 14 findings, none blocking: 11 fixed in abdc2192, 3 deferred; rulings in
  `approval-summaries/lane-a-wip/pwnotice/reviews/RULINGS-DELTA.md`, findings beside it as `delta-sec-findings.md` and
  `delta-db-findings.md`). One PR comment explains the red `domain model` check (issuecomment-6789448720).

### Open, in this order (W9)
1. **CI on abdc2192.** Expect every check green but `domain model` (blank approval line) and `all green`. abdc2192 adds
   one alarm in infra (`PasswordNoticeRecordFailed`, filter `{ $.error_code = "RecordFailed" }` on the platform group)
   and changes two alarm descriptions; locally typecheck, lint, lint:copy, lint:logs, check:fixtures and 1,099 infra,
   observability and synth unit tests pass. A red check other than those two is real work.
2. **The description is stale: replace it whole** with `approval-summaries/lane-a-wip/pwnotice/pr/body-final.md`
   (36,684 characters; its first 133 lines are the generator's summary, identical to what is posted now). It adds
   case (d) to the trade-off, narrows case (b), gives the final Checks rows and the delta review's 14 rows. Correct
   only the row "On abdc2192" if CI there says otherwise. Check afterwards that lines 1 to 133 still equal
   `pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs list` on the head.
3. **Only then post the approval line** as a suggested change, one review comment on line 7536 (CLAUDE.md, the
   new-migration skill; never a review, never the line itself):
   `gh api repos/PureTideWater/PhysicalTherapy/pulls/140/comments -f commit_id=<head sha> -f path=docs/product/domain-model.md -f side=RIGHT -F line=7536 -f body=<body>`
   with the body: a suggestion block holding exactly
   ``Approved by: Tyler Williams  Date: <the day it is posted, YYYY-MM-DD>  Document SHA-256: `6002e2afb2b830a519e6edc5de428f312ef3ada3591fa10b18f861cf83beea33` ``
   (two spaces between the fields, as #126's line has them; the name is `approvers.json`'s), then one sentence that
   committing it accepts the description's trade-off (ADR 0091 D10) and that the alternative is to hold the pull
   request, then the Claude Code footer. Before posting, run `--check --strict --require-approval` on a fresh database
   at the head and confirm the hash it names is the one above (this container's PostgreSQL was down after the
   allowance stop: `tools/setup-container.sh` restarts it).
4. **One line to the orchestrator** with the comment's exact link and the founder's decision in the description's
   words: "Committing the approval line accepts shipping the email with (a) to (d) open until the next schema pull
   request. To take the alternative, say so instead of committing." (the alternative: hold this pull request until the
   close is built into it; no password-changed email ships until then). Also for the orchestrator to queue: ruling D1
   of RULINGS-DELTA.md, the second-factor fact kept as it was at the reset, asked to ride with Queues item 28 (W8).
5. **After the founder's commit of the line:** it must be the only change (the last line of the document); CI's
   `domain model` then passes; the required checks are `all green`, `mutation`, `screening-capacity gate` and
   `approval-of-record`; `origin/claude/build-platform` must be an ancestor of the head (if the base moved, merge it
   with a merge commit, never a rebase; regenerate the document only if a migration came with it, which changes the
   hash and needs a new line; push; wait for CI). Then mark the PR ready and merge it with a merge commit, as #126 and
   #137 were ("Merge pull request #140: …"). Never merge before the founder's committed line; never write it.
6. **Record after the merge:** one line to the orchestrator with the merge commit (W8's `co-001/step-before-reset` is
   stacked on this branch and merges the base then); this file; ADR 0091's Status line still reads "proposed" (follow
   what #126 did for ADR 0084).

### Decisions W6 took that the founder sees in the description (each reversible)
The D10 trade-off (cases (a) to (d), the close as Queues item 28, required before launch); the email's lines 3 and 4
reworded and line 2's second sentence only for an enrolled account; Reply-To the support address on this one kind; the
runbooks name End membership and the founder's break-glass, since no control disables a user.

### Not done by W6, and why
- The migration's preflight comment was not made more precise (DD-03): the session's built-in safety check refused the
  marker route's one-command edit, W6 did not work around it, and ADR 0091 D11 says what is compared and what is not.
- W6 did not unsubscribe from #140 (W9 holds the subscription; a call from W6 could only disturb it). W6's one
  safety-net check-in fired at 07:54 UTC and was not re-armed.
- The 18 Stryker shards were not run locally; CI's `mutation` passed on 7da699b1.
- **Trailer:** `Co-Authored-By: Claude <noreply@anthropic.com>` and the session's own line (STATE.md's ruling).
- **Does not ride:** SS-01 D11 and ADR 0081 A6.

### Follow-ups (deferred by the rulings; only the first is in a queue: LANES.md Queues item 28)
- The close of SEC-01: refuse to open a session or register a key from a step begun before the account's latest completed
  reset. **Required before launch.** Design note: the step's sealed `startedAt` or a reset counter on `"user"` stamped by the
  reset's trigger; no fact about Cognito's `auth_time` is needed, so SEC-N5's staging precondition falls away. Its scope
  also takes the reset whose answer from Cognito is lost (ADR 0091 D15) and a hardware key registered in D10's case (b),
  which nothing an operator holds removes.
- Base behaviour the round found and did not change: the support and dunning outboxes rethrow an error after an accepted
  send uncounted and bound no run by time (as this job did before R7 and R10); the two earlier lock-loop tests
  (`ledger-interest.db.test.ts`, `line-status.db.test.ts`) never look at what a refused try holds; a failed delete after a
  record that paused the screening stream logs no `MAIL_STREAM_PAUSED` (the next run logs `MAIL_STREAM_DRIFT`).
- UX-01 (2): a withheld support ticket that names the notice it answers (the support inbox's PHI screen, ADR 0055).
- UX-05 (b): the console shows a member's and a ticket requester's user ID. UX-06's alternative: a console control that
  disables a user (today: End membership, or the founder's break-glass).
- UX-07 and UX-11: the shared email template keeps a date whole and wraps a long support address.
- UX-09: the notice's age beside its UTC time (with the baseline's UX-027).
- From the review of the fix round's delta (RULINGS-DELTA.md): **D1**, the second-factor fact kept with the notice as
  it was at the reset (a column written by the reset's trigger, returned by the claim), asked to ride with Queues item
  28; **DD-05**, three assertions on the lock loop (no lock taken before it, no statement between its last LOCK and
  RETURN, 300 tries) for the next migration that copies it; removing a hardware key registered in D10's case (b) is
  Queues item 29, not yet assigned.

## 2026-11-07 02:20 UTC (acting Lane A, S2): part 2 building
- Plan: `approval-summaries/lane-a-schema-queue-plan-2026-11-07.md` section 1 (its decisions refine the design: 24-hour cutoff;
  four-caller undelivered helper; PASSWORD_NOTICE_UNDELIVERED pages; complained leaves the notice; the trigger's guard;
  operator_record_mail_event DROP/CREATE with a seventh column; the operator role's transactional send). D11 and A6 do not
  ride.
- **Running: wf_5cf101cd-7ab** (`workflow-scripts/lane-a-pwnotice-build-wf_5cf101cd-7ab.js`): a design addendum with an
  adversarial reviewer and skeptics; branch `co-001/password-changed-notice` stacked on #126 (d2fdd106) plus the latest base,
  worktree /home/user/pwnotice; builders D (migration 20261111090000_password_changed_notice.sql via the marker route), then
  W (worker, infra) and M (ADR 0091, SGN-16, runbooks); the integrator's full suite; three reviews (security and sign-in;
  database, mail and deploy; UX and brand with renders) with skeptics and a completeness critic; the fix round. No PR until
  #126 merges.

<!-- RESUME-BLOCK (2026-11-05T08:00Z, acting S4 stood down) -->
## RESUME-BLOCK
- **Part 1** is MERGED (#125, 0f4a5ed5). Nothing of this item is unpushed. The worktree /home/user/auth-emails is
  disposable.
- **The follow-on `co-001/password-changed-notice` is NOT STARTED:** no branch, no WIP ref.
  - Assigned by Lane A's orchestrator (06:40Z) as a Lane A item; designed in designs/lane-a-auth-emails.md
    ("JOB DESIGN").
  - Counters reserved: ADR 0091 and SGN-16. Migration timestamp after 20261110090000 (#126's).
  - Build and verify on its branch through the new-migration skill's marker route. Open no PR until #126 merges;
    the schema chain session session_019i9ifEG147aKfNHEAsoS7h messages the holder.
  - #126 touches no mail_send CHECK, audit_event trigger or tp_operator grant; regenerate domain-model.md on top
    after it merges.
  - Never write the approval line or approvers.json.
- **Staging smoke checks owed** (ADR 0081): the empty writeAttributes and NEW_PASSWORD_REQUIRED; {username}; a forced
  fallback; the cold start; whether two reset codes both work; Gmail iOS and Outlook.com dark renders (with #129).
<!-- /RESUME-BLOCK -->

PART 1 DONE: #125 merged as 0f4a5ed5 at 2026-11-05T06:45Z. PART 2's send path is NOT BUILT: it needs a migration (CO-02), see below.

ACTING (Lane A's account, https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu) holds this item from 2026-11-05T04:10Z, assigned by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg), the last item of the queue after brand-settle (#121, merged).

# Item: the branded code email and the "password changed" email (`co-001/auth-emails`), one UX item

The sources: designs/lane-b-ux-sign-in-recovery.md, section 2.5 (the proposed words) and the handoffs "Lane A or the
founder" (a worker job carrying `user_id` only); approval-summaries/lane-b-ux-sign-in-recovery-status.md; lanes/lane-b.md:1455.
- Cognito's code email is unbranded today (infra/lib/constructs/identity.ts). Unless a CustomMessage trigger is set, the
  forgot-password email shares the pool's verification template.
- There is no "your password was changed" email.
#42 (mail streams) merged 2026-11-02, so its files are on the base; there is no overlap to wait on.
Reviews: auth and email, so two reviews with skeptics, security and UX/brand, then CI and the merge.
GITLEAKS RULE: an agent that meets a gitleaks refusal rewrites the flagged text and never touches .gitleaksignore.

## Log (UTC)
- 2026-11-05T04:10Z: started. Worktree /home/user/auth-emails from f185655c (#121). A workflow runs design, build,
  Workflow wf_a7821f86-a18; script archived as workflow-scripts/lane-a-auth-emails.js.
  two reviews with skeptics, one fix round with the full suite, and verification.

- 2026-11-05T04:12Z: the orchestrator's scope (04:03Z) was put into the script.
  - A CustomMessage trigger for every code email: text-first, no remote assets, no link carrying a code or an
    address.
  - "Password changed" goes through #42's transactional stream and outbox, with a support route and an audit by ID.
  - Read first: ADR 0065, deliverability.md, ADR 0081 and 0088.
  - Counters: ADR 0091 or an amendment; SGN-13 to SGN-16.
  - Reviews: security (takeover, enumeration, phishing look-alikes), then UX and brand with light and dark client shots.
  The first run (wf_a7821f86-a18, before the scope) was stopped before writing anything. It was relaunched as
  wf_a29a90cd-d6b.

- 2026-11-05T06:45Z: #125 MERGED as 0f4a5ed5 (head bcdceae6, base f7d609cc).
  - Workflow wf_a29a90cd-d6b: design, build, security and UX/brand reviews with skeptics (5 S, 9 N; all confirmed).
    The fix round fixed every S; the N items are fixed or recorded. The full suite passed once on bcdceae6, and CI was
    green. Approval-of-record re-ran after ready. VERIFIED.
  - Built: the @tp/auth-mail package (words, a text-first frame, the inline CommonJS handler) and the CognitoMessages
    CustomMessage trigger.
    - The trigger: Node 22, arm64, 128 MB, 3 s; a role limited to its own log group; invoke scoped to the pool.
    - Alarms: errors and fallback, and a new PasswordResetRequestOverFloor alarm.
    - The pool's own templates are a branded fallback, and mail is sent From "PaidWhole".
  - Also in #125:
    - keepOriginal email, and an empty web-client writeAttributes (security S-2);
    - the dev-twin outboxes in the same words;
    - the worker's 'account' footer variant;
    - brand-copy reads the new package;
    - BRAND.md section 7's second email exception;
    - an ADR 0081 amendment;
    - SGN-13 to SGN-15;
    - deliverability.md section 3.9.
  - I checked O-9 myself: CloudFormation's inline ZipFile limit is a 4 MB zip and the source is about 14 KB, as
    CommonJS (exports.handler).
  - NOT BUILT, the "password changed" email's send path. mail_send's CHECK constraints refuse a new kind, and
    tp_operator cannot read "user", so it needs a migration and the founder's domain-model approval (CO-02).
    - Designed for the follow-on co-001/password-changed-notice (ADR 0091, SGN-16): a password_notice table filled
      by an AFTER INSERT trigger on audit_event password_reset_completed, tp_operator due/claim/sent/failed functions,
      the kind password_changed on the transactional stream, and a platform job every minute.
    - Its words and the footer are in #125.
  - Staging smoke checks to run, all named in ADR 0081:
    - CloudFormation accepts the empty writeAttributes, and NEW_PASSWORD_REQUIRED still works;
    - what Cognito fills in for {username};
    - a forced fallback;
    - the cold-start latency.
  - Open questions: O-1 (founder: the follow-on's migration); O-2; O-4; O-5 (brand owner: the lockup in inverting dark
    clients); O-6; O-7; O-8 (co-founder: "A new request replaces this code"). See the PR body and
    designs/lane-a-auth-emails.md.

- 2026-11-05T06:40Z: the orchestrator decided:
  - Build the follow-on co-001/password-changed-notice as a Lane A item (the Friday handback does not apply to it).
    Build and verify it on the branch through the new-migration skill's marker route, with a timestamp after
    20261110090000. Open no PR until #126 merges; the schema chain session (session_019i9ifEG147aKfNHEAsoS7h) says
    when. Then: draft PR, security and correctness/mail reviews, the fix round, verification, and the suggested approval
    line for the founder. Never write the approval line or approvers.json.
  - O-5: a White plate. O-8: "If you asked more than once, use the newest code." Both go in co-001/email-lockup-plate
    first.
- 2026-11-05T06:45Z: the schema chain session confirmed:
  - #126's migration 20261110090000_ledger_interest_once.sql touches none of mail_send's CHECK constraints,
    audit_event's triggers and policies, or tp_operator's grants;
  - the follow-on only sorts after it and regenerates domain-model.md on top once #126 merges;
  - it messages me with #126's merge commit.

## Waiting on someone
- The schema chain session: #126's merge, which opens the schema slot for the follow-on. Then the founder: the follow-on's approval (CO-02).

## Next step
The follow-on co-001/password-changed-notice (migration, ADR 0091, SGN-16) once O-1 is answered. The worktree /home/user/auth-emails can be removed.
