export const meta = {
  name: 'lane-b-ux-download-refusals-fix',
  description: 'PR #78 fix round: the verified review findings, then the full local suite once',
  phases: [
    { title: 'Core', detail: 'ForgetRefusal, the notice words, keptCodes, handler comment' },
    { title: 'Fix', detail: 'the letter; in-place downloads and the packet page; ADR and docs' },
    { title: 'Suite', detail: 're-read against the findings, the full local suite once, a commit (no push)' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/12cbf3a7-985c-52b3-adc0-b6d7ac05d769/scratchpad'
const WT = '/home/user/ux-download-refusals'
const FINDINGS = `${SP}/reviews-result.json`
const COMMON = `You are a builder in the fix round of PR #78 of the PaidWhole build (PureTideWater/PhysicalTherapy): UX PR 5, co-001/ux-download-refusals, "a refused download comes back to its page, never a JSON page" (UX-010; ADR 0079). Worktree ${WT}, head 53c7224 (CI green on every check). Work only there; do NOT commit or push unless your part says so.
The verified review findings are in ${FINDINGS}: under "results", review-security and review-ux hold each finding (id, failure, fix), and verify-security-<id> / verify-ux-<id> hold an independent skeptic's verdict and its corrected fix. Where the verdict's fix differs from the reviewer's, the VERDICT's fix wins (it was checked against the code). The design is /home/user/ops/designs/lane-b-ux-download-refusals.md (§6 wins over §2-5); ADR is docs/adr/0079-*.md.
The session's dispositions (follow them exactly):
- SEC-01: the verdict's narrowed fix: keptCodes also returns undefined when textPhiFindings(codes) finds anything; no separator normalisation; tests per the verdict, including that 'L1832, 0101T' stays kept; letter.test.tsx case; ADR wording.
- SEC-02 with UX-DLR-14: keep the letter's gate (entries read only beside a refusal). Add the verdict's pure forgetRefusalUrl(href, also) in forget-refusal.tsx; ForgetRefusal takes also; DownloadRefusal takes forget and passes it on; the letter passes payer, contract and codes; Reports passes list. Tests.
- SEC-03: the verdict's comment only, no code change.
- UX-DLR-01: the verdict's three parts (setTimeout plus replaceState(null, ...) so Next moves its canonical URL; its part 2 on the notice outlasting a router refresh while on the same page; its e2e step with router.refresh()).
- UX-DLR-02: the verdict's DownloadLink client component (plain primary click: fetch as a script, save the file from its blob under the Content-Disposition name, show a refusal in place in the product's words and focus it; the href kept for a new tab, a modifier click or no script), used by the receipts' Report link and the export review's two files; then a beforeunload guard in Uploader while any file is sending. Words come from a client-safe module (move downloadRefusalWords and minutesWords out of modules that import server-only code, e.g. rate-limit.ts or @tp/observability, into one the client can import; keep one source of the words). Unit tests for the save and refusal paths; an e2e step if cheap.
- UX-DLR-03: the verdict's describedBy/invalidMarks split, aria-describedby written as its own attribute on every letter control.
- UX-DLR-04: the verdict's LetterMarks client component (clear a control's mark on input or change; on a valid submit, take refused and fields (and the kept entries, per the verdict) out of the URL), tests.
- UX-DLR-05: the verdict's packet page Forbidden branch (the file's words in nextStep, ForgetRefusal as a sibling; never edit components/shell.tsx, a #42 file); then check every other returnTo page whose own permission can be narrower than its file's and do the same there.
- UX-DLR-06: the verdict's 'Choose a payer' option (not disabled); e2e expectation updated.
- UX-DLR-07: delete the placeholder; test guard.
- UX-DLR-08: every download refusal titled 'Not downloaded'; forbidden body 'Your role cannot download this file. Ask your organization’s administrator, who manages users and roles.'; the console's sentence kept; tests.
- UX-DLR-09: each example code in its own Figure, the separators in the sentence face.
- UX-DLR-10: messages after 'Error: ' with no field-name prefix: payer 'Choose one of the payers listed.', contract 'Choose one of this payer’s contracts, or None named.', codes 'Each code must be five letters or digits.'; tests and e2e updated.
- UX-DLR-11: keep the markup; the ADR and the PR say the one merged second of #78 and #74 moves the letter onto form-issues' FieldError and drops scroll-mt-18 for ADR 0077's scroll-padding-top.
- UX-DLR-12: not a defect: no change. UX-DLR-13: not a defect: the ADR's upload-report row says a zip's file returns to its receipt, which links the zip.
- UX-DLR-15: the verdict's setCustomValidity LetterContractCheck (not disabling optgroups).
Rules: never edit a PR #42 file (${SP}/pr42-files.txt) except adding rows to the shared docs; no migration, no new dependency, nothing under packages/pricing; no model identifier in any file; synthetic data only. Write code that reads like the surrounding code (doc comments in the repo's voice, naming, idiom); words follow .claude/rules/brand.md. export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH in every command; every heavy command only under flock /tmp/laneb-heavy.lock, long ones with run_in_background and waited on by notification. Run eslint, tsc for apps/web and the unit tests of the files you touch. Improve as you go: inside your files, do it and report it; outside, list it in notes. Report every command and result honestly.`
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}). If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const RESULT = { type: 'object', properties: { done: { type: 'array', items: { type: 'string' } }, filesChanged: { type: 'array', items: { type: 'string' } }, commands: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } }, notDone: { type: 'array', items: { type: 'string' } }, notes: { type: 'array', items: { type: 'string' } } }, required: ['done', 'filesChanged', 'commands', 'notDone', 'notes'] }

