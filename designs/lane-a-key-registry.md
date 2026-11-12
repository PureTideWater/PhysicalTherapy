# Design: the hardware-key registry, two-person key removal, the provider sign-out outbox, and the mark at End membership

W31 (Lane A), 2026-11-12. `LANES.md` Queues item 37, **required before launch**; the next schema PR after #156.
Base read: `claude/build-platform` 93e137f9. Sources: W22's design (`designs/lane-b-operator-removes-keys.md`, Part A
and section 2b), ADR 0091, 0093 and 0094, migrations 20261111090000 and 20261112090000, `apps/web/src/lib/auth`,
`apps/web/src/lib/routes/console.ts` and `settings.ts`, `apps/worker/src/platform/password-notices.ts`.
**Status: v1, before its two reviews.** Nothing is built. A fresh session builds from this file alone.

Numbers still to be allocated by the orchestrator (asked 2026-11-12): the ADR (written here as **ADR-N**) and the
test-matrix rows (written here as **SGN-a to SGN-h**, **SEC-a to SEC-c**, **JOB-a to JOB-c**).

## 0. The rules already ruled (not reopened here)

Platform administrators only. Two people for every removal, within 24 hours, neither of them the account. Every key of
the account is removed, never one. The confirmation ends the account's sessions, moves `sign_in_not_before` and queues
a notice without PHI. No job payload, URL, log line or error message carries anything but IDs and codes. The provider
sign-out's retry is option Y: an outbox row written by `membership_ended`'s trigger, claimed by a scheduled platform job.

## 1. What is true today (each read on the base)

1. **The provider cannot list or remove a key for an administrator.** Only the member's own access token can. So
   "removed" must be decided by the app, in Postgres.
2. **The app stores no credential.** `hardware_key_registered` is an audit row with the user's ID. A key sign-in opens
   a session for whatever credential the provider accepted (`sign-in.ts`, `completeKey` to `authenticated` to
   `openSession`).
3. **A session is refused in Postgres only by the mark.** `user_session_sign_in_not_before` (BEFORE INSERT, under the
   account's row lock, `FOR NO KEY UPDATE`) refuses a start at or before `"user".sign_in_not_before`. Only a recorded
   reset moves the mark (`audit_event_sign_in_not_before`).
4. **End membership** (`console.end_membership`, `settings.users.end_membership`): `UPDATE membership SET ends_at =
   now()`, then `revoke_user_sessions`, then the wrapper's `membership_ended` audit row (object type `membership`,
   object ID the membership), one transaction; the provider is asked once after the commit and never again. It takes
   session rows before the account's row and never takes the account's row, so a sign-in that commits beside it keeps
   its session (ADR 0094, Recorded 1), and SGN-19's two in-flight cases stay open.
5. **Every request** resolves its session in one statement, `resolve_session(token)`, which reads `user_session`,
   `"user"` and `user_device`. Since #149 the path costs three round trips (Queues item 36).
6. **The outbox pattern exists** (ADR 0091): a table with forced row-level security and an owner-only policy, written
   by an AFTER INSERT trigger on `audit_event`, drained every minute by a platform job as `tp_operator` through
   definer functions, payload empty.

## 2. The design in one page

- **`hardware_key`**: one row for each key the app saw registered: the account, the SHA-256 of the credential ID, the
  key's public key, when, and (once removed) by which removal. A key is **live** when its row has no `removed_at`.
- **A key sign-in opens a session only for a live key, decided twice.** The app checks the browser's assertion
  against the row's public key itself (it does not rest on which credential the provider matched). Then the
  session's INSERT carries the credential digest, and a trigger on `user_session` refuses it, under the account's row
  lock, unless that digest is a live key of that account. The second check is the one that cannot be raced.
- **Removal is a row change, never a provider call**, so it cannot fail with the provider. `hardware_key_removal`
  holds the request and its confirmation; three definer functions are the only writers; every rule of section 0 is a
  check in those functions **and** a table constraint.
- **The confirmation, in one transaction under the account's row lock:** every live key of the account marked
  removed; the mark moved; every session ended; ADR 0093 D6's hold cleared where one stands; one notice row and one
  provider sign-out row queued; one audit row.
- **The provider is cleaned by the member's own grant at first use.** A removed or unknown key that signs in is
  refused and that sign-in's grant deletes every credential at the provider that has no live row. An account that
  must hold a key and has no live row has the provider's leftovers deleted the same way at its next
  password-and-code sign-in, then registers a new key.
- **`provider_sign_out`**: the outbox. One row for each `membership_ended`, each recorded reset and each confirmed
  removal, written in that event's own transaction; a platform job asks the provider and retries for 24 hours. The
  web stops calling the provider for these.
- **End membership moves the mark.** A trigger on `membership` (the fact itself, so every writer is covered) takes the
  account's row lock, moves the mark and ends the sessions, right after the UPDATE that ends the membership. SGN-19's
  two cases and ADR 0094's Recorded 1 close.
- **Per request: nothing added.** `resolve_session` is not touched (section 5).

## 3. Tables

All four are **platform-scoped: no `practice_id`**. Why that is right and safe, once for all four:

- They describe an **account**, and an account belongs to no practice: `"user"`, `user_session`, `user_device` and
  `password_notice` are platform-scoped for the same reason (a person can hold memberships in several organizations).
  A `practice_id` here would be a guess.
- They hold **no PHI and no contact detail**: account IDs, a digest of a credential ID, a public key (public by
  definition), timestamps, counters and short codes matched by a pattern. The address a notice goes to is read by the
  claim at send time and stored nowhere here.
- They are **closed to both runtime roles at the table**: `ENABLE` and `FORCE ROW LEVEL SECURITY`, one policy
  `<table>_owner FOR ALL TO tp_owner USING (true) WITH CHECK (true)`, `REVOKE ALL ... FROM PUBLIC, tp_app,
  tp_operator`. No policy names `tp_app` or `tp_operator`, so even a stray grant would show them nothing. Every read
  and write goes through a SECURITY DEFINER function that checks the actor itself (section 4). The app role owns
  nothing and cannot bypass.
- The catalog test lists each as a global table with no application privilege; the cross-tenant test proves that an
  actor of one practice, of another, a platform administrator through plain SQL, and the operator role each read
  zero rows and can write none (section 10).

### 3.1 `hardware_key`

