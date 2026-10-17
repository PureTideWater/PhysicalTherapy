# Key rotation

Trigger: yearly, or at once on suspicion that a key or a secret was exposed (PRD 19 Runbooks; PRD 16 Secrets). Never
paste a key, a password or a secret value into a ticket, a log, a commit or a session.

## The environment key (KMS)

The stack's customer-managed key (`EnvironmentKeyArn`) rotates its key material every 365 days by itself
(`EnableKeyRotation`, asserted in `infra/test/encryption.test.ts`). KMS keeps every earlier version of the material, so
the per-practice data keys wrapped under it (ADR 0015), the S3 objects under SSE-KMS and the encrypted database stay
readable with no re-wrapping.

Yearly: confirm the rotation date (`aws kms get-key-rotation-status --key-id <EnvironmentKeyArn>`) and record it in the
readiness checklist's records.

On suspicion (the key's use outside the stack's roles, seen in CloudTrail):

1. Close the path first: KMS key material never leaves KMS, so a suspected exposure is a principal that could call the
   key. Revoke it (the IAM role, user or grant CloudTrail names) under docs/runbooks/incident-response.md.
2. Rotate at once: `aws kms rotate-key-on-demand --key-id <EnvironmentKeyArn>`. New data keys and objects use the new
   material; the old material stays for decryption, so the wrapped practice data keys need no re-wrapping (ADR 0015).
   Re-keying a practice (a new data key, its rows and objects encrypted again) is a re-encryption job, needed only if a
   practice's unwrapped data key itself was exposed; treat that as a breach of that practice's data.
3. Verify reads: a synthetic smoke practice's claim detail opens; the restore drill's next run passes.

## Database logins

The application, operator, queue and billing logins rotate every 30 days through Secrets Manager's alternating-users
rotation; the owner login rotates itself (asserted in `infra/test/database.test.ts`). To rotate one at once:
`aws secretsmanager rotate-secret --secret-id <its LoginSecretArn output>`, then force a new deployment of the services
that use it (web: application, queue and billing; worker: application and queue; platform: operator and queue), so their
tasks read the new password. The previous password stays valid for one period, so running tasks keep working meanwhile.

## The cookie-sealing key

The web app's sign-in cookie key (`CookieSecret` in the compute construct, 32 bytes as 43 letters and digits). Rotating it
signs every person out. Write a new random value (`aws secretsmanager put-secret-value` with 32 random bytes as base64),
then force a new deployment of the web service.

## Stripe's keys

See docs/runbooks/billing.md, Rotating a key.

## After any rotation

Record what was rotated, when, by whom and why in the readiness checklist's records; for a rotation on suspicion, in the
incident's record as well.
