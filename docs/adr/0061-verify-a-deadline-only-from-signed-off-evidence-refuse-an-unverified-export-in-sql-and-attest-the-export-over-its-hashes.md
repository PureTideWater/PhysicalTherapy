# 0061. Verify a deadline only from signed-off evidence, refuse an unverified export in SQL, and attest the export over its hashes

- **Status:** accepted
- **Date:** 2026-10-18
- **Deciders:** the owner (D15 option a, D16 options a and c, D17 option a, in `docs/product/reconciliation-001.md`, approved 2026-10-17; the schema approved, the reviewer's downloads added and D16 (a) without a practice approver and contract appeal-level evidence placed in later pull requests, 2026-10-18, see Owner rulings); the build (PR 5 of Change Order 001)
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
  content was wrong, though runs pinned to it stay in effect until PR 11 invalidates them;
- a contract window is verified when the version is signed off, its window cited with complete evidence and
  verified by a contract specialist, and its days the trace's length in days (otherwise
  CONTRACT_WINDOW_UNCITED, CONTRACT_WINDOW_UNVERIFIED, CONTRACT_VERSION_NOT_SIGNED_OFF or
  CONTRACT_WINDOW_DIFFERS, in that order);
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
approval, and the version's status is read at export).

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

**Safe with the previous image running: yes.** Every column is nullable or generated (adding the generated column
rewrites the small `packet_version` table under a brief ACCESS EXCLUSIVE lock; every existing row is tp-packet/1 and
becomes `unverified`), the functions are new, and the replaced ones keep their signatures and accept tp-packet/1 and
a version with no window citation as before. For the previous image, its tp-packet/1 versions are written and
approved but their export is refused, its submissions of unattested exports are refused, and its triage, which does
not know DEADLINE_UNVERIFIED, may open cases whose export the guard refuses: each is the approved outcome. Deploy
order: migrate first (ADR 0049).

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
- `docs/product/domain-model.md` is regenerated at this migration and waits for the founder's approval (CO-02). The
  founder approved the schema as first summarised on 2026-10-18; the downloads and the job role (`tp_job`,
  `app_session_is_job()`) change the text, so its new SHA-256 waits for the founder's confirmation.

## Revisit when

A real release's Medicare dispute windows are read at L2 or L3 (the synthetic 900005 then stays a fixture only); a
payer's contract states its window in a form the specialist cannot cite on one page; PR 8 adds the packet's export
parts (`packet_export`) and the appeal levels' evidence, and PR 9 the E3 gates; a practice's own reviewer, rather
than the founder, attests; D27's pull request builds the single-user path and D16 (a) for a practice with no other
packet approver; the web's own process is to be held too (evidence only the reviewer's browser can give, such as a
signature over the bytes with a key the reviewer holds); or PR 11 invalidates the runs of a withdrawn release.

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
  confirms it with the domain model's new hash, which waits for the founder (CO-02). No table is added.
- **D16 (a) for a practice with no other packet approver is not built here.** The analyst-only and lone billing
  manager cases are left to the pull request that carries D27 (the founder named PR 10 "or wherever D27's work
  lands"; reconciliation-001 lists D27 under PR 9 and PR 14), since the reviewer's attestation already blocks every
  payer submission.
- **Appeal-level evidence for contract disputes lands in PR 8.** `contract_version.appeal_levels` with a page,
  quote and hash and a contract specialist's check, like the dispute window, is part of PR 8 (the workbench schema),
  not this pull request. Until then contract disputes stop at level 1: the next level's deadline is
  NEXT_LEVEL_UNCITED and its packet is not exported.