| Column | Type | Rule |
| --- | --- | --- |
| `id` | uuid | primary key, `gen_random_uuid()` |
| `user_id` | uuid not null | `REFERENCES "user" (id)` |
| `credential_sha256` | bytea not null | `octet_length = 32`; **`UNIQUE`** (`hardware_key_credential_once`), over removed rows too: a removed credential is never registered again, on any account |
| `public_key` | bytea not null | the COSE key as the registration gave it; `octet_length BETWEEN 32 AND 1024` |
| `registered_at` | timestamptz not null | `clock_timestamp()` in the function |
| `registered_request_id` | text | the request's ID |
| `removed_at` | timestamptz | null while live |
| `removal_id` | uuid | `REFERENCES hardware_key_removal (id)`; `CHECK ((removed_at IS NULL) = (removal_id IS NULL))` |

Index `hardware_key_live ON (user_id) WHERE removed_at IS NULL`. Trigger `hardware_key_removal_is_final` (BEFORE
UPDATE OR DELETE): refuses a delete, a change of any column but `removed_at` and `removal_id`, and any change of
those once set (the pattern of `user_session_end_is_final`). At most 10 live keys an account (checked in
`hardware_key_record` under the account's lock).

The digest, not the credential ID: nothing reads the ID back, and a digest in a session row or a dump names no
authenticator.

### 3.2 `hardware_key_removal`

| Column | Type | Rule |
| --- | --- | --- |
| `id` | uuid | primary key |
| `user_id` | uuid not null | the account whose keys go; `REFERENCES "user" (id)` |
| `requested_by` | uuid not null | `REFERENCES "user" (id)`; `CHECK (requested_by <> user_id)` |
| `requested_at` | timestamptz not null | `clock_timestamp()` |
| `expires_at` | timestamptz not null | `CHECK (expires_at = requested_at + interval '24 hours')` |
| `request_id` | text | the requesting request's ID |
| `state` | text not null | `requested`, `confirmed`, `cancelled`, `expired` |
| `decided_by` | uuid | `REFERENCES "user" (id)`; `CHECK (decided_by <> user_id)` |
| `decided_at` | timestamptz | |
| `decided_request_id` | text | |
| `keys_removed`, `sessions_ended` | integer | set at confirmation, for the record |

Constraints, each named so a refusal can be mapped to words:

- `hardware_key_removal_two_people`: `state <> 'confirmed' OR (decided_by IS NOT NULL AND decided_by <> requested_by)`.
- `hardware_key_removal_in_time`: `state <> 'confirmed' OR decided_at < expires_at`.
- `hardware_key_removal_decided`: `(state = 'requested') = (decided_at IS NULL)`; `expired` has no `decided_by` and
  `decided_at >= expires_at`; `cancelled` and `confirmed` have one.
- `hardware_key_removal_open_once`: unique index `ON (user_id) WHERE state = 'requested'`.
- Trigger `hardware_key_removal_is_final`: no delete; only `requested` changes, once.

### 3.3 `hardware_key_notice` (the member's email, ADR 0091's shape)

`id`; `user_id`; `removal_id uuid NOT NULL UNIQUE` (`hardware_key_notice_once`); `removed_at`; `state` (`pending`,
`sent`, `delivered`, `undelivered`, `failed`); `attempts smallint` 0 to 5; `next_attempt_at`; `ses_message_id` (unique,
pattern); `error_code` (pattern `^[A-Za-z]{1,64}$`); `sent_at`; `undelivered_reported_at`; `expires_at` (`removed_at`
plus 90 days, a range check); `updated_at`. The same four consistency checks as `password_notice`, renamed. Index on
`(next_attempt_at) WHERE state = 'pending'`.

### 3.4 `provider_sign_out` (the outbox)

| Column | Type | Rule |
| --- | --- | --- |
| `id` | uuid | primary key |
| `user_id` | uuid not null | `REFERENCES "user" (id)` |
| `reason` | text not null | `membership_ended`, `password_reset_completed`, `password_reset_outcome_unknown`, `hardware_keys_removed` |
| `source_event_id` | uuid not null | the audit row that caused it; **`UNIQUE`** (`provider_sign_out_once`) |
| `request_id` | text | the causing request's ID, for the operator's trace |
| `queued_at` | timestamptz not null | the event's `at` |
| `attempts` | smallint not null default 0 | 0 to 30 |
| `next_attempt_at` | timestamptz not null | default `queued_at` |
| `leased_until` | timestamptz | a claim's lease |
| `done_at`, `gave_up_at`, `late_reported_at` | timestamptz | `CHECK (done_at IS NULL OR gave_up_at IS NULL)` |
| `last_error_code` | text | `^[A-Za-z][A-Za-z0-9]{0,63}$` (ADR 0094 D8's rule, in the database) |

Index `provider_sign_out_due ON (next_attempt_at) WHERE done_at IS NULL AND gave_up_at IS NULL`. No subject and no
address is stored: the claim reads `cognito_sub` when it hands the row to the job.

**Queues item 32, in one line (the plan asked):** the provider retry is **not** a kind of item 32's queue outbox.
That table relays practice jobs into pg-boss with their payloads and practice scope; this one is drained in place by a
platform job, has no payload and no practice. They stay apart.

### 3.5 Columns and constraints on existing tables

- `user_session.key_credential_sha256 bytea` (nullable, no default: catalog only) with
  `user_session_key_digest CHECK (key_credential_sha256 IS NULL OR (mfa_method = 'webauthn' AND
  octet_length(key_credential_sha256) = 32))`, added `NOT VALID` and validated in the second file (section 9).
  `GRANT INSERT (key_credential_sha256) ON user_session TO tp_app`.
- `mail_send_kind` and `mail_send_stream_kind` gain the kind `hardware_keys_removed` (the transactional stream),
  replaced `NOT VALID` and validated in the second file.
- `"user"`: no new column. The mark is reused.

## 4. Functions, triggers and grants

Every function: schema `public`; owner `tp_owner`; `SET search_path = pg_catalog, public, pg_temp`; `REVOKE ALL ...
FROM PUBLIC`; `#variable_conflict use_variable` where it has parameters; no dynamic SQL; none sets `app.practice_ids`
or `app.actor_id`; none is `LEAKPROOF`. All but the two readers are VOLATILE. Each that takes the account's row takes
it **first**, `FOR NO KEY UPDATE`, before any key, removal, session or outbox row (ADR 0093 D2's order). Each that
judges time refuses outside READ COMMITTED, as ADR 0093's functions do, and reads `clock_timestamp()`.

"Platform administrator" below is one helper, `app_actor_removes_keys()` (STABLE, definer, no grant: called only by
the functions here): `app_actor_id() IS NOT NULL AND app_actor_is_platform_admin() AND
app_actor_platform_permitted('organization.manage')`, plus the age rule of founder question Q1 if he says yes. A
second helper, `user_removes_keys(uuid)`, answers the same for a named account from `membership` and `organization`
directly (live `platform_admin` membership in an `internal` organization), for checking the requester at confirmation.

### 4.1 For the web (`GRANT EXECUTE ... TO tp_app`)

| Function | What it does and refuses |
| --- | --- |
| `hardware_key_record(credential_sha256 bytea, public_key bytea, began timestamptz, request text) RETURNS uuid` | The acting account records its own new key (it takes no account argument). Locks the account. Refuses a start at or before the mark or ahead of the clock (constraint name `hardware_key_sign_in_not_before`), an eleventh live key, a digest already known (`hardware_key_credential_once`). Inserts the row and the audit row `hardware_key_registered` (actor the account). The row and its audit row exist together or not at all. |
| `sign_in_hardware_keys(target_user uuid) RETURNS TABLE (credential_sha256 bytea, public_key bytea)` | STABLE. The account's live keys. Read once in a key sign-in and once in a password-and-code sign-in of an account that must hold a key. Like `sign_in_account`, it is open to the app role before a session exists; it returns nothing secret. |
| `sign_in_key_refused(target_user uuid, why text, request text) RETURNS void` | Records one `security_event` for the account with purpose `key_refused_<why>`; `why` is a closed list (`not_registered`, `removed`, `assertion`, `malformed`). It counts no failed sign-in: a count would let the holder of a removed key lock the account. Once for an account, a reason and a request. |
| `hardware_key_removal_request(target_user uuid, request text) RETURNS uuid` | Section 6. |
| `hardware_key_removal_confirm(removal uuid, request text) RETURNS TABLE (keys_removed integer, sessions_ended integer)` | Section 6. |
| `hardware_key_removal_cancel(removal uuid, request text) RETURNS boolean` | Section 6. |
| `hardware_key_removals() RETURNS TABLE (removal_id, user_id, requested_by, requested_at, expires_at, state, decided_by, decided_at, live_keys)` | STABLE. For a platform administrator only: open requests and those decided in the last 30 days. IDs and times only; the console joins names through its own policies. |

### 4.2 For the platform job (`GRANT EXECUTE ... TO tp_operator`)

| Function | What it does |
| --- | --- |
| `operator_provider_sign_outs_claim(at_most integer) RETURNS TABLE (sign_out_id uuid, user_id uuid, cognito_sub text, attempts smallint)` | Section 7. The only reader of the subject. |
| `operator_provider_sign_out_done(sign_out uuid, outcome text, request text) RETURNS boolean` | Marks done once and writes `provider_signed_out` (actor kind `system`, object the user, purpose the row's reason). |
| `operator_provider_sign_out_failed(sign_out uuid, error_name text, request text) RETURNS text` | Records the try; answers `retry`, `late` (once a row, at the fourth failed try) or `gave_up` (writes `provider_sign_out_undelivered`). |
| `operator_provider_sign_outs_expire(at_most integer) RETURNS integer` | Deletes rows done more than 90 days ago. Never an undone row. |
| `operator_key_removals_expire(at_most integer, request text) RETURNS TABLE (removal_id uuid, user_id uuid)` | Marks requests past 24 hours `expired` and writes `hardware_key_removal_expired`. |
| `operator_key_notices_due`, `_claim`, `_sent`, `_failed`, `_stale` | ADR 0091's five, for `hardware_key_notice`, the same bodies with the table and the kind changed. `_claim` is the only reader of the address. |
| `operator_record_mail_event(...)` (replaced in place) | One branch added: a delivery, bounce, suppression or rejection of a `hardware_keys_removed` message moves its notice as it moves a password notice. Signature, owner and grant unchanged; the preflight compares the stored body's SHA-256 with the base's before replacing it. |

### 4.3 Trigger functions (definer, granted to no role)

| Trigger | On | Does |
| --- | --- | --- |
| `user_session_hardware_key` | `user_session` BEFORE INSERT `WHEN (NEW.mfa_method = 'webauthn')` | Locks the account's row. With a digest: refuses unless a live `hardware_key` of `NEW.user_id` has it (`check_violation`, constraint name `user_session_hardware_key_live`). **Without a digest** (the previous image's insert during a rolling deploy or a rollback): refuses if the account has any `hardware_key` row or any confirmed removal; otherwise lets it through, as today. So an account the registry has touched is never opened by an insert that skips it. It fires before `user_session_sign_in_not_before` (name order); both take the same lock. |
| `membership_end_marks_account` | `membership` AFTER UPDATE OF `ends_at` `WHEN (NEW.ends_at IS NOT NULL AND NEW.ends_at <= now() AND (OLD.ends_at IS NULL OR OLD.ends_at > now()))` | Refuses outside READ COMMITTED. `UPDATE "user" SET sign_in_not_before = GREATEST(sign_in_not_before, clock_timestamp())` for the membership's user (this takes the account's row), then ends every open session of the account (`revoked`). The route's own `revoke_user_sessions` call then finds none; it stays, harmless. |
| `audit_event_provider_sign_out` | `audit_event` AFTER INSERT `WHEN (NEW.action IN ('membership_ended', 'password_reset_completed', 'password_reset_outcome_unknown'))` | Writes one `provider_sign_out` row, `ON CONFLICT ON CONSTRAINT provider_sign_out_once DO NOTHING`. For a reset: under ADR 0091 D3's guard (the actor is a person recording their own account), user the actor. For `membership_ended`: the object must be a membership **this transaction ended** (`object_type = 'membership'` and a row with that ID whose `ends_at = now()`, the transaction's own timestamp, which both routes write); the user is that membership's. Otherwise it **raises** (`check_violation`, `membership_ended_is_recorded_by_the_end`): no one records `membership_ended` for a membership they did not just end, so the event cannot be forged to queue a sign-out for someone else, and a future route that ends a membership another way fails its first test instead of silently queuing nothing. |

Why the mark moves on `membership` and the outbox row on `audit_event`: the mark and the sweep must hold whoever ends
a membership, and must take the account's row before any session row (the route sweeps sessions before it writes its
audit row, which is the wrong order for ADR 0093 D2 and would deadlock against a reset of the same account). The
outbox row needs the request's ID and is what the orchestrator ruled: `membership_ended`'s trigger.

