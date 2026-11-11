## Changes since the last approved document

- Last approved: `docs/product/domain-model.md` at `origin/claude/build-platform` (commit `2e26a4161b56`), document SHA-256 `bb7662c681fbcc658b9845b83da6a1b8a0df13759a685849cde58d48fb456bf8`: approved by Tyler Williams on 2026-11-11
- New: `docs/product/domain-model.md` in the working tree, document SHA-256 `6002e2afb2b830a519e6edc5de428f312ef3ada3591fa10b18f861cf83beea33`: awaiting approval
- 70 changes: 2 in row-level security, 2 in policies and rewrite rules, 2 in phi registry, 8 in grants and roles, 8 in tables and views, 14 in columns, 16 in constraints and indexes, 10 in functions, 2 in triggers, 2 in divergence rows, 2 in migrations, 1 in cross-checks, 1 in other lines
- Each change is one line. A long changed value shows only the part that changed, between "…".

**Row-level security** (2)

- changed `row-level security (totals)`: `RLS: 92 tables ENABLE and FORCE row-level security; 0 enable without forcing; 8 have none (the global tables); 183 policies` → `RLS: 93 tables ENABLE and FORCE row-level security; 0 enable without forcing; 8 have none (the global tables); 184 policies`
- added `password_notice row-level security`: `enabled, forced; owner tp_owner`

**Policies and rewrite rules** (2)

- changed `audit_event policy audit_event_record`: `PERMISSIVE FOR INSERT TO tp_app; WITH CHECK ((actor_id = app_actor_id()) AND (actor_kind = ANY (ARRAY['user'::text, 'service'::text])) AND (action <> ALL (ARRAY['notice_sent'::text, 'security_event'::text, 'sign_in_failed'::text, 'data_key_destroyed'::text, 'notice_undelivered'::text, 'mail_stream_paused'::text, 'mail_stream_resumed'::text, 'organization_suspended'::text, 'organization_reinstated'::text])) AND ((practice_id IS NULL) OR (practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))))` → `PERMISSIVE FOR INSERT TO tp_app; WITH CHECK ((actor_id = app_actor_id()) AND (actor_kind = ANY (ARRAY['user'::text, 'service'::text])) AND (action <> ALL (ARRAY['notice_sent'::text, 'security_event'::text, 'sign_in_failed'::text, 'data_key_destroyed'::text, 'notice_undelivered'::text, 'mail_stream_paused'::text, 'mail_stream_resumed'::text, 'organization_suspended'::text, 'organization_reinstated'::text, 'password_notice_sent'::text, 'password_notice_undelivered'::text])) AND ((practice_id IS NULL) OR (practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))))`
- added `password_notice policy password_notice_owner`: `PERMISSIVE FOR ALL TO tp_owner; USING true; WITH CHECK true`

**PHI registry** (2)

- changed `PHI flag (totals)`: `PHI flag: 48 tables in phi_table_registry; 4 tenant tables with a nullable practice_id outside it; 40 organization- or user-scoped tables with RLS forced; 8 global tables` → `PHI flag: 48 tables in phi_table_registry; 4 tenant tables with a nullable practice_id outside it; 41 organization- or user-scoped tables with RLS forced; 8 global tables`
- added `password_notice class`: `organization- or user-scoped (RLS, no practice_id)`

**Grants and roles** (8)

- added `password_notice privileges`: `none for any group role`
- added `EXECUTE on audit_event_password_notice()`: `granted to no group role`
- added `EXECUTE on operator_password_notice_claim(uuid)`: `granted to tp_operator`
- added `EXECUTE on operator_password_notice_failed(uuid,text,boolean,text)`: `granted to tp_operator`
- added `EXECUTE on operator_password_notice_sent(uuid,text,text)`: `granted to tp_operator`
- added `EXECUTE on operator_password_notices_due(integer)`: `granted to tp_operator`
- added `EXECUTE on operator_password_notices_stale(integer,text)`: `granted to tp_operator`
- added `EXECUTE on password_notice_report_undelivered(uuid,text)`: `granted to no group role`

**Tables and views** (8)

