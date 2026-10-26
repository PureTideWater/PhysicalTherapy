# PR #55 review 1: brand and copy (`co-001/ux-brand-reviewer`)

*Lane B, 2026-10-26. Adversarial review 1 of pull request #55, head eea716d (draft, into `claude/build-platform`), in
the worktree `/home/user/ux-brand-reviewer`. Every file:line is at eea716d, which for every cited file is the same as
4d99df8, unless it names an ops file. Synthetic data only.*

**Read.** `.claude/agents/ux-brand-reviewer.md` (99 lines) and the template's diff; the design and its review; the
brief ("What it judges against", "Then"); `.claude/rules/brand.md`, `docs/brand/BRAND.md`, `packages/brand/README.md`;
ADR 0056 and 0058 whole; CO-11 (`docs/product/change-order-001.md:95-97`); `apps/web/src/lib/copy/words.ts`;
`tools/brand-copy/scan.ts`; `PRD.md:244-302`; `docs/product/legal-surfaces.md`; `docs/product/unpriced-reasons.md`;
`LANES.md` (rules, "Handed to Lane A", Delegations) and `HANDOFF.md:89-94` on `claude/build-ops`; combined audit #48,
#102 and #125; the raw findings that the checklist's clauses come from. Every file:line the checklist cites was opened.

**The synthesis** `designs/lane-b-ux-review.md` does not exist: not in `/home/user/ops` (4056f38) and not on
`origin/claude/build-ops` (66c8dd7, 09:14 UTC; the contents API answers 404). So this review uses the raw list.

**What holds.** The frontmatter has `security-reviewer.md`'s six keys in its order, and the `model:` line is the same as
`security-reviewer.md:6`. No other model identifier is in the diff. The `description:` has no colon and space after
its key. These cites say what the checklist says they do: `scan.ts:51-77`, `a11y.ts:12`, `words.ts:8` and `:27`,
`PRD.md:246`, `:256` (cents and locale, refresh, server lists), `:260` (states, stage label), ADR 0056:51-53, :66-68,
:70-95, :93-94, :108-109, :127-130, ADR 0058:61-62, :185-198, `payer.ts:9`, `BRAND.md:93`, `:94`, `:125-128`,
`:129-139`, `:142-143`, `brand.md:13-16`, `:26-31`, `:40`, `:42-43`, `packages/ui/src/states`, `ScrollTable`,
`<Money/>`, `formatUsd` and `Alert`'s `role = 'alert'`. No cited line has moved on `origin/claude/build-platform`
(7ef421b): of the cited files, only `apps/web/src/components/remittances/display.tsx` changed, and no line of it is
cited. The severity levels are the brief's three. The file's own words have no hype.

**Findings: 2 blocking, 10 should fix, 9 nits.** The file has one line left under its 100-line cap, so finding 9's fix
also frees lines for the others.

## Blocking

### 1. The wordmark check blocks on a polish finding and an open brand decision, and its words flag every page title that names the product

**Evidence.**
- The check is at line 77: "no title sets the name in the wordmark's face outside the lockup (`BRAND.md:53-55`)". The
  blocking test is at line 90: "sets the name in the wordmark's style outside the lockup".
- `BRAND.md:53-55` describes the wordmark: Schibsted Grotesk 700 at -0.03em, "never set in another face, weight or
  tracking". It says nothing about page titles.
- The only finding of this class is `brand-13` (raw-findings.md:978-987). Its Flags line says **polish**, and its note
  says: "Open brand decision: whether a page title may be the bare brand name. Recommended: no." In `brand-16`'s notes
  this is the brand lens's decision (16), and the brief sends brand decisions to the co-founder's report (brief:82).
- The design says so itself: "Blocking here is this design's reading, not a written severity ... The co-founder may
  change the level" (design:486-489). The file does not carry that caveat, and no ruling has changed the level.
- The checklist's own limits say "a baseline class blocks only by a harm test" and "a recommendation alone never
  blocks" (line 92). The brief's "Not in it" says "Taste never outranks the brand's written rules" (brief:86-87). Test
  6 meets no harm test.
