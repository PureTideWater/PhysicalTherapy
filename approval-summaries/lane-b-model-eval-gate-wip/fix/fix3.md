# PART fix 3: PR #75's upload panel after the merge of #74 (shots4's M4-1 and M4-3 fixed; M4-2 judged and fixed)

- **Worktree:** /home/user/contract-phi-check, branch co-001/contract-phi-check.
- **New head:** `7f77cb19…`. It is one plain commit on a8bf75ca.
- **Nothing is pushed.** `git ls-remote` still shows origin/co-001/contract-phi-check at 871faff9. Nothing was rebased, amended or forced. The tree is clean.
- **This run started fresh:** no fix3 progress file existed when it began.
- **Paths:**
  - progress: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/fix3.md
  - logs: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/fix3-logs/ (narrow, typecheck, lint, lint-copy, test, build, e2e, gitleaks, pre-push; `*.lock` holds the lock times; measure-text.log and layout.log hold the widths)
  - scripts: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/fix3-scripts/
    - `run.sh`: each step under the lock;
    - `e2e.sh`: refuses a database name that already exists;
    - `measure.mjs`: how wide a select must be to show each text whole;
    - `markup.mts` and `layout.mjs`: the real markup laid out with the built stylesheet.
  - commit message: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/fix3-work/commit-msg.txt

## Cause and fix

