export const meta = {
  name: 'lane-b-ux-payer-response-reviews',
  description: '#85 reviews: security with the money lens in a fresh clone; UX and brand from before/after tour shots; every finding adversarially verified',
  phases: [{ title: 'Security review' }, { title: 'Shots' }, { title: 'UX review' }, { title: 'Verify' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const HEAD = '29dded5'
const BASE = '165c599'
const DESIGN = '/home/user/ops/designs/lane-b-ux-payer-response.md'
const COMMON = `Context: PaidWhole monorepo (CLAUDE.md applies, its four rules that never bend included). Pull request #85 (draft, PureTideWater/PhysicalTherapy), branch co-001/ux-payer-response at ${HEAD}, base claude/build-platform at ${BASE}: "the payer's answer and the write-off reason start unchosen; the payer's letter is uploaded in its response" (UX PR 10: UX-035, UX-007; ADR 0085; CAS-45 to CAS-48). Its design is ${DESIGN} (sections 1 to 9; section 9 the review's dispositions; 3.9 what it leaves open, which is not a finding unless it is wrong). The build's results: ${SP}/pay-build-result.json.
Machine rules: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH in every command. One heavy command at a time on this machine shared with other agents: wrap pnpm install, build, typecheck, tests, e2e, the screen tour's build/serve/run and any browser run in "flock /tmp/laneb-heavy.lock <cmd>", never holding the lock longer than one command. Never a foreground sleep. Chromium 1248 in /opt/pw-browsers. PostgreSQL 18 on 5433 and 16 on 5432 (postgres:test). Synthetic data only. No model name or identifier in any file you write. Never write the development master key to a file. Never run git add, commit, push, checkout, reset or stash in /home/user/PhysicalTherapy, /home/user/ux-payer-response or /home/user/ops unless your task says so: the orchestrator commits.`
const FINDINGS = { type: 'object', properties: {
  findings: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'polish'] },
    file: { type: 'string' }, line: { type: 'number' }, title: { type: 'string' },
    detail: { type: 'string' }, failureScenario: { type: 'string' }, proposedFix: { type: 'string' },
    introducedByThisPR: { type: 'boolean' },
  }, required: ['id', 'severity', 'file', 'title', 'detail', 'failureScenario', 'proposedFix', 'introducedByThisPR'] } },
  summary: { type: 'string' }, notSeen: { type: 'array', items: { type: 'string' } },
}, required: ['findings', 'summary', 'notSeen'] }
const VERDICT = { type: 'object', properties: {
  real: { type: 'boolean' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'polish', 'not-a-defect'] },
  inScope: { type: 'boolean', description: 'fixable in this PR without a migration, a #42 file or a founder decision' },
  reasoning: { type: 'string' }, fix: { type: 'string' },
}, required: ['real', 'severity', 'inScope', 'reasoning', 'fix'] }
const verify = (f, track) => agent(`${COMMON}

You are an adversarial verifier for one finding of ${track} on PR #85. Try hard to REFUTE it: read the code at ${HEAD} (git -C /home/user/PhysicalTherapy show ${HEAD}:<path>), trace the claimed failure path from a real person or input, check whether it also happens on ${BASE}, and check the design's dispositions (section 9) and what it leaves open (3.9, 7.2) for a recorded decision. Default to real=false if after honest effort you cannot make the failure happen. If real, give the minimal correct fix and whether it fits this PR (no migration, no #42 file, nothing the founder must decide). Edit no file.
The finding:
${JSON.stringify(f, null, 1)}`, { label: `verify:${f.id}`, phase: 'Verify', schema: VERDICT }).then((v) => ({ ...f, track, verdict: v }))

const secTrack = async () => {
  const review = await agent(`${COMMON}

You are adversarial reviewer 2 of 2 on PR #85: SECURITY, with the MONEY lens. Work in a fresh clone: git clone -q https://github.com/PureTideWater/PhysicalTherapy ${SP}/rev85-sec (reuse it if it exists), fetch co-001/ux-payer-response, check out ${HEAD} exactly. Review the whole diff ${BASE}..${HEAD}. Security: apply .claude/agents/security-reviewer.md to every changed route, query, component and upload path: tenancy (practice scope and RLS), authorization in the handler and Postgres, CSRF and request keys, the letter check and its lock (TOCTOU, lock key text, races with tagging, amend and supersede), what a crafted post can name, PHI in keys, filenames, logs, errors and audit, the upload inside the form (a wrong practice, a replayed key, a scan still running, a held or duplicate document), the audited reads. Money: apply .claude/agents/payment-engine-reviewer.md's concerns: no stage, approval or ledger record a person did not choose; the write-off refusal (can a contradicted reason still pass by any path: bulk, a race with triage, a null window); the words under Response true to case_rules and reconcile; no engine or ledger change. For each finding say whether it predates this PR (on ${BASE} too). ${SAVE('rev85-sec.md', 'each file reviewed and each finding')}`, { label: 'review:security+money', phase: 'Security review', schema: FINDINGS })
  if (!review) return { review: null, verified: [] }
  const verified = await parallel(review.findings.map((f) => () => verify(f, 'the security and money review')))
  return { review, verified: verified.filter(Boolean) }
}

