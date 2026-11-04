# Proposals from opening PR 1 (co-001/cognito-confidential-client)

- **N-6 (for PR 2's runbook):** a pending credential probe answers 200 on `/api/health`, so a task whose probe will
  refuse is kept unhealthy only by the ALB's `healthyThresholdCount: 2` (`infra/lib/constructs/edge.ts:148`) and the
  5 s probe timeout. PR 2's cutover/rollback runbook should state that dependency, and a test in PR 2 could pin the
  threshold at 2 or more alongside D8.
- **N-4 (design text):** design section 9 says the invite routes are capacity-watched; the generated
  `tools/screening-capacity/watched-paths.txt` does not list `apps/web/src/lib/routes/console.ts` or `settings.ts`.
  Correct the design sentence on claude/build-ops; nothing to change in code (the list is generated).

# Proposals from #113's fix round (2026-11-04)

- **infra-auth-IA-4 (PR 2):** the seeding function `Custom::WebClientSecret` reads `DescribeUserPoolClient`. Hide its
  request and response data from its logs (`Logging.withDataHidden()` or no SDK debug logging) and pin that in a test.
  Then either deny the staging diff role `logs:GetLogEvents`, `logs:FilterLogEvents` and `logs:StartQuery` on that
  function's log group, or keep the group under a key the role cannot decrypt. Record both in ADR 0088 D1's custody list.
- **security-N5, positive control (PR 2):** the probe runs only once a secret is set, which is release N+1. So the
  probe's known-wrong-hash control request is PR 2's: on start, a second InitiateAuth with a deliberately wrong
  SECRET_HASH must be classified as a client-credential refusal. If it is not, log `cognito probe control unmatched` at
  error and alarm on it. PR 1 widened the classifier to any NotAuthorizedException naming a secret or the client (except
  RevokeToken), and ADR 0088 lists the texts for both mismatch directions as a staging gate before N+1.