- "The wordmark's face" is the display face. Every h1 is set in it: `apps/web/src/app/brand.css:15-18` gives h1 to h3
  `--pw-font-display` and its tracking. So the words also cover `apps/web/src/app/terms/page.tsx:28` ("PaidWhole terms
  of use"), `status/page.tsx:24` ("PaidWhole service status") and `request-audit/page.tsx:31` ("Request a PaidWhole
  contract-payment audit"). Those are the pages ADR 0056:132-135 names as carrying the name, in the type scale ADR
  0056:48-50 requires. The exception "the name in ... page titles is copy" does not save them: ADR 0056:133's "page
  titles" are the document titles (`%s | PaidWhole`), not the h1s.
- So the review of a Lane A PR that touches the terms page could block it on its title.

**Fix.**
- Take "or sets the name in the wordmark's style outside the lockup" out of the blocking sentence. It then reads "...
  or redraws, recolours or animates the mark."
- Replace line 77's clause with: "a title that is the name alone ('PaidWhole') beside the lockup reads as a second
  wordmark (recommendation; the brand owner's open decision), while a title that names the product, such as 'PaidWhole
  terms of use', is copy (ADR 0056:132-135)".
- If the co-founder wants it to block, record his ruling and cite it in the file. Until then it is polish, as the
  baseline rated it.

### 2. The legal check covers only the marked legal surfaces, which leaves out the terms, the screening terms and the counsel list's wording; and its cite does not say what it is cited for

**Evidence.**
- Line 67-68 says: "A legal surface's words change only with its review recorded in the PR
  (`docs/product/legal-surfaces.md:7-8`) and the founder's sign-off (`LANES.md` Delegations)". Line 89 blocks a change
  to "a legal surface" without the founder's sign-off.
- `legal-surfaces.md` defines a legal surface as an element marked `data-legal-surface`, listed in its table (lines
  3-8, 14-25). The table holds ten rows: the disclosure page, the screening's notices of what it keeps, the audit
  request's sentence and the attribution cookie.
- It does not hold the terms of use page, where a customer reads and accepts the terms
  (`apps/web/src/app/terms/page.tsx`, "I accept these terms" at :64). Nor does it hold the privacy notice, the cookie
  notice, the screening terms or the AMA notice. Lines 10-12 say those come in a later legal-surfaces PR.
- The founder keeps "sign-off of legal text before it goes to counsel" (`LANES.md` Delegations). The brief gives the
  founder "a choice that changes legal text (the terms, the cookie notice, the screening terms, the AMA notice, or
  anything on HANDOFF.md's counsel list)" (brief:83). The counsel list adds the wording of decisions 3, 4, 7 and 17,
  the 11-line floor and the campaign-codes sentence (`HANDOFF.md:89-94`).
- The baseline's blocking `flows-other-13` is about the terms page. Its fix (combined audit #51) will change that page.
  Under the checklist's definition it would pass with no sign-off.
- `legal-surfaces.md:7-8` says "A row leaves this list only when its review is recorded in the pull request that
  changes its text". That rule is about a row leaving the list. It does not say a surface's words change only with a
  review. Under lines 27-34, a waiting surface's words may change, and production holds the surface back.

**Fix.** Replace the clause with: "Legal text changes only with the founder's sign-off recorded in the PR: a marked
surface (`docs/product/legal-surfaces.md`), the terms a customer accepts, the privacy and cookie notices, the screening
terms, the AMA notice, and the wording on the counsel list (`HANDOFF.md`, on `claude/build-ops`) (`LANES.md`
Delegations)". In the blocking sentence, write "changes legal text" for "changes a legal surface".

## Should fix

### 3. The trigger's floor holds only TypeScript files, so it misses the stylesheets, the brand art and two package files whose words and figures every screen shows; and the trigger leaves out behaviour

**Evidence.**
- The floor is "every file tools/brand-copy reads" (line 3). The lint reads `.ts` and `.tsx` files only
  (`tools/brand-copy/scan.ts:79`, `SOURCE_EXTENSIONS`). So the floor leaves out:
  - `apps/web/src/app/brand.css`, which sets every heading's face (:15-18) and the focus ring (`:focus-visible`,
    :52-53), and `apps/web/src/app/globals.css`;
  - `apps/worker/src/report/brand.css`, the stylesheet every PDF prints with (`BRAND.md:141`);
  - `apps/web/src/app/icon.svg` and `apple-icon.png`;
  - `packages/brand/assets/*.svg`, the 26 outlined lockups, seals, badges and symbols the report embeds;
  - `apps/web/public/brand/*`, the email's lockup PNGs and the public seal and badge.

  The blocking class "redraws, recolours ... the mark" sits in the last two. Neither is named anywhere in the file.
- Two packages outside the lint's lists hold words or figures on every screen:
  - `packages/ledger/src/stages.ts:83-84`: `recoveredLabel` returns `Recovered (${level})`, the label of every
    recovered figure (ADR 0056:60-62);
  - `packages/money/src/cents.ts:67`: `formatUsd`, the form of every amount.

  A PR that changes either one changes the Recovered label or every figure. The floor names neither.
- The trigger says "words, figures, markup or style" (line 3). The checks also judge behaviour: what a refusal keeps,
  where focus moves, what a refresh loses, where a sign-in returns (lines 28-34, 40-47). The baseline's largest
  blocking class is behaviour (`a11y-other-01`: `ActionForm`'s reset). Read by the design's own test ("changes nothing
  a person sees (no words, figures, markup or style ...)", design:61), a PR that changes only that behaviour keeps its
  two other reviews and gets no UX review.
- The opening's shared-change sample covers "a shared component, token or shell change" (line 12). The shared
  stylesheets are none of those.

**Fix.**
- In `description:`, write "any change to the words, figures, markup, style or behaviour (focus, keyboard, navigation,
  what a refusal or a refresh keeps) of a screen, PDF or email".
- Extend the floor with: "the stylesheets and art (`apps/web/src/app/*.css`, `apps/worker/src/report/brand.css`,
  `packages/brand/assets`, `apps/web/public/brand`, `apps/web/src/app/icon.svg`), `packages/ledger/src/stages.ts` and
  `packages/money/src`".
- In line 12, write "a shared component, stylesheet, token or shell change".

### 4. The Words check misquotes the brand's tone line, and nothing checks CO-11's words outside the files the lint reads

**Evidence.**
- Line 60: "Plain, exact, warm, no hype, never a projected dollar presented as recovered (`BRAND.md:23-24`)".
  `BRAND.md:23-24` reads: "Tone: serious, exact, warm. A ledger you trust. Never "AI", never hype, never a projected
  dollar presented as recovered." The checklist changes "serious" to "plain" (a word from the brief's words lens,
  brief:68) and drops 'Never "AI"'.
