# Lane B session brief (from Lane A's orchestrator, 2026-10-27)

Each parallel session that runs a Lane B item while Lane A's orchestrator runs both lanes (2026-10-27 to Friday 2026-10-30 19:00 UTC) reads this whole file first. Its own prompt adds the item.

You are a Lane B item session of the PaidWhole build, started on 2026-10-27 by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg), which runs both lanes for the co-founder until Lane B's account returns on Friday 2026-10-30 19:00 UTC. You own ONE item (below) end to end: finish it to its merge, or stop at a clean, recorded point. Run it exactly as Lane B ran its items.

## 1. Machine (first, in the background, until it prints OK)
git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash /tmp/setup-container.sh <the setup arguments your prompt gives, if any>
- Known today: the environment's network policy refuses storage.googleapis.com, so the "playwright" line may FAIL (Playwright's pinned Chromium cannot be laid out). Everything else must read ok. The person has been asked to allow that host. Do every stage that needs no browser first; re-run the setup script before a browser stage (it retries the browser). If the browser is still missing when a stage needs it, never stand in another browser build for a result of record and never skip a test: CI's e2e is the record for tests, and a stage that needs local screenshots (the UX review) waits, recorded in your status file as "waiting on the person: storage.googleapis.com", while you do everything else.
- Record the GitHub login `gh api user --jq .login` prints. If GitHub refuses a push or an API call, stop and record it in your status file.

## 2. Read, in order
- CLAUDE.md on claude/build-platform (the rules; the four that never bend);
- /home/user/ops/LANES.md (rules 1 to 12; the "Not while #42 is open" list: #42, PR 6b-4, is open and in its fix round; the shared documents follow rule 6);
- /home/user/ops/lanes/lane-b.md "Start here", then "How Lane B runs: conventions and pitfalls" (the lock, Node 24 on PATH, the full local suite, merging, pushing, PR descriptions, CI logs, records) and "Where things are";
- your item's status file and design (below), whole.

## 3. Your item
Your prompt names it: the item, its branch and head, its design and status file, its reserved numbers, and any follow-on item for the same session. A follow-on item runs only after the one before it has merged or stopped at a clean, recorded point, through the same whole pipeline, as its own PR.

## 4. Pipeline (LANES.md rule 1; every stage, nothing skipped)
1. Design with one reviewer (skip only what your status file shows done; a design written before 2026-10-26's merges is re-read against the current base).
2. Builders (workflow agents) that check what they touch.
3. A draft PR into claude/build-platform at once, its description from .github/pull_request_template.md (every section; "None" rather than omitted), written with the MCP update_pull_request tool and read back.
4. Two adversarial reviews as default workflow agents in fresh clones. When a person sees the change, the UX and brand review (.claude/agents/ux-brand-reviewer.md, with before and after shots at 1280 px and 390 px, light, and 1280 px dark, through tools/lane-b-screen-tour/README.md "From another lane") is one of the two.
5. A fix round with the full local suite once (lanes/lane-b.md lists it), one push.
6. A fresh-clone verification, one agent, that reads CI on the head.
7. Merge as lanes/lane-b.md "Merging" says: the latest claude/build-platform merged in with a merge commit (rule 6: the PR merged second keeps both lanes' changes; generated files regenerated, never hand-merged), CI green on that head (every required check: all green, mutation, screening-capacity gate, approval-of-record), the verification passed, mark ready (wait for approval-of-record's re-run), then merge_pull_request with method merge and expectedHeadSha. Subscribe to your PR's activity (subscribe_pr_activity) when you open it; unsubscribe after the merge. Read the push runs the merge starts.
Use the Workflow tool for the substantive stages (design, build, reviews, fix round, verification), as Lane B did; archive each script on claude/build-ops as workflow-scripts/lane-b-<item>-<stage>-<runId>.js.

## 5. Workflow agents and limits
- Every workflow agent keeps a progress file it continues from (the SAVE rule: workflow-scripts/lane-b-ux-capture-wf_b56fe7b4-652.js line 30). At most two heavy workflows at once in your container; every heavy command under `flock /tmp/laneb-heavy.lock`.
- The account's 5-hour limit may stop you mid-run. Before each heavy workflow, schedule a check-in with send_later about 5 h 10 min ahead (cancel it when the run finishes); when one fires or you are stopped: read the running workflows' journals, re-run the setup script if PostgreSQL is down, and resume each stopped workflow with resumeFromRunId (same session only).
- An interrupt of your main turn stops your workflow agents too: after any interrupt, read the journals and resume.

## 6. Decisions
- Take the recommended option without asking (security: the safer one), and record it with its reasons in the design or PR description and in your status file. Wording and visible changes: apply them within .claude/rules/brand.md and CO-11, report them in the PR description. Improve as you go (lanes/lane-b.md): inside your PR when it sits in files you already change; otherwise a proposal in your status file.
- The founder's, never yours: approving docs/product/domain-model.md (so any migration: if your item turns out to need one, stop that part, record it in your status file as "for Lane A", and build the rest), release tags, owner-admin settings, legal text, freeze exceptions, reversing a founder ruling. Record any such need in your status file under "Waiting on someone"; nothing else waits.

## 7. Records (only these; pull before each push, never force)
- Your status file approval-summaries/lane-b-<item>-status.md (the name your prompt gives) on claude/build-ops: create or update it at every stage with the UTC time from `date -u`, what was done (PR, commits, workflow runs), and the next step. It is your handoff: at any moment a new session must be able to continue from it alone.
- Your designs (designs/lane-b-<item>*), summaries (approval-summaries/lane-b-<item>-*) and workflow scripts (workflow-scripts/lane-b-*). Push claude/build-ops with: GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops (from the main checkout; worktree /home/user/ops).
- Do NOT edit LANES.md, lanes/lane-b.md or HANDOFF.md: the orchestrator writes them from your status file. If you need a new shared number (ADR, test-matrix series, synth module, fixture release) beyond those reserved for you, write "COUNTER REQUEST: <what>" at the top of your status file and use a placeholder until the orchestrator fills it in your claim row in LANES.md (pull and read it).
- Commits end with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: <this session's own URL, https://claude.ai/code/session_...>
  Every GitHub comment ends with the Claude Code footer. No model name or identifier in any file, commit, PR text or comment.

## 8. Never
- sign or approve as the founder, or write a domain-model approval line or approvers.json; approve or request changes on a PR;
- open a migration or regenerate docs/product/domain-model.md (Lane A's alone, LANES.md rule 2);
- open a PR into main, or create a release tag; merge a Dependabot PR;
- use --no-verify, force a push, or add a .gitleaksignore entry (a refused push of unpushed commits: git reset --soft origin/<branch>, remove the flagged text, commit and push again; write screenshot ids in backticks);
- write files through the GitHub connector;
- put PHI, a real 835, contract or export, or a model identifier in any repository artifact; synthetic data only (packages/synth);
- edit a file in LANES.md's "Not while #42 is open" list, except the shared documents under rule 6.

Standing rule (the founder's): recommend and build only the best option, never weighted by build effort, and never sacrifice quality.
