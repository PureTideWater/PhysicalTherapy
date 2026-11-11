## What changes

A payer letter read by the denial-letter reader (`readDenialLetter`, behind its own flag) is redacted, or refused for a
person to read, in forms that the range fix (#138, ef3e8d20) left as three accepted residuals. Nothing a person sees
changes: the refusal reuses `identifier_left`. All of it is in `packages/redact/src/redact.ts` (the letter reader's
`redactLetterForScreen` and `holdsIdentifier`), with a look-alike table beside it; the rules, their counts and what is
still not covered are in ADR 0054's amendment of 2026-11-11.

- **Ruling A, Social Security and phone numbers** (test matrix MOD-21):
  - glued to another number where structure says whose the other digits are: a currency amount's digits, an amount's
    cents or a date's end before the number's own shape; cents (a range after them too), a second number or a date
    after it; a date after a bare nine or ten; an amount's cents before a bare nine or ten;
  - behind a label with the call's own identifier or the label's list number between them (`Call <name> at 555-0123`,
    `Phone 1: 555-0100`, `Phone (2) 555-0100`), read as the label reads the text without them;
  - masked and glued to a word, a year, a date or an amount's cents; after a Social Security label glued to a word;
  - in a letter whose digit chain only the range fix's barriers hold (a letter cc3dd7f6 refused whole): the shapes no
    structure decides are refused there, as cc3dd7f6 refused them.
- **Ruling A', the call's own name, member ID, claim number and date of birth** (MOD-22): written with another script's
  look-alike letters or digits (a table from the Unicode confusables data, in the repository), with a digit for a
  letter or a letter for a digit, with a middle dot or a bullet inside the name, glued inside a longer run, and, in a
  held letter, the date of birth in writings no rule read.
- **Ruling B:** a month's word that is a name part is a date's month only in a date with two numbers or more; `May 2020`
  for a patient named May is redacted as the name.
- **One principle keeps the base's reading whole:** ef3e8d20's own matches are read first, and a match it did not make
  is applied only where the letter is not refused without it; whatever is left as written the check finds again and
  refuses.

## Why

The orchestrator's rulings A, A' and B of 2026-11-07 on the three residuals that end ADR 0054's amendment of
2026-11-04 (`lanes/STATE.md` item 3; `LANES.md` Queues item 22): they are to be closed before any real PHI is
processed. Acceptance: every pinned row of `redact.residuals.json` classes `ssnPhone` (697) and `ownIdentifierA` (406)
is redacted or refused, ruling B's five rows have a decided rule, and the differential gate against cc3dd7f6 reads no
Social Security or phone letter. MOD-23 (`LANES.md` Queues item 26) owns the two name forms this change leaves and pins
as they are sent today.

## What it does not change

- Pricing engine (`packages/pricing`): unchanged. No file under it is in the diff.
- Ledger (`packages/ledger`): unchanged. No file under it is in the diff.
- Database schema and migrations: unchanged. No migration, no SQL, no function file.
- Content releases (`content/`): unchanged.
- Domain model (`docs/product/domain-model.md`), its approval line and `approvers.json`: unchanged.
- CI and the GitHub settings: unchanged. No workflow, action, manifest, lockfile or settings file is in the diff.

Also unchanged, which a reader might assume moves:

- **The narrative's check and the packet verifier** (`holdsNameOrNumber`, `nameOrNumberMatches`; `@tp/packets`) read a
  name and a number exactly as before: the new name joiners, the look-alike fold and the digit-for-letter forms are the
  letter reader's alone, and the verifier's own test that pins what the matcher does not read passes untouched.
- **Contract pages** are sent as stored: none of this reads for a contract-screen function.
- **No new prompt version**, and no field the reader returns changes; `[SSN]`, `[PHONE]` and the call's own
  placeholders are the ones the prompt already describes.
- **`redactLetter` and `redactionSpans`**, which no check follows, redact what ef3e8d20 redacted and more, never less.
- **What must stay** is sent as before but the costs ADR 0054 records (each the safer reading, each measured there).

## Checks

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`,
`screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

@@CHECKS@@

## Reviewer agents' findings

@@REVIEWS@@

## Freeze exception

No: it changes none of them. The engine's arithmetic, the ledger's semantics, the content pipeline and the milestones
and their gates are untouched. The redaction implements the founder's ruling of 2026-11-01 on PRD 14 PHI minimization
and the orchestrator's rulings of 2026-11-07 on its residuals; it adds no control and removes none.

## Domain model

No migration; the document is unchanged.

## The founder's approval

This pull request merges only after the founder's approving GitHub review of its latest commit and green required
checks. The build waits for that review from the day it works under its own GitHub account
(`docs/runbooks/github-governance.md`, 3i), and from step 5 GitHub requires it too; before 3i, on green checks alone
(reconciliation 001, D4 (a)). The review is the record of the approval, not anything written here; a new commit
dismisses it. The build then merges, and never reviews.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_019i9ifC8ouxG6CLPdZtgAcJ
