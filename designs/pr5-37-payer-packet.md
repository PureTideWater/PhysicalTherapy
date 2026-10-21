# PR 5, audit item #37 part 1: the packet a payer's examiner receives

Design contract, revised 2026-10-20 after review (section 9). Base: `co-001/pr-05-packet-deadline` at the head the
running fix round pushes (read here from `origin` at `2a07505` and from the `/home/user/pr5` working tree). The
builder starts from the fix round's final pushed head and merges over it. The fix round also changes these files
this design touches; rebase each knowingly, and rewrite `export.test.ts` from the fix round's version:
`apps/worker/src/packets/{export.ts, services.ts, records.ts, readiness.ts, export.test.ts, export-attempts.db.test.ts,
packets.db.test.ts}`, `apps/worker/src/triage/test-support/triage-world.ts`, `apps/web/src/lib/routes/packets.ts`,
`apps/web/src/lib/packets/{queries.ts, export-attempts.ts, view.ts, review.test.ts}`,
`apps/web/src/components/packets/display.tsx`, the packet, review, submissions and Cases pages,
`apps/web/e2e/{journeys.ts, packets.ts, packets.spec.ts, worker.ts}`, migration `20261103090000`, ADR 0061,
`reconciliation-001.md` and `domain-model.md`. The fix round does not touch `html.ts` or `csv.ts`.

**Schema change: one SQL function body, and only under the recommended answer to Q6.** Under Q6 (a),
`packet_export_refusal_codes()` in PR 5's own unmerged migration `20261103090000` gains `'contact_missing'`. No
table, column, CHECK, grant, policy, registry entry or permission changes. The domain model is regenerated in the
same pull request; the founder confirms PR 5's hash once, after all PR 5 work lands, as already planned. Under
Q6 (b) there is no schema change.

Founder rulings this follows: the combined audit adopted in full on 2026-10-20, with #37 part 1 folded into PR 5
before merge; the standing rule of 2026-10-18 (best option only, never weighed by effort). Part 1 was described as
"with no schema change"; Q6 asks whether one function body may change.

## 1. The change in one paragraph

Today one PDF serves the payer and the internal audit. It prints the drafter's, approver's and contract
specialist's login emails, the specialist line, the audit flag, the evidence gaps, record IDs and SHA-256 values,
the deadline's verification level and status, the packet version number and a "computed by code" footer. After
this change the export prints a **payer's copy** only. That is the practice's letter with its figures, its
citations and the evidence each citation marker names. It closes with "Approved for submission by <practice> on
<date>, reference <REF>" and the correspondence contact the practice sets. It states only what code knows when it
prints: the dates of the dispute window, never that the dispute is timely, and interest only where code computed
it. Every dropped item stays where it already lives (the packet version row and its content, the audit log) and is
shown on the reviewer's review page. The CSV schedule follows the same rule, because the practice sends both
files. Staff can find a packet by the reference a payer quotes. No second file is made now; the payer set and the
internal manifest split in PR 12.

## 2. Decisions

**D1. One export, with the internal record on screen; the internal copy becomes a second output only in PR 12.** A
stored internal manifest now would need its own key and SHA-256 columns and a third hash in the attestation, whose
CHECK holds exactly `format`, `checklist`, `pdf_sha256` and `csv_sha256`. That is a schema change, and PR 12
rebuilds it anyway with D26's export tables. Nothing is lost meanwhile: the version's content, its approval columns
and its regulation confirmation never change after approval (database triggers), the audit log is append-only,
and the review page renders all of it.

**D2. What the payer's copy prints (`apps/worker/src/packets/html.ts`), and only this.** Words are exact. `<REF>`
is D5's reference. Dates are ISO, as elsewhere in the PDF.

| Part | Prints |
| --- | --- |
| Title, running header | unchanged: `Payment dispute`, the practice's name leading (white label, ADR 0056) |
| Cover meta | `To <payer> (<payer_id_raw>), plan <plan>`; `Dispute level <n>; prepared <as_of>`; `Reference <REF>` (was `Version <n>, SHA-256 …`). Frame `reference` = `Reference <REF>` |
| Identification | From and To lines unchanged; meta line `Dispute level <n>; prepared <as_of>; reference <REF>.` |
| [1] Citation | Contract: `[1] <title>, version <n> (effective <from>[ to <to>]), page <p>:` and the quoted clause. No document ID, no page or document SHA-256. Regulation: unchanged |
| [2] Releases | By what the release supplied (D14): `[2] Payment rules and the Medicare fee schedule in effect for the service dates: release <n>`, or `[2] Payment rules in effect for the service dates: release <n>` (`releases <a> and <b>` for two or more). No manifest SHA-256, no "rule release" |
| Pattern statement | the narrative, unchanged, in `<div class="narrative">` and nothing else in that block |
| [3] Line schedule | columns `Row, Claim control number, [Patient control number: see Q2], Patient, Member ID, Service date, Code, Modifiers, Units, Expected, Observed, Variance`. The `Trace` column (a `priced_line:<uuid>`) is gone; the total row puts `Total` in the first cell |
| Dispute window (tp-packet/2) | heading `Dispute window`. First level: `The earliest dispute window among the listed lines ends on <date>.` Later level: `The window for dispute level <n> ends on <date>.` Nothing else about timeliness (Q3). Sources: contract window `The contract’s dispute window: <N days> (page <p>):` with the quoted clause; release record `The <Medicare> dispute window in effect for the service dates (release <n>).` No status, no "n of n verified", no verification date, level, IDs or SHA-256, no `data-deadline` attribute. `ends_on` is never null on an exportable version (a verified deadline has its date); the renderer throws a `TypeError` if it is, so it never prints an unstated window |
| Line calculation | caption `Each line’s dispute window and how its expected amount is computed`; columns `Row, Window ends, Method, Steps, Rounding, Patient share`. The `Deadline` status and `Trace SHA-256` columns are gone |
| [4] Interest | D9 |
| Evidence | each item with its marker: the stored label, without `(document <uuid>)` or `, SHA-256 …`; a `rule_release` item reads as [2] does, with its release. No evidence gaps list |
| Requested action | unchanged |
| Approval and correspondence | heading `Approval and correspondence`; `Approved for submission by <content.practice.name> on <approved_at as UTC date>, reference <REF>.`; `Correspondence about this dispute: <contact text>.` (D6) |
| Footer | none (the `<footer>` and its `.flag`/`footer` styles are removed) |

Every dropped item, and where it stays:

