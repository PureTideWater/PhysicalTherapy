# SS-01: a suspended organization's people start no new work wherever they reach, and PaidWhole's suspension keeps its reason (Lane A schema PR)

Design contract, 2026-10-27, against `claude/build-platform` at e908c21 and PR 6b-4 (#42, `co-001/pr-06b-mail-streams`,
head 098636e3, migration `20261107090000_mail_streams.sql`). Branch `co-001/ss-01-suspension-refusal`, opened only after
#42 merges (LANES.md rule 2: one schema PR at a time). Reserved: ADR 0080; test-matrix BIL-07 to BIL-10;
`packages/synth` cases BIL-07 to BIL-10 (module 15). Claim: LANES.md row 185.

Sources: LANES.md "Handed to Lane A" (2026-10-26, from #56); `approval-summaries/lane-b-ux-suspended-standing-status.md`
("Handed to Lane A"); `designs/lane-b-ux-suspended-standing.md` ("After the design review", SS-01 to SS-14);
`designs/lane-b-ux-review.md` §5 (UX-004 is its only suspension item) and the console findings that touch the same card
(UX-046, UX-203, UX-204); the two scouts' reports (`progress/design-ss01-database.md`, `progress/design-ss01-application.md`).
Every claim below was re-read at e908c21 or at #42's head, and the database claims were probed on a database migrated
from empty through #42 (section 17).

This is a schema change, so it needs the founder's SHA-256 approval of the regenerated domain model. It reverses no
founder ruling (section 9). It touches no money computation, no pricing or ledger package and no freeze.

---

## 0. In ten lines

1. **SS-01, fixed as the tenancy model reads it.** A suspended or closed organization's people start no new work at any
   practice they reach only through that organization's grant. The practice's own staff, its other grantees and its
   own jobs carry on. The owner's suspension still stops the practice for everyone, jobs included.
2. **Both places.** The handler asks the database (`practice_run_refusal`, unchanged signature). The database refuses
   the same work at the same seven triggers, now actor-aware.
3. **PaidWhole's suspension keeps its reason.** It stores a closed-list reason and the time on `organization`, and an
   append-only history row with an internal note, actor and time. One definer setter writes it, with a person check, a
   platform-permission check and an audit action `tp_app` may not write. The console form asks for the reason, the note
   and a consequence tick.
4. **The words.** Every refusal says "PaidWhole", never "a platform administrator". Each one says whose suspension it is
   and what restarts the work. No organization name goes into a database message.
5. **SS-08.** The dunning mail chooses its words when it is sent, from the organization's kind and status. It never
   says "New runs have started again" while PaidWhole's suspension or a closure holds, and it never promises a firm, or
   a closed group, anything about runs.
6. **Closed stays closed.** No reopen now. The database refuses any status change into or out of `closed` except the
   owner's, and refuses suspending the internal organization.
7. **One migration and one ADR.** ADR 0080, with dated amendments on #42's final text of ADRs 0050 and 0055.
8. **Two follow-ups get their own PRs:**
   - a schema PR right after this one: the suspension and reinstatement mail, and the founder's Q13 (suspension waits
     for a delivered notice or a recorded contact);
   - the closure lifecycle, at milestone 12.

---

## 1. The problem, with evidence

### 1.1 What the code does (e908c21; #42 changes none of it)

| What | Where | What it does |
| --- | --- | --- |
| `organization_run_refusal(uuid)` | `packages/db/migrations/20261029150000_billing.sql:268-279` (`packages/db/functions/organization_run_refusal.sql:14-18`) | Reads one organization's `status`, then `billing_standing`. Its words: "the organization is suspended: its data stays readable, and new runs start again once a platform administrator reinstates it". |
| `practice_run_refusal(uuid)` | billing.sql:281-293 | Checks `practice_in_scope`, then returns `organization_run_refusal(p.organization_id)`: the **owning group only** (:289). |
| `refuse_new_work_while_suspended()` | billing.sql:297-308 | Repeats the owning-group-only lookup (:302) and raises 55000 with the words. |
| The seven triggers | billing.sql:310-318 | `pricing_run`, `audit_report`, `report_document`, `roi_statement` and `digest` on insert; `source_document` on insert of a top-level document; `packet_version` when `exported_at` is first set. |
| A firm's reach | `20261015140000_tenancy.sql:95-116` (`grant`); `packages/db/functions/effective_practice_access.sql` (the `'grant'` branch) | A firm owns no practice. It reaches each one only through a grant in force. The grant branch ignores the grantee's status. |
| The console's suspend | `apps/web/src/lib/routes/console.ts:90-113` at #42's head (a #42 file) | Input `{organizationId, status: suspended or active}`. It refuses `closed` and `internal` **in the handler only** (:98-106), then runs a direct `UPDATE organization SET status` as `tp_app` (:107). The wrapper audits `organization_status_set` with no status and no reason, the no-op included. |
| Postgres behind it | tenancy.sql:494 (policy), :596-597 (`GRANT INSERT (…, status)`, `GRANT UPDATE (name, billing_customer_ref, status)`) | A platform administrator acting as `tp_app` may set any status on any organization: close one, reopen a closed one, or suspend the internal one. |
| The console card | `apps/web/src/app/console/organizations/[organizationId]/page.tsx:54-76` | "Suspending refuses new runs for every practice of the organization (pricing, monitoring, packet exports, reports and uploads)". For a firm this is false: it owns no practice, and its suspension refuses nothing. The list also leaves out triage, which is refused (`apps/web/src/lib/billing/runs.ts:13`). |
| Dunning (SS-08) | `apps/worker/src/billing/dunning.ts:234-237`, words at :93-113, at #42's head (a #42 file) | Downgrades `reinstated` to `resolved` only when `billing_standing` is still suspended. It never reads `organization.status`, so a paid invoice mails "Invoice X is paid. New runs have started again." while PaidWhole's suspension or a closure holds. The due query (:211-221) has no kind filter, so a firm's owners read "New runs stop on …" and "new runs have stopped", though a firm's nonpayment refuses nothing (ADR 0050:118; `packages/billing/src/standing.ts:7-9`). |
| Where the reason is stored | nowhere | `organization` has `status` only (tenancy.sql:19-27). `audit_event.purpose` is a code (`^[a-z][a-z0-9_]{0,63}$`, `20261015140500_audit_and_operations.sql:15`), and the console writes none. The customer's billing page cannot say why (UX-004; #56's SS-06: "Suspended by PaidWhole" carries no date). |

### 1.2 The defect reproduced (probe on `tp_design_ss01_10`, migrated from empty through #42)

The world: group G owns practice P; firm F holds a grant in force on P; F's principal is a member of F. Synthetic
throughout (`probes/ss01-world.sql`, `probes/ss01-author-proto.sql`).

| # | State | Result today |
| --- | --- | --- |
| P1 | F suspended; F's principal asks `practice_run_refusal(P)` in a request scope | `NULL`: no refusal |
| P2 | Same; F's principal inserts a top-level `source_document` for P (the upload path, `apps/web/src/lib/routes/uploads.ts:243`) | The row is recorded: the database lets it through |

The database scout's probes found the same for a closed F, and for a `digest` insert. They also found that F's
nonpayment holds nothing on P, and that a platform administrator can reopen a closed organization through `tp_app`.

### 1.3 Every refusal path, and what this design changes in each