- CO-11 (`change-order-001.md:95`) forbids "AI", "intelligence", "ProofPack" and "independent verification platform"
  in product copy. It also says the screening never says owed, underpaid or recovered, and "recovered" is always
  labelled posted or deposited. ADR 0058:110-113 adds that the brand's own words are imported from `tokens.ts`, never
  typed.
- The checklist says CI holds these "in the files the copy lint reads" (line 17) and never states them as a check.
  Its own floor names three files the lint does not read (`permissions.ts`, `controls.ts`, `billing/account.ts`). Add
  finding 3's `stages.ts`, and those are where no check holds them. The reviewer is not told what to look for there.
- "Claim nothing the product cannot prove (baseline)" (lines 66-67) has a written rule behind it: `BRAND.md:163-164`
  ("Nothing in the brand implies third-party certification; 'Verified by PaidWhole' is a first-party statement with a
  printed definition"). Labelled "baseline", it can block only by a harm test.

**Fix.**
- Line 60: "Serious, exact, warm; never "AI", never hype, never a projected dollar presented as recovered
  (`BRAND.md:23-24`); plain (recommendation)".
- Add: "In files the lint does not read, CO-11's words by hand: no AI, intelligence, ProofPack or 'independent
  verification platform'; recovered labelled posted or deposited; a screening never says owed, underpaid or recovered;
  the brand's words imported from `tokens.ts` (`change-order-001.md:95`; ADR 0058:110-113)".
- Write "Claim nothing the product cannot prove, and nothing that implies third-party certification (`BRAND.md:163-164`;
  baseline beyond it)".

