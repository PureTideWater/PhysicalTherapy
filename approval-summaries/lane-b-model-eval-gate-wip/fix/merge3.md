# PART merge 3: claude/build-platform (165c5993: #74, UX PR 1, ADR 0077) into PR #75 (co-001/contract-phi-check, 871faff9)

## State
- Worktree /home/user/contract-phi-check. HEAD 871faff9 (origin/co-001/contract-phi-check). MERGE_HEAD 165c5993 (origin/claude/build-platform). Merge base a6e754fc.
- `git merge --no-ff --no-commit origin/claude/build-platform`. The conflict is resolved and everything is staged. Nothing is committed or pushed. No rebase and no force.
- Staged: 114 paths against HEAD and 75 against 165c5993. Nothing is unstaged or untracked. `git diff --cached --check` is clean and no conflict markers are left.
- Progress log: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/merge3.md. Logs are in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/merge3-logs/. The three sides and the conflicted file are in /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/merge3-work/ (uploader.{base,ours,theirs,conflicted,merged}.tsx).
- This run picked up after an interrupted one. The progress file's steps (read, merge, resolution, auto-merge check, regeneration, unit and db tests) were checked against the code and still hold. The first typecheck had been cut off before apps/web reported, so it was run again (below).

## #74's design read (ADR 0077)
- `field.tsx`:
  - `controlMarks(id, {error, hint, ...})` returns `aria-invalid` (true only with an error) and `aria-describedby` (via `describedBy`: `{id}-error`, then `{id}-emptied`, then `{id}-hint`, then `also`).
  - `Hint({id, hint, className})` renders `<p id="{id}-hint" class="… text-sm text-muted-foreground">`. D9 requires 14 px.
- `form-issues.tsx`: `FieldError({id, error})` renders `<div data-field-error class="flex … text-sm text-destructive">`, then the icon, then `<span aria-hidden>Error:</span>`, then `<p id="{id}-error">message</p>`. The `-error` element holds the message alone.
- `packages/ui/src/styles.css`: an unlayered rule `:is(input,select,textarea)[aria-invalid='true']` gives a refused control the destructive colour and a 2 px border.
- `form-hints.test.ts` (D9): no description that a control names may be 12 px.
- Focus: #74's focus handling lives inside `RefusalSummary` and `ActionForm`. It gives the focus to the one field the server refused, or to the summary. It is not exported as a helper. The uploader is not an ActionForm, so the uploader keeps its own `focusNext` and ref effect.
- File input: #74 gave it `tabIndex={-1}` and `aria-hidden="true"`, so "Choose files" is the only tab stop.

## The conflict and its resolution: apps/web/src/components/uploads/uploader.tsx (the only conflict)
The conflict had two hunks, both on the ERA system select:
- #75 (HEAD) had the conditional aria-invalid and aria-describedby, the `upload-format-error` alert and the `upload-format-help` paragraph.
- #74 had `aria-describedby="upload-format-hint"` and a `<Hint id="upload-format">`.

The resolution keeps both sides:
- **Kept from #75:**
  - Files chosen or dropped before a kind or system are held, listed under "Waiting to upload", and sent only on Upload.
  - The Upload/Clear group.
  - `KIND_HELP`.
  - The kind and ERA system selects are marked invalid, described first by `waitingText`, then by their help, and focused through `focusNext`.
  - The error is an alert keyed by `attempt`, so a second drop is announced again.
  - Focus moves as before: Upload goes to "This batch", Clear to "Choose files", a refusal to Upload.
- **Kept from #74:**
  - `import { Hint } from '../field'`.
  - The file input's `tabIndex={-1}` and `aria-hidden="true"`, with their comment.
  - The note under an unconfirmed format is `text-sm` (it was `text-xs`).
- **Kept from #79 (already merged):** every table, `min-w-0`, `max-w-full` and wrapping class. The only lines changed from #75's side are the ones listed below.

