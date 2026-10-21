# Brief for Codex: PaidWhole while Claude Code is paused

Paste this whole file as your first message in Codex, with the repository `puretidewater/physicaltherapy` on branch `claude/build-platform`.

## Read first
Read `CLAUDE.md` at the repository root. Every rule in it applies to you word for word: the four rules that never bend, the "Never" list, the conventions and the schema gate. This brief adds limits for working beside Claude Code.

## Where things stand
- `claude/build-platform` is the build branch. `main` is the launch branch. Never push to `main`, never open a pull request into it, and never merge into it.
- Three pull requests are being built by Claude Code right now: `co-001/pr-05-packet-deadline`, `co-001/pr-06-free-screening` and `co-001/governance`. Their unfinished edits are on `salvage/*-wip` branches. Claude Code resumes them from its own saved runs, which assume the files are exactly as it left them. Any change you make to those branches breaks that resume.

## Your job: an independent second reviewer
You are a different model from the one building the app, so your value is a second pair of eyes. Review; do not build.

1. Review `claude/build-platform` and the head of each branch above. Check them against:
   - the four rules in `CLAUDE.md`;
   - the plan documents in `docs/product`;
   - the decisions in `docs/adr`.
   Look hardest at these areas:
   - money arithmetic and rounding (`packages/pricing`, `packages/ledger`, `packages/packets`);
   - row-level security and tenant isolation (`packages/db`, migrations, route handlers);
   - PHI in logs, URLs, keys, job payloads and error messages;
   - 835 parsing and idempotency (`packages/edi835`);
   - deadline and window computation (`packages/contracts`, `packages/triage`).
2. Write each finding with:
   - `file:line`;
   - the rule or requirement it breaks;
   - a concrete input or path that produces the wrong result;
   - a severity (critical, high, medium or low);
   - a suggested fix.

   If you cannot name a concrete failing path, do not report it.
3. Where you can prove a finding with a failing test, add the test. Build its data only from `packages/synth` twins, and do not fix the code.
4. Commit the findings to `docs/reviews/codex/<YYYY-MM-DD>.md`, plus any failing tests, on a new branch named `codex/review-<YYYY-MM-DD>`. Push that branch only.

## Never
- Push to any branch except one you created under `codex/`. Never rebase, amend or force-push anything.
- Open or merge a pull request. Claude Code opens pull requests after its own review.
- Add or edit any of these files or paths. Claude Code's guard hooks protect them, but those hooks do not run in Codex, so this list is the only guard:
  - a migration;
  - `content/releases/**` or `fixtures/golden/**`;
  - `docs/product/domain-model.md` or its approval line;
  - `approvers.json` or `CODEOWNERS`;
  - `.github/workflows/**` or `.claude/**`.
- Put real PHI, a real 835, a real contract or a real export in the repository, a test, a log or this conversation. If one is offered, refuse it and ask for a synthetic twin from `packages/synth`.
- Call a model outside `packages/model-gateway`.

## Checks you can run
Run `pnpm install`, then:
- `pnpm typecheck`, `pnpm lint` and `pnpm lint:logs`;
- `pnpm test` and `pnpm test:golden`;
- `pnpm verify-content`.

`pnpm test:db` needs PostgreSQL. Skip it if your environment has none, and say in the findings file that you skipped it.

## What happens next
When Claude Code resumes, it fetches the `codex/*` branches. It checks every finding independently: a finding is a claim to verify, not an order. Each confirmed finding then goes through the full pipeline before anything merges:
1. independent builders;
2. at least two adversarial reviews;
3. a fix round;
4. a check on a fresh clone;
5. GitHub CI.