- changed `tables and views (totals)`: `PostgreSQL 18; schema public: 100 tables (including schema_migrations), 1 view(s); PostgreSQL enum types: 0 (every enumeration is a CHECK constraint)` → `PostgreSQL 18; schema public: 101 tables (including schema_migrations), 1 view(s); PostgreSQL enum types: 0 (every enumeration is a CHECK constraint)`
- changed `area Operations`: `… delivery by SES's message ID (no address), the screening's refusal list (a keyed hash of an add…` → `… delivery by SES's message ID (no address), the password-changed notices' outbox (a user's ID and the change's time, no address), the screening's refusal list (a keyed hash of an add…`
- added `password_notice area`: `Operations`
- changed `audit_event created by`: `…_mail_streams, 20261108090000_suspension_refusal` → `…_mail_streams, 20261108090000_suspension_refusal, 20261111090000_password_changed_notice`
- changed `mail_send created by`: `20261107090000_mail_streams (ADR 0065)` → `20261107090000_mail_streams (ADR 0065); its DDL, policies or trigger functions changed by 20261111090000_password_changed_notice`
- added `table password_notice`
- added `password_notice Data dictionary entry`: `not in the Data dictionary`
- added `password_notice created by`: `20261111090000_password_changed_notice (ADR 0009, ADR 0049, ADR 0065, ADR 0081, ADR 0083, ADR 0091, ADR 0092)`

**Columns** (14)

- changed `mail_send.kind`: `text; NOT NULL; since 20261107090000; one of cognito, digest, dunning, support_grant_opened, support_grant_closed, screening_result, screening_failed, screening_reminder, screening_withdrawal, probe` → `text; NOT NULL; since 20261107090000; one of cognito, digest, password_changed, dunning, support_grant_opened, support_grant_closed, screening_result, screening_failed, screening_reminder, screening_withdrawal, probe`
- added `password_notice.id`: `uuid; NOT NULL; default gen_random_uuid(); since 20261111090000`
- added `password_notice.user_id`: `uuid; NOT NULL; references user(id); since 20261111090000`
- added `password_notice.audit_event_id`: `uuid; NOT NULL; since 20261111090000`
- added `password_notice.changed_at`: `timestamp with time zone; NOT NULL; since 20261111090000`
- added `password_notice.state`: `text; NOT NULL; default 'pending'::text; since 20261111090000; one of pending, sent, delivered, undelivered, failed`
- added `password_notice.attempts`: `smallint; NOT NULL; default 0; since 20261111090000`
- added `password_notice.next_attempt_at`: `timestamp with time zone; NOT NULL; default now(); since 20261111090000`
- added `password_notice.ses_message_id`: `text; null; since 20261111090000`
- added `password_notice.error_code`: `text; null; since 20261111090000`
- added `password_notice.sent_at`: `timestamp with time zone; null; since 20261111090000`
- added `password_notice.undelivered_reported_at`: `timestamp with time zone; null; since 20261111090000`
- added `password_notice.expires_at`: `timestamp with time zone; NOT NULL; since 20261111090000`
- added `password_notice.updated_at`: `timestamp with time zone; NOT NULL; default now(); since 20261111090000`

**Constraints and indexes** (16)

- changed `mail_send check mail_send_kind`: `… = ANY (ARRAY['cognito'::text, 'digest'::text, 'dunning'::text, 'support_grant_opened'::text, 's…` → `… = ANY (ARRAY['cognito'::text, 'digest'::text, 'password_changed'::text, 'dunning'::text, 'support_grant_opened'::text, 's…`
- changed `mail_send check mail_send_stream_kind`: `…= ANY (ARRAY['cognito'::text, 'digest'::text, 'probe'::text])) OR stream = 'notices'::text AND (…` → `…= ANY (ARRAY['cognito'::text, 'digest'::text, 'password_changed'::text, 'probe'::text])) OR stream = 'notices'::text AND (…`
- added `password_notice primary key`: `(id)`
- added `password_notice unique password_notice_once`: `UNIQUE (audit_event_id)`
- added `password_notice unique password_notice_ses_message_id_key`: `UNIQUE (ses_message_id)`
- added `password_notice foreign password_notice_user_id_fkey`: `(user_id) -> user(id), on delete no action`
- added `password_notice index password_notice_by_expiry`: `USING btree (expires_at)`
- added `password_notice index password_notice_pending`: `USING btree (next_attempt_at) WHERE (state = 'pending'::text)`
- added `password_notice check password_notice_attempts`: `CHECK (attempts >= 0 AND attempts <= 5)`
- added `password_notice check password_notice_error_code`: `CHECK (error_code ~ '^[A-Za-z]{1,64}$'::text)`
- added `password_notice check password_notice_expiry_window`: `CHECK (expires_at > changed_at AND expires_at <= (changed_at + '91 days'::interval))`
- added `password_notice check password_notice_failed`: `CHECK ((state = 'failed'::text) = (error_code IS NOT NULL))`
- added `password_notice check password_notice_message_id`: `CHECK (ses_message_id ~ '^[A-Za-z0-9-]{20,100}$'::text)`
- added `password_notice check password_notice_reported`: `CHECK (undelivered_reported_at IS NULL OR (state = ANY (ARRAY['undelivered'::text, 'failed'::text])))`
- added `password_notice check password_notice_sent`: `CHECK ((ses_message_id IS NULL) = (state = ANY (ARRAY['pending'::text, 'failed'::text])) AND (ses_message_id IS NULL) = (sent_at IS NULL))`
- added `password_notice check password_notice_state`: `CHECK (state = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'undelivered'::text, 'failed'::text]))`

