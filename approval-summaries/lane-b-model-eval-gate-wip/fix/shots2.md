# PR #75 fix-2 screens: the new over-long-document notice (co-001/contract-phi-check at 4b886fcc)

All data is synthetic. The PNGs and tiles are in the session scratchpad, and none is in a git tree. I checked /home/user/ops, /home/user/screens, /home/user/PhysicalTherapy and /home/user/contract-phi-check: no PNG is changed or untracked in any of them. Nothing was committed or pushed.

## What a person sees that changed
I read fix/fix2.md, fix/check2.md and the web diff from f5292c6c to HEAD (`apps/web/src`, without tests). One string a person sees is new:
- `apps/web/src/lib/models/notices.ts:54`, `too_long`: "This document is too long to send to the model, so nothing was sent. Enter its terms by hand below."
  - check2 did not change it. It changed only the internal refusal message (`TOO_LONG_MESSAGE`, now in bytes) and doc comments.
  - `path.ts` only maps the code. The version page's `?model=` param is `z.enum(MODEL_NOTICES)`, which spreads `MODEL_PROBLEMS`, so `?model=too_long` shows the notice.
- The other strings fix 2 and check 2 changed are not shown to a person: the gateway's refusal message, and the construction errors in `patient-records.ts`.

## The run
- **TOUR_REF** = 4b886fcc… (`git -C /home/user/contract-phi-check rev-parse HEAD`; the worktree was clean). setup.sh checked /home/user/screens out at 4b886fcc. It was clean before, at 53076d28.
- **TOUR_DIR** = /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix2
- **TOUR_ONLY** = `p.abstraction-version.model-too-long.*,p.abstraction-version.model-names-patient.*`
- **Commands.** PATH was /opt/node24/bin:/opt/py312-ci/bin:$PATH:/opt/node22/bin. Every command followed the README:
  - `bash tools/lane-b-screen-tour/setup.sh`, from /home/user/ops (setup.log in TOUR_DIR);
  - `TOUR_MINUTES=30 flock /tmp/laneb-heavy.lock bash build.sh > build.log 2>&1`, in the background;
  - `bash run.sh`, with the TOUR_ONLY above, in the background;
  - `touch $TOUR_DIR/stop`.
- **Times (UTC):**
  - The lock was free and was taken at 02:12:37 (lock.log).
  - The build compiled in 67 s, and the server was ready at 02:14:58.
  - Populate: 11 passed in 3.1 min, exit 0.
  - Capture: 02:18:06 to 02:18:23. All 6 tests passed: "6 shots taken this run; shots.json holds 6 shots and 0 skipped". It found all 46 records, with none missing.
- **Stop:**
  - `stop` was touched at 02:20:53, after I had checked the shots by eye.
  - build.log says "server stopped at 02:20:55", and build.sh, which held the lock, exited 0 at 02:20:55. The lock was held for about 8.3 minutes and is free now.
  - Afterwards `fuser 3297/tcp` printed nothing (exit 1).
- **Tiles:** I ran `/usr/bin/python3 -I tools/lane-b-screen-tour/tile.py <TOUR_DIR> p.abstraction-version.model-too-long. p.abstraction-version.model-names-patient.` from /home/user/ops. It printed "6 shots tiled into 26 tiles". They are under `<TOUR_DIR>/tiles/<id>/NN.png` and listed in `<TOUR_DIR>/tiles/index.json`.
- **Clean-up (README step 6):**
  - `DROP DATABASE IF EXISTS tp_e2e_screens WITH (FORCE)` printed DROP DATABASE.
  - I removed the five `/tmp/tp-e2e-tp_e2e_screens-*` directories (billing, dev-auth, documents, mail, model-outputs), and none is left.
  - The databases left at localhost:5433 were all there before: tp_e2e, tp_e2e_ux and three tp_test_*.
- **Retakes:** none was needed, and `skipped` is empty.

