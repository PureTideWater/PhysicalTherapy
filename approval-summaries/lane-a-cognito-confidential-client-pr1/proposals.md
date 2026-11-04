# Proposals from opening PR 1 (co-001/cognito-confidential-client)

- **N-6 (for PR 2's runbook):** a pending credential probe answers 200 on `/api/health`, so a task whose probe will
  refuse is kept unhealthy only by the ALB's `healthyThresholdCount: 2` (`infra/lib/constructs/edge.ts:148`) and the
  5 s probe timeout. PR 2's cutover/rollback runbook should state that dependency, and a test in PR 2 could pin the
  threshold at 2 or more alongside D8.
- **N-4 (design text):** design section 9 says the invite routes are capacity-watched; the generated
  `tools/screening-capacity/watched-paths.txt` does not list `apps/web/src/lib/routes/console.ts` or `settings.ts`.
  Correct the design sentence on claude/build-ops; nothing to change in code (the list is generated).
