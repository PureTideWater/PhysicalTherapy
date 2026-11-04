# Adversarial check: PR 1 of co-001/cognito-confidential-client

I checked head `8f29abf7` in `/home/user/cognito-cc` (`45d7d0c1..HEAD`, 21 commits, 40 files) against the design
(`/home/user/ops/designs/lane-a-cognito-confidential-client.md`, read in full). I made no commit, and the tree is
clean. I ran the mutations in two scratch worktrees (removed afterwards), each test run under
`flock /tmp/laneb-heavy.lock`.

## Verdict summary

- **B (blocking): none.**
- **S (should fix before the PR is opened): 2.**
  - S-1: the Settings invitation route has a new refusal whose words differ from every other refusal there.
  - S-2: the enrolment rule assumes Cognito's challenge USERNAME is the stored `cognito_sub`. That assumption is not
    verified, is not listed in the ADR, and the rule is live in release N.
- **N (notes): 6.**

## Mutation results (each guard broken in a scratch copy, then the tests run)

The web suite is `apps/web/src/lib/auth/**`, the four `*-routes.db.test.ts` files and `http.test.ts`, 275 tests. The
baseline passed 275/275. The infra suite is `pull-request-diff-role.test.ts` and `monitoring.test.ts`, 91 tests.

| Guard | Mutations | Result |
| --- | --- | --- |
| The enrolment rule: `status = invited`, `mfa_enrolled`, `locked`, `invitation_expired` | M01 to M04 | each killed |
| The rule skipped in `after()`, at `beginTotpSetup` and at `completeTotpSetup` | M10, M11, M12 | each killed |
| Subject: the provider falls back to the email; the twin drops the subject; the carry-over through a new password is dropped | M13, M14, M48 | each killed |
| Sub match: one check dropped at a time (email equality M05, the email-only lookup M06, the `cognito_sub` check M07, lookup by email M08, the missing-subject check M09) | M05 to M09 | survived, as equivalent mutants: each check is backed by another. M05 and M06 imply each other. M07 is true by construction. With M08, M07 still rejects. With M09, `bySub` is already undefined |
| Sub match: both of a redundant pair dropped together | C01 (M05+M06), C02 (M07+M08) | both killed, by the security-S2 test |
| The invitation rule in Settings and the console; Cognito and twin `neverSignedIn`; the resend in each route | M15 to M20 | each killed |
| The hash: arguments swapped; the challenge hash over the email; the hash before the spread; a hash sent without a secret; ForgotPassword or ConfirmForgotPassword hash dropped; RevokeToken secret dropped | M21 to M27 | each killed |
| The classifier: revoke's `UnauthorizedException`; the words; any `NotAuthorized`; ordering in signIn, respond, beginKeySignIn and the reset request | M28 to M32, M49, M50 | each killed |
| The flow guard; `release()` swallowing the credential error or rethrowing everything; `identity()`'s revoke | M33 to M35, M46 | each killed |
| The probe misses the classifier, refuses on throttling, the health route ignores it, or the probe is skipped with a secret set | M36 to M38, M45 | each killed |
| The wrapper's `toJSON` or `inspect` leaks; config accepts the marker or a secret with the dev provider | M39 to M42 | each killed |
| The per-user reset log line or the enrolment log line dropped | M43, M44 | each killed |
| `parseChallenge` accepts a non-string `n` | M47 | survived (N-5) |
| The diff role's deny drops either Cognito action | I01, I02 | killed by the literal test |
| An alarm or the per-user alarm loses the topic; a message drifts in the app; the `error_code` field drifts; the rule key or the app's `user_id` key drifts | I03 to I05, I06b, I07 to I09 | each killed |

The per-mutation logs are `logs/check-mut-*.log` and `logs/check-imut-*.log`. The tables are
`logs/check-mutations.tsv` and `logs/check-infra-mutations.tsv`.

## The questions asked

- **Enrolment rule.** I found no way to reach a factor through the app for any of these:
  - an active account with no factor;
  - an account the row calls enrolled whose Cognito factor was cleared;
  - an orphan;
  - a lapsed invitation, at the challenge or after the step was sealed;
  - a locked, disabled, activated or enrolled account, changed between steps;
  - a different subject for the same email;
  - a challenge with no subject;
  - email and sub rows that belong to different people;
  - a swapped sealed subject.

  `sign-in.db.test.ts` covers each of these, and C01 and C02 show the redundant checks are load-bearing together. The
  rule runs before `AssociateSoftwareToken` and before `VerifySoftwareToken`. `VerifySoftwareToken` is the call where
  Cognito stores the factor (`cognito-provider.ts` completeTotpSetup). A live invitation still enrols end to end: the
  test enrols with the address typed in upper case, and the onboarding, sign-in and hardware-key e2e passed at
  integration.
