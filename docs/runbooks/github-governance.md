# GitHub governance: protecting the repository, and your approval as the approval of record

For Tyler Williams (GitHub `PureTideWater`), the repository's owner. You approved this on 2026-10-18 (audit item #12,
"Make your approval and the CI gate real"; the decision is `docs/adr/0063`). Every step is something only you can
click; the build cannot do any of it. Do them in order, on a phone or a computer. Each step says what it protects
against.

Use github.com in your phone's browser (Safari or Chrome) for steps 1 to 5: the GitHub app does not have these
settings. Step 6 works in the GitHub app. If a page looks different from what is written here, look for the same
words; GitHub renames menus from time to time.

| Step | What | When | About |
| --- | --- | --- | --- |
| 1 | GitHub Pro and an Actions budget | now | 10 minutes |
| 2 | Make the repository private | right after step 1 | 2 minutes |
| 3 | The build agent's own GitHub account, and your account taken out of every Claude session | now; tell the build sessions before 3f (3e) | 30 minutes |
| 4 | The rulesets for `claude/build-platform` and `main` | after step 1, once the pull request that added this guide is merged into `claude/build-platform` | 15 minutes |
| 5 | Code Owners review, your approval on `main`, and `APPROVAL_REVIEW_REQUIRED` | after step 3's check (3j) shows the agent's login, and no pull request your account opened is still open | 10 minutes |
| 6 | Approving a pull request from the GitHub app | every time the build asks | 2 minutes |

## 1. Upgrade to GitHub Pro and set an Actions budget

Protects against: a private repository with no branch protection (GitHub Free has none for private repositories), and
CI stopping when the free Actions minutes run out.

1. Open github.com and sign in as yourself (`PureTideWater`).
2. Tap your profile picture (top right) → **Settings**.
3. In the settings menu, tap **Billing and licensing** → **Licensing** (on some accounts: **Plans and usage**).
4. Next to "GitHub Free", tap **Upgrade** → choose **Pro** → **Monthly** → enter the payment card → **Upgrade**.
5. Back in **Billing and licensing**, tap **Budgets and alerts** (older screens: **Spending limits**) → **New budget**.
6. Product: **Actions**. Amount: **$60** a month to start. Turn on **Stop usage when budget limit is reached**. Tap
   **Create budget**.
7. A week later: **Billing and licensing** → **Usage**, filtered to Actions. Set the budget to what a month of that use
   needs, with room to spare.

