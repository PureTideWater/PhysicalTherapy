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
| 3 | The build agent's own GitHub account | now; tell the build session before 3f | 20 minutes |
| 4 | The ruleset for `main` and `claude/build-platform` | after step 1, once the pull request that added this guide is merged | 10 minutes |
| 5 | Code Owners review and `APPROVAL_REVIEW_REQUIRED` | after step 3, when a pull request shows the agent as its author | 5 minutes |
| 6 | Approving a pull request from the GitHub app | every time the build asks | 2 minutes |

## 1. Upgrade to GitHub Pro and set an Actions budget

Protects against: a private repository with no branch protection (GitHub Free has none for private repositories), and
CI stopping when the free Actions minutes run out.

1. Open github.com and sign in as yourself (`PureTideWater`).
2. Tap your profile picture (top right) → **Settings**.
3. In the settings menu, tap **Billing and licensing** → **Licensing** (on some accounts: **Plans and usage**).
4. Next to "GitHub Free", tap **Upgrade** → choose **Pro** → **Monthly** → enter the payment card → **Upgrade**.
5. Back in **Billing and licensing**, tap **Budgets and alerts** (older screens: **Spending limits**) → **New budget**.
6. Product: **Actions**. Amount: **$10** a month to start. Turn on **Stop usage when budget limit is reached**. Tap
   **Create budget**.

Why a budget above $0: Pro includes 3,000 Actions minutes a month for private repositories (Free: 2,000). One push to a
pull request costs about 60 minutes (the `ci` check takes about 40, the image and license checks the rest), so 3,000
minutes is roughly 45 pushes. With a $0 budget, CI stops when they run out and nothing can merge until the next month.
The budget caps what you can be charged; GitHub's billing page shows the current price per minute. Raise it if the
build tells you the month is running short.

Check: **Billing and licensing** shows "GitHub Pro" and your Actions budget.

## 2. Make the repository private

Protects against: anyone on the internet reading the code, its history and its security design.

1. Open github.com/PureTideWater/PhysicalTherapy.
2. Tap **Settings** (in the tab bar under the repository name; on a phone, swipe the tab bar or tap **…**).
3. Stay on **General**. Scroll to the bottom, to **Danger Zone**.
4. Tap **Change visibility** → **Change to private**. Read the warnings, tap **I want to make this repository private**,
   then **I have read and understand these effects**, and confirm (GitHub may ask for your two-factor code).

Check: the repository name shows a **Private** label.

## 3. Create the build agent's own GitHub account

Protects against: the build acting with your powers. Today it works as your account, so it could change these settings
or approve in your name, and your own review cannot count, since GitHub does not let a pull request's author approve
it. Its own account can push and open pull requests, and nothing more.

**3a. Create the account.** In a private browser tab (so you stay signed in as yourself elsewhere), open
github.com/signup.

- Email: an address no other GitHub account uses (a new mailbox, or an alias your email provider gives you). Write it
  in your password manager.
- Password: a new one from your password manager.
- Username: for example `paidwhole-build`. Tell the build session the name you chose.
- Verify the email when GitHub sends the code. GitHub's terms allow each person one free "machine account"; this is it.

**3b. Turn on two-factor.** Still signed in as the new account: profile picture → **Settings** → **Password and
authentication** → **Enable two-factor authentication** → **Authenticator app** → scan the code with your
authenticator app → enter the six digits → **Download** (or copy) the recovery codes into your password manager →
**I have saved my recovery codes** → **Done**.

**3c. Invite it to the repository.** Signed in as yourself: github.com/PureTideWater/PhysicalTherapy → **Settings** →
**Collaborators** (under "Access"; GitHub may ask for your two-factor code) → **Add people** → type the new username →
select it → **Add ... to this repository**. On a repository owned by a personal account every collaborator has the
same access: push and open pull requests, no settings. That is Write, not Admin. (If the repository ever moves to an
organization, give it the **Write** role.)

**3d. Accept the invitation.** In the private tab, signed in as the new account, open the invitation email, or
github.com/PureTideWater/PhysicalTherapy/invitations → **Accept invitation**.

**3e. Tell the build session first.** In the Claude session that runs the build, send: "Pause after the pull request
you are on; I am switching your GitHub identity to <username>." Wait until it says it has pushed and paused. A switch in
the middle of a pull request would split its commits between two authors.

**3f. Connect the new account to Claude.** In the private tab (GitHub signed in as the new account), open
https://claude.ai/connect-github, sign in to Claude as yourself if asked, and follow the prompts to connect GitHub.
If the page shows your own GitHub account, sign out of GitHub in that tab, sign in as the new account, and open the
link again. If GitHub asks which repositories the Claude app may use, choose **Only select repositories** →
`PureTideWater/PhysicalTherapy`.

**3g. Resume.** Tell the build session: "Resume as <username>." Check on its next pull request: the page says
"<username> wants to merge ...". Then do step 5.

## 4. Protect `main` and `claude/build-platform`

Protects against: a force push or a deletion rewriting either branch, and a merge with a failing, missing or out-of-date
check, by anyone, you included.

Do this after step 1 (a private repository on GitHub Free has no rulesets) and after the pull request that added this
guide is merged into both branches, so the `approval-of-record` check exists.

1. github.com/PureTideWater/PhysicalTherapy → **Settings** → **Rules** → **Rulesets** (under "Code and automation") →
   **New ruleset** → **New branch ruleset**.