**Functions** (10)

- changed `functions, triggers and rewrite rules (totals)`: `Functions in public: 383 (174 SECURITY DEFINER); triggers: 279, none disabled or replica-only; rewrite rules on tables: none` → `Functions in public: 390 (180 SECURITY DEFINER); triggers: 281, none disabled or replica-only; rewrite rules on tables: none`
- added `audit_event_password_notice()`: `returns trigger; plpgsql; SECURITY DEFINER; volatile; config search_path=pg_catalog, public, pg_temp; body e0e771daa158c3d4`
- changed `operator_mail_expire(integer)`: `returns integer; plpgsql; SECURITY DEFINER; volatile; config search_path=pg_catalog, public, pg_temp; body faa298581d4c5479` → `returns integer; plpgsql; SECURITY DEFINER; volatile; config search_path=pg_catalog, public, pg_temp; body 1483c2862d633565`
- added `operator_password_notice_claim(uuid)`: `returns TABLE(user_id uuid, email text, changed_at timestamp with time zone, mfa_enrolled boolean); plpgsql; SECURITY DEFINER; volatile; config search_path=pg_catalog, public, pg_temp; body 600ad9dfc04e5a6b`
- added `operator_password_notice_failed(uuid,text,boolean,text)`: `returns boolean; plpgsql; SECURITY DEFINER; volatile; config search_path=pg_catalog, public, pg_temp; body 11734c20b5241fd1`
- added `operator_password_notice_sent(uuid,text,text)`: `returns boolean; plpgsql; SECURITY DEFINER; volatile; config search_path=pg_catalog, public, pg_temp; body 6028322ec0a02407`
- added `operator_password_notices_due(integer)`: `returns TABLE(notice_id uuid, user_id uuid); sql; SECURITY DEFINER; stable; config search_path=pg_catalog, public, pg_temp; body d3ca686c261a2915`
- added `operator_password_notices_stale(integer,text)`: `returns TABLE(notice_id uuid, user_id uuid); plpgsql; SECURITY DEFINER; volatile; config search_path=pg_catalog, public, pg_temp; body 04e09af840e2d487`
- changed `operator_record_mail_event(text,text,text,timestamp with time zone,timestamp with time zone,text,text,uuid,uuid,uuid,text,text,text,text)`: `… invitation_undelivered uuid, stream_paused text); plpgsql; SECURITY DEFINER; volatile; config search_path=pg_catalog, public, pg_temp; body 3c175325fc14b48c` → `… invitation_undelivered uuid, stream_paused text, password_notice_undelivered uuid); plpgsql; SECURITY DEFINER; volatile; config search_path=pg_catalog, public, pg_temp; body d0c75c27551b0f52`
- added `password_notice_report_undelivered(uuid,text)`: `returns boolean; plpgsql; security invoker; volatile; config search_path=pg_catalog, public, pg_temp; body b23f74d3c9743621`

**Triggers** (2)

- added `audit_event trigger audit_event_password_notice`: `AFTER INSERT ON audit_event FOR EACH ROW WHEN (new.action = 'password_reset_completed'::text AND new.actor_kind = 'user'::text AND new.object_type = 'user'::text AND new.object_id = new.actor_id) EXECUTE FUNCTION audit_event_password_notice… (2 more characters)`
- added `password_notice triggers that maintain updated_at`: `password_notice_updated_at`

**Divergence rows** (2)

