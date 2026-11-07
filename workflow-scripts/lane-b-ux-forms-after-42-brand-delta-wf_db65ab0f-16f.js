export const meta = {
  name: 'lane-b-ux-forms-after-42-brand-delta',
  description: 'PR #132: the UX and brand read of the words added after the review round (JavaScript-is-off title, two bceda579 refusal sentences), skeptics, and a fix if confirmed',
  phases: [{ title: 'Read' }, { title: 'Fix' }],
}
const HEAD = 'bceda5792ca5331ce2eb4eec8bf972c39e95205b'
const WT = '/home/user/ux-forms-after-42'
const PROG = '/home/user/ops/approval-summaries/lane-b-ux-forms-after-42-wip/progress'
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/88c94db6-fc7b-5c57-a2b7-5dda4f5b392f/scratchpad/ufa42'
const COMMON = `Context: PaidWhole build. PR #132 (co-001/ux-forms-after-42) at ${HEAD}, worktree ${WT}. Delta to read: (a) the notice title "JavaScript is off" (apps/web/src/components/screening/upload-form.tsx ~:335, commit 7078eb82; shots ${SP}/tour-fix screening.no-javascript.*), (b) bceda579's two sentences in apps/web/src/lib/screening/routes.ts (every-row too_few_claim_lines, now "...so there is nothing to screen; a screening takes a row of at least \${floor} claim lines, because a row of fewer can describe one patient’s care; choose a file with rows of at least \${floor} claim lines", and too_many_rows "leave rows out, such as a quarter or a payer product, until ..."), against their browser twins in apps/web/src/lib/screening/messages.ts. Rules of ADR 0077's amendment and BRAND.md's new line (form-wide sentences vs field refusals); ADR 0062 quotes some sentences (do not change a quoted one). Rules: export PATH=/opt/node24/bin:/opt/pnpm-bin:$PATH first; heavy commands under flock /tmp/laneb-heavy.lock; no model identifier; never force or --no-verify; never touch the PR or GitHub except pushing the WIP ref; never push co-001/ux-forms-after-42.`
const FIND = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, what: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should', 'nit'] } }, required: ['id', 'what', 'evidence', 'fix', 'severity'] } }, summary: { type: 'string' } }, required: ['findings', 'summary'] }
const VERD = { type: 'object', properties: { refuted: { type: 'boolean' }, reason: { type: 'string' }, refinedFix: { type: 'string' } }, required: ['refuted', 'reason', 'refinedFix'] }
phase('Read')
const r = await agent(`${COMMON}

UX AND BRAND READ: read .claude/agents/ux-brand-reviewer.md and apply its checklist to the delta only (you are a default agent following it), with exact replacement words for any finding. Read only. Write ${PROG}/brand-delta.md.`, { label: 'brand-read', phase: 'Read', schema: FIND })
if (!r) throw new Error('reader returned nothing; resume')
const j = await parallel(r.findings.map(f => () => parallel([0, 1].map(k => () => agent(`${COMMON}

SKEPTIC ${k + 1} of 2: try to REFUTE this wording finding; default refuted=true if unsure. ${JSON.stringify(f)}`, { label: `skeptic:${f.id}:${k}`, phase: 'Read', schema: VERD }))).then(vs => ({ f, vs: vs.filter(Boolean), keep: vs.filter(Boolean).some(v => !v.refuted) }))))
const kept = j.filter(x => x.keep && x.f.severity !== 'nit')
let fix = 'none'
if (kept.length) {
  phase('Fix')
  fix = await agent(`${COMMON}

FIX in ${WT} (HEAD must equal origin/co-001/wip-ux-forms-after-42 = ${HEAD}; clean): apply these confirmed wording findings, tests first (update the pins in routes.db.test.ts / upload-form tests / messages tests to the new words, see them fail, then change the code), one commit, message ending with a blank line then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FcouKQJppM8BdCui7NVQUa
Then under the lock: typecheck, lint, lint:copy, the affected vitest files and routes.db.test.ts, lib/routes/messages.test.ts; grep e2e for the old literals. Update the design's string rows. Push fast-forward: git push origin HEAD:refs/heads/co-001/wip-ux-forms-after-42. Write ${PROG}/brand-delta-fix.md. Findings: ${JSON.stringify(kept.map(x => ({ f: x.f, refined: x.vs.map(v => v.refinedFix) })))}
Return: new head sha, old -> new strings, test results.`, { label: 'brand-fix', phase: 'Fix' })
}
return { read: r.summary, findings: j.map(x => ({ id: x.f.id, sev: x.f.severity, keep: x.keep })), fix }
