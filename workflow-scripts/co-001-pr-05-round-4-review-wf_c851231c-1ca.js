export const meta = {
  name: 'co-001-pr-05-round-4-review',
  description: 'PR 5 round 4 (draft PR #30): three independent reviews of the payer copy, the unattested submission and the schema; fix round with the full suite and the domain model regenerated; approval summary',
  phases: [{ title: 'Review' }, { title: 'Fix' }],
}
const WT = '/home/user/pr5'
const BR = 'co-001/pr-05-packet-deadline'
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad'
const DESIGN = `${SP}/design/pr5-37-payer-packet.md`
const DECISIONS = `${SP}/design/decisions-2026-10-20.md`
const ENV = `Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks. Postgres 18 is postgres://postgres:test@localhost:5433/postgres and Postgres 16 is on 5432 (never stop either; leave no cluster-wide role behind). Scratch databases tp_pr5r4b_<role>_<n>, dropped after use; e2e port 4751 for the fix round. Logs in ${SP}/pr5-r4b/<role>/. The edit hooks are live: a migration edit needs ${WT}/.claude/.allow-protected-edit for the edit only (shell-created, removed in a trap, never committed).`
const ATTR = `Every commit message ends with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR`
const CONTEXT = `Context. Repository puretidewater/physicaltherapy (PaidWhole). Worktree ${WT}, branch ${BR}, head 73b7f2d, open as draft pull request #30 into claude/build-platform (GitHub CI runs on it). PR 5 (CO-05) verifies a packet's deadline from a signed-off source, checks the export again, has the reviewer sign off, holds pricing current (audit #4), cites a contract window's unit and start (audit #5), shows export attempts (#26), has one form (#61). The previous round passed a fresh-clone verification at 6d93b40. This round (6d93b40..73b7f2d) merged claude/build-platform 82035ae, added to the one unmerged migration 20261103090000 contact_missing and the unattested submission (submission.unattested_reason 'pricing_stale_after_export', packet_version_unattested_reason(), the audit event submission_logged_unattested and its guard), and built audit #37 part 1 (the payer's copy) to ${DESIGN} with the founder's answers 1 to 6 in ${DECISIONS}, plus the founder's rulings of 2026-10-20: a stale-after-export export may be logged as unattested and is never attested; 'remittance date' is the remittance advice's own date, not BPR16. Rules: CLAUDE.md; no change under packages/pricing/src, fixtures/golden, content/releases 900001 to 900005, the ledger; never write the domain model's approval line or touch approvers.json; main is never touched. Push with 'git push origin ${BR}' and the 2/4/8/16 s retry. Keep returned summaries short: every check with its result, every finding with its disposition, every open item.`
const RESULT = { type: 'object', properties: { summary: { type: 'string' }, head: { type: 'string' }, sha256: { type: 'string' }, checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } }, open_items: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'head', 'checks'] }
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] }, failure_path: { type: 'string' }, fix: { type: 'string' } }, required: ['title', 'file', 'severity', 'failure_path', 'fix'] } }, verdict: { type: 'string' } }, required: ['findings', 'verdict'] }
phase('Review')
const brief = `${CONTEXT}

You are an independent adversarial reviewer of this round (git -C ${WT} diff 6d93b40...origin/${BR}, minus what 82035ae brought). Do not edit, stage or commit in ${WT}; clone into ${SP}/pr5-r4b/<your-label> to run anything. Report each finding with file, line, a concrete failure path and a fix; if nothing is wrong, say so with what you checked.`
const reviews = await parallel([
  () => agent(`${brief}

Your angle: the payer's copy and its figures. Does any payer part (PDF, CSV, file name) still carry an email other than the contact's, a hash, a UUID, an internal term, the verification level, the patient account number or a figure code did not compute? Does the export verifier still check exactly what was printed, and do the hashes and the attestation still cover the files the payer gets? Are the dates, the interest wording and the reference what decisions 3 to 5 say? Is every figure still computed by code, rounded once, in cents? Does the leak scan test prove the absence for every route through the renderer?`, { label: 'review: payer copy and figures', phase: 'Review', schema: FINDINGS }),
  () => agent(`${brief}

Your angle: the SQL, forging and races. The unattested submission: can tp_app, the worker login, another practice or a person without submission.log forge one, set unattested_reason or pricing_check, write or duplicate the audit event, log an unattested submission of an export that is still current or was never exported, or attest after one was logged? Race a re-price, a withdrawal and a submission at once. contact_missing: can an export slip through without a contact, or with one cleared between readiness and the job? Do the catalog and cross-tenant tests still hold, and is the migration still 'safe with the previous image running'?`, { label: 'review: SQL, forge and race', phase: 'Review', schema: FINDINGS }),
  () => agent(`${brief}

Your angle: screens, words and guardrails. The settings page for the correspondence contact (who can set it, validation, audit), the packet page holding export with its remedy, the review page parting the payer's copy from the internal record, the seven-item checklist, the unattested submission's box and notices, reconciliation and the report showing unattested submissions, Cases finding a packet by reference. Is every word true and plain (BRAND.md, the copy lint, CO-11), every state shown with its remedy, and is anything a reviewer, billing manager or practice administrator would misread? Do the e2e journeys prove the user path, and do they pass?`, { label: 'review: screens and guardrails', phase: 'Review', schema: FINDINGS }),
])
const all = reviews.filter(Boolean).flatMap(r => r.findings)
log(`${all.length} review findings`)
phase('Fix')
const fix = await agent(`${CONTEXT}

${ENV}

You are the fix round. Three independent reviewers reported the findings below. Each is a claim to verify, not an order: reproduce it or trace a realistic path; fix the real ones in proportion; for each one you do not fix, say why. Anything needing a decision the founder has not made goes in open_items as a question with the recommended answer first.

Findings: ${JSON.stringify(all, null, 2)}
Verdicts: ${reviews.filter(Boolean).map(r => r.verdict).join(' | ')}

Also make sure ADR 0061 records, dated 2026-10-20, the founder's answers 1 to 6, the stale-export ruling and the 'remittance date' ruling, and that the test matrix and reconciliation-001 agree.
Then run the full local suite once: pnpm install --frozen-lockfile; check:fixtures; typecheck; lint; lint:logs; lint:copy; pnpm test (CI=true); test:golden; test:oracle; verify-content; release immutability; on a fresh PG18 database db:migrate and pnpm test:db; test:e2e (port 4751); pnpm build. Regenerate docs/product/domain-model.md LAST (pnpm db:domain-model, unapproved), so exactly one test:db case fails, the founder's approval, and report its SHA-256 in the sha256 field. Rewrite ${SP}/pr5-approval-summary.md for the founder: what the regenerated document changes since their approval of 6435fadd (and that 4ec492ab and 372fa545 were never signed), in plain words, short, with the new SHA-256. Commit in the repository's style, push, and return the summary, the head, the sha256, every check and the open items.`, { label: 'fix, full suite, domain model, approval summary', phase: 'Fix', schema: RESULT })
return { reviews, fix }
