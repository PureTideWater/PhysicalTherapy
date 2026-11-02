# hom-verify ux-r1-UX-R1-04 (quarter key breaks at hyphen) - DONE
Clone: scratchpad/v04 at 87691be4. Probe: scratchpad/v04probe (built CSS + Plex Sans/Mono woff2 from /home/user/screens build of 87691be4).
- headline.tsx:79 renders quarter() as plain text; dates.tsx:25 WholeDates matches only YYYY-MM-DD; design D7 says both render whole.
- Chromium, real tile layout (sidebar w-64, main md:p-8, grid gap-3, tile p-4 + border): note width = (vw-344)/3-34.
  Viewport 768/800/810/820 (note 107-125px): "(2026-" / "Q4): $0.00" split (shot v04probe/q-820.png). 640, 700, 834+, 1024: whole.
  Isolated probe: split at note widths 105-128px for any amount ($0.00 to $123,456.78).
- Shots at 390/1280 miss it (390: one column, note wide; 1280: wide).
- Verdict: REAL, should-fix correct. Best fix: widen WholeDates regex to \d{4}-(?:\d{2}-\d{2}|Q[1-4]) and route the line through WholeDates; unit tests in dates and headline.