phase('Core')
const core = await agent(`${COMMON}
${SAVE('dlr-fix-core.md', 'what is done, the API changes, commands and results')}
Your part (others build on it): SEC-01 (lib/http/download-refusal.ts keptCodes and its tests), SEC-03 (handler.ts comment), UX-DLR-01 and the forget/also parts of SEC-02 and UX-DLR-14 (components/forget-refusal.tsx with forgetRefusalUrl, components/download-refusal.tsx's forget prop), UX-DLR-08 (the words and their tests), and the client-safe words module UX-DLR-02 needs (move downloadRefusalWords and minutesWords so a 'use client' component can import them without pulling server-only code; keep every current import working; guardMessage still says minutes the same way). Also UX-DLR-14's Reports part (reports/page.tsx passes forget for list). Leave the letter, the DownloadLink component, the packet page and the ADR to the other builders. Write the API changes (new props, the words module's path and exports) to ${SP}/progress/dlr-fix-api.md, then return.`, { label: 'fix-core', phase: 'Core', schema: RESULT })

phase('Fix')
const API = `The core part is done: ${JSON.stringify(core).slice(0, 3000)}. Its API notes: ${SP}/progress/dlr-fix-api.md. Do not change the core's files except to fix a defect you find (say so).`
const parts = await parallel([
  () => agent(`${COMMON}
${SAVE('dlr-fix-letter.md', 'what is done, commands and results')}
${API}
Your part: Coverage's letter: UX-DLR-03, 04, 06, 07, 09, 10, 15, the letter's side of SEC-01 (its test) and SEC-02 (pass forget to DownloadRefusal), in components/coverage/letter.tsx, the new client components the verdicts name (components/coverage/letter-marks.tsx, letter-contract-check.tsx), letter.test.tsx and the letter steps of apps/web/e2e/download-refusals.spec.ts (keep the spec's other steps; the downloads builder may add a step at its end: edit only the letter steps).`, { label: 'fix-letter', phase: 'Fix', schema: RESULT }),
  () => agent(`${COMMON}
${SAVE('dlr-fix-downloads.md', 'what is done, commands and results')}
${API}
Your part: UX-DLR-02 (components/download-link.tsx, used in components/uploads/receipts.tsx and the export review page packet/[versionId]/review/page.tsx; the beforeunload guard in components/uploads/uploader.tsx while a file is sending; unit tests; an e2e step at the END of download-refusals.spec.ts or in uploads.spec.ts if cheap, never touching the letter steps) and UX-DLR-05 (the packet page's Forbidden branch, and the same on every other returnTo page whose own permission can be narrower than its file's: check lib/routes and packages/db/src/authz/permissions.ts, read only).`, { label: 'fix-downloads', phase: 'Fix', schema: RESULT }),
  () => agent(`${COMMON}
${SAVE('dlr-fix-docs.md', 'what is done')}
${API}
Your part: the records. ADR 0079: SEC-01's wording (line ~171), ForgetRefusal's setTimeout and null state (UX-DLR-01) and the also/forget keys (SEC-02, UX-DLR-14), the in-place downloads on Uploads and the export review and the beforeunload guard (UX-DLR-02) as a refinement of D4, the packet page's Forbidden branch (UX-DLR-05), the titles (UX-DLR-08), the letter's words and client checks (UX-DLR-04, 10, 15), UX-DLR-11's merge note for #74 (FieldError, scroll-padding-top), UX-DLR-13's row wording. Keep the ADR's structure and voice. Also update docs/product/test-matrix.md's DLR rows and packages/synth/src/cases/matrix.ts to match only if an assertion changed in substance (they must stay identical to each other; run pnpm synth --all under the lock after any change and confirm only the DLR expected.json files changed). Coordinate by reading the other builders' progress files (${SP}/progress/dlr-fix-letter.md, dlr-fix-downloads.md) near the end, so the ADR says what was built.`, { label: 'fix-docs', phase: 'Fix', schema: RESULT }),
])

