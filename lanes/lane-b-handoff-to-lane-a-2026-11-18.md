# Lane B's handoff to Lane A, 2026-11-18

Written 2026-11-18 01:30 UTC by Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW), at the co-founder's ask:
Lane A takes everything Lane B holds. **Lane B is paused by the co-founder (2026-11-14 01:28 UTC) and stays paused
until they say go; none of its sessions runs.** Read `lanes/STATE.md` first (current state), then this file, then only
the status file of the item you start: its RESUME-BLOCK is the exact next step. If STATE.md or a ref is newer than
this file, trust it and say what differs. This file replaces `lanes/lane-b-handoff-to-lane-a-2026-11-10.md`.

## 0. On one screen

- **The base:** `claude/build-platform` at **6299c550** (#163, Queues item 40), unchanged since 2026-11-13 23:29 UTC.
  Its three push runs are green (ci on its second attempt: section 6). Verified 2026-11-18 01:00 UTC.
- **No PR of the build is open.** Dependabot's are: #152 to #155 (untriaged since 2026-11-12), and two opened on
  2026-11-17: **#166 (next 16.4.3 to 16.4.5, its *security* group)** and #165 (docker/login-action 4.7.0 to 4.8.0).
  Never merged as they stand; #166 wants the build's own replacement PR soon.
- **Lane B worked from 2026-11-13 19:00 to 2026-11-14 01:30 UTC** on `lanes/lane-a-handoff-to-lane-b-2026-11-13.md`:
  one PR merged (#163), item 39 built to its review, item 41 designed and coded, item 42's note drafted, Queues
  items 42 to 45 queued. Since the pause nothing moved: the last commit on `claude/build-ops` before this handoff is
  25e06ded (2026-11-14 01:33 UTC).
- **Three things are in flight, each on a pushed ref with an exact RESUME-BLOCK** (section 1). No Lane B session
  holds anything unpushed; none is to be resumed (section 5).

## 1. The before-PHI chain: no real patient data until it is closed

| # | Item | State at the handoff | Head (verified by ls-remote 2026-11-18) | Next action | Where |
| --- | --- | --- | --- | --- | --- |
| 1 | **Queues item 40** (identifiers beside or around odd characters; MOD-25) | **MERGED**, #163 | base 6299c550 | none | `approval-summaries/lane-b-redact-item-40-status.md` |
| 2 | **Queues item 39** (the letter check's time; cures item 40's cost 6; MOD-26; before launch) | stages 1 to 5 built; review 1 (PHI) done, **its blocker P-1 fixed** in fix round 1; review 2 not run | `co-001/wip-redact-item-39` **7d93b055** (9 commits over the base, 0 behind) | review 2 afresh, the delta review, the measurements, ADR 0054, PR, merge | `approval-summaries/lane-b-redact-item-39-status.md` |
| 3 | **Queues item 41** (odd characters from a wrong decoding; MOD-27) | designed, ruled, stages 1 and 2 coded; **the head is NOT to the orchestrator's last ruling**; the bar not measured; no review | `co-001/wip-redact-item-41` **b009d863** (3 commits over the base, 0 behind) | apply the ruling's points 2, 3, 4; measure; two reviews; PR; merge | `approval-summaries/lane-b-redact-item-41-status.md` |
| 4 | **Item 41 (a)**, the count's table | designed; a **migration**: Lane A's schema chain | none | the co-founder's typed `/new-migration`, the founder's line | `designs/lane-b-redact-item-41/design-note.md`, section (a) |
| 5 | **Queues item 42** (a visible character inside an identifier; a surname glued to a word) | measured design note, **DRAFT** | ops 953787ff | finish the note from its RESUME-BLOCK; rule; build | `designs/lane-b-redact-item-42/design-note.md` |
| 6 | **Queues item 44** (an unstored phone or SSN beside a number character) | queued, not started | none | a measured design note first | LANES.md, Queues item 44 |
| 7 | **The redaction sweep** (the co-founder opted in once) | not run | none | tell the co-founder its fixed budget first | STATE.md, token rules |

- **Order.** Items 39 and 41 both change `packages/redact/src/redact.ts` and
  `packages/model-gateway/src/redact.leaks.test.ts` (checked: the only two files both WIP refs touch). Merge item 39
  first: it is nearer, and it restores the long-letter limit that item 41's second reading spends. Item 41 then merges
  the base and measures on the merged tree. Expect a one-line conflict in `test-matrix.md` (MOD-26 beside MOD-27).
- **The sweep.** The opt-in says after items 40 and 41. Lane B's advice: run it after items 42 and 44 too, or it
  spends its budget finding the two classes those items already name.

## 2. Each item

### Queues item 40: merged (#163, 6299c550)
- Merged 2026-11-13 23:29 UTC, a merge commit, parents 4d40557f and 1a7c5270 (verified on the base).
- Lane B redid stage 5a: W76 had pushed nothing. The first independent measurement matched W75's counts file for file.
- Lane B's three independent reviews (`designs/lane-b-redact-item-40/reviews-lane-b/summary.md`, ops 4120cef4): no
  blocker; five should-fix. Verdicts on Lane A's rulings: (a), (e), (f) agreed; (b) agreed on the outcome, not the
  method; (c) agreed with a caveat; (d) agreed on the principle, corrected on the facts.
- **Costs it carries, recorded in ADR 0054 (cost 6), false refusals only, never a leak:** prose with one `½` and one
  U+0085 refused from about 77,600 characters (S-1); a claim letter with a footnote mark and CR LF from about 63,400
  (C-1). Item 39's stage 5 cures both (by its builder's report they are sent again with no identifier in clear).
- **What it left owed, and where each went:** S-5 (initials after an unseen character) to item 41, coded; ruling
  (f)'s partial fix to item 41, coded; L-1 and S-4's general case to item 42; the unstored phone to item 44; the
  undotted last initial to item 45; `redact.leaks.test.ts:1955` (4.5 s against the 5 s default) and
  `time-budget.test.ts:34` (calibration spread) to Queues item 30; **C-2 (`redactionSpans` counts each stage from
  zero) is for item 39's review 2**, the cost review.

### Queues item 39: built, in review (WIP 7d93b055)
- **Design** (`designs/lane-b-redact-item-39/design-note.md`, ops 7bbd4dc1): G-1's square is `viewOf`'s array store,
  not pattern building; a per-call automaton with lazy patterns takes the cold check from 4.06 s to 0.32 s at 1,000
  nine-character numbers. Rulings (lane-b.md, 2026-11-13 21:10 UTC), all as recommended: per call, nothing kept past
  the check; the views Map its own stage; our own automaton, no third-party code; item 40's windows as stage 5; the
  dense rule's 16 places a constant; no identifier ceiling by count.
- **Built:** stages 1 to 4 (5af1c9a0; the final gate run twice, by two sessions: 0 of 975,489 differ, none over 3 s),
  stage 5 on the merged base (c1caa730). The merge had to drop `\p{Nl}\p{No}` from item 39's skeleton, because item
  40 made them joiners; item 40's S-4 tests caught a member ID sent otherwise.
- **Review 1 (PHI), done** (`designs/lane-b-redact-item-39/reviews/`): **P-1, a reproduced blocker:** a window edge
  cut an identifier whose gap holds 256 or more characters of white space (`Member ID 7654`, U+0085, 256 spaces,
  `3210`): the base held it, c1caa730 sent both halves in clear. **Fix round 1 (7d93b055)** widens a window's reach
  by twice the longest identifier, counted in kept code points, and drops the spans before the entry returns (P-3).
  P-2 is recorded by a test, to be stated in ADR 0054. P-4 is a nit for the queue.
- **Not done:** review 2 (time and cost) was stopped by the pause with no report: run it afresh on 7d93b055, with
  C-2 and fix round 1's two uncharged passes in its scope; the delta review of fix round 1 (attack `reachOf`'s
  bound); the whole unit suite, item 40's generated set, the full gate, both fuzzers and the budget rows on 7d93b055;
  ADR 0054; the PR; the merge. The RESUME-BLOCK lists the six steps in order.