| Dropped from the payer's copy | Stays in | Shown on the review page |
| --- | --- | --- |
| Drafter's and approver's login emails, approval time | `packet_version.drafted_by`, `approved_by`, `approved_at`, `approved_sha256`; audit events | header (exists) and new Internal record card |
| Specialist line (MA regulation confirmed by) | `regulation_confirmed_by`, `regulation_confirmed_at`; `packet_regulation_confirmed` event | new, Internal record card |
| Audit flag | `approved_alone` | Approved alone alert (exists) |
| Evidence gaps; evidence document IDs and SHA-256; interest not computed | `content.evidence_gaps`, `content.evidence`, `content.interest` | new, `EvidenceList` and `InterestSection` in the Internal record card |
| Citation document ID, page and document SHA-256 | `content.citation` | `Citation` (exists) |
| Release manifest SHA-256 | `content.rule_releases` | new, Internal record card |
| Deadline status, "n of n verified", verification date, level, source IDs and SHA-256 | `content.deadline`, `deadline_verification_status` | `DeadlineSummary`, `DeadlineChip` (exist) |
| Trace references; trace SHA-256 | `content.lines[].trace_ref`, `.calculation.trace_sha256` | `LineSchedule`, `CalculationTable` (exist) |
| Packet version number and its SHA-256 | `version_no`, `content_sha256` | title (exists); SHA-256 new in the Internal record card |
| "Every amount … was computed by code …" | the claim itself | as a note in the Internal record card |

**D3. The CSV is the payer's too.** PRD 12: the manager submits the packet, PDF and CSV, through the practice's own
channel, and the reviewer attests both. `PACKET_CSV_COLUMNS` becomes `row, payer_claim_control_number,
[patient_control_number: Q2], patient_name, member_id, service_date, procedure_code, modifiers, units, expected,
observed, variance, paid, paid_on, received_on, interest, window_ends_on, calculation_method, unrounded, rounded,
patient_share`. Gone: `trace_ref`, `deadline_status`, `deadline_source`, `trace_sha256`. `calculation_method` is
written in the PDF's words (`Fixed schedule`), not as a code. `interest` is empty for a line whose interest code
did not compute (D9). The words move to one module both files use.

**D4. The approval line** is the audit's sentence. `<practice>` is the version's own `content.practice.name` (the
name it was approved under, as the cover prints). `<date>` is the UTC calendar date of `approved_at`, the product's
date convention, as `prepared <as_of>` already is (open item 3). It reads the same for a single-user approval; the
audit flag stays internal.

