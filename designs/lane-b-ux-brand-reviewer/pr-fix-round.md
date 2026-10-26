# PR #55 fix round (`co-001/ux-brand-reviewer`)

*Lane B, 2026-10-26. The fix round for draft PR #55 at eea716d, in the worktree `/home/user/ux-brand-reviewer`, against
review 1 (`designs/lane-b-ux-brand-reviewer/pr-review-brand.md`: 2 blocking, 10 should fix, 9 nits) and review 2
(`designs/lane-b-ux-brand-reviewer/pr-review-fit.md`: 1 blocking, 12 should fix, 7 nits). Each finding was re-opened
against the files first (the worktree at eea716d, the base's head 7ef421b, and the ops files on `claude/build-ops` at
ba4c870). Synthetic data only. Not pushed.*

**Result.** 41 findings: 41 applied, 0 rejected. Every finding held when re-opened. Four of them also need a step
outside the worktree (the session's, listed under "For the session"). `.claude/agents/ux-brand-reviewer.md` is now 128
lines (it was 99). Commit `d82031ab`, not pushed; the suite passed (details at the end).

**The synthesis exists now, and it wins.** `designs/lane-b-ux-review.md` landed at 09:24 UTC (208 findings: 12 blocking,
125 should fix, 71 polish), after both reviews were written. So the file now calls the baseline by that path. It also
tells a fix to use the words and brand choices in its section 6.1, which were taken under the co-founder's ruling. That
section settles brand-16's open choices. The one that matters here: a page title is never the bare brand name
(UX-182 (C-193), polish).

**The line count.** At 128 lines the file is over the "about 100" target. Every finding below is right, and the
synthesis adds classes the file lacked. Words were cut wherever a check survived without them: the opening and the CI
paragraph were folded together, cites were shortened, and the mark rules became a pointer. Getting back to 100 would
mean cutting checks, and both reviews and the design (section 4, "The builder cuts words, not checks") rule that out. If
the co-founder wants it shorter, the cheapest cut is the print bullet's first sentence, about 2 lines. CI's print and
cover checks already hold it for every existing template.

## Review 1: brand and copy

1. Wordmark check blocks on polish (blocking): applied. Blocking test 6 is now "redraws, recolours or animates the mark".
   The title clause is now baseline, using UX-182's decided rule: "A page title is never the bare name, a second wordmark
   beside the lockup (baseline); "PaidWhole terms of use" is copy (ADR 0056:132-135)". It carries the baseline label
   rather than the review's "brand owner's open decision", because the synthesis has now made that decision under the
   co-founder's ruling.
2. Legal check covers only the marked surfaces (blocking): applied. Legal text now names a `legal-surfaces.md` surface,
   the terms a customer accepts, the privacy, cookie and AMA notices, the screening terms and `HANDOFF.md`'s counsel list,
   each needing the founder's sign-off in the PR (`LANES.md` Delegations). Blocking now reads "changes legal text".
3. Trigger floor holds only TypeScript (should fix): applied. `description:` now covers style or behaviour. Its floor
   adds `apps/web/src/app/*.css` and icons, `apps/worker/src/report/brand.css`, `packages/brand`, `apps/web/public/brand`,
   `packages/ledger/src/stages.ts` and `packages/money/src`. The shared-change sentence now names "stylesheet".
4. Tone misquoted, no CO-11 check outside the lint (should fix): applied. The tone is now "Serious, exact, warm; never
   "AI", hype ..." (`BRAND.md:23-24`), with "plain" as a recommendation. "Where the lint does not read, hold CO-11 by
   hand" cites `change-order-001.md:95` and ADR 0058:110-113, pointing at the list rather than restating it. "Claim
   nothing" now cites `BRAND.md:163-164`.
5. "Together at 390 px" given as a brand rule (should fix): applied. It now reads "in that order (`brand.md:36-37`),
   side by side (ADR 0056:55), at 390 px in view or behind a cue (baseline)".
6. Five clauses take a rule that does not state them, one has no label (should fix): applied. The baseline label now
   sits after the default swapped in, raw JSON, what happened / the role / true to where it points, a link or a button,
   and typing cents. The reflow clause is labelled too.
7. "No UUID or segment name" contradicts the PRD (should fix): applied. It now reads "Words before any code, key or ID,
   an ID only as a detail ... a held file shows its segment and position (`PRD.md:268`); codes keep their values (ADR
   0058:117)". ADR 0061's remittance-key clause was dropped, since "words before any code" covers it.
8. "The drafter is never offered Approve" (should fix): applied. It now reads "disabled, its reason beside it, and
   never works (`CLAUDE.md`'s Never list; combined audit #102)".
9. Mark rules cut down (should fix): applied. "The mark and lockup keep every rule in `brand.md:17-22`, `:34-35`,
   `:40-41` and `BRAND.md` section 8", plus the lone-mark rule. Loading now reads "the mark alone, never animated, a
   plain bar still under reduced motion (`BRAND.md:127-128`; ADR 0056:42-43)".
10. Packet "no PaidWhole mark" (should fix): applied. It now reads "neither PaidWhole's lockup, name, seal or badge (ADR
    0056:113-118; ADR 0058:53-54)".
11. Sign-in, independence claim and email host missing (should fix): applied. Added: sign-in uses the stacked lockup on
    Paper (`BRAND.md:122`; ADR 0058:94); a white label never carries the independence claim (ADR 0058:92-94); email
    takes "the lockup's PNG from the static host, never the application".
12. Fix routing omits the founder's and the brand owner's decisions (should fix): applied. The report form now asks for
    "the files it touches" and whether the fix needs "a decision of the founder (legal text, a ruling reversed) or the
    brand owner (the palette)".
13. Recovered cites the label rule (nit): applied. It now reads "only at stage five (`PRD.md:260`), labelled ...
    (`brand.md:37-38`), by proof level through `recoveredLabel` (ADR 0056:60-64)".
14. Mono rule drops its exception (nit): applied. It now reads "a native `<option>` excepted".
15. Brass wider than its rule (nit): applied. It now reads "never text on white, a button fill or a background ...; in
    the UI only the rail underline (`BRAND.md:120-121`)".
16. Contrast drops large text; dark left at should fix (nit): applied. It now reads "3:1 at 24 px and above". A dark
    (tokens only) finding is advisory and listed apart.
17. `PRD.md:302` half cited (nit): applied. Added "reversible where the domain allows" and "filters in the URL".
18. Base moved, new helpers (nit): applied. Money is now "typed through `MoneyField` and `dollarsField`" and counts go
    "through `<Counted/>` or, with no mono, `counted()`". "Cites are as of 7ef421b": no cited file changed between
    4d99df8 and 7ef421b (`git diff --stat` over every cited file is empty).
19. Cites outside the repository (nit): applied. The opening names `LANES.md`, `audits/combined/combined-report.md` and
    the baseline as on `claude/build-ops`.
20. Six inexact places, plus the carry-over rule (nit): applied. Each notice kind and state chip now looks the same
    everywhere. The danger style rule is now stated (UX-155's decided rule), and loading is reworded. "Sign-in codes"
    replaces "Codes". `Alert`'s default is cited at `alert.tsx:18`, and CI's checks are called "the header, cover and
    print checks". A carried-over finding is the change's own when the change worsens it (at least should fix) or undoes
    its fix (that finding's severity).
21. Template drops its verb; no dark shot (nit): applied. The comment is review 2's finding 2 text: "is one of the two
    adversarial reviews of anything that changes what a person sees". It now also says "light and 1280 px dark".

## Review 2: consistency and fitness for use

1. Lane A cannot run the review (blocking): applied in the PR, and it is also a merge condition. The file now names the
   source ("from `tools/lane-b-screen-tour` on `claude/build-ops` (`TOUR_REF` at the base, then at the head; its README
   says how from another lane)"), and so does the template. That README sentence is true only once the session writes
   the README's "From another lane" section on `claude/build-ops`, with the prerequisites, one check command, the rule
   that either lane may add `cap(...)` calls, the tiling script and the sample's definition. The session also updates
   "Handed to Lane A" (`LANES.md:198`). Not done here: those files are outside this worktree (see "For the session").
2. Template names the wrong person as ruling (should fix): applied, in the review's own words: "(the co-founder, acting
   for the founder, 2026-10-25 ~21:10 UTC)", "one of the two adversarial reviews", "kept in a private gallery and named
   here by shot id".
3. No line between this review and the security and payment-engine reviews (should fix): applied. Added: "Judge how a
   figure reads, not how it is computed (the payment-engine reviewer's); report PHI or a role check you see and name the
   security reviewer". The PHI blocking test stays.
4. "Never offered Approve" (should fix): applied (as review 1's finding 8).
5. Open baseline findings rule unclear, hands Lane B's queue to Lane A (should fix): applied. Each open finding now keeps
   its own severity. It becomes the change's own only when the change worsens it or undoes its fix, or, in a Lane B PR,
   touches its cause.
6. "The session's sample" undefined (should fix): applied in the file as "the sample in the PR's reviewer table". The
   sample's definition goes in the README section of finding 1 (the session's).
7. Dark findings not advisory (should fix): applied. "1280 px dark (tokens only)", and in Severity: "a dark (tokens
   only) finding is advisory, listed apart, until users can switch dark on".
8. Checks a picture cannot show (should fix): applied. "Judge from the code, and say so: words too small to read,
   keyboard, focus, announcements, refresh, Back, roles with no shot, and a cross-screen rule by `git grep`; what neither
   shows is "not checked"". The report lists "checks not checked".
9. Clauses that read as other rules (should fix): applied. The count clause now reads "a count beside it counts its
   lines". Loading is reworded (review 1's finding 9). Also "Sign-in codes", the brass words, and read-only roles
   widened (finding 13).
10. Cites not openable in the reviewer's tree (should fix): applied (as review 1's finding 19).
11. PR 7 will make the CI line false (should fix): applied in the file. The CI line now reads "the axe tags
    `apps/web/e2e/a11y.ts` runs on journeys", and "PDFs tagged (recommendation until Lane A's PR 7)" is in the print
    bullet. The "Handed to Lane A" note is the session's (PR 7 cites this file's Accessibility bullet; Lane B updates the
    CI line and the PDF clause when PR 7 merges).
12. Terms to accept that are not shown (should fix): applied. Added "what a person must read, accept or sign is on the
    page or one named link away (baseline)" (UX-009 (C-006), blocking).
13. Recurring classes dropped or narrowed (should fix): applied. Added: one apostrophe style; a select's chosen text,
    long names and words that fit a phone; the lone mark (by the `brand.md:40-41` pointer); a setup key with a QR code or
    a copy button; counts that are not headings; a live check that stays quiet while the person types; nothing hidden as
    a tab stop; native controls in Ink and the theme's `color-scheme`. Also "the next person is told when work waits, a
    packet's approval or a version's sign-off" and "each role gets its own words, no doer's instructions for read-only
    roles or staff note for customers". Left out: rail and page names (a recommendation about one component, the rail:
    UX-112 (C-069), UX-169 (C-150)). The finding allows this with a line in the PR description, which "For the session"
    gives.
