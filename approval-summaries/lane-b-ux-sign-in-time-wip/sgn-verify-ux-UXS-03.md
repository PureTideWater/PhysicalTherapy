# UXS-03 verify
- cloned uxs03-clone at e4e05a0d
- step-timer.tsx:153 visible = phase ?? 'open'; open phrase :66 fixed to the full limit; phase is undefined until useEffect.
- sign-in.ts:241 closesIn = closesAt - now on every request, so a reload mid-step renders a smaller closesIn but the same "stays open for 3 minutes".
- Design 2.3/6.1 specify only the fresh-step phrase; nothing in 9 addresses a reload mid-step.
- Realistic: phone browsers discard a background tab while the person is in the authenticator app, and reload it on return.
- With script: after a reload at 60 s, the cue reads "3 minutes" for 60 s with 2 left; reload past 120 s flips at hydration (check() runs at once). Without script: stale for good.
- Verdict: real; should-fix is about right (lean low: the warning still fires on time with script). Fix is sound; simpler: compare ceil minutes against the limit instead of a 5 s grace.
