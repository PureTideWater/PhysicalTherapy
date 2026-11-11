ACTING (Lane A's account, W7, https://claude.ai/code/session_019i9ifCb8Sa7jHnu6j4af8F) holds this item from 2026-11-11T04:30Z, assigned by the orchestrator (session_019i9ifDAzQNA3kLHozjBoeS); hand-back to Lane B at 2026-11-13 18:30 UTC if it is not merged.

# Lane B: packets-verifier-identifier-fold (`co-001/packets-verifier-identifier-fold`): status

Reserved: test-matrix MOD-19 and MOD-20; synth entries the same as MOD-13 if needed (module 9, `none(10, …)`, no fixture); no ADR number (amendments to 0047, 0054 and 0066). New counters only from the orchestrator.

## The item
`packages/packets/src/verifier/mismatches.ts`'s `identifierSpans` checks a narrative for the case's identifiers as whole words, without regard to case, and nothing more. It lacks the forms the gateway's letter reader reads (#80: diacritics, typographic apostrophes and dashes, hyphenated halves, a word hyphenated at a line break, spaced or dashed numbers; #115: label boundaries and glued labels). A narrative that writes a name as `Zoe` for `ZOË`, `O’Quill` for `O'QUILL` or `Treeby` for `VAN-TREEBY` passes the verifier today. `verifier/template.ts` (format /3, slice 2) calls the same function.

## RESUME-BLOCK (W7; current at 2026-11-11 06:15 UTC by the container's clock)
- **Branch:** `co-001/packets-verifier-identifier-fold`, cut from claude/build-platform **4fe8bcca**, worktree `/home/user/fold`. Not on origin under its own name yet (no PR); **WIP ref `co-001/wip-packets-verifier-identifier-fold` = 811706c9** holds everything built.
  - 181c816c: the move only (`redact.ts` to `packages/redact`, the gateway's imports, the lockfile, `transpilePackages`, `MONEY_PACKAGES`, the watched paths). The gateway's redaction tests pass unchanged.
  - 811706c9: `nameOrNumberMatches` in `@tp/redact`; `verifier/identifiers.ts`; the verifier's functions take a reader; the server API takes `{ names, numbers }`; the worker's `ScheduleIdentifiers.numbers`; test call sites. Typecheck and lint pass on the whole workspace; packets' 1,716 unit tests and the gateway's 4,328 pass.
- **PR:** none. **CI:** none. **Counters used:** none yet (MOD-19 and MOD-20 reserved).
- **Design:** `designs/lane-b-packets-verifier-identifier-fold.md` (D1 to D7, consequences, tests). **Its two adversarial reviews are running** as subagents in `/home/user/fold-r1` (PHI and security) and `/home/user/fold-r2` (correctness, false flags, the package move, the test plan), both detached at 811706c9. Their findings are not recorded yet: a resumed session runs them again.
- **Not done:** the reviews' findings verified and fixed (a fix round's delta gets a review); the tests (MOD-19, MOD-20 in `packages/packets/src/verifier-identifiers.test.ts`; `packages/redact/src/narrative.test.ts`; the browser guard; the worker's numbers); `stryker/base.mjs` and `shards.json` (`verifier/identifiers.ts` into the `packets-verifier` shard) and the mutation gate on that shard; ADR amendments (0047, 0054, 0066), the test matrix, the synth registry (`pnpm synth`); two adversarial reviews of the build; the full local suite once; `pnpm toolchain:check` and `pnpm actions:check` (the lockfile changed); the base merge; the push; the draft PR from the template; CI; the merge.
- **Coordination:** the SSN and phone leaks item (W5) edits `redact.ts` heavily and adds `confusables.ts` beside it. Whichever merges second: git follows the rename for `redact.ts`; a new file `redact.ts` imports is moved by hand into `packages/redact/src/`, and a test's import of `./redact` becomes `@tp/redact`.
- **Exact next step:** read the two reviews' reports, verify each finding by running it, fix; meanwhile write the tests.
- **Findings open or fixed:** none recorded yet.

## Log (UTC)
- 2026-11-05 07:40: branch cut from 23b25ad0 by Lane A's S1 (session_019i9ifCJSbPYXpafL86Rm6J); workflow wf_54232b96-397 ran its three scouts.
- 2026-11-05 07:55: stood down on the orchestrator's order (the account's weekly usage); the designer had written nothing.
- 2026-11-11 06:15: the move and the reading are built and pushed as WIP 811706c9; the design is written; its two adversarial reviews run.
- 2026-11-11 04:30: W7 took the claim over; branch cut afresh from 4fe8bcca into `/home/user/fold`. No Workflow fan-out this time (the token rules): the design and build run in the session, reviews as subagents.

## Waiting on someone
Nothing.
