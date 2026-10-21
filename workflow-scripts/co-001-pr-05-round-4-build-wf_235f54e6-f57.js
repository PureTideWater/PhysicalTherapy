export const meta = {
  name: 'co-001-pr-05-round-4-build',
  description: 'PR 5 round 4 build: merge the build branch (82035ae), schema for contact_missing and the unattested submission, then the payer copy (#37 part 1) and the unattested submission path, to the reviewed design and the founder rulings',
  phases: [
    { title: 'Schema' },
    { title: 'Build' },
  ],
}
const WT = '/home/user/pr5'
const BR = 'co-001/pr-05-packet-deadline'
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad'
const DESIGN = `${SP}/design/pr5-37-payer-packet.md`
const DECISIONS = `${SP}/design/decisions-2026-10-20.md`
const ENV = `Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. gitleaks 8.24.3 is /root/.cache/paidwhole/gitleaks/8.24.3/gitleaks. Postgres 18 is postgres://postgres:test@localhost:5433/postgres and Postgres 16 is on 5432 (never stop either). Scratch databases are tp_pr5r4_<role>_<n>, dropped after use; e2e: schema 4701 tp_pr5r4_e2e_schema, payer 4711 tp_pr5r4_e2e_payer, unattested 4721 tp_pr5r4_e2e_unatt. Logs go in ${SP}/pr5-r4/<role>/.`
const ATTR = `Every commit message ends with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR`
const CONTEXT = `Context. Repository puretidewater/physicaltherapy (PaidWhole). Worktree ${WT}, branch ${BR}, head 6d93b40, verified in a fresh clone (every check passed; audit items #4, #5, #26 and #61 proven). Its one migration, 20261103090000_deadline_verification_and_export_attestation.sql, is unmerged and awaits the founder's approval; this round's schema goes into it. claude/build-platform is now 82035ae: it carries #24 (CI pinned to ubuntu-24.04) and #25 (governance: CODEOWNERS, approvers.json format 2, approval-of-record, the edit hooks in .claude/settings.json, a committed pre-push hook in .githooks, the pull request template, CLAUDE.md's new lines). The edit hooks are live in this session: protect-content refuses edits to a migration unless ${WT}/.claude/.allow-protected-edit exists (create it with a shell command for the edit, remove it in a trap, never commit it).

This round builds, to the founder's rulings of 2026-10-20 (record each in ADR 0061, dated, the way earlier rulings are recorded):
- Audit #37 part 1, the packet copy the payer receives, exactly to the reviewed and revised design in ${DESIGN}, with the founder's answers to its questions: decisions 1 to 6 in ${DECISIONS}, each the recommended answer (contact: a name or office plus a phone, the rest optional, the contact's email the only email printed; drop the patient control number from the payer PDF and CSV and refuse a narrative naming it; print only the dates code knows, no timeliness claim; interest only where code computed it, 'Interest stated in this request: $X'; the seven-item checklist; contact_missing as a coded refusal in this migration).
- The founder's ruling on a stale export: when a version's pricing goes stale after its export and before its attestation, the attestation stays refused, and a submission of that export can still be logged, recorded truthfully as unattested with its reason ('sent without sign-off: pricing went stale after export'), so reconciliation tracks the payer's answer. The packet is never attested. The submission's pricing_check flag still records the cause. Only that reason allows an unattested submission; every other submission still requires the attestation.
- The founder's ruling on 'remittance date': a contract window measured from the remittance date means the remittance advice's own date, not the payment date (BPR16); such windows stay unverified until PR 6c computes that date. Record it in ADR 0061 and make sure the code and copy already say so.
- The verification's nit: version-form.tsx's Submit gives the model_draft button name="intent" alongside a function formAction; drop the name when a formAction is passed.
Rules that bind: CLAUDE.md's rules; no change under packages/pricing/src, fixtures/golden, content/releases (900001 to 900005), the ledger; never write the domain model's approval line or touch approvers.json; no pull request is opened in this step; main is never touched. Process (the founder's ruling of 2026-10-20): builders run the whole-repository 'pnpm typecheck' plus lint and the tests of the packages they changed; the full suite runs in the fix round and GitHub CI. Push with plain 'git push origin ${BR}' and the 2/4/8/16 s retry. Keep the returned summary short: what you built, every check with its result, every open item.`
const RESULT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    head: { type: 'string' },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } },
    open_items: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'head', 'checks'],
}
phase('Schema')
const schema = await agent(`${CONTEXT}

${ENV}

Your task, before any builder starts:
1. Merge origin/claude/build-platform (82035ae) into ${BR} with a merge commit (never rebase, amend or force-push). Resolve any conflict keeping both sides' intent; the domain model document will conflict or go stale: keep this branch's version for now (the fix round regenerates it last).
2. In the migration, as its only editor this round: add contact_missing to packet_export_refusal_codes() (design D7 and Q6), and the unattested submission (the stale-export ruling above): the CHECKs, the rule in submission_belongs() or its trigger that allows a submission without an attestation only for an export whose pricing went stale after the export and whose attestation is refused for that reason, a recorded reason code, and the audit event. Name everything in the migration's style; grants and RLS unchanged unless a new function needs EXECUTE for tp_app. Update the migration header's 'Safe with the previous image running' note.
3. Drizzle and the row factory for any new column; the TypeScript interfaces the two builders code against (readiness reason contact_missing; the submission kinds), committed first so they can code against them.
4. db tests for the new rules (refused, allowed, flagged, the app role cannot set the reason or the flag), the catalog and cross-tenant tests.
Run pnpm install --frozen-lockfile, pnpm typecheck, the db package's tests and the tests you added (DATABASE_URL on 5433). ${ATTR} Commit the merge, then the schema and interfaces, and push. Return the summary, the pushed head, every check, and the exact interfaces the builders must use.`, { label: 'merge base, schema and interfaces', phase: 'Schema', schema: RESULT })
if (!schema) throw new Error('schema step failed')

