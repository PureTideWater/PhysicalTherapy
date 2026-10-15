# 0030. Build the mapping, coverage and contract screens on the workflow services, keep the specialist's questions in their own table, and count the specialist queue without reading a record

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 3 (Personas; internal roles reach a practice only through the support path), 5 (J5, J6), 6 (Payer
  and plan mapping; Contract repository; Admin console: "no admin screen can read PHI without a support grant";
  cross-cutting requirements), 7 (Payer and plan mapping, Contracts, Rate record review, Coverage, Internal console
  Specialist queue, Information architecture rules), 11 (Unpriced reasons); Rules reference, Unpriced reasons and their
  remedies; Data dictionary, Payers, contracts and rates; test matrix MAP-01 to MAP-05, CON-01 to CON-07; ADRs 0017,
  0026 and 0028; migration 20261016200000

## Context

Milestone 3 part C and milestone 4 part B put screens on the contract repository of ADR 0028: Payer and plan mapping,
Coverage, Contracts, Rate record review and the internal console's specialist queue, each through the route wrapper and
registry of ADR 0017. The plan leaves open: where the specialist's "questions to customers" live (PRD 7 names them on
two screens and J5 turns an unabstractable document into a Coverage item "telling the customer what to obtain", but the
data dictionary has no table for them); how the console lists a practice's documents awaiting abstraction when a
console screen reads no practice's rows and a specialist has no standing access; how a route serves both the customer
and the specialist when the specialist holds `rate_record.edit` and nothing of the customer's (`practice.open`); what
"tagging a document to a payer" stores when `source_document` has no payer column; what Coverage counts before any
pricing run exists (pricing runs arrive in milestone 7); and how the route tests' "every persona, every route" holds
for sign-off and mapping, which a second identical request would otherwise refuse.

## Decision

**Questions are a PHI table, `contract_question`**: practice, contract (required), optionally a version and a document,
a topic (missing pages, missing schedule, undefined method, scope, timed units, windows, other), the question and the
answer encrypted with the practice's key (free text, like `line_note`), who asked, and who closed it (answered by the
customer, or withdrawn by the specialist) and when. It changes once: a trigger keeps everything else as it was and
records the closer and the time; a restrictive policy lets nobody ask in another person's name. Asking and withdrawing
are the specialist's routes (`rate_record.edit`); answering is `contract.sign_off`'s (the practice administrator, the
billing manager, the firm principal), whose holders accept the contract. The three "obtain" topics show on Coverage as
what to obtain.

**The console's specialist queue counts only**, through `console_contract_queue()`, a SECURITY DEFINER function for a
contract specialist (`contract.review`) or a platform administrator (`support_grant.create`): per active practice, the
clean stored contract documents no approved, signed-off or superseded version names, the drafts, the proposals, the
versions awaiting sign-off, the open questions, and the caller's own open support grant. It reads the rows under their
tenant policies with every active practice in `app.practice_ids` for its one query and puts the caller's setting back
before returning (an error aborts the transaction or savepoint, which undoes the setting too); it returns no document,
contract or question. The catalog test names it among the reviewed definer functions that set the scope
(`REVIEWED_SCOPE_FUNCTIONS`, ADR 0032), so no other function can widen it unnoticed. The specialist opens a practice
only under its support grant (ADR 0028), which the console's
support form now offers for contract specialists as well as support engineers (`support_grant_role()`).

**Customer and specialist routes are separate**, one permission each: the customer's screens under
`/p/[practiceId]/{mapping,coverage,contracts}` need `practice.open` (mapping needs `mapping.edit`, tagging `file.upload`,
sign-off and answers `contract.sign_off`); the specialist's under `/p/[practiceId]/abstraction` need `rate_record.edit`,
which only the contract specialist's role holds in a practice (approval also needs the platform permission
`rate_record.approve`, checked by packages/contracts and the database). Both review screens render the same review: the
cited page's text with the quote marked (found the way evidence compares text: NFKC, any whitespace between the quote's
words), and every field with its approval, its quote, its page and whether the citation resolves now. The specialist's
home is the queue; a specialist's practice links open the abstraction screen.

