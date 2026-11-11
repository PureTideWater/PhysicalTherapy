# B review 3: UX and brand of the screening's "busy" refusal (/screening)

Head 7bcefc94 (branch co-001/screening-upload-bounded-wait) against origin/claude/build-platform. Read-only pass: I read the diff of
apps/web/src/lib/screening/messages.ts and routes.ts, the neighbouring refusals (messages.ts:222-246, routes.ts:865-899), the page's
refusal rendering (apps/web/src/components/screening/upload-form.tsx:137-160, :331; apps/web/src/components/form-issues.tsx:519-651),
the rate limit (apps/web/src/lib/http/rate-limit.ts:52), and the shots' manifest.md, after-text.txt and before-text.txt. I viewed
after-1280-light.png in full, cropped the alert from after-1280-light.png, after-1280-dark.png and after-390-light.png, and sampled
pixel colours for contrast. before-*.png were taken as described by the manifest and before-text.txt; I looked at one crop of
before-1280-light.png only. No tests or builds were run.

Verdict: no blocker. One should fix (one misleading word), three notes.

## Findings

### B3-1 should fix: "nothing was sent" is untrue in the page's own words
- Where: apps/web/src/lib/screening/messages.ts:235 (SCREENING_BUSY). Seen in after-1280-light.png, after-390-light.png and after-1280-dark.png, in the "Not done" alert.
- What a person meets: on this page "sent" means "left your browser". The page says "only its rows of totals are sent" (Your file),
  "refused before anything is sent" (File to screen hint), and its own file-refusal box (upload-form.tsx:408-411) says "Not sent ...
  Nothing was sent." when the browser kept the file. Here the rows did reach the server, and the server then rolled back. A careful
  reader, and this page asks people to read carefully about where their data goes, sees two claims that cannot both be true. The words
  that matter to them are what was kept and whether an email is coming. Both are true but not said. The sentence also says "send it
  again" while the button says "Screen the file", and the neighbouring refusals say "try again" (messages.ts:226 "Try again later";
  form-issues FIELDS_LEAD "then try again").
- Rule: words are exact and true (BRAND.md voice, "serious, exact, warm"); one name per thing across a screen (recommendation); WCAG
  3.3.1/3.3.3 asks only that the error is described and a fix suggested, which it is.
- Smallest fix (messages.ts:235 only, no migration or freeze exception; not legal text):
  `We could not take this screening just now, so nothing of it was stored and no result will be emailed. Wait a minute, then try again. If it happens again, request an audit instead.`
  This still names no other upload, practice or address. It keeps "request an audit" word for word, so refusalSentence (upload-form.tsx:144) still links it.
  Check the route's unit test or e2e assertion that pins the sentence, if there is one.

### B3-2 note: "Wait a minute" is fine as advice, but nothing promises that a minute is enough
- The other upload may be a slow 50,000-row file or a stuck transaction, so one minute is a guess. Because the sentence's fallback
  ("If it happens again, request an audit instead") gives a way out, it is not misleading. The retry budget fits too: 10 sends an hour
  per address (rate-limit.ts:52) leaves room for the two or three tries the sentence invites, assuming a refused send counts. Keep
  "a minute" rather than "a few minutes"; it matches "just now". No change needed.

### B3-3 note: role=alert and moving focus to the alert can announce it twice (house pattern; this change did not cause it)
- after-text.txt: the alert div (role=alert, tabindex=-1) takes focus; its name is "Not done" plus the sentence. Some screen readers speak a
  role=alert region when it appears and again when it takes focus. That is the RefusalSummary's behaviour for every refusal
  (form-issues.tsx:615, :629), so this refusal matches the house; it is not this change's to fix. The alert is the right role here: the
  error needs action (4.1.3). A screen-reader user hears "Not done", then the sentence with a link "request an audit". That is complete
  and is in reading order before the form.

### B3-4 note: the single refusal is a one-item bulleted list (house pattern)
- after-1280-light.png and after-390-light.png: one bullet under "Not done". This is the same as SCREENING_PAUSED.refusal and
  SCREENING_BOUNCE_BUDGET (all field "input"). It is consistent, so no change. The alert's outline measures about 1.4:1 in light and 1.5:1 in
  dark. It is not needed to identify the alert, because the heading and text do, so it is not a 1.4.11 failure. It is pre-existing.

## What is sound
- Behaviour (after-text.txt): every typed field kept (practice name, State MN, ZIP, work email; the empty optional fields stay empty,
  no default swapped in) and the chosen file kept (totals.csv, 484 bytes, still "The file is ready: 8 rows of totals ..."), so WCAG
  3.3.7 and the baseline's "a refusal keeps every value, files too" hold. URL stays /screening and holds no PHI. "Screen the file" is
  enabled again (no aria-disabled); "Working…" is cleared. Focus moves to the alert above the form (2.4.3, 4.1.3). This is a clear
  gain over the before (before-text.txt: focus on a disabled button, "Working…" with no end at 10 s and 12 s, no message).
- Privacy: the sentence names no practice, address or cause. The server log (routes.ts:772) carries only an error code and request id.
- Presentation: "Not done" in the danger colour, about 5.4:1 on white in light and 6.9:1 in dark. Body text about 6.4:1 light and 8.4:1 dark. Link
  about 8.0:1 light and 8.5:1 dark, underlined, so it differs by more than colour (1.4.1). At 390 px (after-390-light.png) the sentence wraps
  within the card and nothing is cut off. I could not measure sideways scroll from a full-page shot (see below). The link is
  inline in a sentence, so 2.5.8's inline exception applies. It says where it goes ("request an audit" opens /request-audit; 2.4.4).
  No brass, no palette colour outside the tokens seen; the lockup in the header is unchanged.
- Voice and punctuation match the neighbours: "We ..." first person plural, plain full sentences, "request an audit instead" ending
  as SCREENING_BOUNCE_BUDGET does, no build words ("lock", "timeout") shown to the person, no "AI" or hype.

## Not seen or not checked
- Not seen: the dark shot is tokens only (advisory; the app has no theme switch). There is no 390 px dark shot. There is no shot of a focus ring on the
  focused alert, so I did not check 2.4.7 or 2.4.11 for it. There is no shot of the refusal at 390 px taken from a send made at that width (the
  manifest says it was resized after the send).
- Not checked: horizontal overflow at 390 px by measurement (scrollWidth). Screen-reader speech beyond the aria snapshot. Whether a
  refused send uses up a rate-limit hit. Whether a send that waits on several locks in a row (lock_timeout is per lock) can wait well
  past three seconds before the refusal, during which "Working…" shows. Refresh and Back after the refusal.
