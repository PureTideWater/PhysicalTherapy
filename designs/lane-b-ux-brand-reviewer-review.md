# Review: the UX and brand reviewer checklist design (`co-001/ux-brand-reviewer`)

*Lane B, 2026-10-26. The design's one adversarial review (workflow wf_f49e6c03-028), of
`designs/lane-b-ux-brand-reviewer.md` as written at ~05:45 UTC. Every file:line below was opened at 4d99df8 in
`/home/user/ux-brand-reviewer`, unless it names an ops file. Synthetic data only.*

**Read.** The design whole; the brief's "What it judges against" and "Then"; the four files in `.claude/agents`;
`.claude/rules/brand.md`, `docs/brand/BRAND.md`, `packages/brand/README.md`, `tokens.css`; ADR 0056 and 0058; CO-11;
`words.ts`; `tools/brand-copy/scan.ts`; `PRD.md:244-302` and `:721`; combined audit #48, #103, #107 and #125;
`apps/web/e2e/a11y.ts`; the screen tour's README; `LANES.md` (rules, Claims, "Handed to Lane A", Delegations);
`lanes/lane-b.md` (Q4 at :70, :111, :202, :586; :700); `HANDOFF.md:105-114`; the PR template; the files of open PRs
#42 and #48 to #54. All 335 raw findings, by lens, with a script that matched every raw id to the design.
**The synthesis `designs/lane-b-ux-review.md` does not exist yet** (checked 2026-10-26), so this review works from
the raw list too.

**What holds.** Every file:line the design cites is at the line it names. Every raw finding id is cited somewhere in
section 2. The frontmatter takes `security-reviewer.md`'s six keys in order and writes no model identifier. The
template change sits in a different hunk from #48's. The suite matches Q4, and the claims about what `pnpm test`
reads are right (`tools/required-checks.ts:36`, `:127`; `tools/brand-colors/scan.ts:29`; no hook guards
`.claude/agents`).

**Findings: 2 blocking, 8 should fix, 9 nits.** Each gives its evidence and the fix.

## Blocking

### 1. The trigger leaves out files whose words a person reads, against the 21:10 ruling

**Evidence.**
- The ruling is "every pull request that changes something a person sees" (`lanes/lane-b.md:591`; `LANES.md`
  "Handed to Lane A"). The design's paths (lines 31-40) and its `description:` (line 415) read as the whole list.
