# 0080. Stop a held organization's people through its grants, per permission; store PaidWhole's suspension with its reason and history; and keep nonpayment billing's computed hold

- **Status:** accepted (`co-001/ss-01-suspension-refusal`, SS-01, handed to Lane A by #56 on 2026-10-26; one migration,
  `20261108090000_suspension_refusal.sql`, so the founder's approval of the regenerated domain model, CO-02); amends
  [0050](0050-bill-organizations-through-stripe-as-a-role-that-reads-no-phi-suspend-new-runs-thirty-days-after-a-failed-payment-and-simulate-test-mode-locally.md)
  (the refusal paths and the dunning mail's words) and
  [0055](0055-keep-model-calls-off-the-requests-connection-give-billing-and-e-signature-their-own-logins-bound-bodies-open-tickets-from-mail-and-keep-cognito.md)
  (the console's suspend), each by a dated amendment of 2026-10-27 below its text
- **Date:** 2026-10-27
- **Deciders:** the build (Lane A), under the founder's standing rule of 2026-10-18 (recommend and build only the best
  option); the design's adversarial review, whose nine findings (F1 to F9) were all taken; the founder approves the
  schema by the domain model's SHA-256 (CO-02; ADR 0063). No founder ruling is reversed: PRD:223, ADR 0050's computed
  nonpayment hold and Q13 are touched and kept, and ADR 0050:118 is decided in part, early (below)
- **PRD sections:** 3 (users, roles and tenancy: PRD:61, "a firm that pays … still does not own the practice's
  workspace"), 5 (J18: dunning, suspension after 30 days with data readable, PRD:223), 6 (the Billing row's acceptance,
  "a suspended organization can read but not run", PRD:249), 7 (the internal console); test matrix BIL-05 and BIL-07 to
  BIL-10; ADRs 0009, 0050, 0055 and 0065

## Context

#56 (the UX baseline review's UX-004) made a suspended organization's billing page say "Suspended by PaidWhole", and
handed two defects to Lane A, since both need a migration:

- **SS-01: a suspended firm's granted practices still run.** `practice_run_refusal` read only the practice's owning
  group (`organization_run_refusal(p.organization_id)`), and the trigger `refuse_new_work_while_suspended` repeated the
  same lookup. A firm owns no practice and reaches each one through a grant, so a firm suspended or closed by PaidWhole
  was refused nothing: probed on a database migrated from empty through #42, its principal's
  `practice_run_refusal` was null and its upload row was recorded. The console's card said the opposite ("Suspending
  refuses new runs for every practice of the organization").
- **The suspension kept no reason.** `organization` held `status` only; the console's route wrote it as `tp_app` with a
  direct `UPDATE`, refused `closed` and the internal organization in the handler alone, and audited
  `organization_status_set` with no status and no reason. Postgres let a platform administrator close any organization,
  reopen a closed one or suspend the internal one, and the customer's page could not say why or since when.

Two facts shape the fix. A firm is not the tenant: the practice is (PRD:61), so another tenant's status must not stop a
covered entity's own work. And a person's roles at a practice are the **union** of every path's (ownership, each grant,
a support grant), in the handler (`packages/db/src/authz/scope.ts`, `accessByPractice`) and in Postgres
(`app_actor_permitted`) alike, so a hold that applies only when every path is held lets a person with any second path,
even a viewer's, keep the held grant's roles for new work (the review's F1, probed).

The dunning mail had a defect of its own (SS-08): it chose "New runs have started again" when the stage was recorded,
from billing's standing alone, so a send or a retry 1 to 60 minutes later could say so while PaidWhole's suspension, a
closure or another invoice that reached its 30 days held runs, and a firm's owners read "New runs stop on …" though a
firm's nonpayment refuses nothing before milestone 12.

## Decision

### 1. Whose hold stops which work: option B, held per permission

**The rule.** An organization's hold stops its people's work through its grants, wherever they reach:

- **The owner's hold** (the practice's owning organization suspended by PaidWhole, closed, or held by billing for an
  invoice unpaid 30 days since its payment failed) stops the practice for everyone, jobs included, as before.
- **A grantee's hold** (any organization holding a grant in force, a firm or a group, suspended or closed) stops only
  that organization's people, and only the run-starting work that their **unheld roles** do not permit. A person's
  unheld roles are those from paths that are not held: ownership, a support grant, a grant of an active grantee. The
  work's permission is the route's (`spec.permission`) at the wrapper and the guarded table's in Postgres.
- **On the grantee's status alone**, never its billing standing: a firm's nonpayment rules are milestone 12's (ADR
  0050:118), and a group grantee's nonpayment already stops its own practices.
