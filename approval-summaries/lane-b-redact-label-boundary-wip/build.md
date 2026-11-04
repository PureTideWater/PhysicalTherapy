# build: a sentence end breaks a label's head (MOD-13 seed 460548619)

Worktree /home/user/redact-label-boundary, branch co-001/redact-label-boundary, cut from 24531dc2. There is one local commit, **a01a0737**. Nothing was pushed, rebased, amended or forced. Every heavy command ran under flock /tmp/laneb-heavy.lock with node24. Only synthetic twins were used. There is no migration, no new test-matrix ID and no new ADR. The engine and ledger are untouched.

## The diagnosis holds
- `LABEL_HEAD` let a head word join a qualifier across `\.?` and any `LABEL_SPACE`, line breaks included.
- So "CLAIM.\nID:" and "CLAIM. ID:" were read as one claim label.
- `labelBefore` took that leftmost match. `labelFor` then refused a claim's label for a member ID written as a date (G2), so the member ID was sent.
- On the base, `holdsIdentifier` on the redacted output was also true: the placeholder breaks up the joined label there. That is how the property caught it.

## Reproduced on the base
- **Seed 460548619** (`LABEL_BOUNDARY_SEED`, beside `YEAR_BELOW_1900_SEED`): "Property failed after 118 tests". The shrunk counterexample is exactly the reported one: name "AA CLAIM", member 19900101, claim SYN00000, "Patient: AA CLAIM.\nID:1990-01-01 on file. Dear AA CLAIM, ".
- **"Hi AA CLAIM. ID:1990-01-01 on file."** leaked. The controls "Hi BB SMITH.\nID:1990-01-01" and "ID:1990-01-01" were redacted.
- **Class probe** (scratch/probe2.ts): 35,750 texts of the form "We reviewed the <head><end><bare label><value written 5 ways> on file.", for a member ID and for a claim number. Each was compared with the same text using the neutral head "file".
  - Heads: every head redact.ts knows, plus "claim number", "claim no", "Claim ID", "Member ID", "patient" and "policy".
  - Ends: ". ", ".\n", "!\n", "?\n", ";\n", ":\n", "\n", ". \n", ".\r\n", "! ", "? ".
  - Base: **1,350 member-ID leaks** and **420 claim-number / patient-control-number leaks**.
    - A claim-kind head (claim, icn, pcn, dcn, tcn, control, account, acct, "claim number", "claim no", "Claim ID"), then ". ", ".\n", ". \n", ".\r\n" or a bare "\n", then ID:, ID#, No., No: or "Number is", before a member ID written dashed, dotted or slashed.
    - A member-kind head (member, subscriber, "Member ID") in the same positions before a claim number, plus "Control:".
  - "!", "?", ";" and ":" never joined. Digits-only values never leaked.
- **identifierCandidates** offered the value on every leak: `labeledDigitsJoin` accepts any label kind. Neither `identifierRuns` nor the contract screen's `someIdentifierRun` reads labels, so neither is affected.

## The fix (packages/model-gateway/src/redact.ts)
1. **Root (`LABEL_JOINT`, `LABEL_QUALIFIERS`).** A head joins a qualifier, and one qualifier joins the next, over:
   - white space or a line break;
   - a full stop only when it is an abbreviation's own (acct, ref, no, nbr, num) followed by its qualifier on the same line.

   A full stop after a whole word, after an abbreviation at a line's end, or any "!", "?", ";" or ":" ends the head. So "CLAIM.\nID:", "the claim. ID:" and "the claim number. ID:" read as `ID:`. `ANY_IDENTIFIER_LABEL` uses the same qualifier chain.
