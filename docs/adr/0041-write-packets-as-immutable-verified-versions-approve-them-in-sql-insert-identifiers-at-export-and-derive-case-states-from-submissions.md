# 0041. Write packets as immutable verified versions, approve them in SQL, insert identifiers at export, and derive case states from submissions

- **Status:** accepted
- **Date:** 2026-10-23
- **Deciders:** founder (engineering)
- **PRD sections:** 1 (rules), 2 (step 5: a specialist confirms the Medicare Advantage regulation per case; step 9:
  interest), 3 (the billing manager must not approve a packet she drafted), 5 (J9; J10, first sentence), 6 (Packet
  builder; Submissions and payer responses), 8 (packet, packet_version, submission, payer_response; Invariants), 12 (The
  packet, Approval, Submission response and follow-up, Write-offs and reopening, the headline), 14 (draftPacketNarrative's
  verifier), 16 (a wrong identifier in a packet; a narrative inventing a number), 20 (single-user approval); Rules
  reference (State prompt-pay rules); Data dictionary; test matrix CAS-08 to CAS-15, LED-01; ADRs 0013, 0017, 0018,
  0038, 0039, 0040

## Context

Milestone 8 builds the packet: assembled from a case and approved records, its narrative verified by code as a hard
gate, approved by a second person (or, in a single-user practice, after 24 hours with an audit flag), exported as a
PDF and CSV with stored hashes and identifiers inserted only then, then submitted by the customer and answered by the
payer. The plan names the records and the rules; it leaves open how a version's content is stored, how the verifier
reads text, what "a practice with one user" counts, how prompt-pay interest is computed, which case state each
response means, how a second-level dispute is told apart, and where the received date interest needs comes from.

## Decision

**Tables and immutability (migration 20261023090000).** Four PHI tables (`packet`, `packet_version`, `submission`,
`payer_response`), each with the forced tenant policy and a registry row; nothing is updated except as below, nothing
deleted or truncated, for every role. A version's whole content is one `content` jsonb (`tp-packet/1`, assembled by
`@tp/packets`); the data dictionary's `citation`, `line_table`, `evidence`, `interest_cents` and the dispute level are
generated columns read from it, so they cannot disagree with it. The narrative is the person's words, encrypted with
the practice's key (as ADR 0038 does for every free text a person writes); the verifier's report holds codes and
positions only. A version is written by a person with `packet.draft`, numbered next, and must ask for exactly its
case's lines not written off at their priced lines' amounts (`packet_version_matches_case`, so no figure of the
schedule is typed); a new edit is a new version, which becomes the packet's current one and so clears its approval
(CAS-13). Insert checks that read the actor or other rows run in AFTER triggers, so a row of another practice meets
the tenant policy first (ADR 0038).

**Approval in SQL.** A CHECK makes PRD 8's invariant literal (`approved_by IS NULL OR verifier_passed`); the trigger
also requires `packet.approve` (the milestone 1 permission function), the current version, its lines still the case's,
the approver naming the version's hash (`versionSha256`: canonical JSON of the content, number and narrative hash), and
for a regulation citation the specialist's confirmation. The person who drafted the packet (version 1's writer) or
wrote this version may approve only with `packet.approve_own_draft`, which no role holds (CAS-09). **"A practice with
one user" means no other person who reaches the practice now may approve its packets**
(`practice_has_other_packet_approver`: the practice's group's people and the grantees' people whose roles there admit
`packet.approve`; support grants never count). Then the writer may approve 24 hours after the version was written (the
database sets `created_at`), and the version is flagged `approved_alone` with an audit event `packet_approved_alone`
(CAS-10); the flag is printed in the packet's approval record and listed by `singleUserApprovals` for reports. Counting
only approvers avoids a deadlock the literal count would cause (a billing manager and a viewer are two users, yet only
one can approve).

