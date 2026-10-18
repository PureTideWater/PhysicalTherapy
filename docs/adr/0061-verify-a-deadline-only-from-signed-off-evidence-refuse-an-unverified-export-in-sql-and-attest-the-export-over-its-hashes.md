# 0061. Verify a deadline only from signed-off evidence, refuse an unverified export in SQL, and attest the export over its hashes

- **Status:** accepted
- **Date:** 2026-10-18
- **Deciders:** the owner (D15 option a, D16 options a and c, D17 option a, in `docs/product/reconciliation-001.md`, approved 2026-10-17); the build (PR 5 of Change Order 001)
- **PRD sections:** 2 (point 8, dispute windows), 6 (Packet builder; Submissions and payer responses), 8 (packet_version; Invariants), 11 (step 8, the window), 12 (From validated to actionable; The packet; Approval; Submission), 16 (a narrative inventing a number); Data dictionary, Contracts and Pricing, triage and cases; Change Order 001, CO-05, CO-06 ("an unverified deadline blocks actionability and export") and CO-12 (`packet_version.deadline_verification_status`); ADRs 0028, 0038, 0040, 0041, 0044, 0047 and 0049

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

- a release window is verified when its record is Medicare's and at the minimum level or higher: L2 for
  actionability and the export, L3 for the E3 gate (PR 9), the SQL's `minimum_level`. A `commercial_default`
  record is never verified, whatever its level (COMMERCIAL_DEFAULT);
- a contract window is verified when the version is signed off, its window cited with complete evidence and
  verified by a contract specialist, and its days the trace's length in days (otherwise
  CONTRACT_WINDOW_UNCITED, CONTRACT_WINDOW_UNVERIFIED, CONTRACT_VERSION_NOT_SIGNED_OFF or
  CONTRACT_WINDOW_DIFFERS, in that order);
- after a reopened denial (dispute level 2 and above) the deadline is the next window's
  (`nextLevelDeadlineVerification()`, the loader's `nextLevelDeadline()`): a contract's appeal levels carry no
  evidence (NEXT_LEVEL_UNCITED); the Medicare reconsideration record `case_next_dispute_window()` reads is
  verified as a release record is. A packet's deadline is `packetDeadlineStatus()`: not applicable with no
  line, verified when every line's is.

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
`packet_version_deadline_stated` (AFTER INSERT) holds each line's stated status, end and source, the basis by
dispute level and the version's status to the database's own derivation when the version is written. The
column is what the version stated; nothing trusts it at export.

**The export, refused twice.** The worker's export job derives the deadline again (the database's
`packet_version_deadline_status()` in its query, and `lineDeadlines()`/`nextLevelDeadline()` with
`packetDeadlineStatus()`), and either saying unverified refuses the export (`PACKET_DEADLINE_UNVERIFIED`, no file
written); it then runs `verifyNarrative()` over exactly the narrative and content it renders into the PDF and the
CSV (`PACKET_VERIFIER_FAILED`), computes each file's SHA-256 over the exact bytes it writes, requires the store's
plaintext hash to equal it, and records both with the verifier's report. In SQL, `packet_version_export_guard`
(BEFORE UPDATE) refuses the export transition while the deadline, derived again then from the content and the rows
it names, is unverified ("a packet version whose deadline is not verified is not exported"), and unless
`export_verifier_report` is the verifier's passing tp-packet-verifier/2 report over the version's own narrative; the
report never changes otherwise. `tp_app` cannot bypass it: `tp_owner` owns the tables, triggers and functions,
`tp_app` owns nothing and has no BYPASSRLS, cannot ALTER the table or DISABLE a trigger, and cannot set
`session_replication_role`; its column grants are all it writes (`exported_at` only through
`packet_version_rules()` for a job actor; `deadline_verification_status` never); and the guard reads rows that
cannot change underneath it (`priced_line` and `rule_record` are immutable, a contract window is frozen from
approval, and the version's status is read at export).

**The attestation (D16 a and c), audit_report's pattern.** Once exported, a reimbursement reviewer (the founder in
v0) attests once, in their own name, under a four-hour support grant: `audit_finding.validate`, which only the
reviewer role holds; the attester is neither of the packet's drafters nor its approver; the version is current,
still asks for its case's lines, and its deadline is not unverified; the attestation (`tp-attestation/1`) holds a
checklist of codes and the export's two SHA-256, no words, and its time is the database's
(`packet_version_attestation_rules`). A submission is logged only of an attested export
(`submission_needs_attested_export`), which is the "release" of the report's pattern. Where the practice has
users, a practice `packet.approve` holder who is not the drafter approves as before and the founder attests; the
drafter never approves (CLAUDE.md), and internal users still approve nothing else: `packet.approve`,
`practice_has_other_packet_approver()` and the permission matrix are unchanged. The service is
`attestPacketExport()` (audit event `packet_export_attested`), its route `practice.cases.packet.attest` (Zod,
`audit_finding.validate`), with the reviewer's pages to review and download the exported files.

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
| Store the deadline status and trust it at export | A version's statement can go stale (a version superseded since, a record withdrawn); the guard derives it again from rows that cannot change underneath it. |
| A trigger that also checks the narrative's verifier report in SQL by re-running the verifier | The verifier is TypeScript (@tp/packets); SQL checks the report's shape, result and narrative hash, and the worker runs the verifier itself. |

## Consequences

- Actionable totals fall wherever a contract's window is uncited or a release window is below L2: every existing
  version and every synthetic release but 900005. AUDIT-01 would fall to zero without its evidence (a worksheet
  test shows it); with it, the report is unchanged. The specialist's queue gains citing and verifying each
  contract's window, and a corrected version is how an existing contract gains it.
- The Medicare Advantage lines priced under 900001 to 900004 stay DEADLINE_UNVERIFIED; a real release raises its
  Medicare windows to L2 through `/load-release`, and PR 9's E3 gate asks L3 of the same function.
- An export is refused in the worker and in SQL for an unverified deadline or a failed verifier, and every
  submission names an attested export; the export hashes are the stored files' bytes.
- The checks that hold this: `packages/triage/src/deadline.test.ts` (properties over every source and level),
  `apps/worker/src/triage/deadline.db.test.ts` (SQL and TypeScript on the same lines),
  `packages/contracts/src/contracts.db.test.ts` (the window's evidence and its rules), the packet and export
  tests in `packages/packets` and `apps/worker/src/packets`, `tools/audit-worksheet` and
  `apps/web/src/lib/routes/audit-e2e.db.test.ts`, `tools/release/release.test.ts`, and the golden triage test's
  uncited window (G118), with `fixtures/golden` unchanged.
- `docs/product/domain-model.md` is regenerated at this migration and waits for the founder's approval (CO-02).

## Revisit when

A real release's Medicare dispute windows are read at L2 or L3 (the synthetic 900005 then stays a fixture only); a
payer's contract states its window in a form the specialist cannot cite on one page; PR 8 adds the packet's export
parts (`packet_export`) and PR 9 the E3 gates; or a practice's own reviewer, rather than the founder, attests.
