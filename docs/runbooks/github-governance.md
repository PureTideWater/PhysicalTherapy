# GitHub governance: protecting the repository, and your approval as the approval of record

For the founder (GitHub `PureTideWater`), the repository's owner. You approved the first version on 2026-10-18 (audit
item #12, "Make your approval and the CI gate real") and, on 2026-10-20, the combined audit's item #20, "Make your
approval, the CI gate and the repository's settings real": a company organization on GitHub Team, a private repository,
your approval on every pull request and the launch switch. The decision is `docs/adr/0063`. The build chose, under your
standing rule, how to carry some of it out: the content publisher (step 7), the second rulesets for `main` and the
release tags (steps 4 and 7) and the launch preparation (step 8). You confirmed the content publisher, the second
rulesets and that only you create release tags on 2026-10-20, and you confirm the launch preparation by doing step 8;
the content publisher comes to you again when you approve the workflow's own pull request under the change order's
rule 4. Every step is something only you can click; the build cannot do any of it. Do them in order. Each step says what
it protects against.

Use github.com in your phone's browser (Safari or Chrome) for steps 1 to 5 and step 8: the GitHub app does not have
these settings. Step 6 works in the GitHub app. Step 7 needs a computer, since it downloads a key file. If a page
looks different from what is written here, look for the same words; GitHub renames menus from time to time.

Below, `<organization>` is the organization's name you choose in step 1, so the repository's address becomes
github.com/<organization>/PhysicalTherapy.

| Step | What | When | About |
| --- | --- | --- | --- |
| 1 | A company organization on GitHub Team, and an Actions budget | now | 15 minutes |
| 2 | Move the repository into it, make it private, and install the Claude app there | right after step 1, once the pull request that added this guide is merged into `claude/build-platform` (2a); at the latest before the first of PR 7's red team, the specialist's golden answers or any real-derived content | 20 minutes |
| 3 | The build agent's own GitHub account, and your account taken out of every Claude session; from 3i the build merges nothing without your approval | after step 2; tell the build sessions before 3f (3e) | 30 minutes |
| 4 | The rulesets for `claude/build-platform`, `main` and the release tags | after step 2, once the pull request that added this guide is merged into `claude/build-platform` | 20 minutes |
| 5 | GitHub requires your approval on every pull request, and `APPROVAL_REVIEW_REQUIRED` | as soon as step 4 is done and step 3's check (3i) shows the agent's login, with no pull request your account opened still open | 10 minutes |
| 6 | Approving a pull request from the GitHub app | every time the build asks | 2 minutes |
| 7 | The content publisher | before launch | 20 minutes |
| 8 | Launch: `claude/build-platform` into `main` | when you decide to launch | 10 minutes |

On 2026-10-20 you ruled for one pull request into `main` that sets Dependabot's settings there and adds the pull request
template; the build opens it after this guide's pull request merges and before step 5 (the section after step 8).

## 1. Create the company's organization on GitHub Team, and set an Actions budget

Protects against: the company's code living in a personal account, and a private repository with no branch
protection or roles.

1. Open github.com and sign in as yourself (`PureTideWater`).
2. Tap your profile picture (top right) → **Your organizations** → **New organization** (or open
   github.com/organizations/plan).
3. Choose **Team**. Organization name: the company's name, for example `paidwhole` (it is part of every link to the
   repository; tell the build the name). Contact email: the company's. **This organization belongs to**: **A business
   or institution**, with the company's legal name. Tap **Next**.
4. Enter the payment card. If GitHub asks how many seats: **2**. It counts everyone with access to a private
   repository: you, and from step 3 the build agent's account. Finish the setup, and skip the screen that offers to
   invite members (step 3 adds the agent to the repository alone).
5. In the new organization: **Settings** → **Authentication security** → turn on **Require two-factor authentication
   for everyone in the organization** → **Save**.
6. **Settings** → **Member privileges** → **Base permissions**: **No permission** → **Save**. Nobody you add later
   sees a repository you have not given them.
7. **Settings** → **Billing and licensing** → **Budgets and alerts** → **New budget**. Product: **Actions**. Amount:
   **$60** a month to start. Turn on **Stop usage when budget limit is reached**. Tap **Create budget**.
8. A week later: **Billing and licensing** → **Usage**, filtered to Actions. Set the budget to what a month of that use
   needs, with room to spare.

