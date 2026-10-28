# dlr-fix3-build (PR #78, UX-DLR-16/17/18)
Started 2026-10-28. Worktree /home/user/ux-download-refusals, base head e36a68bc. Do NOT push.

## Status
- [x] UX-DLR-16 DownloadLinks busy status (code, tests, ADR D4)
- [x] UX-DLR-17 contract mark clears on payer change (code, unit, e2e step edited, not run)
- [x] UX-DLR-18 ADR 0079 Revisit-when line
- [x] tsc / eslint / vitest / lint:copy (all exit 0)

## Commands and results
- Read: findings (verify-result.json screens-recheck), download-link.tsx/.test.tsx, letter*.tsx, letter.test.tsx, spec :155-246, ADR 0079 D4/Revisit. None of the target files is in pr42-files.txt.
- Design DLR-16: context SayRefusal -> one `tell` (fetching | said | fetched); exported pure `nextSaid` + `NoticePlace` for the unit tests (no DOM in vitest here: renderToStaticMarkup only). Status <p role=status class="text-sm text-muted-foreground empty:sr-only"> always mounted in the outer DownloadLinks' slot; `empty:sr-only` keeps the idle, empty status out of flow so the flex/grid gaps of every host (uploader gap-2, receipts gap-3, packet gap-4, review gap-2, AppShell) do not change. A fetch begun takes the slot (the earlier notice leaves), its outcome then takes it.
- Words: "Downloading the file…" (product's busy words: "Working…" action-form.tsx:112, version-form, export-status, stripe; "Sending…" screening/upload-form.tsx:283; uploader "Uploading N%"; share.tsx status "Copied."). Present participle + U+2026, as they are. brand.md has no rule against it (its loading rule is about the mark).
- DONE code DLR-16: apps/web/src/components/download-link.tsx (TellDownloads context with tell(Told); nextSaid; NoticePlace; link tells fetching/said/fetched; cn('aria-busy:cursor-progress', className)). Tests: download-link.test.tsx (4 markup tests updated for the idle status and the link's class; new describe 'what the place says while a file is fetched in place (UX-DLR-16)', 4 cases).
- CMD: flock /tmp/laneb-heavy.lock pnpm exec vitest run apps/web/src/components/download-link.test.tsx -> 17 passed.
- DONE DLR-17: letter-marks.tsx (LetterMarkIds.also, MarkedControl.checkValidity, LetterMark.also; watchLetterMarks listens for 'change' on the form, where the payer's change bubbles after LetterContractCheck's target listener, and clears a mark whose also names event.target when control.checkValidity()); letter.tsx ANSWERED_BY { contract: ['payer'] } passed as also; letter.test.tsx (FakeControl.valid/checkValidity, changeBubbling helper, 2 new cases + stop case extended); e2e/download-refusals.spec.ts step 'once corrected...' now expects the contract's mark gone after the payer change.
- CMD: flock ... vitest run letter.test.tsx download-link.test.tsx -> 35 passed.
- DONE ADR 0079: Deciders (+re-check's three), D4 (status, aria-busy cursor, fetch takes the place; reflowed item 4 to 120 cols), 5 letter (contract mark via also), Consequences R16 (next download begun takes it away; letter's contract mark), Not verified (status unit-only), Revisit when (#42: Forbidden optional link; UX-DLR-18).
- Reflowed comments: letter.tsx header, download-link.tsx nextSaid doc; ADR bullets R16 and Not verified reflowed to 120 cols.
- CMD (Tailwind check): node scratchpad/twcheck/run.mjs apps/web (postcss + @tailwindcss/postcss over globals.css) -> `.empty\:sr-only:empty {position:absolute; ...}` and `.aria-busy\:cursor-progress[aria-busy="true"] {cursor:progress}` generated.
- FINAL CMDS (one flock /tmp/laneb-heavy.lock):
  - apps/web: pnpm exec tsc --noEmit -p . -> exit 0 (log dlr-fix3-tsc.log, empty)
  - pnpm exec eslint --max-warnings 0 <6 changed .ts/.tsx files> -> exit 0 (dlr-fix3-eslint.log, empty)
  - pnpm exec vitest run download-link.test.tsx coverage/letter.test.tsx download-refusal.test.tsx uploads/uploader.test.tsx -> 4 files, 56 tests passed
  - pnpm lint:copy -> exit 0, "530 files read; the product copy keeps the brand's words."
- Not run: the e2e (download-refusals.spec.ts step edited for DLR-17; not in this step's check list). Nothing committed, nothing pushed. No #42 file changed (git diff --name-only vs pr42-files.txt).
- STATUS: complete.
