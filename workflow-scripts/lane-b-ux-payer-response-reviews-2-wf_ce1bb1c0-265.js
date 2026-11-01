export const meta = {
  name: 'lane-b-ux-payer-response-reviews-2',
  description: '#85 reviews on 90ec40ab: security+money in a fresh clone; UX+brand from before (83d71fd6) / after (90ec40ab) tour shots with the sample gaps closed; second-pass finders; every finding verified by 3 skeptics',
  phases: [{ title: 'Security review' }, { title: 'Shots' }, { title: 'UX review' }, { title: 'Second pass' }, { title: 'Verify' }],
}
const WIP = '/home/user/ops/approval-summaries/lane-b-ux-payer-response-wip'
const SAVE = (file, what) => `Save as you go: keep ${WIP}/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust it unless the code says otherwise, and continue from where it stopped. Do not commit in /home/user/ops unless your task says so.`
const HEAD = '90ec40ababcf98a81519ff30e5208186065b88c8'
const BASE = '83d71fd62c6d419be61fd7aaa5b9033ef5c18b56'
const DESIGN = '/home/user/ops/designs/lane-b-ux-payer-response.md'
const COMMON = `Context: PaidWhole monorepo (CLAUDE.md applies, its four rules that never bend included). Pull request #85 (draft, PureTideWater/PhysicalTherapy), branch co-001/ux-payer-response at ${HEAD} (a merge of the PR's own commit 29dded52 with the base ${BASE}); the PR's own diff is git diff ${BASE} ${HEAD}: "the payer's answer and the write-off reason start unchosen; the payer's letter is uploaded in its response" (UX PR 10: UX-035, UX-007; ADR 0085; CAS-45 to CAS-48). Its design is ${DESIGN} (section 9 the design review's dispositions; 3.9 and 7.2 what it leaves open and hands to Lane A, which is not a finding unless it is wrong; ignore its claims that #78 and #81 are open drafts: both merged into ${BASE}). The build's results: ${WIP}/pay-build-check.md; the design critic's nits n1-n8: ${WIP}/pay-critic.md (already known: do not re-report them as new findings unless you find them worse than stated); the base merge: ${WIP}/pay-merge-83d71fd6*.md.
Machine rules: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH in every command. One heavy command at a time on this machine shared with other agents: wrap pnpm install, build, typecheck, tests, e2e, the screen tour's build/serve/run and any browser run in "flock /tmp/laneb-heavy.lock <cmd>", never holding the lock longer than one command; long ones run_in_background and waited on; never a foreground sleep; never pkill -f a pattern your own shell matches. Chromium 1248 in /opt/pw-browsers. PostgreSQL 18 on 5433 and 16 on 5432 (postgres:test). Synthetic data only. No model name or identifier in any file you write. Never write the development master key to a file. Never run git add, commit, push, checkout, reset or stash in /home/user/PhysicalTherapy, /home/user/ux-payer-response or /home/user/ops unless your task says so.`
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
const LENSES = [
  'REPRODUCE: trace the claimed failure from a real person or input through the actual code at the head; if you cannot make it happen, it is not real',
  'SCOPE AND RECORD: check whether it predates the PR (on the base too), whether the design (section 9, 3.9, 7.2) or ADR 0085 already decided it with a reason, and whether it is really a defect rather than a preference',
  'IMPACT: judge the real consequence for a person, the money, tenancy, PHI or the brand; a finding with no real consequence is not-a-defect or polish',
]
const verify = (f, track) => parallel(LENSES.map((lens, i) => () => agent(`${COMMON}

You are adversarial verifier ${i + 1} of 3 for one finding of ${track} on PR #85. Lens: ${lens}. Try hard to REFUTE it: read the code at ${HEAD} (git -C /home/user/PhysicalTherapy fetch -q origin co-001/ux-payer-response; git -C /home/user/PhysicalTherapy show ${HEAD}:<path>). Default to real=false if after honest effort you cannot establish it. If real, give the minimal correct fix and whether it fits this PR (no migration, no #42 file, nothing the founder must decide). Edit no file.
The finding:
${JSON.stringify(f, null, 1)}`, { label: `verify${i + 1}:${f.id}`, phase: 'Verify', schema: VERDICT })))
  .then((vs) => { const v = vs.filter(Boolean); const yes = v.filter((x) => x.real); return { ...f, track, real: yes.length >= 2, votes: v } })