**D5. The reference is a short code derived from the approved version's SHA-256, with no new storage, and staff
can look it up.** `packetReference(sha256)` takes the first 13 hex digits of `approved_sha256` (equal to
`content_sha256` by the `packet_version_approval_names_its_hash` CHECK) as a 52-bit integer and shifts it right by
2 to 50 bits. It writes those as 10 Crockford base-32 digits (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`) with a hyphen
after the fifth. Test values: `SK6CS-K6CSK` for `'c'.repeat(64)`, `00000-00000` for all zeros, `ZZZZZ-ZZZZZ` for
all `f`, and `DTNPC-H3H8N` for `sha256("tp-packet reference test")`. It is pure and browser-safe (no Node crypto).
Why this and not the alternatives:

- It is not PHI, not a UUID, and cannot be read as a hash (never 16 hex characters in a row). It ties the printed
  approval to exactly the content the approver named, and anyone with the review page can check it.
- No existing identifier fits: cases and packets have only UUIDs; `version_no` repeats across packets; the
  submission's `reference` is the payer's and exists only after sending.
- A per-practice sequence number would need a column and a counter (a schema change), and it would tell every
  payer how many disputes the practice has filed.
- 50 bits: the odds that two of one practice's approved versions share a code are about n²/2^51, which is 4.4 ×
  10^-6 at 100,000 versions. Nothing enforces uniqueness (no schema), so the lookup shows every match.

**Lookup (new).** A payer quotes the reference back by phone or letter, so staff need to find it.
`normalizePacketReference(text)` trims and upper-cases the input, drops spaces and hyphens, and reads `O` as `0`
and `I` and `L` as `1` (Crockford's rule). It needs exactly 10 alphabet symbols and returns the hyphenated form, or
null. `packetReferencePrefix(reference)` gives the 12 hex digits the 50 bits fix (the first 48 bits of the hash).
`packetVersionsByReference(scope, { practiceId, reference })` runs `SELECT … FROM packet_version v JOIN packet p ON
p.id = v.packet_id WHERE v.practice_id = $1 AND left(v.approved_sha256, 12) = $2` in the practice's scope (FORCE
RLS). It keeps the rows whose `packetReference(approved_sha256)` equals the reference and returns all of them:
case, version number, dispute level, approved date, exported or not, submitted or not. The page is
`practice.cases.by_reference` at `/p/[practiceId]/cases/by-reference?reference=…` (`practice.open`, `phi: true`, as
the submissions page). A "Find a packet by its reference" field on the Cases page sends to it. One match links to
its packet; several are listed together; none says so. A malformed reference is refused with its format.

The reference is shown beside the version on the packet page, the review page and the submissions page, and it
names the files (D8). A new level-2 version has its own reference.

**D6. The correspondence contact lives in `practice.settings.correspondence_contact`. The practice administrator
sets it; it is required before export and read at export.**

- No contact exists anywhere today. `practice` holds name, NPI, `tax_id_last4`, ZIP and `settings`;
  `organization` holds only its name; `user.email` is a login (what the audit drops); `prospect_request.contact_*`
  is a sales lead. `practice.settings` already holds the proof level, the posting template and the pricing and
  triage settings, and every writer keeps keys it does not own (`settings || …`; the console strips only
  `practice_setting_keys()`).
- Who sets it: the practice administrator only, exactly as `setLedgerSettings` sets the proof level. The setter
  calls `requirePracticePermission(…, 'practice.open')` and `requireRole(roles, ['practice_admin'],
  'practice.open')`. It then runs a direct `UPDATE practice SET settings = jsonb_set(settings,
  '{correspondence_contact}', $2)`, which the restrictive policy `practice_administrators_update` admits only for
  the practice's administrators (`app_actor_admin_practice_ids()`). It requires `rowCount = 1` or refuses. The
  settings page is editable by the same rule (`canSetCorrespondence(access)`: the role `practice_admin` and
  `access.via === 'ownership'`), not by the overview's `administers` (`agreement.sign`), so no one sees a form
  whose save is refused. A billing manager setting it would need a new permission and a definer function
  (schema); see open item 2.
- Fields (Q1 decides what is required; the design assumes the recommended answer): name or office, required;
  phone, required; extension, email and mailing address, optional. The contact's email is the one email the
  payer's copy may print (ADR 0061 records the exception to the audit's "no email" test, which is about logins).
- It cannot be cleared, only replaced: the form requires its required fields, and no other writer removes the key.
- It is read at export time, inside the export transaction. A later change does not touch an export already made:
  the PDF and its SHA-256 are the record of what was printed.
- Printed words, one function shared by the PDF, the packet page and the settings preview:
  `<name>, <(919) 555-0100>[ ext. <ext>][, <email>][; <line1>[, <line2>], <city>, <ST> <ZIP>]`.
- It is staff contact data, not PHI. It is never logged; the audit event carries the practice ID only.

**D7. No export without a contact, refused at every step, as one coded readiness reason (Q6 (a)).**

1. `exportReadiness()` gains reason 11, `contact_missing`, after `inputs_differ`. Its query joins `practice` and
   reads `settings -> 'correspondence_contact'`, judged by `correspondenceContactOf()`; anything but `set` refuses.
   `PACKET_EXPORT_REFUSALS` and `packet_export_refusal_codes()` gain it between `inputs_differ` and
   `verifier_failed` (the existing database test compares the two).
2. All four callers then refuse alike, with no new branch:
   - The packet page disables Export and shows the reason beside it (item #61, no dead button). For the
     administrator it links to Settings, Correspondence.
   - `requestExportOnce` refuses before anything is queued, with every reason.
   - `requestPacketExport` refuses with `EXPORT_REQUEST_REFUSALS.contact_missing`.
   - The job records `packet_export_refused` with purpose `contact_missing` and logs
     `PACKET_CORRESPONDENCE_CONTACT_MISSING` (`EXPORT_REFUSALS`). A refusal returns rather than throws, so it is
     never retried.
3. After readiness, and before any decrypt or identifier read, the job reads the contact it prints in the same
   transaction. If that read is not `set` (a concurrent change), it refuses with `contact_missing` too.

Under Q6 (b), no SQL changes. `contact_missing` is then a web-only reason the web adds after readiness, and
`requestPacketExport` refuses with `PacketRefusedError('contact_missing', …)`. The job throws
`PacketExportContactError`, recorded as failure code `unexpected` and retried twice (`retryLimit: 2`).
`packetExportHandler` logs that error class as `PACKET_EXPORT_CONTACT_MISSING` instead of
`EXPORT_FAILURES.unexpected` (a handler change, tested).

**D8. File names carry the reference, never a UUID.** The four download routes (`/pdf`, `/csv`, `/review/pdf`,
`/review/csv`) name the files `payment-dispute-<REF>.pdf` and `payment-dispute-<REF>-schedule.csv`. They were
`packet-<versionId>.pdf` and `packet-schedule-<versionId>.csv`, which put an internal UUID in front of the payer.

**D9. Interest states only what code computed, and says nothing that reads as a waiver (Q4 (a)).**

- The evidence gaps list goes.
- The rule sentence: `State <ST>[, <statute>]: payment due <N> <basis> days after the payer received the claim[,
  interest at <R>% a year] (release <n>).` The exclusions sentence stays.
- The table `Interest by line` lists only the lines whose `interest_cents` is not null.
- The total reads `Interest stated in this request: $X` when at least one line computed.
- When no line computed, the rule sentence prints alone, with no table and no total. When no rule is on file
  (`days_to_pay` null), the section reads `Prompt-pay interest is not stated in this request.`
- `cannot be computed`, `not stated`, `can be computed` and `in all` are never printed.
- `draftNarrative` writes no interest sentence when `total_cents` is null. `[4]` stays printed whenever
  `content.interest` is not null, so a narrative that cites it still names a printed section.
- The review page keeps the gaps and each line's state in words.

**D10. The reviewer's checklist, worded as the founder's attestation (Q5).** In v0 the reimbursement reviewer is
the founder, and the code calls this "the founder's attestation". So the wording below is the recommendation, and
the founder decides it. The order is `figures, deadline, calculation, identifiers, payer_copy, files,
independent`. The attestation CHECK accepts any `^[a-z][a-z_]{0,31}$` code, so this needs no schema change.

- `figures`: "Every figure, date, code and count in the PDF and the CSV comes from the version’s records, its
  approval, or the practice’s correspondence contact (printed as set), and the verifier passed the narrative the
  export printed."
- `deadline`: today's text plus "(shown on this page; the payer’s files state the window’s end and its clause, not
  its verification)".
- `calculation`: "Each line’s calculation in the PDF and the CSV is its trace’s: the method, the steps, the one
  rounding and the patient share, shown apart from expected; each trace’s SHA-256 is on this page."
- `identifiers`, `files`, `independent`: unchanged.
- `payer_copy` (new): "The PDF and the CSV are fit to send to the payer: they name the practice, its approval line
  with this reference and its correspondence contact, and carry no login, record ID, SHA-256 or internal note
  (those are on this page)."

The server requires every item. The attest action's Zod input builds its `confirm_<id>` fields from
`PACKET_CHECKLIST` (each `confirmed`), so the list and the schema cannot drift. A form missing any box is refused
before the service runs, and the stored `checklist: [...PACKET_ATTESTATION_ITEMS]` is never written over a box the
server did not require.

**D11. The verifier's report still holds, and the payer's copy prints exactly the narrative it checked.** The job
runs `verifyNarrative(narrative, narrativeFacts(content), identifiers)` and stores the result as
`export_verifier_report`. The export guard requires format `tp-packet-verifier/2`, a pass, and the version's
narrative SHA-256.

1. Its inputs do not change: the same narrative, the same content (so the same facts) and the same identifiers.
   For the same version the report is the same, and the guard is untouched.
2. Nothing removed is a verifier input. The facts are amounts, percents, dates, codes, modifiers, counts, release,
   contract version, page and day numbers, quoted texts and the practice, payer and plan names. Emails, IDs,
   SHA-256 values, levels, statuses, verification dates, gap codes and the packet version number never were. Every
   fact the old PDF printed is still printed (the contract version and page in [1], release numbers in [2], dates
   and windows, the window's days and quote).
3. Every citation marker a narrative may use still names a printed section: [1] citation, [2] releases, [3] the
   schedule's caption, [4] the interest heading, and [5] onward each evidence item.
4. The renderer is not a verifier input, so point 1 alone proves nothing about the print. T4 proves the
   `.narrative` block is exactly the verified narrative, identifiers inserted, paragraph by paragraph, with nothing
   added or dropped. It also proves that the approval line, the reference and the contact sit only outside that
   block. DB1 proves each narrative sentence is in the printed PDF's text.

tp-packet/2 does not change: the content, its `packet_content_valid` check, `versionSha256` and every stored
version hash stay as they are. The renderer is a projection of the content.

**D12. Hashes and attestation: same mechanism, new bytes.** The job hashes the exact PDF and CSV bytes it prints.
The store must seal those bytes (plaintext hash and size), and the version records `export_sha256` and
`export_csv_sha256` once. A download is recorded only when the served bytes hash to them. The attestation holds
those two hashes (`packet_version_attestation_names_its_export`), after the reviewer has downloaded both. Part 1
changes only what the bytes say, so the attestation binds the files the payer receives. An export already made is
never printed again (JOB-01); none exists in production (PR 5 is unmerged).

**D13. The renderer gets no login and no hash.** `packetHtml(exported, payerCopy)` takes `{ approvedOn, reference,
contact }`, and the job stops reading `packet_version_people()`. `packetReconciliation` keys on the reference (an
opaque label; the seal and badge never render on a packet, ADR 0057). The only IDs the renderer can reach are in
the content, and T1 proves none is printed.

**D14. Record numbers and what [2] claims.** `release <n>` and `contract version <n>` are PaidWhole's own record
numbers, and they stay printed because narratives cite them as facts (the verifier holds a narrative to them).
ADR 0061 records this, and that #38's worksheet and PR 12 replace them with CMS's own terms (year, locality).
[2] names the fee schedule only when the release supplied one: when the citation is a regulation, when the
contract's method is `PERCENT_OF_MEDICARE`, or when it is `LESSER_OF` with a `PERCENT_OF_MEDICARE` schedule
(`citation.parameters.schedule.method`). In every other case [2] says `Payment rules`, since a fixed-schedule
release may supply only window or prompt-pay records.

## 3. Data shapes

`practice.settings.correspondence_contact` (jsonb object; the key is absent until set):

```json
{
  "name": "BILLING OFFICE",
  "phone": "9195550100",
  "phone_extension": "12",
  "email": "billing@synthetic.test",
  "address": { "line1": "100 SYNTHETIC WAY", "line2": "SUITE 2", "city": "RALEIGH", "state": "NC", "zip": "27601" }
}
```

- `name`: trimmed, 1 to 120 characters, no control or hidden characters.
- `phone`: 10 digits in the North American plan's form (area code and exchange each start 2 to 9). It is stored as
  digits from input that may hold spaces, dots, dashes, parentheses or a leading +1.
- `phone_extension`: 1 to 6 digits, omitted when blank.
- `email`: at most 254 characters, one `@`, no spaces, omitted when blank.
- `address`: either omitted, or `line1`, `city`, `state` (a USPS code from a fixed list) and `zip`
  (`^\d{5}(-\d{4})?$`) all present, with `line2` optional and each part 1 to 100 characters.
- No other key.
- It is validated on write by the web's Zod schema and again by `correspondenceContactSetting()` in `@tp/packets`.
  It is read back by `correspondenceContactOf(settings)`, which returns `set`, `missing` or `malformed`; anything
  but `set` refuses an export. A malformed value is never replaced by a default (the ledger settings' rule).
- CHECKs: none added. The existing `jsonb_typeof(settings) = 'object'` and `practice_ledger_settings` hold.
- Grants: the existing `GRANT SELECT ON practice TO tp_app` and `GRANT UPDATE (…, settings) ON practice TO
  tp_app`. The job reads `practice` already (the cipher, the pricing settings).
- RLS: `practice` is FORCE ROW LEVEL SECURITY under `practice_tenant`, with the restrictive
  `practice_administrators_update`.
- Registry: `phi_table_registry` already lists `practice` (`practice_tenant`); unchanged.
- Permissions: none added (`practice.open` plus `requireRole(['practice_admin'])`, as for the proof level).
- Audit action `correspondence_contact_set` (object `practice`; the column's CHECK is a pattern, not a list).

SQL (Q6 (a) only), in `20261103090000_deadline_verification_and_export_attestation.sql`:
`packet_export_refusal_codes()` returns `ARRAY['not_approved', 'not_current', 'outdated', 'case_changed',
'not_case_level', 'window_passed', 'next_window_passed', 'pricing_not_current', 'deadline_unverified',
'inputs_differ', 'contact_missing', 'verifier_failed']`. Its comment says the reasons are in readiness order. Its
grants and its callers (`audit_event_packet_export_attempt()`) are unchanged.

Renderer input: `interface PayerCopy { readonly approvedOn: string; readonly reference: string; readonly contact:
CorrespondenceContact }`. Reference: `packetReference(sha256)`, `PACKET_REFERENCE_PATTERN` =
`/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/`, `normalizePacketReference(text)`,
`packetReferencePrefix(reference)` and `exportFileName(reference, 'pdf' | 'csv')`. `PACKET_ATTESTATION_ITEMS` =
`['figures', 'deadline', 'calculation', 'identifiers', 'payer_copy', 'files', 'independent']`.

## 4. Files to change

`packages/packets`
- `src/reference.ts` (new): `packetReference`, `PACKET_REFERENCE_PATTERN`, `normalizePacketReference`,
  `packetReferencePrefix`, `exportFileName`. Also new: `src/reference.test.ts`.
- `src/correspondence.ts` (new): `CORRESPONDENCE_CONTACT_KEY`, `CorrespondenceContact`,
  `correspondenceContactSetting`, `correspondenceContactOf`, `correspondenceText`,
  `CorrespondenceContactError(field)`. Plain functions, no new dependency. Also new: `src/correspondence.test.ts`.
- `src/index.ts`: export both modules.
- `src/draft.ts`: no interest sentence when `interest.total_cents` is null (D9). The Medicare Advantage sentence
  becomes `The Medicare fee schedule in effect for those service dates (release <n>) sets that amount [2].` The
  verifier still passes both.
- `src/assemble.test.ts`: drafts hold no internal term (T10).

`packages/synth` and the model's evaluation set
- `src/eval/narrative-set.ts`: drop the `not_computed` closing sentence and reword the Medicare Advantage sentence,
  exactly as `draft.ts`. Then regenerate `fixtures/synthetic/MOD-03` with `pnpm synth --all` (CI diffs
  `fixtures/synthetic`).
- `packages/model-gateway/eval/baseline.json`: re-record the local `draftPacketNarrative` entry with the eval CLI's
  `--record`, because the set's SHA-256 changes (`gate.golden.test.ts` asserts the two are equal). Review the diff.
  The prompt and the model's input (`interest.computed`) stay until PR 12 (CO-06): a prompt change is a new prompt
  version with its own recorded evaluation (ADR 0054). ADR 0061 records this.

`apps/worker`
- `src/packets/words.ts` (new): the method, step, rounding and program words, and the [2] release text (D14),
  moved out of `html.ts`.
- `src/packets/html.ts`: the payer's copy of D2, D9, D13 and D14. Delete `ApprovalRecord`, `GAP_TEXT`, `gapText`,
  `GAP_CODES`, `CAUSE_TEXT`, `DEADLINE_STATUS_TEXT`, `deadlineText` (the screen's own words are
  `apps/web/src/lib/packets/view.ts`), the footer and `.flag`. Rewrite the header comment.
- `src/packets/csv.ts`: D3's columns; the method in words; interest empty where it did not compute.
- `src/packets/correspondence.ts` (new): `setCorrespondenceContact(scope, { practiceId, contact, requestId })`
  (D6's checks), `practiceCorrespondenceContact(client, practiceId)`, `CorrespondenceContactRefused`.
- `src/packets/readiness.ts`: reason `contact_missing` (D7), in `PACKET_EXPORT_REFUSALS` and the readiness query.
- `src/packets/export.ts`:
  - The version query drops `LATERAL packet_version_people(v.id)` and reads `v.approved_sha256`.
  - The contact read of D7 step 3.
  - `EXPORT_REFUSALS.contact_missing = 'PACKET_CORRESPONDENCE_CONTACT_MISSING'`.
  - The `PayerCopy` built from `approved_at`, the reference and the contact.
  - Under Q6 (b) instead: `PacketExportContactError` and its own log code in `packetExportHandler`.
- `src/packets/services.ts`:
  - `EXPORT_REQUEST_REFUSALS.contact_missing`.
  - `PACKET_ATTESTATION_ITEMS` gains `payer_copy`.
  - `packetVersionsByReference` (D5).
  - Under Q2 (a): `writePacketVersion` refuses a narrative holding a `{{patient_control_number:<n>}}` placeholder
    with `PacketRefusedError('narrative_withheld_identifier', 'a narrative names a row by its claim control number,
    patient or member ID; the patient control number is not printed for the payer')`. Versions are immutable, so
    the write is the one place to hold this.
- `src/packets/records.ts`: `PACKET_REFUSALS` gains `narrative_withheld_identifier` (Q2 (a)), plus
  `contact_missing` under Q6 (b).
- `src/packets/public.ts`: export the contact setter and reader, `PayerCopy` and `packetVersionsByReference`, and
  re-export `packetReference`, `normalizePacketReference`.
- `src/packets/test-support/exported-packet.ts`:
  - `approval` becomes `payerCopy` (`approvedOn: '2026-05-02'`, `reference: packetReference('c'.repeat(64))`, a
    SYNTHETIC contact).
  - Add `maximalContent`: a version with every internal field filled with a distinct sentinel (D2's dropped items,
    both deadline source kinds, gaps, all four evidence kinds, two releases, interest computed on some lines and
    not on others).
- `src/packets/test-support/payer-copy.ts` (new): `payerCopyLeaks(text, { content, allowedEmail, identifiers,
  secrets })`. It removes the inserted identifier values first, then scans for:
  - any email other than `allowedEmail`;
  - UUIDs;
  - runs of 16 or more `[0-9a-f]` that contain a letter `a` to `f`;
  - `priced_line:`;
  - every string under an internal key of the content (`*_id`, `*sha256*`, `hash`, `trace_ref`, `verified_by`,
    `verified_at`, `level`, `cause`);
  - every given secret, matched without regard to case;
  - outside the narrative and quoted clauses, the internal terms: `SHA-256`, `hash`, `trace`, `verif`, `audit`,
    `evidence gap`, `computed by code`, `specialist`, `PaidWhole`, `tp-packet`, `priced line`, `pricing run`,
    `rule release`, `manifest`, `placeholder`, `approved alone`, `written by`, `Approval record`, `level L\d`,
    `\bL[1-3]\b`, `/\bc(?:an|ould) ?not be computed\b/`, `can be computed`, `not claimed`, `filed within`,
    `Version \d+, SHA`.

  Also new here: `printedPdfText(pdf)` (text and metadata, as `report/test-support/printed-text.ts`) and
  `recordingRenderer(inner)`, which keeps the HTML handed to `render`.
- `package.json`: export `./testing/payer-copy` for the e2e.
- `src/triage/test-support/triage-world.ts`: `practice()` seeds `SYNTHETIC_CORRESPONDENCE_CONTACT` in settings,
  with an option `{ contact: false }` to leave it out. This one change covers every world that exports through
  `exportPacketVersion`: the packet world (`src/packets/test-support/packet-world.ts`), the ledger world
  (`src/reconcile/test-support/ledger-world.ts` `submit()`, used by `chain.db.test.ts` and the other reconcile and
  report-ledger db tests) and the web route tests built on `TriageWorld` (`workbench-routes`,
  `export-attempts-routes`, `pricing-current-routes`). `settings.db.test.ts` uses `toMatchObject`, so it is
  unaffected.
- `src/packets/test-support/packet-world.ts`: pass `{ contact: false }` through for D7's tests.
- `src/packets/export.test.ts`: rewritten from the fix round's version (T1 to T9).
  `src/report/print-layout.test.ts`: the new `packetHtml` input.
- `src/packets/packets.db.test.ts`:
  - The CSV header assertion (line 275) becomes D3's header.
  - The two literal six-item checklists of the direct attestation writes (lines 579 and 609) become
    `[...PACKET_ATTESTATION_ITEMS]`. The CHECK accepts either, but the writes should match what the service writes.
  - The `requestPacketExport` refusal cases gain `contact_missing`.
- `src/packets/export-attempts.db.test.ts`: DB2. `src/packets/correspondence.db.test.ts` (new): DB4.

`apps/web`
- `src/lib/routes/settings.ts`: `correspondenceSettingsPage` (`practice.settings.correspondence`, `practice.open`,
  editable by `canSetCorrespondence(access)`, D6) and `setCorrespondenceContactAction`
  (`practice.settings.set_correspondence`, Zod input, audit `correspondence_contact_set`, calls the worker setter).
  Both go in the settings route list. The overview checklist gains `correspondence` (done when set; `SetupStep`
  key).
- `src/app/p/[practiceId]/settings/correspondence/page.tsx` and `actions.ts` (new): the form, a preview in the
  printed words, and "packets already exported keep the contact they were printed with". Also
  `src/app/p/[practiceId]/settings/page.tsx` (`STEPS.correspondence`) and `src/components/settings/nav.tsx` (the
  entry).
- `src/lib/routes/packets.ts`:
  - D8's file names on the four download routes.
  - The attest action's input builds `confirm_<id>` from `PACKET_CHECKLIST` (D10).
  - The review route's data.
- `src/lib/routes/triage.ts` or a new `src/lib/routes/packet-reference.ts`: `practice.cases.by_reference` (D5), in
  the route list with a sample.
- `src/app/p/[practiceId]/cases/by-reference/page.tsx` (new), and the field on
  `src/app/p/[practiceId]/cases/page.tsx`.
- `src/lib/packets/queries.ts`: the packet detail exposes the reference (approved versions) and the contact's
  state and words. `requestExportOnce` needs no change under Q6 (a); under (b) it adds the web-only reason.
- `src/lib/packets/export-attempts.ts`: `EXPORT_REFUSAL_TEXT.contact_missing` and its `REFUSAL_SUMMARY`, with the
  remedy ("Your practice administrator sets the correspondence contact under Settings, Correspondence").
- `src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx`: the reference beside the approved version. In the Export
  card: what the payer's copy carries and the contact, or the disabled button with its reason.
- `src/lib/packets/review.ts`: D10's checklist. `PacketReview` gains `reference`, `regulationConfirmation`,
  `contactNow`.
- `src/app/p/[practiceId]/cases/[caseId]/packet/[versionId]/review/page.tsx`: the Internal record card (D2's
  table, reusing `EvidenceList` and `InterestSection` from `src/components/packets/display.tsx`) and a Payer's copy
  card (the approval line, the reference, the contact now).
- `src/app/p/[practiceId]/cases/[caseId]/submissions/page.tsx`: the reference beside the export SHA-256.
- Tests:
  - `src/lib/packets/review.test.ts`.
  - `src/lib/routes/test-support/packet-world.ts`: `seedPackets` sets the SYNTHETIC contact as owner before its
    export.
  - `src/lib/routes/workbench-routes.db.test.ts`: line 411 becomes `payment-dispute-<REF>.pdf`, plus the CSV name
    and W7.
  - The route db tests of W1 to W6.
- e2e:
  - `e2e/journeys.ts`: a practice administrator persona for the packets practice.
  - `e2e/packets.ts`: `DEADLINE_PRACTICE` seeds the SYNTHETIC contact through `journeyPractice` settings; the
    packets practice gets it through E2.
  - `e2e/packets.spec.ts`: E1 to E5.
  - No other `journeyPractice` caller exports a packet. The callers are the ledger, layout-1280, monitoring,
    era-exports, models, triage, reports, viewer-phi and brand journeys; they may show the disabled Export card,
    which `expectAccessible` covers.

`packages/db`
- `migrations/20261103090000_deadline_verification_and_export_attestation.sql`: D7's code (Q6 (a)). This is PR 5's
  own unmerged migration, so no merged migration is touched. Run `pnpm db:domain-model` afterwards; the approval
  line waits for the founder.
- `src/seed.ts`: a SYNTHETIC contact in the development practice's settings (data, not a migration).

Docs
- `docs/adr/0061-…md`: a section "Audit item #37, part 1: the payer's copy (the founder's ruling of 2026-10-20)".
  It records:
  - D1 to D14, the answers to Q1 to Q6, and what PR 8, PR 9 and PR 12 take;
  - the contact email as the one email printed;
  - why release and contract version numbers stay printed (D14);
  - that the model's prompt and input keep their wording until PR 12.
- `docs/product/test-matrix.md`:
  - CAS-16 "Payer's copy of an export | no login, record ID, SHA-256, verification, internal note, or interest not
    computed; approval line, reference and contact printed; the internal record on the review page".
  - CAS-17 "Export with no correspondence contact | refused before anything is queued, with the remedy; the job
    refuses with its code and prints nothing".
  - CAS-18 "Packet found by its reference | every version of the practice whose reference matches, none of another
    practice's".
- `docs/product/reconciliation-001.md`: #37 part 1 under PR 5.

## 5. Tests that prove each rule

Unit tests are T (`apps/worker/src/packets/export.test.ts` unless named), worker db tests DB, web route db tests W,
and e2e steps E.

| Rule | Test |
| --- | --- |
| The payer's PDF holds no login, record ID, SHA-256, verification, audit flag, gap, specialist line, version number, footer or internal term | **T1**: `packetHtml(insertIdentifiers(maximalContent, …), payerCopy)`. `payerCopyLeaks` over the HTML without its `<style>` (text and attribute values) is empty, including with the synthetic drafter's, approver's and specialist's emails as secrets. **T5**: the same over the printed PDF's text and metadata (Title, Author, Subject, Keywords, Creator, Producer), and no `about:blank` or URL. T5 skips without Chromium, and fails in CI if Chromium is missing (`process.env.CI === 'true'` asserts `chromiumInstalled()`, as `print-layout.test.ts` does). **DB1** (worker db): the job's real export in the packet world, its renderer wrapped by `recordingRenderer`. `payerCopyLeaks` runs over the recorded HTML always, and over the PDF text when Chromium is installed. The secrets are the world's user emails, every UUID of its rows and every stored SHA-256. The contact's email differs from every login email in the world |
| The CSV holds none of them | **T6**: the new header; row 1 exactly; `payerCopyLeaks` over the CSV is empty; the formula prefix is still refused (the `=` sample moves to the patient name if Q2 drops the patient control number). **DB1** runs the scan over the stored CSV |
| The approval line, the reference and the contact are printed | **T2**: the exact sentence `Approved for submission by <practice> on 2026-05-02, reference SK6CS-K6CSK.` and the contact line. **DB1**: the world's practice name, `approved_at`'s UTC date, and `packetReference(approved_sha256)` |
| The payer's copy prints exactly the verified narrative, and nothing new inside it | **T4**: the text of the `.narrative` block's paragraphs, tags stripped and unescaped, equals `fillPlaceholders(narrative, identifiers)` split on blank lines and trimmed, one for one. The approval line, the reference and the contact text each appear only outside that block. **DB1**: each sentence of the inserted narrative, whitespace normalised, is in the PDF's text when Chromium is installed |
| The verifier's report still holds | **DB3**: after the export, `export_verifier_report` deep-equals `verifier_report` and passes, and the existing guard tests (wrong format, failed, other narrative SHA-256) pass unchanged. This is a regression check; T4 and DB1 prove what was printed |
| Every marker a narrative may cite is printed | **T3**: for each `content.sources` marker, `[n]` is printed in its section, for a contract and a regulation version, with interest computed, partly computed, not computed, and with no rule on file |
| The dispute window states dates only | **T7**: exact sentences at level 1 and level 2; no `filed within`, no `No dispute window`; `ends_on` null throws |
| Interest states only what code computed | **T8** (Q4 (a)): only computed lines are listed; the total sentence is exact; with none computed there is no table and no total; with no rule on file the sentence is exact; none of the forbidden phrases appear. The CSV `interest` cell is empty for an uncomputed line |
| [2] claims a fee schedule only when one was used | **T9**: regulation, `PERCENT_OF_MEDICARE` and `LESSER_OF` with a percent schedule print the fee-schedule words; `FIXED_SCHEDULE`, `PER_VISIT` and `LESSER_OF` with a fixed schedule print `Payment rules …` |
| The reference is stated by its rule | `reference.test.ts`: D5's four values and the pattern; determinism; a change in any of the first 50 bits changes it; it never matches the hex-run or UUID scan; `normalizePacketReference` accepts lower case, no hyphen, `O`, `I` and `L` and refuses 9 or 11 symbols and `U`; `packetReferencePrefix(packetReference(h)) === h.slice(0, 12)` for 1,000 random hashes; the match filter keeps exactly the rows whose reference matches, two of them included |
| Staff find a packet by its reference, only in their practice | **W6** (route db): a reference typed in lower case without the hyphen finds its case and version; another version of the same practice is not listed; another practice's exported version, looked up by its own reference from this practice, is not found (cross-tenant, under RLS and by `practice_id`; a shared prefix is proved by the unit filter test, since real hashes cannot be made to collide); a malformed reference is refused with its format; a viewer without `practice.open` is refused |
| Dropped items stay internal and show on the review page | **W4** (route db): the review data holds the approval people and time, `approvedAlone`, the regulation confirmation, the evidence gaps, the evidence and manifest SHA-256, the version SHA-256 and the reference. **E4** checks that the Internal record card shows them |
| Only the practice administrator sets the contact; Postgres refuses the rest | **DB4** (worker db, `correspondence.db.test.ts`): the administrator sets it (one audit event, with no value in it). A billing manager is refused by `requireRole`, and the same UPDATE run in their scope changes no row. Another practice's administrator cannot reach it (cross-tenant). `proof_level`, `posting_export_template` and the pricing keys are kept. A malformed value reads `malformed`. **W3**: the action's input errors; a 403 for a billing manager; the page is read-only for a billing manager and for an internal user under a support grant; `canSetCorrespondence` is true only for `practice_admin` reached by ownership (no role but `practice_admin` holds `agreement.sign` today, so the rule is pinned at the function) |
| No export without a contact | **W1**: the request is refused with `contact_missing` and its remedy and queues nothing, then queues once the contact is set. `requestPacketExport` refuses (`packets.db.test.ts`). **DB2** (`export-attempts.db.test.ts`), under Q6 (a): the job on a version whose practice has none records `packet_export_refused` with purpose `contact_missing`, returns `not_exportable` (no throw, so no retry), stores no file and leaves the version unexported; the existing test that `PACKET_EXPORT_REFUSALS` equals `packet_export_refusal_codes()` covers the new code. Under Q6 (b): the job throws, records `unexpected`, and the handler logs `PACKET_EXPORT_CONTACT_MISSING`. **E1**: the disabled button and its reason |
| The server requires every attestation item | **W7** (`workbench-routes.db.test.ts`): for each of the seven `confirm_<id>` fields, an attestation without it is refused as invalid input and writes nothing (`attested_at` stays null, no `packet_export_attested` event); with all seven it attests. **W5** (`review.test.ts`): the checklist ids equal `PACKET_ATTESTATION_ITEMS`, and the attest schema's `confirm_*` keys equal them |
| File names carry the reference | **W2**: the four routes' `Content-Disposition` values are `payment-dispute-<REF>.pdf` and `payment-dispute-<REF>-schedule.csv`, with no UUID |
| A narrative cannot print the patient control number (Q2 (a)) | `packets.db.test.ts`: writing a version whose narrative holds `{{patient_control_number:1}}` is refused with `narrative_withheld_identifier`, and nothing is written; the same narrative with `{{claim_control_number:1}}` is written |
| Drafts and the reference set carry no internal term | **T10** (`assemble.test.ts`): `draftNarrative` of a contract and a regulation version, with interest computed, not computed and absent, holds none of the terms (`could not be computed` included) and still passes the verifier. `gate.golden.test.ts` still passes all 300 reference narratives, against the re-recorded baseline |
| Copy and logs | `pnpm lint:copy` (`apps/worker/src/packets` and `apps/web/src` are copy roots); `pnpm lint:logs` (the contact is never logged) |

E2E (`apps/web/e2e/packets.spec.ts`), changed steps:
- **E1**: the approver's Export button is disabled, its accessible description naming Settings, Correspondence; the
  request route refuses too.
- **E2**: the practice administrator sets the contact on Settings, Correspondence (`expectAccessible` on the page);
  the approver exports.
- **E3**: the PDF downloads as `payment-dispute-<REF>.pdf`, where `<REF>` is what the packet page shows. Its text
  (`printedPdfText`) holds the approval line with that reference and the contact. It holds none of the drafter's or
  approver's sign-in emails, no `SHA-256`, and not the version ID in the URL. The CSV has no trace or SHA-256
  column. Today's hash checks stay.
- **E4**: the reviewer's page shows the Internal record card (the approval record with emails, the version SHA-256)
  and the seven-item checklist; the attestation and the submission log follow as today.
- **E5**: on Cases, the reference typed in lower case finds the packet and opens it.

Verifier tests in `packages/packets` do not change: their inputs and rules are the same. Golden (apart from the
re-recorded narrative baseline), oracle and engine tests are unaffected.

## 6. Out of scope

- Part 2 (PR 8): the 835 payee's name, TIN (sealed) and address; remark codes; the contract's legal-entity TIN; the
  route's payer address, form and required fields.
- Part 3 (PR 12):
  - the two outputs (payer set and internal manifest) from one frozen version;
  - the cover letter and the route-titled heading;
  - the per-claim schedule in payer terms (billed, paid, patient share, the payer's codes, check or EFT);
  - page images and a remittance excerpt;
  - the request that the payer state its provision;
  - D26's scoped exports;
  - the narrative's wording under CO-06, and the model prompt's words and input;
  - CMS terms in place of release numbers (with #38).
- Part 4 (PR 9): the check (gate 7 reads the route).
- The title "Request to reprocess underpaid claims", the X12 qualifiers in identification (`2U:`, `CE:`), "tax ID
  ending".
- A billing manager or a firm setting the contact; per-payer contacts; a firm's white-label correspondence.
- A practice time zone; printing an earlier export again; refusing a late first-level submission (Q3 (b) only).

## 7. Founder questions

**Q1. What must the correspondence contact hold before a packet can be exported?**
- (a) Recommended: a name or office and a phone number, required; extension, email and mailing address optional;
  no export until it is set. If set, the contact's email is the only email the payer's copy prints. Gives up: some
  packets give the examiner only a phone number in writing.
- (b) Name, phone, email and mailing address all required. Gives up: one more setup step for every practice, and
  some will type a personal email to get past it.
- (c) Optional, with the packet printed without a contact line. Gives up: an examiner may have no one to call, and
  the packet names nobody who answers for it.

**Q2. Should the payer's PDF and CSV drop the patient control number now?** Your accepted D26 sets the payer's
identifiers as claim control number, patient name and member ID. Audit #37 part 3 (PR 12) adds the patient account
number back only where a route's form requires it.
- (a) Recommended: drop it now, from both files. A narrative that refers to a row by it is also refused when the
  version is written, so it cannot reach the payer through the letter either. Gives up: a payer that searches by
  the provider's account number has one key fewer in the packet; the practice still has the number for any form
  that asks.
- (b) Keep it until PR 12. Gives up: until then, packets go beyond the payer scope you accepted in D26 (a), though
  the payer already holds the number from the claim and the 835.

**Q3. Should the payer's copy say the dispute is timely?** The PDF is printed at export. The practice sends it
later, after the reviewer attests, and that queue can take days (audit #40). The product does not refuse logging a
first-level submission after its window.
- (a) Recommended: no. It prints only the dates code knows (D2): "The earliest dispute window among the listed
  lines ends on <date>." Gives up: the examiner compares that date with the day they received the packet; the
  letter does not assert timeliness.
- (b) Add "This dispute is filed within the dispute window, which ends on <date>." Gives up: it can be false when
  the practice sends late. Making it true needs a refusal of late first-level submissions in `submission_belongs()`
  (a schema change in a later PR), and even then the product cannot see the day the payer receives it.

**Q4. How should interest be worded where code could not compute it?** State prompt-pay interest is generally owed
by statute, so a letter should not read as giving it up.
- (a) Recommended: D9. List interest only for the lines where code computed it, total it as "Interest stated in
  this request: $X", and say nothing about the other lines. With nothing computed, print the state rule only (or
  "Prompt-pay interest is not stated in this request." when no rule is on file). Gives up: the payer's copy does not
  flag which other lines may carry interest; the practice can still claim it later.
- (b) "not claimed" on those lines and "No interest is claimed." with none computed. Gives up: it can be read as
  waiving interest the statute owes.
- (c) Keep today's "cannot be computed". Gives up: it tells the payer where the claim is weak (audit #37) and reads
  as an internal note.

Recommended with either: counsel confirms Q3's and Q4's sentences before the first real packet is sent. Say whether
you want that.

**Q5. Do you approve the reviewer's checklist wording?** In v0 you are the reimbursement reviewer who signs it.
- (a) Recommended: D10's seven items as written. They add `payer_copy` and correct `figures` to cover the contact,
  which comes from the practice's settings, not the version. Gives up: one more box per attestation.
- (b) Keep the six items and change only `figures` to cover the contact. Gives up: no attested check that the
  payer's files carry no login, ID, hash or internal note; that rests on the tests alone.
- (c) Your own wording for any item. Gives up: nothing; the build waits for the text.

**Q6. May the job's refusal for a missing contact be a coded refusal (one SQL function changes)?**
- (a) Recommended: yes. `'contact_missing'` joins `packet_export_refusal_codes()` in PR 5's own unmerged migration
  and joins `exportReadiness()`. The packet page, the web request, `requestPacketExport` and the job then share one
  refusal with its remedy, and the job never retries it. Gives up: part 1 was described as "no schema change". The
  regenerated domain model is one you confirm with the rest of PR 5 anyway.
- (b) No schema change. Gives up: if the state is ever reached, the job tries three times, 30 seconds apart with
  backoff, and the packet page says "The export stopped on an unexpected error." with no remedy. The web needs a
  reason of its own beside readiness.

## 8. Open items

1. The fix round is still pushing PR 5. The builder starts from its final head; the files listed at the top change
   under both.
2. Shape and permission in Postgres: there is no CHECK on the contact's shape, and only the administrator sets it.
   PR 6b already changes practice settings (ZIP+4); its migration can add a `practice_correspondence_contact`
   CHECK, and a `correspondence.set` permission with a definer setter if billing managers should set it.
3. The approval date and `prepared` are UTC dates: an approval after 7 or 8 p.m. in US time zones prints the next
   day. A practice time zone belongs with PR 12's letter.
4. Which contact an export printed is kept only in the PDF bytes, and which template printed it is not recorded.
   PR 12's export tables (D26) can record both.
5. The narrative stays the person's or the model's words. The verifier checks its figures, not its vocabulary, and
   the model's prompt and input keep `interest.computed` until CO-06 in PR 12. The approver reads it, and the
   reviewer's `payer_copy` item covers it.
6. The e2e needs a practice administrator persona for the packets practice, and `pnpm db:seed` needs a SYNTHETIC
   contact so `pnpm dev` exports work.
7. Medicare Advantage packets cannot export until Q34. Their regulation copy is covered by T1, T3 and T9, not by
   the e2e.
8. PR 5's approval summary lists #37 part 1. Under Q6 (a) it names the one function body changed; under (b) it says
   there is no schema effect.

## 9. Review

Findings of the independent review of 2026-10-20, each checked against `origin` `2a07505` and the `/home/user/pr5`
working tree.

1. **"Filed within the dispute window" asserts what code cannot know (blocking).** Real: `submission_belongs()`
   checks the window only for a reopened level, and `packetDeadlineStatus` is `not_applicable` only with zero
   lines. D2 now prints dates only and drops both the "filed within" and the "No dispute window" sentences. A null
   `ends_on` throws. T7 tests it, and Q3 asks about timeliness wording.
2. **"Not claimed" can read as a waiver (blocking).** Real, and it is legal wording. D9 is rewritten to the
   recommended Q4 (a): computed lines only, "Interest stated in this request", no total when nothing computed. Q4
   asks, with counsel review recommended. T8 tests it.
3. **The attest action's schema omits `payer_copy` (blocking).** Real: `routes/packets.ts` lists six
   `confirm_*` fields by name, and only the browser requires the box. The schema is now built from
   `PACKET_CHECKLIST` (D10). W7 refuses each missing field and checks nothing is written; W5 pins the keys. The
   literal six-item checklists at `packets.db.test.ts` 579 and 609 are updated, though the CHECK would accept them
   either way.
4. **The founder's attestation is reworded without asking (should fix).** Real: `attestPacketExport` calls it "the
   founder's attestation". Q5 now asks. `figures` is corrected to cover the contact from `practice.settings`.
5. **Files missing from the change list (should fix).** Real: `ledger-world.ts` `submit()` exports on a
   triage-world practice; `packets.db.test.ts:275` asserts the old header; `workbench-routes.db.test.ts:411`
   asserts the old name. The contact is now seeded in `TriageWorld.practice()`, which covers the packet, ledger and
   web route worlds. Every `exportPacketVersion`, `requestPacketExport`, `requestExportOnce` and `journeyPractice`
   caller is named in section 4.
6. **The draft narrative still says "could not be computed" (should fix).** Real: `draft.ts:59`,
   `narrative-set.ts` 178 and 206, and MOD-03. `draft.ts` and `narrative-set.ts` change alike, MOD-03 is
   regenerated, and the local narrative baseline is re-recorded (its set SHA-256 is asserted). The prompt and the
   model's input stay until PR 12, recorded in ADR 0061. The term list gains `/\bc(?:an|ould) ?not be computed\b/`
   (T10).
7. **The verifier test proves nothing about the print (should fix).** Real: the renderer is not a verifier input,
   and the triage world falls back to a stand-in PDF without Chromium. T4 (the `.narrative` block equals the
   inserted narrative, and the new items sit outside it) is added. DB1 scans the HTML through a recording renderer
   always and the PDF text when Chromium is installed. T5 fails in CI if Chromium is missing. DB3 is kept as a
   regression check only.
8. **No lookup by reference; wrong odds (should fix).** Real. The lookup is added now, with no schema: D5, W6, E5
   and CAS-18. Section 6 no longer lists it. The odds are corrected to about 4.4 × 10^-6 at 100,000 versions.
9. **The missing-contact job failure is retried and shown as unexpected (should fix).** Real: `exportFailureCode`
   maps it to `unexpected`, `retryLimit` is 2, and the handler logs `EXPORT_FAILURES[code]`. D7 is rebuilt on the
   recommended Q6 (a), one coded readiness reason. Under (b) the handler gets its own log code and a test. The
   header's schema line and open item 8 now say this.
10. **Q2 (a) leaves the narrative placeholder open; (b)'s downside is slanted (should fix).** Real:
    `PLACEHOLDER_KINDS` includes `patient_control_number`. Under (a), `writePacketVersion` refuses that
    placeholder; the verifier format is unchanged, and a test was added. (b) is reworded to "beyond the payer scope
    you accepted in D26 (a), though the payer already holds the number".
11. **The fix-round overlap list is incomplete (nit).** Real. The header now lists every shared file from the
    working tree's status, and says to rewrite `export.test.ts` from the fix round's version.
12. **Record numbers and "fee schedules" in [2] (nit).** Real. D14 records why release and contract version
    numbers stay (narratives cite them) and what replaces them. [2] and the rule-release evidence item are worded by
    the citation's method (T9).
13. **The hex-run rule hits claim numbers; the email exception is unstated (nit).** Real: print-layout pads 32
    zeros. The scan now removes inserted identifier values and flags only runs that contain a letter `a` to `f`;
    stored hashes are caught exactly as secrets. ADR 0061 records the contact email as the one exception, and DB1
    asserts it differs from every login email.
14. **The settings page's edit rule differs from the setter's (nit).** Real in principle. Today only
    `practice_admin` holds `agreement.sign`, so the two agree, but they could drift. Editability is now
    `canSetCorrespondence` (`practice_admin` by ownership, the setter's and Postgres's rule). W3 pins it at the
    function and for a billing manager and a support-grant user, since no non-admin with `agreement.sign` exists to
    test.

Corrected beside the findings: D8 now gives the old CSV name as `packet-schedule-<versionId>.csv`. Worker db tests
are renamed DB1 to DB4 so they no longer share names with decisions D1 to D14.


## Founder ruling (2026-10-20)
The founder accepted the recommended answer to every question in this design (see scratchpad/design/decisions-2026-10-20.md). Build to the recommended answers and record each ruling in the ADR.