- The copy lint already names where the product's shown words live (`tools/brand-copy/scan.ts:51-77`). The design
  leaves out:
  - `packages/triage/src` (the stage labels on every line's chip, the write-off and pattern words);
  - `packages/packets/src` (the narrative and the refusals the workbench shows);
  - all of `apps/worker/src/screening` (the upload refusals the screening page shows, `scan.ts:46-47`), where the
    design names only `wording.ts` and `message.ts`;
  - `apps/worker/src/reconcile/stages.ts` (the notes a line keeps when the ledger moves it back);
  - `packages/contracts/src/calendar.ts` and `location.ts` (read by Pricing settings, Coverage, Getting started, a
    run's refusal and the console: `scan.ts:63-68`).
- The baseline found shown words the lint does not read either (`words-other-23`):
  - `packages/db/src/authz/permissions.ts`: every permission state's reason (its `description` strings, line 55
    onward), which `words-practice-08` shows on screen;
  - `packages/compliance/src/controls.ts`: the evidence titles;
  - `apps/worker/src/billing/account.ts`: the console's billing refusal.
- So Lane A's role-matrix PR, which rewrites `permissions.ts`, would change every permission state with no UX review.
  A triage PR that renames a stage label would do the same.
- Section 2.0 has the same gap. "CO-11's forbidden words ... `pnpm lint:copy`" (lines 96-97, draft line 474) holds
  only in the files the lint reads.

**Fix.**
- Define the trigger by its effect, with a floor that cannot go stale. The `description:` ends: "Use on any change to
  the words, figures, markup or style of a screen, PDF or email: at least every file tools/brand-copy reads
  (scan.ts COPY_ROOTS and COPY_FILES), packages/brand/src and packages/ui/src, and other files whose strings reach a
  screen, such as packages/db/src/authz/permissions.ts."
- Section 1 lists the same, and names the three files `words-other-23` found.
- The draft's CI paragraph says "CO-11's words in the files the copy lint reads (tools/brand-copy/scan.ts:51-77)".

### 2. The draft drops recurring defect classes that the outline carries, and the outline misses three more

**Evidence.**
- Section 4 says "The builder cuts words, not checks" (line 443). But the draft (lines 466-547) has already cut
  checks. A builder held to "90 lines, so any added word costs one elsewhere" (line 462) will not put them back.
- Classes the outline has and the draft drops (baseline severity in brackets):
  - signs, dates and units: a direction said once, a difference column that says which way it runs, one date and
    unit style. `words-practice-02` [should fix], `words-other-12` [should fix], `words-practice-36` [should fix],
    `words-practice-41`, `-23`, `-46` (outline 2.3, lines 170-173);
  - where it stands, said at the top of a long page: `flows-practice-04` [should fix], `-05`, `flows-other-14`
    [should fix], `-15`, `narrow-practice-1-24` (2.9, lines 330-333);
  - no vacuous or false fact on an empty or not-yet state ("0 of 0 lines", "No dates ahead"): `words-practice-29`
    [should fix], `-31`, `-45`, `-48` [should fix], `-53`, `words-other-43` (2.6, line 245);
  - a label or column names exactly what it counts: `words-other-13` [should fix], `-40`, plus `flows-practice-28`
    and `flows-practice-29` [should fix], which the design leaves out as single bugs (2.4, lines 192-195);
  - grouped controls in a fieldset with a legend, a group's error tied to the group: `a11y-other-09` [should fix],
    `a11y-other-21`, `a11y-practice-2-16` (2.5, lines 236-237);
  - focus never dropped to the page: `a11y-practice-1-04` [should fix], `a11y-other-07` [should fix],
    `a11y-practice-2-23`. The draft keeps only the after-submit case (2.5, lines 223-225);
  - help that is true for the screen it is on: `flows-other-06` [should fix]. The draft's "help in one place
    (3.2.6)" (draft line 524) checks the place, and that finding was about the content;
  - the drafter is never offered Approve (CLAUDE.md's Never list; 2.9, line 328);
  - danger style on actions, one rule: `brand-18`, `flows-other-09` (2.1, lines 126-127);
  - a white label leads with the firm, PaidWhole only as the earned badge (`BRAND.md:142-143`; 2.10, line 364);
  - a digest holds counts and totals only (`PRD.md:246`; 2.10, line 363).
- Classes in neither the outline nor the draft:
  - **a hand-off keeps its context.** `flows-other-07` (a ticket loses its context), `flows-other-22` (an audit
    request arrives without its screening), `flows-practice-36` (a validation request drops the cohort) and
    `flows-practice-13` (an actionable line names no case). Four should-fix findings. Only the last sits under an
    item ("no dead end"), and the design leaves out the first two as single bugs (line 371).
  - **a default view opens on data.** `flows-practice-26` (Compare two runs starts on runs of different months),
    `flows-practice-30` (the monthly summary starts on an empty month). Both left out as single bugs.
  - **a palette change is the brand owner's.** `brand-16` is about `tokens.css` values that `BRAND.md`'s palette does
    not list, which ADR 0058 leaves to the brand owner ("who alone changes the palette", `0058:61-62`). The design
    files `brand-16` under "no Tailwind palette utility" (line 110). `git grep` finds no Tailwind palette utility
    in `apps/web/src` or `packages/ui/src`, so that check guards a defect nobody has made, and the class the baseline
    did find has no check.
- The draft also restates rules that its own section 4 says it never restates (line 439): the type scale's numbers
  (draft lines 483-485). Those lines can pay for the classes above.

**Fix.**
- Put each class back as one short clause with its label (finding 3 adds the label "(baseline)"):
  - Money: "A direction is said once in words, a difference column says which way it runs, and one date and unit
    style holds on a screen (baseline)."
  - Words: "A label names exactly what its value or column counts (baseline)." Add "a palette change is the brand
    owner's (ADR 0058:61-62)" to Brand, and "Danger style on actions follows one rule (recommendation)".
  - States: "No vacuous or false fact on an empty or not-yet state (baseline)."
  - Forms: "Related controls sit in a fieldset with a legend, and a group's error is tied to it (1.3.1, 3.3.1). Focus
    is never dropped to the page (2.4.3)."
  - Flows: "Where it stands, and each person's one action, at the top of a long page (baseline). A hand-off to
    another screen or role carries its record: the case, cohort, ticket or screening (baseline). A default view opens
    on data, never an empty month or two runs that cannot compare (baseline). The drafter is never offered Approve
    (CLAUDE.md's Never list)."
  - Accessibility: "help in one place (3.2.6) and true for that screen (baseline)".
  - Print and email: "A white label leads with the firm, and PaidWhole shows only as the earned badge
    (BRAND.md:142-143). A digest holds counts and totals only (PRD.md:246)."
- Pay for them with "One type scale and tile style (ADR 0056:47-50; BRAND.md:125-126)" in place of the restated
  numbers. Then cut the input details that the session's own prompt carries (finding 5).
- Keep the cap at 90 lines if those cuts free enough room, and never above 100. Say so in section 4.
- Change line 371's list. Take out `flows-other-07`, `-22`, `flows-practice-26`, `-28`, `-29`, `-30` and `-36`,
  which now sit under checks.

## Should fix

### 3. Two labels are not enough: harm classes no rule states are mis-cited, or would stop blocking

**Evidence.**
- Each item is either "Rule: ..." or "recommendation" (line 86). The severity limits say "a recommendation alone never
  blocks" (line 401; draft line 539).
- Several baseline classes that block by harm rest on no written rule. Each is given a rule that does not say it:
  - "A state's words match the record" (`flows-other-11`, blocking) rests on `BRAND.md:23-24`, the brand's tone line;
  - "reads the same on every screen that shows it" (`words-practice-15`, blocking) rests on `PRD.md:260`, which asks
    only for a stage label.
- If a reviser fixes those cites by marking the items "recommendation", the limit at line 401 stops both from
  blocking. That would break D4's own promise that "every baseline blocking finding still meets a blocking test"
  (line 625).
- The task's own check names three kinds: a written rule, a recommendation, or a baseline defect class.

**Fix.**
- Add a third label, "(baseline)": a defect class the baseline review found that no written rule states. It is
  judged by the harm tests, so it can block by harm and never by taste.
- Use it for state words matching the record, one figure with one value everywhere, honest claims beyond "never a
  projected dollar presented as recovered", a choice that records a fact starting unanswered, the second person told,
  where it stands at the top, the work before the setup, the open practice's name readable, notices that replay, and
  finding 2's new clauses.
- Line 401 becomes: "A recommendation alone never blocks. A baseline class blocks only when it meets a harm test."
- Section 2's lead (line 86) and the draft's first paragraph name the three labels.

### 4. Some cites do not say what they are cited for

**Evidence**, each checked at its line:
- `PRD.md:248` ("totals never mix stages") is the firm Portfolio row, v1.5. It is cited for every screen (line 155,
  draft line 490).
- `PRD.md:267` ("Jump to any queue") is the dashboard's action. It is cited for "each role's pages where that role
  looks for them" (line 323).
- `PRD.md:278` says "approve (second person)". It does not say the second person is told (lines 328, 527).
  `PRD.md:246` ("in-app notifications") comes closer. The rest is "(baseline)".
- WCAG 2.5.3 (Label in Name) is cited for "the open practice's name readable" (line 280). The findings there
  (`narrow-other-10`, `narrow-practice-1-12`, `narrow-practice-2-08`) are about truncation. 2.5.3 is
  `a11y-other-04`'s criterion, which the design rightly cites at line 297.
- Combined audit #125's "Put the case list first" is about the Cases screen (`combined-report.md:1320-1326`). It is
  generalised to every first screen (lines 280, 323; draft line 516).
- Notice kinds (line 121): `BRAND.md:81-82` is about the status colours, and ADR 0056:90-91 is about the neutral badge
  and danger. "Told apart by more than colour" is WCAG 1.4.1. "The same everywhere" is a recommendation.
- `brand-16` as the evidence for "no Tailwind palette utility" (line 110): see finding 2.
- Legal surfaces (line 210) cite the brief, an ops instruction. The written rules are `legal-surfaces.md:7-8` (a row's
  review is recorded in the PR that changes its text) and the founder's delegation, which keeps "sign-off of legal
  text" (`LANES.md`, Delegations).
- "Qualifier code" in the payer's copy sits under ADR 0056:113-118 in the draft (line 532). It is
  `packages/packets/src/payer.ts:9`.

**Fix.** Cite each item at the line that says it, or label it "(baseline)" or "(recommendation)" (finding 3). Cite
#125 as "the Cases screen's ruling (combined audit #125)", and apply it elsewhere only as "(baseline)".

### 5. The draft's trailing cites cover recommendations, so taste reads as a rule

**Evidence.** The outline marks these clauses as recommendations, or as only partly ruled. In the draft, one cite at
the end of the sentence covers the whole of it:
- line 493: "the reader's need first, addressed to them (BRAND.md:23)";
- lines 505-506: "A choice that records a fact starts unanswered; a destructive action confirms with its consequence
  (PRD.md:302)". `:302` says only the second;
- line 508: "Loading: the frame kept, what loads said, the mark still (BRAND.md:127-128)". `BRAND.md` says only the
  last;
- lines 509-510: "Permission: a heading naming the page, what the role cannot do, who can, a way back" under
  `PRD.md:260`, which says only "what the role cannot do";
- line 528: "each role's own words, read-only ones for read-only roles (PRD.md:260)";
- line 532: "and say what is asked (ADR 0056:113-118)". The outline calls the cover's contents a recommendation
  (line 357);
- lines 489-490 and 492: see findings 3 and 4.

**Fix.** Give each clause its own label in parentheses right after it, as the draft already does at lines 496-497.
For example: "Permission: what the role cannot do (PRD.md:260), with a heading naming the page (2.4.6), who can and a
way back (baseline)."

### 6. One review pass cannot be done as designed: no sampling for shared changes, unreadable tall shots, harm last

**Evidence.**
- **Shared changes.** D1 widens the trigger to `packages/ui/src` and `packages/brand/src`, and in practice
  `shell.tsx` and `ActionForm` count too. Each changes every screen. The design's only selection is "`TOUR_ONLY` to
  the shot ids of the routes the diff touches" (line 50). For these PRs that means all 857 shots, at the base and at
  the head. The very next PR that takes this review, `co-001/ux-forms`, changes `ActionForm`, which 112 forms use
  (`a11y-other-01`).
- **Tall shots.** The tour shoots full pages (README:32), some about 15,000 px tall. The README itself warns against
  "trusting the eye on a 15,000 px image" (README:143). Opened whole, such a picture is scaled down until its words
  cannot be read. The checklist still asks for "what the shot shows" as evidence (draft line 543).
- **Order.** The draft starts with Brand and puts Money and status third (line 91: "the baseline's worst harms").
  So a pass that runs short of turns skips the blocking classes first.

**Fix.**
- Section 1 adds a sample for a shared component, token or shell change:
  - one shot per layout at both widths, and the dark set (what the baseline's brand lens was given, brief:58-60);
  - every state the change reaches (for `ActionForm`, the error states);
  - the screens of the baseline findings the PR says it fixes.
  The session lists the sample in the PR's reviewer table. Every other route is "not seen, by sample", never passed.
- The session cuts each full-page shot into window-height tiles (1280x800, 390x844) and gives the tiles that hold the
  change. The draft's first paragraph adds: "Read words from the code where a picture is too small to read."
- Order the bullets by harm: Money and status, Forms and errors, States, Flows, At 390 px, Accessibility, Words,
  Brand, Type and marks, Print. Or open with one line: "First pass: the blocking tests below; then the rest."

### 7. Lane A cannot use it as written, and the gap is left to Lane A

**Evidence.**
- The draft names Lane B's tool as the only source of pictures: "from `tools/lane-b-screen-tour` (on
  `claude/build-ops`)" (draft lines 467-468).
- That tool assumes Lane B's container: PG18 on 5433 (README:18), started from `/opt/pg18` and `/root/pgdata18`
  (README:80), under `/tmp/laneb-heavy.lock` (README:20). Lane A is the founder's own sessions on another account
  (`LANES.md:4`).
- A new route has no shot until someone adds its `cap(...)` calls to `capture/tour.spec.ts` on `claude/build-ops`
  (README:84-85). The design never says who does this. Every new screen, in either lane, would be "not seen".
- Open point 7 (lines 646-648) says that if a Lane A session cannot run the tool, "that is for Lane A to raise". The
  tool is Lane B's, so making it run elsewhere is Lane B's step.

**Fix.**
- The draft names what it needs, not where it comes from: "before and after screenshots of each changed screen and
  state at 1280 and 390 px, light, and 1280 dark, with their manifest entries (the screen tour on claude/build-ops
  takes them)".
- Lane B's own step, in this PR's session and before the merge, written in the tour's README:
  - a "From another lane" section: the prerequisites (a Postgres 18 on 5433, the lock path, `TOUR_DIR`) and one check
    command that says what is missing;
  - "any session may add a new route's `cap(...)` calls and push them with its review".
- Rewrite open point 7 as Lane B's item. Note the README change in the "Handed to Lane A" update (line 584).

### 8. The report drops the baseline's open findings, which each screen PR folds in

**Evidence.**
- Lane B's direction is that every screen-changing PR "folds in the baseline's findings on its screens once
  `designs/lane-b-ux-review.md` lands" (`lanes/lane-b.md:700`).
- The outline's report has a second list, "baseline findings still open on these screens (by id)" (line 75). The
  draft keeps only "a list apart" for defects the change did not cause (draft lines 544-546). So nothing asks whether
  the PR fixed its screens' findings, left them open or made them worse.

**Fix.** The draft's report adds one sentence: "Then each open baseline finding on these screens: fixed, still open
or worse. Mark the ones whose cause is in a file the change touches as the change's own." Lane A reads the same list
and decides for itself, since the direction binds Lane B.

### 9. A policy that names the reviewer agents is missed, and open PR #48 edits the same paragraph

**Evidence.**
- `docs/policies/change-management.md:63-67` (rule 1, the part the quarterly review checks) says "the reviewer agents
  (payment engine, security, EDI) run before anything that touches money, tenancy or parsing merges".
- The design's "Nothing enumerates `.claude/agents`" (lines 569-572) and its list of documents it checked and left
  (lines 568-586) do not name it.
- Open PR #48 rewrites that same paragraph (its hunk at `:62-67`), as well as the template's lines 1-8.
- The policy's owner is the security official, and its status is "draft, awaiting the security official's approval"
  (its front matter). Adding a reviewer to it adds a commitment that the quarterly review checks.

**Fix.**
- Add it to "Checked, and left unchanged": "the change-management policy (`:66`) names the three PRD 17 reviewers. It
  is the security official's text, and a new reviewer there is a new commitment the quarterly review checks, so it is
  left as it is."
- Add it to open point 6 beside `PRD.md:721`, for the founder through the co-founder. Note that any later edit of it
  merges after #48 and keeps #48's hunk (rule 6).

### 10. "Never retyped as live text" goes against BRAND.md, and severity test 6 does not say what "retypes" means

**Evidence.**
- The outline says "the wordmark never retyped as live text" (line 140). But `BRAND.md:55` says that "in app chrome
  the lockup renders live text".
- "PaidWhole" is meant to appear as text in page titles (`%s | PaidWhole`), in email and elsewhere (ADR
  0056:132-135).
- Blocking test 6 (lines 389-392) blocks a change that "retypes the mark or wordmark", calling it "a legal harm". That
  is the design's own reading of `BRAND.md:161-164`, not a written severity.
- What `brand-13` actually found is a title in the wordmark's face and weight that sits outside the lockup.

**Fix.**
- Item: "The wordmark only through `<PaidWholeLockup/>`, never set as a styled title in the display face
  (brand.md:20-22). The name in running text and in page titles is copy (ADR 0056:132-135)."
- Test 6 says "sets the name in the wordmark's style outside the lockup", and marks the blocking level as this
  design's reading, which the co-founder may change.

## Nits

### 11. The model value: the four files do not agree, and the design does not say so
`edi-reviewer.md:6` and `qa-fixture-builder.md:5` carry one value; `security-reviewer.md:6` and
`payment-engine-reviewer.md:6` carry another. Q4 says "follows the other reviewer files". The design's choice is the
right one, but line 424 should say why: the brief names the security and payment-engine files as the form, and those
two agree. It must still write no value.

### 12. WCAG 2.2's additions: one is missing
#103 adopts WCAG 2.2's rules (`combined-report.md:1126`). Its A and AA additions are 2.4.11, 2.5.7, 2.5.8, 3.2.6, 3.3.7
and 3.3.8. The checklist carries all but 2.5.7, Dragging Movements. The upload drop zones (`narrow-practice-2-22`)
pass it today only because a Choose files button sits beside them. Add "anything dragged has a single-pointer way
(2.5.7)".

### 13. Remittance keys are shown on purpose on two screens
`packages/packets/src/payer.ts:4-9` (ADR 0061) says the review page and the mapping screens show the remittance-key
form (`CE:<id>`) on purpose. "No raw codes" (draft line 495) would report it as a broken rule (`words-practice-47`).
Add: "a code shown by a recorded decision is a recommendation, never a broken rule".

### 14. The left-out list contradicts itself
`flows-practice-32` is left out as a single bug (line 372) and also cited under 2.8 (line 300). Settle it with
finding 2's change to line 371.

### 15. 16 px fields already have a written rule
`BRAND.md:93` gives body and UI "16/24 body; 14 in dense tables". So a 16 px form field follows the brand. Only ADR
0056:49-50's undefined "dense controls" makes it doubtful. Cite `BRAND.md:93` beside the recommendation (line 275).
Open point 2's fix may then only need to define "dense controls".

### 16. The commit the cites were checked at
The draft says "Lines cited are as of 4d99df8" (line 470). The builder writes the commit at which it re-opened the
cites, and the fresh-clone check updates it if a merge moved a line (line 459 already re-opens them).

### 17. Backticks in the reviewer's report
Sessions paste these reports into files pushed to `claude/build-ops`, where gitleaks reads a bare shot id followed by a
comma as a key (`LANES.md` Claims, the ux-forms row). The draft's report sentence adds: "wrap shot ids and paths in
backticks". That is four words.

### 18. "One of the two adversarial reviews" can crowd out a reviewer the change needs
The pipeline says "at least two adversarial reviews" (`HANDOFF.md:109`). `security-reviewer.md:3` asks to be used on
any change under `apps/`, and a money change needs the payment-engine reviewer (PRD 17). Line 27 adds: "it adds to,
and never takes the place of, a PRD 17 reviewer the change also needs".

### 19. The template's new sentence cites no source for the new reviewer
The new comment (lines 558-562) cites "PRD 17" for the three reviewers it already named, and nothing for the UX and
brand reviewer. Add "(the founder's ruling of 2026-10-25, through the co-founder)", so a reader of a PR description
can find where it comes from. `LANES.md` rule 1 does not carry the ruling yet.
