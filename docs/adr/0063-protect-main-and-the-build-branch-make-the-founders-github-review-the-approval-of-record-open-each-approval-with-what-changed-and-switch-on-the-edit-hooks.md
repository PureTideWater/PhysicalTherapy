# 0063. Protect main and the build branch, make the founder's GitHub review the approval of record, open each approval with what changed, and switch on the edit hooks

- **Status:** accepted
- **Date:** 2026-10-18
- **Deciders:** the founder, Tyler Williams (GitHub `PureTideWater`), who approved on 2026-10-18 audit item #12 ("Make your approval and the CI gate real") and the standing rule of the same day; the build (the governance pull request)
- **PRD sections:** 16 (Security and compliance engineering), 17 (How to work: "CLAUDE.md is context, hooks are enforcement"; "merge by hand"), 18 (Testing and release); Change Order 001, CO-02; ADR 0059 (the hooks and the guarded approval)

## Context

The founder's approval of `docs/product/domain-model.md` (CO-02) is a line of text: a name on
`packages/db/domain-model/approvers.json`, a date and the document's SHA-256. `pnpm db:domain-model --check
--require-approval` and `domain-model.db.test.ts` hold the line to that text, but nothing ties it to the founder: any
commit can write it. What the repository held, and what constrains the design:

- The repository is public on GitHub Free and no branch is protected: `main` and `claude/build-platform` take a
  force push, a deletion or a merge with failing checks. GitHub Free offers neither branch protection nor rulesets on
  a private repository; GitHub Pro (or Team) does, and raises the Actions minutes (Free private: 2,000 a month; Pro:
  3,000). One CI run takes about 40 minutes of `ci` plus the `supply-chain` jobs.
- The build agent pushes and opens pull requests as the founder's own account, and GitHub does not let an author
  approve their own pull request, so no review by the founder is possible today.
- Every commit to `docs/product/domain-model.md` so far was the build's, the approval lines included (written on the
  founder's instruction, `fd4a2de`, `f59bbed`).
- An approval reads a 5,800-line document; nothing says what changed since the founder last signed it.
- `.claude/settings.json` is not in the repository, so none of `.claude/hooks/*.sh` runs in a session (ADR 0059). The
  Starter kit's settings also deny `git push` and turn on a sandbox, which would stop this build's agents.
- Reading the hooks against every tool Claude Code edits with (Edit, Write, MultiEdit and NotebookEdit): a
  NotebookEdit names its file `notebook_path`, not `file_path`, so every hook let it through unread, and
  `packages/synth/src/guard/hook.ts` rebuilds nothing for it; `protect-content.sh` matched the path as written, so
  `packages/x/../../content/releases/...` or a link passed it, and input that was not JSON passed it;
  `typecheck.sh` ran without `jq` as if no file were named, never ran after a MultiEdit, skipped `tools/` and
  `infra/`, and took a full `tsc` of the package through `pnpm --filter` after every edit (measured on the build's
  machine: 2.4 s for `packages/money`, 6.8 s for `packages/db`, 19 s for `apps/worker`, 45 s for `apps/web`).
- `.github/workflows/publish-content.yml` pushes release commits to `main` with the workflow token.

## Decision

**The founder's standing rule, in CLAUDE.md.** On 2026-10-18 the founder set a rule for every recommendation: build
only the best option, never weighted by build effort, judged on accuracy, quality, user experience, growth, security
and privacy, compliance, reliability, cost to serve, dispute success, time to value, resilience to change, AI safety,
maintainability and business readiness. CLAUDE.md carries it in one line, and one line on the approval of record.

**GitHub, set by the founder.** The repository becomes private on GitHub Pro, with an Actions budget that stops usage
at its limit. The build agent gets its own GitHub account (a machine user with its own email address and two-factor
authentication, a collaborator with Write, never Admin), connected to Claude for build sessions; until then it works as
the founder's account. One branch ruleset covers `main` and `claude/build-platform`: active, no bypass actors (an
administrator is held to it), deletion restricted, force pushes blocked, a pull request required, and the status
checks `check` (ci), `images (web)`, `images (worker)` and `licenses` (supply-chain) and `approval-of-record` required,
with branches up to date before merging. After the identity switch the founder turns on "Require review from Code
Owners" with stale approvals dismissed (and "approval of the most recent reviewable push" left off, since the founder's
own commit of the approval line is a push the founder then approves), and sets the repository variable
`APPROVAL_REVIEW_REQUIRED` to `true`. `docs/runbooks/github-governance.md` gives every click in that order, for a phone.

**CODEOWNERS.** `.github/CODEOWNERS` names `@PureTideWater` for `packages/db/migrations/`, `docs/product/domain-model.md`,
`packages/db/domain-model/`, `content/releases/` (absent today; `publish-content.yml` creates it),
`fixtures/synthetic/rules/release-*/` (the releases), `CLAUDE.md`, `.claude/` and `.github/`, and for the code that
decides an approval: `packages/db/src/domain-model/`, `packages/db/src/cli/domain-model.ts` and
`tools/approval-of-record/`. A pull request could otherwise make the gate pass by editing the code that judges it,
without touching a protected file. Every owner it names must be a login on `approvers.json`
(`tools/test/codeowners.test.ts`).

**The approver list names each approver's GitHub login.** `approvers.json` moves to
`tp-domain-model-approvers/2`: each entry is `{ "name": "Tyler Williams", "github": "PureTideWater" }`, the name as it
is signed and the login whose review is the approval. `readApprovers` still returns the names (the approval line's
check is unchanged); `readApproverRecords` returns both, refusing a login GitHub would not issue, a duplicate name or a
login listed twice in any case. Its note now says the list changes only under the approval of record.

**approval-of-record, a CI job.** `.github/workflows/approval-of-record.yml` runs on `pull_request` (opened,
synchronize, reopened, edited, ready for review) and on `pull_request_review` (submitted, edited, dismissed), so a
review re-runs it, with `contents: read` and `pull-requests: read` only. It runs
`tools/approval-of-record/approval-of-record.ts` on Node 24's own type stripping: no install, no dependency, nothing
but the workflow token, which it never prints. Through the GitHub API it reads the pull request (its author and head
commit), the approval line of `docs/product/domain-model.md` and the text of `approvers.json` on the base branch's tip
and on the head commit, the base tip's approver list, and every review. When the head changes the approval line or
the approver list relative to the base tip (which is what merging changes, since the branch must be up to date), it
requires an APPROVED review of the head commit from an approver on the **base** branch's list (a pull request cannot
name its own approver) who is not the pull request's author: when the head's line names a person, from that person's
login, otherwise from any listed login. A reviewer's latest review that approves, requests changes or is dismissed is
their state; a comment changes nothing; an approval of an earlier commit does not count. The decision is one pure
function, `decide`, unit-tested with recorded API shapes beside the run's own requests (`approval-of-record.test.ts`).

While `APPROVAL_REVIEW_REQUIRED` is unset (or `false`) the job passes, and says that the requirement is not yet
enforced and why (the founder's account authors every pull request and cannot review its own), and what it would
decide. Set to `true` it fails a pull request the rule refuses, and on any error reading the API. Any other value fails
the job. It goes to `true` when the build agent's first pull request under its own login is open, in the same sitting
as Code Owners review (runbook step 5).

**Who writes the approval line.** With the hooks on, the build cannot write an "Approved by:" line
(`protect-approval.sh`). The build posts the exact line, the founder's name, the date and the hash
`--require-approval` names, as a suggested change on the pull request; the founder commits it, and then approves the
pull request at that commit. The commit holds the text and the hash, the review is the approval of record, and the job
holds them to each other.

**Changes since the last approved document.** `pnpm db:domain-model --summary-since <ref>` compares the document at a
git ref (the base branch, whose document is approved, since nothing merges otherwise) with the working tree's, or with
the text `--out` or `--check` generates. It reads the two documents, the text the founder signs, not the schema: each
line is parsed into a fact of a category, keyed by what it describes, so a renumbered row is not a change. It prints
the old and new document SHA-256 and each approval line's state, then one line per change (added, removed or changed,
a long value shown around the part that changed), in this order: row-level security, policies and rewrite rules, the
PHI registry, grants and roles; then tables and views, columns, constraints and indexes, functions, triggers, the
divergence rows; then migrations, the cross-checks and any other line. A line repeated in a summary table is folded
into the line that holds it, and every other changed line is listed under "Other lines", so nothing that changes the
hash goes unreported. `summary.test.ts` holds it to synthetic edits of the committed document and
`summary.db.test.ts` to real DDL on a scratch database, regenerated. CI's `check` job writes the summary against the
base branch into its job summary; the build opens the description of every pull request that regenerates the document
with it (`.claude/skills/new-migration`).

**The hooks, switched on now; push and sandbox later.** `.claude/settings.json` holds the hooks only: PreToolUse
`protect-content.sh`, `fixture-guard.sh` and `protect-approval.sh` on `Edit|Write|MultiEdit|NotebookEdit`, and
PostToolUse `typecheck.sh` on `Edit|Write|MultiEdit`. NotebookEdit joins ADR 0059's matcher because it writes files
too. The `git push` deny and the sandbox stay out until the final pass, as ADR 0059 decided. The hooks change where
reading them showed a gap:

- every hook takes `notebook_path` when there is no `file_path`;
- `protect-content.sh` resolves the path as the other two do (dot segments, links, the file's own repository, any
  case) and fails closed on input that is not JSON;
- `fixture-guard.sh` applies the X12 rule to a NotebookEdit's `new_source`, and refuses a NotebookEdit under
  `fixtures/` or `packages/synth/`, where no notebook belongs and the guard cannot rebuild one;
- `protect-approval.sh` refuses a NotebookEdit of either file, a call it cannot rebuild;
- `typecheck.sh` fails closed without `jq`, runs after a MultiEdit, type-checks the nearest package of the file
  (`apps/*`, `packages/*`, `infra`, `tools`, or the root's own files), and, when that package's script is `tsc
  --noEmit`, runs that `tsc` directly with an incremental build-info file under `node_modules/.cache/tp-typecheck`,
  so the same check reports the same errors in a fraction of the time (another script runs through `pnpm`, as
  before). It fails closed without `tsc`.

`tools/hooks/hooks.test.ts` runs every hook for each tool its matcher names with allowed and refused cases, and runs
the hooks as `settings.json` wires them.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Stay public, or private on GitHub Free | Public shows the code and its history to anyone; private on Free has no branch protection, so a force push or a red merge stays possible. |
| GitHub Team, an organization | Granular roles and team reviews the repository does not need with one approver; Pro gives rulesets and code owners for a personal repository. Revisit when a second person reviews. |
| Keep the build agent on the founder's account | GitHub refuses an author's own review, so the founder could never be the approval of record. |
| Require the founder's review on every pull request (one required approval) | Most pull requests touch no protected path; code owners put the founder's review where the approval and the rules live. |
| `pull_request_target` for approval-of-record, to run the base branch's code | A review event has no `_target` form, so a pull request's own workflow judges it on review either way; CODEOWNERS on `.github/` and the gate's code is what keeps it honest, and one trigger shape is simpler to test. |
| Read the approver list from the pull request's head | A pull request could add the login that approves it. The base branch's list decides. |
| Install the workspace in approval-of-record and import `packages/db` | A minute per run, and a dependency install in a job that holds a token; the job's few readers are held to the package's own by tests. |
| A workflow that writes the approval line when the founder approves | A commit made with the workflow token runs no CI, so the merge would wait for checks that never come, and the line would be the bot's. |
| A summary from two schemas (`--json` at both refs) | The old schema needs a database migrated to the old migrations; the document is what the founder signs, so its text is what the summary compares. |
| A required approval inside the document (a second hash, a reviewer field) | It would change the document and its hash, which this pull request must leave unchanged, and still be text anyone can write. |
| Commit the Starter kit's settings whole | They deny `git push` and sandbox the build's agents, which would stop the remaining pull requests (ADR 0059). |
| Keep `typecheck.sh` on `pnpm --filter` | Up to 45 s after every edit of `apps/web`; the same `tsc`, incremental, reports the same errors. TypeScript 7's compiler would be faster still; revisit when the workspace moves to it. |

## Consequences

- Once the founder has done steps 1 to 4, no one, the founder included, can force-push or delete either branch or
  merge with a failing or stale required check. After step 5, a change to a migration, the domain model, a release,
  CLAUDE.md, `.claude/` or `.github/` needs the founder's review, and a pull request that writes or removes an
  approval, or changes the approver list, fails approval-of-record until the founder approves its latest commit.
- Until step 5 the job passes and prints why, so it can be a required check from step 4.
- `publish-content.yml` pushes to `main` directly; the ruleset refuses that push. `content/outgoing` holds no release
  today. Before the first content release is published, the workflow needs a push the ruleset admits (a deploy key as
  the ruleset's only bypass actor, or a pull request a person merges); that is an open item, not decided here.
- The approval line is still checked as before; a pull request that regenerates the document still fails `test:db`
  until the line is signed, and now also needs the founder's review once enforced.
- The hooks run in every Claude Code session in a checkout of this branch. A NotebookEdit cannot reach a release, a
  migration, a fixture or the approval. `typecheck.sh`, measured with this branch's packages on this machine (the
  hook's end-to-end time): see the pull request description; the first run of a package in a checkout builds its
  cache and takes as long as `tsc` does.
- Checks: `packages/db/src/domain-model/summary.test.ts`, `summary.db.test.ts`, `approval.test.ts` (the second
  format), `tools/approval-of-record/approval-of-record.test.ts`, `tools/test/workflows.test.ts` (approval-of-record's
  triggers, permissions and run; the summary step), `tools/test/codeowners.test.ts`, `tools/hooks/hooks.test.ts`,
  and `actionlint` on the workflows where it is installed.

## Revisit when

The build agent's identity is switched and the variable set (record the date here); a second approver is added; the
final pass commits the `git push` deny and the sandbox; the first content release needs `publish-content.yml` to push
to a protected `main`; or the repository moves to an organization.
