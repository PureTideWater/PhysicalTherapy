# Fix repair 3 (check round 3 findings)
Start: WIP 5c01f150… (= origin, ls-remote). build-platform 4846f043….
Status per issue (updated as done):
- A1.1 (capital job id): done ec5a5046…: jobNamed() case-insensitive lookup, wanted lower-cases row.job; probe fixtures in resolver test. Red without fix (logs/R3-c1-red.log), green (R3-c1-green.log).
- A1.2 + whole nit (testTitles escapes): done 67a7a119…: context allowlist (expect, signal), hooks in file, return in describe, scoped shadow of it/test/describe; docs reworded. Mutants c2a-d red (logs/R3-c2?-red.log), green whole file 124 (R3-c2-green.log).
- A1.3 (D8 negation guard): done cb77264e…: /i on both, n't before over. Probes Not over / isn't over red at head, green under old regex; 'which is over its 1 MB' green (logs/R3-c3*).
- A2.1 (two-secrets fixture): done 30929b2e…; mutant sec-bound-arg red (R3-c4m-red.log), green (R3-c4-green.log).
- A2 nit include-entry expression fixture: done efba7d6d…; mutant beside-records-only red (R3-c5m-red.log), green.
- A2 nit argument at 131,072: done 9fe834e6…; mutant lim-arg-ge red (R3-c6m-red.log), green.
- A2 nit container starts-with fixture: done 328f0a18…; mutant cont-startswith red (R3-c7m-red.log), green.
- A2 nit wording (job's defaults.run; whose own text): done 3ec9349c…, ADR + JSDoc (ci.md has no such list).
- A3.1 (container options): done 0b720a92…; CI_TREE probes red: --env DOCKER_BUILD_SUMMARY, -e, -ie, --env-file=, ${{ }}, service --label docker_build_summary; green: --cpus/--entrypoint/--label env=1 (logs/R3-c8-*.log). Was green at 5c01f150 (verifier m1opt). Docs: ADR + ci.md; image config env stated as not read.
- A3.2a (set_env_/add_path_): done 09351c17…; fixtures for the m4built line, ADD_PATH_, an input; mutant without the names red (R3-c9m-red.log), green (R3-c9-green.log).
- A3.2b (repository scan): done b3196a08…; NAMES_FILE_COMMANDS closed list (4 files) via git grep; probe tools/probe.sh (m6script) red (R3-c10-probe-red.log), green (R3-c10-green.log). Docs ADR, ci.md, JSDoc.
- whole nit needsJsonBytes margin: done 6eec71ce…; NEEDS_JOB_BYTES 96 with hand count; rows computed so they follow; fixture 522->554; whole file 124 (R3-c11-green.log); mutant 62 red (R3-c11m-red.log).
- whole nit commit count: status file line corrected to 21 commits. whole nit file-command over-reach: no change (stricter, red not unsafe; verifier: acceptable). 
- lint fix for A3.1 message: 2648ccf0… (eslint no-base-to-string); probe still red (R3-c8-envopt2.log).
## Result
- Checks at 2648ccf0…: vitest unit tools/test, check-action-pins, check-toolchain 32 files / 459 passed; typecheck 22 projects passed; pnpm lint passed; whole workflows.test.ts 124 passed. merge-tree with build-platform 4846f043… clean.
- Pushed fast-forward 5c01f150…..2648ccf0… to co-001/wip-ci-images-digest (pre-push hook ran). PR branch untouched (83167b8f…).
- Next: check round 4 on a5bc1170..2648ccf0 (13 new commits 5c01f150..2648ccf0).
