# Lane B ci-browser: the re-verification of 6d945c7b and the corrected description (wf_4b80f4eb-9bb)

One agent in a fresh clone, read-only on GitHub, 2026-10-27 22:02 to 22:06 UTC. Its report as returned:

**Verdict: PASS.** All three checks pass. One description update is now due: CI on the new head 6d945c7b finished after the description was last edited, and that run is not recorded yet (item 3a). There are also two minor wording notes (3b, 3c).

I ran this from 22:02 to 22:06 UTC on 2026-10-27, in a fresh clone at /home/user/reverify-cib, detached at origin/co-001/ci-browser. The clone is now removed. On GitHub I only read: nothing was commented, reviewed, approved, merged or pushed. The saved description and the A9 note at dd9e0d66 are in /tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad/reverify/.

**1. The new commit: PASS**
- `git ls-remote` shows co-001/ci-browser at 6d945c7bcab7830f5f0b140ca4ddd766c82203b5, checked at the start and again at 22:06. Its only parent is 64843249577a4a72994776230a9bec2b77dc2133.
- `git diff --name-only 64843249 6d945c7b` lists exactly three files: ADR 0058, ADR 0066 and docs/runbooks/ci.md. The change is 7 insertions and 5 deletions, all wording.
- The new text is true. After `flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile` (exit 0, Node 24.22.0, pnpm 10.34.8), I read playwright-core@1.64.1's `lib/coreBundle.js`:
  - `:38820-38823` sends `Page.captureScreenshot` and returns `Buffer.from(result2.data, "base64")`.
  - `_screenshot` (`:22991`) returns that buffer unchanged.
  - The library's only PNG encode is `PNG.sync.write(diff2)` at `:8571`, the comparator's diff. That is the only match in all of playwright-core's lib, and the playwright package's lib has none.
  - playwright's `matchers/expect.js:12479` and `:12651` write the actual buffer as it is when it updates snapshots.
  - This agrees with section 4 of the A9 note.
- There is no model name in the diff. In the commit message, the one hit is the branch name `claude/build-ops`.
- The message ends with the two attribution lines: the co-author line with the noreply address, then the session-link line.

**2. CI on 6d945c7b: PASS**
- There are 34 check runs: 32 succeeded and the two `notify` jobs (122488868523, 122495813866) were skipped by design. Nothing is still running.
- The ci run 40589173731 (pull_request) succeeded. GitHub's merge commit for it is 62675757, with parents 085299bd and 6d945c7b.
- The four required checks are green:
  - `all green` (122492325952): "every job it needs succeeded (8 jobs)".
  - `mutation` (122494810038): "mutation gate: passed".
  - `screening-capacity gate` (122495811315): success.
  - `approval-of-record` (122488590417 and 122489723498): success, "needs no review of record".
- The pull request is open with `mergeable` true and `mergeable_state` "clean". It is also still a draft, and has been since it was opened (no draft or ready-for-review event).
- The base is claude/build-platform at 085299bdf7d31b18553fb2a278025ea9f196190f.

**3. The description: PASS on every listed item**
- **Mismatch 1 is fixed.** "Shared with #42" now lists `tools/screening-capacity/measure.test.ts`, with #42's hunks `-7,7` and `-100,6`, and says `git merge-tree` with 6f23c42b merges it cleanly.
- **Mismatch 2 is fixed.** The failing-first count reads 34 red and 32 behaviour reds (30 in `workflows.test.ts`, 2 in `browser-version.test.ts`), plus the 2 `node_modules` readers. It also gives 367a659f's tests as 31 (29 behaviour reds) and the difference as five added and two dropped.
- **Mismatch 3 is fixed.** "What CI showed on 64843249" records:
  - ci 40581096032 and its sibling runs;
  - unit 6,352 passed, 1 skipped; db 3,152 + 2,615 + 2,534 + 922 = 9,223 over 127 files; e2e 27 + 27; golden 376;
  - the baseline step's seven SHA-256s from e2e (1/2), job 122461666053 (I confirmed that name), equal to the committed files;
  - the three `--image` checks with the version line;
  - the containerd `.Id` equal to `target`;
  - the dry run's six outputs and its checked loads;
  - the runner images and the apt key's `ImageVersion` values, with 0 kept and 0 discarded;
  - release-capacity run 40584379787.
- **Mismatch 4 is fixed.** The A9 note is linked at blob/dd9e0d66ee8b259c183b3b4d005b35e3bcf02bd5. That commit is on claude/build-ops (21:19:31Z), and the file there is identical to the ops copy. Its quoted figures hold: "Overall verdict: pass, no finding", 117 of 8,616.96 allowed, and 23 PNGs plus `SHA256SUMS`.
- **Template:** all eight sections are present. Every "What it does not change" line is answered, the required-checks markers are there, and "The founder's approval" matches the template text word for word.
- **Footer:** the description ends with the attribution footer (the generated-with line, then the session link).
- **Model names:** none. The only "claude" words before the footer are branch names and `.claude/agents/ux-brand-reviewer.md`.
- **Numbers:** I checked ten against the earlier report and all match:
  - the unit and db counts;
  - the mutation scores (96.58%, 98.67%, 98.48%, 97.75%);
  - 1,611 pixels in 234 × 27 at (83, 418), 0.19%;
  - the runner images and `ImageVersion` values;
  - 52.3 s against the base's 54.0 s (run 40567044160);
  - 718 passed locally, 1,620 lint files and 1,057 log files;
  - the seven new SHA-256 prefixes;
  - "CI-3 7 red of 114";
  - the 287 and 301 file counts.
- The browser-encoder wording on line 9 and in the deviations list matches the commit.

**Follow-up and notes**
- **a. Due now:** the description says 6d945c7b's own run "is recorded here when it has run". It has run: ci 40589173731 is green and the last required check finished at 21:59:35Z. The description was last updated at 21:46:01Z, so the run is not recorded. This is the same kind of gap as the earlier mismatch 3, and it should be added.
- **b. Minor:** the reviewer-table row for CI-8 still says "Fixed above: 29 behaviour reds plus the 2". That is true for 367a659f's tests, but it reads as stale next to the head's 32 + 2.
- **c. Minor:** for 64843249 the description says "every check green". On that commit the dispatched release-capacity `capacity` check (122471867560) is red, which is SUITE-CAP-1 and is described in the same section (36 runs: 33 succeeded, 2 skipped, 1 failed). Saying "every pull-request check green" would be exact.

Follow-ups a, b and c were applied to the description at 22:10 UTC (body v4, read back byte for byte); the PR merged at 22:13 UTC as ecebdc90.