phase('Suite')
const suite = await agent(`${COMMON}
${SAVE('dlr-fix-suite.md', 'each check and command, its result, each fix made, the commit')}
You are the fix round's re-read and full local suite, after the builders (core, letter, downloads, docs). Their results: ${JSON.stringify({ core, parts }).slice(0, 12000)}
1. Re-read each finding in ${FINDINGS} against the code and the dispositions above; say for each: fixed (where), or not a defect, and whether it holds. Fix what does not hold (minimal, in the right file). Check git diff --name-only 53c7224 against ${SP}/pr42-files.txt (only rows added to the shared docs, and tools/screening-capacity/watched-paths.txt only as its generator writes it).
2. The full local suite ONCE, each command under the lock, Node 24, the way approval-summaries/lane-b-ux-suspended-standing-fix-suite.md (on /home/user/ops) ran it: pnpm install --frozen-lockfile; pnpm check:fixtures; pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm verify-content; the engine-freeze check against the merge base (tsx tools/engine-freeze/check.ts e908c214); pnpm exec tsx tools/screening-capacity/watched.ts --write then git diff --exit-code on watched-paths.txt (commit the regenerated file if it changes); pnpm synth --all then git diff --exit-code; pnpm test; pnpm test:golden; pnpm test:oracle (TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3); pnpm test:db in shards one after another (as many as the record used); pnpm build, the build stamp, then pnpm test:e2e with E2E_PREBUILT=1 in two shards (--workers=2), its own database and port (drop it after); tsx tools/stryker/affected.ts --event pull_request --base e908c214 and the shards it names, then the gate. Find the exact command forms in package.json, docs/runbooks/ci.md and the record. A failure is root-caused and fixed, then that command re-run; a flake gets one re-run and is reported as such.
3. When everything passes, commit the fix round in ${WT} on co-001/ux-download-refusals as one commit (or two if the generated watched list changed separately), message in the repo's style (a subject naming what changed, a body listing the findings fixed), ending with a blank line then:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L3tN5LCq2aNYetEQBNJYZg
Do NOT push: the session pushes. Write the suite's table (command, result) to /home/user/ops/approval-summaries/lane-b-ux-download-refusals-fix-suite.md in the record's format (commits, re-read, dispositions, suite table, proposals), shortening any 40- or 64-hex hash to 8 digits and an ellipsis; do not commit or push build-ops either.
Return the commit SHA(s) in done, the suite results in commands, anything failing in notDone.`, { label: 'fix-suite', phase: 'Suite', schema: RESULT })
return { core, parts, suite }