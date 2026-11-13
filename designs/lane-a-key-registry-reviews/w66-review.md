# W66 review: S6's new texts (user_removal_target_holds, hardware_key_removal_request)

**Verdict: no BLOCKER. The core bound holds (one requester binds one existing administrator for at most 24 hours by the clock, at most once in eight days), but "never two at once" is false through a promotion, and the membership trigger still disagrees with side (a). Three SHOULD-FIX, seven NOTE.**

Proved by a temporary probe file run against the patched migration (PostgreSQL 18, five cases, deleted afterwards): S1, S2, S3, and the two refusals in N3. Everything else is reasoned from the text.

## SHOULD-FIX

### S1. One requester holds two administrators at once: request against a non-administrator, who is then promoted (proved)
Text: the outer `IF EXISTS (membership of target_user ...)` in `hardware_key_removal_request`; the comment "and never two at once".
Scenario (two administrators A compromised, B; X an ordinary internal account):
1. A requests against B (accepted: its one administrator request).
2. A requests against X (accepted: X is no administrator, so neither rule is read). A may do this for every account B might promote, and renew each every 24 hours without limit.
3. B, bound, cannot disable A, but can still INSERT a platform_admin membership for X (the membership trigger is BEFORE UPDATE only; the insert as B was accepted in the probe).
4. X, now a platform administrator, tries to disable A: refused, `hardware_key_removal_target_acts`. B: refused too. A holds two administrators at once.
Limit of the damage: B is still free at 24 hours and A cannot renew against B, so the 24-hour bound on B stands. What fails is B's only way out inside the 24 hours (promote a third person), and the stated invariant.
Smallest change (trigger, no new object, no lock): bind only for the requester's earliest confirmable request against a current platform administrator. Add to the trigger's EXISTS:
`AND NOT EXISTS (SELECT 1 FROM hardware_key_removal e WHERE e.requested_by = r.requested_by AND e.user_id <> r.user_id AND e.state = 'requested' AND e.expires_at > clock_timestamp() AND (e.requested_at, e.id) < (r.requested_at, r.id) AND <e.user_id holds a live internal platform_admin membership>)`.
Then the count is enforced where it is used, whatever was true when the request was made. (Alternative: bind only a target whose platform_admin membership predates `r.requested_at`; weaker, because a role can be changed in place.) Add the case to SGN-31.

### S2. `membership_removal_target_holds` still binds on any row in state 'requested' (proved)
Text: unchanged function, section 6; its comment still says "until the request is decided".
Scenarios:
- A requests against B; 25 hours pass; the job has not run. B disables A: accepted. B ends A's membership: refused. A asks again: refused `asked_again_too_soon`, and that refusal rolls back the lapsed mark, so the row stays 'requested'. B's second try to end the membership: refused again. Only the expiry job (or another requester's request against B) ever frees B; a stalled job binds B on every internal membership indefinitely. This is S6's unbounded shape, on the membership side.
- A requests against B; C disables A. B may now disable anyone (new trigger), but B cannot end or demote any internal membership (refused in the probe) until the job marks the row, up to 24 hours later, though the request can never be confirmed.
Why it matters beyond tidiness: disabling A works, so A is stoppable; but the two triggers raise the same constraint name with different rules, and B cannot demote A, only disable.
Smallest change: the same three conditions in its EXISTS (`AND r.expires_at > clock_timestamp() AND account_removes_keys(r.requested_by)`), plus S1's clause if taken; comment and message to "while the request can be confirmed". No new object.

### S3. The target of an open request may itself request: the counter-request binds the honest requester (proved; older than W66, but it is question 2's answer)
Text: `hardware_key_removal_request` has no check that the actor is not the target of a confirmable request.
Scenario: B's account is stolen. A requests against B. The thief, as B, requests against A (accepted). Now A cannot disable B (refused in the probe) for 24 hours. With exactly two administrators nobody can confirm or cancel either request except each requester its own; the thief keeps a platform administrator's session and A's only remedy is the owner path. With three, C is unbound and can confirm, cancel or disable.
Mutual lockout length: 24 hours each from its own request, not renewable against the same account for seven days; with S2 unfixed, both stay bound on memberships until the job runs.
Smallest change: refuse a request by an account that is the target of a request that can still be confirmed (a RAISE in the request function, after the privilege check). Cost: a compromised A who asks first stops B asking against A; with two administrators B's request could never be confirmed anyway, with three C asks and B may still confirm. If not taken: the runbook must say "disable the account first, then request".

## NOTE

### N1. With exactly two administrators a request against the other can never be confirmed, so it is only ever a shield
Confirmation needs a third account passing `account_removes_keys`. The ruling bounds the shield to 24 hours in 8 days; it could remove it: refuse a request against a platform administrator when no account other than requester and target passes `account_removes_keys`. Honest teams of two lose nothing (they have no removal today; the owner path is their only one). Not required by the ruling.

### N2. The seven days and the one-open limit for honest teams: acceptable, three things to say in the product
- Three administrators, B's key lost, A asks Friday, C absent until Monday: expired; A may not ask again until the following Saturday. C must ask and A confirm. Works, but the refusal message must tell A that another administrator may ask now (the test covers that the other may; the web's wording was not read).
- Any administrator's cancel starts the requester's seven days ("whoever cancelled it"). A third administrator cancelling by mistake costs the requester a week against that target; again the other must ask. Not tested (N6).
- One-open limit: two administrators' keys lost at once in a team of five needs two different requesters. Fine; in a team of three it could not be confirmed anyway.
- Security cost of the wait: a stolen administrator account can be held (bound) by one requester for only 24 hours in 8 days. Holding is not the control; disabling is (one administrator, at once). Runbook point, same as S3.

