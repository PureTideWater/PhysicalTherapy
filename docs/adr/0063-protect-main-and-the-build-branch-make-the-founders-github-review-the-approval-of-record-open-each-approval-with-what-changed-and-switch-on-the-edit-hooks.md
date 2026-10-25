# 0063. Protect main and the build branch, make the founder's GitHub review the approval of record, open each approval with what changed, and switch on the edit hooks

- **Status:** accepted; amended 2026-10-20 (the founder's rulings on audit item #20, in "Amendment (2026-10-20)"
  below) and 2026-10-25 by [0066](0066-run-ci-as-parallel-jobs-behind-one-gate-measure-mutation-on-every-money-package-move-the-browser-and-runner-together-and-pin-every-dependency.md), Part 1 (the required checks, the job that writes the domain model's
  summary and the per-job timeouts, in "Amendment (2026-10-25)" below); amends [0059](0059-twin-the-four-vendors-exports-as-unconfirmed-registry-data-carry-the-synthetic-marker-in-an-identifier-column-and-refuse-spreadsheet-exports-at-intake.md) (the hooks are wired now, the push deny and sandbox still in the final pass)
- **Date:** 2026-10-18; amended 2026-10-20 and 2026-10-25
- **Deciders:** the founder, Tyler Williams (GitHub `PureTideWater`), who approved on 2026-10-18 audit item #12 ("Make your approval and the CI gate real") and the standing rule of the same day, and on 2026-10-20 the combined best-option audit in full, its item #20 ("Make your approval, the CI gate and the repository's settings real") among it; the build (the governance pull request)
- **PRD sections:** 16 (Security and compliance engineering), 17 (How to work: "CLAUDE.md is context, hooks are enforcement"; "merge by hand"), 18 (Testing and release); Change Order 001, CO-02 and rule 4; reconciliation 001, D4; ADR 0059 (the hooks and the guarded approval)

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

