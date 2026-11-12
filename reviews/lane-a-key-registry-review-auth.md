# Review: lane-a-key-registry.md, auth and session security

2026-11-12. Adversarial review of the design note `designs/lane-a-key-registry.md` (v1, nothing built), one risk
only: can an operator, a member, or an attacker holding one stolen factor misuse or dodge hardware-key removal?
Code read on base 93e137f9, read-only. Out of scope and not examined: row-level security detail, locks, migration
mechanics, the outbox's exactly-once effect. The ruled items of section 0 are not reopened.

"Verified" below means read in the code at the cited line. "Inferred" means reasoned from the note or from a
library's or the provider's usual behaviour, not proven here.

## Findings

### A1. Blocking. After a removal, the account belongs to whoever signs in first with the password and the code; the note gives no control on that window

Section: 2 (fifth bullet), 6 (confirm step 6), 7 (the notice's words), 11 (runbook), 12 item 3.

Attack (attacker holds a stolen password and code, no key):
1. The attacker (or a plausible "I lost my key" message) gets a removal requested. Both administrators are honest.
   The runbook step in section 11 has the confirmer check "with the requester by voice": nobody is told to verify
   the member.
2. Confirmation commits. The account has no live key.
3. The attacker signs in with the password and the code. The flow offers key registration (the registry now answers
   "no key"). The attacker registers their own key and signs in with it.
4. The member's next password-and-code sign-in finds a live key and is refused `hardware_key_required`. The member
   is out, the attacker is in, and undoing it takes another two-person removal that again opens the same window.

The window has no end (it lasts until someone registers) and the first registration after a removal looks like any
other registration.

Evidence (verified): `apps/web/src/lib/auth/sign-in.ts:445-451`: a password-and-code sign-in of an account that
must hold a key and has none gets the `register_key` step, no further proof. `sign-in.ts:706-714`: a registration
leaves only the `hardware_key_registered` audit row, no notice and no operator line. The note's notice (section 7)
is sent at removal only, and it tells any reader of the mailbox that password and code now suffice.

Section 12 item 3 says the account is "lowered to its password and its code". That is the fact, not a control. For
a platform administrator's account this is a full takeover path through two honest people.

Smallest change to the note:
- Section 11: the confirmer verifies the **member** out of band (voice, a known number), not only the requester;
  where the password may be known to someone else, the member resets it before the removal is confirmed.
- Section 6 or 7: the first `hardware_key_record` after a confirmed removal queues a second notice to the member
  ("a new key was registered") and writes one `security event` line and audit row naming the removal's ID, so the
  operator and the member both hear who won.
- ADR-N records the window and that these two are its only controls.
- Add the case to section 8 and a test beside SGN-h (registration after a removal produces the notice row and the
  event).

### A2. Should fix. The Q1 age rule is not specified, and "membership age" does not measure time in the role

Section: 4 (the helpers), 6 ("what two accounts cannot prove"), 12 Q1.

One administrator alone, today, in about an hour (verified): `console.ts:752` inserts a membership with the role
the form names; the INSERT policy lets an administrator of the internal organization add anyone not known elsewhere
(`20261015180000_tenancy_hardening.sql:139-145`; `app_actor_administered_organization_ids` counts
`('internal','platform_admin')`); `membership_rules` refuses only one's own membership or role. So A invites A2 as
platform administrator, enrols it, requests as A and confirms as A2. Q1 exists to close this. The note never says
what the seven days are measured from.

If the build takes `membership.created_at` (the obvious column): the role of an existing internal membership can be
changed in place. `GRANT UPDATE (role, ends_at) ON membership TO tp_app`
(`20261015140000_tenancy.sql:603`), the UPDATE policy admits a platform administrator, and `membership_rules`
refuses only a change of one's own role. `created_at` does not move on a role change. So an old `support` or
`reviewer` membership (a dormant sock account, or an accomplice's) promoted to `platform_admin` is at once "older
than seven days". No web route does this for an internal role today (`settings.ts:1052` lists customer roles only),
so this is the database's rule that is loose, which is where the note says the rule lives.

Sound here (verified): `created_at` is in neither the INSERT nor the UPDATE column grant, so the app role cannot
forge or re-date it; an ended membership never changes (`membership_rules`), so ending and re-adding makes a new
row with a new date; the app role cannot create a second internal organization
(`20261015180000_tenancy_hardening.sql:166-167`); nobody grants themselves a membership.

Smallest change: section 4 states the rule as "has held `platform_admin` in an internal organization continuously
for seven days", measured from the later of the membership's `created_at` and its latest `role_escalation`
security event (the trigger `membership_security_events` already writes one on INSERT and on UPDATE OF role), or
from a new `role_since` column set by that trigger. SGN-d and SGN-e each gain the promoted-old-membership case.

### A3. Should fix. `user_removes_keys(requested_by)` is weaker than the actor's check

Section: 4 (second helper), 6 confirm step 5.

The note describes the requester's re-check as "live `platform_admin` membership in an `internal` organization".
The actor's check goes through `app_actor_memberships()`, which also requires `u.status = 'active' AND
u.mfa_enrolled` (verified, `packages/db/functions/app_actor_memberships.sql`). As written, a request made by an
account that has since been disabled still confirms, and so does one whose requester lost the role and was given it
back between request and confirmation (a new membership, which under A2 should not count). The note also does not
say whether the Q1 age applies to the requester at confirmation.

Smallest change: one sentence in section 4: the second helper is the same predicate as the first for a named
account (active, enrolled, the role, the Q1 age), and at confirmation the requester's qualifying membership must be
the one that was live at `requested_at`. One more refusal in SGN-e (requester disabled; requester re-added).

### A4. Should fix. The account under removal can void its own removal when it is a platform administrator

Section: 6 confirm step 5, cancel; 13 item 5.

Steps: a thief holds a session of platform administrator T. A requests T's removal. The thief, as T, ends A's
internal membership through `console.end_membership`. B's confirmation is refused
`hardware_key_removal_requester_left`. The thief repeats for each new requester, or ends every other
administrator's membership at once.

Evidence (verified): `console.ts:780-784`, the UPDATE has no condition on whose membership it is; the UPDATE
policy admits any platform administrator; nothing keeps a last platform administrator. The note closes cancel to
the account ("a thief in the account must not be able to stop its removal") and leaves this door, which step 5
creates.

The ruled design cannot fully stop a platform administrator from ending other administrators' memberships (that is
existing power, and break-glass is its answer). What the note can do:
- Step 5: the request is void only if the requester's membership was not ended by the account under removal (the
  `membership_ended` audit row's actor), or drop the voiding for a requester who held the role at `requested_at`
  and whose membership was ended after it by the target.
- Section 11, runbook: when the account is a platform administrator, the first act is one administrator ending
  its internal membership (this already ends its sessions, and with this note moves its mark); the key removal
  follows. Today the runbook text orders it the other way.

Also to state (inferred, by design): any one platform administrator who is not the account can cancel any request,
so one compromised administrator account can veto removals indefinitely. Each cancel is audited; the runbook should
name a repeated cancel as an incident.

### A5. Should fix. The cleaning step can delete a key the member is registering at that moment, and "live row, no credential at the provider" has no way out

Section: 2 (fifth bullet), 5 step 2, 8 case 11.

Steps: the member is re-registering. The provider has accepted the new key; `hardware_key_record` has not yet
committed. In that gap a sign-in with a removed or unknown key is refused at step 2, lists the provider's
credentials and deletes "every credential whose digest is not live", the new one among them. Then the record
commits. The registry has a live key the provider no longer holds: the key sign-in fails at the provider, and the
password-and-code sign-in is refused because a live row exists (the registry replaced `hasHardwareKey`). The member
is locked out until two administrators remove the keys again.

For an attacker holding a removed key this is one shot (their key is deleted by the same cleaning), so the
deliberate version is a narrow race. The same end state arises with no attacker from any divergence (a provider
credential lost, a restore, a failed best-effort step in the wrong order), and the note gives it no self-repair.

Evidence (verified): the order in `sign-in.ts:672-679` is provider first, then the app's record; the note keeps
that order (section 5, Registration).

Smallest change:
- Step 2 deletes only credentials whose digest is a **removed** row of this account, plus unknown ones the
  provider reports as created more than a few minutes ago. Never an unknown credential younger than a
  registration can take.
- State the divergent case: what the member sees and that it is repaired by a removal (or, better, at the
  password-and-code sign-in: when the provider lists none of the live digests, the event is recorded and paged,
  not silently refused).
- One test in SGN-g: cleaning beside a registration in flight leaves the new key at the provider twin.

### A6. Should fix. The deploy lowers every key-holding account to password and code, without two people

Section: 5 (last paragraph), 9.3 third bullet, 12 item 5.

Keys registered before the registry (and any key registered by the previous image during a rolling deploy or a
rollback) have no row. The note's path for them: the key sign-in is refused and cleaned, or the next
password-and-code sign-in deletes the provider's keys and offers registration. So for every such account, a holder
of the password and the code alone deletes the real keys and registers their own. That is exactly the lowering
that section 0 requires two administrators for, applied to every account at once, and again to any account whose
key was registered through the old image.

The note accepts it because the accounts are staff, test and staging before launch. It does not say that the
founder's and every platform administrator's production account pass through this state, nor for how long.

A stricter path exists inside the design: for an account the registry has never touched (no row, no confirmed
removal), a key sign-in the provider accepted proves the old key; let that sign-in, and only that, lead to the
sealed `register_key` step (the new key is then recorded and the old one cleaned). Password and code alone never
open registration for an account that has a credential at the provider and no registry row; that case goes to a
two-person removal.

Smallest change: either adopt that path in section 5, or state in section 12 item 5 and the deploy runbook that
the deploy is a password-and-code window for every account, give it an end (all platform administrators
re-register in the deploy window, verified by a query on `hardware_key`), and say what the operator does for an
account still without a row afterwards.

### A7. Should fix. A rollback of the image locks every registered key holder out; 9.3 says the rollback has no floor

Section: 4.3 (`user_session_hardware_key`, the no-digest branch), 9.3 ("Rollback floor: none").

The previous image inserts no digest. The trigger then refuses every account with any `hardware_key` row. After
the staff re-register, that is every staff account. The previous image's password-and-code path asks the provider
`hasHardwareKey` (`sign-in.ts:446`), hears yes, and refuses. So during a rollback no platform administrator can
sign in; only sessions already open continue. Failing closed is the right side, but the note states the opposite
consequence ("it loses only the app's own assertion check and the cleaning"), and an incident that needs a
rollback is the moment administrators need to sign in.

Smallest change: 9.3 and `deploy-and-rollback.md` say it plainly: after the first key is recorded, a rollback of
the image refuses every key sign-in for its duration; the rollback floor for sign-in is this release. If that is
not acceptable, the alternative is to say so to the founder, not to widen the no-digest branch.

### A8. Should fix. The app's own assertion check: sound and worth having, but three things can make it refuse an honest person, and the note pins none

Section: 5 step 3; 13 item 1.

Sound (inferred from WebAuthn, with step 1): the signature is checked against the public key of the credential ID
the browser named, over the provider's challenge, so a removed key cannot open a session by naming a live key's
ID whatever the provider matched. With step 1 (`id` equals `rawId`) the check is defence in depth, cheap, and
right to keep. A removed key cannot be registered again (`hardware_key_credential_once` over removed rows), and a
new credential on the same authenticator needs a registration step, which needs the password and the code (A1).

What can wrongly refuse:
1. **Relying-party ID and origin.** The pool's RP ID is `parameters.appDomainName`
   (`infra/lib/platform-stack.ts:117`); the app's is `WEBAUTHN_RP_ID ?? hostname(APP_ORIGIN)`
   (`apps/web/src/lib/server/config.ts:332`). Today only the local twin uses the app's value
   (`dev-provider.ts:247`), so a difference in production has never been exercised. With step 3 a difference
   refuses every honest key sign-in with `assertion` and an error line each. Change: take the expected RP ID from
   the provider's own options kept in the sealed step, or add a deploy check that the two are equal, and a staging
   sign-in before production.
2. **The signature counter.** The library compares the response's counter with the one it is handed. The note
   stores none (the ADR rejects a counter). Say that the check is handed zero and never refuses on the counter;
   otherwise a builder who stores it creates the false refusal the ADR rejected.
3. **User verification.** The pool requires it (`infra/lib/constructs/identity.ts:98`), so "required" agrees
   today (verified). Record that the two must change together.

Also: the challenge the app needs is the WebAuthn challenge from the options. The sealed step today holds the
provider's own handle (`provider.ts:110-112`, `sign-in.ts:625-626`), and `authenticated()` receives neither the
browser's response nor the options (`sign-in.ts:407`, `636-642`). The note says the challenge is "kept in the
sealed pending step"; say that this is a new field and that the response is passed through `after()` for the key
step only.

### A9. Note. A removed key that is tried is an attack signal, and the app cannot tell it from an unknown key

Section: 4.1 (`sign_in_hardware_keys`, `sign_in_key_refused`), 5 step 2.

`sign_in_hardware_keys` returns live keys only, so at step 2 the app cannot know whether the digest is a removed
key or one never seen; it records `not_registered` for both. `removed` is recorded only on the trigger's race
(step 4). A removed key presented with a valid assertion means someone holds it and tried: the operator should
hear, and the note pages nobody. Change: `sign_in_key_refused` takes the digest (stored nowhere, logged nowhere)
and decides `removed` or `not_registered` itself; `removed` gets a `security event` log line with the user's ID
and the request's ID.

### A10. Note. `sign_in_hardware_keys` and `sign_in_key_refused` before a session: no oracle found, one bound to add

Section: 4.1.

Checked: both are reached only in `authenticated()`, after the provider verified a password and code or an
assertion (verified for today's flow at `sign-in.ts:395-396`; the note keeps that). An outsider with no factor
reaches neither. The refusal uses the words of a wrong credential. A holder of the password and code already
learns today whether the account holds a key (`sign-in.ts:445-451`). The functions return a public key and a
digest of a credential ID: not secret, and never returned to the browser by the design. So no enumeration and no
new oracle (the cleaning adds provider calls, a timing difference visible only to someone the provider already
accepted).

Flooding: `sign_in_key_refused` is "once for an account, a reason and a request", so one audit row per attempt.
Only a holder of a credential the provider accepts can cause it, and cleaning removes that credential on the first
try; if the best-effort delete keeps failing, the rows are unbounded. Change: once per account, reason and hour
(or per mark, as `sign_in_step_refused` does at `20261112090000_sign_in_not_before.sql`, the `NOT EXISTS` guard).
State in the note that both functions must stay behind the provider's verification, since the database cannot
enforce it.

### A11. Note. Ending a membership: who can now do what to whom

Section: 2 (End membership moves the mark), 4.3 (`membership_end_marks_account`), 8 cases 1 and 2.

Checked on the code: the only statements that write `membership.ends_at` are `console.ts:782` and
`settings.ts:1102`; the role change (`settings.ts:1061`) updates `role` in place and does not end and re-insert.
No function or worker writes it. So the trigger has the two writers the note names.

Who can cause it (verified from the policies): an administrator of an organization, for that organization's
members; a platform administrator, for anyone, other platform administrators included. A practice administrator
cannot reach a platform administrator: internal and customer memberships exclude each other, and the internal
organization is administered only by platform administrators. Sessions of the whole account are already ended
today (`revoke_user_sessions` sweeps by user, not by organization), so the sign-out everywhere is not new.

What is new:
1. A practice administrator who ends one membership of a person who belongs to several organizations now also
   refuses that person's sign-in in flight. Once per membership: they cannot re-add a person known elsewhere
   (`user_known_elsewhere` in the INSERT policy), and an ended membership never changes, so there is no loop
   against a multi-organization person. For a person in their own organization only, they can loop invite and
   end, which is power they already hold. Acceptable; say it in ADR-N.
2. The refusal is recorded `step_before_reset_*` and logged as `security event: sign-in step refused after a
   password reset` (`sign-in.ts:337`), the line the operator is paged on. Every End membership beside a sign-in
   will now page with words that name the wrong cause. The note keeps the audit names on purpose; the log line's
   words should change to "after the account's mark moved", or the runbook entry for that alarm must say a
   membership's end or a key removal causes it too.
3. ADR 0093 D6's lock now has a new trigger (inferred): a key registration that completes at the provider across
   an End membership is judged `key_registered_across_reset`; if the best-effort removal fails (the outbox's
   sign-out may have ended the grant within the minute), the account is locked and held
   (`sign-in.ts:719-741`), which only a two-person removal clears. So an organization administrator's ordinary act
   can, rarely, put a person's account behind a two-administrator procedure. State it in section 8 case 2.

Forged `membership_ended`: the note's rule (the object is a membership this transaction ended, else raise) closes
it as far as reasoning goes; a non-administrator cannot end a membership (policy), so cannot record the event.
A future end (`ends_at` after now) fires neither trigger and cannot carry the audit row; no route writes one. Sound.

### A12. Note. Confirmation rests on a session that may be twelve hours old

Section: 6 (`hardware_key_removal_confirm`).

A stolen session cookie of one administrator is half of a removal, and a second stolen cookie is the other half.
Neither needs a key touch. Inferred, not a hole in the ruled design; the stricter option is cheap: the confirm
route (and, where the session's ID is known to Postgres, the function) requires the actor's session to have begun
within a few minutes, that is a fresh key sign-in, and the screen says so. Recommend adding it to section 6 and
SGN-e, or recording why not.

### A13. Note. Lines and messages: three places where more than IDs and codes could slip in

Section: 5 steps 2 and 3, 7.

1. Step 3's library errors carry values in their messages (the origin seen, the expected one, and similar). The
   error line must carry `error_code` only, never the message. Say so, and add the assertion to JOB-c's kind of
   test for the web's lines.
2. "Logged by IDs" for the cleaning: name the fields (`user_id`, `request_id`, a count). Section 4.5 says no
   record carries a credential ID; the same must hold for this line, and for the digest.
3. The notice goes to the address read at claim time. The account itself may update its own `"user".email` under
   the UPDATE policy and column grant (`20261015140000_tenancy.sql:509-511`, `599`), as may any platform
   administrator. No web route does today (verified by search). If one is ever added, a thief in the account can
   redirect the removal notice. Record it beside the notice in ADR-N.

## Checked and found sound

- **A removed key racing the confirmation.** The confirmation and a session's insert take the same account row
  lock; the existing trigger already does (`20261112090000_sign_in_not_before.sql`,
  `user_session_sign_in_not_before`, `FOR NO KEY UPDATE`), and the mark alone refuses a sign-in begun before the
  confirmation. Two independent refusals, as section 8 case 4 says.
- **A removed key naming a live key's ID.** Refused by step 3, given step 1 (A8).
- **Registering a removed credential again, on this or another account.** Refused by the unique digest over
  removed rows; a fresh credential needs a registration step, hence the password and code (A1 is that case).
- **The grant from a refused key sign-in.** It stays on the server and is given back; the app client has a secret
  (`sign-in.ts:275-285`, ADR 0088 D2), so the holder of a removed key cannot call the provider around the app
  (inferred from the client-credential handling, not from the pool's configuration).
- **A crossed account.** Still judged and refused before any of the new steps (`sign-in.ts:428-443`).
- **No live session on a removed key.** Every session ends in the confirming transaction; `resolve_session` needs
  no key lookup. Agreed.
- **One administrator through a second internal organization, a self-granted membership, a re-dated membership.**
  All refused in the database (A2, "Sound here").
- **Requester confirming, the account requesting, confirming or cancelling.** Function checks plus table
  constraints; nothing found.
- **A non-administrator causing the mark, the sweep or a sign-out for someone else.** Only by ending a membership
  they administer (A11); not by a forged event.
- **The hold of ADR 0093 D6.** Cleared only by a confirmed removal; `unlock_user` still refuses until then
  (`20261112090000_sign_in_not_before.sql`, `user_key_across_reset_hold`). An unrecorded key left at the provider
  opens nothing on the new image and nothing on the old one once a confirmed removal exists.
- **Not counting a failure for a refused key.** Right: a count would let a removed key's holder lock the account.

## Not examined

`sessions.ts` (`openSession`, `resolveSession`) beyond what `sign-in.ts` shows; `cognito-provider.ts`; ADR 0093
and 0094 texts (read through the code and the note's citations only); the user pool's client configuration; the
`roles_permit` table (which internal roles hold `organization.manage`).

## Verdict

The core of the design holds: the registry decides which keys count, the decision is made under the account's
lock, the confirmation ends every session, and no path was found by which a removed key, alone, opens a session
or by which one administrator account, alone, confirms a removal through the functions. The weaknesses are at the
edges the note treats as settled. The largest is what a removal leaves behind: an account open to its password
and code with no control on who registers next (A1), and the same state reached with no second person at the
deploy and after any registration through the old image (A6). A1 should be closed in the note before the build
starts. Then the two-person rule needs its age rule pinned to time in the role, and the requester's re-check made
equal to the actor's (A2, A3); the target's ability to void its own removal needs an answer (A4); the cleaning
step must not delete a key younger than a registration (A5); and the rollback's real effect on sign-in must be
stated (A7). The rest are statements and tests to add. None of the findings reopens a ruled item.
