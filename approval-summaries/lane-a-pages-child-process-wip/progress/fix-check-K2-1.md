# Fix check K2 round 1 (correctness and capacity)
Started 2026-11-05. Clone /home/user/fx-pcp-K2-1 (read only) at 7027cddd… = origin/co-001/wip-pages-child-process. Logs: scratchpad pcp/logs/fix/K2-1/.
## Checks
- Install --frozen-lockfile ok (install.log). @tp/worker build 0; vitest unit packages/contracts, packages/synth, infra, apps/worker bundle.test + intake: 58 files, 1,105 passed, 0 skipped (core test ran) (suite.log).
- Mutation batch (22 mutants: reviewers', critic's, fix round's) running against packages/contracts/src/evidence (mut-*.log).
- G4: git merge-tree HEAD vs origin/claude/build-platform f185655c… (contains base 7fb3e102…), every origin/co-001/* head and the three open Dependabot PRs: 0 conflicts vs build-platform, brand-settle, ci-findings-transport, suite-cap-1-triage-locks (the one open co-001 PR, #110) and the Dependabot heads. Merged ADR 0071 keeps ci-findings-transport's Status sentence and this branch's own bullet. Conflicts only vs stale heads that already conflict with the base; in this branch's files they are the append-at-end of the matrix/registry/test-matrix rows (SEC-24 beside their rows) (merge-tree.log). PASS.
- SEC-24: no SEC-<n> placeholder left (git grep); test-matrix row + note, synth matrix row, registry none(1, …) with 5 assertedBy files, each naming SEC-24; fixtures/synthetic/SEC-24/expected.json committed; packages/synth tests green in suite.log. PASS (synth --all re-run pending).
- Mutants so far: KILLED replybound-frame, replybound-both, liveexit, exitcode, child-pagecap, child-orphan, after-reply, sigabrt, grace-off, poll-stops-at-reply, old-stop-at-reply, refused-stop-at-reply. SURVIVED: replybound-total (equivalent: 64 KiB chunks, accepted), child-console (recorded), close-exit (recorded), pagecap-parent (reviewer-named), baselinecap (reviewer's: ready-time check only) and baselinecap-poll (poll pre-ready check only).
- Mutants done (mutants.log, mut-*.log): also KILLED no-ulimit, no-ulimit-cwd-entry, memcap-x2 (N3). SURVIVED cwd-entry (cwd writable, ulimit still guards; defence in depth, security group's).
- Probe (probe-survivors.log): pagecap-parent removed -> stub 'many 11' with maxPages 10 returns 11 pages (HEAD: refused). baselinecap (ready-time check) removed -> stub-fat with pollMs 30 s is accepted and widened, refused only at the 10 s deadline (HEAD: 'started too large'). No test pins either: SHOULD.
- G2 (G2-check.log): reader-heap probe under node --max-old-space-size=560 --enable-source-maps: reader 251,658,240 (240 MiB). COMMANDS.worker with the flag after node: 16/16 green, measured; with no flag: green; wrong value 600: red (correct). Flag after --enable-source-maps (the screening container's order): red at the nodeFlags order check: NIT (order-sensitive).
- G3 (G3-check.log): bundle.test.ts 3/3; yauzl external -> red, pdfjs-dist external -> red (PageReadError exit 1). Worker image is node:24-trixie-slim: /bin/sh (dash) present; dash ulimit -c 0 sets soft and hard (raise refused). PASS.
- N2: two stale thread comments left: packages/model-gateway/eval/sets.ts:290 ("each in its own bounded reading thread"), pages.test.ts:177 ("Today's thread"): NIT.
- Running: synth --all + check:fixtures, pages.test.ts 3 sequential + 3 concurrent runs (flake.log).
- synth --all: exit 0, 0 changed paths; check:fixtures 0. pages.test.ts 3 sequential + 3 concurrent runs: 21/21 each (flake.log). PASS.
- Correctness S1: replybound-frame and -both killed; the 3 oversized headers end in PageReadError, no uncaught exception, RSS < +64 MiB. replybound-total survives: equivalent in practice (within-cap text is at most 3 bytes per UTF-16 unit, under the 4-byte bound; a 64 KiB chunk cannot carry a header past it). PASS.
- F1 post-reply bound: grace-off, poll-stops-at-reply, done/refused stop() mutants all killed. PASS.
## Verdict
Not resolved: two reviewer-named mutants still survive (should): pagecap-parent, baselinecap (ready-time check). Nits: G2 order-sensitive flag check; N2 two stale thread comments. Everything else PASS.
## Done
Clone /home/user/fx-pcp-K2-1 removed; no stray stub process, no core file left.
