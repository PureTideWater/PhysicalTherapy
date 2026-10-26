# PR #55 review 2: consistency and fitness for use (`co-001/ux-brand-reviewer`)

*Lane B, 2026-10-26. Adversarial review 2 of draft PR #55 at its head eea716d, in `/home/user/ux-brand-reviewer`:
`.claude/agents/ux-brand-reviewer.md` (99 lines) and the reviewer comment in `.github/pull_request_template.md:41-46`.
Line numbers in the checklist are its own lines at eea716d. Ops files are cited on `claude/build-ops` as checked out in
`/home/user/ops` (4056f38). Read-only; synthetic data only.*

**Read.** The checklist whole and the template diff; the four other files in `.claude/agents`; the design
(`designs/lane-b-ux-brand-reviewer.md`) and its review; the brief's "What it judges against" and "Then"
(`designs/lane-b-ux-review-brief.md:15-32`, `:89-109`); `LANES.md` (rules, Claims, "Handed to Lane A":198);
`lanes/lane-b.md` (Q4 at :202 and :586, the 17:00 decision at :463-467, the 21:10 ruling at :590-591, :700);
`HANDOFF.md:104-109`, `:530`; the screen tour's README (`tools/lane-b-screen-tour/README.md` on `claude/build-ops`);
`tools/brand-copy/scan.ts:43-77`; combined audit #48, #102, #103 and #125 and PR 7's rows
(`audits/combined/combined-report.md`); `.claude/rules/brand.md`, ADR 0056 and the cited lines of `PRD.md`,
`words.ts`, `legal-surfaces.md`, `a11y.ts` and `alert.tsx`; all 335 raw findings by severity and lens
(`designs/lane-b-ux-review/raw-findings.md`); the files of every open PR (#42, #48 to #53) and #48's template patch;
PR #55's description; the compare of 4d99df8 with the base's head today (7ef421b, PR #54 merged).
**The synthesis `designs/lane-b-ux-review.md` does not exist** (not in `/home/user/ops`, and a 404 on
`origin/claude/build-ops` at 66c8dd7, checked now), so coverage is judged against the raw list by lens.

**What holds.**
- The frontmatter has `security-reviewer.md`'s six keys in its order (name, description, tools, disallowedTools,
  model, maxTurns), and it parses (the repository's `yaml` 2.9.1). `tools` and `disallowedTools` match the three
  reviewers. The `model:` value is the one `security-reviewer.md` and `payment-engine-reviewer.md` carry, as Q4 rules.
  No model name appears anywhere else in either changed file.
- 99 lines; no line over 120 characters but the one-line `description:`, as in the other four files. Every path and
  shot id in the body is in backticks.
- The return form keeps the security file's closing ("Never declare ... Do not edit files.") and adds what the brief
  asks for: severity, route and shot id, evidence, rule, one fix, the open baseline findings, the routes not seen.
- 21 of the 22 blocking raw findings fall under a check that would catch them again (the exception is finding 12).
- The template change sits at `@@ -39,9 +39,11 @@`; open PR #48 changes only `@@ -1,8 +1,8 @@` (lines 4-5, "GitHub
  offers this template from the default branch ..."). The hunks are 33 lines apart and say different things, so git
  merges both and neither contradicts the other. No other open PR touches the template or `.claude/agents`.
- The `PRD.md` lines the file cites (:246, :256, :260, :302) sit above every open PR's `PRD.md` hunk (#49, #51 and
  #53 start at :370 or later).

**Findings: 1 blocking, 12 should fix, 7 nits.** Each gives its evidence and the fix. The fixes add about seven lines;
"Line budget" at the end says where they come from.

## Blocking

### 1. Lane A cannot run the review as written, and what is missing is Lane B's own step

**Evidence.**
- The 21:10 ruling binds both lanes from this PR's merge: every screen-changing PR "takes the UX and brand review
  (`.claude/agents/ux-brand-reviewer.md`, once Lane B's checklist PR merges)" (`lanes/lane-b.md:591`; `LANES.md:198`).
- The file asks for inputs only Lane B's tool makes: "before and after shots ... in window-height tiles, at 1280 and
  390 px light and 1280 px dark, with their manifest entries" (lines 9-11). The manifest is the tour's `shots.json`
  (README:50), and the dark shot is the tour's `data-theme` trick (README:33, :86).
- The tool assumes Lane B's container: PG18 on 5433 (README:18), started from `/opt/pg18` and `/root/pgdata18`
  (README:80), under `/tmp/laneb-heavy.lock` (README:20). Lane A is the founder's own sessions on another account
  (`LANES.md:4`), and its reviews run in fresh clones (`HANDOFF.md:530`).
- The design made Lane B's fix a condition of the merge: "Lane B's step for the tour, in this PR's session and before
  the merge": a README section "From another lane" with the prerequisites and one check command, the rule that any
  session in either lane adds a new route's `cap(...)` calls, and a tiling script beside `batches.py`
  (`designs/lane-b-ux-brand-reviewer.md:718-726`; open point 7, :810-815). None of the three is in the README today
  (its sections are "The parts", "Set-up and a run (any session)", "The whole-app capture", "The second retake"; no
  tiling script in the directory; "Growing the capture", README:84-85, says to change the spec "here on
  `claude/build-ops`" and nothing about another lane).
- Neither changed file says where the shots come from. Review 1 of the design asked for "(the screen tour on
  `claude/build-ops` takes them)" in the draft (`designs/lane-b-ux-brand-reviewer-review.md:232`); the file dropped it
  (D9, "names what it needs, not where it comes from"). The brief's "Then" names the tool and `TOUR_REF`
  (`lane-b-ux-review-brief.md:101-102`). The template says only "with before and after screenshots at 1280 and 390 px".
  PR #55's own description says "taken with Lane B's screen tour", so the reader of the PR knows and the reader of
  the template and the checklist does not.
- So on the day this merges, a Lane A session either skips a review it is bound to run, or rebuilds Lane B's tooling
  itself, which the design says is Lane B's item.

**Fix.**
- Before the merge, on `claude/build-ops`, do the design's section 5 step: the README's "From another lane" section
  (prerequisites, one check command), the either-lane `cap(...)` rule, the tiling script, and the sample's
  definition (finding 6). Update the "Handed to Lane A" entry (`LANES.md:198`) to name that README section.
- In the file's first paragraph, after "with their manifest entries", add: "(the screen tour takes them:
  `tools/lane-b-screen-tour` on `claude/build-ops`, `TOUR_REF` at the base, then the head; its README says how from
  another lane)". It names the source without tying the review to it.
- In the template, "with before and after screenshots at 1280 and 390 px from `tools/lane-b-screen-tour`" (finding 2
  gives the whole comment).

## Should fix

### 2. The template names the wrong person as ruling, and leaves out "one of its two adversarial reviews"

**Evidence.**
- The template says "(the founder's ruling of 2026-10-25, through the co-founder)" (template:43-44). The record says
  the co-founder made it, acting for the founder: "Ruling (the co-founder, acting for the founder, 2026-10-25 ~21:10
  UTC)" (`lanes/lane-b.md:591`; `LANES.md:198`). "Through the co-founder" reads as the founder ruling and the
  co-founder passing it on. For Lane B's own PRs the source is the co-founder's delegated decision of ~17:00 UTC
  (`lanes/lane-b.md:463-465`).
