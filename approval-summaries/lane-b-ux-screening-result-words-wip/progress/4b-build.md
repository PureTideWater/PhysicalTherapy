# UX PR 4b build progress
Worktree /home/user/ux-screening-result-words, branch co-001/ux-screening-result-words, base 31a7345f.
Started 2026-11-07. Tags on origin: 0 (checked at start). No SQL holds label words or hash (only the version name).

## Gap decisions (critic)
- G1 cond.1 exact rule: ACCEPT (lowercase after colon; grep -F check).
- G2 P5 needs Lane A confirm: ACCEPT as a reported pre-merge step (builder cannot reach Lane A); P5 (4B-07) in its OWN commit so it can move.
- G3 :431/:432 scoped to tableCopy: ACCEPT.
- G4 one group drops order sentence: build 3.4 AS WRITTEN (sentence for every groups>=1); proposal for UX review.
- G5 DATA/convert hoist to module scope: ACCEPT.
- G6 ADR 0062: '## Amendment (UX PR 4b)' at end + Status line + one-line pointer after :244: ACCEPT.
- G7 labels.ts:13-17 / labels.test.ts:8-13 comments qualified: ACCEPT.
- G8 screenshot list: ACCEPT, in PR description draft (scratchpad/4b-pr-description.md).
- G9 stale cites: brand.md:38-39, screening-phone.spec.ts:289-309: ACCEPT.

## Commit themes (planned)
A tones + $5 mono (4B-01..03, 05) ; B count sentence + last entry (4B-04) ; C labels re-pin w/o P5 (4B-06,08,09,10 part) ;
D P5 figure labels (4B-07 + hash) ; E specs (4B-13..15) ; F TBL-08 + synth + watched (4B-16,19) ; G ADRs (4B-17,18)

## Status
- [x] Theme A (4B-01,02,03,05 + 4B-11 tone/$5/scope pins + 4B-12 a,c,e,f; DATA hoisted G5): red 6 fails -> green. commit 94fe2f7d
- [x] Theme B (4B-04 + 4B-11 count pins + 4B-12 b,d; G4: 3.4 as written, order sentence kept for 1 group): red 5 -> green. commit 8253175c
- [x] Theme C (4B-06,08,09,10 w/o P5 + G1,G6,G7 + 4B-11 :273/:550 + 4B-12g differences + 4B-13 :509): red 5 -> hash red -> green; hash 46fe0a02...bec0. commit 1856d0a5
- [x] Theme D (4B-07 P5 alone + hash 7e533a5e...c968 + 4B-12g figures + ADR 0062 figure half): red 2 -> hash red -> green. commit 86a85511
- [x] Theme E (4B-13 :517, 4B-14 holdScreeningStream, 4B-15 1280 tones): e2e not run yet. commit e2d9c786
- [x] Theme F (4B-16 + 4B-19 generators: synth 1 written; watched-paths unchanged 578 lines): fixtures.test + watched.test pass. commit 87cb3d66
- [x] Theme G (4B-18 ADR 0078/0056; 4B-17 ADR 0062 done in C/D). commit 31b617c8
- [x] typecheck fix commit c2725961; pnpm typecheck passed (23 projects)
- [x] PR description draft: scratchpad/4b-pr-description.md (G2, G4, G8, 12.1 record)
## Final checks (head c2725961d720ac437bf61a1686e22a5b6124eaf1)
- pnpm typecheck passed (23 projects); pnpm lint:copy passed (595 files); eslint on every changed file clean
- vitest unit apps/web/ + tools/screening-capacity + packages/synth: 139 files, 1948 tests passed
- check:fixtures passed; tags on origin 0; git status clean
- NOT run: e2e (screening.spec.ts, screening-phone.spec.ts) - left to the workflow's e2e step
## Remains
- push + draft PR (integrator), Lane A confirm P5 (G2), tag check before merge, UX & brand review with shots, status file