**M4-3 (the select changes width with its state).**
- **Cause:** the drop zone is `flex flex-col items-start`, so each child is only as wide as its content. Each field box was itself a flex column that stretches its children. Its select therefore took the width of the widest line under it: the help, or the 14 px "Error: …" line while it showed.
- **Fix:** both fields (the kind, and an ERA export's system) now use one box:
  - The box is `flex w-full min-w-0 max-w-md flex-col gap-1`: as wide as the drop zone's column, up to 28rem (448 px). That is the width the app's one-column forms use (`grid max-w-md`: pricing settings, proof level, invitations, billing).
  - Its select is `h-9 w-full rounded-md border bg-background px-2 text-sm`.
  - So the select's width comes from the column, never from its words. The kind and system selects line up.
- **Wrapping:** the words and help wrap inside the 28rem box. The `max-w-prose` they had (about 65ch) is wider than the box and did nothing, so it was removed.

**M4-1 (the placeholder is cut at 390).**
- The placeholder is now "Choose a kind", under the label "Kind of document".
- At 16 px it needs 139 px (141 refused). The old one needed 249 (251), but the Contracts and Reconciliation column at 390 is 241 to 242 px.

**M4-2 (judged: fixed by a shorter label, not by width).**
- **Width cannot fix it.** "ERA export from a practice-management system" needs 391 px at 16 px, and the Uploads column at 390 is 290 px.
- **The shorter label is the product's own kind name.**
  - `KIND_NAMES.era_export` in apps/web/src/lib/uploads/receipt-labels.ts:193 is "ERA export".
  - The long text was the uploads page's own option label and appeared nowhere else in the repository. `git grep` found only uploads/page.tsx; words.ts holds no kind names.
  - "ERA export" is already the page's word everywhere else: the heading "Drop 835 files or ERA exports here", the subtitle, the waiting words "Choose which system’s ERA export …", the system options "{vendor} ERA export", and the receipts (`documentName`).
  - The Contracts page already builds its options from KIND_NAMES. The uploads unit test's ERA fixture was already labelled 'ERA export'.
  - The words "from a practice-management system" are not lost. They are said by the system select ("Which system’s export"), which appears the moment ERA export is chosen, and by its help ("The practice-management system the ERA export came from. …").
- **What changed:**
  - The page now takes both labels from KIND_NAMES. "835 remittance" is unchanged; the ERA option becomes "ERA export" (118 px).
  - The stored value `era_export` is unchanged.
- **Test matrix:** this also brings the drop zone in line with FRM-08 ("a select that cuts its chosen text short shows that text whole under it"). Nothing is cut now, so nothing needs showing.
- **Considered, not built:** #74's `showChosen` line (ADR 0077 D6) would keep the long label. But:
  - the uploader's selects are hand-written;
  - `useCutChoice` is not exported from field.tsx (#74's file);
  - it would show the same words twice on a line under the select.

## Changes (file:line in 7f77cb19)

- **apps/web/src/components/uploads/uploader.tsx**
  - **:95-99** The doc comment, and `CHOOSE_KIND_PLACEHOLDER = 'Choose a kind'` (was 'Choose the kind of document').
  - **:101-107** `FIELD_BOX = 'flex w-full min-w-0 max-w-md flex-col gap-1'`, with a comment saying why.
  - **:109-110** `FIELD_SELECT = 'h-9 w-full rounded-md border bg-background px-2 text-sm'`.
  - **:326-327** KindField's comment: "The select keeps its width while those words come and go (FIELD_BOX)."
  - **The kind field.**
    - :349 `<div className={FIELD_BOX}>` (was `flex min-w-0 max-w-full flex-col gap-1`).
    - :365 `className={FIELD_SELECT}` (was `h-9 max-w-full …`).
    - :379 `<div key={attempt} role="alert">` (`max-w-prose` dropped).
    - :383 `<Hint id="upload-kind" hint={KIND_HELP} />` (`className="max-w-prose"` dropped).
  - **The system field.**
    - :676 `FIELD_BOX` and :692 `FIELD_SELECT`.
    - :702 the alert div, without `max-w-prose`.
    - :706 `<Hint id="upload-format" hint={FORMAT_HELP} />`.
    - :708 the unconfirmed-format note is `flex flex-col gap-1 text-sm text-muted-foreground` (`max-w-prose` dropped).
  - **Unchanged:** the held files, `controlMarks` (aria-invalid only while the words show; aria-describedby error then hint), `FieldError` inside the keyed `role="alert"`, `Hint` at 14 px, `focusNext` and its ref effect, the file input's `tabIndex={-1}` and `aria-hidden`, and the 2 px refused border (styles.css).
- **apps/web/src/app/p/[practiceId]/uploads/page.tsx**
  - :8 imports `KIND_NAMES` from lib/uploads/receipt-labels, as the contracts page does.
  - :16-21 the header comment adds one sentence about the kind names.
  - :45 `label: KIND_NAMES.x12_835` (the same words, "835 remittance").
  - :48 `label: KIND_NAMES.era_export` (was 'ERA export from a practice-management system').
- **apps/web/src/components/uploads/uploader.test.tsx**
  - :88 asserts `CHOOSE_KIND_PLACEHOLDER` is 'Choose a kind', with a comment.
  - :98 asserts the Hint markup `class="text-sm text-muted-foreground"`.
  - :194 the alert regex is `<div role="alert"><div data-field-error…`.
  - :200-213 a new test, "keeps the select’s width while the words come and go … (M4-3)":
    - the box and select classes are the same with and without the words;
    - the box is `flex w-full min-w-0 max-w-md flex-col gap-1`;
    - the ERA system field has the same box and the same select classes.
- **apps/web/e2e/a11y.ts**
  - :2 imports `type Locator`.
  - :217-247 `SelectShown` and `selectShows(select)`: the chosen text, the outer width, and whether the select cuts the text. It measures as field.tsx's `showChosen` does: against a hidden copy that holds the chosen option alone, comparing padding boxes.
- **apps/web/e2e/contracts.spec.ts** (#75's held-files step)
  - :8 imports `selectShows`.
  - :82-99 the select before anything waits: "Choose a kind", whole at 1280 and, in a 390 px viewport, whole again (`atPhone`, which restores the viewport).
  - :119-123 while the words show: the same width as before at 1280, the placeholder whole at 390 while refused, and the focus still on the select.
  - :138 once Contract is chosen and the files wait for Upload: the same width again, not cut.
- **apps/web/e2e/uploads.spec.ts** (FRM-08)
  - :10 imports `selectShows`.
  - :37-39 the comment. It no longer says "the kind's long option".
  - :45-56 at 390 px with ERA export chosen:
    - the kind shows "ERA export" whole;
    - the system shows "Choose the system" whole;
    - the two selects are the same width;
    - the viewport is restored afterwards.
- **docs/adr/0070-…md:964-970** (Part 3, the upload panel paragraph). It now says:
  - the placeholder is "Choose a kind", under "Kind of document", short enough to show whole at a phone's width at 16 px (ADR 0077, D6);
  - the kind's and the system's fields are as wide as the drop zone's column, up to 28rem, whatever is written under them, so a select never widens or narrows as its words come and go;
  - the Uploads page offers its kinds by the names its receipts give them ("835 remittance", "ERA export"), and the system's select and its help say where an ERA export comes from.
- **Not edited.** None of these needed a change, and #74's text was left alone:
  - ADR 0077 (D6's "as the uploader's drop zone does" still describes the zone, which sizes its children to their content);
  - styles.css and field.tsx;
  - ADR 0070 line 1266 (a historical quote of the design's old refusal, "Choose the kind of document first, …").

## Widths, before and after

`layout.mjs` lays out the real markup with the built stylesheet and Plex Sans in Chromium. It uses the shots' columns: 242 px at 390 on Contracts and Reconciliation, 290 px on Uploads, and a wide column at 1280. "Before" is a8bf75ca's classes and words. The before figures match shots4 to within 4 px (363 against 364, 418 against 414). The system's 520 is narrower than the shots' 546, because the layout lacks the page's own `ch` context.

| Select, state | Before | After |
| --- | --- | --- |
| Contracts kind, 1280, default / held-ready | 363 (shots: 364) | **448** |
| Contracts kind, 1280, refused | 418 (shots: 414) | **448** |
| Reconciliation kind, 1280 | 364 (shots) | **448** |
| Uploads kind, 1280 | 363 (shots: 364) | **448** |
| Uploads ERA system, 1280 | 520 (shots: 546) | **448**, the same as the kind |
| Contracts and Reconciliation kind, 390, any state | 242 | 242 (the column) |
| Uploads kind and system, 390 | 290 / 290 | 290 / 290 |

Reconciliation was not laid out separately; its kind field has the same classes, so it should be 448 like the others. The dark shots should show the same widths, since dark mode changes no size; neither was measured here.

| Chosen text at 390 (room is the padding box) | Before | After |
| --- | --- | --- |
| Placeholder, default | "Choose the kind of document" needs 247 of 240: **cut** | "Choose a kind" needs 137 of 240: whole |
| Placeholder, refused (2 px border) | needs 247 of 238: **cut** | needs 137 of 238: whole |
| Uploads, ERA chosen | "ERA export from a practice-management system" needs 389 of 288: **cut** | "ERA export" needs 116 of 288: whole |
| Uploads system placeholder | "Choose the system" 175 of 288: whole | the same |

At 1280 the error line ("Error: Choose the kind of document for this file, then upload it.", 354 px of words) and the kind's help each stay on one line inside the 448 px box. The system's help takes 2 lines at 1280, inside the 448 px box. At 390 the line counts are unchanged: the kind's help takes 2 lines, the kind's error 3, and the system's help 3.

## Every changed string a person sees

| Where | Before | After |
| --- | --- | --- |
| Contracts and Reconciliation upload panels: the kind select's disabled first option | "Choose the kind of document" | "Choose a kind" |
| Uploads page: the kind select's second option | "ERA export from a practice-management system" | "ERA export" |

Nothing else a person sees changed. The label, the help, the waiting words, "Choose the system" and the buttons are the same. The field's lines now wrap at 448 px instead of their own width.

**For the PR's wording list (PR #75's body; not edited, since nothing is pushed):**
- **"What a person sees," bullet 2:** replace `A disabled first option reads "Choose the kind of document"` with `A disabled first option reads "Choose a kind"`.
- **Wording table, the `uploader.tsx` row:** replace `The placeholder "Choose the kind of document"` with `The placeholder "Choose a kind"`. The rest of the row is unchanged.
- **Wording table, a new row:** `apps/web/src/app/p/[practiceId]/uploads/page.tsx` | `The kind select's options are the kinds' names (KIND_NAMES): "835 remittance" and "ERA export" (was "ERA export from a practice-management system"); the stored kind is unchanged`.
- **"What changes" could add one line:** "The kind and ERA system selects are the drop zone's column wide up to 28rem, whatever is written under them, so neither changes width when its words come and go."

**Other places that name the old words:**
- `git grep` finds "Choose the kind of document" only in the waiting words, which are unchanged: uploader.tsx:146, uploader.test.tsx:131-132 and :194, and contracts.spec.ts:118 and :127. It also appears in ADR 0070:1266, the historical quote.
- **The screen tour** (/home/user/ops/tools/lane-b-screen-tour/capture/tour.spec.ts, not this repository, not edited) is unaffected:
  - it chooses the ERA kind with `/ERA export/i`, which "ERA export" matches;
  - it checks the waiting words, which are unchanged;
  - nothing in it names the placeholder.

## Commands

Every command started with `export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH:/opt/node22/bin`. Every heavy one ran under `flock /tmp/laneb-heavy.lock`, one at a time.

| Command | Totals |
| --- | --- |
| `vitest run --project unit` uploader.test.tsx, form-hints.test.ts, form-issues.test.ts | 3 files passed; 41 passed (41), 2.08 s. The new M4-3 test ran; form-hints' "writes no description a control names at 12 px" passed |
| `pnpm typecheck` | passed, 22 projects in 24.8 s wall (apps/web re-checked: 6.31 s of checking) |
| `pnpm lint` | passed, 1,650 files in 3 groups, 0 errors, 0 warnings, 102.5 s wall |
| `pnpm lint:copy` | 519 files read; the product copy keeps the brand's words |
| `pnpm test` (the whole unit project) | Test Files 398 passed (398); Tests 6698 passed, 4 skipped (6702); 272.72 s; exit 0. That is one more than check 4's 6697: the new test. The engine-freeze differential is skipped because ENGINE_FREEZE_BASE is unset, as before |
| `git commit` | 7f77cb19: 7 files, +133 −26 |
| `pnpm build` (web and worker, on the clean committed tree) | exit 0 in 24 s; Turbopack "Compiled successfully in 5.1s"; the new placeholder is in the client chunks and `max-w-md` and `w-full` are in the built CSS |
| `git rev-parse HEAD > apps/web/.next/BUILD_COMMIT` (as ci.yml:477) | 7f77cb19…; the e2e server printed "build-stamp: the build is 7f77cb19…'s" |
| `E2E_PREBUILT=1 DATABASE_URL=postgres://postgres:test@localhost:5433/postgres E2E_DATABASE=phi_fix3_e2e E2E_PORT=3199 pnpm test:e2e --workers=2` | **62 passed (9.1m); exit 0**. The lock was held 06:41:40 to 06:50:51 UTC. Covered, among others: contracts.spec (held files, with the new width and 390 checks; 26.7 s), uploads.spec J4 (with the new 390 checks; 50.4 s), era-exports.spec (4 tests) and forms-keep-input.spec. Clean-up: `phi_fix3_e2e` was dropped WITH (FORCE) (it did not exist before; the script refuses one that does) and the seven /tmp/tp-e2e-phi_fix3_e2e-* directories were removed. The databases left are the ones there before: postgres, tp_e2e, tp_e2e_ux and three tp_test_*. Port 3199 is free |
| `gitleaks git --log-opts="a8bf75ca..HEAD" --no-banner` (the pinned 8.24.3, /root/.cache/paidwhole/gitleaks/8.24.3/gitleaks) | 1 commit scanned, ~8.19 KB in 161 ms, no leaks found; exit 0 |
| `.githooks/pre-push origin https://github.com/PureTideWater/PhysicalTherapy`, run standalone; stdin `refs/heads/co-001/contract-phi-check 7f77cb19… refs/heads/co-001/contract-phi-check 871faff9…` | "pre-push: 1 commit checked: 0 file(s) read by the fixture guard, 7 text file(s) searched for an X12 header, and gitleaks found no secret."; exit 0; nothing pushed |

The hook checked 1 commit, not 3: a8bf75ca and 26388626 are already on origin's backup ref `co-001/wip-contract-phi-check-4`, and the hook leaves out what the remote has.

**Layout check (not a repository command):** `node fix3-scripts/layout.mjs fix3-work/markup.json` against the built CSS gives the tables above (fix3-logs/layout.log). The markup comes from `tsx fix3-scripts/markup.mts`, run in apps/web; it writes no repository file.

## Commit (not pushed)

**`7f77cb19`** "uploads: the kind and ERA system selects keep one width whatever is written under them, and every kind shows whole at 390 px (the merged #74 shots' M4-1 to M4-3)"
- Its parent is a8bf75ca. It has 7 files, +133 −26.
- The body gives each finding's cause, measured widths and fix, the M4-2 judgement, what is unchanged, and the tests.
- It ends, after a blank line, with exactly the two lines:
  - `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  - `Claude-Session: https://claude.ai/code/session_017SNqG4nQbbt6xqEG1ZDKe6`

## Boundaries
- **Files:** none of #42's (/home/user/ops/LANES.md:84-91) is touched. #74's field.tsx, styles.css and ADR 0077 are not touched either.
- **Nothing under:** packages/pricing, packages/ledger, content/releases, fixtures, migrations or domain-model. No migration was added.
- **Data:** synthetic only. The tests use SYNTHETIC files and the existing personas.
- **No model identifier** is in any file.
- **No stored value changed:** `era_export`, `x12_835` and the other kinds' values are as they were.

## Open items
1. **Push.** 7f77cb19 is ready for the orchestrator to push through the hook (`git push origin co-001/contract-phi-check`). The hook passes standalone.
2. **The PR body's wording list** needs the three edits above when the PR is next updated.
3. **Shots.** A retake of shots4's sample would show the change in pixels. The widths above come from the built CSS laid out at the shots' columns, and the e2e asserts the properties: the same width in every state, nothing cut at 390.
4. **Carried, unchanged:**
   - M4-4 (#74's row-form button placement);
   - M4-6 (the 390 tables);
   - M4-7 (what the sample does not see);
   - check 4's open items (focus is not shared, screen readers not checked by hand, P14, P15, #80's asymmetry, ADR 0054's order, the 12 px names in "Waiting to upload").