- The PR's other records say it the other way: the commit message says "the co-founder's rulings of 2026-10-25", the
  PR description says "The co-founder, acting for the founder (2026-10-25 ~21:10 UTC)", and the design's section 1
  says "for Lane A, the co-founder acting for the founder, ~21:10 UTC" (`designs/lane-b-ux-brand-reviewer.md:34`).
  `LANES.md` rule 8 asks that every ruling be recorded with who made it and when.
- The ruling makes the UX review "one of its two adversarial reviews" (`lanes/lane-b.md:591`). The template puts it in
  the PRD 17 sentence and does not say so. Until Lane A adds the ruling to rule 1, the template is the only place a
  Lane A session meets it.

**Fix.** The comment becomes:

```
<!-- The payment-engine, security and EDI reviewer agents run before anything that touches money, tenancy or parsing
merges (PRD 17). The UX and brand reviewer (`.claude/agents/ux-brand-reviewer.md`) is one of the two adversarial
reviews of anything that changes what a person sees, with before and after screenshots at 1280 and 390 px from
`tools/lane-b-screen-tour`, kept in a private gallery and named here by shot id (the co-founder, acting for the
founder, 2026-10-25 ~21:10 UTC). Name the agents that ran, one row per finding, and how each was resolved: fixed (with
the commit), not a defect (with why), or deferred (with where it is tracked). "Not run" with the reason when the change
touches none of those. -->
```

