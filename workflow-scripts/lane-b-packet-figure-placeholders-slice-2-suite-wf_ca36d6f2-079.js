export const meta = {
  name: 'lane-b-packet-figure-placeholders-slice-2-suite',
  description: 'Placeholder item slice 2: last nit, base merge (rule 6), the one full local suite, branch push, PR description; each checked adversarially',
  phases: [{ title: 'Suite' }, { title: 'Check' }, { title: 'Description' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/c2e93384-1207-544a-bf87-57602f4a49c5/scratchpad'
const WT = '/home/user/pfp2'
const SESSION = 'https://claude.ai/code/session_01FcouKPkXdRW5ntz6ye92pL'
const GL = 'GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks'
const BR = 'co-001/packet-figure-placeholders-2'
const WIP = 'co-001/wip-packet-figure-placeholders-2'
const BASE = 'cc3dd7f6'
const SAVE = (f, what) => `Keep ${SP}/progress/${f} up to date (${what}); if it exists when you start, an earlier run was interrupted: read it and continue from it.`
const RULES = `Rules: \`export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH\`; every heavy command under \`flock /tmp/laneb-heavy.lock\`; long commands in the background with logs in ${SP}/pfp2/, read only tails and counts. Synthetic data only; no model name or identifier in any file, commit, PR text or comment. No migration. Never force, never --no-verify; a gitleaks refusal is fixed by rewriting the flagged text, never .gitleaksignore. Never skip, disable or weaken a test to get green. You MUST finish by returning the structured result.`
const CONTEXT = `PaidWhole; worktree ${WT} on branch ${BR} (cut from claude/build-platform ${BASE}; WIP ref ${WIP} = 7e9618e3 at the start of this run). Slice 2 of the packet-figure-placeholders item (design /home/user/ops/designs/lane-b-packet-figure-placeholders.md section 9; ADR 0089 in the diff; CAS-52, CAS-53, CAS-54): verifier /3 behind an explicit format, VERIFIER_FORMAT stays /2, the code draft emits tokens only for /3 with /2 byte-identical. Built and reviewed in workflows wf_445df00c-8d3 (result ${SP}/wf445-result.json) and wf_db15c2a6-888 (result ${SP}/wfdb15-result.json).`
const COMMIT = `Commit messages end with a blank line, "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>", "Claude-Session: ${SESSION}".`

phase('Suite')
const suite = await agent(`${CONTEXT}
You are the suite runner, in ${WT}. In order:
1. The last nit: packages/packets/src/draft-template.test.ts:192 \`const guard =records\` -> \`const guard = records\` (format it the repo's way); commit.
2. \`git fetch origin claude/build-platform\` and merge it with a merge commit (rule 6: the PR merged second keeps both lanes' changes). Overlapping files expected: docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts, packages/synth/src/cases/registry.ts (keep both sides' rows and entries) and tools/screening-capacity/watched-paths.txt (generated: regenerate with its tool, never hand-merge). Then \`pnpm install --frozen-lockfile\`, every generator the repo has for derived files (synth --all, watched paths, any stryker data checked by tests), and commit any regenerated output.
3. Fast checks: typecheck, lint, lint:copy, lint:logs, check:fixtures, verify-content, synth --all with no diff, db:domain-model --check (must be unchanged; no migration).
4. The full local suite ONCE on this final tree (lanes/lane-b.md "How Lane B runs": unit; golden; oracle; test:db in shards one after another; build, stamp, then e2e with E2E_PREBUILT=1; the mutation shards the change affects, then the gate). PostgreSQL must be up (pg_isready -h /tmp -p 5432; if down run \`bash /tmp/setup-container.sh\`). Record every count and timing. A failure: diagnose; if it is this branch's, fix it with a test and re-run only what the fix touches; if it is #127's known unseeded MOD-16 property (packages/model-gateway/src/redact.property.test.ts), re-run it once and record it; any other flake: re-run once and record.
5. Push: \`${GL} git -C ${WT} push -u origin ${BR}\` and \`${GL} git -C ${WT} push origin HEAD:refs/heads/${WIP}\` (fast-forward).
${COMMIT}
${SAVE('pfp2-suite.md', 'each step, counts, timings, failures')}
${RULES}`, { label: 'suite-runner', phase: 'Suite', schema: { type: 'object', required: ['head', 'mergeCommit', 'counts', 'failures', 'pushed'], properties: { head: { type: 'string' }, mergeCommit: { type: 'string' }, counts: { type: 'string' }, failures: { type: 'string' }, pushed: { type: 'boolean' } } } })

phase('Check')
const check = await agent(`${CONTEXT}
You are a skeptical checker of the suite runner's work, read-only, in a fresh clone ${SP}/pfp2-suitecheck (\`git clone -q https://github.com/PureTideWater/PhysicalTherapy ${SP}/pfp2-suitecheck\` or fetch if present; check out origin/${BR}). Runner's report: ${JSON.stringify(suite)}.
Verify: origin/${BR} equals the reported head; origin/claude/build-platform at the time of the merge is an ancestor; the merge kept both sides in the four overlapping files (every row and registry entry of both parents present; the generated watched-paths file equals its tool's output); no file outside the item's scope changed by the merge resolution; the reported counts are plausible against the test files (no test skipped, .only, or weakened in ${BASE}..HEAD: grep for it.skip/.only/xit/skipIf added); ADR 0089 exists and the CAS-52..54 rows match in test-matrix and the synth matrix word for word. Return problems found (empty if none), each with evidence.
${SAVE('pfp2-suitecheck.md', 'each check')}
${RULES}`, { label: 'suite-check', phase: 'Check', schema: { type: 'object', required: ['ok', 'problems'], properties: { ok: { type: 'boolean' }, problems: { type: 'array', items: { type: 'string' } } } } })

phase('Description')
const desc = await agent(`${CONTEXT}
You write the pull request description for ${BR} into ${SP}/pr-body.md. Follow .github/pull_request_template.md (in ${WT}) section by section, every section present ("None" rather than omitted). Title (first line of ${SP}/pr-title.txt): a plain sentence like slice 1's PR #128 title style ("narrative figures as placeholders, slice 2: ..."). Content: what slice 2 does and does not do (nothing served changes; /3 by explicit format; VERIFIER_FORMAT stays /2; the /2 change that any stray {{ }} or fact token now fails closed), ADR 0089, CAS-52..54, the decisions with reasons, for Lane A's slice-3 migration the six new codes, kind 'fact' and the 'canonical' key, and that the VERIFIER_FORMAT flip must ship with or after slice 4's export render; every review round's findings as a table (id, severity, title, outcome, commit) from both result files, including refuted ones counted, and the session decisions on NEW-1 (fixed) and NEW-2 (accepted reading); the mutation results and the reviewed equivalents; the full local suite's counts and timings from the suite runner: ${JSON.stringify(suite)}; the suite checker: ${JSON.stringify(check)}; known not covered (scanText quadratic on 40k+ letter runs, in ADR 0089). Under 60,000 characters. No model name or identifier. End with:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

${SESSION}
Read the diff (\`git -C ${WT} diff ${BASE}...origin/${BR} --stat\` and the files) so every claim is true. Return the path and the character count.
${SAVE('pfp2-desc.md', 'sections done')}
${RULES}`, { label: 'description', phase: 'Description', schema: { type: 'object', required: ['path', 'chars', 'title'], properties: { path: { type: 'string' }, chars: { type: 'number' }, title: { type: 'string' } } } })
const descCheck = await agent(`${CONTEXT}
Skeptic: read ${SP}/pr-body.md and ${SP}/pr-title.txt against .github/pull_request_template.md and the actual diff on origin/${BR}. Refute every claim you can (counts, commits, file names, behaviour, what is out of scope). Fix each false or missing statement in the file directly (it is a scratch file, not the repo); confirm under 65,536 characters, no model name or identifier, ends with the attribution lines. Return what you changed.
${SAVE('pfp2-desccheck.md', 'claims checked')}
${RULES}`, { label: 'description-check', phase: 'Description', schema: { type: 'object', required: ['changes', 'chars'], properties: { changes: { type: 'array', items: { type: 'string' } }, chars: { type: 'number' } } } })
return { suite, check, desc, descCheck }
