# Merge audit of ae26bf7 (PR #74 co-001/ux-forms), read-only
Parents: 001cdbf (ours) + 0dd1ba7 (base). Merge base 085299b (#76).
Ours changed 112 files, base changed 76; both changed 5:
apps/web/e2e/sign-in.spec.ts, docs/product/test-matrix.md, packages/synth/src/cases/matrix.ts,
packages/synth/src/cases/registry.ts, tools/screening-capacity/watched-paths.txt
Working tree clean at start.

## Part 1: files both sides changed
- apps/web/e2e/sign-in.spec.ts: KEPT-BOTH. Base #77 hunk (line 18: getByLabel('Practice switcher') -> locator('[data-slot="practice-switcher"]')) and ours (lines 61-62: emptied-note comment + toHaveAccessibleDescription('Emptied for your security.')) both present; merged blob == clean `git merge-file` of the three versions (0 conflicts). Selector data-slot="practice-switcher" still in merged shell.tsx:59.
- All 4 other overlap files: merged blob == clean `git merge-file` (0 conflicts); each side's changed lines (sorted -U0) reappear exactly in merged-vs-other-parent.
- docs/product/test-matrix.md: KEPT-BOTH. Base: MOD-13, MOD-14 rows + MOD-13/14 note; CI series intro (CI-18..20 "complete the series", After #42); CI-18, CI-19, CI-20 rows. Ours: "## Forms (FRM)" section + FRM-01..08. All present.
- packages/synth/src/cases/matrix.ts: KEPT-BOTH (MOD-13, MOD-14 objects; CI-18..20; FRM-01..08 all present; 214 rows each, same order, ids unique).
  WORD-FOR-WORD md vs ts (node, merged tree): MOD-13, MOD-14, CI-18, CI-19, CI-20, FRM-02..07 identical.
  PROBLEM (pre-existing, from 001cdbf, NOT the merge): FRM-01 and FRM-08 assertions differ.
    FRM-01 md has `never "Not done", in the neutral notice's look, never the failure colour;` ts has `never "Not done";`
    FRM-08 md has `whole under it, a SHA-256 in it set in Plex Mono as the page sets it, as no select` ts has `whole under it, as no select`
  Same drift on 001cdbf alone (polish commit edited test-matrix.md, not matrix.ts); a57fbf5 and 0dd1ba7 have 0 mismatches.
  -> fixtures.test.ts 'holds every row ... word for word' (TEST_MATRIX toEqual rows) would fail. Fix: copy md FRM-01/FRM-08 assertions into matrix.ts (registry holds no text; CASES derive from TEST_MATRIX).
- packages/synth/src/cases/registry.ts: KEPT-BOTH. Base MOD-13, MOD-14 (milestone 10), CI-18..20 entries; ours FRM-01..08 entries. 214 ids, no dups, equal to md ids; all 252 assertedBy paths exist in ae26bf7.
- tools/screening-capacity/watched-paths.txt: KEPT-BOTH and GENERATED-EQUAL. Base added apps/web/e2e/browser-builds/*, apps/web/e2e/browser.json, tools/ci/apt-archives.sh, tools/ci/browser-build.ts; ours added apps/web/src/components/form-issues.tsx, packages/ui/src/states/loading-announcement.tsx. `pnpm exec tsx tools/screening-capacity/watched.ts` (stdout, no --write; 1.6 s, clean worktree == ae26bf7) output is byte-identical to the ae26bf7 blob (538 lines).

Part 1 DONE.

## Part 2: git diff 0dd1ba7 ae26bf7 --stat
- 112 files, 6340+/962-. Name set == exactly the files ours changed since MB (MB..001cdbf); no deletions; 22 added (all new forms files, ADR 0077, FRM-01..08 fixtures, loading-announcement.tsx), none present in 0dd1ba7 or MB.
- Every base-only file (71): merged blob == 0dd1ba7 blob (nothing of #77/#80 dropped).
- Every ours-only file (107): merged blob == 001cdbf blob, and 0dd1ba7 blob == MB blob, so its diff vs new base == this PR's own change.
- 5 overlap files: diff vs base == ours' hunks only (Part 1).
- Semantic-revert scan: NO REVERT FOUND.
  - No Playwright/axe version string, no Chromium build number (1194/1248), no browser.json/browser-builds, no .png baseline in the diff vs base.
  - No MOD-13/MOD-14/CI-18..20 row, registry entry or fixture removed (all present in md, ts, registry, fixtures).
  - No old header names (aria-label "Practice switcher"/"Account menu", removed by #77's shell.tsx) anywhere in ae26bf7; this PR's specs use data-slot="app-header", which exists (shell.tsx:330).
  - Nothing of #80 (model-gateway redact, worker packets identifiers/services, narrative-drafts) in the diff; no "redact" line.
  - This PR's styles.css/button.tsx/input.tsx changes target form controls, aria-pressed/aria-disabled buttons, refused fields and scroll-padding; the header (summaries + lockup) and report covers hold none, so #77's regenerated brand baselines are not contradicted (not run: e2e not executed here).
  - Stale "1.56.1"/"1194" strings in ae26bf7 are only in base-only files (ADR 0058/0066 history, browser-build.test.ts, measure.test.ts test data), identical to 0dd1ba7.
  - Harness (test-support/browser.ts) uses @playwright/test's chromium.executablePath(), so after the merge it needs Chromium 1248 (installed in /opt/pw-browsers); no package.json/lockfile change by this PR.
- Extra: FRM-01 and FRM-08 fixtures (fixtures/synthetic/FRM-0{1,8}/expected.json) carry the matrix.ts text, not the md text -> after fixing matrix.ts, regenerate with pnpm synth.

Part 2 DONE. AUDIT COMPLETE.