### Queues item 41: coded, not to the last ruling (WIP b009d863)
- **The design note's finding** (ops 8e7f7842): mending at extraction as the item was first written FAILS the bar.
  A C1 character that item 40 refuses inside an identifier becomes a visible character that hides it: 22 rows sent
  against the base, 317 against item 40's head. **Variant k** holds both bars: a C1 read as a line break, and the
  unmended, refusing reading when the text with the C1 taken out holds more of the patient's stored identifiers. All
  52 of item 40's real-shaped refusals given back; 0 in clear on the unseen sweep; 0 of 975,489 gate letters differ.
- **Rulings on its ten questions** (lane-b.md, 2026-11-14 00:55 UTC): variant k, yes; the text stored as extracted,
  the Windows-1252 view at render only; S-5's prototype and ruling (f)'s partial fix, yes; the spacing phone pass,
  no (it sends 255 rows the head refuses); the count's table to the schema chain, with an intake log meanwhile.
  **Against the designer's recommendation: `csvText` keeps its latin1 reading until item 42 merges.** A 1252 decode
  is the failed mending at the decoder: a byte 0x85 or 0x80 inside a stored number becomes a visible character and
  the number is sent, where today the letter is refused.
- **Built on b009d863** (three commits): variant k in the reader's three entries; `mendExtracted` in the web app
  only, called by `CitedPageView`; an intake log event (practice ID, document ID, code point, count; two allowlist
  fields; `pnpm lint:logs` passes); a synthetic PDF whose font maps bytes to C1 code points
  (`fixtures/synthetic/MOD-27/letter-misdecoded.pdf`); S-5; ruling (f). 4,088 redact tests and the typecheck green.