2. **Ruleset name**: `Protect main and the build branch`.
3. **Enforcement status**: **Active**.
4. **Bypass list**: leave it empty. Do not add yourself or "Repository admin": the rules hold administrators too.
5. **Target branches** → **Add target** → **Include by pattern** → type `main` → **Add inclusion pattern**. Again:
   **Add target** → **Include by pattern** → `claude/build-platform` → **Add inclusion pattern**.
6. **Rules**: turn on exactly these, and leave every other rule off.
   - **Restrict deletions**.
   - **Require a pull request before merging**, with **Required approvals** at **0**. Leave its four options off for
     now ("Dismiss stale pull request approvals when new commits are pushed", "Require review from Code Owners",
     "Require approval of the most recent reviewable push", "Require conversation resolution before merging"); step 5
     turns two of them on. Leave the allowed merge methods as they are.
   - **Require status checks to pass**, with **Require branches to be up to date before merging** on. Tap **Add
     checks** and add these five, one at a time, choosing **GitHub Actions** as the source when GitHub offers one:
     - `check` (the `ci` workflow)
     - `images (web)` (the `supply-chain` workflow)
     - `images (worker)` (the `supply-chain` workflow)
     - `licenses` (the `supply-chain` workflow)
     - `approval-of-record` (the `approval-of-record` workflow; it passes until step 5, and says why)

     On a pull request's checks list they appear as "ci / check (pull_request)", "supply-chain / images (web)
     (pull_request)" and so on; in the ruleset they are the names above.
   - **Block force pushes**.
7. Tap **Create**.

Check: **Rulesets** lists "Protect main and the build branch" as Active, targeting 2 branches. On the next pull
request, the merge button stays grey until the five checks are green and the branch is up to date.

Two effects to know:

- A pull request whose branch is behind its base must be brought up to date (**Update branch**) before it merges,
  and its checks run again. The build does this.
- The `publish-content` workflow pushes content releases to `main` directly, and this ruleset refuses that push.
  There is no content release to publish today; before the first one, the build will bring you a change for it.

## 5. After the switch: require your review, and make the approval-of-record check enforce it

Protects against: a change to a migration, the domain model, a release, CLAUDE.md, `.claude` or `.github`, or to an
approval, merging without your review of its latest commit.

Do this once step 3 is done and a pull request shows the build agent's username as its author. Not before: while your
account authors every pull request, GitHub refuses your own review, so these settings would block every merge they
touch.

1. **Settings** → **Rules** → **Rulesets** → **Protect main and the build branch** → **Require a pull request before
   merging**:
   - turn on **Require review from Code Owners** (the paths are in `.github/CODEOWNERS`, each owned by you);
   - turn on **Dismiss stale pull request approvals when new commits are pushed**;
   - leave **Require approval of the most recent reviewable push** off: when you commit the approval line yourself
     (step 6), your commit is the latest push, and you then approve it;
   - leave **Required approvals** at 0, so a pull request that touches none of those paths still merges on green
     checks. (If GitHub will not save Code Owners review with 0, set 1: every pull request then needs your approval.)
   - Tap **Save changes**.
2. **Settings** → **Secrets and variables** → **Actions** → the **Variables** tab → **New repository variable**:
   - **Name**: `APPROVAL_REVIEW_REQUIRED`
   - **Value**: `true`
   - Tap **Add variable**.

Check: on the next pull request, open **Checks** → **approval-of-record**. It no longer says "not yet enforced". A
pull request that changes the approval line or `packages/db/domain-model/approvers.json` shows it red until you
approve its latest commit.

To undo either, edit the ruleset again, or delete the variable (or set it to `false`). Only an administrator (you) can;
the build agent cannot.

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

1. Read **Changes since the last approved document** at the top of the description: row-level security, policies,
   the PHI registry and grants come first, then tables, columns, constraints, functions, triggers and the divergence
   rows, one line each, with the old and new document SHA-256. The same summary is in the `ci` check's summary (in the
   browser: **Checks** → **ci** → **check** → **Summary**). If anything there surprises you, request changes instead.
2. Sign the approval line yourself. The build posts the exact line, with your name, today's date and the document's
   SHA-256, as a suggested change on the pull request; it cannot write the line itself. Open the pull request in your
   phone's browser (github.com), find the suggestion on **Conversation**, and tap **Commit suggestion** → **Commit
   changes**. (If the app shows a **Commit suggestion** button, that works too.)
3. Wait a moment for the page to show your commit as the latest. Then approve as above (**Review** → **Approve** →
   **Submit**). Your approval of that commit is the approval of record: the `approval-of-record` check turns green,
   and the domain model check in `ci` passes once its run on your commit finishes.
4. If the build pushes anything after your approval, GitHub dismisses it (step 5) and the check goes red again:
   approve the new latest commit.

## What the build does, and what only you do

| The build | Only you |
| --- | --- |
| Opens pull requests as its own account (after step 3), keeps branches up to date, merges when checks are green | Steps 1 to 5 and any change to them |
| Regenerates the domain model and puts the summary at the top of the pull request | Commits the approval line (from the build's suggestion) and approves the pull request |
| Proposes changes to CODEOWNERS, the workflows or this runbook in a pull request | Approves those pull requests |
| Never writes an "Approved by:" line or `approvers.json` itself (a hook refuses it); posts the text as a suggestion | Commits that suggestion, and approves the pull request |
| Tells you when a setting here needs to change | Changes the ruleset, the variable and the account settings, and decides when to set or remove `APPROVAL_REVIEW_REQUIRED` |
