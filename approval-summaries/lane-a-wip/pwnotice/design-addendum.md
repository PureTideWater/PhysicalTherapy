# Design addendum: password-changed-notice (Schema PR 1; ADR 0091; SGN-16)

Written 2026-11-07 by acting Lane A (S2, Lane B's account, session_01FcouKQthXdmDnPmwhFepxW) for workflow wf_5cf101cd-7ab's
builders. Read-only on the repository: everything below was read from `origin/claude/build-platform` at 31a7345f (#130) and
from #126's head d2fdd1060c9b23e7e5bf5d2560db99f8a7826d46 with `git show`/`git archive`, and #129's head f4fef908 with
`git diff`. Line numbers are at 31a7345f unless a file is named as #126's.

**Revision 1 (2026-11-07).** The design review's three confirmed findings are fixed in place: PWN-R1-01 (a reset whose
revoke transaction fails twice queued no notice and paged no one: 2, 3.6, 5.3, 6.6, 6.8, D15, SGN-16, 9.4, 12),
PWN-R1-02 (`_sent`'s lock position and the job's race had no test: 3.12, 4.2, T13b, 6.4) and PWN-R1-03
(`set_updated_at.sql` is regenerated: 3.11, 12, 13.1). Building them found two more base facts (0.14, 0.15).

**Precedence.** The batching plan's section 1 (`approval-summaries/lane-a-schema-queue-plan-2026-11-07.md`) refines the
design (`designs/lane-a-auth-emails.md` 3.1-3.8 and 9). This addendum states exactly what is built on top of both. Where it
adds a decision of its own, the decision is marked **A-n** with its reason, and ADR 0091 records it.

**Branch.** `co-001/password-changed-notice`, stacked on #126 (d2fdd106, unmerged, carrying `20261110090000`) and the latest
`claude/build-platform`; worktree `/home/user/pwnotice`. One migration:
`packages/db/migrations/20261111090000_password_changed_notice.sql`, written through the new-migration skill's marker route.
No PR opens until #126 merges.

**Not in this PR.** SS-01 D11's `REVOKE UPDATE (status), INSERT (status) ON organization FROM tp_app` (no founder deploy fact
yet). ADR 0081 A6 (Schema PR 6). Neither appears in the migration, the tests or the ADR text except as "not covered".

---

## 0. Base drift fixed at build time

| # | The design or plan says | The base has | What is built |
| --- | --- | --- | --- |
| 0.1 | `audit_event_record` from `20261107090000_mail_streams.sql:886-892` (design 3.3) | recreated later at `20261108090000_suspension_refusal.sql:383-391` with `organization_suspended`, `organization_reinstated` | DROP and CREATE from the 20261108 text, plus `password_notice_sent`, `password_notice_undelivered` (3.10) |
| 0.2 | `passwordChangedMessage(changedAt, supportEmail)`, `utcWords()` "November 5, 2026 at 14:32 UTC", 2 lines (design 3.4) | `packages/auth-mail/src/words.ts:122-141`: `PASSWORD_CHANGED_SUBJECT`, `utcMinute()` ("2026-11-05 14:32 UTC"), `passwordChangedLines(changedAt, supportEmail)` (4 lines) | the base's three names, unchanged; words.ts is not edited |
| 0.3 | "`mail_expiry` deletes expired notices" | the job calls `operator_mail_expire(at_most integer)` (`20261107090000:1191-1214`) | CREATE OR REPLACE of `operator_mail_expire(integer)`, same signature (3.9) |
| 0.4 | `operator_record_mail_event` "returns `password_notice_undelivered`" | its result is `RETURNS TABLE` with six OUT columns (`:955-1116`); an OUT column cannot be added by CREATE OR REPLACE | DROP FUNCTION and CREATE with the same 14 arguments and a seventh OUT column, re-owned, re-revoked and re-granted (3.8) |
| 0.5 | `operator_password_notices_due()` (no argument) | the outbox functions take `at_most integer` (`operator_support_notices_pending(integer)`, `:589-599`) | `operator_password_notices_due(at_most integer)` and `operator_password_notices_stale(at_most integer, request text)` |
| 0.6 | `operator_password_notice_failed(id, error_code, permanent, request)` | base parameter is `error_name` (`:665`) | `(notice uuid, error_name text, permanent boolean, request text)` |
| 0.7 | log fields `notice_id`, `reason` (plan) | `packages/observability/src/fields.ts:9-54` is an allowlist; the runtime logger drops any other key (`logger.ts:52`), `pnpm lint:logs` refuses it, and `fields.test.ts:8` requires `_(id\|no\|type\|code)$` | two fields added: `password_notice_id`, `undelivered_reason_code` (**A-1**, 4.5) |
| 0.8 | e2e "as `e2e/worker.ts` drives jobs" (design 3.5) | no `e2e/worker.ts`; `apps/web/e2e/mail.ts:146-170` drives the platform's mail functions through `@tp/worker/runtime` | `sendPasswordNoticesOnce()` in `e2e/mail.ts`; `sendPasswordNotices` exported from `apps/worker/src/runtime.ts` |
| 0.9 | "a new `MAIL_LOG_CODES` entry with a non-paging metric filter" (design 3.4) | every mail code is alarmed (`infra/lib/constructs/monitoring.ts:510-531`) | it pages (plan; ADR 0091 D9) |
| 0.10 | deliverability.md alarm count "becomes 18" (plan) | the line says "(17)" over 19 rows: #125 added the two user pool rows without the count; `infra/test/mail-streams.test.ts:435` "has seventeen mail alarms" counts the mail namespace only | test: eighteen mail alarms; runbook: "(20: the 18 mail alarms and the user pool's 2)" (9.2) |
| 0.11 | `mail-streams.test.ts` "(eight filters)" (`:312`) | eight | nine |
| 0.12 | the migration name `<ts>_password_notices.sql` (design 3.3) | reserved timestamp after #126's `20261110090000` | `20261111090000_password_changed_notice.sql` |
| 0.13 | "registry row" (the skill) | `password_notice` has no `practice_id`; the catalog refuses a registry row whose table has no NOT NULL `practice_id` (`catalog.ts:13-16`), and `mail.db.test.ts:333` asserts none for the mail tables | **no** `phi_table_registry` row; the table's registrations are `areas.json`, the Drizzle schema, `migrate.db.test.ts`'s owners list, and SGN-16's synth registry row |
| 0.14 | only `mail-streams.test.ts`'s mail-namespace count follows a new filter (0.11) | `infra/test/monitoring.test.ts:262` "has the worker, platform and web metric filters ... and no other" counts every metric filter in the stack: `toHaveLength(31)`; its alarm list (`:263-299`) spreads `mailCodeAlarms` and `resetAndEnrolmentAlarms`, so new alarms join it by themselves | 33: `PASSWORD_NOTICE_UNDELIVERED`'s filter on the platform group (5.2) and `PasswordResetSessionsNotEnded`'s on the web group (5.3); the comment above it (`:254-261`) names both |
| 0.15 | — | `infra/lib/constructs/monitoring.ts`'s class docblock (`:162-167`) says reset and enrolment "add five metric filters" and lists five, over the seven of `RESET_AND_ENROLMENT_COUNTS` (the probe's refusal and the over-floor line were added without the count) | "add eight metric filters", listing the eight (5.3) |

---

## 1. Against design 3.1 (why a migration)

Unchanged. The kind is refused by `mail_send_kind` and `mail_send_stream_kind` (`20261107090000:202-203`, `:222-226`), and no
sending role reads `"user"` except through definer functions. The migration below is the whole of the schema change.

## 2. Against design 3.2 (what queues a notice)

- Only `password_reset_completed`, written by `SignInFlow.confirmPasswordReset` (`apps/web/src/lib/auth/sign-in.ts:533-538`)
  inside the `withActor(account.user_id)` transaction that also runs `revokeUserSessions`. Its row there is
  `actor_id = user, actor_kind = 'user', action = 'password_reset_completed', object_type = 'user', object_id = user,
  purpose = 'email_code'` (`packages/db/src/authz/audit.ts:49-51`, `:121`; `scope.ts:223`).