**What was unified (one way, #74's shared helpers; no behaviour lost):**
1. **aria wiring.** Both selects now use `{...controlMarks('upload-kind' | 'upload-format', { error, hint })}`. This replaces #75's hand-written `aria-invalid={… ? true : undefined}` and the conditional `aria-describedby` strings. The order is unchanged: error first, then help.
2. **The refused field's error.** `<FieldError id="upload-kind" | "upload-format" error={…} />` replaces #75's `<p id="upload-*-error" role="alert" class="text-xs text-destructive">`.
   - The visible line is now #74's: the icon, "Error:" (aria-hidden), and the message at 14 px.
   - `#upload-*-error` still holds the message alone.
   - To keep #75's announcement, FieldError is wrapped in `<div key={attempt} role="alert" class="max-w-prose">`, so each attempt still re-inserts the alert.
   - #74's FieldError adds no live region of its own, so nothing is announced twice.
3. **The help.** `<Hint id="upload-kind" hint={KIND_HELP}>` and `<Hint id="upload-format" hint={FORMAT_HELP}>` replace #75's `<p id="upload-*-help" class="text-xs …">`. The ids changed from `upload-kind-help` and `upload-format-help` to `upload-kind-hint` and `upload-format-hint`, which is #74's naming. The text is now 14 px, which D9 requires. The ERA help text moved into a new constant, `FORMAT_HELP`, with the same words as both sides.
4. **The invalid border.** #75's `aria-invalid:border-destructive` was removed from both selects. #74's unlayered styles.css rule draws a 2 px destructive border on any `[aria-invalid='true']` select, so one way remains.
5. **Not unified: focus.** #74 has no exported focus helper for a control outside ActionForm, so the uploader's `focusNext` and ref effect stay as #75 wrote them.
6. **New helper value.** `formatProblem`, the `waitingText('format', n)` while files wait for the system and otherwise undefined, is computed once and feeds both `controlMarks` and `FieldError`. #75 had repeated the same condition three times.
7. **Comment.** The comment on the kind select now cites controlMarks, FieldError, Hint and ADR 0077 (D3 and D9).

**uploader.test.tsx** (#75's file; #74 did not touch it): updated for the unified markup.
- `-help` became `-hint` in 3 asserts.
- The Hint markup is now `text-sm`.
- The error is now FieldError inside the keyed `role="alert"` div. A regex checks the icon, "Error:" and `<p id="upload-kind-error">`.
- A new assert: there is no `role="alert"` while nothing waits.
- The order asserts are unchanged: select, then error, then hint.

**Proof that the unification was needed:**
- With #75's side of uploader.tsx alone, #74's `form-hints.test.ts` test "writes no description a control names at 12 px" fails on #upload-kind-error, #upload-kind-help, #upload-format-error and #upload-format-help (merge3-logs/form-hints-with-ours.log).
- With the resolution it passes. The resolved file was restored after the probe and `cmp` matched.

## Auto-merged files changed by both sides (checked by hand)
The intersection of `git diff --name-only a6e754fc 165c5993` and `git diff --name-only a6e754fc 871faff9` is exactly these files:
- **apps/web/e2e/contracts.spec.ts**
  - #74's one change is the cite-step comment ("The refused form keeps what was typed (docs/adr/0077); entering the page, the quote and the rule again overwrites it"). It is present once.
  - #75's held-files steps are intact and still match the screen:
    - `#upload-kind-error` toHaveText (message alone, FieldError's `<p>`).
    - `aria-invalid` 'true'.
    - toHaveAccessibleDescription `/^Choose the kind … A document's kind cannot be changed/`. The description is error then hint, the same order as before.
    - Clear moves focus to "Choose files".
  - `getByLabel('Choose files to upload').setInputFiles` still reaches the input after #74's aria-hidden. #74's own uploads.spec.ts uses the same call.
- **apps/web/src/app/p/[practiceId]/abstraction/versions/[versionId]/page.tsx**: #74's form fields and #75's CardDescription are both present, with no duplicates.
- **apps/web/src/app/p/[practiceId]/reconciliation/page.tsx**: #74's Reverse form fields and #75's contentTypes union of the offered kinds are both present.
- **docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts, packages/synth/src/cases/registry.ts**: #74's FRM-01 to FRM-08 and #75's MOD-12. Each is the exact union of the two sides.
- **tools/screening-capacity/watched-paths.txt**: regenerated (below).

Not in the intersection, because #74 touched neither: the contracts page and uploader.test.tsx. They were checked anyway. era-exports.spec.ts (`#upload-format-error` toHaveText, the system's `aria-invalid`) and uploads.spec.ts still match. No tracked file uses `upload-kind-help` or `upload-format-help` any more (`git grep`).

ADR 0070 Part 3's upload-panel paragraph is still accurate: the select is marked aria-invalid, described first by the words and then by its help, focused, and its words sit in an alert re-inserted at each attempt. It was not edited. The check part may add one clause naming ADR 0077's controlMarks, FieldError and Hint.

## Regenerated files
- `pnpm install --frozen-lockfile --config.modules-cache-max-age=0`: "Lockfile is up to date … Already up to date".
- `watched.ts --write`: watched-paths.txt has 537 paths and is byte-identical to the auto-merge (the base plus #75's patient-records.ts and patient-twins.ts). Nothing to stage.
- `pnpm synth --all`, run 1: 254 cases, 0 written, 654 unchanged, 0 removed; 8 EMR formats, 0 written, 16 unchanged. Run 2 gave the same. Nothing to stage.

## Tests (one heavy command at a time under flock /tmp/laneb-heavy.lock)
| Test | Result | Log |
| --- | --- | --- |
| Uploader + form-hints | 2 files, 33 passed | uploader-second.log |
| Narrow unit set (see note) | 20 files, 230 passed, 0 skipped, 26.5 s | unit-narrow.log |
| DB tests on a fresh database (see note) | 3 files, 34 passed, 17.1 s | db.log |
| `pnpm typecheck` (rerun) | passed, 22 projects including apps/web (51.2 s), exit 0 | typecheck-2.log |
| `pnpm lint:copy` | 519 files read, passed, exit 0 | lint-copy.log |
| eslint `--max-warnings=0` on uploader.tsx and uploader.test.tsx | clean | eslint-2.log |

- **Narrow unit set:** uploader, form-hints, form-issues, fields, action-form (and its browser test), the split-form browser test, the screening forms, app/tables, lib/uploads/*, words, models/path, synth fixtures and index, and the ui components and states.
- **DB tests:** run on a fresh database of this run's own, `phi_merge3_db` on localhost:5433, with 44 migrations applied. The script refuses to run if that database already exists. The tests were path.db, models-routes.db and uploads.db. The database was dropped WITH FORCE afterwards, and no other database was touched.
- **Not run:** e2e, which this part did not ask for. If the check part runs it, it should use its own E2E_DATABASE and E2E_PORT.

## Boundaries
- Against the base, nothing changed under packages/pricing, packages/ledger, content/releases, fixtures/golden, domain-model or migrations. No migration was added.
- None of #42's non-shared files were touched.
- No model name or identifier appears in the added lines. All data is synthetic.
- The only edits beyond the auto-merge are uploader.tsx (the resolution) and uploader.test.tsx.
