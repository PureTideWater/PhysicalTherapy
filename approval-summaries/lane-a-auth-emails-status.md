W6 (Lane A, https://claude.ai/code/session_019i9if9f2m3xyLBavfHUgui) holds part 2 (password-changed-notice, schema PR 1 of the queue) from 2026-11-11 04:26 UTC, assigned by the orchestrator (session_019i9ifDAzQNA3kLHozjBoeS).

## RESUME-BLOCK: password-changed-notice (schema PR 1), W6, 2026-11-11 05:10 UTC
- **Heads:** WIP ref `co-001/wip-pwnotice` = **f8560588**. The branch `co-001/password-changed-notice` is still f110efd9 on
  origin and takes the one fix-round push. No PR (it opens after #126 merges).
  - c0ced87f fast-forwarded; #126's head ec606eff (with the base ca504674) merged as bb8cc2e1: the deploy runbook keeps both
    new sections in migration order, and the domain model is regenerated on a fresh database (49 migrations; the function
    files needed no change).
  - The base 4fe8bcca (#137) merged as f8560588: `reconciliation-routes.db.test.ts` keeps #126's and #137's imports. #126's
    own head has this conflict with the base; the orchestrator was told (05:05 UTC).
- **Built (2026-11-07, unchanged):** migration 20261111090000_password_changed_notice.sql (marker route), schema, 25 db tests
  (T1-T22, T13b), grant pins; the worker's password_notices job (every minute), mail-events' seventh column, the operator
  role's transactional send, the alarm; ADR 0091, SGN-16, the runbooks; the reset's own tests and e2e journey (c0ced87f).
  Design addendum and the builders' notes: `approval-summaries/lane-a-wip/pwnotice/`.
- **Checks on f8560588, all passing:** typecheck, lint, lint:copy, lint:logs, check:fixtures, synth --all (0 written),
  watched.ts --write (unchanged), db:domain-model --check --strict, verify-content. The tests the change touches: db 11 files,
  192 passed and 1 skipped (the restore drill's own skip); unit 146 files, 2,577 passed. The email rendered on #129's plate
  (light, dark-preferred, dark-inverted at 600 and 390 px). Domain model hash at this head: 80d375ba…0cbe, provisional until
  #126's final head and the base are merged.
- **Running:** the three reviews as Agent subagents on f8560588 (security and sign-in; database, mail and deploy; UX and
  brand with the renders). Their findings are copied to `approval-summaries/lane-a-wip/pwnotice/reviews/` when they return;
  if that directory is absent, the reviews did not finish and run again.
- **Left, in order:** verify every finding; the fix round; the full local suite once on the final tree (unit, golden, oracle,
  db shards, build and e2e with the trigger-disabled red run, the affected Stryker shards and the gate, actions and
  toolchain checks); a review of the fix round's delta; push the branch. After #126 merges: merge the base, regenerate the
  domain model, open the draft PR with `pnpm db:domain-model --summary-since`, post the approval line as a suggestion,
  one line to the orchestrator; merge after the founder's committed line and green required checks.
- **Does not ride:** SS-01 D11 and ADR 0081 A6.

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