const SEC_PROMPT = `RESUMED after a first attempt whose agents could not return structured output: if your progress file exists, continue from it. When done you MUST return your result by calling the StructuredOutput tool. You are adversarial reviewer 2 of 2 on PR #85: SECURITY, with the MONEY lens. Work in a fresh clone: git clone -q https://github.com/PureTideWater/PhysicalTherapy /home/user/rev85-sec (reuse it if it exists), fetch co-001/ux-payer-response and claude/build-platform, check out ${HEAD} exactly. Review the whole PR diff ${BASE}..${HEAD}. Security: apply .claude/agents/security-reviewer.md to every changed route, query, component and upload path: tenancy (practice scope and RLS), authorization in the handler and in Postgres, CSRF and request keys, the letter check and its document_use: advisory lock (TOCTOU, lock key text, races with tagging, amend and supersede), what a crafted post can name, PHI in keys, filenames, logs, errors and audit, the upload inside the form (a wrong practice, a replayed key, a scan still running, a held or duplicate document), the audited reads, and the interaction with #78's leave guard and returnTo. Money: apply .claude/agents/payment-engine-reviewer.md's concerns: no stage, approval or ledger record a person did not choose; the write-off refusal (can a contradicted reason still pass by any path: bulk, a race with triage, a null window, a reopen); the words under Response true to case_rules and reconcile; no engine or ledger change. You may run focused tests (under the lock) to prove a finding. For each finding say whether it predates this PR.`

const secTrack = async () => {
  const review = await agent(`${COMMON}\n\n${SEC_PROMPT}\n${SAVE('rev85-sec.md', 'each file reviewed and each finding')}`, { label: 'review:security+money', phase: 'Security review', schema: FINDINGS })
  if (!review) return { review: null, second: null, verified: [] }
  const second = await agent(`${COMMON}\n\n${SEC_PROMPT}\nA first reviewer already reported the findings below. Your job is to find what it MISSED: different files, different attack paths, money paths it did not trace. Report only NEW findings (not duplicates of these).\nFirst reviewer's findings: ${JSON.stringify(review.findings.map((f) => ({ id: f.id, title: f.title, file: f.file })))}\n${SAVE('rev85-sec-2.md', 'each path traced and each new finding')}`, { label: 'review:security+money-2', phase: 'Second pass', schema: FINDINGS })
  const all = [...review.findings, ...((second && second.findings) || []).map((f) => ({ ...f, id: 'S2-' + f.id }))]
  const verified = await parallel(all.map((f) => () => verify(f, 'the security and money review')))
  return { review, second, verified: verified.filter(Boolean) }
}

const SHOTS_GAPS = `The before run (workflow wf_174c3c87-c25, progress ${WIP}/pay-shots-before.md) took 39 shots at ${BASE} into /home/user/screens85-before (tiles in its tiles/), with the tour steps committed on claude/build-ops (545fe984). Its sample critic found these gaps; close each by adding acts/cap steps to /home/user/ops/tools/lane-b-screen-tour/capture/tour.spec.ts (and route-map.json), written to run on both the base and the head, or by recording notReached with a reason where a state truly cannot be reached in the tour:
1. the refused empty choice named on its field: add an act that sets form.noValidate (or removes required) and presses, so the route's refusal ("Reason: choose the reason", "Response: choose the payer’s answer", "Channel: choose the channel", "Payer’s letter: choose the payer’s letter") and the Not done summary show (head); on the base the same act shows whatever the base does;
2. the "Window passed" refusals and the withheld hint: record notReached with reason (the option is withheld) if not reachable, and shoot the hint if a line with an unknown window exists;
3. the letter's states beyond idle and scanning (stored and chosen, duplicate-chosen, duplicate-chosen-other-case, duplicate-unusable, held): shoot those reachable without a worker; notReached with a reason for the rest;
4. the single-mode refusal (setInputFiles with two PDFs or a zip): new id p.submissions.letter-refused;
5. the grouped letter list: an act that sets the select's size attribute so its optgroups and the "(uploaded here)" option render;
6. the letter field's hints for "no letter on file" and "uploads paused / cannot upload": shoot where reachable (e.g. a practice under the suspended firm), else notReached;
7. the Contracts kind label: an act on p.contracts that selects the payer letter kind without uploading;
8. Contracts' "Documents to tag" on the PACKETS practice (the response's letter no longer listed);
9. the upload gate on Reconciliation and Contracts under a suspended organization, or notReached;
10. p.submissions.notice: switch to (or add) ?notice=recorded, "The payer’s response is recorded."
Pull build-ops first; commit the spec and route-map changes ("lane-b ux-payer-response: tour sample gaps closed for #85" + blank line + "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" + newline + "Claude-Session: https://claude.ai/code/session_01FcouKNxBLBBy2FVM7bfSvj"), pull --no-rebase (keep both sides if another session changed the spec) and push with GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops (never force, never --no-verify), with your progress file.`

