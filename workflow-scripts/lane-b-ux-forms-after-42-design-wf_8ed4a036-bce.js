export const meta = {
  name: 'lane-b-ux-forms-after-42-design',
  description: 'ux-forms-after-42: re-read design 7.8 against base 31a7345f with four scouts, write the design, one adversarial reviewer with skeptics per finding, a completeness critic, apply',
  phases: [
    { title: 'Scout', detail: 'four scouts over the current files' },
    { title: 'Write', detail: 'the design' },
    { title: 'Review', detail: 'one adversarial reviewer, skeptics per finding, a critic' },
    { title: 'Apply', detail: 'apply confirmed findings' },
  ],
}
const OPS = '/home/user/ops'
const WT = '/home/user/ux-forms-after-42'
const D = `${OPS}/designs/lane-b-ux-forms-after-42.md`
const PROG = `${OPS}/approval-summaries/lane-b-ux-forms-after-42-wip/progress`
const COMMON = `Context: PaidWhole build (CLAUDE.md is in your context). Lane B item ux-forms-after-42: the follow-up PR to #74 (ux-forms, merged 165c599, "forms keep what the person typed, and name the refused field"), queued until #42 (mail streams; merged 2026-11-02 as 22789493) merged. Worktree ${WT} on new local branch co-001/ux-forms-after-42 cut at claude/build-platform 31a7345f (installed). The original design is ${OPS}/designs/lane-b-ux-forms.md: section 7.8 (the after-#42 table), 3.4 (labels read from the page), 3.5/3.5a, 3.7 (the mark), 4.1 (pending), 5.1, 5.4 (format hints; the form-hints.test.ts allowlist entry for app/console/support/page.tsx), 10.3, 11 and 11.2 (proposals), 12 (review dispositions); its status ${OPS}/approval-summaries/lane-b-ux-forms-status.md ("Left for others": upload-form.tsx also handles 'stale' and RefusalLead and the person mark; the console support Ticket hint; the users page's raw checkbox; ZIP, email and screening wordings; support-mail.ts's "opaque ID"; console.ts's bare punctuation). Brand and words: .claude/rules/brand.md, CO-11, the ux-brand-reviewer agent .claude/agents/ux-brand-reviewer.md. Constraints: avoid the screening RESULT screens (another session's UX PR 4b; find its branch with git ls-remote origin | grep -i 4b or screening-labels and do not touch its files); LANES.md rule 6 for shared files (test-matrix, synth matrix/registry); no migration; no new dependency; counters (ADR, test-matrix rows) only by a COUNTER REQUEST (use placeholders FRM-<n>); open PRs #126 and #129 are in flight: list any file they share with this item. Improve as you go: improvements in files this PR changes are in scope. Every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:$PATH; heavy commands under flock /tmp/laneb-heavy.lock. READ ONLY on the repository and GitHub (no commits, pushes, comments). Write only your progress file and (writer/applier) ${D}.`
const SAVE = f => `SAVE rule: keep ${PROG}/${f} up to date as you go; if it exists when you start, continue from it.`
const SCOUTS = [
  { id: 'upload', what: 'apps/web/src/components/screening/upload-form.tsx as it is now: a11y-other-15 (the "Not sent" alert tied to the file input, focus on a refused file, "Reading the file" in the status region), its FIELD_NAMES table vs 3.4 label reading, startTransition before any await so useFormStatus is pending, aria-disabled button, stale/RefusalLead handling, the person mark; how ActionForm/form-issues.tsx/field.tsx now work (read them); its tests and e2e (screening specs); which screening files belong to the result screens (avoid) vs the upload form.' },
  { id: 'console', what: 'app/console/support/page.tsx Ticket hint and form-hints.test.ts allowlist; app/settings/organizations/[organizationId]/users/page.tsx raw confirm checkbox -> CheckboxField; lib/routes/console.ts words-other-01 email message and bare punctuation; support-mail.ts "opaque ID"; every other #42 file in apps/web with a raw control, a pattern without hint, a labels= prop or a form that does not use the shared fields (sweep #42\'s file list: git diff --name-only 22789493^1 22789493).' },
  { id: 'words', what: 'the ZIP wording across lib/routes/settings.ts, lib/zip.ts (ZIP_CODE_FORMAT) and every test asserting it (lib/screening/routes.db.test.ts and others; grep); lib/screening/routes.ts NO_PATIENT_INFORMATION and contactName vs the request-audit form\'s words (10.3); every other server message these forms show; the brand rules for each new wording.' },
  { id: 'proposals', what: 'section 11 and 11.2 proposals and the status file\'s list, as they stand on the current base (some may be done by later PRs, e.g. UX PRs 6-10, #84, #85): for each, done already / in scope here (in files this PR changes, or small and of the same kind) / out of scope (its own PR); components/shell.tsx and loading.tsx; the "one separator rule for every message" words pass; onboarding.spec.ts random tag; form-hints test idea of a static test that every practice-mutation ActionForm renders FormKeys. Also: which screens change, for the before/after shot list via tools/lane-b-screen-tour (read its README and manifest for screen ids, including *.error.* refused-form shots), at 1280 and 390 light and 1280 dark.' },
]
phase('Scout')
const scouts = await parallel(SCOUTS.map(s => () => agent(`${COMMON}

SCOUT ${s.id}: ${s.what}
Report with file:line evidence from the current tree, what 7.8 says, what has changed since it was written, and the recommended change (exact words where wording). ${SAVE('scout-' + s.id + '.md')}`, { label: `scout:${s.id}`, phase: 'Scout' })))
if (scouts.some(x => !x)) throw new Error('a scout returned nothing; resume')

