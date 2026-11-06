ACTING (Lane A's account, https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu) holds this item from 2026-11-04T23:25Z, assigned by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) at 23:23Z. It is DONE: #121 merged as f185655c at 2026-11-05T04:03Z.

# Item: brand-settle (`co-001/brand-settle`)

The co-founder's brand rulings of 2026-11-04 (~22:50 UTC), in `approval-summaries/founder-asks-2026-10-27.md`,
"Brand rulings, 2026-11-04":
1. Sign-in sits on Paper in light mode and on the dark ground (`--pw-bg`) in dark mode, as #116 built; the reversed stacked
   lockup and seal on dark.
2. BRAND.md section 4 reads "Paper: report covers, print, and the light-theme sign-in". This settles the section 3/4/7
   disagreement ADR 0056 records.
3. `--pw-unpriced` is darkened to at least 4.5:1 on `--pw-unpriced-bg`, so the unpriced status can use its own color
   for text.
4. Dark mode stays off until a dark-mode pass over every screen, PHI screens first. It then follows prefers-color-scheme,
   with an override in settings. That pass is queued for Lane B, not this item; this item records the ship rule only.
Scope:
- the ADR 0056 amendment, recording rulings 1 to 3 and 4's ship rule, in place of its "Readings of the specification"
  paragraph;
- BRAND.md section 4's wording;
- the `--pw-unpriced` darkening in the single token source, with a contrast test that fails first: the text at least 4.5:1
  on its tint, and its chip border still distinct;
- the unpriced status text takes `--pw-unpriced` instead of Slate, wherever ADR 0056 chose Slate because of the low contrast.
One UX and brand review with before and after shots (1280 and 390 px light, 1280 dark), then CI and the merge.
GITLEAKS RULE: an agent that meets a gitleaks refusal rewrites the flagged text and never touches .gitleaksignore.

## Log (UTC)
- 2026-11-04T23:25:00Z: assigned; queued behind pricing-run-cutoff (wf_cdca5fda-8a5).

- 2026-11-05T01:10:00Z: started. Worktree /home/user/brand-settle, branch co-001/brand-settle, base 370b8973 (#119).
  Workflow wf_56da560b-1ec runs design, build (red first, shots, draft PR), one UX and brand review with skeptics,
  one fix round (full suite once) and verification. Script archived as workflow-scripts/lane-a-brand-settle.js.

- 2026-11-05T02:55Z: draft PR #121.
  - Value: #646E7C, 4.61:1 on its tint, tested red first (c9104c1c) and green (2ffbd223). Dark is unchanged at 6.18:1.
  - The UX and brand review found N1 to N5, all fixed or noted, and P1 (S, pre-existing, Lane B's UX PR 4b).
  - The fix round's agent returned early with its suite unfinished. I merged 54d061fd (#118) and ran the full suite once
    on ed5b2a0a: every step passed.
  - The base moved to af3e79f3 (#120, no common file). Merged in 8a9f6880; the touched tests passed. Pushed 8a9f6880.
  - The description was updated. CI on 062db660 had db (1/4) fail on the known load.db.test.ts flake
    (lane-a-wip/flaky-load).

- 2026-11-05T03:00Z: the orchestrator ruled:
  - take #5F6A79, the brand owner's F3 value, for a margin on small chip text;
  - keep the ADR 0058 line;
  - P1 goes to UX PR 4b's queue (done);
  - the load flake is #110's.
  Done:
  - the margin test fe5cde6b, red on #646E7C (4.608 < 4.8);
  - the token cb26278a: 4.90 on its tint, 5.49 on White, 3.82 against Line, 1.17:1 and OKLab dE 3.7 from Slate;
    dark unchanged;
  - docs 7fa2b971;
  - shots re-taken: an exact color swap.
  The full suite passed once on 7fa2b971. Pushed; the description was updated and read back.
- 2026-11-05T04:03Z: MERGED. CI on 7fa2b971 was green (all green, mutation, screening-capacity gate,
  approval-of-record after ready). Merged as f185655c, method merge, expectedHeadSha 7fa2b971. Unsubscribed; the
  check-in was deleted.

## Waiting on someone
- None.

## Next step
None: done. The worktree /home/user/brand-settle can be removed.
