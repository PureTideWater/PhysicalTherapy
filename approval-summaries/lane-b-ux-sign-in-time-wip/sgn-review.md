# sgn-review progress (started)
- read design whole (done). next: verify cites in code
## Cites verified OK (sampled ~60): pending.ts 15-17/23-26/33-37; seal.ts 39-46,43,57-66; sessions.ts:20,:78; routes/sign-in.ts 23-35,38,86,91-122,135-140,145-152,158-163,172-175,201-204,228-231,270-278,306-308,319-322,346; sign-in.ts 44-50,119-134,163-178,230-237; pages all; notice 6-18,14,16,20-31; next.ts 20-22,25,27-38,60; handler 47-49; sign-in-for 9-17; field 20-25,68-75,82,92; form-issues 175-181,577,591; hardware-key 62-64,91-95,144-152; action-form 89,163; alert 6-14,18-19; refusal-notice 38-55; words 9-11; minutesWords:69; schemas:22; rate-limit:39; services:183; playwright 92,126; sec-headers 69,83; identity.ts 7-8,11,14,23,41-42,82,108; identity.test:109; primitives.test 65-77; dev-provider 25-26,47-48,88-90; routes db test 49,58-73,86-110,150,172,182-186,217-224,234; personas 31-32,142-155; seed.ts:87; onboarding.ts:119; matrix.ts 502-508; registry 731-738; types:9; common:18; fixtures.test 33-44; test-matrix 353-365; ADR0016 3,30-31; ADR0077 47,67,246,142-150; 0056:57; sessions.md:17; browser.ts 75-80; forms-harness 16,29-32,48,272
## Findings so far (draft)
- F1 should-fix: use 'temporary' wrong when setNewPassword saved but beginTotpSetup (inside settle) refuses expired -> kept says temporary; fix write use:'chosen' as soon as newPassword returns pending/non-invalid
- F2 nit: dev-provider.test.ts:83 already tests 3-min expiry hard-coded; put SGN-01 dev assertion there w/ constant, list in registry
- F3 nit: StepName written out + _same check unnecessary: `import type { Pending }` is erased; leaf stays runtime-free
- F4 should-fix(UX): enroll CardContent is flex gap-4: empty region still takes a gap; must not use display:none; specify margin only when speaking
- F5 nit: ArrivalFocus duplicates RefusalTakeover (takesFocus guard); reuse/generalise
- F6 should-fix UX: Start again link must stay the same DOM node warning->closed or focus drops (2.4.3); test it
- F7 should-fix UX: region below form likely off-screen at 390 px with on-screen keyboard; add a check at 390x(short) / mitigation
- F8 should-fix: hardware-key/page.tsx:17 also renders SignInNotice; not in slice C; kept optional; step_expired words "email and password" wrong there (PR 7 hook)
- F9 nit: ADR 0077 Status line should list "amended by 0081" (house style, 0056:3-5)
- F10 nit: "within a minute" vs digits rule/counted(); "within 1 minute"
- F11 nit: 2.6 table "Shown ... as the notice's words" ambiguous: the notice never prints the address
- F12 nit: rolling deploy: old task 404s ?reason=restarted (reasonParams enum) — record in sec 8
- F13 nit: render-to-mount latency on slow phones is seconds, not <1s; correct full loads with PerformanceNavigationTiming.responseStart
- F14 nit: privacy notice (#51, counsel) — record the new sealed email cookie (strictly necessary) for the founder; legal-surfaces.md is #42's
- F15 nit: staff with TOTP reset AND a key gets "Step 1 of 2" then key sign-in; count only when status invited or accept/record
#42: open draft be63bdc2, 219 files; comm -12 with design's files = 3 shared docs only (verified). All new files marked new.
NEXT: write review.md
DONE: review.md written (R-01..R-15)