### 5. "Together ... at 390 px too" is presented as a brand rule, but the rule says only the order, and ADR 0056 lets the table scroll at a phone's width

**Evidence.**
- Lines 22-23: "Expected, paid and short, together and in that order, at 390 px too (`.claude/rules/brand.md:36-37`)".
  `brand.md:36-37` says only "expected, paid and short appear in that order". "Side by side" is ADR 0056:55.
- ADR 0056:52-53 says that at a phone's width "a wide table scrolls inside its own card". So a 390 px table that keeps
  short in its scroller, behind a cue, meets every written rule.
- Keeping all three in view at 390 px is the baseline's class (`narrow-other-05`, blocking, by harm). Under the
  checklist's own labels it is "(baseline)". With a rule cite it reads as a broken written rule, which is at least
  should fix whatever the harm.

**Fix.** "Expected, paid and short in that order (`.claude/rules/brand.md:36-37`), side by side (ADR 0056:55-58); at 390
px, all three in view, or a visible cue that more columns exist (baseline)."

### 6. Five clauses still take a rule that does not state them, and one clause has no label

The design's review (finding 5) asked for a label after each part of a clause. These remain:
- "never swaps in a default (WCAG 3.3.7, 3.3.1)" (line 28). 3.3.7 covers information entered again in the same process,
  and 3.3.1 covers errors identified in text. Neither says a default is never swapped in. That is the baseline's class,
  blocking by harm test 2.
- "Error: a next step in the app's frame, never raw JSON (`PRD.md:256`)" (lines 37-38). `PRD.md:256` says "every error
  shown with a next step". The frame and the raw JSON are the baseline (`narrow-practice-1-09`).
- "Every error says what happened and a next step the reader's role can take, true to where it points (`PRD.md:256`,
  `:260`)" (lines 65-66). The PRD says "with a next step". "What happened", "the reader's role can take" and "true to
  where it points" are the baseline (`words-other-30` and others).
- "The next step is a link or a button, never a dead end (`PRD.md:256`, `:260`)" (lines 41-42). The PRD says the next
  step is said. "A link or a button" is the baseline.
- "nobody reads or types cents as dollars (`CLAUDE.md` rule 2; `PRD.md:256`)" (lines 21-22). Rule 2 is about storage.
  `PRD.md:256` says "rendered from cents". Neither covers typing (`flows-other-10`, a budget typed in cents).
- "or reflows, with a row's action beside its row" (line 49) carries no label at all.

**Fix.** Put "(baseline)" right after each part the rule does not state. For example: "Error: a next step (`PRD.md:256`)
in the app's frame, never raw JSON (baseline)". At line 49 write "or reflows, with a row's action beside its row
(baseline)".

### 7. "No UUID or segment name on screen" contradicts the PRD, the baseline's own fixes and the checklist's next bullet

