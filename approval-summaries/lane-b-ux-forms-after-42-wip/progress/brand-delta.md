# Brand and UX read of the delta: PR #132 at bceda579

The checklist in `.claude/agents/ux-brand-reviewer.md`, applied to the delta only. Read only; no file in the worktree was changed.
The delta: (a) 7078eb82, the no-JavaScript notice (`apps/web/src/components/screening/upload-form.tsx:332-338`); (b) bceda579,
two server sentences in `apps/web/src/lib/screening/routes.ts:287` and `:294`, against their browser twins in
`apps/web/src/lib/screening/messages.ts:110` and `:114-118`.

## Findings, most severe first

### 1. Should fix: the every-row too-few-claim-lines refusal has two semicolons
- Route and shot: `/screening`, server refusal read as "File to screen: {message}"; no shot of this state (judged from the code).
- Evidence: `apps/web/src/lib/screening/routes.ts:294` now reads "every row sums fewer than 11 claim lines, so there is
  nothing to screen; a screening takes a row of at least 11 claim lines, because a row of fewer can describe one patient’s
  care; choose a file with rows of at least 11 claim lines". bceda579 changed the step's ", so choose" to "; choose", so
  the sentence is three semicolon-joined parts and the step is the third. Its siblings keep one semicolon and lead the step
  with ", so": the per-row case (`:295`, "...because fewer can describe one patient’s care, so leave it out") and
  `band_holds_date` (`:274`, "...such as 2026-Q1, so remove the dates, then choose the file again").
- Rule: ADR 0077 amendment item 1 ("what is wrong, then the next step, joined by a semicolon") and the new
  `docs/brand/BRAND.md:148-152` line ("in one lower-case sentence joined by a semicolon"). This is a field's refusal
  (`screeningReasonMessage`'s doc comment, `routes.ts:251-255`: read after "File to screen:"), so the rule applies;
  `apps/web/src/lib/routes/messages.test.ts` (FRM-04) checks colons and full stops but not the semicolon count.
- Fix (exact words), keeping the claim-lines naming bceda579 added and `CLAIM_FLOOR_REASON`'s words (quoted by ADR 0062:169):
  `every row sums fewer than ${floor} claim lines, so there is nothing to screen; a screening takes a row of at least ${floor} claim lines, because a row of fewer can describe one patient’s care, so choose a file with rows of at least ${floor} claim lines`
  Files: `apps/web/src/lib/screening/routes.ts:294`, `apps/web/src/lib/screening/routes.db.test.ts:280`. No migration, no
  freeze exception, no founder or brand-owner decision. This sentence is not quoted in ADR 0062.

### 2. Polish: "leave rows out, such as a quarter or a payer product" gives a quarter as an example of a row
- Route and shot: `/screening`, too-many-rows refusal, browser and server; no shot (code).
- Evidence: `routes.ts:287` and its twin `messages.ts:110` both say "leave rows out, such as a quarter or a payer product,
  until 50,000 or fewer remain". The twins now match (bceda579's aim, met), and "such as" follows ADR 0077 item 1. But
  the examples are groups of rows, not rows.
- Rule: plain words, one thing per name (recommendation).
- Fix (exact words, both twins): "leave rows out, such as those of a quarter or a payer product, until". Files:
  `apps/web/src/lib/screening/routes.ts:287`, `apps/web/src/lib/screening/messages.ts:110`,
  `apps/web/src/lib/screening/routes.db.test.ts:275`, `apps/web/src/lib/screening/parse.test.ts:417`. No decision needed;
  not quoted in ADR 0062. Optional: it does not block.

## Checked, no finding
- (a) The notice title "JavaScript is off" (`upload-form.tsx:335`), shots `screening.no-javascript.1280`, `.390` and
  `.1280-dark` (tile 01 of each). The title says what happened and the body (`NO_SCRIPT`, words unchanged) gives why and
  the step ("Turn JavaScript on before you fill in the form"), so what happened plus a next step are both there (`PRD.md:256`).
  It is sentence case and plain, like the other notice titles ("Nothing was uploaded", "Uploads are not open yet"). It is the
  shared `Alert` with its default neutral look, the same as other notices. `role="note"` (not the `Alert` default
  `alert`) is right for text that is there from the first paint and needs no action (4.1.3). It sits above the first card,
  fits at 390 px with no sideways scroll, and in dark it uses tokens only. The words fit a phone and contain no build words.
  It is not form-wide copy for the separator rule: a notice title, not a refusal.
- (b) Twins: the server's every-row step now names claim lines and matches the browser's step ("choose a file with rows of
  at least 11 claim lines", `messages.ts:117`). The server's "there is nothing to screen" and the browser's "nothing is left
  to screen" differ on purpose: the browser has left the rows out and its left-out line follows; the server got the rows
  around the browser. The server's reason clause is `CLAIM_FLOOR_REASON` word for word (`messages.ts:31`), the wording ADR
  0062:169 quotes. The browser twins are full sentences shown outside a field's name, so they are outside the separator
  rule (BRAND.md:150-152), and the server twins are one lower-case sentence with no full stop or colon.
- No sentence ADR 0062 quotes is changed by the delta.

## Apart: not the delta's
- Polish, already there before this PR: ADR 0062:152-153 quotes the per-row server refusal as "...a row of at least 11
  claim lines, because a row of fewer can describe one patient's care: leave it out", while the code (`routes.ts:295`) says
  "rows of at least 11, because fewer can describe one patient’s care, so leave it out". The delta did not touch it. Per the
  instruction, the quoted sentence stays as it is. The fix is to the code or a note in the ADR, and that is outside this delta.

## Not seen, not checked
- Not seen: the two server refusals (no shot of a server too_few_claim_lines or too_many_rows state; judged from code).
- Not checked: screen reader announcement of the noscript note (noscript content is read only with scripts off; the
  shots show it rendered).
