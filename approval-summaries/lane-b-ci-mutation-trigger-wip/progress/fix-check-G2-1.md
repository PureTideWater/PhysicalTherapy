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
