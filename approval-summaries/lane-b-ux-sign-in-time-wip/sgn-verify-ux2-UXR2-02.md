# UXR2-02 verify (b8654622) - DONE
- step-heading.tsx:15 marker uses text-muted-foreground; layout.tsx:11 bg-paper fixed.
- Dark --pw-fg-muted #A7B1C2 on #F6F4EE = 1.97:1 (arithmetic correct); light #526070 = 5.85:1 pass.
- Dark is unreachable: ADR 0056:137-140 and :166 - no toggle, no prefers-color-scheme hook; only forced in harness shots.
- Pre-existing: h1 and lockup on same ground fail worse in dark before the PR.
- Verdict: not a defect in this PR (no realistic user state); keep at most as advisory note for dark-mode work.
