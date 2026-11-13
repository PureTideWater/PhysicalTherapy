# Draft: the description of Queues item 40's pull request (stage 5a, not opened)

Title: `fix(redact): Queues item 40 (MOD-25): a number character or an unseen character at an identifier, and the initials after a name cut before its last letter`

Head `co-001/redact-item-40` (from the WIP ref `co-001/wip-redact-item-40`), base `claude/build-platform`. Stage 5b
fills the Checks table on the head it opens with and the reviewers' table from Lane B's two independent reviews.

---

## What changes

The payer-letter reader (`packages/redact`) closes the three forms item 34 left pinned as sent, so a letter that holds
one of the call's own identifiers in one of them is refused or fully redacted before any model call:

- a member ID, claim, Social Security or phone number with a number character that is no decimal digit glued to it
  (`Ref ↀ76543210`, `76543210፩`, `Ref 76543210²`) is refused (R1-3);
- such a number with an unseen character inside it (a control, format or private-use character such as U+0085 or
  U+0000: `Member ID 7654<U+0085>3210`) is refused (R1-4);
- after a name whose match ends in one letter standing alone (`Mari A.M.L.` for MARIA LOPEZ, `ZZ/ZZZZ Z.Z.Z` for
  ZZZZZZ), the dotted initials after it are the patient's placeholder too (ruling (A)).

The drafter's check (`holdsNameOrNumber`) takes R1-3 and R1-4 too. A person sees nothing new: a letter refused for one
of these forms shows the existing refusal. Synthetic letters only.

## Why

Queues item 40 (`LANES.md`), owed before any real PHI is processed: item 34's review 1 findings R1-3 and R1-4, and
residual (A), recorded in docs/adr/0054's amendment of 2026-11-12 (`co-001/redact-item-34`). Rulings: the
orchestrator's of 2026-11-13 09:30, 09:55, 12:58 and 14:38 UTC (ruling 3, ruling (A) as question 4, ruling 5's budget,
the stage-3 costs accepted with Queues item 41 queued). The design: `designs/lane-b-redact-item-40/design-note.md` on
`claude/build-ops`.

## What it does not change

- Pricing engine (`packages/pricing`): unchanged.
- Ledger (`packages/ledger`): unchanged.
- Database schema and migrations: unchanged; no migration.
- Content releases (`content/`): unchanged.
- Domain model (`docs/product/domain-model.md`), its approval line and `approvers.json`: unchanged.
- CI and the GitHub settings: unchanged.
- The reading of a letter as given: not changed by one character. Every new rule only adds a further reading that
  refuses, or (ruling (A)) acts in the wider reading alone. The letter check's work budget, every weight,
  `INITIAL_GAP_AFTER` and the two rows nearest the budget (403,548,210 and 414,023,090 units, both sent) are unchanged.
- The packet verifier's own reading is unchanged.

## Checks

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`,
`screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

Measured on the WIP head 18777df0 (the item's e17c1192 with `claude/build-platform` 4d40557f merged in; the reader's
files are e17c1192's byte for byte, and the base's are 17c234d2's) against the base 4d40557f, synthetic letters only;
the counts are in `designs/lane-b-redact-item-40/stage-5a/measure/` on `claude/build-ops`.

| Command | Result |
| --- | --- |
| `pnpm lint`; `pnpm typecheck` | passed (1,975 files, 0 errors, 0 warnings; 24 projects) |
| `vitest run` packages/redact, packets, synth, model-gateway | 54, 1,825, 192 and 6,050 passed (34 skipped; the two `.db.test.ts` files need DATABASE_URL, run by CI's db job) |
| Item 40's generated set (51,833 letters) | 0 failures in every family, no PHI class |
| Item 34's generated set (14,356 letters) | 0 differ |
| Full uncached gate (975,489 letters, 4 workers) | 0 differ, refused 463,002 on both, PHI / unplaced / reverse classes none, real-shaped newly refused 0; slowest letter 931 ms here, 1,024 ms on the base |
| The two budget rows | 403,548,210 and 414,023,090 units, sent, on both |
| Fuzzed 60,000 (seeds 301 to 303) and the product fuzzer's 60,000 (401 to 403) | base-refused, head-sent 0 in both; the product fuzzer's 6 changed letters each read, nothing newly clear |
| Item 34's cost measure (64 names, 558 texts) | 0 texts changed |
| Ruling (A) over 40 names (453,888 letters a tree) | letters with the name or chain in clear 201,728 to 176,448, refused 0 |
| The 100-letter property, six alternated runs a tree | base 3,268 to 3,504 ms, head 3,341 to 3,452 ms: inside the base's range |
| Stage 5b, on the PR's head | `pnpm test`, `pnpm test:golden`, `pnpm test:db`, `pnpm test:e2e` (to be filled) |

## Reviewer agents' findings

Lane B's two adversarial reviews (review 1, leaks; review 2, cost and regressions, with the design note's scopes) are
run by another session; stage 5b fills this table.

| Reviewer | Finding | Resolution |
| --- | --- | --- |
| (stage 5b) |  |  |

Named costs, each pinned by a test and each in docs/adr/0054's amendment of 2026-11-13:

1. 96 real-shaped rows of the item's generated set newly refused (stage 2: a footnote mark or list number that is a
   number character right beside a number), 16 of each of six forms.
2. 52 real-shaped letters with C1 quotes and dashes (32) or U+0085 line endings (20) refused where the base redacted
   them correctly; accepted at 14:38 UTC, with Queues item 41 to mend such characters at extraction. 32 more that the
   base sent in clear are closed.
3. Three rows outside the item's tests rewritten (`Phone<U+0085>900 77.3283150.00` refused; two letters carry the
   checks' mark; MOD-24's crafted budget row passes the budget in the redaction); accepted at 14:38 UTC.
4. 2.8% of fuzzed letters newly refused (1,685 of 60,000; 1,731 of the product fuzzer's 60,000): the further
   reading's charge on letters holding an unseen character.
5. After a name cut before its last letter, another person's dotted initial that is one of the patient's own letters
   is replaced too (`Mari A. M. Okafor, PT` is `[PATIENT_NAME]. [PATIENT_NAME]. Okafor, PT`).

Left, recorded (not this item's): a phone number by pattern that is not stored, with a number character beside it;
`Maria.M.L.` (no space after a name ending in a word) and an undotted last initial before a word in lower case, on
every tree, proposed for a new queue item.

## Freeze exception

No: it changes none of them.

## Domain model

No migration; the document is unchanged.

## The founder's approval

This pull request merges only after the founder's approving GitHub review of its latest commit and green required
checks. The build waits for that review from the day it works under its own GitHub account
(`docs/runbooks/github-governance.md`, 3i), and from step 5 GitHub requires it too; before 3i, on green checks alone
(reconciliation 001, D4 (a)). The review is the record of the approval, not anything written here; a new commit
dismisses it. The build then merges, and never reviews.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01FcouKRdnrwokt5fwcRT2co
