# Delta review (sign-in security, words, records) of 68895f0f..ffa44ea9: 3 should fix, 5 notes, none blocking

Nothing in `/home/user/pwnotice` or `/home/user/ops` was changed. While I worked the worktree's head moved to 7da699b1; it differs from ffa44ea9 in `packages/db/src/password-notice.db.test.ts` alone, so every file of my part is as reviewed. My scratch database `tp_rev_d2_1` (created empty, migrated with this head's 49 migrations) is dropped; no `tp_test_*` database is left. Scripts, outputs and the commands are in `<W6 scratchpad>/reviews/delta-sec/` (start with `<W6 scratchpad>/reviews/delta-sec/COMMANDS.md`). Synthetic accounts only.

The web's change itself (the lookup before the provider's confirm) and its four new tests are sound. The three findings to fix are in what the round wrote for the operator and in what R3's line reads.

## Findings

### DS-01 should fix The page for a failed provider sign-out has the operator take the person's own next sign-in for a takeover and end their membership; that row shows the account is one the open case cannot touch
- Where: `docs/runbooks/incident-response.md:211-229` (steps 3 to 5); `infra/lib/constructs/monitoring.ts:586` (the alarm's words, pinned at `infra/test/monitoring.test.ts:535`); `infra/lib/security-events.ts:61-63`; `docs/adr/0091-…md:236-238` (D10). The code they describe: `apps/web/src/lib/auth/sign-in.ts:301-306`, `:557`.
- Defect: step 3 lists `hardware_key_registered` and `sign_in` by the user after the line, and step 4 says "If there is a row, treat it as a takeover … contain". Through the app, a failed provider sign-out leaves open D10's case (b) alone: a key-registration step, which only an account that must sign in with a hardware key and has none can be in (`sign-in.ts:301-303`). Such an account never opens a session with an authenticator code (`:301-306`). So a `sign_in` of purpose `totp` is the ordinary next act of whoever reset, and it shows the account is not one case (b) can touch. Case (a) "does not depend on the provider's sign-out" and "pages no one", in D10's own words. The step contains on it all the same. Smaller, same step: its lower bound is the web task's log time, written after the sign-out call has failed and on another clock than `audit_event.at`; the reset's own row (same `request_id`, `sign-in.ts:543` and `:557`) is the right start.
- Failure: Cognito throttles `AdminUserGlobalSignOut`, or the application role loses it (step 6's own third cause, and then every reset pages). A customer's analyst resets and signs in with the new password. The operator gets `sign_in | totp` and, by step 4 and the alarm's words, ends that person's membership: role and sessions gone until a platform administrator adds them back, or the founder's break-glass for a practice's only administrator. The failed sign-out made none of it possible, and every legitimate reset during the fault ends the same way.
- Evidence:
  - `<W6 scratchpad>/reviews/delta-sec/exp2_runbook_world.ts` runs the real flow: a reset with the provider's sign-out rejected logs the counted line (error, `TooManyRequestsException`, the analyst's ID), then the person signs in with the new password and their own code: `signed_in`.
  - `<W6 scratchpad>/reviews/delta-sec/out_exp2_runbook.txt`: step 3's statement, run as `tp_operator` with the line's time, returns `sign_in|totp`.
  - The round's own case (b) test (`apps/web/src/lib/auth/sign-in.db.test.ts:763-800`) pins a staff account's trail as `hardware_key_registered:webauthn, sign_in:webauthn`, with no `sign_in:totp`.
  - `<W6 scratchpad>/reviews/delta-sec/out_exp7_anchor.txt`: the statement anchored on the reset's row runs as `tp_operator`.
- Fix (words, and one pin):
  - Step 3 starts from the reset: `AND at >= (SELECT min(at) FROM audit_event WHERE action = 'password_reset_completed' AND request_id = '<request_id>')`.
  - Step 4: "A `hardware_key_registered` row is what the failed sign-out makes possible: treat it as a takeover until the person says otherwise" (the rest as now). "A `sign_in` of purpose `webauthn` by a user with no `sign_in` of that purpose before the reset is treated the same. A `sign_in` of purpose `totp` is not a sign of it: it is what a person does after their own reset, and an account that signs in with an authenticator code is never in a key-registration step. End no membership for it; record and close."
  - The alarm: "…look in the audit log for hardware_key_registered by that user since the reset, and if there is one treat it as a takeover, end the account's sessions and tell the founder; a sign_in by authenticator code is the person's own".
  - D10 :237 and `security-events.ts:62` say the same.
  - Fails first: the pinned phrase at `infra/test/monitoring.test.ts:535`.
- Needs: a ruling by W6 (RULINGS.md's list for B3 asked for `sign_in`; the builder's report, item 14, chose "contain first, then ask"). No migration.

### DS-02 should fix "Find whose notice it is" takes any practice the user acted in for the user's own organization; for a firm's member and for PaidWhole's own staff it names a customer's organization, whose administrator is then told
- Where: `docs/runbooks/deliverability.md:474-485` (3.10, "In every case", step 1) and `:486` (step 2); used by `docs/runbooks/incident-response.md:177-182` and `:226-227`.
- Defect: the statement lists every practice in the user's audit rows, and the text has the operator open the practice's page for "its organization". A practice is reached three ways (`packages/db/functions/effective_practice_access.sql`): ownership, a grant another organization holds (a billing firm), or a support grant to PaidWhole's staff. `set_feature_flag()` also records a customer's practice under a platform administrator's ID. Only the first is the user's own organization.
- Failure: a billing firm's analyst's notice goes stale, or their reset pages. The operator runs the statement, opens the client practice's page and tells that practice group's administrator that a member's password was changed. That organization has no such member and has now been told of another organization's security event. The person, whom the page exists to tell, is never told. For `PasswordResetSessionsNotEnded` the operator also looks for the member to press End membership beside in the wrong organization.
- Evidence:
  - `<W6 scratchpad>/reviews/delta-sec/out_exp2_runbook_world.txt`: on `pnpm db:seed`'s own tenancy, through the product's `withPracticeScope` and `recordAuditEvent`, the firm analyst reaches North "via grant" and the group analyst "via ownership".
  - `<W6 scratchpad>/reviews/delta-sec/out_exp2_runbook.txt`: the runbook's statement as `tp_operator` returns North for both. As the owner: North belongs to the group, the firm analyst's only membership is the firm's, and they have 0 memberships in the group. As `tp_operator`, `membership`, `"user"`, `organization` and `practice` all answer permission denied, so the operator cannot notice.
  - `<W6 scratchpad>/reviews/delta-sec/out_exp5_fix_query.txt`: after a platform administrator sets a practice's feature flag, the runbook's statement returns that customer's practice for the administrator too. The replacement below returns 0 (firm analyst), 1 (group analyst), 0 (platform administrator).
- Fix: `SELECT DISTINCT practice_id FROM audit_event WHERE actor_id = '<user_id>' AND actor_kind = 'user' AND practice_id IS NOT NULL AND grant_id IS NULL AND action <> 'feature_flag_set';` and, after it: "These are practices of the user's own organization. No row means a firm's member, one of PaidWhole's own staff, or a person who has not worked in a practice: a practice they reached by a grant belongs to another organization, so tell no one there, and take the user ID to the founder." Runbook prose; the yearly tabletop is its guard.
- Needs: nothing.

### DS-03 should fix R3's second line follows `mfa_enrolled` at the send, so whoever completed the reset can turn it on first: the reader R3 was built for is still told "Signing in still asks for your authenticator code or hardware key."
- Where: `packages/db/migrations/20261111090000_password_changed_notice.sql:312-323` (the claim returns `u.mfa_enrolled` as it is when claimed), `:247-250` (the trigger keeps nothing of the account's state); `packages/auth-mail/src/words.ts:151-153`; `docs/adr/0091-…md:101-103` (D4), `:255-264` (D10); `packages/db/functions/record_sign_in_with_mfa.sql:21`.
- Defect: D4 says "The address and the flag are read at send time, not at the reset" and weighs what that leaves for the address only. D10 says "no code path … sets `mfa_enrolled` to false". The flag is set true by the first sign-in that enrols a factor, and the job sends up to a minute after the reset (up to 24 hours while it retries or is down). The reader the short line exists for is an invitee with a password and no factor whose reset was started at Cognito directly (D10, the public client). Inside the live invitation the next sign-in with the new password is offered enrolment, which is SEC-03's own failure text.
- Failure: someone reading that invitee's mailbox resets the password from outside the app's gate, signs in, enrols their own authenticator and holds a session before the job's next run. The account's address is then told "Every session of this account has ended. Signing in still asks for your authenticator code or hardware key." A session of the other party is open and the authenticator is theirs. The short line is sent only when the job's run happens to fall between the reset and the enrolment.
- Evidence: `<W6 scratchpad>/reviews/delta-sec/out_exp1_flag_at_send.txt` (the real flow and the real job):
  - the app's own request mails no code; a request at the provider does; the app's confirm answers `reset`;
  - the notice is `pending` with the account `invited`, `mfa_enrolled:false`;
  - signing in asks for `mfa_setup`; enrolling answers `signed_in`; the account is now `active`, `mfa_enrolled:true`, with one open session started after the change;
  - the job sends line 2 as the full sentence;
  - trail: `password_reset_completed, mfa_enrolled:totp, sign_in:totp, password_notice_sent`.
- Fix: keep the fact as it was at the reset. The trigger stores `"user".mfa_enrolled` in a new NOT NULL column of `password_notice` (it is a definer and already inserts for the actor's own row), and the claim returns that column AND `u.mfa_enrolled`. Fails first: a case in `apps/worker/src/platform/password-notices.db.test.ts` where a notice queued for an account with no factor still says the short line after the flag is set before the claim. If not built, D4 and D10 say it and SGN-16 records exp1's case as it stands.
- Needs: a migration change (and the domain model regenerated once more), or W6's ruling to record it instead. Same bound as R3 itself: the client is public until ADR 0088's release N+1. Unproven at Cognito, as SEC-03 was.

### DS-04 note ADR 0091 does not say whose accounts case (b) can touch, and gives the removal of a key already registered to the wrong queue item
- Where: `docs/adr/0091-…md:215-218` (D10 (b)), `:448-450`, `:511-514` (Not covered); pull request #140's description, "(b)"; `/home/user/ops/LANES.md` Queues items 28 and 29; `/home/user/ops/approval-summaries/lane-a-auth-emails-status.md:32-36`.
- Defect:
  - "(b) A key-registration step" names no account. Only an account that must sign in with a hardware key and has none reaches that step (`sign-in.ts:301-303`). The requirement is written for the internal organization alone (`apps/web/src/lib/routes/console.ts:746`; `settings.ts:1022` writes false; `sign_in_account()` adds `user_is_internal`). So (b) is never a customer's account. It is always one of PaidWhole's own, the roles the sign-in page lists (`apps/web/src/app/sign-in/notice.tsx:206`).
  - Not covered says of item 28 "its scope takes a hardware key registered in case (b): nothing an operator holds removes one". LANES.md says item 28 "stops the one known way a key is registered after a reset; this item gives the operator the remedy" of item 29, which is "not assigned … Decide before launch whether it is required for it."
- Failure: the founder weighs (b) as 15 minutes on any user. It is the accounts that hold the console, and a key registered in those minutes stays until a change that is neither assigned nor decided.
- Evidence: read; the quotes above. Not run.
- Fix:
  - D10 (b) gains: "Only an account that must sign in with a hardware key and has none reaches that step: PaidWhole's own platform administrators, contract specialists, reimbursement reviewers and support engineers, never a customer's account."
  - Not covered :513-514 becomes: "The same change takes the reset whose answer from Cognito is lost (D15). A key already registered in case (b) is removed by nothing an operator holds: that remedy is `LANES.md` Queues item 29, not yet assigned, its need before launch still to be decided."
  - The description's (b) and the status file's Follow-ups say the same.
- Needs: nothing (the description is W6's).

### DS-05 note For an organization's only practice administrator the runbooks say the founder's break-glass session "does it"; the database refuses that account's disable as it refuses End membership, and a disable at the provider ends no session
- Where: `docs/runbooks/incident-response.md:29-33`, `:177-180`, `:185`; `docs/runbooks/support-mail.md:84-90`, `:96`.
- Defect: section 2 sends "when the account must be disabled at the identity provider" to the founder and adds "a disabled user's sessions end at their next request (`user_disabled`)". That is true of the app's own row only: `resolve_session()` reads `"user".status` and nothing of the provider. For the one account End membership is refused for, the same guard refuses the row's disable.
- Failure: the only administrator of a small practice says "not me". The founder, mid-incident, finds the disable refused, or disables at Cognito and believes the open sessions ended.
- Evidence: `<W6 scratchpad>/reviews/delta-sec/out_exp4_sole_admin.txt`, as `tp_owner`, each rolled back:
  - ending the membership: "a practice must always keep at least one practice administrator";
  - `UPDATE "user" SET status = 'disabled'`: the same error, from `user_keeps_practice_administrator()`;
  - `revoke_user_sessions()`: "only the user or an administrator of the user's organization revokes the user's sessions";
  - a direct update of `user_session` by user ID: `UPDATE 1`.
- Fix (words, no SQL): "…give the user ID to the founder, whose break-glass session ends the sessions by user ID and disables the account at the identity provider. A disable at the provider ends no session of the app, and for an organization's only practice administrator the database refuses to disable the account's row as it refuses End membership: for that account the sessions are ended directly."
- Needs: nothing.

### DS-06 note The new section's 15 minutes is the bound only for a grant the app obtained; D10 itself says tokens taken at Cognito directly live 12 hours while the client is public
- Where: `docs/runbooks/incident-response.md:196-201`, `:228-229`; `infra/lib/constructs/monitoring.ts:586`; `docs/adr/0091-…md:241-252`.
- Defect: step 5 closes "after 15 minutes", and step 3 sees only rows the app writes. D10 says that today "anyone who signs in at Cognito directly, with the password and a code, holds its tokens outside that cookie (the refresh token for 12 hours)". A sign-out that failed revoked none of them, and a key registered with them at Cognito writes no `hardware_key_registered`.
- Failure: the operator closes at 15 minutes; a key registered at Cognito an hour later signs in through the app as `sign_in | webauthn`, with no page.
- Evidence: unproven (no user pool). It follows from D10's sentence, `infra/lib/constructs/identity.ts:13-18` (refresh token 12 hours) and `:145` (`generateSecret: false`). To prove it on staging: with tokens from a direct `InitiateAuth`, call `StartWebAuthnRegistration` after a reset whose `AdminUserGlobalSignOut` was not made.
- Fix: one sentence in step 5 and in D10's paragraph: "Until the client is confidential (ADR 0088's release N+1) a token taken at Cognito directly outlives the 15 minutes: ask the founder to make the sign-out again for that user, and read `sign_in` rows of purpose `webauthn` for that user in the week's review."
- Needs: nothing.

### DS-07 note The undelivered alarm's words, rewritten this round, leave out what the job has paged for since R7
- Where: `infra/lib/constructs/monitoring.ts:521` (pinned whole at `infra/test/mail-streams.test.ts:466`); `docs/runbooks/deliverability.md:102`.
- Defect: "did not reach their accounts, or were not sent within 24 hours … tell each person another way". The same alarm now fires for `RecordFailed`, where up to five copies went out and 3.10 says "Before telling anyone anything, check the mail record".
- Failure: an operator who acts on the page's words tells a sixth time a person who has five copies.
- Evidence: read (`apps/worker/src/platform/password-notices.ts:200-210`; 3.10's `RecordFailed` case).
- Fix: "…did not reach their accounts, were not sent within 24 hours, or went out with their record failing: read every line while this alarm is raised and each line's reason before you tell anyone (docs/runbooks/deliverability.md, 3.10)." The table row at `:102` gets the same words. Fails first: the `toBe` at `mail-streams.test.ts:466`.
- Needs: nothing.

### DS-08 note D15 lists three completed resets that neither queue nor page; a fourth is a web task stopped between the provider's answer and the line
- Where: `docs/adr/0091-…md:342-345`; `apps/web/src/lib/auth/sign-in.ts:523-553`.
- Defect: "So every completed reset the app learns of, for an account, either queues a notice or pages." Between the provider's `reset` and the line lie two tries of the transaction, each of which can wait 10 s for a connection. A task killed there writes neither. D9 says the same of the worker's line; D15 does not.
- Evidence: read, not run.
- Fix: one sentence in D15, in D9's words: "A web task stopped between Cognito's answer and the line loses both; nothing records that reset."
- Needs: nothing.

## Checked, sound
1. **The confirm, outcome by outcome** (question 1). Read both versions. With the database reachable, `client_credential`, `rejected`, `invalid_password`, no account, `reset` and `sessions_not_ended` answer, log and write the same. With it unreachable, every confirm now throws before the provider is asked, for every address alike.
2. **The two new tests fail on the old order.** Ran the committed test file in a `git archive` copy with 68895f0f's `sign-in.ts`: 2 failed (exactly the two), 37 passed (`<W6 scratchpad>/reviews/delta-sec/out_old_order_tests.txt`). Control, same copy with the head's file: 39 passed (`<W6 scratchpad>/reviews/delta-sec/out_head_order_tests.txt`).
3. **Nothing new for someone without an account.** The lookup costs about 24 to 30 µs for an address with an account against 13 to 18 µs for one with none, server-side over 5,000 lookups (`<W6 scratchpad>/reviews/delta-sec/out_lookup_timing.txt`). It is the read the reset request and the password step already make first, under the same limit. The weak-password path (the builder's item 2) is that read alone; no rule is broken.
4. **The earlier read being stale** (the builder's item 3). Read, not run. A lock or a disable landing during the provider's call changes only the redirect's reason and whether the address is kept; sessions end and the notice is queued either way. No route changes `"user".email`, and the application role cannot update `cognito_sub`.
5. **The two open-residual tests** (question 2). They do what D10 says: a code step begun before a reset and answered after it; a key registered after it with the sign-out rejected, the trail pinned. Names and comments say "open residual … not what is wanted". They fail at `toBe('signed_in')`, `toEqual({ kind: 'key_registered' })` or "expected options" the moment a close refuses.
6. **The four lines, both variants**, against `words.ts`, the snapshots and the six renders (600, 390, 320 light; dark-preferred; dark-inverted; not-enrolled). Nothing new breaks at any width; the date's break at 320 px is UX-07's, deferred. The phrases are the screens' own (`notice.tsx:21`, `:34`, `:44`, `:179`), with the same apostrophe.
7. **Each sentence by reader**: enrolled, not enrolled, locked, disabled after the reset, own reset, staff with no organization (the second route has no referent; harmless). For an organization's only administrator the second route names themself; nothing is untrue and it is not worse than before. Only DS-03 is untrue for someone.
8. **Reply-To** (question 4). Only this message sets one; the transactional sender has none (`apps/worker/src/mail/mail.ts:156-161`, `:196`); the address is the deployment's, checked at start. What a replier gets, reproduced with the worker's own reader and screen (`<W6 scratchpad>/reviews/delta-sec/out_exp6_screen_reply.txt`):
   - no automatic answer ever;
   - a new message or a reply with the quote removed opens a readable ticket;
   - a reply that quotes, a forward, the text pasted or the time repeated opens a withheld one;
   - an automatic reply opens a ticket;
   - a sender SES cannot verify or a disabled account gets none.
   The playbook says each. No new abuse found: a notice exists only for a completed reset, which takes the mailbox's code, and the sender check is unchanged.
9. **ADR D5, D6, D8, D9, D11, D12, D13** against `words.ts`, `mail.ts`, `template.ts` (comment only), `password-notices.ts`, `mail-events.ts` (lines before the delete), the migration's header, preflight and loop, the three function files, `fields.ts` and `jobs/platform.ts`: no mismatch but those above.
10. **D10's facts**: 3 and 15 minutes (`step-limits.ts`, `identity.ts`); the seal's expiry is checked on the server (`pending.ts`); nine counts (`security-events.ts`); only `record_sign_in_with_mfa()` writes the flag, and only to true.
11. **D15, Consequences, Not covered, Revisit when, the review-round section**:
    - LANES.md Queues item 28 exists and says what the ADR says of it;
    - the status file's Follow-ups hold the five deferred items;
    - #140's description puts the trade-off with its exact alternative, cases (a) to (c), and the Reply-To to the founder;
    - the ADR cites no stale `sign-in.ts` line (the builder's item 1).
12. **Every SQL statement of the four runbooks** runs as `tp_operator` on rows the product wrote (`<W6 scratchpad>/reviews/delta-sec/out_exp2_runbook.txt`). The screens the steps name exist: `/console/mail`, `/console/practices/[practiceId]` with its organization link, the organization page's End membership and Send invitation, Settings Users' End membership, `/account/devices`. The log lines carry the fields the queries read.
13. **What End membership does** (`console.ts:769-797`, `settings.ts:1076-1110` read): membership, every session of the user and the provider's sign-out in one transaction. The builder's runs were read, not re-run: nothing ended when the provider rejects, and Send invitation restores the role and mails nothing. Refusal for the only practice administrator is confirmed in my exp4.
14. **Alarm words and the label** (question 7): `PasswordResetSessionsNotEnded`, `TransactionalSetBounce` and the console's label name what exists. The "nine counted from the logs" comment is right (six platform codes, the unsent probe, two web codes).
15. **SGN-16** (question 8): the row, `matrix.ts` and the fixture's assertion are identical (2,443 characters, by script). The registry's 13 files equal the fixture's and all exist. Each clause has a test by title.
16. **The e2e journey's new assertions** match the words and the `replyTo` key the local sender writes. Read, not run.

## Not seen
- The console's mail page with its new label (one string, not rendered).
- The email in a real mail client.
- The alarm texts in CloudWatch.
- `/sign-in?reason=password_reset_locked`.

## Not checked
- Anything at Cognito or SES: DS-03's direct reset, DS-06's tokens, a challenge answered after a reset, the Logs Insights queries.
- Playwright was not run.
- The worker's and the migration's code beyond what the ADR's sentences needed; D11's locks and D12's rollback were read only (the other delta reviewer's ground).
- The break-glass session itself, beyond the four statements of exp4.
- End membership on the internal organization's page.
- A mutant with a close built in (question 2 is answered from the assertions).
- The tests at 7da699b1.
