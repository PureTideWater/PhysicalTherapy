export const meta = {
  name: 'suitecap1b-reread',
  description: 'SUITE-CAP-1b design re-read (one reviewer) against SS-01\'s branch head, #42\'s head and part 1a\'s state, before its build',
  phases: [{ title: 'Re-read', detail: 'the design\'s part 1b and section 16 against the current code' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/2d6572d6-2076-5676-9f8f-7a15571707e4/scratchpad'
const DESIGN = '/home/user/ops/designs/suite-cap-1-triage-locks.md'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const REREAD = { type: 'object', properties: {
  verdict: { type: 'string', enum: ['build as designed', 'build with deltas', 'stop'] },
  deltas: { type: 'array', items: { type: 'object', properties: { section: { type: 'string' }, design_says: { type: 'string' }, code_now: { type: 'string' }, builder_instruction: { type: 'string' } }, required: ['section', 'code_now', 'builder_instruction'] } },
  part_1a_state: { type: 'string' }, interest_overlap: { type: 'string', description: 'section 4.4 claim_by_superseded vs the interest PR, and any other overlap with designs/ledger-interest-once.md' },
  files_1b: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' },
}, required: ['verdict', 'deltas', 'part_1a_state', 'files_1b'] }
phase('Re-read')
const r = await agent(`Repository PureTideWater/PhysicalTherapy (PaidWhole). You are the design re-reader (pipeline stage 1, one reviewer) for SUITE-CAP-1b, a Lane A schema PR: the design ${DESIGN}, part 1b only (sections 0 to 4, 4.5 included, 5.4 to 5.7, 7's CAS-40 and CAS-42, 8, 9, 10 to 14, and 16 "After the design review"; part 1a, CAS-41, is built in another session on co-001/suite-cap-1-bounded-reads). Read only; write nothing in any repository. Use git worktrees or 'git show <ref>:<path>' from /home/user/PhysicalTherapy (git fetch origin <branch> by name first).
The founder granted the ledger freeze exception of section 4.5 (Q1) on 2026-10-27 20:49 UTC, "as written", so 4.5 is built in the PR.
The branch will be co-001/suite-cap-1-triage-locks, stacked on SS-01's branch origin/co-001/ss-01-suspension-refusal (now holding migration 20261108090000_suspension_refusal.sql on top of #42's 098636e3, which holds 20261107090000_mail_streams.sql). The design was written against claude/build-platform e908c21; claude/build-platform is now 085299bd. The design names its migration 20261109090000_line_status_heads.sql.
Check every file:line claim and every function body the migration recreates (line_status_rules on 20261023120000:550-579; the two ledger triggers on 20261027090000:147-201 and :219-270; claim_by_superseded; anything else in section 4) still holds on SS-01's head: read the bodies with pg_get_functiondef from a PostgreSQL 18 database migrated from empty at that head (PATH=/opt/node24/bin:$PATH; PostgreSQL 18 on 5433, postgres:test, socket /tmp; name databases tp_sc1b_reread_<n>, drop them after; a scratch git worktree under ${SP}/sc1b-reread, removed after). Check whether SS-01's or #42's migrations recreate any of the same functions (then 1b recreates on their body). Check part 1a's state (git ls-remote origin 'refs/heads/co-001/suite-cap-1*'; its status file approval-summaries/lane-b-suite-cap-1a-status.md on origin/claude/build-ops) and which files 1a and 1b both touch. Check section 4.4 against the interest design /home/user/ops/designs/ledger-interest-once.md (which builds after 1b). Check claude/build-platform 085299bd for anything in 1b's files.
Give exact builder instructions (file, line, what to do differently); do not redesign; where the design is wrong against the code, the recommended fix (security: the safer). List the 1b files. ${SAVE('sc1b-reread.md', 'each section checked and each delta')}`, { label: 're-read: SUITE-CAP-1b', phase: 'Re-read', schema: REREAD })
return r