- **Jobs.** A job's actor is never a person, so only the owner's hold applies in a job's scope: a job is the
  practice's work, not the grantee's. A packet export a grantee's person asked for before the suspension finishes,
  as ADR 0050's "work already started finishes" has it.
- **PaidWhole's own people.** A support grant is never held by a grantee's status, only by the owner's.

So, with a firm F suspended: F's principal alone, or one who is also the group's practice administrator, is refused all
five run-starting permissions; one who is also the group's analyst is refused pricing runs, ROI statements and packet
exports, and keeps the uploads and triage the analyst role allows; the group's analyst who is also F's analyst is
refused nothing, since F's grant gives them nothing more. The practice's own staff, its other grantees and its jobs
carry on.

**Why B.** It is the only option that refuses the held organization's work without stopping a tenant that did nothing:

| | A. Practice-wide | B. The grantee's people, through its grants (taken) | C. The grantee loses access |
| --- | --- | --- | --- |
| Tenancy (PRD:61) | Breaks it: another tenant's status stops the covered entity's own work | Keeps it | Keeps it |
| PRD:249, "can read but not run" | Also stops a group that is neither suspended nor in arrears | Holds exactly: the firm reads and does not run through its grants | Breaks it: the firm cannot read |
| The practice's way out | None in the product: ending a grant is milestone 12's, so a support ticket | Nothing to get out of | Same as B |
| Monitoring, reconciliation, digests, recovery proof | Stop; filing windows run on from remittance dates, so disputes can be lost | Continue | Continue |
| Leverage between tenants | A firm that asks to be suspended stops a client it is leaving | None | None |
| Dunning truth | A group that pays still has a practice held by its firm | Unaffected | Unaffected |

A is simpler but worse on tenant isolation, continuity, dispute deadlines, dunning truth and leverage. C breaks "can
read", and the console already ends a membership and its sessions, which is the tool for an access threat.

**One decision, three callers.** The migration replaces the owner-only lookup that was written twice
(`organization_run_refusal`, dropped) with one internal decision, `practice_work_hold(practice)`, whose paths and roles
come from `effective_practice_access()` and whose test is `roles_permit`, the definitions the scope and
`app_actor_permitted` already use, so neither can drift. It returns the owner's hold, or the grantee's hold with the
run-starting permissions it stops for this person (`stopped`), never an organization name. `practice_work_refusal`
turns it into one sentence for one piece of work. Neither is executable by an application role. Around them:

- `run_starting_permissions()`: the closed list `mapping.edit`, `case.work`, `posting.reconcile`, `phi.export`,
  `file.upload`, the permissions of the nine `RUN_STARTING_ROUTES` (a test holds the two equal);
- `practice_run_refusal_for(practice, permission)` (`tp_app`): the route wrapper's question, asked with the route's
  permission after `requirePracticePermission`, and the uploads gate's with `file.upload`; a permission outside the list
  is a parameter error (22023), so a route added with a new permission fails its test at once;
- `practice_run_refusal(practice)`: signature and grant unchanged; it answers for any run-starting work, for the worker's
  gate and the previous image;
- `practice_run_hold(practice)` (`tp_app`): the structured read the practice home composes its notice from;
- `refuse_new_work_while_suspended()`: the seven triggers are unchanged; the function takes the permission from the
  table it guards (`pricing_run` mapping.edit; `audit_report` and `report_document` case.work; `roi_statement`
  posting.reconcile; `source_document` file.upload; `packet_version` phi.export; `digest` any stopped permission, since
  only a job writes one) and raises on any other table, so a new trigger table with no permission named fails closed on
  its first insert.

**The worker's export gate.** A `packet_export` job the gate refuses also writes `packet_export_refused` on its version
with the new code `organization_suspended`, in the same job-scope transaction, so its page reads refused instead of "in
progress" and, an hour on, "No result came back within an hour". The migration appends the code last to
`packet_export_refusal_codes()`, after `verifier_failed`, which keeps every existing position.

