# Lane A: auth emails (PR #125), the fix round

From 0582e4eb to head bcdceae6 (pushed; PR still draft, mergeable_state blocked on the founder's review).
Base: origin/claude/build-platform f7d609cc was already contained, so no merge commit.

## Applied (red commit, then green)
- S-1: fallback metric filter is a term pattern; test runs the handler and matches the runtime's text line (39759827, 60e7830b).
- S-2: keepOriginal email on the pool, empty writeAttributes on the web client; ADR 0081 B4a; O-3 closed (d6cc8131, a90d684e).
- UX-S1: invitation "Your account is {username}. Sign in with the address this email came to ..." (f458090c, 877abdd7).
- UX-S2: footer "PaidWhole never asks you to send your password or a code to anyone, by email, phone or chat: enter a
  code only on the PaidWhole page that asked for it." (fd1d2022, 48795578).
- UX-S3: BRAND.md 7 second email exception; .claude/rules/brand.md paths (ce7815b8).
- UX-N1, N2: "Every session of this account has ended."; time as 2026-11-05 14:32 UTC (86927c91, 5e59a09b).
- security-N-1: PasswordResetRequestOverFloor alarm, 3 in an hour (601a3c67, 96d7bf88).
- UX-N6: SGN-15 says Cognito sends HTML only (82162d4c). ADR staging checks and source size (bcdceae6).
- Renders redone: 8 emails, 64 files, inline source 14,121 bytes.

## Recorded, not applied
- N-1 timeout and memory (handler cannot hang; measure cold start on staging). N-2 (staging check; app-set temporary
  password is a later security decision). N-3, UX-N5 (ADR 0091 follow-on). UX-N3 (O-5, brand owner). UX-N4 (O-8, co-founder).

## Suite (once, final tree bcdceae6): all pass, no rerun
typecheck, lint, lint:copy, lint:logs, check:fixtures, verify-content; unit 9,475 passed; golden 381; db 4 shards
9,863 passed; infra 793; synth and watched list clean; actions:check; build and stamp; e2e 81 passed. Pre-push clean.
Detail: scratchpad mail/suite.md.

## Founder staging smoke additions
Forced fallback raises the alarm; empty WriteAttributes accepted and first sign-in works; what {username} renders as;
HTML-only MIME.