const uxTrack = async () => {
  const shots = await agent(`${COMMON}

Your task: take the before and after screenshots the UX and brand reviewer needs for PR #85, with tools/lane-b-screen-tour (/home/user/ops/tools/lane-b-screen-tour; read its README whole, especially "From another lane", "Set-up and a run" and the pitfalls). The sample is the design's section 6.2 (${DESIGN}): every route and state it lists at 1280 px and 390 px light, and 1280 px dark (tokens only). Find the tour's ids in capture/tour.spec.ts and /home/user/ops/designs/lane-b-ux-review/route-map.json; add the cap(...) calls the design asks for (6.2, and 4.8's act change: the tour's p.submissions.error step must choose a letter before pressing, or it stops at the browser's own check on the empty required select) to /home/user/ops/tools/lane-b-screen-tour/capture/tour.spec.ts and route-map.json, written so the same spec runs on both the base and the head (the base has no letter field: guard by what the page shows). Do not commit; the orchestrator does.
Runs: TOUR_DIR=${SP}/screens85-before with TOUR_REF=${BASE}, then TOUR_DIR=${SP}/screens85-after with TOUR_REF=origin/co-001/ux-payer-response (it must resolve to ${HEAD}; check). Each: setup.sh, build and run.sh with TOUR_ONLY set to the sample's ids, under the lock as the README says; stop the server and check fuser 3297/tcp is empty; drop tp_e2e_screens and remove /tmp/tp-e2e-tp_e2e_screens-* after each. Then tile.py on each TOUR_DIR (with /usr/bin/python3 -I if /opt/py312-ci lacks Pillow), and the gallery files (convert.py and build.py for each run and width, title "PR #85 payer response", width labels "before, 1280" and so on, a lede naming the commit) for the orchestrator to publish; do not publish. Never put a PNG or tile on a branch. ${SAVE('shots85.md', 'the sample ids, each run step and result, retakes, folders')}
Return: the sample (route, state, id per width and theme), the before and after tile folders, each shot that failed or was skipped and why, the gallery folders, the tour.spec.ts and route-map.json changes.`, { label: 'shots', phase: 'Shots' })
  const review = await agent(`${COMMON}

You are adversarial reviewer 1 of 2 on PR #85: the UX and BRAND review. Read .claude/agents/ux-brand-reviewer.md (at the head: git -C /home/user/PhysicalTherapy show ${HEAD}:.claude/agents/ux-brand-reviewer.md) and follow it whole: the brand (.claude/rules/brand.md, docs/brand/BRAND.md, CO-11), WCAG 2.1 AA with 2.2's additions, and the UX baseline review (/home/user/ops/designs/lane-b-ux-review.md; UX-035 and UX-007 especially; the review's other findings on these screens). Work from the before and after shots (Read each tile image) AND the code (a fresh clone: git clone -q https://github.com/PureTideWater/PhysicalTherapy ${SP}/rev85-ux, reuse if it exists, check out ${HEAD}). Check every string a person sees against the design's section 6.1 and the brand voice; the unchosen selects (the empty option's words, the required refusal named on its field after a press), the withheld-reason hint, the words under Response (true and readable), the letter's upload inside the form (its states and status line, the heading levels, the grouped list, the "(uploaded here)" mark, focus and live regions, nothing lost while it scans), the contract panel's words, 390 px layouts (nothing clipped or overflowing, 16 px controls), the dark shots, and whether UX-035 and UX-007 are visibly fixed. Name each finding by its shot id (in backticks). A screen the sample does not cover is "not seen, by sample".
The shots agent's result:
${shots || '(missing: read ' + SP + '/progress/shots85.md)'}
${SAVE('rev85-ux.md', 'each shot pair reviewed and each finding')}`, { label: 'review:ux+brand', phase: 'UX review', schema: FINDINGS })
  if (!review) return { shots, review: null, verified: [] }
  const verified = await parallel(review.findings.map((f) => () => verify(f, 'the UX and brand review')))
  return { shots, review, verified: verified.filter(Boolean) }
}

const [sec, ux] = await parallel([secTrack, uxTrack])
const all = [...((sec && sec.verified) || []), ...((ux && ux.verified) || [])]
log(`${all.length} findings verified; ${all.filter((f) => f.verdict && f.verdict.real).length} real`)
return { sec, ux }