### 2. Who learns why

Someone outside the held organization learns that new work is on hold, and whether it can restart, but never why. The
rule is decided in Postgres, so no page can say more than it was given:

- for the owner's hold, the owning organization's members read the cause: PaidWhole's suspension with its stored
  reason, or billing's nonpayment; anyone else, a grantee's people, PaidWhole's support and a job included, reads
  `on_hold` with no reason, for PaidWhole's suspension and nonpayment alike;
- `closed` reads closed to everyone, since whether the work can restart is theirs to know;
- a grantee's row is only ever about its own members, so it carries its reason;
- no sentence the database writes names an organization or carries a reason code, since a RAISE message reaches the
  server log and the job tables. The application names the reader's own organization, from the row RLS lets them read.

### 3. PaidWhole's suspension stores its reason and its history; nonpayment is not a reason

- **On `organization`:** `status_reason`, a closed list (`customer_request`, `security_hold`, `agreement_ended`) held
  only while suspended, and `status_since`, stamped by the trigger `organization_status_rules` on every status change.
  Both are nullable with no backfill: no production customer exists, and the words handle a missing reason or time. The
  customer's billing page reads them as `tp_billing`, by a column grant.
- **The history:** `organization_status_change`, append-only, with the move, the reason (a suspension reason, or for a
  reinstatement `resolved` or `in_error`), PaidWhole's internal note (one line, 1 to 500 characters, no control
  character), the actor and the time. It has no `practice_id` and holds what PaidWhole did to a customer account, so it
  is a global table with forced row-level security that `tp_app` only reads, and only for holders of
  `organization.manage`. The note lives in its own table because a column grant cannot hide a column of `organization`
  from its members. The note is never logged, exported, mailed or shown to a customer; the form says "Seen only by
  PaidWhole's platform administrators. No patient details." A suspension's own row has `from_status` active and the
  same instant as `status_since`, so the console names who suspended it, and separately who changed the reason since.
