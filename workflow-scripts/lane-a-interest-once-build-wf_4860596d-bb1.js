export const meta = {
  name: 'interest-once-build',
  description: 'The interest fix (interest credited once per PLB L6; ADR 0084; LED-23 to LED-25; founder\'s ledger freeze exception granted 2026-10-27): design re-read, ledger core and schema, reconcile, screens and records, integration with the full local suite (no PR)',
  phases: [
    { title: 'Re-read', detail: 'one reviewer: the design against SUITE-CAP-1b\'s head 358dc53f' },
    { title: 'Core and schema', detail: 'slice 1 packages/ledger interest.ts (mutation 100%); slice 2 the migration via the marker route; in parallel' },
    { title: 'Reconcile', detail: 'slice 3: interest-chains, recordInterest, pass, statement, synth LED-23/24, oracle' },
    { title: 'Screens and records', detail: 'slice 4 the reconciliation and ROI pages, e2e; slice 5 ADR 0084, amendments, PRD 13, reconciliation-001, matrix; in parallel' },
    { title: 'Integrate', detail: 'whole-repo checks, adversarial seam read, the full local suite once, push' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/2d6572d6-2076-5676-9f8f-7a15571707e4/scratchpad'
const WT = '/home/user/interest'
const BR = 'co-001/ledger-interest-once'
const BASEBR = 'co-001/suite-cap-1-triage-locks'
const BASEHEAD = '358dc53f5340092daf57226a0769486218bd5418'
const DESIGN = '/home/user/ops/designs/ledger-interest-once.md'
const ATTR = `End every commit message with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019i9ifCi6u3MV8sy7oAhUmy`
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const GRANT = `"Granted: the ledger freeze exceptions in designs/ledger-interest-once.md section 10.1 and designs/suite-cap-1-triage-locks.md section 4.5, as written." (the founder, Tyler Williams, relayed by the co-founder, 2026-10-27 20:49 UTC; approval-summaries/founder-asks-2026-10-27.md)`

const CONTEXT = `Repository PureTideWater/PhysicalTherapy (PaidWhole). Read /home/user/PhysicalTherapy, /home/user/ss01, /home/user/sc1b or /home/user/ops but never write there.
This is the interest fix, a Lane A schema PR: the design ${DESIGN} (revised after its adversarial review; build EXACTLY the design as revised, its section 16 "After the design review" included; the re-read's deltas below say where the code moved). The founder granted its ledger freeze exception: ${GRANT}. Stay exactly within section 10.1's granted text: the DDL it may change, its seven behaviours, its files, and what stays frozen (the stages, every principal amount, the definition of recovered, the parser and loader, LED-01 to LED-18's amounts). PRD 13's one sentence on interest is replaced with section 9.2's text, as granted. Reserved: ADR 0084; test-matrix LED-23 to LED-25; packages/synth cases the same (module 6); fixture release 900008 only if needed. ONE migration, packages/db/migrations/20261110090000_ledger_interest_once.sql (the next free timestamp after SUITE-CAP-1b's 20261109090000), regenerating docs/product/domain-model.md and packages/db/functions for the founder's SHA-256 approval. SUITE-CAP-1b already carries claim_by_superseded, so this PR leaves out its object 5 (the index, its remittances.ts mirror line and its domain-model change) and keeps LED-25's EXPLAIN assertions, which read 1b's index; the 10.1 clause "and the index claim_by_superseded on claim unless SUITE-CAP-1 has made it" is satisfied by 1b. 1b changed ledger_entry_within_evidence() and ledger_entry_within_line() to take the practice's ledger: key (under its own granted exception): diff against 1b's migration and function files, not 20261027090000.
Worktree ${WT}, branch ${BR}, stacked on ${BASEBR} at ${BASEHEAD} (which holds #42's 6f23c42b, SS-01 and SUITE-CAP-1b's 1a-independent parts). The PR opens later, after SS-01 and SUITE-CAP-1b merge; open none now. Never write the approval line or approvers.json; never approve or request changes on a PR.
Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH in every command. PostgreSQL 18 on 5433 (postgres:test, socket /tmp): databases tp_int_<role>_<n>, dropped when done. E2e ports 4981-4989. Logs under ${SP}/interest/. If PostgreSQL stops, start it: su postgres -c "/opt/pg18/bin/pg_ctl -D /root/pgdata18 -o '-p 5433 -k /tmp' -l /tmp/pg18.log start". Heavy commands one at a time under: flock /tmp/laneb-heavy.lock <command>. Long commands: run_in_background and wait for the notification; never end your turn while a background command you need is still running.
The founder's standing permission (HANDOFF.md 2026-10-22 ~16:40 UTC): the protected-edit marker ${WT}/.claude/.allow-protected-edit for the open schema PR's own new, unmerged migration, through .claude/skills/new-migration/SKILL.md's route (created by a shell command for the write and removed in a trap; never committed; never for an applied migration). It covers only 20261110090000 here. If any permission check refuses it, stop and report; never route around a refusal and never bypass any other hook.
Rules: CLAUDE.md in full; the four rules that never bend above all (code computes every number; integer cents, never a float on an amount, round once per line under the rule and keep the unrounded value; every expected amount traced; forced RLS). Money code: a new ledger source file needs its shard in stryker/shards.json; a survivor is killed with a test, or recorded equivalent only when no input tells it apart, with a reviewer who is not its proposer. No change under packages/pricing/src, packages/rules, packages/edi835 (the parser and loader stay frozen), fixtures/golden, content/releases or any applied migration. Words a person reads: exactly the design's section 7, within .claude/rules/brand.md. Synthetic data only. Generated files are regenerated, never hand-edited. Stage only your own paths and commit with 'git commit -m "..." -- <paths>'; retry on an index lock. Push with 'git push -u origin ${BR}', retrying after 2, 4, 8 and 16 s on a network error; if rejected, 'git pull --no-rebase origin ${BR}' and push again. Never force (WIP branches included), never --no-verify, never a .gitleaksignore entry. Commit messages in the house style (lowercase area prefix; one sentence saying what changes and why; naming the interest fix and ADR 0084). No model name or identifier anywhere. ${ATTR}
Builders check what they touch (pnpm typecheck, pnpm lint, the unit and db tests of the files they changed); tests first where the design says so (fail on the base, pass after). Never skip, disable or loosen a test. Failures in another builder's files are reported, not fixed. Improve as you go: inside your files and of the same kind, do it and report it; else an open item. Report briefly: every check with its command and result, every open item, every difference from the design.`

const CHECKS = { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } }
const BUILD = { type: 'object', properties: {
  summary: { type: 'string' }, head: { type: 'string' }, interfaces: { type: 'string' }, files: { type: 'array', items: { type: 'string' } },
  wording: { type: 'array', items: { type: 'string' } }, checks: CHECKS, differences_from_design: { type: 'array', items: { type: 'string' } }, open_items: { type: 'array', items: { type: 'string' } },
}, required: ['summary', 'head', 'files', 'checks', 'open_items'] }
const REREAD = { type: 'object', properties: {
  verdict: { type: 'string', enum: ['build as designed', 'build with deltas', 'stop'] },
  deltas: { type: 'array', items: { type: 'object', properties: { section: { type: 'string' }, design_says: { type: 'string' }, code_now: { type: 'string' }, builder_instruction: { type: 'string' } }, required: ['section', 'code_now', 'builder_instruction'] } },
  notes: { type: 'string' },
}, required: ['verdict', 'deltas'] }

phase('Re-read')
const reread = await agent(`${CONTEXT}

First: if ${WT} does not exist, git -C /home/user/PhysicalTherapy fetch origin ${BASEBR} && git -C /home/user/PhysicalTherapy worktree add -b ${BR} ${WT} ${BASEHEAD} && cd ${WT} && flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile && git push -u origin ${BR}. (If ${BR} already exists on the remote, check it out instead.)
You are the design re-reader (pipeline stage 1, one reviewer). The design was written against claude/build-platform e908c21 and #42's head of the time; the tree is now ${BASEHEAD}. Re-read the WHOLE design against ${WT} (read-only for you after the setup above): every file:line claim; ledger_match_rules and the ledger trigger bodies as a database migrated from empty at ${BASEHEAD} has them (pg_get_functiondef); everything SS-01 or SUITE-CAP-1b changed among the design's files (git diff 6f23c42b...${BASEHEAD} --stat, and #42's own diff since the design's base); the synth cases, the oracle, the reconcile code (apps/worker/src/reconcile) and the web pages it edits; and the interest-builder instructions in /home/user/ops/approval-summaries/lane-a-suitecap1b-reread.json ("interest_overlap"). Give exact builder instructions (file, line, what to do differently); do not redesign; where the design is wrong against the code, the recommended fix (security and money: the safer), always within section 10.1's granted text (if a delta would need anything beyond it, say "stop" for that part and why). ${SAVE('int-reread.md', 'each section checked and each delta')}`, { label: 're-read: interest design', phase: 'Re-read', schema: REREAD })
if (!reread) return { error: 're-read returned nothing' }
if (reread.verdict === 'stop') return { error: 're-read says stop', reread }
const DELTAS = `The design re-read (verdict: ${reread.verdict}) found these deltas; they override the design where they conflict: ${JSON.stringify(reread.deltas).slice(0, 14000)}`

phase('Core and schema')
const [core, schema] = await parallel([
  () => agent(`${CONTEXT}

${DELTAS}

You are builder L, the ledger core (slice 1; section 6.1). You own: packages/ledger/src/{interest,interest.test,stages,stages.test,index,rules.test}.ts and stryker/shards.json (the interest.ts shard). Pure, mutation-tested code: interest.ts with its unit and property tests (integer cents; the worked cases of section 4.1 exactly; never past what the PLB L6 pays; once per PLB L6). Tests first. Run Stryker on interest.ts's shard and the gate: 100% (kill every survivor with a test; an equivalent mutant only when no input tells it apart, recorded with its reason, for the integrator to review). Checks: pnpm typecheck; pnpm lint; packages/ledger unit; Stryker shard + gate. Commit, push. In "interfaces", give the reconcile builder interestWrites' exact signature, inputs and outputs. ${SAVE('int-core.md', 'steps done, failing-first counts, Stryker score, open items')}`, { label: 'build: L ledger core', phase: 'Core and schema', schema: BUILD }),
  () => agent(`${CONTEXT}

${DELTAS}

You are builder S, the schema (slice 2; section 5). You own: packages/db/migrations/20261110090000_ledger_interest_once.sql (new); packages/db/src/schema/ledger.ts (seq, ledger_match_by_seq); docs/product/domain-model.md and packages/db/functions/** (generated); packages/db tests pinning functions, grants, tables or the registry; and the database tests that need no worker change (LED-24's refusals and the skip by hand, LED-25's order and plan tests) in the files the design names. Diff ledger_match_rules on the base first; leave out claim_by_superseded (1b made it). The migration through the marker route (drafted in ${SP}/interest/ first; one shell command per write with the trap; marker never committed; confirm it is gone before every commit), its header stating it is safe with the previous image running and each deploy-window effect (5.2). Regenerate (pnpm db:domain-model --out --strict on a freshly migrated database), read its Cross-checks block and every changed function file's diff for the new-migration skill's hazards. Checks: pnpm typecheck; pnpm lint; packages/db unit; your db tests plus catalog, cross-tenant, migrate and every pinning db test; the ledger db tests and the ledger oracle on the new schema (the oracle's new cases are slice 3's); pnpm -s db:domain-model --check (SHA-256). Commit, push. In "interfaces": every new or changed object, its grants, the refusal codes and messages, ledger_entry_within_interest's behaviour and lock key. ${SAVE('int-schema.md', 'steps done, failing-first counts, the draft path, open items')}`, { label: 'build: S schema', phase: 'Core and schema', schema: BUILD }),
])
if (!core || !schema) return { error: 'a core/schema builder returned nothing', reread, core, schema }
const CSINFO = `Builders L and S have pushed (L ${core.head}, S ${schema.head}). Run git pull --no-rebase origin ${BR} in ${WT} first. L's interfaces: ${String(core.interfaces || '').slice(0, 6000)} S's interfaces: ${String(schema.interfaces || '').slice(0, 6000)} Their open items: ${JSON.stringify([core.open_items, schema.open_items]).slice(0, 3000)}`

phase('Reconcile')
const rec = await agent(`${CONTEXT}

${DELTAS}

${CSINFO}

You are builder R, the reconcile (slice 3; section 6.2). You own: apps/worker/src/reconcile/{interest-chains (new),remittances,ledger,pass,public,statement-html}.ts and their tests {interest.db.test (new),chain.large.db.test (new),chain.db.test,ledger-oracle.db.test,payment-terms.db.test,ledger.db.test}.ts; apps/worker/src/report/brand.test.ts; packages/synth/src/cases/workflow.ts (LED-16's PLB L6, LED-23 and LED-24) and the fixtures pnpm synth writes for them (fixtures/synthetic/LED-16, LED-23, LED-24; never hand-edited); the PAR-18 assertion's update if the design names it (in its test file only; the parser itself stays frozen). D17's one-moment reads, the payer-scoped reference lookup, the new recordInterest calling interestWrites, the adjustment query, the order by seq, the oracle's appended cases (LED-01 to LED-18's amounts unchanged). Tests first. Checks: pnpm typecheck; pnpm lint; apps/worker unit; the reconcile db tests and the oracle on a fresh database; pnpm synth --all and the fixtures check; LED-01 to LED-18 unchanged. Commit, push. In "interfaces": what the web queries read (the chain walk export from public.ts, the reported interest). ${SAVE('int-reconcile.md', 'steps done, failing-first counts, open items')}`, { label: 'build: R reconcile', phase: 'Reconcile', schema: BUILD })
if (!rec) return { error: 'reconcile builder returned nothing', reread, core, schema }
const RINFO = `Builder R has pushed (${rec.head}). Pull first. R's interfaces: ${String(rec.interfaces || '').slice(0, 6000)} R's open items: ${JSON.stringify(rec.open_items).slice(0, 2500)}`

phase('Screens and records')
const [web, docs] = await parallel([
  () => agent(`${CONTEXT}

${DELTAS}

${CSINFO}

${RINFO}

You are builder W, the screens (slice 4; sections 6.3 and 7). You own: apps/web/src/lib/reconciliation/queries.ts; apps/web/src/app/p/[practiceId]/reconciliation/page.tsx; apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx; apps/web/src/components/reconciliation/display.tsx; apps/web/src/lib/routes/specialist.ts; apps/web/src/lib/routes/test-support/ledger-world.ts; apps/web/src/lib/routes/reconciliation-routes.db.test.ts; apps/web/e2e/ledger-interest.spec.ts (new). Every sentence word for word from section 7; the page keeps offering no reversal of an interest match; accessibility (labels, announcements, keyboard, 390 px). Tests first. Checks: pnpm typecheck; pnpm lint; pnpm lint:copy; apps/web unit; reconciliation-routes.db.test.ts on a fresh database; ledger-interest.spec.ts alone on port 4981. Commit, push; give every sentence word for word in "wording". ${SAVE('int-web.md', 'steps done, failing-first counts, open items')}`, { label: 'build: W screens', phase: 'Screens and records', schema: BUILD }),
  () => agent(`${CONTEXT}

${DELTAS}

${CSINFO}

${RINFO}

You are builder M, the records (slice 5; section 9.2). You own: docs/adr/0084-<slug>.md (new); dated (2026-10-28) amendments to docs/adr/0042-*.md and docs/adr/0067-*.md; docs/product/PRD.md (PRD 13's one sentence on interest replaced with section 9.2's text, word for word, as granted); docs/product/reconciliation-001.md (the exception recorded word for word with who and when: ${GRANT}, under "Ledger semantics", beside SUITE-CAP-1b's Q1 entry already there: keep both); docs/product/test-matrix.md rows LED-23 to LED-25 (after LED-18 and any rows already after it; word for word section 8.1); packages/synth/src/cases/{matrix,registry}.ts entries LED-23 to LED-25 (word for word with the matrix; module 6; assertedBy naming tests that exist on this branch); tools/screening-capacity/watched-paths.txt (regenerated by watched.ts --write, never hand-edited). ADR 0084 records the decision, the grant word for word with who and when, what stays frozen, the options, and the out-of-scope items of section 14 (the renumbered reversal, for a later PR). Do not touch code. Checks: pnpm verify-content; packages/synth unit and fixtures tests; pnpm synth --all leaves fixtures as generated; markdown links resolve. Commit, push. Return the LANES.md "Handed to Lane A" lines (section 14) for the orchestrator. ${SAVE('int-docs.md', 'steps done, open items')}`, { label: 'build: M records', phase: 'Screens and records', schema: BUILD }),
])
if (!web || !docs) return { error: 'a slice 4/5 builder returned nothing', reread, core, schema, rec, web, docs }

phase('Integrate')
const integ = await agent(`${CONTEXT}

You are the integrator. Reports: re-read ${JSON.stringify(reread).slice(0, 3000)} L ${JSON.stringify(core).slice(0, 4000)} S ${JSON.stringify(schema).slice(0, 5000)} R ${JSON.stringify(rec).slice(0, 5000)} W ${JSON.stringify(web).slice(0, 4000)} M ${JSON.stringify(docs).slice(0, 3000)}
1. In ${WT}: git pull --no-rebase origin ${BR}; clean; no marker anywhere. pnpm typecheck, pnpm lint, pnpm lint:copy, pnpm lint:logs; regenerate watched-paths and confirm the lockfile and the domain model are what their generators write. Fix seams in the smallest change with a failing-first test.
2. Re-read the whole diff against ${BASEHEAD} adversarially, as a payment-engine reviewer would: can one payment of interest still be credited twice (AMT I and PLB L6; a resend; a correction chain; one PLB L6 netting several claims); can interest exceed what the PLB L6 pays; any float on an amount; any principal amount, stage or the definition of recovered changed; anything beyond section 10.1's granted text (files, DDL, behaviours); packages/edi835, pricing, rules untouched; LED-01 to LED-18's amounts unchanged. Then security: the new trigger function's search_path, grants, lock key. Review any equivalent mutant L recorded (you are not its proposer). Fix what you find with failing-first tests; report each.
3. The full local suite once (lanes/lane-b.md "How Lane B runs"): unit and property; golden; the oracle (pnpm test:oracle) and the ledger oracle db test; test:db in 4 shards one after another on fresh databases; build, stamp, e2e with E2E_PREBUILT=1 --workers=2 on ports 4981-4989; Stryker for every shard the change affects per stryker/shards.json (interest.ts at 100%; the ledger shards; any shard the schema touches) and the gate; pnpm verify-content; pnpm synth --all and the fixtures check; the engine-freeze check against ${BASEHEAD}; the screening-capacity gate if it runs locally (else say why); pnpm -s db:domain-model --check (SHA-256, approval line). Totals from the runs. Every heavy command under the lock; wait for background commands before returning.
4. Scope: git diff --name-only ${BASEHEAD}...HEAD lists only section 11's files (less claim_by_superseded's), tests and generated files; exactly one new migration; no applied migration changed; packages/edi835, packages/pricing/src, packages/rules, fixtures/golden, content/releases untouched.
5. Commit fixes, push once. No PR. Return head, SHA-256, approval line, each suite part with totals, scope, fixes, open items (with M's hand-overs and anything for the founder). ${SAVE('int-integrate.md', 'steps done, each suite part with totals, fixes, open items')}`, { label: 'integrate + full local suite', phase: 'Integrate', schema: { type: 'object', properties: {
  head: { type: 'string' }, domain_model_sha256: { type: 'string' }, approval_line_number: { type: 'number' }, scope_ok: { type: 'boolean' },
  suite: CHECKS, fixes: { type: 'array', items: { type: 'string' } }, open_items: { type: 'array', items: { type: 'string' } } },
  required: ['head', 'domain_model_sha256', 'scope_ok', 'suite', 'open_items'] } })
return { reread, core, schema, rec, web, docs, integ }
