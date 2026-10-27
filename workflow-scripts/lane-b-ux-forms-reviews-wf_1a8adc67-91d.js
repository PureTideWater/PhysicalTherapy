export const meta = {
  name: 'lane-b-ux-forms-reviews',
  description: '#74 reviews: security and accessibility review in a fresh clone; UX and brand review from before/after tour shots; the never-run e2e specs; every finding adversarially verified',
  phases: [{ title: 'E2E' }, { title: 'Security review' }, { title: 'Shots' }, { title: 'UX review' }, { title: 'Verify' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const WT = '/home/user/ux-forms'
const HEAD = '4f0b526'
const BASE = 'e908c21'
const DESIGN = '/home/user/ops/designs/lane-b-ux-forms.md'
const COMMON = `Context: PaidWhole monorepo (CLAUDE.md applies). Pull request #74 (draft, PureTideWater/PhysicalTherapy), branch co-001/ux-forms at ${HEAD}, base claude/build-platform at ${BASE}: "Forms keep what the person typed and name the refused field" (the UX baseline review's UX-001; ADR 0077; test matrix FRM-01 to FRM-08). Its design is ${DESIGN} (sections 1 to 12 and 12.1); its build records are /home/user/ops/approval-summaries/lane-b-ux-forms-build-2b.md and /home/user/ops/designs/lane-b-ux-forms/build/.
Machine rules: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH in every command. One heavy command at a time on this 4-CPU machine shared with another agent: wrap pnpm install, build, typecheck, lint, tests, e2e, the screen tour's build/serve/run and any browser run in "flock /tmp/laneb-heavy.lock <cmd>", and never hold the lock longer than one command. Never a foreground sleep: run long commands with run_in_background and wait for the notification, or a Monitor until-loop. Playwright's pinned Chromium 1194 is installed in /opt/pw-browsers. PostgreSQL 18 on 5433 and 16 on 5432 (postgres:test). Synthetic data only; never type or invent real-looking patient, claim or payer data. No model name or identifier in any file you write. Never write the development master key to a file. Never run git add, commit, push, checkout, reset or stash in /home/user/PhysicalTherapy, ${WT} or /home/user/ops unless your task says so: the orchestrator commits. Improve as you go: inside your task, do it and say so; outside it, list it as a proposal.`
const FINDINGS = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string', description: 'SEC-n / A11Y-n / UX-n' },
      severity: { type: 'string', enum: ['blocking', 'should-fix', 'polish'] },
      file: { type: 'string' }, line: { type: 'number' },
      title: { type: 'string' },
      detail: { type: 'string', description: 'what is wrong, with evidence (file:line, shot id)' },
      failureScenario: { type: 'string', description: 'a realistic path from a real person or input to the harm' },
      proposedFix: { type: 'string' },
      introducedByThisPR: { type: 'boolean', description: 'false when it predates the PR (on the base too)' },
    }, required: ['id', 'severity', 'file', 'title', 'detail', 'failureScenario', 'proposedFix', 'introducedByThisPR'] } },
    summary: { type: 'string' },
    notSeen: { type: 'array', items: { type: 'string' }, description: 'what the review could not check, and why' },
  },
  required: ['findings', 'summary', 'notSeen'],
}
const VERDICT = { type: 'object', properties: {
  real: { type: 'boolean' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'polish', 'not-a-defect'] },
  inScope: { type: 'boolean', description: 'fixable in this PR without a migration, a #42 file or a founder decision' },
  reasoning: { type: 'string' }, fix: { type: 'string', description: 'the minimal correct fix, if real' },
}, required: ['real', 'severity', 'inScope', 'reasoning', 'fix'] }

const verify = (f, track) => agent(`${COMMON}

You are an adversarial verifier for one finding of ${track} on PR #74. Try hard to REFUTE it: read the code at ${HEAD} (git -C /home/user/PhysicalTherapy show ${HEAD}:<path>, or the clone the reviewer used), trace the claimed failure path from a real person or input, check whether it also happens on the base ${BASE}, and check the design's dispositions (${DESIGN} section 12 and 12.1) for a recorded decision. Default to real=false if after honest effort you cannot make the failure happen. If real, give the minimal correct fix and whether it can be fixed inside this PR (no migration, no #42 file from /home/user/ops/designs/lane-b-release-content-checks/pr42-files.txt, nothing the founder must decide). Edit no file.
The finding:
${JSON.stringify(f, null, 1)}`, { label: `verify:${f.id}`, phase: 'Verify', schema: VERDICT })
    .then((v) => ({ ...f, track, verdict: v }))