- **Why nonpayment is not a stored reason.** The founder ruled nonpayment three ways: PRD:223 (it suspends new runs
  after 30 days); ADR 0050 (the hold is computed by `billing_standing` and ends the moment `invoice.paid` arrives, "with
  nothing to reinstate by hand"); and Q13 (a suspension waits for a delivered dunning notice or a recorded contact). A
  stored `unpaid_invoice` reason would let the console suspend before 30 days and without the notice, and keep the hold
  after payment (the review's F2). So the lists exclude it, the setter refuses it, and the console's hint says
  nonpayment is billing's hold, lifted when the invoice is paid. Reinstatement takes a reason because the history and
  the audit need a code; it stays one click, with one button per reason.

### 4. One setter, checked in the handler and in Postgres

`console_set_organization_status(organization, from_status, to_status, reason, note)` (`tp_app`, a definer, #42's
pattern of `console_pause_mail_stream`):

- it refuses anyone but a person with the platform permission `organization.manage` (42501), and a missing or internal
  organization (P0002);
- `closed` in the current, the seen or the requested status raises `organization_closed_by_closure_only`;
- the status the person saw is checked: a reinstatement of an organization already active returns false and writes
  nothing, and any other difference raises `organization_status_changed_meanwhile`, so one administrator's suspension
  never silently replaces another's;
- the moves are active to suspended and suspended to suspended with a suspension reason, and suspended to active with a
  reinstatement reason; anything else, a null reason and `unpaid_invoice` included, raises
  `organization_status_change_reason`; the same reason with no note returns false;
- it writes the status and reason, the history row and the audit action `organization_suspended` (a suspension or a
  change of reason) or `organization_reinstated`, with the reason as purpose. Both actions are reserved: the
  `audit_event_record` policy is recreated on #42's body with them added, so `tp_app` cannot forge them.

The console's route keeps its ID (`console.organization_status`) and permission, takes a closed-list reason, the
optional note and a consequence tick with the real counts (UX-046) in its Zod schema, maps each of Postgres's refusals to
a field, and its wrapper still audits `organization_status_set`, the request as the person made it.

`organization_status_rules` puts the handler's two refusals in Postgres too, for every role but the owner: an
organization is created active; nothing moves into or out of `closed`, "a closed organization stays closed, and only its
closure closes one"; and the CHECK `organization_internal_active` refuses suspending the internal organization for every
role. A migration preflight refuses to run, naming no organization, if the internal organization is not active.

### 5. The words' rules

Every sentence a person reads is fixed in the design, word for word, and checked by `pnpm lint:copy`:

- the name is "PaidWhole", never "a platform administrator", and the verb is "reinstates", with its object named, on
  every surface (#56's choice, matching the database's words);
- every refusal says whose hold it is and what restarts the work, or that nothing does;
- a person's own organization is named, another tenant's never; the reason, and whether the owner's hold is
  PaidWhole's or billing's, is told only to the held organization's own members (section 2);
- every grantee sentence says the work stops "through its grant", and lists exactly the stopped work, in
  `run_starting_permissions()` order: pricing runs; triage, reports; ROI statements; packet exports; uploads;
- no figure, no "AI", no "recovered"; no closed case promises a restart or a reopening.

The dunning mail (SS-08) chooses its words when each message is sent, from the organization's kind and status and
billing's standing, first match wins: nothing about runs for a closed group and every firm; PaidWhole's suspension for
a suspended group; billing's own hold, this invoice or another, for an active group in suspended standing; today's
words otherwise. "New runs have started again" is said only when nothing else holds runs. The stage machine, its
audits, the outbox and the delivery states are unchanged, and no definer function is added for `tp_billing`.

### 6. The one-release grant, and its revoke

`tp_app` keeps `UPDATE (status)` and `INSERT (…, status)` on `organization` for one release (ADR 0009:42-43, add then
remove), guarded by the trigger, so the previous image's suspend and reinstate keep working during a deploy and after
a rollback. **The first schema PR after this one is deployed** revokes them (`REVOKE UPDATE (status), INSERT (status)
ON organization FROM tp_app`); the setter is then the only writer of a status change outside the owner, and the trigger
stays as defence in depth.

### 7. No reopen of a closed organization

Nothing in the product closes an organization, and what closure means is unbuilt: its grants, which would reach PHI
after the account ends, its memberships and sessions, Stripe's subscription, and the export and deletion under the
retention policy. A reopen now would reopen a state whose meaning is not decided. So `closed` is reachable and
leavable only by the owner, the setter refuses it, the customer's words promise nothing, and `agreement_ended` gives
PaidWhole a reversible way to stop an organization whose agreement has ended until milestone 12's offboarding builds the
closure lifecycle, with its own decision on reopening.

## Alternatives considered

| Option | Why not |
| --- | --- |
| A. A grantee's hold stops the whole practice | Breaks PRD:61's tenancy, stops a practice that did nothing, loses dispute windows, and gives a leaving firm leverage over its client (section 1) |
| C. A held grantee's grant counts as not in force | Breaks "can read"; the console's membership end already contains an access threat |
| Hold a person only when every path is held | The union of roles lets any second path keep the held grant's roles (F1) |
| A stored `unpaid_invoice` reason | Bypasses PRD:223's 30 days and Q13's notice, and keeps the hold after payment against ADR 0050 (F2) |
| Re-check the requester's access inside a job | A second access definition beside `effective_practice_access`, for a person who is not the actor, that could drift |
| Move every enqueue of triage, a packet export or an upload's retry after the commit | A queue failure after the commit loses the request with no schedule to take it up |
| Reopen a closed organization from the console | Closure has no lifecycle yet (section 7) |
| Revoke `tp_app`'s status privileges now | The previous image's suspend and, worse, its reinstate would fail during a deploy and after a rollback |

## Known limits, stated

- **Triage, a packet export and an upload's retry are refused for a grantee's hold by the wrapper alone.** These
  requests only queue the practice's job, and pg-boss enqueues on its own connection, so nothing later in the request
  could unqueue it, and the job runs in the practice's scope. The wrapper's question is Postgres's own decision, asked
  before anything is queued, and a registry test holds every route that queues person-started work to
  `RUN_STARTING_ROUTES` or to `CONTINUES_STARTED_WORK` (the upload's completion, which queues intake for an upload its
  request route already gated). The owner's hold has the same shape for triage and an upload's retry today.
- **A held grantee's person can still bring the practice's own monitoring or reconciliation forward.** Setting the
  pricing location queues `monitor`, and saving the posting template, or setting the proof level, queues `reconcile`.
  These are the practice's own work, which section 1 says continues under a grantee's hold, and the worker gates them
  for the owner's hold only. The registry test names them as such. Refusing those settings writes would be a redesign.
- **The previous image's home suffix** (F9). During a deploy or a rollback, for as long as it runs, the previous image
  prints its fixed suffix after the database's sentence: "Everything here stays readable; uploads, pricing runs,
  monitoring, packet exports and reports start again once it is resolved. The organization's administrator sees the
  standing and what to do next in Settings, Billing." After the owner's sentences it repeats a clause; after a
  grantee's it is wrong in one point, since monitoring never stopped, and does not say which organization's
  administrator it means. Accepted: the refusal itself is right, the suffix is that image's own text, and no wording of
  the grantee sentences can make "monitoring … start again" true. The previous image also fails closed for a person
  whose held grant stops only part of their work: it asks `practice_run_refusal`, so it refuses all nine routes.
- **A security hold does not contain reads** (F7). It stops new work only: the held organization's people still read
  and download everything at every practice they reach. The console's hint says so, and that ending their memberships
  stops their access.
- **Model calls are not refused by any suspension** (`model_proposal`, `model_budget_hold`). They are not run-starting
  work under ADR 0050, and the abstraction queue's calls serve documents already uploaded. A later product decision if
  wanted.
- **A closed grantee keeps reading through its grants** until the closure lifecycle decides whether closure revokes
  them.
- **A grantee's person keeps a packet export asked for before the suspension**: the job finishes and its print stays
  readable; the submission to the payer is a person's logged act, which no hold covers.

## Open for milestone 12

- A firm's own invoices and suspension rules (ADR 0050:118), and whether a group grantee's nonpayment should also stop
  its people at the practices it is granted. Today a grantee is held on its status alone.
- The closure lifecycle: closure ends the closing organization's grants, memberships and sessions as one audited act,
  Stripe's subscription, the data export and the deletion under the retention policy, whether a closed grantee keeps
  reading, and reopening (as a new agreement and new grants the practice's administrator approves again, PRD:302).

## Consequences

- **ADR 0050:118, decided in part, early.** PaidWhole's own suspension or closure of a firm now stops that firm's
  people's new work through its grants. A firm's nonpayment stays deferred to milestone 12. This decides a deferred
  point; it reverses nothing.
- PRD:249 now holds for firms too, through their grants. The customer's billing page, the practice home, Uploads, the
  console's card, its billing status and the practice's grants say whose hold it is and what restarts the work.
- The migration adds two columns, three CHECKs and a trigger on `organization`, one table, seven functions, and drops
  `organization_run_refusal`. `practice_grants` gains `grantee_status` last, which the previous image ignores. The
  definer functions `tp_billing` and `tp_screening` may call are unchanged.
- The cost of the per-permission hold is the person's own paths and ten `roles_permit` calls: 3.3 to 6.9 ms for a firm
  granted 2,001 practices, the same order as `open_practice_scope` (3.7 ms), which every request already pays. A
  capacity test holds it under 100 ms at 2,000.

## Handed to Lane A

- **The suspension and reinstatement mail, and Q13** (a suspension waits for a delivered dunning notice or a recorded
  contact): one schema PR, next in the chain after this one. Both extend #42's outbox and read its delivery states.
- **`REVOKE UPDATE (status), INSERT (status) ON organization FROM tp_app`:** the first schema PR after this one is
  deployed (the mail PR, if this one is live by then).

## Revisit when

- This PR is deployed: the next schema PR revokes the one-release grant.
- Milestone 12 builds firm billing or the closure lifecycle.
- A new access path or a new run-starting route, permission or trigger table is added: the registry test, the
  permission list's test and the trigger's fail-closed branch say so first.
- The founder ever wants a manual nonpayment suspension: that would change PRD:223, ADR 0050 and Q13, and belongs to the
  mail-and-Q13 PR, with Q13's precondition checked in its setter and an automatic lift on payment. This ADR does not
  recommend it.
