ACTING (Lane A's account, W7, https://claude.ai/code/session_019i9ifCb8Sa7jHnu6j4af8F) holds this item from 2026-11-11T04:30Z, assigned by the orchestrator (session_019i9ifDAzQNA3kLHozjBoeS); hand-back to Lane B at 2026-11-13 18:30 UTC if it is not merged.

# Lane B: packets-verifier-identifier-fold (`co-001/packets-verifier-identifier-fold`): status

Reserved: test-matrix MOD-19 and MOD-20; synth entries the same as MOD-13 if needed (module 9, `none(10, …)`, no fixture); no ADR number (amendments to 0047, 0054 and 0066). New counters only from the orchestrator.

## The item
`packages/packets/src/verifier/mismatches.ts`'s `identifierSpans` checks a narrative for the case's identifiers as whole words, without regard to case, and nothing more. It lacks the forms the gateway's letter reader reads (#80: diacritics, typographic apostrophes and dashes, hyphenated halves, a word hyphenated at a line break, spaced or dashed numbers; #115: label boundaries and glued labels). A narrative that writes a name as `Zoe` for `ZOË`, `O’Quill` for `O'QUILL` or `Treeby` for `VAN-TREEBY` passes the verifier today. `verifier/template.ts` (format /3, slice 2) calls the same function.

## RESUME-BLOCK (W7; current at 2026-11-11 05:40 UTC by the container's clock)
- **Branch:** `co-001/packets-verifier-identifier-fold`, cut from claude/build-platform **4fe8bcca**, worktree `/home/user/fold`. Not on origin under its own name yet (no PR); **WIP ref `co-001/wip-packets-verifier-identifier-fold` = 13eea841** holds everything committed.
  - 181c816c: the move only (`redact.ts` to `packages/redact`, the gateway's imports, the lockfile, `transpilePackages`, `MONEY_PACKAGES`, the watched paths).
  - 811706c9: `nameOrNumberMatches` in `@tp/redact`; `verifier/identifiers.ts`; the verifier's functions take a reader; the server API takes `{ names, numbers }`; the worker's `ScheduleIdentifiers.numbers`; test call sites.
  - 13eea841: the tests (MOD-19, MOD-20: `packages/packets/src/verifier-identifiers.test.ts`, 56 tests; `check-browser.test.ts`; `packages/redact/src/narrative.test.ts`; two DB tests in the worker's `packets.db.test.ts`, green on PostgreSQL 18, port 5433), the reading across a token (design review 1, finding 1) and `verifier/identifiers.ts` in the `packets-verifier` shard.
  - **Uncommitted in the worktree** (commit them first): the ADR amendments (0047, 0054, 0066 Part 4), the test-matrix rows, the synth registry and `matrix.ts` entries, `fixtures/synthetic/MOD-19` and `MOD-20` (`pnpm synth --case`).
- **PR:** none. **CI:** none. **Counters used:** MOD-19, MOD-20.
- **Design:** `designs/lane-b-packets-verifier-identifier-fold.md`. **Design review 1 (PHI and security) is in** (below). **Design review 2 (correctness, false flags, the move, the test plan) is still running** in `/home/user/fold-r2`; a resumed session runs it again from the design file's brief.
- **Running now:** the mutation shards `packets-verifier` and `packets-template` with their gates, on Node 24.22.0 (`/opt/node24/bin` first on PATH), output in the session's scratchpad. A resumed session runs them again: `TP_MUTATION_SHARD=<shard> pnpm -s exec tsx tools/stryker/shards.ts <shard>`, then `tools/stryker/gate.ts reports/mutation --shard <shard>`.
- **Not done:** review 2's findings; the mutation gate's survivors and any stale entry of `tools/stryker/equivalent/packets.json` (the edits moved lines in `mismatches.ts` and `template.ts`); two adversarial reviews of the build (the first also reviews the delta of the design fix, the reading across a token); the full local suite once (`DATABASE_URL=postgres://postgres:test@localhost:5433/postgres` for `pnpm test:db`); `pnpm toolchain:check` and `pnpm actions:check` (the lockfile changed); the base merge; the push; the draft PR from the template; CI; the merge.
- **Coordination:** the SSN and phone leaks item (W5) edits `redact.ts` heavily and adds `confusables.ts` beside it. Whichever merges second: git follows the rename for `redact.ts`; a new file `redact.ts` imports is moved by hand into `packages/redact/src/`, and a test's import of `./redact` becomes `@tp/redact`.
- **Exact next step:** read review 2's report and the mutation gates' output; verify each finding by running it; fix; commit the documents.

## Findings
| # | From | Finding | Verified | Resolution |
| --- | --- | --- | --- | --- |
| D1-1 | Design review 1 (PHI) | A citation marker or a placeholder written inside an identifier hides it: `Quar[1]rington`, `QQRS[1] TUVW` pass. The adapter's own gap: a letter holds no token. | Yes, reproduced | **Fixed in 13eea841**: the matcher reads the text a second time with each token as one invisible character; only a match that holds a token is kept. Tests in MOD-19 and MOD-20. |
| D1-2 | Design review 1 | The matcher itself does not read a name with a middle dot between its letters (`Quar·rington`), a lower-case piece after a space or period (`Quarring ton`), or letters spaced one by one. Shared with the gateway's drafter check. | Yes, reproduced | **Not fixed here, recorded**: a change to `NAME_JOINERS` changes what a letter redacts, which is the leaks item's file and review. In ADR 0054's amendment ("Still not covered"); **to hand to the leaks item**. |
| D1-3 | Design review 1 | The narrative's reading is `matchesIn` only: the letter path's glued readers (`ownIdentifierGlued`) are not part of it, so "the same matcher" covers the forms, not those checks. | Yes, by reading | **Stated** in ADR 0047's and 0054's amendments. A name glued to digits fails as a figure; glued to letters is a recorded residual. |
| D1-4 | Design review 1 | No leak into reports, errors or logs; the browser bundle holds neither the matcher nor the reading (an esbuild bundle of `check.ts`); cost grows with the identifier count (1.1 s at 800 identifiers over 20,000 characters, one reading). | Timings re-measured: about 3 ms typical, 0.1 s at 1,600 identifiers over 3,600 characters | No change. The cost is in the PR's consequences. |

## Log (UTC)
- 2026-11-05 07:40: branch cut from 23b25ad0 by Lane A's S1 (session_019i9ifCJSbPYXpafL86Rm6J); workflow wf_54232b96-397 ran its three scouts.
- 2026-11-05 07:55: stood down on the orchestrator's order (the account's weekly usage); the designer had written nothing.
- 2026-11-11 05:40: design review 1 in (one adapter gap, fixed; two residuals recorded); tests built and pushed as WIP 13eea841; mutation shards running.
- 2026-11-11 04:55: the move and the reading built and pushed as WIP 811706c9; the design written; its two adversarial reviews started.
- 2026-11-11 04:30: W7 took the claim over; branch cut afresh from 4fe8bcca into `/home/user/fold`. No Workflow fan-out this time (the token rules): the design and build run in the session, reviews as subagents.

## Waiting on someone
Nothing.
