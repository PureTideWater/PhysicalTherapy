# 0028. Hold contract versions and their rules in the database, let specialists in through support grants, and resolve agreements purely

- **Status:** accepted (amends 0013, 0017 and 0019 where they say a support grant goes only to a support engineer)
- **Date:** 2026-10-16
- **Deciders:** founder (engineering)
- **PRD sections:** 2 (Which agreement governs the line), 3 (Personas; "the company's internal organization has
  grants only through the support path"), 5 (J5, J6), 6 (Payer and plan mapping; Contract repository; Admin console:
  "no admin screen can read PHI without a support grant"), 7 (Contracts, Rate record review, Payer and plan mapping,
  Specialist queue), 8 (contract, contract_version, rate_record, payer_plan_mapping), 9 (Contract rate records), 11
  (Inputs; Algorithm step 1), 20 (Medicare adjustment flags off on commercial contracts; timed-units rule UNKNOWN);
  Data dictionary, Payers, contracts and rates; Rules reference, Medicare Advantage and Commercial contract methods;
  test matrix CON-01 to CON-07, MAP-01 to MAP-05; migration 20261016160000

## Context

Milestone 4 part A builds the contract repository's backend: contract, contract_version, rate_record,
contract_calendar_event and payer_plan_mapping as PHI tables; the version states; non-overlapping windows;
supersession instead of edits; approval by a contract specialist and sign-off by the customer, checked in SQL; evidence
that resolves to a page; and agreement resolution the pricing engine can call without a database. The plan fixes the
states, the invariants and the closed list of unpriced reasons, and leaves open: how an internal contract specialist
reaches a practice's records at all (milestone 1 gave internal roles no route but a support engineer's support grant);
who may sign off and how that is a permission; what "approve field by field" stores; when an amendment closes its
predecessor's window and how versions can never overlap while a successor is being abstracted; how a mapping is
corrected when "old rows unchanged" rules out marking it; what a mapping to a version means after that version is
amended; and the exact shape of scope, parameters, flags and evidence.

## Decision

**A contract specialist reaches a practice only through a support grant.** PRD 3 sends the company's own staff to a
practice's data through the support path only, and PRD 6 lets no admin screen read PHI without a support grant; the
contract tables are PHI tables. So a support grant may now go to a contract specialist as well as a support engineer
(`support_grant_role()`; still never to its creator, still at most four hours, still noticed to the practice
administrator and logged), and `effective_practice_access()` gives the grantee its own internal role on the practice:
`support` for a support engineer, `contract_specialist` for a specialist, who therefore holds `rate_record.edit` there
and nothing else of the practice (no `practice.open`, no `phi.read`). Approval is the platform permission
`rate_record.approve`, so it needs both the specialist's internal role and the practice in scope.

**Sign-off is a permission, `contract.sign_off`** (practice scope): the practice administrator and the billing manager
(J5), and the firm principal, who does everything a billing manager does (PRD 3); the reviewer is denied it like every
write. Tagging an uploaded contract to its payer (creating the contract and its draft) is part of uploading
(`file.upload`) or the specialist's (`rate_record.edit`); mapping is `mapping.edit`.

**Versions.** Windows are half-open `[effective_from, effective_to)`: `effective_to` is the first day not covered,
which is exactly "the amendment's start", and null is open-ended. States move only forward: draft to proposed (a
model proposal, v1) or straight to approved (v0, by hand), proposed to approved, approved to signed_off, and signed_off
or approved to superseded. A trigger enforces each move and that approval records the approving specialist and the
transaction's time (`app_actor_platform_permitted('rate_record.approve')`), sign-off the signing customer and time
(`app_actor_permitted(practice, 'contract.sign_off')`), and that an approved or signed-off version and its rate records
never change otherwise (CON-03). An exclusion constraint keeps windows of one contract apart (CON-01) over every
signed-off version and every version that supersedes nothing; a successor (an amendment or a correction, which names
its predecessor in `supersedes_id`) claims its window only when it is signed off, so a draft amendment can be
abstracted while its predecessor keeps pricing. Its sign-off retires the predecessor in the same statement, before the
successor's row is stored: an amendment starting inside the predecessor's window sets its `effective_to` to the
amendment's start and changes nothing else (CON-02); a correction starting on or before it (or any successor of a
version never signed off) marks it superseded. The predecessor's own trigger accepts exactly those two changes when an
approved successor names it, and a deferred constraint trigger checks at commit that the successor was in fact signed
off, so no hand-made update can close or supersede a version. The owner role cannot install btree_gist, and a range
type's constructor functions belong to the bootstrap superuser, so the constraint compares contract IDs exactly through
their two 64-bit halves as one-value `int8range`s (`uuid_half()`).