**Evidence.**
- Lines 62-64 say: "No schema key, raw code, UUID, segment name or validator text on screen (baseline ...), unless a
  recorded decision shows it (ADR 0061's remittance keys ...)".
- `PRD.md:268` (Uploads) says: "a held file shows its segment and position".
- The baseline's own best fixes keep the code after its words, and the ID as a detail:
  - `words-practice-49` gives "Payer's allowed amount (AMT B6)" and "Contractual obligation (CO) 45", and keeps "the
    ID only as a copyable detail for support";
  - `words-practice-50` gives "Payment 1 (transaction set 0001)".
- The checklist's own At 390 px bullet says "IDs and hashes wrap without widening anything" (lines 49-50). The terms page
  shows the terms' SHA-256 (`terms/page.tsx:36-39`).
- ADR 0058:117-121 (D10) says codes "are exempt and never renamed". Read as "no raw code", a best fix could rename a
  stage code.

**Fix.** "Never a code, key or ID where words exist: the words first, the code after them, an ID only as a detail
(baseline); no schema key or validator text (baseline; 3.3.1 in an error). A held file shows its segment and position
(`PRD.md:268`), and codes keep their values (ADR 0058 D10)."

### 8. "The drafter is never offered Approve" would report the fix that already landed in PR 5

**Evidence.**
- Lines 46-47: "the drafter is never offered Approve (`CLAUDE.md`'s Never list)".
- The Never list says "Mark a packet approved by the person who drafted it", which is about the record, not the
  button.
- Combined audit #102 (the brief names it as landed in PR 5) is "Packet builder: no dead Approve button". Its best
  option: "Show the drafter a disabled button with the reason, next to 'Request approval'".
- A reviewer could read the disabled Approve button as "offered" and report the landed fix.

**Fix.** "The drafter sees Approve disabled, with its reason, never a working Approve (`CLAUDE.md`'s Never list; combined
audit #102)."

### 9. The mark's rules are cut down to "only through their components, never animated"

**Evidence.**
- Line 76 says "The mark and lockup only through their components, never animated (`brand.md:17-22`, `:34-35`)". The
  rules it cites, and those beside them, say more, and the checklist states none of the following:
  - "Never redraw it, copy its paths, or place a PNG of it in the app" (`brand.md:18`).
  - "Below 120 px wide, use the mark alone" (`brand.md:21-22`; ADR 0056:107-108).
  - Status colours "never in or near the logo" (`brand.md:27`; `BRAND.md:150`).
  - "No gradients, shadows, glows, outlines, rotation or animation on any brand mark" (`brand.md:34`). The file keeps
    only animation.
  - "Loading states use a plain progress bar" (`brand.md:34-35`; `BRAND.md:128`), which "stands still under reduced
    motion" (ADR 0056:42-43). The States bullet keeps only "the mark still".
  - "A mark beside the visible name is decorative, a lone mark has role="img" and the label "PaidWhole""
    (`brand.md:40-41`; `BRAND.md:155-156`). The design's outline carried this (2.2); the file dropped it, and the a11y
    bullet does not have it either.
- `BRAND.md` section 8 ("Do not", :147-150) is the brand's own list of these rules, and the file never points to it.

**Fix.**
- Point to the rules rather than restating some of them (the design's own principle, design:547). Replace line 76's
  first clause with: "The mark and lockup: every rule in `.claude/rules/brand.md:17-22`, `:34-35` and `:40-41` and
  `BRAND.md` section 8; a lone mark is `role="img"` "PaidWhole", one beside the name decorative".
- In States, write "Loading: the mark alone, never animated, and a plain bar that stands still under reduced motion
  (`BRAND.md:127-128`; ADR 0056:42-43)".
- With the line-77 cut from finding 1, this costs no line.

### 10. The packet check says "no PaidWhole mark" where ADR 0056 says neither the lockup nor the name

**Evidence.**
- Line 82: "A packet and the payer's copy lead with the practice, carry no PaidWhole mark (ADR 0056:113-118)".
- ADR 0056:115-116 says the packet "carries neither PaidWhole's lockup nor its name; it never earns the seal or the
  badge". ADR 0058:53-54 says the same.
- A packet whose running text or footer says "PaidWhole", or that prints the seal, passes the check as it is written.

**Fix.** "carry neither PaidWhole's lockup nor its name, and never the seal or badge (ADR 0056:113-118; ADR 0058:53-54)".

### 11. Three of the brand's placement rules are missing: sign-in, the independence claim and where the email art comes from

**Evidence.**
- **Sign-in.** "Sign-in: stacked lockup, Paper ground, nothing else decorative" (`BRAND.md:50`, `:122`; ADR 0058:56-57)
  and "Sign-in stays undecorated" (ADR 0058:94). The file's only "sign-in" is about keeping the screen across a
  sign-in. Lane A's sign-in PRs change this screen.
- **The independence claim and the descriptor.** These are placed by ADR 0058:92-94. The claim is "on the request-audit
  page and the audit report's cover, never under a white label". The white-label clause (lines 83-84) misses the claim.
- **The email art's host.** The art loads "from the CloudFront static host (`STATIC_ASSET_ORIGIN`), never from the
  application" (`BRAND.md:136-138`; ADR 0058:39-51). With no host, the message goes without the art. The email clause
  keeps "the lockup's PNG, no typed wordmark" but not the host.

**Fix.**
- Brand: "Sign-in: the stacked lockup on Paper, nothing else decorative (`BRAND.md:122`; ADR 0058:94)".
- Print, PDF and email: "the independence claim only where ADR 0058:92-94 places it, never under a white label".
- Email: "the lockup's PNG from the static host, never the application (`BRAND.md:129-139`)".

### 12. The fix's routing names a migration or a freeze exception, but not the founder's or the brand owner's decisions

**Evidence.**
- Lines 95-96 ask for "one best fix ... and whether it needs a migration or a freeze exception".
- The brief also sends to the founder, through the co-founder, a choice that "reverses a recorded founder ruling"
  (brief:83). Examples a reviewer's best fix can reach:
  - dark mode switched on reverses D9 item 3, which the owner approved (ADR 0058:58-59). `brand-16`'s notes say of
    `brand-04`: "the founder's ruling, since it reverses D9 item 3";
  - renaming a code reverses D10 (ADR 0058:117);
  - packets carrying the PaidWhole cover is the product owner's choice (ADR 0056:117-118).
- The palette is the brand owner's (line 70). Legal text is the founder's (finding 2).
- The brief's finding form also asks for "the files it would touch" (brief:73). The checklist's own carry-over rule
  depends on that: a finding becomes the change's own when its cause is in a file the change touches (lines 97-98).

**Fix.** "... and whether it needs a migration, a freeze exception, or a decision of the founder (legal text, a recorded
ruling reversed) or of the brand owner (the palette), and the files it would touch."

## Nits

### 13. "Recovered is stage five" cites the label rule, and the proof level is dropped
Lines 24-25: "'Recovered' is stage five, posted or deposited (`brand.md:37-38`)". `brand.md:37-38` says the label never
stands without "posted" or "deposited". Stage five is `PRD.md:260` ("the word 'recovered' appears only beside
stage-five amounts"). The checklist also drops ADR 0056:60-64 and ADR 0058:96-98: the label names the proof level
through `recoveredLabel` where it is known, and a bare stage label reads "Recovered (posted or deposited)". Fix:
"'Recovered' only beside stage five (`PRD.md:260`), labelled posted or deposited (`brand.md:37-38`), by its proof level
through `recoveredLabel` where known (ADR 0056:60-64)".

### 14. The mono rule drops its one exception
Lines 74-75: every money figure "in Plex Mono ... in sentences and buttons too (... ADR 0056:50-51)". ADR 0056:51 goes
on: "the one exception is a price inside a native `<option>`, which holds text only". A reviewer would report a price
in a native select. Fix: add "(a native `<option>` excepted)".

### 15. The brass clause is wider than the rule it cites
Line 72: "never text, fill or ground (`brand.md:32-33`)". The rule says "Never text on white, never a button fill, never
a background". The keystone itself is a brass fill. "Never text" anywhere in the UI is `BRAND.md:120-121` ("that is
Brass's only job in the UI"). Fix: "never text on white, a button fill or a background (`brand.md:32-33`); in the UI
only the rail underline (`BRAND.md:120-121`)".

### 16. The contrast clause drops the large-text level, and dark is left at should fix
- Line 58: "Text 4.5:1 ... in both themes (`BRAND.md:154`)". `BRAND.md:154` says "4.5:1 (3:1 at 24 px and above)", so
  a 32 px title at 3.5:1 passes the brand and WCAG 1.4.3 but fails the checklist. Fix: "Text 4.5:1, 3:1 at 24 px and
  above".
- Line 92 says only that dark does not block. Then a dark contrast failure is "a WCAG AA failure" and should fix. The
  brief says to "judge their contrast as advisory" (brief:50), as the design does ("Dark findings are advisory",
  design:500-501). Fix: "dark findings are advisory until users can switch it on (ADR 0056:127-130)".

### 17. `PRD.md:302` is cited for half its sentence
- Line 33 cites `PRD.md:302` for the confirmation and drops "and is reversible where the domain allows (a write-off can
  be reopened ...)".
- Line 44's lists that "page and filter on the server" miss the same paragraph's "filters in the URL so a filtered
  view can be shared".
- Fix: "confirms with its consequence and is reversible where the domain allows (`PRD.md:302`)", and "filters in the
  URL (`PRD.md:302`)".

### 18. The base has moved, and two helpers the checks need now exist
`origin/claude/build-platform` is at 7ef421b (#54). It adds `apps/web/src/lib/money-input.ts`, with `dollarsField` and
`dollarsForInput`: "The one schema every settings save reads dollars with", which `LANES.md` asks every dollar field to
take. It also adds `<Counted/>` in `display.tsx`, a count in the mono face with `counted()`'s noun. The checklist names
neither. Its "types cents as dollars" check has no helper to send a fix to. Its "`counted()` for a count's noun" leaves
the count in Plex Sans, against line 74's "unit count ... in Plex Mono, in sentences". PR #55 merges that base before it
merges (`LANES.md` rule 6). Fix: "typed through `dollarsField` (`apps/web/src/lib/money-input.ts`)" and "`<Counted/>`
(or `counted()` where no mono is wanted)", with "Cites are as of" set to the merge head.

### 19. Three cites point outside the repository and outside the commit the file names
- "`LANES.md` Delegations" (line 68), "combined audit #125" (line 41) and "combined audit #48" (line 45) are on
  `claude/build-ops` (`LANES.md`, `audits/combined/combined-report.md`), not in the repository.
- Line 14 says "Cites are as of 4d99df8", but those files are not at that commit.
- A reviewer working from the PR's checkout cannot open them.
- Fix: write "(`LANES.md` and `audits/combined/combined-report.md` on `claude/build-ops`)" once in the opening paragraph.

### 20. The file's own words: six places that are not exact
- "Notice kinds differ by more than colour (1.4.1) and look alike everywhere" (line 73) reads as a contradiction. Write
  "each kind looks the same on every screen".
- "danger style on actions follows one rule" (line 73) does not say which rule. `brand-16`'s decision (10) is "those
  that remove access, remove or reverse a record, or write money off". State it as the recommendation.
- "Loading: the mark still" (line 36) can be read as "still shown". Finding 9's wording fixes it.
- "Codes take paste" (line 33) uses the word the Words bullet uses for record codes. Write "Sign-in codes take paste
  and spaces".
- "(4.1.3; Alert's default is alert)" (line 57) is cryptic. Write "`Alert` defaults to `role="alert"`
  (`packages/ui/src/components/alert.tsx:18`), so a success passes `role="status"`".
- "baseline" names two things: the label "(baseline)" (line 15) and CI's "brand and print baselines" (line 18). Write
  "the header, cover and print checks".

Also, lines 97-98's "each keeps its severity unless the change touches its cause or worsens it" says what happens in
neither case. The design's rule: then it is the change's own finding, at least should fix when worsened, and a change
that undoes an earlier fix takes that finding's severity (design:503-505). Add both rules, in a clause each.

### 21. The template's new sentence drops its verb
`.github/pull_request_template.md:41-43`: "agents run before anything that touches money, tenancy or parsing merges
(PRD 17), and the UX and brand reviewer (...) before anything that changes what a person sees". The second clause has
no "merges", so it can be read as "before any change is made". Fix: "... before anything that changes what a person
sees merges". The shots (":43, at 1280 and 390 px") match the ruling (`lanes/lane-b.md:591`). The checklist also asks
for a 1280 px dark shot (line 10), so a session reading only the template would leave it out. Add "light, and 1280
dark".
