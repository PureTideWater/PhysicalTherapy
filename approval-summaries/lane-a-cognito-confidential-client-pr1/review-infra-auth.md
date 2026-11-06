# Infra and auth review of #113 at 1234a47c (base c4941291): findings and dispositions

The reviewer synthesized all six stacks at head and base in a fresh clone. The tests passed: 235 auth unit tests and
the infra tests. Verdict: 1 S and 3 N, all confirmed by the skeptic. Nothing was refuted.

| ID | Finding | Disposition |
| --- | --- | --- |
| IA-1 | `beginKeySignIn` ignored USER_ID_FOR_SRP and fell back to the typed email, so with a secret set, every key sign-in would be refused for the credential | Fixed, red first (`135043b7`). The challenge takes `n = USERNAME ?? USER_ID_FOR_SRP`, and the twin now holds Cognito's name for each Session. A WEB_AUTHN case with USER_ID_FOR_SRP alone asserts the hash over the internal name. The WEB_AUTHN name is under Not verified here, and is a staging gate before N+1 |
| IA-2 | No metric counted the probe's refusal | Fixed, red first (`5f80c5ce`): a new filter and alarm, `ClientCredentialProbeRefused`, at 1 in 5 minutes, pinned by literal and source-contract tests |
| IA-3 | The D4 IAM pin matched only literal actions and skipped NotAction and managed policies | Fixed (`aac3937d`): actions are read as IAM globs, any Allow with NotAction fails, and managed policies are pinned to ReadOnlyAccess and AWSLambdaBasicExecutionRole across the environment's stacks. The new matcher assertions fail on the old matcher |
| IA-4 | The diff role can still read the log groups that N+1's seeding function will write to | A PR 2 matter, recorded in proposals.md: hide the function's data from its logs and test that; deny the role the log reads on that group, or put the group under a key the role cannot decrypt; record this in D1's custody list |