## What changed in /home/user/ops
The change is uncommitted. The only file touched is `tools/lane-b-screen-tour/capture/tour.spec.ts`, with 3 insertions and 2 deletions.
- In the model-notice loop at lines 2237 to 2239, `'too_long'` is added to the code list:
  - before: `for (const code of ['names_patient', 'screen_unavailable', 'screen_failed', 'screen_limited']) {`
  - after: `for (const code of ['names_patient', 'screen_unavailable', 'screen_failed', 'screen_limited', 'too_long']) {`
- The comment line above it, "// screen_failed and screen_limited came with the PR's fix round (the review's UX-3).", now reads "// screen_failed and screen_limited came with the PR's fix round (the review's UX-3), and too_long (the request's // byte cap, P11) with its second." It is wrapped onto two lines.
- The new ids come from the existing `code.replace('_', '-')`: `p.abstraction-version.model-too-long.{1280,1280-dark,390}`. The state is `interaction:model-too-long`.
- **Not changed:** `designs/lane-b-ux-review/route-map.json:760`. It still names only names_patient, screen_unavailable, screen_failed and screen_limited. The task allowed only tour.spec.ts, so whoever commits the spec should add too_long there.

## Shots
Each shot's screen, state and role come from `<TOUR_DIR>/shots.json`. All six are on the route `/p/[practiceId]/abstraction/versions/[versionId]`, as contract-specialist, on version 7d13b9fb of practice da6840f2 (SYNTHETIC FIXED SCHEDULE AGREEMENT, version 1, with SYNTHETIC PAYER Q). The number after each tiles path is its tile count.

| id | state | width | theme | PNG (size) | tiles |
|---|---|---|---|---|---|
| p.abstraction-version.model-too-long.1280 | interaction:model-too-long | 1280 | light | /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix2/png/p.abstraction-version.model-too-long.1280.png (1280x2492) | /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix2/tiles/p.abstraction-version.model-too-long.1280 (4) |
| p.abstraction-version.model-too-long.1280-dark | interaction:model-too-long | 1280 | dark (tokens only) | /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix2/png/p.abstraction-version.model-too-long.1280-dark.png (1280x2492) | /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix2/tiles/p.abstraction-version.model-too-long.1280-dark (4) |
| p.abstraction-version.model-too-long.390 | interaction:model-too-long | 390 | light | /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix2/png/p.abstraction-version.model-too-long.390.png (390x3746) | /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix2/tiles/p.abstraction-version.model-too-long.390 (5) |
| p.abstraction-version.model-names-patient.1280 | interaction:model-names-patient | 1280 | light | /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix2/png/p.abstraction-version.model-names-patient.1280.png (1280x2532) | /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix2/tiles/p.abstraction-version.model-names-patient.1280 (4) |
| p.abstraction-version.model-names-patient.1280-dark | interaction:model-names-patient | 1280 | dark (tokens only) | /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix2/png/p.abstraction-version.model-names-patient.1280-dark.png (1280x2532) | /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix2/tiles/p.abstraction-version.model-names-patient.1280-dark (4) |
| p.abstraction-version.model-names-patient.390 | interaction:model-names-patient | 390 | light | /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix2/png/p.abstraction-version.model-names-patient.390.png (390x3866) | /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix2/tiles/p.abstraction-version.model-names-patient.390 (5) |

## What I saw
I looked at every tile myself, and at 2x crops of the too_long notice at all three widths and themes (/tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/fix2-shots-crops/).

**The too_long notice (model-too-long.1280, .1280-dark, .390):**
- **Placement.** It is the "Nothing was proposed" card under "Pricing uses this version", where every model notice goes.
- **Words.** Its body reads "This document is too long to send to the model, so nothing was sent. Enter its terms by hand below.". That is notices.ts:54 word for word, punctuation included. No figure and no "AI" appear.
- **Not clipped.**
  - At 1280 it takes one line, and the card is y 357 to about 427.
  - At 390 it takes two lines, breaking after "to the model, so", and the card is y about 461 to 551.
  - The PNG at 390 is 390 px wide, so the page has no horizontal overflow.