2. **Belt and braces (`labelsBefore`).** It returns the kinds of the leftmost label and of every label that begins a line or a sentence (`LINE_OR_SENTENCE_START`: after a line break, or after ".", "!" or "?" plus space where the full stop is no abbreviation's) and ends at the number. `labelFor` accepts any of these kinds, and `labeledDigitsJoin` accepts any label. The glued reading is split out unchanged as `gluedLabelBefore`.

**Why both, and why I narrowed the ruling's "any line break" clause:**
- A bare line break may be a wrapped label. Dropping the joined reading of "Claim\nNumber: 2026-04-26" would send a claim number written as a date that the base redacted: a new leak.
- So a bare line break still joins, and the fallback adds the next line's own label. "Claim\nID: 1990-01-01" is then redacted for a member ID.
- A full stop after a whole word can't be part of one label. Keeping that joined reading would also keep over-redaction ("We reviewed the claim. ID 2027-03-15 is the deadline" was redacted on the base and is kept now). So the root fix removes the reading rather than merely adding the split one.
- The fallback deliberately does **not** take every shorter label ending at the position, as the ruling literally asked. That would make "Claim ID: 1990-01-01" and "Member ID: 2027-03-15" count as bare "ID:" and break G2. It only takes labels that begin a line or a sentence, so a joint that ever reaches over a sentence end again cannot hide the label the sentence begins.

**After the fix,** the probe has no leak of this class. 18 cases remain, all the ruling's same-line abbreviation exception: "Acct. ID:", "acct. No." and "claim no. ID:" before a member ID written as a date are one claim label, so G2 keeps the date.

## Tests (packages/model-gateway/src/redact.property.test.ts, in MOD-13's describe)

| Test | On the base |
|---|---|
| `holds on seed 460548619 …`: a fixed run, with a comment saying what it pins | FAILED (the reported counterexample) |
| The counterexample and "Hi AA CLAIM. ID:". `redactLetter` replaces the member ID, `holdsIdentifier` is false on the output, `identifierCandidates` offers 19900101. The BB SMITH and bare "ID:" controls are included | FAILED |
| The class sweep: claim heads × 5 ends × 5 bare labels × 3 date writings for a member ID; member heads × ends × labels (plus Control:, Claim:, ICN:) for claim and patient-control numbers; the "!", "?", ";", ":" ends | FAILED |
| One label stays one label: "Acct. No.", "Claim No.", "Ref. #", "Pt. Acct. #", "Acct.#", "Claim No. ID:", a wrapped "Claim\nNumber:", "Patient control no.:" for a claim; "Member ID No.", "Member ID:", "Subscriber No." for a member and not for a claim (G2); "Claim ID:", "Acct. ID:", "Acct. No.", "Claim#" keep a member's date (G2); "Acct.\nID:" | FAILED only at "Acct.\nID:" (a leak pin); the rest passes on the base too |
| Over-redaction guards after 8 heads × 7 ends: a deadline, dates of service and remittance, "No. 97110", "$150.00" and an NPI stay; a deadline equal to the claim's digits stays; "Claim No." keeps the call's own [CLAIM_1] | FAILED only at "the claim. ID 2027-03-15" (the base over-redacted it) |

- With the fix, all 20 tests in the file and all 50 redact* tests pass.
- **Many seeds:** a scratch copy (deleted afterwards) ran MOD-13's property on 50 seeds × 400 runs. 0 failed (746 s).

## Docs
- ADR 0054, Numbers bullet of the 2026-10-27 amendment: one dated entry (2026-11-04) stating the rule. It is two wrapped sentences, not a single line.
- ADR 0070 Part 3 does not state the label rule; it only refers to "an identifier label such as Claim or ICN:". Unchanged.

## Checks (all passed)

| Check | Result |
|---|---|
| pnpm typecheck | passed, 22 projects |
| pnpm lint | passed, 1,759 files, 0 errors, 0 warnings |
| pnpm lint:copy | 557 files ok |
| pnpm lint:logs | 1,120 files ok |
| vitest --project unit packages/model-gateway apps/worker/src/models apps/worker/src/packets | 32 files, 626 tests passed |
| letter-records.db.test.ts (fresh migrated rlb_db at localhost:5433, dropped after) | 2 passed |
| pnpm --filter @tp/model-gateway eval | gate: passed; narratives 300 of 300 without a critical error |
| pnpm check:fixtures | ok |

## Commit
- **a01a0737** "model-gateway: a sentence end breaks a label's head, so a member ID after a bare ID: is redacted (MOD-13 seed 460548619)"
- 3 files, +184/-16: redact.ts, redact.property.test.ts and ADR 0054.
- It ends with the Co-Authored-By and Claude-Session trailers.

## Residuals and notes
- **Same-line abbreviations are one label.** "Acct. ID: 1990-01-01" keeps the date for a member ID, by the ruling and G2.
- **An abbreviation's full stop at a line's end ends the head**, by the ruling. So "Acct.\n# 2026-04-26" is "#" alone, which is no label, and a claim number written as that date stays as a date (G2's bare-"#" residual).
- **`LABEL_END`'s "#"/":" can still follow a whole word's full stop.** For example, "the claim. # <date>" stays a claim label. The probe shows this only redacts more and never leaks. I left it unchanged, because "Claim. <number>" and "Claim.\n<number>" are base label readings and narrowing them could cause new leaks.

Files: progress at /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/rlb/progress/build.md. Probe and logs are in /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/rlb/scratch/ (probe2.ts, probe2-base.txt, probe2-fix.txt, seeds.log, check-*.log).
