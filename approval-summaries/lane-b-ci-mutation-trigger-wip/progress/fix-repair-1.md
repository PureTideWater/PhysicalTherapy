# P4 fix repair 1 (verifier round 1 issues)

Clone /home/user/ci-mutation-trigger on co-001/wip-ci-mutation-trigger, start head 30efef6d… (= origin). PR branch untouched at 50029e64…; base not merged; PR branch not pushed.
Logs: /tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/p4/logs/fix/repair1/

## Issues
- G1-a (should): done 6e0ed8a6… TEST_TOOLING comment names no import call; lockfile test asserts no global import names typescript and the move affects all four with its imports stripped; ADR hoisting-limit note on the comment over-read (kept: it over-reads toward more shards). Red (entry alone removed) G1a-red.log: guard, lockfile and catalog cases fail (3); green G1a-green.log 114/114.
- G1-b (nit): done 2549a6e5… reader skips a match only on an unclosed comment line, reads backtick literals without ${}; unit case. Red G1b-red.log; green G1b-green.log (guard still finds nothing).
- whole-e (nit): done a11a8eda… guard comment: Linux install. Comment only.
- G2-a (should): done 5383cd98… closureProblemsMessage factored out and asserted; synthetic-repo test commits a forged import (LF + ::warning). Red X6 G2a-red-X6.log (2 failed); green G2a-green.log.
- whole-d (nit): done 9e6effb6… lockfile moved entries quoted when they hold a control character; N52 sentence. Red whole-d-red.log; green whole-d-green.log 9/9.
- G2-c / G3-d (nit): done 0e638006… reason label "(a global input, every package)". Red label-red.log; green label-green.log 495/495.
- G2-b (nit): done da975160… CI-27 matrix.ts + test-matrix.md; synth --all wrote CI-27/expected.json only; verify-content 0.
- G3-b (nit): done 7ff9797c… ADR names mutants by rule, no M/C IDs.
- whole-c (nit): done 9a756e25… ci.md names C0, DEL, C1, U+2028/2029.
- whole-b (nit): done 3512ac0d… N56 + ci.md: every .gitattributes edit counts, linguist-only included (#46).
- G3-c (nit): done 05d3291b… reflow; words unchanged; >120 lines back to 17 (ci.md) and 32 (ADR) as at 50029e64.
- G3-a (should): description wording, for the session (see result).
- whole-a (should): description replay figures: pending for the replay before the one push (after the base merge). Known delta: #46 0 -> all four / 7 shards (C-G1); estimate 22 -> 16 full runs, ~297 minus ~54 = ~243 runner-minutes saved; acceptance "none widened" no longer holds for #46 by design.
- whole-f (nit): pending for the base merge: keep both sides of the ADR 0066 header (Part 7 bullet; Date '...; Part 5 2026-10-28; N32 2026-10-28; Part 7 2026-11-02') and both reconciliation-001 paragraphs.
- PE-S1: pending for the base merge after #84.

## Final at 05d3291b…
tools/stryker + tools/test 35 files 495/495 (final-suite.log); typecheck 0; eslint tools/stryker 0; lint:logs 0; watched.ts --write no diff. Pushed WIP ref fast-forward 30efef6d..05d3291b through the hook (push.log).
