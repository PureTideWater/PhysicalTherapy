export const meta = {
  name: 'acting-s4-cognito-confidential-client-design',
  description: 'cognito-confidential-client design: three scouts (infra and IAM, provider calls and secret handling, takeover path and alarms), writer, security and infra/auth design reviews, skeptic per B/S finding, fold',
  phases: [
    { title: 'Scout', detail: 'infra and IAM; provider; takeover path, P-3, R-11' },
    { title: 'Write', detail: 'the design' },
    { title: 'Review', detail: 'security; infra and auth correctness; skeptics' },
    { title: 'Fold', detail: 'apply confirmed findings' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/cc'
const SESSION = 'https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu'
const WT = '/home/user/cognito-cc'
const DESIGN = '/home/user/ops/designs/lane-a-cognito-confidential-client.md'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. Acting session S4 (${SESSION}) on Lane A's account. A Lane A item at security priority: cognito-confidential-client, branch co-001/cognito-confidential-client, worktree ${WT} (base 45d7d0c1, installed, no commits). The status file is /home/user/ops/approval-summaries/lane-a-cognito-confidential-client-status.md. Read it, and read P-1 to P-3 in /home/user/ops/approval-summaries/lane-b-ux-sign-in-recovery-build/proposals.md, ADR 0081 (its UX PR 7 amendment, "Not covered", "Not verified here", "Revisit when"), /home/user/ops/approval-summaries/lane-b-ux-sign-in-recovery-review-security.md and /home/user/ops/designs/lane-b-ux-sign-in-recovery.md (sections 3 and 4).
The problem: the user pool's app client is public (generateSecret false, infra/lib/constructs/identity.ts) with EMAIL_ONLY recovery. Anyone who knows the client ID can call ForgotPassword, ConfirmForgotPassword and InitiateAuth directly, past the app's SEC-B1 gate, sign_in rate limit, audit and ten-failure lock. A CONFIRMED user with no factor can then be taken over through the app's MFA_SETUP enrolment.
Scope:
(1) A confidential client with SecretHash on every call that takes it, the secret in Secrets Manager, readable by the web role only. Least privilege, no secret in env files, logs, the build or the client bundle, a rotation plan, and the dev twin mirroring it.
(2) Close the MFA_SETUP takeover path for a CONFIRMED user with no factor. Consider every route there, not only the reset: an admin-created user, an invitation, a user whose factor was cleared.
(3) P-3: Cognito's per-code attempt cap, as a test or a staging check where it can be shown.
(4) R-11: alarms on reset requests per user and on undelivered requests, if they fit the same infra change.
Counters: ADR 0088 if this needs its own ADR (likely: an identity trust boundary), else an ADR 0081 amendment; test-matrix SEC-20 to SEC-23. No migration, unless one is unavoidable: then stop that part and record it.
Constraints: CLAUDE.md's rules. The infra IAM pin tests (find them under infra/test). The CDK diff rules (docs/runbooks/dependency-upgrades.md, and the infra runbooks about replacing a stateful or identity resource). A Cognito client's secret cannot be added in place: changing generateSecret REPLACES the client, so it gets a new client ID. Plan that cutover: config, sessions and refresh tokens issued to the old client, the deploy order, and rollback. A credentialed staging step goes to the founder's list with exact steps. The screening-capacity watched paths: the auth files are watched; the repository is public, so the gate can pass.
Rules: read only, except the files your task names. Every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:$PATH. No model identifier in any file. Scratch under ${SP}.`
const SAVE = (f, what) => `Save as you go: keep ${SP}/progress/${f} up to date (${what}); continue from it if it exists.`
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, sound: { type: 'string' } }, required: ['findings', 'sound'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, correctedFix: { type: 'string' } }, required: ['real', 'reason'] }

phase('Scout')
const SCOUTS = [
  { key: 'infra', task: `INFRA AND IAM: read infra/lib (the identity construct, the web stack, its role and policies, the secrets and parameters it already uses and how the web app reads them at runtime), infra/test (the IAM pin tests, snapshot or assertion tests), the CDK version in use (aws-cdk-lib 2.275) and how UserPoolClient generateSecret, the Secrets Manager client secret (UserPoolClient.userPoolClientSecret), and AccountRecovery behave. Also: what replacing the client does to the stack outputs and to whoever reads the client ID, the deploy runbooks, how cdk:diff and synth are run here, and whether the client ID sits in any env, parameter or test. Give exact file:line for every place that changes.` },
  { key: 'provider', task: `THE PROVIDER: read apps/web/src/lib/auth/cognito-provider.ts and every Cognito call in apps/web (InitiateAuth, RespondToAuthChallenge, ForgotPassword, ConfirmForgotPassword, RevokeToken, GlobalSignOut, AssociateSoftwareToken, VerifySoftwareToken, SetUserMFAPreference, ChangePassword, GetTokensFromRefreshToken or REFRESH_TOKEN_AUTH, any other) and which of them take SecretHash or ClientSecret. HMAC-SHA256 of username plus client id, keyed with the client secret, base64; note which username form each call needs, and that REFRESH_TOKEN_AUTH uses the sub or user name in SECRET_HASH. Also: how the app reads configuration (the env validation for the web), where the secret would be loaded and cached, how errors map, the dev twin (dev-provider.ts) and what mirroring SecretHash means there, and the tests to extend. Give file:line for each.` },
  { key: 'takeover', task: `THE TAKEOVER PATH, P-3 and R-11: trace every route by which a CONFIRMED Cognito user with no factor can reach MFA_SETUP and enrol a factor: the app's own path after a reset, an admin-created user (FORCE_CHANGE_PASSWORD and invitations), a factor cleared by support (UX PR 65's future path), and the pool's MFA configuration (ON or OPTIONAL). Which closes with a confidential client alone, and which needs more: a pre-token or pre-auth Lambda, invitation-only enrolment bound to a server-sealed step, the app's refusal of MFA_SETUP outside the invitation flow, or account state in Postgres (read the users and invitations schema; no migration unless unavoidable). For P-3: what Cognito documents about the per-code attempt limit and expiry for ForgotPassword codes, and how to show it (a staging check with exact steps for the founder). For R-11: the logs and metrics that exist (the log fields of password_reset_requested and of "password reset request failed", the observability package, any metric filters and alarms in infra), and the smallest alarm design (CloudWatch metric filters on the web log group plus alarms to the existing alerts topic).` },
]
const scouts = await parallel(SCOUTS.map(s => () => agent(`${COMMON}

You are the ${s.key.toUpperCase()} SCOUT. ${s.task}
Write ${SP}/scout-${s.key}.md and return it.
${SAVE(`scout-${s.key}.progress.md`, 'what you read and found')}`, { label: `scout:${s.key}`, phase: 'Scout' })))

phase('Write')
const design = await agent(`${COMMON}

You WRITE the design ${DESIGN} (new file). The scouts:
${scouts.filter(Boolean).join('\n\n=====\n\n')}
Sections:
1. Threat and scope: what is closed, what is left, and why.
2. The confidential client: the CDK change, the secret's storage and read path, least-privilege IAM, rotation, and the cutover plan for the client replacement (deploy order, live sessions and refresh tokens, rollback).
3. SecretHash in the provider: each call, the username form, caching, errors, and the dev twin.
4. The MFA_SETUP takeover: every route and how each is closed.
5. P-3: what can be shown in CI, and the founder's staging check with exact steps.
6. R-11 alarms, if they fit; otherwise why not, and a proposal.
7. ADR 0088 text, or the ADR 0081 amendment.
8. Tests: unit, db, infra assertions and IAM pins, e2e if needed, and the rows SEC-20 to SEC-23 in test-matrix style.
9. Slices for the builders, in order, each with its failing-first test.
10. The founder's list: the credentialed staging steps, exact.
11. Risks and open questions, each with a recommended answer (take the safer option).
Keep it tight.
${SAVE('write.progress.md', 'sections written')}
Return a summary.`, { label: 'write', phase: 'Write' })

phase('Review')
const LENSES = [
  { key: 'security', focus: 'SECURITY at design: does the design actually close direct calls (every Cognito operation a public caller could use with only the client ID: SignUp if enabled, InitiateAuth flows, ForgotPassword, ConfirmForgotPassword, ResendConfirmationCode, RevokeToken, GetUser and other token-authorised calls that do not need SecretHash)? Secret exposure (env, logs, the bundle, error messages, Lambda, the dev twin), least privilege, rotation, the MFA_SETUP routes, enumeration through new errors, and the cutover window.' },
  { key: 'infra-auth', focus: 'INFRA AND AUTH CORRECTNESS at design: CDK semantics (client replacement, outputs, cross-stack references, the secret value as a token, Secrets Manager vs the client\'s own secret), deploy order and rollback, the IAM pin tests, cdk:diff, SecretHash correctness per call (the username form, REFRESH_TOKEN_AUTH and the sub), clock and caching, the dev twin\'s fidelity, the alarms\' metric filters matching the real log fields, and the cost to serve.' },
]
const reviews = await parallel(LENSES.map(l => () => agent(`${COMMON}

You are the ${l.key.toUpperCase()} REVIEWER of the design ${DESIGN} (read it whole, and the code it cites). Focus: ${l.focus}
Findings B/S/N with where, scenario, evidence and fix; "sound" lists what holds. You MUST finish by calling StructuredOutput.
${SAVE(`review-${l.key}.progress.md`, 'findings')}`, { label: `review:${l.key}`, phase: 'Review', schema: FINDINGS }).then(r => r ? { ...r, lens: l.key } : null)))
const failed = LENSES.filter((l, i) => !reviews[i]).map(l => l.key)
const all = reviews.filter(Boolean).flatMap(r => r.findings.map(f => ({ ...f, id: `${r.lens}-${f.id}` })))
const judged = await parallel(all.map(f => () => (f.severity === 'N' ? Promise.resolve({ ...f, verdict: { real: true, reason: 'nit' } }) : agent(`${COMMON}

Try to REFUTE this design finding on ${DESIGN}. It is real only if you confirm it against the design and the code; give correctedFix if its fix is wrong. You MUST finish by calling StructuredOutput.
${JSON.stringify(f, null, 1)}`, { label: `skeptic:${f.id}`, phase: 'Review', schema: VERDICT }).then(v => ({ ...f, verdict: v })))))
const confirmed = judged.filter(Boolean).filter(f => f.verdict && f.verdict.real)
log(`design reviews: ${all.length} findings, ${confirmed.length} confirmed; failed lenses: ${failed.join(',') || 'none'}`)

phase('Fold')
const fold = await agent(`${COMMON}

FOLD the confirmed findings into ${DESIGN}, using correctedFix where one is given.
${JSON.stringify(confirmed, null, 1)}
Refuted: ${JSON.stringify(judged.filter(Boolean).filter(f => !(f.verdict && f.verdict.real)).map(f => ({ id: f.id, title: f.title, why: f.verdict && f.verdict.reason })))}
Review lenses that failed to report: ${failed.join(', ') || 'none'} (if any did, say so at the top of the review record; the session decides on a re-run).
Write the review record /home/user/ops/designs/lane-a-cognito-confidential-client-review.md, and copy the scouts to /home/user/ops/designs/lane-a-cognito-confidential-client/scout-*.md. Do not commit.
${SAVE('fold.progress.md', 'findings applied')}
Return the final summary, each finding's disposition, whether ADR 0088 is used, the founder's steps, and any open question that needs a person (with the recommended answer).`, { label: 'fold', phase: 'Fold' })
return { failed, findings: all.length, confirmed: confirmed.map(f => `${f.id} ${f.severity} ${f.title}`), fold }
