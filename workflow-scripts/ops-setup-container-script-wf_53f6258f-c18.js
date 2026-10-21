export const meta = {
  name: 'ops-setup-container-script',
  description: 'Write and test tools/setup-container.sh on the ops branch so a fresh session rebuilds this machine exactly (Postgres 16 and 18, Node 24.22.0, Python 3.12 with pyx12, gitleaks, actionlint, clone and worktrees); independent review',
  phases: [{ title: 'Build' }, { title: 'Review' }, { title: 'Fix' }],
}
const OPS = '/home/user/ops'
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad'
const ATTR = `Every commit message ends with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR`
const CONTEXT = `Context. ${OPS} is a worktree of the orphan branch claude/build-ops of puretidewater/physicaltherapy (the build's operating notes: HANDOFF.md, tools/salvage.sh, the tracker). The founder ruled that the build moves to a fresh Claude Code cloud session after PR 5 and PR 6 merge, with no gaps. A new session runs on a fresh container: only what is on GitHub survives. This machine's tools were installed by hand in an earlier session and the notes only say "reinstall them". What exists here now (inspect it, do not change it): Postgres 16 from the distro at /usr/lib/postgresql/16 with data in /root/pgdata (port 5432, socket /tmp, run as user postgres); Postgres 18.4 at /opt/pg18, extracted from the npm package @embedded-postgres/linux-x64@18.4.0-beta.17 (tarball in /opt/pg18-dl, extract dir /opt/pg18-extract, /opt/pg18/pg-symlinks.json lists symlinks to create) with data in /root/pgdata18 (port 5433, superuser password 'test'); Node v24.22.0 at /opt/node24 from node-linux-x64-24.22.0.tgz; a Python 3.12.3 venv at /opt/py312-ci with pyx12 (check how: pip list); gitleaks 8.24.3 installed by the repo's tools/gitleaks/install.sh into /root/.cache/paidwhole/gitleaks/8.24.3/; actionlint 1.7.7. The repo's CI (.github/workflows/ci.yml on origin/claude/build-platform) shows the versions CI uses. Outbound HTTPS goes through a proxy (see /root/.ccr/README.md); some hosts are refused.`
const RESULT = { type: 'object', properties: { summary: { type: 'string' }, head: { type: 'string' }, checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } }, open_items: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'head', 'checks'] }
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['title', 'severity', 'problem', 'fix'] } }, verdict: { type: 'string' } }, required: ['findings', 'verdict'] }
phase('Build')
const build = await agent(`${CONTEXT}

Your task: write ${OPS}/tools/setup-container.sh, an idempotent bash script a fresh session runs once to rebuild this machine exactly, and test it.
1. It installs, each only if missing and each verified by version and, where a checksum is published, by sha256: Postgres 18.4 from the same npm package (npm pack or the registry tarball; apply pg-symlinks.json; initdb with a superuser 'postgres' password 'test', trust on the /tmp socket as now), Postgres 16 from the distro if absent, Node v24.22.0 from nodejs.org with its SHASUMS256, a Python 3.12 venv with pyx12 at the version installed here, actionlint 1.7.7 with its checksums file, and gitleaks through the repo's own tools/gitleaks/install.sh. Install locations and ports exactly as now, so HANDOFF's commands keep working.
2. It starts both Postgres servers (the commands in HANDOFF.md's environment recipe) and waits until they accept connections.
3. It clones the repository to /home/user/PhysicalTherapy if absent, checks out claude/build-platform, runs pnpm install --frozen-lockfile with Node 24 on PATH, adds the ops worktree at /home/user/ops for claude/build-ops, and adds a worktree /home/user/prN for each open co-001/* branch given as arguments.
4. It prints one line per tool with its version and a final OK, or exactly what failed.
Test it without breaking this machine: run it with an alternate prefix and ports (support SETUP_PREFIX, PG18_PORT, PG16 skip, CLONE_DIR) into ${SP}/setup-test/, prove a fresh Postgres 18 there accepts a connection and runs 'SELECT version()', prove Node and Python run and pyx12 imports, then stop and remove the test servers and files. Then run it in check-only mode (SETUP_CHECK=1) against this machine's real paths and confirm every tool is reported present with the right version and nothing is changed.
Add a short 'Fresh session' section to ${OPS}/HANDOFF.md naming the script and how to call it. Commit in ${OPS} with a plain message. ${ATTR} Push from the main checkout: 'GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops'. Return the summary, the head, every check and the open items (any download host the proxy refused, with what you did instead).`, { label: 'build: setup-container.sh', phase: 'Build', schema: RESULT })
if (!build) throw new Error('build failed')
phase('Review')
const review = await agent(`${CONTEXT}

You are an independent adversarial reviewer of ${OPS}/tools/setup-container.sh at ${build.head} (builder's summary, a claim: ${build.summary}). Do not edit it. Check: would it rebuild this machine exactly on a fresh container (every tool, version, path, port, password, socket, data directory, the symlinks, the venv's packages)? Is every download verified? Is it idempotent and safe to re-run while servers are running? Does check-only mode change nothing? Does it fail loudly rather than half-install? Does the HANDOFF section match it? Run it in check-only mode yourself and try one alternate-prefix install of just Postgres 18 into ${SP}/setup-review/ (then clean up). Report each finding with the fix.`, { label: 'review: setup script', phase: 'Review', schema: FINDINGS })
phase('Fix')
const fix = (review && review.findings.length) ? await agent(`${CONTEXT}

Fix round for ${OPS}/tools/setup-container.sh (head ${build.head}). Verify each finding; fix the real ones; say why for any you do not. Re-run the alternate-prefix test and check-only mode. Commit and push as before (${ATTR}).

Findings: ${JSON.stringify(review.findings, null, 2)}
Verdict: ${review.verdict}

Return the summary, the head, every check and the open items.`, { label: 'fix', phase: 'Fix', schema: RESULT }) : build
return { build, review, fix }
