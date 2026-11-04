# Fix round: wording (fix-words)

Start: co-001/wip-ci-mutation-trigger at f23850fa… (= origin).

1. G3 ADR 0066 Part 7 Measured #46 bullet: done, commit 12c372f8…. N56 and reconciliation-001 checked, unchanged (both already accurate).
2. ci.md: error-quoting sentence rewritten to what printable does (git stderr on success and the failing error, lines with a control character or starting :: or ##[ quoted; such an error fails the job, exit 1, decides no shard); runtime paragraph's ragged wrap joined. Commit 0841b12f….
3. runtime.ts: shownPnpm prints the --pnpm value and the user agent pnpm as is when a plain version, else JSON-quoted (manifests.ts quoted form, inlined); runtime.test.ts case red at f23850fa…'s runtime.ts (1 failed of 5), green after. Commit c97f02d2….
Checks (one lock hold): unit tools/stryker tools/test 35 files 500/500; typecheck passed (22 projects); lint passed (1,686 files, 0 errors, 0 warnings). Push: git push origin HEAD:refs/heads/co-001/wip-ci-mutation-trigger, fast-forward f23850fa…..c97f02d2…, hook ran, exit 0. PR branch untouched at 50029e64…; base not merged.

Item 3 notes: runtime.ts shownPnpm (plain version as is, else JSON-quoted as manifests.ts quoted; inlined to keep the classifier out of canary verdicts) for the user agent pnpm and the --pnpm value; runtime.test.ts case added. Checks script /tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/p4/words-checks.sh (red at HEAD's runtime.ts, then unit tools/stryker tools/test, typecheck, lint) under one lock hold; status in logs/integrate/words-status.log.