**Rate records.** `scope` holds codes (required), and optionally modifier sets (a line matches a set when its
modifiers, ignoring order and empty positions, are exactly that set), places of service, provider types and a window;
absent lists match anything. `parameters` follow the method: an amount per unit (`FIXED_SCHEDULE`); a percentage,
`CURRENT` or `LOCKED:<year>`, a locality basis (the practice's or a named carrier and locality) and the conversion
factor (`PERCENT_OF_MEDICARE`); the schedule (fixed or percent of Medicare) and `LINE_CHARGE` (`LESSER_OF`); an amount
per claim and date for the scope's codes (`PER_VISIT`); nothing (`UNSUPPORTED`). Cents are integer text and
percentages numeric(14,6) text in JSON, `Cents` and `Decimal` once parsed. Flags left out are off and the timed-units
rule `UNKNOWN` (PRD 20); Medicare Advantage non-contracted terms are constant (100% of the current year, the practice's
locality, the non-qualifying factor, every flag on, `MEDICARE_POOLED`). `rounding` is null where the contract is silent
(the practice's default applies, PRD 11). The windows (timely filing, dispute, appeal levels) are the version's, as the
data dictionary puts them; a resolved rate carries them. `contract_version.notice_days`, a column the dictionary does
not list, holds the notice period the calendar's notice deadline needs.

**Field-by-field approval and evidence.** `evidence` is `{document_id, page, quote, hash}` plus `approved_fields`, one
`{by, at}` per field (scope, method, parameters, flags, rounding), so a partial review survives a refresh. The database
lets only a specialist add an approval, in their own name at the transaction's time, removes the approval of whatever
an edit changes (all of them when the citation changes) and the verification with it, and verifies a record only when
all five are approved and the evidence names a document of the version, a page, a quote and a hash (CON-04). The page's
`hash` is the SHA-256 of its text after one normalization (NFKC, whitespace collapsed, trimmed), and a quote resolves
when, normalized the same way, it is a substring of that text. `EvidenceResolver` reads text PDFs with pdf.js and pages
without a text layer through `ScannedPageReader`, whose `TextractPageReader` runs Textract's asynchronous text
detection on a copy the caller stages (Textract cannot read the application-sealed objects of ADR 0018). The services
compute the hash when a specialist cites a page and refuse a citation that does not resolve; a model's proposal carries
the hash of the page it read, is stored as given, and its check is returned beside each record (CON-05), and the record
cannot be verified, nor its version approved, until it resolves.

**Amendments and corrections copy terms.** `amendVersion` and `supersedeVersion` draft the successor with the
predecessor's documents and windows and copies of its rate records (citations kept, approvals cleared), which the
specialist verifies again against the new documents; a draft's records can be edited and deleted, and nothing else's.

**Mappings never change.** A correction is a new row that names the mapping it supersedes (MAP-03); since the old row
is never marked, an exclusion constraint cannot hold the rule, and a trigger does, under a per-plan advisory lock: a new
mapping may overlap only the mappings it descends from. The mapping in force on a date is then the last correction that
covers it. A mapping names a contract version, and resolution prices under that contract's signed-off version covering
the service date, so an amendment does not need a remapping.

**Agreement resolution is pure** (`agreementResolver`, `resolveAgreement`): the mapping in force, then NO_MAPPING,
NO_AGREEMENT (no_agreement, government, other), MA_NONCONTRACTED with its terms, DATE_OUTSIDE_VERSIONS (no signed-off
version covers the date: only signed-off versions price, CON-07), NO_RATE_FOR_CODE, AMBIGUOUS_RATE (more than one
matching record, never a choice, CON-06), or the one record with its windows. Inputs the database rules out raise
`AgreementInvariantError`, which the engine records as ENGINE_ERROR. `assertPricingAllowed` refuses a pricing run over
a plan with no mapping at all, or a line with no plan (MAP-01); a mapped plan's lines outside its windows resolve to
NO_MAPPING one by one (MAP-02). `dollarsWaitingOnMapping` is the Coverage query: per plan, the lines no mapping covers
on their service date, with counts and billed and paid totals.

**The calendar** is derived at sign-off: the next anniversary of the contract's start inside the version's window, the
notice deadline before the next anniversary whose deadline has not passed, the next January 1 when a record follows the
current Medicare year, and an amendment's start.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| A standing route for specialists into every practice's contract tables | Internal roles would hold standing access to PHI tables, which PRD 3 and ADR 0019 rule out; switch if counsel treats contracts as outside the PHI boundary and the plan gives specialists a queue-wide grant |
| A separate contract-only scope setting for specialists | A second tenant setting, reviewed permissive policies on five tables plus documents and practices, and a new scope kind in authz; the support path already has expiry, notices and read logs |
| Closing the predecessor when the amendment is drafted | Lines after the amendment's start would go unpriced for as long as the abstraction takes, and an abandoned draft would leave a gap no one could close; sign-off is when the customer accepts the change |
| Every version in the exclusion constraint | A correction or amendment could not be drafted while its predecessor still prices |
| Per-field approvals in a new table or column, or only in the audit log | A new PHI table the dictionary lacks, or state the application cannot read back; `evidence` already holds what each field rests on |
| btree_gist, or a range type over uuid | The owner role cannot create the extension, and a range type's constructors belong to the bootstrap superuser, which the migration runner refuses |
| An exclusion constraint on mappings with superseded rows marked | "Old rows unchanged" (MAP-03) forbids marking them |
| Refusing a whole pricing run whenever any line has no mapping on its date | MAP-02 prices a plan's later lines and leaves its earlier ones NO_MAPPING in the same run |

## Consequences

- The internal console's support-grant form (apps/web, milestone 4 part B) must offer contract specialists, and the
  specialist queue reads only directory records until a grant is open; notices call the access "support access".
- Every state change and approval is refused by the database for the wrong role even if a handler forgets its check;
  `pnpm test:db` holds CON-01 to CON-07 and MAP-01 to MAP-05 (`packages/contracts/src/contracts.db.test.ts`) and the
  generated cross-tenant tests cover the five tables.
- Spreadsheet exhibits have no pages to cite; they resolve as `unsupported_document` until a reader for them exists.
- The Textract reader needs a staging prefix under SSE-KMS with a short lifecycle and the IAM to run text detection
  on it (infra follow-up); until then only text PDFs resolve outside tests.
- The calendar holds the next date of each kind; later years' dates are derived when the next version is signed off,
  and the alerts of milestone 13 read them.

## Revisit when

The model gateway proposes abstractions (milestone 10: the proposer's actor and its hash), the pricing engine consumes
`ResolvedRate` (milestone 5), contract-specific adjustments (a percentage or a cap) need parameters, or a customer
contract names provider types the line facts cannot supply.