Why $60: GitHub Team includes 3,000 Actions minutes a month for private repositories, and 2 GB of storage for what CI
keeps. Measured on this repository on 17 and 18 October: one push to a pull request cost about 35 minutes (the `ci`
check 25 to 35, the image and license checks about 5, `approval-of-record` about 1), so 3,000 minutes was about 85
pushes. In those 34 hours CI used about 1,100 minutes: about 410 for the build's own pull requests, about 340 for
Dependabot's dependency-update pull requests (15 `ci` runs in two bursts), and 360 for one image check that hung until
GitHub stopped it. Every job now stops at its own timeout (5 to 25 minutes for ci's jobs). Since ci's jobs run in
parallel behind one gate (docs/adr/0066), a push finishes in about 10 minutes instead of 35 but bills about as many
runner minutes, about 45 on a public repository's runners. On a private repository's 2-CPU runners, which run six
database shards and three end-to-end shards, plan on about 70 to 80 a push, plus the capacity measurement's 13 to 16 on
a pull request that touches a watched path (docs/runbooks/ci.md, "A private repository"): about twice the public rate,
which step 8 above reads after the first week. Plan on the build's own rate, about 300 minutes a day as measured while
public: the included minutes last about ten days, and a month needs about 6,000 more. GitHub charges under a cent a
minute for the Linux machines CI runs on (the billing page shows today's price), so $60 buys more than 6,000 minutes;
if the private runners double the rate, the week's reading shows it, and the budget follows. With a $0 budget, or one
too small, CI stops when the minutes run out, and with step 4's required checks nothing merges until the next month.
The build tells you if a month is running short.

If you upgraded your own account to GitHub Pro under this guide's first version: once step 2 is done, the
organization's plan is the one that counts for this repository, and you can downgrade your own account if nothing
else needs Pro.

Check: the organization's **Billing and licensing** shows "GitHub Team" and your Actions budget.

## 2. Move the repository into the organization, make it private, and give the build access there

Protects against: anyone on the internet reading the code, its history and its security design, PR 7's red team
publishing working attack paths before they are fixed, and the specialist's golden answers or any content derived from
real files being public. Whichever of those comes first, this step comes before it.

What it changes for the build:

- The repository's address becomes github.com/<organization>/PhysicalTherapy. GitHub redirects the old address for
  links and git, but the build points every clone at the new one, so nothing depends on the redirect.
- The Claude app reaches a repository through its installation on the account that owns it. After the move that is
  the organization, so the app must be installed there (2e), or every build session loses the repository.
- A build session opened on the old address may not reach the new one; the build replaces it with a new session.
- Staging's pull-request-diff role, which CI may use to compare the infrastructure, trusts GitHub's tokens for
  `repo:PureTideWater/PhysicalTherapy:pull_request` (`infra/lib/environments.ts`; ADR 0012). After the move GitHub
  issues them for `repo:<organization>/PhysicalTherapy`, so the build changes that name, and ADR 0012's text, in a pull
  request right after 2g, never before, and redeploys staging's role if one is deployed.
- Release images publish from then on under `ghcr.io/<organization>/physicaltherapy/web` and `/worker`; the ones
  published before the move stay under your personal account's packages. A deploy's `ImageTag` names a release built
  after the move.
- What the build needs from you to keep access: the Claude app installed on the organization (2e), your approval for the
  organization of anything the build uses that reaches GitHub as an OAuth app (2f), and, from step 3, the agent's Write
  role (3c). Nothing else from you.

What it costs: a private repository no longer gets GitHub's own secret scanning and push protection unless you add
GitHub Secret Protection. The secret checks stay CI's gitleaks scan in every pull request's `static` job and the pre-push
hook (`.githooks/pre-push`), which every build session installs when it starts. CI runs the same pinned gitleaks the
hook runs, so the move changes nothing for it once the pull request that added this guide is merged (2a); the gitleaks
GitHub Action, which CI used before, needs a paid licence key for an organization's repository and fails every CI run
still on it from the move.

**2a. First, the pull request that added this guide is merged, and every build session told.** Ask the build: "Is the
pull request that added the GitHub governance runbook merged into `claude/build-platform`?" Do not go on to 2b until it
says yes; if it is still open, the build merges it first. It replaces the gitleaks GitHub Action in CI, which fails the
CI of every pull request in a repository an organization owns unless a paid licence key is set: transferred before
it is merged, every other open pull request's CI goes red. Once it is merged, the build brings
each open pull request up to date with `claude/build-platform`, so its next CI run runs the new scan. Then send every
build session: "Push what you have and pause; I am moving the repository to <organization>." Wait until each says it
has paused.

**2b. Transfer it.** Open github.com/PureTideWater/PhysicalTherapy → **Settings** (in the tab bar under the repository
name; on a phone, swipe the tab bar or tap **…**) → stay on **General**, scroll to **Danger Zone** → **Transfer** →
**Select one of my organizations** → the new organization → type `PureTideWater/PhysicalTherapy` to confirm → **I
understand, transfer this repository** (GitHub may ask for your two-factor code).

**2c. Make it private.** Open github.com/<organization>/PhysicalTherapy → **Settings** → **Danger Zone** → **Change
visibility** → **Change to private**. Read the warnings, tap **I want to make this repository private**, then **I have
read and understand these effects**, and confirm.

**2d. Leave the rest as it is.** Pull requests, branches, issues and Actions history move with the repository.

**2e. Install the Claude app on the organization.** Open github.com/apps/claude → **Configure** (or **Install**) →
choose the organization → **Only select repositories** → `PhysicalTherapy` → **Install** (or **Save**). If GitHub asks
an organization owner to approve, that is you.

**2f. Approve, for the organization, anything the build uses that is an OAuth app.** A new organization starts with
GitHub's **OAuth app access restrictions** on: an app that reaches GitHub as an *OAuth app*, rather than as a *GitHub
App* such as the Claude app of 2e, sees none of the organization's private repositories until an owner approves it, so
it would lose this repository at the move. How to tell: signed in as yourself, open github.com/settings/applications.

- The **Authorized GitHub Apps** tab lists GitHub Apps. Claude there is the app of 2e, which the restriction does not
  touch: nothing to do for it.
- The **Authorized OAuth Apps** tab lists OAuth apps. If Claude, Anthropic or anything else the build uses is listed
  there (the claude.ai GitHub connector may be), tap it → under **Organization access**, next to the organization, tap
  **Grant** (you are an owner, so it is **Grant**, not **Request**) → confirm. If nothing the build uses is listed there,
  there is nothing to do.
- Either way, open the organization's **Settings** → **Third-party access** → **OAuth app policy** (also at
  github.com/organizations/<organization>/settings/oauth_application_policy): it lists each app a member or collaborator
  has asked for. Grant any the build uses (Claude, Anthropic, or an app the build names), and nothing else. Leave the
  restrictions themselves on.

The sign that one was missed: a build session reports that the connector cannot find the repository ("Not Found") while
git still works, or an error that says the organization "has enabled OAuth App access restrictions". Then do 2f for that
app, and the build checks again. Step 3 connects the agent's account to the same apps (3f, 3g); an approval here is
for the app, whichever account authorizes it, and 3i checks it.

**2g. Resume.** Tell the build sessions: "Resume. The repository is now <organization>/PhysicalTherapy." The build
points every clone at the new address and reports a fetch and a push there; a session that cannot reach it ends, and
the build carries on in a new session opened on the new address (on claude.ai/code, pick the repository under the
organization's name).

Check: the repository shows a **Private** label under the organization's name, and the build reports its push to the
new address.

## 3. Create the build agent's own GitHub account, and take yours out of every Claude session

Protects against: the build acting with your powers. Today every Claude session works as your account, so it could
change these settings or approve in your name, and your own review cannot count, since GitHub does not let a pull
request's author approve it. Afterwards the agent's account has Write: it can push branches and tags, open pull
requests, and re-run or cancel workflow runs, but cannot change a setting, and step 4's rulesets keep it from changing
either protected branch except through a pull request, and from creating, moving or deleting a release tag. No Claude
session holds yours.

**3a. Create the account.** In a private browser tab (so you stay signed in as yourself elsewhere), open
github.com/signup.

- Email: an address no other GitHub account uses (a new mailbox, or an alias your email provider gives you). Write it
  in your password manager.
- Password: a new one from your password manager.
- Username: for example `paidwhole-build`. Tell the build session the name you chose.
- Verify the email when GitHub sends the code. GitHub's terms allow each person one free "machine account"; this is it.

**3b. Turn on two-factor.** Still signed in as the new account: profile picture → **Settings** → **Password and
authentication** → **Enable two-factor authentication** → **Authenticator app**. GitHub shows a QR code. On a phone the
code is on the same screen as your authenticator app, so it cannot be scanned: tap **setup key** under the code, copy
the key, and in the authenticator app choose to add an account by entering a setup key (or scan the code with a second
device). Enter the six digits → **Download** (or copy) the recovery codes into your password manager → **I have saved
my recovery codes** → **Done**. (A passkey from your password manager works as the second factor too.) The
organization requires two-factor (step 1), so the invitation in 3c waits for it.

**3c. Give it the repository, with Write.** Signed in as yourself: github.com/<organization>/PhysicalTherapy →
**Settings** → **Collaborators and teams** (under "Access"; GitHub may ask for your two-factor code) → **Add people** →
type the new username → select it → role **Write** → **Add**. It joins as an outside collaborator: it sees this
repository and nothing else in the organization, can push and open pull requests, and cannot change settings. It takes
the plan's second seat.

**3d. Accept the invitation.** In the private tab, signed in as the new account, open the invitation email, or
github.com/<organization>/PhysicalTherapy/invitations → **Accept invitation**.

**3e. Tell every build session first.** The GitHub connection belongs to your Claude account, so it changes for every
Claude session at once. In each Claude session that is building, send: "Finish the pull request you are on. Then merge,
or close, every open pull request my account opened, push what you have, and pause; I am switching your GitHub identity
to <username>, and a new session will carry on." Wait until each says it has paused. Then open
github.com/<organization>/PhysicalTherapy/pulls and check that no open pull request was opened by `PureTideWater`
(Dependabot's are fine). Why: a pull request keeps the account that opened it as its author, whoever pushes to it later.
One opened as you can never get your approval (GitHub refuses an author's own), so after step 5 it could never merge. A
closed one is opened again by the agent's account after the switch.

3f and 3g are two different connections on two different claude.ai pages, and both must end up on the new account.
3f is the one Claude's build sessions clone, push and run `gh` with. 3g is Claude's GitHub *connector*, which gives a
session GitHub tools. Doing 3g does not undo 3f, and 3f does not change the connector.

**3f. Connect the new account to Claude's build sessions (git and `gh`).** In the private tab (GitHub signed in as the
new account), open https://claude.ai/connect-github, sign in to Claude as yourself if asked, and follow the prompts to
connect GitHub. If the page shows your own GitHub account, sign out of GitHub in that tab, sign in as the new account,
and open the link again. If GitHub offers to install the Claude app for the new account, choose **Only select
repositories** and select none, or skip it: the app is installed on the organization (2e), and that is how the new
account reaches the repository.

**3g. Switch Claude's GitHub connector to the new account.** The build needs the connector: it opens its pull requests,
reads their checks and review state, and merges them with it (the build's own hooks refuse its review and file-writing
tools). What it needs is the connector authorized as the new account, which reaches the repository through its Write
role (3c), and, if the connector is an OAuth app, approved for the organization (2f). Still in the private tab, signed
in to GitHub as the new account, on claude.ai: **Settings** → **Connectors** → **GitHub** → **Disconnect** (this
disconnects only the connector, connected to your account until now; 3f's connection stays). Then **Connect** on the
same row. GitHub's page names the account it will authorize at the top: it must be the new username; if it names
yours, cancel, sign out of GitHub in that tab, sign in as the new account, and connect again. Tap **Authorize**.
(Connected to your account, the connector's tools would act as you; connected to the agent's, they act as the agent,
whose Write role cannot change a setting or count as your approval.)

**3h. Revoke Claude's access to your own GitHub account.** In your normal browser, signed in to GitHub as yourself:
profile picture → **Settings** → **Applications** → **Authorized GitHub Apps**: next to Claude (or Anthropic), tap
**Revoke** and confirm. Then the **Authorized OAuth Apps** tab: the same, if it is listed there. Leave the Claude app
installed on the organization (2e), and leave 2f's approvals as they are: they are the organization's, not your
account's. If the Claude app is also listed under your own account's **Installed GitHub Apps**, it no longer reaches
this repository; remove it there only if no other repository of yours needs it.

**3i. Check the new identity in a new session, then resume there, and start approving.** Do the check first, and resume
only in new sessions.

1. End every Claude session that was open before 3f: one may still hold your account until it ends. None of them
   resumes.
2. Start a new Claude session for the build and send: "Before anything else, report the output of `gh api user --jq
   .login`, the login the GitHub connector's get_me returns, and how many open pull requests the connector lists for
   <organization>/PhysicalTherapy."
3. Read the answer:
   - Both logins are the new username, and the connector gives a number (0 counts): go on to 4.
   - Either login is `PureTideWater`: repeat 3f to 3h, end this session, and check again in another new one.
   - `gh` reports an error (such as "Bad credentials", "HTTP 401" or "not logged in") or no login, or the connector
     reports an error, gives no login or is missing from the session: that connection did not take. Repeat 3f (and 3g,
     if the connector is the one that failed), end this session, and check again in another new one. Do not go on to 4
     or start step 5 until a new session reports the new username from both.
   - Both logins are right, but the connector cannot list the pull requests ("Not Found", or a message about OAuth App
     access restrictions): do 2f for the app the new account authorized in 3g, and ask the same session again.
4. Then tell that session: "Resume as <username>." Every build session from now on is a new one, and reports the two
   logins before it works; the build never resumes in a session opened before 3f. From now on the build merges no
   pull request until you have approved its latest commit, even before step 5 makes GitHub require it: approve each
   one as step 6 says, about two minutes each. Tell the build today's date; it records it in `docs/adr/0063` as the
   day your approvals began, and the first quarterly review checks every pull request merged from it.

**3j. Check the build's next pull request.** Its page says "<username> wants to merge ...". If it names
`PureTideWater`, tell the build to stop, and go back to 3i.

## 4. Protect `claude/build-platform`, `main` and the release tags

Protects against: a force push or a deletion rewriting either branch, a direct push to either, a merge into the build
branch with a failing, missing or out-of-date check, and a release tag on a commit you never approved, by anyone, you
included.

Do this after step 2 and after the pull request that added this guide is merged into `claude/build-platform`, so the
`approval-of-record` check exists. It need not have reached `main`: a pull request from `claude/build-platform` into
`main` brings the workflows with it.

`main` holds only the plan files until launch, with no workflows, so its rulesets require no check until then: a check
that cannot run there would block every pull request into it, a repair like #18 included. Step 8 adds the required checks
once the launch pull request is open. No ruleset requires an approval yet: until step 3, your account opens the build's pull requests and cannot
approve them. From 3i the build waits for your approval anyway, and step 5 makes GitHub require it on both branches.

**4A. The build branch.**

1. github.com/<organization>/PhysicalTherapy → **Settings** → **Rules** → **Rulesets** (under "Code and automation") →
   **New ruleset** → **New branch ruleset**.
2. **Ruleset name**: `Protect the build branch`.
3. **Enforcement status**: **Active**.
4. **Bypass list**: leave it empty. Do not add yourself or "Repository admin": the rules hold administrators too.
5. **Target branches** → **Add target** → **Include by pattern** → type `claude/build-platform` → **Add inclusion
   pattern**.
6. **Rules**: turn on exactly these, and leave every other rule off.
   - **Restrict deletions**.
   - **Require a pull request before merging**, with **Required approvals** at **0** for now. Leave its four options off
     for now ("Dismiss stale pull request approvals when new commits are pushed", "Require review from Code Owners",
     "Require approval of the most recent reviewable push", "Require conversation resolution before merging"); step 5
     turns two of them on. Leave the allowed merge methods as they are, with **Merge commit** among them: step 8
     needs it.
   - **Require status checks to pass**, with **Require branches to be up to date before merging** on. Tap **Add
     checks** and add these four, one at a time. After adding each, set its source (the menu beside it, which starts
     at "any source") to **GitHub Actions**. Every one must have that source: a check from any source can be faked by
     anyone who can push, with a plain status of the same name.
     <!-- required-checks -->
     - `all green` (from the ci workflow: it passes only when every ci job passed, the image and license checks and
       every database and end-to-end shard among them)
     - `mutation` (from the mutation workflow)
     - `screening-capacity gate` (from the screening-capacity workflow; it passes at once when the pull request
       changes nothing the capacity test watches)
     - `approval-of-record` (from the approval-of-record workflow; it passes until step 5, and says why)
     <!-- /required-checks -->

     On a pull request's checks list they appear as "ci / all green (pull_request)", "mutation / mutation
     (pull_request)" and so on; in the ruleset they are the names above. A required check is matched by its name and
     its source alone, never by the workflow that reports it, so no other job of any workflow may carry one of these
     names (`tools/test/workflows.test.ts` refuses one). Add them once the build tells you the pull request that made
     `all green` (docs/adr/0066) has passed its first run on `claude/build-platform`: added before that, the ruleset
     would wait for a check no workflow reports yet. The other jobs (`static`, `db (1/4)` and the
     rest) are not added: `all green` holds them all, so adding a shard by name would block every pull request the day
     the number of shards changes.
   - **Block force pushes**.
7. Tap **Create**.

**4B. `main`, in two rulesets.** A ruleset's bypass reaches every rule in it, and step 7 gives the content publisher a
bypass on `main`'s pull-request rule, so the rules that keep `main`'s history are a ruleset of their own that nothing
ever bypasses.

1. **Rulesets** → **New ruleset** → **New branch ruleset**.
2. **Ruleset name**: `Protect main history`. **Enforcement status**: **Active**. **Bypass list**: empty, now and always.
3. **Target branches** → **Add target** → **Include default branch** (or **Include by pattern** → `main`).
4. **Rules**: turn on **Restrict deletions** and **Block force pushes**, and nothing else.
5. Tap **Create**.
6. **New ruleset** → **New branch ruleset** again. **Ruleset name**: `Protect main`. **Enforcement status**: **Active**.
   **Bypass list**: empty (step 7 adds the content publisher).
7. **Target branches**: the default branch, as in 3.
8. **Rules**: turn on **Require a pull request before merging** only, with **Required approvals** at **0** for now
   (step 5 raises it), and leave every other rule off, status checks included.
9. Tap **Create**.

**4C. The release tags, in two rulesets.** A tag named `v…` starts the release workflow, which builds the images a
deploy takes, so only you create one, and no one moves or deletes one.

1. **Rulesets** → **New ruleset** → **New tag ruleset**. **Ruleset name**: `Release tags: only the founder creates
   them`. **Enforcement status**: **Active**. **Bypass list** → **Add bypass** → **Repository admin** (the role; you are
   the repository's only administrator) → mode **Always**. **Target tags** → **Add target** → **Include by pattern** →
   `v*` → **Add inclusion pattern**. **Rules**: **Restrict creations** only. Tap **Create**.
2. **New ruleset** → **New tag ruleset** again. **Ruleset name**: `Release tags are permanent`. **Enforcement status**:
   **Active**. **Bypass list**: empty. **Target tags**: `v*`, as in 1. **Rules**: **Restrict updates**, **Restrict
   deletions** and **Block force pushes**. Tap **Create**.

You create a release tag when the build asks, after the release's pull request has merged into `main`: **Releases** →
**Draft a new release** → **Choose a tag** → type the tag the build gives (for example `v1.4.0`) → **Create new tag on
publish** → **Target**: `main` → **Publish release**. Before launch there is nothing to release.

Check: **Rulesets** lists five, all Active: "Protect the build branch", "Protect main history" and "Protect main", each
targeting 1 branch, and the two release-tag rulesets, each targeting `v*`. Open "Protect the build branch": each of the
four checks shows **GitHub Actions** as its source, not "any source". "Protect main history" and "Release tags are
permanent" list no bypass. On the next pull request into the build branch, the merge button stays grey until the four
checks are green and the branch is up to date.

What a required check cannot stop: a collaborator with Write, the build agent included, can produce a check with the
same name from a workflow on a branch it pushes, and GitHub Actions is then its source too. The checks catch mistakes
and a missed approval; what holds a change to the workflows, the approval and the code that runs the gate is your own
review, from 3i.

Three effects to know:

- A pull request whose branch is behind its base must be brought up to date (**Update branch**) before it merges,
  and its checks run again. The build does this.
- From 3i the build merges nothing without your approval, though GitHub requires it only from step 5. Before 3i a pull
  request into the build branch merges on its green required checks (reconciliation 001, D4 (a)). A pull request into `main`
  waits for your ruling either way, and only a pull request can change either branch.
- The `publish-content` workflow pushes content releases to `main` directly, and "Protect main" refuses that push. It
  runs only from `main`, which has no workflows until launch, so nothing is refused yet; step 7 sets up the one
  account allowed to make that push.

## 5. After the switch: require your approval on every pull request

Protects against: any change, Dependabot's included, merging into either branch without your approval of its latest
commit; and an approval line or approver list merging without your review of the commit that holds it.

Do this as soon as step 4 is done, step 3's check (3i) shows the agent's login, and no open pull request was opened by
your account (3e). Not before: GitHub refuses an author's own review, so while your account authors a pull request, these settings
block it.

1. **Settings** → **Rules** → **Rulesets** → **Protect the build branch** → **Require a pull request before merging**:
   - set **Required approvals** to **1**;
   - turn on **Dismiss stale pull request approvals when new commits are pushed**;
   - turn on **Require review from Code Owners**: `.github/CODEOWNERS` names you for every path, so the one approval
     must be yours, never another account's with Write, such as the agent's on a Dependabot pull request;
   - leave **Require approval of the most recent reviewable push** off: when you commit the approval line yourself
     (step 6), your commit is the latest push, and you then approve it;
   - tap **Save changes**.
2. **Rulesets** → **Protect main** → **Require a pull request before merging**: the same four settings → **Save
   changes**. `main` has no `.github/CODEOWNERS` until launch, and GitHub reads code owners from the branch a pull
   request merges into, so until launch the one approval is what holds `main`. The agent authors every pull request
   into `main` and never reviews one (its account could, with a shell command no hook reads; CLAUDE.md forbids it), and
   none goes into `main` before launch without your ruling. Dependabot's version updates go to the build branch. Its
   security updates always open against the default branch, `main`, which holds no manifest, lockfile, Dockerfile or
   workflow until launch, so none opens there; if one ever did, it waits for your ruling like any other pull request
   into `main`, and the build neither approves nor merges it. From the launch merge, Code Owners review applies there
   too, with nothing more to set.
3. **Settings** → **Secrets and variables** → **Actions** → the **Variables** tab → **New repository variable**:
   - **Name**: `APPROVAL_REVIEW_REQUIRED`
   - **Value**: `true` (a capital letter from your phone's keyboard is fine: the check reads `True` too)
   - Tap **Add variable**.
4. Tell the build the date. It records it in `docs/adr/0063` beside 3i's: from 3i every pull request waited for your
   approval because the build waits, and from this date GitHub requires it too. The change-management policy's
   quarterly review checks every pull request merged from 3i's date.

Check: on the next pull request, open **Checks** → **approval-of-record**. It no longer says "not yet enforced", and
the merge button stays grey until you approve. A pull request that changes the approval line or
`packages/db/domain-model/approvers.json` also shows **approval-of-record** red until you approve its latest commit.

From then on every pull request waits for you, about two minutes each from the GitHub app (step 6). The build brings a
pull request up to date and waits for its checks before it asks you. If it has to bring the branch up to date after
you approved, GitHub may ask you to approve again; the build says so.

To undo any of it, edit the ruleset again, or delete the variable (or set it to `false`). Only an administrator (you)
can; the build agent cannot.

## 6. Approve a pull request from the GitHub app

Protects against: approving text you have not seen. Your review counts only for the commit you approved, and a
domain-model pull request opens with every change since your last approval, the security changes first.

Install the GitHub app (App Store or Google Play) and sign in as yourself, never as the build agent.

**Any pull request:**

1. Tap the notification, or **Home** → **Pull requests**, and open the pull request.
2. Read the description. The build fills it in from `.github/pull_request_template.md`: what changes, why, what it
   does not change, the checks, the reviewer agents' findings and how each was resolved, the freeze-exception answer
   and, for a migration, the domain model's SHA-256. (GitHub offers that template only from `main`, which has none until
   launch, so until then the build fills it in because CLAUDE.md says so, and the quarterly review checks that it did.)
   Scroll to the checks at the bottom: green ticks, or what is still running.
3. Tap **Files changed** to look at the change if you want to.
4. Tap **Review** (top right of Files changed; on some versions, the **…** menu → **Review changes**) → **Approve** →
   add a comment if you like → **Submit**. If something is wrong, choose **Request changes** and say what.
5. When every check is green, the build merges it. You do not need to.

**A pull request that asks you to approve the domain model** (it regenerates `docs/product/domain-model.md`):

1. Read **Changes since the last approved document** in the `domain model` check's summary (in the browser:
   **Checks** → **ci** → **domain model** → **Summary**): row-level security, policies, the PHI registry and grants
   come first, then tables, columns, constraints, functions, triggers and the divergence rows, one line each, with the
   old and new document SHA-256. Below them, **Function definitions changed since** (docs/adr/0068) opens with one
   line saying `--check`, a step of the same job, proves the function files equal the migrated database; then a list
   of every database function file the pull request changes, with how many lines it adds and removes, the ones marked
   "SECURITY DEFINER, tenant scope, privileges or PUBLIC" first; then **Diffs**, each file's changed lines (removed in
   red, added in green), including a change to a function's grants or settings that the one-line list above cannot
   show. If the change is very large, the Diffs stop at a size limit and one line names the files left out: read those
   in **Files changed**. That copy is the one that counts: the code wrote it. The build also puts the summary at the
   top of the description, with the same list but without the Diffs (a description holds at most 65,536 characters),
   and the build wrote that copy: compare the two lists, and if they, or anything else in the two copies, differ,
   request changes. If anything surprises you, request changes. **Files changed** shows every one of those lines:
   under `packages/db/functions`, one file per changed function, listed above the migration. Those files are
   generated, never edited by hand, and your approval is still of the document, by its hash.
2. Sign the approval line yourself. The build posts the exact line, with your name, today's date and the document's
   SHA-256, as a suggested change: one comment on the document's approval line, posted with the GitHub API, which
   GitHub records as a comment (never an approval or a request for changes); its edit tools refuse to write the line
   itself. Open the pull request in your phone's browser (github.com), find the suggestion on **Conversation**, and tap
   **Commit suggestion** → **Commit changes**. (If the app shows a **Commit suggestion** button, that works too.)
3. Wait a moment for the page to show your commit as the latest. Then approve as above (**Review** → **Approve** →
   **Submit**). Your approval of that commit is the approval of record: the `approval-of-record` check turns green,
   and the `domain model` check in `ci`, and with it `all green`, passes once its run on your commit finishes.
4. If the build pushes anything after your approval, GitHub dismisses it (step 5) and the check goes red again:
   approve the new latest commit.

## 7. Before launch: the content publisher

Protects against: content releases that cannot be published once `main` refuses direct pushes, without opening
`main` to anyone else.

This is the build's choice under your standing rule (item #20 asks that `main` stay protected, not how releases reach
it); you confirmed it on 2026-10-20, and the workflow's own pull request asks for your confirmation again under the
change order's rule 4.

Why: after launch, when a merged pull request adds a release under `content/outgoing/`, the `publish-content` workflow
on `main` runs the content checks again, moves the release to `content/releases/<n>`, commits and tags it, and pushes to
`main`. "Protect main" refuses that push from everyone. The content publisher is a GitHub App the organization owns,
with one permission (the repository's contents), installed on this repository alone, and the only bypass of "Protect
main" and of creating a content release tag; "Protect main history" and the rule that keeps release tags where they are
have none, so not even the publisher can rewrite or delete `main` or move a release's tag. Its key is a secret of an
environment that only a workflow running on `main` can read, so no branch, pull request or person can use it. The build
changes `publish-content.yml` to push with it, in a pull request you approve; that pull request touches the content
pipeline's workflow, so it also asks for your confirmation under the change order.

Do it on a computer: 7b downloads a key file.

**7a. Create the app.** github.com/organizations/<organization>/settings/apps → **New GitHub App**.

- **GitHub App name**: `<organization> content publisher`.
- **Homepage URL**: github.com/<organization>/PhysicalTherapy.
- **Webhook**: untick **Active**.
- **Repository permissions** → **Contents**: **Read and write**. Leave every other permission at **No access**
  (**Metadata** stays read-only, as GitHub requires).
- **Where can this GitHub App be installed?**: **Only on this account**.
- Tap **Create GitHub App**, and note the **App ID** at the top of the page.

**7b. Make its key.** On the app's page: **Private keys** → **Generate a private key**. Your computer downloads a
`.pem` file. Keep it only until 7d.

**7c. Install it.** **Install App** (left menu) → **Install** beside the organization → **Only select repositories** →
`PhysicalTherapy` → **Install**.

**7d. Give the key to `main` alone.** github.com/<organization>/PhysicalTherapy → **Settings** → **Environments** →
**New environment** → name `content-publish` → **Configure environment**.

- **Deployment branches and tags**: **Selected branches and tags** → **Add deployment branch or tag rule** → `main` →
  **Add rule**.
- **Add environment secret**: name `CONTENT_PUBLISHER_KEY`; value: open the `.pem` file in a text editor and paste
  all of it → **Add secret**.
- **Add environment variable**: name `CONTENT_PUBLISHER_APP_ID`; value: the App ID → **Add variable**.
- Delete the `.pem` file from your computer, and empty the trash. GitHub keeps no copy; a new key can be generated if
  one is ever needed (and the old one deleted on the app's page).

**7e. Let the publisher past `main`'s pull-request rule.** **Settings** → **Rules** → **Rulesets** → **Protect main**
(not "Protect main history") → **Bypass list** → **Add bypass** → the content publisher → mode **Always** → **Save
changes**.

**7f. Protect the content release tags, in two rulesets.** **Rulesets** → **New ruleset** → **New tag ruleset**. Name:
`Content release tags: only the publisher creates them`. **Enforcement status**: **Active**. **Bypass list**: the
content publisher, **Always**. **Target tags** → **Add target** → **Include by pattern** → `content-release-*`.
**Rules**: **Restrict creations** only. Tap **Create**. Then **New tag ruleset** again: name `Content release tags are
permanent`, **Active**, **Bypass list** empty, the same target, and **Restrict updates**, **Restrict deletions** and
**Block force pushes**. Tap **Create**.

Check: **Environments** shows `content-publish` with one secret, one variable and `main` as its only branch; "Protect
main" and "Content release tags: only the publisher creates them" each list one bypass, the content publisher; "Protect
main history", "Content release tags are permanent", "Release tags are permanent" and "Protect the build branch" list
none.

## 8. Launch: `claude/build-platform` into `main`

Protects against: the launch merging unchecked or unapproved, and `main` being anything but the protected default
afterwards.

The build asks for your ruling first; until then nothing goes into `main`.

Why the launch needs a preparation: #18 took `main` back to the plan files by reverting #7, so `main` is not an ancestor
of the build branch. A merge of the build branch into `main` would take that revert as `main`'s newer change and delete
most of the build (a trial merge on 2026-10-20 kept 174 of the 2,420 files), and a merge of `main` into the build branch
that resolves the conflicts does the same. The preparation makes `main` an ancestor without changing a file of the
build.

1. **The preparation.** The build opens a pull request into `claude/build-platform` from a branch whose first commit is
   `git merge -s ours origin/main`: it records `main` as a parent and keeps the build's files exactly (its diff against
   the build branch is empty). Its second commit adds lines to `.gitleaksignore`: that merge's remerge diff re-adds
   every file an ordinary merge would drop, and gitleaks finds in it the test values already reviewed and listed under
   earlier commits; the build checks that every finding is one of those, at the same file, rule and line, and lists each
   again under the merge's own hash (any other finding stops the preparation). Approve it as in step 6. The build merges
   it with **Create a merge commit**, never squash or rebase, which would drop `main` as a parent.
2. The build checks `git merge-base --is-ancestor origin/main origin/claude/build-platform`, then opens one pull request
   from `claude/build-platform` into `main`, filled in from the template. Of `main`'s 11 files, the build branch has
   changed `README.md`, `.github/dependabot.yml`, `.github/pull_request_template.md`, `docs/product/PRD.md` and
   `docs/product/test-matrix.md` (the other six plan files are the same), and the build's copies replace `main`'s;
   every other file of the build is new to `main`. It brings the workflows,
   `.github/CODEOWNERS`, the approver list, the pull request template and the build branch's Dependabot settings, which
   have no `target-branch` lines, so from the merge on Dependabot opens its updates against `main`. If `main` changes
   after the preparation (a pull request you ruled on), the build repeats step 1 rather than tap **Update branch** on
   the launch pull request, which would push a merge to `claude/build-platform`, and its ruleset refuses that.
3. When the build tells you the launch pull request is open, and not before: **Rulesets** → **Protect main** → turn on **Require status
   checks to pass**, with **Require branches to be up to date before merging** on, and add the same four checks as 4A,
   each with the source **GitHub Actions** → **Save changes**. They run on the launch pull request itself, since its
   workflows come with it. Added any earlier, they would block every other pull request into `main` until launch,
   since `main` holds no workflow to run them (a repair like #18 among them).
4. Approve the launch pull request at its latest commit (step 6). `approval-of-record` judges it against the build branch's approver list,
   since `main` has none until the merge. The build merges it with **Create a merge commit** once the four checks are
   green.
5. Leave **Settings** → **General** → **Default branch** at `main`. From then on every pull request targets `main`, Code
   Owners review reads `main`'s CODEOWNERS, and GitHub offers the pull request template. `claude/build-platform` keeps
   its ruleset and takes no new pull requests. Check that **Settings** → **Code security** → **Dependabot security
   updates** is on: from the merge `main` holds the product's manifests, so alerts and security updates cover them.
6. Tell the build the date; it records it in `docs/adr/0063`.

## Dependabot's settings on `main`: your ruling of 2026-10-20

Dependabot reads `.github/dependabot.yml` from the default branch, `main`, never from `claude/build-platform`. So the
grouping and limits the pull request that added this guide put on the build branch take effect only when `main`'s copy
changes, and the build opens no pull request into `main` before launch unless you rule on one. On 2026-10-20 you ruled
for this one: the build opens it after the pull request that added this guide merges and before step 5, and it merges on
your approval. GitHub reads `.github/pull_request_template.md` from `main` too, so until launch it offers none on the
pull request form; the build fills the template in because CLAUDE.md tells it to.

Until then `main`'s copy stays in force: npm minor and patch updates in one pull request, up to 10 open; each action
and each base image in a pull request of its own, up to 5 open each (Dependabot's default). Each runs about 10 minutes
of ci (about 35 before docs/adr/0066), plus the capacity measurement on a watched path, and, after step 5, needs your
approval.

The build opens one pull request into `main` that changes `.github/dependabot.yml` and adds
`.github/pull_request_template.md`. Its branch is cut from `main`, which has no pre-push hook until launch, so the build
pushes it from its checkout of the build branch, where the hook runs over the branch's commits (`git push origin
<branch>`; a push from the branch's own checkout is refused), and never merges `claude/build-platform` into it. The
change is only this:

- npm: at most 5 open at once (today 10);
- actions: every action update in one pull request, at most 2 open;
- base images: both images' updates in one pull request, at most 2 open;
- every `target-branch: claude/build-platform` line stays, so updates still go to the build branch.

<details>
<summary>The exact text <code>main</code>'s copy would have</summary>

```yaml
# Dependabot reads this file from the default branch (main). Until launch the build lives on
# claude/build-platform, so every update is opened against it and passes the build's CI there.
# Every pull request runs about 35 minutes of CI, so updates are grouped and few are open at once
# (docs/adr/0063). At launch, when the finished build merges into main, target-branch is removed.
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    target-branch: claude/build-platform
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      minor-and-patch:
        update-types: [minor, patch]

  - package-ecosystem: github-actions
    directory: /
    target-branch: claude/build-platform
    schedule:
      interval: weekly
    open-pull-requests-limit: 2
    groups:
      actions:
        patterns: ["*"]

  - package-ecosystem: docker
    directories: [/apps/web, /apps/worker]
    target-branch: claude/build-platform
    schedule:
      interval: weekly
    open-pull-requests-limit: 2
    groups:
      base-images:
        patterns: ["*"]
```

</details>

The same pull request brings `.github/pull_request_template.md`, so GitHub offers it on every pull request before
launch. At launch, the launch pull request brings the build branch's copies of both (step 8).

## What the build does, and what only you do

| The build | Only you |
| --- | --- |
| Opens pull requests as its own account (after step 3), fills in the template, keeps branches up to date, and from 3i merges only once you have approved and the checks are green | Steps 1 to 8 and any change to them |
| Regenerates the domain model; ci's `domain model` check writes the summary, and the build copies it to the description | Commits the approval line (from the build's suggestion) and approves the pull request |
| Proposes changes to CODEOWNERS, the workflows or this runbook in a pull request | Approves those pull requests |
| Never writes an "Approved by:" line or `approvers.json` itself: its edit tools refuse it; it posts the text as a suggested change, in one comment on the approval line posted with the GitHub API (`gh api .../pulls/<n>/comments`), since a hook refuses the connector's review tools | Commits that suggestion, and approves the pull request |
| Never approves a pull request or requests changes on one: what it posts on a pull request is a comment, a hook refuses the GitHub connector's review tools, and after step 3 no Claude session holds your account | Reviews, from your own account |
| Opens no pull request into `main` before launch unless you rule on it, and never approves or merges one Dependabot opens there | Rules on it, and on the launch |
| Tells you when a setting here needs to change | Changes the rulesets, the variable, the environment and the account settings, and decides when to set or remove `APPROVAL_REVIEW_REQUIRED` |
| Lists the pull requests merged each quarter | Engages someone independent of the build for the quarterly review of a sample of them (the change-management policy, rule 9) |
| Installs the pre-push hook and the pinned gitleaks in every session when it starts (`.claude/hooks/session-start.sh`; `pnpm hooks:install` and `pnpm gitleaks:install` in any other clone), writes files only in its checkout and pushes them with git (its GitHub tools refuse to write files), so a real file or a secret is refused before it reaches GitHub; pushes a branch cut from `main` from its checkout of the build branch, where the hook runs; a refused push is rewritten, never sent past the hook with `--no-verify` | Nothing: the hook needs no setting of yours |
| Asks you to create each release tag after the release's pull request has merged into `main`, and checks before a deploy that the tag's commit is on `main` | Creates release tags (4C) |
| Renews `security.txt`'s expiry date when the quarterly review says fewer than 120 days remain | Nothing |

The hooks guard the build's edit and GitHub tools, not a shell command it runs. Until step 5, an approval line is only
as trustworthy as the commit that wrote it; from step 5, what makes an approval count is your GitHub review of the
latest commit, which only your account can give.
