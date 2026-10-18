export const meta = {
  name: 'co-001-pr-05-download-rule',
  description: 'PR 5 owner rulings of 2026-10-18: the reimbursement reviewer may attest an export only after downloading both its PDF and CSV and each matching its stored fingerprint, enforced in the handler and in Postgres; record the rulings in ADR 0061; regenerate the domain model (unapproved); review and verify',
  phases: [
    { title: 'Build', detail: 'base merge, the download rule, ADR rulings' },
    { title: 'Review', detail: 'forge it; guardrails' },
    { title: 'Fix', detail: 'verify every finding, fix the real ones' },
    { title: 'Verify', detail: 'fresh clone, CI-equivalent, new approval hash' },
  ],
}

const WT = '/home/user/pr5'
const BR = 'co-001/pr-05-packet-deadline'
const COMMON = `
You are finishing PaidWhole Change Order 001 pull request 5 (CO-05: deadline verification and the verifier at export on the milestone 8 packet; D15, D16, D17) in the git worktree ${WT} on branch ${BR} (head eda61d7, fully built, reviewed and verified; not yet opened as a pull request). Run every command in ${WT}. Never edit, stage or commit in /home/user/PhysicalTherapy, /home/user/pr6 or /home/user/pw-brand.
The founder, Tyler Williams, ruled on 2026-10-18:
1. APPROVED the PR 5 schema as summarised (migration 20261103090000_deadline_verification_and_export_attestation), AND asked for one addition before the pull request opens: the reimbursement reviewer may attest an export only after downloading BOTH its PDF and its CSV, each download having passed its fingerprint check (the bytes read from storage hash to the version's stored export_sha256 / export_csv_sha256). This closes ADR 0061's residual risk F9 (a job-scope write of a forged passing report and forged hashes would pass the SQL guard, and the attestation compares only stored hashes). It must hold in the attest route handler AND in Postgres (CLAUDE.md: never rely on one layer), and the evidence of a download must be something a compromised worker (the job-scope role) cannot forge for the reviewer: bind it to the reviewer's own actor in the web request that served the file, after the hash check, written in a way the job role cannot write (check the roles and grants: tp_app versus the job role, SET LOCAL app.actor_id, audit_event's append-only rules). Prefer extending this PR's own unmerged migration 20261103090000 (it is applied only to scratch databases) over a second migration; no new table unless unavoidable. The download must be the reviewer's, of this exact version, after its export, and both kinds; a re-export (if one is possible) needs fresh downloads. The review screen tells the reviewer to download both files first and the attest button says why it is disabled until then.
2. D16 (a) for a practice with no other packet approver (the analyst-only and lone-billing-manager cases) is NOT built here: it is left to the D27 pull request (PR 10 or wherever D27's work lands), since the reviewer's attestation already blocks every payer submission. Record this ruling.
3. Appeal-level evidence for contract disputes at level 2 and above (contract_version.appeal_levels with page, quote, hash and a specialist's check, like the dispute window) lands in PR 8 (the workbench schema), not here. Until then contract disputes stop at level 1. Record this ruling.
Record all three rulings, dated 2026-10-18 and attributed to the founder, in ADR 0061 (an "Owner rulings" section; update its Consequences and the F9 residual-risk text), and in docs/product/reconciliation-001.md's Approval section if that is where earlier rulings are recorded (read it first and follow its form).
Hard rules: nothing under packages/pricing/src (non-test); fixtures/golden and releases 900001 to 900004 unchanged; no ledger-semantics change; the catalog and cross-tenant tests keep their rules and pass; no PHI in URLs, S3 keys, filenames, job payloads, errors or logs; every mutation keeps its Zod schema, role check, practice-scoped transaction and audit event; the drafter never approves and no one who drafted, edited or approved a version attests it (unchanged). The domain model: regenerate docs/product/domain-model.md with pnpm db:domain-model and leave it UNAPPROVED. NEVER write, edit or copy an "Approved by:" line and never touch packages/db/domain-model/approvers.json; the founder's approval of the earlier hash does not cover the new text, so the founder confirms the new hash. Exactly one test:db case (the approval case) fails until then.
Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; Postgres 18 at postgres://postgres:test@localhost:5433/postgres (superuser); Postgres 16 at 5432 is used by others, do not stop either. Databases tp_pr5d_<role>_<n> (drop when done); e2e E2E_DATABASE=tp_pr5d_e2e_<role>, E2E_PORT 4101 (build), 4121 (fix), 4131 (verify). PR 6's worktree may run its own tests on other ports; never touch them. pnpm lint needs about 6 GiB of heap (the script sets 8 GiB). Local gitleaks 8.24.3 is at /tmp/claude-0/gitleaks/gitleaks. Disk is limited: logs in scratchpad/pr5d-<role>/, delete scratch clones you made, never delete anything you did not create.
Commit in the repository's style (git log), each message ending with:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR
Push after each commit: git -C ${WT} push -q -u origin ${BR} (retry 4 times, 2/4/8/16 s). Stage only paths you changed; never git add -A, stash, reset --hard, clean, rebase or force-push.
`
const CHECKS = { type: 'object', properties: { summary: { type: 'string' }, head: { type: 'string' }, sha256: { type: 'string' }, checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed', 'note'] } }, open_items: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'head', 'checks', 'open_items'] }
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, file: { type: 'string' }, issue: { type: 'string' }, reference: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'file', 'issue', 'reference', 'fix'] } }, checked: { type: 'array', items: { type: 'string' } } }, required: ['findings', 'checked'] }

