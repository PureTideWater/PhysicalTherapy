# Design: the UX and brand reviewer checklist (LANES.md claim `co-001/ux-brand-reviewer`)

*Lane B, 2026-10-26 ~05:45 UTC; revised ~06:10 to ~09:05 UTC after its one adversarial review
(`designs/lane-b-ux-brand-reviewer-review.md`: 2 blocking, 8 should fix, 9 nits, each settled under "Review
dispositions" at the end). Branch `co-001/ux-brand-reviewer`, worktree `/home/user/ux-brand-reviewer`, cut from
`claude/build-platform` 4d99df8. Workflow wf_f49e6c03-028 (design, one adversarial review, revision, one builder).
Every file:line below is at 4d99df8 unless it names `claude/build-ops`. Synthetic data only.*

**Inputs read.** The brief (`designs/lane-b-ux-review-brief.md`, "What it judges against" and "Then"); the four
reviewer files; `.claude/rules/brand.md`, `docs/brand/BRAND.md`, `packages/brand/README.md`, `tokens.css`; ADR 0056 and
0058; CO-11; `words.ts` and `tools/brand-copy`; `PRD.md:244-302`; combined audit #103
(`audits/combined/combined-report.md:1122-1129`); `apps/web/e2e/a11y.ts`; the screen tour's README; and the baseline's
335 raw findings (`designs/lane-b-ux-review/raw-findings.md`: 22 blocking, 198 should fix, 115 polish by their Flags
lines). The revision also read ADR 0061:680-700, `packages/packets/src/payer.ts:1-16`,
`docs/policies/change-management.md`, `docs/product/legal-surfaces.md:1-8`, `LANES.md` (Claims, "Handed to Lane A",
Delegations), `lanes/lane-b.md:586-593` and `:700`, and `HANDOFF.md:105-114`. **The synthesis
`designs/lane-b-ux-review.md` did not exist** when this was written (checked locally and on `origin/claude/build-ops`
at a00f7e0, ~05:35 UTC) **nor at the revision** (checked again 2026-10-26 ~06:10 UTC, and ~09:00 UTC locally and on
`origin/claude/build-ops` at 95aecf9), so the outline cites raw finding ids. Open point 1 says what happens when it
lands.

**In one paragraph.** One new file, `.claude/agents/ux-brand-reviewer.md`, at most 100 lines (99 as drafted) in the
form and voice of `security-reviewer.md`, with its six frontmatter keys and its `model:` value (Q4). It tells a default
workflow agent what it receives (the diff, before and after screenshots at 1280 and 390 px, the baseline's open findings
on those screens), what CI already holds so it looks elsewhere, ten short groups of checks ordered by harm (one clause
per recurring defect class, each with its rule, or labelled "recommendation" or "baseline"), the severity rules and the
report's form. One more change: the pull request template's reviewer comment names the new reviewer, so every pull
request in both lanes is asked for it. No product code, no migration, no ADR, a documentation-only suite.

## 1. Purpose and use

### When a session runs it
On every pull request, in either lane, that changes something a person sees. It is then one of the PR's two
adversarial reviews (the co-founder, 2026-10-25 ~17:00 UTC; for Lane A, the co-founder acting for the founder, ~21:10
UTC, `LANES.md` "Handed to Lane A"). It adds to, and never takes the place of, a PRD 17 reviewer the change also needs:
the pipeline asks for at least two adversarial reviews (`HANDOFF.md:109`), `security-reviewer.md:3` asks to be used on
any change under `apps/`, and a money change takes the payment-engine reviewer.

The trigger is defined by its effect: a change to the words, figures, markup or style of a screen, a PDF or an email
(the ruling's "every pull request that changes something a person sees", `lanes/lane-b.md:591`). A list of paths
cannot be the whole of that, so the file names a floor that cannot go stale, and the session adds any other file whose
strings reach a person (improvement, taken; see D1):
- **Every file the copy lint reads,** by its own lists (`tools/brand-copy/scan.ts:51-61` `COPY_ROOTS`, `:69-77`
  `COPY_FILES`), so the floor grows when the lint does. Today that is all of `apps/web/src` (pages, components, copy,
  and the words and figures its routes and helpers return: `src/lib/routes`, `src/lib/http`), the report
  (`apps/worker/src/report`), the digest and mail (`apps/worker/src/digest`, `apps/worker/src/mail`), the packet and the
  payer's copy (`apps/worker/src/packets`), all of `apps/worker/src/screening` (the emails, the wording and the upload
  refusals the screening page shows, `scan.ts:46-47`), `packages/ui/src`, `packages/triage/src` (the stage labels on
  every line's chip, the write-off and pattern words), `packages/packets/src` (the narrative and the refusals the
  workbench shows), the ROI statement (`apps/worker/src/reconcile/statement-html.ts`), the notes a line keeps when the
  ledger moves it back (`apps/worker/src/reconcile/stages.ts`), dunning, support notices and support mail, and the
  contract calendar and pricing location (`packages/contracts/src/calendar.ts`, `location.ts`: Pricing settings,
  Coverage, Getting started, a run's refusal and the console read them, `scan.ts:63-68`).
- **`packages/brand/src`** (tokens, mark): not read by the lint, but it changes every screen.
- **Files whose strings reach a screen that the lint does not read** (the baseline's `words-other-23`):
  `packages/db/src/authz/permissions.ts` (every permission state's reason, its `description` strings from line 55;
  `words-practice-08` shows them on screen), `packages/compliance/src/controls.ts` (the evidence titles) and
  `apps/worker/src/billing/account.ts` (the console's billing refusal). So Lane A's role-matrix PR, which rewrites
  `permissions.ts`, takes the review, and so does a triage PR that renames a stage label.

A PR on these files that changes nothing a person sees (no words, figures, markup or style; a query refactor under
`src/lib`) keeps its two reviews as they are, as the brief says; the session records why in the PR description's
reviewer table. The reviewer file's `description:` carries the effect and the floor, as `security-reviewer.md`'s
carries its paths (section 4).

### What it receives
The file names what the reviewer needs, not where it comes from, so a session in either lane can supply it:
- **The diff** against the PR's base (`git diff <base>...HEAD`); it reads the code behind each change itself.
- **Before and after screenshots** of each changed screen and state at 1280 and 390 px light and 1280 px dark, with
  their manifest entries (`shots.json`: id, route pattern, role, width, theme, state, note), so each picture is read
  with its route and persona. Today the screen tour on `claude/build-ops` takes them (`tools/lane-b-screen-tour`,
  README "The parts" and "Set-up and a run"): `setup.sh` with `TOUR_REF` set to the PR's base, a run restricted with
  `TOUR_ONLY` to the shot ids of the routes the diff touches (`<route key>.<variant>.<width>`, README:45-46), then the
  same at the head. Each route gives 1280 px light, 1280 px dark (tokens only: `data-theme="dark"` set by the tour,
  README:33) and 390 px light, plus the empty, loading, error, not-found and interaction states the route map names
  (README:34-36). "Dark where offered" means that 1280 dark shot: no user can reach dark today (ADR 0056:127-130).
- **In window-height tiles.** The tour shoots full pages (README:32), some about 15,000 px tall, and its own README
  warns against "trusting the eye on a 15,000 px image" (README:143): opened whole, such a picture is scaled down until
  its words cannot be read. The session cuts each shot into tiles of the window's height (1280x800, 390x844) and gives
  the tiles that hold the change. Where a picture is still too small, the reviewer reads the words from the code.
- **A sample, for a shared change.** A change to a shared component, a token or the shell (`packages/ui/src`,
  `packages/brand/src`, `apps/web/src/components/shell.tsx`, `action-form.tsx`) changes every screen, and
  `TOUR_ONLY` on "the routes the diff touches" would mean all 857 shots (README:89), at the base and at the head. The
  next PR to take this review, `co-001/ux-forms`, changes `ActionForm`, which 112 forms use (`a11y-other-01`). For
  these the session gives:
  - one shot per layout at both widths, and the dark set (what the baseline's brand lens was given, brief:58-60);
  - every state the change reaches (for `ActionForm`, the error states);
  - the screens of the baseline findings the PR says it fixes.
  The session lists the sample in the PR's reviewer table. Every other route is "not seen, by sample", never passed.
- **A new route** has no shot until its `cap(...)` calls are added to `capture/tour.spec.ts` on `claude/build-ops`
  (README:84-85). Any session, in either lane, adds them and pushes them with its review (section 5, Lane B's step).
- **For a renderer or email change:** the rendered pages before and after (the tour shoots the payer's copy PDF and
  records the emails it sends, README:50 and :91; otherwise the template rendered with its tests' synthetic data).
- **The baseline's open findings on those screens**, by route, from `designs/lane-b-ux-review.md` on
  `claude/build-ops` (the raw list until it exists).

### How it works (the order the file gives)
1. List the routes and templates the diff changes; match each to its shots. A changed screen with no shot is "not
   seen" and is reported, never passed (two of the baseline's accessibility reviewers found 19 of their 34 routes and
   18 of their 28 never scanned by axe: `a11y-other-24`, `a11y-practice-2-19`).
2. Read the code behind each change; compare before and after at both widths; walk the flow of each role the change
   reaches.
3. Judge against the checklist, whose groups run from the worst harm down (Money and status first), so a pass that runs
   short of turns has already done the blocking classes; skip what CI holds (section 2.0) and spend the time where
   checks cannot see.
4. Report.

### What it returns
Findings, most severe first. Each: **severity** (blocking, should fix, polish; section 3); **the screen** (route and
shot id); **evidence** (file:line at the head, and what the shot shows); **the rule** (file:line, WCAG criterion,
"recommendation" where the rules are silent, or "baseline" for a defect class the baseline found that no rule states;
section 2's lead); **the best fix**, one, with exact words when words are the fix, and whether it needs a migration or
a freeze exception (so the session routes it under LANES.md rule 2). Then, apart, each open baseline finding on these
screens, marked fixed, still open or worse, and any other defect the change did not cause; one whose cause sits in a
file the change touches is the change's own (Lane B's direction that each screen PR folds in its screens' findings,
`lanes/lane-b.md:700`; Lane A reads the same list and decides for itself). Then the routes or templates not seen. Or
"no findings", with the screens and states checked. Shot ids and paths are wrapped in backticks, since sessions paste
these reports into files pushed to `claude/build-ops`, where gitleaks reads a bare shot id followed by a comma as a key
(`LANES.md` Claims, the ux-forms row). It never declares a screen accessible or WCAG conformant (as
`security-reviewer.md:12` never declares anything HIPAA compliant) and never edits files.

### What it does not replace
CI's checks (section 2.0); the security reviewer for PHI and tenancy (this file flags PHI it sees on a screen, in a
URL or an email, and the session hands it on); the payment-engine reviewer for the arithmetic behind a figure (this
file judges how a figure reads, not how it is computed).

## 2. The checklist outline, section by section

Each item carries one of three labels (improvement from the review, finding 3):
- **a rule:** the file:line, WCAG criterion or CLAUDE.md rule that says it, cited at the line that says it;
- **"recommendation":** the rules are silent, and this is the best option. A recommendation alone never blocks;
- **"baseline":** a defect class the baseline review found that no written rule states. It is judged by the harm tests
  of section 3, so it can block by harm, never by taste. Without this label, classes such as "a state's words match the
  record" (`flows-other-11`, blocking) would either be mis-cited to a rule that does not say them or, marked
  "recommendation", stop blocking.

A clause that is partly ruled gives each part its own label in parentheses right after it, never one trailing cite for
the whole sentence. Each item also lists the baseline findings that show the class (raw ids). The file carries the
rules and the labels, not the finding ids: the synthesis will renumber the findings (UX-001 onward), and the reviewer
receives the open findings for its screens anyway (D3).

The outline is grouped by subject. The file orders its groups by harm, so a pass that runs short of turns has done the
blocking classes first: Money and status (2.3), Forms and errors (2.5), States (2.6), Flows (2.9), At 390 px (2.7),
Accessibility (2.8), Words (2.4), Brand (2.1), Type and marks (2.2), Print, PDF and email (2.10).

### 2.0 What CI already holds (look past it)
- Hex colours outside the four allowed files: `tools/brand-colors` (ADR 0058:69-76). Font hosts: `tools/brand-fonts`
  and ESLint (ADR 0058:78-85). CO-11's forbidden words, the brand's words typed out, the screening's words and the
  "recovered" label, **in the files the copy lint reads** (`tools/brand-copy/scan.ts:51-77`; rules at `:19-31`):
  `pnpm lint:copy`. axe's WCAG 2.1 A and AA tags on the pages the journeys load (`apps/web/e2e/a11y.ts:12`), no
  sideways scroll where a journey calls `atPhoneWidth` (`a11y.ts:53`), a focus outline on the elements `tabTo` reaches
  (`a11y.ts:37-40`). The header and cover baselines (ADR 0058:129-183) and the print layout of the templates
  `print-layout.test.ts` knows (ADR 0058:185-198).
- What they miss, and where the review spends its time (baseline: `words-practice-56`, `words-other-23`,
  `a11y-other-24`, `a11y-practice-1-28`, `a11y-practice-2-19`): every state after a refusal, the forbidden and
  not-found pages, open menus, the dark tokens, WCAG 2.2's additions (axe runs no 2.2 tag; `tabTo` passes a ring
  hidden under the header), raw keys and codes, wrong figures, flows, Tailwind palette colours (the hex check reads
  hex only), and the words in files the lint does not read (`permissions.ts`, `controls.ts`, `billing/account.ts`:
  section 1).

### 2.1 Brand: tokens and colour
- **Colours only from tokens:** no Tailwind palette utility (`text-red-600`, `bg-gray-50`), no `rgb()` or named colour
  (CI holds hex). Rule: `.claude/rules/brand.md:13-16`; `BRAND.md:59-62`. Preventive: `git grep` finds no Tailwind
  palette utility in `apps/web/src` or `packages/ui/src` today (brand White apart), but the hex check cannot see one.
- **A palette change is the brand owner's:** a token value added to or changed in `tokens.css` that `BRAND.md`'s
  palette does not list goes to the brand owner, who alone changes the palette. Rule: ADR 0058:61-62. Baseline:
  `brand-16` (greys and interaction colours outside the palette).
- **Status colours for data only,** as text on the matching tint with a label, never white on a saturated fill, never
  colour alone; a failure is danger text on the danger tint; a system state is a neutral badge; an investigatory line
  takes the unpriced tone, never Short. Rule: `brand.md:26-28`; ADR 0056:70-95 (the table at :72-85, unpriced text in
  Slate :87-89, neutral badge :89-90, danger :90-92); `BRAND.md:81-82`. Baseline: `brand-06` (danger on "To do",
  "Open"), `brand-07` (three badge looks), `brand-11` (screening anomaly in Short), `a11y-practice-2-20`.
- **Brass:** the keystone, seals and the single active-rail underline; never text on white, a button fill or a
  background; and the current item never marked by the 2.4:1 underline alone. Rule: `brand.md:32-33`;
  `BRAND.md:67`, `:120-121`; WCAG 1.4.11, 1.4.1. Baseline: `a11y-other-22`, `a11y-practice-1-11`, `a11y-practice-2-09`,
  `brand-15` (settings tabs as link-blue pills: the sub-navigation's look is a recommendation, the rules are silent).
- **Notice kinds** (success, information, warning, danger) told apart by more than colour (WCAG 1.4.1), and each the
  same everywhere (recommendation; `BRAND.md:81-82` and ADR 0056:90-91 cover the status colours, the neutral badge and
  danger, not notices). Baseline: `brand-05`, `a11y-practice-2-21`.
- **Dark:** the semantic tokens, never inverted hex; native controls follow the theme (`color-scheme`). Rule:
  `brand.md:39`; `BRAND.md:84-86`; `tokens.css:72-100`; `color-scheme` is a recommendation. Judged advisory while
  dark is off (ADR 0056:127-130; ADR 0058:58-59, D9 item 3). Baseline: `brand-01`, `brand-02`, `brand-03`,
  `brand-04` (the recommended Appearance setting), `a11y-other-19`, `a11y-practice-1-23`, `a11y-practice-2-15`. The
  draft leaves "semantic tokens" to CI (hex stands only in the four allowed files, so a component cannot invert hex) and
  keeps dark contrast under Accessibility.
- **Danger style on actions** follows one rule across screens. Recommendation (the rules are silent;
  `packages/ui/src/components/button.tsx:13-15` defines the style). Baseline: `brand-18`, `flows-other-09`.

### 2.2 Type, figures and the marks
- **Mono for every money figure, code, unit count and rate,** tabular, in sentences and button words too, through
  `<Money/>` (`apps/web/src/components/remittances/display.tsx:17`). Rule: `brand.md:36`; ADR 0056:50-51. Baseline:
  `brand-10` (amounts in Plex Sans in the digest, terms, materiality line), `words-practice-46` (units three ways).
- **Plex Mono at 400 or 500 only** (no faked 600 or 700 bold). Rule: `BRAND.md:94`. Baseline: `brand-09`.
- **One type scale:** page title 32/700, section 20/700, card title 18/700, display face at -0.02em; lede 16/24;
  tables and dense controls 14; no size off the scale. Rule: ADR 0056:48-50; `BRAND.md:90-94`. Baseline: `brand-12`,
  `brand-15` (10 px tags). Long titles at 390 px are a recommendation (`narrow-other-15`, `narrow-practice-1-23`).
- **Tiles:** label Slate 12 px, value Plex Mono 500, note Slate. Rule: `BRAND.md:125-126`; ADR 0056:47-48. Baseline:
  `brand-08` (five tile styles), `narrow-practice-1-21`.
- **The mark and lockup** only through `<PaidWholeMark/>` and `<PaidWholeLockup/>`; never animated or used as a
  spinner; a lone mark `role="img"` "PaidWhole", one beside its name decorative; the empty state's mark once per
  screen. Rule: `brand.md:17-22`, `:34-35`, `:40-41`; ADR 0056:66-68.
- **The wordmark only through `<PaidWholeLockup/>`:** no title sets the name in the wordmark's face outside the lockup,
  since that is the wordmark in another tracking. Rule: `brand.md:20-22`; `BRAND.md:53-55` ("never set in another
  face, weight or tracking"). The lockup itself renders live text in app chrome (`BRAND.md:55`), and the name in running
  text and in page titles (`%s | PaidWhole`) is copy (ADR 0056:132-135), so neither is a finding. Baseline: `brand-13`
  (the home page's H1 "PaidWhole" in the display face at 700 and -0.02em, under the header's lockup).
- **Seal and badge** only when `reconciledToCash` comes from the ledger, with the definition line. Rule:
  `brand.md:29-31`; `BRAND.md:106-116`. Where the seal sits on a web page is a recommendation (`brand-17`).

### 2.3 Money and status
- **Amounts from integer cents** through `<Money/>` or `formatUsd` (`packages/money/src/cents.ts:67`); a person never
  reads or types cents as dollars. Rule: CLAUDE.md rule 2; `PRD.md:256` ("every money value rendered from cents with the
  practice's locale"). Baseline, blocking: `flows-practice-01`, `narrow-practice-2-02`, `words-practice-11`; also
  `words-other-21`, `flows-other-10` (a budget typed in cents), `words-practice-14` ("Unit 5000 cents").
- **Expected, paid and short,** together and in that order. Rule: `brand.md:36-37`; ADR 0056:55-58;
  `BRAND.md:123-124`. Baseline: `narrow-other-05` (blocking: hidden columns at 390), `narrow-practice-1-04`.
- **A figure carries its stage label** (rule: `PRD.md:260`, "Dollar figures carry their stage label everywhere")
  **and its period, never mixes stages, and reads the same on every screen that shows it; a count beside a figure
  counts the same lines** (baseline; `PRD.md:248`'s "totals never mix stages" is the firm Portfolio's row, v1.5, and
  is the rule only there). Baseline: `words-practice-15` (blocking: Actionable $0.00 on the tile, $30.00 on the ROI
  statement), `words-practice-16`, `words-practice-33`, `flows-practice-20`.
- **"Recovered"** only for stage five, posted or deposited, with the proof level where known; "Verified" only for the
  seal, "Fields checked" for a rate record. Rule: `brand.md:37-38`; ADR 0056:60-64, :92-94; CLAUDE.md's Never list
  ("Count anything as recovered without a ledger_entry at stage posted or deposited"). The lint holds the label; the
  reviewer holds the figure behind it.
- **Unpriced:** its reason in words from the closed list and its remedy, never a guessed price. Rule: CLAUDE.md's
  unpriced-reasons convention; `docs/product/unpriced-reasons.md`; ADR 0056:81. Baseline: `words-practice-13`,
  `words-practice-32`, `words-other-11`, `flows-other-25` (combined audit #107).
- **A state's words match the record:** no "In good standing" over a suspension, no "Awaiting response" when nothing
  was sent, no "Resolved" that drops the amount refused, no "Saved" beside a value that cannot work. Baseline class
  (`BRAND.md:23-24` is the brand's tone line, not a rule for this; blocking test 1 holds it by harm). Baseline:
  `flows-other-11` (blocking), `flows-other-12`, `flows-practice-10`, `flows-practice-06`, `words-practice-17`,
  `words-practice-19`, `words-practice-20`, `words-practice-29`, `words-practice-34`.
- **Signs, dates and units:** a direction said once in words ("took back $18.00", not "-$18.00"), and a difference
  column says which way it runs; one date format and one unit style on a screen. Baseline class (the rules are silent
  on displayed dates and units; `PRD.md:256` covers storage). Baseline: `words-practice-02`, `words-other-12`,
  `words-practice-36` (all should fix), `words-practice-41`, `words-practice-23`, `words-practice-46`.

### 2.4 Words
- **Plain, exact, warm; no hype; never a projected dollar presented as recovered.** Rule: `BRAND.md:23-24`.
- **Sentences:** what the reader needs first, then the rest (a retention notice after the advice, not before); short
  sentences addressed to the reader ("you can generate one", not "a billing manager can"); a link's words say where it
  goes. Rule: WCAG 2.4.4 for links; the rest a recommendation under `BRAND.md:23`. Baseline: `words-other-16`,
  `words-other-17`, `words-other-25`, `words-other-36`, `words-other-37`, `words-other-41`, `words-practice-21`,
  `words-practice-54`.
- **Counts and codes:** `counted()` for a count's noun; `labelOf()` for a code shown as a label; no schema keys
  (`organizationId:`), raw codes (`NO_AGREEMENT`, `active`), UUIDs, X12 segment names or validator text
  ("Invalid input: expected array") in what a person reads. Rule: `apps/web/src/lib/copy/words.ts:8`, `:27` for the
  helpers; in an error, `PRD.md:256` (every error with a next step) and WCAG 3.3.1; elsewhere a baseline class. A code
  shown by a recorded decision is a recommendation, never a broken rule: the review page and the mapping screens show
  the remittance-key form (`CE:<id>`) on purpose (`packages/packets/src/payer.ts:4-9`; ADR 0061:695-697), so
  `words-practice-47` there is a recommendation. Baseline: `words-practice-01`, `words-other-33`,
  `words-other-38` (plurals); `words-other-01`, `words-practice-04`, `narrow-other-12`, `a11y-practice-1-01` (keys);
  `words-other-02`, `narrow-other-14` (validator text); `words-other-22`, `words-practice-03`, `-24`, `-25`, `-26`,
  `-47`, `-49`, `-50` (codes and identifiers).
- **No build vocabulary:** milestones, PRD sections, "the engine", job and skill names, golden-question ids, "opaque
  ID", "for now". Recommendation, under `BRAND.md:23`. Baseline: `words-practice-12`, `words-practice-40`,
  `words-other-09`, `-27`, `-34`, `-35`, `-42`, `-45`, `flows-other-21`.
- **One name per thing** across screens and the payer's copy. Rule for the three numbers and Short: `brand.md:36-37`;
  otherwise a recommendation. Baseline: `words-practice-27` (Terms of use or of service), `words-practice-30` (five
  names for one shortfall), `words-other-20` (Billing twice), `words-other-28`.
- **A label or column names exactly what its value counts.** Baseline class. Baseline: `words-other-13` ("Claims"
  heading a count of claim lines; should fix), `words-other-40`, `flows-practice-28` ("Last run" shows whatever job ran
  last, not the last pricing), `flows-practice-29` (the ledger's "#" is the platform-wide sequence; should fix).
- **Every error says what happened and a next step the reader's role can take, true to where it points.** Rule:
  `PRD.md:256`, `:260`. Baseline: `words-other-03`, `words-practice-05` ("marked below" above the message),
  `words-other-04`, `-05`, `-06`, `-07`, `-15`, `-19`, `-29`, `-30` ("Not signed in" for a failed key registration),
  `words-practice-07`, `-08`, `-09`, `-22`, `-28`, `-35`, `-51`, `-55`.
- **Honest claims:** nothing the product cannot prove or promise ("An audit prices every line"; "Pursuit hours logged:
  0.00"); the screening never says owed, underpaid or recovered, and its colours do not imply a finding. Rule for
  "never a projected dollar presented as recovered": `BRAND.md:23-24`; for the screening's words,
  `docs/product/change-order-001.md:95` (CO-11), which the copy lint holds in every screening file, so the draft leaves
  them to CI; the rest a baseline class. Baseline: `words-other-14`, `words-practice-37`, `words-other-10`,
  `words-other-26`, `words-other-44`, `brand-11`.
- **Who did a thing is named exactly** (an attestation, a download). Recommendation (two-person rules, `PRD.md:278`,
  record who; the rules are silent on the words). Baseline: `words-practice-38`, `words-practice-39`,
  `flows-practice-09`.
- **Apostrophes:** one typographic apostrophe. Recommendation. Baseline: `words-other-32`, `words-practice-10`.
- **Legal surfaces:** a change to the words of a surface marked `data-legal-surface` takes the founder's sign-off,
  recorded in the PR. Rule: `docs/product/legal-surfaces.md:7-8` (a row's review is recorded in the pull request that
  changes its text); the founder's delegation, which keeps "sign-off of legal text" (`LANES.md:224`, Delegations, on
  `claude/build-ops`). Baseline: `words-other-18`, `flows-other-13` (blocking: terms to accept, not shown).

### 2.5 Forms and errors
- **A refusal keeps every value as typed,** files included, and never swaps in a stored value or a default. Rule:
  WCAG 2.2 3.3.7 Redundant Entry (A; combined audit #103), 3.3.1, 3.3.3; `PRD.md:256`. Baseline, blocking (the
  largest class, nine reviewers): `a11y-other-01`, `a11y-practice-1-03`, `a11y-practice-2-01`, `flows-other-01`,
  `flows-practice-33`, `narrow-other-01`, `narrow-practice-1-07`, `narrow-practice-2-01`, `words-practice-06`; files:
  `narrow-practice-2-13`.
- **Each error is text under its control,** named by the control's visible label, tied by `aria-describedby`,
  marked on selects and text areas as on inputs and not by colour alone; a summary above the fields. Rule: WCAG 3.3.1,
  1.3.1, 1.4.1; the field outline token (ADR 0056:94-95). Baseline: `a11y-other-02`, `-08`, `-09`, `-15`,
  `a11y-practice-1-02`, `-19`, `a11y-practice-2-02`, `-03`, `narrow-practice-1-08`, `narrow-practice-2-06`.
- **Focus and announcement:** after a submit, focus goes to the error summary or the result, which is announced; focus
  is never dropped to the page (no control disables or removes itself under the focus, no re-render that loses it).
  Rule: WCAG 2.4.3, 4.1.3. Baseline: `a11y-practice-1-04`, `a11y-other-07` (both should fix), `a11y-practice-2-23`.
- **Instructions on the field,** not in a placeholder or a card's text (formats, "no patient information"); input
  purposes set. Rule: WCAG 3.3.2, 1.3.5, 1.4.3 (placeholder contrast). Baseline: `a11y-other-20`, `a11y-practice-1-12`,
  `a11y-practice-2-14`, `a11y-practice-2-24`, `words-other-24`.
- **Sign-in steps:** a code accepts paste and spaces; an authenticator key has a QR code or a copy button; a timed
  step warns and offers more time. Rule: WCAG 2.2 3.3.8 (AA; #103), 2.2.1. Baseline: `a11y-other-05`, `-06`, `-23`
  (blocking), `flows-other-18`, `narrow-other-23`.
- **Choices and confirmations:** a destructive action confirms with its consequence, the same on every screen (rule:
  `PRD.md:302`; WCAG 3.3.4); a choice that records a fact starts unanswered, and no destructive default (baseline;
  `PRD.md:302` says only the confirmation). Baseline: `flows-practice-07`, `narrow-other-02`, `flows-other-10`,
  `flows-other-09`, `a11y-other-18`, `flows-other-29`, `words-practice-44`.
- **Grouped controls** in a fieldset with a legend, and a group's error tied to the group. Rule: WCAG 1.3.1, 3.3.1.
  Baseline: `a11y-other-09` (should fix), `a11y-other-21`, `a11y-practice-2-16`.

### 2.6 States
Rule for all: `PRD.md:260` ("every screen has an empty state that says what to do next, a loading state, an error
state with a next step, and a permission state that explains what the role cannot do"); the components in
`packages/ui/src/states`.
- **Empty:** the next step and a control that takes it (`packages/ui/src/states/empty-state.tsx:8-11`); a filtered
  empty list names the filter and how to clear it; the mark only for the screen-level state (ADR 0056:66-68). No
  vacuous or false fact on an empty or not-yet state ("0 of 0 lines", "No dates ahead"): a baseline class. Baseline:
  `narrow-other-19`, `narrow-practice-1-19`, `narrow-practice-2-07`, `words-other-31`, `-43`, `words-practice-29`,
  `-31`, `-45`, `-48` (should fix), `-53`.
- **Loading:** the mark still and a plain bar (`BRAND.md:127-128`; ADR 0056:42-43); announced politely (WCAG 4.1.3);
  keeps the app frame and says what loads (baseline; `BRAND.md` says only the mark and the bar). Baseline:
  `narrow-other-07`, `narrow-practice-1-10`, `narrow-practice-2-05`, `a11y-other-26`, `a11y-practice-1-17`,
  `a11y-practice-2-10`.
- **Error:** a next step, inside the app's frame, never raw JSON or a bare framework page. Rule: `PRD.md:256`, `:260`.
  Baseline: `narrow-practice-1-09` (blocking), `a11y-practice-1-18`, `words-practice-42`.
- **Permission refused:** what the role cannot do (rule: `PRD.md:260`, which says only that); a heading that names the
  page (WCAG 2.4.6, 1.3.1); who can, a true next step and a way back (baseline). Baseline: `a11y-other-13`,
  `a11y-practice-1-15`, `narrow-practice-1-16`, `narrow-practice-2-20`, `words-other-07`, `-08`, `words-practice-08`,
  `-09`.
- **Not found:** a signed-in person keeps the shell and a way back to the list. Recommendation (the PRD names four
  states, not this one). Baseline: `narrow-practice-1-17`, `words-other-39`, `words-practice-18`.
- **Work in progress** updates itself and says when it is done, never "reload in a moment". Recommendation (the packet
  export already refreshes itself). Baseline: `flows-practice-34`, `narrow-practice-2-17`, `a11y-practice-2-11`,
  `narrow-practice-1-15`.

### 2.7 At 390 px
- **No page scrolls sideways.** Rule: ADR 0056:51-53; WCAG 1.4.10. Baseline: `narrow-other-03`,
  `narrow-practice-1-01`, `-02`, `narrow-practice-2-03`, `-04`, `-19`.
- **Wide tables** scroll inside `ScrollTable` (named, reachable by keyboard:
  `apps/web/src/components/scroll-table.tsx:9`) with a visible cue that more columns exist, or reflow into stacked
  rows; what the person came for stays in view (expected, paid and short together); a row's action sits beside its
  row; no form opens inside a cell. Rule: ADR 0056:51-53; WCAG 2.1.1, 4.1.2, 1.3.2; `brand.md:36-37`; the cue is a
  recommendation. Baseline: `narrow-other-05` and `narrow-practice-1-03` (blocking), `narrow-other-04`, `-06`, `-11`,
  `narrow-practice-1-04`, `-06`, `-11`, `a11y-other-11`, `a11y-other-14`, `a11y-practice-1-16`, `a11y-practice-2-13`.
- **Hashes, IDs and dates** wrap without widening anything; dates and short codes stay whole. Recommendation on screen
  (ADR 0058:189-192 sets it for print). Baseline: `narrow-other-13`, `narrow-practice-1-02`, `-05`, `-18`,
  `narrow-practice-2-04`, `-16`, `a11y-other-12`.
- **Targets at least 24 px**; 44 px for a primary action is a recommendation. Rule: WCAG 2.2 2.5.8 (AA; #103).
  Baseline: `a11y-practice-2-05`, `narrow-practice-2-14`, `narrow-practice-1-22`, `narrow-other-18`.
- **Form fields at 16 px below the md breakpoint** so the phone does not zoom; never by blocking zoom. Recommendation,
  with `BRAND.md:93` behind it (body and UI "16/24 body; 14 in dense tables", so a 16 px field follows the brand); only
  ADR 0056:49-50's undefined "dense controls 14" makes it doubtful; blocking zoom would fail WCAG 1.4.4. Baseline:
  `narrow-other-09`, `narrow-practice-2-10` (cause: `packages/ui/src/components/input.tsx:11`, `text-sm`). See open
  point 2.
- **The open practice's name readable** in the header at 390 px. Baseline class, under `PRD.md:260` (one practice at a
  time, with a practice switcher); the rules are silent on how the header folds. (WCAG 2.5.3 is the accessible-name
  rule under 2.8, `a11y-other-04`, not the truncation these show.) Baseline: `narrow-other-10`, `narrow-practice-1-12`,
  `narrow-practice-2-08`.
- **The work before the setup** on a role's first screen: see 2.9. Baseline: `narrow-practice-1-14`,
  `narrow-other-21`, `narrow-practice-1-20`, `-24`, `narrow-practice-2-21`.
- **Room and words for a phone:** a select's chosen text readable; names not squeezed one word per line to make a
  table fit; card padding that leaves the content its width; words that fit a phone ("choose files", not "drop").
  Recommendation; WCAG 3.3.2 for the select. Baseline: `narrow-practice-1-26`, `narrow-practice-2-11`,
  `narrow-other-20`, `narrow-other-22`, `narrow-practice-2-22`.

### 2.8 Accessibility (WCAG 2.1 AA, with #103's WCAG 2.2 additions)
- **Keyboard:** every control reachable in a sensible order; a skip link; menus and disclosures close on Escape and
  when focus leaves; a hidden input is no stray tab stop. Rule: WCAG 2.1.1, 2.4.3, 2.4.1; `PRD.md:256`. Baseline:
  `a11y-other-25`, `a11y-practice-1-09`, `a11y-practice-2-08`, `a11y-other-03`, `a11y-practice-1-07`,
  `a11y-practice-2-07`, `narrow-other-17`, `a11y-practice-1-20`.
- **Focus visible in `--pw-focus`, and never hidden** under the 56 px sticky header or an open menu. Rule:
  `brand.md:40`; WCAG 2.4.7, 2.2's 2.4.11 (AA; #103 names "focus not hidden under the sticky header"). Baseline:
  `a11y-other-03`, `a11y-practice-1-08`, `a11y-practice-2-06`, `narrow-other-08`, `narrow-practice-1-13`,
  `narrow-practice-2-09`.
- **Names contain the visible label.** Rule: WCAG 2.5.3, 4.1.2. Baseline: `a11y-other-04`, `a11y-practice-1-06`.
- **The current page, tab, filter or choice is marked, truly** (`aria-current`, and by more than colour). Rule: WCAG
  1.3.1, 1.4.1. Baseline: `a11y-practice-2-17` (Practice home marked on a support grant's page),
  `narrow-practice-2-23`, `flows-practice-32`, `a11y-practice-2-09`.
- **Structure:** one h1 naming the page and its record; headings that nest; counts not marked as headings; regions
  named as their visible titles; the page title names the record. Rule: WCAG 1.3.1, 2.4.6, 2.4.2; ADR 0056:64 ("a
  region's accessible name carries the same words as its visible label"). Baseline: `a11y-practice-1-14`,
  `a11y-practice-2-12`, `a11y-other-17`, `a11y-practice-1-10`, `-13`, `-27`.
- **Live regions:** `role="alert"` only for an error that needs action; success, progress and loading are `status`;
  a live check does not re-announce while the person types. Rule: WCAG 4.1.3; the cause is Alert's default
  (`packages/ui/src/components/alert.tsx:18`, `role = 'alert'`). Baseline: `a11y-other-16`, `a11y-practice-1-05`,
  `a11y-practice-2-21`, `a11y-practice-1-26`.
- **Tables:** header cells; row headers, so a row's links make sense alone ("Line trace" 32 times). Rule: WCAG 1.3.1,
  2.4.4. Baseline: `a11y-other-10`, `a11y-other-21`, `a11y-practice-1-21`, `-22`, `a11y-practice-2-04`.
- **Contrast** 4.5:1 for text and 3:1 for boundaries and indicators, in both themes (dark advisory). Rule:
  `brand.md:40`; `BRAND.md:154`; WCAG 1.4.3, 1.4.11; ADR 0056:94-95. Baseline: `a11y-practice-2-20`,
  `a11y-practice-1-12`, `a11y-other-22`.
- **Nothing on hover alone** (a full hash, a derivation, a badge's meaning). Rule: WCAG 1.4.13, 1.3.1. Baseline:
  `a11y-other-12`, `a11y-practice-1-25`, `a11y-practice-2-22`, `a11y-practice-1-24`.
- **Anything dragged has a single-pointer way.** Rule: WCAG 2.2 2.5.7 Dragging Movements (AA; #103 adopts WCAG 2.2's
  rules, `combined-report.md:1126`). The upload drop zones (`apps/web/src/components/uploads/uploader.tsx:278-310`)
  pass today only because a Choose files button sits beside them (`narrow-practice-2-22`). With it the checklist
  carries all six of WCAG 2.2's A and AA additions: 2.4.11, 2.5.7, 2.5.8, 3.2.6, 3.3.7 and 3.3.8.
- **Help in the same place on every screen,** and true for that screen. Rule: WCAG 2.2 3.2.6 (A; #103) for the place;
  the content is a baseline class (the finding was about the content). Baseline: `flows-other-06` (should fix).

### 2.9 Flows per role
Walk each role the diff reaches (billing manager, packet approver, practice administrator, the organization's
administrator, the read-only roles, a firm, the console's operators, the screening's prospect).
- **What it sees first:** its work before its setup, and each role's pages where that role looks for them. Rule only
  for the Cases screen: the Cases screen's ruling (combined audit #125, "Put the case list first",
  `combined-report.md:1320-1326`); elsewhere a baseline class; where pages live is a recommendation. (`PRD.md:267`'s
  "Jump to any queue" is the dashboard's own action, not a rule for this.) Baseline: `flows-practice-12`, `-16`,
  `-17`, `-21`, `flows-other-03`, `flows-other-05` (no organization area); at 390 px, the 2.7 ids.
- **The next step is a link or a button; no dead end.** Rule: `PRD.md:256`, `:260`. Baseline, blocking:
  `flows-practice-02` (the payer's answer sent to Uploads), `flows-other-02` (no way back in after a lost password or
  key); also `flows-practice-11`, `-14`, `-15`, `-19`, `-23`, `flows-other-30`.
- **A hand-off keeps its context:** a hand-off to another screen or role carries its record (the case, the cohort, the
  ticket, the screening). Baseline class. Baseline: `flows-other-07` (a support ticket loses its context),
  `flows-other-22` (an audit request arrives without its screening), `flows-practice-36` (a validation request drops
  the cohort), `flows-practice-13` (an actionable line names no case); four should fix. A fix that needs a migration
  (`flows-other-07`, `-22`) goes to Lane A under LANES.md rule 2.
- **A default view opens on data:** never an empty month, or two runs that cannot be compared. Baseline class.
  Baseline: `flows-practice-26` (Compare two runs starts on runs of different months; should fix), `flows-practice-30`
  (the monthly summary starts on an empty month).
- **The second person is told** when a packet waits for approval (baseline class: `PRD.md:278` says only "approve
  (second person)", and `PRD.md:246`'s "in-app notifications" is the nearest rule), and **the drafter is never offered
  Approve** (rule: CLAUDE.md's Never list). Baseline: `flows-practice-03` (blocking), `flows-practice-22`.
- **Where it stands is said at the top** of a long page, with each person's one action (a packet's state; a
  screening's answer and next step before its tables). Baseline class. Baseline: `flows-practice-04`, `flows-other-14`
  (both should fix), `flows-practice-05`, `flows-other-15`, `narrow-practice-1-24`.
- **Nothing a refresh loses;** the practice and the screen kept across another page and a sign-in. Rule: `PRD.md:256`;
  combined audit #48. Baseline: `narrow-practice-2-12`, `flows-other-16`, `flows-other-04`, `flows-other-17`.
- **Notices do not replay** on refresh, Back or a shared link (a `?notice=` parameter). Baseline class (`PRD.md:302`
  puts filters in the URL and says nothing of outcomes). Baseline: `flows-practice-08`, `flows-other-23`,
  `narrow-other-16`, `narrow-practice-1-25`, `narrow-practice-2-18`.
- **Each role gets its own words:** read-only roles are not given the doer's instructions; a note for staff is not shown
  to customers; a screen explains itself to the role that opens it. Baseline class (`PRD.md:260` rules only the
  permission state, under 2.6). Baseline: `flows-practice-18`, `flows-other-19`, `words-practice-43`.
- **Public pages share one frame and link to each other** (and to sign-in). Recommendation (`BRAND.md:120-121` covers
  the app header only). Baseline: `brand-14`, `flows-other-24`.
- **Lists page and filter on the server.** Rule: `PRD.md:256`. Baseline: `flows-practice-24`, `-25`,
  `narrow-practice-2-15`.
- **Rail and page names say what each page does.** Recommendation. Baseline: `flows-other-28`, `flows-practice-17`.

### 2.10 Print, PDF and email
- **Report frame:** covers on Paper, inside pages white, the 16 px mark in the running header, the seal bottom right
  of the cover only when earned. Rule: `brand.md:42-43`; `BRAND.md:140-141`.
- **Amounts in mono in headings and running text.** Rule: ADR 0056:107-109 (`escapeWithFigures`).
- **Full size:** nothing wider than the 672 px content box, no amount or date broken, IDs break as `data-id`; a new
  template joins `print-layout.test.ts`. Rule: ADR 0058:185-198.
- **Packets and the payer's copy** lead with the practice, carry no PaidWhole lockup or name, never earn the seal
  (rule: ADR 0056:113-118; ADR 0058:53-54), print no remittance-key qualifier code (rule:
  `packages/packets/src/payer.ts:9`; ADR 0061:695-697), and the cover says what is asked: amount, claims, dates,
  deadline, contact (recommendation). Baseline: `flows-practice-35`, `words-practice-52`, `words-practice-47`.
- **Tagged PDFs** (structure tree, language, table headers). Recommendation until combined audit #103's tagging lands
  (Lane A's PR 7); a check then. Baseline: `a11y-practice-2-18`.
- **Printing with dark forced** prints light. Advisory (`tokens.css:102-109`). Baseline: `brand-03`.
- **Email:** the lockup's PNG from the static host with the alternative text "PaidWhole", never a typed wordmark;
  hex from `tokens.ts`; a prospect's message without the tagline; no PHI in the body; a digest holds counts and totals
  only. Rule: `BRAND.md:129-139`; ADR 0058:39-51; CLAUDE.md's Never list (no PHI in an email body); `PRD.md:246`.
- **White label:** the firm's name and logo lead; PaidWhole only as the badge, when earned. Rule: `BRAND.md:142-143`.
  (The email item's "a digest holds counts and totals only" is `PRD.md:246`'s acceptance line; the draft keeps both.)

### Defect classes the outline covers (check against the raw list)
Every raw finding id above sits under at least one item. The blocking classes, all covered: values lost after a
refusal (2.5); cents shown as dollars (2.3); one figure, two values (2.3); a raw JSON error page (2.6); hidden columns
with no cue and unreachable scrollers (2.7); dead ends and the approver not told (2.9); a status contradicting the
record (2.3); terms to accept that are not shown (2.4); steps that expire without warning (2.5). The revision added
five classes the review found (a hand-off keeps its context, a default view opens on data, a label names what it
counts, a palette change is the brand owner's, the name not set in the wordmark's face outside the lockup) and put
`flows-other-07`, `-22`, `flows-practice-26`, `-28`, `-29`, `-30` and `-36` under them. Left out on purpose, as single
bugs rather than classes: `flows-other-08`, `-20`, `-26`, `-27`, `flows-practice-27`, `-31` (each a missing feature or
one screen's layout, not a pattern a checklist line would catch better than the next tour). `flows-practice-32` sits
under 2.8 (the current choice marked truly), not here.

## 3. Severity rules

Severity is by harm to the person, not by the size of the fix. The rule column says what backs it.

**Blocking** (the PR does not merge until it is fixed and the reviewer has seen the fix), when the change:
1. makes a person misread money or a status: a wrong or unlabelled figure, cents read as dollars, stages mixed, one
   figure showing two values, "Recovered" not at stage five, the seal or badge unearned, a status word that contradicts
   the record;
2. loses or silently changes what a person entered or chose (a refusal that resets a form, a default swapped in);
3. leaves a person unable to finish the task: a dead end, a raw error page, an action that cannot be reached at 390 px,
   by keyboard or with a screen reader, a step that expires without warning, a next step the role cannot take where it
   is the only one;
4. puts PHI in a URL, file name, email body or error (and goes to the security reviewer too);
5. changes the words of a legal surface without the founder's ruling recorded in the PR;
6. redraws, recolours, splits or animates the mark, or sets the name in the wordmark's style outside the lockup
   (`brand.md:17-22`, `:34-35`; `BRAND.md:53-55`). The name in running text and in page titles is copy (ADR
   0056:132-135), and the lockup's own live text is the brand (`BRAND.md:55`), so neither meets this test. Blocking here
   is this design's reading, not a written severity: the word mark and the composite logo are the registrations the
   brand relies on (`BRAND.md:161-164`), so an altered mark is read as a legal harm, not a look. The co-founder may
   change the level. Other breaches of `brand.md` (white on a status fill, brass text, a figure outside mono) are should
   fix, or blocking only when they meet a test above (brass text at 2.6:1 that a person must read to act fails test 3).

**Should fix** (fixed in the PR's fix round, or deferred with where it is tracked, as the PR template's resolution
column asks): any other harm to a task, a role, a width or a theme in use; any other broken written rule; any other
WCAG 2.1 A or AA failure, or WCAG 2.2 A or AA failure from #103's additions, that the change brings.

**Polish:** finish and consistency with no harm to a task; fixed in the PR when it sits in a file the PR changes
("improve as you go"), otherwise listed for the queue.

**Limits:** a recommendation alone never blocks (taste never outranks a written rule; the brief's "Not in it"). A
baseline class blocks only when it meets a harm test above, and otherwise is should fix (a harm to a task) or polish,
never blocking by taste. Dark findings are advisory and never blocking while no user can switch dark on (ADR
0056:127-130); a PR that offers dark is judged in dark as in light. A defect the PR did not cause keeps its baseline
severity and goes in the list apart, with each open baseline finding on its screens marked fixed, still open or worse;
it becomes the PR's finding when the PR touches its cause (fix it there) or makes it worse (at least should fix,
blocking if it meets a test above). A change that undoes an earlier fix takes the original finding's severity.

## 4. The file's form

### Frontmatter
`security-reviewer.md`'s six keys in its order (`security-reviewer.md:1-8`):

```
---
name: ux-brand-reviewer
description: Reviews every change a person sees (screens, words, figures, PDFs, email) against the brand, the product's words, WCAG 2.1 AA with WCAG 2.2's additions and the UX baseline review's defect classes, from before and after screenshots at 1280 and 390 px. Use on any change to the words, figures, markup or style of a screen, PDF or email, at least every file tools/brand-copy reads (scan.ts COPY_ROOTS and COPY_FILES), packages/brand/src and packages/ui/src, and any other file whose strings reach a screen, such as packages/db/src/authz/permissions.ts.
tools: Read, Grep, Glob, Bash
disallowedTools: Edit, Write
model: <the value at security-reviewer.md:6, copied exactly>
maxTurns: 30
---
```

- **`model:`** follows the other reviewer files (Q4, the co-founder, 2026-10-25 ~21:05 UTC; `lanes/lane-b.md:202`).
  The four files do not agree: `edi-reviewer.md:6` and `qa-fixture-builder.md:5` carry one value,
  `security-reviewer.md:6` and `payment-engine-reviewer.md:6` another. This file takes the second, because the brief
  names the security and payment-engine files as its form ("Then" item 1) and those two agree, and because this is a
  reviewer of the same kind as the security reviewer. The builder copies the value from `security-reviewer.md:6`. This
  design does not write it out (LANES.md rule 12: no model identifier in an artifact beyond the ruled key).
- **`tools`, `disallowedTools`:** as `security-reviewer.md:4-5`. Read opens PNGs, so no other tool is needed; Bash
  runs `git diff` and `git show`. It writes nothing.
- **`maxTurns: 30`:** `security-reviewer.md` has 20 and `payment-engine-reviewer.md` 25; this reviewer reads pictures
  as well as code (for a typical PR, three to six routes at three shots each, before and after, plus states, given as
  window-height tiles of the change), so it gets a little more. The reviews run on the default workflow agent given
  this file (the brief's "Then" item 1), where the key does not bind; it binds only if a session runs the file as a
  custom agent type.

### Length: at most 100 lines with the frontmatter (the draft is 99; the others are 10 to 41)
- Why longer than `security-reviewer.md`'s 41: that file covers one discipline and spends 28 lines on one artifact type
  (function diffs). This one covers seven areas (brand and type, money and words, forms and states, the phone,
  accessibility, flows, print and email) and must carry its input protocol and severity rules, which the others leave
  to their descriptions. At four to ten lines per group it is no denser than the security file.
- Why 100 and not 90: the first draft held 90 by cutting recurring classes the outline carried (the review's finding
  2). Putting them back as one short clause each, and labelling each clause, needed the room. The revision paid for part
  of it by cutting what the file restated or CI holds: the type scale's numbers (now "one type scale and tile style",
  cited), hex and "dark uses semantic tokens" (the hex check holds both), the screening's forbidden words (the copy
  lint), and the input details the session's own prompt carries (where the shots come from).
- Why not longer: it points to the rules (file:line) and never restates them; it carries no finding ids; and it leaves
  to CI what CI holds. A check that does not fit one clause is a sign it belongs in the rule it cites.
- Why not split it: the ruling is one UX and brand review per PR as one of its two adversarial reviews, so one agent
  must hold all of it; a second file would be one more thing a session forgets to give it.
- The builder cuts words, not checks, to stay at or under 100. A check is cut only with its class's evidence and a line
  in the PR description saying why.

### Sections (in order; no `#` headings, as in the other four files)
1. The opening paragraph: what it receives (named by what it is, not where it comes from, so either lane can supply
   it), in window-height tiles; match every changed route to its shots ("not seen" otherwise, and "not seen, by
   sample" after a shared change); read the code, and the words from the code where a picture is too small; cites are
   as of the commit the builder re-opened them at, a moved rule is found by its words; the three labels.
2. What CI holds, and where to look instead (section 2.0), with CO-11's words held only in the files the lint reads.
3. Ten bullets with bold lead-ins, one per outline section, ordered by harm (section 2's lead): Money and status,
   Forms and errors, States, Flows, At 390 px, Accessibility, Words, Brand, Type and marks, Print, PDF and email. Each
   clause carries its own label in parentheses right after it: its rule, "(recommendation)" or "(baseline)".
4. Severity (section 3, condensed), with "a baseline class blocks only by a harm test".
5. The report's form, with the open baseline findings marked fixed, still open or worse, shot ids and paths in
   backticks, ending "Never declare a screen accessible or WCAG conformant. Do not edit files." (the security file's
   closing form).

### Cites
`.claude/rules/brand.md:<line>` (later in the same bullet `brand.md:<line>`), `BRAND.md:<line>`, `ADR 0056:<line>`,
`PRD.md:<line>`, `CLAUDE.md rule <n>` or "CLAUDE.md's Never list" (its rules are numbered and its lines move), WCAG by
criterion number ("WCAG 2.4.11"). In the file's new order the first `brand.md` cite falls in Money and status, so that
one carries the full path. The builder re-opens every cite at the worktree's head and writes that commit in place of
`<commit>` ("Cites are as of <commit>"); the fresh-clone verification re-opens them at the merge head, since a merge
from `claude/build-platform` can move a line, and updates the commit if a line moved.

### The draft (the builder starts from this; 99 lines with the frontmatter, so any added word costs one elsewhere)
The frontmatter above, then:

```
Review a pull request that changes what a person sees. You get the diff against the base; before and after shots of each
changed screen and state, in window-height tiles, at 1280 and 390 px light and 1280 px dark, with their manifest
entries; the rendered pages of a changed PDF or email; and the baseline review's open findings on those screens. A
changed route or template with no shot is "not seen", never passed; after a shared component, token or shell change, so
is a route outside the session's sample ("not seen, by sample"). Read the code behind each change, and its words where a
picture is too small. Cites are as of <commit>; find a moved rule by its words. A check cites its rule, or says
"(recommendation)" where the rules are silent, or "(baseline)": a defect class the baseline found that no rule states.

CI holds hex colours, font hosts, CO-11's words in the files the copy lint reads (tools/brand-copy/scan.ts:51-77), axe's
WCAG 2.1 rules where journeys go (apps/web/e2e/a11y.ts:12) and the brand and print baselines. Look where they cannot:
other states, open menus, phones, other words, figures, flows.

- **Money and status.** Amounts from integer cents through `<Money/>` or formatUsd; nobody reads or types cents as
  dollars (CLAUDE.md rule 2; PRD.md:256). Expected, paid and short, together and in that order, at 390 px too
  (.claude/rules/brand.md:36-37). A figure carries its stage label (PRD.md:260); its period, one stage per total, one
  value on every screen and a count of the same lines beside it (baseline). "Recovered" is stage five, posted or
  deposited (brand.md:37-38); "Verified" is the seal's alone (ADR 0056:92-94). An unpriced line shows its reason in
  words, never a price (CLAUDE.md's unpriced reasons). A state's words match the record (baseline). A direction is said
  once in words, a difference column says which way it runs, and one date and unit style holds on a screen (baseline).
- **Forms and errors.** A refusal keeps every value as typed, files too, and never swaps in a default (WCAG 3.3.7,
  3.3.1). Each error is text under its control, named by its visible label, tied by aria-describedby, marked on every
  kind of field and not by colour alone, with a summary above the fields (3.3.1, 1.3.1, 1.4.1). Related controls sit in
  a fieldset with a legend, and a group's error is tied to it (1.3.1, 3.3.1). Focus moves to the error or the result,
  which is announced, and is never dropped to the page (2.4.3, 4.1.3). Formats sit on the field, not in a placeholder
  (3.3.2). Codes take paste; timed steps warn first (3.3.8, 2.2.1). A destructive action confirms with its consequence
  (PRD.md:302); a choice that records a fact starts unanswered (baseline).
- **States** (PRD.md:260; packages/ui/src/states). Empty: the next step and a control that takes it, a filtered list's
  filter and how to clear it, and no vacuous or false fact such as "0 of 0 lines" (baseline). Loading: the mark still
  (BRAND.md:127-128), the frame kept and what loads said (baseline). Error: a next step in the app's frame, never raw
  JSON (PRD.md:256). Permission: what the role cannot do (PRD.md:260), a heading naming the page (WCAG 2.4.6), who can
  and a way back (baseline). Not found keeps the shell; work in progress updates itself (recommendations).
- **Flows.** Walk each role the diff reaches. Where it stands, and each person's one action, at the top of a long page;
  a role's work before its setup (baseline; for Cases, combined audit #125). The next step is a link or a button, never
  a dead end (PRD.md:256, :260). A hand-off to another screen or role carries its record: the case, cohort, ticket or
  screening (baseline). A default view opens on data, never an empty month or two runs that cannot compare (baseline).
  Nothing a refresh loses (PRD.md:256); the practice and screen kept across a sign-in (combined audit #48). Notices do
  not return on refresh or Back (baseline). The second person is told when a packet waits (baseline); the drafter is
  never offered Approve (CLAUDE.md's Never list). Read-only roles get their own words (baseline). Lists page and filter
  on the server (PRD.md:256). Public pages share one frame and link to each other (recommendation).
- **At 390 px.** No page scrolls sideways (ADR 0056:51-53; WCAG 1.4.10). A wide table scrolls in ScrollTable with a
  visible cue (recommendation), or reflows, with a row's action beside its row. IDs and hashes wrap without widening
  anything, dates whole (recommendation). Targets at least 24 px (2.5.8). Fields at 16 px so the phone does not zoom
  (recommendation; BRAND.md:93), never by blocking zoom (1.4.4). The open practice's name is readable (baseline).
- **Accessibility.** Every control reachable by keyboard in order, a skip link, menus that close on Escape and when
  focus leaves (2.1.1, 2.4.3, 2.4.1); focus visible in --pw-focus, never under the sticky header or a menu (brand.md:40;
  2.4.7, 2.4.11). Names contain the visible label (2.5.3). The current page or choice marked truly, by more than colour
  or the brass line (1.3.1, 1.4.1, 1.4.11). One h1 and a page title naming the page and its record, nested headings,
  regions named as their titles (1.3.1, 2.4.6, 2.4.2). role="alert" only for an error that needs action; success,
  progress and loading are status (4.1.3; Alert's default is alert). Tables have header cells and row headers (1.3.1,
  2.4.4). Text 4.5:1 and boundaries 3:1 in both themes (BRAND.md:154; 1.4.3, 1.4.11). No hover-only content (1.4.13).
  Anything dragged has a single-pointer way (2.5.7). Help in one place (3.2.6) and true for that screen (baseline).
- **Words.** Plain, exact, warm, no hype, never a projected dollar presented as recovered (BRAND.md:23-24); the reader's
  need first, addressed to them (recommendation); a link says where it goes (2.4.4). counted() for a count's noun,
  labelOf() for a code's label (apps/web/src/lib/copy/words.ts:8, :27). No schema key, raw code, UUID, segment name or
  validator text on screen (baseline; 3.3.1 in an error), unless a recorded decision shows it (ADR 0061's remittance
  keys: then a recommendation). A label names exactly what its value or column counts (baseline). No build words, and
  one name per thing across screens and the payer's copy (recommendations). Every error says what happened and a next
  step the reader's role can take, true to where it points (PRD.md:256, :260). Claim nothing the product cannot prove
  (baseline). Name who did a thing exactly (recommendation). A legal surface's words change only with the founder's
  sign-off, recorded in the PR (docs/product/legal-surfaces.md:7-8).
- **Brand.** Colours only from tokens, no Tailwind palette colour or rgb() (brand.md:13-16); a palette change is the
  brand owner's (ADR 0058:61-62). Status colours mark data only, as labelled text on its tint; a failure is danger, a
  system state a neutral badge, an investigatory line unpriced, never Short (brand.md:26-28; ADR 0056:70-95). Brass is
  the keystone, seals and the one rail underline, never text, fill or ground (brand.md:32-33). Notice kinds differ by
  more than colour (1.4.1) and look alike everywhere; danger style on actions follows one rule (recommendations).
- **Type and marks.** Every money figure, code, unit count and rate in Plex Mono, tabular, at 400 or 500, in sentences
  and buttons too (brand.md:36; BRAND.md:94; ADR 0056:50-51). One type scale and tile style (ADR 0056:47-50;
  BRAND.md:125-126). The mark and lockup only through their components, never animated (brand.md:17-22, :34-35); no
  title sets the name in the wordmark's face outside the lockup (BRAND.md:53-55), though the name in running text and
  page titles is copy (ADR 0056:132-135). One empty-state mark per screen (ADR 0056:66-68). The seal and badge only when
  reconciledToCash, with the definition (brand.md:29-31).
- **Print, PDF and email.** Report covers on Paper, inside pages white with the 16 px mark (brand.md:42-43), amounts in
  mono (ADR 0056:107-109), nothing wider than the page or shrunk (ADR 0058:185-198). A packet and the payer's copy lead
  with the practice, carry no PaidWhole mark (ADR 0056:113-118) or qualifier code (packages/packets/src/payer.ts:9) and
  say what is asked (recommendation). A white label leads with the firm; PaidWhole shows only as the earned badge
  (BRAND.md:142-143). Email: the lockup's PNG, no typed wordmark, tokens.ts hex, no tagline for a prospect
  (BRAND.md:129-139), no PHI (CLAUDE.md's Never list); a digest holds counts and totals only (PRD.md:246).

Severity. Blocking when the change makes a person misread money or a status, loses or silently changes what they
entered, or leaves them unable to finish the task at either width, by keyboard or with a screen reader; or puts PHI in a
URL, file name or email, changes a legal surface without the founder's sign-off, shows the seal or badge unearned, or
redraws, recolours or animates the mark or sets the name in the wordmark's style outside the lockup. Should fix: any
other harm, broken written rule or WCAG A or AA failure. Polish: finish and consistency. A recommendation alone never
blocks, a baseline class blocks only by a harm test, and dark not while users cannot switch it on (ADR 0056:127-130).

List findings, most severe first, with severity, screen (route and shot id), evidence (file:line at the head; what the
shot shows), rule (file:line, WCAG criterion, recommendation or baseline) and one best fix, with exact words where words
are the fix and whether it needs a migration or a freeze exception. Then, apart, each open baseline finding on these
screens (fixed, still open or worse) and any other defect the change did not cause: each keeps its severity unless the
change touches its cause or worsens it. Then the routes not seen. Wrap shot ids and paths in backticks. Or say "no
findings", with what you checked. Never declare a screen accessible or WCAG conformant. Do not edit files.
```

## 5. What the PR changes

1. **New:** `.claude/agents/ux-brand-reviewer.md` (section 4).
2. **Changed:** `.github/pull_request_template.md:41-44`, the "Reviewer agents' findings" comment, so every PR
   description in both lanes asks for the new reviewer (D5). Today it names only the payment-engine, security and EDI
   agents (PRD 17). The comment becomes:

   ```
   <!-- The payment-engine, security and EDI reviewer agents run before anything that touches money, tenancy or parsing
   merges (PRD 17), and the UX and brand reviewer (.claude/agents/ux-brand-reviewer.md) before anything that changes
   what a person sees, with before and after screenshots at 1280 and 390 px (the founder's ruling of 2026-10-25,
   through the co-founder). Name the agents that ran, one row per finding, and how each was resolved: fixed (with the
   commit), not a defect (with why), or deferred (with where it is tracked). "Not run" with the reason when the change
   touches none of those. -->
   ```

   The new reviewer's source is named, as PRD 17 is for the other three, so a reader of a PR description can find where
   it comes from; `LANES.md` rule 1 does not carry the ruling yet. Open PR #48 (`co-001/ci-deps`) changes this
   template's lines 1-8 only, a different hunk; whichever merges second keeps both (LANES.md rule 6). #42 changes
   neither file.

**Checked, and left unchanged:**
- **No code enumerates `.claude/agents`.** No hook (`.claude/settings.json`, `.claude/hooks/*`), test or tool lists the
  agent files (`grep -rn "claude/agents\|-reviewer"` over the tree). `docs/product/milestone-prompts.md:3` names the
  directory only; `packages/db/functions/README.md:67`, ADR 0068:228, ADR 0064:213 and `reconciliation-001.md:40`,
  `:223`, `:253`, `:474` name the security reviewer or qa-fixture-builder for their own topics.
- **The change-management policy** (`docs/policies/change-management.md:65-67`, rule 1, the part the quarterly review
  checks) names the three PRD 17 reviewers: "the reviewer agents (payment engine, security, EDI) run before anything
  that touches money, tenancy or parsing merges". It is the security official's text (its owner; status "draft,
  awaiting the security official's approval"), and a new reviewer there is a new commitment the quarterly review
  checks, so it is left as it is and goes to open point 6. Open PR #48 rewrites that same paragraph (its hunk at
  `:62-67`), so any later edit of it merges after #48 and keeps #48's hunk (LANES.md rule 6).
- **No runbook names the reviewers** (`docs/runbooks/*`: billing, ci, deploy-and-rollback, github-governance,
  incident-response, key-rotation, restore-drill, screening-capacity, support-mail). No pointer is needed there.
- **`docs/product/PRD.md:721`** (section 17: "run the reviewer subagents (payment engine, security, EDI)") is the
  founder's product document, left as it is; the ruling is recorded in `LANES.md` and `lanes/lane-b.md`, and the
  template now carries it into every PR (open point 6).
- **`CLAUDE.md`** is the rules every session runs under and is the founder's (CODEOWNERS `/CLAUDE.md`); not touched.
- **`.github/CODEOWNERS`:** `/.claude/` and `/.github/` are already the founder's (and so is every path), so
  `tools/test/codeowners.test.ts` passes with the new file.
- **No ADR:** the four existing reviewer files have none; the decision is recorded as rulings (`LANES.md`,
  `lanes/lane-b.md`). No test-matrix row, no synth id.
- **Outside the PR (the session's, on `claude/build-ops`):** the Claims row and log; after the merge, the "Handed to
  Lane A" entry (`LANES.md:198`) says the file has merged and that the tour's README now says how another lane runs it,
  so Lane A's rule 1 can cite both. Lane B does not edit LANES.md's rules.
- **Lane B's step for the tour, in this PR's session and before the merge** (the review's finding 7; the tool is Lane
  B's, so making it run elsewhere is Lane B's step), in `tools/lane-b-screen-tour` on `claude/build-ops`:
  - a README section "From another lane": the prerequisites the tool assumes today (a Postgres 18 on 5433, README:18
    and :80; the lock at `/tmp/laneb-heavy.lock`, README:20; `TOUR_DIR`) and one check command that says what is
    missing;
  - "any session, in either lane, may add a new route's `cap(...)` calls and push them with its review" (README:84-85
    says how);
  - a small tiling step (improvement, taken): a script beside `batches.py` that cuts a full-page shot into
    window-height tiles (1280x800, 390x844) and names each tile by its shot id and offset, so a session gives the
    reviewer readable pictures without cutting them by hand.

No product code. No migration. No change to the engine, the ledger, the content pipeline or CI.

## 6. The suite

Documentation-only, per Q4: `pnpm typecheck`, `pnpm lint`, `pnpm lint:copy`, `pnpm test` (unit), once, on the head of
the fix round. What each reads of this PR:
- **`pnpm lint:copy`** reads `COPY_ROOTS` and `COPY_FILES` (`tools/brand-copy/scan.ts:51`, `:69`): neither changed file.
  It is run to show the tree stays green.
- **`pnpm lint`** (ESLint) and **`pnpm typecheck`** read no Markdown.
- **`pnpm test`** does read both files:
  - `tools/test/required-checks.test.ts` reads every tracked `*.md`: no paragraph may name three or more of the four
    required checks outside the markers, and no tracked file may hold a stale check name
    (`tools/required-checks.ts:127`). Neither file names a required check; the builder confirms.
  - `tools/fixture-check` (run by `pnpm test` and as `pnpm check:fixtures` in CI and the pre-push hook) searches every
    tracked text file for an X12 interchange header: the files hold none.
  - `tools/test/codeowners.test.ts`: every tracked file owned by the founder; the new file is under `/.claude/`.
  - `tools/brand-colors` and `tools/brand-fonts` read `apps`, `packages`, `tools`, `infra` and root files only
    (`tools/brand-colors/scan.ts:29`, `:74-78`): not `.claude` or `.github`.
- **Also, by hand (light):** the frontmatter's keys equal `security-reviewer.md`'s in order (compare the key lists
  between the `---` lines); the `description:` holds no colon followed by a space, which would end the YAML scalar
  (the draft holds none); the only model identifier in the diff is the `model:` value; the file is at most 100 lines
  and 120 characters wide, the `description:` line apart (it is one YAML line, as in the other four files, where it
  runs past 120 too); no bare shot id followed by a comma (gitleaks; wrap any id in backticks).
- **CI** still runs everything on the PR (`ci.yml` has no path filter); the screening-capacity gate's changes job
  finds no watched path (`tools/screening-capacity/watched-paths.txt` lists no `.claude` or template path) and
  measures nothing; the mutation job's affected set is empty.

## Decisions (each the recommended option, taken under "improve as you go" and Q3)
- **D1, the trigger is defined by its effect, with a floor that cannot go stale.** The brief's list names where screens
  live; its principle, and the 21:10 ruling's words, are "every pull request that changes something a person sees".
  The first draft widened the list to `packages/ui/src`, `packages/brand/src` and the words and figures
  `apps/web/src/lib` returns, but still read as the whole list, and the review found it left out files whose words a
  person reads (`packages/triage/src`, `packages/packets/src`, all of `apps/worker/src/screening`, `stages.ts`,
  `calendar.ts`, `location.ts`, and the three files `words-other-23` found). The floor is now every file the copy lint
  reads, by its own lists, plus `packages/brand/src` and those three files, so it grows when the lint does. The
  baseline's two largest blocking classes came from `apps/web/src/lib` and `packages/ui` (`ActionForm` with
  `lib/http/next.ts`; `lib/routes/settings.ts` returning cents text). A PR there with no visible change keeps its two
  reviews, as the brief says.
- **D2, the checklist does not repeat CI.** It names what CI holds once and spends its lines on what checks miss; the
  baseline showed the misses (2.0).
- **D3, file:line in the checklist, finding ids only in this design.** The builder's brief requires file:line; the
  file says the lines are as of the commit at which the builder re-opened them (the fresh-clone check updates it if a
  merge moved a line, section 4 "Cites") and to find a moved rule by its words. Raw ids would go stale when the
  synthesis renumbers them, and the reviewer is handed the open findings for its screens anyway.
- **D4, harm decides severity; a recommendation alone never blocks; a baseline class blocks only by a harm test.**
  This keeps taste out of the gate (the brief's "Not in it") while every baseline blocking finding still meets a
  blocking test: the three labels (section 2's lead) let a class no rule states, such as `flows-other-11`, keep its
  blocking level by harm without a mis-cited rule.
- **D5, the PR template names the reviewer.** Every PR in both lanes fills the template; without the line it tells
  sessions to run three reviewers and not this one.
- **D6, `maxTurns: 30`** (section 4).
- **D7, the file orders its groups by harm,** so a pass that runs short of turns has done the blocking classes first
  (section 2's lead).
- **D8, one review pass is made possible by its inputs:** window-height tiles in place of whole full-page shots, a
  named sample for a shared component, token or shell change ("not seen, by sample" for the rest), and the words read
  from the code where a picture is too small (section 1).
- **D9, the file names what it needs, not where it comes from,** and Lane B makes its tour usable from another lane
  (section 5, Lane B's step), so the review works the same in both lanes.

## Open points
1. **The synthesis did not exist at design time nor at the revision** (last checked 2026-10-26 ~09:00 UTC, locally and
   on `origin/claude/build-ops` at 95aecf9). The outline uses raw ids. If `designs/lane-b-ux-review.md` lands before
   the build, the builder re-checks the outline against its ranked findings and adds any defect class it names that the
   outline lacks; the checklist file itself carries no ids, so it does not go stale when UX ids replace raw ones.
2. **16 px form fields:** `BRAND.md:93` already gives body and UI text 16 ("16/24 body; 14 in dense tables"), so a
   16 px field follows the brand; only ADR 0056:49-50's "tables and dense controls 14" makes it doubtful, and it does
   not define "dense controls". Marked a recommendation with `BRAND.md:93` beside it. The fixing PR (a visible change,
   which the co-founder's ruling of 2026-10-25 ~21:34 UTC lets it take) need only define "dense controls" in ADR 0056
   (desktop tables and their inline controls, not form fields), so the checklist can then cite a rule.
3. **The widened trigger (D1)** runs the tour on a few more PRs (`TOUR_ONLY` on the changed routes, base and head:
   about two builds, two populates and a short capture under the heavy lock; a shared change takes the sample of
   section 1, not all 857 shots). Reported to the co-founder; he may narrow it.
4. **Dark is advisory** until a theme setting ships (`brand-04` recommends "Match my device" by default, with Light and
   Dark). When a PR offers dark, the checklist's own words make dark findings full severity; no edit is needed then.
5. **Tagged PDFs** stay a recommendation until combined audit #103's tagging lands in Lane A's PR 7, so the draft leaves
   them out to stay within 100 lines; that PR should add "PDFs tagged, with language and table headers" to the print
   bullet (a few words).
6. **PRD 17 (`PRD.md:721`) and the change-management policy (`docs/policies/change-management.md:65-67`)** still name
   three reviewer agents. The PRD is the founder's, and the policy is the security official's (a new reviewer there is
   a commitment the quarterly review checks); both go to the founder through the co-founder, who may fold the ruling
   in or leave them. Any edit of the policy merges after #48 and keeps #48's hunk (LANES.md rule 6). Not this PR.
7. **The tour tool is Lane B's, so making it run from another lane is Lane B's item** (`tools/lane-b-screen-tour` on
   `claude/build-ops`; today it needs a Postgres 18 on 5433, `/opt/pg18`, `/root/pgdata18` and the heavy lock,
   README:18, :20, :80, and Lane A is the founder's own sessions on another account, `LANES.md:4`). This PR's session
   writes the README's "From another lane" section, the new-route rule and the tiling step before the merge (section
   5), and the "Handed to Lane A" update says so. Until a Lane A session can run it, the checklist's "not seen" rule
   keeps the review honest.
8. **Keeping the checklist current:** each milestone re-tour (the brief's "Then" item 3) should add any new defect
   class to this file and refresh its cites, in its own small PR.
9. **`maxTurns`** does not bind when the file is handed to a default workflow agent, which is how reviews run.

## Review dispositions
The review (`designs/lane-b-ux-brand-reviewer-review.md`) raised 19 points. Each was verified at 4d99df8 (or in the ops
file it names) before it was settled. All 19 are applied; none is rejected.
1. **Trigger leaves out shown words (blocking): applied.** Section 1 and D1 define the trigger by its effect, with a
   floor of the copy lint's own lists (`scan.ts:51-61`, `:69-77`), `packages/brand/src` and the three `words-other-23`
   files; 2.0 and the draft's CI paragraph limit CO-11's words to the files the lint reads. The review's `description:`
   text was reworded ("..., at least every file ...", not "...: at least"), since a colon and a space would end the YAML
   scalar.
2. **Draft drops classes; three missing (blocking): applied.** Every listed class is back in the draft as one labelled
   clause; the three new classes (a hand-off keeps its context, a default view opens on data, a palette change is the
   brand owner's) are in 2.9 and 2.1; the type scale's numbers became one cited clause; the cap is 100 (the draft is
   99) and section 4 says why; the left-out list moved its seven ids under checks.
3. **Two labels are not enough (should fix): applied.** A third label, "baseline", in section 2's lead, the draft's
   first paragraph and the severity limits ("a baseline class blocks only by a harm test"); used on each clause the
   review names.
4. **Cites that do not say it (should fix): applied.** `PRD.md:248`, `:267`, `:278` and `:246`, the notice kinds,
   `brand-16`, the legal surfaces (`legal-surfaces.md:7-8`; `LANES.md:224`) and the qualifier code (`payer.ts:9`) now
   cite the line that says them or carry a label; #125 is cited as the Cases screen's ruling only. WCAG 2.5.3 was also
   taken off the open practice's name (truncation), where the review shows it does not apply.
5. **Trailing cites cover recommendations (should fix): applied.** Each partly ruled clause in the draft carries its
   own label right after it (the reader's need, the unanswered choice, loading, permission, role words, the cover).
6. **One pass cannot be done as designed (should fix): applied.** Section 1 adds the sample for a shared change and the
   window-height tiles; the file's groups run by harm (section 2's lead, D7); the draft reads words from the code where
   a picture is too small. Improvement taken: a tiling script in the tour (section 5), so no session cuts tiles by hand.
7. **Lane A cannot use it as written (should fix): applied.** The draft names what it needs, not where it comes from;
   section 5 makes the tour's "From another lane" README section, the new-route rule and the tiling step Lane B's step
   before the merge; open point 7 is Lane B's item; the "Handed to Lane A" update notes the README.
8. **Report drops open baseline findings (should fix): applied.** The report, the severity limits and the draft list
   each open baseline finding on the screens as fixed, still open or worse, and one whose cause the change touches as
   the change's own (`lanes/lane-b.md:700`).
9. **Change-management policy missed (should fix): applied.** Added to "Checked, and left unchanged"
   (`change-management.md:65-67`, the security official's text) and to open point 6 beside `PRD.md:721`, with #48's hunk
   kept (LANES.md rule 6).
10. **"Never retyped as live text" (should fix): applied.** 2.2's wordmark item and blocking test 6 now say "sets the
    name in the wordmark's style outside the lockup"; the lockup's live text (`BRAND.md:55`) and the name in copy (ADR
    0056:132-135) are not findings; test 6's level is marked this design's reading, which the co-founder may change.
11. **The model value (nit): applied.** Section 4 says the four files split two and two and why this file takes the
    security and payment-engine files' value; no value is written.
12. **WCAG 2.5.7 missing (nit): applied.** In 2.8 and the draft's Accessibility bullet; all six 2.2 additions are now
    carried.
13. **Remittance keys shown on purpose (nit): applied.** 2.4 and the draft: a code shown by a recorded decision (ADR
    0061's remittance keys) is a recommendation, never a broken rule.
14. **Left-out list contradicts itself (nit): applied.** `flows-practice-32` stays under 2.8 only.
15. **16 px fields have a written rule (nit): applied.** `BRAND.md:93` cited beside the recommendation in 2.7 and the
    draft; open point 2 now asks only that "dense controls" be defined.
16. **The commit the cites were checked at (nit): applied.** The draft says "Cites are as of <commit>", the commit the
    builder re-opens them at; section 4 "Cites" and D3 say the fresh-clone check updates it.
17. **Backticks in the report (nit): applied.** Section 1 and the draft's report ask for shot ids and paths in
    backticks.
18. **One of two reviews can crowd out a PRD 17 reviewer (nit): applied.** Section 1: it adds to, and never takes the
    place of, a PRD 17 reviewer the change also needs (`HANDOFF.md:109`; `security-reviewer.md:3`).
19. **The template cites no source (nit): applied.** The new comment names "the founder's ruling of 2026-10-25, through
    the co-founder" (section 5).

The synthesis `designs/lane-b-ux-review.md` still did not exist at this revision (open point 1), so no ranked finding
was re-checked against the outline; the builder does that if it lands first.