- changed `divergences (totals)`: `Divergences from the Data dictionary: 23 to approve, 52 tables and 150 columns not in it (informational); see Divergences from the Data dictionary` → `Divergences from the Data dictionary: 23 to approve, 53 tables and 150 columns not in it (informational); see Divergences from the Data dictionary`
- added `D22 password_notice (table not in the Data dictionary)`: `area Operations; organization- or user-scoped (RLS, no practice_id); created by 20261111090000_password_changed_notice; explained by ADR 0009, ADR 0049, ADR 0065, ADR 0081, ADR 0083, ADR 0091, ADR 0092`

**Migrations** (2)

- changed `migrations applied (totals)`: `Migrations applied: 48; head 20261110090000_ledger_interest_once.sql` → `Migrations applied: 49; head 20261111090000_password_changed_notice.sql`
- added `20261111090000_password_changed_notice.sql`: `ADRs ADR 0009, ADR 0049, ADR 0065, ADR 0081, ADR 0083, ADR 0091, ADR 0092; SHA-256 e1288b9c074ced20fc8d08b7d64001786a7d29b23ae3d1695eff551eb20ea0eb`

**Cross-checks** (1)

- changed `Cross-checks`: `Drizzle tables: 99; migrated tables (excluding schema_migrations): 99` → `Drizzle tables: 100; migrated tables (excluding schema_migrations): 100`

**Other lines** (1)

- changed `Approval`: `…t describes the schema at migration head 20261110090000_ledger_interest_once.sql (48 migrations). Approving it approves the schema a…` → `…t describes the schema at migration head 20261111090000_password_changed_notice.sql (49 migrations). Approving it approves the schema a…`

## Function definitions changed since origin/claude/build-platform

- These are the files in `packages/db/functions` in the working tree, not regenerated by this run: `pnpm db:domain-model --check` on a freshly migrated database (a required step of the domain model job) proves they equal the functions of the migrated catalog.
- Compared: `packages/db/functions` at `origin/claude/build-platform` (commit `2e26a4161b56`) with the files in `packages/db/functions` in the working tree.
- 10 files changed (7 added, 0 removed), 8 of them first (SECURITY DEFINER, tenant scope, privileges or PUBLIC), then by name; each with the lines it adds and removes:

- `packages/db/functions/audit_event_password_notice.sql` +22/-0 (added; SECURITY DEFINER, tenant scope, privileges or PUBLIC)
- `packages/db/functions/operator_mail_expire.sql` +5/-1 (SECURITY DEFINER, tenant scope, privileges or PUBLIC)
- `packages/db/functions/operator_password_notice_claim.sql` +28/-0 (added; SECURITY DEFINER, tenant scope, privileges or PUBLIC)
- `packages/db/functions/operator_password_notice_failed.sql` +35/-0 (added; SECURITY DEFINER, tenant scope, privileges or PUBLIC)
- `packages/db/functions/operator_password_notice_sent.sql` +45/-0 (added; SECURITY DEFINER, tenant scope, privileges or PUBLIC)
- `packages/db/functions/operator_password_notices_due.sql` +22/-0 (added; SECURITY DEFINER, tenant scope, privileges or PUBLIC)
- `packages/db/functions/operator_password_notices_stale.sql` +36/-0 (added; SECURITY DEFINER, tenant scope, privileges or PUBLIC)
- `packages/db/functions/operator_record_mail_event.sql` +17/-2 (SECURITY DEFINER, tenant scope, privileges or PUBLIC)
- `packages/db/functions/password_notice_report_undelivered.sql` +29/-0 (added)
- `packages/db/functions/set_updated_at.sql` +1/-0

## What changes

- **A person whose password was reset is told.** Within about a minute of a completed reset, the account's own address gets "Your password was changed | PaidWhole": when it changed (UTC), that every session of the account has ended, that signing in still asks for the authenticator code or hardware key (said only to an account that has one enrolled), to ignore the email if they changed it, and otherwise to write to the support address from the address they sign in with and to tell their organization's administrator. A reply goes to the support address. It carries no link.
- **How it is sent.** The database queues the notice in the reset's own transaction (a trigger on the reset's audit event writes the new table `password_notice`, which holds no address and no name). A new platform job, `password_notices`, sends it every minute as the operator role, retries after 1, 5, 15 and 60 minutes, never sends one more than 24 hours late, and records what SES reports.
- **An operator is paged** for every notice that was not delivered or not sent in time (`PASSWORD_NOTICE_UNDELIVERED`), for a notice whose record failed after SES accepted the message, so that a second copy is on its way (`PasswordNoticeRecordFailed`), for a completed reset whose sessions could not be ended (`PasswordResetSessionsNotEnded`) and for one whose sign-out at the identity provider failed (`PasswordResetProviderSignOutFailed`). Each has a runbook section.
- **In the web:** the reset now looks the account up before it asks the provider to change the password, so a database that cannot be reached changes nothing; the console's mail page names the new kind. Nothing else in the web changes.
- **Running the build:** migration `20261111090000_password_changed_notice.sql` takes three table locks without queueing (it tries once a second for up to five minutes and fails the deploy before any service moves if it never finds a free moment). Measured over 500,000 synthetic mail records, it holds them for about 0.3 seconds.

