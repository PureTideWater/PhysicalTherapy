export const meta = {
  name: 'lane-b-ux-sign-in-time-design-2',
  description: 'UX PR 6 design, run 2: author corrections + sections 5-8, adversarial review (security and UX lenses), skeptic check of findings, revision, completeness critic',
  phases: [{ title: 'Author' }, { title: 'Review' }, { title: 'Verify' }, { title: 'Revise' }, { title: 'Critic' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/4a9d4438-0635-51b1-98ea-4663abfca5c5/scratchpad'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const WT = '/home/user/ux-sign-in-time'
const DESIGN = '/home/user/ops/designs/lane-b-ux-sign-in-time.md'
const DDIR = '/home/user/ops/designs/lane-b-ux-sign-in-time'
const COMMON = `Context: PaidWhole monorepo (CLAUDE.md applies). You work for a Lane B item session (session_01FcouKNxVRK8x6iV52PfxXz, 2026-11-01, under Lane B's orchestrator session_01FcouKNNHsdecRMzfTs7XwW) building ONE pull request, co-001/ux-sign-in-time, the UX baseline review's PR 6: "Each sign-in step says how long it stays open, warns before it closes, and starts again with the email kept". Code checkout: ${WT} (branch co-001/ux-sign-in-time, fast-forwarded to claude/build-platform 83d71fd6, which includes #74 UX PR 1 (ActionForm, shared fields, PasswordField, ADR 0077), #78 and #81). Read code there; edit no product code in this stage; never commit or push (the orchestrating session commits /home/user/ops files). Scratch files under ${SP}.
The requirements: /home/user/ops/designs/lane-b-ux-review.md section 3 (the queue entry for order 6) and its findings UX-012 and UX-128, /home/user/ops/designs/lane-b-ux-review/synthesis/prs.json order 6 (C-007 now part: the limit that binds today (3 minutes), the warning, Start again and the email kept, from one constant, no Cognito change; C-042: the step marker on the invited path). The item prompt (git -C /home/user/ops show HEAD:lanes/lane-b-item-prompts-2026-11-01/ux-sign-in-time.md) states the agreed shape: limit 3 minutes, key registration 15 minutes, both from one constant apps/web/src/lib/auth/step-limits.ts; the server closes the step at that limit; one polite warning one minute before (two minutes on a step of ten minutes or more); "Start again" returns to /sign-in with the email kept in a sealed HttpOnly cookie; invited paths numbered "Step 1 of 2" (invited customer) and "Step 1 of 3" (invited staff member); no migration, no infra or Cognito change; the 15-minute Cognito session belongs to UX PR 66. UX PR 7 (co-001/ux-sign-in-recovery) is a later session's; keep section 3.5's hooks for it.
Machine rules: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands (install, build, typecheck, tests, next dev/build/start, playwright) under "flock /tmp/laneb-heavy.lock <cmd>", one at a time. Never a foreground sleep (use run_in_background and wait). PostgreSQL 18 on 5433. Synthetic data only; no PHI; no model name or identifier in any file.
Hard constraints: no migration (anything needing a migration or Cognito/infra configuration is recorded "for Lane A" and left out). #42 (PR 6b-4) is OPEN at be63bdc2: read its state with gh api repos/PureTideWater/PhysicalTherapy/pulls/42 and its file list with gh api --paginate repos/PureTideWater/PhysicalTherapy/pulls/42/files --jq '.[].filename' (gh pr view is refused, GraphQL 403). Do not edit any #42 file except the three shared documents LANES.md rule 6 lets both lanes change (docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts, registry.ts); apps/web/e2e/helpers.ts, e2e/hardware-key.spec.ts and infra/lib/constructs/identity.ts are read only. Reserved numbers: ADR 0081 (shared with PR 7), test-matrix SGN-01 to SGN-04, synth module 19 (SGN). The founder's standing rule: only the best option, never weighted by build effort. Wording within .claude/rules/brand.md, docs/brand/BRAND.md and CO-11; take the recommended option and report it. Security trade-offs: the safer option, with reasons. Legal text is the founder's. Improve as you go: if you find a better way inside this design's scope, adopt it and say so; outside it, list it as a proposal.`

const CORRECTIONS = `Facts that live state contradicts in the partial draft (fix every one in your re-read, before section 5, re-verifying every file:line the draft cites at 83d71fd6 in ${WT}):
1. #42 has moved: the header gives #42's head as 6f23c42b; it is now be63bdc2. "Read at 165c599" must become "read at 83d71fd6" after re-verification. The base delta moves files the design cites in apps/web/src/lib/http/: next.ts is +3/-22; signInFor moved to the new lib/http/sign-in-for.ts:9-17 (next.ts:55-58 is stale); in next.ts COOKIE_OPTIONS moved from :23 to :25, the Cache-Control comment from :18-20 to :20-22, loadPublicPage from :139 to :120, runSignInStep from :249 to :230; handler.ts is +99/-8, setCookieHeader moved from :44-46 to :47-49; guardMessage now uses the new minutesWords (lib/http/download-refusal-words.ts:69): consider reusing it for section 6's "N minutes" words. Next to the design's paths, the delta changes components/field.tsx (+35/-21, FieldWords hints) and fields.test.tsx (+14) and adds components/refusal-notice.tsx (84 lines, an Alert): re-read section 2.8 against them. The base delta also touches apps/web/scripts/synthetic-personas.ts (+6/-1: two personas from #78) and synth types.ts and common.ts. On be63bdc2 (after #42 merges) e2e/helpers.ts refusal() moves from :63-65 to :66-68; in identity.ts the "three days" comment moves from :41-42 to :45-46 and tempPasswordValidity from :82 to :89. Still true on be63bdc2: infra/lib/constructs/identity.ts:11 accessToken Duration.minutes(15) and :14 authSession Duration.minutes(3), so SGN-01's text pin holds.
2. Section 3.6's open-PR table is stale: #78 and #81 are merged, #33 is closed. Open now: #42, #75, #82, #83, #84, #85, #86, #87, #88, #89 (re-read each head with gh api pulls/<n> and its files API). #85 (29dded52) changes components/test-support/forms-harness.tsx (+121/-2), which slice B also edits: say how the slice keeps the conflict small and that this PR, merged second, resolves it keeping both. "Build from 165c599" now means 83d71fd6.
3. #78 has merged: the SGN section goes after "Download refusals (DLR)" (test-matrix.md:353; the draft calls it "Downloads (DLR)"); SGN's entries go after DLR's in matrix.ts and registry.ts, and 'SGN' goes after 'DLR' in CASE_MODULES (packages/synth/src/cases/types.ts:9).
4. Slice D omits packages/synth/src/cases/common.ts: MODULE_NUMBER (line 18) must gain SGN: 19 or typecheck fails. Add it to slice D.
5. The scratchpad is lost, with everything the draft cites from it (scratchpad/sgn-pr42-rest-clean.txt, sgn-pr42-union.txt, sgn-files.txt, sgn-pr{n}-files.txt, scratchpad/sgn-repro/ with its observations and PNGs). Regenerate the file lists from the REST files API into ${SP}/ and cite them by how to regenerate them, not by a scratchpad path. Cite section 1's reproduction as scout-flow.md 1.2. PNGs never go on a branch.`

phase('Author')
const author = await agent(`${COMMON}

You are the design author, resuming a partial draft. ${DESIGN} has the header, section 1, 2.1-2.11, 3 (slices A-D, 3.5, 3.6) and 4 (4.1-4.6 with the SGN rows and registry entries word for word). The scouts' reports are in ${DDIR}/scout-{flow,timer,security}.md. Your earlier progress file holds every decision so far: read it first.
${CORRECTIONS}
Then write sections 5 to 8 in the style of /home/user/ops/designs/lane-b-ux-forms.md (match its voice and structure; cite file:line for every claim about the code):
5 Docs: ADR 0081 in outline (decision, alternatives, consequences, not covered), file docs/adr/0081-state-and-enforce-each-sign-in-steps-limit-warn-before-it-closes-and-start-again-with-the-email-kept.md, shared with UX PR 7 which amends it; ADR 0016's status line and its note (read docs/adr/0016-*); the two ADR 0077 notes (after :47 and :246; #75's wip-5 edits 0077 lines 142-150, separate hunks).
6 Every string a person sees, exact (the limit sentence per step, the warning, the closed state, Start again, the step markers, the notice on /sign-in after a restart or an expired step, screen-reader names), within brand.md; and the before and after screenshots the UX review needs, at 1280 and 390 px light and 1280 px dark: by the screen tour's ids where they exist (read /home/user/ops/tools/lane-b-screen-tour/README.md, capture/tour.spec.ts and /home/user/ops/designs/lane-b-ux-review/route-map.json) and the cap() additions where they do not, including a 'clock' option on cap() (Playwright page.clock installed before navigation) to show the warning and the closed state. Specify those tour additions exactly (they will be committed on claude/build-ops later, not by you).
7 No migration, and the proposals outside the PR: the stale "three days" comment in identity.ts (INVITATION_DAYS is 7; #42's file) noted for Lane A; UX PR 66 (the 15-minute Cognito session, identity.ts and infra/test/identity.test.ts, a security trade-off for the founder); WCAG 2.2.1 residue for audit #103; anything else found.
8 Risks, each with its mitigation.
Update the Contents list. ${SAVE('sgn-author.md', 'each correction applied and each section written')}
Return: a summary of the corrections and of sections 5-8, and anything left open.`, { label: 'author', phase: 'Author' })

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] },
          lens: { type: 'string' }, title: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' },
        },
        required: ['id', 'severity', 'lens', 'title', 'evidence', 'fix'],
      },
    },
  },
  required: ['findings'],
}