- **Light colours:**
  - the title is the destructive token (181,69,46), 5.45:1 on white;
  - the body is the muted token (82,96,112), 6.43:1.
- **Dark tokens:**
  - the card's background is (11,22,38), the same as the page's;
  - the title is the lighter coral (232,132,107), 6.87:1;
  - the body is (167,177,194), 8.39:1;
  - the border is (36,54,84).
  - Each value is identical to the screens-fix `model-screen-unavailable.1280-dark` notice, so the new code uses the existing notice tokens.
  - The rest of the dark page (the rail, cards, buttons and fields) matches the other dark notice shots.

**The comparison, model-names-patient (.1280, .1280-dark, .390):**
- Its body reads notices.ts:56 word for word. It takes 3 lines at 1280 and 8 at 390.
- Its sizes are the same as in screens-fix: 1280x2532 and 390x3866.

**Pixel diff of too-long against names-patient, both from this run:**
- The rows from the top are identical through the notice's title: 0 to 397 at 1280, light and dark, and 0 to 500 at 390.
- The notice's text then differs: rows 398 to 411 at 1280, and 501 to 534 at 390.
- Below that, I shifted names-patient by its taller notice (40 px at 1280, 120 at 390). The rest is then identical except for antialiasing:
  - at 1280, rows 467 to 470 and 2246 to 2248 differ by at most 2 of 255;
  - at 1280, rows 1991 to 1994 differ by at most 15 of 255, and at 390, row 3183 does;
  - this is the edge of the "Draft the correction" button, the same rendering noise screens-fix recorded.

**Against screens-fix (53076d28):**
- too-long has the line count and height of screen-unavailable at 1280: one line, 1280x2492.
- At 390 it is one line shorter: 390x3746 against 3766.
- The other differences are data from the fresh prepare: the payer (Q here, N there), the receipt and approval times, and the document hash (266849ff against b5fa2685).

## Findings
- **No finding on the change.** The notice shows the exact words in notices.ts, at all three widths and themes, with nothing clipped and with the dark tokens of the other notices.
- **Not a finding, but for whoever reads the shots.** The tour opens the notice by its URL on a signed-off version, the only kind populate leaves, as screens-fix did.
  - So "Enter its terms by hand below" points at a page with no hand-entry form. Below the notice there are only "Amend", "Correct" and "Ask the practice".
  - In the product, the notice follows the model step on a draft version, where the hand-entry form sits below it.
  - This tour cannot show the draft forms: the route map's notReached "draft-forms" says so.
- **Seen, existing before this change, and in screens-fix too:**
  - at 390, the rate record's table clips its "Approved by" column inside the table's scroller ("specialist@synthetic.te", "02:15 UT"), the known finding that tables overflow at 390;
  - "The document's pages are still being read; try again in a minute" shows on the version's page and record;
  - the calendar icons in the date fields are faint in the dark shots.
- **Not seen, by sample:**
  - the gateway's internal `too_long` message, which no screen shows;
  - the operator surfaces of P12, which have no UI.
- **For the commit of the spec:** route-map.json:760 should add too_long to its list of `?model=` codes (see the section on /home/user/ops above).

## Files
- Shots: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix2/shots.json (6 shots, 0 skipped).
- Tiles: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/screens-fix2/tiles/index.json (26 tiles).
- Logs, all in the TOUR_DIR: setup.log, lock.log, build.log, run.log, populate.log, capture.log and progress.log.
- 2x crops: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/fix2-shots-crops/
- Progress: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/shots2.md
- The spec change: /home/user/ops/tools/lane-b-screen-tour/capture/tour.spec.ts. It is uncommitted; see `git -C /home/user/ops diff`.