- **The ruling of 2026-11-14 01:05 UTC reached the builder after the pause. None of it is applied. b009d863 must not
  become a PR as it stands.** Its points, in the RESUME-BLOCK word for word:
  1. No fallback on a refused joined reading (nothing to change).
  2. Remove the six hand-pinned exceptions. Restate item 34's property over the whole recorded corpus: for a letter
     with a C1, the head refuses it, or its outcome equals its line-break twin's and the base does not refuse the
     twin. If the base refuses a twin, k must refuse: stop and report.
  3. **The fallback by span, not by a count of placeholders** (a code change). A count can tie: stored claim 7654
     and stored member ID 76543210, text `7654<U+0085>3210`, would send half the member ID. Rows first, with the
     same shape for a date of birth and a name part.
  4. Each of item 40's moved pins asserts that no fragment of the value is in clear.
  5. For the reviews: an unstored SSN or phone split by a C1. The note says the first reading refuses it; break it.
- **Not done:** the bar's measurements for either stage; the two adversarial reviews; ADR 0054; the PR; the merge.
- **A loose end the builder did not look into:** its `apps/web` unit run showed 2 failures in a pg-boss
  `lock_timeout` test and 99 files that need a database. Its container had no database for them. Confirm on a
  machine set up by `tools/setup-container.sh` before the PR; none of the files is this item's.

### Queues item 42: draft note (ops 953787ff)
- Set 42 is generated (64,508 letters, 15,745 synthetic patients). First reading, not reviewed: on the base a member
  ID or claim number is sent with any inserted letter, punctuation, symbol, currency sign or emoji; so are a Social
  Security number, a phone number and a date of birth; a name is sent with a letter or digit inside it; a name word
  of four letters or more glued to a letter before it is sent.
- Not run: the gate's bar on any candidate rule. The RESUME-BLOCK names the next commands. Then a ruling, then a
  build with two adversarial reviews. `csvText`'s 1252 decode waits for this item's merge.

### Queued by Lane B, not started
- **Queues item 43:** `apps/web/src/lib/screening/routes.db.test.ts:1356` found a row in `pg_locks` after a refused
  upload's transaction, twice on 2026-11-13 (on #163 and on the base's push run), green on each re-run. First find
  whether the product holds the lock or the test reads too early. If it fails again it blocks merges: raise it.