### N3. Requester-side unbinding by the target: not found
Bound B cannot make A fail `account_removes_keys`: status and hardware-key rule are the trigger; clearing A's `mfa_enrolled` as B is refused (42501, probe); deleting A's membership is refused (42501, probe); updating it is the membership trigger. A new membership inserted for A writes its role_escalation event on the new membership's ID, and the predicate needs only one passing membership.

### N4. Clock: `account_removes_keys` reads `now()`, the trigger and section 9 read `clock_timestamp()`
In a transaction opened before the requester first passed the predicate (seven days in role, or seven days since a role_escalation), the trigger sees the requester as failing and does not bind, though a confirmation in a fresh transaction would be accepted. Needs the target to hold a transaction open across that instant; the web's transactions are short, so theoretical. The opposite staleness only binds longer. Smallest change, if wanted: none in W66; note it beside the "Clock" bullet.
Boundaries, all consistent: at exactly `expires_at` the trigger does not bind, the confirmation and the cancel refuse, the request does not count it and marks it. A cancelled row always has `decided_at < expires_at`; an expired row `decided_at >= expires_at` (table CHECK). The wait runs from `expires_at` whether the job marked late, the request function marked, or nobody did; from `decided_at` for a cancel, so a requester who cancels after one hour may ask again 7 days 1 hour after asking. Job stalled for days: the user trigger is free at 24 hours (see S2 for the other trigger).

### N5. Locks: no cycle found
Request: advisory(requester), then target's "user" row, then the target's lapsed removal rows. Confirm and cancel: "user" row, then removal row, no advisory. The job: removal rows only, SKIP LOCKED, never a "user" row, so a request waiting on a row the job holds waits for no one who waits for it; after the wait the row no longer matches and is skipped. Two administrators against each other: different advisory keys, each the other's row, foreign keys take KEY SHARE. Same requester twice: the second waits on the advisory lock; each statement of the VOLATILE function takes a new snapshot at READ COMMITTED, so it sees the first's row (SGN-31's concurrency case would fail otherwise). A 64-bit hash collision only serialises two requesters. The trigger takes no lock and adds no wait. A request waiting on a target's row holds its requester's advisory lock meanwhile; bounded by the web's lock timeout. Not verified: whether the web's transaction wrapper locks the acting account's own "user" row before the call; if it did, two administrators asking against each other would deadlock (A holds A, wants B; B holds B, wants A).

### N6. SGN-31: cases that would pass with the rule wrong, or that claim more than they assert
- "does not limit a request against an account that is not a platform administrator": the administrator request is made first, so the members' requests never reach the count. Dropping the inner `EXISTS (membership of r.user_id)` (counting open requests against members toward the one) would still pass. Add the reverse order: open request against a member, then one against an administrator, accepted.
- "A and B request against each other ... neither is bound after, with no deadlock": only B disabling A is asserted after; A's freedom is not. `Promise.all` of two calls that each first await a session rarely overlaps inside the function, so "no deadlock" is not exercised; hold one in an open transaction as the concurrency case does.
- (a) second case ends the membership only; a trigger that read "live membership" instead of `account_removes_keys` would pass every case. One case with a requester who fails only by a role_escalation event (or cleared second factor) would pin the predicate.
- The cancelled-wait case covers only the requester's own cancel, not "whoever cancelled it".
- Missing: S1 (promotion), S2 (the membership trigger at 25 hours and with the requester gone), S3 (counter-request), an earlier request made while the target was not yet an administrator now counted in the wait.
- The rest assert their titles: the expiry case distinguishes `expires_at` from both `requested_at` and the job's mark; the concurrency case fails without the lock and without the fresh snapshot.

### N7. Comment
"So one requester holds one administrator ... and never two at once" is untrue until S1 is fixed. `requested_by` has no index; fine at this size, as the texts say.

## Not verified
- The definition of `app_actor_is_platform_admin()`, `app_actor_memberships()` and the "user" UPDATE policy: not read (outside the listed files). I took the brief's description. The new EXISTS (role, internal kind, not ended; no status or second-factor condition) is no narrower than that description; if the policy admits anyone by another role or path, both rules miss them.
- The web routes, the runbook and `console-routes.db.test.ts`.
- The whole `pnpm test:db` and SGN-31 itself were not rerun; only the five probes.
- No real deadlock test was run; N5 is from the text.