phase('Build')
const build = await agent(`${COMMON}
Your role: build (port 4101).
1. git -C ${WT} fetch -q origin claude/build-platform and merge it into ${BR} with a merge commit (no rebase); PR 4 is merged there with an identical tree, so expect no conflict. Push.
2. Design the download evidence first (read the export download route, exportFile's hash check, the packet_export_downloaded audit event if it exists, the attest route, packet_version_rules or the attestation trigger, the roles and their grants). Write the design into ADR 0061 before coding.
3. Build it in the handler and in Postgres, with tests that fail before and pass after: attest refused with no download, with only the PDF, with only the CSV, with a download by another user, with a download of another version, with a download whose hash check failed, and with evidence written by the job-scope role; allowed after both downloads by the attesting reviewer. Update the review screen and its e2e journey (download both, then attest).
4. Record the three rulings in ADR 0061 and the reconciliation's Approval section as COMMON says.
5. Regenerate the domain model (unapproved) with every divergence explained; --strict passes.
Run typecheck, lint, lint:logs, lint:copy, test, test:golden, synth --all (clean), check:fixtures, test:db on Postgres 18 (report the one expected approval failure), and the packet e2e specs. Commit and push. Return what you built, the new document SHA-256 the generator prints, checks and open items.`, { label: 'download rule, rulings, domain model', phase: 'Build', schema: CHECKS })
if (!build) throw new Error('build failed')

phase('Review')
const REVIEW = `${COMMON}
You are a reviewer. Do not edit, commit or push in ${WT}; experiment only in a scratch clone (git clone ${WT} /tmp/claude-0/pr5d-review-<role>, deleted when you finish) with your own databases. The builder reported: ${build.summary}
Report only real problems, with evidence (command and output, or file and line), the rule broken, severity (blocker: the download rule can be bypassed or forged, or a hard rule breaks; major; minor), and the fix.`
const reviews = await parallel([
  () => agent(`${REVIEW}
Your role: forge it. Try every way to attest without the reviewer having downloaded both verified files: as the job-scope role (insert or update whatever the evidence is; set app.actor_id to the reviewer), as tp_app outside the download route, by replaying a download of a previous version or before the export, by a download whose hash failed, by a download by a different user or practice, by racing the attest against a re-export, through the attest route directly with crafted input, and by any SECURITY DEFINER function that could write the evidence. Confirm the catalog and cross-tenant tests pass and nothing PHI-shaped is logged or stored with the evidence.`, { label: 'review: forge a download', phase: 'Review', schema: FINDINGS }),
  () => agent(`${REVIEW}
Your role: guardrails. Check the diff since eda61d7 (git diff eda61d7..${BR}, excluding the base merge) against the hard rules; the migration is still this PR's own unmerged 20261103090000 or a correctly ordered new one per the new-migration skill; pnpm db:domain-model --check docs/product/domain-model.md --strict passes on a freshly migrated database and no approval line was written; ADR 0061 and the reconciliation record the three rulings accurately, dated and attributed; the screen copy passes lint:copy and brand.md; the e2e journey downloads both files before attesting.`, { label: 'review: guardrails and rulings', phase: 'Review', schema: FINDINGS }),
])
const findings = reviews.filter(Boolean).flatMap((r, i) => r.findings.map((f) => ({ ...f, reviewer: ['forge', 'guardrails'][i] })))
log(`${findings.length} findings`)

phase('Fix')
const fix = findings.length ? await agent(`${COMMON}
Your role: fix (port 4121). Reviewers reported:
${JSON.stringify(findings, null, 1)}
Verify each first; fix the real ones minimally with tests; reject others with evidence. Regenerate the domain model (unapproved) if the schema changes. Run typecheck, lint, lint:logs, test, and test:db on Postgres 18, and the packet e2e specs. Commit and push. Summary: one line per finding.`, { label: 'fix review findings', phase: 'Fix', schema: CHECKS }) : null

phase('Verify')
const verify = await agent(`${COMMON}
Your role: verify (port 4131). Do not edit the worktree. git clone --branch ${BR} ${WT} /tmp/claude-0/pr5d-verify (remove it first only if you created it), set origin to https://github.com/PureTideWater/PhysicalTherapy and fetch claude/build-platform. With CI=true record each: install --frozen-lockfile; check:fixtures; typecheck; lint; lint:logs; lint:copy; gitleaks over the first-parent range from origin/claude/build-platform; verify-content; tools/check-releases-immutable.sh origin/claude/build-platform; synth --all then a clean tree; test; test:golden; test:oracle; a fresh Postgres 18 database, db:migrate, db:domain-model --check --strict (must pass) and with --require-approval (must fail only for the missing approval, printing the SHA-256 to sign); test:db (only the approval case fails); test:e2e; build; cdk:diff. Prove in a scratch copy that attestation is refused until both files are downloaded by the reviewer and allowed after. Then append to /tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/pr5-approval-summary.md a short section "Since your approval of 6435fadd…" stating, in plain language, exactly what changed in the schema text (the download rule and nothing else, or list anything else), and the new SHA-256. Delete your clone. Commit nothing. Return every check, the new SHA-256 in the sha256 field, and the head verified.`, { label: 'fresh-clone verification and new hash', phase: 'Verify', schema: CHECKS })

return { build, findings, fix, verify }