**Tagging creates the contract's draft.** A document is tagged to its payer by starting a new contract with the payer
and a draft version naming it, or by naming an existing contract of the payer: the document joins its draft or proposed
version (`attachDocument`, new in packages/contracts, `file.upload` or `rate_record.edit`, drafts and proposals only), or
starts a new draft version from the date given, which the database refuses with its rule when the window overlaps
(CON-01). An amendment of a signed-off version stays the specialist's (`amendVersion`). Uploading itself is the intake
flow of ADR 0026 with the kind contract, exhibit or payer letter.

**Mapping maps to a signed-off version of one of the plan's payer's contracts**, or as no agreement, Medicare Advantage
non-contracted, government or other, from a date (the form takes a last day, stored as the next day: windows stay
half-open). A plan's page resolves its lines now with the pure `agreementResolver` over the loaded records, grouped by
what resolution reads, so it shows the version pricing will use or the unpriced reason before any run exists.

**Coverage before pricing runs** shows zero priced lines and dollars and a zero count for every reason, says why, and
shows what is already known: the dollars waiting on mappings (`dollarsWaitingOnMapping`), whether a run over every line
would be refused for an unmapped plan (the run's own guard, `assertPracticePricingAllowed`), and the open questions to
obtain. The reasons, meanings and remedies are the rules reference's table, word for word (a unit test compares them),
each remedy linked to its screen; "None" links nowhere. The request-to-payer letter is text from one fixed template,
downloaded as `request-to-payer-<payer id>.txt`.

**Repeated requests are idempotent where people collide**: the same mapping submitted again, a sign-off of a version
already signed off, and the same answer to an answered question change nothing and succeed; a different answer is
refused. So the generated route tests' every-persona calls hold, and two people pressing the same button see the same
result.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Questions in the audit log or as notes on a version | Not readable or answerable as records; the audit log is append-only evidence, not a work queue |
| A payer column on `source_document` for the tag | The data dictionary has none; the contract (which has a payer) and its version's documents already record it |
| One route with "any of" two permissions for customer and specialist | The wrapper, the registry and the generated tests hold one permission per route; two routes keep each audience's check exact |
| A console queue listing documents, or owner policies reading every practice | Names records a console screen must not read (PRD 6); an owner-wide policy would serve every SECURITY DEFINER function, not this one |
| Letting customers draft amendments (`amendVersion` with `file.upload`) | The amendment copies terms for re-verification, which is the specialist's work; the customer tags, the specialist amends |
| Counting unpriced reasons by resolving every line now | Coverage reports pricing runs (PRD 7), which milestone 7 creates; the plan page shows the resolution per plan meanwhile |

## Consequences

- `pnpm test:db` grows by the twenty-four new routes' generated tests; every route-test world now holds a support grant
  for the contract specialist and contracts at every state, built through packages/contracts' services.
- `contracts-routes.db.test.ts` runs MAP-01, MAP-03 and MAP-04 and CON-01 to CON-04 through the routes on the synthetic
  fixtures; the e2e suite maps a plan and watches Coverage change, abstracts and signs off a contract, and is refused an
  overlapping version.
- pdf.js runs its worker module in the server's own thread (packages/contracts imports it), so the bundled web server
  reads contract pages; documents larger than 64 MiB cite as unsupported rather than being read into memory.
- Milestone 7's pricing runs fill Coverage's shares and counts and offer the re-run after a mapping correction (MAP-03);
  milestone 10's proposals fill the queue's proposals column; milestone 13's alerts read the calendar the sign-off writes.

## Revisit when

Pricing runs exist (Coverage's counts, the re-run offer), the model gateway proposes abstractions (the proposals
column and its verifier on the review screen), or a customer needs to answer or upload against a question in one step.
