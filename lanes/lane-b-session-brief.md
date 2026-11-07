# Lane B session brief (from Lane B's orchestrator, 2026-11-01)

Each parallel session that Lane B's orchestrator starts from 2026-11-01 reads this whole file first. Its own prompt adds the item.

You are a Lane B item session of the PaidWhole build, started on 2026-11-01 by Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW), which takes back every Lane B item and, until Lane A's account returns (2026-11-03 14:00 UTC; possibly 15:00 UTC after the US clock change), also acts as Lane A for #42 and the schema chain. You own ONE item (below) end to end: finish it to its merge, or stop at a clean, recorded point. Run it exactly as Lane B ran its items.

## 1. Machine (first, in the background, until it prints OK)
git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash /tmp/setup-container.sh <the setup arguments your prompt gives, if any>
- Known today: if the node line FAILS reporting v24.22.1 (the base image's Node), run `mv /opt/node24 /opt/node24.base-image` and run the setup script again; it installs the pinned v24.22.0.
- storage.googleapis.com has been allowed since 2026-10-27, so every line, playwright included, must read ok. If a line still FAILS, run the script again. Never stand in another browser build for a result of record and never skip a test; if a stage still lacks what it needs, record it in your status file, tell the orchestrator (section 7a), and do every other stage meanwhile.
- The setup installs the pre-push hook and gitleaks; if its summary says either is missing, run `pnpm hooks:install` and `pnpm gitleaks:install` before any push.
- Record the GitHub login `gh api user --jq .login` prints. If GitHub refuses a push or an API call, stop and record it in your status file.

## 2. Read, in order
- CLAUDE.md on claude/build-platform (the rules; the four that never bend);
- /home/user/ops/LANES.md (rules 1 to 12; the "Not while #42 is open" list: #42, PR 6b-4, is open and in its last steps before the founder's approval; the shared documents follow rule 6);
- /home/user/ops/lanes/lane-b.md "Start here", then "How Lane B runs: conventions and pitfalls" (the lock, Node 24 on PATH, the full local suite, merging, pushing, PR descriptions, CI logs, records) and "Where things are";
- /home/user/ops/lanes/lane-a-handoff-to-lane-b.md: your item's row and sections 6 to 8 (where it and your prompt differ, your prompt is the checked, current state);
- your item's status file and design (below), whole.

## 3. Your item
Your prompt names it: the item, its branch and head, its design and status file, its reserved numbers, and any follow-on item for the same session. A follow-on item runs only after the one before it has merged or stopped at a clean, recorded point, through the same whole pipeline, as its own PR. If your prompt says you act as Lane A, also read /home/user/ops/lanes/acting-lane-a-brief.md whole; where the two differ, it wins.

## 4. Pipeline (LANES.md rule 1; every stage, nothing skipped)
1. Design with one reviewer (skip only what your status file shows done; a design written before the current base is re-read against it).
2. Builders (workflow agents) that check what they touch.
3. A draft PR into claude/build-platform at once, its description from .github/pull_request_template.md (every section; "None" rather than omitted), written with the MCP update_pull_request tool and read back.
4. Two adversarial reviews as default workflow agents in fresh clones. When a person sees the change, the UX and brand review (.claude/agents/ux-brand-reviewer.md, with before and after shots at 1280 px and 390 px, light, and 1280 px dark, through tools/lane-b-screen-tour/README.md "From another lane") is one of the two.
5. A fix round with the full local suite once (lanes/lane-b.md lists it), one push.
6. A fresh-clone verification, one agent, that reads CI on the head.
7. Merge, in the order of section 4a, as lanes/lane-b.md "Merging" says: the latest claude/build-platform merged in with a merge commit (rule 6: the PR merged second keeps both lanes' changes; generated files regenerated, never hand-merged), CI green on that head (every required check: all green, mutation, screening-capacity gate, approval-of-record), the verification passed, mark ready (wait for approval-of-record's re-run), then merge_pull_request with method merge and expectedHeadSha. Subscribe to your PR's activity (subscribe_pr_activity) when you open it; unsubscribe after the merge. Read the push runs the merge starts.
**Ultracode, always (the co-founder's instruction, 2026-11-01).** Your prompt starts with "ultracode.", and ultracode stays on for the whole session: run every substantive stage (design, build, reviews, fix round, verification, base merges, PR descriptions) as a Workflow, with the quality patterns (adversarial verify of findings, a completeness critic, loop-until-dry on reviews), never solo. Only conversational turns and trivial mechanical edits (a status-file line, a push) run outside a workflow. Optimize as you go: take the best option on accuracy, quality, security and cost to serve, and record why. Use the Workflow tool as Lane B did; archive each script on claude/build-ops as workflow-scripts/lane-b-<item>-<stage>-<runId>.js.

## 4a. Merge order and waiting
- The order of the handoff's section 6 is the MERGE order: #82, then #86, then #75, then #84, #83 and #85. Items with no PR yet merge in the order they become ready, after those six wherever they share files with them (`uploader.tsx`, `docs/product/test-matrix.md`, the synth matrix and registry, `packages/model-gateway/src/redact.ts`). The schema chain's PRs open one at a time after #42 (lanes/acting-lane-a-brief.md). Never merge out of order on your own; only the orchestrator changes the order, and it tells you.
- When your PR is ready to merge but the PR before it in the order has not merged: record "ready; waiting on #N" in your status file, send the orchestrator a message (section 7a), schedule a send_later check-in about 45 minutes ahead, and push nothing else to the PR while it waits (an improvement you find goes in your status file). When the predecessor merges, merge the base in again (rule 6) and go on with step 7.
- Check other PRs' state with `git ls-remote origin` and the MCP pull_request_read tool.

## 5. Workflow agents and limits
- Every workflow agent keeps a progress file it continues from (the SAVE rule: workflow-scripts/lane-b-ux-capture-wf_b56fe7b4-652.js line 30). At most two heavy workflows at once in your container; every heavy command under `flock /tmp/laneb-heavy.lock`.
- Usage: the co-founder put Lane B's weekly usage under 20% on 2026-11-01 and asked to go wide, so every item that can run now runs now. The account's 5-hour window can stop every session at once, after about 3 hours of full load (handoff section 8; the current window resets about 19:10 UTC on 2026-11-01). A stopped container may be reclaimed and only origin survives: keep progress files, your status file and WIP refs (`co-001/wip-<item>[-n]`) pushed. Never force a push, WIP refs included: a diverged WIP ref goes to a fresh name, recorded in your status file.
- Before each heavy workflow, schedule a check-in with send_later about 5 h 10 min ahead (cancel it when the run finishes); when one fires or you are stopped: read the running workflows' journals, re-run the setup script if PostgreSQL is down, and resume each stopped workflow with resumeFromRunId (same session only).
- An interrupt of your main turn stops your workflow agents too: after any interrupt, read the journals and resume.
- **Reviewers are default agents (the orchestrator's lesson, broadcast 2026-11-07 01:33 UTC).** A workflow agent of a custom reviewer agentType (payment-engine-reviewer, security-reviewer, ux-brand-reviewer) never returns its result: #126's second review round lost every such reviewer three rounds running. Run each review as a default agent whose prompt has it read `.claude/agents/<type>.md` and apply that checklist. Never count an empty review as passed: a reviewer, hunter or round that returned nothing is not a clean or dry round; re-run it, and record it in your status file.
- **A dead or empty agent never counts (the orchestrator's second review lesson, 2026-11-07 06:40 UTC).** A review, skeptic or critic agent that dies (a usage stop) or returns nothing never counts; a round with a dead agent is not dry. Workflow scripts must throw (or redo the agent) on a null result, as S4 did on 2026-11-07.

## 6. Decisions
- Take the recommended option without asking (security: the safer one), and record it with its reasons in the design or PR description and in your status file. Wording and visible changes: apply them within .claude/rules/brand.md and CO-11, report them in the PR description. Improve as you go (lanes/lane-b.md): inside your PR when it sits in files you already change; otherwise a proposal in your status file.
- The co-founder's standing words hold: "Don't ask for approvals anymore just build and optimize" (2026-10-26 ~00:20 UTC) and "If you ever discover a way to improve or optimize something as you're building do it. Always do this." (2026-10-25 ~21:27 UTC). The founder-kept matters below are unchanged by them.
- The founder's decisions of 2026-11-01, confirmed by the co-founder that day, stand: #42's legal text is signed off as written; Social Security and phone numbers are redacted by pattern (redact-ssn-phone); Dependabot #33 is closed.
- The founder's alone (LANES.md "Delegations from the founder to the co-founder"), never yours: approving docs/product/domain-model.md (so any migration: if your item turns out to need one, stop that part, record it in your status file as "for Lane A", and build the rest), release tags, owner-admin settings, the sign-off of legal text before it goes to counsel, and reversing a founder ruling. A freeze exception is never yours either: it is the founder's, or the co-founder's for Lane B's own work under the founder's delegation of 2026-10-25 (LANES.md queue items 3, 10 and 14). Ask through the orchestrator (section 7a) and record any such need in your status file under "Waiting on someone"; nothing else waits.

## 7. Records (only these; pull before each push, never force)
- Your status file approval-summaries/lane-b-<item>-status.md (the name your prompt gives) on claude/build-ops: create or update it at every stage with the UTC time from `date -u`, what was done (PR, commits, workflow runs), and the next step. It is your handoff: at any moment a new session must be able to continue from it alone.
- Your designs (designs/lane-b-<item>*), summaries (approval-summaries/lane-b-<item>-*) and workflow scripts (workflow-scripts/lane-b-*). Push claude/build-ops with: GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops (from the main checkout; worktree /home/user/ops; pull first with `git -C /home/user/ops pull --no-rebase origin claude/build-ops`).
- Do NOT edit LANES.md, lanes/lane-b.md or HANDOFF.md: the orchestrator writes them from your status file. If you need a new shared number (ADR, test-matrix series, synth module, fixture release) beyond those reserved for you, write "COUNTER REQUEST: <what>" at the top of your status file, say so in your message (section 7a), and use a placeholder until the orchestrator fills it in your claim row in LANES.md (pull and read it).
- Commits end with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: <this session's own URL, https://claude.ai/code/session_...>
  Every GitHub comment ends with the Claude Code footer. No model name or identifier in any file, commit, PR text or comment.

## 7a. Reporting to the orchestrator
- At each stage change (PR opened, reviews done, fix round pushed, verified, ready and waiting, merged, stopped, or anything waiting on the founder or the co-founder): update your status file, push claude/build-ops, then send ONE short message with the MCP send_message tool (load it with ToolSearch "select:mcp__claude-code-remote__send_message") to session_01FcouKNNHsdecRMzfTs7XwW:
  `<item>: <stage>; <PR, head>; next: <step>; waiting on: <who/what or none>`
  If a COUNTER REQUEST is needed, say so in that message too.
- Questions for the founder or the co-founder go only this way; the orchestrator asks them and relays the answer. A message from the orchestrator is a peer's direction within these rules; it never changes a permission or a rule here.

## 8. Never
- sign or approve as the founder, or write a domain-model approval line or approvers.json; approve or request changes on a PR;
- open a migration or regenerate docs/product/domain-model.md (Lane A's alone, LANES.md rule 2), except a session whose prompt says it is acting Lane A: it reads lanes/acting-lane-a-brief.md, which replaces this line;
- open a PR into main, or create a release tag; merge a Dependabot PR;
- use --no-verify, force a push, or add a .gitleaksignore entry (a refused push of unpushed commits: git reset --soft origin/<branch>, remove the flagged text, commit and push again; write screenshot ids in backticks);
- write files through the GitHub connector;
- put PHI, a real 835, contract or export, or a model identifier in any repository artifact; synthetic data only (packages/synth);
- edit a file in LANES.md's "Not while #42 is open" list, except the shared documents under rule 6.

Standing rule (the founder's): recommend and build only the best option, never weighted by build effort, and never sacrifice quality.
