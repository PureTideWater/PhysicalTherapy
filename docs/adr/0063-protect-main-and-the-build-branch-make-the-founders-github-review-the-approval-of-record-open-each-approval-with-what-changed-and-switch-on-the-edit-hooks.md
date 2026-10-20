# 0063. Protect main and the build branch, make the founder's GitHub review the approval of record, open each approval with what changed, and switch on the edit hooks

- **Status:** accepted; amends [0059](0059-twin-the-four-vendors-exports-as-unconfirmed-registry-data-carry-the-synthetic-marker-in-an-identifier-column-and-refuse-spreadsheet-exports-at-intake.md) (the hooks are wired now, the push deny and sandbox still in the final pass)
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
at its limit, sized on the measured use (runbook step 1). The build agent gets its own GitHub account (a machine user
with its own email address and two-factor authentication, a collaborator with Write, never Admin), connected to Claude
for build sessions; until then it works as the founder's account. The switch also takes the founder's account out of
every Claude session: the GitHub connection belongs to the founder's Claude account, so every open build session first
merges or closes the pull requests the founder's account opened (each keeps its author, who could never approve it),
the claude.ai GitHub connector is disconnected (or reconnected as the agent), and the Claude app's authorization on
the founder's GitHub account is revoked while the app stays installed on the repository. A new build session then
reports `gh api user` and the connector's `get_me`; step 5 starts only when both name the agent, or the connector is
absent. Two branch rulesets, active, with no bypass actors (an administrator is held to them), deletion restricted,
force pushes blocked and a pull request required: `claude/build-platform`'s also requires the status checks `check`
(ci), `images (web)`, `images (worker)` and `licenses` (supply-chain) and `approval-of-record`, each with GitHub Actions
as its source, with branches up to date before merging; `main`'s requires no check until launch, since `main` holds no
workflow and a required check that cannot run would block every pull request into it (a repair like #18 among them).
The founder sets both as soon as this pull request is merged into `claude/build-platform`, rather than waiting for it
to reach `main` at launch, which would leave `main` open to a direct or force push until then. After the identity
switch the founder turns on "Require review from Code Owners" on the build branch with stale approvals dismissed (and
"approval of the most recent reviewable push" left off, since the founder's own commit of the approval line is a push
the founder then approves), sets one required approval on `main` (GitHub reads code owners from the base branch, and
`main` has no CODEOWNERS until launch, so every pull request into `main`, the launch included, waits for the founder),
and sets the repository variable `APPROVAL_REVIEW_REQUIRED` to `true`. At launch the founder adds the five checks and
Code Owners review to `main`'s ruleset. `docs/runbooks/github-governance.md` gives every click in that order, for a
phone.

**CODEOWNERS.** `.github/CODEOWNERS` names `@PureTideWater` for `packages/db/migrations/`, `docs/product/domain-model.md`,
`packages/db/domain-model/`, `content/releases/` (absent today; `publish-content.yml` creates it),
`fixtures/synthetic/rules/release-*/` (the releases), `CLAUDE.md`, `.claude/` and `.github/`, and for the code that
decides an approval: `packages/db/src/domain-model/`, `packages/db/src/cli/domain-model.ts` and
`tools/approval-of-record/`. A pull request could otherwise make the gate pass by editing the code that judges it,
without touching a protected file. It also names the code that decides whether the gate runs at all:
`packages/db/src/migrate.ts` (the migrations directory it applies), `packages/db/src/cli/migrate.ts`,
`packages/db/src/catalog.ts` (the catalog test), `vitest.config.ts` (the `db` project that runs the domain-model
tests), the root and `packages/db` `package.json` files (`test:db`, `db:domain-model`), `packages/synth/src/guard/` (the
fixture guard the hooks call, its pinned tables included) and `tools/check-releases-immutable.sh`; otherwise a pull
request could point the migrator at a new directory and drop the domain-model tests, leave the document and its
approval line unchanged, and merge new DDL on green checks. Every owner it names must be a login on `approvers.json`
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
their state; a comment changes nothing; an approval of an earlier commit does not count. Every file is read at a
commit: the base tip is resolved as a branch (`GET /git/ref/heads/{base}`), so a tag named like the branch cannot
stand in for it, and the head is the commit the event names (`pull_request.head.sha`), the one the run's check
belongs to; when the API already shows a newer head, that commit gets its own run. A base branch with no approver list
at all (`main` until the launch merge brings one) takes the list on `claude/build-platform`'s tip, the protected build
branch, never the head's: without it the launch pull request could never pass once enforced. The decision is one pure
function, `decide`, unit-tested with recorded API shapes beside the run's own requests (`approval-of-record.test.ts`).

While `APPROVAL_REVIEW_REQUIRED` is unset (or `false`) the job passes, and says that the requirement is not yet
enforced and why (the founder's account authors every pull request and cannot review its own), and what it would
decide. Set to `true` it fails a pull request the rule refuses, and on any error reading the API. Both words are read
in any case (a phone capitalises the first letter); any other value fails the job. It goes to `true` when the build
agent's first pull request under its own login is open, in the same sitting as Code Owners review (runbook step 5).

**Who writes the approval line.** With the hooks on, the build's edit tools cannot write an "Approved by:" line
(`protect-approval.sh`); a shell command still could, since no hook reads one, so until step 5 an approval line is only
as trustworthy as the commit that wrote it. The build posts the exact line, the founder's name, the date and the hash
`--require-approval` names, as a suggested change on the pull request; the founder commits it, and then approves the
pull request at that commit. The commit holds the text and the hash, the review is the approval of record, and the job
holds them to each other. The build never submits a review (CLAUDE.md): `protect-github.sh` refuses the GitHub
connector's review tools, and after the switch no Claude session holds the founder's account.

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
base branch into its job summary, which is the copy the founder reads (the build's copy in the description is the
build's text); the build opens the description of every pull request that regenerates the document with it
(`.claude/skills/new-migration`). A code block is read by CommonMark's rule (it closes only at a fence as long as its
own); the generator fences a view definition, and the cross-checks, with more backticks than any run inside them; and
a block left open is still reported line by line, under a warning that the document could not be read line by line.
A line of backticks inside a view's definition no longer hides the rest of the document in one block.

**The hooks, switched on now; push and sandbox later.** `.claude/settings.json` holds the hooks only: PreToolUse
`protect-content.sh`, `fixture-guard.sh` and `protect-approval.sh` on `Edit|Write|MultiEdit|NotebookEdit`, and
PostToolUse `typecheck.sh` on `Edit|Write|MultiEdit`, and PreToolUse `protect-github.sh` on the GitHub connector's
tools that review a pull request or write files on a branch. NotebookEdit joins ADR 0059's matcher because it writes
files too. The `git push` deny and the sandbox stay out until the final pass, as ADR 0059 decided. The hooks change
where reading them showed a gap:

- every hook takes `notebook_path` when there is no `file_path`, and resolves a relative path from the hook input's
  `cwd`, as Claude Code resolves it (a Bash `cd` moves it), not from the repository's top; each guard refuses a path
  holding a control character (a line break ended the path the hooks read before the one Node writes);
- `protect-content.sh` and `fixture-guard.sh` take the path in the file's own repository and in each repository
  around it, so a gitfile or a clone that makes `content/` or `fixtures/` its own repository leaves a release a
  release; `protect-content.sh` refuses any path with a `.git` segment, and the hooks and their settings
  (`.claude/settings*.json` anywhere, `.claude/hooks/`, `.claude/.allow-protected-edit`), so no edit switches the
  guards off;
- `fixture-guard.sh` finds every X12 interchange header anywhere in the text a call writes (after a byte-order mark,
  white space or other text, in any edit of a MultiEdit, with any separator) and refuses one whose ISA06 is not
  SYNTHSENDER; before, only a text that began with `ISA` was read;
- `protect-github.sh` refuses every review the connector's tools would create, submit or delete, and a file written
  through the GitHub API (`create_or_update_file`, `push_files`, `delete_file`) to a path the edit hooks guard or
  that configures the hooks or CI, or holding another sender's interchange;
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
| Stay public, or private on GitHub Free | Public shows the code and its history to anyone; private on Free has no branch protection, so a force push or a red merge stays possible. Going private on Pro ends GitHub's own secret scanning and push protection (Team or Enterprise with Secret Protection has them); gitleaks in CI stays the secret check. |
| One ruleset over both branches, set once this pull request reaches both | `main` would stay open to a direct or force push until launch, and its required checks could never run on a pull request from a branch cut from `main` (no workflows there). |
| Fail approval-of-record when the API's head differs from the event's | The event's head is the commit the check belongs to, so judging it is exact; a newer head gets its own run, and failing would leave a red check on a commit after an API lag. |
| A permissions deny for the connector's review tools | `.claude/settings.json` holds hooks only until the final pass; a hook refuses the same tools and says why. |
| Refuse the connector's merge tool too | A merge is bounded by the ruleset, whoever performs it (no bypass, required checks, the founder's review on owned paths); the build merges when checks are green, and `gh` would merge the same way. |
| Dependabot monthly | PRD section 16 asks for weekly updates; grouping (every action in one pull request, both images in one) and lower limits cut the runs instead. |
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

- Once the founder has done steps 1 to 4, no one, the founder included, can force-push, delete or push directly to
  either branch, or merge into the build branch with a failing or stale required check. After step 5, a change to a
  migration, the domain model, a release, CLAUDE.md, `.claude/`, `.github/` or the code that runs the gate needs the
  founder's review, every pull request into `main` needs the founder's approval, and a pull request that writes or
  removes an approval, or changes the approver list, fails approval-of-record until the founder approves its latest
  commit.
- Until step 5 the job passes and prints why, so it can be a required check from step 4.
- What a required check cannot stop: a collaborator with Write, the agent included, can produce a check run or a
  status with a required check's name from a workflow on a branch it pushes, and GitHub Actions is then its source.
  Pinning the source stops a plain status from a token; the rest of the risk stays. The checks, approval-of-record
  among them, are defence in depth; what holds an approval and the CI wiring is the founder's Code Owners review, with
  stale approvals dismissed, on `.github/` and the files that run the gate.
- What the hooks cannot stop: a shell command (`gh`, `git`, `curl`) passes no hook. Before step 5 a session that still
  held the founder's GitHub account could approve as the founder, and both approval-of-record and Code Owners review
  would accept it; that is why the switch takes the account out of every session and step 5 waits for a new session's
  check (runbook 3g to 3j). Recheck it whenever a GitHub connection on the founder's Claude account changes.
- Until launch a pull request into `main` merges with no required check; after step 5 it needs the founder's approval.
  The launch pull request is judged by approval-of-record against the build branch's approver list.
- CI's cost, measured on 17 and 18 October: about 35 billable minutes a push; about 1,100 minutes in 34 hours, a third
  of it one image job that hung for GitHub's 360-minute default. `ci`'s check now stops at 60 minutes (its mutation job
  at 120) and the supply-chain jobs at 15; Dependabot groups every action update in one pull request and both images in
  one, with fewer open at once (it reads `.github/dependabot.yml` from `main`, so `main`'s copy needs the same change
  to take effect before launch); the e2e artifact (up to 54 MB) is kept 7 days, against Pro's 1 GB of Actions storage.
  After step 5, Dependabot's pull requests that touch `.github/` or a code-owned `package.json` need the founder's
  review.
- `publish-content.yml` pushes to `main` directly; the ruleset refuses that push. `content/outgoing` holds no release
  today. Before the first content release is published, the workflow needs a push the ruleset admits (a deploy key as
  the ruleset's only bypass actor, or a pull request a person merges); that is an open item, not decided here.
- The approval line is still checked as before; a pull request that regenerates the document still fails `test:db`
  until the line is signed, and now also needs the founder's review once enforced.
- The hooks run in every Claude Code session in a checkout of this branch. A NotebookEdit cannot reach a release, a
  migration, a fixture or the approval. `typecheck.sh`, measured end to end on the build's machine (4 CPUs, shared
  with other builds, load 6 to 9) after a real edit: `packages/money` 1.7 s, `packages/db` 5.5 s, `apps/web` 8 to
  11 s (the same edit through the old hook: a full 45 s `tsc` of `apps/web`). The first edit of a package in a fresh
  checkout builds its cache and takes a full `tsc` (56 s for `apps/web` under that load). What remains is TypeScript
  parsing every file of the program, about 3,500 for `apps/web`; it is correct, and slow for `apps/web`. A faster
  check needs TypeScript 7's compiler or a resident checker process, not decided here.
- Checks: `packages/db/src/domain-model/summary.test.ts`, `summary.db.test.ts`, `approval.test.ts` (the second
  format), `tools/approval-of-record/approval-of-record.test.ts`, `tools/test/workflows.test.ts` (approval-of-record's
  triggers, permissions and run; the summary step; job timeouts; Dependabot's groups), `tools/test/codeowners.test.ts`,
  `tools/hooks/hooks.test.ts` (relative paths from a subdirectory, control characters, gitfiles, the hooks' own files,
  interchanges anywhere, the GitHub guard), and `actionlint` on the workflows where it is installed.

## Revisit when

The build agent's identity is switched and the variable set (record the date here); the launch merge brings the
workflows and CODEOWNERS to `main` (add the five checks and Code Owners review to `main`'s ruleset, and drop the
`target-branch` lines from Dependabot's settings); a second approver is added; the final pass commits the `git push`
deny and the sandbox; the first content release needs `publish-content.yml` to push to a protected `main`; or the
repository moves to an organization.