- **Invitation rule.** It cannot re-invite onto a Cognito user that has signed in. Any status other than
  `FORCE_CHANGE_PASSWORD` is refused, and so is a missing status (provider test at :378). No role holds
  `AdminSetUserPassword` or `AdminResetUserPassword` (`USER_POOL_ADMIN_ACTIONS`, application-role.ts:14), but nothing
  pins that in PR 1 (N-1).
- **SecretHash.**
  - I recomputed both known-answer vectors independently in Python, and they match the design and the test.
  - Usernames: the typed email on InitiateAuth and on the reset calls; `opened.u` on RespondToAuthChallenge, set after
    the spread (M23).
  - With no secret, nothing is sent (M24).
  - The value lives in a `#private` field and shows as `[redacted]` to JSON, String and inspect (M39, M40). It is in no
    challenge, grant or log line (provider test :553). It is not in the `ConfigError` (http.test).
  - A credential refusal is classified before REJECTED, WRONG_CODE, STALE and the reset sets (M29 to M32, M49, M50). It
    never counts a failure or locks the account (sign-in.db SEC-20; sign-in-routes SEC-20).
- **Diff-role deny.** The deny is a literal list, pinned by a literal array (I01, I02). Within ReadOnlyAccess it covers
  every read that returns this client's secret. It does not cover a federated IdP's own secret (N-3).
- **R-11.**
  - The filters use `$.msg` and `$.error_code`, which are the field names the logger writes (the db tests show
    `{level,msg,time,user_id,request_id}`). The monitoring test reads the exact call strings from the app source.
  - Every alarm, the per-user alarm included, has `AlarmActions: [operator topic]`.
  - The insight rule keys on `$.user_id` with no metric dimension.
- **Enumeration.** `enrolment_not_open` appears only after Cognito accepted the password, and `client_credential` is
  the same for everyone. The Settings invitation refusal is a new oracle (S-1).
- **The words.** `lint:copy` passed. The enrolment words are the ones the design proposed (pending UX review, as the
  design says). The credential words reuse the existing "Sign-in could not continue. Start again."
- **ADR 0088 and the code.** They agree on D2, D3, D4, D7 and D8 and on every "As built" item, checked line by line,
  with two exceptions: the gap in Not verified (S-2) and D4's unpinned premise (N-1).
- **SEC-20 to SEC-23 and the tests.** The PR 1 halves of the rows are each asserted, and the registry `assertedBy`
  files exist and hold the cases. The SEC-20 and SEC-21 rows also state release N+1 facts (N-2).

## Findings

### S-1: the Settings invitation route has a new refusal with words of its own, which lets an organization learn about an address

- **Where:** `apps/web/src/lib/routes/settings.ts:1008-1010`, which throws `ANOTHER_IDENTITY`; asserted in
  `onboarding-routes.db.test.ts` ("refuses a provider account that has signed in").
- **The problem:** Until now this handler refused every address it would not invite with one answer, `EMAIL_IN_USE`.
  Its docstring says why: "the screen says the same for every such address, so it never tells an organization that
  another one knows a person". The new refusal uses different words, "this email belongs to another identity; ask an
  engineer to reconcile it", and it comes after an `AdminGetUser` call.
- **The effect:** A customer `practice_admin` who types an address can now tell whether the address has no app account
  but does have a Cognito user that has signed in. Such orphans come from:
  - another organization's invitation that rolled back after `ensureUser` (the 23505 race at :1018);
  - the console's mismatched-sub path, which creates a Cognito user before it refuses;
  - an invitee who set a password on an orphan.

  Each of these is evidence that someone else, usually another organization, tried to invite this person. Design 4.3
  chose the console's words for both routes and did not weigh the Settings route's single-answer rule.
- **Fix:** In `settings.ts`, throw `EMAIL_IN_USE` for `!ensured.created && !ensured.neverSignedIn`. The platform
  administrator who then adds the person through the console gets `ANOTHER_IDENTITY`, and the support-mail runbook
  already covers that.
  - Update the onboarding-routes test to expect `EMAIL_IN_USE`.
  - In ADR 0088 D4, write that Settings answers as for any address in use and the console names the other identity.
  - In `support-mail.md`, under "An invitation answered 'this email belongs to another identity'", say that the console
    says it and Settings answers "cannot be invited from here".

  No migration is needed.

