# sgn-verify (stage 6, fresh clone) head ab68af87
## 1. Tree
- clone at ab68af87; origin/claude/build-platform 43565235 is an ancestor; 0 commits behind. 4 commits (e4e05a0d, b8654622, d557f7d9 UXR2-01, ab68af87 merge #83).
- 43 files; every file named in design or ADR 0081. Overlap with #42 (219 files): test-matrix.md, matrix.ts, registry.ts, watched-paths.txt only. No migration, nothing in packages/pricing.
- No model id in diff; commit messages only attribution lines. Emails only @synthetic.test.
## 2. Claims (pass)
- SEC-01: restartRoute (sign_in.restart, POST action, mfa bucket) clearPending + abandon(register_key grant release); kept email untouched; rate-limited wrapper still clears pending. db test asserts page/answer after restart = RESTARTED, signInPage keeps email.
- SEC-02: settle no_account -> clearSignIn; db test 534.
- UXS-02: ArrivalNotice role=note, tabIndex -1, no aria-live; Alert sets no live default. notice.tsx uses it only for restart reasons.
- UXS-03: limitPhrases under way -> "closes within N" Math.ceil.
- UXR2-01: enroll passes cue.closed "This step and its setup key have closed."; limitPhrases uses cue only for closed.
- Step markers: StepHeading in 3 pages; db + e2e assert 1/2,2/2 and 1/3..3/3.
- SGN-01..04 registry assertedBy files all exist and carry their SGN ids.
- Merge ab68af87: tree == git merge-tree d557f7d9 43565235; no base-side line lost in shared docs; PR side changes are #83's TBL rewrites.
## 4. CI on ab68af87 (all completed, 23 runs)
- success: all green, approval-of-record x3, build, capacity, changes x2, db 1-4/4, domain model, e2e 1-2/2, images, lint, mutation, screening-capacity gate, static, unit
- skipped (legitimate): stryker matrix (no money path), notify
## 3. Fast checks in clone (under lock, log scratchpad/vfast.log): all exit 0
- install frozen; typecheck; lint; lint:copy; lint:logs
- unit (auth, components, sign-in, synth, screening-capacity): 65 files 894 passed
- db sign-in-routes + sign-in: 2 files 29 passed
- synth --all: 0 written (269 cases, 661 unchanged); git diff clean
- watched.ts --write: 542 lines; git diff clean; git status clean
## Base recheck: origin/claude/build-platform still 43565235 (ancestor). VERDICT: passed