| # | Path | Where | Asks | After this design |
| --- | --- | --- | --- | --- |
| 1 | Route wrapper, the 9 run-starting routes | `apps/web/src/lib/http/invoke.ts:500-504`; the list at `lib/billing/runs.ts:10-20` | `practice_run_refusal` in the person's scope | Refuses a suspended or closed grantee's people too. No code change, because the function decides. |
| 2 | 55000 mapped to `suspended` | `invoke.ts:294-300` | the database message | Unchanged. The message gets the new words. |
| 3 | Uploads page gate | `lib/routes/uploads.ts:110-117`; rendered at `components/uploads/uploader.tsx:295-298` | `practice_run_refusal` | Unchanged call; new words. |
| 4 | Practice home notice | `lib/routes/practice.ts:166-167` (a #42 file); `app/p/[practiceId]/page.tsx:164-171` | `practice_run_refusal` | Reads the structured `practice_run_hold` and composes the notice: whose suspension, why, since when, next step. |
| 5 | Worker gate, 4 jobs | `apps/worker/src/worker.ts:146-151`; `billing/refusal.ts:14` | `practice_run_refusal` in the job's scope (the actor is the job ID, never a person: `packages/db/src/authz/scope.ts:260-285`) | Unchanged: in a job's scope only the owner's hold applies. A refused `packet_export` now also writes `packet_export_refused` (section 5.4), so its page stops reading "in progress" and then "No result came back within an hour". |
| 6 | The seven triggers | billing.sql:310-318 | `refuse_new_work_while_suspended()` | The function is recreated on the shared decision. In a person's transaction it refuses a grantee's people too. |
| 7 | Job outcome label | `app/p/[practiceId]/page.tsx:137` | none | New words (section 6). |
| 8 | Billing page | `lib/routes/billing.ts:231-309`; `apps/worker/src/billing/account.ts:114` | `organization.status` as `tp_billing` | Reads the stored reason and time, and gives a firm's suspension its real effect (section 6). |
| 9 | Console card | console organization page :54-76 | `organization.status` | Made true per kind, with the reason form, the tick and the history (section 5.2). |
| 10 | Dunning mail | `dunning.ts:93-113, :141-185` | `billing_standing` | Words chosen at send time from kind and status (SS-08, section 7). |

Model calls are refused by no suspension today (`model_proposal`, `model_budget_hold`). They are not run-starting work
under ADR 0050, and the abstraction queue's calls serve documents already uploaded. This design leaves them as they
are and names it (section 16).

---

## 2. SS-01: the options

What a suspension of a grantee should refuse, and for whom.

| | A. Practice-wide | B. The grantee's people (recommended) | C. The grantee loses access |
| --- | --- | --- | --- |
| What it does | A grant in force to a suspended or closed organization stops the practice for everyone: its own staff, its other firms and its jobs | A person who reaches the practice **only** through suspended or closed grantees starts no new work there. Everyone else, and every job, carries on. The owner's hold still stops everyone. | The grant counts as not in force while its grantee is suspended: no reads, no work |
| Tenancy (PRD:61, "a firm that pays … still does not own the practice's workspace") | Breaks it: another tenant's status stops the covered entity's own work | Keeps it: the suspension acts on the firm's access path, which is the firm's | Keeps it |
| PRD:249, "a suspended organization can read but not run" | Holds for the firm, but also stops a group that is neither suspended nor in arrears | Holds exactly: the firm reads and does not run | Breaks it: the firm cannot read |
| Way out for the practice | None in the product. Ending a grant is milestone 12 (`lib/routes/settings.ts:46-48`: grants are a view; `grant.revoke` has no route). The group's only step is a support ticket. | Nothing to get out of: the practice works | Same as B |
| Monitoring, reconciliation, digests and recovery proof | Stop for the practice. Filing windows run on from remittance dates (CLAUDE.md), so disputes can be lost. | Continue | Continue |
| Leverage between tenants | A firm that asks PaidWhole to suspend it ("at the customer's request") stops a client it is leaving | None | None |
| Reasons PaidWhole suspends (UX-004's list) | A security hold on a firm stops a clean practice | Unpaid invoice, request, security hold, agreement ended: each stops the firm's people, which is what each reason is about | A security hold would want this. But PaidWhole already ends a membership and its sessions in the console, which is the right tool for an access threat. |
| Dunning interplay (SS-08) | A group that pays still has a practice held by its firm, so "New runs have started again" is false. Checking that needs a counts-only definer function for `tp_billing`, which changes the list pinned at `billing.db.test.ts:662-676`. | None: a grantee's hold never touches the group's own people | None |
| Database cost | One join per check | `effective_practice_access()` per check: 2.7 to 5.4 ms at 2,001 grants (probe), the same order as `open_practice_scope`, which every request already pays (3.9 ms) | A predicate in `effective_practice_access()`, the heart of every request's scope |
| What the console card can truthfully say | "every practice it is granted stops" | "its people start no new work at the N practices it is granted; the practices' own staff carry on" | "its people lose access" |

**Recommended: B.** It is the only option that refuses the suspended organization's work without stopping a tenant that
did nothing. It needs no product path the practice lacks, and it keeps PRD:61 and PRD:249 both true. A is simpler, but
it is worse on every axis that matters here: tenant isolation, the practice's continuity, dispute deadlines, dunning
truth, and leverage between tenants. C breaks "can read" and duplicates the console's existing tool for access threats.

**What B decides beneath it:**
- **Which grantees count:** any organization holding a grant in force, a firm or a group (the grant model admits both:
  `effective_practice_access`'s grant branch, `organization_kind IN ('group', 'firm')`). The rule is one rule: an
  organization's hold stops its people wherever they reach through it.
- **On what:** the grantee's `status` alone (`suspended` or `closed`), not its billing standing. A firm's nonpayment rules
  are milestone 12's (ADR 0050:118), and `packages/billing/src/standing.ts:7-9` maps a firm's nonpayment to past due on
  purpose. A group grantee's nonpayment already stops its own practices. Whether it should also stop it at practices it
  is granted is a milestone 12 firm-billing rule, recorded in ADR 0080 as open.
- **A person with two paths:** someone in F (suspended) and F2 (active, grant in force), or in the owning group, acts
  through the path that is not held and is not refused (probe D1). Once every path is held, they are refused (D2).
- **PaidWhole's own people:** a support grant is PaidWhole's path. It is never held by a grantee's status, only by the
  owner's, as today.
- **Jobs:** a job's actor is never a person (`scope.ts:278-281`), so only the owner's hold applies. A job is the
  practice's work, not the grantee's.
- **A packet export a grantee's person asked for before the suspension:** it finishes. The request was refused at
  the route after the suspension. The print the job makes is a document inside the product, approved by two people,
  and the grantee's people may still read it. The submission to the payer is a person's logged act, and the gate does
  not cover submissions for any hold, the owner's included. ADR 0050's "work already started finishes" covers it. The
  alternative would re-evaluate the requester's access inside the job. That would duplicate `effective_practice_access`
  for a person who is not the actor, a second access definition that could drift.
- **A closed grantee:** refused like a suspended one. Whether a closed organization keeps reading through its grants
  is the closure lifecycle's question (section 8). The cleaner model is that closure revokes its grants, which needs
  that lifecycle. Today nothing in the product closes an organization, and section 4 makes closing an owner-only act.

---

## 3. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | Option B (section 2). | Tenancy, continuity and truth of every notice. |
| D2 | One internal decision, `practice_work_hold(uuid)`, shared by the route's question, the page's structured read and the trigger. Not executable by any application role. | Today the owner lookup is written twice (billing.sql:289 and :302). Three callers of one body cannot drift. |
| D3 | `practice_run_refusal(uuid) RETURNS text` keeps its signature and grant. It returns the new words. | The previous image, the worker and the uploads gate keep calling it unchanged during a deploy and after a rollback. |
| D4 | A new structured read, `practice_run_hold(uuid)`, for pages. It returns whose hold, kind, cause, reason code and since; never an organization name. | The home names whose suspension it is, why and since when, and gives the right next step. The gate keeps one short sentence. |
| D5 | Database messages carry no organization name and no reason code. | A RAISE message reaches the server log and the job tables. The app names the person's own organization, from the row RLS lets them read. |
| D6 | The owner's reason code is returned only to members of the owning organization. | A firm's people at a practice need not learn the group's account matters. They read "the practice's organization is suspended". |
| D7 | `organization.status_reason` (closed list, only while suspended) and `organization.status_since`, set by a trigger on every status change. History goes in `organization_status_change`: append-only, with the internal note, the actor and the time, readable only by holders of `organization.manage`. | The customer page reads the reason and the time (as `tp_billing`, by column grant). The note stays PaidWhole's: `tp_app` column grants cannot hide a column from members (tenancy.sql:490, :595), so the note lives in its own table with a platform-only policy. |
| D8 | One definer setter, `console_set_organization_status(target, from_status, to_status, reason, note)`. It checks a person, `organization.manage` and the status the person saw, and writes the row, the history and a reserved audit action. | #42's house pattern (`console_pause_mail_stream` and `console_resume_mail_stream`, mail_streams.sql:1134-1176): the check lives in Postgres as well as in the handler, and an action the application role may not forge. `from_status` makes a race between two administrators a refusal, never a silent re-suspension. |
| D9 | Suspension reasons: `unpaid_invoice`, `customer_request`, `security_hold`, `agreement_ended`. Reinstatement reasons: `resolved`, `in_error`. | UX-004's list, under the co-founder's wording ruling. Reinstatement takes a reason because the history and the audit need a code. It stays one click: two buttons, one per reason (UX-046: "The restoring side … stays one click"; UX-035: no pre-answered choice). |
| D10 | Suspend takes UX-046's consequence tick, checked in the route (`confirm`), with the real count. | It is this card's change. UX PR 78 drops its suspend part (section 16). |
| D11 | `tp_app` keeps `UPDATE (status)` and `INSERT (…, status)` for one release, guarded by a trigger: only between `active` and `suspended`, never the internal organization, never into or out of `closed`. The next schema PR after this one is deployed revokes them. | ADR 0009:42-43 (add, backfill, remove: "A migration that could not run under the previous image is split") and ADR 0019:145-147's precedent. Without it, the previous image's Suspend and, worse, Reinstate fail during a deploy and after a rollback. The trigger closes the reopen and internal holes now, in Postgres. |
| D12 | No reopen of a closed organization (section 8). | Closure has no lifecycle yet. A reopen now would be a promise with nothing behind it (#56's SSC-02). |
| D13 | SS-08 is decided at send time in `sendOne`, from `organization.kind` and `status`, which `tp_billing` already reads (billing.sql:238). No migration, and no new definer function for `tp_billing`. | Retries come minutes later, and the status may change between the stage and the send. Under B a group that pays has no practice held by its firm, so no counts function is needed. |
| D14 | ADR 0080 holds the decision. ADRs 0050 and 0055 get dated amendments on #42's final text. | 0050 owns billing's suspension and the refusal paths. 0055 owns the console's. The new rule (whose hold, for whom) and the stored reason are one decision across both. |
| D15 | Suspension and reinstatement mail, and Q13, get their own schema PR, the next in the chain after this one. | Both extend #42's outbox: a new kind in `mail_send_kind` and `mail_send_stream_kind`, an outbox table, `operator_record_mail_event` recreated. That needs the deliverability review, not this PR's tenancy and security lenses. Q13 reads the same delivery states. The customer meanwhile reads the suspension on every surface the moment it holds (sections 5 and 6). |

---

## 4. Schema: one migration, `20261108090000_suspension_refusal.sql`

It comes after #42's `20261107090000_mail_streams.sql`. The builders take the next free timestamp at the time, and
SUITE-CAP-1 comes after it. Every function is `SET search_path = pg_catalog, public, pg_temp`, owned by `tp_owner`
(the migration runs as the owner), `REVOKE ALL … FROM PUBLIC`, and granted exactly as listed. The functions this
migration recreates are byte-identical on e908c21 and at #42's head: the database scout compared md5(prosrc), and #42's
migration names none of them. The two objects it recreates **on #42's body** are the `audit_event_record` policy
(mail_streams.sql:803-810) and nothing else of #42's. The builders re-read both at #42's final merged head before
writing.

### 4.1 Preflight

A `DO` block raises, naming no organization, if any `kind = 'internal'` row is not `active`: "the internal organization
must be active before migration 20261108090000; set it active as the owner, then migrate again". The console has
refused the internal organization since ADR 0055, so none is expected. A silent fix inside a migration would hide how
it happened.

### 4.2 `organization`: the stored reason and time

```sql
ALTER TABLE organization
  ADD COLUMN status_reason text CONSTRAINT organization_status_reason
    CHECK (status_reason IN ('unpaid_invoice', 'customer_request', 'security_hold', 'agreement_ended')),
  ADD COLUMN status_since timestamptz,
  ADD CONSTRAINT organization_status_reason_suspended CHECK (status_reason IS NULL OR status = 'suspended'),
  ADD CONSTRAINT organization_internal_active CHECK (kind <> 'internal' OR status = 'active');
```

- **The columns.** `status_reason` is the reason of the suspension in force. It is null while the organization is
  active or closed, and null for a suspension recorded without one (a row older than this migration, or a suspension by
  the previous image during the deploy window). `status_since` is when the current status began. It is null for rows
  whose status has not changed since this migration.
- **No backfill.** No production customer exists, and the page words handle a missing reason or time (section 6).
- **The lock.** Both columns are nullable with no default, so the ALTER takes its lock only for a catalog change, on a
  table of a few rows.

**Trigger `organization_status_rules`**, `BEFORE INSERT OR UPDATE OF status, status_reason ON organization FOR EACH ROW`.
Its function is plain plpgsql, not a definer:

- **The owner path.** `owner_path := pg_has_role(current_user, 'tp_owner', 'USAGE')`, the house test
  (tenancy_hardening.sql:118). Migrations, seeds, the tests' owner client and the definer setter all run as the owner.
- **On insert:**
  - anyone but the owner may insert only `active`, raising `check_violation`, CONSTRAINT `organization_created_active`;
  - a non-active row gets `status_since := coalesce(NEW.status_since, now())`, an active one `NULL`.
- **On update:**
  - anyone but the owner may move into or out of `closed` never: `check_violation`, CONSTRAINT
    `organization_closed_by_closure_only`, "a closed organization stays closed, and only its closure closes one";
  - a changed status sets `status_since := now()`.
- **Always:** `status_reason := NULL` unless the new status is `suspended`.
- **Where it applies.** `organization_internal_active` refuses suspending the internal organization for every role.
  `tp_app` has no privilege on `status_reason` or `status_since`, so only the setter writes them.

This puts the handler's two refusals (closed, internal; console.ts:98-106) in Postgres too. Probe F1 to F3: the
previous image's direct write still works between active and suspended and stamps the time; `closed` and the internal
organization are refused; `tp_app` cannot write the reason.

### 4.3 `organization_status_change`: the history, with PaidWhole's internal note

```sql
CREATE TABLE organization_status_change (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  from_status text NOT NULL CONSTRAINT organization_status_change_from CHECK (from_status IN ('active', 'suspended')),
  to_status text NOT NULL CONSTRAINT organization_status_change_to CHECK (to_status IN ('active', 'suspended')),
  reason text NOT NULL CONSTRAINT organization_status_change_reason CHECK (
       (to_status = 'suspended' AND reason IN ('unpaid_invoice', 'customer_request', 'security_hold', 'agreement_ended'))
    OR (to_status = 'active' AND reason IN ('resolved', 'in_error'))),
  note text CONSTRAINT organization_status_change_note
    CHECK (note IS NULL OR (char_length(note) BETWEEN 1 AND 500 AND note !~ '[[:cntrl:]]')),
  changed_by uuid NOT NULL REFERENCES "user" (id),
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_status_change_moves CHECK (from_status <> to_status OR to_status = 'suspended')
);
CREATE INDEX organization_status_change_by_organization ON organization_status_change (organization_id, at DESC);
CREATE TRIGGER organization_status_change_append_only BEFORE UPDATE OR DELETE ON organization_status_change
  FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER organization_status_change_no_truncate BEFORE TRUNCATE ON organization_status_change
  FOR EACH STATEMENT EXECUTE FUNCTION reject_change();
ALTER TABLE organization_status_change ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_status_change FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_status_change_owner ON organization_status_change FOR ALL TO tp_owner USING (true) WITH CHECK (true);
CREATE POLICY organization_status_change_platform_read ON organization_status_change FOR SELECT TO tp_app
  USING ((SELECT app_actor_platform_permitted('organization.manage')));
REVOKE ALL ON organization_status_change FROM PUBLIC;
GRANT SELECT ON organization_status_change TO tp_app;
```

- **Not a PHI table.** It has no `practice_id`, and it records what PaidWhole did to a customer account. RLS is forced,
  as the catalog test requires of any table that enables it (`packages/db/src/catalog.ts:26-27`). It is a global table
  that `tp_app` only reads (no INSERT, UPDATE or DELETE grant), and only for holders of `organization.manage`.
  `tp_billing`, `tp_operator`, `tp_screening`, `tp_esign` and `tp_job` have no privilege on it.
- **The note.** The guard is the form's words ("Seen only by PaidWhole's platform administrators. No patient details.",
  section 6), the length and control-character CHECK, and the rule that the note is never logged, exported, mailed or
  shown to a customer. A move from suspended to suspended is a change of reason. It is append-only like `audit_event`,
  and is kept as long as the organization's record.
- **Area.** `packages/db/domain-model/areas.json` (a #42 file) places it in `tenancy`, and the area's "about" sentence
  gains "and PaidWhole's suspensions and reinstatements of an organization, with their reasons".

### 4.4 Functions

| Function | Change | Predecessor body | Kind | EXECUTE |
| --- | --- | --- | --- | --- |
| `practice_work_hold(target_practice uuid) RETURNS TABLE (source text, organization_id uuid, organization_kind text, cause text, reason text, since timestamptz)` | new | none | `sql STABLE SECURITY DEFINER` | owner only (no grant; not to `tp_app`, so the pinned definer lists of `tp_billing` at `billing.db.test.ts:662-676` and of `tp_screening` at `screening.db.test.ts:646` stay as they are) |
| `practice_work_refusal(target_practice uuid) RETURNS text` | new | none | `sql STABLE SECURITY DEFINER` | owner only |
| `practice_run_refusal(target_practice uuid) RETURNS text` | `CREATE OR REPLACE` | billing.sql:283-293 (identical at #42's head) | `plpgsql STABLE SECURITY DEFINER` | `tp_app` (unchanged, billing.sql:408) |
| `practice_run_hold(target_practice uuid) RETURNS TABLE (…as practice_work_hold…)` | new | none | `plpgsql STABLE SECURITY DEFINER` | `tp_app` |
| `refuse_new_work_while_suspended()` | `CREATE OR REPLACE`; the seven triggers stay as they are | billing.sql:297-308 (identical at #42's head) | trigger, `plpgsql SECURITY DEFINER` | none (as today) |
| `organization_run_refusal(uuid)` | `DROP FUNCTION` | billing.sql:268-279 | none | none. Nothing calls it any more: its only callers were the two above; EXECUTE was the owner's only (billing.sql:405); no TypeScript calls it. |
| `console_set_organization_status(target_organization uuid, from_status text, to_status text, status_reason text, note text) RETURNS boolean` | new | none (#42's console_pause/resume pattern) | `plpgsql VOLATILE SECURITY DEFINER` | `tp_app` |
| `practice_grants(target_practice uuid)` | `DROP` and `CREATE`: the return type gains `grantee_status text` last | `packages/db/functions/practice_grants.sql` (not touched by #42) | `plpgsql STABLE SECURITY DEFINER` | `tp_app` (as today) |
| `organization_status_rules()` | new | none | trigger, plpgsql | none |

**`practice_work_hold`**, the one decision:

```sql
  WITH owner AS (
    SELECT 'owner'::text AS source, o.id, o.kind,
           CASE WHEN o.status = 'suspended' THEN 'suspended' WHEN o.status = 'closed' THEN 'closed'
                WHEN s.standing = 'suspended' THEN 'nonpayment' END AS cause,
           -- The owner's reason only to its own members (D6).
           CASE WHEN o.status = 'suspended' AND o.id = ANY ((SELECT app_actor_organization_ids())::uuid[]) THEN o.status_reason END AS reason,
           CASE WHEN o.status IN ('suspended', 'closed') THEN o.status_since WHEN s.standing = 'suspended' THEN s.suspended_since END AS since
      FROM practice p JOIN organization o ON o.id = p.organization_id JOIN billing_standing s ON s.organization_id = o.id
     WHERE p.id = target_practice
  ), paths AS (
    -- The person's own paths to this practice; none for a job, whose actor is never a person.
    SELECT a.via, g.organization_id AS grantee
      FROM effective_practice_access() a LEFT JOIN "grant" g ON a.via = 'grant' AND g.id = a.grant_id
     WHERE a.practice_id = target_practice AND app_actor_is_person()
  ), grantee AS (
    -- Held only when every path is a grant of a suspended or closed organization.
    SELECT 'grantee'::text, o.id, o.kind, o.status, o.status_reason, o.status_since
      FROM paths x JOIN organization o ON o.id = x.grantee
     WHERE o.status IN ('suspended', 'closed')
       AND NOT EXISTS (SELECT 1 FROM paths y LEFT JOIN organization o2 ON o2.id = y.grantee WHERE y.via <> 'grant' OR o2.status = 'active')
     ORDER BY o.status = 'suspended' DESC, o.id
     LIMIT 1
  )
  SELECT * FROM owner WHERE cause IS NOT NULL
  UNION ALL
  SELECT * FROM grantee WHERE NOT EXISTS (SELECT 1 FROM owner WHERE cause IS NOT NULL)
```

- **Who wins.** The owner's hold wins whoever asks (probe E3). A grantee's hold is a person's alone (B1, D1, D2, E1).
- **Where the paths come from.** `effective_practice_access()` (functions/effective_practice_access.sql) is the
  definition `open_practice_scope` already uses, so the paths cannot drift from the scope.
- **`billing_standing`** is read as the owner, as `organization_run_refusal` read it.

**`practice_work_refusal`** maps `(source, cause)` to one sentence (section 6, R1 to R5), with no name and no reason
code. **`practice_run_refusal`** keeps its scope check (`insufficient_privilege` outside the scope) and returns
`practice_work_refusal(target_practice)`. **`practice_run_hold`** has the same scope check and returns
`practice_work_hold(target_practice)`. **`refuse_new_work_while_suspended()`** raises `practice_work_refusal(NEW.practice_id)`
with SQLSTATE 55000, as today. It is a definer, so its inner calls read `app.actor_id` as set by the transaction that
writes the row.

**`console_set_organization_status`**:

1. **Who may call it.** Refused (`insufficient_privilege`, "only a platform administrator suspends or reinstates an
   organization") unless `app_actor_id()` is set, `app_actor_is_person()` and `app_actor_platform_permitted('organization.manage')`.
2. **The row.** It locks the row `FOR UPDATE` where `kind IN ('group', 'firm')`. Not found raises `no_data_found`.
3. **Closed.** `closed` raises `check_violation`, CONSTRAINT `organization_closed_by_closure_only`.
4. **The status the person saw.** `current.status <> from_status` raises `check_violation`, CONSTRAINT
   `organization_status_changed_meanwhile`.
5. **The moves it allows:**
   - `active` to `suspended` with a suspension reason;
   - `suspended` to `suspended` with a different suspension reason, or with a note (a change of reason);
   - `suspended` to `active` with a reinstatement reason.

   Anything else raises `check_violation`, CONSTRAINT `organization_status_change_reason`. The same reason with no
   note returns `false` and writes nothing.
6. **The writes.** It updates `status` and `status_reason` (the trigger stamps `status_since` when the status moves),
   inserts the history row (`note` trimmed, an empty one stored as null), and inserts
   `audit_event (actor_id, actor_kind 'user', action, object_type 'organization', object_id, purpose = the reason)`.
   The action is `organization_suspended` for a suspension or a change of reason, and `organization_reinstated` for a
   reinstatement. It returns `true`.

**`practice_grants`** keeps its permission check and order. It appends `o.status AS grantee_status`, the status alone,
never the reason. The previous image reads it with `SELECT *` and maps named fields (`settings.ts:220-228`), so the
extra column is ignored.

### 4.5 The reserved audit actions (on #42's body)

`DROP POLICY audit_event_record ON audit_event;` then `CREATE POLICY` as #42 left it (mail_streams.sql:803-810), with
`'organization_suspended', 'organization_reinstated'` added to the `action NOT IN (…)` list. `tp_app` cannot forge
them; the setter writes them as the owner (`audit_event_operator_record`, audit_and_operations.sql:54).

### 4.6 Grants, exactly

| Role | Gains | Loses |
| --- | --- | --- |
| `tp_app` | EXECUTE on `practice_run_hold(uuid)` and `console_set_organization_status(uuid, text, text, text, text)`; SELECT on `organization_status_change` (platform read policy). Table-level SELECT on `organization` (tenancy.sql:595) already covers the two new columns. | Nothing in this migration. `UPDATE (status)` and `INSERT (status)` on `organization` go in the next schema PR after this one is deployed (D11). |
| `tp_billing` | `GRANT SELECT (status_reason, status_since) ON organization` | nothing. Its definer functions are unchanged. |
| others | nothing | nothing |

### 4.7 Safe with the previous image running, and on rollback

| The previous image does | On the new schema |
| --- | --- |
| Calls `practice_run_refusal` (route gate, uploads, home, worker) | Same signature and grant, new words. Its home appends its own "Everything here stays readable; …" after the sentence. For the minutes of a deploy that clause repeats; nothing is wrong. |
| Maps 55000 to `suspended` with the message | Same code, new words |
| Suspends or reinstates with a direct `UPDATE organization SET status` as `tp_app` | Allowed between active and suspended (D11); the trigger stamps `status_since`. No reason, no history row, no reserved action: its wrapper's `organization_status_set` audits it as before. Closed and internal are refused, as its handler refuses them first. |
| Reads `practice_grants` with `SELECT *` | The extra column is ignored |
| Inserts an organization `(id, kind, name)` | Unchanged; the trigger leaves `active` alone |
| Dunning (#42's words) | Unchanged until the new worker image: the same words as today, nothing worse |

Rollback is the previous image on this schema (ADR 0009:42-43), the table above. The migration takes a short lock on
`organization` and on `audit_event` (the policy). #42 recreated the same policy the same way. The dry run, forward and
back, is the house check (ADR 0009:37-43).

### 4.8 The next schema PR after this one is deployed (recorded in ADR 0080 and LANES.md "Handed to Lane A")

`REVOKE UPDATE (status) ON organization FROM tp_app; REVOKE INSERT (status) ON organization FROM tp_app;` The setter is
then the only writer of a status change outside the owner. The trigger stays, as defence in depth.

---

## 5. Application changes

Each mutation below is a route with a Zod schema, a role check in the handler, its transaction, an audit event, and
the same check again in Postgres.

### 5.1 The console's suspension route (`apps/web/src/lib/routes/console.ts`, a #42 file)

`setOrganizationStatus` keeps its ID `console.organization_status`, its path, `kind: 'action'`, `phi: false` and its
permission `organization.manage`, which only `platform_admin` holds (`packages/db/src/authz/permissions.ts:88, :211-222`).
Its input becomes:

```ts
const note = optionalText(z.string().trim().max(500, 'at most 500 characters').regex(/^[^\p{Cc}]*$/u, 'one line, with no line breaks'));
input: z.discriminatedUnion('change', [
  z.object({ change: z.literal('suspend'), organizationId: opaqueId, reason: z.enum(SUSPENSION_REASONS, { message: 'choose why PaidWhole suspends it' }), note,
             confirm: z.literal('on', { message: 'tick to confirm what the suspension stops' }) }),
  z.object({ change: z.literal('reason'), organizationId: opaqueId, reason: z.enum(SUSPENSION_REASONS, { message: 'choose the new reason' }), note }),
  z.object({ change: z.literal('reinstate'), organizationId: opaqueId, reason: z.enum(REINSTATEMENT_REASONS, { message: 'choose why it is reinstated' }) }),
]),
```

- **The constants.** `SUSPENSION_REASONS` and `REINSTATEMENT_REASONS` are exported from `@tp/db/runtime`, beside
  `ORGANIZATION_STATUSES` in `packages/db/src/schema/tenancy.ts` (a #42 file). The database CHECKs hold the same lists,
  and a test compares them.
- **The handler, as today:**
  - reads the organization (`kind IN ('group', 'firm')`, else `NotFoundError`);
  - refuses a closed one with an `InputError` on `change`, "a closed organization is neither suspended nor reinstated".
- **Then it calls** `SELECT console_set_organization_status($1, $2, $3, $4, $5) AS changed`, with `(from, to)` from
  `change`: suspend `('active', 'suspended')`, reason `('suspended', 'suspended')`, reinstate `('suspended', 'active')`.
- **How Postgres's refusals map:**
  - `P0002` maps to `NotFoundError`;
  - `organization_closed_by_closure_only` maps to the closed message above;
  - `organization_status_changed_meanwhile` maps to an `InputError` on `change`, "the organization's status changed
    since this page loaded; reload the page";
  - `organization_status_change_reason` maps to an `InputError` on `reason`.
- **The redirect.** It goes to `/console/organizations/<id>`, with no `?notice=` (UX-013): the card shows the new
  state.
- **The transaction.** It is the platform route's (`withActor`: `app.actor_id` set, `app.practice_ids` empty;
  `apps/web/src/lib/http/invoke.ts:433`). Its gates exempt maintenance and terms for platform routes, as today.
- **Audit.** The wrapper still writes `organization_status_set`, the request as the person made it. The setter writes
  `organization_suspended` or `organization_reinstated`, with the reason as purpose, only when something changed.
- **Route-test sample:** `{ change: 'reinstate', organizationId, reason: 'resolved' }`.

### 5.2 The console's organization page (`apps/web/src/app/console/organizations/[organizationId]/page.tsx`; its data from `organizationPage`, console.ts:183-260)

- **What it reads:**
  - `status_reason` and `status_since`;
  - the 20 latest `organization_status_change` rows, with the actor's email (the members query already joins `"user"`
    as the platform administrator);
  - the consequence count: for a group, its active practices (`console_practices(id)`); for a firm, its grants in
    force (`console_grants(id)` rows with `organization_id = id`, not revoked, `starts_at <= now() < ends_at`).
- **Active (group or firm):** the card "Suspension" with the reason select, the optional note and the tick (section 6,
  C1 to C6). Submitting "Suspend the organization" sends `change: 'suspend'`.
- **Suspended:**
  - the card "Suspended", with who, when and why (C7 to C9) and the note;
  - a "Change the reason" form (`change: 'reason'`);
  - two one-click buttons, "Reinstate: the cause is resolved" and "Reinstate: suspended in error"
    (`change: 'reinstate'`).
- **History** under the card (C10).
- **Closed, and the internal organization:** no card, as today (:54).
- **The Grants card's State column** (:323-324) reads C11 when the grantee is suspended and C12 when it is closed.
  This is UX-203's "a suspended firm's grant still reads 'in force'", in B's words. The page's order and summary stay
  UX PR 79's.

### 5.3 The practice home and the uploads gate

- **`apps/web/src/lib/billing/hold.ts` (new):** `practiceHold(scope, practiceId, access)`.
  - It calls `SELECT * FROM practice_run_hold($1)`.
  - For a grantee hold, it reads the person's own organization's name (`SELECT name FROM organization WHERE id = $1`;
    a member reads their own row, tenancy.sql:490).
  - It asks whether the person holds `organization.billing` in the held organization (`app_actor_memberships()`, the
    roles the shell already resolves).
  - It returns `{ source, cause, reason, since, name, viewer: 'owner_member' | 'other', billingHref }`.
- **`apps/web/src/lib/billing/suspension-words.ts` (new):** the one module that composes the home's notice (H1 to
  H12), the job outcome label (J1) and the grant states (C11, C12, G1, G2). It is a pure module, so the property test
  reads it whole.
- **`lib/routes/practice.ts` (a #42 file):** `suspension: await practiceRunRefusal(…)` (:166-167) becomes
  `hold: await practiceHold(…)`, composed with the words module.
- **`app/p/[practiceId]/page.tsx`:**
  - :164-171 renders `hold.title`, `hold.body` and `hold.nextStep` (a link when the person can act), with
    `data-notice="suspended"` and `data-hold-source`;
  - :137's outcome label becomes J1.
- **No change:** `lib/routes/uploads.ts:110-117`, `lib/http/next.ts:172-173`, `components/uploads/uploader.tsx:100`
  and the JSON 402 (`lib/http/handler.ts:26`). They show the database's sentence, which now reads well after "Not
  started: " and "Uploads are paused: " (R1 to R5).

### 5.4 The worker

- **`apps/worker/src/worker.ts:146-151`.** When the refused job is `packet_export`, the gate also writes
  `packet_export_refused` on the version, in the job's scope (`recordAuditEvent`, actor the job, `purpose:
  'organization_suspended'`).
  - `packet_version_export_attempt` (functions/packet_version_export_attempt.sql:20-40) then reads `refused` with that
    code, where today it reads "in progress" and, an hour on, "No result came back within an hour".
  - `organization_suspended` joins `PACKET_EXPORT_REFUSALS` (`apps/worker/src/packets/readiness.ts:43`) and
    `EXPORT_REFUSAL_TEXT` (`apps/web/src/lib/packets/export-attempts.ts:30`), with E1's words.
  - No migration: the purpose is a code, and the action is not reserved.
- **Nothing else changes** in the worker's gate: in a job's scope only the owner's hold applies (D1).

### 5.5 The customer's billing page

- **`apps/worker/src/billing/account.ts:114`** (not a #42 file) also selects `o.status_reason, o.status_since`, as
  `tp_billing` by the new column grant. `BillingView` gains `statusReason` and `statusSince`.
- **`lib/routes/billing.ts` `accountStanding` (:231-309)** uses them for the label, notice and next steps (B1 to B10).
  A firm suspended or closed by PaidWhole is now told what its people cannot do. A firm's nonpayment still reads past
  due, with no run claim (`standing.ts` unchanged).
- **The comment at :221-230** becomes: "A firm's unpaid invoice refuses no run before milestone 12 (docs/adr/0050);
  PaidWhole's suspension or closure of a firm stops its people's new work at the practices it is granted
  (docs/adr/0080)."
- **The console's Billing status** (`apps/web/src/app/console/billing/page.tsx:23`): the Standing cell for "Suspended
  by PaidWhole" adds the reason's label (O1).

### 5.6 The practice's grants (`lib/routes/settings.ts:198-243`, a #42 file; `app/p/[practiceId]/settings/agreements/page.tsx`)

`practice_grants` returns `grantee_status`. The row's state reads G1 or G2 when the grantee is suspended or closed, so
the practice's administrator knows why the firm's people cannot start work there. It shows the status alone; the reason
is the firm's.

### 5.7 SS-08 (`apps/worker/src/billing/dunning.ts`, a #42 file): section 7.

### 5.8 Seeds, mirror and types

- **`packages/db/src/schema/tenancy.ts` (a #42 file):**
  - `organization.statusReason` and `statusSince`;
  - the `organizationStatusChange` table;
  - the two reason lists.

  The schema-agrees test covers them.
- **`apps/web/scripts/seed.ts:82-100`:**
  - SYNTHETIC SUSPENDED GROUP is inserted with `status_reason = 'customer_request'`, so BIL-06 shows a reason and a
    date;
  - a new **SYNTHETIC SUSPENDED FIRM**, held suspended (`security_hold`) by the seed and never reinstated, with a
    principal persona `suspended-firm-principal`;
  - a dedicated **SYNTHETIC FIRM CLIENT GROUP**, its practice **SYNTHETIC FIRM CLIENT PRACTICE** (BAA and location as
    the seed writes them), its administrator persona `firm-client-admin`, and a grant in force to the suspended firm;
  - a **SYNTHETIC CONSOLE SUSPENSION FIRM**, for the console journey alone, with no persona that signs in;
  - the personas go in `apps/web/scripts/synthetic-personas.ts`.

  No other journey shares any of these, so nothing races (SS-09's pattern).

---

## 6. Every sentence a person reads, word for word

The rules:
- **The name.** It is "PaidWhole", never "a platform administrator".
- **The verb.** "lifts the suspension" is the customer's verb on every surface. "Reinstate" is the console's operator
  word.
- **No figures, and nothing CO-11 forbids.** No amount, no "AI", no "recovered". The work is listed the same way
  everywhere: pricing runs, triage, reports, packet exports, uploads, and monitoring where the jobs stop.
- **A person's own organization is named; another tenant's is not.**
- **The check.** `pnpm lint:copy` runs over every new string.

Placeholders in braces are filled by code.

### 6.1 The database's sentences (no name, no reason; R1 to R5)

They read after "Not started: " (next.ts:172, uploader.tsx:100), after "Uploads are paused: " (uploads.ts:117), in
the JSON 402 `reason`, and as the 55000 message.

| ID | Hold | Sentence |
| --- | --- | --- |
| R1 | owner, suspended by PaidWhole | PaidWhole has suspended the practice's organization, so no new work starts here until PaidWhole lifts the suspension; everything here stays readable |
| R2 | owner, closed | the practice's organization is closed, so no new work starts here; everything here stays readable |
| R3 | owner, nonpayment | an invoice of the practice's organization has been unpaid for 30 days since its payment failed, so no new work starts here until it is paid; everything here stays readable |
| R4 | grantee, suspended | PaidWhole has suspended your organization, so you start no new work at this practice until PaidWhole lifts the suspension; you can still read its records |
| R5 | grantee, closed | your organization is closed, so you start no new work at this practice |

They replace `functions/organization_run_refusal.sql:15-17`. For example: "Not started: PaidWhole has suspended your
organization, so you start no new work at this practice until PaidWhole lifts the suspension; you can still read its
records."

### 6.2 The practice home's notice (H1 to H12; `role="alert"`, destructive, as today)

`{org}` is "your organization" for a member of the held organization, and "the practice's organization" otherwise.
`{firm}` is the person's own organization's name. `{date}` is `YYYY-MM-DD`, UTC, as the pages print dates.

| ID | Case | Title | Body |
| --- | --- | --- | --- |
| H1 | owner, suspended, reason and date known (members only see the reason) | New runs have stopped | PaidWhole suspended {org} on {date}{reason clause}. Pricing runs, triage, reports, packet exports, uploads and monitoring do not start until PaidWhole lifts the suspension. Everything here stays readable. |
| H2 | owner, suspended, no date recorded | New runs have stopped | PaidWhole has suspended {org}{reason clause}. Pricing runs, triage, reports, packet exports, uploads and monitoring do not start until PaidWhole lifts the suspension. Everything here stays readable. |
| H3 | owner, closed | No new runs start | {Org} is closed, so pricing runs, triage, reports, packet exports, uploads and monitoring do not start. Everything here stays readable. |
| H4 | owner, nonpayment | New runs have stopped | An invoice of {org} has been unpaid for 30 days since its payment failed, so pricing runs, triage, reports, packet exports, uploads and monitoring do not start until it is paid. Everything here stays readable. |
| H5 | grantee, suspended, date known | You cannot start new work here | PaidWhole suspended {firm} on {date}{reason clause}, so you start no new pricing runs, triage, reports, packet exports or uploads at this practice until PaidWhole lifts the suspension. You can still read everything here, and the practice's own staff carry on. |
| H6 | grantee, suspended, no date | You cannot start new work here | PaidWhole has suspended {firm}{reason clause}, so you start no new pricing runs, triage, reports, packet exports or uploads at this practice until PaidWhole lifts the suspension. You can still read everything here, and the practice's own staff carry on. |
| H7 | grantee, closed | You cannot start new work here | {Firm} is closed, so you start no new pricing runs, triage, reports, packet exports or uploads at this practice. |

The reason clause is given to the held organization's own members only (D6):

| Reason | Clause |
| --- | --- |
| `unpaid_invoice` | , for an unpaid invoice |
| `customer_request` | , at your organization's request |
| `security_hold` | , while it looks into a security concern |
| `agreement_ended` | , because your organization's agreement with PaidWhole has ended |
| none recorded | (nothing) |

The next step, one line under the body:

| ID | Who | Next step |
| --- | --- | --- |
| H8 | holds `organization.billing` in the held organization (H1 to H6) | **Settings, Billing** shows why and what to do next. (a link to `/settings/billing/{organizationId}`) |
| H9 | a member of the held organization without it | {Your organization's} administrator sees why and what to do next in Settings, Billing. |
| H10 | anyone else at an owner-held practice (a firm's people, PaidWhole's support) | The practice's administrator sees why and what to do next in Settings, Billing. |
| H11 | closed, a member (H3, H7) | **Open a support ticket** if you have a question about the closure. (`/support?from=billing`) |
| H12 | closed, anyone else (H3) | (none) |

### 6.3 Job outcome and packet export

| ID | Where | Words |
| --- | --- | --- |
| J1 | home, job outcome (page.tsx:137) | Refused: new work had stopped for the practice's organization |
| E1 | packet export refusal (`EXPORT_REFUSAL_TEXT.organization_suspended`) | New work had stopped for the practice's organization, so the export was not made. Ask for it again once the practice's home no longer says new runs have stopped. |

### 6.4 The customer's billing page (`accountStanding`)

These replace #56's words where they differ. Every other line of #56 stands.

| ID | Case | Words |
| --- | --- | --- |
| B1 | label, suspended by PaidWhole, date known | Suspended by PaidWhole since {date} |
| B2 | label, no date recorded | Suspended by PaidWhole |
| B3 | group notice | PaidWhole has suspended the organization{reason clause}: new runs have stopped until PaidWhole lifts the suspension, and its data stays readable. {lift sentence}{billing hold sentence, as #56} |
| B4 | firm notice (title "The organization is suspended") | PaidWhole has suspended the organization{reason clause}: your people start no new work at the practices you are granted until PaidWhole lifts the suspension. Every record stays readable, and the practices' own staff carry on.{" An invoice is also unpaid since {date}." when billing holds one} |
| B5 | lift sentence, `unpaid_invoice` | Paying the invoice does not lift it by itself: open a support ticket once it is paid. |
| B6 | lift sentence, any other reason or none | Paying an invoice does not lift it. |
| B7 | next steps by reason (after "Pay {invoice}" when billing holds one, as #56) | `unpaid_invoice`: **Open a support ticket** once it is paid, so PaidWhole can lift the suspension. · `customer_request`: **Open a support ticket** when you want the suspension lifted. · `security_hold`: **Open a support ticket** to find out what PaidWhole needs from you. · `agreement_ended`: **Open a support ticket** to discuss a new agreement. · none: **Open a support ticket** to find out why and what lifts it. |
| B8 | forms note | Changing the plan or payment method does not lift a suspension by PaidWhole. |
| B9 | closed firm notice | Your people start no new work at the practices you are granted.{owed, as #56} |
| B10 | reason clause on this page | `unpaid_invoice` " for an unpaid invoice"; `customer_request` " at your request"; `security_hold` " while it looks into a security concern"; `agreement_ended` " because the organization's agreement with PaidWhole has ended"; none: nothing |

### 6.5 The console (operator words)

| ID | Where | Words |
| --- | --- | --- |
| C1 | active card title | Suspension |
| C2 | group, description | Suspending stops all new work at this organization's practices, whoever starts it: pricing runs, triage, reports, packet exports, uploads and monitoring. Every record stays readable. Billing's own hold for an unpaid invoice is separate. |
| C3 | firm, description | Suspending stops this firm's people from starting new work at the practices it is granted: pricing runs, triage, reports, packet exports and uploads. The practices' own staff and their monitoring carry on, and every record stays readable. |
| C4 | reason select (required, starts empty: "Choose a reason") | Unpaid invoice · At the customer's request · Security hold · Agreement ended |
| C5 | note field | Note (optional). Hint: Seen only by PaidWhole's platform administrators. No patient details. At most 500 characters. |
| C6 | the tick (required) | group: Suspend {name}: new work stops at its {n} practice(s) for everyone; every record stays readable. (n = 0: Suspend {name}: it has no active practice now; every record stays readable.) · firm: Suspend {name}: its people start no new work at the {n} practice(s) it is granted; every record stays readable. (n = 0: Suspend {name}: it holds no grant in force now; every record stays readable.) Submit: Suspend the organization |
| C7 | suspended card title and line | Suspended · Suspended by {email} on {date} {time} UTC: {reason label}. (Legacy: Suspended on {date} {time} UTC; no reason was recorded. With no date: Suspended; no reason or date was recorded.) |
| C8 | suspended, effect | group: New work is refused at its {n} practice(s) for everyone; every record stays readable. Reinstating lifts it at once. · firm: Its people start no new work at the {n} practice(s) it is granted; the practices' own staff carry on. Reinstating lifts it at once. |
| C9 | suspended, actions | Note: {note} · "Change the reason" (C4, C5; submit: Change the reason) · Reinstate: the cause is resolved · Reinstate: suspended in error |
| C10 | history table | Caption: History. Columns: When (UTC) · Change (Suspended, Reinstated, Reason changed) · Reason · By · Note. Empty: No suspension recorded. |
| C11 | Grants card State, grantee suspended | in force; its people start no new work here while it is suspended |
| C12 | Grants card State, grantee closed | in force; its people start no new work here, since it is closed |
| O1 | Billing status Standing cell | Suspended by PaidWhole: {reason label} (none recorded: Suspended by PaidWhole) |
| X1 to X6 | route refusals (field: message) | reason: choose why PaidWhole suspends it · reason: choose the new reason · reason: choose why it is reinstated · confirm: tick to confirm what the suspension stops · note: at most 500 characters / one line, with no line breaks · change: the organization's status changed since this page loaded; reload the page |

The reinstatement reasons read "The cause is resolved" and "Suspended in error" in the history.

### 6.6 The practice's grants (Settings, Grants and agreements)

| ID | Case | State |
| --- | --- | --- |
| G1 | grant in force, grantee suspended | In force. PaidWhole has suspended {grantee}, so its people start no new work here; your own staff carry on. |
| G2 | grant in force, grantee closed | In force. {Grantee} is closed, so its people start no new work here. |

---

## 7. SS-08: the dunning mail tells the truth about runs

**Where.** `apps/worker/src/billing/dunning.ts` at #42's head (a #42 file), in `sendOne` (:141-185), inside the
transaction that claims the owner's row. After `billing_dunning_notice_claim` and the invoice read, it reads the
organization: `SELECT kind, status FROM organization WHERE id = $1`. `tp_billing` may read those columns
(billing.sql:238). It passes `{ kind, status }` to `dunningMessage`. The words are chosen when the message is sent,
because a retry comes 1 to 60 minutes after the stage was recorded, and PaidWhole may have suspended or reinstated the
organization in between.

**The rule.** `effect` is:
- `runs` for a group that is `active`;
- `held` for a group that PaidWhole has `suspended`;
- `none` for a `closed` group and for every firm (a firm's nonpayment refuses nothing before milestone 12).

The stage machine, the audits (`billing_suspended` and `billing_reinstated`, which record billing's own hold), the
outbox and the delivery states are unchanged.

| Stage | `runs` (today's words, unchanged) | `held` | `none` |
| --- | --- | --- | --- |
| payment_failed | unchanged | The payment for {invoice} ({owed}) failed. · Update the payment method or pay the invoice from the billing page. · New runs are already stopped while PaidWhole's suspension of the organization lasts. | The payment for {invoice} ({owed}) failed. · Update the payment method or pay the invoice from the billing page. |
| second_notice, third_notice | unchanged | {Invoice} ({owed}) is still unpaid. · Pay it, or update the payment method, from the billing page. · New runs are already stopped while PaidWhole's suspension of the organization lasts. | {Invoice} ({owed}) is still unpaid. · Pay it, or update the payment method, from the billing page. |
| final_notice | unchanged | as second_notice, `held` | as second_notice, `none` |
| suspended | unchanged | {Invoice} ({owed}) has been unpaid for 30 days since its payment failed. · New runs stay stopped until it is paid and PaidWhole lifts its own suspension of the organization. | {Invoice} ({owed}) has been unpaid for 30 days since its payment failed. · Pay it from the billing page. |
| reinstated | {Invoice} is paid. New runs have started again. | {Invoice} is paid. · PaidWhole has also suspended the organization, so new runs stay stopped until PaidWhole lifts that suspension. The billing page says why and what to do next. | {Invoice} is paid. |

| Stage | Subject, `runs` (unchanged) | Subject, `held` and `none` |
| --- | --- | --- |
| payment_failed | A payment failed | A payment failed |
| second_notice, third_notice | An invoice is still unpaid | An invoice is still unpaid |
| final_notice | Final notice before new runs stop | An invoice is still unpaid |
| suspended | New runs have stopped until an invoice is paid | An invoice has been unpaid for 30 days |
| reinstated | New runs have started again | {Invoice} is paid |

`{Invoice}` is "Invoice SIM-0002", or "An invoice" with no number, as today. The one link is the billing page, as
today.

**Why no migration.** Under option B, a group that pays has no practice held by its firm. So "New runs have started
again" depends only on the group's own status. That needs no counts function for `tp_billing`, and the pinned list
(`billing.db.test.ts:662-676`) stays as it is.

---

## 8. Reopening a closed organization: recommended against, now

**What exists.** Nothing in the product closes an organization: no route, job, seed, runbook or e2e step. Only the
owner's SQL in tests does (`console-routes.db.test.ts:694`, `billing-routes.db.test.ts:559`). #56's words promise no
reopening: `CLOSURE_TICKET`, "if you have a question about the closure" (`lib/routes/billing.ts:211-212`), and "Closed
is final" in its comment.

**What closure would mean is unbuilt:**
- its grants, which would reach PHI after the account ends;
- its memberships and sessions;
- Stripe's subscription;
- the data export and the deletion under the retention policy (PRD:99, "a practice churns"; PRD:715, milestone 12's
  export and deletion workflows).

A reopen designed now would reopen a state whose meaning is not decided. The cleaner model is that closure ends the
closing organization's grants and memberships as one audited act. Then "reopen" means a new agreement and new grants,
which the practice's administrator approves again (PRD:302: "a revoked grant cannot be restored, only re-approved").

**Recommended:** no reopen in this PR. The closure lifecycle, with its own decision on reopening, belongs to milestone
12's offboarding PR. What this PR does instead:
- the database makes `closed` reachable and leavable only by the owner (`organization_closed_by_closure_only`);
- the console's setter refuses it;
- the customer's words keep promising nothing;
- `agreement_ended` gives PaidWhole a reversible way to stop an organization whose agreement has ended until that
  lifecycle exists.

That PR must also decide whether a closed grantee keeps reading through its grants. Today it would, and section 2's B
refuses only its work.

---

## 9. Founder rulings this touches (none is reversed)

| Ruling | What it says | What this design does |
| --- | --- | --- |
| ADR 0050 (deciders: the founder; 2026-10-16), Decision, "Dunning and suspension" (#42's text :67-81) | Billing's suspension is computed, not stored; it ends the moment `invoice.paid` arrives; once a suspended organization's invoice is paid, the mail says new runs have started again. | **Kept.** Paying an invoice still lifts billing's hold at once, and the `reinstated` stage and its audit stay. Only the mail's words change: they say runs restarted when they did, and say what still holds when PaidWhole's own suspension does (SS-08). A dated amendment. |
| ADR 0050, Consequences (:118) | "Firms are billed at milestone 12 …; a firm's own invoices and its suspension rules come then." | **Decided in part, early.** PaidWhole's own suspension or closure of a firm stops its people's new work at the practices it is granted. A firm's nonpayment rules stay at milestone 12, untouched. This is an amendment of a deferred point, not a reversal: no rule existed to reverse. ADR 0080 and the PR's description name it so the founder sees it with the domain model's approval. |
| ADR 0055 (the founder), Billing (:56-60) | "A paid invoice's stage is decided from when it was paid: on or after its suspension time means reinstated (with the notice and the audit event)". | **Kept.** The stage and the audit are unchanged; the notice's words follow section 7. |
| ADR 0055, the console (:68-69) | "The console also suspends and reinstates an organization (`console.organization_status`), through the same run refusal billing uses." | **Kept.** The same route ID and the same refusal function. It now records the reason, note and time, and checks in Postgres too. A dated amendment. |
| Q13 (the founder, 2026-10-21; HANDOFF.md, PR 6b plan) | "suspension waits for a delivered dunning notice or an operator-recorded contact" (for the billing pull request). | **Untouched.** It changes `billing_standing`, which this design only reads. It is the next schema PR's (section 16). |
| PRD (the founder's): :61, :223, :249 | The practice is the tenant; a firm does not own its workspace. Failed payments suspend new runs after 30 days, data readable. "A suspended organization can read but not run". | **All kept,** and :249 now holds for firms too. |
| The standing rule (2026-10-18) | Recommend and build only the best option. | Option B, section 2. |

**Does lifting a suspension or paying an invoice change anything the founder ruled?** No.
- PaidWhole's lift is immediate, as ADR 0055 has it. It now requires a reason from a closed list and is audited as
  `organization_reinstated`.
- Paying an invoice lifts billing's hold at once and never lifts PaidWhole's, as before. The only change is that the
  mail stops claiming runs restarted when PaidWhole's own suspension still holds them.