- Not `password_changed` (`sign-in.ts:356`, the invitation's first password), and no other action.
- **The one completed reset that queues none** (PWN-R1-01). Cognito's `confirmPasswordReset` has already succeeded when
  the `withActor` transaction runs (`sign-in.ts:532-546`). It is tried twice inside a bare `catch {}`; if both tries fail,
  neither `revokeUserSessions`, the `password_reset_completed` event nor the notice (the trigger is that transaction's)
  exists. The web logs `security event: password reset sessions not ended` at error with `user_id` and `request_id`,
  still runs `globalSignOut`, and returns `sessions_not_ended` (`routes/sign-in.ts:741`: `COULD_NOT_CONTINUE`, a form
  answer, not a 5xx). No notice is sent there by design (N-3's "Every session of this account has ended" would be false;
  D10), and the web stays unchanged. Instead that line pages (5.3, ADR 0091 D15), so every completed reset either queues a
  notice or pages the operator. The gap predates this PR (ADR 0081 A5, review R-3, ADR 0088 D7).
- The web is not changed.

---
## 3. Against design 3.3: the migration, exactly

`packages/db/migrations/20261111090000_password_changed_notice.sql`. Runs as tp_owner in one transaction (the runner,
`migrate.ts`). Forward-only. Sections in this order.

### 3.0 Header (comment block, modelled on #126's `20261110090000:1-53` and `20261107090000:1-81`)

States, in this order:
1. What it adds: the `password_notice` outbox (global, no PHI, no address, no name), the `audit_event` trigger, the kind
   `password_changed` on the transactional stream, the helper, the five operator functions, the seventh OUT column of
   `operator_record_mail_event`, the expiry of notices, and the two reserved actions. Decisions: docs/adr/0091 (new),
   0065, 0049, 0009.
2. Tables touched: `password_notice` (new); `mail_send` (the two CHECKs, rewritten in one ALTER, one scan); `audit_event`
   (the `audit_event_record` policy recreated; one AFTER INSERT trigger added); `"user"` (referenced by the new foreign key;
   locked, not changed). No PHI table, no ledger, rule or pricing table; no function sets `app.practice_ids`.
3. The lock loop and the lock window (3.2 below), with the five-minute failure message.
4. Safe with the previous image running, and on rollback (section 10, in short): every object is additive and the CHECKs
   only widen; the web is unchanged and its reset now also queues a notice; the previous platform image selects
   `operator_record_mail_event`'s six named columns, calls `operator_mail_expire(integer)` with the new body, and has no
   `password_notices` job, so notices wait pending; it cannot read a `password_changed` SES event (dead-letter queue).
5. Rollout: migrate, then the new platform image (with the operator role's new statement and `SUPPORT_EMAIL`), then the
   rest; the web needs nothing.
6. D11 and A6 are not in it.

### 3.1 Preflight (one DO block, `object_not_in_prerequisite_state` on failure, each message naming this migration)

- `to_regclass('public.password_notice')` is NULL; `to_regprocedure('audit_event_password_notice()')` is NULL.
- `operator_record_mail_event(text, text, text, timestamptz, timestamptz, text, text, uuid, uuid, uuid, text, text, text, text)`
  exists, its result columns are exactly the six (`recorded, state, notice_undelivered, invoice_undelivered,
  invitation_undelivered, stream_paused`), and its body (`pg_get_functiondef`) contains
  `invitation_undelivered := NULL;` and `stream_paused := mail_stream_cutoff(request);` (the 20261107090000 body this
  migration rewrites).
- `operator_mail_expire(integer)`'s body contains `DELETE FROM screening_mail_refusal f`.
- The `audit_event_record` policy's `WITH CHECK` (`pg_policies.with_check`) contains `organization_reinstated` and not
  `password_notice_sent`.
- `pg_get_constraintdef` of `mail_send_kind` does not contain `password_changed`.

### 3.2 The lock loop (docs/adr/0083's pattern; #126's `20261110090000:78-95`)

```sql
DO $$
BEGIN
  FOR attempt IN 1..300 LOOP
    BEGIN
      LOCK TABLE "user" IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      LOCK TABLE audit_event IN ACCESS EXCLUSIVE MODE NOWAIT;
      LOCK TABLE mail_send IN ACCESS EXCLUSIVE MODE NOWAIT;
      RETURN;
    EXCEPTION WHEN lock_not_available THEN
      PERFORM pg_sleep(1);
    END;
  END LOOP;
  RAISE EXCEPTION '"user", audit_event or mail_send stayed in use for five minutes; run the deploy again (docs/adr/0091)' USING ERRCODE = 'lock_not_available';
END;
$$;
```

- Why each: `"user"` SHARE ROW EXCLUSIVE for `password_notice.user_id`'s foreign key; `audit_event` ACCESS EXCLUSIVE for
  DROP/CREATE POLICY and CREATE TRIGGER; `mail_send` ACCESS EXCLUSIVE for the CHECK swap.
- Why one subtransaction for all three: a new-device sign-in holds `audit_event` (sessions.ts:63, the
  `user_device_security_events` trigger) and then updates `"user"` (sessions.ts:80, :83). A plain wait on `"user"` outside
  the loop would stall every sign-in and the loop could never win.
- Everything after this block runs under the three locks to the commit. The header states the window: the DDL plus one scan
  of `mail_send` (at most about 91 days of messages, `mail_send_expiry_window`). During it these wait, then proceed:
  every write of `"user"` (sign-in bookkeeping, `record_sign_in_with_mfa`, settings saves); every audited mutation and
  every read of `audit_event`; every read or write of `mail_send` (the mail_events job, the console's mail page).

### 3.3 The mail kind (one ALTER, one scan; **A-2**)

```sql
ALTER TABLE mail_send
  DROP CONSTRAINT mail_send_kind,
  ADD CONSTRAINT mail_send_kind CHECK (kind IN ('cognito', 'digest', 'password_changed', 'dunning', 'support_grant_opened',
    'support_grant_closed', 'screening_result', 'screening_failed', 'screening_reminder', 'screening_withdrawal', 'probe')),
  DROP CONSTRAINT mail_send_stream_kind,
  ADD CONSTRAINT mail_send_stream_kind CHECK (
       (stream = 'transactional' AND kind IN ('cognito', 'digest', 'password_changed', 'probe'))
    OR (stream = 'notices' AND kind IN ('support_grant_opened', 'support_grant_closed', 'dunning', 'probe'))
    OR (stream = 'screening' AND kind IN ('screening_result', 'screening_failed', 'screening_reminder', 'screening_withdrawal', 'probe')));
```

- Plain (no NOT VALID): the runner applies the file in one transaction, so a VALIDATE would scan under the same lock.
  **A-2:** both constraints in one ALTER TABLE so PostgreSQL validates them in a single pass over `mail_send`.
- The literal order is `MAIL_KINDS`'s and `MAIL_STREAM_KINDS`'s order (3.13), because `mail.db.test.ts:458-465` compares
  the CHECK literals to the TypeScript lists in order. `password_changed` sits after `digest` in both.
- `mail_send_subject` (`(kind IN ('cognito', 'probe')) = (subject_id IS NULL)`) is unchanged: a `password_changed`
  message must name its subject, the notice's ID. `mail_send_screening_names_no_user` and
  `mail_send_prospect_on_screening` are unchanged.

### 3.4 The table

```sql
CREATE TABLE password_notice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES "user" (id),
  audit_event_id uuid NOT NULL CONSTRAINT password_notice_once UNIQUE,
  changed_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'pending' CONSTRAINT password_notice_state CHECK (state IN ('pending', 'sent', 'delivered', 'undelivered', 'failed')),
  attempts smallint NOT NULL DEFAULT 0 CONSTRAINT password_notice_attempts CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ses_message_id text UNIQUE CONSTRAINT password_notice_message_id CHECK (ses_message_id ~ '^[A-Za-z0-9-]{20,100}$'),
  error_code text CONSTRAINT password_notice_error_code CHECK (error_code ~ '^[A-Za-z]{1,64}$'),
  sent_at timestamptz,
  undelivered_reported_at timestamptz,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT password_notice_sent CHECK ((ses_message_id IS NULL) = (state IN ('pending', 'failed')) AND (ses_message_id IS NULL) = (sent_at IS NULL)),
  CONSTRAINT password_notice_failed CHECK ((state = 'failed') = (error_code IS NOT NULL)),
  CONSTRAINT password_notice_reported CHECK (undelivered_reported_at IS NULL OR state IN ('undelivered', 'failed')),
  CONSTRAINT password_notice_expiry_window CHECK (expires_at > changed_at AND expires_at <= changed_at + interval '91 days')
);
CREATE INDEX password_notice_pending ON password_notice (next_attempt_at) WHERE state = 'pending';
CREATE INDEX password_notice_by_expiry ON password_notice (expires_at);
CREATE TRIGGER password_notice_updated_at BEFORE UPDATE ON password_notice FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE password_notice ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_notice FORCE ROW LEVEL SECURITY;
CREATE POLICY password_notice_owner ON password_notice FOR ALL TO tp_owner USING (true) WITH CHECK (true);
```

Column by column:
- `id`: the notice; the message's `tp_subject` tag and `mail_send.subject_id`.
- `user_id`: the account; the foreign key stays (the design's), its lock made safe by 3.2. No index on it: no user row is
  ever deleted (no `DELETE FROM "user"` in apps or packages), and nothing reads notices by user.
- `audit_event_id`: the reset's event, the idempotency key (`password_notice_once`). No foreign key: `audit_event` is
  append-only and its own triggers already guard it; a key would add a lock on every reset's insert for nothing.
- `changed_at`: the event's `at` (the reset transaction's time). The cutoff and the email's time both read it.
- `state`: `pending` until sent; `sent`, `delivered`, `undelivered` from SES's events (3.12); `failed` when never accepted.
- `attempts`, `next_attempt_at`: failed tries and the next due time (1, 5, 15, 60 minutes).
- `ses_message_id`: set only by `_sent`; the mirror's only key.
- `error_code`: a code only, set exactly when `failed`: the SES error's name, `Unrecognized`, or `NoticeStale`.
- `sent_at`: when SES accepted it (the `_sent` transaction's time).
- `undelivered_reported_at`: the once-only report stamp (as `support_grant_notice.undelivered_reported_at`).
- `expires_at`: `changed_at + interval '90 days'`, written by the trigger; the CHECK mirrors `mail_send_expiry_window`
  (a range, so the session's TimeZone never makes an UPDATE fail).
- `updated_at`: `set_updated_at()`, as every outbox row.

Indexes: `password_notice_pkey`; `password_notice_once` (UNIQUE audit_event_id); `password_notice_ses_message_id_key`
(UNIQUE ses_message_id); `password_notice_pending` (partial, pending, on next_attempt_at: due and stale both scan only
pending rows); `password_notice_by_expiry`.

Grants (in 3.11): `REVOKE ALL ON password_notice FROM PUBLIC;` and `REVOKE ALL ON password_notice FROM tp_app;` (the
skill's global-table rule; the restore_drill precedent, `20261015140500:87`). Nothing is granted to any role. Only the
definer functions below reach it.

### 3.5 The helper: `password_notice_report_undelivered(notice uuid, request text) RETURNS boolean`

- `LANGUAGE plpgsql VOLATILE`, SECURITY INVOKER, owner tp_owner, `SET search_path = pg_catalog, public, pg_temp`,
  `#variable_conflict use_variable`. REVOKE ALL FROM PUBLIC; no grantee (mail.db.test.ts pins `grantees: []`). Modelled on
  `support_notice_report_undelivered` (`20261107090000:489-505`). Called only by the four definers in 3.12, which run as the
  owner.
- `UPDATE password_notice p SET undelivered_reported_at = now() WHERE p.id = notice AND p.undelivered_reported_at IS NULL
  AND p.state IN ('undelivered', 'failed') RETURNING p.* INTO reported;` If not found, `RETURN false`.
- Then `INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id) VALUES ('system',
  'password_notice_undelivered', 'user', reported.user_id, 'password_changed', request);` and `RETURN true`.
- True exactly once a notice.

### 3.6 The trigger and its guard

```sql
CREATE FUNCTION audit_event_password_notice() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  INSERT INTO password_notice (user_id, audit_event_id, changed_at, expires_at)
  VALUES (NEW.actor_id, NEW.id, NEW.at, NEW.at + interval '90 days')
  ON CONFLICT ON CONSTRAINT password_notice_once DO NOTHING;
  RETURN NULL;
END;
$$;
CREATE TRIGGER audit_event_password_notice AFTER INSERT ON audit_event FOR EACH ROW
  WHEN (NEW.action = 'password_reset_completed' AND NEW.actor_kind = 'user' AND NEW.object_type = 'user' AND NEW.object_id = NEW.actor_id)
  EXECUTE FUNCTION audit_event_password_notice();
```

- SECURITY DEFINER, owner tp_owner (the migration's role), so the web's insert as tp_app writes a table tp_app cannot touch.
  REVOKE ALL ON FUNCTION FROM PUBLIC; no grantee (a trigger function needs no EXECUTE grant to fire; precedent
  `user_device_security_events()`, `20261015180000:468-477`, `:596-602`).
- **The guard is the WHEN clause** (plan item; design silent; ADR 0091 D3). Without it, today's `audit_event_record` lets
  one user write `password_reset_completed` naming another as the object, and the notice would go to the address of
  whoever `user_id` named. With it, the notice's user is the actor, and the actor is the object. `actor_kind = 'user'`
  excludes a job's `service` actor and the database's `system`. A NULL `object_id` or `actor_id` makes WHEN false.
- A non-matching event is still recorded; it simply queues nothing (no new refusal path).
- **Failure profile:** the insert's only failure modes are the foreign key (the actor's own row, read in the same
  transaction by `withActor`) and the CHECKs (every value is the event's own or a constant). `ON CONFLICT` covers the key.
  So it can newly stop no reset from ending sessions (`sign-in.ts:533-553`). A BEGIN ... EXCEPTION wrapper was rejected:
  a lost notice would fail silently.
- It fires for every role's insert, the owner's included (no role bypasses a trigger).
- AFTER, so the notice exists only if the event row does; it commits or rolls back with `revokeUserSessions` and the event.
  So a revoke transaction that fails twice leaves no notice (2, "the one completed reset that queues none"); that path
  pages through the web's own line instead (5.3), and 6.6 asserts both.

### 3.7 The operator functions (each SECURITY DEFINER, owner tp_owner, `SET search_path = pg_catalog, public, pg_temp`, REVOKE ALL FROM PUBLIC, `GRANT EXECUTE ... TO tp_operator` only)

None calls `operator_assert_scope`: a password notice names no practice. The job runs each with `app.practice_ids` set to
`{}` (`asOperator(client, null, ...)`, `support-notices.ts:107-123`). Every plpgsql one uses `#variable_conflict
use_variable` and table aliases (OUT names `user_id`, `notice_id` collide with columns).

1. **`operator_password_notices_stale(at_most integer, request text) RETURNS TABLE (notice_id uuid, user_id uuid)`**,
   plpgsql VOLATILE. For each `pending` row with `changed_at <= now() - interval '24 hours'`, ordered by `changed_at, id`,
   `LIMIT greatest(at_most, 0)`, `FOR UPDATE SKIP LOCKED` (a row a claim holds is left to it): set `state = 'failed'`,
   `error_code = 'NoticeStale'` (attempts and next_attempt_at unchanged), call the helper, and `RETURN NEXT` the row only
   when the helper returned true. The job runs it first each minute.
2. **`operator_password_notices_due(at_most integer) RETURNS TABLE (notice_id uuid, user_id uuid)`**, sql STABLE.
   `state = 'pending' AND next_attempt_at <= now() AND changed_at > now() - interval '24 hours'`, ordered by
   `next_attempt_at, id`, `LIMIT greatest(at_most, 0)`. IDs only.
3. **`operator_password_notice_claim(notice uuid) RETURNS TABLE (user_id uuid, email text, changed_at timestamptz)`**,
   plpgsql VOLATILE. `PERFORM 1 FROM password_notice p WHERE p.id = notice AND p.state = 'pending' AND p.next_attempt_at
   <= now() AND p.changed_at > now() - interval '24 hours' FOR UPDATE SKIP LOCKED;` If not found, return no row (another run
   holds it, it is not due, not pending, or past the cutoff: the cutoff is checked again under the lock). Otherwise
   `RETURN QUERY SELECT p.user_id, u.email, p.changed_at FROM password_notice p JOIN "user" u ON u.id = p.user_id WHERE
   p.id = notice`. **The only place the address is read.** No status filter on the user: a user disabled after the reset
   is still told.
4. **`operator_password_notice_sent(notice uuid, message_id text, request text) RETURNS boolean`**, plpgsql VOLATILE,
   modelled on `operator_support_notice_sent` (`:626-661`):
   - refuses a NULL or ill-shaped `message_id` (`check_violation`, constraint `password_notice_message_id`);
   - **A-3:** `PERFORM pg_advisory_xact_lock(hashtextextended('password_notice:' || message_id, 0));` before it reads
     `mail_send` (3.12 says why);
   - reads `mail_send`'s `state` and `delivered_at` for `message_id`;
   - `UPDATE password_notice p SET ses_message_id = message_id, sent_at = now(), state = <rule> WHERE p.id = notice AND
     p.state = 'pending' RETURNING p.user_id, p.state`, where `<rule>` is `undelivered` when the arrived state is
     `bounced`, `suppressed` or `rejected`; `delivered` when the arrived `delivered_at` is not null; `sent` otherwise;
   - not found: `RAISE EXCEPTION 'a password notice is recorded as sent once, while pending' USING ERRCODE =
     'check_violation', CONSTRAINT = 'password_notice_sent'`;
   - `INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id) VALUES ('system',
     'password_notice_sent', 'user', <user_id>, 'password_changed', request)`: once a notice, because only one UPDATE can
     move it out of `pending`;
   - `undelivered`: `RETURN password_notice_report_undelivered(notice, request)`; otherwise `RETURN false`.
   - It does not re-check the cutoff: a message SES accepted is recorded as sent.
5. **`operator_password_notice_failed(notice uuid, error_name text, permanent boolean, request text) RETURNS boolean`**,
   plpgsql VOLATILE, the body of `operator_support_notice_failed` (`:665-690`) on this table:
   `attempts = attempts + 1`; `failed` when `coalesce(permanent, false) OR attempts + 1 >= 5`, else `pending` with
   `next_attempt_at = now() + make_interval(mins => (ARRAY[1, 5, 15, 60])[attempts + 1])`; `error_code` set only when
   failed, to `error_name` if it matches `^[A-Za-z]{1,64}$`, else `Unrecognized`; `WHERE p.id = notice AND p.state =
   'pending'`. Failed: `RETURN password_notice_report_undelivered(notice, request)`; otherwise `RETURN false`. So tries 1-4
   are retried after 1, 5, 15 and 60 minutes (81 minutes in all, about 1/17 of the cutoff), the fifth fails, and a
   permanent error (`PERMANENT_SEND_ERRORS`, `apps/worker/src/mail/streams.ts:61`) fails the first.

### 3.8 `operator_record_mail_event`: DROP and CREATE

```sql
DROP FUNCTION operator_record_mail_event(text, text, text, timestamptz, timestamptz, text, text, uuid, uuid, uuid, text, text, text, text);
CREATE FUNCTION operator_record_mail_event(message_id text, stream text, event text, mail_at timestamptz, event_at timestamptz, recipient text,
  kind text, subject uuid, recipient_user uuid, practice uuid, bounce_kind text, bounce_subtype text, complaint_type text, request text)
RETURNS TABLE (recorded boolean, state text, notice_undelivered uuid, invoice_undelivered uuid, invitation_undelivered uuid, stream_paused text,
  password_notice_undelivered uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$ ... $$;
```

The body is `20261107090000:955-1116`'s, word for word (a db test diffs the two bodies, as `mail.db.test.ts` does for
`submit_screening`), with exactly these additions:
- `DECLARE touched_password_notice uuid;` and `password_notice_undelivered := NULL;` beside the other initialisations.
- After the event-type and `mail_at` checks and before the scope check: `IF kind = 'password_changed' THEN PERFORM
  pg_advisory_xact_lock(hashtextextended('password_notice:' || message_id, 0)); END IF;` (**A-3**).
- After the notices branch and before the invitation branch, the notice's own transition (3.12), reached only when this
  event moved `mail_send`'s state (`recorded`):

```sql
  IF held.stream = 'transactional' AND held.kind = 'password_changed' AND held.state IN ('delivered', 'bounced', 'suppressed', 'rejected') THEN
    UPDATE password_notice p SET state = CASE WHEN held.state = 'delivered' THEN 'delivered' ELSE 'undelivered' END
     WHERE p.ses_message_id = message_id
       AND (p.state = 'sent' OR (p.state = 'delivered' AND held.state IN ('bounced', 'suppressed', 'rejected')))
    RETURNING p.id INTO touched_password_notice;
    IF touched_password_notice IS NOT NULL AND held.state <> 'delivered' AND password_notice_report_undelivered(touched_password_notice, request) THEN
      password_notice_undelivered := touched_password_notice;
    END IF;
  END IF;
```

- It never uses `mail_state_rank` (which gives NULL for `undelivered`).
- After it: `REVOKE ALL ON FUNCTION operator_record_mail_event(<14>) FROM PUBLIC; GRANT EXECUTE ... TO tp_operator;` (owner is
  tp_owner as the creator). `mail.db.test.ts:399`'s entry is keyed by the arguments, so it is unchanged and fails if the
  re-grant is missed.
- The seventh column is last, so the previous image's `SELECT recorded, state, notice_undelivered, invoice_undelivered,
  invitation_undelivered, stream_paused FROM operator_record_mail_event(...)` (`mail-events.ts:295-297`) still works.

### 3.9 `operator_mail_expire(at_most integer)`: CREATE OR REPLACE

The 20261107090000 body (`:1191-1214`), plus, after `screening_mail_refusal`'s delete and added to the count:

```sql
  DELETE FROM password_notice p
   WHERE p.id IN (SELECT x.id FROM password_notice x WHERE x.expires_at <= now() AND x.state <> 'pending' ORDER BY x.expires_at LIMIT at_most);
```

**A-4:** a pending notice is never expired. One that no job reached is failed `NoticeStale` and reported first (the stale
sweep), so no notice disappears without a page, even after a 90-day rollback. The ACL is stated again in 3.11 (CREATE OR
REPLACE keeps it; the precedent states it anyway).

### 3.10 `audit_event_record`: DROP POLICY and CREATE POLICY

From `20261108090000_suspension_refusal.sql:383-391` exactly, the action list extended:

```sql
DROP POLICY audit_event_record ON audit_event;
CREATE POLICY audit_event_record ON audit_event FOR INSERT TO tp_app
  WITH CHECK (
    actor_id = app_actor_id()
    AND actor_kind IN ('user', 'service')
    AND action NOT IN ('notice_sent', 'security_event', 'sign_in_failed', 'data_key_destroyed', 'notice_undelivered', 'mail_stream_paused', 'mail_stream_resumed',
                       'organization_suspended', 'organization_reinstated', 'password_notice_sent', 'password_notice_undelivered')
    AND (practice_id IS NULL OR practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  );
```

`password_reset_completed` stays writable by tp_app (the web writes it).

### 3.11 Privileges, once, at the end

```sql
REVOKE ALL ON password_notice FROM PUBLIC;
REVOKE ALL ON password_notice FROM tp_app;
REVOKE ALL ON FUNCTION password_notice_report_undelivered(uuid, text), audit_event_password_notice(),
  operator_password_notices_stale(integer, text), operator_password_notices_due(integer), operator_password_notice_claim(uuid),
  operator_password_notice_sent(uuid, text, text), operator_password_notice_failed(uuid, text, boolean, text),
  operator_record_mail_event(text, text, text, timestamptz, timestamptz, text, text, uuid, uuid, uuid, text, text, text, text),
  operator_mail_expire(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operator_password_notices_stale(integer, text), operator_password_notices_due(integer),
  operator_password_notice_claim(uuid), operator_password_notice_sent(uuid, text, text),
  operator_password_notice_failed(uuid, text, boolean, text),
  operator_record_mail_event(text, text, text, timestamptz, timestamptz, text, text, uuid, uuid, uuid, text, text, text, text),
  operator_mail_expire(integer) TO tp_operator;
```

Hazard review for the PR description (the skill's list): every SECURITY DEFINER sets `search_path` with `pg_catalog` first
and `pg_temp` last; none sets `app.practice_ids` or `app.actor_id`; no `EXECUTE` of built SQL; no LEAKPROOF; no grant to
PUBLIC; tp_operator's grants are new functions plus the re-grant of a dropped one; no owner change; no new overload of a
scope function. The generated headers' caller lines (`packages/db/src/domain-model/functions.ts:19-20`, `:108-109`: one
`-- Trigger function of: table.trigger` per trigger and one `-- Called by policy: table.policy` per policy, sorted) are
reported as callers, new and changed:
- `audit_event_password_notice.sql` (new): `-- Trigger function of: audit_event.audit_event_password_notice`.
- `set_updated_at.sql` (changed, PWN-R1-03): gains `-- Trigger function of: password_notice.password_notice_updated_at`,
  between the `parse_report` and `patient_ref` lines (3.4's trigger); nothing else in it changes.
- No `Called by policy` line changes: `password_notice_owner` calls no function, and the recreated `audit_event_record`
  keeps its name and its one call (`app_actor_id()`), so `app_actor_id.sql`'s line stays.
- The other new files (the helper and the five operator functions) are called by no trigger or policy; the two
  rewritten functions (`operator_record_mail_event.sql`, `operator_mail_expire.sql`) change their body hash and
  definition (the first also its `RETURNS TABLE` line); their caller, owner and privilege lines stay as they are, which
  the regeneration shows for the dropped and re-granted one.

### 3.12 The undelivered signal: one helper, four callers; the order-independent end state

The four callers of `password_notice_report_undelivered`, and only these:

| Caller | When | How the answer reaches the log |
| --- | --- | --- |
| `operator_record_mail_event` | a bounce, suppression or rejection recorded after `_sent` committed | OUT `password_notice_undelivered` (the notice ID) |
| `operator_password_notice_sent` | one of those recorded before `_sent` | returns true |
| `operator_password_notice_failed` | a permanent SES error, or the fifth failed try | returns true |
| `operator_password_notices_stale` | pending past the 24-hour cutoff | returns the row |

The notice's state follows one rule, **F**, of `mail_send`'s row for its message:
`undelivered` if the row's state is `bounced`, `suppressed` or `rejected`; else `delivered` if `delivered_at` is set; else
`sent`. `_sent` applies F to the row it finds. The mirror applies F's step for each move it records:

| Notice | `mail_send` moves to | Notice becomes | Report |
| --- | --- | --- | --- |
| pending, failed | anything | unchanged (no `ses_message_id` to match) | none |
| sent | delayed | sent | none |
| sent | delivered | delivered | none |
| sent or delivered | bounced, suppressed, rejected | undelivered | the helper, once |
| sent or delivered | complained | unchanged | none |
| undelivered | anything | unchanged (final) | none |

- **Complained changes nothing** (plan; S2's decision; ADR 0091 D8): a complaint follows a delivery, so the person was told;
  the support and dunning notices' branch and `NOTICE_UNDELIVERED_STATES` leave it out too.
- **Why the end state is order-independent.** `mail_send` moves only forward, and for each forward move the mirror's step
  takes F(before) to F(after) (delayed and complained keep F; delivered sets it; the three undelivered states end it). So
  if `_sent` commits before every event, the mirror reaches F(final row); if some events come first, `_sent` starts at
  F(row then) and the mirror carries it on to F(final row). Either way the end state is F of the final `mail_send` row, and
  the helper's compare-and-set reports at most once, exactly when F is `undelivered`.
- **A-3, the message-ID lock, makes that true under concurrency.** Without it, an event recorded after `_sent` read
  `mail_send` but before `_sent` committed would find no `ses_message_id` to match (READ COMMITTED does not see `_sent`'s
  uncommitted row), and `_sent` would then commit `sent` over a bounce. The base's support and dunning outboxes keep that
  millisecond window; they are not changed here. Both sides take `pg_advisory_xact_lock(hashtextextended('password_notice:'
  || message_id, 0))`: the mirror before it inserts or locks the `mail_send` row, `_sent` before it reads it. No deadlock:
  the mirror waits only on the advisory lock, taken first; `_sent` holds the notice row (the claim's lock) and then waits
  on the advisory lock, and the mirror's UPDATE cannot match that row until `_sent` has set `ses_message_id`, which it
  does only after taking the lock. A hash collision only serializes two unrelated messages for a moment.
- **Each side's lock position has its own test** (PWN-R1-02). The lock closes the window only if each side takes it
  before the step the other side must see: the mirror before its INSERT and UPDATE, `_sent` before its `SELECT ... FROM
  mail_send`. A `_sent` that took it after that read (the easy misplacement) would read no row while the mirror held the
  lock with its bounce uncommitted, wait, and commit `sent`, while the mirror's UPDATE matched nothing (the row it sees
  still has a NULL `ses_message_id`, so it does not even wait on the claim's row lock): the notice would stay `sent`, with
  no `password_notice_undelivered` and no page. T13 cannot see that (it runs `_sent` whole before the mirror starts, so the
  lock's place inside `_sent` makes no difference), nor can T12 or T17 (each event commits wholly before or after `_sent`).
  So: T13 pins the mirror's side (an event waits while `_sent` is open), **T13b** pins `_sent`'s (`_sent` waits while an
  uncommitted bounce or delivery holds the lock, then applies F to it), and T18 pins the mirror's body.
- What F does with SES's own event order (not `_sent`'s): `mail_send` keeps the first of equal-rank terminal states and
  ignores a lower rank after a higher one (`mail_state_rank`). So a complaint recorded before its delivery leaves
  `delivered_at` NULL and the notice `sent`, not reported; that is the mail record's own rule and is stated in ADR 0091.
- The residue: SES accepts and `_sent`'s transaction then fails. The row stays pending and the next run sends again
  (`support-notices.ts:21-22`); the first message's events match no notice (its ID was never recorded).

### 3.13 Registration (all before `pnpm db:domain-model --out` runs; a later commit dismisses the founder's line)

- `packages/db/domain-model/areas.json`: `"password_notice"` after `"mail_send"` (`:180`). Without it the CLI exits 2.
- `packages/db/src/schema/operations.ts`:
  - `MAIL_KINDS`: `'cognito', 'digest', 'password_changed', 'dunning', ...` (the CHECK's order);
    `MAIL_STREAM_KINDS.transactional`: `['cognito', 'digest', 'password_changed', 'probe']`.
  - `PASSWORD_NOTICE_STATES = ['pending', 'sent', 'delivered', 'undelivered', 'failed'] as const` and its type;
    `PASSWORD_NOTICE_CUTOFF_HOURS = 24`; `PASSWORD_NOTICE_RETRY_MINUTES = [1, 5, 15, 60] as const`;
    `PASSWORD_NOTICE_STALE_CODE = 'NoticeStale'`. The db test holds each equal to the SQL's behaviour.
  - `passwordNotice = pgTable('password_notice', ...)` with every column, type and nullability of 3.4 (`attempts`
    smallint; `userId` `.references(() => user.id)`; `sesMessageId` `.unique()`; indexes `password_notice_pending`
    (`.where(sql\`state = 'pending'\`)`) and `password_notice_by_expiry`; `unique('password_notice_once')` on
    `auditEventId`); `PasswordNoticeRow`.
- `packages/db/src/schema/index.ts`: re-export `PASSWORD_NOTICE_STATES`, `PASSWORD_NOTICE_CUTOFF_HOURS`,
  `PASSWORD_NOTICE_RETRY_MINUTES`, `PASSWORD_NOTICE_STALE_CODE`, `type PasswordNoticeState`, `type PasswordNoticeRow`,
  `passwordNotice` by name in its explicit operations list (`:250-303`); `migrate.db.test.ts:626-633` fails without them.
  `@tp/db/runtime` re-exports the schema (`runtime.ts:27`).
- Test lists: `migrate.db.test.ts`'s owners list (from `:100`) gains `password_notice` in sorted place;
  `hardening.db.test.ts`'s reserved actions (`:356`) gain the two; `mail.db.test.ts`'s grant map gains the five operator
  functions (`definer: true, grantees: [OPERATOR_ROLE]`), the helper and the trigger function (`definer` false and true,
  `grantees: []`).
- Not change sites: `apps/worker/src/mail/events.ts:166` (reads `MAIL_STREAM_KINDS`); the console's mail page shows the
  kind code as it is (`console_mail_undelivered`, `apps/web/src/app/console/mail/page.tsx:183`), so a bounced
  password-changed message is listed with no web change; `divergence-explanations.json` changes only if `--strict` reports a
  non-informational divergence (an extra table is informational).

### 3.14 The skill's report (for the PR)

Tables touched: `password_notice` (new, global, owner-only, forced RLS), `mail_send` (two CHECKs widened), `audit_event`
(policy recreated with two more reserved actions; one trigger), `"user"` (referenced; locked only). Safe with the previous
image running: add only (no backfill, no removal). The one exposure is the previous platform image reading
`password_changed` SES events, which exist only after the new image sends (section 10).

---
## 4. Against design 3.4: the worker job

### 4.1 The job

- **Name** `password_notices`, appended to `PLATFORM_JOB_TYPES` (`apps/worker/src/jobs/platform.ts:41-53`).
- **Payload** `z.strictObject({})` in `PLATFORM_JOB_PAYLOADS`: nothing about the person rides in pg-boss.
- **Schedule** `'* * * * *'` in `PLATFORM_SCHEDULES` (every minute, UTC). Registered as every platform job is
  (`worker.ts:426`, `singletonKey: type`), so runs never overlap.
- **Dependencies:** `PlatformDependencies` gains `readonly supportEmail: string` (required), wired in `platformRuntime()`
  (`platform/wiring.ts:69-84`) from `PlatformConfig.supportEmail`.
- **Handler** (in `createPlatformHandlers`):
  `withOperator(dependencies.operator, (client) => sendPasswordNotices({ client, mail: dependencies.mail, supportEmail:
  dependencies.supportEmail, requestId: context.jobId, logger: context.logger.child({ job_id: context.jobId }) }))`, then
  `context.logger.info('password notices sent', { job_id, record_count: result.sent })` when `result.sent > 0`.
- The header docblock of `jobs/platform.ts` (`:18-40`) and the schedule docblock (`:84-93`) gain one sentence each: the
  password-changed notices, every minute, from the database's outbox (docs/adr/0091), the address read only by the claim.

### 4.2 `apps/worker/src/platform/password-notices.ts` (new; follows `support-notices.ts`)

Exports `PasswordNoticeOptions { client: NoticeClient; mail: MailSender; supportEmail: string; requestId: string; logger?:
Logger }`, `PasswordNoticeResult { stale: number; sent: number; failed: number; undelivered: number }`,
`passwordNoticeMessage()`, `sendPasswordNotices()`. Reuses `asOperator` and `NoticeClient` from `support-notices.ts`.
`AT_MOST = 100` a run.

Steps of `sendPasswordNotices`, every transaction as tp_operator with `app.practice_ids = '{}'`:
1. **Stale first.** `asOperator(client, null, () => SELECT notice_id, user_id FROM operator_password_notices_stale($1, $2))`
   with `[AT_MOST, requestId]`. Each row: one undelivered line (4.5), `undelivered_reason_code: 'NoticeStale'`.
2. **Due.** `SELECT notice_id, user_id FROM operator_password_notices_due($1)` with `[AT_MOST]`.
3. **Each due notice, its own transaction:** `operator_password_notice_claim($1)`. No row: `skipped`. A row: send one
   message (4.3) with `options.mail.send(...)`; a throw is wrapped as `PasswordNoticeSendFailed` and rolls the transaction
   back; otherwise `SELECT operator_password_notice_sent($1, $2, $3) AS undelivered` with `[notice_id, messageId,
   requestId]`, then commit: `sent`, or `sent_undelivered` when true. The claim's transaction lasts through the send and
   `_sent`, so the claim's row lock is what keeps a concurrent run from claiming the notice (the row is still `pending`
   until `_sent`); `singletonKey` alone does not (the base's support-notices job has the same key and still keeps its race
   test). 6.4's race case pins it (PWN-R1-02).
4. **A refused send**, in a new transaction: `SELECT operator_password_notice_failed($1, $2, $3, $4) AS undelivered` with
   `[notice_id, sendErrorName(error), PERMANENT_SEND_ERRORS.includes(name), requestId]`: `failed`, or `failed_undelivered`.
   Any other throw (SES accepted and the record failed) is rethrown, leaving the row pending: pg-boss fails the job and
   the next minute tries again (the residue, 3.12).
5. Returns the counts.

The reset is never blocked or undone: the send runs up to a minute later in another process, and a failed send changes
only the notice's row.

### 4.3 The message

```ts
export function passwordNoticeMessage(notice: { notice_id: string; user_id: string }, to: string, changedAt: Date, supportEmail: string): MailMessage {
  return {
    to: [to],
    subject: PASSWORD_CHANGED_SUBJECT,
    lines: passwordChangedLines(changedAt, supportEmail),
    links: [],
    variant: 'account',
    identity: { stream: 'transactional', kind: 'password_changed', subjectId: notice.notice_id, recipientUserId: notice.user_id },
  };
}
```

- Words, subject and time are the base's (`@tp/auth-mail`, words.ts:122-141), unchanged: "Your password was changed |
  PaidWhole" through `brandedSubject()`, four lines, `utcMinute(changedAt)` ("2026-11-05 14:32 UTC"). No link
  (`mailBody` with no links is valid, `mail.ts:72-80`). The `'account'` variant (template.ts:14, `MAIL_FOOTERS.account =
  AUTH_MAIL_FOOTER`) is #125's; neither words.ts nor template.ts is edited.
- `mailTags()` (`streams.ts:100-124`) accepts it: the kind is the transactional stream's, the subject is named, no practice,
  a recipient on a customer stream. Tags: `tp_kind=password_changed`, `tp_subject=<notice>`, `tp_recipient=<user>`.
- It goes through the configured sender: SES on the transactional set from `MAIL_FROM`
  (`configuredMailSender`, `mail.ts:163-173`), or the local outbox.

### 4.4 Configuration

- `PlatformConfig` gains `readonly supportEmail: string`. `readPlatformConfig()` reads `SUPPORT_EMAIL`: required with
  `NODE_ENV=production` (as every platform setting that names a real system); in development it defaults to
  `support@synthetic.test`, the web's development default (`apps/web/src/lib/server/config.ts:341`); a set value must
  match `^[^@\s]+@[^@\s]+$` or the worker refuses to start (`WorkerConfigError`, naming the variable, never echoing it).
  **A-5:** the plan's "required only when WORKER_JOBS=platform" is kept for the deployed task (production) and widened to
  a development default so a local `WORKER_JOBS=all` worker still starts.
- `infra/lib/constructs/compute.ts`, the platform task's environment (`:324-345`): `SUPPORT_EMAIL: parameters.supportEmail`
  (the stack's `SupportEmail` parameter, as the web has it at `:249`).

### 4.5 Logs (IDs and codes only; `pnpm lint:logs`)

`packages/observability/src/fields.ts` gains two allowlisted fields (**A-1**), each with a comment:
`password_notice_id` (the notice row's opaque ID) and `undelivered_reason_code` (a code from a closed set: `bounced`,
`suppressed`, `rejected`, `sent_undelivered`, `NoticeStale`, or an SES error's name, letters only). Both match
`fields.test.ts:8`'s pattern and no forbidden pattern.

| Line | Level | Fields | Where |
| --- | --- | --- | --- |
| `password notice sent` | info | `job_id` (child), `password_notice_id`, `user_id` | password-notices.ts |
| `password notice send failed` | warn | `job_id`, `password_notice_id`, `error_code: sendErrorName(error)` | password-notices.ts |
| `password notice not delivered` | error | `job_id`, `password_notice_id`, `user_id`, `undelivered_reason_code`, `error_code: MAIL_LOG_CODES.passwordNoticeUndelivered` | password-notices.ts (stale rows: `NoticeStale`; `_sent` true: `sent_undelivered`; `_failed` true: the error's name) and mail-events.ts (the OUT column: the mail state; `user_id` from the event's `tp_recipient`) |
| `password notices sent` | info | `job_id`, `record_count` | jobs/platform.ts |

- `apps/worker/src/mail/streams.ts`: `MAIL_LOG_CODES.passwordNoticeUndelivered = 'PASSWORD_NOTICE_UNDELIVERED'`; the
  docblocks at `:3-17` (the transactional stream now also carries the password-changed notice) and `:43-47` (the code)
  updated. `streams.test.ts:32` pins the object and follows.
- `apps/worker/src/platform/mail-events.ts`: `RecordedRow` gains `password_notice_undelivered: string | null`; the SELECT at
  `:295-297` names the seventh column; after the invitation line (`:474-476`), when it is not null, the error line above.
- No line, payload, error or URL holds an address, a name or a token. The address exists only in the claim's row and the
  `to` of the one message.

---

## 5. Infra: the transactional send, the alarm

### 5.1 The operator role's transactional send (`infra/lib/constructs/operator-role.ts`)

The platform task runs as the operator role. Today it may send to real recipients only through `NoticeEmail` (notices set,
`:186-191`); `MailProbes` (`:192-203`) reaches the transactional set only for SES's simulator. Without a change every
`password_changed` send in staging and production is refused (`AccessDenied`, not permanent, so retried and then failed).

New statement after `NoticeEmail`:

```ts
new iam.PolicyStatement({
  sid: 'PasswordNoticeEmail',
  actions: ['ses:SendEmail'],
  resources: [props.mail.mailIdentityArn, props.mail.configurationSetArns.transactional],
  conditions: { StringEquals: { 'ses:FromAddress': props.mail.mailFromAddress } },
}),
```

- `NoticeEmail` is unchanged (notices set only). The class docblock (`:74-78`) gains: "the password-changed notice
  (docs/adr/0091) through the transactional set and MailFromAddress's identity, from MailFromAddress alone". No
  `identity/*`.
- The transactional stream stays (the design's): it keeps the account's suppression list, nothing pauses it, and the reset
  code goes through the same set.
- It deploys with the new platform image. While IAM propagates, a refused first send is retried a minute later.

### 5.2 The alarm (it pages; ADR 0091 D9)

- `infra/lib/mail.ts`: `MAIL_PLATFORM_ALARM_CODES` (`:96`) gains `'PASSWORD_NOTICE_UNDELIVERED'` (last); the docblock
  (`:91-95`) adds "a password-changed email not delivered or not sent within 24 hours".
- `infra/lib/constructs/monitoring.ts`: `mailCodeDescriptions` (`:510-516`) gains
  `PASSWORD_NOTICE_UNDELIVERED: \`A ${env} password-changed email did not reach its account, or was not sent within 24
  hours: tell the person another way and check the platform service and SES (docs/runbooks/deliverability.md, 3.10).\``.
  The existing loop (`:517-531`) builds the counted filter on the platform log group (`$.error_code =
  PASSWORD_NOTICE_UNDELIVERED`) and the alarm: SUM over 300 s, at least 1, one period, missing data not breaching, to the
  operator topic. `infra/lib/mail.ts` builds no construct. `infra/test/monitoring.test.ts:262`'s stack-wide filter count
  follows (0.14).
- Volume is tiny: a notice exists only for a completed reset, and a reset needs the mailbox's code.

### 5.3 A reset whose sessions were not ended pages (PWN-R1-01; ADR 0091 D15)

Infra only; the web and its line are unchanged. Today nothing reads the line of section 2's path: `security-events.ts`
counts only `SIGN_IN_BURST_MESSAGES` and the seven `RESET_AND_ENROLMENT_COUNTS`; `monitoring.ts`'s only `$.level = error`
filter (`:483-487`, the screening `RunFailed` count) is on the screening group; no subscription forwards the web group.

- `infra/lib/security-events.ts`, after `CREDENTIAL_PROBE_REFUSED_MESSAGE`:

  ```ts
  /**
   * A completed reset whose app sessions were not ended (docs/adr/0091, D15; docs/adr/0081, A5; review R-3): Cognito holds
   * the new password, but the one transaction that ends the app's sessions and records the reset failed twice
   * (apps/web/src/lib/auth/sign-in.ts), so no password-changed email was queued. The web logs it at error with the user's
   * ID and the request's ID only. One alarms: the operator ends the account's access and tells the person another way.
   */
  export const PASSWORD_RESET_SESSIONS_NOT_ENDED_MESSAGE = 'security event: password reset sessions not ended';
  ```

  and `RESET_AND_ENROLMENT_COUNTS` gains an eighth entry, last: `{ metricName: 'PasswordResetSessionsNotEnded', message:
  PASSWORD_RESET_SESSIONS_NOT_ENDED_MESSAGE, errorCodes: [], threshold: 1, periodSeconds: SECURITY_ALARM_PERIOD_SECONDS }`.
  The group's docblock (`:19-27`) adds "and a completed reset whose sessions were not ended (docs/adr/0091, D15)".
- `infra/lib/constructs/monitoring.ts`: `resetAndEnrolmentDescriptions` (`:571-579`, a `Record` over the metric names, so
  `pnpm typecheck` refuses a missing key) gains `PasswordResetSessionsNotEnded: \`A ${props.environmentName} password reset
  changed the password at Cognito, but the app could not end the account's sessions or record the reset, so no
  password-changed email was queued: read the user ID from the line, end the account's access and tell the person another
  way (docs/runbooks/incident-response.md, "A password reset whose sessions were not ended"; docs/adr/0091, D15).\``. The
  existing loop (`:580-597`) builds the filter `{ $.msg = "security event: password reset sessions not ended" }` on the
  web group in `TherapyPlatform/Web` and its alarm: SUM over 300 s, at least 1, one period, missing data not breaching, no
  dimension, to the operator topic. The class docblock: 0.15.
- **Why the web's existing line.** It is written on this path and only there (`sign-in.ts:545`), at error, with IDs only;
  the infra contract test pins the call's text in `sign-in.ts` (6.8), so an edit to the line fails infra's test as for
  every other counted line. Rejected: a `$.level = "error"` filter on the whole web group (it pages on every error line and
  is not narrowed to the reset); a web change (the scope keeps the web unchanged, and the line already says what happened).
- **What the operator does:** 9.4.
- **Likelihood:** two transaction failures in a row just after a successful account read on the same pool, so the
  volume is tiny; the second factor still guards the account meanwhile (ADR 0081 A5), so a page and the operator's steps
  (9.4) are proportionate.
- **Records:** SEC-23's row is not edited: it lists ADR 0088's lines, and ADR 0081's over-floor count left it so too.
  SGN-16's row names this count (section 8) and its registry lists `infra/test/monitoring.test.ts`. ADR 0088's D7 table is not edited either: as ADR 0081
  did for its over-floor filter ("beside ADR 0088 D7's filters"), ADR 0091 states its own (D15).
- **Rollback:** the line is the current web's and the alarm is the stack's, so a rollback of the images keeps it working.

---
## 6. Against design 3.5: the tests (SGN-16), each written to fail first

Synthetic data only (`@synthetic.test` addresses, SES simulator addresses). No test is skipped or loosened; the counts that
follow the new objects are raised, never removed.

### 6.1 `packages/db/src/password-notice.db.test.ts` (new; one migrated database, as `mail.db.test.ts`)

| # | Sub-case | Asserts |
| --- | --- | --- |
| T1 | The table | relrowsecurity and relforcerowsecurity true; owner tp_owner; one policy `password_notice_owner` (FOR ALL, TO tp_owner, true/true); ACL only the owner's; no `phi_table_registry` row; indexes exactly the five of 3.4 (`pg_indexes`); triggers `password_notice_updated_at`; tp_app, tp_operator, tp_billing, tp_esign, tp_screening, tp_job hold no privilege on it (`has_table_privilege`), and tp_app's and tp_operator's `SELECT count(*)` fail 42501; `catalogProblems()` is empty |
| T2 | The trigger writes one notice | as tp_app via `withActor(user)`: `password_reset_completed` (object the user) leaves exactly one pending row with `user_id`, `audit_event_id` = the event's ID, `changed_at` = the event's `at`, `expires_at` = `at + 90 days`, attempts 0, no message ID; the trigger is AFTER INSERT, row-level, its function the definer `audit_event_password_notice()` |
| T3 | Same transaction | the event's transaction rolled back leaves no notice |
| T4 | Only that action | `password_changed`, `password_reset_requested`, `sign_in` and `membership_created`, each with the guard's actor and object shape, queue none |
| T5 | The guard | an event whose `object_id` is another user (written by tp_app as the actor) is recorded and queues none; `object_id` NULL, `object_type` not `user`, `actor_kind` `service` (a job scope), and an owner-written `system` event each queue none |
| T6 | Idempotency | the owner inserts a notice for audit event X, then an `audit_event` row with id X and the guard's shape: still one notice (`ON CONFLICT`) |
| T7 | Reserved actions | tp_app's insert of `password_notice_sent` and of `password_notice_undelivered` fails 42501 (also in hardening.db.test.ts's list) |
| T8 | Grants | each function of 3.11: `prosecdef`, owner tp_owner, `proconfig = ['search_path=pg_catalog, public, pg_temp']`, no PUBLIC EXECUTE, grantees exactly tp_operator (the five, `operator_record_mail_event`, `operator_mail_expire`) or none (helper, trigger function); tp_app's calls of each operator function fail 42501 |
| T9 | Due and claim | due lists a pending, due notice under 24 hours and not a sent, failed, not-yet-due or 24-hours-old one; claim returns `(user_id, email, changed_at)` for the first and no row for each of the others; a second connection's claim of a held notice returns nothing (`SKIP LOCKED`); tp_operator still cannot read `"user"` directly |
| T10 | The cutoff under the lock | a notice listed due, whose `changed_at` the owner then moves past 24 hours, is refused by the claim; 23 h 59 min is claimed, 24 h 01 min is stale |
| T11 | Sent | pending to `sent` with message ID and `sent_at`; one `password_notice_sent` (system, object_type `user`, object the user, purpose `password_changed`, the request ID); returns false; a second `_sent` fails 23514 with constraint `password_notice_sent` and writes no second event |
| T12 | The race (as mail.db.test.ts:1000-1018) | a bounce (permanent), a suppression (`on_account_suppression_list`) or a rejection recorded before `_sent`: `_sent` returns true, the notice is `undelivered`, one `password_notice_undelivered`; a delivery, or a delivery then a complaint, recorded first: `delivered`, false, no undelivered event |
| T13 | The message-ID lock (A-3) | `_sent` in an open transaction; a bounce recorded on another connection waits (`pg_locks`: an advisory lock not granted) instead of passing; after the commit it completes with `password_notice_undelivered` = the notice and the notice `undelivered`, one event. This pins the mirror's lock (taken before its INSERT and UPDATE); it cannot see where `_sent` takes its own (3.12) |
| T13b | `_sent`'s lock comes before its read of `mail_send` (A-3, the other half; PWN-R1-02) | Connection A, as tp_operator, opens a transaction and claims notice N (`operator_password_notice_claim`, holding its row). Connection B, as tp_operator, opens a transaction and records a permanent bounce of kind `password_changed`, subject N, for message M through `operator_record_mail_event`, and does not commit: the call returns (it does not wait on A's row: OUT `password_notice_undelivered` NULL, as its UPDATE matched no `ses_message_id`). A calls `operator_password_notice_sent(N, M, request)` without awaiting it; `pg_locks`, read on a third connection, shows A's backend (`pg_backend_pid()`, read before) waiting on an `advisory` lock with `granted` false, polled for at most 5 s, and the call has not settled. B commits. A's call returns **true**; A commits; N is `undelivered` with `ses_message_id` M; exactly one `password_notice_sent` and one `password_notice_undelivered` for N's user. The same with an uncommitted delivery in place of the bounce: A's call returns false and N is `delivered`, with no undelivered event. A `_sent` that took the lock after its read would also wait, but then return false and leave N `sent` in both cases, so the end state, not the wait, is what fails it; a `_sent` with no lock would not wait and fails the `pg_locks` check |
| T14 | Failed | tries 1-4 leave it pending with `next_attempt_at` = now + 1, 5, 15, 60 minutes and return false; the fifth fails it with the error's name and returns true (one event); a permanent error fails the first and returns true; a name with a digit or a space is stored `Unrecognized`; a non-pending notice is unchanged and returns false |
| T15 | Stale | a pending notice 24 hours old becomes `failed`/`NoticeStale`, is returned once with its user, one event; a second call returns nothing; a `sent` notice of the same age and a pending one inside the cutoff are untouched; a row a claim holds is skipped |
| T16 | The mirror | sent + delivery: `delivered`, OUT NULL; sent + bounce, suppression or rejection: `undelivered`, OUT the notice, one event; delivered + bounce: `undelivered`, reported; delivered + complaint: stays `delivered`, no event, OUT NULL; a bounce replayed: `recorded` false, OUT NULL, still one event; an event for a message no notice holds (the residue) changes nothing; a pending and a failed notice are never touched by any event |
| T17 | Order independence (exhaustive, not sampled) | for every sequence of up to three events drawn from delivery, delivery delay, permanent bounce, suppression, rejection and complaint, and for every position of `_sent`'s commit in it: the notice's end state equals F of the final `mail_send` row (3.12) and is the same for every position, and `password_notice_undelivered` events number 1 exactly when that state is `undelivered`, else 0 |
| T18 | The seventh column | `operator_record_mail_event`'s result columns are the seven, in order; the previous image's six-column SELECT still runs; its body equals 20261107090000's plus exactly 3.8's additions |
| T19 | The kind | `mail_send` takes a `password_changed` row on the transactional stream with a subject; refuses it on notices or screening, and without a subject (23514); the CHECK literals equal `MAIL_KINDS` and `MAIL_STREAM_KINDS` (also mail.db.test.ts:458-465) |
| T20 | Expiry | `operator_mail_expire(1000)` deletes notices past `expires_at` that are not pending, keeps a pending one past it and every unexpired one, and counts them in its return |
| T21 | The lock loop (as `line-status.db.test.ts:525-...`) | the loop as written in the file (`lockLoop()`): contains the docs/adr/0091 message; while another session holds a sign-in transaction's ROW EXCLUSIVE on `audit_event` (an open insert), or a ROW EXCLUSIVE on `"user"`, or on `mail_send`, the loop retries without queueing (a writer started meanwhile on `audit_event` proceeds); once the holders end, it takes all three |
| T22 | Constants | `PASSWORD_NOTICE_STATES` equals the CHECK's literals; `PASSWORD_NOTICE_CUTOFF_HOURS`, `PASSWORD_NOTICE_RETRY_MINUTES` and `PASSWORD_NOTICE_STALE_CODE` equal T10's, T14's and T15's observed behaviour |

### 6.2 Changed db tests

- `mail.db.test.ts`: the grant map gains the five operator functions, the helper and the trigger function; the
  `operator_record_mail_event` entry stays as it is; the CHECK-literal test follows the constants.
- `migrate.db.test.ts`: owners list gains `password_notice`; "defines every migrated table" passes with the Drizzle table.
- `hardening.db.test.ts`: reserved actions gain `password_notice_sent`, `password_notice_undelivered`.
- The catalog and cross-tenant tests (`pnpm test:db`) pass unchanged: the table is global, forced and owner-only.

### 6.3 `apps/worker/src/platform/password-notices.test.ts` (new, unit)

- `passwordNoticeMessage()`: `to` is the one address; subject `PASSWORD_CHANGED_SUBJECT`; lines equal
  `passwordChangedLines(changedAt, support)`; `links` empty; variant `account`; identity transactional, `password_changed`,
  the notice, the user; `mailTags()` accepts it and yields exactly the three tags, none with `@`.
- The rendered text (`mailBody`) and HTML (`mailHtml`, no static host and with one) hold the four lines, the
  `AUTH_MAIL_FOOTER`, `2026-11-05 14:32 UTC` for a synthetic time, the support address, and no `http`, `href` or `<a`.

### 6.4 `apps/worker/src/platform/password-notices.db.test.ts` (new; `MemoryMailSender`, a spy logger)

- One due notice: exactly one message, to the user's synthetic address, with the identity's tags; the notice `sent`; one
  `password_notice_sent`; result `sent: 1`.
- A second run sends nothing.
- **Sends each notice once when runs race** (PWN-R1-02; the counterpart of the base's `support-notices.db.test.ts:195`
  "sends each notice once when two runs race"): one due notice, three `sendPasswordNotices` runs started together
  (`Promise.all`, each on its own pool client) over one `MemoryMailSender` wrapped so that its first send waits 250 ms
  before it returns (so the other runs list the notice due and try to claim it while the first holds it through the
  send). Exactly one message for the notice; exactly one `password_notice_sent`; the notice `sent` with that message's ID;
  the runs' `sent` counts sum to 1 and none reports `failed` or `undelivered`. A job that committed the claim before
  sending would send two or three, since the row stays `pending` until `_sent`.
- A throwing sender (a retriable `Throttling`): the row stays pending with `attempts` 1 and its next attempt in a minute,
  and a `password notice send failed` line; a permanent `MessageRejected`: `failed`, one event and one
  `PASSWORD_NOTICE_UNDELIVERED` line with `undelivered_reason_code: 'MessageRejected'`; the fifth retriable failure: the
  same, once.
- A pending notice past the cutoff: no message, `failed`/`NoticeStale`, one line with `NoticeStale`.
- The race in the job: a sender that records the bounce through `operator_record_mail_event` (another connection) before
  returning its message ID: one line, `sent_undelivered`, one event.
- The payload: `parsePlatformPayload('password_notices', {})` is `{}` and a payload with any key (an address) is refused
  (also in `jobs/platform.test.ts`); no logged value contains `@` or the address (spy logger), and every key is allowlisted.
- A reset whose provider sign-out failed (the notice queued as in 6.6) sends the same four lines.

### 6.5 `apps/worker/src/platform/mail-events.db.test.ts` (extended)

- A bounce event of a sent `password_changed` message: one `password notice not delivered` line with
  `password_notice_id`, `user_id`, `undelivered_reason_code: 'bounced'`, `error_code: 'PASSWORD_NOTICE_UNDELIVERED'`; a
  replay logs none; a delivery logs none.

### 6.6 `apps/web/src/lib/auth/sign-in.db.test.ts` (extended, beside the SGN-07 cases at `:518-640`)

- A confirmed reset leaves exactly one pending notice for the user (`:518`).
- A refused code, an invalid password and an unknown account leave none.
- The provider sign-out failing (`:558`): the sessions end, one notice is queued, and the error line `security event:
  password reset provider sign-out failed` is logged.
- A revoke that fails once then succeeds (`:571`): exactly one notice (the first attempt rolled back).
- Failing twice (`:580-590`; PWN-R1-01): the base's assertions stay as they are (`sessions_not_ended`, the provider still
  signs out, one open session, and the error line `security event: password reset sessions not ended` with `user_id` and
  `request_id`), and the case gains: no notice for the user, and no `password_reset_completed` event for the user (the
  path section 2 names). The line asserted there is the one `PasswordResetSessionsNotEnded` counts; infra's contract test
  pins the same call's text in `sign-in.ts` (6.8), so the two tests together show the path that queues no notice pages.
- The invitation's first password (`passwordChosen`, `password_changed`): none.

### 6.7 e2e (`apps/web/e2e/sign-in.spec.ts`, the reset journey at `:154`; helper in `e2e/mail.ts`)

- `sendPasswordNoticesOnce()` (new, beside `sendSupportNoticesOnce`): `sendPasswordNotices({ client, mail: localMail(),
  supportEmail: E2E_SUPPORT_EMAIL ('support@synthetic.test', the web's development default), requestId:
  \`e2e-password-notices-${randomUUID()}\`, logger: silent })`.
- After the reset lands: the outbox for `personaEmail('reset')` holds exactly one `Your password was changed | PaidWhole`
  message whose body holds the support address and no `http`, and whose HTML holds no `<a`.

### 6.8 Infra and worker unit tests

- `infra/test/operator-role.test.ts`: `PasswordNoticeEmail` is `ses:SendEmail` on the mail identity and
  `configuration-set/tp-<env>-transactional` only (not notices, not screening), with `StringEquals ses:FromAddress =
  MailFromAddress`; no statement names `identity/*`; `NoticeEmail`'s notices-only test (`:116-127`) is kept as it is.
- `infra/test/mail-streams.test.ts`: `:82-95` passes through the literal in `streams.ts`; `:312` nine filters; `:435`
  "has eighteen mail alarms"; the code's alarm is SUM, 300 s, at least 1, to the operator topic.
- `infra/test/monitoring.test.ts` (PWN-R1-01, 0.14):
  - "pins the seven counted lines ..." (`:120-142`) becomes "pins the eight counted lines ...": the literal list gains, last,
    `{ metricName: 'PasswordResetSessionsNotEnded', message: 'security event: password reset sessions not ended',
    errorCodes: [], threshold: 1, periodSeconds: 300 }` with a comment (a completed reset whose sessions were not ended
    queues no password-changed email, docs/adr/0091, D15).
  - The web contract test (`:144-155`) gains `expect(flow).toContain(\`this.deps.logger.error('${PASSWORD_RESET_SESSIONS_NOT_ENDED_MESSAGE}',
    { user_id: account.user_id, request_id: context.requestId });\`)`, the exact call at `sign-in.ts:545`, and its title
    names "a reset whose sessions were not ended".
  - "counts each of the seven lines ..." (`:479-507`) becomes "eight"; its loop then checks the new filter
    (`{ $.msg = "security event: password reset sessions not ended" }` on the web group alone) and alarm (SUM, 300 s, at
    least 1, one period, missing data not breaching, no dimension, the operator topic).
  - "has the worker, platform and web metric filters ..." (`:253-300`): `toHaveLength(31)` becomes 33 (this filter and
    `PASSWORD_NOTICE_UNDELIVERED`'s), and its comment names both; its alarm list picks both alarms up through
    `Object.values` unchanged.
- `infra/test/compute.test.ts`: the platform environment (`:397-411`) includes `SUPPORT_EMAIL: ref(supportEmail)`.
- `apps/worker/src/mail/streams.test.ts:32`: the pinned `MAIL_LOG_CODES` gains the code; `:25` holds every kind on a stream.
- `apps/worker/src/jobs/platform.test.ts`: the type list (`:20-32`), the no-PHI payload case (`:61`), the every-minute
  schedule (`:70`).
- `apps/worker/src/platform/wiring.test.ts:106-117`: the handler names; `apps/worker/src/worker.test.ts` (`:238`, `:418`,
  `:711`, `:741`): each handler map gains `password_notices`.
- `apps/worker/src/config.test.ts`: `SUPPORT_EMAIL` required in production, defaulted in development, refused when not
  an address (the error names the variable only).
- `packages/observability/src/fields.test.ts` passes unchanged with the two fields.

---
## 7. Against design 3.6: ADR 0091

File: `docs/adr/0091-tell-an-accounts-address-when-its-password-changes-from-an-outbox-the-database-writes-in-the-changes-own-transaction.md`.
Title: "Tell an account's address when its password changes, from an outbox the database writes in the change's own
transaction". Status: Proposed (the founder's approval of the domain model, CO-02, accepts it). Sections: Context,
Decision (D1-D15), Departures from the design, Alternatives considered, Consequences, Not covered, Revisit when. It is its
own ADR, not an amendment: it adds a table, a mail kind, a platform job and an operator permission across ADR 0065's
streams.

Decisions:
- **D1. The outbox.** The trigger of 3.6 writes the notice in the reset's own transaction; the web is unchanged. Rejected:
  a pg-boss job from the web after commit (lost if the process dies; a `user_id` in a payload); an enqueue inside the
  transaction (the web role on pg-boss's tables); a web-side SES send (the side channel the scope forbids).
- **D2. What queues one.** Only `password_reset_completed`. Not the invitation's first password (noise one second after the
  person chose it). A future Settings change of password adds its own action to the trigger's WHEN in that PR.
- **D3. The guard** (departure 1): the actor is the user, the object is the actor, and the actor is a person. Why: the
  audit policy lets any user name any object; without it one user's write could send a notice to another's address.
- **D4. The table and the address.** Global, no PHI, no address; forced RLS, owner-only, no grant; the address read only
  by the claim of a pending, due notice inside the cutoff.
- **D5. The kind and the stream.** `password_changed` on the transactional stream (the account's suppression list, never
  paused, the reset code's own set); the CHECK swap in one ALTER; the operator role's `PasswordNoticeEmail`, the
  transactional set and the mail identity only, from MailFromAddress; `NoticeEmail` unchanged.
- **D6. The job.** `password_notices`, every minute, payload `{}`; stale sweep first; one transaction a notice; retries
  after 1, 5, 15 and 60 minutes; failed after the fifth try or at once on a permanent error.
- **D7. The 24-hour cutoff** (departure 2; S2's decision of 2026-11-07): about 17 times the 81-minute retry span, so it
  covers a rollout and an overnight outage; pending rows only (a sent row waiting on SES is never cut off); a notice past
  it is never sent, fails `NoticeStale` and is reported. Why: a "your password was changed" email a day late misleads more
  than it helps, and the operator is paged to tell the person another way.
- **D8. Undelivered, once** (departure 3 and additions): one helper, four callers (3.12); complained leaves the notice
  unchanged (as the support and dunning notices); `_sent` reads a state that arrived first (the fourth path); the
  message-ID lock (A-3) so the end state is F of the final `mail_send` row whatever the order of `_sent`'s commit and the
  events; a complaint recorded before its delivery leaves the notice `sent` (the mail record's own rank rule).
- **D9. It pages** (departure 4 from the design's "non-paging metric filter"; S2's decision of 2026-11-07): every mail
  code is alarmed in the base and `MAIL_WARNING_CODES` have no filter at all, so a counted code no one reads would be
  new; this notice is the account holder's only warning of a reset they did not make, and the operator can still give it
  another way; volume is tiny.
- **D10. What the lines claim** (departure 5: #125's security-N-3 and ux-brand-N5 closed with option (a); words.ts and the
  web unchanged):
  - **N5** ("with a code sent to this address" is true only for a reset): closed by D2, the trigger's WHEN; design 3.2
    found no other change path (no `ChangePassword`, `AdminSetUserPassword` or `AdminResetUserPassword`;
    `infra/test/application-role.test.ts:15`).
  - **N-3** ("Every session of this account has ended."): a notice exists only if the app's sessions ended, because
    `revokeUserSessions` and the event are one `withActor` transaction (`sign-in.ts:533-538`) and the trigger fires on the
    event. Cognito tokens are never a PaidWhole session: they live only in the sealed pending sign-in cookie (`pending.ts`),
    for at most the step's 5 or 15 minutes (`step-limits.ts`); the refresh token is revoked when the step ends
    (`release()`, `cognito-provider.ts:438`); access tokens last 15 minutes (`identity.ts` `TOKEN_LIFETIMES`, `:13-18`);
    the client writes no attribute (`identity.ts:143`). So a provider session that survives a failed
    `AdminUserGlobalSignOut` can only finish, within those minutes and through the app's server, a sign-in step already
    started, and cannot reach a page, PHI or a setting. Review (1) checks each fact, including whether a step begun
    before the reset can finish into a session after it; if it can, the ADR says so and SGN-16 gains the case; if a
    surviving provider session can do more than finish a sign-in that already proved both factors, the build switches to
    option (b) before the PR opens. Option (b) (carrying the sign-out result to the notice) was rejected: it edits the web
    and words.ts (#129's file), races the job's claim, and makes the line less accurate.
  - Line 2's second sentence ("Signing in still asks for your authenticator code or hardware key."): holds because a code
    is requested only for an active, enrolled account (`sign-in.ts:477`; ADR 0081 A2); only the app can start
    ForgotPassword (ADR 0088's confidential client); no code path sets `"user".mfa_enrolled` false (none in apps or
    packages at 31a7345f); a reset never removes the second factor (ADR 0081 A5). Condition: any later change that can
    clear `mfa_enrolled`, or complete a reset outside A2's gate, adds the narrower line in that same PR.
- **D11. The locks.** One NOWAIT try a second for `"user"`, `audit_event` and `mail_send` together, up to 300, failing the
  deploy before any service moves; the window stated (3.2).
- **D12. Rollback** (section 10).
- **D13. Logs.** IDs and codes only; two allowlisted fields (A-1).
- **D14. Expiry.** 90 days after the change, never while pending (A-4).
- **D15. The completed reset no notice covers pages instead** (PWN-R1-01; 2, 5.3). When the transaction that ends the
  app's sessions and records `password_reset_completed` fails twice (`sign-in.ts:532-546`; ADR 0081 A5, review R-3),
  Cognito already holds the new password, the app's sessions were not ended, and neither the event nor the notice exists
  (the trigger is that transaction's). No email is sent there: N-3's line would be false (D10), and the web is unchanged.
  The web's existing line `security event: password reset sessions not ended` (error; `user_id`, `request_id`) is
  counted on the web log group as `PasswordResetSessionsNotEnded` (≥ 1 in 300 s, the operator topic), beside ADR 0088
  D7's filters and ADR 0081's over-floor count, and the operator ends the account's access and tells the person another
  way, by user ID (`docs/runbooks/incident-response.md`, "A password reset whose sessions were not ended"). So every
  completed reset either queues a notice or pages; with D9, every notice not delivered pages too. The gap predates this
  ADR; it is closed here because D9 makes the notice the account holder's warning, and this is the path where that
  warning matters most. Rejected: a notice outside the transaction (a web change, and a false N-3 line); a `$.level =
  "error"` filter on the whole web group (pages on every error line). Tests: `sign-in.db.test.ts`'s failing-twice case
  (no notice, no event, the line) and `infra/test/monitoring.test.ts` (the count pinned as a literal, the line pinned in
  `sign-in.ts`, the filter and its alarm).

Departures from the design, listed in their own section: the guard (D3), the 24-hour cutoff (D7), complained (D8),
paging (D9), security-N-3 option (a) (D10), N5 (D10); and the additions: the `_sent` path, the message-ID lock (A-3), the
operator role's statement (D5), the sessions-not-ended alarm (D15), the expiry rule (A-4), `at_most` arguments and `error_name` (0.5, 0.6), the log fields
(A-1), the development default of `SUPPORT_EMAIL` (A-5), the CHECKs in one ALTER (A-2).

Not covered: SS-01 D11's REVOKE (no deploy fact); ADR 0081 A6 (Schema PR 6); "from where" (O-4, a GeoIP vendor is the
founder's call); a Settings change of password (none exists); the support and dunning outboxes' own `_sent` window (A-3
is not back-ported here); an email for a completed reset whose sessions were not ended (none is sent: D15 pages the
operator instead, who tells the person another way).

Revisit when: a second password-change path exists; SES changes its event order guarantees; the transactional stream
gains a pause; `mfa_enrolled` can be cleared.

Also:
- **ADR 0065**, a dated note at the end of Consequences: "2026-11-xx (docs/adr/0091): the operator role also sends one
  kind, `password_changed`, on the transactional set (`PasswordNoticeEmail`), and the transactional stream carries it;
  the kind and stream CHECKs widen; `operator_record_mail_event` returns a seventh column."
- **ADR 0014**, the platform jobs' list (after `dunning_notices`, `:144-146`): a `password_notices`, every minute, bullet
  (the outbox, stale first, the retries, the claim the only address read, `PASSWORD_NOTICE_UNDELIVERED`; docs/adr/0091).

---

## 8. Against design 3.7: SGN-16

`docs/product/test-matrix.md`: the intro's "SGN-16 is kept for the password-changed email's (docs/adr/0091, with its
migration)" (`:438-439`) becomes "SGN-16 is the password-changed email's (docs/adr/0091)"; the row goes after SGN-15:

| SGN-16 | A password change is told to the account's address | A completed reset writes one pending notice in its own transaction, by the database, only for the account's own `password_reset_completed` (the actor a person and the object that person), and a refused, invalid or rolled-back reset, the invitation's first password or any other action none; a completed reset whose sessions could not be ended queues none and its line pages the operator (`PasswordResetSessionsNotEnded`); the platform job sends one message on the transactional stream (kind `password_changed`, subject the notice, recipient the user) to the account's address, once however many runs race, read only by the claim of a pending, due notice under 24 hours old, with the change's time in UTC, the four lines, the support route and no link, from MailFromAddress through the operator role's transactional statement alone, and records `password_notice_sent`; it retries after 1, 5, 15 and 60 minutes, fails at the fifth try or at once on a permanent error, and fails a notice not sent within 24 hours as `NoticeStale`; a bounce, suppression or rejection, recorded before or after the send, makes it undelivered, reported once (`password_notice_undelivered`, and `PASSWORD_NOTICE_UNDELIVERED` by IDs, which pages), a complaint changes nothing, and the end state is the same in any order of the send and its events, concurrent ones included; no payload, log or error holds the address; the reset is never blocked or undone by the notice, and a provider sign-out that fails still sends the same four lines |

- `packages/synth/src/cases/matrix.ts`: the same id, title and assertion after SGN-15 (`:821-826`).
- `packages/synth/src/cases/registry.ts`, after SGN-15 (`:1070-1074`):
  `'SGN-16': none(1, 'The notices are queued and sent against a synthetic database, to an in-memory sender or the local outbox; no file.', [`
  `'packages/db/src/password-notice.db.test.ts', 'packages/db/src/mail.db.test.ts', 'packages/db/src/hardening.db.test.ts',`
  `'apps/worker/src/platform/password-notices.test.ts', 'apps/worker/src/platform/password-notices.db.test.ts',`
  `'apps/worker/src/platform/mail-events.db.test.ts', 'apps/web/src/lib/auth/sign-in.db.test.ts', 'apps/web/e2e/sign-in.spec.ts',`
  `'infra/test/operator-role.test.ts', 'infra/test/mail-streams.test.ts', 'infra/test/monitoring.test.ts'])`
  (`infra/test/monitoring.test.ts` for `PasswordResetSessionsNotEnded`, PWN-R1-01).
- SEC-23's row, its `matrix.ts` assertion and its registry entry are not edited (5.3, "Records").
- `fixtures/synthetic/SGN-16/expected.json` is written by `pnpm synth --all`, never by hand.

---
## 9. Against design 3.8: the runbooks

### 9.1 `docs/runbooks/support-mail.md`, "Sign-in help tickets" (`:42-82`), a new item after "Mail from an address that is not the account's own"

**Password changed, not by me** (the words are the orchestrator's to confirm, O-7):
1. Treat it as a mailbox compromise: someone read the code sent to that mailbox.
2. With the organization's administrator, disable the user (Settings), which ends access. The second factor still guards
   the account, because a reset never removes it (docs/adr/0081 A5).
3. Ask the person to secure the mailbox, then reset again.
4. Work by the ticket ID and the user ID only.

### 9.2 `docs/runbooks/deliverability.md`

- The alarm table (`:79-98`): a row `| PASSWORD_NOTICE_UNDELIVERED | a password-changed email not delivered, or not sent
  within 24 hours (platform log) | 3.10 |` after `INVITATION_UNDELIVERED`; the line above it becomes "**Alarms**, all to
  the operator topic (20: the 18 mail alarms and the user pool's 2)" (0.10).
- Section 1 ("What is set up"), `:12`, "`<p>-transactional`: Cognito's invitations and codes (from phase 2), and the
  digests" gains "and the password-changed notices (docs/adr/0091)".
- New **3.10 A password-changed email undelivered (`PASSWORD_NOTICE_UNDELIVERED`)**, after 3.9:
  - The line names the notice (`password_notice_id`), the user (`user_id`) and the reason (`undelivered_reason_code`).
  - `bounced`, `suppressed`, `rejected`, `sent_undelivered`: the address that took the reset code no longer takes mail
    (the console's mail page lists the message by kind `password_changed`).
  - `NoticeStale`, or an SES error's name: the platform service did not send the notice within 24 hours, or SES refused
    it; check the platform service, its log and SES (and, after a deploy, the operator role's `PasswordNoticeEmail`).
  - In every case reach the person through their organization's administrator or the account contact, working by user ID:
    say the password was changed at the time the audit log's `password_reset_completed` records. If it was not them,
    follow support-mail.md's "Password changed, not by me".
  - Release a suppressed address only as 3.4 says.

### 9.3 `docs/runbooks/deploy-and-rollback.md`, a new section after "A line's stage lock" (`:282-312`), before "Rollback" (`:314`)

**Password-changed notices (ADR 0091; Schema PR 1)**, modelled on "The mail streams" (`:212-226`) and SUITE-CAP-1b's
(`:282-312`):
- **The migration's lock loop**: `20261111090000_password_changed_notice.sql` takes `"user"`'s SHARE ROW EXCLUSIVE,
  `audit_event`'s and `mail_send`'s ACCESS EXCLUSIVE locks together with `NOWAIT`, once a second, up to 300 tries. Once
  held, sign-ins, audited mutations and the mail record wait for the DDL and one scan of `mail_send`, then proceed. If no
  moment comes in five minutes, cdk reports the migration task stopped (exit 1) and `/tp/<env>/migration` ends with
  `db:migrate: 20261111090000_password_changed_notice.sql failed: "user", audit_event or mail_send stayed in use for five
  minutes; run the deploy again (docs/adr/0091)` (55P03). Nothing changed and no service moved; run the deploy again, at a
  quieter hour if it repeats; never take the locks by hand.
- **The forward deploy**: the migration runs before the new platform image; from then the trigger queues notices and they
  wait, within the cutoff, for the new platform task. The web is unchanged; the old worker selects named columns. The
  operator role's new statement deploys with the new image; a refused first send is retried a minute later.
- **The rolling platform deploy** (minimum 100%, maximum 200%: `infra/lib/environments.ts:47`, `:151`): an old and a new
  platform task overlap, and an old task cannot read a `password_changed` SES event. After each deploy, check
  `tp-<env>-mail-events-dlq` and redrive it (deliverability.md 3.6). Review (2) states whether the overlap can move one
  event there; the section keeps the check either way.
- **Rollback across Schema PR 1**: section 10.

### 9.4 `docs/runbooks/incident-response.md` (PWN-R1-01; ADR 0091 D15)

- Section 0, "Triggers" (`:10-13`): the security event alarms gain "a password reset whose sessions were not ended".
- A new section after the two operational-alarm sections and before "Weekly sign-in review" (`:149`):
  **A password reset whose sessions were not ended (`PasswordResetSessionsNotEnded`; docs/adr/0091, D15)** (a security
  event alarm, unlike the two sections before it):
  1. What it means: a reset was completed with the code sent to the account's mailbox, so Cognito holds the new password;
     but the app's sessions of that account were not ended, the reset was not recorded (no `password_reset_completed`),
     and no password-changed email was queued. The person was answered "could not continue". The second factor still
     guards the account (docs/adr/0081 A5).
  2. Read the line; the alarm names no user. In Logs Insights on `/tp/<env>/web`, for the alarm's period: `fields
     @timestamp, user_id, request_id | filter msg = "security event: password reset sessions not ended"`. Keep the user
     IDs and request IDs only.
  3. Contain at once (section 2, "A user or session"): disable the user and end their sessions, by user ID. This does what
     the failed transaction did not.
  4. Tell the person another way, through their organization's administrator or the account contact, working by user ID:
     their password was changed at the line's time. If it was not them, open the record (section 1) and follow
     support-mail.md's "Password changed, not by me"; if it was, re-enable the user once the administrator confirms it,
     and the person signs in with the new password.
  5. Find the cause: the line carries no error code (the flow's retry drops it), so read the web's and the database's
     errors and alarms in the same minutes (for example, the database's connections, above).
  6. Record it in a ticket by user ID and request ID, never an address or a name.
- "Weekly sign-in review", step 4 (`:171-173`): the list of reset and enrolment alarms gains
  `PasswordResetSessionsNotEnded`.

---

## 10. The rollback section (migration header, ADR 0091 D12, and 9.3)

A rollback redeploys the previous image against the new schema (ADR 0009:42-43; ADR 0049:147, `tp:skipMigrations=true`).
This is the first change that adds a mail kind.
- **The previous web** is the current web: its resets queue notices.
- **The previous platform image**:
  - has no `password_notices` job: notices stay pending, unsent and unreported (the stale sweep is the new job's);
  - cannot read an SES event of kind `password_changed`: `events.ts:165-168` throws `MailEventUnreadable`,
    `mail-events.ts:419-423` logs `MAIL_EVENT_UNREADABLE` and leaves it; after 5 receives (`infra/lib/mail.ts:50`) it moves
    to `tp-<env>-mail-events-dlq` and raises `EventsDeadLetter` (and `EventsQueueAge` past 15 minutes);
  - so notices already sent **stay `sent`**, and their deliveries and bounces go unrecorded, until the events are redriven;
  - selects `operator_record_mail_event`'s six named columns and calls `operator_mail_expire(integer)` (the new body, which
    never deletes a pending notice), so its mail jobs keep working;
  - writes neither reserved action, so the policy change does not touch it.
- **The operator role's statement** stays with the stack (a rollback of the image does not remove it).
- **`PasswordResetSessionsNotEnded`** (5.3) stays with the stack and counts a line the current web already writes, so it
  keeps paging across a rollback of the images.
- **The instruction: roll forward rather than stay back.** After rolling forward: the new job sends every pending notice
  inside the cutoff; every one older than 24 hours fails `NoticeStale` and pages `PASSWORD_NOTICE_UNDELIVERED` one by one
  (the operator tells each person another way, deliverability.md 3.10); then redrive `tp-<env>-mail-events-dlq` so the
  delivered and bounced states, and any `PASSWORD_NOTICE_UNDELIVERED` they raise, are recorded.
- The schema is never rolled back (forward-only); undoing the trigger would be a later migration.

---

## 11. #129 (co-001/email-lockup-plate, open draft, head f4fef908): the overlap and how the build avoids conflict

#129 changes `apps/worker/src/mail/template.ts` (+55/-23: the White plate, `emailHeader()`, the plate art),
`template.test.ts`, `mail.test.ts`, `packages/auth-mail/src/words.ts` (the reset code's O-8 sentence),
`packages/auth-mail/src/render.test.ts` and snapshots, `docs/product/test-matrix.md` (SGN-13's row),
`packages/synth/src/cases/matrix.ts` (SGN-13's assertion), `fixtures/synthetic/SGN-13/expected.json`, ADR 0058, ADR 0081,
BRAND.md, `dev-provider.ts`, `http.test.ts`, `brand.spec.ts`, `sign-in-time.spec.ts`, the root `package.json` and
`tools/brand-email-plate/*`.

How this build stays clear:
- It edits **none** of template.ts, template.test.ts, mail.test.ts, words.ts, render.test.ts, the auth-mail snapshots, ADR
  0058, ADR 0081, BRAND.md, dev-provider.ts, http.test.ts, brand.spec.ts, sign-in-time.spec.ts or the root package.json.
  The message uses template.ts's `'account'` variant through `mailBody`/`mailHtml` as it stands, so whichever header #129
  gives it is the one sent. Its own tests are in new files (6.3, 6.4) and assert words and the absence of links, not the
  header's markup.
- The two shared documents touch different rows: #129 rewrites SGN-13's line (`test-matrix.md:451`, `matrix.ts:813`);
  this PR edits the intro sentence (`:438-439`) and adds SGN-16 after SGN-15, with SGN-14's and SGN-15's lines unchanged
  between, so git merges the two without a conflict. If git does report one, both sides are kept.
- `fixtures/synthetic/SGN-13` (#129) and `SGN-16` (this PR) are different directories; whichever merges second runs
  `pnpm synth --all` and commits what it writes.
- Base updates come by merge only (`git pull --no-rebase` / merging `origin/claude/build-platform` in), never rebase or
  force. If #129 merges before this PR opens, the branch merges it in, regenerates nothing of #129's, and the UX review
  renders again on the plate header before the PR opens (plan review 3).

---
## 12. Against design 9: the exact file list

**New (14):**
1. `packages/db/migrations/20261111090000_password_changed_notice.sql` (the marker route, 13.1)
2. `packages/db/src/password-notice.db.test.ts`
3. `packages/db/functions/audit_event_password_notice.sql` (generated)
4. `packages/db/functions/password_notice_report_undelivered.sql` (generated)
5. `packages/db/functions/operator_password_notices_stale.sql` (generated)
6. `packages/db/functions/operator_password_notices_due.sql` (generated)
7. `packages/db/functions/operator_password_notice_claim.sql` (generated)
8. `packages/db/functions/operator_password_notice_sent.sql` (generated)
9. `packages/db/functions/operator_password_notice_failed.sql` (generated)
10. `apps/worker/src/platform/password-notices.ts`
11. `apps/worker/src/platform/password-notices.test.ts`
12. `apps/worker/src/platform/password-notices.db.test.ts`
13. `docs/adr/0091-tell-an-accounts-address-when-its-password-changes-from-an-outbox-the-database-writes-in-the-changes-own-transaction.md`
14. `fixtures/synthetic/SGN-16/expected.json` (generated, `pnpm synth --all`)

**Changed (45):**
- Database: `packages/db/functions/operator_record_mail_event.sql`, `operator_mail_expire.sql` and `set_updated_at.sql`
  (generated; `set_updated_at.sql` gains one `-- Trigger function of: password_notice.password_notice_updated_at` line,
  3.11, PWN-R1-03);
  `docs/product/domain-model.md` (generated); `packages/db/domain-model/areas.json`; `packages/db/src/schema/operations.ts`;
  `packages/db/src/schema/index.ts`; `packages/db/src/migrate.db.test.ts`; `packages/db/src/hardening.db.test.ts`;
  `packages/db/src/mail.db.test.ts`.
- Logging: `packages/observability/src/fields.ts`.
- Worker: `apps/worker/src/mail/streams.ts`, `apps/worker/src/mail/streams.test.ts`, `apps/worker/src/jobs/platform.ts`,
  `apps/worker/src/jobs/platform.test.ts`, `apps/worker/src/platform/mail-events.ts`,
  `apps/worker/src/platform/mail-events.db.test.ts`, `apps/worker/src/platform/wiring.ts`,
  `apps/worker/src/platform/wiring.test.ts`, `apps/worker/src/worker.test.ts`, `apps/worker/src/config.ts`,
  `apps/worker/src/config.test.ts`, `apps/worker/src/runtime.ts`.
- Web tests and e2e (no web source): `apps/web/src/lib/auth/sign-in.db.test.ts`, `apps/web/e2e/mail.ts`,
  `apps/web/e2e/sign-in.spec.ts`.
- Infra: `infra/lib/constructs/operator-role.ts`, `infra/test/operator-role.test.ts`, `infra/lib/mail.ts`,
  `infra/lib/constructs/monitoring.ts`, `infra/test/mail-streams.test.ts`, `infra/lib/constructs/compute.ts`,
  `infra/test/compute.test.ts`, `infra/lib/security-events.ts` and `infra/test/monitoring.test.ts` (5.3, 0.14; PWN-R1-01).
- Docs: `docs/adr/0065-...md` (dated note), `docs/adr/0014-...md` (job bullet), `docs/product/test-matrix.md`,
  `docs/runbooks/support-mail.md`, `docs/runbooks/deliverability.md`, `docs/runbooks/deploy-and-rollback.md`,
  `docs/runbooks/incident-response.md` (9.4; PWN-R1-01).
- Synth: `packages/synth/src/cases/matrix.ts`, `packages/synth/src/cases/registry.ts`.
- Generated: `tools/screening-capacity/watched-paths.txt` (`pnpm exec tsx tools/screening-capacity/watched.ts --write`:
  password-notices.ts enters the consumer's import closure through jobs/platform.ts; the screening-capacity gate then
  measures this PR).

**Not touched:** `packages/auth-mail/**`, `apps/worker/src/mail/template.ts`, `template.test.ts`, `mail.test.ts`, any web
source (sign-in.ts and its `sessions not ended` line included), `apps/web/src/app/tables.test.ts` (its counts never
change), ADR 0081, ADR 0058, ADR 0088 (5.3, "Records"), SEC-23's row, assertion and registry entry, BRAND.md,
`content/releases/**`, every applied migration, `packages/db/domain-model/approvers.json`, the domain-model approval line,
`divergence-explanations.json` (unless `--strict` names a non-informational divergence), `.gitleaksignore`,
`pnpm-lock.yaml` (no dependency changes: apps/worker already depends on `@tp/auth-mail`), LANES.md and the ops status
files (the orchestrator's records: PR 1's three-review claim row and A6's move are written there, not by this build).

---

## 13. Build order, commits and verification

### 13.1 Builder D (database), in `/home/user/pwnotice`

1. Marker route, followed step by step from `.claude/skills/new-migration/SKILL.md`: one shell command creates
   `/home/user/pwnotice/.claude/.allow-protected-edit` for the write of
   `packages/db/migrations/20261111090000_password_changed_notice.sql` only, with `trap 'rm -f .../.allow-protected-edit'
   EXIT`; the marker is never staged or committed; `test ! -e` before every commit. A refusal stops the build and is
   reported.
2. The Drizzle schema, index, areas.json and the db tests' lists (3.13) before any generation.
3. Under `flock /tmp/laneb-heavy.lock`, on a database `tp_pwn_d_<n>` (PostgreSQL 18, port 5433): `pnpm db:migrate` from
   empty through `20261111090000`, then `pnpm test:db`; dropped when done.
4. `pnpm db:domain-model --out --strict` on a freshly migrated database; commit every function file written or removed
   and domain-model.md (never the approval line). `git status --porcelain packages/db/functions` must show exactly the
   seven new files and the three changed ones of section 12 (`operator_record_mail_event.sql`, `operator_mail_expire.sql`,
   `set_updated_at.sql`); any other path is a finding to explain before the commit, and the PR's function-diff report
   (3.11) lists the same ten.
5. Commits (`git commit -m ... -- <paths>`, each message ending with the two attribution lines):
   (a) the migration, schema and registrations; (b) the db tests; (c) the regenerated domain model and function files,
   `set_updated_at.sql` among them.

### 13.2 Builder W (worker, infra) after D

6. fields.ts, streams.ts, password-notices.ts, platform.ts, mail-events.ts, config.ts, wiring.ts, runtime.ts and their tests;
   `pnpm exec tsx tools/screening-capacity/watched.ts --write`.
7. operator-role.ts, mail.ts, monitoring.ts, compute.ts, security-events.ts and their tests (operator-role.test.ts,
   mail-streams.test.ts, compute.test.ts, monitoring.test.ts: 5.3, 6.8).
8. sign-in.db.test.ts, e2e/mail.ts, sign-in.spec.ts (e2e on ports 4991-4999).
9. Commits: (d) logging fields and the worker job; (e) mail-events' seventh column; (f) infra; (g) web tests and e2e.

### 13.3 Builder M (docs, matrix) after W

10. ADR 0091 (D1-D15), ADR 0065's note, ADR 0014's bullet, test-matrix.md, matrix.ts, registry.ts, the four runbooks
    (support-mail.md, deliverability.md, deploy-and-rollback.md, incident-response.md);
    `pnpm synth --all`. Commit (h).

### 13.4 The integrator's full suite (one at a time under the flock; long ones in the background)

`pnpm install` (no change expected); `pnpm lint`; `pnpm typecheck`; `pnpm lint:logs`; `pnpm verify-content`; `pnpm test`;
`pnpm test:db`; `pnpm test:golden`; `pnpm test:e2e`; `pnpm db:domain-model --check` (without `--require-approval`, which
fails until the founder's line); the infra tests. Push with 2/4/8/16 s retries on a network error; on a rejection,
`git pull --no-rebase` and push again; never `--no-verify`, never force.

---

## 14. Open for the reviews (not decided here)

- Review (1): each N-3 fact of D10, including a sign-in step begun before the reset; the guard; the two reserved actions;
  `PasswordNoticeEmail`'s scope; the two new log fields; the residue's double send; D15: that
  `PasswordResetSessionsNotEnded` counts the one completed-reset path that queues no notice, and that 9.4's steps end the
  account's access and reach the person by user ID alone.
- Review (2): the lock loop and window; the one-ALTER CHECK swap; the DROP/CREATE and re-grant; A-3's lock and its
  no-deadlock argument (T13, T13b, T17: T13 the mirror's side, T13b `_sent`'s, 3.12); the job's race (6.4); the expiry
  rule (A-4); whether the rolling platform deploy can move a
  `password_changed` event to the dead-letter queue; IAM propagation.
- Review (3): renders of the message on the current base and on #129's plate header (light, dark-preferred,
  dark-inverted; 600 and 390 px); the support-mail item's words (O-7).
