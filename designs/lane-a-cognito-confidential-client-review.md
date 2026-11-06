# Review record: lane-a-cognito-confidential-client design

Design: `/home/user/ops/designs/lane-a-cognito-confidential-client.md` (folded 2026-11-04). Item `co-001/cognito-confidential-client`,
worktree `/home/user/cognito-cc`, base 45d7d0c1, no commits. Scouts: `lane-a-cognito-confidential-client/scout-infra.md`,
`scout-provider.md`, `scout-takeover.md`. Pre-fold copy of the design: the item scratchpad's `design.before-fold.md`.

Lenses: **security** and **infra-auth**. Both reported. No lens failed to report.

Totals: 23 findings raised. 21 confirmed (2 B, 9 S, 10 N), all folded. 2 refuted (security-S3, infra-auth-IA-8). Where a
verdict gave a correctedFix, that fix was applied. The text below each ID names where it landed in the design.

## Confirmed and folded

| ID | Sev | Finding | Disposition and where |
| --- | --- | --- | --- |
| security-B1 | B | Second read path: `DescribeUserPoolClient` returns the secret, and the staging diff role holds it via ReadOnlyAccess | Folded (correctedFix). `DENIED_CONTENT_READS` gains `DescribeUserPoolClient` and `ListUserPoolClientSecrets`, with a literal pin; template-wide custody assertion; account-level guard as Not covered + F5; F3 2(e). Scenario corrected: needs a same-repository branch, since fork PRs get no id-token. 2.3, 7.1 D1/Not covered, 8.3, 8.5 SEC-21, 9 slice 3b, 10 F3/F5, 11 Q16 |
| infra-auth-IA-1 | B | Rotation function cannot be wired as designed; default wiring rotates at deploy and races the custom resource | Folded (correctedFix, using IA-2 option (b)): one hand-built `CfnRotationSchedule`, no RotationRules, `RotateImmediatelyOnUpdate` false, depends on `Custom::WebClientSecret` and the permission; "no rotation schedule" wording replaced; F3 steps 1 and 8. 2.4, 8.3, 10 |
| security-S1 | S | Rotation needs a RotationSchedule; defaults rotate at cutover; unscoped invoke allows a confused deputy | Folded (correctedFix): (a) as IA-1; (b) one `CfnPermission` with SourceArn + SourceAccount, pinned as the only one besides the provider's; (c) handler refuses a foreign SecretId first, then checks the token; tests. 2.2, 2.4, 8.3 |
| security-S2 | S | Enrolment rule looks the account up by the typed email, not the enrolling Cognito subject | Folded (correctedFix): provider-neutral `subject` from USERNAME/USER_ID_FOR_SRP only, no email fallback; sealed; rule applied to the row by sub with email and email-only lookup matching; `sign_in_account` OR/LIMIT 1 not relied on; twin exposes the id; SEC-22 cases (a)-(c). 3.4, 4.1, 7.1 D3, 8.1, 8.2, 8.5 |
| security-S4 | S | Replaced or regenerated secret leaves the placeholder as AWSCURRENT with no health signal | Folded (correctedFix): literal value, no generator, pinned; `SeedVersion`; ensure on SecretArn/SeedVersion change with the four-case rule; web service depends on the CR; handler tests. Step 6 (start-up check) is IA-6's probe. 2.1, 2.2, 7.1 D8, 8.3 |
| infra-auth-IA-2 | S | Custodian role pin omits what rotation needs and contradicts what CDK adds | Folded (correctedFix, option (b)): `AddUserPoolClientSecret` without ClientSecret; no `GetRandomPassword`; `kms:EncryptionContext:SecretARN`; encryption.test count. 2.2, 2.4, 8.3 |
| infra-auth-IA-3 | S | Create puts the unverified `ListUserPoolClientSecrets` on the cutover's critical path | Folded (correctedFix): Create = Describe + Put `{clientSecret}` only; rotation writes the ID back, deletes the later-created orphan (never the oldest), stops when ambiguous; SDK/action-name check is a gate before production N+1 (F3 step 4); 2.2, 2.4 last bullet, risk 10 rewritten. |
| infra-auth-IA-4 | S | A physical ID does not make a property change a replacement | Folded (correctedFix): Update on changed ClientId runs Create and returns the new PhysicalResourceId; rollback Update path; public client fails loudly; tests. 2.2, 8.3 |
| infra-auth-IA-5 | S | Placeholder can silently overwrite the real secret on a later deploy | Folded (correctedFix (a)-(e)): marker literal, exact pins, config refuses the marker, `SeedVersion` (d), runbook diff rule (e). 2.1, 2.2, 3.2, 8.1, 8.3 |
| infra-auth-IA-6 | S | Wrong or missing credential caught by nothing that can roll back the deploy | Folded (correctedFix): once-per-process start-up probe, fails only on a positive refusal, `/api/health` 503 on it (ADR 0055 note); rotation recovery by moving AWSCURRENT back to AWSPREVIOUS; tests; F1 step 6, F2 step 10; ADR 0088 D8. 2.4, 2.5, 7.1, 8.1, 10 |
| infra-auth-IA-7 | S | F3's custody proof passes without testing the resource-policy deny | Folded (correctedFix): `simulate-custom-policy` with `--resource-policy`, an IAM-user caller and `aws:PrincipalArn` context; allowed checks for the two exceptions; identity-side check kept; no temporary role. 10 F3 step 2 |
| security-N1 | N | Caller-generated secret in AddUserPoolClientSecret's request may be in CloudTrail | Folded: Cognito generates the value; F3 step 6 checks request and response. 2.4, 10 |
| security-N2 | N | Runbook's `admin-delete-user` with the operator role cannot run | Folded: the founder's break-glass session; the operator-role grant recorded as the alternative. 4.3, 7.1 D4, 11 Q14 |
| security-N3 | N | Windows where direct calls stay open presented as routine | Folded: ADR 0088 Consequences and the rollback paragraph call both security regressions needing a ruling; N+1 within 7 days of N and before the first customer user; F1 step 5 kept and extended. 2.5, 7.1, 9, 11 Q15 |
| security-N4 | N | Client allows every attribute write and SRP | Folded: empty `writeAttributes`, `authFlows { user: true }`, pinned, in the diff expectation. 2.1, 2.5, 8.3 |
| security-N5 | N | Error text and serialisation not all guarded | Folded: fixed-text handler errors with a Reason test; `ClientSecret` wrapper with redacting `toJSON`/`toString`/inspect and a test. 2.2, 2.3, 8.1, 8.3 |
| security-N6 | N | Rotation without the redeploy deletes the secret running tasks hold | Folded with IA-10's deletion guard (enforced, not only a runbook note); runbook says what a refusal means; F3 step 7. 2.4, 10 |
| infra-auth-IA-9 | N | RevokeToken's credential failure is probably UnauthorizedException | Folded: classifier counts it for RevokeToken; provider test; F1 step 7 records the code. 3.3, 8.1, 10 |
| infra-auth-IA-10 | N | Rotation relies on the operator not to delete a live value | Folded: read-only `ecs:DescribeServices` on the web service (ARN from fixed names, so no cycle); deletion guard; idempotent createSecret. 2.2, 2.4, 8.3, 10 F3 step 7 |
| infra-auth-IA-11 | N | Resource-policy deny covers reads only | Folded: write deny (Put, Update, UpdateVersionStage, Rotate) except the custodian, plus the rotation caller for RotateSecret. 2.3, 8.3, 11 Q13 |
| infra-auth-IA-12 | N | The PR 2 diff exists only with staging credentials | Folded: the builder quotes a synth-template comparison against the base; F1 step 1 is the gate. 2.5, 9 |
| infra-auth-IA-13 | N | Retained named log groups make a failed cutover retry manual | Folded: names kept; exact delete/import commands per group in the runbook paragraph; F1 step 8 records it. 2.5, 10 |