phase('Review')
const review = await agent(`${COMMON}

You are the ONE adversarial reviewer of the design ${DESIGN} (read it whole, and the scouts' reports in ${DDIR}/). Review it against the code in ${WT} at 83d71fd6, the requirements above, .claude/agents/security-reviewer.md (security lens: the kept-email cookie's flags, sealing and lifetime; account enumeration; logs and error messages; rate limits and lockout; the lengths; a test-only knob reachable in production; the server deadline from the server's clock) and .claude/agents/ux-brand-reviewer.md (UX lens: the words, WCAG 2.2.1, 2.2.6 and 4.1.3, the single warning, focus, 390 px, dark, the brand). Find what is wrong, missing, stale or weaker than the best option. Check every file:line the design cites (sample at least 40, all in sections 2.2, 2.6, 3 and 4.5). Check the SGN rows against packages/synth/src/fixtures.test.ts and the registry's shape, and that every file named in a slice exists or is marked new. ${SAVE('sgn-review.md', 'each finding')}
Write the review to ${DDIR}/review.md (ids R-01.., severity blocking|should-fix|nit, lens, evidence file:line, fix) and return the findings.`, { label: 'review', phase: 'Review', schema: FINDINGS })
if (!review || !review.findings || review.findings.length === 0) throw new Error('the review returned nothing: refusing to continue')