## Why

ADR 0091 (new in this pull request), test matrix SGN-16. It is part 2 of the auth emails (part 1 was #125) and schema PR 1 of the queue after #126. It closes ADR 0081's "password changed" item and #125's review findings security-N-3 and ux-brand-N5.

## The trade-off for the founder (ADR 0091, D10)

The email says "Every session of this account has ended." That is true of every session open at the reset. The security review of this pull request showed what can still happen in the minutes after a reset:

- **(a) For up to 3 minutes:** someone who already had the old password accepted and was waiting at the second-factor step can still finish that sign-in with a current code, and gets a normal session. They need a working second factor for the account as well as the old password.
- **(b) For up to 15 minutes, and only if the identity provider's own sign-out failed at the reset:** someone who was in the middle of registering a hardware key (password and code already accepted) can finish registering it. That key then signs in without a password, and a later reset does not remove it. Only an account that must sign in with a hardware key and has none yet is ever in that step: PaidWhole's own staff accounts, never a customer's. Nothing an operator holds removes such a key today (`LANES.md` Queues item 29, not yet assigned).
- **(c) Not proven without a real user pool:** if the provider changes the password and its answer is lost on the way back, the person is told the code did not match although the password has changed; no session ends, no email is sent and nobody is paged.
- **(d) While the user pool's client is public (until ADR 0088's next release, due before the first customer invitation), and not proven without a real user pool:** someone who reads the mailbox of an invitee with a password and no second factor can reset that password from outside the app, sign in and enrol their own authenticator before the email is sent. The email then says "Signing in still asks for your authenticator code or hardware key.", because that sentence follows the account as it is when the email is sent, not as it was at the reset. Two reviewers of the review round found it independently.

**What this pull request does:** it keeps the line; it pages an operator whenever the provider's sign-out fails, which is what (b) needs; it records (a) and (b) as test cases named as open residuals. **The close** is to refuse any sign-in step begun before the account's latest completed reset, and to cover (c); the fix for (d), keeping the second-factor fact as it was at the reset, is asked to ride with it. It changes sign-in, so it is its own reviewed change: `LANES.md` Queues item 28, the next schema pull request, in build now, stacked on this one, and required before launch.

**The alternative:** hold this pull request until the close is built into it; no password-changed email ships until then.

Committing the approval line accepts shipping the email with (a) to (d) open until the next schema pull request. To take the alternative, say so instead of committing.

## Decided by the build in the review round, for the founder to see (each reversible)

- **The email's words changed from #125's.** Line 3 is now "If you changed it, ignore this email." (the old "there is nothing more to do" was untrue for a locked account, which is told on purpose). Line 4 is now "If you did not, write to <support address> now from the address you sign in with, and tell your organization’s administrator. We will help you secure the account." (the old single route ends in silence for a sender whose domain SES cannot verify and for a disabled account). Line 2's second sentence goes only to an account with a second factor enrolled.
- **Reply-To.** This one kind is sent with Reply-To the support address, as the screening stream has by the founder's ruling Q12. Most replies arrive withheld by the support inbox's patient-information screen, because the email they quote holds a date and an address; the support playbook now says how the desk answers them.
- **No control disables a user.** The runbooks name what exists: End membership on the console's organization page (it ends every session of the user and signs them out at the provider). They send to the founder's break-glass session what that control cannot do: an organization's only practice administrator, a failed provider sign-out, and removing a hardware key registered in case (b).
- **Not built here, tracked as follow-ups** in `approval-summaries/lane-a-auth-emails-status.md` on `claude/build-ops`: a withheld support ticket that names the notice it answers; the console showing a user's ID (today no screen turns a user ID from an alarm into a person); a console control that disables a user; the shared email template keeping a date whole and wrapping a long address; the notice's age beside its UTC time; the second-factor fact kept as it was at the reset (case (d)); the screening stream's pause line when a queue delete fails; three more assertions on the migration's lock loop.