**GitHub, set by the founder.** The repository moves into a company GitHub organization on GitHub Team and becomes
private, with an Actions budget that stops usage at its limit, sized on the measured use (runbook steps 1 and 2; amended
2026-10-20, from GitHub Pro on the founder's own account). The organization requires two-factor authentication and gives
members no base permission, and the Claude GitHub App is installed on it for this repository alone. The build agent gets
its own GitHub account (a machine user with its own email address and two-factor authentication, an outside collaborator
with Write on this repository, never Admin), connected to Claude for build sessions; until then it works as the
founder's account. The switch also takes the founder's account out of every Claude session: the GitHub connection
belongs to the founder's Claude account, so every open build session first merges or closes the pull requests the
founder's account opened (each keeps its author, who could never approve it), the claude.ai GitHub connector is
reconnected as the agent (the build opens, reads and merges pull requests with it; disconnecting it leaves the
connection sessions push with as it was), and the Claude app's authorization on the founder's GitHub account is
revoked while the app stays installed on the organization. Every session open before the switch ends; a new build
session first reports `gh api user`, the connector's `get_me` and the repository's open pull requests through the
connector, and the build resumes, and step 5 starts, only when both logins name the agent (an error or no login means
that connection is made again first, and checked in another new session). An app the build uses that reaches GitHub as
an OAuth app rather than a GitHub App needs the founder's approval for the organization at the move, since a new
organization restricts OAuth apps' access (runbook 2f).

Rulesets, active, that hold an administrator too (amended 2026-10-20). `claude/build-platform` has one, with no bypass
actor: deletion restricted, force pushes blocked, a pull request required, and the status checks (amended 2026-10-25,
ADR 0066) <!-- required-checks -->`all green` (ci), `mutation` (mutation), `screening-capacity gate`
(screening-capacity) and `approval-of-record`<!-- /required-checks -->, each with GitHub Actions as its source, with
branches up to date before merging. `main` has two, so that the one bypass it will have reaches one rule:
"Protect main history" restricts deletion and blocks force pushes with no bypass actor at all, and "Protect main"
requires a pull request, with the content publisher (below) as its only bypass actor from runbook step 7, and no check
until launch, since `main` holds no workflow and a required check that cannot run would block every pull request into it
(a repair like #18 among them). Two tag rulesets cover `v*`, the tags that start the release workflow: one restricts
creating them, with the repository's administrator role (the founder) as its only bypass actor, and one restricts moving
and deleting them, with none; the first version left the agent's Write role free to tag any commit. The founder sets
them as soon as this pull request is merged into `claude/build-platform`, rather than waiting for it to reach `main` at
launch, which would leave `main` open to a direct or force push until then.

From the identity switch (runbook 3i) the build merges no pull request before the founder has approved its latest
commit, by its own rule (CLAUDE.md), and step 5, set as soon as step 4's rulesets exist, makes GitHub require it: one
required approval, "Require review from Code Owners" and stale approvals dismissed on the build branch's ruleset and on
"Protect main" ("approval of the most recent reviewable push" stays off, since the founder's own commit of the approval
line is a push the founder then approves), and the repository variable `APPROVAL_REVIEW_REQUIRED` set to `true`. From
then on every pull request into either branch, Dependabot's included, merges only with the founder's approval of its
latest commit (amended 2026-10-20; the first version required the founder's review only on the build branch's code-owned
paths, and the founder's approval only on `main`). GitHub reads code owners from the base branch, and `main` has no
CODEOWNERS until launch, so until then the one approval is what holds `main`: the agent authors every pull request into
it and never reviews one (CLAUDE.md; a shell command could, and no hook reads one), and no pull request goes into `main`
before launch without the founder's ruling. Dependabot's version updates go to the build branch; its security updates
always open against the default branch, and `main` holds no manifest, lockfile, Dockerfile or workflow until launch, so
none opens there, and one that did would wait for the founder's ruling like any other. The build merges a pull request
once the approval and the checks are in place. At launch, once the launch pull request is open, the founder adds the
same required checks to "Protect main" (step 8);
Code Owners review, on since step 5, applies there from the launch merge. A collaborator with Write, the agent included,
can still push another branch, run a workflow from it and publish an image to the repository's registry, so no image
reaches production on GitHub's word alone: the deploy runbook checks that the release tag's commit is on `main`.
`docs/runbooks/github-governance.md` gives every click in that order, for a phone.

**The content publisher** (chosen by the build on 2026-10-20 under the standing rule, and confirmed by the founder the
same day; the founder sets it up in runbook step 7, and again by approving the workflow's own pull request under the
change order's rule 4; the first version left it open).
`publish-content.yml` pushes the release commit and its tag to `main`, which "Protect main"
refuses from everyone. A GitHub App the organization owns, with one permission (Contents, read and write) and installed
on this repository alone, is the only bypass actor of "Protect main" and of a tag ruleset that restricts creating
`content-release-*`. "Protect main history" and a second tag ruleset, which restricts moving and deleting those tags,
have none, so a leaked key or a mistaken change to the workflow can neither rewrite nor delete `main`, nor move a
published release's tag. Its private key is the secret `CONTENT_PUBLISHER_KEY`, and its ID the variable
`CONTENT_PUBLISHER_APP_ID`, of an environment `content-publish` whose only deployment branch is `main`, so no workflow
on another branch, no pull request and no person's session can read it; GitHub Team gives a private repository no
required reviewer on an environment, and the release's own pull request already carries the founder's approval. The
workflow takes that environment, mints an installation token valid for the run with `actions/create-github-app-token`,
and pushes with it; `pnpm verify-content`, `tools/publish-content.sh` and the move are unchanged. Unlike the workflow
token, an installation token's push starts workflows: each publication's push to `main` starts the ones that run on a
push to `main`, among them a second `publish-content` run (the commit removes `content/outgoing/<n>`, which the
workflow's paths match) that finds `content/outgoing` empty and pushes nothing; the workflow's pull request tests that
run. The founder creates the app before launch (runbook step 7). The workflow change is a pull request of its own into
the build branch before launch, and since it touches the content pipeline's workflow it asks for the founder's
confirmation under the change order's rule 4. Until launch `publish-content.yml` is not on `main`, so it cannot run.

**The launch switch** (amended 2026-10-20). At launch, on the founder's ruling, `claude/build-platform` merges into
`main` through one pull request, filled in from the template and approved by the founder at its latest commit. It needs
a preparation, because `main` is not an ancestor of the build branch: #18 reverted #7 on `main`, so a merge of the build
branch into `main` takes that revert as `main`'s newer change and drops most of the build (a trial merge on 2026-10-20
left 174 of the build's 2,420 files, with 122 conflicts), and a conflict-resolving merge of `main` into the build branch
does the same. So the build first opens a pull request into `claude/build-platform` from a branch whose first commit is
`git merge -s ours origin/main`: it records `main` as a parent and keeps the build's tree (its diff against the build
branch is empty), so `main` becomes an ancestor. That merge's remerge diff, which CI's secret scan and the pre-push hook
read, re-adds every file an automatic merge would drop, so gitleaks finds in it the reviewed false positives
`.gitleaksignore` already lists under earlier commits; the branch's second commit lists each again under the merge's own
hash, once the build has checked that every finding is one of those, at the same file, rule and line (any other stops
the preparation). The founder approves that pull request, and it merges with "Create a merge commit", never squash or
rebase, which would drop `main`'s parent; the launch pull request merges the same way. Before opening the launch pull
request the build checks `git merge-base --is-ancestor origin/main origin/claude/build-platform`, and repeats the
preparation if `main` has moved since; it never uses "Update branch" on the launch pull request, which would push a
merge to `claude/build-platform`, whose ruleset refuses it. Of `main`'s 11 files (amended 2026-10-25; the first
version counted 10, before the pull request template), the build branch has changed `README.md`,
`.github/dependabot.yml`, `.github/pull_request_template.md`, `docs/product/PRD.md` and `docs/product/test-matrix.md`
(the other six plan files are the same), and the build's copies replace `main`'s; every other file of the build is new
to `main`. Once the launch pull request is open, and not
before (until then a required check that cannot run on `main` would block every other pull request into it), "Protect
main" gains the required checks, which run on the launch pull request because its workflows come with it, and
approval-of-record judges it against the build branch's approver list. It brings the build branch's `.github/dependabot.yml`, which has no `target-branch` lines, so
from the merge Dependabot opens its updates against `main`, and `.github/pull_request_template.md`, which GitHub then
offers on every new pull request. `main` stays the protected default branch: every later pull request targets it, and
`claude/build-platform` keeps its ruleset and takes no new pull request (runbook step 8).

**The pull request template** (amended 2026-10-20). `.github/pull_request_template.md` holds what every pull request's
description says: what changes, why, what it does not change, the checks run, the reviewer agents' findings and how each
was resolved, the answer to the change order's freeze (rule 4: the engine's arithmetic, the ledger's semantics, the
content pipeline, the security program, the milestones and their gates), the domain model's SHA-256 when a migration
changes it, and the founder's approval. GitHub offers a template only from the default branch, and `main` has none until
the launch merge brings it, so until then the template applies because CLAUDE.md tells the build to fill it in, and from
launch GitHub offers it on every new pull request. GitHub enforces neither; the quarterly review of merged pull requests
checks it (the change-management policy, rule 9). On 2026-10-20 the founder ruled for one pull request into `main`
before launch (the Dependabot settings, under Consequences), and it brings the template too, so GitHub offers it
from then on.

**CODEOWNERS.** `.github/CODEOWNERS` first names `@PureTideWater` for every path (`*`; amended 2026-10-20), so with
Code Owners review required the one approval each pull request needs is the founder's, never another account's with
Write, such as the agent's on a Dependabot pull request through `gh`, which no hook reads. GitHub takes the last line
that matches a path, and the lines after it name `@PureTideWater` again, for `packages/db/migrations/`,
`docs/product/domain-model.md`, `packages/db/domain-model/`, `content/releases/` (absent today; `publish-content.yml`
creates it), `fixtures/synthetic/rules/release-*/` (the releases), `CLAUDE.md`, `.claude/` and `.github/`, and for the
code that decides an approval: `packages/db/src/domain-model/`, `packages/db/src/cli/domain-model.ts` and
`tools/approval-of-record/`. A pull request could otherwise make the gate pass by editing the code that judges it,
without touching a protected file. It also names the code that decides whether the gate runs at all:
`packages/db/src/migrate.ts` (the migrations directory it applies), `packages/db/src/cli/migrate.ts`,
`packages/db/src/catalog.ts` (the catalog test), `vitest.config.ts` (the `db` project that runs the domain-model
tests), the root and `packages/db` `package.json` files (`test:db`, `db:domain-model`), `packages/synth/src/guard/`
(the fixture guard the hooks call, its pinned tables included) and `tools/check-releases-immutable.sh`; otherwise a
pull request could point the migrator at a new directory and drop the domain-model tests, leave the document and its
approval line unchanged, and merge new DDL on green checks. Every owner it names must be a login on `approvers.json`,
every tracked file's owner is the founder, and the named lines cover the gate's files without the first line
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

While `APPROVAL_REVIEW_REQUIRED` is unset (or `false`) the job passes, and says that the requirement is not yet enforced
and why (the founder's account authors every pull request and cannot review its own), and what it would decide. Set to
`true` it fails a pull request the rule refuses, and on any error reading the API. Both words are read in any case (a
phone capitalises the first letter); any other value fails the job. It goes to `true` with Code Owners review in runbook
step 5, once the agent's login is confirmed (3i) and no pull request the founder's account opened is still open.

**Who writes the approval line.** With the hooks on, the build's edit tools cannot write an "Approved by:" line
(`protect-approval.sh`); a shell command still could, since no hook reads one, so until step 5 an approval line is only
as trustworthy as the commit that wrote it. The build posts the exact line, the founder's name, the date and the hash
`--require-approval` names, as a suggested change on the pull request; the founder commits it, and then approves the
pull request at that commit. The commit holds the text and the hash, the review is the approval of record, and the job
holds them to each other. The build never approves or requests changes (CLAUDE.md): `protect-github.sh` refuses the
GitHub connector's review tools, so the build posts the suggestion with the GitHub API as one pull-request comment on
the approval line (`gh api repos/<owner>/<repo>/pulls/<n>/comments`; `.claude/skills/new-migration` gives the call),
which GitHub records as a comment and approval-of-record reads as changing nothing; and after the switch no Claude
session holds the founder's account.

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
`summary.db.test.ts` to real DDL on a scratch database, regenerated. CI's `domain model` job (amended 2026-10-25, ADR
0066; the single `check` job until then) writes the summary against the base branch into its job summary and its log, which is the copy the founder reads (the build's copy in the description is the
build's text); the build opens the description of every pull request that regenerates the document with it
(`.claude/skills/new-migration`). A code block is read by CommonMark's rule (it closes only at a fence as long as its
own); the generator fences a view definition, and the cross-checks, with more backticks than any run inside them; and
a block left open is still reported line by line, under a warning that the document could not be read line by line.
A line of backticks inside a view's definition no longer hides the rest of the document in one block.

**The hooks, switched on now; push and sandbox later.** `.claude/settings.json` holds the hooks only: PreToolUse
`protect-content.sh`, `fixture-guard.sh` and `protect-approval.sh` on `Edit|Write|MultiEdit|NotebookEdit`, PostToolUse
`typecheck.sh` on `Edit|Write|MultiEdit`, PreToolUse `protect-github.sh` on the GitHub connector's tools that review a
pull request or write files on a branch, and SessionStart `session-start.sh`, which installs the pre-push hook and the
pinned gitleaks in every session and says in the session's context what is missing (amended 2026-10-20). NotebookEdit
joins ADR 0059's matcher because it writes files too. The `git push` deny and the sandbox stay out until the final pass,
as ADR 0059 decided. The hooks change where reading them showed a gap:

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
  SYNTHSENDER; before, only a text that began with `ISA` was read. The pre-push hook and `pnpm check:fixtures` search
  every text file a push writes, or the tree holds, by the same pattern (`INTERCHANGE_HEADER` in
  `packages/synth/src/write.ts`, which `hooks.test.ts` holds equal to the hook's), whatever its name or directory, so
  a header pasted after a line of prose in a `.md` or `.txt` outside `fixtures/` is refused at push and in CI too;
- `protect-github.sh` refuses every review the connector's tools would create, submit or delete, and every file written
  through the GitHub API (`create_or_update_file`, `push_files`, `delete_file`), on any path, since such a write passes
  neither the edit hooks nor the pre-push hook (amended 2026-10-20; the first version refused only the guarded paths and
  another sender's interchange);
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
| Stay public, or private on GitHub Free | Public shows the code, its history and its security design to anyone, and PR 7's red team would publish working attack paths before they are fixed; private on Free has no branch protection, so a force push or a red merge stays possible. Going private ends GitHub's own secret scanning and push protection unless GitHub Secret Protection is added; gitleaks in CI and the pre-push hook stay the secret checks. |
| Make the repository private only just before PR 7 | The code and its security design would stay public meanwhile, to save running costs the founder has accepted. The runbook moves it now; the latest is before the first of PR 7's red team, the specialist's golden answers or any real-derived content. |
| One ruleset over both branches, set once this pull request reaches both | `main` would stay open to a direct or force push until launch, and its required checks could never run on a pull request from a branch cut from `main` (no workflows there). |
| Fail approval-of-record when the API's head differs from the event's | The event's head is the commit the check belongs to, so judging it is exact; a newer head gets its own run, and failing would leave a red check on a commit after an API lag. |
| A permissions deny for the connector's review tools | `.claude/settings.json` holds hooks only until the final pass; a hook refuses the same tools and says why. |
| Refuse the connector's merge tool too | A merge is bounded by the ruleset, whoever performs it (no bypass, the required checks, the founder's approval); the build merges after the founder's approval and green checks, and `gh` would merge the same way. |
| The founder merges by hand (PRD 17's "merge by hand" read literally) | The ruleset already holds every merge to the founder's approval and the checks; a second tap adds no control, and the build keeps the branch up to date and merges in order. The founder approves by hand; the build merges. |
| Dependabot monthly | PRD section 16 asks for weekly updates; grouping (every action in one pull request, both images in one) and lower limits cut the runs instead. |
| GitHub Pro on the founder's own account (the first version) | The company's code would stay in a person's account, which an acquirer's diligence and a SOC 2 auditor both ask about first; a personal repository has no roles (every collaborator has the same access), no app the company owns for the content publisher, no organization audit log and no two-factor requirement for everyone. Replaced on 2026-10-20 by an organization on GitHub Team. |
| Keep the build agent on the founder's account | GitHub refuses an author's own review, so the founder could never be the approval of record. |
| No required approval outside the code-owned paths (the first version) | Changes to the engine, the ledger, the parser and the packets would merge with no person's approval. SOC 2's change-management criterion (CC8.1) is tested as separation of duties: the one who writes a change (the build) is not the one who approves it for production, and someone always does, on record. Replaced on 2026-10-20 by one approval, the founder's, on every pull request. |
| One required approval without a CODEOWNERS line for every path | Any account with Write could give it: the agent on a pull request it did not open, such as Dependabot's, through `gh`, which no hook reads. |
| Turn on Code Owners review on `main` only at launch | Turned on with the one approval in step 5, it changes nothing until `main` has a CODEOWNERS, and leaves nothing to remember at launch. |
| A deploy key as `main`'s bypass, for `publish-content.yml` | A deploy key is an SSH key with no expiry that pushes as no named identity, and the ruleset's "Deploy keys" bypass admits every deploy key the repository will ever have. The organization's app has one permission, a token that lasts the run, and its own name in the audit log. |
| The workflow token (GitHub Actions) as `main`'s bypass | Every workflow on every branch holds that token, the agent's included, so any of them could push to `main`. |
| `publish-content.yml` opens a pull request that a person approves | A pull request opened with the workflow token runs no workflow, so after launch its required checks never come; it would also ask for a second approval of content the founder already approved, and tag a commit that is not the one merged. |
| Publish in the release's own pull request (the merge is the publication) | It changes the content pipeline, which the change order holds fixed (rule 4): `check-releases-immutable.sh` refuses a release a pull request adds, and `publish-content.sh` checks and moves a release only on `main`. |
| A required reviewer on the `content-publish` environment | GitHub Team offers none for a private repository (Enterprise does); the branch rule on the environment keeps the key to `main`, and the release's pull request carries the founder's approval. |
| `pull_request_target` for approval-of-record, to run the base branch's code | A review event has no `_target` form, so a pull request's own workflow judges it on review either way; CODEOWNERS on `.github/` and the gate's code is what keeps it honest, and one trigger shape is simpler to test. |
| Read the approver list from the pull request's head | A pull request could add the login that approves it. The base branch's list decides. |
| Install the workspace in approval-of-record and import `packages/db` | A minute per run, and a dependency install in a job that holds a token; the job's few readers are held to the package's own by tests. |
| A workflow that writes the approval line when the founder approves | A commit made with the workflow token runs no CI, so the merge would wait for checks that never come, and the line would be the bot's. |
| A summary from two schemas (`--json` at both refs) | The old schema needs a database migrated to the old migrations; the document is what the founder signs, so its text is what the summary compares. |
| A required approval inside the document (a second hash, a reviewer field) | It would change the document and its hash, which this pull request must leave unchanged, and still be text anyone can write. |
| Commit the Starter kit's settings whole | They deny `git push` and sandbox the build's agents, which would stop the remaining pull requests (ADR 0059). |
| Keep `gitleaks/gitleaks-action` in CI | For a repository an organization owns it needs a licence key (`GITLEAKS_LICENSE`) or fails the job, so every `check` would turn red at the move (runbook step 2), and it reads the pull request's commits through the API. The pinned gitleaks, its archive checked against a SHA-256 in the repository, is what the pre-push hook runs too, and needs neither. |
| `core.hooksPath = .githooks` for the pre-push hook (its first instruction) | git resolves it in each working tree and runs nothing, with no warning, where the checked-out branch has no `.githooks/pre-push`: every branch cut before this pull request. The launcher in the clone's own hooks directory refuses such a push instead. |
| Refuse a push when gitleaks reports fewer commits than the push sends | gitleaks does not count a commit with no patch (an empty commit, a clean merge) or one that only deletes or changes binary files, so such pushes would all be refused; the hook compares with the commits that add a line, each of which gitleaks counts. |
| Merge the build branch into `main` as it is at launch, or merge `main` into it resolving the conflicts | Both take #18's revert as `main`'s change and drop most of the build; the ours-merge keeps the build's tree and makes `main` an ancestor. |
| Let the agent create release tags | A `v*` tag starts the release workflow on whatever commit it names, an unreviewed branch's included; only the founder creates one, and the deploy checks that its commit is on `main`. |
| Refuse to start a production server while a legal surface waits for its review | It would stop every production deploy, security fixes included, on a text review; leaving the unreviewed parts off the production page keeps the commitment from going out and the deploys moving. |
| Keep `typecheck.sh` on `pnpm --filter` | Up to 45 s after every edit of `apps/web` (against 8 to 11 s, or 27 to 33 s for a widely imported module); the same `tsc`, incremental, reports the same errors. TypeScript 7's compiler would be faster still; revisit when the workspace moves to it. |

## Consequences

- Once the founder has done steps 1 to 4, no one, the founder included, can force-push, delete or push directly to
  either branch, merge into the build branch with a failing or stale required check, or move or delete a release tag,
  and only the founder can create one. From runbook 3i every pull request into either branch waits for the founder's
  approval of its latest commit before the build merges it, and after step 5 GitHub requires it (amended 2026-10-20); a
  pull request that writes or removes an approval, or changes the approver list, also fails approval-of-record until the
  founder approves its latest commit. Each approval costs the founder about two minutes from the GitHub app, and nothing
  merges while the founder cannot approve (the change-management policy, rule 7).
- Until step 5 the job passes and prints why, so it can be a required check from step 4.
- What a required check cannot stop: a collaborator with Write, the agent included, can produce a check run or a
  status with a required check's name from a workflow on a branch it pushes, and GitHub Actions is then its source.
  Pinning the source stops a plain status from a token; the rest of the risk stays. The checks, approval-of-record
  among them, are defence in depth; what holds an approval and the CI wiring is the founder's Code Owners review of
  every pull request, with stale approvals dismissed.
- What the hooks cannot stop: a shell command (`gh`, `git`, `curl`) passes no hook. Before step 5 a session that still
  held the founder's GitHub account could approve as the founder, and both approval-of-record and Code Owners review
  would accept it; that is why the switch takes the account out of every session and step 5 waits for a new session's
  check (runbook 3g to 3j). Recheck it whenever a GitHub connection on the founder's Claude account changes.
- Until launch a pull request into `main` merges with no required check, and only on the founder's ruling; from 3i the
  build waits for the founder's approval of it, and after step 5 GitHub requires it. The launch pull request is judged
  by approval-of-record against the build branch's approver list, and by the required checks, which "Protect main"
  gains once it is open, never earlier (runbook step 8).
- CI's cost, measured on 17 and 18 October: about 35 billable minutes a push; about 1,100 minutes in 34 hours, a third
  of it one image job that hung for GitHub's 360-minute default. Every job now stops at its own timeout (amended
  2026-10-25, ADR 0066: ci.yml's jobs at 5 to 25 minutes, about three times each one's expected time, where ci's one job
  stopped at 60 and the supply-chain jobs at 15), mutation's at 5, 30 and 10 (`changes`, each `stryker` shard and the
  gate; ADR 0066, Part 4, where its one job stopped at 120); Dependabot groups every action update in one pull request
  and both images in one, with fewer open at once; the e2e artifacts (up to 54 MB a run over every shard) are kept 7 days, against Team's
  2 GB of Actions storage.
  Dependabot reads `.github/dependabot.yml` from `main`, so the groups and limits take effect before launch only when
  `main`'s copy changes. On 2026-10-20 the founder ruled for one pull request into `main` that changes it (the same
  groups and limits, with every `target-branch` line kept) and adds the pull request template; the build opens it after
  this pull request merges and before runbook step 5, and it merges on the founder's approval. After step 5, every
  Dependabot pull request needs the founder's approval.
  Dependabot's alerts and security updates read only `main`, which holds no manifest until launch: until then the build
  branch's dependencies are checked by `pnpm audit --prod` in every pull request's `static` job and by the weekly version
  updates, and from the launch merge Dependabot's alerts cover them too.
- `publish-content.yml` pushes to `main` with the content publisher's token, the only bypass of "Protect main" and of
  creating a content release tag (the build's choice of 2026-10-20, above, confirmed by the founder the same day).
  `content/outgoing` holds no release today, and the workflow is not on `main` until launch; the app (runbook step 7)
  and the workflow's change both come before launch.
- The approval line is still checked as before; a pull request that regenerates the document fails the `domain model`
  check until the line is signed (amended 2026-10-25, ADR 0066: the approval case was in `test:db` until then, which
  kept the whole database suite red), and now also needs the founder's review once enforced.
- The hooks run in every Claude Code session in a checkout of this branch. A NotebookEdit cannot reach a release, a
  migration, a fixture or the approval. Every session installs the pre-push hook and the pinned gitleaks when it starts,
  and a write through the GitHub connector's file tools is refused, so every push the build makes goes through the
  fixture check and gitleaks before GitHub has it. A push made from a working tree whose branch has no hook (one cut
  before this pull request, or from `main`) is refused (amended 2026-10-20): the launcher runs the hook of the working
  tree the push is made from, whichever branch it sends, so such a branch is pushed from a working tree of the clone
  that has the hook. A branch cut from `main` for a pull request into `main`, which has no hook until launch, is pushed
  from a checkout of the build branch (`git push origin <branch>`), never by merging the build branch into it. The fixture check reads every PDF, which passes only when packages/synth
  wrote it, an interchange after white space or a UTF-16 byte-order mark, and an interchange header anywhere in any text
  file; it cannot judge an image.
  `typecheck.sh`, measured end to end on the build's machine (4 CPUs, shared with other builds, load 6 to 9) after a
  real edit: `packages/money` 1.7 s, `packages/db` 5.5 s, `apps/web` 8 to 11 s after an edit of a file few others
  import, and 27 to 33 s after an edit of a widely imported module such as `apps/web/src/lib/server/config.ts`, since
  `tsc` checks again every file that depends on it (the same edit through the old hook: a full 45 s `tsc` of `apps/web`;
  amended 2026-10-20, the first version gave only the first figure). The first edit of a package in a fresh checkout
  builds its cache and takes a full `tsc` (56 s for `apps/web` under that load). What remains is TypeScript parsing
  every file of the program, about 3,500 for `apps/web`; it is correct, and slow for `apps/web`. A faster check needs
  TypeScript 7's compiler or a resident checker process, not decided here.
- Checks: `packages/db/src/domain-model/summary.test.ts`, `summary.db.test.ts`, `approval.test.ts` (the second format),
  `tools/approval-of-record/approval-of-record.test.ts`, `tools/test/workflows.test.ts` (approval-of-record's triggers,
  permissions and run; the summary step; job timeouts; Dependabot's groups; the secret scan with the pinned gitleaks and
  never the gitleaks action), `tools/test/codeowners.test.ts` (the founder owns every tracked file),
  `packages/compliance/src/controls.test.ts` and `checklist.test.ts` (the change-management control's evidence, the
  quarterly review, the policy's version), `tools/hooks/hooks.test.ts` (relative paths from a subdirectory, control
  characters, gitfiles, the hooks' own files, interchanges anywhere, the GitHub guard, the session-start hook),
  `tools/hooks/pre-push.test.ts` (real pushes: the launcher and a branch without the hook, colored or rewritten patches,
  an unfetched remote and a URL, merges), `tools/fixture-check/*.test.ts` (PDFs, indented and UTF-16 interchanges, a header after a line of text in any
  file, prose that names the segment),
  `tools/test/legal-surfaces.test.ts` (the production gate), and `actionlint` on the workflows where it is installed.
- security.txt's expiry fails `pnpm test`, and with it every pull request's `unit` job and `all green`, from 30 days before its date
  (2027-03-31 for today's 2027-04-30); the quarterly review renews it when fewer than 120 days remain, so it never
  blocks a merge.

## Amendment (2026-10-20): the founder's rulings on audit item #20

On 2026-10-20 the founder adopted the combined best-option audit in full. Its item #20, "Make your approval, the CI gate
and the repository's settings real", amends this decision; the sections above are updated to match, each change marked
"amended 2026-10-20", or, for what the build chose, "chosen by the build". What changed since the first version
(2026-10-18): first the founder's rulings, then what the build chose under the standing rule to carry them out, which
the founder confirms by doing the runbook's steps, then what is recorded so the documents agree.

**The founder's rulings.**

1. **One approval, by the founder, on every pull request.** From the day the build agent works under its own GitHub
   account (runbook 3i), every pull request into `main` and `claude/build-platform` needs one approving review, the
   founder's, of its latest commit before it merges: the build waits for it from 3i, and from step 5, set as soon as
   step 4's rulesets exist, GitHub requires it, with one required approval and Code Owners review on both pull-request
   rulesets, stale approvals dismissed, and CODEOWNERS naming the founder for every path. The first version set no
   required approval outside the code-owned paths. Why: SOC 2's change-management criterion (CC8.1) asks that every
   change reaching production be authorized, and an auditor tests it as separation of duties. The build writes every
   change, so a person who is not its author must approve each one, on record; an acquirer's diligence asks the same
   question first. It costs the founder about two minutes a pull request.
2. **The build still merges.** Once the approval and the required checks are in place, the build performs the merge.
   This replaces reconciliation 001's D4 (a), under which each pull request "is merged once its acceptance check and the
   full CI are green", from the switch on; until the agent's account exists, D4 (a) continues
   (`docs/product/reconciliation-001.md`, Approval, amended the same day). It also settles PRD 17's "merge by hand": the
   founder approves by hand, and the build merges.
3. **A company organization on GitHub Team, and a private repository.** The repository moves into a company GitHub
   organization on the Team plan and becomes private before the first of PR 7's red team writing its reproducing tests,
   the specialist's golden answers and any real-derived content (runbook steps 1 and 2, which do it now). The running
   costs, the organization's seats included, are accepted. What it changes for the build: the repository's owner in
   every address (`github.com/<organization>/PhysicalTherapy`; each clone's `origin` is pointed there rather than left
   on GitHub's redirect); the Claude GitHub App installed on the organization for this repository, since an installation
   on the founder's account no longer reaches it; the agent's account added as an outside collaborator with Write; a
   session opened on the old address replaced by one on the new; the OIDC trust of staging's pull-request-diff role,
   which names `repo:PureTideWater/PhysicalTherapy:pull_request` (`GITHUB_REPOSITORY` in `infra/lib/environments.ts`;
   ADR 0012), changed with ADR 0012's text in a pull request right after the move and never before, and the role
   redeployed if one is deployed; and the release images, which from then on publish under
   `ghcr.io/<organization>/physicaltherapy` while the earlier ones stay under the personal account. What the build needs
   from the founder to keep access is only the app's installation on the organization (step 2e), the organization's
   approval of anything the build uses that reaches GitHub as an OAuth app (step 2f; a new organization restricts
   OAuth apps' access) and the agent's Write role (step 3c). CI's secret scan runs the pinned gitleaks itself, so the
   move needs no gitleaks licence once this pull request is merged into `claude/build-platform`, which the runbook
   puts before the transfer (2a): transferred first, every other open pull request's `check` would go red.
4. **The launch switch** is written down (above; runbook step 8): one reviewed pull request from the build branch into
   `main`, after the preparation that makes `main` an ancestor of the build branch, Dependabot's `target-branch` lines
   gone with it, and `main` the protected default from then on.
5. **The policy, the controls map and the template.** The change-management policy, version 0.2, says in rule 1 exactly
   what the rulesets enforce and adds, in rule 9, a quarterly review of a sample of merged pull requests by someone
   independent of the build. The evidence checklist expects it as a `change_review` record within 92 days;
   `compliance_record` accepts that kind once a migration adds it under CO-02, which this pull request does not do, so
   until then the checklist shows it missing and the signed review is kept with the program's records.
   `.github/pull_request_template.md` holds every pull request's description (above).
6. **A pre-push hook, and a disclosure page** (audit #20 (e) and (f)), in this pull request: `.githooks/pre-push` runs
   the fixture check and gitleaks over the commits being pushed, since a file copied into the tree otherwise reaches
   GitHub before CI reads it; every Claude Code session installs it, through a launcher in the clone's own hooks
   directory, with the pinned gitleaks (`.claude/hooks/session-start.sh`), and the GitHub connector's file tools are
   refused, so all of the build's pushes pass it. The web app serves a `security.txt` (RFC 9116) at
   `/.well-known/security.txt` and a public vulnerability-disclosure page, whose two parts that wait for review a
   production server leaves out (`docs/product/legal-surfaces.md`).

**Chosen by the build under the standing rule.** Each is the best option the build found for a ruling above. On
2026-10-20 the founder confirmed 7 and 8, including that only the founder creates `v*` tags, when the build asked; the
founder confirms the others by doing their runbook steps, or rules otherwise.

7. **The content publisher** (above; runbook step 7): how `publish-content.yml` pushes to a protected `main`, which item
   #20 does not say. The founder confirmed it on 2026-10-20, sets it up in step 7, and confirms it again by approving the
   workflow's own pull request under the change order's rule 4.
8. **Two rulesets on `main` and two on the release tags** (above; runbook steps 4 and 7): `main`'s history rules with no
   bypass at all, so the content publisher's bypass reaches only the pull-request rule; and `v*` tags created only by
   the founder and never moved, with the deploy runbook's check that a tag's commit is on `main`.
9. **The launch preparation** (above; runbook step 8): the ours-merge of `main` into the build branch, merged with a
   merge commit, and the `.gitleaksignore` entries its remerge diff needs.
10. **CI's secret scan with the pinned gitleaks**, in place of `gitleaks/gitleaks-action`, which an organization's
    repository must license; the same binary as the pre-push hook, its archive checked against
    `tools/gitleaks/release.txt`.
11. **The disclosure page's drafts left out of production** until their review is recorded, rather than a deploy step
    someone must remember.

**Recorded so the documents agree.**

12. **The required checks, the same in every document.** `claude/build-platform` requires these from step 4 (amended
    2026-10-25, ADR 0066, where the 2026-10-20 list was ci's single check, the three supply-chain checks and
    approval-of-record): <!-- required-checks -->`all green`, `mutation`, `screening-capacity gate` and
    `approval-of-record`<!-- /required-checks -->, the last of which passes and says why until
    `APPROVAL_REVIEW_REQUIRED` is `true`. `main` requires none until launch and the same from step 8. The first
    version's runbook and this record already agreed on the checks; they now also agree on the approval and on when it
    starts, and `tools/test/required-checks.test.ts` holds every listing to `tools/required-checks.ts`.
13. **Dependabot's settings on `main`.** The groups and limits on this branch take effect only when `main`'s copy
    changes. On 2026-10-20 the founder ruled for one pull request into `main` that changes it and adds the pull request
    template (Consequences; the runbook's section on it).
14. **`typecheck.sh`'s time, stated both ways** (Consequences): 8 to 11 s in `apps/web` after an edit of a file few
    others import, 27 to 33 s after an edit of a widely imported module such as `apps/web/src/lib/server/config.ts`.
15. **approval-of-record's runner.** It runs on `ubuntu-24.04`, as every job has since #24.

Dates to record here: the day of runbook 3i, from which the build merges no pull request without the founder's approval
and from which the first quarterly review samples (not yet); the day step 5 is set, from which GitHub requires it (not
yet); the launch (not yet).

## Amendment (2026-10-25): the required checks and CI's jobs after ADR 0066, Part 1

ADR 0066, Part 1 (`co-001/ci-speed`, combined audit #109, adopted by the founder on 2026-10-20) replaces ci.yml's one
serial job with parallel jobs behind one gate, folds `supply-chain.yml` into it and moves the domain model's approval
into a job of its own. The sections above are updated to match, each change marked "amended 2026-10-25":

1. **The required checks.** The ruleset of step 4A, and "Protect main" from step 8, require
   <!-- required-checks -->`all green` (ci), `mutation` (mutation), `screening-capacity gate` (screening-capacity) and
   `approval-of-record`<!-- /required-checks -->. `all green` needs every ci.yml job, the image and license gates among
   them, so one ci.yml check replaces ci's and the three supply-chain checks; `mutation` and the capacity gate, the
   founder's offer of 2026-10-22 and ruling of 2026-10-21, join the list the documents give. No ruleset existed when
   this was written (`gh api repos/PureTideWater/PhysicalTherapy/rulesets` returned `[]`), so nothing on GitHub named
   the old checks; the founder sets the ruleset with these names once ADR 0066's pull request has its first green push
   run (runbook step 4A).
2. **The domain model's summary** is written by ci.yml's `domain model` job, into its summary and its log, on every
   pull request; that job also runs `pnpm db:domain-model --check --strict --require-approval`, so an unsigned
   document is red there alone. The database suite keeps the drift case (`domain-model.db.test.ts`) and drops the
   approval case; the Context above, which says the test held the line, describes the decision's day.
3. **Timeouts.** Every ci.yml job has its own: `static` and `lint` 15 minutes, `unit` and each `db` shard 20,
   `domain model` 10, `build` 15, each `e2e` shard 25, `images` 20 and `all green` 5 (`tools/test/workflows.test.ts`).
4. **`main`'s files.** Eleven, not ten: the pull request template the founder's ruling of 2026-10-20 added is the
   eleventh (`git ls-tree -r --name-only origin/main`), and five of them differ on the build branch.

## Revisit when

The build agent's identity is switched and the variable set (record both dates in the amendment above); the launch
merge brings the workflows and CODEOWNERS to `main` (the required checks join "Protect main", Code Owners review applies
there from the merge, and Dependabot's `target-branch` lines go with it; record the date); a second approver is added
(CODEOWNERS, `approvers.json`, the rulesets and the change-management policy change together); the final pass commits
the `git push` deny and the sandbox; `publish-content.yml` takes the content publisher's token, before launch; or
GitHub changes a setting this relies on (an environment's reviewers on Team, the rulesets' bypass modes, how stale
approvals are dismissed).
