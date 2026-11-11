ACTING (Lane A's account, W7, https://claude.ai/code/session_019i9ifCb8Sa7jHnu6j4af8F) holds this item from 2026-11-11T04:30Z, assigned by the orchestrator (session_019i9ifDAzQNA3kLHozjBoeS); hand-back to Lane B at 2026-11-13 18:30 UTC if it is not merged.

# Lane B: packets-verifier-identifier-fold (`co-001/packets-verifier-identifier-fold`): status

Reserved: test-matrix MOD-19 and MOD-20; synth entries the same as MOD-13 if needed (module 9, `none(10, …)`, no fixture); no ADR number (amendments to 0047, 0054 and 0066). New counters only from the orchestrator.

## The item
`packages/packets/src/verifier/mismatches.ts`'s `identifierSpans` checks a narrative for the case's identifiers as whole words, without regard to case, and nothing more. It lacks the forms the gateway's letter reader reads (#80: diacritics, typographic apostrophes and dashes, hyphenated halves, a word hyphenated at a line break, spaced or dashed numbers; #115: label boundaries and glued labels). A narrative that writes a name as `Zoe` for `ZOË`, `O’Quill` for `O'QUILL` or `Treeby` for `VAN-TREEBY` passes the verifier today. `verifier/template.ts` (format /3, slice 2) calls the same function.

## RESUME-BLOCK (W7; current at 2026-11-11 04:45 UTC by the container's clock)
- **Branch:** `co-001/packets-verifier-identifier-fold`, cut from claude/build-platform **4fe8bcca**, worktree `/home/user/fold` (dependencies installed). **No commits yet, not on origin, no WIP ref.**
- **PR:** none. **CI:** none. **Counters used:** none yet (MOD-19 and MOD-20 reserved).
- **Done:** the three scouts (2026-11-05, in `lane-b-packets-verifier-identifier-fold-wip/`), re-checked against 4fe8bcca. What changed since they ran: `packages/model-gateway/src/redact.ts` is 3,451 lines (MOD-16's glued checks), and slice 2 added `verifier/template.ts`, which calls `identifierSpans` too.
- **Design direction (the design file is next: `designs/lane-b-packets-verifier-identifier-fold.md`):**
  1. `redact.ts` has no imports. It moves whole, by `git mv`, into a new pure package `packages/redact` (`@tp/redact`); the gateway imports it from there (no stub at the old path, so git's rename detection carries a concurrent edit of the file). Its tests stay in the gateway (they need the gateway's functions).
  2. One added export there, `nameOrNumberMatches(normal, {names, numbers})`: the narrative reading's matches as ranges with a kind; `holdsNameOrNumber` is written through it, so the drafter's check and the verifier cannot drift.
  3. A new server-only file `packages/packets/src/verifier/identifiers.ts` reads a narrative through it and keeps today's whole-word check beside it (the union, so nothing caught today is lost). `mismatches.ts` and `template.ts` take the reader as an argument; `check.ts` (the browser) passes one that finds nothing, so the matcher never ships to the browser.
  4. Skip rules: a match that overlaps a placeholder, a citation marker or a fact token is dropped; a name inside a dated figure is dropped (a month's name); a number that overlaps a dated figure stays only if it covers the whole figure (a labeled date that is the number).
  5. `verifyNarrative`, `verifyTemplate` and `verifyAtFormat` take `{names, numbers}`; the worker and the gateway already know which values are names.
  6. Tests: MOD-19 (every written form of an identifier fails, the generator as the oracle) and MOD-20 (the verifier agrees with the gateway's narrative reading, and flags no amount, date, code, NPI, marker or placeholder).
- **Coordination:** the SSN and phone leaks item (W5) edits `redact.ts` heavily and adds `confusables.ts` beside it. Whichever merges second: git follows the rename for `redact.ts`; a new file `redact.ts` imports is moved by hand into `packages/redact/src/`, and a test's import of `./redact` becomes `@tp/redact`.
- **Exact next step:** commit 1 is the mechanical move only (the package, the `git mv`, the import paths, the lockfile, `transpilePackages`, `MONEY_PACKAGES`, the watched paths); then the design file and its two adversarial reviews; then the build.
- **Findings open or fixed:** none yet.

## Log (UTC)
- 2026-11-05 07:40: branch cut from 23b25ad0 by Lane A's S1 (session_019i9ifCJSbPYXpafL86Rm6J); workflow wf_54232b96-397 ran its three scouts.
- 2026-11-05 07:55: stood down on the orchestrator's order (the account's weekly usage); the designer had written nothing.
- 2026-11-11 04:30: W7 took the claim over; branch cut afresh from 4fe8bcca into `/home/user/fold`. No Workflow fan-out this time (the token rules): the design and build run in the session, reviews as subagents.

## Waiting on someone
Nothing.
