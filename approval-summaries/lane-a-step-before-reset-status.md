W8 (Lane A, https://claude.ai/code/session_019i9ifE7teUhX79iAZKaxt5) holds `LANES.md` Queues item 28 from 2026-11-11 05:48 UTC, assigned by the orchestrator (session_019i9ifDAzQNA3kLHozjBoeS): a sign-in step begun before a password reset is refused after it. The next schema PR after password-changed-notice; required before launch.

## RESUME-BLOCK: step-before-reset, W8, 2026-11-11 06:25 UTC
- **Heads:** WIP ref `co-001/wip-step-before-reset` = **fadadf4b** (68895f0f, password-changed-notice's head, plus the
  reproduction). The branch `co-001/step-before-reset` is not on origin yet; no PR (it opens after password-changed-notice
  merges). Worktree `/home/user/step-before-reset` (disposable).
- **Done:** both cases reproduced on the provider twin at 68895f0f
  (`apps/web/src/lib/auth/step-before-reset.repro.db.test.ts`, 2 of 2 passing: reproduction only, the close flips both and
  removes the file). Design v1: `designs/lane-a-step-before-reset.md`.
- **Running:** the design's two adversarial reviews (sign-in and session security; database) as Agent subagents. Their
  findings go to `approval-summaries/lane-a-wip/step-before-reset/`; if that directory has no `design-review-*.md`, they
  did not finish and run again.
- **Left, in order:** verify every finding, fix the design; counters from the orchestrator (an ADR number; an SGN number
  if the rule gets its own row); the build on the branch (migration `20261112090000_sign_in_not_before.sql` only through
  /new-migration's marker route; the flow, the web's `pendingOf`, `openSession`; tests; the ADR and amendments); restack
  on password-changed-notice's final head when W6 pushes it; the suite once; two adversarial reviews of the build; the
  fix round and a review of its delta. After password-changed-notice merges: merge the base, regenerate the domain
  model, open the draft PR with `pnpm db:domain-model --summary-since`, post the approval line as a suggestion, one line
  to the orchestrator; merge after the founder's committed line and green required checks.
- **Local machine note:** the PostgreSQL servers the container setup starts were not running when the session began;
  running the setup script again started them. Local db tests need `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres`.
- **Gitleaks note:** a test constant named for a password with a high-entropy value is refused (generic-api-key);
  name such constants for their role (`BEFORE_RESET`), or reuse `sign-in.db.test.ts`'s.

## Decisions (mine, under the standing instruction; why in the design)
- 2026-11-11 06:20 UTC: the mark is a time on the database's clock (`"user".sign_in_not_before`), compared with the
  attempt's start read from the same clock, not a counter, a sequence or Cognito's `auth_time` (design section 4).
- The database refuses a stale session itself (a trigger on `user_session` under the account's row lock), and the
  reset's trigger sweeps sessions after taking that lock, so a sign-in racing the reset is either ended or refused.
- The `reset` step is not checked (it holds no proof). No new words on any screen.