### S-2: the enrolment rule rests on an unverified Cognito premise, the ADR does not list it, and the rule is live in release N

- **Where:**
  - `cognito-provider.ts` `next()`: `n = ChallengeParameters.USERNAME ?? USER_ID_FOR_SRP ?? named`.
  - `sign-in.ts` `enrolment()`: `account({ sub: subject })` with `bySub.cognito_sub === subject`.
  - ADR 0088 "Not verified here".
- **The premise:** The rule needs two things from Cognito.
  - Under `USER_AUTH`, either the `NEW_PASSWORD_REQUIRED` step or the `MFA_SETUP` step carries `USERNAME` or
    `USER_ID_FOR_SRP`.
  - That value is identical to the `sub` attribute that `ensureUser` stores as `user.cognito_sub`.

  The scout (`scout-provider.md:6`) asserts the second point, but neither the design nor the ADR marks it VERIFY, and
  every test uses the twin or a scripted mock.
- **The effect:** If either point is wrong, every invitee is refused `enrolment_not_open`, which fails safe but
  completely. The SecondFactorEnrolmentRefused alarm fires on each refusal. This happens in release N, which goes to
  production ahead of N+1, and the founder's list has no explicit release-N check of an invitation through real Cognito.
  Its precondition says the smoke account is "created through the app's invite flow" but does not say on which
  release.
- **Fix (docs only):**
  - Add to ADR 0088's Not verified: "that Cognito names the enrolling user (USERNAME or USER_ID_FOR_SRP) on
    `NEW_PASSWORD_REQUIRED` or `MFA_SETUP` under `USER_AUTH`, and that the name is the user's `sub`".
  - Add a founder step before release N reaches production: on staging running release N, invite a synthetic account,
    set the password, enrol TOTP, and sign in. Expect `signed_in` and no `security event: second-factor enrolment
    refused`.
  - Record the result in the status file and on the PR body's founder list. If it fails, release N must not go to
    production until the subject source is corrected.

### N-1: D4's premise is not pinned in PR 1

ADR 0088 D4 rests on "no role holds `AdminSetUserPassword`/`AdminResetUserPassword`". The literal pin is scheduled with
PR 2's template-wide custody assertion (design 8.3), but D4 ships in PR 1. Today's grant list
(`application-role.ts:14`) is correct.

**Fix:** a two-line literal test in `infra/test/application-role.test.ts` now: `USER_POOL_ADMIN_ACTIONS` equals the
literal three actions, and no statement in the synthesized stack names either action or `cognito-idp:Admin*` or
`cognito-idp:*`. Alternatively, record in ADR 0088 that the pin arrives with N+1.

### N-2: the SEC-20 and SEC-21 rows assert release N+1 facts as if they held now

Examples are "The web client is confidential…" and the resource policy. The provenance paragraph after the rows
explains the split, and the registry lists only PR 1's tests.

**Optional fix:** mark the N+1 clauses "(release N+1)" inside the rows. That needs a regeneration through `pnpm synth`,
since the matrix text feeds `fixtures/synthetic/SEC-2x/expected.json`.

### N-3: the diff-role deny covers this client's secret only

ReadOnlyAccess also allows `cognito-idp:DescribeIdentityProvider` and `GetIdentityProviderByIdentifier`, which return a
federated IdP's `client_secret` in `ProviderDetails`. The pool has no federated IdP today, so this is out of scope.

**Fix:** a "Revisit when a federated IdP is added" line in ADR 0088.

### N-4: the design's "invite routes are watched" is not true of the generated list

`console.ts` and `settings.ts` are not in `watched-paths.txt`. The list is generated by `watched.ts --write`, which gave
no diff. The design sentence (section 9) is inaccurate. Nothing to fix in code; a PR-body sentence is enough.

### N-5: M47 survived

`parseChallenge` no longer checking that `n` is a string goes undetected. The challenge is sealed server-side, so
nothing can forge it.

**Optional fix:** one provider test feeding a challenge with a non-string `n`, expecting `expired`.

### N-6: a pending probe answers 200

The first health check after start reads the probe as pending and passes. The ALB's `healthyThresholdCount: 2`
(`infra/lib/constructs/edge.ts:148`) and the 5 s probe timeout mean a refusal still keeps the task from turning healthy.
This matches D8. The PR 2 runbook could state the dependency on that threshold.

## Not found

I found nothing else against the design in the PR 1 scope:
- no migration;
- no PHI, address or secret in any new log line (`lint:logs` passed, and the enrolment refusal logs IDs only);
- each mutation path keeps its role checks and audit;
- no model identifier.

VERDICT: defects