### 3. Nothing draws the line between this review and the security and payment-engine reviewers

**Evidence.**
- The design says what this file does not replace: "the security reviewer for PHI and tenancy (this file flags PHI it
  sees ... and the session hands it on); the payment-engine reviewer for the arithmetic behind a figure (this file
  judges how a figure reads, not how it is computed)" (`designs/lane-b-ux-brand-reviewer.md:122-125`), and its
  blocking test 4 says "(and goes to the security reviewer too)". The file carries neither.
- So the file overlaps both, with no hand-off:
  - PHI: its blocking list "puts PHI in a URL, file name, email or error" (lines 88-89) is the security reviewer's own
    check, "PHI in URLs, keys, filenames, emails or errors" (`security-reviewer.md:10-11`), and that reviewer is
    "used on any change under ... apps/" (`security-reviewer.md:3`), so every screen PR under `apps/web` gets both.
  - The ledger: "'Recovered' is stage five, posted or deposited" and "The seal and badge only when
    `reconciledToCash`" (lines 24-25, 78-79) invite the reviewer to judge what the ledger counts, which is the
    payment-engine reviewer's "ledger totals that include approved-but-unposted entries"
    (`payment-engine-reviewer.md:11`).
  - Authorization: "the drafter is never offered Approve" (line 46) borders on the security reviewer's role checks.
- Two reviewers on one class either report it twice or each leaves it to the other.

**Fix.** One sentence at the end of the CI paragraph (line 19): "Judge how a figure reads, not how it is computed (the
payment-engine reviewer's); report PHI or a role check you see and name the security reviewer, whose scope it is."
Keep the PHI blocking test.

### 4. "The drafter is never offered Approve" contradicts the design that landed, so it raises a false finding

**Evidence.**
- Line 46 cites `CLAUDE.md`'s Never list, which says "Mark a packet approved by the person who drafted it"
  (`CLAUDE.md:28`). It says nothing about the button.
- Combined audit #102 chose "Show the drafter a disabled button with the reason, next to 'Request approval'", and it
  landed in PR 5 (the brief lists it as landed, `lane-b-ux-review-brief.md:28`). The packet page does exactly that:
  `<DisabledApprove describedBy="approval-drafter-reason" />` with the reason beside it
  (`apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx:428-432`).
- A reviewer reading "never offered" sees a disabled Approve button on the drafter's view and reports a broken written
  rule (should fix) against the ruled design.

**Fix.** "the drafter's Approve is disabled, with its reason beside it (combined audit #102), and never works"
(same length).

### 5. Open baseline findings: the rule is unclear, and for Lane A it hands over Lane B's queue

**Evidence.**
- Lines 96-98: "each open baseline finding on these screens (fixed, still open or worse) and any other defect the
  change did not cause: each keeps its severity unless the change touches its cause or worsens it." It does not say
  what happens then. The design does: "it becomes the PR's finding when the PR touches its cause (fix it there) or
  makes it worse (at least should fix, blocking if it meets a test above). A change that undoes an earlier fix takes
  the original finding's severity" (`designs/lane-b-ux-brand-reviewer.md:503-505`). None of that reached the file.
- The design bases "touches its cause" on Lane B's direction that each screen PR folds in its screens' findings
  (`lanes/lane-b.md:700`), and says "Lane A reads the same list and decides for itself"
  (`designs/lane-b-ux-brand-reviewer.md:115-116`). The file has no such limit. The baseline's findings are Lane B's
  queue ("queued (UX baseline review)", brief:81). Read as written, a Lane A PR that touches `shell.tsx` or a sign-in
  page inherits Lane B's findings there, at their baseline severity, some of them blocking.

