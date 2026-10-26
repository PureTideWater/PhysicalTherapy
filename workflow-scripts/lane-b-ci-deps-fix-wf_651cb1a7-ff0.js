export const meta = {
  name: 'lane-b-ci-deps-fix',
  description: 'Lane B ci-deps fix round 1 (before the bumps): two fixers take every review finding and the in-PR improvements, then an integrator checks, pushes once and updates the PR description',
  phases: [
    { title: 'Fix', detail: 'F1 workflows, tests and check-action-pins; F2 check-toolchain, Dockerfiles and documents' },
    { title: 'Integrate', detail: 'merge, checks, one push, PR description' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/320d184a-020e-5534-ba47-a98ce8d4921f/scratchpad'
const OUT = SP + '/ci-deps'
const PNPM = SP + '/pnpm10348/bin'
const ATTRIB = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01TztFLKnDUJniegCFmkfMoc'
const SAVE = (file, what) => `Save as you go: keep ${OUT}/progress/${file} up to date (${what}). If it already exists when you start, an earlier run of yours was interrupted: read it and continue from where it stopped.`

const CTX = `
CONTEXT (your whole brief).
- PaidWhole, repo PureTideWater/PhysicalTherapy; CLAUDE.md is in your context. Lane B's draft PR #48, co-001/ci-deps (CI 2 of 4; design /home/user/ops/designs/lane-b-ci.md section 3.2; ADR 0066 Part 2). Its local head is 19e3d98 (pushed head 2d86bb0 plus one local commit fixing the rewrite test's colour parse with NO_COLOR and stripVTControlCharacters). Build results: ${OUT}/build-summary.md and the builders' reports ${OUT}/d1.md, d2.md, d3.md. The two adversarial reviews: ${OUT}/review-ci-infra.md and ${OUT}/review-security-supply.md (read your findings there whole, with their evidence). CI on 2d86bb0 (run 40255481181): every job green but static (CQ3: pnpm 10.34.8 young until 2026-10-26T18:06:37Z, by design) and unit (the colour bug only).
- Every ruling is made (F1 (a), F2 (a) (b), F4, F7, Q2, CQ1-CQ3 (a)); every choice takes the best option, for security the safer, without asking anyone. Improve as you go.
- STILL PHASE 1: nobody changes pnpm-lock.yaml, any package.json dependency field, or pnpm-workspace.yaml's catalog, overrides or gates before 2026-10-26T19:18:50Z (the version bumps, the qs override and the catalog moves are the session's phase 2). Documentation of the phase-2 items (the qs override's selector and removal trigger) may be corrected now. docker/login-action stays on v3.7.0 until the session's commit after 15:11Z.
- Lane A's #42 is open; its files are in ${SP}/pr42-files.txt; touch none but the rule-6 documents already in the PR.
- Environment: export PATH=${PNPM}:/opt/node24/bin:/opt/py312-ci/bin:$PATH. PostgreSQL 18 at localhost:5433 (postgres:test). actionlint on PATH. No Docker daemon. Network: git ls-remote, raw.githubusercontent.com, registry.npmjs.org, hub.docker.com, registry-1.docker.io. Every heavy command under flock /tmp/laneb-heavy.lock (install, typecheck, lint, vitest beyond a single file, synth --all). No full test:db, e2e or mutation. Long commands with run_in_background.
- Commits in your own worktree and branch, the repository's style ("area: what and why", full sentences), each ending with exactly:
${ATTRIB}
- Never push (except the integrator), never force, never --no-verify, never post on GitHub except as told, never approve, request changes or merge. No PHI, no model identifier. Failing first: every fix of a behaviour gets a test that fails before it and passes after; record both.
- Report to the file named; return the structured summary.`

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    role: { type: 'string' }, branch: { type: 'string' }, head: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' } },
    dispositions: { type: 'array', items: { type: 'object', properties: { finding: { type: 'string' }, disposition: { type: 'string', enum: ['fixed', 'fixed_differently', 'not_a_defect', 'phase2'] }, how: { type: 'string' }, commit: { type: 'string' } }, required: ['finding', 'disposition', 'how', 'commit'] } },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } },
    phase2_needs: { type: 'array', items: { type: 'string' } },
    report_path: { type: 'string' },
  },
  required: ['role', 'branch', 'head', 'commits', 'dispositions', 'checks', 'phase2_needs', 'report_path'],
}
const SETUP = (k) => `Set up first (skip any step done): git -C /home/user/PhysicalTherapy worktree add -b co-001/ci-deps-${k} /home/user/ci-deps-${k} co-001/ci-deps (local branch, head 19e3d98), then flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile --prefer-offline there.`
const FIXERS = [
  { key: 'f1', brief: `You are fixer F1: workflows, workflow tests and check-action-pins. Worktree /home/user/ci-deps-f1, branch co-001/ci-deps-f1. ${SETUP('f1')}
Take, each fully:
- both reviews' B1 (the rewrite test): replace the colour-sensitive text parse with vitest's JSON reporter written to a scratch file (--reporter=json --outputFile), asserting numFailedTests 0 and that every test of the spawned files ran but the rewrite test itself (numPassedTests equal to the run's total less the one skip), keeping NO_COLOR as belt and braces; the red half reads the same report; prove it under FORCE_COLOR=1 and without;
- ci-infra S1 (push-run re-reads of unchanged pins bounded: concurrent with a limit and one overall deadline well inside static's timeout, the rest one warning; never a failure on a push run's unchanged pins), S2 (the compose healthcheck held whole: interval 2s, timeout 5s, retries 30 as CI proved, and interval x retries under postgres.sh's --wait-timeout; docker-compose.yml's timeout back to 5s: docker-compose.yml is D2's file, but you own this one-line change in this round), N1 (ADR 0066 Part 2's (d) names all three files and the JSON report), N2 (leave: the session's login commit fixes it; record), N4 (take the proposal: release-dry-run.yml gains the capacity job's setup steps, held by the shared-step rule, so the tag's setup-node package-manager-cache false, action-setup cache false and the frozen install run on every release change; plus, as the integrator proposed, release.yml's SBOM step mirrored in the dry run), N5 (raw.githubusercontent reads: a longer final backoff on 403/429, or fetch the action file with git over the same host as ls-remote: choose the more robust and justify);
- security S4 (the BuildKit frontend and builder images: remove "# syntax=docker/dockerfile:1" from both Dockerfiles if nothing needs it (check each feature used; else pin dockerfile:1.x@sha256 read from the registry), and set setup-buildx's driver-opts image=moby/buildkit:<latest release at least three days old>@sha256:<index digest> identically on every setup-buildx step; extend CI-13's test to both and to "every image the release build runs is pinned by digest"; Dependabot cannot update a driver-opts string, so check-action-pins or check-toolchain warns when a newer buildkit release is three days old, and dependency-upgrades.md gets the manual step: coordinate the doc line with F2 by naming it in phase2_needs if you cannot write it), security N2 (cacheGates fails closed beyond its depth; wording narrowed to composite actions; workflows.test.ts's explicit inputs named as the guard for JavaScript actions);
- the integrator's in-PR proposals: check-action-pins warns on a pinned action whose runs.using is a deprecated node runtime (node20 and older), and large-zip.yml takes defaults: run: shell: bash.
Your files: .github/workflows/*, .github/dependabot.yml, both Dockerfiles' "# syntax" line only, docker-compose.yml's healthcheck only, tools/test/**, tools/ci/**, tools/check-action-pins/**, ADR 0066 Part 2's lines for your items. Checks: actionlint; the tests you touched and pnpm exec vitest run tools/test tools/check-action-pins tools/ci (locked); BASE=origin/claude/build-platform pnpm actions:check live; pnpm typecheck; pnpm lint. ${SAVE('f1.md', 'each finding, its commit, each check')} Report: ${OUT}/f1.md.` },
  { key: 'f2', brief: `You are fixer F2: check-toolchain, the Dockerfiles' pnpm install, and the documents. Worktree /home/user/ci-deps-f2, branch co-001/ci-deps-f2. ${SETUP('f2')}
Take, each fully:
- security S1 (every lockfile package resolution is {integrity} from the default registry, or a tarball on registry.npmjs.org only; git, directory and other hosts refused; a registry or @scope:registry setting in .npmrc or pnpm-workspace.yaml that is not npmjs refused; an added entry's integrity equal to the packument's dist.integrity), S2 (a lockfile trust rule over added versions with the packuments already fetched, ranked trusted publisher > provenance > none, honouring trustPolicyExclude; refuse trustPolicyIgnoreAfter and any trust-policy or minimum-release-age key in .npmrc; ADR 0066 Part 2 states the limit pnpm 10 leaves and what this rule covers), S3 (the overrides rule compares overrides.json with the lockfile's top-level overrides map and also reads package.json resolutions), S5 (correct now in dependency-upgrades.md and ADR 0066 Part 2: the phase-2 selector is typed-rest-client>qs with no version scope, removed when typed-rest-client is 3.1.1 or later (qs ^6.16.0); confirm both facts from the registry), N1 (packageManager carries +sha512.<hex> of pnpm 10.34.8's tarball, read from the registry: changing packageManager's string resolves nothing, so it may land now; both Dockerfiles verify the npm pack tarball's sha512 against it before installing; check-toolchain compares the suffix with the registry's dist.integrity and refuses a packageManager without it; verify a frozen install and pnpm's own switching still accept the suffixed form under 10.34.8 and action-setup v6.1.0 (read its source at its pinned SHA), and that dependabot-core's parsing of packageManager tolerates it), N3 (an exclude's GHSA confirmed through the bulk advisory endpoint against the package's previously locked version), N4 (dependency-upgrades.md's weekly triage reads open Dependabot alerts too, and handles a major-only fix as a deliberate upgrade), ci-infra N3 (the committed-lists test runs overridesRule and trustRule offline on the repository's real tree).
Your files: tools/check-toolchain/**, tools/check-licenses/**, package.json's packageManager line only, both Dockerfiles' pnpm install lines (not their "# syntax" line, which F1 owns), docs/runbooks/dependency-upgrades.md, ADR 0066 Part 2's lines for your items, docs/runbooks/ci.md if a check's description changes. Checks: pnpm exec vitest run tools/check-toolchain tools/check-licenses (locked); BASE=origin/claude/build-platform pnpm toolchain:check live (CQ3 alone red before 18:06:37Z); pnpm licenses:check; both audits; pnpm typecheck; pnpm lint; and the Dockerfile's verification step as a shell script run locally against the real tarball (npm pack pnpm@10.34.8) and against a tampered one. ${SAVE('f2.md', 'each finding, its commit, each check')} Report: ${OUT}/f2.md.` },
]
phase('Fix')
const fixed = await parallel(FIXERS.map(f => () => agent(`${CTX}\n\n${f.brief}\n\nReturn the structured summary.`, { label: `fix:${f.key}`, phase: 'Fix', schema: FIX_SCHEMA })))
if (fixed.some(f => !f)) throw new Error('A fixer returned nothing')