14. Template sentence nits (nit): applied. The verb and the private gallery come from finding 2's text. The
    change-management policy line goes in the PR description (text under "For the session").
15. Base moved; open PRs move cites (nit): applied (`MoneyField`, as review 1's finding 18). The cites open PRs #52 and
    #49 will move need no edit: "find a moved rule by its words" covers them.
16. A cite carries more than it says (nit): applied (as review 1's finding 5).
17. `description:` reads as every change to these files, and is long (nit): applied for the reading. It now says "Use
    when a change alters ...; look for one in every file ...", and the first sentence is shorter. It is 720 characters,
    not shorter, because review 1's finding 3 adds the stylesheets, art, `stages.ts` and `packages/money`. Completeness
    of the trigger wins over length.
18. Voice (nit): applied. "Report where a screen breaks any of these:" leads the checks, and "Review a pull request that
    changes ..." is gone.
19. A new screen has no before (nit): applied. Added "(a new screen has no before)".
20. PR description's 16 px paragraph (nit): applied as text for the session (below), since the description is not in the
    worktree.

## Classes added from the synthesis (`designs/lane-b-ux-review.md`)

Each added class is labelled baseline unless a rule states it.
- A precondition shows before the work, to whoever can meet it (UX-053 (C-131)).
- The practice is kept off its pages (UX-102 (C-066)).
- A partial outcome shows what is left (UX-024 (C-084)).
- One date, time and unit style everywhere, times with their zone (UX-027, UX-138, UX-163).
- A busy button keeps focus and says what it does (UX-081 (C-022)).
- Refusals clear only passwords and codes (UX-001's 3.3.7 decision).
- Autocomplete on a person's own details (1.3.5; UX-152).
- A scroller reachable by keyboard (2.1.1; UX-011 (C-002)).
- Hashes whole, never cut to a hover title (UX-075 (C-016)).
- Placeholders at 4.5:1 (UX-090).
- Each row's controls name their row (UX-073 (C-028)).
- No unfilled "%s" (UX-127 (C-113)).
- No internal names such as "the engine" (UX-154, UX-132).
- One thing per name (UX-026, UX-121, UX-142).
- A count counts only this practice's records (UX-019 (C-085)).
- One chip for every state (UX-106).
- The danger style rule (UX-155).
- Dark prints light (UX-164, advisory).
- The payer's cover gives the amount, lines, deadline and who to answer (UX-124 (C-050)).

Left out as one-screen bugs rather than classes, each covered by a broader check or outside a reviewer's reach:
- Maintenance (UX-047): "a refusal keeps every value", "nothing a refresh loses" and "a state's words match the record".
- The lost-password and lost-factor dead end (UX-006): "never a dead end".
- The rail's landmark (UX-147) and the cited page's quoted words (UX-148).
- The members table's flex cells (UX-099).
- Page-header rhythm (UX-157, UX-158) and touch size beyond 24 px (UX-161).

## For the session (outside this worktree; not done here)

- **Before the merge (review 2, findings 1, 6 and 11):** on `claude/build-ops`, add the "From another lane" section to
  `tools/lane-b-screen-tour/README.md`, with the prerequisites (PG18 on 5433, the lock, `TOUR_DIR`), one check command,
  the rule that either lane may add `cap(...)` calls, and the sample's definition (one shot per layout at both widths
  and the dark set, every state the change reaches, the screens of the baseline findings the PR says it fixes). Add the
  tiling script beside `batches.py`. Update "Handed to Lane A" (`LANES.md:198`) to name that README section and PR 7's
  note. Until then the file's "its README says how from another lane" is not yet true.
- **Merge the base before the merge (`LANES.md` rule 6):** `claude/build-platform` is at 7ef421b. `MoneyField`,
  `dollarsField` and `<Counted/>` come with it.
- **The PR description:** replace the 16 px paragraph with: "Kept as a recommendation: 16 px form fields stop iOS from
  zooming. `BRAND.md:93` already gives body and UI text 16; only ADR 0056:49-50's undefined "dense controls 14" makes
  it doubtful, so the PR that changes the fields need only define "dense controls" in ADR 0056 (desktop tables and
  their inline controls, not form fields)."
- In "What it does not change", add: "The change-management policy (`docs/policies/change-management.md:65-67`, rule
  1) and PRD 17 (`PRD.md:721`) still name three reviewer agents; that is the security official's and the founder's
  text, left to them (design open point 6)."
- Add a line saying the rail and page names (UX-112, UX-169) were left out of the checklist, as a recommendation about
  one component.
- Fill the reviewer table from this file and the suite table from the results below.

## The suite (documentation-only, Q4; each command once, under `/tmp/laneb-heavy.lock`, in the worktree)

Run once on the fix round's tree (the commit below), one command at a time, 2026-10-26 09:45 to 09:52 UTC. All four
passed, so nothing needed fixing or re-running.

| Command | Result |
| --- | --- |
| `flock /tmp/laneb-heavy.lock pnpm typecheck` | passed: 22 projects, 79.8 s wall (cold cache) |
| `flock /tmp/laneb-heavy.lock pnpm lint` | passed: 1,496 files in 3 groups, 0 errors, 0 warnings, 115.6 s wall |
| `flock /tmp/laneb-heavy.lock pnpm lint:copy` | passed: 492 files read, no finding |
| `flock /tmp/laneb-heavy.lock pnpm test` | passed: 325 test files; 5,077 tests passed, 3 skipped (5,080); 258.6 s |

The run covered `tools/test/required-checks.test.ts`, the fixture check and `tools/test/codeowners.test.ts`, which read
both changed files. `tools/engine-freeze/differential.test.ts` skipped itself because `ENGINE_FREEZE_BASE` is unset, as
it does outside CI.

Also checked by hand:
- The frontmatter parses with the repository's `yaml`, and its keys match `security-reviewer.md`'s in order.
- The only model identifier in either file is the `model:` value copied from `security-reviewer.md:6`.
- No line is over 120 characters except the one-line `description:` (720 characters).
- Neither file has a shot id.

## The commit

`d82031abc619420e0532408cb864353c646b4980` in `/home/user/ux-brand-reviewer` on `co-001/ux-brand-reviewer`, on top of eea716d. Not pushed.
