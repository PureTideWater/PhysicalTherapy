# Acting Lane A: addendum to the Lane B session brief (from Lane B's orchestrator, 2026-11-01)

For the two sessions that act as Lane A: #42's last steps (PR 6b-4), and the schema chain (SS-01, SUITE-CAP-1b, the interest fix). Read lanes/lane-b-session-brief.md whole, then this file whole; where they differ, this file wins. Your prompt adds the item.

Sources: LANES.md rules 2, 6 and 7 and the 2026-10-30 blockquote under "Claims"; lanes/lane-a-handoff-to-lane-b.md section 4 (corrected below where the live state differs); lanes/lane-a-resume.md; CLAUDE.md's schema gate (CO-02), "Merging" and "Pushing"; .claude/skills/new-migration/SKILL.md; docs/runbooks/github-governance.md section 6.

## 1. Who you are, and until when
- You act as Lane A on Lane B's account (GitHub login PureTideWater), started by Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW), until Lane A's account returns: 2026-11-03 14:00 UTC, possibly 15:00 UTC after the US clock change (Lane A's check-in fires at 14:10 UTC).
- LANES.md rule 2 holds in substance: one schema PR at a time; a schema PR merges only with the founder's approval; the founder's decisions stay the founder's. You may add your item's own migration and regenerate the domain model; that replaces the session brief's section 8 line on migrations. Nothing else in the brief changes.
- Do not message Lane A's old sessions (session_01TrKDxeLbxVo7t7zwRXFzrg, session_019i9ifCi6u3MV8sy7oAhUmy). Start from the status files and the refs on origin.

## 2. One schema PR open at a time, in this order
A schema PR adds a migration or regenerates docs/product/domain-model.md. Each opens (a draft into claude/build-platform) only after the one before it has merged; until then, build, merge forward, run the suite and push to its branch, and open nothing.

| # | PR | Branch, head on 2026-11-01 | Migration (its own, unmerged) | Numbers |
|---|---|---|---|---|
| 1 | #42, PR 6b-4 | `co-001/pr-06b-mail-streams`, be63bdc2 | 20261107090000 | ADR 0065; SCR-21, SCR-22, SEC-18, SEC-19, JOB-05 (all used on the branch) |
| 2 | SS-01 | `co-001/ss-01-suspension-refusal`, f897a282 | 20261108090000 | ADR 0080, BIL-07 to BIL-10, synth module 15 if needed |
| 3 | SUITE-CAP-1b | `co-001/suite-cap-1-triage-locks`, 358dc53f | 20261109090000 | ADR 0083 (1b section), CAS-40, CAS-42 (CAS-41 is 1a's, merged); synth module 5 and fixture release 900008 only if needed |
| 4 | Interest credited twice | `co-001/ledger-interest-once`, e0646746 | 20261110090000 | ADR 0084, LED-23 to LED-25, synth module 6; fixture release 900008 only if needed |

The schema PRs are outside Lane B's merge order (brief section 4a); where they share a document with a Lane B PR, the PR merged second resolves it, keeping both (rule 6).

## 3. Migrations
- Only your item's own new, unmerged migration (the table above), and only through /new-migration's route: .claude/skills/new-migration/SKILL.md, followed step by step (forward-only; every PHI table with practice_id, its policy, ENABLE and FORCE ROW LEVEL SECURITY and a registry row; global tables REVOKE INSERT, UPDATE, DELETE from the app role; the Drizzle schema; `pnpm db:migrate`, then `pnpm test:db`; report the tables touched and whether it is safe with the previous image running).
- The protected-edit marker, under the founder's standing permission ("Standing, each PR's own", HANDOFF.md 2026-10-22): `<worktree>/.claude/.allow-protected-edit`, created by a shell command just for the write and removed in a trap; never staged or committed; never for an applied or merged migration. After any stop or restart, remove a leftover marker first. If a permission check refuses the marker, stop that part, record it, tell the orchestrator; never route around a refusal and never bypass another hook.
- Any other migration a design turns out to need: record it as "for Lane A" in your status file; build the rest.
- The ledger freeze stands except for the two exceptions the founder (Tyler Williams) granted on 2026-10-27 20:49 UTC, as written: designs/ledger-interest-once.md section 10.1 and designs/suite-cap-1-triage-locks.md section 4.5. Anything else in packages/ledger/src or on the ledger tables is the founder's: "Waiting on someone".

## 4. Generated files: the tools write them, never a hand
- docs/product/domain-model.md and packages/db/functions: only `pnpm db:domain-model --out --strict` on a freshly migrated database (the default functions directory). Commit every file it writes or removes in the same PR, before the founder signs (any later commit comes after the approval). Never edit or hand-merge either: on a merge conflict in them, regenerate on the merged tree and commit what the tool wrote.
- Before each push: `pnpm db:domain-model --check` on a fresh database; record the document's SHA-256 and the approval line's number in your status file. A hash is provisional until the PR's final head.
- Read every changed function file's diff for the skill's hazards (SECURITY DEFINER, tenant scope, privileges or PUBLIC first) and name each one found in the description.
- pnpm-lock.yaml (`pnpm install`), tools/screening-capacity/watched-paths.txt (`watched.ts --write`) and synth output (`synth --all`) likewise: generators only.

## 5. The PR description
- Fetch origin, then open the description with the output of `pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs list`, whole and unedited; then every section of .github/pull_request_template.md ("None" rather than omitted).
- Under 65,536 characters: count it before sending; move long tables into an approval-summaries record and link it. Send it with the MCP update_pull_request tool and read it back (length and SHA-256). Regenerate the summary after any change to the schema or the base.

## 6. The approval line: the founder's alone
- NEVER write the "Approved by:" line, and never write or edit packages/db/domain-model/approvers.json (the hooks refuse both; never route around them). Never approve or request changes on any PR: no `event` APPROVE or REQUEST_CHANGES, no `pulls/<n>/reviews`, no `gh pr review`, no connector review tool.
- Post the line only when the head is final: CI green on it except `domain model`, whose log names only the missing approval line; the fresh-clone verification passed; the regenerated files committed; nothing more to push. Post the line `pnpm -s db:domain-model --check --require-approval` names, ONLY as a suggested change, in one pull-request review comment on the approval line (the last line of docs/product/domain-model.md at the head):

````
gh api repos/PureTideWater/PhysicalTherapy/pulls/<n>/comments -f commit_id=<head sha> -f path=docs/product/domain-model.md -f side=RIGHT -F line=<the approval line's number> -f body=$'```suggestion\nApproved by: Tyler Williams  Date: <YYYY-MM-DD>  Document SHA-256: `<the full hash>`\n```'
````

  The body opens with that suggestion block exactly; after it, as on #39 (discussion_r4355538721), one short paragraph (what it approves, that the hash is the one `--check --require-approval` names on a fresh database, that the build does not write this line itself) and the Claude Code footer. If `gh api` refuses, stop and record it; post nothing else.
- Then report "waiting on: the founder's commit of the suggestion <link>" (brief section 7a). The founder (Tyler Williams) commits it on GitHub, as on #39 (54ec890). Once `APPROVAL_REVIEW_REQUIRED` is true (runbook 3i), the founder's APPROVED review of the latest commit is also the approval of record, and any later push dismisses it.
- No merge without the founder's committed line and approval-of-record green. After the founder's commit: merge the base if it moved (a base merge without a migration leaves the document and its hash unchanged; if anything changes the document, the line is void: regenerate and post a new suggestion), CI green on that head (`domain model` and `all green` included), mark ready, wait for approval-of-record's re-run, then merge_pull_request with method merge and expectedHeadSha. Report "merged"; the orchestrator tells the next session in the chain.

## 7. #42's last steps (handoff 4a, corrected)
Status file: create `approval-summaries/lane-a-pr42-status.md` (the records so far are `approval-summaries/lane-a-wip/progress/pr42f-{integrate,body,verify,merge78}.md`). Worktree /home/user/pr6b4 (setup argument `co-001/pr-06b-mail-streams:/home/user/pr6b4`); script to adapt `workflow-scripts/lane-a-pr42-final-round-wf_fb12f910-d87.js` (its prompts carry every rule and command).
1. Merge claude/build-platform (83d71fd6 or later) with a merge commit; run the generators; keep tables.test.ts's exemptions (console/support 1, users 2, support-access 1). In the same round, record the founder's 2026-11-01 legal sign-off (rule 8) in ADR 0065, ADR 0062 and reconciliation-001 wherever they still say the words await the founder's sign-off: it must land before the suggested line. Run the checks the delta needs; `--check` must still read SHA-256 `b23fed0ec4fa9658a7751af0b6e58974acc64996343f8ae683d2149b495d2518` at line 7334. Push once.
2. The description (section 5): the summary whole at the top; the legal section titled "signed off by the founder 2026-11-01, as written", its whole text in approval-summaries/pr6b4-review-record.md section 1 with a pointer, that section retitled to match on claude/build-ops; the founder's actions compact but whole (items 2 to 7 block the launch, not the merge).
3. One PR comment on the `images` failure of 46974a25: #77's step passed buildx's whole metadata, which carries the description, in one environment variable (132,387 bytes against Linux's 131,072); fixed in be63bdc2 with #86's exact lines (patch SHA-256 8cf981fb…). Footer at the end. Whichever of #42 and #86 merges second resolves that fix by rule 6.
4. The fresh-clone verification, reading CI on the new head. 5. The suggested line (section 6). 6. The merge (section 6).

## 8. The schema chain (handoff 4b, corrected)
Status file `approval-summaries/lane-a-schema-chain-status.md`: correct it first (SS-01 at f897a282, not f5bd6201; the interest fix at e0646746, five commits on 358dc53f, its integrator and full suite not yet recorded; 1b unchanged at 358dc53f). Setup arguments `co-001/ss-01-suspension-refusal:/home/user/ss01 co-001/suite-cap-1-triage-locks:/home/user/sc1b co-001/ledger-interest-once:/home/user/interest`. Scripts to adapt (start new runs; the old runs cannot be resumed): `workflow-scripts/lane-a-base-into-ss01-sc1b-deferred-wf_96af352a-4ed.js` and `lane-a-interest-once-build-wf_4860596d-bb1.js`.
- While #42 waits: merge the base (83d71fd6 or later) into SS-01 now, and #42's step-1 head once #42's session pushes it, each with a merge commit (regenerate the domain model and function files; resolve `apps/web/scripts/synthetic-personas.ts`; wrap a new bare table in ScrollTable rather than change tables.test.ts's counts). Then SS-01 into 1b (the domain model regenerated; test-matrix, ci.md, the synth matrix and registry keeping both), 1b's deferred parts (measurement gate slice 1, CAS-42.1 and .2, SLOW_FIRST, ADR 0083's 1b section) and its full suite; then 1b into the interest fix, its integrator and full suite.
- 1b's real-size runs need an 8-CPU runner (this container's 4 CPUs stop as RUNNER_TOO_SMALL): record "waiting on the founder: an 8-CPU runner" and build the rest.
- Each PR opens only when the one before has merged (section 2), with its own final tree's hash.

## 9. Records, and Lane A's return
- Record acting-Lane-A work in your status file at every stage (brief section 7, with "acting Lane A" in each entry) and archive scripts as `workflow-scripts/lane-a-<item>-<stage>-<runId>.js`. The orchestrator logs it in lanes/lane-b.md tagged "acting Lane A". Nobody edits Lane A's own log (HANDOFF.md, the tracker) or creates or edits a lanes/lane-a.md (rule 10).
- Start no heavy run that cannot finish before 2026-11-03 14:00 UTC. When Lane A returns (or the orchestrator says so), stop at a clean point: finish the step in progress (never cut a run off mid-way), push every branch, WIP ref and progress file, remove any marker, and write a "Handed back to Lane A, <UTC>" block at the top of your status file (heads, CI state, open PR and suggestion links, the exact next step, what waits on the founder). Report "stopped: handed back to Lane A" and take no further step; the orchestrator writes the handoff back.