phase('Integrate')
const integ = await agent(`${CTX}

You integrate fix round 1 of co-001/ci-deps in /home/user/ci-deps (local head 19e3d98; you may change this worktree). The fixers finished on co-001/ci-deps-f1 and co-001/ci-deps-f2 (reports ${OUT}/f1.md, f2.md):
${JSON.stringify(fixed, null, 1)}
${SAVE('fix-integrate.md', 'each merge, seam, check, the push, the PR description update')}
1. git fetch origin claude/build-platform; if it moved past 6ddd587, merge it in now with a merge commit (rule 6, both sides kept); if the lockfile conflicts, stop and record it (a re-resolution waits for phase 2).
2. Merge f1 then f2 (--no-ff); fix every seam; every finding of both reviews must have a disposition (fixed with commit, not a defect with why, or phase 2).
3. Checks, each heavy one locked, recorded: pnpm typecheck; pnpm lint; actionlint; the full unit suite (pnpm test) with its total; pnpm exec vitest run tools/test tools/check-action-pins tools/check-toolchain tools/check-licenses tools/screening-capacity tools/ci; the rewrite test under FORCE_COLOR=1; pnpm synth --all clean; pnpm verify-content; licenses:check; both audits; BASE=origin/claude/build-platform pnpm actions:check and pnpm toolchain:check live (CQ3 alone red before 18:06:37Z); the failing-first run of the design's 3.2.3 against 6ddd587 again (each named test red there, green here) plus each new behaviour's red/green; the scope checks of acceptance 1; git diff --numstat 6eae41a..HEAD -- pnpm-lock.yaml pnpm-workspace.yaml (empty).
4. Push once: git push origin co-001/ci-deps (hook and gitleaks; never force or --no-verify).
5. Update PR #48's description ONLY with the GitHub MCP update_pull_request tool (ToolSearch "select:mcp__github__update_pull_request"), from ${OUT}/pr-body.md edited: the Reviewer agents' findings table gains one row per finding of both reviews (reviewer, finding, resolution with commit or why), the Checks table updated to this head, the new behaviours named under What changes, the deviations and choices updated. Read it back with gh api repos/PureTideWater/PhysicalTherapy/pulls/48 --jq .body and prove it byte for byte equal to your file. Keep the closing attribution lines exactly as they are.
6. Write ${OUT}/fix-summary.md in the house format (approval-summaries/lane-b-ci-speed-fix-round.md): each finding with its disposition, each check.
Return: { head, commits, dispositions (all), checks, phase2_plan (updated), summary_path }.`, { label: 'integrate', phase: 'Integrate', schema: {
  type: 'object',
  properties: { head: { type: 'string' }, commits: { type: 'array', items: { type: 'string' } }, dispositions: { type: 'array', items: { type: 'object', properties: { finding: { type: 'string' }, disposition: { type: 'string' }, how: { type: 'string' } }, required: ['finding', 'disposition', 'how'] } }, checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } }, phase2_plan: { type: 'array', items: { type: 'string' } }, summary_path: { type: 'string' } },
  required: ['head', 'commits', 'dispositions', 'checks', 'phase2_plan', 'summary_path'],
} })
if (!integ) throw new Error('The integrator returned nothing')
return { fixers: fixed, integ }
