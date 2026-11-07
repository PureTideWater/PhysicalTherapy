# Fix-round adversarial check: progress
Target WIP head 9a591c4a (fix round over 76da396a). Clone /home/user/fx42 (remove at end).
## Notes
- fix-round.md commit hashes for UX-UX-6/7, CRIT-2, UX-UX-3 differ from the report's (7078eb82/cbb41571/691ae195/43833b0f vs f4fc0062/1373cbf1/1cbe1b4a/5a6d68b0): check.
- Hashes: the round's real commits are fix-round.md's (b7c70f7a fe07722d 828679d6 b551cb52 badcd1ee 7078eb82 cbb41571 691ae195 43833b0f, merge 9a591c4a). The report's f4fc0062/1373cbf1/1cbe1b4a/5a6d68b0 exist nowhere (clone or worktree): report error (finding H1). b551cb52 is an amend of unpushed efdebf43 (fine). Remote co-001/wip = 9a591c4a confirmed.
- Read the round diff 76da396a..43833b0f (12 files). Users rows: th scope=row, sr-only names, aria-label "Role for <email>": fine; ActionForm/RefusalSummary take submit as ReactNode (lead quotes it; sr-only rides inside the quotes, acceptable). Attribution trailer is the repo-wide convention (all prior commits), not a new identifier.
- Wording nits seen: server every-row too_few "…care, so choose a file with rows of at least 11" (no "claim lines", "because…, so"); server too_many "(fewer quarters or payer products)" vs browser "such as a quarter or a payer product". Browser band_in_future/band_outside_content(row) still have no step (pre-existing, outside UX-2's two server strings).
- Next: pnpm install offline in clone; revert-and-run UX-UX-3 (user-rows.test) and UX-UX-1 (parse.test).
- Revert-and-run (clone, offline install): head green 43/43 (user-rows.test + parse.test). With user-rows' th/sr-only/aria-label stripped and messages.ts at 76da396a: 6 red (4 user-rows incl. the invitation phone list; parse too_many_rows and every-row too_few). Restored, tree clean. UX-UX-1, UX-UX-2 (browser twin), UX-UX-3 confirmed fixed with failing-first tests.
- Next: remerge-diff of 9a591c4a.
- Merge 9a591c4a: `git show --remerge-diff` empty (no hand edits); patch-id of 31a7345f..8a722f80 == 43833b0f..9a591c4a and 31a7345f..43833b0f == 8a722f80..9a591c4a: both sides kept exactly; TBL-08 and CI-30 both in matrix.ts/registry.ts.
- UX-4/5/6 tests pin the new strings (red by construction; not re-run: test:db needs a db, budget). UX-7: grid 1fr_6rem_11rem only. CRIT-2: focus pin at action-form.browser.test.tsx:1265. Shot screening.no-javascript.390 viewed: titled notice, fine.
- Design drift: 2.6 overflow row (design :513) still "then screen the file again"; code says "choose the file again" (2.7 row updated).
- Clone /home/user/fx42 removed. Status: DONE.