**The verifier (`@tp/packets`, no options).** Every run of text holding a digit is a figure of a kind (amount, percent,
date, month, day of a month, code, modifier, number, identifier), and so is every number written in words from "two"
up ("one" and "zero" alone are prose). A figure passes only when its value is among the version's own inputs of that
kind: its schedule, pattern totals, contract parameters, dates, release and version numbers, interest figures, and
anything the quoted clause, the statute or the identification text holds as written. Any sentence without a citation
marker (`[1]`, the version's numbered sources: citation, rule release, line schedule, interest, evidence) fails, as
does a marker naming no source and a placeholder naming no row or kind. `writePacketVersion` always runs it and stores
the result; there is no path that takes a result from a caller. A code-built draft of the pattern statement
(`draftNarrative`) passes by construction (a property test); milestone 10's model draft will go through the same gate.

**Identifiers.** A schedule row holds placeholders (`{{claim_control_number:3}}`, patient control number, patient name,
member ID) and the content CHECK refuses anything else there (CAS-11). The export job reads each row's claim and patient
records (an audited read), decrypts them and inserts them into the schedule and the narrative's placeholders; the
version never changes.

**Export.** A `packet_export` job (one practice, three attempts, ADR 0019) prints the HTML with Playwright's Chromium
(JavaScript off, every request refused, as the audit report) and writes the CSV schedule with the one CSV encoder, seals
both with the practice's key under keys of their own, and records their keys and SHA-256 on the version, which only a
job may do, once, on the current approved version whose lines are still the case's (CAS-12). A submission carries both
hashes, which SQL requires to be the version's.

**Interest (CAS-15).** The person names the state whose prompt-pay statute applies (the record's applicability is the
insurer's licensing, which no record holds); the record comes from the newest release the case's lines were priced
under. Per line: due on the received date (DTM 050, now loaded as `claim.received_on`) plus the days to pay; interest
on the amount paid, for the days the payment came after the due date, plus on the unpaid variance, from the due date to
the version's date; simple, the record's annual rate, a 365-day year, rounded once per line, half up. It is its own
line and source and never part of expected. A null rate, a business-day basis, no record for the state, a record not
in effect, or no received date makes it not computable, stated on the line and listed as an evidence gap. This formula
is the engineer's reading, not the statute's text: the reimbursement specialist confirms it before a real packet
states interest (QUESTIONS, below).

**Submissions, responses and case states.** A submission is logged by a person with `submission.log`, of an exported
version at the case's dispute level, dated from the export to today, following up 45 days later unless the person names
a date (CAS-14: `followUpsDue` lists the latest submissions with no response whose follow-up has come). A response is
to the case's latest submission, with its document (or, for reprocessed with no change, the remittance the ledger's
job matched, recorded in no one's name). A denial with a category may reopen the case for the next dispute level while
that window, which the database computes (the contract version's appeal level of that number, or Medicare
reconsideration for a Medicare Advantage non-contracted case), is open; the next submission must then be a version of
the new level within it. The case's state is derived, in this order: closed written off (every line written off, the
only state a person sets); resolved when every open line is payer approved or recovered, partially resolved when some
are (the ledger moves them; a line stage event refreshes its case); else from the latest submission's latest response:
open with none, submitted with no response, awaiting response after a request for information or a reopening denial,
partially resolved after a partial acceptance, resolved after an acceptance, a final denial or a reprocessing with no
change. `@tp/triage` `deriveCaseState` holds the same order; the database test runs both. A reopened case is not
`open`: `open` is triage's state for gathering a pattern's lines (one open case per pattern, windows closed daily), and
a disputed case's lines stay as they were submitted.

**Medicare Advantage non-contracted.** The citation is the regulation the rules reference names (42 CFR 422.214) and the
release; approval needs a contract specialist (`pricing.answer`, under a support grant) to have confirmed, on that
version, that it applies to the case (PRD 2, step 5).

**For the ledger (milestone 9).** Recording a response writes no ledger entry and no stage (LED-01).
`acceptedPayerResponses` gives the ledger the accepting responses with their documents and the lines asked for;
`recordPayerResponse` in a job's scope records a reprocessed remittance with no change.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Separate jsonb columns per part of the content, as the dictionary lists them | Parts could disagree; generated columns keep the dictionary's names with one source |
| Re-running the verifier in PL/pgSQL | A second tokenizer to keep identical; SQL instead checks the stored result's shape and blocks approval on it, and the amounts are checked against the priced lines |
| Counting every person who reaches the practice as its users | Deadlocks a practice whose second user cannot approve (a viewer, an analyst) |
| Narratives in plain text | A person can type anything, a name included; every person-written text is encrypted (ADR 0038) |
| A reopened case back to `open` | Collides with triage's one open case per pattern and its daily window closing; revisit if the workbench wants a distinct "reopened" state |
| Interest on the variance only, or on the paid amount only | The exposure is both; the specialist decides (QUESTIONS) |
| Requiring a document for every response | The ledger's reprocessed remittance has none; it carries the remittance instead |

## Consequences

- `pnpm test:db` gains `apps/worker/src/packets/packets.db.test.ts` (CAS-08 to CAS-15, the invariant with triggers off,
  LED-01, the states, the second level, the ledger's response path, the regulation gate) and the generated cross-tenant
  tests of the four tables (the row factory approves and exports its versions as a second billing manager and a job).
- The web screens (the workbench, the builder, the submission log, the follow-up list) are milestone 8's part B; they
  call `@tp/worker/packets` and the `packet_export` queue.
- QUESTIONS for the specialist: the interest formula above; whether interest runs on the paid amount, the unpaid
  variance or both; which appeal level of a contract the first denial opens.
- A claim loaded before this milestone has no received date (a resent file loads nothing), so its interest is not
  computable and the packet says so.

## Revisit when

The specialist answers the interest questions; milestone 9 moves lines to payer approved and recovered (the case states
follow); milestone 10's model drafts narratives (the same verifier); a customer wants states it cannot infer.