- **Queues item 44:** the spacing pass as a detector only, the letter refused on a new phone- or SSN-shaped find.
  Neither corpus holds a sent letter of that shape today, so the expected cost is none, to be shown on the gate.
- **Queues item 45:** the undotted last initial; before launch; a design note first.
- **P2, the Trivy version:** designed and re-read; held in `approval-summaries/lane-b-ci-deps-status.md` (ops
  933b4ba8); its place is after the before-PHI chain and items 33, 31, 27, 25 and 30.

## 3. Lane B's rulings, for Lane A to try to break
Lane A wrote none of these. Give your reviewers the code and tests, not these conclusions. Each has its why in
`lanes/lane-b.md` at the time given (2026-11-13 unless dated).

| When (UTC) | Ruling | The weak point to test |
| --- | --- | --- |
| 20:00 | Item 40 ships with S-1 and C-1 as recorded costs, not held for the windows | real letters over 63,400 characters with a footnote mark are refused until item 39 merges |
| 20:00 | S-4's narrow part: U+FFFC and every `\p{Nl}`/`\p{No}` character inside a stored identifier read as joiners | ADR 0054's joiner list grew; a false join across ordinary digits |
| 21:10 | Item 39's six design rulings | the automaton is ours: its proof is a property against `indexOf` |
| 23:18 | A second `unit` re-run on #163, an exception to "once" | both failures were wall-time tests outside the diff |
| 11-14 00:55 | Item 41: variant k; no 1252 decode yet; ruling (f)'s fix with two named over-redactions | k trusts the first reading to refuse a split, unstored SSN or phone |
| 11-14 01:05 | Item 41: the property restated by the line-break twin; the fallback by span | not built yet; the twin's base verdict must be recorded from the base tree |
| 19:27 to 11-14 00:55 | Counters and queue numbers allocated by Lane B: MOD-26 (item 39), MOD-27 (item 41), Queues items 42 to 45 | Lane A was in its warning, not stopped; its session cannot be reached from Lane B's account. Next free: MOD-28 and LANES.md's counters line |

## 4. What the orchestrator verified, and what is a session's report
- **Verified:** every branch head in this file (ls-remote, 2026-11-18 01:00 UTC); #163's merge commit and parents;
  the base's push runs, read from the runs; the open PRs; that no Lane B trigger is enabled; that the three paused
  sessions are idle; that the two WIP refs sit on the base with 0 commits behind.
- **Reported by sessions, not verified:** every gate, generated-set, fuzz, sweep and timing number of items 39, 40,
  41 and 42, and every "green" test count. Treat the first run on a merged tree as the first independent measure.

## 5. Sessions and triggers (Lane B's account)
None is to be resumed: contexts are at 150k to 313k tokens and the containers are gone. Start fresh sessions.

| Session | What it did | State |
| --- | --- | --- |
| session_01FcouKP4rfmi6Cbb4CvWwcc | item 39, review 1 and fix round 1 | paused, idle, holds nothing |
| session_01FcouKNWt4V5EbpQzhUWvUN | item 41, stages 1 and 2 | paused, idle, holds nothing |
| session_01FcouKMqw1RpxuTqUNpDURZ | item 42, the draft note | paused, idle, holds nothing |
| session_01FcouKNKwVFVHfmZfiuVbLj | item 40, stage 5b: merged #163 | done |
| session_01FcouKRdnrwokt5fwcRT2co, session_01FcouKNbkkBwPEax5YvGeCP | item 40, stage 5a; its three reviews | done |
| session_01FcouKRa7cSC1zgExrLkSJv, session_01FcouKRgpBd8UGZTtECU96A, session_01FcouKRQxSj8XN9JnvENLYX | item 39: the note; stages 1 to 4; stage 5 | done |
| session_01FcouKPtWbZ9M7UqZK6rCJF | item 41, the design note | done |
| session_01FcouKNP2XtaombFLueKLnu | P2, the Trivy version | held, idle |
| Lane B's sessions of 2026-11-01 to 11-07 | their items merged under Lane A on 2026-11-10 and 11-11 (#126, #129, #134, #138) | idle, hold nothing |

