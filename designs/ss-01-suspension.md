# SS-01: a suspended organization's people start no new work wherever they reach, and PaidWhole's suspension keeps its reason (Lane A schema PR)

Design contract, 2026-10-27, revised the same day after its adversarial review (section 18 lists each finding and what
became of it). Against `claude/build-platform` at e908c21 and PR 6b-4 (#42, `co-001/pr-06b-mail-streams`, head
15189a50, migration `20261107090000_mail_streams.sql`). Branch `co-001/ss-01-suspension-refusal`, opened only after
#42 merges (LANES.md rule 2: one schema PR at a time). Reserved: ADR 0080; test-matrix BIL-07 to BIL-10;
`packages/synth` cases BIL-07 to BIL-10 (module 15). Claim: LANES.md row 185.

Sources: LANES.md "Handed to Lane A" (2026-10-26, from #56); `approval-summaries/lane-b-ux-suspended-standing-status.md`
("Handed to Lane A"); `designs/lane-b-ux-suspended-standing.md` ("After the design review", SS-01 to SS-14);
`designs/lane-b-ux-review.md` §5 (UX-004 is its only suspension item) and the console findings that touch the same card
(UX-046, UX-203, UX-204); the two scouts' reports (`progress/design-ss01-database.md`, `progress/design-ss01-application.md`);
the adversarial review (`progress/design-ss01-review.md`). Every claim below was re-read at e908c21 or at #42's head, and
the database claims were probed on databases migrated from empty through #42 (section 17).

This is a schema change, so it needs the founder's SHA-256 approval of the regenerated domain model. It reverses no
founder ruling. It keeps three rulings that a stored suspension could otherwise have bypassed: PRD:223, ADR 0050's
computed nonpayment hold, and Q13 (section 9). It touches no money computation, no pricing or ledger package and no
freeze.

---

## 0. In ten lines

1. **SS-01, fixed as the tenancy model reads it.** A suspended or closed organization's people start no new work
   through its grants. At a practice they reach that way, a person is refused any run-starting work that only the held
   grant lets them do. Work their own practice's role, or another active firm's grant, allows carries on. The
   practice's own staff, its other grantees and its jobs carry on. The owner's suspension still stops the practice for
   everyone, jobs included.
2. **Both places, said precisely.**
   - The route wrapper asks Postgres before every run-starting route, with the route's permission
     (`practice_run_refusal_for`).
   - Postgres refuses the same work again where a person records it. Five trigger tables are written by a person: an
     upload, a pricing run, an audit report, a report document and an ROI statement. Each is checked against the
     permission its writer needs.
   - Triage, a packet export and an upload's retry write no such row: the request only queues the practice's job. For
     these three, a grantee's refusal is the wrapper's alone. A registry test holds every route that queues that work to
     the wrapper's list.
3. **PaidWhole's suspension keeps its reason.** It stores a closed-list reason (at the customer's request, a security
   hold, the agreement ended) and the time on `organization`, and an append-only history row with an internal note, the
   actor and the time. One definer setter writes them, with a person check, a platform-permission check and an audit
   action `tp_app` may not write. Nonpayment is not a stored reason: it stays billing's computed hold, as PRD:223, ADR
   0050 and Q13 rule.
4. **The words.**
   - A refusal for PaidWhole's suspension says "PaidWhole", never "a platform administrator".
   - Every refusal says whose hold it is and what restarts the work, or that nothing does.
   - Someone outside the held organization learns that new work is on hold, and whether it can restart, but never why.
   - No organization name goes into a database message.
5. **SS-08.** The dunning mail chooses its words when it is sent, from the organization's kind, status and billing
   standing. It never says "New runs have started again" while runs are held by PaidWhole's suspension, by a closure or
   by another unpaid invoice. It never promises a firm, or a closed group, anything about runs.
6. **Closed stays closed.** No reopen now. The database refuses any status change into or out of `closed` except the
   owner's, and refuses suspending the internal organization.
7. **One migration and one ADR.** ADR 0080, with dated amendments on #42's final text of ADRs 0050 and 0055. The
   migration also adds the worker's new refusal code to `packet_export_refusal_codes()`.
8. **Two follow-ups get their own PRs:**
   - a schema PR right after this one: the suspension and reinstatement mail, and the founder's Q13 (suspension waits
     for a delivered notice or a recorded contact);
   - the closure lifecycle, at milestone 12.

---

## 1. The problem, with evidence

### 1.1 What the code does (e908c21; `console.ts`, `dunning.ts` and `practice.ts` as #42's head has them)

