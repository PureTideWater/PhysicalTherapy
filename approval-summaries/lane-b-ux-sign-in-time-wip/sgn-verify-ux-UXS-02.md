# UXS-02 verify
- clone at /tmp/claude-0/-home-user-PhysicalTherapy/4a9d4438-0635-51b1-98ea-4663abfca5c5/scratchpad/uxs02-clone (e4e05a0d)
- notice.tsx:74 Alert role=status, :79 wrapped in ArrivalFocus for step_expired/restarted; arrival-focus.tsx:14-18 focuses wrapper div when activeElement is body. Confirmed.
- notice.test.tsx:60-70 deliberately asserts restart notice "stays a polite status" + wrapped.
- Arrivals via Start again Link and server-action redirect are client navs -> new role=status node inserted with text, then focus. WebKit posts LiveRegionCreated (VO+Safari speaks it) -> plausible double read; NVDA+Chrome usually silent for inserted status. Full reload: read once.
- hardware-key.tsx:44 precedent is role=alert (Alert default), not note: reviewer's cited pattern is off.
- Verdict: real, should-fix (low end); better fix = role note for restart reasons (Alert defaults role=alert so explicit), focus on the Alert itself; update SGN-03 test.
