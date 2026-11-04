# Fix check G2, round 1 (S1, C-G1, S2, C-G2)

Head under check: 30efef6d… (co-001/wip-ci-mutation-trigger). Clone /home/user/fx-p4-G2-1 (read only, removed at end).

## Progress
- [start] Cloning.
- Clone at 30efef6d…, ci-mutation-trigger still 50029e64…; pnpm install --frozen-lockfile exit 0 (G2-1/install.log).
- Read the S1/S2/C-G2/C-G1 diffs: changeSince and trackedFiles use -z; affected() checks hasControlCharacter before any glob; Judgement quotes manifest paths; closureProblems quotes.
- Test files since 50029e64: only imports and the N2/N3 workflow/runtime expectations lose lines; nothing in the G2 tests removed.
- 50029e64's own tests (affected, manifests, runtime, stryker, workflows) run against head source: 455/457; the two failures are workflows.test.ts's old changes-job command (runtime.ts gained --pnpm/--commit in N2/N3, outside G2). Nothing in G2 loosened (G2-1/old-tests-at-head.log).
- S1/C-G1 adversarial dump (scratchpad p4/g2adv, head.json vs base.json, affected() on this repo): 34 control-character paths (LF, CR, CRLF+::warning, U+2028/2029, U+0001, U+001F, ESC, TAB, VT, FF, DEL, U+0080/0085/009B/009F, ::add-mask/::set-output/::stop-commands/::error/##[group] payloads, manifest-shaped and named-file-shaped paths, .gitattributes with LF) each give all four, every reason JSON-quoted, no raw control character in any reason or inert line. 16 harmless variants (%0A, ::warning:: without a break, é, NBSP, U+2027, U+202E, U+FFFD, U+200B, U+FEFF, space, quotes, literal backslash-n, docs, apps/web, money source, README) identical to 50029e64.
- C-G1 dump: .gitattributes, packages/money/, docs/, a/b/c/, .github/ .gitattributes give all four; .gitattributes.bak, docs/x.gitattributes, docs/gitattributes, .gitattributes/x, .gitmodules, .gitignore, .git-blame-ignore-revs unchanged from 50029e64 (none). Nit: the reason reads "(mutation tooling, every package)" for a .gitattributes.
- End to end (affected.ts CLI on synthetic local commits in the clone, never pushed; scratchpad p4/g2adv/{ctl,attr,docs}.*): three tracked paths (LF + ::warning, CR + ::error, U+2028 in money src) give all four, any=true, all seven shards; stdout and step summary hold each path JSON-quoted, no raw CR/LF/U+2028 (cat -A), stderr empty, no closure problem thrown. A packages/pricing/.gitattributes alone gives all four. A docs edit gives shards none. Clone back at 30efef6d…, tree clean, temp branches deleted.
- Mutant re-run started (scratchpad p4/g2adv/mut.py; manifests.test.ts + affected.test.ts; each pattern checked to apply once at head): S2 M01–M05, M08–M16; C-G2 C01, C02, C04–C07, C13; own X1–X9 over the S1/C-G1 fixes.
- Mutants so far (G2-1/mutants.txt): M01–M05, M08 killed; heavy lock shared with another session's typecheck/vitest, so runs are slow.
- Mutant runner stopped at its 30-minute background limit during M12; M12 left applied in the clone's manifests.ts, restored with git checkout (clean). M09, M10, M11 killed. Rerunning M12 onward with a 2-hour limit.
- M12, M13, M14 killed (rerun).
- M15, M16, C01, C02, C04 killed.
- C05, C06 killed.
- C07, C13 killed; own X1 (no control check in affected), X2 (no s flag), X3 (quoted() JSON only), X3b (quoted() separators only) killed.
- X4 (drop **/.gitattributes) and X4b (drop both) killed; X5 (drop root .gitattributes alone) survives, equivalent: **/ compiles to (?:[^/]+/)*, which holds the root file. X7 (Judgement path unquoted), X8 (control path unquoted in affected), X9 (no continue after the control note) killed.
- X6 SURVIVED: affectedSince's quoting of closureProblems lines (S1 commit) is untested; dropping it leaves 114/114 green. Should: add a test (e.g. a synthetic closure whose path literal or unresolved import holds a LF + ::warning, asserting the thrown message holds it JSON-quoted).
- All S2 mutants (M01–M05, M08–M16) and C-G2 mutants (C01, C02, C04, C05, C06, C07, C13) killed in this independent rerun (G2-1/mutants.txt, mut-*.log).
- Docs: ADR N52/N56 and the S2/C-G2 consequences match the code; ci.md says both. Nits: CI-27 row (test-matrix and synth) names .gitattributes but not control-character paths; a .gitattributes reason reads "(mutation tooling, every package)".
- Clone clean at 30efef6d…; removing it.
- Clone /home/user/fx-p4-G2-1 removed. Done.