phase('Write')
const w = await agent(`${COMMON}

WRITER: write ${D}, the design of co-001/ux-forms-after-42, from the scouts below and the original design. Sections: 1 scope and what changed since 7.8; 2 per file: current state (file:line), change, exact new words, tests (unit/browser/e2e; failing first where behaviour), and what a person sees; 3 decisions taken (recommended option, reasons; security the safer); 4 out of scope with where it goes; 5 the test-matrix rows needed (placeholders FRM-<n> and a COUNTER REQUEST line if any are needed) and docs (ADR 0077 amendment?); 6 build slices (parallel-safe file sets) and order; 7 the screen-tour shot list (ids, base 31a7345f vs head; 1280/390 light, 1280 dark; refused states); 8 risks and conflicts with open PRs and S5's 4b; 9 the review plan (the UX and brand review; a second review only if sign-in, security, PHI or money is touched: say whether). ${SAVE('write.md')}
Scouts: ${JSON.stringify(scouts)}`, { label: 'write', phase: 'Write' })

phase('Review')
const FIND = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, what: { type: 'string' }, where: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should', 'nit'] } }, required: ['id', 'what', 'where', 'evidence', 'fix', 'severity'] } } }, required: ['findings'] }
const rev = await agent(`${COMMON}

ADVERSARIAL DESIGN REVIEWER (the role of .claude/agents/ux-brand-reviewer.md plus correctness): review ${D} against the current tree, the original design, brand rules, WCAG 2.1 AA with 2.2's 3.3.7 and 2.4.11, and the constraints. Hunt: wrong file:line or stale claims, wording that breaks brand rules, a change that loses typed input or breaks no-JS posting, focus or announcement mistakes, tests that would not fail first, missing screens in the shot list, scope creep into S5's files or result screens, a missed #42 file, a PHI risk (a field value in a URL, log or message). ${SAVE('review.md')}`, { label: 'review', phase: 'Review', schema: FIND })
const VERD = { type: 'object', properties: { refuted: { type: 'boolean' }, reason: { type: 'string' }, refinedFix: { type: 'string' } }, required: ['refuted', 'reason', 'refinedFix'] }
const judged = await parallel((rev?.findings || []).map(f => () => parallel([0, 1].map(k => () => agent(`${COMMON}

SKEPTIC ${k + 1} of 2: try to REFUTE this design finding against the tree and ${D}; default refuted=true if it does not hold up. Finding: ${JSON.stringify(f)}`, { label: `skeptic:${f.id}:${k}`, phase: 'Review', schema: VERD }))).then(vs => ({ f, vs: vs.filter(Boolean), keep: vs.filter(Boolean).filter(v => !v.refuted).length >= 1 }))))
const kept = judged.filter(j => j.keep)
log(`${kept.length} of ${(rev?.findings || []).length} findings survive`)
const critic = await agent(`${COMMON}

COMPLETENESS CRITIC of ${D}: what is missing (a #42 file not swept, a proposal not dispositioned, a test not planned, a screen not in the shot list, a conflict not listed, a counter not requested)? Check each yourself. Confirmed review findings so far: ${JSON.stringify(kept.map(k => k.f))}. ${SAVE('critic.md')}`, { label: 'critic', phase: 'Review', schema: FIND })

phase('Apply')
const ap = await agent(`${COMMON}

APPLY to ${D}: each confirmed finding (with the skeptics' refined fixes) and each critic finding you confirm against the tree; add a final section "Review dispositions" listing every finding (review, skeptics' votes, critic) and what was done; refuted ones named with the reason. ${SAVE('apply.md')}
Confirmed: ${JSON.stringify(kept.map(k => ({ f: k.f, refined: k.vs.map(v => v.refinedFix) })))}
Refuted: ${JSON.stringify(judged.filter(j => !j.keep).map(j => ({ id: j.f.id, why: j.vs.map(v => v.reason) })))}
Critic: ${JSON.stringify(critic)}
Return: a summary of the design (slices, shot list size, counters needed, second review needed or not).`, { label: 'apply', phase: 'Apply' })
return { w, kept: kept.length, critic, ap }