Why $60: Pro includes 3,000 Actions minutes a month for a private repository (Free: 2,000), and 1 GB of storage for
what CI keeps. Measured on this repository on 17 and 18 October: one push to a pull request costs about 35 minutes (the
`ci` check 25 to 35, the image and license checks about 5, `approval-of-record` about 1), so 3,000 minutes is about
85 pushes. In those 34 hours CI used about 1,100 minutes: about 410 for the build's own pull requests, about 340 for
Dependabot's dependency-update pull requests (15 `ci` runs in two bursts), and 360 for one image check that hung until
GitHub stopped it. At that rate the included minutes last three days. The pull request that added this guide stops a
hung job after 15 or 60 minutes and groups Dependabot's updates (at most one a week for the actions and one for the
images; Dependabot reads its settings from `main`, so this takes effect once the build's small pull request into `main`
carrying them is merged), so plan on the build's own rate, about 300 minutes a day: the included minutes last about ten days, and a
month needs about 6,000 more. GitHub charges under a cent a minute for the Linux machines CI runs on (the billing page
shows today's price), so $60 buys more than 6,000 minutes. With a $0 budget, or one too small, CI stops when the
minutes run out, and with step 4's required checks nothing merges until the next month. The build tells you if a
month is running short.

Check: **Billing and licensing** shows "GitHub Pro" and your Actions budget.

## 2. Make the repository private

Protects against: anyone on the internet reading the code, its history and its security design.

What it costs: on GitHub Pro, a private repository no longer gets GitHub's own secret scanning and push protection
(for a private repository they need GitHub Team or Enterprise, with Secret Protection). The `gitleaks` scan in CI
stays the secret check; it runs after a push, not before it.

1. Open github.com/PureTideWater/PhysicalTherapy.
2. Tap **Settings** (in the tab bar under the repository name; on a phone, swipe the tab bar or tap **…**).
3. Stay on **General**. Scroll to the bottom, to **Danger Zone**.
4. Tap **Change visibility** → **Change to private**. Read the warnings, tap **I want to make this repository private**,
   then **I have read and understand these effects**, and confirm (GitHub may ask for your two-factor code).

Check: the repository name shows a **Private** label.

## 3. Create the build agent's own GitHub account, and take yours out of every Claude session

Protects against: the build acting with your powers. Today every Claude session works as your account, so it could
change these settings or approve in your name, and your own review cannot count, since GitHub does not let a pull
request's author approve it. Afterwards the agent's account can push and open pull requests, nothing more, and no
Claude session holds yours.

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
my recovery codes** → **Done**. (A passkey from your password manager works as the second factor too.)

**3c. Invite it to the repository.** Signed in as yourself: github.com/PureTideWater/PhysicalTherapy → **Settings** →
**Collaborators** (under "Access"; GitHub may ask for your two-factor code) → **Add people** → type the new username →
select it → **Add ... to this repository**. On a repository owned by a personal account every collaborator has the
same access: push and open pull requests, no settings. That is Write, not Admin. (If the repository ever moves to an
organization, give it the **Write** role.)

**3d. Accept the invitation.** In the private tab, signed in as the new account, open the invitation email, or
github.com/PureTideWater/PhysicalTherapy/invitations → **Accept invitation**.

**3e. Tell every build session first.** The GitHub connection belongs to your Claude account, so it changes for every
Claude session at once. In each Claude session that is building, send: "Finish the pull request you are on. Then merge,
or close, every open pull request my account opened, and pause; I am switching your GitHub identity to <username>."
Wait until each says it has paused. Then open github.com/PureTideWater/PhysicalTherapy/pulls and check that no open
pull request was opened by `PureTideWater` (Dependabot's are fine). Why: a pull request keeps the account that opened it
as its author, whoever pushes to it later. One opened as you can never get your approval (GitHub refuses an author's
own), so after step 5 any that touches a protected file would stay grey. A closed one is opened again by the agent's
account after the switch.

**3f. Connect the new account to Claude.** In the private tab (GitHub signed in as the new account), open
https://claude.ai/connect-github, sign in to Claude as yourself if asked, and follow the prompts to connect GitHub.
If the page shows your own GitHub account, sign out of GitHub in that tab, sign in as the new account, and open the
link again. If GitHub offers to install the Claude app for the new account, choose **Only select repositories** and
select none, or skip it: the app stays installed on your repository from your own account, and that is how the new
account reaches it.

**3g. Disconnect your account from Claude's GitHub connector.** Still in the private tab, on claude.ai: **Settings** →
**Connectors** → **GitHub** → **Disconnect**. If the build needs the connector, connect it again only while the tab is
signed in to GitHub as the new account; otherwise leave it off. (The connector gives a session tools such as
"approve a pull request" and "merge"; connected to your account, they would act as you.)

**3h. Revoke Claude's access to your own GitHub account.** In your normal browser, signed in to GitHub as yourself:
profile picture → **Settings** → **Applications** → **Authorized GitHub Apps**: next to Claude (or Anthropic), tap
**Revoke** and confirm. Then the **Authorized OAuth Apps** tab: the same, if it is listed there. Leave **Installed
GitHub Apps** as it is: the Claude app installed on your repository is how the new account reaches it.

**3i. Resume.** Tell the build session: "Resume as <username>."

**3j. Check before step 5.** Start a new Claude session for the build (one that was open before 3f may still hold your
account until it ends) and send: "Report the output of `gh api user --jq .login` and the login the GitHub connector's
get_me returns." Each must be the new username, or the connector must be absent. If either says `PureTideWater`,
repeat 3f to 3h, and do not start step 5. Then check the build's next pull request: its page says "<username> wants to
merge ...".

## 4. Protect `claude/build-platform` and `main`

Protects against: a force push or a deletion rewriting either branch, a direct push to either, and a merge into the
build branch with a failing, missing or out-of-date check, by anyone, you included.

Do this after step 1 (a private repository on GitHub Free has no rulesets) and after the pull request that added this
guide is merged into `claude/build-platform`, so the `approval-of-record` check exists. It need not have reached
`main`: a pull request from `claude/build-platform` into `main` brings the workflows with it.

`main` holds only the plan files until launch, with no workflows, so it gets its own ruleset without required checks:
a check that cannot run there would block every pull request into it, a repair like #18 included. At launch, when
`claude/build-platform` merges into `main`, the build asks you to add the same five checks to `main`'s ruleset.

**4A. The build branch.**

1. github.com/PureTideWater/PhysicalTherapy → **Settings** → **Rules** → **Rulesets** (under "Code and automation") →
   **New ruleset** → **New branch ruleset**.
2. **Ruleset name**: `Protect the build branch`.
3. **Enforcement status**: **Active**.
4. **Bypass list**: leave it empty. Do not add yourself or "Repository admin": the rules hold administrators too.
5. **Target branches** → **Add target** → **Include by pattern** → type `claude/build-platform` → **Add inclusion
   pattern**.
6. **Rules**: turn on exactly these, and leave every other rule off.
   - **Restrict deletions**.
   - **Require a pull request before merging**, with **Required approvals** at **0**. Leave its four options off for
     now ("Dismiss stale pull request approvals when new commits are pushed", "Require review from Code Owners",
     "Require approval of the most recent reviewable push", "Require conversation resolution before merging"); step 5
     turns two of them on. Leave the allowed merge methods as they are.
   - **Require status checks to pass**, with **Require branches to be up to date before merging** on. Tap **Add
     checks** and add these five, one at a time. After adding each, set its source (the menu beside it, which starts
     at "any source") to **GitHub Actions**. Every one must have that source: a check from any source can be faked by
     anyone who can push, with a plain status of the same name.
     - `check` (the `ci` workflow)
     - `images (web)` (the `supply-chain` workflow)
     - `images (worker)` (the `supply-chain` workflow)
     - `licenses` (the `supply-chain` workflow)
     - `approval-of-record` (the `approval-of-record` workflow; it passes until step 5, and says why)

     On a pull request's checks list they appear as "ci / check (pull_request)", "supply-chain / images (web)
     (pull_request)" and so on; in the ruleset they are the names above.
   - **Block force pushes**.
7. Tap **Create**.

**4B. `main`.**

1. **Rulesets** → **New ruleset** → **New branch ruleset**.
2. **Ruleset name**: `Protect main`. **Enforcement status**: **Active**. **Bypass list**: empty.
3. **Target branches** → **Add target** → **Include default branch** (or **Include by pattern** → `main`).
4. **Rules**: turn on **Restrict deletions**, **Require a pull request before merging** (with **Required approvals** at
   **0** for now; step 5 raises it) and **Block force pushes**. Leave every other rule off, status checks included.
5. Tap **Create**.

Check: **Rulesets** lists both as Active, each targeting 1 branch. Open "Protect the build branch": each of the five
checks shows **GitHub Actions** as its source, not "any source". On the next pull request into the build branch, the
merge button stays grey until the five checks are green and the branch is up to date.

What a required check cannot stop: a collaborator with Write, the build agent included, can produce a check with the
same name from a workflow on a branch it pushes, and GitHub Actions is then its source too. The checks catch mistakes
and a missed approval; what holds a change to the files in `.github/CODEOWNERS` (the workflows, the approval and the
code that runs the gate among them) is your own review, from step 5.

Three effects to know:

- A pull request whose branch is behind its base must be brought up to date (**Update branch**) before it merges,
  and its checks run again. The build does this.
- Until launch, a pull request into `main` merges with no check at all; only a pull request can change `main`, and
  after step 5 only with your approval.
- The `publish-content` workflow pushes content releases to `main` directly, and the ruleset refuses that push.
  There is no content release to publish today; before the first one, the build will bring you a change for it.

## 5. After the switch: require your review, and make the approval-of-record check enforce it

Protects against: a change to a migration, the domain model, a release, CLAUDE.md, `.claude`, `.github` or the code
that runs the gate, or to an approval, merging without your review of its latest commit; and anything merging into
`main` without your approval.

Do this once step 3's check (3j) shows the agent's login, and no open pull request was opened by your account (3e).
Not before: GitHub refuses an author's own review, so while your account authors a pull request, these settings
block it.

1. **Settings** → **Rules** → **Rulesets** → **Protect the build branch** → **Require a pull request before merging**:
   - turn on **Require review from Code Owners** (the paths are in `.github/CODEOWNERS`, each owned by you);
   - turn on **Dismiss stale pull request approvals when new commits are pushed**;
   - leave **Require approval of the most recent reviewable push** off: when you commit the approval line yourself
     (step 6), your commit is the latest push, and you then approve it;
   - leave **Required approvals** at 0, so a pull request that touches none of those paths still merges on green
     checks. (If GitHub will not save Code Owners review with 0, set 1: every pull request then needs your approval.)
   - Tap **Save changes**.
2. **Rulesets** → **Protect main** → **Require a pull request before merging**: set **Required approvals** to **1** and
   turn on **Dismiss stale pull request approvals when new commits are pushed** → **Save changes**. GitHub reads code
   owners from the branch a pull request merges into, and `main` has no `.github/CODEOWNERS` until launch, so this is
   what makes every pull request into `main`, the launch itself included, wait for your approval. After launch, also
   turn on **Require review from Code Owners** here.
3. **Settings** → **Secrets and variables** → **Actions** → the **Variables** tab → **New repository variable**:
   - **Name**: `APPROVAL_REVIEW_REQUIRED`
   - **Value**: `true` (a capital letter from your phone's keyboard is fine: the check reads `True` too)
   - Tap **Add variable**.

Check: on the next pull request, open **Checks** → **approval-of-record**. It no longer says "not yet enforced". A
pull request that changes the approval line or `packages/db/domain-model/approvers.json` shows it red until you
approve its latest commit.

From then on, Dependabot's update pull requests that touch `.github` (the action updates) or `package.json` (most
dependency updates) need your approval like any other change to those files: about one or two a week, grouped.

To undo any of it, edit the ruleset again, or delete the variable (or set it to `false`). Only an administrator (you)
can; the build agent cannot.

## 6. Approve a pull request from the GitHub app

Protects against: approving text you have not seen. Your review counts only for the commit you approved, and a
domain-model pull request opens with every change since your last approval, the security changes first.

Install the GitHub app (App Store or Google Play) and sign in as yourself, never as the build agent.

**Any pull request:**

1. Tap the notification, or **Home** → **Pull requests**, and open the pull request.
2. Read the description. Scroll to the checks at the bottom: green ticks, or what is still running.
3. Tap **Files changed** to look at the change if you want to.
4. Tap **Review** (top right of Files changed; on some versions, the **…** menu → **Review changes**) → **Approve** →
   add a comment if you like → **Submit**. If something is wrong, choose **Request changes** and say what.
5. When every check is green, the build merges it (or tap **Merge pull request** yourself).

**A pull request that asks you to approve the domain model** (it regenerates `docs/product/domain-model.md`):

1. Read **Changes since the last approved document** in the `ci` check's summary (in the browser: **Checks** → **ci** →
   **check** → **Summary**): row-level security, policies, the PHI registry and grants come first, then tables,
   columns, constraints, functions, triggers and the divergence rows, one line each, with the old and new document
   SHA-256. That copy is the one that counts: the code wrote it. The build also puts it at the top of the description,
   but the build wrote that copy; if the two differ, request changes. If anything surprises you, request changes.
2. Sign the approval line yourself. The build posts the exact line, with your name, today's date and the document's
   SHA-256, as a suggested change on the pull request; its edit tools refuse to write the line itself. Open the pull
   request in your phone's browser (github.com), find the suggestion on **Conversation**, and tap **Commit
   suggestion** → **Commit changes**. (If the app shows a **Commit suggestion** button, that works too.)
3. Wait a moment for the page to show your commit as the latest. Then approve as above (**Review** → **Approve** →
   **Submit**). Your approval of that commit is the approval of record: the `approval-of-record` check turns green,
   and the domain model check in `ci` passes once its run on your commit finishes.
4. If the build pushes anything after your approval, GitHub dismisses it (step 5) and the check goes red again:
   approve the new latest commit.

## What the build does, and what only you do

| The build | Only you |
| --- | --- |
| Opens pull requests as its own account (after step 3), keeps branches up to date, merges when checks are green | Steps 1 to 5 and any change to them |
| Regenerates the domain model; the `ci` check writes the summary, and the build copies it to the description | Commits the approval line (from the build's suggestion) and approves the pull request |
| Proposes changes to CODEOWNERS, the workflows or this runbook in a pull request | Approves those pull requests |
| Never writes an "Approved by:" line or `approvers.json` itself: its edit tools refuse it; it posts the text as a suggestion | Commits that suggestion, and approves the pull request |
| Never submits a review: a hook refuses the GitHub connector's review tools, and after step 3 no Claude session holds your account | Reviews, from your own account |
| Tells you when a setting here needs to change | Changes the rulesets, the variable and the account settings, and decides when to set or remove `APPROVAL_REVIEW_REQUIRED` |

The hooks guard the build's edit and GitHub tools, not a shell command it runs. Until step 5, an approval line is only
as trustworthy as the commit that wrote it; from step 5, what makes an approval count is your GitHub review of the
latest commit, which only your account can give.