## What it does not change

- Pricing engine (`packages/pricing`): nothing.
- Ledger (`packages/ledger`): nothing.
- Database schema and migrations: one new migration, `20261111090000_password_changed_notice.sql`. No applied migration is edited. It adds `password_notice`, a trigger on `audit_event`, five operator functions and a helper; widens two CHECKs on `mail_send`; recreates `operator_record_mail_event()` with a seventh column and replaces `operator_mail_expire()`; recreates the policy `audit_event_record` with two more reserved actions. No PHI table, no ledger, rule or pricing table.
- Content releases (`content/`): nothing.
- Domain model (`docs/product/domain-model.md`), its approval line and `approvers.json`: the document is regenerated; its approval line is blank for the founder; `approvers.json` is untouched.
- CI and the GitHub settings: nothing.
- Also unchanged: the Cognito user pool and its message trigger; the code emails of #125; every other email's text and HTML; SS-01 D11 and ADR 0081 A6, which do not ride.

## Checks

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`, `screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

| Command | Result |
| --- | --- |
| `pnpm typecheck` | passed (23 projects) |
| `pnpm lint`; `pnpm lint:copy` (603 files); `pnpm lint:logs` (1,195 files) | passed |
| `pnpm check:fixtures`; `pnpm verify-content`; `pnpm synth --all` | passed; synth had nothing to write |
| `pnpm db:domain-model --check --strict` on a fresh database (49 migrations) | passed. `--require-approval` fails only on the blank approval line, as it must until the founder commits it |
| The change's own database tests on ffa44ea9 (`vitest --project db`: `packages/db`, the worker's platform and support files, the web's sign-in files; 35 files) | 1,733 passed, 1 skipped (the restore drill's own skip without `pg_dump`) |
| The change's own unit tests on ffa44ea9 (`vitest --project unit`: the worker, infra, `packages/db`, synth, observability, auth-mail, the two lint tools; 155 files) | 2,709 passed |
| Each code change of the review round | failed before and passed after, by its own test |
| The full local suite, once (unit, golden and oracle on ffa44ea9; the database suite in four shards, build and e2e on 7da699b1, which differs by one test file) | unit 13,354 passed, 4 skipped (498 files); golden 381 passed; oracle agrees on all 738 synthetic fixtures; database 10,137 passed, 1 skipped (161 files); build passed; e2e 86 passed |
| The reset journey with the trigger disabled in its own e2e database (the red run) | failed, as it must, at the assertion that a notice was sent |
| CI on ffa44ea9, then 7da699b1 | The first run failed one new test in `db (4/4)`: PostgreSQL 18.6 holds ACCESS SHARE on `"user"`'s primary-key index after adding the foreign key, where the local 18.4 holds none. The test now admits an index of the loop's three tables in that weakest mode and nothing else (7da699b1); the migration is unchanged and applied on 18.6. On 7da699b1 every check passed (unit, db 1 to 4, e2e 1 and 2, static, lint, build, images, capacity, `screening-capacity gate`, `approval-of-record`, `mutation` with its 18 shards) but `domain model`, on the blank approval line alone, and `all green` with it |
| On abdc2192 (the fixes from the review of the review round: records, infra, `.gitattributes`; no schema change) | typecheck, lint, lint:copy, lint:logs, check:fixtures passed; infra, observability and synth unit tests 1,099 passed (46 files). CI on this head is the record |
| `mutation` (Stryker) | not run locally: 18 shards are affected only through `packages/db/src/schema`. CI's required job passed on 7da699b1 |

## Reviewer agents' findings

Three reviews of the tree before the review round (f8560588): security and sign-in (adversarial, with the security reviewer's checklist), database, mail and deploy (adversarial), UX and brand (with renders of the email at 600, 390 and 320 px, light, dark-preferred and dark-inverted; the email is new, so there is no "before"; the only screen change is one label on the console's mail page, made in the review round and judged from the code, not seen). All 33 findings were checked against the code before anything was changed, and all are real. Findings, evidence and rulings: `approval-summaries/lane-a-wip/pwnotice/reviews/` on `claude/build-ops`. "Fixed" means in this pull request's review-round commits (`e4a6e8c1` to `ffa44ea9`, and `7da699b1` for CI's PostgreSQL).

