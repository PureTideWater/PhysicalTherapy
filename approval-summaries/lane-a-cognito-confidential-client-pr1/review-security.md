# Security review of #113 at 1234a47c (base c4941291): findings and dispositions

The reviewer read every changed auth, route, config, infra and runbook file, read-only. Verdict: 1 S and 7 N, all
confirmed by the skeptic. Nothing was refuted. The full "sound" list is in the fix round's input.

| ID | Finding | Disposition |
| --- | --- | --- |
| S1 | The enrolment rule read `!invitation_expired()`, which is false for an invited user with no invitation row, so that user could enrol TOTP with no time limit | Fixed, red first, with the skeptic's corrected fix and no migration: a positive `invitationLive()` read as the invitee under the existing SELECT policies (`28899a94`). The seed now records each invited persona's invitation (`f84c9b4e`). ADR 0088 D3, the SEC-22 row and its fixture were updated |
| N1 | The setup was audited and the session opened on the token's sub, with no comparison to the approved subject | Fixed, red first (`ba6da231`): a different sub releases the grant, logs the refusal and answers `enrolment_not_open` |
| N2 | A new password was stored before any rule ran, for an orphan or a lapsed invitee | Fixed, red first (`13013800`): checked before the step is sealed and again before `setNewPassword` |
| N3 | Check-then-act gap on D4 linking; the resend swallowed UnsupportedUserStateException | Fixed, red first (`f7342c45`): `resendInvitation` answers whether it sent, and both linking paths refuse and roll back when it did not |
| N4 | The placeholder refusal matched only the literal `unset` | Fixed, red first (`4055b39d`): a JSON-shaped value or one naming `clientSecret` is refused, by the setting's name |
| N5 | The classifier rests on unverified texts, and a miss would lock real accounts | Fixed in PR 1, red first (`18a55ea1`): the pattern is widened (any NotAuthorizedException naming a secret or the client; RevokeToken keeps the narrow words), and ADR 0088 makes both mismatch texts a staging gate before N+1. The probe's positive control goes to PR 2, since the probe only runs once a secret is set (proposals.md) |
| N6 | Re-registering a cleared hardware key falls outside D3's sentence | Docs (`39fb980a`): D3 is narrowed to the TOTP factor; the path is recorded under Not covered and handed to UX PR 65 |
| N7 | The public `/api/health` named `credential_refused` | Fixed, red first (`7ccdede9`): the body is the generic `{ status: 'unavailable' }` |