const uxTrack = async () => {
  const shots = await agent(`${COMMON}

Your task: complete the before and after screenshots the UX and brand reviewer needs for PR #85, with tools/lane-b-screen-tour (/home/user/ops/tools/lane-b-screen-tour; read its README whole, "From another lane", "Set-up and a run" and the pitfalls). The sample is design section 6.2 plus the gaps below.
${SHOTS_GAPS}
Runs: the before run again but only for the ids new or changed by the gaps (TOUR_DIR=/home/user/screens85-before, TOUR_REF=${BASE}, keeping the shots already there), then the after run of the WHOLE sample (TOUR_DIR=/home/user/screens85-after, TOUR_REF=${HEAD}; check it resolves to ${HEAD}). Each as the README says, under the lock; stop the server and check fuser 3297/tcp is empty; drop tp_e2e_screens and remove /tmp/tp-e2e-tp_e2e_screens-* after each. Then /usr/bin/python3 -I tile.py on each TOUR_DIR, Read several tiles of each run to confirm each shows its id's state (retake failures), and build the gallery files with tools/lane-b-screen-gallery (convert.py and build.py; read its README) for each run and width into /home/user/gallery85/ (title "PR #85 payer response", width labels "before, 1280", "after, 1280", "before, 390", "after, 390", "before, 1280 dark", "after, 1280 dark", a lede naming the commits). Do NOT publish. Never put a PNG or tile on a branch. ${SAVE('shots85.md', 'the sample ids, each run step and result, retakes, folders')}
Return: the sample (route, state, id per width and theme), the before and after tile folders, each shot that failed, was skipped or is notReached and why, the gallery folder and its files, the tour.spec.ts and route-map.json changes and the build-ops commit.`, { label: 'shots', phase: 'Shots' })
  const UX_PROMPT = `RESUMED after a first attempt whose agents could not return structured output: if your progress file exists, continue from it. When done you MUST return your result by calling the StructuredOutput tool. You are adversarial reviewer 1 of 2 on PR #85: the UX and BRAND review. Read .claude/agents/ux-brand-reviewer.md (in your clone) and follow it whole: the brand (.claude/rules/brand.md, docs/brand/BRAND.md, CO-11), WCAG 2.1 AA with 2.2's additions, and the UX baseline review (/home/user/ops/designs/lane-b-ux-review.md; UX-035 and UX-007 especially; the review's other findings on these screens). Work from the before and after shots (Read each tile image under /home/user/screens85-before/tiles and /home/user/screens85-after/tiles, and their shots.json) AND the code (a fresh clone: git clone -q https://github.com/PureTideWater/PhysicalTherapy /home/user/rev85-ux, reuse if it exists, check out ${HEAD}). Check every string a person sees against design 6.1 and the brand voice; the unchosen selects (the empty option's words, the refusal named on its field after a press), the withheld-reason hint, the words under Response (true and readable), the letter's upload inside the form (its states and status line, heading levels, the grouped list, the "(uploaded here)" mark, focus and live regions, nothing lost while it scans, #78's leave guard), the contract panel's words and kind label, 390 px layouts (nothing clipped or overflowing, 16 px controls), the dark shots, and whether UX-035 and UX-007 are visibly fixed. Name each finding by its shot id (in backticks). A screen the sample does not cover is "not seen, by sample".`
  const review = await agent(`${COMMON}\n\n${UX_PROMPT}\nThe shots agent's result:\n${shots || '(missing: read ' + WIP + '/shots85.md)'}\n${SAVE('rev85-ux.md', 'each shot pair reviewed and each finding')}`, { label: 'review:ux+brand', phase: 'UX review', schema: FINDINGS })
  if (!review) return { shots, review: null, second: null, verified: [] }
  const second = await agent(`${COMMON}\n\n${UX_PROMPT}\nA first reviewer already reported the findings below. Find what it MISSED: other shots, other states, keyboard and screen-reader paths in the code (focus order, aria, live regions, error association), words at 390 px, dark contrast. Report only NEW findings.\nFirst reviewer's findings: ${JSON.stringify(review.findings.map((f) => ({ id: f.id, title: f.title, file: f.file })))}\nThe shots agent's result:\n${(shots || '').slice(0, 6000)}\n${SAVE('rev85-ux-2.md', 'each shot or path checked and each new finding')}`, { label: 'review:ux+brand-2', phase: 'Second pass', schema: FINDINGS })
  const all = [...review.findings, ...((second && second.findings) || []).map((f) => ({ ...f, id: 'U2-' + f.id }))]
  const verified = await parallel(all.map((f) => () => verify(f, 'the UX and brand review')))
  return { shots, review, second, verified: verified.filter(Boolean) }
}

const [sec, ux] = await parallel([secTrack, uxTrack])
if (!sec || !sec.review || !ux || !ux.review) log('A REVIEW RETURNED NOTHING: stop and investigate before the fix round')
const all = [...((sec && sec.verified) || []), ...((ux && ux.verified) || [])]
log(`${all.length} findings verified; ${all.filter((f) => f.real).length} real`)
return { sec, ux }