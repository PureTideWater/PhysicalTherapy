# W67 review: S2, S3, N1 and the closed list (adversarial delta)

Scope: only `membership_removal_target_holds` (S2), the `hardware_key_removal_target_asks` and
`hardware_key_removal_no_third_administrator` refusals and the two-key advisory lock in `hardware_key_removal_request`
(S3, N1), and the extension of `hardware_key_removal_refused`'s closed list. Migration read in the scratch worktree:
/home/user/w67-scratch/packages/db/migrations/20261115090000_key_registry.sql (lines 385-402, 487-578, 845-1090).
I read the design notes (w64-migration-texts.md 279-375), the SGN-31 (d)(e)(f) tests and `onlyAdministrators`, and
the web refusal maps in apps/web/src/lib/routes/console-keys.ts (lines 40-90). I ran one probe and then deleted it.

## BLOCKER
None found.

## SHOULD-FIX
None.

## NOTE

### N-1. N1 is judged only when the request is made. The requester can then disable the third administrator, and the target stays held with no one left who could confirm or cancel (text: N1, together with S2 and the account trigger)
- Scenario, with exactly three administrators A, B and C, all passing `account_removes_keys`. A is compromised.
  1. A asks for the removal of B's keys. N1 passes because C is the third.
  2. A disables C (A is bound by nothing).
  3. B now cannot disable A, end A's membership or demote A (`hardware_key_removal_target_acts` on both triggers).
  4. C, being disabled, cannot cancel the request (`account_removes_keys` fails). B cannot cancel a request against
     itself.
  5. The request stays 'requested' and binds B until its 24 hours are up. In that time A also demotes B.
- **Proved by a probe** (an it.only inside SGN-31, `onlyAdministrators([a, b, c])`): 1 passed. Every assertion above
  held: `disable(b, a)`, `endMembership(b, a)` and `demote(b, a)` were all HOLDS, cancel by C and by B was not
  accepted, and `demote(a, b)` was accepted.
- Why this is not a BLOCKER: the hold is bounded at 24 hours and A cannot renew it against B for seven days
  (`asked_again_too_soon`). An administrator could also disable B and C in one statement without the registry.
  What the registry adds is a quiet first step: the request looks legitimate, and the loud step comes later.
  The design notes say "Not closed, by design", and the only remedy they give is the owner path.
- Smallest change: add N1's own condition to the binding in both triggers, at lines about 520-534 and 556-570: some
  account other than `r.requested_by` and `r.user_id` holds a live internal `platform_admin` membership and passes
  `account_removes_keys`. A request that no one could confirm then binds no one, which is the reason N1 gives.
- The target cannot use this change to free itself: while bound it cannot change any account's status or any
  internal membership, so it cannot remove the third administrator. This is reasoned, not probed.
- Cost: one more EXISTS over the administrators on each guarded UPDATE.

### N-2. S3 plus the one-request limit: while one honest request is open, a second urgent removal needs a cancel, and that cancel starts the seven-day wait (text: S3 with `one_administrator_request` and `asked_again_too_soon`)
- Scenario, with three honest-to-start administrators A, B and C.
  1. A asks for the removal of B's keys because B lost one key.
  2. C's key is stolen, and the thief does not confirm A's request.
  3. B cannot ask against C (`target_asks`). A cannot ask against C (`one_administrator_request`).
  4. A has to cancel its request against B. Then A or B asks against C, and the other confirms.
  5. A cannot ask against B again for seven days. The removal of B's keys never had a confirmer other than C anyway.
- The removal of C is delayed by one cancel, not blocked. This is reasoned, not probed.
- No change proposed. It may be worth a line in the runbook, and the `target_asks` words could say "or ask the
  requester to cancel".

### N-3. S2 still refuses the bound target's change to its own internal membership (text: S2)
- `user_removal_target_holds` exempts the account's own row (`OLD.id <> app_actor_id()`).
  `membership_removal_target_holds` has no such exemption.
- So a bound target cannot step down from or end its own internal membership for up to 24 hours. That change can
  neither void the request nor take away a confirmer.
- The ruling may mean this; the comment does not say so. The smallest change, if it is not meant, is
  `AND OLD.user_id <> app_actor_id()`. This is reasoned, not probed.

## Checked with nothing found (reasoned, not probed unless stated)
- **No new renewable shield.** Each bound target can be freed at once by any third administrator, who may cancel
  (cancel is not limited by being bound). The earliest-request rule now gives the same answer on both doors. A
  member who is asked against and then promoted is not held by either trigger (the SGN-31 (d) test covers this).
- **S3 creates no shield.** It refuses requests only, never a status or membership change. A request made in advance
  by a compromised A against C leaves B able to ask against A, and C may confirm (a bound account may confirm).
- **N1 blocks no legitimate removal.** It does not block one with three eligible administrators, nor any request
  against a non-administrator. The refusal writes no row and starts no wait.
- **Deadlock: none reachable.**
  - The request takes the web wrapper's `request_key:<actor>:<key>` lock (a separate key space), then the advisory
    lock on the lower ID, then the higher ID, then the target's "user" row FOR NO KEY UPDATE, then that target's
    lapsed removal rows.
  - Confirm and cancel take the account's "user" row and then the removal row FOR UPDATE, with no advisory lock.
  - Every route therefore takes row locks in the same order, and only the request takes the advisory keys, always in
    a global ID order. Pairs that share an account form no ring.
  - The FK KEY SHARE locks from the request's inserts (on the actor's "user" row) are compatible with FOR NO KEY
    UPDATE.
  - SGN-31 (e) "mutual" shows the two-key wait ends in `target_asks` with no 40P01.
  - I did not read the expiry job's (`operator_key_removals_expire`) lock order against the request's lapse UPDATE.
- **Closed list.** The four new reasons appear in `hardware_key_removal_refused` and in the web's `RECORDED_REFUSALS`.
  The words for `target_asks` and `no_third_administrator` are present in `KEY_REFUSALS`. I did not read route.ts's
  `KEY_REMOVAL_REFUSALS`.

## Not verified
- I did not run the full suite.
- I probed only N-1. N-2, N-3 and the deadlock analysis are reasoned.
- I did not check whether the bound target can void the request through columns the triggers do not watch (for
  example `mfa_enrolled`, guarded by `user_guarded_columns`, which I did not read), or through a membership INSERT.
  The INSERT is not covered by the BEFORE UPDATE trigger. By reading, it cannot make an existing membership fail
  `account_removes_keys`.