const VERDICT = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, real: { type: 'boolean' }, reason: { type: 'string' } },
        required: ['id', 'real', 'reason'],
      },
    },
  },
  required: ['verdicts'],
}
phase('Verify')
const list = review.findings.map((f) => `${f.id} [${f.severity}, ${f.lens}] ${f.title}\n  evidence: ${f.evidence}\n  fix: ${f.fix}`).join('\n')
const skeptics = await parallel(['code facts (does the cited code say what the finding claims, at 83d71fd6?)', 'security and UX substance (is the finding right on its merits, and is its fix the best option, or would it make things worse?)'].map((lens, i) => () =>
  agent(`${COMMON}

You are a skeptic checking review findings on the design ${DESIGN}, through one lens: ${lens}. Try to REFUTE each finding: read the design and the code. Mark real=false when the finding is wrong, already handled by the design, or its fix is worse; real=true only when it survives. ${SAVE('sgn-skeptic-' + i + '.md', 'each verdict')}
The findings:
${list}`, { label: 'skeptic-' + i, phase: 'Verify', schema: VERDICT })))
const refuted = {}
for (const s of skeptics.filter(Boolean)) for (const v of s.verdicts) if (!v.real) (refuted[v.id] = refuted[v.id] || []).push(v.reason)
const verdictText = review.findings.map((f) => `${f.id}: ${refuted[f.id] ? 'CONTESTED by ' + refuted[f.id].length + ' skeptic(s): ' + refuted[f.id].join(' | ') : 'upheld by both skeptics'}`).join('\n')
log(`review: ${review.findings.length} findings; contested: ${Object.keys(refuted).length}`)

phase('Revise')
const revised = await agent(`${COMMON}

You are the design author again. Revise ${DESIGN} for the review (${DDIR}/review.md). For each finding: apply it, or, where the skeptics contested it, decide on the evidence (read the code) and answer it. Add a final section "Review and dispositions" with one row per finding (id, severity, disposition: applied / answered (why) / partly, where in the design), and note the skeptics' verdicts. Keep the scouts' facts unless the code says otherwise.
The findings:
${list}
The skeptics' verdicts:
${verdictText}
${SAVE('sgn-revise.md', 'each finding and its disposition')}
Return: the dispositions in one line each, the open questions that are the founder's (legal, Cognito or infra: for Lane A), and the reserved numbers the design uses.`, { label: 'revise', phase: 'Revise' })

phase('Critic')
const critic = await agent(`${COMMON}

You are the completeness critic of the revised design ${DESIGN}. Ask what is missing: a requirement of the queue entry, UX-012, UX-128 or prs.json order 6 not covered; a file a builder will need that no slice names (e.g. common.ts, types.ts, the forms harness, personas, seed); a string without exact words; a test row without a test; a shot without a capture state; a stale file:line or head SHA; any slice overlap (no file in two slices); any section of 1-8 still missing. Fix small gaps directly in the design (and say so in the "Review and dispositions" section as C-nn rows); list anything you could not fix. ${SAVE('sgn-critic.md', 'each gap and what you did')}
Return: the gaps found, what you fixed, and what remains.`, { label: 'critic', phase: 'Critic' })
return { author, review, verdictText, revised, critic }
