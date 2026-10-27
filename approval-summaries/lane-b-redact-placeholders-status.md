# Lane B item: the letter reader's redaction corrupts placeholders (`co-001/redact-placeholders`)

Session: https://claude.ai/code/session_019i9ifC3LkwNtonZfNSNmCp (started 2026-10-27 19:12 UTC by Lane A's orchestrator, session_01TrKDxeLbxVo7t7zwRXFzrg). GitHub login: PureTideWater.
Reserved: ADR 0085 if needed (the design amends ADR 0054 instead); test-matrix MOD-13 to MOD-14; `packages/synth` the same if needed (module 9, MOD).
Follow-on in this session after it merges: packet day counts (`co-001/packet-day-counts`, status `lane-b-packet-day-counts-status.md`).

## Log (UTC)
- 2026-10-27 19:16: machine OK (setup script; Playwright laid out). Worktree `/home/user/redact-placeholders` cut from `claude/build-platform` 085299b (#76 merged), `pnpm install --frozen-lockfile` clean.
- 2026-10-27 19:30: established what goes wrong (probe on 085299b with synthetic twins): besides the placeholder corruption (A1, A2), names with diacritics, typographic apostrophes, hyphenated-surname halves, dashes, soft hyphens, "Jo Ann" for JOANN, ß, and initials reach the model; member IDs and claim numbers written with `_`, `.` or a zero-width space reach it too; every one passes the self-check; the one-patient screen's candidates miss `_`, zero-width, `ID:` and bracketed forms. Design written: `designs/lane-b-redact-placeholders.md` (one pass over one folded view; merged spans; initials; the self-check and screen on the same view; `mentionsIdentifier` on the same matcher). No migration.
- 2026-10-27 20:20: design review and build (workflow wf_0f7e6d06-e5b, `workflow-scripts/lane-b-redact-placeholders-design-build-wf_0f7e6d06-e5b.js`): the review found 2 blocking and 7 should-fix findings (invisible characters as word boundaries; an oracle independent of the matcher; "in a" read as a name; amounts as numbers; the merge dropping a claim placeholder; month-named patients; initials; separators; one tokenizer); the builder applied all of them (design section 7). Commit 6c371e5 pushed; draft PR #80 opened, description from the template written with update_pull_request and read back; subscribed.
- 2026-10-27 20:25: two adversarial reviews running (wf_67ec5416-072: security-reviewer and correctness, in fresh clones).

## Waiting on someone
None.

## Proposals (outside this PR)
- The packets verifier's `identifierSpans` (`packages/packets/src/verifier/mismatches.ts`), which checks the model's narrative for identifiers, has the same character-for-character gaps (diacritics, typographic apostrophes, hyphenated halves, invisible characters). Its own PR in `packages/packets` (a money package), reusing the gateway's fold once this merges.

## Next step
The two reviews (wf_67ec5416-072), then the fix round with the full local suite, one push; then the fresh-clone verification reading CI; then merge per lanes/lane-b.md.