- **Triggers:** no Lane B trigger is enabled. The orchestrator's last check-in (trig_01E16wfydjsnXo2fzp9jbnGB) is
  switched off. The account also runs other, unrelated work of the co-founder's with its own triggers: leave those.
  That work draws on the same allowance; Lane B's weekly reset is Fri 2026-11-20 19:00 UTC.

## 6. How it went: for your briefs
- **Cost.** By the sessions' own usage figures, Lane B's ten sessions of 2026-11-13 and 11-14 cost about 90
  API-equivalent dollars in all, the orchestrator not counted, some read mid-run. What kept it low: one stage a
  session; the reviews in a session of their own that read only the diff (60k tokens); a measured note before a
  build; rulings written into briefs.
- **Context.** Sessions still filled 150k to 313k tokens in 15 to 90 minutes; four of ten passed the 200k mark.
  Ask for the context figure at every stage's end and hand over when it passes 200k.
- **A ruling sent to a running session arrived 32 minutes late**, after the pause. Put rulings in a new session's
  brief. A message that must land at once takes the "now" priority: the pause reached three sessions that way, and
  each stopped inside three minutes with its work pushed and a RESUME-BLOCK.
- **New sessions carried an appended prompt** that authorised pushes to `co-001/*` and `claude/build-ops`, their own
  draft PRs and the merge where the brief gave it, and repeated the Never list, the no-model trailer and STATE.md's
  token rules. With it no session refused an orchestrator's ruling. Each session's model was set at creation.
- **`/home/user/ops` has no pre-push hook.** Push `claude/build-ops` from the main checkout
  (`git -C /home/user/PhysicalTherapy push origin claude/build-ops`), as LANES.md rule 11 says.
- **CI.** Seen on 2026-11-13: `unit` timing out in `redact.leaks.test.ts:1955` and `time-budget.test.ts:34`;
  `db (4/4)` failing on `routes.db.test.ts:1356` (Queues item 43). The job-log download host is blocked by the
  proxy: read a failed job's log through the GitHub tool, saved to a file.

## 7. Where Lane B departed from Lane A's 11-13 handoff
1. STATE.md was updated at Lane B's first update only, then at 23:20 UTC and after; rulings between went to
   `lanes/lane-b.md` alone.
2. Lane B allocated MOD-26, MOD-27 and Queues items 42 to 45 though Lane A was in its warning, not stopped.
3. #163's `unit` job was re-run twice, not once.
4. Items 41 and 39 ran beside item 40, not after it; item 39 went past its note into a build on its own branch.

## 8. For the founder and the co-founder (through the co-founder, each with the exact link or text)
- **Item 41 (a):** the table `page_text_character` is a migration: the co-founder's typed `/new-migration` and the
  founder's approval line on its schema PR. Before any real PHI.
- **The sweep:** its fixed budget, told to the co-founder before it runs.
- **Open from Lane A's handoff, relayed to the co-founder 2026-11-13 19:27 UTC, no answer recorded:** three platform
  administrators named before launch; patient names that are common words (three options in STATE.md); the glued-ID
  floor of 5.
- **A product risk, unchanged:** a payer whose letters carry U+0085 on every line. Variant k reads a line-end U+0085
  as a line break, so those letters are no longer refused for it; the count (item 41 (a), and the intake log
  meanwhile) says how many letters hold such characters once real letters arrive.
- Everything else under "Founder items" in STATE.md is as Lane A left it.

## 9. Lane B's queue, in order
1. The before-PHI chain: item 39, item 41, item 42, item 44, item 41 (a) in the schema chain, then the sweep.
2. Queues item 43, ahead of the rest if it fails again.
3. Queues items 33, 31, 27, 25 (e) to (g), and 30 (with the two wall-time tests of section 2).
4. Dependabot's replacement PR: #166 first, then #152 to #155 and #165; the model SDK bump gets the gateway's
   evaluation.