| What | Where | What it does |
| --- | --- | --- |
| `organization_run_refusal(uuid)` | `packages/db/migrations/20261029150000_billing.sql:268-279` (`packages/db/functions/organization_run_refusal.sql:14-18`) | Reads one organization's `status`, then `billing_standing`. Its words: "the organization is suspended: its data stays readable, and new runs start again once a platform administrator reinstates it". |
| `practice_run_refusal(uuid)` | billing.sql:281-293 | Checks `practice_in_scope`, then returns `organization_run_refusal(p.organization_id)`: the **owning group only** (:289). |
| `refuse_new_work_while_suspended()` | billing.sql:297-308 | Repeats the owning-group-only lookup (:302) and raises 55000 with the words. |
| The seven triggers | billing.sql:310-318 | `pricing_run`, `audit_report`, `report_document`, `roi_statement` and `digest` on insert; `source_document` on insert of a top-level document; `packet_version` when `exported_at` is first set. |
| A firm's reach | `20261015140000_tenancy.sql:95-116` (`grant`); `packages/db/functions/effective_practice_access.sql` (the `'grant'` branch) | A firm owns no practice. It reaches each one only through a grant in force. The grant branch ignores the grantee's status. |
| A person's roles at a practice | `packages/db/src/authz/scope.ts:141-160` (`accessByPractice`); `packages/db/functions/app_actor_permitted.sql` | The **union** of the roles from every path (ownership, each grant, a support grant), in the handler and in Postgres alike. `roles_permit` allows a permission when some held role allows it and none denies it (a viewer denies `phi.export`). |
| The console's suspend | `apps/web/src/lib/routes/console.ts:90-113` at #42's head (a #42 file) | Input `{organizationId, status: suspended or active}`. It refuses `closed` and `internal` **in the handler only** (:98-106), then runs a direct `UPDATE organization SET status` as `tp_app` (:107). The wrapper audits `organization_status_set` with no status and no reason, the no-op included. |
| Postgres behind it | tenancy.sql:494 (policy), :596-597 (`GRANT INSERT (…, status)`, `GRANT UPDATE (name, billing_customer_ref, status)`) | A platform administrator acting as `tp_app` may set any status on any organization: close one, reopen a closed one, or suspend the internal one. |
| The console card | `apps/web/src/app/console/organizations/[organizationId]/page.tsx:54-76` | "Suspending refuses new runs for every practice of the organization (pricing, monitoring, packet exports, reports and uploads)". For a firm this is false: it owns no practice, and its suspension refuses nothing. The list also leaves out triage, which is refused (`apps/web/src/lib/billing/runs.ts:13`). |
| Dunning (SS-08) | `apps/worker/src/billing/dunning.ts`, words at :93-113, the stage's downgrade at :234-237, `sendOne` at :141-185, at #42's head (a #42 file) | Downgrades `reinstated` to `resolved` only when `billing_standing` is suspended **when the stage is recorded**. `sendOne` reads only the invoice, so a send or a retry 1 to 60 minutes later mails "Invoice X is paid. New runs have started again." while PaidWhole's suspension, a closure, or another invoice that reached 30 days in between holds runs. The due query (:211-221) has no kind filter, so a firm's owners read "New runs stop on …" and "new runs have stopped", though a firm's nonpayment refuses nothing (ADR 0050:118; `packages/billing/src/standing.ts:7-9`). |
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

| # | Path | Where | Asks today | After this design |
| --- | --- | --- | --- | --- |
| 1 | Route wrapper, the 9 run-starting routes | `apps/web/src/lib/http/invoke.ts:500-504`; the list at `lib/billing/runs.ts:10-20` | `practice_run_refusal` in the person's scope | Asks `practice_run_refusal_for(practice, spec.permission)` instead (one line). A grantee's hold refuses the route when its permission reaches the person only through held grants. |
| 2 | 55000 mapped to `suspended` | `invoke.ts:294-300` | the database message | Unchanged. The message gets the new words. |
| 3 | Uploads page gate | `lib/routes/uploads.ts:110-117`; rendered at `components/uploads/uploader.tsx:295-298` | `practice_run_refusal` | Asks `practice_run_refusal_for(practice, 'file.upload')`; new words. |
| 4 | Practice home notice | `lib/routes/practice.ts:252` (a #42 file); `app/p/[practiceId]/page.tsx:164-171` | `practice_run_refusal` | Reads the structured `practice_run_hold` and composes the notice: whose hold, why (to the held organization's own members only), since when, what stops for this person, and the next step. |
| 5 | Worker gate, 4 jobs | `apps/worker/src/worker.ts:146-151`; `billing/refusal.ts:14` | `practice_run_refusal` in the job's scope (the actor is the job ID, never a person: `packages/db/src/authz/scope.ts:260-285`) | Unchanged: in a job's scope only the owner's hold applies. A refused `packet_export` now also writes `packet_export_refused` with the code `organization_suspended` (section 5.4), which the migration adds to `packet_export_refusal_codes()`. Its page then reads "refused" with E1, where today it reads "in progress" and, an hour on, "No result came back within an hour". |
| 6 | The seven triggers | billing.sql:310-318 | `refuse_new_work_while_suspended()` | The function is recreated on the shared decision. In a person's transaction it refuses a grantee's person when the table's work needs a permission that only held grants give them (the map in section 4.4). In a job's transaction, only the owner's hold applies, as today. |
| 7 | Job outcome label | `app/p/[practiceId]/page.tsx:137` | none | New words (J1). |
| 8 | Billing page | `lib/routes/billing.ts:231-309`; `apps/worker/src/billing/account.ts:128-131` | `organization.status` as `tp_billing` | Reads the stored reason and time, and gives a firm's suspension its real effect (section 6). |
| 9 | Console card | console organization page :54-76 | `organization.status` | Made true per kind, with the reason form, the tick and the history (section 5.2). |
| 10 | Dunning mail | `dunning.ts:93-113, :141-185` | `billing_standing` when the stage is recorded | Words chosen at send time from kind, status and standing (SS-08, section 7). |
| 11 | Requests that only queue the practice's job | triage (`lib/routes/triage.ts:448`), packet export (`lib/packets/queries.ts:547`), an upload's retry (`lib/routes/uploads.ts:364`) | Only the wrapper, for the owner's hold as well: triage writes no trigger table and is not a run-starting job; the export job and intake run in the practice's job scope | For a grantee's hold, the wrapper's refusal alone, by design (section 2, "Jobs"; D18). pg-boss enqueues on its own connection (`lib/uploads/queue.ts:26-40`), so nothing later in the request could unqueue the job. A registry test (BIL-07) holds every route that queues person-started work to `RUN_STARTING_ROUTES`. |

Model calls are refused by no suspension today (`model_proposal`, `model_budget_hold`). They are not run-starting work
under ADR 0050, and the abstraction queue's calls serve documents already uploaded. This design leaves them as they
are and names it (section 16).

---

## 2. SS-01: the options

What a suspension of a grantee should refuse, and for whom.

| | A. Practice-wide | B. The grantee's people, through its grants (recommended) | C. The grantee loses access |
| --- | --- | --- | --- |
| What it does | A grant in force to a suspended or closed organization stops the practice for everyone: its own staff, its other firms and its jobs | A person who reaches the practice through a suspended or closed grantee's grant starts no new work that only such grants let them do. Work their other paths allow, everyone else's work and every job carry on. The owner's hold still stops everyone. | The grant counts as not in force while its grantee is suspended: no reads, no work |
| Tenancy (PRD:61, "a firm that pays … still does not own the practice's workspace") | Breaks it: another tenant's status stops the covered entity's own work | Keeps it: the suspension acts on the firm's access path, which is the firm's | Keeps it |
| PRD:249, "a suspended organization can read but not run" | Holds for the firm, but also stops a group that is neither suspended nor in arrears | Holds exactly: the firm reads, and does not run through its grants | Breaks it: the firm cannot read |
| Way out for the practice | None in the product. Ending a grant is milestone 12 (`lib/routes/settings.ts:46-48`: grants are a view; `grant.revoke` has no route). The group's only step is a support ticket. | Nothing to get out of: the practice works | Same as B |
| Monitoring, reconciliation, digests and recovery proof | Stop for the practice. Filing windows run on from remittance dates (CLAUDE.md), so disputes can be lost. | Continue | Continue |
| Leverage between tenants | A firm that asks PaidWhole to suspend it ("at the customer's request") stops a client it is leaving | None | None |
| Reasons PaidWhole suspends (D9) | A security hold on a firm stops a clean practice | At the customer's request, security hold, agreement ended: each stops the firm's people's work through its grants, which is what each reason is about | A security hold would want this. But PaidWhole already ends a membership and its sessions in the console, which is the right tool for an access threat (C4's hint says so). |
| Dunning interplay (SS-08) | A group that pays still has a practice held by its firm, so "New runs have started again" is false. Checking that needs a counts-only definer function for `tp_billing`, which changes the list pinned at `billing.db.test.ts:662-676`. | None: a grantee's hold never touches the group's own people | None |
| Database cost | One join per check | `effective_practice_access()` and ten `roles_permit` calls per check: 3.3 to 6.9 ms at 2,001 grants (probe), the same order as `open_practice_scope`, which every request already pays (3.7 ms) | A predicate in `effective_practice_access()`, the heart of every request's scope |
| What the console card can truthfully say | "every practice it is granted stops" | "its people start no new work through its grants at the N practices it is granted; the practices' own staff carry on" | "its people lose access" |

**Recommended: B.** It is the only option that refuses the suspended organization's work without stopping a tenant that
did nothing. It needs no product path the practice lacks, and it keeps PRD:61 and PRD:249 both true. A is simpler, but
it is worse on every axis that matters here: tenant isolation, the practice's continuity, dispute deadlines, dunning
truth, and leverage between tenants. C breaks "can read" and duplicates the console's existing tool for access threats.

**What B decides beneath it:**
- **Which grantees count:** any organization holding a grant in force, a firm or a group (the grant model admits both:
  `effective_practice_access`'s grant branch, `organization_kind IN ('group', 'firm')`). The rule is one rule: an
  organization's hold stops its people's work through its grants, wherever they reach.
- **On what:** the grantee's `status` alone (`suspended` or `closed`), not its billing standing. A firm's nonpayment rules
  are milestone 12's (ADR 0050:118), and `packages/billing/src/standing.ts:7-9` maps a firm's nonpayment to past due on
  purpose. A group grantee's nonpayment already stops its own practices. Whether it should also stop it at practices it
  is granted is a milestone 12 firm-billing rule, recorded in ADR 0080 as open.
- **A person with two paths: the hold is per permission.** A person's roles at a practice are the union of every path's,
  in the handler and in Postgres (section 1.1). So "held only when every path is held" would let a person with any
  second path, even a viewer's, start work with the roles only the held grant gives (the review's F1, probed). The rule
  instead:
  - the person's **unheld roles** are those from paths that are not held: ownership, a support grant, a grant of an
    active grantee;
  - a person who reaches the practice through a held grant is refused a piece of run-starting work when their unheld
    roles do not permit it;
  - the work's permission is the route's (`spec.permission`) at the wrapper, and the guarded table's (section 4.4) in
    Postgres.

  Probe (section 17, Q-series):

  | Person | Refused | Not refused |
  | --- | --- | --- |
  | G's practice administrator and F's principal | every run-starting permission | none |
  | F's principal and a viewer in active F2 | pricing runs, triage and reports, ROI statements, uploads | packet exports were already denied by the viewer role |
  | G's analyst and F's principal | pricing runs, ROI statements, packet exports | uploads and triage, which the analyst role allows |
  | G's analyst and F's analyst | nothing | everything: F's grant gives them nothing more |
- **PaidWhole's own people:** a support grant is PaidWhole's path. It is never held by a grantee's status, only by the
  owner's, as today.
- **Jobs:**
  - A job's actor is never a person (`scope.ts:278-281`), so only the owner's hold applies. A job is the practice's
    work, not the grantee's.
  - Triage, a packet export and an upload's retry are requests that queue the practice's job. A grantee's refusal for
    them is the wrapper's, before anything is queued (section 1.3, row 11; D18).
- **A packet export a grantee's person asked for before the suspension:** it finishes.
  - A request made after the suspension is refused at the route.
  - The print the job makes is a document inside the product, approved under the two-person rule, and the grantee's
    people may still read it.
  - The submission to the payer is a person's logged act. The gate does not cover submissions for any hold, the
    owner's included.
  - ADR 0050's "work already started finishes" covers it.
  - The alternative would re-evaluate the requester's access inside the job. That would duplicate
    `effective_practice_access` for a person who is not the actor: a second access definition that could drift.
- **A closed grantee:** refused like a suspended one. Whether a closed organization keeps reading through its grants
  is the closure lifecycle's question (section 8). The cleaner model is that closure revokes its grants, which needs
  that lifecycle. Today nothing in the product closes an organization, and section 4 makes closing an owner-only act.

---

## 3. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | Option B (section 2), held per permission. | Tenancy, continuity and truth of every notice. The union of roles across paths makes a per-path hold unsound. |
| D2 | One internal decision, `practice_work_hold(uuid)`, shared by the route's question, the page's read and the trigger. It returns either the owner's hold, or the grantee's hold together with the run-starting permissions it stops for this person (`stopped`). `practice_work_refusal(uuid, permission)` turns that into one sentence for one piece of work. Neither function is executable by an application role. | Today the owner lookup is written twice (billing.sql:289 and :302). Three callers of one body cannot drift. |
| D3 | `practice_run_refusal(uuid) RETURNS text` keeps its signature and grant. It answers for any run-starting work: a person is refused when any permission is stopped for them. The previous image and the worker call it. The current image asks the new `practice_run_refusal_for(uuid, permission)`, passing the route's permission. | The previous image and the worker keep calling it unchanged during a deploy and after a rollback. The worker runs in a job's scope, where only the owner's hold applies. For a person whose held grant stops part of their work, the previous image fails closed (section 4.7). |
| D4 | A new structured read for pages, `practice_run_hold(uuid)`. It returns whose hold, kind, cause, reason code, since and `stopped`. It never returns an organization name. | The home names whose hold it is, why (to members only), since when, and what stops for this person, and gives the right next step. The gate keeps one short sentence. |
| D5 | Database messages carry no organization name and no reason code. | A RAISE message reaches the server log and the job tables. The app names the person's own organization, from the row RLS lets them read. |
| D6 | Someone outside the held organization learns that new work is on hold, and whether it can restart, but never why. The rule is decided in Postgres. For the owner's hold, a non-member gets the cause `on_hold` for PaidWhole's suspension and billing's nonpayment alike, with no reason. `closed` stays `closed` for everyone. Members of the owning organization get `suspended` with its reason, or `nonpayment`. | A firm's people at a practice need not learn the group's account matters: neither PaidWhole's reason nor that an invoice is unpaid. The draft hid the first and told the second (the review's F5). With one rule on both paths, and Postgres deciding it, no page can leak a cause it was never given. Whether the work can restart is theirs to know: a closure ends it. |
| D7 | `organization.status_reason` (closed list, only while suspended) and `organization.status_since`, set by a trigger on every status change. History goes in `organization_status_change`: append-only, with the internal note, the actor and the time, readable only by holders of `organization.manage`. | The customer page reads the reason and the time (as `tp_billing`, by column grant). The note stays PaidWhole's: `tp_app` column grants cannot hide a column from members (tenancy.sql:490, :595), so the note lives in its own table with a platform-only policy. |
| D8 | One definer setter, `console_set_organization_status(target, from_status, to_status, reason, note)`. It checks a person, `organization.manage` and the status the person saw, and writes the row, the history and a reserved audit action. | #42's house pattern (`console_pause_mail_stream` and `console_resume_mail_stream`, mail_streams.sql:1216-1256 at 15189a50): the check lives in Postgres as well as in the handler, and an action the application role may not forge. `from_status` makes a race between two administrators a refusal, never a silent re-suspension. |
| D9 | Suspension reasons: `customer_request`, `security_hold`, `agreement_ended`. Reinstatement reasons: `resolved`, `in_error`. There is no nonpayment reason. | UX-004 proposed the list; the co-founder's ruling covers its words ("Suspended by PaidWhole", "Open a support ticket"), not the list. Nonpayment is billing's computed hold, and the founder ruled it three ways: PRD:223 (after 30 days); ADR 0050 (it ends the moment `invoice.paid` arrives); Q13 (it waits for a delivered dunning notice or a recorded contact). A stored `unpaid_invoice` reason would let the console suspend before 30 days, without the notice, and keep the hold after payment (the review's F2). C4's hint says why the reason is missing. Reinstatement takes a reason because the history and the audit need a code. It stays one click: two buttons, one per reason (UX-046: "The restoring side … stays one click"; UX-035: no pre-answered choice). |
| D10 | Suspend takes UX-046's consequence tick, checked in the route (`confirm`), with the real count. | It is this card's change. UX PR 78 drops its suspend part (section 16). |
| D11 | `tp_app` keeps `UPDATE (status)` and `INSERT (…, status)` for one release, guarded by a trigger: only between `active` and `suspended`, never the internal organization, never into or out of `closed`. The next schema PR after this one is deployed revokes them. | ADR 0009:42-43 (add, backfill, remove: "A migration that could not run under the previous image is split") and ADR 0019:145-147's precedent. Without it, the previous image's Suspend and, worse, Reinstate fail during a deploy and after a rollback. The trigger closes the reopen and internal holes now, in Postgres. |
| D12 | No reopen of a closed organization (section 8). | Closure has no lifecycle yet. A reopen now would be a promise with nothing behind it (#56's SSC-02). |
| D13 | SS-08 is decided at send time in `sendOne`, from `organization.kind` and `status` and from `billing_standing`. `tp_billing` already reads all three (billing.sql:238 for the organization's columns, :264 for the view). No new definer function for `tp_billing`. | Retries come 1 to 60 minutes after the stage was recorded. In between, PaidWhole may suspend or reinstate the organization, and another invoice may reach its 30 days (the review's F8). Under B a group that pays has no practice held by its firm, so no counts function is needed. SS-08 alone needs no migration and could ship after #42 on its own. It stays here because its words depend on this PR's rule and on its stored suspension: two PRs would review the same sentences twice, and the first could only guess at the second's states. |
| D14 | ADR 0080 holds the decision. ADRs 0050 and 0055 get dated amendments on #42's final text. | 0050 owns billing's suspension and the refusal paths. 0055 owns the console's. The new rule (whose hold, for whom, for which work) and the stored reason are one decision across both. |
| D15 | Suspension and reinstatement mail, and Q13, get their own schema PR, the next in the chain after this one. | Both extend #42's outbox: a new kind in `mail_send_kind` and `mail_send_stream_kind`, an outbox table, `operator_record_mail_event` recreated. That needs the deliverability review, not this PR's tenancy and security lenses. Q13 reads the same delivery states. The customer meanwhile reads the suspension on every surface the moment it holds (sections 5 and 6). |
| D16 | The run-starting permissions are a closed list in Postgres, `run_starting_permissions()`: `mapping.edit`, `case.work`, `posting.reconcile`, `phi.export`, `file.upload`. A test holds it equal to the permissions of `RUN_STARTING_ROUTES`. `practice_run_refusal_for` refuses any other permission as a parameter error (22023). | `stopped` and the trigger's map are computed over it. A route added with a new permission fails its test at once, rather than passing a firm's people. |
| D17 | The trigger takes the permission from the table it guards: `pricing_run` mapping.edit; `audit_report` and `report_document` case.work; `roi_statement` posting.reconcile; `source_document` file.upload; `packet_version` phi.export; `digest` none, which means any stopped permission (only a job writes a digest). Any other table raises. | Each is the permission of the route that writes the table: `pricing.ts:325, :403`, `reports.ts:111`, `report-documents.ts:25`, `roi.ts:55`, `uploads.ts:231` and `packets.ts:263`. The seven triggers stay as they are. A new trigger table with no permission named fails closed, on its first insert in any test. |
| D18 | No Postgres stop is built for triage, a packet export or an upload's retry. A grantee's refusal for them is the wrapper's, and a registry test pins the list. | pg-boss enqueues on its own connection, so a refusal later in the request cannot unqueue a job. A database stop would need one of two things. The job could re-check the requester's access, which is a second access definition (rejected in section 2). Or every such enqueue could move after the commit (`afterCommit`), where a queue failure loses a triage request with no schedule to take it up (`invoke.ts:269-281`). The wrapper's question is Postgres's own decision, asked before anything is queued. The owner's hold has the same shape for triage and an upload's retry today. ADR 0080 records this as a known limit (the review's F4). |

---

## 4. Schema: one migration, `20261108090000_suspension_refusal.sql`

It comes after #42's `20261107090000_mail_streams.sql`. The builders take the next free timestamp at the time, and
SUITE-CAP-1 comes after it. Every function is `SET search_path = pg_catalog, public, pg_temp`, owned by `tp_owner`
(the migration runs as the owner), `REVOKE ALL … FROM PUBLIC`, and granted exactly as listed.

The functions this migration recreates are byte-identical on e908c21 and at #42's head:
- `practice_run_refusal`, `refuse_new_work_while_suspended`, `practice_grants` and `packet_export_refusal_codes`;
- none of their function files is in #42's 212 changed files (`progress/ss01-revise-42files.txt`);
- the database scout compared md5(prosrc) for the first three.

The one object of #42's this migration recreates **on #42's body** is the `audit_event_record` policy
(mail_streams.sql:863-870 at 15189a50). #42's dunning functions are only read. The builders re-read the policy, and
every #42 file this PR edits, at #42's final merged head before writing.

### 4.1 Preflight

A `DO` block raises, naming no organization, if any `kind = 'internal'` row is not `active`: "the internal organization
must be active before migration 20261108090000; set it active as the owner, then migrate again". The console has
refused the internal organization since ADR 0055, so none is expected. A silent fix inside a migration would hide how
it happened.

### 4.2 `organization`: the stored reason and time

```sql
ALTER TABLE organization
  ADD COLUMN status_reason text CONSTRAINT organization_status_reason
    CHECK (status_reason IN ('customer_request', 'security_hold', 'agreement_ended')),
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
       (to_status = 'suspended' AND reason IN ('customer_request', 'security_hold', 'agreement_ended'))
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
  shown to a customer.
- **Its rows.** A move from suspended to suspended is a change of reason, or a note added. The suspension's own row is
  the one whose `from_status` is `active`; its `at` equals the organization's `status_since`, because the setter's
  update and insert share one `now()` (the console's card relies on it, section 5.2). The table is append-only like
  `audit_event`, and its rows are kept as long as the organization's record.
- **Area.** `packages/db/domain-model/areas.json` (a #42 file) places it in `tenancy`, and the area's "about" sentence
  gains "and PaidWhole's suspensions and reinstatements of an organization, with their reasons".

### 4.4 Functions

| Function | Change | Predecessor body | Kind | EXECUTE |
| --- | --- | --- | --- | --- |
| `run_starting_permissions() RETURNS text[]` | new | none | `sql IMMUTABLE PARALLEL SAFE` (not a definer) | owner only |
| `practice_work_hold(target_practice uuid) RETURNS TABLE (source text, organization_id uuid, organization_kind text, cause text, reason text, since timestamptz, stopped text[])` | new | none | `sql STABLE SECURITY DEFINER` | owner only (no grant; not to `tp_app`, so the pinned definer lists of `tp_billing` at `billing.db.test.ts:662-676` and of `tp_screening` at `screening.db.test.ts:646` stay as they are) |
| `practice_work_refusal(target_practice uuid, wanted text) RETURNS text` | new | none | `sql STABLE SECURITY DEFINER` | owner only |
| `practice_run_refusal(target_practice uuid) RETURNS text` | `CREATE OR REPLACE` | billing.sql:283-293 (identical at #42's head) | `plpgsql STABLE SECURITY DEFINER` | `tp_app` (unchanged, billing.sql:408) |
| `practice_run_refusal_for(target_practice uuid, wanted text) RETURNS text` | new | none | `plpgsql STABLE SECURITY DEFINER` | `tp_app` |
| `practice_run_hold(target_practice uuid) RETURNS TABLE (…as practice_work_hold…)` | new | none | `plpgsql STABLE SECURITY DEFINER` | `tp_app` |
| `refuse_new_work_while_suspended()` | `CREATE OR REPLACE`; the seven triggers stay as they are | billing.sql:297-308 (identical at #42's head) | trigger, `plpgsql SECURITY DEFINER` | none (as today) |
| `organization_run_refusal(uuid)` | `DROP FUNCTION` | billing.sql:268-279 | none | none. Nothing calls it any more: its only callers were the two above; EXECUTE was the owner's only (billing.sql:405); no TypeScript calls it. |
| `console_set_organization_status(target_organization uuid, from_status text, to_status text, status_reason text, note text) RETURNS boolean` | new | none (#42's console_pause/resume pattern) | `plpgsql VOLATILE SECURITY DEFINER` | `tp_app` |
| `practice_grants(target_practice uuid)` | `DROP` and `CREATE`: the return type gains `grantee_status text` last | `packages/db/functions/practice_grants.sql` (not touched by #42) | `plpgsql STABLE SECURITY DEFINER` | `tp_app` (as today) |
| `organization_status_rules()` | new | none | trigger, plpgsql | none |
| `packet_export_refusal_codes() RETURNS text[]` | `CREATE OR REPLACE`: `'organization_suspended'` appended **last**, after `'verifier_failed'` | `20261103090000_deadline_verification_and_export_attestation.sql:1525-1529` (not touched by #42) | `sql IMMUTABLE PARALLEL SAFE`, as today | `tp_app` (as today) |

**`run_starting_permissions()`** returns `ARRAY['mapping.edit', 'case.work', 'posting.reconcile', 'phi.export',
'file.upload']`. These are the permissions of the nine `RUN_STARTING_ROUTES` (D16), in the order the words list them.

**`practice_work_hold`**, the one decision (as probed, section 17):

```sql
  WITH owner AS (
    SELECT o.id, o.kind, o.status, o.status_reason, o.status_since, s.standing, s.suspended_since,
           o.id = ANY ((SELECT app_actor_organization_ids())::uuid[]) AS member
      FROM practice p JOIN organization o ON o.id = p.organization_id JOIN billing_standing s ON s.organization_id = o.id
     WHERE p.id = target_practice
  ), owner_hold AS (
    -- D6: a non-member learns that work is on hold and whether it restarts, never why.
    SELECT 'owner'::text AS source, id, kind,
           CASE WHEN status = 'closed' THEN 'closed'
                WHEN NOT member AND (status = 'suspended' OR standing = 'suspended') THEN 'on_hold'
                WHEN status = 'suspended' THEN 'suspended'
                WHEN standing = 'suspended' THEN 'nonpayment' END AS cause,
           CASE WHEN member AND status = 'suspended' THEN status_reason END AS reason,
           CASE WHEN status IN ('suspended', 'closed') THEN status_since WHEN standing = 'suspended' THEN suspended_since END AS since,
           NULL::text[] AS stopped
      FROM owner
  ), paths AS (
    -- The person's own paths and roles here; none for a job, whose actor is never a person.
    SELECT a.role, g.organization_id AS grantee, coalesce(a.via = 'grant' AND o.status IN ('suspended', 'closed'), false) AS held
      FROM effective_practice_access() a
      LEFT JOIN "grant" g ON a.via = 'grant' AND g.id = a.grant_id
      LEFT JOIN organization o ON o.id = g.organization_id
     WHERE a.practice_id = target_practice AND app_actor_is_person()
  ), roles AS (
    SELECT coalesce(array_agg(DISTINCT role), '{}') AS every,
           coalesce(array_agg(DISTINCT role) FILTER (WHERE NOT held), '{}') AS unheld
      FROM paths
  ), stops AS (
    -- The run-starting work the person's roles allow, but not without the held grants (D1).
    SELECT coalesce(array_agg(u.wanted ORDER BY u.n), '{}') AS stopped
      FROM roles CROSS JOIN unnest(run_starting_permissions()) WITH ORDINALITY AS u(wanted, n)
     WHERE roles_permit(roles.every, u.wanted) AND NOT roles_permit(roles.unheld, u.wanted)
  ), grantee_hold AS (
    SELECT 'grantee'::text, o.id, o.kind, o.status, o.status_reason, o.status_since, stops.stopped
      FROM paths x JOIN organization o ON o.id = x.grantee CROSS JOIN stops
     WHERE x.held AND cardinality(stops.stopped) > 0
     ORDER BY o.status = 'suspended' DESC, o.id
     LIMIT 1
  )
  SELECT * FROM owner_hold WHERE cause IS NOT NULL
  UNION ALL
  SELECT * FROM grantee_hold WHERE NOT EXISTS (SELECT 1 FROM owner_hold WHERE cause IS NOT NULL)
```

- **Who wins.** The owner's hold wins whoever asks (probe E3). A grantee's hold is a person's alone (B1, D1, D2, E1).
- **Where the paths and roles come from.** `effective_practice_access()` (functions/effective_practice_access.sql) is the
  definition `open_practice_scope` and `app_actor_permitted` already use, so neither the paths nor the roles can drift
  from the scope. `roles_permit` is the same allow-and-no-deny test `app_actor_permitted` applies. The hold only ever
  takes work away: a permission the union of roles does not allow is never in `stopped`, and the route's permission
  check (`requirePracticePermission`) or the table's policy refuses it as today.
- **The grantee row** appears only when something is stopped. A person whose held grant gives them nothing their other
  paths do not (probe W) is not held, and their home shows no notice.
- **`billing_standing`** is read as the owner, as `organization_run_refusal` read it. It has one row per organization
  (billing.sql:247-260), so the join drops none.
- **The reason** (`status_reason`) of a grantee's hold is the grantee's, returned to its own members, who are the only
  people a grantee row is ever about.

**`practice_work_refusal(target, wanted)`** maps the hold to one sentence (section 6, R1 to R6), with no name and no
reason code:
- the owner's hold gives R1, R2, R3 or R6 whatever `wanted` is;
- a grantee's hold gives R4 or R5 only when `wanted IS NULL` (any run-starting work) or `wanted = ANY (stopped)`;
- otherwise it gives null.

**`practice_run_refusal(target)`** keeps its scope check (`insufficient_privilege` outside the scope) and returns
`practice_work_refusal(target, NULL)`. **`practice_run_refusal_for(target, wanted)`** has the same scope check. It
raises `invalid_parameter_value` (22023) when `wanted` is null or not in `run_starting_permissions()`. Otherwise it
returns `practice_work_refusal(target, wanted)`. **`practice_run_hold`** has the same scope check and returns
`practice_work_hold(target)`.

**`refuse_new_work_while_suspended()`** takes the permission from `TG_TABLE_NAME` (D17), then raises
`practice_work_refusal(NEW.practice_id, wanted)` with SQLSTATE 55000, as today:

```sql
  CASE TG_TABLE_NAME
    WHEN 'pricing_run' THEN wanted := 'mapping.edit';
    WHEN 'audit_report', 'report_document' THEN wanted := 'case.work';
    WHEN 'roi_statement' THEN wanted := 'posting.reconcile';
    WHEN 'source_document' THEN wanted := 'file.upload';
    WHEN 'packet_version' THEN wanted := 'phi.export';
    WHEN 'digest' THEN wanted := NULL;  -- only a job writes a digest
    ELSE RAISE EXCEPTION 'refuse_new_work_while_suspended names no permission for %', TG_TABLE_NAME USING ERRCODE = 'internal_error';
  END CASE;
```

It is a definer, so its inner calls read `app.actor_id` as set by the transaction that writes the row. A BEFORE trigger
fires before the row's CHECKs, foreign keys and RLS `WITH CHECK`, so a held person's insert reads 55000 with the
sentence first (probe Q: the analyst-and-principal's pricing-run insert is refused 55000, and their upload is recorded).

**`console_set_organization_status`**:

1. **Who may call it.** Refused (`insufficient_privilege`, "only a platform administrator suspends or reinstates an
   organization") unless `app_actor_id()` is set, `app_actor_is_person()` and `app_actor_platform_permitted('organization.manage')`.
2. **The row.** It locks the row `FOR UPDATE` where `kind IN ('group', 'firm')`. Not found raises `no_data_found`.
3. **Closed.** `closed` raises `check_violation`, CONSTRAINT `organization_closed_by_closure_only`.
4. **The status the person saw.** A reinstatement of an organization that is already active returns `false` and
   writes nothing, as today's no-op does. Any other `current.status <> from_status` raises `check_violation`,
   CONSTRAINT `organization_status_changed_meanwhile`. So a suspension with one reason can never silently replace
   another administrator's suspension with a different one.
5. **The moves it allows:**
   - `active` to `suspended` with a suspension reason;
   - `suspended` to `suspended` with a different suspension reason, or with a note (a change of reason);
   - `suspended` to `active` with a reinstatement reason.

   Anything else raises `check_violation`, CONSTRAINT `organization_status_change_reason`; `unpaid_invoice` is refused
   this way (probe S0). The same reason with no note returns `false` and writes nothing.
6. **The writes.** It updates `status` and `status_reason` (the trigger stamps `status_since` when the status moves),
   inserts the history row (`note` trimmed, an empty one stored as null), and inserts
   `audit_event (actor_id, actor_kind 'user', action, object_type 'organization', object_id, purpose = the reason)`.
   The action is `organization_suspended` for a suspension or a change of reason, and `organization_reinstated` for a
   reinstatement. It returns `true`.

**`practice_grants`** keeps its permission check and order. It appends `o.status AS grantee_status`, the status alone,
never the reason. The previous image reads it with `SELECT *` and maps named fields (`settings.ts:220-228`), so the
extra column is ignored.

**`packet_export_refusal_codes()`** gains `'organization_suspended'` as its thirteenth and last code. The trigger
`audit_event_packet_export_attempt` (deadline_verification….sql:1521-1541) refuses any `packet_export_refused` whose
purpose is not in the list. Without the new code the worker gate's audit insert raises 23514 and the job throws, is
retried and alerts (the review's F3). Its comment gains "then the worker gate's" after "the readiness reasons in their
order, then the verifier's".

### 4.5 The reserved audit actions (on #42's body)

`DROP POLICY audit_event_record ON audit_event;` then `CREATE POLICY` as #42 left it (mail_streams.sql:863-870 at
15189a50), with `'organization_suspended', 'organization_reinstated'` added to the `action NOT IN (…)` list. `tp_app`
cannot forge them. The setter writes them as the owner (`audit_event_operator_record`, audit_and_operations.sql:54). No
existing code writes either action.

### 4.6 Grants, exactly

| Role | Gains | Loses |
| --- | --- | --- |
| `tp_app` | EXECUTE on `practice_run_hold(uuid)`, `practice_run_refusal_for(uuid, text)` and `console_set_organization_status(uuid, text, text, text, text)`; SELECT on `organization_status_change` (platform read policy). Table-level SELECT on `organization` (tenancy.sql:595) already covers the two new columns. `packet_export_refusal_codes()` keeps its grant. | Nothing in this migration. `UPDATE (status)` and `INSERT (status)` on `organization` go in the next schema PR after this one is deployed (D11). |
| `tp_billing` | `GRANT SELECT (status_reason, status_since) ON organization` | nothing. Its definer functions are unchanged. |
| others | nothing | nothing |

### 4.7 Safe with the previous image running, and on rollback

Rollback is the previous image on this schema, for as long as it runs: minutes for a deploy, and as long as it takes
for a rollback (ADR 0009:42-43). The table says what that image does here, without softening it.

| The previous image does | On the new schema |
| --- | --- |
| Calls `practice_run_refusal` (route gate, uploads gate, home, worker) | Same signature and grant. It answers for any run-starting work (D3). So a person whose held grant stops only part of their work is refused all nine routes while the grantee is held. That is stricter than the new image: it fails closed. Everyone else gets exactly the new image's answers. |
| Its home prints its fixed suffix after the database's sentence (page.tsx:164-171): "Everything here stays readable; uploads, pricing runs, monitoring, packet exports and reports start again once it is resolved. The organization's administrator sees the standing and what to do next in Settings, Billing." | After R1, R2, R3 and R6 the suffix repeats a clause, and for a firm's person "the organization's administrator" means the practice's. After R4 and R5 (a grantee's hold) it is wrong in one point, since monitoring never stopped, and it does not say which organization's administrator it means. **Accepted, and recorded in ADR 0080:** the refusal itself is right; the suffix is the previous image's own text; no wording of R4 or R5 can make "monitoring … start again" true. |
| Maps 55000 to `suspended` with the message | Same code, new words |
| Suspends or reinstates with a direct `UPDATE organization SET status` as `tp_app` | Allowed between active and suspended (D11); the trigger stamps `status_since`. No reason, no history row, no reserved action: its wrapper's `organization_status_set` audits it as before. The card then reads "who suspended it was not recorded" (C7). Closed and internal are refused, as its handler refuses them first. |
| Reads `practice_grants` with `SELECT *` | The extra column is ignored |
| Inserts an organization `(id, kind, name)` | Unchanged; the trigger leaves `active` alone |
| Dunning (#42's words) | Unchanged until the new worker image: the same words as today, nothing worse |
| Its worker refuses a `packet_export` | It writes no `packet_export_refused`, so the page reads as today ("in progress", then the hour's message). Only the new worker writes the new code. |

The migration takes a short lock on `organization` and on `audit_event` (the policy). #42 recreated the same policy
the same way. The dry run, forward and back, is the house check (ADR 0009:37-43).

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

- **The constants.** `SUSPENSION_REASONS = ['customer_request', 'security_hold', 'agreement_ended']` and
  `REINSTATEMENT_REASONS = ['resolved', 'in_error']` are exported from `@tp/db/runtime`, beside `ORGANIZATION_STATUSES`
  in `packages/db/src/schema/tenancy.ts` (a #42 file). The database CHECKs hold the same lists, and a test compares
  them.
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
- **Route-test sample:** `{ change: 'reinstate', organizationId, reason: 'resolved' }`. On the world's active
  organization it is a no-op, as today's `status: 'active'` sample is.

### 5.2 The console's organization page (`apps/web/src/app/console/organizations/[organizationId]/page.tsx`; its data from `organizationPage`, console.ts:183-260)

- **What it reads:**
  - `status_reason` and `status_since`;
  - the 20 latest `organization_status_change` rows, with the actor's email (the members query already joins `"user"`
    as the platform administrator);
  - **who suspended it and when:** the history row whose `from_status` is `active` and whose `at` equals
    `status_since` (section 4.3). None means the previous image suspended it, and the card says so (C7);
  - **a change of reason since:** the latest row from `suspended` to `suspended` whose `at` is at or after
    `status_since`, if one exists (C7's third line). So when another administrator changes the reason, the card never
    names them as the one who suspended (the review's F6);
  - the consequence counts:
    - for a group: its active practices (`console_practices(id)`), and the grants in force it holds as a grantee;
    - for a firm: its grants in force.

    Both use `console_grants(id)` rows with `organization_id = id`, not revoked, and `starts_at <= now() < ends_at`.
- **Active (group or firm):** the card "Suspension" with the reason select and its hint, the optional note and the tick
  (section 6, C1 to C6). Submitting "Suspend the organization" sends `change: 'suspend'`.
- **Suspended:**
  - the card "Suspended", with who, when and why (C7, C8) and the note;
  - a "Change the reason" form (`change: 'reason'`);
  - two one-click buttons, "Reinstate: the cause is resolved" and "Reinstate: suspended in error"
    (`change: 'reinstate'`).
- **History** under the card (C10).
- **Closed, and the internal organization:** no card, as today (:54).
- **The Grants card's State column** (:323-324) reads C11 when the grantee is suspended and C12 when it is closed.
  This is UX-203's "a suspended firm's grant still reads 'in force'", in B's words. The page's order and summary stay
  UX PR 79's.

### 5.3 The route wrapper, the uploads gate and the practice home

- **`apps/worker/src/billing/refusal.ts`** (not a #42 file): adds `practiceRunRefusalFor(client, practiceId, permission)`,
  `SELECT practice_run_refusal_for($1, $2) AS reason`, exported from `@tp/worker/billing` beside `practiceRunRefusal`
  (`billing/public.ts:30`). `practiceRunRefusal` stays for the worker's gate.
- **`apps/web/src/lib/http/invoke.ts:501`** (not a #42 file): `practiceRunRefusalFor(scope.client, practiceId,
  spec.permission)`. It runs after `requirePracticePermission`, as today, so a person whose roles do not allow the
  route is refused 403 before any hold is asked.
- **`apps/web/src/lib/billing/runs.ts`:**
  - the comment says the wrapper asks with the route's permission, and that triage, a packet export and an upload's
    retry are refused by the wrapper alone for a grantee's hold (D18);
  - it gains `CONTINUES_STARTED_WORK = new Set(['practice.uploads.complete'])`. That route queues intake for an
    upload its request route already gated (uploads.ts:325-341). The registry test reads this set (BIL-07).
- **`lib/routes/uploads.ts:112`:** `practiceRunRefusalFor(scope.client, practiceId, 'file.upload')`.
- **`apps/web/src/lib/billing/hold.ts` (new):** `practiceHold(scope, practiceId)`.
  - It calls `SELECT * FROM practice_run_hold($1)`.
  - For a grantee's hold, it reads the person's own organization's name (`SELECT name FROM organization WHERE id =
    $1`; a member reads their own row, tenancy.sql:490).
  - It asks, from `app_actor_memberships()` (the roles the shell already resolves), whether the person is a member of
    the held organization and whether they hold `organization.billing` in it.
  - It returns `{ source, cause, reason, since, stopped, name, viewer: 'member' | 'other', billingHref }`.
  - The cause already encodes D6 (a non-member never receives `suspended` or `nonpayment` for the owner's hold), so
    the page cannot say more than Postgres gave it.
- **`apps/web/src/lib/billing/suspension-words.ts` (new):** the one module that composes the home's notice (H1 to
  H13), the job outcome label (J1), the stopped-work list, and the grant states (C11, C12, G1, G2). It is a pure
  module, so the property test reads it whole.
- **`lib/routes/practice.ts:252` (a #42 file):** `suspension: await practiceRunRefusal(…)` becomes
  `hold: await practiceHold(…)`, composed with the words module.
- **`app/p/[practiceId]/page.tsx`:**
  - :164-171 renders `hold.title`, `hold.body` and `hold.nextStep` (a link when the person can act), with
    `data-notice="suspended"` and `data-hold-source`;
  - :137's outcome label becomes J1.
- **No change:** `lib/http/next.ts:172-173`, `components/uploads/uploader.tsx:100` and the JSON 402
  (`lib/http/handler.ts:26`). They show the database's sentence, which now reads well after "Not started: " and
  "Uploads are paused: " (R1 to R6).

### 5.4 The worker

- **`apps/worker/src/worker.ts:146-151`.** When the refused job is `packet_export`, the gate also writes
  `packet_export_refused` on the payload's version (`packet_version_id`) with `purpose: 'organization_suspended'`.
  - It does so in the same job-scope transaction as the refusal check, through `recordAuditEvent`, with the job as the
    service actor on the worker's own login, as `audit_event_packet_export_attempt` requires.
  - `packet_version_export_attempt` (functions/packet_version_export_attempt.sql:20-40) then reads `refused` with that
    code, where today it reads "in progress" and, an hour on, "No result came back within an hour".
- **`apps/worker/src/packets/readiness.ts:43-56`.**
  - `PACKET_EXPORT_REFUSALS` gains `'organization_suspended'` last, in the database's order (4.4).
  - `ExportReadinessReason` becomes `Exclude<PacketExportRefusal, 'verifier_failed' | 'organization_suspended'>`. So
    `EXPORT_REQUEST_REFUSALS` (`packets/services.ts:472`, a `Record` over it) needs no entry: the request never gives
    that reason, because the wrapper refuses first.
- **`apps/worker/src/packets/export-attempts.db.test.ts:163-165`.** The first check (TypeScript equals the database, in
  order) passes with both lists widened. The filter at :165 excludes `organization_suspended` as it excludes
  `verifier_failed`.
- **`apps/web/src/lib/packets/export-attempts.ts:30`.** `EXPORT_REFUSAL_TEXT.organization_suspended` is E1.
- **Nothing else changes** in the worker's gate: in a job's scope only the owner's hold applies (D1).

### 5.5 The customer's billing page

- **`apps/worker/src/billing/account.ts`** (not a #42 file): `organizationBilling` (:128-131) and `consoleBillingStatus`
  (:373-390) also select `o.status_reason, o.status_since`, as `tp_billing` by the new column grant. `BillingView` and
  the console's row gain `statusReason` and `statusSince`.
- **`lib/routes/billing.ts` `accountStanding` (:231-309)** uses them for the label, notice and next steps (B1 to B10).
  A firm suspended or closed by PaidWhole is now told what its people cannot do. A firm's nonpayment still reads past
  due, with no run claim (`standing.ts` unchanged).
- **The comment at :221-230** becomes: "A firm's unpaid invoice refuses no run before milestone 12 (docs/adr/0050);
  PaidWhole's suspension or closure of a firm stops its people's new work through its grants (docs/adr/0080)."
- **The console's Billing status** (`apps/web/src/app/console/billing/page.tsx:23`): the Standing cell for "Suspended
  by PaidWhole" adds the reason's label (O1).

### 5.6 The practice's grants (`lib/routes/settings.ts:198-243`, a #42 file; `app/p/[practiceId]/settings/agreements/page.tsx`)

`practice_grants` returns `grantee_status`. The row's state reads G1 or G2 when the grantee is suspended or closed, so
the practice's administrator knows why the firm's people cannot start work there through the grant. It shows that the
grantee's account is on hold, or closed, and never why (D6).

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
- **The verb.** "reinstates", with its object named, is the verb on every surface. #56 chose it to match the database's
  words (its review's UX-8), so BIL-05's and BIL-06's verb stands. BIL-05's row changes in one phrase only: "with no
  date" becomes "with the date PaidWhole suspended it, when one is stored".
- **No figures, and nothing CO-11 forbids.** No amount, no "AI", no "recovered".
- **Whose and why (D6).** A person's own organization is named; another tenant's is not. The reason, and whether the
  owner's hold is PaidWhole's or billing's, is told only to the held organization's own members. Anyone else reads that
  the account is on hold, or closed.
- **The work list.** For the owner's hold: pricing runs, triage, reports, packet exports, uploads and monitoring. For a
  grantee's hold, `{stopped}`: the stopped permissions in `run_starting_permissions()` order, in these words, joined
  with commas and "or" before the last:

  | Permission | Words |
  | --- | --- |
  | `mapping.edit` | pricing runs |
  | `case.work` | triage, reports |
  | `posting.reconcile` | ROI statements |
  | `phi.export` | packet exports |
  | `file.upload` | uploads |

  For example, a firm principal alone: "pricing runs, triage, reports, ROI statements, packet exports or uploads"; a
  group analyst who is also a firm principal: "pricing runs, ROI statements or packet exports".
- **"Through its grant."** Every grantee sentence says the work stops through the organization's grant, because work a
  person's other access allows carries on.
- **The check.** `pnpm lint:copy` runs over every new string.

Placeholders in braces are filled by code.

### 6.1 The database's sentences (no name, no reason; R1 to R6)

They read after "Not started: " (next.ts:172, uploader.tsx:100), after "Uploads are paused: " (uploads.ts:117), in
the JSON 402 `reason`, and as the 55000 message.

| ID | Hold, and who reads it | Sentence |
| --- | --- | --- |
| R1 | owner, suspended by PaidWhole; to the owning organization's members | PaidWhole has suspended your organization, so no new work starts at this practice until PaidWhole reinstates your organization; everything here stays readable |
| R2 | owner, closed; to everyone | the practice's organization is closed, so no new work starts here; everything here stays readable |
| R3 | owner, nonpayment; to the owning organization's members | an invoice of your organization has been unpaid for 30 days since its payment failed, so no new work starts at this practice until it is paid; everything here stays readable |
| R4 | grantee, suspended; to its members, for stopped work | PaidWhole has suspended your organization, so you start no new work here through its grant until PaidWhole reinstates your organization; you can still read this practice's records |
| R5 | grantee, closed; to its members, for stopped work | your organization is closed, so you start no new work here through its grant |
| R6 | owner, suspended by PaidWhole or for nonpayment; to anyone outside the owning organization (a grantee's people, PaidWhole's support, a job) | the PaidWhole account of the practice's organization is on hold, so no new work starts here; everything here stays readable |

They replace `functions/organization_run_refusal.sql:15-17`. For example: "Not started: PaidWhole has suspended your
organization, so you start no new work here through its grant until PaidWhole reinstates your organization; you can
still read this practice's records."

### 6.2 The practice home's notice (H1 to H13; `role="alert"`, destructive, as today)

`{firm}` is the person's own organization's name. `{date}` is `YYYY-MM-DD`, UTC, as the pages print dates. `{Org}` in
H3 is "Your organization" for a member of the owning organization and "The practice's organization" otherwise.

| ID | Case | Title | Body |
| --- | --- | --- | --- |
| H1 | owner, suspended, a member, date known | New runs have stopped | PaidWhole suspended your organization on {date}{reason clause}. Pricing runs, triage, reports, packet exports, uploads and monitoring do not start here until PaidWhole reinstates your organization. Everything here stays readable. |
| H2 | owner, suspended, a member, no date recorded | New runs have stopped | PaidWhole has suspended your organization{reason clause}. Pricing runs, triage, reports, packet exports, uploads and monitoring do not start here until PaidWhole reinstates your organization. Everything here stays readable. |
| H3 | owner, closed, anyone | No new runs start | {Org} is closed, so pricing runs, triage, reports, packet exports, uploads and monitoring do not start here. Everything here stays readable. |
| H4 | owner, nonpayment, a member | New runs have stopped | An invoice of your organization has been unpaid for 30 days since its payment failed, so pricing runs, triage, reports, packet exports, uploads and monitoring do not start here until it is paid. Everything here stays readable. |
| H5 | grantee, suspended, date known | Work through your organization's grant has stopped | PaidWhole suspended {firm} on {date}{reason clause}, so you start no new {stopped} at this practice through its grant until PaidWhole reinstates {firm}. You can still read everything here, and the practice's own staff carry on. |
| H6 | grantee, suspended, no date | Work through your organization's grant has stopped | PaidWhole has suspended {firm}{reason clause}, so you start no new {stopped} at this practice through its grant until PaidWhole reinstates {firm}. You can still read everything here, and the practice's own staff carry on. |
| H7 | grantee, closed | Work through your organization's grant has stopped | {Firm} is closed, so you start no new {stopped} at this practice through its grant. |
| H13 | owner, on hold (suspended by PaidWhole or for nonpayment), anyone outside the owning organization | New work has stopped here | The PaidWhole account of the practice's organization has been on hold since {date}, so pricing runs, triage, reports, packet exports, uploads and monitoring do not start here. Everything here stays readable. (No date: "The PaidWhole account of the practice's organization is on hold, so …") |

The reason clause is given to the held organization's own members only (D6):

| Reason | Clause |
| --- | --- |
| `customer_request` | , at your organization's request |
| `security_hold` | , while it looks into a security concern |
| `agreement_ended` | , because your organization's agreement with PaidWhole has ended |
| none recorded | (nothing) |

The next step, one line under the body:

| ID | Who | Next step |
| --- | --- | --- |
| H8 | holds `organization.billing` in the held organization (H1, H2, H4, H5, H6) | **Settings, Billing** shows why and what to do next. (a link to `/settings/billing/{organizationId}`) |
| H9 | a member of the held organization without it | {Your organization's} administrator sees why and what to do next in Settings, Billing. |
| H10 | anyone else at an owner-held practice (H13) | The practice's administrator sees why and what to do next in Settings, Billing. |
| H11 | closed, a member (H3, H7) | **Open a support ticket** if you have a question about the closure. (`/support?from=billing`) |
| H12 | closed, anyone else (H3) | (none) |

### 6.3 Job outcome and packet export

| ID | Where | Words |
| --- | --- | --- |
| J1 | home, job outcome (page.tsx:137) | Refused: new work had stopped for the practice's organization |
| E1 | packet export refusal (`EXPORT_REFUSAL_TEXT.organization_suspended`) | New work had stopped for the practice's organization, so the export was not made. Ask for it again once the practice's home no longer says that new work has stopped. |

### 6.4 The customer's billing page (`accountStanding`)

These replace #56's words where they differ. Every other line of #56 stands. All are read by the organization's own
administrators.

| ID | Case | Words |
| --- | --- | --- |
| B1 | label, suspended by PaidWhole, date known | Suspended by PaidWhole since {date} |
| B2 | label, no date recorded | Suspended by PaidWhole |
| B3 | group notice | PaidWhole has suspended the organization{reason clause}: new runs have stopped until PaidWhole reinstates it, and its data stays readable. {payment sentence}{billing hold sentence, as #56} |
| B4 | firm notice (title "The organization is suspended") | PaidWhole has suspended the organization{reason clause}: your people start no new work through its grants at the practices you are granted until PaidWhole reinstates the organization. Every record stays readable, and the practices' own staff carry on.{" An invoice is also unpaid since {date}." when one is} |
| B5 | (retired on review, F2: it was the payment sentence for `unpaid_invoice`, which is no longer a stored reason) | none |
| B6 | payment sentence | Paying an invoice does not reinstate it. (#56's words, unchanged) |
| B7 | next steps by reason (after "Pay {invoice}" when billing holds one, as #56) | `customer_request`: **Open a support ticket** when you want the organization reinstated. · `security_hold`: **Open a support ticket** to find out what PaidWhole needs from you. · `agreement_ended`: **Open a support ticket** to discuss a new agreement. · none, group: **Open a support ticket** to find out why and what reinstates it. (#56's words) · none, firm: **Open a support ticket** to find out why. (#56's words) |
| B8 | forms note | Changing the plan or payment method does not reinstate an organization suspended by PaidWhole. (#56's words, unchanged) |
| B9 | closed firm notice | Your people start no new work through the organization's grants.{owed, as #56} |
| B10 | reason clause on this page | `customer_request` " at your request"; `security_hold` " while it looks into a security concern"; `agreement_ended` " because the organization's agreement with PaidWhole has ended"; none: nothing |

### 6.5 The console (operator words)

| ID | Where | Words |
| --- | --- | --- |
| C1 | active card title | Suspension |
| C2 | group, description | Suspending stops all new work at this organization's practices, whoever starts it: pricing runs, triage, reports, packet exports, uploads and monitoring. Its people also start no new work through any grant it holds at another practice. Every record stays readable. Billing's own hold for an unpaid invoice is separate. |
| C3 | firm, description | Suspending stops this firm's people from starting new work through its grants: pricing runs, triage, reports, packet exports and uploads at the practices it is granted. Work a person starts through their own practice or another firm's grant is not stopped. The practices' own staff and their monitoring carry on, and every record stays readable. |
| C4 | reason select (required, starts empty: "Choose a reason"), and its hint | Options: At the customer's request · Security hold · Agreement ended. Hint: Nonpayment is not a reason here: billing holds an organization whose invoice has been unpaid for 30 days, and lifts the hold when it is paid. A security hold stops new work only: its people still read and download everything. To stop their access, end their memberships. |
| C5 | note field | Note (optional). Hint: Seen only by PaidWhole's platform administrators. No patient details. At most 500 characters. |
| C6 | the tick (required) | group: Suspend {name}: new work stops at its {n} practice(s) for everyone{, and its people start no new work through the {m} grant(s) it holds, when m > 0}; every record stays readable. (n = 0: Suspend {name}: it has no active practice now{, and …}; every record stays readable.) · firm: Suspend {name}: its people start no new work through its grants at the {n} practice(s) it is granted; every record stays readable. (n = 0: Suspend {name}: it holds no grant in force now; every record stays readable.) Submit: Suspend the organization |
| C7 | suspended card title and lines | Title: Suspended. Line 1: Suspended by {email} on {date} {time} UTC. (No row for this suspension: Suspended on {date} {time} UTC; who suspended it was not recorded. No date: Suspended; when and by whom were not recorded.) Line 2: Reason: {reason label}. (None: No reason was recorded.) Line 3, when the reason was changed since: Reason changed by {email} on {date} {time} UTC. |
| C8 | suspended, effect | group: New work is refused at its {n} practice(s) for everyone{, and its people start no new work through the {m} grant(s) it holds}; every record stays readable. Reinstating lifts it at once. · firm: Its people start no new work through its grants at the {n} practice(s) it is granted; the practices' own staff carry on. Reinstating lifts it at once. |
| C9 | suspended, actions | Note: {note} · "Change the reason" (C4, C5; submit: Change the reason) · Reinstate: the cause is resolved · Reinstate: suspended in error |
| C10 | history table | Caption: History. Columns: When (UTC) · Change (Suspended, Reinstated, Reason changed) · Reason · By · Note. Empty: No suspension recorded. |
| C11 | Grants card State, grantee suspended | in force; its people start no new work through it while their organization is suspended |
| C12 | Grants card State, grantee closed | in force; its people start no new work through it, since their organization is closed |
| O1 | Billing status Standing cell | Suspended by PaidWhole: {reason label} (none recorded: Suspended by PaidWhole) |
| X1 to X6 | route refusals (field: message) | reason: choose why PaidWhole suspends it · reason: choose the new reason · reason: choose why it is reinstated · confirm: tick to confirm what the suspension stops · note: at most 500 characters / one line, with no line breaks · change: the organization's status changed since this page loaded; reload the page |

The reason labels are "At the customer's request", "Security hold" and "Agreement ended". The reinstatement reasons
read "The cause is resolved" and "Suspended in error" in the history.

### 6.6 The practice's grants (Settings, Grants and agreements)

| ID | Case | State |
| --- | --- | --- |
| G1 | grant in force, grantee suspended | In force. The PaidWhole account of {grantee} is on hold, so its people start no new work here through this grant; your own staff carry on. |
| G2 | grant in force, grantee closed | In force. {Grantee} is closed, so its people start no new work here through this grant. |

---

## 7. SS-08: the dunning mail tells the truth about runs

**Where.** `apps/worker/src/billing/dunning.ts` at #42's head (a #42 file), in `sendOne` (:141-185), inside the
transaction that claims the owner's row. After `billing_dunning_notice_claim` and the invoice read, it reads the
organization and its standing:

```sql
SELECT o.kind, o.status, s.standing FROM organization o JOIN billing_standing s ON s.organization_id = o.id WHERE o.id = $1
```

`tp_billing` may read those columns (billing.sql:238) and the view (billing.sql:264); `runDunning`'s due query already
joins it as `tp_billing`. The query passes `{ kind, status, standing }` to `dunningMessage`. The words are chosen when
the message is sent, because a retry comes 1 to 60 minutes after the stage was recorded. In between, PaidWhole may
suspend or reinstate the organization, and another invoice may reach its 30 days.

**The rule.** `effect` is, first match wins:
- `none` for a `closed` group and for every firm (a firm's nonpayment refuses nothing before milestone 12);
- `held` for a group that PaidWhole has `suspended`;
- `billing_held` for an active group whose `billing_standing` is `suspended`: this invoice at its suspended stage, or
  another invoice that has reached its 30 days;
- `runs` for any other active group.

The stage machine, the audits (`billing_suspended` and `billing_reinstated`, which record billing's own hold), the
outbox and the delivery states are unchanged.

| Stage | `runs` (today's words, unchanged) | `billing_held` | `held` | `none` |
| --- | --- | --- | --- | --- |
| payment_failed | unchanged | The payment for {invoice} ({owed}) failed. · Update the payment method or pay the invoice from the billing page. · New runs are already stopped until another unpaid invoice is paid. | The payment for {invoice} ({owed}) failed. · Update the payment method or pay the invoice from the billing page. · New runs are already stopped while PaidWhole's suspension of the organization lasts. | The payment for {invoice} ({owed}) failed. · Update the payment method or pay the invoice from the billing page. |
| second_notice, third_notice | unchanged | {Invoice} ({owed}) is still unpaid. · Pay it, or update the payment method, from the billing page. · New runs are already stopped until another unpaid invoice is paid. | {Invoice} ({owed}) is still unpaid. · Pay it, or update the payment method, from the billing page. · New runs are already stopped while PaidWhole's suspension of the organization lasts. | {Invoice} ({owed}) is still unpaid. · Pay it, or update the payment method, from the billing page. |
| final_notice | unchanged | as second_notice, `billing_held` | as second_notice, `held` | as second_notice, `none` |
| suspended | unchanged | unchanged (today's words are true: new runs have stopped until it is paid) | {Invoice} ({owed}) has been unpaid for 30 days since its payment failed. · New runs stay stopped until it is paid and PaidWhole reinstates the organization. | {Invoice} ({owed}) has been unpaid for 30 days since its payment failed. · Pay it from the billing page. |
| reinstated | {Invoice} is paid. New runs have started again. | {Invoice} is paid. · Another invoice is still unpaid, so new runs stay stopped until it is paid. | {Invoice} is paid. · PaidWhole has also suspended the organization, so new runs stay stopped until PaidWhole reinstates it. The billing page says why and what to do next. | {Invoice} is paid. |

| Stage | Subject, `runs` (unchanged) | Subject, `billing_held` | Subject, `held` and `none` |
| --- | --- | --- | --- |
| payment_failed | A payment failed | A payment failed | A payment failed |
| second_notice, third_notice | An invoice is still unpaid | An invoice is still unpaid | An invoice is still unpaid |
| final_notice | Final notice before new runs stop | An invoice is still unpaid | An invoice is still unpaid |
| suspended | New runs have stopped until an invoice is paid | New runs have stopped until an invoice is paid | An invoice has been unpaid for 30 days |
| reinstated | New runs have started again | {Invoice} is paid | {Invoice} is paid |

`{Invoice}` is "Invoice SIM-0002", or "An invoice" with no number, as today. The one link is the billing page, as
today.

**Why no migration.** Under option B, a group that pays has no practice held by its firm. So "New runs have started
again" depends only on the group's own status and standing. That needs no counts function for `tp_billing`, and the
pinned list (`billing.db.test.ts:662-676`) stays as it is.

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
| PRD:223 (J18, the founder's) | "failed payments follow dunning and suspend new runs after 30 days while leaving data readable" | **Touched, and kept by design.** A stored suspension could have become a second, manual nonpayment suspension, earlier than 30 days. D9 leaves nonpayment out of the stored reasons, and C4's hint tells the administrator so. |
| ADR 0050 (deciders: the founder; 2026-10-16), Decision, "Dunning and suspension" (#42's text :67-81) | Billing's suspension is computed, not stored; it ends the moment `invoice.paid` arrives, "with nothing to reinstate by hand"; once a suspended organization's invoice is paid, the mail says new runs have started again. | **Kept.** No stored suspension is about nonpayment, so paying always ends every nonpayment hold at once. The `reinstated` stage and its audit stay. Only the mail's words change: they say runs restarted when they did, and say what still holds when PaidWhole's suspension or another unpaid invoice does (SS-08). A dated amendment. |
| ADR 0050, Consequences (:118) | "Firms are billed at milestone 12 …; a firm's own invoices and its suspension rules come then." | **Decided in part, early.** PaidWhole's own suspension or closure of a firm stops its people's new work through its grants. A firm's nonpayment rules stay at milestone 12, untouched. This is an amendment of a deferred point, not a reversal: no rule existed to reverse. ADR 0080 and the PR's description name it so the founder sees it with the domain model's approval. |
| ADR 0055 (the founder), Billing (:56-60) | "A paid invoice's stage is decided from when it was paid: on or after its suspension time means reinstated (with the notice and the audit event)". | **Kept.** The stage and the audit are unchanged; the notice's words follow section 7. |
| ADR 0055, the console (:68-69) | "The console also suspends and reinstates an organization (`console.organization_status`), through the same run refusal billing uses." | **Kept.** The same route ID and the same refusal function. It now records the reason, note and time, and checks in Postgres too. A dated amendment. |
| Q13 (the founder, 2026-10-21; HANDOFF.md:578, PR 6b plan) | "suspension waits for a delivered dunning notice or an operator-recorded contact" (for the billing pull request). | **Touched, and kept by design.** The console cannot record a nonpayment suspension, so none can skip Q13's notice or contact. Q13 itself changes `billing_standing`, which this design only reads; it is the next schema PR's (section 16). |
| PRD (the founder's): :61, :249 | The practice is the tenant; a firm does not own its workspace. "A suspended organization can read but not run". | **Kept,** and :249 now holds for firms too, through their grants. |
| The standing rule (2026-10-18) | Recommend and build only the best option. | Option B, held per permission, section 2. |

**Does lifting a suspension or paying an invoice change anything the founder ruled?** No.
- PaidWhole's lift is immediate, as ADR 0055 has it. It now requires a reason from a closed list and is audited as
  `organization_reinstated`.
- Paying an invoice lifts billing's hold at once, as ADR 0050 rules, and never lifts PaidWhole's, as before. No stored
  suspension is about nonpayment, so a payment never leaves a nonpayment hold standing. The only other change is that
  the mail stops claiming runs restarted while something else still holds them.

The PR's description names PRD:223, ADR 0050 and Q13 as touched and kept, and ADR 0050:118 as decided in part.

---

## 10. Tests

Each test is written first and fails on today's tree (the "fails first" column), then passes on the build. The IDs are
the reserved BIL-07 to BIL-10. `packages/synth` gets four no-file entries, `none(11, …)` with `assertedBy`, and their
matrix text is identical to `docs/product/test-matrix.md` (SS-10's pattern; `registry.ts:628-640`, `matrix.ts:420-431`,
both #42 files). Synthetic data only.

### BIL-07: a suspended or closed organization's people start no new work through its grants

| Part | Where | What it proves | Fails first because |
| --- | --- | --- | --- |
| Per route | `apps/web/src/lib/routes/route-tests/define.ts`, beside :146-160, for every `RUN_STARTING_ROUTES` ID. The world already has a firm with a grant in force (`route-tests/world.ts:384-432`). | The world's firm is suspended by the owner. A firm persona allowed on the route gets `{ status: 'suspended', reason: /^PaidWhole has suspended your organization, so you start no new work here through its grant/ }`, and the world's tenant rows do not change. The firm is set active again afterwards. | The route answers ok and the rows change |
| People with two paths | a new `apps/web/src/lib/routes/suspension-refusal.db.test.ts`, on the route harness (`routeWorldsForThisFile`). Four synthetic people are added as the owner: X (the group's practice administrator and F's principal); Y (F's principal and a viewer in a second, active firm whose grant gives viewers only); Z (the group's analyst and F's principal); W (the group's analyst and F's analyst). | With F suspended through the setter:<br>• X and Y are refused with R4 on every `RUN_STARTING_ROUTES` route their union of roles allows;<br>• Z is refused with R4 on the routes needing `mapping.edit`, `posting.reconcile` or `phi.export`, and is not refused (`status` is not `suspended`) on triage, the reports needing `case.work`, and uploads;<br>• W is refused nowhere.<br>`practice_run_hold` gives each the `stopped` the probe gave (section 17). | X, Y and Z are not refused (the draft's rule, and today's) |
| The database | same file | It writes each trigger table a person writes, in that person's transaction, through the house row factory and around the route gate: `source_document`, `pricing_run`, `audit_report`, `report_document`, `roi_statement`. Each insert:<br>• by F's principal, X or Y fails 55000 with R4;<br>• by Z: `source_document`, `audit_report` and `report_document` are recorded, and `pricing_run` and `roi_statement` fail 55000;<br>• by the group's administrator is recorded;<br>• in a job's scope (`withJobScope`) is recorded, `digest` and the packet export included.<br>The owner's hold refuses all of them, jobs included: R1 or R3 for the group's members, and R6 for F's principal and in a job's scope. | The firm principal's rows are recorded |
| The trigger's map | same file | For each of the seven tables, the permission `refuse_new_work_while_suspended` applies equals the permission of the route that writes it (D17). It is read through behaviour: a person whose unheld roles allow exactly that permission is not refused at the table, and one whose do not is. An insert into a table the map does not name raises (the fail-closed branch, on a scratch table in the test's own transaction). | The function has no map |
| The decision | same file | • Revoking the grant takes the practice out of the person's scope (`insufficient_privilege`).<br>• A closed grantee gives R5.<br>• `practice_run_hold` gives `(grantee, firm, suspended, security_hold, since, stopped)` to F's people.<br>• The owner's hold gives `suspended` with its reason, or `nonpayment`, to the group's members only, and `on_hold` with no reason to F's principal and in a job's scope (D6).<br>• A firm's billing-suspended standing holds nothing on its granted practice (status only, section 2).<br>• `practice_run_refusal_for` refuses a permission outside the list with 22023. | `practice_run_hold` does not exist |
| Registry | `define.ts`, in the per-route ok test, with the world's `MemoryQueue` (`lib/uploads/queue.ts:60-71`) | Any route whose ok call queues `triage`, `packet_export`, `intake`, `price`, `audit_report`, `report_document` or `roi_statement` is in `RUN_STARTING_ROUTES` or in `CONTINUES_STARTED_WORK`. In the same file, `run_starting_permissions()` equals the set of the permissions of `RUN_STARTING_ROUTES` (D16). | `CONTINUES_STARTED_WORK` and `run_starting_permissions()` do not exist |
| Packet export refused | `apps/worker/src/worker.test.ts` (#42's; the gate, mocked as today) and `apps/worker/src/packets/export-attempts.db.test.ts` | • The gate: with the owner's group suspended, a `packet_export` job is refused, records the run `refused` as today, and writes `packet_export_refused` with purpose `organization_suspended` on the payload's version, in the same job-scope transaction.<br>• The database: that event, written from a job's scope on the worker's login, is accepted, and `packet_version_export_attempt` then reads `refused` with the code, which the page words as E1.<br>• The codes test (:163-165) passes with both lists widened. | The audit insert raises 23514 and the job throws |
| Catalog | same file as "The database", or the catalog test | `practice_work_hold`, `practice_work_refusal` and `run_starting_permissions` are executable by the owner alone. The `tp_billing` and `tp_screening` definer lists are unchanged. | The functions do not exist |
| Capacity | same file as "The database" | A firm granted 2,000 practices of one group: `practice_run_refusal_for` as its principal stays under 100 ms, and returns R4. This guards against a per-row scan of grants. The probe measured 3.3 to 6.9 ms, against `open_practice_scope`'s 3.7 ms. | It returns null |

### BIL-08: PaidWhole's suspension is set only through its setter, with its reason, note and time, checked in the handler and in Postgres

| Part | Where | What it proves | Fails first because |
| --- | --- | --- | --- |
| The route | `apps/web/src/lib/routes/console-routes.db.test.ts:679-701`, rewritten | • Zod refuses a suspension without a reason, with `unpaid_invoice`, without the tick, or with a note over 500 characters or with a line break (X1 to X5).<br>• A customer administrator is refused.<br>• Suspend writes `status`, `status_reason`, `status_since`, one history row with the note, `organization_suspended` (purpose the reason) and the wrapper's `organization_status_set`.<br>• The same reason again writes no history and no reserved action.<br>• A change of reason by a second platform administrator keeps `status_since`; the page's data then names the first administrator as the one who suspended and the second as the one who changed the reason (C7).<br>• Reinstating writes `organization_reinstated`.<br>• A stale `from` gives X6.<br>• Closed, internal and missing organizations are refused as today. | The route takes `status` only and stores nothing |
| The setter | same file | The setter refuses: a job's actor; a person without `organization.manage`; closed; internal; a reason from the wrong list, `unpaid_invoice` included; a stale `from_status`. | It does not exist |
| Postgres, without the handler | same file | • As `tp_app`, a platform administrator's direct `UPDATE organization SET status = 'closed'`, its reopening, and suspending the internal organization are refused.<br>• `UPDATE … SET status_reason` is denied.<br>• The previous image's direct suspend still works and stamps `status_since` (D11); the page's data then says who suspended it was not recorded.<br>• `tp_app` cannot insert `audit_event` with action `organization_suspended`. | Today all four direct writes succeed |
| Who reads the note | same file | `organization_status_change` reads no rows for a customer administrator, a firm principal or `tp_billing`, and all rows for a platform administrator. `tp_billing` reads `status_reason` and `status_since`. | The table does not exist |

### BIL-09: every place a person reads a suspension says it is PaidWhole's, whose it is, why (to its own members), and what restarts the work

| Part | Where | What it proves | Fails first because |
| --- | --- | --- | --- |
| Words, unit | a new `apps/web/src/lib/billing/suspension-words.test.ts` | H1 to H13, J1, C6 to C12, G1, G2 and the stopped-work list, exactly, for each source, cause, reason (or none), date (or none), viewer and `stopped` | The module does not exist |
| Words, property | same file (fast-check, as the repository's property tests) | Over every combination:<br>• "PaidWhole has suspended" or "PaidWhole suspended" appears exactly when the cause is PaidWhole's suspension and the reader is a member of the held organization;<br>• "platform administrator" never appears;<br>• no reason clause, no "invoice" and no "unpaid" reaches someone outside the held organization (D6);<br>• "your organization" is never said to a non-member about an owner's hold;<br>• a grantee's notice lists exactly the stopped work, and says "through its grant";<br>• no closed case promises a restart;<br>• every non-closed case names what restarts it, or, for a non-member, that it is on hold. | The module does not exist |
| The billing page | `apps/web/src/components/billing/account-standing.test.tsx` and BIL-05's unit tests, extended | B1 to B10: the label carries the date when one is stored; the notice and next step follow the reason; a firm's PaidWhole suspension names its people's stop through its grants; a firm's nonpayment still claims no run | B1's date and B4's words are missing |
| The database's words | `apps/worker/src/billing/billing.db.test.ts:313, :340` (a job's scope: R6); `billing-routes.db.test.ts:414, 415, 430, 441, 489, 504, 550` (R1 or R3 for a member of the owning group, R6 otherwise: the builders read each test's actor); `console-routes.db.test.ts:685` (by its actor); `define.ts:146-160`, the nonpayment route test, which now picks an allowed **group** persona and asserts R3, and adds a firm persona that reads R6 | R1, R3 and R6 in place of today's | Today's words |
| The journey | `apps/web/e2e/billing.spec.ts`, new journeys beside BIL-06, on the seeded SYNTHETIC SUSPENDED FIRM, SYNTHETIC FIRM CLIENT PRACTICE and SYNTHETIC CONSOLE SUSPENSION FIRM | (a) The suspended firm's principal opens the client practice: the home shows H5 and H8 or H9; Uploads shows "Uploads are paused: PaidWhole has suspended your organization…"; asking for a pricing run shows "Not started: …".<br>(b) The client group's administrator at the same practice sees no notice, Uploads is open, and Settings' grants read G1.<br>(c) The platform administrator suspends the console firm with a reason, a note and the tick; the card shows C7 and the history; then "Reinstate: the cause is resolved".<br>Each page passes axe. | (a) shows no notice and an open Uploads |

### BIL-10: the dunning mail never claims runs started or stopped when they did not

| Part | Where | What it proves | Fails first because |
| --- | --- | --- | --- |
| Words, unit | a new `apps/worker/src/billing/dunning-words.test.ts` (dunningMessage is pure; `billing.db.test.ts`, #42's, is today its only test) | `dunningMessage` for each stage and each `effect` (`runs`, `billing_held`, `held`, `none`): section 7's lines and subjects, exactly. "started again" appears only for `runs`. | Today's single wording |
| The send | `apps/worker/src/billing/billing.db.test.ts` (#42's) | • A group suspended by PaidWhole pays an invoice held 31 days: the stage is `reinstated`, the audit is `billing_reinstated`, and the message the local outbox holds reads "… is paid." with the PaidWhole sentence, never "New runs have started again".<br>• Reinstated by PaidWhole between the stage and the send, the message reads "New runs have started again".<br>• Invoice A is paid after 31 days and its stage is recorded `reinstated`; before the send, invoice B's first failure reaches 30 days. The message reads "Another invoice is still unpaid, so new runs stay stopped until it is paid."<br>• A firm's notices never contain "runs". | The message reads "New runs have started again" |

### Tests updated, not added

`apps/worker/src/worker.test.ts:325` (#42's): the mocked reason's text only; the worker still asks
`practice_run_refusal`. `apps/web/src/components/billing/account-standing.test.tsx` for the firm cases, which now assert
a run sentence for PaidWhole's suspension. `e2e/billing.spec.ts:90-107` (BIL-06): the seed adds a reason, so the label
carries a date. The `domain-model` tests and the function files' check pass on the regenerated output. The catalog test
and the cross-tenant test pass unchanged: the new table has no `practice_id` and forces RLS. The cross-tenant generator
has no tenant table to add.

---

## 11. The domain model and the function files

**Regenerate in this PR, on the tree with #42 merged:** run `pnpm db:domain-model --out` from a database migrated from
empty.

**What changes in `docs/product/domain-model.md`:**
- the `organization` table: two columns, three constraints, the trigger;
- the new `organization_status_change` table (Tenancy area);
- the `audit_event_record` policy text;
- the functions' rows: `practice_run_refusal`, `refuse_new_work_while_suspended` and `packet_export_refusal_codes`
  changed, `organization_run_refusal` gone, and the new functions added;
- the seven trigger lines that name `refuse_new_work_while_suspended`;
- `practice_grants`'s return type.

**What changes in `packages/db/functions`:**
- added: `run_starting_permissions.sql`, `practice_work_hold.sql`, `practice_work_refusal.sql`,
  `practice_run_refusal_for.sql`, `practice_run_hold.sql`, `console_set_organization_status.sql`,
  `organization_status_rules.sql`;
- changed: `practice_run_refusal.sql`, `refuse_new_work_while_suspended.sql`, `practice_grants.sql`,
  `packet_export_refusal_codes.sql`;
- removed: `organization_run_refusal.sql`.

**Inputs the generator needs:**
- `packages/db/domain-model/areas.json` (#42's) places `organization_status_change` in `tenancy` and widens the area's
  "about" (section 4.3);
- `docs/product/data-dictionary.md` stays verbatim (it is the planning document's import; #42's tables are not in it
  either). The generator reports the new table and columns as informational, and `divergence-explanations.json` needs
  no entry unless `--strict` asks for one; the builders add the entry it names, if any;
- one sentence in Appendix C's introduction pointing to the function files, if #42 has not already added it (#111's
  hand-over).

**Gates:**
- `pnpm db:domain-model --check --require-approval` passes only with the founder's line.
- The PR is opened with `pnpm db:domain-model --summary-since origin/claude/build-platform --function-diffs list`.
- The regenerated function files are committed **before** the founder signs, since a commit after their approval
  dismisses it.
- The approval line goes up as one suggested-change comment on that line (CLAUDE.md "Schema gate";
  `.claude/skills/new-migration`), never written by a session, never as a review.

---

## 12. What the founder must approve or rule

1. **Approve `docs/product/domain-model.md`** by its SHA-256, on the PR's latest commit (CO-02; ADR 0063). This is the
   only founder decision this PR needs.

Nothing else goes to the founder:
- **No freeze exception.** The design touches no pricing, ledger or engine code, and no `content/releases`.
- **No legal text.**
- **No founder ruling reversed** (section 9).

The points the founder should see while approving, named in ADR 0080 and in the PR's description:
- **ADR 0050:118, decided in part, early.** PaidWhole's own suspension of a firm now stops that firm's people's new
  work through its grants. A firm's nonpayment stays deferred to milestone 12. It decides a deferred point; it
  reverses nothing.
- **PRD:223, ADR 0050's computed nonpayment hold, and Q13, touched and kept.** PaidWhole's stored suspension takes no
  nonpayment reason, so the console can neither suspend for nonpayment before 30 days or without Q13's notice, nor
  hold a paid organization. Should the founder ever want a manual nonpayment suspension, that would change those
  rulings, and it belongs to the mail-and-Q13 PR with Q13's precondition checked in its setter and an automatic lift on
  payment. This design does not recommend it.

---

## 13. Files

#42's files are marked **(#42)**. This PR follows #42, so it edits #42's final text and re-reads each one at #42's
merged head before writing.

**Database and generated:**
- `packages/db/migrations/20261108090000_suspension_refusal.sql` (new)
- `packages/db/src/schema/tenancy.ts` **(#42)**: columns, table, reason lists
- `packages/db/src/runtime.ts` / `index.ts`: export the reason lists
- `packages/db/domain-model/areas.json` **(#42)**
- `docs/product/domain-model.md` **(#42)**, regenerated
- `packages/db/functions/*.sql` **(#42's set)**, regenerated (section 11)

**Web:**
- `apps/web/src/lib/routes/console.ts` **(#42)**: the route (5.1) and the page's data (5.2)
- `apps/web/src/app/console/organizations/[organizationId]/page.tsx` and `apps/web/src/app/console/actions.ts`: the
  card, forms and history
- `apps/web/src/app/console/billing/page.tsx`: O1
- `apps/web/src/lib/http/invoke.ts`: the wrapper asks with the route's permission (one line)
- `apps/web/src/lib/billing/runs.ts`: the comment and `CONTINUES_STARTED_WORK`
- `apps/web/src/lib/routes/uploads.ts`: the gate asks for `file.upload`
- `apps/web/src/lib/billing/hold.ts` and `apps/web/src/lib/billing/suspension-words.ts` (new, with tests)
- `apps/web/src/lib/routes/practice.ts` **(#42)** and `apps/web/src/app/p/[practiceId]/page.tsx`: the home
- `apps/web/src/lib/routes/billing.ts` and `apps/worker/src/billing/account.ts`: the billing page and the console's
  billing status (5.5)
- `apps/web/src/lib/routes/settings.ts` **(#42)** and `apps/web/src/app/p/[practiceId]/settings/agreements/page.tsx`:
  G1 and G2
- `apps/web/src/lib/packets/export-attempts.ts`: E1

**Worker:**
- `apps/worker/src/billing/refusal.ts` and `apps/worker/src/billing/public.ts`: `practiceRunRefusalFor`
- `apps/worker/src/worker.ts`: the export's refused audit
- `apps/worker/src/packets/readiness.ts`: `organization_suspended` and `ExportReadinessReason`
- `apps/worker/src/billing/dunning.ts` **(#42)**: SS-08

**Seeds:**
- `apps/web/scripts/seed.ts` and `apps/web/scripts/synthetic-personas.ts`

**Tests:**
- `apps/web/src/lib/routes/route-tests/define.ts`
- `apps/web/src/lib/routes/console-routes.db.test.ts`
- `apps/web/src/lib/routes/billing-routes.db.test.ts`
- `apps/web/src/lib/routes/suspension-refusal.db.test.ts` (new)
- `apps/web/src/components/billing/account-standing.test.tsx`
- `apps/web/e2e/billing.spec.ts`
- `apps/worker/src/billing/billing.db.test.ts` **(#42)**
- `apps/worker/src/billing/dunning-words.test.ts` (new)
- `apps/worker/src/packets/export-attempts.db.test.ts`
- `apps/worker/src/worker.test.ts` **(#42)**

**Documents and registries:**
- `docs/product/test-matrix.md` **(#42)**: BIL-07 to BIL-10, and BIL-05's one phrase (section 6)
- `packages/synth/src/cases/matrix.ts` and `registry.ts` **(#42)**
- `docs/adr/0080-…md` (new), and dated amendments to `docs/adr/0050-…md` **(#42)** and `docs/adr/0055-…md` **(#42)**
- `docs/runbooks/billing.md`: under "A suspension is computed, not stored" (:67-70), a paragraph that PaidWhole's
  suspension is stored, set only in the console with a reason, never for nonpayment, and never lifted by a payment

Not touched:
- `apps/web/src/lib/http/next.ts` and `handler.ts`
- `apps/worker/src/packets/services.ts` (its `Record` narrows with `ExportReadinessReason`)
- `packages/billing/src/standing.ts`
- `docs/product/data-dictionary.md`
- the pricing, ledger and rules packages

---

## 14. Risks

| Risk | Mitigation |
| --- | --- |
| A person reaches the practice through a path B does not see (a new access branch later) | The paths and roles come from `effective_practice_access()` itself. A new branch is seen at once, and is held only if it is a grant of a held organization. BIL-07 covers ownership, grant and support, and mixed paths. |
| A person with a second path keeps the held grant's roles | The hold is per permission over the unheld roles (D1), in the wrapper and in the trigger. BIL-07's X, Y, Z and W. |
| A future route queues person-started work without the wrapper's gate | The registry test (BIL-07) fails until it is in `RUN_STARTING_ROUTES` or, with a reason, in `CONTINUES_STARTED_WORK`. For triage, a packet export and an upload's retry, the wrapper is the only refusal for a grantee's hold (D18). |
| A new trigger table without a permission | The trigger's map raises on any table it does not name (D17). |
| The trigger's cost on hot inserts | Only top-level documents, runs, reports, statements, digests and the first export fire it, as today. The extra work is the person's own paths and ten `roles_permit` calls: 3.3 to 6.9 ms at 2,001 grants. The job path does none. BIL-07's capacity guard. |
| A free-text note collects PHI | One line, 500 characters, the form's hint, platform-only reads, never logged, mailed or exported. Ticket-style screens and opaque IDs only, as the support form. |
| An administrator takes "security hold" for containment | C4's hint: it stops new work only; to stop access, end the memberships. ADR 0080 says so too. |
| PaidWhole's suspension used for nonpayment under another reason | The reasons exclude it and C4's hint says why; ADR 0080 and the billing runbook state that nonpayment is billing's hold alone. |
| The previous image during a deploy or a rollback | Section 4.7, stated as it is. It fails closed for mixed-path people, and its home's suffix is wrong in one clause for a grantee's hold. Accepted in ADR 0080. Its suspend writes no reason, which the page reads as "no reason was recorded". |
| `from_status` refusals annoy an administrator | Only when another administrator changed the status since the page loaded. The message says to reload. |
| A grantee's person keeps a packet export asked for before the suspension | Section 2: deliberate, documented in ADR 0080, and no different from "work already started finishes" (ADR 0050). |
| #42's fix round changes `console.ts`, `dunning.ts`, `practice.ts`, `settings.ts`, `tenancy.ts`, `areas.json`, the matrix, the registry, the ADRs or the `audit_event_record` policy again | The builders start from #42's merged head and re-read each before editing. The migration recreates the policy from #42's final text, not from this document's quote. #42 moved from 098636e3 to 15189a50 during this design's review without touching any object it recreates. |
| UX PR 78 and 79 change the same card | Section 16: this PR takes the suspend tick; UX PR 78 drops its suspend part; UX PR 79 reorders after this merges. |
| Q13 lands later and changes `billing_standing` | `practice_work_hold` reads `billing_standing` by name, so Q13's change flows through. Its PR adds its own tests on the holds. |

---

## 15. The builders' slices, in order

Each slice is one commit or more on `co-001/ss-01-suspension-refusal`, cut from `claude/build-platform` after #42
merges.

1. **Tests first.**
   - BIL-07's database, mixed-path, registry and per-route tests, BIL-08's route, setter and Postgres tests, and
     BIL-10's word tests, all failing on the base.
   - The test-matrix rows and the synth registry and matrix entries for BIL-07 to BIL-10.
2. **The migration** (section 4), with:
   - the Drizzle mirror and the reason lists;
   - `areas.json`;
   - the regenerated domain model and function files.

   BIL-07's and BIL-08's database parts pass. The catalog, cross-tenant, domain-model and function-file tests pass.
3. **The wrapper and the worker** (5.3's first four items, 5.4): `practiceRunRefusalFor`, the wrapper's one line, the
   uploads gate, `CONTINUES_STARTED_WORK`, the export's refused audit and the widened codes. BIL-07's per-route,
   mixed-path, registry and export parts pass.
4. **The console** (5.1, 5.2, O1): the route, the page, the forms, the tick, the history and the Grants state. BIL-08's
   route parts pass.
5. **The customer surfaces** (5.3's rest, 5.5, 5.6):
   - the words module and the hold read;
   - the home, the job label and the export refusal;
   - the billing page and the practice's grants.

   BIL-09's unit, property and component tests pass, and the updated word assertions pass.
6. **SS-08** (section 7). BIL-10 passes.
7. **Seed and journeys:** the seeded firm, client group, practice and console firm; BIL-09's e2e journeys; BIL-06 kept
   green.
8. **Documents:**
   - ADR 0080: the rule (option B, per permission, and why), D6's disclosure rule, the stored reason and history and
     why nonpayment is not one, the setter, the words' rules, the one-release grant and its revoke, no reopen, the
     known limits (D18; the previous image's suffix; a security hold does not contain reads), and the open points for
     milestone 12;
   - the dated amendments to ADRs 0050 and 0055 on #42's text;
   - the runbook paragraph;
   - LANES.md's hand-overs (section 16), through the orchestrator.
9. **The full local suite:** unit and property, db, golden, e2e, lint, `lint:copy`, `lint:logs`, typecheck,
   `verify-content`, synth, `db:domain-model --check`. Then the screenshots for the UX review: the console organization
   page (active group, active firm, suspended with reason, history, a reason changed by a second administrator), the
   practice home (owner-held for a member and for a firm's person, grantee-held), Uploads (grantee-held), the billing
   page (group and firm, suspended with reason and date) and Settings' grants, at 1280 and 390 px, light and dark
   (LANES.md rule 1).

**The reviews.** Two adversarial reviews, as the pipeline runs them:
- **tenancy and security:** the per-permission decision against every access path and every mix of roles, the definer
  functions, the grants, the reserved actions, the note's privacy, D6's disclosure rule, and the previous image during
  a deploy;
- **UX and brand:** `.claude/agents/ux-brand-reviewer.md`, over section 6's words and the shots.

The fix round runs the full suite, and the fresh-clone verification reads CI. The founder's approval line comes last,
on the final commit.

---

## 16. Handed on, and kept out (each with why)

| Item | Where it goes | Why not here |
| --- | --- | --- |
| Mail to the organization's administrators when PaidWhole suspends or reinstates it, and **Q13** (suspension waits for a delivered dunning notice or a recorded contact) | One schema PR, next in Lane A's chain after this one. Claim it now. | Both extend #42's outbox (a new kind in `mail_send_kind` and `mail_send_stream_kind`, an outbox table, `operator_record_mail_event` recreated) and read its delivery states. A recorded contact is also what Q13 counts. Its review lens is deliverability; this PR's is tenancy and security. |
| `REVOKE UPDATE (status), INSERT (status) ON organization FROM tp_app` | The first schema PR after this one is deployed (the mail PR, if this one is live by then). Recorded in ADR 0080 and under LANES.md "Handed to Lane A". | The previous image must keep working for one release (D11). |
| A manual nonpayment suspension | Not recommended (D9). If the founder ever rules for one, it belongs to the mail-and-Q13 PR, with Q13's precondition checked in the setter and an automatic lift when billing's standing returns to good. | It would change PRD:223, ADR 0050 and Q13. |
| A Postgres stop for triage, a packet export and an upload's retry | Not built (D18); recorded in ADR 0080 as a known limit. A later decision if wanted: a requester check inside the job built on a user-parameterised `effective_practice_access`, or each enqueue after the commit with a way to recover a lost request. | Either option changes the heart of the scope or loses requests on a queue failure; the wrapper asks Postgres before anything is queued, and the registry test pins the list. |
| The closure lifecycle: closure ends grants, memberships and sessions; the Stripe subscription; export and deletion; reopening | Milestone 12's offboarding PR | Section 8 |
| A group grantee's nonpayment at the practices it is granted, and a firm's own invoices and suspension rules | Milestone 12's firm billing (ADR 0050:118) | Status only (section 2) |
| UX PR 78 (`co-001/ux-console-confirm`, UX-046) | It drops its "Suspend …" tick, which this PR builds in B's words (C6). The rest of UX-046 stands. Record in LANES.md. | Same card, same route |
| UX PR 79 (`co-001/ux-console-org-page`, UX-203) | It lands after this PR and keeps the Suspension card's content, moving it to the foot. The Grants state (C11, C12) is built here. | Same page |
| UX PR 57 (`co-001/ux-console-records`, UX-204) | It may link "Suspended by PaidWhole: {reason}" (O1) to the organization's card | Same table, no conflict |
| Model calls under a suspension (`model_proposal`, `model_budget_hold`) | Recorded in ADR 0080 as not refused, with the reason (section 1.3). A later product decision if wanted. | Not run-starting work under ADR 0050 |

---

## 17. Probes run for this design

**The first draft's probes.**
- **The database.** `tp_design_ss01_10`, created empty and migrated through #42's 45 migrations (head 098636e3) with
  `probes/migrate42.mts`. It was dropped when done.
- **The world.** `probes/ss01-world.sql`: group G, practice P with its BAA and location, firm F and a second firm F2,
  engagement letters, F's grant in force. It is synthetic.
- **`probes/ss01-author-proto.sql`**, run in one transaction and rolled back. It builds the first draft's section 4
  (with an earlier wording of R1 to R5). Results:

  | # | State | Result |
  | --- | --- | --- |
  | P1, P2 | today | A suspended firm's principal is not refused, and their upload row is recorded |
  | A1 to A5 | the setter | It suspends with a reason and a note (true); the same reason again changes nothing (false); the history row holds the note; `status_reason` and `status_since` are set |
  | B1 to B3 | the firm principal | Refused with the grantee sentence. The hold reads `(grantee, firm, suspended, security_hold, since)`. They read no history. Their upload fails 55000 from the trigger. |
  | C1, C2 | the group's administrator | Not refused; the upload is recorded |
  | E1 to E4 | jobs and the owner | A job is not refused by the firm's hold. The group's own suspension refuses the job. The owner's hold wins over the firm's. Reinstating clears the reason. |
  | F1 to F3 | the previous image | Its direct suspend works and stamps the time. `closed` (organization_closed_by_closure_only), the internal organization (organization_internal_active) and writing `status_reason` are refused. |
  | setter refusals | | Refused with no reason, and for a firm principal |

  The draft's D1 and D2 (a person in F and F2 with the same roles) stand, but they could not show the union of roles.
  The review's probe did (`probes/ss01-review-proto.sql` on `tp_design_ss01_20`; section 18, F1).

**The revision's probes** (this document's section 4 as written).
- **The database.** `tp_design_ss01_30`, created empty and migrated through #42's 45 migrations at 15189a50, with the
  same world. Dropped when done.
- **`probes/ss01-revise-proto.sql`** with `probes/ss01-revise-probes.sql`, in one transaction, rolled back. F was
  suspended through the setter for `security_hold` (S1). Results:

  | # | Person or state | `stopped` | Refused for | Trigger |
  | --- | --- | --- | --- | --- |
  | S0 | the setter with `unpaid_invoice` | | 23514, `organization_status_change_reason` | |
  | Q1 | F's principal alone | all five | all five; the previous image's `practice_run_refusal`: R4 | upload and pricing run: 55000 |
  | Q2 | X: G's practice administrator and F's principal | all five | all five; previous image: R4 | upload and pricing run: 55000 |
  | Q3 | Y: F's principal and a viewer in F2 (viewers-only grant) | mapping.edit, case.work, posting.reconcile, file.upload | those four; `phi.export` was already denied by the viewer role (`app_actor_permitted` false) | upload and pricing run: 55000 |
  | Q4 | Z: G's analyst and F's principal | mapping.edit, posting.reconcile, phi.export | those three; not case.work or file.upload; previous image: R4 (fails closed) | upload recorded; pricing run 55000 |
  | Q5 | W: G's analyst and F's analyst | none | nothing; no hold row | upload recorded |
  | Q6 | G's administrator | none | nothing | upload recorded |
  | V1 | `practice_run_refusal_for(P, 'grant.approve')` | | 22023 | |
  | J1 | a job's scope, F suspended | | null | |
  | O2 | G suspended by PaidWhole (`customer_request`) | | F's principal: `(owner, on_hold, no reason)`, R6. Z and G's administrator (members): `(owner, suspended, customer_request)`, R1 | |
  | O4 | G held for nonpayment (an invoice 31 days past its first failure) | | F's principal: `on_hold`, R6. G's administrator: `nonpayment`, R3 | |
  | O5 | a job's scope, G held for nonpayment | | R6 | |
  | C3 | administrator A suspends F2, administrator B changes the reason | | The suspension's own row (`from_status` active, `at` = `status_since`) names A; the latest suspended-to-suspended row names B | |
  | K1 | `packet_export_refusal_codes()` | | 13 codes, `organization_suspended` last | |
- **Capacity.** `probes/ss01-revise-capacity.sql`, inside the same transaction: F granted 2,001 practices of G and
  suspended. As F's principal, `practice_run_refusal_for` took 6.9, 3.5 and 3.3 ms. `practice_run_refusal` took 3.4
  ms, `practice_run_hold` 3.5 ms, and `open_practice_scope` 3.7 ms. (The first draft's rule measured 2.7 to 5.4 ms.)
- **Static checks:**
  - #42's file list at 15189a50 (212 files; `progress/ss01-revise-42files.txt`): none of the four recreated functions'
    files is in it;
  - #42's migration, for the `audit_event_record` policy (:863-870) and the console pause and resume pattern
    (:1216-1256);
  - every writer of the seven trigger tables, and each one's route permission (D17);
  - every route that queues a job (section 1.3, row 11; `CONTINUES_STARTED_WORK`);
  - every test that pins today's words, and its actor (section 10).

---

## 18. After the design review

The adversarial review (`progress/design-ss01-review.md`) returned **build with changes**: 2 blocking, 3 should fix and
4 nits. Each claim was verified against the code at #42's head 15189a50, and the database claims were probed again
(section 17, the revision's probes). All nine were taken.

| ID | Severity | Finding | Verified | Disposition |
| --- | --- | --- | --- | --- |
| F1 | blocking | **Role union bypass.** A person's roles are the union of every path's, in the handler and in Postgres. The draft held a person only when every path was held, so someone with any second path, even a viewer's or a practice administrator's, kept the held firm's roles for new work. | Yes: `scope.ts:141-160`, `app_actor_permitted.sql`; the review's probe and this revision's Q2 to Q4. | **Taken.** The hold is per permission over the unheld roles (D1; section 2, "A person with two paths"). `practice_work_hold` returns `stopped`. The wrapper asks `practice_run_refusal_for` with `spec.permission`, and the trigger maps its table to its writer's permission (D16, D17; section 4.4). The words say "through its grant" and list the stopped work (C3, C6, C8, B4, B9, G1, G2, H5 to H7, R4, R5); C2 and C6 tell a group that its people stop through the grants it holds. BIL-07 adds X, Y, Z (the control whose own role allows uploads and triage) and W. |
| F2 | blocking | **`unpaid_invoice` against the founder's rulings.** A stored nonpayment reason let the console suspend before PRD:223's 30 days and without Q13's notice or contact, and kept the hold after payment, against ADR 0050. B5 told the customer that paying does not reinstate it. Section 9 called Q13 untouched. | Yes: PRD:223, ADR 0050 (#42's text :64-72), HANDOFF.md:578. The reason list was UX-004's proposal, not a ruling. | **Taken, the best of the review's two options:** `unpaid_invoice` is dropped from the CHECKs, `SUSPENSION_REASONS`, C4, the reason clauses, B7 and B10, and B5 is retired (D9). C4's hint says nonpayment is billing's hold. Sections 9 and 12 and the PR's description name PRD:223, ADR 0050 and Q13 as touched and kept. A manual nonpayment suspension is listed in section 16 as not recommended, with where it would go if ruled. |
| F3 | should fix | **The export refusal code needs the migration.** `audit_event_packet_export_attempt` refuses any `packet_export_refused` purpose outside `packet_export_refusal_codes()`; the gate's audit insert would raise 23514, and the job would throw and retry. A wider `PACKET_EXPORT_REFUSALS` also broke the `Record` over `ExportReadinessReason` and the codes test. | Yes: deadline_verification….sql:1506-1541; readiness.ts:43-63; services.ts:472; export-attempts.db.test.ts:163-165. | **Taken.** The migration recreates `packet_export_refusal_codes()` with `organization_suspended` appended last, after `verifier_failed` ("then the worker gate's"). The review proposed placing it before `verifier_failed`; last keeps every existing position and reads in the order the codes arise. `ExportReadinessReason` and the test's filter exclude it. Listed in sections 4.4, 11 and 13. BIL-07 adds the refused export row. |
| F4 | should fix | **Handler-only paths for a grantee.** Triage, a packet export and an upload's retry only queue the practice's job, so Postgres refuses none of them for a grantee's people. The draft said the database refuses "the same work". | Yes: triage.ts:448, queries.ts:547, uploads.ts:364; pg-boss on its own connection (queue.ts:26-40). | **Taken.** Sections 0, 1.3 (new row 11), 2 and ADR 0080 say it precisely (D18). A registry test holds every route that queues person-started work to `RUN_STARTING_ROUTES` or to a named `CONTINUES_STARTED_WORK` (the upload's completion). A Postgres stop for the three is not built, for the reasons in D18, and is recorded in section 16 as a later decision. |
| F5 | should fix | **D6 against R3 and H4.** The draft hid the owner's stored reason from a firm's people but told them, in R3 and H4, that the group had an invoice unpaid for 30 days. | Yes: the draft's §6.1 R3, §6.2 H4/H10, and the property test that checked only reason clauses. | **Taken, the review's preferred rule, decided in Postgres.** A non-member of the owning organization receives the cause `on_hold` for PaidWhole's suspension and nonpayment alike, with no reason (D6; section 4.4). They read R6 and H13. Members keep R1 and R3. `closed` is told to everyone, because whether work can restart is theirs to know. G1 uses the same neutral words for a grantee. BIL-09's property test covers the cause words ("invoice", "unpaid", "PaidWhole has suspended") as well as the reason clauses. Probes O2, O4 and O5. |
| F6 | nit | **C7 misattribution.** After a second administrator changed the reason, "Suspended by {email}" could name them. | Yes: the draft named no source row. | **Taken.** C7's actor and time come from the suspension's own history row (`from_status` active, `at` = `status_since`), and a third line names who changed the reason (sections 4.3, 5.2, 6.5). BIL-08 tests it with a second administrator. Probe C3. |
| F7 | nit | **"Security hold" implies containment.** The firm's people still read and download PHI at every granted practice. | Yes: reads are never refused under B. | **Taken.** C4's hint says a security hold stops new work only and that ending memberships stops access. ADR 0080 records it, and section 14 lists it. |
| F8 | nit | **SS-08's send-time words ignored billing's standing.** A retry after another invoice reached 30 days could say "New runs have started again". | Yes: `sendOne` reads only the invoice; the downgrade happens only when the stage is recorded (dunning.ts:234-237). | **Taken, and widened to every stage.** `sendOne` reads `billing_standing` (D13). A fourth effect, `billing_held`, gives the reinstated stage "Another invoice is still unpaid, so new runs stay stopped until it is paid.", and gives the earlier stages "New runs are already stopped until another unpaid invoice is paid." (section 7). BIL-10 adds the case. |
| F9 | nit | **The previous image's home words.** During a deploy or a rollback, its fixed suffix follows R4 and claims monitoring restarts. Section 4.7 said "for minutes" and "nothing is wrong". | Yes: page.tsx:164-171 at #42's head. | **Taken.** Section 4.7 now says a rollback lasts as long as it lasts, that the suffix is wrong in one clause for a grantee's hold, and that no wording of R4 or R5 can make it true. It is accepted and recorded in ADR 0080. The section also says the previous image fails closed for people with mixed paths. |

**What the review checked and found sound** is unchanged by this revision, and the revision re-probed what it changed:
- option B over A and C;
- the definers' search paths and grants;
- `organization_status_rules` and the owner test;
- the setter's checks and its race refusal;
- the reserved actions on #42's policy body;
- the global table's catalog fit;
- the note's CHECK against Zod's;
- the person-scoped writers of the trigger tables;
- every place the database's sentence reaches a person;
- SS-08's reads as `tp_billing`;
- the no-reopen recommendation;
- the capacity.