A membership that lapses by a future `ends_at` fires nothing (no statement runs at that moment). No route writes a
future end today (both write `now()`); recorded for the queue, not built.

### 4.4 The reserved audit actions

`audit_event_record` (the application role's INSERT policy) is dropped and recreated as the base has it, with these
added to its refused list, since only the functions above write them: `hardware_key_removal_requested`,
`hardware_key_removal_confirmed`, `hardware_key_removal_cancelled`, `hardware_key_removal_expired`,
`hardware_key_notice_sent`, `hardware_key_notice_undelivered`, `provider_signed_out`,
`provider_sign_out_undelivered`. **Not reserved in this PR: `hardware_key_registered`.** The previous image writes it
directly, and reserving it would break that image's registration during the deploy. It is reserved by the contract
migration (section 9.4). Until then the registry row, not the audit row, is what makes a key live.

### 4.5 Audit events

| Action | Actor | Object | Written by |
| --- | --- | --- | --- |
| `hardware_key_registered` | the account | user | `hardware_key_record` |
| `hardware_key_removal_requested` | the requester | user (the account) | `hardware_key_removal_request` |
| `hardware_key_removal_confirmed` | the confirmer | user | `hardware_key_removal_confirm` |
| `hardware_key_removal_cancelled` | who cancelled | user | `hardware_key_removal_cancel` |
| `hardware_key_removal_expired` | system | user | `operator_key_removals_expire` |
| `security_event`, purpose `key_across_reset_cleared` | system | user | `hardware_key_removal_confirm`, when a hold stands |
| `security_event`, purpose `key_refused_<why>` | system | user | `sign_in_key_refused` |
| `hardware_key_notice_sent`, `hardware_key_notice_undelivered` | system | user | the notice functions |
| `provider_signed_out`, `provider_sign_out_undelivered` | system | user | the outbox functions |

Each carries the request's or the job's ID. None carries a name, an address, a credential ID or a provider subject.

## 5. The session-open check, and its cost

**Per request: zero added statements, zero added reads.** `resolve_session` is not replaced. A session never needs
its key looked up again, because the confirmation ends every session of the account in the transaction that removes
the keys, under the same account lock a session's insert takes: there is no moment at which a live session rests on a
removed key. A database test states that invariant over the interleavings (section 10, SGN-c). So Queues item 36
folds the path's three round trips with nothing of this item in its way.

**At a key sign-in (once a session, at most every 12 hours): one added read**, `sign_in_hardware_keys`, a lookup by
the partial index. The registry check itself adds no round trip: it rides the session's INSERT, in the trigger.

**At a password-and-code sign-in of an account that must hold a key:** the same one read replaces the provider call
`hasHardwareKey` as the answer to "does this account hold a key", so this path loses a network call.

The key sign-in, in order (`authenticated`, after the provider verified the assertion; ADR 0093 D5 stands):

1. The response must be well formed: `id` equals `rawId`, canonical base64url, 16 to 1,023 bytes. Otherwise refused
   (`malformed`).
2. `sign_in_hardware_keys(account)`. The digest of the credential ID must be among them. Otherwise: refused with the
   words of a wrong credential, `sign_in_key_refused` (`not_registered`), and the grant deletes at the provider every
   credential whose digest is not live (list with the grant, delete each; best effort; logged by IDs), then is given
   back.
3. **The app verifies the assertion itself** against the row's public key (`@simplewebauthn/server`, already a
   dependency): the challenge is the one the provider's options carried, kept in the sealed pending step; the origin
   and relying-party ID are the app's configuration; user verification required. A failure is refused (`assertion`)
   and logged at error: the provider accepted something the registry's key did not sign. Why this step: the app
   reads the credential ID from the browser's JSON, the provider matched a credential by its own reading, and this
   machine cannot read the provider's documentation to prove the two always agree. With the check, a removed key
   that is still at the provider cannot open a session by naming a live key's ID, whatever the provider matched.
