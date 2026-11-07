# scout-proposals progress
Started 2026-11-07. Tree /home/user/ux-forms-after-42 at 31a7345f. Siblings: scout-console, scout-upload, scout-words (done) cover 7.8 rows; this scout = 11.2, 12.2 open list, status list, shell/loading, separator, onboarding tag, FormKeys test, shot list.
- [x] read 7.8, 7.9, 11.2, 12.2 left-open 1-10, 12.3/12.4, status, ADR 0077 Rejected/Not covered/Revisit
## Findings
- 11.2.2 Notice PR: NOT done. ?notice= still plain <Alert> (users page :41-46 title "Done"; cases/page.tsx:62). ArrivalNotice (components/arrival-focus.tsx:14, role=note, focus once) exists from ADR 0081 for sign-in only. -> out of scope (own PR across ~20 pages)
- 11.2.3 noValidate: not done; ADR 0077:207 "Kept for later"; Revisit :277 ties to words pass. -> out of scope (after words pass, app-wide)
- 11.2.4 loading: aria-busy REJECTED since by #74 itself (packages/ui loading-state.tsx:18-19 "never aria-busy", ADR 0077). Loading done via role=status LoadingAnnouncement. 40 loading.tsx render own <main> outside AppShell (cases/loading.tsx:6) -> shell frame lost while loading. Only layouts: app/layout.tsx, sign-in/layout.tsx. -> out of scope (shell frame needs layouts per area)
- 11.2.5 skip link: not done (no "Skip to" in src; shell.tsx :353 <main> no id). shell.tsx is #42-era; small, same kind? -> recommend own small PR or here? (decide)
- 11.2.6 write-off default: DONE by #85 (17641c88)
- 12.2.6 users Members table: no ScrollTable (users page :52); invitations got sm list :122. -> IN SCOPE (file changes)
- 12.2.9 console 4 pages: DONE (ScrollTable on compliance :175, billing :52, terms :32, organizations :120; onboarding.spec atPhoneWidth :155,:179,:425)
- users page: no atPhoneWidth step (onboarding.spec.ts:232 expectAccessible only)
- 11.2.7 audit #103 manual 3.3.7/3.3.8/2.4.11: no doc cites them yet (only ADR 0077/0078/0081) -> out of scope
- 11.2.8 csrf reason: not done; define.ts now :230-233 (design :169-172), invoke.ts :153,:156,:383,:416,:476,:536; http.test.ts :88-90,:129-130,:158 is #129's file -> out of scope, own security PR after #129
- "enter at most {n}": not done: settings.ts:439-441 'at most 100 characters' (IN SCOPE: settings.ts changes for ZIP), :435,:438; packets.ts:175, submissions.ts:166,:276 (out: own words pass)
- separator: summary joins `${name}: ${message}` form-issues.tsx:608,:676; inner-colon messages: screening/routes.ts:348,:352,:614; settings.ts:267; support.ts:379; onboarding.ts:34; reconciliation.ts:130; mapping.ts:420; console-mail.ts:200; sign-in.ts:418,:638,:723; console.ts:835; compliance.ts:142,:152,:216 (16 by regex; consts missed)
- FormKeys static test: count mismatch files (crude): convert-form, split-form, defaults.tsx (factory from page), payment-method-card, months.tsx, sign-in pages (public, no FormKeys by design?), request-audit; FormKeys = components/form-keys.tsx; requestKey refusal invoke.ts:108
- onboarding tag: onboarding.spec.ts:78 randomUUID().slice(0,8) -> clinic :79 and request-audit; :357 too. Same pattern ledger.ts:61, mail-cutoff.spec.ts:65 (screening practice name, no-PHI check!), mail-notices.spec.ts:21, mapping.spec.ts:83
- tour: README ids <key>.<variant>.<width>[-dark]; TOUR_ONLY. keys: screening (default, file-ready, error-member-id, error-dos, error-zip, error-no-phi; tour.spec.ts:1733-1790), console.support (default, error :2120-2134), settings.users (default, error, notice-invited, end-membership-ticked :2325-2350), console.organization (error: internal email :1966-1977), console.practice error ZIP :1987-1998, p.pricing-settings error ZIP :3759+
- status list: RadioGroup none (2 raw radios); CheckboxGroup no id prop / no per-box msg (field.tsx:395-410); SETTINGS_LABELS console/practices/[id]/page.tsx:29-40 is a typed label record, used as labels (7 uses) -> no change; FORMS_HARNESS_CHROMIUM only in test-support/browser.ts:16-24 -> out
- 12.2.7 tour: error-unconfirmed :2187, error-stale :2212 DONE; error-duplicate/cleared, grid/row form NOT -> out (build-ops)
- 12.2.8 split test move: not done -> out; 12.2.10 -> out; 12.2.4 support hint -> needs ruling, out
- NEW: users page Invitations renders ResendForm in BOTH copies (ul :122-130 sm:hidden + table :132-155), each own FormKeys -> ADR 0077 "Not covered" says no page does yet (wrong now). Members table :52 no ScrollTable.
- #126/#129 files fetched (local refs pr/126, pr/129 only). Shared with this item: test-matrix.md, matrix.ts (+registry.ts, watched-paths.txt #126); #129 also .claude/agents/ux-brand-reviewer.md, BRAND.md, http.test.ts, sign-in/forgot-password/page.tsx
- separator exact words drafted (see report); consts: screening/routes.ts:294, packets/view.ts:38, triage/queries.ts:68, settings.ts:426,:902, mapping.ts:411
- tour error shots for separator pass: console.compliance.error, sign-in-mfa.error, sign-in-new-password.error-mismatch, support/status etc
- STATUS: composing report (2026-11-07)