| Reviewer | Finding | Resolution |
| --- | --- | --- |
| Security | SEC-01 (blocking): a sign-in step begun before a reset can finish after it; D10's own gate | Ruled (see the trade-off above): both cases stated in D10, recorded under SGN-16, the provider sign-out's failure paged; the close deferred to Queues item 28 |
| Security | SEC-02: a reset completed while the database is unreachable queued nothing and paged nobody | Fixed: the account is looked up before the provider's confirm |
| Security | SEC-03: two of D10's facts hold only once the Cognito client is confidential | Fixed: the second-factor sentence follows `mfa_enrolled`; D10 names what waits on ADR 0088's next release |
| Security | SEC-04: the runbooks told the operator to "disable the user", which no control does | Fixed: the runbooks name End membership and the founder's break-glass |
| Security | SEC-05 (note): the address is read at send time; no route changes it today | Fixed in the record: "Revisit when" |
| Security | SEC-06 (note): a page can be lost or shared; nothing reads the audit record | Fixed: the line is written before the queue's delete; the runbook reads from the alarm's start to OK; a weekly review step |
| Security | SEC-07 (note): copies unbounded while the record of an accepted message fails | Fixed: that try is counted (five copies at most) |
| Security | SEC-08 (note): the send's record took the state of any mail record | Fixed: it reads only a `password_changed` record |
| Security | SEC-09 (note): a reply went to the sender's address | Fixed: Reply-To the support address |
| Database | DB-01: the page was written after the queue's delete, so a failed delete lost it | Fixed |
| Database | DB-02: a notice whose record fails is sent again every run and blocks the rest | Fixed (with SEC-07) |
| Database | DB-03: the header, ADR and runbook said requests "wait and then proceed"; since #137 a signed-in request is refused as busy after three seconds | Fixed in all three |
| Database | DB-04: the lock-loop test passed on a loop that keeps its locks while it waits | Fixed: the test asserts no lock is held at each pause; the mutant fails it |
| Database | DB-05: the runbook did not say what refuses the loop | Fixed |
| Database | DB-06 (note): no test of the whole file's locks or of the preflight's refusals | Fixed: both added |
| Database | DB-07 (note): the preflight compared substrings | Fixed: SHA-256 of the two replaced bodies and of the policy's expression (the same value on PostgreSQL 16 and 18) |
| Database | DB-08 (note): the job could hold one of two operator connections through a backlog | Fixed: a run stops claiming after 8 seconds of sending |
| Database | DB-09 (note): "pages one by one"; the dead-letter queue's 14 days | Fixed in the records |
| Database | DB-10 (note): two tests rested on seconds between statements | Fixed |
| Database | DB-11 (note): the description must name the hazards | Done under "Domain model" below |
| UX and brand | UX-01: a reply to the email is withheld at the support desk and the playbook did not say so | Fixed in the playbook and by Reply-To; naming the notice on a withheld ticket is deferred (follow-up) |
| UX and brand | UX-02: for three kinds of reader the one route out ended in silence | Fixed: line 4 names a second route |
| UX and brand | UX-03: "nothing more to do" was untrue for a locked account | Fixed: line 3 |
| UX and brand | UX-04: one page can stand for many notices; the records said "one by one" | Fixed in the alarm's words, the runbooks and the ADR |
| UX and brand | UX-05: nothing turns a user ID into a person | Fixed in the runbooks (the path that exists); the console showing the ID is deferred (follow-up) |
| UX and brand | UX-06: "disable the user" names no control | Fixed (with SEC-04) |
| UX and brand | UX-07 (note): a date can break across lines | Deferred (follow-up): the shared template changes every email |
| UX and brand | UX-08 (note): the stream's label named three kinds | Fixed on the console and in the bounce alarm |
| UX and brand | UX-09 (note): UTC to the minute serves a late notice less | Deferred (follow-up), with the baseline's UX-027 |
| UX and brand | UX-10 (note): the text alternative had no footer | Fixed for this email's variant |
| UX and brand | UX-11 (note): a long or hyphenated support address wraps badly | Deferred (follow-up), with UX-07 |
| UX and brand | UX-12 (note): the copy lint did not read the job's file | Fixed |
| UX and brand | UX-13 (note): the reason codes were called SES's alone | Fixed in the runbook and the records |

