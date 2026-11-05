ACTING (Lane A's account, https://claude.ai/code/session_019i9ifCJSbPYXpafL86Rm6J) holds this item from 2026-11-05T07:40Z; Lane B: read lanes/lane-b.md's latest entries before resuming.

# Lane B: packets-verifier-identifier-fold (`co-001/packets-verifier-identifier-fold`): status

Session: session_019i9ifCJSbPYXpafL86Rm6J (acting Lane B S1, on Lane A's account), assigned by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) on 2026-11-05 at 07:37 UTC. Reserved: test-matrix MOD-19 and MOD-20; synth entries the same as MOD-13 if needed (module 9, `none(10, …)`, no fixture); no ADR number (an amendment to an existing ADR; a COUNTER REQUEST if a new one is needed). Follow-on, if time remains before 2026-11-06 18:30 UTC: SUITE-CAP-3's worker-side fixes only, from WIP `co-001/wip-suite-cap-3` (956b32ef). The `ledger_line_net` rewrite stays out because it needs a founder exception.

## The item
`packages/packets/src/verifier/mismatches.ts`'s `identifierSpans` checks a model's narrative for the patient's identifiers. It has the character gaps #80 closed in the gateway: diacritics, typographic apostrophes and dashes, hyphenated halves, invisible characters, #115's label boundary, and #127's SSN and phone patterns where they apply. So a narrative that writes an identifier in one of those forms passes the verifier. It was proposed in `lane-b-redact-placeholders-status.md` (Proposals) and never built.

**The fix:** reuse the gateway's fold and matcher (#80, #115, #127) if the package boundary allows. Otherwise extract the shared fold into a small package both import. Add a differential property test against the gateway's matcher, so the two never drift. No over-redaction of amounts, dates, claim numbers or NPIs. This is PHI and money work in `packages/packets`, so it gets two adversarial reviews: security, then correctness with the redaction oracle.

## Log (UTC)
- 2026-11-05 07:40: branch `co-001/packets-verifier-identifier-fold` cut from **23b25ad0**; worktree `/home/user/packets-verifier-identifier-fold`. No design existed, so the full pipeline runs in one workflow: scouts, design, an adversarial design review, revision, build, the two reviews with a skeptic each, fixes, the full suite once, and a critic. No push yet.

## Waiting on someone
Nothing.

## Next step
The workflow, then the push, a draft PR, CI, a fresh-clone verification, ready, and the merge.