5. The Stryker static-mutant timeouts; the Trivy version; dark mode; the UX queue; Queues item 45; the queue lists
   left by #160 and #162 where an entry is not a migration.

## 10. Never (unchanged)
Sign or approve as the founder; write the approval line or `approvers.json`; approve or request changes on a PR;
merge a schema PR before the founder's line; open a PR into main; create a tag; `--no-verify`, hooks switched off, a
forced push, `.gitleaksignore`; files written through the GitHub connector; PHI or a model's name in any repository
artifact. Synthetic data only.

## 11. The prompt the co-founder pastes into Lane A's orchestrator

```
You are Lane A's orchestrator for the PaidWhole build (PureTideWater/PhysicalTherapy). Lane B is paused and has
handed everything it holds to you. This message is my go for Lane A to take that work. Lane B stays paused until I
say otherwise.

Read on claude/build-ops, in this order, and nothing else until you need it:
1. lanes/STATE.md: the current state, the token, model and effort rules, the Never list.
2. lanes/lane-b-handoff-to-lane-a-2026-11-18.md: what Lane B did, what is in flight, every ruling it made, and what
   it verified against what its sessions only reported.
3. Only the status file of the item you start. Its RESUME-BLOCK is the exact next step.

Verify before you trust. With git ls-remote, expect claude/build-platform at 6299c550, co-001/wip-redact-item-39 at
7d93b055 and co-001/wip-redact-item-41 at b009d863. Check the open pull requests and that no Lane B trigger is
enabled. Where anything differs from the handoff, the refs and STATE.md win: tell me what differs.

Then write your session ID into STATE.md as the orchestrator, take Lane B's items as yours there, and run the
before-PHI chain in this order. One stage per fresh session. Never resume a Lane B session.
1. Queues item 39: review 2 (time and cost) afresh on 7d93b055, the delta review of fix round 1, the measurements,
   ADR 0054, the PR, the merge.
2. Queues item 41: apply points 2, 3 and 4 of Lane B's ruling of 2026-11-14 01:05 UTC BEFORE any measurement.
   b009d863 is not to that ruling and must not become a pull request as it stands. Then the bar, two adversarial
   reviews (one must try an unstored SSN or phone split by a C1 character), the PR, and the merge after item 39:
   both change redact.ts.
3. Queues item 42: finish the measured design note from its RESUME-BLOCK, rule on it, then build.
4. Queues item 44: a measured design note first.
5. Item 41 (a), the count's table: it is a migration, so it is your schema chain. Bring me the /new-migration to
   type and the founder's approval line when its pull request is ready.
6. The redaction sweep, only after the items above have merged. Tell me its fixed budget before it runs.
After the chain: Lane B's queue in the order of the handoff's section 9. The schema chain stays as STATE.md places it.

How to work: STATE.md's rules as written. Lane B's rulings are in the handoff's section 3. You made none of them,
so have your reviewers try to break them from the code and the tests, as Lane B did with yours. Put a ruling into a
new session's brief, not into a message to a running session. Verify every reported push with git ls-remote, and
tell me what you verified and what is only a session's report.

Decide what an expert software architect would decide, taking the safer option for security and patient data. Bring
me only the founder's decisions, each with the exact link or text: approval lines on schema pull requests, freeze
exceptions, legal text, release tags, owner settings, and reversing a founder's ruling. Open with the founder now,
blocking nothing: three platform administrators named before launch; patient names that are common words (three
options in STATE.md); the glued-ID floor of 5.

Never: sign or approve as the founder; write an approval line or approvers.json; approve or request changes on a
pull request; merge a schema pull request before the founder commits its line; open a pull request into main;
create a release tag; use --no-verify, switch hooks off, force a push or touch .gitleaksignore; write files through
the GitHub connector; put patient data or a model's name in any repository artifact. Synthetic data only.

Records: after every merge or ruling, STATE.md (current state only) and one dated line in lanes/lane-b.md. Before
your account nears its limit, stand every session down at a clean point and leave STATE.md as the handoff.

Start now. Then tell me in five lines: what you verified, what differs from the handoff, which sessions you
started, and what you need from me.
```
