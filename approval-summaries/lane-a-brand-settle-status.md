ACTING (Lane A's account, https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu) holds this item from 2026-11-04T23:25Z, assigned by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) at 23:23Z. It is QUEUED: it starts after pricing-run-cutoff merges and before the emails.

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

## Waiting on someone
- None.

## Next step
Starts when pricing-run-cutoff merges.
