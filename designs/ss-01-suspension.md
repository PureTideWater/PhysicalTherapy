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
| 8 | Billing page | `lib/routes/billing.ts:223-309`; `apps/worker/src/billing/account.ts:114` | `organization.status` as `tp_billing` | Reads the stored reason and time, and gives a firm's suspension its real effect (section 6). |
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