phase('Build')
const SHARED = `The schema step pushed ${schema.head}: ${schema.summary}
You and one other builder share ${WT}. Do NOT edit the migration; if you need a SQL change, write it exactly in your summary. Stage only your own paths and commit with 'git commit -m ... -- <paths>'; retry if the index is locked; push after each commit with the 2/4/8/16 s retry (if rejected because the other builder pushed first, 'git pull --no-rebase origin ${BR}' and push again; never force). Failures in the other builder's files are reported, not fixed. Commit messages follow the repository's style. ${ATTR}`
const builds = await parallel([
  () => agent(`${CONTEXT}

${ENV}

${SHARED}

Your part: audit #37 part 1, the payer's copy, exactly to ${DESIGN} with the founder's answers (decisions 1 to 6). The PDF and CSV renderers, the correspondence contact in the practice's settings (setter rules as the design says; seeded in the test worlds and pnpm db:seed with a SYNTHETIC contact), contact_missing readiness everywhere the design names it, the reference lookup, the patient control number dropped and refused in narratives, the dates and interest wording, the seven-item checklist and its Zod schema built from PACKET_CHECKLIST, the draft narrative and reference set wording, the MOD-03 fixtures regenerated and the local narrative baseline re-recorded with the eval CLI's --record (review the diff), and the tests the design lists (T1 to T9, DB1 to DB4, W5 to W7, E5), including the leak scan that asserts no payer part contains an email other than the contact's, a hash, a UUID or an internal term. Update the e2e journeys you touch. Return the summary, your last pushed head, every check and the open items.`, { label: 'build: payer copy (#37 part 1)', phase: 'Build', schema: RESULT }),
  () => agent(`${CONTEXT}

${ENV}

${SHARED}

Your part: the unattested submission and the two small items. The submissions route and screen let a reviewer or billing user log a submission of an export whose pricing went stale after export (the readiness code says so), with the copy stating it is sent without sign-off and why; the review page explains why the attestation is refused and what to do (re-price, a new version, a new export); reconciliation and the report show unattested submissions plainly; the remittance-date ruling recorded in ADR 0061 and checked in the code and copy; the version-form.tsx name="intent" nit. Tests: route db tests (allowed only for the stale reason, refused otherwise, audited), unit tests of the copy, and the e2e journey for the stale case. Return the summary, your last pushed head, every check and the open items.`, { label: 'build: unattested submission and small items', phase: 'Build', schema: RESULT }),
])
return { schema, builds }
