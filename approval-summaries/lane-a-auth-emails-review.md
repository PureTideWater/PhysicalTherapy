# Lane A: auth emails (PR #125), the two reviews

Reviewed head 0582e4eb. Two reviews with skeptics: security (account takeover, enumeration, phishing look-alikes),
then UX and brand with the renders (8 emails, light, dark-preferred and dark-inverted, 600 and 390 px). Every finding
was confirmed by a skeptic; none refuted.

| ID | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| security-S-1 | S | The fallback alarm's JSON filter never matches the trigger's text-format log line | Fixed: term pattern; a test runs the handler and matches the line the runtime writes |
| security-S-2 | S | A token holder can swap the account's address unverified (O-3 deferred without a founder reason) | Fixed: keepOriginal email, empty writeAttributes; O-3 closed |
| ux-brand-S1 | S | The invitation says {username} is the email address, which nothing checks | Fixed: words no longer say what it is; staging check added |
| ux-brand-S2 | S | The footer "never asks for ... a code by email" ends emails that carry a code | Fixed: new footer, one constant |
| ux-brand-S3 | S | BRAND.md 7 does not record the pool's header-less mail | Fixed: BRAND.md 7 and .claude/rules/brand.md |
| security-N-1 | N | Trigger cold start or timeout on the account-only path of the reset floor; over-floor runs only logged | Alarm added (3 in an hour); timeout and memory kept, cold start on staging smoke |
| security-N-2 | N | Cognito puts the temporary password raw into HTML | Recorded: staging check kept; app-set TemporaryPassword is a security decision for later |
| security-N-3 | N | Password-changed lines true only for a reset with confirmed sign-out | Recorded for ADR 0091 (follow-on) |
| ux-brand-N1 | N | "Every device" vs the notice's "every session" | Fixed |
| ux-brand-N2 | N | Long-form date vs the screens' ISO minute | Fixed |
| ux-brand-N3 | N | Account variant's lockup and tagline in dark-inverted | Recorded with O-5 (brand owner) |
| ux-brand-N4 | N | Two reset requests, two identical emails | Recorded in O-8 for the co-founder (ruled words) |
| ux-brand-N5 | N | "with a code sent to this address" true only for a reset | Recorded for ADR 0091 (follow-on) |
| ux-brand-N6 | N | Production sends HTML only; the text exists only in the twin | Fixed in SGN-15's words and the PR body |