// Track 1: the e2e specs this PR changes or depends on, never run until now.
const e2eTrack = async () => {
  return agent(`${COMMON}

Your task: run the e2e specs this PR adds or changes, which have never run, and make them pass by fixing the branch (test or product code, whichever is wrong per the design). Work in the worktree ${WT} (branch co-001/ux-forms at ${HEAD}). Specs: apps/web/e2e/forms-keep-input.spec.ts (new), packets.spec.ts (the refused "Partially accepted" step), pricing.spec.ts (its run-form refusals), triage.spec.ts (the refused write-off), sign-in, onboarding and contracts specs (their refusal() helper and refills). Read apps/web/playwright.config.ts, apps/web/package.json and /home/user/ops/lanes/lane-b.md ("full local suite": build, stamp, then e2e with E2E_PREBUILT=1) for how to run them; build once under the lock, then run the specs with --workers=2 under the lock. For each failure: read the trace or error context, decide whether the test or the product is wrong (the design decides), fix it, re-run that spec. A failure that also fails on the base ${BASE} (prove it by running it in a fresh worktree of ${BASE}) is recorded with proof, not fixed. Never skip, disable, quarantine or loosen a test to get green. After any product code change, re-run pnpm typecheck, eslint on the changed files and the unit tests of the touched components under the lock. Clean up the e2e database and temporary directories at the end. ${SAVE('e2e.md', 'each spec run, each failure, its cause and fix, each re-run')}
Return: each spec with passed/failed counts, each failure with its cause and fix (file:line), the files changed, and proposals.`, { label: 'e2e', phase: 'E2E' })
}

// Track 2: security and accessibility review in a fresh clone.
const secTrack = async () => {
  const review = await agent(`${COMMON}

You are adversarial reviewer 2 of 2 on PR #74: SECURITY and ACCESSIBILITY. Work in a fresh clone: git clone -q https://github.com/PureTideWater/PhysicalTherapy ${SP}/rev-sec (if it exists, reuse it) && git -C ${SP}/rev-sec checkout -q ${HEAD} (fetch origin co-001/ux-forms first). Install only if you need to run a test (under the lock). Review the whole diff ${BASE}..${HEAD}.
Security: apply .claude/agents/security-reviewer.md's checklist to every changed route, action, component and log site: tenant isolation, authorization in the handler, CSRF and request-key replay (ADR 0017), the new stale and unconfirmed paths (could a refresh or a replay save twice, or skip a check?), what reaches the browser (no typed value echoed in ActionState or the flight payload, no PHI in a URL, key, log or error), secrets emptied (password, one-time code, data-secret), the PasswordField's show toggle (spellcheck, autocomplete, re-hidden before submit), XSS through labels read from the page into the summary (innerText vs innerHTML), the router.refresh paths, CSP (no style attribute), and the no-JavaScript post.
Accessibility: WCAG 2.1 AA with 2.2's 3.3.7 (redundant entry) and 2.4.11 (focus not obscured): the summary's role and focus, every field's aria-invalid and aria-describedby order (error, emptied note, hint), CheckboxGroup's fieldset/legend and its itemized names, the aria-disabled button and its status line (announced once, not twice), the 16 px rule, focus after a refusal (one rule), the sticky header and scroll-padding, keyboard paths, and what a screen reader hears (design 3.9).
For each finding, check whether it predates this PR (on ${BASE} too). Read the design's section 12 dispositions so you do not re-raise a decided point without new evidence. ${SAVE('review-sec.md', 'each file reviewed and each finding')}`, { label: 'review:security+a11y', phase: 'Security review', schema: FINDINGS })
  if (!review) return { review: null, verified: [] }
  const verified = await parallel(review.findings.map((f) => () => verify(f, 'the security and accessibility review')))
  return { review, verified: verified.filter(Boolean) }
}