A review of the review round's own changes (two adversarial reviewers, on ffa44ea9) found no blocking finding, six to fix and eight notes; all are real. "Fixed" below means in `abdc2192`.

| Reviewer | Finding | Resolution |
| --- | --- | --- |
| Sign-in, words, records | DS-01: the new page's runbook had the operator take the person's own next sign-in for a takeover and end their membership | Fixed: a hardware key registered since the reset is the sign; a sign-in by authenticator code is the person's own |
| Sign-in, words, records | DS-02: the statement that finds a user's practices named a client's organization for a billing firm's member | Fixed: only practices of the user's own organization; no row means tell no one there |
| Sign-in, words, records | DS-03 (and DD-01, the same finding): the second-factor sentence follows the account as the send finds it | Not built here: case (d) of the trade-off; recorded in ADR 0091 D4 and D10; its fix is asked to ride with Queues item 28 |
| Sign-in, words, records | DS-04 (note): whose accounts case (b) can touch, and where removing a key is queued | Fixed in D10 and in the trade-off above |
| Sign-in, words, records | DS-05 (note): the break-glass words for an organization's only practice administrator | Fixed |
| Sign-in, words, records | DS-06 (note): tokens taken at the provider directly outlive the 15 minutes while the client is public | Fixed in the runbook and D10 |
| Sign-in, words, records | DS-07 (note): the undelivered alarm's words left out a failed record | Fixed |
| Sign-in, words, records | DS-08 (note): a fourth completed reset that neither queues nor pages (a web task stopped between the provider's answer and the line) | Fixed in D15 |
| Database, worker, mail | DD-02: after the review round nothing paged for a failing record until the fifth copy, about 81 minutes in | Fixed: `PasswordNoticeRecordFailed` pages on the first |
| Database, worker, mail | DD-03: the preflight compares two bodies and one expression, not everything the file restates | Recorded in ADR 0091 D11 (what is compared and what is not); the migration is not edited |
| Database, worker, mail | DD-04 (note): a failed queue delete after a record that paused the screening stream logs no pause line | Deferred (follow-up): the base's order |
| Database, worker, mail | DD-05 (note): the lock tests miss a lock taken before the loop, a sleep with all three held and a shorter loop | Deferred (follow-up): three assertions for the next migration that copies the loop |
| Database, worker, mail | DD-06 (note): the pinned hashes depend on line ends and on a session setting | Fixed for line ends (`.gitattributes`); the setting fails closed and nothing sets it |

## Freeze exception

No: it changes none of them.

## Domain model

The summary that opens this description is the whole output of `pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs list`. Document SHA-256 before: `bb7662c681fbcc658b9845b83da6a1b8a0df13759a685849cde58d48fb456bf8` (approved with #126). After: `6002e2afb2b830a519e6edc5de428f312ef3ada3591fa10b18f861cf83beea33`, awaiting approval. The copy in the `domain model` check's job summary is the one that counts. The build posts the approval line as a suggested change and never writes it.

Hazards in the changed function files, read as diffs against the new-migration list:

- **A grant to a role that did not have one, five times:** EXECUTE on the five new operator functions to `tp_operator`. `operator_password_notice_claim(uuid)` is the one that hands the operator role an account's address, for a pending, due notice under 24 hours old, under its row lock.
- **A new SECURITY DEFINER trigger function,** `audit_event_password_notice()`, owned by `tp_owner`, granted to no role, fired for every role's insert into `audit_event` that matches its guard (the person records their own completed reset).
- None of the others: every definer names `search_path = pg_catalog, public, pg_temp`; no `set_config` or `SET` of `app.practice_ids` or `app.actor_id`; no built SQL; no LEAKPROOF, no STRICT removed; no volatility change; no grant to PUBLIC; no owner change; no overload of a scope function; `operator_record_mail_event()` keeps `operator_assert_scope`. `set_updated_at.sql` gains a caller line only.

## The founder's approval

This pull request merges only after the founder's approving GitHub review of its latest commit and green required checks. The build waits for that review from the day it works under its own GitHub account (`docs/runbooks/github-governance.md`, 3i), and from step 5 GitHub requires it too; before 3i, on green checks alone (reconciliation 001, D4 (a)). The review is the record of the approval, not anything written here; a new commit dismisses it. The build then merges, and never reviews.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_019i9if9f2m3xyLBavfHUgui
