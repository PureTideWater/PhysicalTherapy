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

## Waiting on someone
- The founder: O-1, the follow-on's migration (CO-02). The brand owner: O-5. The co-founder: O-8.

## Next step
The follow-on co-001/password-changed-notice (migration, ADR 0091, SGN-16) once O-1 is answered. The worktree /home/user/auth-emails can be removed.
