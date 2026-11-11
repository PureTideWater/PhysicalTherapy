# Rulings on the two reviews of design v1 (W8, 2026-11-11 07:05 UTC)

Reviews: `design-review-security.md` (SEC-D1 to SEC-D11) and `design-review-database.md` (DB-D1 to DB-D11), both of
`designs/lane-a-step-before-reset.md` v1 at fadadf4b. Each finding was checked against the code or its experiment
before it changed anything. **Every finding is real; none is "not a defect".** Decisions are W8's under the
co-founder's standing instruction (the safer option for security; never weighted by build effort); the founder can
reverse any. The design is now v2.

| Finding | Checked by | Ruling |
| --- | --- | --- |
| SEC-D1 blocking while the client is public: the same moves made at Cognito directly never pass the application | `infra/lib/constructs/identity.ts:145` (`generateSecret: false`); ADR 0088's second release | Nothing in this change can close it. v2 section 2 states the rule's scope and names ADR 0088's second release as a precondition of "required before launch"; "needs no Cognito fact" is gone. It goes in the PR description for the founder |
| SEC-D2 the reset marks the address's account, the step is judged on the subject's | `sign-in.ts` (`confirmPasswordReset` by address; `authenticated()` by subject); `sign-in.db.test.ts`'s crossed-state case | v2 D5 judges both accounts (the typed address's and the subject's), which refuses the scenario and refuses nothing for a sound account. The reset itself acting on the address's account is the reset's own defect in that state: a known limit here, handed on to Schema PR 6 (sign-in identity) |
| SEC-D3 a key registered across the reset is neither removed nor reported; the window is from the provider's change to the commit | The order in `confirmPasswordReset` (the sign-out is sent after the commit); `DeleteWebAuthnCredentialCommand` is in the installed SDK | v2 D6: a second check after the provider registered the key; if refused, remove it with the same grant or report it, counted and paged. The lock across the provider call stays rejected, with the review's agreement |
| SEC-D4 a refusal is a warn line nothing counts, and no audit row | `sign_in_failed.sql` (it writes `security_event` rows); `infra/lib/security-events.ts` (eight counted lines); `routes/sign-in.ts:700` (a reset in the same browser replaces the pending step, so a stale step is another device) | v2 D5: the check and the record are one database function; a counted line, an alarm for every step but `key`, a runbook step |
| SEC-D5 a stale code step still counts failures and uses up codes | `answerTotp` asks the provider first | v2 D5: `answerTotp` is refused before the provider is asked, by the typed address's account. Never `completeKey` (it would tell an outsider an account was reset): stated in the table and pinned by a test |
| SEC-D6 the clock's margin is one provider round trip, not two; "no Cognito fact" is untrue; a guard | The timeline of the two calls | v2 D3 and section 5 say about one round trip (10 ms) and the attempt's real life (6 and 21 minutes); the provider fact is in section 6; a start ahead of the clock is refused (with DB-D4). The 30-minute guard is not taken (alternatives). The one-row counter is in the alternatives with its reason. Tests wait past the mark's millisecond |
| SEC-D7 more completed resets record nothing than v1 listed, one of them through the SDK's retry | `services.ts:143` (a default client); `cognito-provider.ts` `RESET_REJECTED` | Listed in section 5. The retry was sent to the orchestrator, who ruled it into this PR (06:49 UTC): v2 D9, SGN-18. The runbook's containment is to disable the user, which already refuses its steps |
| SEC-D8 where the check sits | `authenticated()`'s order of refusals | v2 D5's table says it: after the account is found, not disabled and not locked; after ADR 0088's checks in the enrolment rows |
| SEC-D9 a rolling deploy is not "once"; lock a row with no start too | Followed through with DB-D1's order | v2 D8 says what happens while both images serve. The lock for a row with no start is NOT taken: under D2 the reset holds the account first, so a locked old-image insert would always land after the reset and never be swept, which is worse than today |
| SEC-D10 the words | `notice.tsx` | No change; the e2e uses a second browser context |
| SEC-D11 "set a password" overstates the rule | The reset step is unchecked by design | The rule says "replaces a temporary password"; the two-code check is in section 6 |
| DB-D1 blocking: v1 adds lock cycles (the account's row after a device row; session rows twice) | `resolve_session.sql` (session, then device); `sessions.ts` (the device statement before the insert); the review's scripts with a control | v2 D2: the account's row first in `openSession` and in the reset's transaction, by a function that locks only the acting account's row. The build's three-connection case is red before the two calls and green after |
| DB-D2 ACCESS EXCLUSIVE on `"user"` NOWAIT is refused by any open transaction that touched it; a reconcile pass outlasts the loop | The review's `m.mjs`; `withJobScope` reads `"user"` | v2 D10 says what refuses a try and when to deploy (header, ADR, runbook), and tests the loop with a reader open. A table of its own for the mark is rejected (a join for good, to ease one deploy) |
| DB-D3 at REPEATABLE READ the mark moves and a session stays live | The review's `orders.mjs` O4 | The trigger function and the check function refuse to run outside READ COMMITTED |
| DB-D4 a start ahead of the clock passes for good | The review's `sec.mjs` | Refused in the insert trigger and in the check function |
| DB-D5, DB-D6 two false sentences in v1 | The review's O1 and S1 | Struck; SECURITY DEFINER's real reason is stated |
| DB-D7 the sequence row's reasons | `catalog-reads.ts` reads no sequences; four identity sequences exist | Reworded: the reason is the silent lock-out when a sequence restarts lower; the replication claim is marked unverified |
| DB-D8 limits: a mark ahead of the clock; the function's snapshot; NULL start on a never-reset account | The review's S5, S7 | In section 5 and the runbook; the function is its own statement and refuses outside READ COMMITTED; the NULL case is in the function and its tests |
| DB-D9 a policy change would need its own lock | No policy changes in v2 (`security_event` is the database's already; the new action is the web's) | No change |
| DB-D10 what the build updates | The generator on the review's draft | Taken as the build's list (the function set differs in v2) |
| DB-D11 `resolve_session()` against `revokeDevice` deadlocks on the base | The review's `base-cycle.mjs` on the control | Outside this change: handed on (design section 7) |

Two things the reviews did not ask for, and why they are in v2:
- **D9, a reset whose answer was lost** (the orchestrator's ruling on SEC-D7's first item).
- **No lock for a session row with no start** (against SEC-D9's suggestion): see its row.
