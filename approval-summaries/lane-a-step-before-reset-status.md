W8 (Lane A, https://claude.ai/code/session_019i9ifE7teUhX79iAZKaxt5) holds `LANES.md` Queues item 28 from 2026-11-11 05:48 UTC, assigned by the orchestrator (session_019i9ifDAzQNA3kLHozjBoeS): a sign-in step begun before a password reset is refused after it. The next schema PR after password-changed-notice; required before launch.

## RESUME-BLOCK: step-before-reset, W8, 2026-11-11 07:25 UTC
- **Heads:** WIP ref `co-001/wip-step-before-reset` = **238e6c64** (password-changed-notice's fix round ffa44ea9 merged
  into the reproduction commit). The branch `co-001/step-before-reset` is not on origin yet; no PR (it opens after
  password-changed-notice merges). Worktree `/home/user/step-before-reset` (disposable).
- **Counters:** ADR 0093; SGN-17 (the rule); SGN-18 (a reset whose answer was lost). Migration
  `20261112090000_sign_in_not_before.sql`.
- **Done:** both cases reproduced on the twin; design v1; its two adversarial reviews
  (`approval-summaries/lane-a-wip/step-before-reset/design-review-security.md`, `design-review-database.md`); every
  finding checked and ruled (`design-rulings.md`); **design v2** (`designs/lane-a-step-before-reset.md`).
- **Scope added by the orchestrator (06:49 UTC):** one attempt for `ConfirmForgotPassword`, and an unknown outcome
  handled on the safer reading (design D9; SGN-18).
- **Next, in order:** the build on the branch. (1) The migration draft is in this session's scratchpad only; rewrite it
  from design v2's D1 to D5 and D10 and place it only through the new-migration skill's marker route. (2) Database
  tests written to fail first. (3) The flow (`sign-in.ts`), `openSession`, the web's `pendingOf`, the provider's
  `removeHardwareKey` and the one-attempt confirm, the three counted lines in infra. (4) ADR 0093, the amendments, the
  matrix rows and synth registry, the runbooks. (5) The suite once; two adversarial reviews of the build (sign-in and
  session security; database); the fix round and a review of its delta. After password-changed-notice merges: merge
  the base, regenerate the domain model, open the draft PR with `pnpm db:domain-model --summary-since`, post the
  approval line as a suggestion, one line to the orchestrator; merge after the founder's committed line and green
  required checks.
- **For the PR description (the founder reads these):** the rule holds for an account only once the Cognito client is
  confidential (ADR 0088's second release); the deploy needs a moment with no reconcile queued or running; Cognito's
  behaviour on a repeated confirm is unproven without a pool, so D9 is by construction.
- **Handed on, for the orchestrator's queue (design section 7):** the reset resolves its account by the typed address
  (Schema PR 6); `resolve_session()` against `revokeDevice` deadlocks on the base; a later migration that refuses a
  session with no start; the other provider calls the SDK repeats.
- **Local machine note:** the PostgreSQL servers the container setup starts were not running when the session began;
  running the setup script again started them. Local db tests need `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres`.
- **Gitleaks note:** a test constant named for a password with a high-entropy value is refused (generic-api-key);
  name such constants for their role, or reuse `sign-in.db.test.ts`'s.

## Decisions (mine, under the standing instruction; why in the design)
- 2026-11-11 06:20 UTC: the mark is a time on the database's clock (`"user".sign_in_not_before`), compared with the
  attempt's start read from the same clock, not a counter, a sequence or Cognito's `auth_time` (design section 4).
- The database refuses a stale session itself (a trigger on `user_session` under the account's row lock), and the
  reset's trigger sweeps sessions after taking that lock, so a sign-in racing the reset is either ended or refused.
- The `reset` step is not checked (it holds no proof). No new words on any screen.
- 2026-11-11 07:20 UTC: the rulings on the design's reviews (`approval-summaries/lane-a-wip/step-before-reset/design-rulings.md`): the account's row is locked first in both transactions; a refusal is a recorded security event and a counted line; a stale code step is refused before the provider is asked, a key step never before a valid assertion; both the address's and the subject's account are judged; a key registered across the reset is removed or reported; an unknown reset outcome ends the sessions, moves the mark and pages.
