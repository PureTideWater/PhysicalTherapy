export const meta = {
  name: 'lane-b-ux-sign-in-time-reviews',
  description: 'PR #92: the description from the template; security review; before re-run and after shots, then the UX and brand review; every finding verified by an independent skeptic',
  phases: [
    { title: 'Describe', detail: 'writer from the template, then a checker reads it back' },
    { title: 'Review', detail: 'security reviewer; capture (before re-run, after) then UX and brand reviewer, fresh clones' },
    { title: 'Verify', detail: 'one independent skeptic per finding' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/4a9d4438-0635-51b1-98ea-4663abfca5c5/scratchpad'
const HEAD = 'e4e05a0d'
const BASE = 'bce57f16'
const SESSION = 'https://claude.ai/code/session_01FcouKNxVRK8x6iV52PfxXz'
const COMMON = `You work on PR #92 of the PaidWhole build (PureTideWater/PhysicalTherapy), branch co-001/ux-sign-in-time at ${HEAD}, base claude/build-platform ${BASE}: UX PR 6, "each sign-in step states its limit, warns before it closes, and starts again with the email kept" (UX-012 now part, UX-128 step marker; ADR 0081; test matrix SGN-01 to SGN-04; synth module 19). The design is /home/user/ops/designs/lane-b-ux-sign-in-time.md (its section 9 wins over earlier sections). PR #42 is open; its files come from gh api 'repos/PureTideWater/PhysicalTherapy/pulls/42/files?per_page=100&page=N' (N=1..4; --paginate is refused here).
Rules: read-only on the product: never edit, commit or push in /home/user/ux-sign-in-time or the PR branch. Work in your own fresh clone: git clone -q --branch co-001/ux-sign-in-time https://github.com/PureTideWater/PhysicalTherapy <your dir under ${SP}> and check out ${HEAD}; if you need to run code, pnpm install --frozen-lockfile there. export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH in every command; every heavy command (install, typecheck, tests, builds, e2e, the screen tour) only under flock /tmp/laneb-heavy.lock, long ones with run_in_background and waited on by notification (no foreground sleep). If PostgreSQL 18 on 5433 is down: runuser -u postgres -- /opt/pg18/bin/pg_ctl -D /root/pgdata18 -o "-p 5433 -k /tmp" -l /tmp/pg18.log -w start. Synthetic data only. No model name or identifier in any file or text you write.`
const ADV = `Be adversarial: try to break the change. Every finding cites file:line at ${HEAD}, gives a concrete failure (input or state, then what goes wrong), its severity (blocking: wrong, unsafe, inaccessible or misleading; should-fix: a real defect of lesser harm; nit: polish), and the exact fix. Also say what you checked and found sound. Improve as you go: a better option is a finding with its fix.`
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}). If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, file: { type: 'string' }, line: { type: 'number' }, title: { type: 'string' }, failure: { type: 'string' }, fix: { type: 'string' }, rule: { type: 'string' } }, required: ['id', 'severity', 'file', 'line', 'title', 'failure', 'fix', 'rule'] } }, checkedSound: { type: 'array', items: { type: 'string' } }, notSeen: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }, required: ['findings', 'checkedSound', 'notSeen', 'summary'] }
const CAPTURE = { type: 'object', properties: { beforeDir: { type: 'string' }, afterDir: { type: 'string' }, tourCommit: { type: 'string' }, shotsBefore: { type: 'number' }, shotsAfter: { type: 'number' }, skippedAfter: { type: 'array', items: { type: 'string' } }, pairs: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, before: { type: 'string' }, after: { type: 'string' }, note: { type: 'string' } }, required: ['id', 'before', 'after', 'note'] } }, notes: { type: 'array', items: { type: 'string' } } }, required: ['beforeDir', 'afterDir', 'tourCommit', 'shotsBefore', 'shotsAfter', 'skippedAfter', 'pairs', 'notes'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit', 'not a defect'] }, reasoning: { type: 'string' }, fix: { type: 'string' } }, required: ['real', 'severity', 'reasoning', 'fix'] }

const describe = async () => {
  const w = await agent(`${COMMON}
${SAVE('sgn-pr-body.md', 'the sections written and the facts checked')}
You write PR #92's description. Fill .github/pull_request_template.md (on claude/build-platform; read it in your clone) section by section, every section present ("None" rather than omitted), under 60,000 characters, from the design, the diff (git diff ${BASE}..${HEAD}), ADR 0081 and the build's checks. Include: what changes and why (UX-012, UX-128, WCAG 2.2.1/2.2.6/4.1.3); the decisions taken without asking, with reasons (security: the safer option; wording within brand.md and CO-11, reported to the co-founder: list each departure from the review's words, design 6.1; the generated watched-paths.txt committed although a #42 file, LANES.md rule 6; StepHeading hides the colon with opacity-0 not sr-only because Chromium spaces absolutely positioned children in a heading's name); no migration, no infra or Cognito change; what is left for Lane A and UX PRs 66, 14, 7, 64 and audit #103 (design 3.5, 7.2); the tests (SGN-01..04 and each file; take counts only from runs, never vitest list; the e2e spec passed 4/4 locally with the real 3-minute test at 3.1 min); the reviewers' table with the screenshot sample (design 6.2's 27 states x 1280, 1280 dark, 390) marked "pending: the reviews run now"; the merge order (lands on nothing; the PR merged second resolves the shared documents and forms-harness.tsx with #85, LANES.md rule 6); and the attribution footer exactly:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

${SESSION}
Write it to ${SP}/pr-body.md. Then set it ONLY with the GitHub MCP tool update_pull_request (owner PureTideWater, repo PhysicalTherapy, pullNumber 92, body = the file's exact text; load the tool with ToolSearch "select:mcp__github__update_pull_request"), never gh api PATCH. Read it back with gh api repos/PureTideWater/PhysicalTherapy/pulls/92 --jq .body and compare byte for byte with the file (diff); fix and resend until identical. Return: the section headings, the character count and the comparison result.`, { label: 'describe', phase: 'Describe' })
  const c = await agent(`${COMMON}
${SAVE('sgn-pr-body-check.md', 'each claim checked')}
You check PR #92's description (gh api repos/PureTideWater/PhysicalTherapy/pulls/92 --jq .body) adversarially: every section of .github/pull_request_template.md present; every factual claim true against the diff ${BASE}..${HEAD}, the design and ADR 0081 (file names, SGN rows, the strings quoted, the limits, what is left for whom); no PHI, no model name or identifier; the footer exact. Fix wrong facts by editing ${SP}/pr-body.md and sending it ONLY with the MCP update_pull_request tool (ToolSearch "select:mcp__github__update_pull_request"), then reading it back byte for byte. Return what you fixed.
The writer reported: ${String(w).slice(0, 3000)}`, { label: 'describe-check', phase: 'Describe' })
  return { w, c }
}

const security = () => agent(`${COMMON}
${SAVE('sgn-review-security.md', 'what you checked, findings so far')}
You are the security review, one of the PR's two adversarial reviews. Read .claude/agents/security-reviewer.md in your clone and apply its checklist whole. Then attack this change specifically:
- The kept-email cookie tp_sign_in_email (lib/auth/pending.ts writeKeptEmail/readKeptEmail/clearKeptEmail/clearSignIn, sessions.ts): flags (HttpOnly, Secure, SameSite, Path, Max-Age), the seal and its purpose separation from tp_sign_in (can one sealed value be replayed as the other?), its lifetime from the step's start, every path that must clear it (session written, locked, hardware key required, key registered, a first step that opens no step, the key step), what it reveals on a shared computer, and whether readKeptEmail can throw or echo an invalid address into the page.
- Account enumeration: does any new state, reason (restarted, step_expired), kept email, use hint ("temporary"/"chosen"), step marker or timing differ between an address that exists and one that does not, or between customer and staff before the password is proven? keyRequired from start(): when is it computed and can it leak before authentication?
- The server deadline: pendingOf refuses at now >= closesAt from the server clock and the sealed startedAt; can a client extend a step (re-sealing paths: invalid_password, hardwareKeyRegistrationOptions, beginKeyRegistration copying the pending object, writePending dropping carried meta), or reach a step past its limit? Can a test-only path shorten or lengthen a limit from a request in production?
- Rate limits and lockout (lib/http/rate-limit.ts sign_in bucket; the lock count): does Start again or the kept email create a way around them?
- Logs, URLs, error messages and job payloads: no email address, name or document text anywhere (lint:logs, the restartHref, ?reason= values, notice words); the e2e personas added to scripts/synthetic-personas.ts and the seed's isolation.
- #42 files: the diff touches no #42 file except the three shared documents and the generated watched-paths.txt.
Run the security-relevant tests in your clone if useful (pending.test.ts, step-limits.test.ts, sign-in-routes.db.test.ts, sign-in.db.test.ts), under the lock.
${ADV}
Return findings per the schema.`, { label: 'review-security', phase: 'Review', schema: FINDINGS })

const capture = () => agent(`${COMMON}
${SAVE('sgn-capture-after.md', 'each step, command and result')}
You take the screenshots for the UX and brand review: a fresh BEFORE run and the AFTER run. The tour is /home/user/ops/tools/lane-b-screen-tour (README "From another lane" and "Set-up and a run"); pull claude/build-ops first (git -C /home/user/ops pull --no-rebase -q origin claude/build-ops). The earlier before run's notes and its skeptic's findings are in ${SP}/progress/sgn-capture-before.md and below.
1. Fix the tour (on claude/build-ops, capture/tour.spec.ts): wrap the two outer attempt() calls that pass light ids only with andDark(): in invitedShots, attempt(andDark(all), np, ...), and in registerKeyShots, attempt(andDark([...errorIds, ...warnIds]), route, ...) (re-find them by content). Typecheck the spec as the earlier run did (a tsconfig in ${SP}). Commit (message ends with a blank line, then "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" and "Claude-Session: ${SESSION}"), pull, push with GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops (never force; if refused non-fast-forward, pull and push again).
2. Re-run the BEFORE on a fresh prepare: TOUR_DIR=${SP}/screens-before-2, TOUR_REF=${BASE}, TOUR_ONLY from ${SP}/sgn-tour-only.txt. Expect 48 shots and 33 skips, none with the generic "named in TOUR_ONLY, but no step of this run took it" reason.
3. The AFTER: TOUR_DIR=${SP}/screens-after, TOUR_REF=${HEAD}, the same TOUR_ONLY, fresh prepare. Expect all 81 ids shot (the personas time-mfa, time-staff exist at the head); a skip at the head is either a tour fault (fix the spec version-tolerantly, push, retake) or a product defect (a note for the reviewer, never a spec workaround).
Each run: setup.sh, build, serve, run.sh, touch stop, check the lock and server ended together (README step 5), clean up (step 6). Tile each with /usr/bin/python3 -I tools/lane-b-screen-tour/tile.py <TOUR_DIR> sign-in.
Return the dirs, the tour commit, the shot counts, the after skips with reasons, the before/after pairs (one per id: before tile path or the skip reason, after tile path, a one-line note), and notes.
The earlier skeptic's findings on the before run: five 1280-dark ids (sign-in.step-expired-temporary, sign-in.step-expired-chosen, sign-in-enroll.warning, sign-in-enroll.closed, sign-in-register-key.warning) had the generic reason; the two outer attempt() calls above miss andDark.`, { label: 'capture', phase: 'Review', schema: CAPTURE })

const ux = (shots) => agent(`${COMMON}
${SAVE('sgn-review-ux.md', 'screens and states looked at, findings so far')}
You are the UX and brand review, one of the PR's two adversarial reviews. Read .claude/agents/ux-brand-reviewer.md in your clone and apply it whole. The shots: before at ${BASE} in ${shots ? shots.beforeDir : SP + '/screens-before-2'}, after at ${HEAD} in ${shots ? shots.afterDir : SP + '/screens-after'} (tiles/index.json, shots.json); the capture's result: ${JSON.stringify(shots).slice(0, 7000)}. Look at every tile of every pair with the Read tool (images), at 1280 and 390 light and 1280 dark. The baseline findings this closes are UX-012 and UX-128 in /home/user/ops/designs/lane-b-ux-review.md (and its section 6.1 words; pull claude/build-ops first). The sample is design 6.2's; anything changed outside it is "not seen, by sample".
Attack specifically: every string against design 6.1 and .claude/rules/brand.md (plain, second person, a next step; the departures the design lists); the limit sentence's place before the work on every step; the single polite warning (4.1.3: once at the warning, once at zero, never each second; no announcement of the limit at load); what happens at zero (the form, Start again, focus kept on Start again); the arrival focus on /sign-in after Start again and step_expired (and not stealing focus otherwise); the email filled and the password line ("temporary" vs "chosen") on both invited paths; the step markers "Step 1 of 2" / "Step 2 of 2" / "Step 1 of 3" and their accessible names; the hardware-key surface's words; 390 px with the on-screen keyboard (the limit sentence visible at 390x500 with the field focused), dark tokens, reduced motion, no layout shift when the region appears; consistency with ADR 0077's ActionForm (a refusal summary and the timer must not fight for focus or announce twice); WCAG 2.2.1's residue the PR states honestly.
${ADV}
Return findings per the schema; notSeen lists what neither shots nor code showed.`, { label: 'review-ux', phase: 'Review', schema: FINDINGS })

const verify = (finding, lens) => agent(`${COMMON}
${SAVE(`sgn-verify-${lens}-${finding.id}.md`, 'what you checked and your verdict')}
You are an independent skeptic. A ${lens} reviewer of PR #92 reported this finding; try to REFUTE it from the code at ${HEAD} (and, where it is about what a person sees, the shots in ${SP}/screens-after and ${SP}/screens-before-2). Default to not real if it cannot be shown to happen with a realistic input or state, or if the cited code does not do what it says. If it is real, say whether its severity is right and whether its fix is the best one, or give a better one.
Finding: ${JSON.stringify(finding)}`, { label: `verify-${lens}-${finding.id}`, phase: 'Verify', schema: VERDICT })

const withVerify = (r, lens) => (r === null ? null : parallel((r.findings ?? []).map((f) => () => verify(f, lens).then((v) => ({ ...f, verdict: v })))).then((fs) => ({ ...r, findings: fs.filter(Boolean) })))
const [desc, sec, uxr] = await parallel([
  () => describe(),
  () => security().then((r) => withVerify(r, 'security')),
  () => capture().then((shots) => ux(shots).then((r) => withVerify(r, 'ux')).then((r) => (r ? { ...r, shots } : null))),
])
if (!sec || !uxr) throw new Error('a review returned nothing: refusing to continue (security ' + !!sec + ', ux ' + !!uxr + ')')
return { desc, security: sec, ux: uxr }
