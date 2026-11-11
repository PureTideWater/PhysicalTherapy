W6 (Lane A, https://claude.ai/code/session_019i9if9f2m3xyLBavfHUgui) holds part 2 (password-changed-notice, schema PR 1 of the queue) from 2026-11-11 04:26 UTC, assigned by the orchestrator (session_019i9ifDAzQNA3kLHozjBoeS).

## RESUME-BLOCK: password-changed-notice (schema PR 1), W6, 2026-11-11 07:30 UTC
- **PR: draft #140** (https://github.com/PureTideWater/PhysicalTherapy/pull/140), opened 07:20 UTC on head **ffa44ea9**
  (= WIP ref `co-001/wip-pwnotice`; base 2e26a416 is an ancestor). This session is subscribed to it. The description is
  the session's scratchpad `pr/body.md`; a check that the posted text equals it runs.
- **The fix round is committed** (six commits, e4a6e8c1 to ffa44ea9, on 68895f0f), built by four Agent subagents from
  `approval-summaries/lane-a-wip/pwnotice/reviews/RULINGS.md`; their reports with red and green proofs:
  `approval-summaries/lane-a-wip/pwnotice/fix/`. 28 of the 33 findings are fixed, 5 deferred (Follow-ups below).
  Migration SHA-256 e1288b9c…a0eb; document hash **6002e2af…ea33** (the approval line's hash, unless a later commit
  changes the schema).
- **Checks on ffa44ea9:** typecheck, lint, lint:copy, lint:logs, check:fixtures, verify-content, synth --all (clean),
  db:domain-model --check --strict: pass. The change's own tests: db 35 files, 1,733 passed and 1 skipped; unit 155 files,
  2,709 passed.
- **Running (07:30 UTC):** the full local suite once on ffa44ea9 (`suite.sh core`: unit, golden, oracle, db in four
  shards, build, the reset journey's trigger-disabled red run, e2e, actions and toolchain checks); two adversarial
  reviewers of the fix round's delta (database, worker and mail; sign-in, words and records); CI on #140. The 18 affected
  Stryker shards are left to CI's `mutation` job.
- **The orchestrator's rulings (05:48 and 06:49 UTC):** R1 stands for this PR; the close is `LANES.md` Queues item 28,
  the next schema PR, built by W8 on `co-001/step-before-reset`, stacked on this branch's final head; D15 claims only the
  resets the app learns of, and the lost-answer reset rides in W8's PR. W8 was told the head and the two tests' titles.
- **Left, in order:** read the suite's result and the delta reviewers' findings; fix what is real (targeted tests, one
  push, the description's Checks and findings rows updated); when CI is green but for the blank approval line, post the
  approval line as a suggestion on the last line of `docs/product/domain-model.md` (`gh api …/pulls/140/comments`, the
  new-migration skill) and send the orchestrator its link with the description's trade-off (ADR 0091 D10); merge after
  the founder's committed line and green required checks; one line to the orchestrator; stand down (this session is past
  about 300k tokens; item 7 is W8's and fresh sessions').
- **Trailer:** `Co-Authored-By: Claude <noreply@anthropic.com>` and this session's line (STATE.md's ruling).
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