// Track 3: before/after shots, then the UX and brand review.
const uxTrack = async () => {
  const shots = await agent(`${COMMON}

Your task: take the before and after screenshots the UX and brand reviewer needs for PR #74, with tools/lane-b-screen-tour (on claude/build-ops, at /home/user/ops/tools/lane-b-screen-tour; read its README whole, especially "From another lane", "Set-up and a run" and the pitfalls). The sample is the design's section 10.1 table (${DESIGN}): every listed route and state at 1280 px and 390 px light, and 1280 px dark (tokens only), plus one shot per layout after a shared-component change. Find the tour's shot ids for them in capture/tour.spec.ts and /home/user/ops/designs/lane-b-ux-review/route-map.json. Where the tour does not yet take a state the table names (e.g. the support page's error-unconfirmed and error-stale, the coverage checklist review, the console status error-row, the sign-in 390 error), add its cap(...) calls to /home/user/ops/tools/lane-b-screen-tour/capture/tour.spec.ts (the tour's own file on claude/build-ops; do not commit; the orchestrator does) and its entry to route-map.json, following the spec's existing helpers; the same spec must run for both the before and the after so they compare.
Runs: TOUR_DIR=${SP}/screens-before with TOUR_REF=${BASE}, then TOUR_DIR=${SP}/screens-after with TOUR_REF=origin/co-001/ux-forms (it must resolve to ${HEAD}; check). Each: setup.sh, build (or build-only + reserve) and run.sh with TOUR_ONLY set to the sample's ids, under the lock as the README says; stop the server and check fuser 3297/tcp is empty; clean up the tp_e2e_screens database and /tmp/tp-e2e-tp_e2e_screens-* after each. Then python3 -I tools/lane-b-screen-tour/tile.py on each TOUR_DIR for the sample's prefixes. Then the private gallery files: python3 -I /home/user/ops/tools/lane-b-screen-gallery/convert.py and build.py for each run and width (read its README), so the orchestrator can publish them; do not publish. Never put a PNG or tile on a branch. ${SAVE('shots.md', 'the sample ids, each run step and its result, retakes, the tiles folders, the gallery folders')}
Return: the sample (route, state, id per width and theme), the before and after tile folders and their index.json paths, each shot that failed or was skipped and why, the gallery folders, the tour.spec.ts and route-map.json changes, and proposals.`, { label: 'shots', phase: 'Shots' })
  const review = await agent(`${COMMON}

You are adversarial reviewer 1 of 2 on PR #74: the UX and BRAND review. Read .claude/agents/ux-brand-reviewer.md (on the PR head: git -C /home/user/PhysicalTherapy show ${HEAD}:.claude/agents/ux-brand-reviewer.md) and follow it whole: the brand (.claude/rules/brand.md, docs/brand/BRAND.md, CO-11), WCAG 2.1 AA with 2.2's additions, and the UX baseline review (/home/user/ops/designs/lane-b-ux-review.md and its findings under /home/user/ops/designs/lane-b-ux-review/, especially the 31 findings this PR answers, named in ${DESIGN}). Work from the before and after shots (Read each tile image) AND the code (a fresh clone: git clone -q https://github.com/PureTideWater/PhysicalTherapy ${SP}/rev-ux, reuse if it exists, checkout ${HEAD}). Check every string a person sees against the design's section 10.2 and the brand voice, every refused state (summary first, the lead, names from the label, "Error:" lines, the 2 px mark, the emptied note, the pending status line, Show password), the 390 px layouts (16 px controls, wrapping, nothing clipped or overlapping, the summary on its own line), the dark shots (tokens only), and whether each baseline finding this PR claims to fix is visibly fixed. Name each finding by its shot id (in backticks). A screen the sample does not cover is "not seen, by sample" in notSeen.
The shots agent's result:
${shots || '(missing: read ' + SP + '/progress/shots.md)'}
${SAVE('review-ux.md', 'each shot pair reviewed and each finding')}`, { label: 'review:ux+brand', phase: 'UX review', schema: FINDINGS })
  if (!review) return { shots, review: null, verified: [] }
  const verified = await parallel(review.findings.map((f) => () => verify(f, 'the UX and brand review')))
  return { shots, review, verified: verified.filter(Boolean) }
}

const [e2e, sec, ux] = await parallel([e2eTrack, secTrack, uxTrack])
const all = [...((sec && sec.verified) || []), ...((ux && ux.verified) || [])]
log(`${all.length} findings verified; ${all.filter((f) => f.verdict && f.verdict.real).length} real`)
return { e2e, sec, ux }