## Reconciliations (two findings, one text)

- **Initial secret value.** S4 proposed `{}`, IA-5 a marker `{"clientSecret":"unset","clientSecretId":"unset"}`. Chosen:
  the marker, so `readWebConfig` refuses it with a clear cause instead of an ECS key-extraction failure at task start.
- **Rotation schedule construct.** IA-1 and S1 wrote it with CDK's `RotationSchedule`, and IA-2 recommended its option (a)
  (CDK's construct plus an escape hatch). Chosen: IA-2 option (b), a hand-built `CfnRotationSchedule` with an explicit
  scoped `CfnPermission`. It is the only form that meets S1's SourceArn/SourceAccount scoping and 2.2's exact role and
  key pins without escape hatches over CDK internals. All of IA-1's and S1's pinned properties hold. Consequence: no
  `denyAccountRootDelete` statement and no CDK key grant, so the resource-policy and key-policy pins stay at the design's
  own statements.
- **Create path vs. ensure.** IA-3 takes `ListUserPoolClientSecrets` off Create. S4's ensure-Update and IA-4's
  changed-ClientId Update do not reintroduce it on the first cutover: the changed-ClientId path runs the IA-3 Create path
  (Describe + Put), and only the SecretArn/SeedVersion ensure uses List, which never runs on the first cutover and runs
  after the F3 step 4 gate.
- **Redeploy enforcement.** N6 (runbook note, optional age check) and IA-10 (DescribeServices guard) are folded as one
  enforced guard.

## Refuted

- **security-S3** (invitation premise false after an operator password reset). Not reachable in this code base. Both
  linking paths run only with no app row for the email. No code, grant or runbook calls `AdminSetUserPassword` or
  `AdminResetUserPassword`. A RESEND voids the old temporary password, so the outcome is a lockout, not a takeover.
  Editorial fix taken anyway: 4.3's parenthetical was wrong as a general Cognito statement. It is reworded, ADR 0088 D4
  states the premise exactly, and the template-wide assertion pins that no role holds those two actions.
- **infra-auth-IA-8** (the config reset alarm pages on ordinary states). `requestPasswordReset` reaches Cognito only for
  an active, enrolled app account, so the codes the alarm watches show drift or a mail fault. Both are worth a page. The
  alarm is unchanged.

## Corrections to the review's own fixes (recorded in the verdicts, applied)

- B1: deny `ListUserPoolClientSecrets` too. The attacker needs a same-repository branch.
- S2: `sign_in_account(email, sub)` does not prove both values match the same row. The app checks both.
- S4 / IA-5: an AWSCURRENT check on Update never runs for an in-place regeneration. `SeedVersion` is what triggers it.
- IA-3: never delete the oldest secret. Delete the one created later than AWSCURRENT.
- IA-6: no workflow step can run before cleanup. The gate is the probe through the circuit breaker.
- IA-7: `--caller-arn` must be an IAM user, and the condition needs `--context-entries`. Uses `simulate-custom-policy`.

## Open questions for a person (recommended answers in design section 11)

- Q13: who may start a rotation (the `RotateSecret` exception). Recommended: the founder's break-glass role only.
- Q14: who runs `admin-delete-user` for a stuck invitee. Recommended: the founder's break-glass session.
- Q15: the N to N+1 window. Recommended: 7 days, and before the first customer user is invited.
- Q16: an account-level guard on `DescribeUserPoolClient`. Recommended: an SCP, production at least (F5).

No migration was introduced by the fold. ADR 0088 remains the vehicle, with D8 added.
