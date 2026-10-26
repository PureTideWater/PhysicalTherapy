# Lane B: figures-in-words (#38) and narrative-draft (#48), status

One parallel Lane B session runs both PRs, one after the other (the orchestrator's start of 2026-10-26 ~00:35 UTC, on the co-founder's direction of 2026-10-25 ~23:40 UTC). Reserved: ADR 0072 if a design needs one; test-matrix CAS-30 to CAS-37; `packages/synth` cases CAS-30 to CAS-37.

## Now
- **Stage:** A, design done and reviewed (wf_fd4e0a68-385: 4 scouts, designer, one adversarial reviewer, reviser; 19 findings, all applied, 2 in part with reasons in the design's section 13). No migration, confirmed. Next: builders. B, design running (wf_c4f857f0-8b2).
- **Next step:** cut `co-001/figures-in-words` from 6ddd587, run the builders (P, then W, K, L in parallel), open the draft PR.

## Log (UTC)
- 2026-10-26 ~00:50: machine set up (`tools/setup-container.sh` printed OK; `gh api user` is PureTideWater). `claude/build-platform` at 6ddd587. #42 open (143 files; none in the packets, packet review or line-trace pages except the shared synth matrix and registry, rule 6).

## PR A: every figure explained in words (#38)
- Branch `co-001/figures-in-words`, worktree `/home/user/figures-in-words`. PR: not opened yet.
- Design: `designs/lane-b-figures-in-words.md`, review `designs/lane-b-figures-in-words-review.json` (2026-10-26 ~01:55 UTC).

## PR B: a narrative survives sign-out (#48)
- Branch `co-001/narrative-draft`, worktree `/home/user/narrative-draft`. Not started; cut after A merges.

## Choices made
- **A (design, 2026-10-26 ~01:55 UTC), the recommended option in each, reasons in `designs/lane-b-figures-in-words.md` section 11:** C1 renderer in `packages/packets/src/explain/`; C2 worksheet rendered at review and export from `priced_line.trace`, bound by `trace_sha256` (no `tp-packet/3`, no DDL); C3 three audiences (internal, viewer, payer); C4 a flag that is off is "Not applied (flag off)" internally and silent to the payer, never the contract's position; C5 a code without words is refused, no fallback; C6 CSV unchanged (ADR 0061 D3); C7 never a 100% figure; C8 the CMS sentence from the trace alone; C9 viewer words built on the server, no date, no trace sent; C10 the reviewer's dead "Line trace" link hidden; C11 unpriced words copied into the package with a parity test against the doc; C12 golden pins inside `packages/packets`; C13 new mutation shard `packets-explain`; C14 this PR takes ADR 0072 and CAS-30 to CAS-34, CAS-35 to CAS-37 left to B; C15 D5 (b) closed by an added line; C16 wording as written under the co-founder's delegation; C17 code-held `WORDS_VERSION` guards; C18 a two-half proof instead of an e2e PDF parse (no new dependency, since `package.json` and the lockfile are #42's); C19 SECONDARY_PAYER worded from the trace; C20 a payer code allow-list; C21 the reviewer-checklist lines as a separate PR (proposal below).

## Proposals outside these PRs
- **For Lane A (needs DDL and the founder's domain-model approval):** store the words version the approver saw (`packet_version.approved_words_version`, `export_words_version`), closing the one gap the code-held guards leave (approved under one renderer, a deploy, then exported under another). Optionally a stored worksheet (`tp-packet/3`), not recommended now. Design section 2.2.
- **A small separate PR under the founder's code-owner review:** four lines for `.claude/agents/payment-engine-reviewer.md` (words render only stored trace values; a flag that is off is never worded as the contract's position, nor Medicare's rules on an MA non-contracted line as a contract's; the year is worded from the lookup; no 100% figure for a non-100% contract).
- **Others** (design section 12): the unpriced-reasons doc says SECONDARY_PAYER is status 2 or 3, but the engine also stops 20 and 21 (content pipeline); bare codes on the case page and four other screens; a stale `tp-pricing-trace/1` comment at `packages/db/src/schema/pricing.ts:120` (a #42 file); `csv.ts`'s second exact-dollar path; a render-level check for codes in visible text; a shared helper lowering property-test run counts under mutation.
