# 0061. Verify a deadline only from signed-off evidence, refuse an unverified export in SQL, and attest the export over its hashes

- **Status:** accepted
- **Date:** 2026-10-18
- **Deciders:** the owner (D15 option a, D16 options a and c, D17 option a, in `docs/product/reconciliation-001.md`, approved 2026-10-17; the schema approved, the reviewer's downloads added and D16 (a) without a practice approver and contract appeal-level evidence placed in later pull requests, 2026-10-18; the best-option audit's items #4, #5, #26 and #61 folded in, 2026-10-18; see Owner rulings); the build (PR 5 of Change Order 001)
- **PRD sections:** 2 (point 8, dispute windows), 6 (Packet builder; Submissions and payer responses), 8 (packet_version; Invariants), 11 (step 8, the window), 12 (From validated to actionable; The packet; Approval; Submission), 15 (Stack: compute, database), 16 (a narrative inventing a number; Secrets); Data dictionary, Contracts and Pricing, triage and cases; Change Order 001, CO-05, CO-06 ("an unverified deadline blocks actionability and export") and CO-12 (`packet_version.deadline_verification_status`); ADRs 0009, 0019, 0028, 0038, 0040, 0041, 0044, 0047, 0049 and 0055 (the worker gains a login of its own, beside billing's and the e-signature webhook's)

## Context

CO-05 asks for a packet v0 for the first audits: the affected lines with expected, observed and difference;
the governing rate record's page, quote and hash; the calculation per line; "the deadline with its
verification status"; the reviewer's approval; PDF and CSV, hashed and stored, with the verifier on every
export. Its acceptance: "a packet cannot be exported with a figure, date, code, count or identifier absent from
its inputs; the stored hash matches the exported file; an unverified deadline blocks export". CO-12 adds
`deadline_verification_status` (verified, unverified, not_applicable) to `packet_version`.

What the repository held (reconciliation-001, milestones 6 and 8, and Section 12):

- Milestone 8 had already built a superset of the v0 packet: `packet_version` (tp-packet/1) with the lines,
  the citation, the rule releases, a verifier result and an export of a PDF and a CSV with their SHA-256. Its
  export job checked only that the version was approved, current and still its case's; nothing ran the
  verifier again over what was rendered.
- A line's deadline is the trace's `steps.window` (PRD 11 step 8): the contract version's
  `dispute_window_days`, or, when the contract is silent, the release's `commercial_default`; Medicare
  redetermination for a Medicare Advantage non-contracted line. `contract_version.dispute_window_days`
  carried no page, quote or hash, so no contract deadline could be shown to come from the contract, and every
  synthetic and draft dispute-window record is at L1.
- Internal users approve nothing (ADR 0041; support grants carry only the support, contract specialist or
  reviewer roles). In v0 the founder is the reviewer, and in most first audits the practice has no person who
  approves packets.
- `audit_report` already had the pattern a reviewer's sign-off needs: generated once and hashed, attested once
  by an `audit_finding.validate` holder in their own name over the two SHA-256 and a checklist of codes (no
  words), and released only after.
- The engine's methods, flags, rounding and unpriced reasons, the ledger's semantics, the content pipeline and
  the security program must not change (the change order's "What must not change"); releases 900001 to 900004
  stay byte for byte, since 110 of the 150 golden claims pin 900001's manifest and a record's level is part of
  its hash.

## Decision

**What "verified" means (D17 a), derived from the trace with the engine untouched.** `@tp/triage`'s pure
`deadlineVerification()` (`packages/triage/src/deadline.ts`) reads the trace's window (its source, record key
and SHA-256, length, unit and end) and `agreement.contract_version_id`, beside two facts the worker loads
(`apps/worker/src/triage/deadline.ts`, `lineDeadlines()`): the level of the release record the trace names (by
its release number and SHA-256) and the contract version as it stands now. It returns exactly one of
`not_applicable` (no window; triage still says NO_WINDOW), `verified` (cause null) or `unverified` with one of
`DEADLINE_UNVERIFIED_CAUSES`:

- a release window is verified when its record is Medicare's, of a release not withdrawn, and at the minimum level
  or higher: L2 for actionability and the export, L3 for the E3 gate (PR 9), the SQL's `minimum_level`. A
  `commercial_default` record is never verified, whatever its level (COMMERCIAL_DEFAULT); a record of a release
  with a `rule_release_withdrawal` row verifies nothing (RELEASE_WITHDRAWN), since a withdrawal records that its
  content was wrong, though runs pinned to it stay in effect until PR 11 invalidates them; and, since the best-option
  audit's item #5, a record below the level says RECORD_BELOW_LEVEL first, and one at the level verifies nothing
  until the specialist confirms the Medicare Advantage dispute route (MA_ROUTE_UNCONFIRMED; golden QUESTIONS Q34);
- a contract window is verified when the version is signed off, its window cited with complete evidence, a unit and
  a start that are the rule the product computes (calendar days after the payment date, BPR16, which the engine's
  trace labels `remittance_date`; item #5), verified by a contract specialist, and its days the trace's length in
  days from that date (otherwise
  CONTRACT_WINDOW_UNCITED, CONTRACT_WINDOW_RULE_NOT_COMPUTED, CONTRACT_WINDOW_UNVERIFIED,
  CONTRACT_VERSION_NOT_SIGNED_OFF or CONTRACT_WINDOW_DIFFERS, in that order);
- after a reopened denial (dispute level 2 and above) the deadline is the next window's
  (`nextLevelDeadlineVerification()`, the loader's `nextLevelDeadline()`): a contract's appeal levels carry no
  evidence (NEXT_LEVEL_UNCITED); the Medicare reconsideration record in force is verified as a release record is,
  and only when it gives exactly the end stored when the denial was recorded (`case_next_dispute_window()` read
  now): `payer_response.next_window_ends_on` is computed once, from the release in force then, so a record that
  gives another end is not the record the date came from (NEXT_LEVEL_DIFFERS). A packet's deadline is
  `packetDeadlineStatus()`: not applicable with no line, verified when every line's is.

`DEADLINE_UNVERIFIED` joins `NOT_ACTIONABLE_REASONS` right after NO_WINDOW; `TriageFacts.deadlineStatus` is
required and `judgeLine()` pushes the reason for `unverified`. It is not an unpriced reason: the line keeps its
price, `UNPRICED_REASONS` and `docs/product/unpriced-reasons.md` are unchanged, and nothing under
`packages/pricing/src` changes. A passed window that is not verified waits too rather than being struck into a
case, since it is not shown to be the line's window. Triage, the report and the Cases screen (how many lines
and how much wait for a verified deadline) read it the same way; the report names the reason "Deadline not
verified" and the evidence gap `deadline_unverified`.

**The contract window's evidence, in rate_record's form.** One forward-only migration,
`20261103090000_deadline_verification_and_export_attestation.sql` (no table added, so no registry row, RLS
setting or policy changes; no ledger, pricing or rule table touched), adds `contract_version.dispute_window_evidence`
{document_id, page, quote, hash} (`rate_record_evidence_complete()`, exactly those keys, a quote of at most
2,000 characters, only with `dispute_window_days`) and `dispute_window_verified_by` and `_at` (set together,
only with evidence). `contract_version_rules()` is 20261016160000's body with the evidence among the terms and
the verification among what approval, sign-off and retirement never change, so both are frozen from approval
exactly like `dispute_window_days`. On a draft or proposed version, a verification is a contract specialist's
(`rate_record.approve`), in their own name, now, once, over complete evidence on one of the version's
documents, with the window and the status as they stand; any other edit of the days, the evidence or the
documents clears it, as an edit clears a rate record's verification. A version is written unverified and its
evidence names one of its documents; one whose window is cited but unverified, or cited from a document it
does not name, is not approved. `@tp/contracts` adds `citeDisputeWindow()` (the quote checked against the page
and stored with the page's hash) and `verifyDisputeWindow()` (verified only while the citation resolves);
`approveVersion()` refuses a cited, unverified window and re-resolves its citation; a correction or an
amendment copies the citation while its days stay the prior version's, never the verification. The specialist
cites and verifies on the abstraction screen (routes `practice.abstraction.cite_window` and
`practice.abstraction.verify_window`); both the specialist's and the practice's version screens say whether
the window is uncited, cited or verified, by whom and when. Every existing version has no evidence, so its
lines are DEADLINE_UNVERIFIED until a corrected version carries it: actionable totals fall where evidence is
missing, which is the approved consequence.

**The SQL mirror.** `priced_line_deadline_status(target, minimum_level)`,
`case_next_window_deadline_status(target_case, minimum_level)` and `packet_version_deadline_status(target_case,
content)` hold the same rule over the stored trace (STABLE, SECURITY INVOKER, `search_path` pinned, EXECUTE to
`tp_app` only). Under the caller's policies a row it cannot see yields `unverified`, so every check below fails
closed, and a level other than L2 or L3 is refused (22023). `apps/worker/src/triage/deadline.db.test.ts` runs both
on the same priced lines.

**tp-packet/2 (D15 a: CO-05 as changes to the milestone 8 packet, no second export path).** `@tp/packets`
writes `tp-packet/2`: each line keeps `window_ends_on` and adds its `deadline` (end, status, source, cause) and a
`calculation` copied from the stored trace, never recomputed (method, release, the steps' whole-cent amounts,
the rounding with its unrounded and rounded cents, the observed basis, the patient share and the trace's
SHA-256); `content.deadline` holds the basis (the lines' own windows at the first level, the next level's
window after a reopened denial), the status, the end, the lines verified, the causes and the sources (the
contract window's document, page, quote, hash and verifier, or the release records' release, SHA-256 and
level). `narrativeFacts()` gains those figures, so the verifier can match them. tp-packet/1 stays readable;
a /1 version can never be exported or attested, and the builder says to write it again. In the database,
`packet_content_valid()` accepts /1 as before and asks /2 for its deadline and calculation shapes;
`packet_version.deadline_verification_status` is text generated from the content (tp-packet/2's
`content.deadline.status`, `unverified` for every /1 version) with its CHECK, so no role writes it; and
`packet_version_deadline_stated` (AFTER INSERT) holds what a /2 version states to its inputs when it is written:
each line's status, end and source, and its calculation (`priced_line_calculation()` reads the stored trace as
`lineCalculation()` does: method, release, steps, rounding, observed basis, patient share); the version's basis by
dispute level and its status as the database derives them; its end (the earliest of the lines' windows at the
first level, the reopening denial's next window above it), its line counts and the shape of its causes; and
exactly the sources its lines' windows name, each as it stands (the contract window's document, page, quote,
hash, days and verifier; the release record's SHA-256, level and program). The trace's SHA-256 is over its
canonical JSON, which SQL does not compute, so the export job checks it. The column is what the version stated;
nothing trusts it at export.

**The export, refused twice.** The worker's export job refuses a version not of the case's dispute level now
(`PACKET_VERSION_NOT_CASE_LEVEL`: one written before a denial reopened the case states the earlier level's
deadline, verified though the deadline that applies is the next window's); derives the deadline again (the
database's `packet_version_deadline_status()` in its query, and `lineDeadlines()`/`nextLevelDeadline()` with
`packetDeadlineStatus()`), and either saying unverified refuses the export (`PACKET_DEADLINE_UNVERIFIED`, no file
written); states the version's deadlines and calculations again from its inputs (`restatedDeadlines()`: each line's
calculation copied again from its trace with the trace's SHA-256, the deadlines and their sources derived again)
and refuses any difference (`PACKET_CONTENT_NOT_ITS_INPUTS`), so no figure, date or count is printed that its
inputs do not give now; then runs `verifyNarrative()` over exactly the narrative and content it renders into the
PDF and the CSV (`PACKET_VERIFIER_FAILED`), computes each file's SHA-256 over the exact bytes it writes, requires
the store's plaintext hash to equal it, and records both with the verifier's report. The handler
(`requestPacketExport()`, the web's `requestExportOnce()`) refuses the first two as well. In SQL,
`packet_version_export_guard` (BEFORE UPDATE) refuses the export transition for a version not of the case's
dispute level ("only a version of the case's dispute level is exported"), and while the deadline, derived again
then from the content and the rows it names, is unverified ("a packet version whose deadline is not verified is
not exported"). SQL cannot run the verifier, which is TypeScript: it holds the report the job writes
(`export_verifier_report`) to the verifier's format, a pass and the version's own narrative SHA-256, and the report
never changes otherwise. So SQL enforces the deadline and the level; the verifier is enforced by the job. Residual
risk F9, as first built: a job-scope write of a forged passing report and forged hashes would not be stopped by SQL,
and the attestation compared only the stored hashes, so a reviewer could attest files nobody had read. The owner's
ruling of 2026-10-18 (below, the reviewer's downloads, and Owner rulings) answers it: the reviewer attests only after
downloading both files in their own requests, each served only once its bytes hash to the stored SHA-256, so what
they attest is the bytes they read, forged or not, and a download whose bytes do not match is never served and never
counts; and the evidence of a download is something a compromised worker cannot forge, because the worker connects
as a login of its own that the database refuses for the evidence and the attestation. As first built for the ruling,
that evidence was told apart only by `app.actor_id`, which job code on the login the web and the worker then shared
could set to the reviewer's ID, writing the evidence and the attestation itself; review found it, and the worker's
own login closes it. F9 is closed against job code and a compromised worker once the worker runs on that login (the
deploy job creates it; Consequences); what remains is a process holding the web's own application login, set out
with the downloads (What it does not hold against). `tp_app` cannot bypass the
guard: `tp_owner` owns the tables, triggers and functions,
`tp_app` owns nothing and has no BYPASSRLS, cannot ALTER the table or DISABLE a trigger, and cannot set
`session_replication_role`; its column grants are all it writes (`exported_at` only through
`packet_version_rules()` for a job actor; `deadline_verification_status` never); and the guard reads rows that
cannot change underneath it (`priced_line` and `rule_record` are immutable, a contract window is frozen from
approval, and the version's status is read at export), its read of the pricing serialized with every write that can
make it stale (item #4 below), since a write still open in another transaction is invisible to it under READ
COMMITTED.

**The attestation (D16 a and c), audit_report's pattern.** Once exported, a reimbursement reviewer (the founder in
v0) attests once, in their own name, under a four-hour support grant: `audit_finding.validate`, which only the
reviewer role holds; the attester drafted, wrote and approved no version of the packet (every version's writer and
approver, as the review's `viewerTookPart` reads them too); the version is current, still asks for its case's
lines, is of the case's dispute level, and its deadline is not unverified; the attestation (`tp-attestation/1`) holds a
checklist of codes and the export's two SHA-256, no words, and its time is the database's
(`packet_version_attestation_rules`). A submission is logged only of an attested export
(`submission_needs_attested_export`), which is the "release" of the report's pattern. Where the practice has
users, a practice `packet.approve` holder who is not the drafter approves as before and the founder attests; the
drafter approves only on milestone 8's single-user path (`approved_alone`, CAS-10), which this PR leaves as it was
for the owner's ruling on D27 (see Consequences), and internal users still approve nothing else: `packet.approve`,
`practice_has_other_packet_approver()` and the permission matrix are unchanged. The service is
`attestPacketExport()` (audit event `packet_export_attested`), its route `practice.cases.packet.attest` (Zod,
`audit_finding.validate`), with the reviewer's pages to review and download the exported files.

**The reviewer's downloads before the attestation (the owner's addition of 2026-10-18; residual risk F9).** The
reviewer attests a version's export only after downloading both its PDF and its CSV, each in a web request of their
own that served the file once its bytes, read from storage, hashed to the version's `export_sha256` or
`export_csv_sha256`. The evidence of a download is an `audit_event`, so no table is added:

- *Where it is written.* Every download route (the reviewer's `practice.cases.packet.review_pdf` and `review_csv`,
  the practice's `practice.cases.packet.pdf` and `csv`) serves the file through one function,
  `downloadPacketExport()` in `@tp/worker/packets` (the web's `exportFile()` calls it): it reads the version's key
  and stored SHA-256 under the caller's scope (an audited read, purpose `line_export`), reads and unseals the bytes,
  hashes them, and only when the hash is the stored one records `packet_export_pdf_downloaded` or
  `packet_export_csv_downloaded` (object the version, purpose `line_export`, actor the person the request is for:
  `SET LOCAL app.actor_id` from their session) in the same transaction, then returns the bytes. A hash that differs
  throws, the transaction rolls back and nothing is recorded. The two actions replace `packet_export_downloaded` for
  every new download; the export history reads all three, so earlier downloads stay listed and count as no evidence.
  A download is served to a GET alone: Next answers a HEAD with a route's GET handler, which would record a download
  and send no bytes, so `downloadHandler()` refuses every other method with 405 before the route runs.
- *Who may write it: the web's login, never the worker's.* The worker connects as a login of its own
  (`tp_worker_login`; `tp_worker_dev` in development and tests), a member of `tp_app`, whose privileges it inherits
  as the web's login does, and of `tp_job`, a role that holds no privilege, owns nothing and that no login may SET
  ROLE to (`packages/db/src/roles.ts`, `apps/worker/src/deploy/logins.ts`); the web's login is never a member of it
  (and the catalog test refuses `tp_app` itself as one). `app_session_is_job()` reads that membership from `session_user`, the login the
  connection signed in as: `set_config('app.actor_id', ...)`, `SET ROLE` and SECURITY DEFINER change the actor or
  `current_user`, never `session_user`, and only a superuser may `SET SESSION AUTHORIZATION`, so nothing a job's code
  runs makes its connection a person's request. `audit_event_packet_download` (new, BEFORE INSERT, only for the two
  actions; every role) refuses the worker's login first ("a packet export's download is recorded by the web request
  that served it, never on the worker's login"), then records a download only for a person (`app_actor_is_person()`,
  `actor_kind` `user`) in their own name, who holds `phi.export` or `audit_finding.validate` in the event's practice,
  of a version of that practice in the caller's scope that is exported, with purpose `line_export` (the time is the
  database's: `tp_app` has no grant on `at`). With it, `audit_event` is append-only for every role, the owner and
  superusers included, so evidence never changes, moves to another version or disappears, and its `tp_app` INSERT
  policy (`audit_event_record`) writes an event only in the transaction's own actor's name. So a job, through
  `withJobScope()` or its own SQL, under its own ID or with `app.actor_id` set to the reviewer's, writes no download
  event. `withJobScope()` also refuses a job ID that names a person (`JobActorIsPersonError`) before the job runs, so
  no job acts in a person's name through the API on either login. In AWS the worker's task receives only its own
  login and the queue login, and the task role the web and the worker share reads no login's secret (ECS injects
  each task's logins through its own execution role), so the worker cannot fetch the web's login either.
- *What the attestation asks.* `packet_export_downloads_of_actor(version)` (SECURITY DEFINER, since `tp_app` reads
  only its own administrators' audit log; STABLE; the caller's scope kept, and `session_user` is the caller's under
  definer's rights too) returns the files this transaction's actor, as a person, downloaded of that version, in its
  practice, at or after its `exported_at`, and nothing on the worker's login.
  `packet_version_attestation_rules` refuses an attestation on the worker's login ("a packet's export is attested in
  its reviewer's own request, never on the worker's login") and unless the downloads hold both `pdf` and `csv` ("a
  packet's export is attested once its reviewer has downloaded both its PDF and its CSV, each checked against its
  SHA-256"), after every earlier check, and `attestPacketExport()`, which the attest route runs, refuses first with
  its own reason (`PacketRefusedError` `export_not_downloaded`). Another person's downloads (the billing manager's),
  another version's, a download whose hash check failed (none was recorded), a HEAD, and anything a job or the
  worker's login wrote are not evidence.
- *A new export needs new downloads.* A version is exported once (`packet_version_rules`: "a packet version is
  exported once"), so a download of the version at or after its export is a download of the bytes its two hashes
  name; a later export is of a new version, whose evidence starts empty.
- *The screen.* The review page shows, for each file, whether the viewer has downloaded it since the export (read
  from the same function), tells the reviewer to download both first, and shows the attest button disabled with that
  reason until both are recorded.
- *What it does not hold against.* A process holding the web's own application login: the web request that serves
  the file is the one that records its download, so the database cannot tell the web's code that hashed the bytes
  from other code on that login that sets `app.actor_id` to the reviewer's ID while their support grant is open and
  inserts the event, or attests, as it could take any other step only a person may take (an approval, a sign-off). That
  process is the one that serves the reviewer the files and the review page in the first place, so it could show them
  anything; the owner's condition is a compromised worker, which this holds against. Holding the web's process too would
  need evidence only the person's own browser can give (a signature over the bytes with a key the reviewer holds),
  recorded under Revisit when. The rollout leaves one window: until the worker's task is replaced by one on its own
  login (the deploy job creates the login after the migrations, before any service moves; ADR 0049), the previous
  image's worker still connects as the application login.

**Release 900005 and AUDIT-01.** A SYNTHETIC release 900005, written by `renderDeadlineRelease()` in
`tools/release/synthetic.ts` as 900004 was for PRC-19, is every file of 900001 unchanged but `dispute_window/2026`,
whose three Medicare records keep their values, source and quotes, are read at L2 by a SYNTHETIC second reader, and
carry that reader's independent second pass (`pnpm verify-content` passes on it). Only the tests that judge a
verified Medicare deadline load it, since `current_rule_release()` picks the highest release loaded. AUDIT-01's two
contract windows (3,650 and 30 days) gain their evidence in `inputs.json`; `tools/audit-worksheet` applies the same
rule (a contract line's deadline is verified only if its contract carries that evidence); `audit-e2e.db.test.ts`
cites and verifies each window and still matches the worksheet line for line; and the expected report, the line
CSV, `remit.835` and `expected.json` are byte for byte as they were.

**The best-option audit's items #4, #5, #26 and #61, folded in before this pull request merges (the founder's ruling
of 2026-10-18; Owner rulings).** Only the part each item gives to PR 5 is built here; the rest lands where the item
says (Revisit when). The same migration holds every SQL object below, so no table is added and no registry row, RLS
setting or policy changes.

*Item #4: one check of whether a version's pricing is still current.* A case's lines keep the priced lines they
joined with, so an accepted re-run (a CMS or contract correction), a withdrawn rule release (its content was wrong), a
correction that superseded the contract version, or an amendment back-dated before a line's service date used to
leave an approved packet passing approval, export and attestation, which compared it only with the frozen case line.
The database now holds one rule:

- `service_line_priced_in_effect(service line)`: the line's priced line in the run in effect that took effect last
  (`pricing_run_in_effect()`, ordered by `coalesce(accepted_at, completed_at)` then ID), exactly
  `apps/worker/src/price/in-effect.ts` `PRICED_IN_EFFECT` (`apps/worker/src/price/pricing-check.db.test.ts` compares
  them through a first run, a re-run nobody accepted, an accepted re-run and a later first run of the period).
- `priced_line_pricing_check(priced line)`: `current`, or the first cause that holds, in this order:
  PRICING_NOT_IN_EFFECT (another line is in effect, none is, or the caller cannot see it), RELEASE_WITHDRAWN (a
  `rule_release_withdrawal` row for its run's release), MAPPING_NOT_IN_FORCE (the plan mapping the line priced under
  is no longer the plan's mapping in force on its service date, `payer_plan_mapping_in_force(plan, date)`, exactly
  `@tp/contracts` `mappingInForce()`: a correction covering that date supersedes it, directly or through the mappings
  it corrects, to another contract, to Medicare Advantage non-contracted or to no agreement, MAP-03; or it names
  none; for a Medicare Advantage non-contracted line too), CONTRACT_VERSION_NOT_SIGNED_OFF (its version is no longer
  signed off, or the caller cannot see it) and CONTRACT_VERSION_NOT_IN_FORCE (signed off but no longer covering the
  service date by the resolver's `windowCovers` rule, `effective_from <= date < effective_to`, the date being the
  line's service date or its claim's start). A Medicare Advantage non-contracted line names no version and skips the
  last two. (Review found the mapping missing: a correction of which contract a plan maps to left a stale figure
  current through every step; it is the third cause now.)
- `packet_version_pricing_check(content)`: `current` when every `content.lines[].priced_line_id` is, else the most
  severe cause across them; a lines value that is not an array or a malformed ID fails closed
  (PRICING_NOT_IN_EFFECT). `pricing_run_release_withdrawn(run)` answers the audit report's question. All four are
  STABLE, SECURITY INVOKER, `search_path` pinned, EXECUTE to `tp_app` only.

The read is serialized with the writes that make pricing stale (review reproduced a stale export and a stale
attestation by holding an acceptance, and a withdrawal, open across them). The approval, the export guard, the
attestation and the submission's flag take `pricing_current_read_lock(practice)` (two transaction-level advisory
locks, shared: the practice's and every practice's withdrawal key) in a statement of their own right before the check;
`pricing_current_change_lock()` (BEFORE triggers, `REVOKE ALL FROM PUBLIC`) takes the matching one exclusively on a
`pricing_run` whose `accepted_at` changes or that completes, a `contract_version` that leaves sign-off or whose
`effective_to` changes (the supersede and the close inside a successor's sign-off), a `payer_plan_mapping` correction
and a `rule_release_withdrawal`. Under READ COMMITTED each later statement of a trigger takes a new snapshot, so a
step that waited reads the change once committed and refuses (or flags), and a change that waited commits after a
step that was current when it was made. The shared side never waits on a row the writers lock and the writers touch no
packet version, so there is no lock cycle. That holds only at READ COMMITTED: a REPEATABLE READ or SERIALIZABLE
transaction keeps the snapshot it took before the change and would read past the lock (review reproduced a version
attested after its pricing went stale and its export was logged sent without sign-off, on a session that set its own
isolation), so `pricing_current_read_lock()` refuses any other isolation level (SQLSTATE 25000), and approval, the export
guard, the attestation and the submission's flag with it; the application's only such transactions are read-only (the
audit copy, the restore drill, the domain-model generator).

It is enforced wherever a packet moves. Approval: `packet_version_approval_pricing` (BEFORE UPDATE, first by name; it
does not replace `packet_version_rules`) refuses "a packet version is approved only while its pricing is current",
and the approval panel shows the blocked reason `pricing_not_current` first. The export request and the export job:
the readiness both share (`exportReadiness()`, below) runs the same SQL and says `pricing_not_current`. The export
guard: `packet_version_export_guard` refuses after the level check and before the deadline. The attestation:
`packet_version_attestation_rules` refuses "a packet version whose pricing is no longer current is not attested",
the attest route's `attestOnce()` refuses first with the remedy, and the review page shows the Attest button disabled
with the reason. Writing a version: `loadAssembly()` refuses a case unless every open line passes
`priced_line_pricing_check()` (code `pricing_changed`), naming each stale line as the case page numbers it and its
cause. A submission is never refused for it, since it records something that already happened outside the product:
`submission_pricing_check` (BEFORE INSERT) writes `submission.pricing_check` from the version's content, overwriting
whatever the INSERT gave (`tp_app` has no grant on the column; null only on a row logged before this migration, of
which no environment holds one), and the submissions page shows the flag with its cause and the figures.

Triage drops a stale line out of the actionable totals at once: `VERSION_NOT_IN_FORCE` and `RELEASE_WITHDRAWN` join
`NOT_ACTIONABLE_REASONS` after VERSION_NOT_SIGNED_OFF; `TriageFacts` requires `contractVersionCoversService` and
`releaseWithdrawn`, which `candidateRows()` and the report compute in SQL from the version's dates and the
withdrawal row; and `apps/worker/src/triage/triage.db.test.ts` holds, for the lines on their pricing in effect, that
the database says `current` exactly when triage names none of VERSION_NOT_SIGNED_OFF, VERSION_NOT_IN_FORCE and
RELEASE_WITHDRAWN, each cause its reason. The web's `ACTIONABLE_NOW` (the Cases list, the case page and the dashboard)
counts only lines whose check is `current`; `case.actionable_cents` is untouched, so the Cases screen shows the case's
own ask beside what is actionable now, and the case page marks each stale line with its cause. No audit report rests on
a withdrawn release: `audit_report_belongs()` refuses the request, the report job fails a queued report as
`release_withdrawn` at once without a retry, `audit_report_rules()` refuses a queued report made ready, and the
attestation and the release of a ready one (failing a queued one stays allowed); the generate route refuses ahead
with the remedy, and the report pages say why in words, with a banner on a ready report and its attest and release
disabled with the reason.

What the person reads is honest about what happens next. Nothing refreshes a case automatically yet (PR 11 does), and
a case line never becomes current again (its priced line is fixed, and triage never adds a line already in a case), so
no sentence promises that the case is judged again or offers waiting: the refusal names the lines and why, says that a
packet is written, approved, exported and attested only on the pricing in effect, and gives the one step available, to
write the stale line off on the case page (it leaves the dispute) and write, approve and export the packet again
without it. (As first built the remedy also offered "or wait", a step that never works; review removed it.) Writing a
version again is never answered "nothing changed" while its pricing is not current: the write goes through to the
refusal that names the stale lines. The builder, the review and the submissions pages show
"Pricing now" (`PricingNowPanel`, from `pricingNow()` over `@tp/worker/pricing` `linePricingNow()`, an audited read
with purpose `packet_build`): each stale line's row, cause, expected amount and variance then and now, and the
version's totals then and now. "Now" is the line's pricing in effect from `service_line_priced_in_effect()`, never
recomputed: "Not priced again yet" when that is the same line or none (as after a withdrawal with no accepted
re-run), "No longer priced" with the unpriced reason's words when the new line is unpriced, and no total when a line
has no figure now. Cents are decimal integer text.

*A submission sent without sign-off (the founder's ruling of 2026-10-20, Owner rulings).* When a version's pricing goes
stale after its export and before its attestation, the attestation stays refused and the packet is never attested;
a submission of that export can still be logged, recorded truthfully as unattested with its reason, so reconciliation
tracks the payer's answer. Only that reason allows an unattested submission. `packet_version_unattested_reason()` is
the one rule (an export the guard made, so its pricing was current then, not attested, whose lines the caller sees,
whose pricing is no longer current), and `submission_pricing_check` writes `submission.unattested_reason`
(`pricing_stale_after_export`) beside `pricing_check`, which still records the cause, under the pricing lock;
`submission_needs_attested_export` refuses every other unattested export and records `submission_logged_unattested`
in the submitter's name, once (`audit_event_submission_unattested` refuses any other); the attestation then refuses
the version for good. `tp_app` writes neither column. `logSubmission()` asks `packetVersionUnattestedReason()` before
the database decides again, and the log route requires the person's confirmation (`sentWithoutSignOff`) that the
export went to the payer without the reviewer's sign-off, refusing without it; the service checks the confirmation
again against what the INSERT returned and rolls back one the database recorded sent without sign-off unconfirmed
(`SENT_WITHOUT_SIGN_OFF_UNCONFIRMED`), so a re-price committed between the page and the INSERT never logs one. The founder's words are
`SUBMISSION_UNATTESTED_WORDS` ("sent without sign-off: pricing went stale after export"), said everywhere the
submission shows (`apps/web/src/lib/packets/unattested.ts`): the submissions page says the export is never attested,
not to send it if it has not gone, and how to log it if it has, with the confirmation box and "Log the submission
sent without sign-off"; the log marks it "Sent without sign-off"; the packet builder says the export is never attested
rather than waiting for the reviewer, and links the submissions page; the review page explains the refusal by each stale
line's own cause, says first that an export already sent is logged before any step (once every line is written off the
case is closed and takes no submission), then what to do instead in three steps, re-price (done already only when every
stale line was priced again by an accepted re-run or a later run; otherwise the lines each cause leaves not priced
again, whose period is re-run under what is in force now and accepted), a new version on the pricing in effect (the
stale lines written off, since refreshing a case is PR 11's; none yet when every line is stale) and a new export that a
reviewer attests, and says once the export was logged sent without sign-off; the builder, the submissions page and the
case page's stale line say "log it first" too; the submissions page still offers an export an edit replaced, logged
only as sent before the edit, and on a case closed written off says how to log one (a line reopened with the reason)
instead of offering a form; the reviewer's list shows a never-attested export apart, marked so, until it is logged or
replaced, and lists no export of a closed case; Reconciliation lists every such submission with its cause and the payer's latest answer; and the
audit report's state column and its payer approved and recovered section count them per case
(`unattested_submissions`, present only when there is one), with the PDF's sentence under By case, which the Reports
screen shows too (`unattestedSubmissionsNote()`). The attest route's refusal says the same
(`PRICING_BLOCKED_TEXT.attestation`).

*Item #5: a contract window's unit and start, and the rule the product computes.* A contract window could only mean
"N calendar days from the payment date", so "within 180 days of the date of service" was verified with a deadline
weeks too late. `contract_version` gains `dispute_window_unit` (`calendar_days`, `business_days`, `months`) and
`dispute_window_measured_from` (`date_of_service`; `remittance_date`, the remittance advice's own date: the 835's
DTM*405 production date or the date printed on a paper remittance; `payment_date`, BPR16: the check's issue date or
the EFT's effective date, the Remittances screen's Payment date; `receipt_date`), each held to its list by a CHECK
and present exactly with a citation (`contract_version_window_rule_with_citation`); the length stays
`dispute_window_days`, in the cited unit as the quote gives it. The specialist chooses both from the quote on
the abstraction screen (two required selects with no default; nothing parses the quote), and they are terms like the
others: frozen from approval, and an edit clears the verification. `contract_window_rule_computed(unit, start)` is
what `@tp/pricing`'s `windows.ts` computes for a contract window, its days as calendar days after BPR16, which is the
payment date (as first built the rule was named the remittance date, which made "within 30 days of the remittance
advice" verify with an end counted from the later payment date, and refused the quote the engine computes exactly;
review found it). `@tp/contracts` `COMPUTED_CONTRACT_WINDOW_RULE` and `@tp/triage` `COMPUTED_CONTRACT_WINDOW` hold the
same literal (`calendar_days`, `payment_date`), the derivation still reading the trace's own label for that start, which `apps/worker/src/triage/deadline.db.test.ts` compares over every unit and start. A window is verified
only for that rule: `verifyDisputeWindow()` refuses another (`ContractWorkflowError` `invalid`, field
`disputeWindowRule`), `contract_version_rules()` refuses the first verification of a draft or proposed version
otherwise, and the CHECK `contract_version_window_verified_as_computed` holds every verified row to it. A cited window
whose rule the product does not compute yet is approved unverified (`approveVersion()` and the approval branch of
`contract_version_rules()` let it through), so its lines stay DEADLINE_UNVERIFIED with
CONTRACT_WINDOW_RULE_NOT_COMPUTED rather than show a date that may be later than the contract's. The derivation
(`priced_line_deadline_status()` and `deadlineVerification()`) asks for the computed rule and a trace counted from the
engine's start (else CONTRACT_WINDOW_DIFFERS). A window counted from the remittance advice's own date stays
unverified until PR 6c computes from `remittance.production_date`. The abstraction screen and the practice's version
screen show the cited rule beside the computed one ("ends 90 calendar days after the payment date") and whether they
match, the form defines each start, and the window's length is labelled and printed in the unit the quote states
("ends 6 months after the payment date", never "a 6-day window"); when they do not match, Verify is disabled with the
reason and approval stays open. While a window's rule is not computed, nothing is judged or stated from the end the
engine counts (calendar days, which may be earlier or later than the contract's): `TriageFacts.windowRuleComputed` is
false for CONTRACT_WINDOW_RULE_NOT_COMPUTED, so `judgeLine()` says neither WINDOW_PASSED nor NO_WINDOW (only
DEADLINE_UNVERIFIED), the report counts no such line as window-passed and leaves its `window_ends_on` empty (the audit
worksheet does the same), and its remedy says to keep the contract's own deadline. Medicare Advantage non-contracted deadlines
stay unverified until the specialist confirms the dispute route (golden QUESTIONS Q34): `ma_dispute_route_confirmed()`
returns false (a later migration replaces it), so no release window or reconsideration record verifies anything
(MA_ROUTE_UNCONFIRMED, exported by `@tp/triage` as `MA_DISPUTE_ROUTE_CONFIRMED`), no packet of a Medicare Advantage
non-contracted line is exported until then (a Medicare Advantage plan mapped to a contract is not held), and those
actionable totals drop; the packet's deadline, the Cases page and the specialist's regulations page say so with the
reason, and that the route is a product-wide question (golden question Q34) that the contract specialist is answering
and a later release of the product applies, with no step in a practice: until then the plan's own dispute policy is
worked outside the product. Lines under releases 900001 to 900004 keep RECORD_BELOW_LEVEL; 900005's L2
lines wait for the route. The engine's own window computation from the cited unit and start is PR 6c's freeze
exception, which widens `contract_window_rule_computed()`.

*Item #26: what the export job refused or failed, said at once and shown on the packet page.* `exportReadiness()`
(`apps/worker/src/packets/readiness.ts`) checks before anything is queued, and the job checks it again, giving every
reason that holds in this order: not_approved, not_current, outdated (tp-packet/1), case_changed (the version no
longer matches its case, or the case closed), not_case_level, window_passed (at the first dispute level, a line's
`window_ends_on` before the day), next_window_passed (above it, the window the reopening denial gave,
`payer_response.next_window_ends_on`, before the day: the deadline of the version's own level, whose words never
advise writing the lines off; as first built a level-2 export was judged by its lines' first-level windows),
pricing_not_current, deadline_unverified and inputs_differ. The web's export action refuses at once and lists
each reason with its fix, and the Export button shows only for a ready version. Every refusal or failure of the job is
an audit event of the version whose purpose is one code and which carries no words and no patient data:
`packet_export_refused` (the first readiness reason, or verifier_failed), written by the job in its own transaction,
and `packet_export_attempt_failed` (another try follows) or `packet_export_failed` (the last), written by the
handler's catch in a new transaction before the error is rethrown, with store_mismatch, render_failed, store_failed,
database_refused (23514 or 42501) or unexpected. `packet_export_refusal_codes()` and `packet_export_failure_codes()`
hold the lists the TypeScript exports, and `audit_event_packet_export_attempt` (BEFORE INSERT, for those three actions
only) refuses one in a person's name, on any login but the worker's own (`app_session_is_job()`), of anything but a
packet version of the event's practice, or with another code. A request (`packet_export_requested`, which the export
route records) is a person's: `audit_event_packet_export_requested` refuses one on the worker's login, for a non-person
actor or for anyone who may not export PHI in the practice, so the job cannot write a request that turns its own
refusal back into "in progress" (review reproduced that mask); `packet_version_export_attempt()` counts a person's
requests only. `packet_version_export_attempt()` (SECURITY DEFINER, the caller's scope kept, a row only for a person who drafts
packets or exports PHI in the practice) reads the latest attempt since the latest request: none, in progress, retrying,
refused or failed with its code, or exported. The packet page shows it: in progress as a live status refreshed about
every five seconds with a "Check again" link (and, after an hour with no result, as failed with `no_result`);
retrying; refused with the reason and its fix, or, once the version is ready again (its reason no longer holds, a
verifier failure excepted), as the earlier request's refusal with no fix to follow; failed (nothing was stored, ask
again, the operator was alerted). Where no one but the writer approves packets, the not_approved fix names the
single-user path (the writer approves alone after the 24-hour delay). The logs keep the error code only.

*Item #61: the packet builder's page.* The drafter sees an Approve button disabled with the reason ("a second person
who approves packets approves it; ask with Request approval", and once asked, with the form gone, "approval is
requested; a second person who approves packets approves it here") next to Request approval, and no working Approve form;
a blocked or waiting version shows the button disabled with its blocked text. A version is written through one form
(`components/packets/version-form.tsx`) holding the request keys, the hidden fields, the prompt-pay select, the
attachment checkboxes and the narrative once, with unique IDs, and its submit buttons: `save` and `code_draft`, named
`intent`, which the form's one write action routes, and `model_draft` only when the model may draft, sent to the
model's draft action by its own function `formAction` with no name (React names such a button for its action; a name
beside it was overridden and warned of, which the verification found), so no choice (the prompt-pay interest line
among them) is dropped by another button. The builder's header counts the lines its
actionable figure is over (`ACTIONABLE_NOW_LINES`, the figure's own predicate). Each wide table of the builder, the
review and the submissions pages scrolls in a named region a keyboard reaches (`ScrollTable`, axe's
scrollable-region-focusable), and the review and the abstraction pages do not scroll sideways at 390 px (the packets
and contracts journeys check it). The accessibility gate over every screen is PR 7's.

*What the builders built differently from the brief, as reported.* The pricing check (#4): `PricingNowPanel` takes
an optional `sent` flag and `label`, so the submissions page can show what a flagged submission sent beside the
pricing now, in a region of its own per submission; the version's total now says why none is stated (a line not
priced again yet, or one no longer priced); and the triage equivalence test judges Medicare Advantage lines from their
priced lines, since no SYNTHETIC Medicare Advantage line in the test locality is paid short enough to be a candidate.
The test matrix gains no row here: its rows are held word for word by `packages/synth`'s case registry, which this
pull request's builders do not edit, so the rows for these cases are added with the registry (the tests that assert
them are named under Consequences). The window (#5): `@tp/contracts` also exports `windowRuleEndsOn()`, the end each
unit and start gives for the screens (business days Monday to Friday with no holiday list, so the end shown is never
later than the contract's; months clamped to a shorter month's last day), which nothing prices with;
CONTRACT_WINDOW_DIFFERS also holds when the trace is not counted from the engine's own start (BPR16); and the specialist's
regulations page says why no Medicare Advantage deadline is verified yet.

**Safe with the previous image running: yes.** Every column is nullable or generated (adding the generated column
rewrites the small `packet_version` table under a brief ACCESS EXCLUSIVE lock; every existing row is tp-packet/1 and
becomes `unverified`), the CHECKs hold every existing row (no version has a cited window yet, and no submission has a
`pricing_check`), the functions and triggers are new (those on `pricing_run`, `contract_version`, `payer_plan_mapping`
and `rule_release_withdrawal` take only an advisory lock), and the replaced ones keep their signatures and accept
tp-packet/1, a version with no window citation and a report of a release not withdrawn as before. For the previous
image, its tp-packet/1 versions are written and approved but its export job exports nothing (its UPDATE carries no
tp-packet-verifier/2 report, which the guard refuses, so no copy of its own reaches a payer, and none goes out without a
contact), its submission service has no attestation check and sends the plain INSERT, which the database decides (an
attested export is logged as before; an export whose pricing went stale after the new image's job made it is logged sent
without sign-off, with its reason and its event, but without the person's confirmation and without its page showing
it; any other unattested export is refused) and flags, its approvals and exports of a version whose
pricing is not current are refused, its report job fails a report on a withdrawn release when it makes it ready, its
export job writes no attempt events (a refusal shows as in progress, then as failed with no result after an hour), its
export route records its requests in the person's name as before, its
contract screens cite a window without its unit and start, which the new CHECK refuses (the specialist cites again
under the new image), and its triage, which knows neither DEADLINE_UNVERIFIED, RELEASE_WITHDRAWN,
VERSION_NOT_IN_FORCE nor MAPPING_NOT_IN_FORCE, may open cases whose export the guard refuses: each is the approved outcome. Deploy order:
migrate first (ADR 0049).

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| D15 (b): a separate v0 export path | It would duplicate the milestone 8 packet's lines, citation, hashes and verifier; CO-05 is changes to it. |
| D16 (b): give the founder a practice membership | It changes the security program (internal users approve nothing, ADR 0041); the attestation reuses audit_report's tested pattern instead. |
| D17 (b): a person confirms each case's deadline | It verifies nothing a person signed off once for every line it governs; revisit if a payer's window cannot be cited at all. |
| D17 (c): any known source counts | A release's commercial_default and an L1 record would then "verify" a deadline nobody read; only (a) makes verified mean a signed-off source. |
| Regenerate release 900001 at L2 | Its manifest hash, which 110 golden claims pin, would change; a new release number keeps them. |
| Store the deadline status and trust it at export | A version's statement can go stale (a version superseded since, a release withdrawn, a denial that reopened the case); the guard derives it again from rows that cannot change underneath it, and the job states the version again from its inputs. |
| Verify the next level from the record of the release in force, whatever date it gives | The stored date was computed once, from the release in force when the denial was recorded; a later release at L2 would then "verify" a date an L1 record gave. Comparing the date the record gives with the stored one needs no new column. |
| A trigger that also checks the narrative's verifier report in SQL by re-running the verifier | The verifier is TypeScript (@tp/packets); SQL checks the report's shape, result and narrative hash, and the worker runs the verifier itself. |
| A `packet_export_download` table for the reviewer's downloads, as `audit_report_download` is for a report's | The owner asked for no new table unless unavoidable; `audit_event` already records every download, is append-only for every role and writes only in the transaction's own actor's name, so one trigger and two action codes make it the evidence. |
| The downloads as columns on `packet_version` (who downloaded each file, when) | A version's row is updated by several people; a column holds one downloader and can be written over, where the audit log keeps every download, by everyone, unchanged. |
| Bind the evidence to the reviewer's session (`user_session.token_sha256`) | The application role writes sessions too, so code on its login could write a session as well as the evidence; the worker's own login holds it against the worker without it, and against the web's process it adds nothing. |
| Tell a job from a person by `app.actor_id` alone, on the login the web and the worker shared (as first built for the ruling) | Every transaction sets `app.actor_id` for itself, so job code on that login set it to the reviewer's ID and wrote both download events and the attestation (review's reproduction, in `withJobScope()` itself); it did not meet the owner's condition that a compromised worker cannot forge the evidence. |
| Leave the worker's login to a later pull request and record F9 open against job code | The owner asked for the evidence to hold against a compromised worker before this pull request opens, naming the roles and grants (`tp_app` versus the job role) as where it holds. |
| A task role of the worker's own, beside the web's | The two would differ only in which login's secret each reads, and neither task needs to read one at run time (ECS injects them through each task's execution role), so the shared role reads none. |
| `pg_has_role(session_user, 'tp_job', ...)` without excepting superusers | A superuser is a member of every role, so the test harness's owner connection (the row factory's downloads and attestation) would be taken for a job; a superuser can disable any trigger anyway. |
| Refresh a case when a re-run is accepted or a release withdrawn, now (item #4) | That is PR 11's work with the daily monitor (refresh on accept, the withdrawal's fan-out to every practice, the sent-packet alert and the pattern-change rule, D30); until then the one check refuses every step on stale pricing and says so, which is accurate where a refresh built in haste could re-judge a sent packet. |
| Refuse a submission whose version's pricing is no longer current | A submission records what already went to the payer; refusing it would hide a real dispute from the follow-up and the ledger. The database flags it instead, and the page shows the figures sent beside the pricing now. |
| Store a pricing status on the version, as `deadline_verification_status` is stored | It would go stale the moment a re-run is accepted; the check is derived again at each step from rows that only move a run out of effect, add a withdrawal or close a version, so it fails closed. |
| Read the window's unit and start out of the quote (item #5) | A guessed parse would decide a dollar-bearing date; the specialist chooses both from fixed lists against the quote, and the screen shows the computed rule beside it. |
| Compute business-day, month or date-of-service windows now | It changes the engine's window calculation, PR 6c's freeze exception; until then such a window stays unverified and its lines wait rather than show a later date. |
| Verify Medicare Advantage deadlines from the L2 redetermination record | Q34 asks whether that route applies at all (MA payment disputes run through each plan's own policy), so a date from it could be wrong; `ma_dispute_route_confirmed()` stays false until the specialist confirms the route. |
| Keep "the remittance date" meaning BPR16 and define it so on the screen (item #5) | The lists would offer one date under two names, the payment date unverifiable while the remittance date verified the same BPR16; and contracts that count from the remittance advice's own date would verify with an end counted from the later payment. Naming BPR16 the payment date keeps every verified end no later than the contract's. The founder ruled so on 2026-10-20 (Owner rulings). |
| Attest a stale export with a flag of its own, so its submission is logged as attested | The attestation would say a reviewer signed off files that no longer show the pricing in effect. The founder ruled on 2026-10-20 that such a packet is never attested and its submission is recorded unattested with its reason (Owner rulings). |
| Log any unattested export the person says was sent | The attestation is the export's release (D16); one reason, decided by the database from the export's own record, admits an unattested submission, and every other still needs the attestation. |
| Serializable isolation for the steps that read the pricing (item #4) | A serialization failure surfaces as a retry the steps do not make, and every writer would need it too; two advisory locks taken in the triggers order exactly the writes that matter and nothing else. |
| Leave a mapping correction to the same contract current (item #4) | A correction says the mapping the line's trace names was wrong; the pricing in effect under the corrected mapping is not computed until a re-run, so the check holds the line as not current, as a correction of the contract version does. |
| An export attempts table (item #26) | The audit log already records each request; three coded actions and one trigger give every refusal and failure a durable, PHI-free record now. The optional table is PR 8's. |

## Consequences

- Actionable totals fall wherever a contract's window is uncited or a release window is below L2: every existing
  version and every synthetic release but 900005. AUDIT-01 would fall to zero without its evidence (a worksheet
  test shows it); with it, the report is unchanged. The specialist's queue gains citing and verifying each
  contract's window, and a corrected version is how an existing contract gains it.
- The Medicare Advantage lines priced under 900001 to 900004 stay DEADLINE_UNVERIFIED; a real release raises its
  Medicare windows to L2 through `/load-release`, and PR 9's E3 gate asks L3 of the same function.
- An export is refused in the worker and in SQL for an unverified deadline or a version of an earlier dispute
  level, and in the worker for a failed verifier or content its inputs do not give; SQL holds the verifier's
  report only to its shape, pass and narrative hash. Every submission names an attested export; the export hashes
  are the stored files' bytes.
- An attestation needs the attester's own downloads of both files of that version since its export (the owner's
  ruling of 2026-10-18), refused in the attest route's service and in SQL; the review page says so and keeps the
  attest button disabled until both are recorded. A download is now one audit event per file
  (`packet_export_pdf_downloaded`, `packet_export_csv_downloaded`); the export history lists them with the earlier
  `packet_export_downloaded`, and a download the previous image recorded during the rollout counts as no evidence, so
  the reviewer downloads again. A download route answers a GET alone (405 for a HEAD or any other method). F9 is
  closed against job code and a compromised worker once the worker runs on its own login; against a process holding
  the web's own login it is not, as against any other person-only step (What it does not hold against).
- The worker has a database login of its own (a sixth login and secret): `tp_worker_login` in AWS, with its own
  `WorkerLoginSecret` rotating as the others do, created by the migration task's login step from
  `TP_WORKER_LOGIN_USERNAME` and `TP_WORKER_LOGIN_PASSWORD`, a member of `tp_app` and of the marker `tp_job`; the
  worker task's `DATABASE_URL` is built from it instead of the application login, and the `WorkerLoginSecretArn`
  output names it. The task role the web and the worker share (ApplicationRole) no longer reads the application
  login's secret, which neither task read at run time. Locally `pnpm db:migrate --dev-login` creates `tp_worker_dev`,
  `pnpm dev` and the end-to-end worker connect as it, and the worker's database tests run every job on it
  (`MigratedDatabase.workerUrl`). The role bootstrap creates `tp_job` with the other roles, so the migrations find it.
  Its privileges are `tp_app`'s, so every job runs as before; only the two download actions and the attestation are
  refused on it, which no job writes. `withJobScope()` asks the database once more per transaction whether the job ID
  names a person.
- Contract disputes stop at level 1 until PR 8 (the owner's ruling of 2026-10-18). `contract_version.appeal_levels`
  carries no page, quote or hash, so the next level's deadline of every contract case a denial reopens is unverified
  (NEXT_LEVEL_UNCITED) and its packet is refused in the worker, the handler and SQL; a corrected version does not
  help, since no version can carry appeal-level evidence yet. PR 8 (the workbench schema) adds it: each appeal level
  with its document, page, quote and hash and a contract specialist's check, frozen by `contract_version_rules`, as
  the dispute window's is here; the next level's deadline is then verified from it. A Medicare Advantage case's
  second level is exported once the reconsideration record in force is at L2 and gives the stored end.
- D16 (a) for a practice with no other packet approver is not built here (the owner's ruling of 2026-10-18): it is
  left to the pull request that carries D27. The export still needs a practice approval (milestone 8's
  `packet_version_rules`). Where the drafter is the practice's only packet approver, the drafter still approves
  alone after 24 hours (`approved_alone`, CAS-10) and the reviewer's attestation is the only independent check of
  the export; a practice whose drafter is an analyst and that has no billing manager or firm principal cannot
  approve, so nothing is exported or attested. Every payer submission still waits for the reviewer's attestation,
  which is why the owner left it; until D27's pull request an `approved_alone` version is exported and attested, and
  the review page says it was approved alone.
- The checks that hold this: `packages/triage/src/deadline.test.ts` (properties over every source and level),
  `apps/worker/src/triage/deadline.db.test.ts` (SQL and TypeScript on the same lines),
  `packages/contracts/src/contracts.db.test.ts` (the window's evidence and its rules), the packet and export
  tests in `packages/packets` and `apps/worker/src/packets`, `tools/audit-worksheet` and
  `apps/web/src/lib/routes/audit-e2e.db.test.ts`, `tools/release/release.test.ts`, and the golden triage test's
  uncited window (G118), with `fixtures/golden` unchanged; for the downloads, `apps/worker/src/packets/packets.db.test.ts`
  (no download, only the PDF, only the CSV, another person's, another version's, a download whose hash failed and
  evidence written under a job's actor, each refused in the service and in SQL, and both of the attester's own
  allowed; on the worker's login, a job that sets `app.actor_id` to the reviewer writes no event, through raw SQL,
  after `SET ROLE tp_app` or through `downloadPacketExport()`, reads no evidence and cannot attest, and a job ID naming
  a person is refused on either login), `packages/db/src/authz/scope.test.ts` and `packages/db/src/migrate.test.ts`
  (the person refusal; the roles and grants), `apps/worker/src/deploy/logins.db.test.ts` (the worker's login: its
  memberships, `app_session_is_job()` true on it whatever role it sets, false on the application login),
  `infra/test` (the sixth secret and its rotation, the worker task's login, a task role reading no login),
  `apps/web/src/lib/http/http.test.ts` and `apps/web/src/lib/routes/workbench-routes.db.test.ts` (a HEAD refused
  before the route runs and recording nothing; the attest route refused until both review downloads) and
  `apps/web/e2e/packets.spec.ts` (the disabled button and its reason, both downloads, then the attestation, with the
  end-to-end worker on its own login).
- Item #4: once a re-run is accepted, a release withdrawn, a plan's mapping corrected, a contract version corrected or
  an amendment back-dated before a line's date, that line leaves the actionable figures at once (the Cases list, the case page, the dashboard
  and the audit report's triage), while the case keeps it and its stored total until PR 11 refreshes the case; its
  packet is neither written again, approved, exported nor attested, and the pages name the line, its cause and its
  figures then and now. A submission already sent is logged and flagged (`submission.pricing_check`). No audit report
  is requested, generated, attested or released on a withdrawn release. An acceptance, a completion, a version's
  supersession or closed window, a mapping correction or a withdrawal waits for an approval, an export, an
  attestation or a submission of the same practice in progress (a withdrawal, of any practice), and they for it.
- A submission sent without sign-off (the founder's ruling of 2026-10-20): an export whose pricing went stale after it
  was made and before its attestation is never attested, and if it already went to the payer it is logged unattested
  with its reason and flagged with the cause, so its follow-up, its responses and the ledger track the payer's answer
  as for any submission; the review, submissions and Reconciliation pages and the audit report show it as sent without
  sign-off. A version so logged is never attested and leaves the reviewer's list of exports waiting
  (`exportsAwaitingAttestation()`); a stale export not logged stays there, its review saying why it is never attested.
  Every other unattested export is still refused. The tests: `packages/db/src/pricing-check.db.test.ts`,
  `apps/worker/src/packets/unattested-submission.db.test.ts`, `apps/web/src/lib/routes/unattested-submission-routes.db.test.ts`,
  `apps/web/src/lib/packets/unattested.test.ts` and `apps/web/e2e/unattested.spec.ts` (its personas `unattested-manager`,
  `unattested-approver` and `unattested-reviewer`).
- Item #5: a window cited in business days or months, or counted from the date of service, the remittance advice's
  own date or its receipt, is approved unverified and its lines wait (CONTRACT_WINDOW_RULE_NOT_COMPUTED) until PR 6c
  computes it, with no end stated or judged for them. Most contracts word their window "of the remittance date"; such a
  window stays unverified until PR 6c, and only one counted from the payment (the check or EFT date) verifies now. No
  Medicare Advantage non-contracted deadline is verified and no such packet is exported until Q34 is answered, so
  Medicare Advantage actionable totals drop to zero until then; the screens say why.
- Item #26: every refusal or failure of the export job is an audit event with a code and no patient data, written
  only on the worker's own login, and the packet page shows the latest attempt since a person's latest request; a
  request that readiness refuses is refused before anything is queued. The web's route tests run the export job on
  the worker's login, as the worker's do.
- Item #61: the drafter never sees a working Approve button, and the builder's choices are one form's.
- The checks for the items: `packages/db/src/pricing-check.db.test.ts` (the CHECK lists equal the TypeScript lists,
  no grant on `submission.pricing_check`, EXECUTE to `tp_app` only, content that names nothing fails closed),
  `apps/worker/src/price/pricing-check.db.test.ts` (the pricing in effect equals `PRICED_IN_EFFECT`; a withdrawal;
  the figures then and now), `apps/worker/src/packets/pricing-current.db.test.ts` (an accepted re-run, a correction,
  a back-dated amendment and a withdrawn release each refuse the approval, the export request, the job, the guard and
  the attestation, name the stale lines when the version is written again, and flag a submission without refusing it),
  `apps/worker/src/triage/triage.db.test.ts` (the database's check against triage's reasons; a withdrawn release
  opens no case), `apps/worker/src/report/report.db.test.ts` (no report on a withdrawn release, in the job and in SQL),
  `apps/web/src/lib/routes/pricing-current-routes.db.test.ts` (the actionable figures, the review's figures then and
  now and its refused attestation, a flagged submission, and the report routes, through the routes),
  `packages/triage/src/actionable.test.ts`, `apps/worker/src/report/report.test.ts` and
  `apps/web/src/lib/packets/review.test.ts` (the words); for item #5, `packages/contracts/src/window-rule.test.ts`,
  `packages/contracts/src/contracts.db.test.ts`, `packages/triage/src/deadline.test.ts`,
  `apps/worker/src/triage/deadline.db.test.ts`, `apps/worker/src/packets/packets.db.test.ts`,
  `tools/audit-worksheet` and `apps/web/e2e/contracts.spec.ts`; for items #26 and #61,
  `apps/worker/src/packets/export-attempts.db.test.ts`, `apps/web/src/lib/routes/export-attempts-routes.db.test.ts` and
  `apps/web/e2e/packets.spec.ts`. The review fixes add `apps/worker/src/packets/pricing-race.db.test.ts` (an
  acceptance, a correction's sign-off, a mapping correction and a withdrawal held open across the export job, the
  attestation and a submission: each step waits, then refuses or flags), the mapping correction in
  `pricing-current.db.test.ts` and in the triage equivalence, `payer_plan_mapping_in_force()` against
  `mappingInForce()` in `apps/worker/src/price/pricing-check.db.test.ts`, the forged request and the web-login refusal
  in `export-attempts.db.test.ts`, the level-2 window in `packets.db.test.ts`, the months and business-days windows in
  `report.db.test.ts` and `deadline.db.test.ts`, and the phone-width checks in the packets and contracts journeys.
- `docs/product/domain-model.md` is regenerated at this migration (CO-02). The founder approved the schema as first
  summarised on 2026-10-18; the downloads and the job role (`tp_job`, `app_session_is_job()`), and the audit items'
  columns, checks, functions and triggers (the window's unit and start, `submission.pricing_check`, the pricing check,
  the export attempts, the unattested submission, the export guard's contact check), changed the text, and the
  founder approved the regenerated text, SHA-256 `6f72ea56563c379e05a601f3af019ad4ce3358f55cc02b06fcec17ea23d830a0`,
  on 2026-10-21 (Owner rulings (2026-10-21)). The founder writes the approval line; the build never does.

## Revisit when

A real release's Medicare dispute windows are read at L2 or L3 (the synthetic 900005 then stays a fixture only); a
payer's contract states its window in a form the specialist cannot cite on one page; PR 8 adds the packet's export
parts (`packet_export`) and the appeal levels' evidence, and PR 9 the E3 gates; a practice's own reviewer, rather
than the founder, attests; D27's pull request builds the single-user path and D16 (a) for a practice with no other
packet approver; the web's own process is to be held too (evidence only the reviewer's browser can give, such as a
signature over the bytes with a key the reviewer holds); or PR 11 invalidates the runs of a withdrawn release.

For the audit items: PR 11 refreshes a case when its re-run is accepted, fans a withdrawal out to every affected
practice, alerts on a packet already sent with a per-line difference and takes a line whose re-pricing changes its
pattern out of the case (item #4); PR 6c (the engine corrections the best-option audit inserts after PR 6b, under one
freeze exception) computes contract windows from the cited unit and start and picks the Medicare Advantage route from
the line's facts, widening `contract_window_rule_computed()`, and the specialist's answer to Q34 replaces
`ma_dispute_route_confirmed()` (item #5); PR 8 cites each plan's dispute policy on the Medicare Advantage mapping and
may add an export attempts table (items #5 and #26); and PR 7 runs the accessibility check after every page and form
(item #61).

## Audit item #37, part 1: the payer's copy (the founder's ruling of 2026-10-20)

Until this change one PDF served the payer and the internal audit: it printed the drafter's, approver's and contract
specialist's login emails, the specialist line, the audit flag, the evidence gaps, record IDs and SHA-256 values, the
deadline's verification level and status, the packet version number and a "computed by code" footer. The founder
adopted the combined audit in full on 2026-10-20, with #37 part 1 folded into this pull request before it merges, and
accepted the recommended answer to every question of its design (Q1 to Q6 below). The export now prints the payer's
copy only, and the internal record stays where it lives and is shown on the reviewer's review page.

- **D1. One export; the internal copy is a second output only in PR 12.** A stored internal manifest would need its own
  keys and a third hash in the attestation, whose CHECK holds exactly `format`, `checklist`, `pdf_sha256` and
  `csv_sha256`; PR 12 rebuilds the export with D26's tables anyway. Nothing is lost: the version's content, its
  approval columns and its regulation confirmation never change after approval, the audit log is append-only, and the
  review page renders all of it (the Internal record card).
- **D2. What the payer's copy prints** (`apps/worker/src/packets/html.ts`): the title and running header as before, the
  practice's name leading (ADR 0056); the cover's and identification's reference (`Reference <REF>`); the payer by its
  name with its identifier in words (`SYNTHETIC PAYER Q (payer ID SYNPAYERQ)`, an ERA export's payer, keyed by its name,
  by its name alone) and the plan by its name, or `plan identifier <id>` when no name is known, never in the
  remittance-key form the internal record and the review page keep (`2U:`, `CE:`; `payerAndPlanText()`,
  `packages/packets/src/payer.ts`; Verification fix (2026-10-21)); [1] the contract's
  title, version, effective dates and page with the quoted clause (no document ID or SHA-256) under "Contract citation",
  or the regulation under "Regulation cited"; [2]
  what the payment rules in effect supplied, by release (D14); the narrative alone in its block; the line schedule
  without the patient control number or trace reference, `Total` in its first cell; the dispute window's dates only
  (D2, Q3), with the contract's clause or the release's record; each line's window and how its expected amount is
  computed (above the first level the level's own window alone: no first-level clause, record or line window, in the
  PDF or the CSV; the version's content holds no clause for a later level's own window yet, since contract disputes stop
  at the first level until PR 8 carries each appeal level's page, quote and hash, and a Medicare Advantage
  reconsideration window waits for Q34; once one lands its clause is a source of that level and the copy prints it);
  every code of a closed list (a method, step, rounding rule or program) in words (`words.ts`), one without words
  refusing the copy as a print failure rather than printing it; an unrounded amount in the rounded one's form, grouped
  and signed, its fraction of a cent kept; interest (D9); the evidence by its labels; the requested action; and
  "Approved for submission by
  <practice> on <date>, reference <REF>." with "Correspondence about this dispute: <contact>." (D4 to D6). No login,
  approval time, specialist line, audit flag, evidence gap, status, verification, version number, trace reference or
  footer; a version without a stated last day is refused with a TypeError rather than printed.
- **D3. The CSV is the payer's too** (`csv.ts`): no `patient_control_number`, `trace_ref`, `deadline_status`,
  `deadline_source` or `trace_sha256` column; the method in the PDF's words; interest empty where code did not
  compute it. Both files take their words from one module (`words.ts`). Every row leads with the packet's reference,
  its first column `packet_reference` (the founder's ruling of 2026-10-21): the same reference (10 Crockford digits,
  D5) the PDF prints and the file names carry (D8), derived once by the export job and handed to both writers, so the
  schedule still matches its letter if a payer's portal drops the file's name. `packetCsv()` refuses a reference not
  in its printed form (a print failure), and the leak scan sets the reference aside as the copy's own, as it does the
  identifiers the copy prints.
- **D4. The approval line** names the version's own `content.practice.name` and the UTC calendar date of `approved_at`,
  as `prepared <as_of>` is; it reads the same for a single-user approval, whose audit flag stays internal.
- **D5. The reference** is `packetReference(approved_sha256)`: the first 50 bits of the approved version's SHA-256 as
  10 Crockford digits, a hyphen after the fifth (`packages/packets/src/reference.ts`). No storage, not PHI, not a
  UUID, never a hex run; nothing enforces uniqueness (about 4.4 × 10^-6 that two of one practice's 100,000 versions
  share one), so the lookup shows every match. Staff find a packet by the reference a payer quotes on Cases
  (`practice.cases.by_reference`, `packetVersionsByReference()`): typed in any case, without its hyphen, with O, I and
  L read as 0, 1 and 1, in the practice's own scope; a malformed reference is refused with its form. The reference is
  shown beside the version on the packet, review and submissions pages, and it names the files (D8).
- **D6. The correspondence contact** lives in `practice.settings.correspondence_contact`, set by the practice
  administrator alone (`practice.open` and the role `practice_admin`, as the proof level; the restrictive
  `practice_administrators_update` policy admits the UPDATE for the practice's administrators only). Its route
  (`practice.settings.set_correspondence`) is gated by `agreement.sign`, the permission only the practice
  administrator holds, as the proof level's is by `proof_level.set`, so the registry's persona tests and the setter
  agree; a permission of its own needs the schema (see "What later pull requests take"). A name or office
  and a 10-digit phone are required; the extension, an email and a full mailing address are optional; no other key;
  the name and the address lines hold no @, so the contact's email stays the one email printed.
  It is validated by the web's Zod schema and again by `correspondenceContactSetting()`, read back by
  `correspondenceContactOf()` (`set`, `missing` or `malformed`, never a default), read at export inside the export's
  transaction, and never logged: the setter's audit event `correspondence_contact_set` and the route's
  `correspondence_contact_saved` carry the practice's ID only. It cannot be cleared, only replaced; an export already
  made keeps the contact it was printed with (its PDF and SHA-256 are the record). The settings page is editable by
  the same rule (`canSetCorrespondence()`: `practice_admin` reached by ownership), and the overview's checklist gains
  the step. **The contact's email is the one email the payer's copy prints**: the audit's "no email" rule is about
  logins, and the contact is the practice's chosen correspondence address.
- **D7. No export without a contact, refused at every step as one coded reason (Q6 (a)).** `contact_missing` is
  readiness reason 11, after `inputs_differ`; `PACKET_EXPORT_REFUSALS` and `packet_export_refusal_codes()` hold it
  between `inputs_differ` and `verifier_failed` (this pull request's unmerged migration, its one function body
  changed for #37). The packet page shows the reason and a disabled Export button whose description names Settings,
  Correspondence; the web's request and `requestPacketExport()` refuse before anything is queued; the job records
  `packet_export_refused` with purpose `contact_missing`, logs `PACKET_CORRESPONDENCE_CONTACT_MISSING`, returns
  rather than throws (never retried), and reads the contact again before any narrative is decrypted, refusing alike
  if a concurrent change unset it. The export guard holds it in SQL too (review of 2026-10-21): it refuses an export
  whose practice holds no contact object with a non-blank name and a 10-digit North American phone, the two fields
  Q1 (a) requires, so no code on the worker's login exports a copy without one; the job's `correspondenceContactOf()`
  reads the whole contact.
- **D8. File names carry the reference**: `payment-dispute-<REF>.pdf` and `payment-dispute-<REF>-schedule.csv` on the
  four download routes, where they were `packet-<versionId>.pdf` and `packet-schedule-<versionId>.csv`; the CSV's rows
  carry it too (D3).
- **D9. Interest states only what code computed (Q4 (a)).** The rule sentence ("State <ST>[, <statute>]: payment due <N>
  <basis> days after the payer received the claim[, interest at <R>% a year] (release <n>).") and its exclusions, in words (`INTEREST_EXCLUSION_TEXT`: "self-funded ERISA plans", never the release's code); the
  `Interest by line` table lists only the lines whose interest was computed, totalled as "Interest stated in this
  request: $X"; with none computed the rule prints alone, and with no rule on file the section reads "Prompt-pay
  interest is not stated in this request." "cannot be computed", "can be computed" and "in all" are never printed.
  $0.00 is not stated either (`lineInterestStated()`, `interestStated()`; review of 2026-10-21): a line paid on time,
  with the version dated before its due date, computes $0.00 while interest on its unpaid shortfall keeps accruing after
  the due date, so it is neither listed nor totalled, and the requested action, the draft and the CSV say nothing of it;
  printed and demanded, $0.00 would read as the practice stating no interest. Counsel's review of Q4 covers this case.
  `draftNarrative()` writes no interest sentence when no line computed it, and [4] stays printed whenever the version
  states interest, so a narrative citing it names a printed section.
- **D10. The reviewer's checklist is the founder's seven items (Q5 (a))**: `figures` (now covering the practice's
  correspondence contact, printed as set), `deadline` (shown on the review page; the payer's files state the window's
  end and, at the first level, the clause or record behind it, not its verification), `calculation` (each trace's SHA-256 on the review page), `identifiers`,
  `payer_copy` (new: the files are fit to send to the payer; the PDF closes with the approval line, the reference and
  the contact, the CSV is its line schedule, its file named by the reference, and neither carries a login, record ID,
  SHA-256 or internal note), `files` and `independent`. Review of 2026-10-21 found the design's wording of `payer_copy`
  (the CSV naming the practice, the approval line, the reference and the contact, which it does not) and of `deadline`
  (the files stating the window's clause, which they do not above the first level) untrue, so both say what each file
  carries; the founder confirmed that wording as written on 2026-10-21 (Owner rulings (2026-10-21)), and it stays true
  with the CSV's `packet_reference` column: the CSV is still the line schedule, its file named by the reference. The
  review page shows an attestation's items by the codes it records, in the checklist's wording today, and says so. The attest action's Zod schema builds its
  `confirm_<id>` fields from the checklist, so a form missing any box is refused before the service runs and the list
  and the schema cannot drift. The attestation CHECK accepts any code, so no schema change.
- **D11 to D13.** The verifier's inputs do not change (the same narrative, content and identifiers), so its report
  and the export guard hold; the payer's copy prints exactly the narrative the export's verifier passed, and nothing
  else in its block (tested over the HTML and over the printed PDF's text). A narrative states only what the copy prints
  beside it: above the first level the lines' first-level windows and the clause behind them are no figure of it, and
  interest is one only where stated (above $0.00). The job hashes the exact bytes it prints
  and the attestation binds them, so it binds the files the payer receives. The renderer gets no login and no hash
  (`PayerCopy`: the approval's date, the reference, the contact); the job no longer reads `packet_version_people()`.
- **D14. Record numbers stay printed.** `release <n>` and `contract version <n>` are PaidWhole's own record numbers, and
  narratives cite them as facts the verifier holds them to; #38's worksheet and PR 12 replace them with CMS's own terms
  (year, locality). [2] names the Medicare fee schedule only when the release supplied one: a regulation, a
  `PERCENT_OF_MEDICARE` contract, or a `LESSER_OF` contract whose schedule is a percentage of Medicare; otherwise
  "Payment rules in effect for the service dates". A rule release's evidence item reads as [2] does.

The founder's answers (2026-10-20), each the design's recommendation:

- **Q1 (a).** A name or office and a phone are required; extension, email and address optional; no export until it is
  set; the contact's email the only email printed. Gives up: some packets give the examiner only a phone in writing.
- **Q2 (a).** The patient control number is dropped from the payer's PDF and CSV now, and `writePacketVersion()` refuses
  a narrative holding a `{{patient_control_number:<n>}}` placeholder (`narrative_withheld_identifier`); versions are
  immutable, so the write is the one place to hold it. PR 12 adds the patient account number back only where a
  route's form requires it.
- **Q3 (a).** The copy states only the dates code knows ("The earliest dispute window among the listed lines ends on
  <date>.", or "The window for dispute level <n> ends on <date>."), never that the dispute is timely: the practice sends
  the packet after it is printed, and the product cannot see the day the payer receives it.
- **Q4 (a).** Interest only where code computed it, "Interest stated in this request: $X", nothing said of the other
  lines (D9), so the letter never reads as waiving interest a statute owes; the practice can still claim it later.
- **Q5 (a).** The seven-item checklist as worded in D10.
- **Q6 (a).** `contact_missing` as a coded refusal, one SQL function body changed in this pull request's own unmerged
  migration, confirmed with the rest of PR 5 by the domain model's new hash (CO-02).

Counsel confirms Q3's and Q4's sentences before the first real packet is sent (the founder's decisions of 2026-10-20,
"Also noted").

**The model's prompt and input keep their wording until PR 12 (CO-06).** `draftNarrative()` and the MOD-03 reference
set (`packages/synth/src/eval/narrative-set.ts`) now say nothing of interest no line computed, and name a regulation's
amount by "the Medicare fee schedule in effect for those service dates (release <n>)"; MOD-03 is regenerated and the
local `draftPacketNarrative` baseline re-recorded with the eval CLI's `--record`, which changes only its set SHA-256.
The prompt `draft-packet-narrative/1` and its input (`interest.computed`) are unchanged: a prompt change is a new prompt
version with its own recorded evaluation (ADR 0054). The narrative stays the person's or the model's words; the
verifier checks its figures, not its vocabulary, the approver reads it, and the reviewer's `payer_copy` item covers it.

**What later pull requests take.** PR 8: the 835 payee's name, TIN (sealed) and address, remark codes, the contract's
legal-entity TIN, and the route's payer address, form and required fields (part 2); a CHECK on the contact's shape and,
if billing managers should set it, a `correspondence.set` permission with a definer setter can join PR 6b's settings
change. PR 9: the check (gate 7 reads the route; part 4). PR 12: the payer set and the internal manifest as two
outputs from one frozen version, the cover letter, the per-claim schedule in payer terms, page images and a remittance
excerpt, D26's scoped exports, the narrative's wording and the model prompt's words and input under CO-06, CMS terms in
place of release numbers (with #38), which contact and which template printed an export, and a practice time zone for
the approval and `prepared` dates (UTC now: an approval after 7 or 8 p.m. in US time zones prints the next day).

## Review fixes (2026-10-20)

Review of the folded-in items found, and this pull request fixes: the mapping cause (item #4); the pricing check's
race with the writes that make pricing stale (item #4); the computed window's start named for what BPR16 is, the
payment date (item #5, two reviewers); no end judged or stated for a window the engine counts by another rule than the
contract's, and its length labelled in its own unit (item #5); a later level's export judged by the next level's
window (item #26); the export attempt channel closed to the job's own requests and to the web's login (item #26);
"or wait" removed from every remedy (item #4); the submissions page's waiting line for an export that will never be
attested; "Medicare Advantage non-contracted" in every sentence about the route, and the route named a product-wide
question; the drafter's text once approval is requested and the single-user not_approved text; an earlier refusal
whose reason no longer holds; the write that said "nothing changed" on stale pricing; the builder's line count; the
focusable table scrollers and the review page's width at 390 px; and the withdrawn-release banner of an attested or
released report.

Open for the founder then, and ruled on 2026-10-20 (Owner rulings (2026-10-20)):

- **A stale export already sent before its attestation.** If a release is withdrawn, a re-run accepted or a mapping
  or version corrected after the export but before the attestation, the attestation is refused for good and so is the
  submission, which needs an attested export. If the downloaded export already went to the payer, the dispute cannot
  be logged; the submissions page now says the export will not be attested and not to send it, and to tell support if
  it went. How such a submission is logged and flagged (an unattested submission record, or the attestation of a
  stale export with its own flag) is the founder's call; nothing logs it now.
- **What "the remittance date" means.** The build names BPR16 the payment date and treats the remittance date as the
  advice's own date, which nothing verifies until PR 6c; the founder may instead rule that "the remittance date" means
  BPR16, in which case the lists stop offering both and the screen says which date is counted.

## Review fixes (2026-10-21)

Review of the round that built #37 part 1 and the submission sent without sign-off found, and this pull request fixes:
a REPEATABLE READ or SERIALIZABLE session read past the pricing lock (now refused, as the Decision says); a re-price
committed between the submissions page and the INSERT could log a submission sent without sign-off unconfirmed (now
rolled back); the worker's own login could log a submission of an attested export in a person's name
(`submission_belongs()`, replaced in this pull request's unmerged migration, refuses that login as the attestation and
the record of a submission sent without sign-off already did); the migration header's and this ADR's account of the
previous image (its export job exports nothing; its submission service sends the plain INSERT); the stale export's
steps in an order that, followed, closed the case before the export already sent could be logged (now "log it first",
the replaced export still offered, and the closed case's remedy); "Re-price: done already" chosen from the version's
worst cause rather than each line's; the reviewer's list showing a never-attested export as work waiting; the payer's
copy printing a prompt-pay exclusion as its code (now in words, `INTEREST_EXCLUSION_TEXT`, on the review page too),
stating the first level's windows and clauses under a level-2 window (now the level's own window alone, with no
per-line window in the PDF or the CSV), and printing an unrounded amount ungrouped beside its rounded one
(`formatUnroundedUsd()`); the leak scan, which now also refuses anything shaped like a code outside the narrative, the
quoted clauses and the CSV's header, over every route through the renderer and every contact a practice may set; an @
in the contact's name or address lines, refused so the contact's email stays the one email printed; and wording (a
missing contact said three times under a destructive alert, a malformed contact called missing, "your practice
administrator" to people who have none, the reference's letters, and the Reports screen without the PDF's sentence on
submissions sent without sign-off). Tests: the isolation refusal, the CTE that forges the record in the same statement,
the worker's login, a re-price and a withdrawal held open together while such a submission is logged, the
confirmation read against the INSERT, and the steps followed in their stated order through the routes and the browser.

## Review fixes (2026-10-21, second round)

The second review of 2026-10-21 (three reviewers, at `73b7f2d` and the four local commits after it) found, and this
pull request fixes: a narrative at a later level could still state the lines' first-level windows and their clause,
which the copy no longer prints (the verifier's facts now leave them out there); a code of a closed list without its
words printed lower-cased, which no scan could tell from prose (now refused, and `words.test.ts` holds every method,
rounding rule, engine step and program to its words); $0.00 interest stated, totalled and demanded; a regulation cited
under "Contract citation"; the leak scan's routes (the methods of T9 with every step, a release record of no program, a
window of no stated days, a contract's end date and a plan's name, and DB1 over an export that computes interest); the
export guard's missing contact check (D7); the checklist's and the screens' claim that the CSV carries the approval
line, the reference and the contact (D10); the confirmation box's claim that the export went after its pricing went
stale (it went without sign-off, whenever it went); the review page asking for both downloads and promising an
attestation of an export it says is never attested (now "Not attested", no download asked for, and the Approved alone
alert promising nothing); the line trace's `remittance_date` without the founder's reading (now glossed as the payment
date); the case timeline showing a submission sent without sign-off like an attested one; the submission log's bare
"Reference" beside the packet's reference; an attested review showing today's checklist as if attested (now the
attestation's own codes, today's words, said so); the ZIP field's digits-only keypad (ZIP+4 as nine digits is stored
hyphenated); and the settings and by-reference pages on no layout check. Tests: the facts at a later level and of
$0.00 interest, the words lists, the guard's contact check in SQL, the report's count gathered from the database on the
case it belongs to, and the new pages at 1280 and 390 px.

Named, not changed: **an export the previous image made before the export guard, whose pricing went stale since, can be
neither attested nor logged.** `packet_version_unattested_reason()` needs the guard's `export_verifier_report` to know
the pricing was current at the export, and the attestation refuses stale pricing, so such an export's submission is
never logged and reconciliation cannot track the payer's answer to it. The submissions page says so and to tell
support. No production export exists (PR 5 is unmerged); whether a staging environment holds such an export that was
sent, and the remedy if one does, were open for the founder, who ruled on 2026-10-21 that no remedy is needed (Owner
rulings (2026-10-21)).

## Review fixes (2026-10-21, third round)

The review of `921b6ca` found, and this pull request fixes: the Reconciliation screen read its case lines and their
stages first and its totals last, at READ COMMITTED, where each statement takes its own snapshot. The reconcile writes
the entries, the matches and the lines' stages in one transaction, so the database never holds a deposited figure
beside a line still at payer_approved, but a reconcile that committed between those reads gave one render of both:
"Deposited $30.00" beside a line reading Payer approved, or after a recoupment, "Recovered $12.00" beside a line still
Recovered. That was the reconciliation journey's flake, which the second round put down to the worker. The
Reconciliation screen, the specialist's ledger page, the case page and the practice dashboard, each showing the
ledger's figures beside the stages and entries they come from, now read in one snapshot (amending ADR 0043's
screens): a page route that sets `oneSnapshot` opens its transaction at REPEATABLE READ (`withPracticeScope`), its
only writes its audit events; a mutation that asks for it is refused at definition, since it writes at READ COMMITTED,
where the pricing locks hold; and `reconciliation()` refuses a scope that reads statement by statement. The journey's
separate wait for the line's stage is gone: each step waits for its figure, and every assertion after it reads the
same consistent render. Also fixed: the packet page's Export card and the review page's "Payer's copy" card now say
that each CSV row is led by the reference; a code comment no longer calls the CSV the line schedule alone;
reconciliation-001's record of the 2026-10-18 rulings says the domain model's text was approved on 2026-10-21; the
rulings of 2026-10-21 stand apart from the build's notes on them; and the reference is counted as 10 Crockford digits
(D5), not 10 characters. Tests: the Reconciliation screen read while the recoupment's reconcile commits after its case
lines (at READ COMMITTED it shows recovered of 12.00 beside the line still Recovered, and fails), the refusal of a
statement-by-statement read, the transaction's isolation, and the definition's refusal of a mutation asking for one
snapshot.

## Verification fix (2026-10-21)

The verification of `7618f1d` in a fresh clone found the payer's PDF printing the payer and the plan in their
remittance-key form, "SYNTHETIC PAYER Q (2U:SYNPAYERQ), plan CE:SYNPLAN-FIX-ONE", against #37 part 1 (the payer's copy
carries no internal detail): `2U:` and `CE:` are X12 qualifier codes the loaders write into the record's keys
(`payer.payer_id_raw`, `plan.plan_key`), not anything the payer's examiner reads. This pull request fixes it:

- The copy names the payer by its name with its identifier in words ("SYNTHETIC PAYER Q (payer ID SYNPAYERQ)"), a payer
  an ERA export keys by its name (`NAME:<payer>`) by its name alone, and the plan by its name, or "plan identifier
  SYNPLAN-FIX-ONE" when no name is known, in the identification ("To: ...") and on the cover ("To ..."): one function,
  `payerAndPlanText()` (`packages/packets/src/payer.ts`), over every key form the loaders write (`2U:`, `XV:` and
  `TRN03:` payers, `CE:` and `CLP06:` plans, an ERA export's `NAME:` and `PLAN:`). The CSV prints neither. The internal
  record, the review page and the mapping screens keep the key form. Record numbers stay printed (D14).
- A narrative states only what the copy prints beside it (D11 to D13), so the verifier's facts quote the plan as the
  copy names it (its name, or its identifier without the qualifier) where they quoted its key: a narrative citing
  "CE:SYNPLAN-63" now fails the verifier, and one citing "SYNPLAN-63" for a plan with no name passes.
- The leak scan also finds a payer part in its key form: the content's own payer and plan keys anywhere in a copy, the
  narrative too (matched across a printed line's end), and, outside the narrative and the quoted clauses, any
  identifier led by a qualifier code (two characters and a colon, or the loaders' `TRN03:`, `CLP06:`, `NAME:` and
  `PLAN:`), over every route it already covered: each version T1 prints with each contact, in the HTML and the CSV,
  T1's routes now with an `XV:` payer and a `CLP06:` plan, a `TRN03:` payer and a named plan, and an ERA export's payer
  and plan; the printed PDF (T5); and the export job's HTML, printed PDF and stored CSV (DB1). T10 pins the printed
  words for each key form; the packet journey checks the downloaded PDF and CSV for them.

No schema or domain-model change. Named, not changed: a plan the remittance identifies only by its claim filing
indicator (`CLP06:`, no REF CE) prints as "plan identifier 12", the code as sent; printing the indicator in words
("Preferred Provider Organization") would be the copy's words for an X12 code list, left for the founder. A person
may still type a key form holding no digit ("CE:SYNPLAN-FIX-ONE") into a narrative, which the verifier, reading
figures, does not refuse; no draft holds one, since `draftNarrative()` and the model are given no key.

## Owner rulings (2026-10-21)

The founder, Tyler Williams, ruled on this pull request on 2026-10-21:

- **The domain model's text is approved.** The founder approved the text of `docs/product/domain-model.md` as
  regenerated from a fresh PostgreSQL 18 database at `20261103090000`, its SHA-256
  `6f72ea56563c379e05a601f3af019ad4ce3358f55cc02b06fcec17ea23d830a0` (every line but the approval line and the
  provenance line, CO-02), and adds the approval line with a commit of their own.
- **The reviewer's checklist wording is confirmed as written.** The seven items of D10, `payer_copy` and `deadline` in
  the words review of 2026-10-21 gave them (`PACKET_CHECKLIST`, `apps/web/src/lib/packets/review.ts`), unchanged.
- **The CSV carries the packet's reference on every row** (a D3 change). The payer's CSV schedule leads each row with
  a `packet_reference` column holding the same reference (10 Crockford digits, D5) the PDF prints and the file names
  carry, so the schedule still matches its letter if a payer's portal drops the file's name.
- **No remedy for an export made before the guard whose pricing went stale since.** No environment has sent a real
  export, so no such export has reached a payer, and no remedy is built.

What the build holds against these rulings (a build note of 2026-10-21, not a ruling):

- The approved text holds what the rulings of 2026-10-18 and 2026-10-20 left to the domain model's new hash: the
  reviewer's downloads, the worker's own login (`tp_job`), the audit items' columns, checks, functions and triggers,
  `contact_missing` in the refusal codes and the export guard (Q6 (a)), and the unattested submission. Nothing built
  after the approval touches the document, its approval line, `approvers.json` or a migration.
- The CSV is built as D3 now says: the export job derives the reference once from the approved SHA-256 and hands it to
  the PDF and the CSV writer; the unit tests pin the column first and the reference on every row of every version the
  leak scan prints, the export job's database tests read the header and the reference on each row of the stored
  schedule, the packet journey on each row of the downloaded one, and the leak scan sets it aside as the copy's own.
  No schema change: the reference is derived, never stored. The checklist's `payer_copy` item names the CSV as the
  line schedule, its file named by the reference, which stays true, so its confirmed wording stands; the packet page's
  Export card and the review page's "Payer's copy" card say that each row is led by the reference.
- Review fixes (2026-10-21, second round) named such an export as one that can be neither attested nor logged. The
  submissions page keeps its words for the case, and every export the guard admits stores the
  `export_verifier_report` that lets its submission be logged unattested if its pricing goes stale after it.

## Owner rulings (2026-10-20)

The founder, Tyler Williams, ruled on this pull request on 2026-10-20:

- **Audit item #37, part 1: the payer's copy.** The founder accepted the recommended answer to every question of the
  design (Q1 to Q6): a name or office and a phone as the required correspondence contact, its email the only email
  the payer's copy prints (Q1 (a)); the patient control number dropped from the payer's PDF and CSV and refused in a
  narrative (Q2 (a)); only the dates code knows, no timeliness claim (Q3 (a)); interest only where code computed it,
  "Interest stated in this request: $X" (Q4 (a)); the seven-item checklist (Q5 (a)); and `contact_missing` as a coded
  refusal in this pull request's unmerged migration (Q6 (a)). Built as "Audit item #37, part 1: the payer's copy"
  says; counsel confirms Q3's and Q4's sentences before the first real packet is sent.
- **A stale export sent before its attestation is logged unattested, with its reason.** When a version's pricing goes
  stale after its export and before its attestation, the attestation stays refused, and a submission of that export
  can still be logged, recorded truthfully as unattested with its reason ("sent without sign-off: pricing went stale
  after export"), so reconciliation tracks the payer's answer. The packet is never attested. The submission's
  `pricing_check` flag still records the cause. Only that reason allows an unattested submission; every other
  submission still requires the attestation. Built as the Decision's "A submission sent without sign-off" says, in
  this pull request's unmerged migration (`submission.unattested_reason`, `packet_version_unattested_reason()`, the
  audit event `submission_logged_unattested`), which the founder confirms with the domain model's new hash (CO-02).
  This answers the first question the review fixes left open.
- **"The remittance date" is the remittance advice's own date.** A contract window measured from the remittance date
  runs from the remittance advice's own date (the 835's DTM*405 production date, or the date printed on a paper
  remittance), not the payment date (BPR16, the check's issue date or the EFT's effective date). Such windows stay
  unverified until PR 6c computes that date, so their lines wait (CONTRACT_WINDOW_RULE_NOT_COMPUTED) and no end is
  stated or judged for them; only a window counted from the payment date verifies now. The build already said so, and
  says so in code and copy: `contract_window_rule_computed()` and its comment in the migration, `DISPUTE_WINDOW_STARTS`
  (`packages/db/src/schema/contracts.ts`), `DISPUTE_WINDOW_START_DEFINITION` and `COMPUTED_CONTRACT_WINDOW_RULE`
  (`packages/contracts/src/window-rule.ts`), `@tp/triage`'s `COMPUTED_CONTRACT_WINDOW`, the abstraction screen's
  definitions of each start and its "not verified" line, and the e2e contracts journey, which cites "within 120 days
  of the remittance date" from the remittance date and finds it unverified. The engine's trace still labels BPR16
  `remittance_date` (`packages/pricing`, frozen until PR 6c); the line page and the journeys' setup now call that
  date the payment date, and the line page's trace says beside the claim facts and the dispute window step that the
  engine's `remittance_date` is the payment date, not the remittance advice's own date. This answers the second
  question the review fixes left open; the lists keep both dates.

## Owner rulings (2026-10-18)

The founder, Tyler Williams, ruled on this pull request on 2026-10-18:

- **The schema is approved, with one addition before the pull request opens.** The PR 5 schema (migration
  `20261103090000_deadline_verification_and_export_attestation`) is approved as summarised. The addition, in the
  founder's words: "the reimbursement reviewer may attest an export only after downloading BOTH its PDF and its CSV,
  each download having passed its fingerprint check (the bytes read from storage hash to the version's stored
  export_sha256 / export_csv_sha256). This closes ADR 0061's residual risk F9 (a job-scope write of a forged passing
  report and forged hashes would pass the SQL guard, and the attestation compares only stored hashes). It must hold
  in the attest route handler AND in Postgres (CLAUDE.md: never rely on one layer), and the evidence of a download
  must be something a compromised worker (the job-scope role) cannot forge for the reviewer: bind it to the
  reviewer's own actor in the web request that served the file, after the hash check, written in a way the job role
  cannot write (check the roles and grants: tp_app versus the job role, SET LOCAL app.actor_id, audit_event's
  append-only rules)." The founder preferred extending this pull request's unmerged migration over a second one and
  no new table unless unavoidable; asked that the download be the reviewer's, of this exact version, after its
  export, of both kinds, with fresh downloads for a re-export; and asked that the review screen tell the reviewer to
  download both files first and the attest button say why it is disabled until then.

  What the build holds against that condition (a build note of 2026-10-18, not a ruling): when the ruling came there
  was no job role. The web and the worker shared one login, and the evidence as first built was told apart only by
  `app.actor_id`, which job code could set to the reviewer's ID (review reproduced it through `withJobScope()`), so a
  compromised worker could forge it. The worker now has a login of its own, a member of `tp_app` and of the marker
  role `tp_job`, and the evidence trigger and the attestation rules refuse that login by `session_user`, which job
  code cannot change (Decision, the reviewer's downloads). So the condition holds against a compromised worker once
  the worker runs on that login, and F9 is closed to that extent; it stays open against a process holding the web's
  own application login (What it does not hold against). This adds a sixth login and secret and changes the worker
  task's login and the shared task role (Consequences), beyond the migration the founder approved: the founder
  confirms it with the domain model's new hash (CO-02), approved on 2026-10-21 (Owner rulings (2026-10-21)). No
  table is added.
- **D16 (a) for a practice with no other packet approver is not built here.** The analyst-only and lone billing
  manager cases are left to the pull request that carries D27 (the founder named PR 10 "or wherever D27's work
  lands"; reconciliation-001 lists D27 under PR 9 and PR 14), since the reviewer's attestation already blocks every
  payer submission.
- **Appeal-level evidence for contract disputes lands in PR 8.** `contract_version.appeal_levels` with a page,
  quote and hash and a contract specialist's check, like the dispute window, is part of PR 8 (the workbench schema),
  not this pull request. Until then contract disputes stop at level 1: the next level's deadline is
  NEXT_LEVEL_UNCITED and its packet is not exported.
- **The best-option audit's items #4, #5, #26 and #61 are folded into this pull request before it merges.** The
  founder approved on 2026-10-18 building each item's "PR 5 before merge" part here: one database check of whether a
  version's pricing is still current, enforced at approval, the export request, the export job, the export guard and
  the attestation, never refusing a submission that already happened (flagged instead), with the figures then and now,
  honest copy, a triage reason that drops actionable totals on a withdrawal and no audit report on a withdrawn
  release (#4); the window citation's unit and start from fixed lists, verification only of the rule the product
  computes, the computed rule beside the quote, and Medicare Advantage deadlines unverified until the specialist
  confirms the route under Q34 (#5); the export's refusals and failures checked before queuing where they can be,
  recorded as coded events and shown on the packet page (#26); and the drafter's disabled Approve button with its
  reason and one form for the builder (#61, the page). The parts the items give to PR 6c, PR 7, PR 8 and PR 11 stay
  there. The founder's standing rule of the same day: choose the best option for accuracy, quality, user experience,
  security, compliance and dispute success, never weighted by build effort. This extends the migration the founder
  approved, so the domain model's new SHA-256 waits for the founder's confirmation (CO-02), given on 2026-10-21 (Owner
  rulings (2026-10-21)).
