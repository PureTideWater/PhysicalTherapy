<!--
The build fills in every section before it asks for the founder's approval (docs/adr/0063; the change-management
policy, rule 1). Write "None" rather than leave a section out. No PHI, no real file and no document text here: name
records by their IDs. GitHub offers this template only from main, which has none until launch; until then the build
copies it into every pull request's description itself (CLAUDE.md).
-->

## What changes

<!-- In plain words: what a person using the product, or running the build, will see change. -->

## Why

<!-- The audit item, change-order item, ruling or defect this answers, with its reference. A pull request into main
before launch names the founder's ruling that allows it. -->

## What it does not change

<!-- Answer each line, and name anything else a reader might assume moves. -->

- Pricing engine (`packages/pricing`):
- Ledger (`packages/ledger`):
- Database schema and migrations:
- Content releases (`content/`):
- Domain model (`docs/product/domain-model.md`), its approval line and `approvers.json`:
- CI and the GitHub settings:

## Checks

<!-- Each command run on the head commit and its result, and anything that did not pass, with why. -->

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`,
`screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

| Command | Result |
| --- | --- |
|  |  |

## Reviewer agents' findings

<!-- The payment-engine, security and EDI reviewer agents run before anything that touches money, tenancy or parsing
merges (PRD 17). Name the agents that ran, one row per finding, and how each was resolved: fixed (with the commit),
not a defect (with why), or deferred (with where it is tracked). "Not run" with the reason when the change touches
none of those. -->

| Reviewer | Finding | Resolution |
| --- | --- | --- |
|  |  |  |

## Freeze exception

<!-- Change Order 001, rule 4: nothing changes the engine's arithmetic, the ledger's semantics, the content
pipeline, the security program, or the milestones and their gates without an exception from the founder. Answer
"No: it changes none of them", or "Yes:" with the exception the founder granted, its date and where it is recorded. -->

## Domain model

<!-- Only when a migration changes docs/product/domain-model.md: the document's SHA-256 before and after, as
`pnpm db:domain-model --summary-since <base>` prints them, and that summary; the copy in the `domain model` check's job
summary is the one that counts. The build posts the approval line as a suggested change and never writes it. Otherwise:
"No migration; the document is unchanged." -->

## The founder's approval

This pull request merges only after the founder's approving GitHub review of its latest commit and green required
checks. The build waits for that review from the day it works under its own GitHub account
(`docs/runbooks/github-governance.md`, 3i), and from step 5 GitHub requires it too; before 3i, on green checks alone
(reconciliation 001, D4 (a)). The review is the record of the approval, not anything written here; a new commit
dismisses it. The build then merges, and never reviews.