4. `openSession` with the digest. The trigger refuses under the lock if a removal landed since step 2
   (`user_session_hardware_key_live`); the flow answers as for a stale session and records `removed`.

Registration (`completeKeyRegistration` to `keyRegistered`): after the provider registered the key, the app verifies
the registration response itself to read the public key (same library, the challenge from the provider's options),
then `hardware_key_record`. If the app's own verification or the record fails, the key is removed at the provider with
the grant (best effort), the person is told to try again, and an error line with IDs is logged; a key that stays at
the provider has no row and so opens nothing. ADR 0093 D6's lock for a key registered across a reset stays as it is in
this PR (it is now a second barrier, since such a key is never recorded); dropping it is recorded for the queue.

Keys registered before the registry have no row. Before launch those are test and staging accounts: their next key
sign-in is refused and cleaned, and they register again (said in the PR and the deploy runbook).

## 6. The two-person rule, in Postgres

The handler checks `organization.manage` (a `platformRoute`, a Zod schema, the practice-scoped transaction with no
practice). The functions check everything again; the table's constraints hold what the functions decided.

**`hardware_key_removal_request(target_user, request)`**

1. `app_actor_removes_keys()`, or `insufficient_privilege`.
2. `target_user <> app_actor_id()`, or `check_violation` (`hardware_key_removal_not_own_account`).
3. Lock the target's account row (not found: `no_data_found`, answered as not found).
4. A request of this account already past 24 hours is marked `expired` here (with its audit row), so step 5 is exact.
5. Insert, `state = 'requested'`. A second open request for the account fails on `hardware_key_removal_open_once`.
6. Audit `hardware_key_removal_requested`. Nothing else changes: no key, no session, no notice.

**`hardware_key_removal_confirm(removal, request)`**

1. `app_actor_removes_keys()`.
2. Read the removal's `user_id` (no lock), lock that **account's** row, then lock the removal row `FOR UPDATE` and
   read it again. It must be `requested`.
3. `app_actor_id() <> requested_by` (`hardware_key_removal_two_people`: "ask another platform administrator to
   confirm this removal") and `app_actor_id() <> user_id` (`hardware_key_removal_not_own_account`).
4. `clock_timestamp() < expires_at` (`hardware_key_removal_in_time`: "this request has expired; ask again").
5. The requester is **still** a platform administrator (`user_removes_keys(requested_by)`): a request made by an
   account that has since lost the role is void (`hardware_key_removal_requester_left`).
6. Then, all in this transaction:
   - `UPDATE hardware_key SET removed_at = clock_timestamp(), removal_id = ...` for every live key of the account;
   - the mark: `sign_in_not_before = GREATEST(sign_in_not_before, clock_timestamp())`;
   - every open session of the account ended (`revoked`);
   - where ADR 0093 D6's hold stands (an `account_locked_key_across_reset` with no later `key_across_reset_cleared`),
     the `key_across_reset_cleared` security event, so `unlock_user` then works; the account is **not** unlocked here;
   - the removal row: `confirmed`, `decided_by`, `decided_at`, the two counts;
   - the audit row `hardware_key_removal_confirmed`;
   - one `hardware_key_notice` row and one `provider_sign_out` row (`hardware_keys_removed`, `source_event_id` the
     audit row's ID).
   An account with no live key is still confirmed: the mark, the sessions, the hold and the provider's leftovers are
   the point for an account whose keys predate the registry.

**`hardware_key_removal_cancel(removal, request)`**: a platform administrator who is not the account (the requester
may cancel their own). `requested` to `cancelled`, audit row. The account itself cannot cancel: a thief in the account
must not be able to stop its removal.

**What Postgres holds, restated:** who (the helper, on the live memberships, at both steps, the requester re-checked);
24 hours (the function on the database's clock, and `hardware_key_removal_in_time`); the account excluded from all
three acts (function and two CHECKs); the drafter never confirming (function and `hardware_key_removal_two_people`);
all keys, never one (the only statement that removes a key names the account, not a key).

**What two accounts cannot prove:** that they are two people. Founder question Q1 (section 12) closes the cheapest way
around it: one administrator creating a second administrator account and confirming with it.

**The web:** three routes on the console's organization page (`console.request_key_removal`,
`console.confirm_key_removal`, `console.cancel_key_removal`), each `phi: false`, `organization.manage`, input the
account's or the removal's opaque ID only. Their audit rows are the functions' (reserved actions), so the wrapper must
not write a second one: use the wrapper's database-written-audit mode if `route.ts` has one, else add one, with a
route test that exactly one event exists for each act. The confirm screen shows who asked, when, and for which
account, and says what happens. Settings gets no key action. Refusals map from constraint names to the three
sentences of W22's design. The ux-brand-reviewer reads the screens and the email at build.

## 7. The outbox and its job

**What writes a row:** `audit_event_provider_sign_out` (section 4.3) for `membership_ended`, `password_reset_completed`
and `password_reset_outcome_unknown`; `hardware_key_removal_confirm` for `hardware_keys_removed`. Each in the causing
transaction: a row exists if and only if the cause committed. One row for each audit event (`provider_sign_out_once`).

**The job:** platform job `provider_sign_outs`, schedule `* * * * *`, payload `z.strictObject({})`, as `tp_operator`
with no practice in scope. Its singleton is the schedule's own (one queued run for each minute's slot, as every
platform job); two runs that overlap are safe by the claim. In one run, in order: `operator_key_removals_expire`;
`operator_provider_sign_outs_expire`; then claims and calls for at most 8 seconds of provider time (the notices'
budget), the rest left due.

**Claim** (`operator_provider_sign_outs_claim`, one short transaction): rows that are undone, not given up, due
(`next_attempt_at <= now()`), with no lease or a lapsed one, ordered by `next_attempt_at, id`, `FOR UPDATE SKIP
LOCKED`, at most `at_most`; each gets `attempts = attempts + 1` and `leased_until = now() + interval '2 minutes'`, and
is returned with the account's `cognito_sub`. The try is counted **at the claim**, so a row that kills the worker
still runs out of tries. No transaction is open while the provider is called.

**Call:** the worker's own adapter, `AdminUserGlobalSignOut` with a 10 second abort (ADR 0094 D7). The subject lives
in memory for the call and appears in no log, payload or error.

**Outcome** (one short transaction each):

- Success, or the provider's "no such user": `operator_provider_sign_out_done` (`done_at`, `leased_until` cleared,
  audit `provider_signed_out` once, guarded by `done_at IS NULL`).
- Failure: `operator_provider_sign_out_failed`: the error's name if it matches the pattern, else `unknown`;
  `next_attempt_at` after 1, 5, 15 and 60 minutes, then every 60. Answers `late` once, at the fourth failed try
  (about 21 minutes in), and `gave_up` when `queued_at` is 24 hours old or `attempts` reaches 30 (`gave_up_at`, audit
  `provider_sign_out_undelivered`).

**Logs and paging.** Each failed try: one line at warn, `provider sign-out attempt failed` (`sign_out_id`, `user_id`,
`request_id` of the cause, `error_code`). `late` and `gave_up`: one line at **error**, `security event: provider
sign-out not delivered` with `error_code` `LATE` or `GAVE_UP`; the alarm `ProviderSignOutNotDelivered` counts those
words (at least 1 in 300 s, the operator topic). It replaces `MembershipEndProviderSignOutFailed` and
`PasswordResetProviderSignOutFailed`, whose lines the web no longer writes. If the job itself does not run, nothing
logs: the build confirms that the platform schedule's missed-run alarm covers this job, and adds it to that alarm's
list if the list is by name.

**What is idempotent.** The provider's global sign-out (a second one ends tokens already ended; the app's own sessions
are not the provider's). `done` and `failed` act only on an undone row. The trigger's insert (`ON CONFLICT DO
NOTHING`). So the effect, "the provider was asked at least once after the cause committed, and the record says so
once", holds under any repetition; the call itself is at-least-once by design.

**What a crash leaves, point by point:**

| Crash | Leaves | Then |
| --- | --- | --- |
| The web, before the cause commits | no row, no cause | nothing to do |
| The web, after the commit (ADR 0094's open case) | the row | the next run asks; closed |
| The job, before the claim commits | rows unchanged | the next run claims |
| After the claim, before the call | a try counted, a lease | the lease lapses in 2 minutes; claimed again |
| After the provider answered, before `done` | the same | asked again (harmless), then `done` |
| During `done` or `failed` | rolled back; as the row above | the same |
| The provider down for a day | `late` paged at about 21 minutes, `gave_up` at 24 hours | the runbook: the app's state has held since the commit; the operator confirms by the IDs |
| The database down | nothing changes anywhere | the job fails and runs again |

**The web's change:** both End membership routes and the reset stop calling the provider after their commit
(`signOutAtProviderAfterCommit` and the reset's call go). The provider is asked within about a minute instead of at
once. What that minute leaves open is only what the provider's own tokens can do, and the two things that mattered
(a code step and a key registration in flight) are now refused by the mark, in the app, at the commit. In exchange
the page no longer waits on the provider and the lost-commit and stopped-task cases (ADR 0094 D6 and its
Consequences) need no special handling. The worker gains the adapter (the shared task role already holds the action;
the local twin does nothing), the pool's ID in its environment, and the role test's scan.

**The notice job** (`hardware_key_notices`, every minute): `password-notices.ts` with the table, the kind and the
template changed. The words: the hardware keys on this account were removed by PaidWhole at a time; the next sign-in
asks for the password and the code and then registers a new key; write to support if this was not expected. No name,
practice or PHI.

## 8. The in-flight cases

SGN-19's two pinned tests change from "still opens" to the refusal SGN-17 states; the rest are new.

| # | In flight when | Outcome after this item | Held by |
| --- | --- | --- | --- |
| 1 | A code step begun before **End membership** (SGN-19, test 1) | refused (`expired`); `step_before_reset_mfa` recorded; no session | the mark, moved by `membership_end_marks_account` |
| 2 | A key-registration step begun before **End membership** (SGN-19, test 2) | refused before the provider is asked, the grant given back; if the provider registered it anyway, `hardware_key_record` refuses, the key is removed with the grant, and it has no row, so it opens nothing | the mark, in `sign_in_step_refused` and `hardware_key_record` |
| 3 | A sign-in whose transaction commits beside End membership (ADR 0094, Recorded 1) | whichever takes the account's row first: the session commits and is swept, or the end commits and the insert is refused | the account lock; the sweep is a new statement at READ COMMITTED |
| 4 | A key sign-in begun before a **removal's confirmation** | refused by the mark and, independently, by the registry | both triggers on `user_session` |
| 5 | A password-and-code step begun before a confirmation | refused (the mark) | as case 1 |
| 6 | A key registration begun before a confirmation, finished after | not recorded, removed at the provider with the grant; opens nothing | `hardware_key_record` |
| 7 | A key sign-in that passed the app's read, then a confirmation commits, then the insert | refused under the lock (`user_session_hardware_key_live`) | the trigger |
| 8 | A session resolving while the confirmation runs | the confirmation ends it; the request in flight finishes, the next is refused | `resolve_session`'s row lock, then the sweep |
| 9 | Two administrators confirming at once; confirm against cancel; confirm against expiry | one wins on the removal's row lock; the other finds it decided and is refused | the row lock and `hardware_key_removal_is_final` |
| 10 | A reset recorded beside End membership or a confirmation, same account | serialized on the account's row; both effects land; the mark only moves forward | ADR 0093 D2's order, now kept by all three |
| 11 | A removed key signs in after the member registered a new one | refused at step 2 or 3 of section 5; the provider's leftover deleted by that grant | the registry and the app's own verification |
| 12 | The previous image opens a key session for an account with registry rows or a confirmed removal | refused | `user_session_hardware_key`, the no-digest branch |

The records for cases 1, 2 and 5 keep their names (`step_before_reset_*`) although the cause may be a membership's end
or a removal: renaming them would change ADR 0093's reserved purposes and the runbook's queries for no gain; the
audit trail beside each shows the cause at the mark's time. Said in ADR-N.

## 9. The migration plan (by /new-migration; none written here)

Three files in one PR, timestamps after the last on the base when the build starts (#156 and PR 5 merge first). Each
is safe to run again from its first line; none contains COMMIT, ROLLBACK, BEGIN or a zero `lock_timeout`; the only
caught error is `lock_not_available`, around `NOWAIT` only. Runs as `tp_owner`.

### 9.1 File 1, `..._key_registry.sql` (everything but the two validations)

| Order | Statement | Lock | Held |
| --- | --- | --- | --- |
| 0 | Preflight: none of the new objects exists; the base's `audit_event_record` policy text, `operator_record_mail_event` body hash, the two `mail_send` constraints' definitions and ADR 0091 D3's trigger guard are the ones read here; else refuse until rebased | catalog reads | moments |
| 1 | **The lock loop**: one subtransaction a try, `NOWAIT`, once a second, 300 tries: `"user"` SHARE ROW EXCLUSIVE; `membership` SHARE ROW EXCLUSIVE; `user_session` ACCESS EXCLUSIVE; `audit_event` ACCESS EXCLUSIVE; `mail_send` ACCESS EXCLUSIVE. A refused try holds and queues nothing | as listed | to the file's end: catalog work only, well under a second (measured at build on a database with a million `mail_send` and `audit_event` rows; the bound stated in the PR) |
| 2 | `CREATE TABLE hardware_key_removal`, `hardware_key`, `hardware_key_notice`, `provider_sign_out`, their indexes, RLS, policies, revokes | new tables; the foreign keys to `"user"` need its SHARE ROW EXCLUSIVE, already held | - |
| 3 | `ALTER TABLE user_session ADD COLUMN key_credential_sha256 bytea` (catalog only) and `ADD CONSTRAINT user_session_key_digest ... NOT VALID` (no scan) | held | - |
| 4 | `ALTER TABLE mail_send DROP CONSTRAINT mail_send_kind, ADD CONSTRAINT mail_send_kind ... NOT VALID`; the same for `mail_send_stream_kind` (no scan; a NOT VALID check still binds every new row, and every old row satisfies the wider list) | held | - |
| 5 | The functions of section 4, `CREATE` (one `CREATE OR REPLACE`: `operator_record_mail_event`) | none on tables | - |
| 6 | `CREATE TRIGGER` on `user_session`, `membership`, `audit_event`, and the two finality triggers | held | - |
| 7 | `DROP POLICY audit_event_record`, `CREATE POLICY audit_event_record` (section 4.4) | held | - |
| 8 | Privileges, once: revokes from PUBLIC, the grants of section 4, `GRANT INSERT (key_credential_sha256)` | - | - |

Why `"user"` is taken in a mode that readers do not refuse (as migration 20261111090000, unlike 20261112090000): this
file adds no column to `"user"`. `user_session` and `audit_event` need ACCESS EXCLUSIVE (a column; a policy), so, as
for ADR 0093's migration, a try is refused by any open transaction that has touched `user_session` or `audit_event`:
deploy off-hours with no reconcile queued or running (`docs/runbooks/deploy-and-rollback.md`, the same paragraph). If
no moment comes in five minutes the file fails, having changed nothing, before any service moves.

### 9.2 File 2, `..._key_registry_validate.sql`

`ALTER TABLE user_session VALIDATE CONSTRAINT user_session_key_digest`; `ALTER TABLE mail_send VALIDATE CONSTRAINT
mail_send_kind`; the same for `mail_send_stream_kind`. Each takes SHARE UPDATE EXCLUSIVE, which blocks no read and no
write, for one scan of the table. Taken with `NOWAIT` in the same kind of loop (it conflicts only with a vacuum or
another schema change). Separate so that file 1's exclusive locks are released before any scan starts.

### 9.3 Safe with the previous image running (add only)

- Its key session insert carries no digest: allowed for an account the registry has never touched, refused for one
  it has (section 4.3). Its TOTP session insert is not touched.
- Its End membership writes `ends_at = now()` and `membership_ended` in one transaction: the mark moves, the outbox
  row is written, and its own after-commit call makes a second, harmless sign-out.
- Its registration audits `hardware_key_registered` itself and records no row: that key is refused and cleaned by the
  new image, and the person registers again. Said in the deploy runbook; before launch it is staff only.
- **Rollback floor:** none for the schema. A rollback of the image after a removal was confirmed keeps that removal
  (the database refuses the key); it loses only the app's own assertion check and the cleaning at the provider until
  the image returns.

### 9.4 The contract migration (a later schema PR, once this release is the rollback floor)

Reserve `hardware_key_registered`; make the no-digest branch of `user_session_hardware_key` refuse always. Recorded
for the queue; not in this PR.

### 9.5 The pull request

Domain model regenerated in the same PR (`pnpm db:domain-model --out --strict` on a freshly migrated database), every
file under `packages/db/functions` committed, the description opened with `--summary-since origin/<base>
--function-diffs list`, the approval line posted as a suggested change, never written. The hazards to name in the
description: many new SECURITY DEFINER functions (each with the search path stated above); new grants to `tp_app` and
`tp_operator` (the lists of 4.1 and 4.2, nothing to PUBLIC); one function replaced in place
(`operator_record_mail_event`: its file's diff is the one branch); a policy on `audit_event` recreated; no scope
function overloaded; no `set_config`. The Drizzle schema gains the four tables and the column.

## 10. Tests, failing first

Written before the code they hold, each seen to fail for the right reason. Database tests in `packages/db/src`
(a new `key-registry.db.test.ts` and `provider-sign-out.db.test.ts`), flow tests in `sign-in.db.test.ts`, route tests in
`console-routes.db.test.ts`, the worker's beside `password-notices`.

**Catalog and cross-tenant (required on every PR):**

- **SEC-a, the catalog test.** The four tables: RLS enabled and forced, exactly one policy each, for `tp_owner`; no
  privilege for `tp_app`, `tp_operator` or PUBLIC; listed as global tables with the reason. Every function of section
  4: definer or not as stated, the search path, the owner, exactly its grantees (the table in `mail.db.test.ts`'s
  form). The triggers by `pg_get_triggerdef`. `migrate.db.test.ts`'s table list.
- **SEC-b, the cross-tenant test.** With rows for accounts of practice A and practice B: an actor of A, an actor of
  B, a platform administrator and the operator role each `SELECT` zero rows from all four tables and are refused every
  INSERT, UPDATE and DELETE; `sign_in_hardware_keys` returns only the named account's live keys;
  `hardware_key_removals()` returns nothing to anyone but a platform administrator; `hardware_key_record` can name no
  account but the actor's.
- **SEC-c, the reserved actions.** The application role cannot insert any action of section 4.4;
  `membership_ended` for a membership the transaction did not end is refused, and for one it ended is accepted
  (`hardening.db.test.ts`'s list).

**The registry at session open:**

- **SGN-a.** A key sign-in with a live key opens a session; with no row, a removed row, another account's digest, or
  a digest that is not 32 bytes, the INSERT is refused by name. The no-digest branch: allowed for an untouched
  account, refused once the account has any key row or a confirmed removal.
- **SGN-b.** The flow: an unknown or removed key is refused with the words of a wrong credential, records
  `key_refused_*`, counts no failure, and the provider twin's leftover credentials are deleted by that grant. An
  assertion that the provider twin accepts but the row's public key did not sign is refused. `id` not equal to
  `rawId` is refused.
- **SGN-c, the invariant.** Over interleavings of sign-in, confirmation, End membership and reset on one account (two
  connections, each order of the account lock): never a live session whose digest is not a live key, and never a
  live session begun at or before the mark. With a statement count: `resolveSession` issues the same statements as on
  the base.

**The two-person rule (each refusal by its constraint name, each tried through the function and by direct owner
UPDATE against the CHECK):**

- **SGN-d.** Request: refused for a practice administrator, a support engineer, an internal non-administrator, the
  account itself, and no actor; a second open request refused; the audit row.
- **SGN-e.** Confirm: refused for the requester, the account, a non-administrator, at 24 hours exactly and after, a
  requester who lost the role, a removal already decided. On success, in one transaction: every key removed, the mark
  moved, sessions ended, the hold cleared when one stood (and `unlock_user` then works, and did not before), one
  notice row, one outbox row, one audit row; a failure of any part leaves none.
- **SGN-f.** Cancel and expiry: who may; the account may not; an expired request confirms nothing and gets its event
  once.

**The in-flight cases:**

- **SGN-19, changed.** Its two tests assert the refusals (section 8, cases 1 and 2), the mark moved by End membership
  in both routes, and the `step_before_reset_*` record.
- **SGN-g.** Cases 3 to 8 and 10 to 12, each with two connections where order matters.
- **SGN-h.** Registration: the row and `hardware_key_registered` together; a start at or before the mark refused; the
  eleventh key; a known digest; the app's own verification failing removes the key at the provider twin.

**The outbox:**

- **JOB-a.** The trigger writes one row for each of the three actions and none for a rolled-back cause; the reset's
  guard; a forged `membership_ended` raises. The claim: due only, the lease, skip-locked across two connections, the
  try counted at the claim, the subject returned only there.
- **JOB-b.** The steps (1, 5, 15, 60, then 60), `late` once at the fourth failed try, `gave_up` at 24 hours and at 30
  tries with its event, "no such user" done, an error name that is not a class name stored as `unknown`.
- **JOB-c.** Each crash point of section 7's table, by stopping the job between its transactions. The log lines carry
  IDs and codes only (the subject and the address never appear, asserted against captured lines). The alarm's filter
  and words (`infra/test/monitoring.test.ts`). `pnpm lint:logs`.

**Also:** the notice's five functions and its job (the password notice's tests, re-pointed); the worker's role test
scanning the new adapter; the three console routes (role refusals, one audit event each, no PHI in any redirect or
error); the migration tests (the preflight refuses a drifted base; file 1 run twice; the lock loop gives way to a
reader holding `user_session`); the e2e hardware-key spec walks request, confirm, the member's next sign-in and
re-registration.

## 11. The ADR and the runbooks

**ADR-N**, "Remove a member's hardware keys in the app's own registry, by two platform administrators; queue every
provider sign-out in the database; move the mark when a membership ends". Decisions to record: the registry and why
the provider cannot be the source; the two checks at session open and why the app verifies the assertion itself; the
two-person rule and what it cannot prove; all keys, never one; the cleaning by the member's own grant; the outbox,
its steps and its two pages; the web no longer calling the provider and what the minute leaves; the mark at End
membership on `membership`, the outbox row on `audit_event`; the names `step_before_reset_*` kept; platform scope for
the four tables. Amends ADR 0094 (its "left open" section, D2 to D7, and "Revisit when") and ADR 0093 (D6's hold is
cleared by a confirmed removal; "Not covered" 5). Alternatives: a per-request registry read in `resolve_session`
(redundant with the sweep under the lock, and it is the path item 36 is shrinking); trusting the provider's match
alone; one key at a time; a sign counter for clone detection (many authenticators report zero, a false refusal locks
a person out, and the provider may check it already; recorded for the queue); the web keeping its immediate call
beside the outbox (two senders, a paging line for a failure the job already retries).

**Runbooks.**

- `incident-response.md`, the hardware-key section: key removal **leaves the founder's break-glass**. The steps
  become: one platform administrator requests in the console, a second confirms within 24 hours after checking with
  the requester by voice, then Unlock if the account was held. Break-glass steps 3.1 and 3.2 go. Break-glass stays
  only for the case with fewer than two eligible administrators who are not the account. "An ended membership whose
  provider sign-out failed" becomes "A provider sign-out not delivered" (`LATE`, `GAVE_UP`): what holds meanwhile,
  the query by `sign_out_id`, and that the one manual resend left is the founder's.
- `support-mail.md`: the same break-glass line replaced; the member's notice and what support answers to "I did not
  expect this".
- `deploy-and-rollback.md`: off-hours for file 1; staff re-register their keys after the deploy; the rollback note of
  9.3.

## 12. For the founder

**What he should know before approving, in plain words:**

1. Today nobody but you, by break-glass, can take a hardware key off an account. After this, two platform
   administrators can do it from the console in a few minutes, and neither of them alone can.
2. Removing keys never depends on the identity provider being up. The app decides which keys count. The provider's
   copy of a removed key is deleted the next time someone tries it, and until then it opens nothing.
3. Removing keys lowers an account to its password and its code until the person registers a new key. That is the
   reason for two people, the notice to the member, and every removal being on the audit log with both names' IDs.
4. Ending a membership now also stops any sign-in the person had half finished, and the provider sign-out is retried
   for a day and pages if it is late, instead of being tried once.
5. Everyone on staff registers their hardware key again once, after the deploy. Keys registered before it are not
   known to the registry.
6. The four new tables carry no patient data and no practice: account IDs, key fingerprints, times and codes. Neither
   runtime role can read or write them directly.
7. A second, small schema PR follows later to close two doors this one must leave open while the old version can
   still be running (9.4).

**His to decide:**

- **Q1. Should a platform administrator be able to take part in a removal only after holding that role for seven
  days?** Without this, one administrator could create a second administrator account in an hour and confirm their
  own request with it. With it, a new administrator account shows up in the weekly review of role changes before it
  can be half of a removal. The cost: for the first seven days after any administrator is added, including the first
  week after launch, that person cannot request or confirm. **Recommendation: yes, seven days, for both the requester
  and the confirmer.** Built that way unless he says otherwise, since it is the stricter side and one line to relax.
- **Q2. Who holds platform administrator at launch?** With two, the keys of either can be removed only by break-glass,
  because the account itself is excluded and two others are needed. **Recommendation: at least three people, each a
  distinct person with their own key, named before launch** (it joins runbook 3i's list).

## 13. Decisions taken here, the safer option each time, and why

1. The app verifies the key's assertion itself as well as the provider (section 5): removal must not rest on an
   unread detail of the provider's matching.
2. No per-request read: the invariant is held by the lock and the sweep, and tested.
3. The mark moves on `membership`, not on the audit row: every writer covered, and the lock order kept.
4. `membership_ended` raises unless the transaction ended that membership: no forged sign-out or mark for another
   account.
5. The requester is re-checked at confirmation; the account cannot cancel.
6. A removal is allowed for an account with no recorded key (pre-registry keys, the hold).
7. `hardware_key_registered` is reserved later, not now: reserving it now breaks the running image.
8. Constraint scans run in a second file under a lock that blocks nobody.
9. Paging at `LATE` (about 21 minutes) and at `GAVE_UP`, not on the first failed try: a retry that is working is not
   an incident, a sign-out 20 minutes late is.
10. The outbox is its own table, apart from item 32's.

## 14. Recorded for the queue (not built with this item)

The contract migration (9.4). Dropping ADR 0093 D6's account lock now that an unrecorded key opens nothing. A
membership that lapses by a future `ends_at`. A sign counter. Refusing in Postgres a password-and-code session for an
account that must hold a key (today the flow's rule only). ADR 0094's other recorded items stand as they are.