**Fix.** Lines 96-98 become: "Then, apart, each open baseline finding on these screens (fixed, still open or worse)
and any other defect the change did not cause, each at its own severity. It is the change's own only when the change
makes it worse or undoes its fix (at least should fix), or, in a Lane B PR, touches its cause; the rest stay in their
queue." About half a line more.

### 6. "The session's sample" is used, but nothing a session or the reviewer reads says what it is

**Evidence.**
- Lines 12-13: "after a shared component, token or shell change, so is a route outside the session's sample ('not
  seen, by sample')."
- What the sample holds (one shot per layout at both widths and the dark set, every state the change reaches, the
  screens of the baseline findings the PR says it fixes, listed in the PR's reviewer table) is only in the design
  (`designs/lane-b-ux-brand-reviewer.md:81-90`). A Lane A session has the file and the template; neither defines it.
  The next PR to take this review, `co-001/ux-forms`, is exactly this case (`ActionForm`, 112 forms).
- Without it, a session may sample one route and the reviewer cannot tell a thin sample from a fair one.

**Fix.** Put the sample's definition in the README's "From another lane" section (finding 1), which is Lane B's to
write. In the file, line 13 reads "a route outside the sample the session lists in the PR's reviewer table". Same
length.

### 7. Dark findings are not called advisory, so they can be should fix in a theme no user reaches

**Evidence.**
- The brief: label the dark shots "dark (tokens only)" and "judge their contrast as advisory"
  (`lane-b-ux-review-brief.md:48-50`). The design: "Dark findings are advisory and never blocking"
  (`designs/lane-b-ux-brand-reviewer.md:501-502`).
- The file says only "and dark not until users can switch it on (ADR 0056:127-130)" (line 92). That is elliptical
  (dark not what?), and it removes only "blocking". By line 91 a dark contrast failure is still "Should fix: any ...
  WCAG A or AA failure", which the template's resolution column then makes a PR fix or defer, in Lane A's PRs too.
  Line 10 calls the shot "1280 px dark", not "dark (tokens only)", and line 58 asks for contrast "in both themes".
- The brief's "light and dark where offered" is met only in the design's reading ("that 1280 dark shot",
  `designs/lane-b-ux-brand-reviewer.md:75-76`). The file does not say it is tokens only.

**Fix.** Line 10: "1280 px dark (tokens only)". Line 92: "and a dark (tokens only) finding is advisory, listed apart,
never should fix or blocking, until users can switch dark on (ADR 0056:127-130)".

### 8. Many checks cannot be seen in a picture, and the file does not say how to judge them

**Evidence.**
- Static full-page shots cannot show: keyboard order and reach, Escape and focus-leave on menus, focus moved and
  announced after a submit, focus hidden under the sticky header, live-region politeness, hover-only content, what a
  refresh or Back keeps, a notice that replays, paging and filtering on the server, whether the second person is
  told, and a timed step's warning (lines 31-33, 44-46, 52-59).
- "Walk each role the diff reaches" (line 40): the tour shoots each route "as the map's first persona", and a second
  persona "only where the map says the page differs by role" (README:32, :34). So the other roles have no shots.
- Cross-screen rules need screens the PR did not change: "one value on every screen" (line 24), "one name per thing
  across screens and the payer's copy" (line 65), notice kinds that "look alike everywhere" and "danger style on
  actions follows one rule" (line 73), "One type scale and tile style" (line 75), "Help in one place" (line 59).
- The file says only "Read the code behind each change" (line 13). A default agent left there either passes these
  silently or reports them without evidence. The report form has "the routes not seen", but no place for checks not
  done.

**Fix.** Add to the first paragraph: "Judge keyboard, focus, announcements, refresh and Back, and the roles without
shots from the code, and say so in the evidence; a cross-screen rule from `git grep` for the other uses. A check
neither shows is 'not checked', listed with the routes not seen." About one and a half lines.

### 9. Clauses cut so short that they read as other rules

**Evidence and fix,** each the same length or shorter:
- Line 24, "its period, one stage per total, one value on every screen and a count of the same lines beside it
  (baseline)", reads as "every figure needs a count beside it". The class is that a count beside a figure counts the
  same lines (`words-practice-15`, `words-practice-33`; design 2.3). Write: "its period, one stage per total, the same
  value wherever it shows, and any count beside it counting the same lines (baseline)".
- Lines 36-37, "Loading: the mark still (`BRAND.md:127-128`)", reads as "the mark is still shown". The rule is that
  the mark is never a spinner and loading is a plain bar (`brand.md:34-35`). Write: "Loading: a plain bar, the mark
  never moving (`BRAND.md:127-128`)".
- Line 33, "Codes take paste", sits one bullet away from Words' "raw code" (line 62). Write "Sign-in codes take
  paste".
- Line 72, Brass "never text, fill or ground": "ground" is house jargon, and the rule says "Never text on white, never
  a button fill, never a background" (`brand.md:32-33`). Write "never text on white, a button fill or a background".
- Line 46, "Read-only roles get their own words": see finding 13, which widens it.

### 10. Some cites cannot be opened from the tree the reviewer works in

**Evidence.**
- Line 14 says "Cites are as of 4d99df8". But `LANES.md` (cited at line 68 for the founder's sign-off on legal text)
  and the combined audit (#125 at line 41, #48 at line 45, and #102 if finding 4 is taken) are not in the repository
  at 4d99df8: they are on `claude/build-ops` (`ls` in `/home/user/ux-brand-reviewer`: no `LANES.md`, no `audits`).
- Lane A runs its reviews in fresh clones of the PR (`HANDOFF.md:530`), and a default agent given this file will look
  in the working tree. The legal-surface line backs blocking test 5, so its source matters.

**Fix.** Line 14: "Cites are as of 4d99df8 (`LANES.md` and the combined audit are on `claude/build-ops`); find a moved
rule by its words." A third of a line.

### 11. Lane A's PR 7 (combined audit #103) will make the CI paragraph false, and may write a second list

**Evidence.**
- #103 lands in Lane A's PR 7: "a generated check that visits every page route with a role that can open it and runs
  WCAG 2.2 rules", "add 'focus not hidden under the sticky header' to the keyboard test", "record the WCAG 2.2
  criteria no tool checks as manual checks", and tagged PDFs with a test (`combined-report.md:1124-1126`).
- The file's CI paragraph says CI holds "axe's WCAG 2.1 rules where journeys go (`apps/web/e2e/a11y.ts:12`)"
  (line 18). After PR 7 that is wrong in both halves, and reviewers would go on spending turns on what CI then holds.
- PR 7's "manual checks" for WCAG 2.2 are the same thing as this file's Accessibility bullet (lines 52-59). Two lists
  in two places drift apart.
- The design left tagged PDFs out to stay at 100 lines and says "that PR should add 'PDFs tagged ...' to the print
  bullet" (`designs/lane-b-ux-brand-reviewer.md:803-805`). That puts upkeep of Lane B's file on Lane A's PR, and no
  hand-off says so (`LANES.md:198` does not mention it).

**Fix.**
- Line 18: "the axe tags `apps/web/e2e/a11y.ts` runs where journeys go", so it stays true when PR 7 widens them.
- Add to the "Handed to Lane A" entry: PR 7's record of the WCAG 2.2 criteria no tool checks cites this file's
  Accessibility bullet rather than keeping a second list, and Lane B updates the file's CI line and its tagged-PDF
  clause when PR 7 merges (Lane B's own upkeep, design open point 8).
- Add "PDFs tagged (recommendation until PR 7)" to the print bullet now: five words.

### 12. A blocking class has no check: what a person is asked to read or accept is not shown

**Evidence.**
- `flows-other-13` (blocking): "The terms page asks a customer to read the terms and accept them, but shows no terms:
  only a version, a reference string and a hash prefix". `words-other-18` (blocking): "The terms page asks people to
  read terms it never shows". Two reviewers, both blocking.
- The design files both under "Legal surfaces" (design 2.4) and counts "terms to accept that are not shown" as covered
  (design "Defect classes", :458-463). But that check, in the file, is about the process of changing legal words: "A
  legal surface's words change only with its review recorded in the PR ... and the founder's sign-off" (lines 67-68).
  A PR that ships an acceptance step with no text to read passes it.

**Fix.** Add to Flows or Words: "What a person is asked to read, accept or sign is on the page, or one named link away
(baseline)." Under severity test 3 (cannot finish) it can block by harm. About two-thirds of a line.

### 13. Recurring classes the outline carries were dropped or narrowed, without the line the design requires

**Evidence.** The design says "The builder cuts words, not checks ... A check is cut only with its class's evidence and
a line in the PR description saying why" (`designs/lane-b-ux-brand-reviewer.md:551-552`). PR #55's description has no
such line. Against the raw list by lens, the file misses:
- **Words:** one apostrophe style (`words-other-32`, `words-practice-10`; two lenses).
- **At 390 px:** a select's chosen text readable, names not squeezed one word per line, words that fit a phone
  ("choose", not "drop") (`narrow-practice-1-26`, `narrow-practice-2-11`, `narrow-other-20`, `narrow-other-22`,
  `narrow-practice-2-22`).
- **Type and marks, a written rule:** a lone mark has `role="img"` and the label "PaidWhole", one beside the name is
  decorative (`brand.md:40-41`). The file cites `brand.md:40` for focus only (line 53).
- **Sign-in:** an authenticator key has a QR code or a copy button (3.3.8; `a11y-other-06`, `flows-other-18`); a
  password field can be shown (`narrow-other-23`, recommendation).
- **Accessibility:** counts not marked as headings (1.3.1; `a11y-other-17`); a live check that does not re-announce
  while the person types (4.1.3; `a11y-practice-1-26`); a hidden input that is no tab stop (2.1.1;
  `a11y-practice-1-20`).
- **Dark, advisory:** native controls follow the theme, `color-scheme` (`a11y-other-19`, `a11y-practice-1-23`,
  `a11y-practice-2-15`, `brand-02`; four findings, three lenses).
- **Flows:** rail and page names say what each page does (`flows-other-28`, `flows-practice-17`; recommendation).
- **Narrowed:** "The second person is told when a packet waits" (line 45) drops the contract version that waits for
  the practice's sign-off with no queue or notice (`flows-practice-22`). "Read-only roles get their own words"
  (line 46) drops the staff-only note every customer reads (`flows-other-19`) and the settings page that tells a
  billing manager nothing (`words-practice-43`).

**Fix.** One clause each, with its label:
- Words: "one apostrophe style (recommendation)".
- At 390 px: "a select's chosen text, names and words fit the phone (recommendation; 3.3.2)".
- Type and marks: "a lone mark `role="img"` 'PaidWhole', one beside the name decorative (`brand.md:40-41`)".
- Forms: "Sign-in codes take paste, a key has a QR code or a copy button (3.3.8)".
- Accessibility: "counts are not headings (1.3.1); a live check does not re-announce while the person types (4.1.3)".
- Brand: "native controls follow the theme (advisory)".
- Flows: "The next person is told when work waits for them, a packet's approval or a version's sign-off (baseline)",
  and "Each role gets its own words: no doer's instructions for read-only roles, no staff note for customers
  (baseline)".
- Or, for any left out, the PR description's line with its evidence, as section 4 asks.

## Nits

### 14. The template's sentence: an elided verb, where the screenshots go, and the policy it cites
- "and the UX and brand reviewer (...) before anything that changes what a person sees, with before and after
  screenshots" drops "merges", so it can read as "before anything changes". Finding 2's text settles it.
- The repository is public, and the brief keeps the PNGs in a private gallery (`lane-b-ux-review-brief.md:80`). The
  template does not say so, and a session could attach them to the PR. Finding 2's text adds "kept in a private
  gallery and named here by shot id".
- The template's header cites "the change-management policy, rule 1" (template:2), which still names three reviewer
  agents. The design leaves that to the founder and the security official (open point 6); the PR description should
  say so in "What it does not change", so the reader sees the gap is known.

### 15. The base has moved: name the new money-input helper, and re-open the cites the open PRs move
- `claude/build-platform` is at 7ef421b (PR #54 merged after 4d99df8). It adds `MoneyField`
  (`apps/web/src/components/money-field.tsx`) and `apps/web/src/lib/money-input.ts`: "a labelled input for an amount in
  dollars ... set in the mono face". Line 21 names only `<Money/>` and `formatUsd`, which show amounts. After the
  fix round's merge of the base: "typed through `MoneyField`".
- Open PRs move two cites: #52 adds a line above `labelOf` (`words.ts:27` becomes `:28`), and #49 adds two entries to
  `COPY_FILES` (`scan.ts:51-77` becomes `:51-80`). Line 14's "find a moved rule by its words" covers it; the
  fresh-clone check re-opens them, as section 4 "Cites" says.

### 16. One cite carries more than it says, against the file's own label rule
- Lines 22-23: "Expected, paid and short, together and in that order, at 390 px too (`.claude/rules/brand.md:36-37`)".
  `brand.md:36-37` says only "expected, paid and short appear in that order". "Side by side" is ADR 0056:55, and
  "at 390 px too" is the baseline's (`narrow-other-05`). The file's lead asks each part to carry its own label
  (lines 14-15). Write "(`brand.md:36-37`; ADR 0056:55); at 390 px too (baseline)".

### 17. The `description:` reads as "every change to these files", and runs three to four times the others' length
- Its "Use on any change to the words, figures, markup or style of a screen, PDF or email, at least every file
  `tools/brand-copy` reads ..." can be read as "use on any change to those files", which takes in a query refactor
  under `apps/web/src/lib` that the design says keeps its two reviews (design :61-62). That runs the tour, under the
  heavy lock, for nothing.
- At 549 characters it is three to four times the others (136 to 167).
- Write (one YAML line; it holds no colon followed by a space):

```
Use when a change alters the words, figures, markup or style of a screen, PDF or email; look for one in every file
tools/brand-copy reads (scan.ts COPY_ROOTS and COPY_FILES), packages/brand/src, packages/ui/src and any other file
whose strings reach a screen, such as packages/db/src/authz/permissions.ts.
```

### 18. Voice: the others tell the agent what to find; this one describes the good state
- The other reviewers speak to the agent in the imperative and list defects to look for: "Find tables without ...",
  "Look for floats ...", "Check delimiter handling ...", "Report by file and line". This file starts "You get ..."
  (line 9) and states the good state in verbless fragments ("Expected, paid and short, together and in that order").
- It is usable, but the fragments are where findings 9 and 16 came from. Starting the checks with one line, "Report
  where a screen breaks any of these:", matches the others' form for six words. "Review a pull request that changes
  what a person sees." repeats the description and can go to pay for it.

### 19. A new screen has no "before", and a removed one no "after"
- Lines 11-12 make a changed route with no shot "not seen". A new route has no shot at the base, and a removed one
  none at the head. Add four words: "(a new screen has no before)", so it is reviewed on its after shots and not
  reported as not seen.

### 20. The PR description's 16 px paragraph contradicts the revised design
- PR #55's description says 16 px fields "conflict with ADR 0056's type scale ('dense controls 14')" and "The PR that
  changes the fields should amend ADR 0056 for phones". The revised design says `BRAND.md:93` already gives 16 px, and
  the fixing PR "need only define 'dense controls' in ADR 0056" (open point 2,
  `designs/lane-b-ux-brand-reviewer.md:793-797`), which is what line 51 of the file cites. Bring the description into
  line.

## Line budget

The fixes add about seven lines: finding 1 (about 1.3), 3 (1), 5 (0.5), 8 (1.5), 10 (0.3), 11 (0.2), 12 (0.7) and 13
(about 2), with 4, 6, 7, 9 and 16 the same length. The cap is 100 and the file is 99, so the builder pays with words,
never checks:
- line 9's first sentence, which the description says (half a line);
- the CI paragraph in two lines, not three, once line 18 is reworded (finding 11);
- "Type and marks" folded into "Brand" under one lead-in (a line);
- the report paragraph (lines 94-99) tightened: "List findings, most severe first: severity; route and shot id;
  evidence (head file:line, what the shot shows); rule; one fix, with exact words, and whether it needs a migration or
  a freeze exception" (a line);
- "in window-height tiles" and the tile sizes left to the README's "From another lane" section, which tells the
  session how to cut them (finding 1), keeping "tiles" in the file.
A class cut to fit goes in the PR description with its evidence, as section 4 requires.
