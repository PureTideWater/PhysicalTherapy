# Lane A's handoff to Lane B, 2026-11-13

Written 2026-11-13 15:10 UTC by Lane A's orchestrator (session_019i9ifAeNMbWqzkjiXTp7wF), at the co-founder's ask: a plan
for Lane B to pick the work up and move it forward. Final at 18:30 UTC; the "State at the handback" section is filled
then. Read `lanes/STATE.md` first (current state), then this file (the plan), then only the status file of the item
you start. If STATE.md is newer than this file, trust STATE.md.

## The one thing that matters most
**No real patient data until the before-PHI chain is closed.** It is Lane B's from 18:30 UTC, and it is four steps, in
this order. Nothing else on Lane B's queue comes before it.

| # | Step | State at 15:10 UTC | Lane B's first action |
| --- | --- | --- | --- |
| 1 | **Queues item 40** (identifiers sent in clear beside or around odd characters) | Stages 1 to 4 built and measured on WIP `co-001/wip-redact-item-40`; stage 5a (the base merged, the measurements whole, the records, the PR description's draft) in hand until 18:00 UTC (W76) | **Stage 5b:** the two adversarial reviews, at most two fix rounds, e2e, the PR, the merge on green required checks (no migration, no approval line) |
| 2 | **Queues item 41** (unseen characters mended at extraction, and counted) | Queued today, not started | A measured design note first, no build |
| 3 | **Queues item 39** (the letter check's time) | Open; the reader is about 1.5 times slower per letter after item 34 | A measured design note first; before launch and before the check's first caller is wired |
| 4 | **The redaction sweep** (the co-founder opted in once) | Not run; after items 40 and 41 merge | Tell the co-founder its fixed budget first; bounded, read-only |

Status files: `approval-summaries/lane-b-redact-item-40-status.md` (its top block is always the next stage, exact);
the note `designs/lane-b-redact-item-40/design-note.md`; every ruling with its why in `lanes/lane-b.md`, dated
2026-11-13 09:30, 09:55, 12:58 and 14:38 UTC.

## Where Lane B adds what Lane A could not: a second pair of eyes
Lane A's sessions designed, ruled on and built item 40. Its stage 5 holds the item's two adversarial reviews. **Lane B
runs those reviews, and they are worth more from Lane B:** nobody on it wrote the design or the rulings. So:

1. Give the reviewers the code and the tests, not Lane A's conclusions. Scopes are in the note's section 3 (leaks; cost
   and regressions). Add a third question Lane A is too close to answer: **is each of Lane A's rulings below right?**
2. Lane A's rulings Lane B should try to break, each a judgment made fast under the standing instruction:
   - a number-like character beside an identifier **refuses** the letter even where the first reading already hid the
     number (cost: 96 of 192 footnote-style rows; 54 of them leaked nothing on the base);
   - an unseen character inside an identifier is caught by one more reading of the whole check and **refuses** (cost: 52
     real-shaped letters the base redacted correctly; 1,685 of 60,000 fuzzed letters);
   - a phone number that is **not stored**, found by pattern, is still sent with a number character beside it (11,285
     rows): left as a residual because closing it changes the first reading. This is the weakest of the rulings: a
     patient's unstored phone number in clear is still a leak. Item 41 carries it; Lane B may rule it sooner.
   - four tests carry an explicit 20 s wall-time limit since #161 (the runner's 5 s default was being hit; the product's
     bound is the counted budget, unchanged). If Lane B thinks a time bound belongs in the product, that is item 39.
3. What was **reported by sessions and not verified by the orchestrator**: every gate, generated-set, fuzz and timing
   number of item 40. The orchestrator verified branch heads, merges on the base, the approval lines and CI runs. Stage
   5 re-measures everything whole on the merged base: treat that run as the first independent measurement.
4. One open product risk, for the co-founder if the count is bad: letters from a mainframe may carry U+0085 on every
   line. If a payer's letters do, every one is refused. Item 41 (a) is the count that says whether this is ten letters
   or a payer.

## How to run it (what worked and what cost, last 38 hours)
- **One stage a session.** Items 34, 37 and 40 each took nine to fourteen sessions. A session fills 200k tokens in 10 to
  60 minutes on these items, mostly by reading. Every brief: the exact files and line ranges and nothing else; never a
  file over 300 lines whole; output to files; tests first and seen failing on an assertion; push the WIP ref as soon as
  the tests are green and before the long measurements; a hand-over at about 200k with a RESUME-BLOCK.
- **A session's scope is its brief.** A later message does not widen it (three sessions rightly refused). A ruling that
  changes the work goes into a new session's brief.
- **A preparation that will not close.** Item 37's review found a narrower form of the same fault five times. The
  orchestrator named a last round and queued the rest. Do the same when a review keeps returning the same family.
- **Check silent sessions at 90 minutes, and set the check when you start the session.** Lane A missed two (one blocked
  on a permission prompt for three and a half hours; one idle for two hours with nothing pushed).
- **Verify what a session says it pushed** (`git ls-remote`) before recording it. Say to the co-founder what you
  verified and what is a session's report.
- **Hooks.** One session made an ops commit with hooks switched off (`-c core.hooksPath`); the push hook still ran and a
  re-scan was clean. Every brief now forbids switching hooks off by any means.
- **CI.** The unit job can time out on slow runners in the redaction tests: re-run failed jobs once and note it. Never
  loosen a limit without a measurement.
- **Effort.** Default for builders; medium for a merge or a records step; high only for one bounded design note. Reviews
  as Agent subagents with a named scope, about 20 tool calls and a report file.
- **Cost.** One weekly allowance is roughly 1,400 API-equivalent dollars; an ordinary merged PR 110 to 130; these PHI
  items two to three times that. Lane A is in its warning until Tue 2026-11-17 14:00 UTC and starts nothing new
  outside the two chains.

## After the before-PHI chain: Lane B's queue, in order
1. Queues item 33 (two web-half follow-ups from schema PR 4; free since #156 merged).
2. Queues item 31 (auth follow-ups from item 28's reviews).
3. Queues item 27 (what #126 left owed; anything on the ledger is the founder's, and its (d) is a migration: Lane A's).
4. Queues item 25 (e) to (g); Queues item 30 (the machine matches CI: PostgreSQL 18.6, node 24).
5. Dependabot's #152 to #155: one replacement PR, never merged as they stand; the model SDK bump gets the model
   gateway's evaluation.
6. The Stryker static-mutant timeouts; the Trivy version; dark mode; the UX queue; the queue lists left by #160 and
   #162 (tops of `approval-summaries/lane-a-schema-pr5-status.md` and `lane-a-key-registry-status.md`), where an entry
   is not a migration.

## Lane A keeps
- The schema chain. Merged on 2026-11-13: #160 (schema PR 5, the ledger freeze) and #162 (Queues item 37, the key
  registry). Next: Queues items 35, 32 and 36, then PR 3 and PR 6 to 10, as the plan places them. None is started
  until the co-founder says, under the allowance's warning.
- Anything that needs a migration, the founder's approval line or the co-founder's typed `/new-migration`: bring it to
  Lane A's orchestrator, do not start it.
- **If Lane A's account is stopped when the founder commits a schema PR's approval line,** Lane B's orchestrator may run
  that PR's merge step as acting Lane A, from the PR's status file, under the same rule (his committed line, green
  required checks). Nothing else of the chain moves without Lane A.
- From the founder's commit on a schema PR until it merges, nothing else merges into the base: fetch the open schema
  PR's head before any merge.

## Shared between the lanes
- **Counters:** Lane A's orchestrator allocates; next free numbers in the last sentence of LANES.md rule 4's counters
  line (now ADR 0096, MOD-26, CAS-59, SEC-29, SGN-32, JOB-10, CI-31, LED-29). If Lane A is stopped, Lane B allocates
  and records there.
- **Records:** after each merge or ruling, STATE.md (current state only) and one dated line in `lanes/lane-b.md`.
  Write your session ID into STATE.md's Lane B line at your first update.
- **The founder's decisions go through the co-founder,** with the exact link or text. Open with him now, blocking
  nothing: three platform administrators named before launch (item 37's two-person rule needs a third); patient names
  that are common words (three options in STATE.md); the glued-ID floor of 5.
- **Never:** sign or approve as the founder; approve or request changes on a PR; open a PR into main; create a tag;
  `--no-verify`, hooks switched off, a forced push, `.gitleaksignore`; files written through the GitHub connector; PHI
  or a model's name in any repository artifact.

## State at the handback (filled at 18:30 UTC)
- To be written: item 40's head and next stage; which sessions stood down; open PRs; anything in flight.
