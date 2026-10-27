# PR #74 before/after shots (progress)
Started 2026-10-27. No earlier shots.md: fresh start.
Work files: scratchpad/shots-work/ (sample.py = the sample; tour-only.txt = TOUR_ONLY; tour.spec.orig.ts and route-map.orig.json = originals before my edits; routemap_edit.py).

## Sample (51 states x 1280, 1280-dark, 390 = 153 ids): `python3 -I shots-work/sample.py` prints the table
Design 10.1 rows + layouts (sign-in.default, request-audit.default, support.default, console.billing.default, account.notifications.default, p.cases.default).
New states added to the tour: support.error-unconfirmed, support.error-stale, console.status.error-row, p.coverage.checklist-review, p.coverage.checklist-review-sent.
Existing already: sign-in.error-wrong-password.390 (the task's "e.g." was wrong there).

## Spec edits (tools/lane-b-screen-tour/capture/tour.spec.ts on claude/build-ops, uncommitted) -- DONE
- darkAsked(): a dark id named in full in TOUR_ONLY is taken for any state (snap, cap, capLoading, capHeld).
- heldShot: pending = button named busy OR [data-slot="pending-status"] with busy text (the PR moves "Working..." off the button).
- hardware key busy regex /Waiting for (the|your hardware) key/; register-key refusal /Not signed in|Not registered/.
- lockout loop: 'Account locked' matched on [data-slot="alert"], [role="alert"] (the PR's summary is data-slot=refusal-summary).
- STALE + staleToken(); console.status error-row; support error-unconfirmed, error-stale; expectChecklist() + p.coverage checklist block; unreached() in afterAll for TOUR_ONLY runs.
- esbuild syntax check OK.
## route-map.json edits -- DONE (/support error (3)(4), /console/status error-row, coverage interaction + notes, hardware-key/register-key/sign-in loading notes)

## Gallery tool edits (tools/lane-b-screen-gallery on claude/build-ops, uncommitted) -- DONE
- convert.py/build.py: GALLERY_SHOTS=<TOUR_DIR>/shots.json for any tour run (default unchanged: the baseline manifest); convert makes its dirs, reconverts a newer PNG; build: GALLERY_TITLE, GALLERY_LEDE, own template fallback, prunes extra pub images; template: __TITLE__/__LEDE__/__NOTE_HEADING__, no verdict -> "Not checked", verdict filter hidden. README updated. Originals in shots-work/gallery-orig-*.

## Runs
- before: setup.sh OK (ready at e908c214, 14:4x); build.sh (TOUR_MINUTES=45) started in background; run.sh with TOUR_ONLY=tour-only.txt started in background
- [ ] before (TOUR_REF=e908c21, TOUR_DIR=scratchpad/screens-before)
- [ ] after (TOUR_REF=origin/co-001/ux-forms = 4f0b526 checked, TOUR_DIR=scratchpad/screens-after)
- [ ] tiles
- [ ] gallery files

## For proposals: pages the PR changes outside the sample ("not seen, by sample")
abstraction/regulations (p.abstraction-regulations.default), abstraction/versions/[versionId] (p.abstraction-version.default, .error-amend), packet (p.packet.default, .drafter, .approver-ready), packet review (p.packet-review.default, .error-needs-downloads), lines/[lineId] (p.line.default, .error), pricing-runs (p.pricing-runs.default, .error), pricing-runs/[runId] (p.pricing-run.default), compare (p.compare.default), reconciliation (p.reconciliation.default, .error-reverse, .error-empty-file), releases (p.releases.default), reports (p.reports.default), reports/[reportId]/review (p.report-review.default), settings/agreements (p.agreements.default), settings/proof-level (p.proof-level.default), settings/defaults component (p.defaults.default, .error), uploads (uploader: p.uploads.default, .error-receipts), settings/billing/[organizationId] (stripe-payment-method: settings.billing-org.default).
- before: build done 14:48:40; server ready 14:49:17; populate 11 passed (3.2 min, exit 0); capture start 14:52:30; RECORDS 46 found, none missing; sign-in shots incl. dark of error states OK.
- post-run script: shots-work/post.sh <before|after> (tile.py with the sample's prefixes; convert.py + build.py into scratchpad/gallery-<run>/gallery/pub1280, pub390)
- before capture: exit 0 at 14:57:44, 150 shots, 3 skipped: console.models.error.{1280,1280-dark,390}. Cause: since the budget became dollars, the old step's "5.00" was ACCEPTED at 1280 and set a global model.daily_budget_cents=500 on the synthetic tour DB (deleted by SQL at once, ~14:58); the 390 attempt then met two "Flag" labels. Spec fixed (form-scoped, value "5 dollars"); same-DB retake of console.models.error.* next.
- before retake (same DB, TOUR_SKIP_POPULATE=1): console.models.error.* 3 shots OK; no feature_flag row left. shots.json: 153 shots, 0 skipped.
- before stop: server stopped 14:58:22 (lock held ~14:47-14:58:22, build ~80 s incl.), fuser 3297 empty; DB tp_e2e_screens dropped; /tmp/tp-e2e-tp_e2e_screens-* removed. BEFORE RUN DONE.
- next: after setup (TOUR_REF=origin/co-001/ux-forms; check 4f0b526)
- before post.sh (under the lock, 31 s): 153 shots tiled into 408 tiles -> scratchpad/screens-before/tiles (index.json); WebP 8.1 MB; galleries scratchpad/gallery-before/gallery/pub1280 (102 shots, index.html + s/0001..0102.webp) and pub390 (51). Placeholders all replaced. BEFORE POST DONE.
- after: setup.sh OK, /home/user/screens at 4f0b526d (origin/co-001/ux-forms = 4f0b526 checked); build.sh (TOUR_MINUTES=45) + run.sh (same TOUR_ONLY) started in background.
- note: before's console.models.error.* were retaken after the checklist steps, so their "Spend today" table reads LAYOUT 2 calls (the after's, taken in order, will read 0): a data difference, not the PR's.
- observed: p.contracts.error's step picks getByLabel('Payer').first() = the FILTER form's Payer (left reading SYNTHETIC PAYER C, not applied); same in both runs; proposal: scope the step to the tag form (not changed now: the after run already uses the copied spec).

## Sample table (route | state | role | ids)
- /sign-in | default | public | sign-in.default.{1280,1280-dark,390}
- /sign-in | error | public | sign-in.error-wrong-password.{1280,1280-dark,390}
- /sign-in | error | public | sign-in.error-locked.{1280,1280-dark,390}
- /sign-in/mfa | default | billing-manager | sign-in-mfa.default.{1280,1280-dark,390}
- /sign-in/mfa | error | billing-manager | sign-in-mfa.error.{1280,1280-dark,390}
- /sign-in/enroll | default | invited | sign-in-enroll.default.{1280,1280-dark,390}
- /sign-in/enroll | error | invited | sign-in-enroll.error.{1280,1280-dark,390}
- /sign-in/new-password | default | invited | sign-in-new-password.default.{1280,1280-dark,390}
- /sign-in/new-password | error | invited | sign-in-new-password.error-mismatch.{1280,1280-dark,390}
- /sign-in/new-password | error | invited | sign-in-new-password.error-policy.{1280,1280-dark,390}
- /sign-in/hardware-key | default | public | sign-in-hardware-key.default.{1280,1280-dark,390}
- /sign-in/hardware-key | loading | public | sign-in-hardware-key.loading.{1280,1280-dark,390}
- /sign-in/hardware-key | error | public | sign-in-hardware-key.error-no-credential.{1280,1280-dark,390}
- /sign-in/hardware-key | error | public | sign-in-hardware-key.error-locked.{1280,1280-dark,390}
- /sign-in/register-key | default | reviewer | sign-in-register-key.default.{1280,1280-dark,390}
- /sign-in/register-key | loading | reviewer | sign-in-register-key.loading.{1280,1280-dark,390}
- /sign-in/register-key | error | support-expiry | sign-in-register-key.error.{1280,1280-dark,390}
- /request-audit | default | public | request-audit.default.{1280,1280-dark,390}
- /request-audit | error | public | request-audit.error.{1280,1280-dark,390}
- /support | default | billing-manager | support.default.{1280,1280-dark,390}
- /support | error | billing-manager | support.error.{1280,1280-dark,390}
- /support | error | billing-manager | support.error-unconfirmed.{1280,1280-dark,390}
- /support | error | billing-manager | support.error-stale.{1280,1280-dark,390}
- /console/status | error | platform-admin | console.status.error.{1280,1280-dark,390}
- /console/status | error | platform-admin | console.status.error-row.{1280,1280-dark,390}
- /console/models | error | platform-admin | console.models.error.{1280,1280-dark,390}
- /console/practices/[practiceId] | error | platform-admin | console.practice.error.{1280,1280-dark,390}
- /console/organizations/[organizationId] | default | platform-admin | console.organization.default.{1280,1280-dark,390}
- /console/organizations/[organizationId] | error | platform-admin | console.organization.error.{1280,1280-dark,390}
- /console/terms | default | platform-admin | console.terms.default.{1280,1280-dark,390}
- /console/terms | error | platform-admin | console.terms.error.{1280,1280-dark,390}
- /console/compliance | default | platform-admin | console.compliance.default.{1280,1280-dark,390}
- /console/compliance | error | platform-admin | console.compliance.error.{1280,1280-dark,390}
- /console/billing | default | platform-admin | console.billing.default.{1280,1280-dark,390}
- /console/screening | error | contract-specialist | console.screening.error.{1280,1280-dark,390}
- /settings/billing | loading | practice-admin | settings.billing.loading.{1280,1280-dark,390}
- /settings/billing/[organizationId] | error | other-admin | settings.billing-org.error.{1280,1280-dark,390}
- /settings/organizations/[organizationId]/users | error | practice-admin | settings.users.error.{1280,1280-dark,390}
- /account/notifications | default | billing-manager | account.notifications.default.{1280,1280-dark,390}
- /p/[practiceId]/cases | default | packet-approver | p.cases.default.{1280,1280-dark,390}
- /p/[practiceId]/cases | loading | packet-approver | p.cases.loading.{1280,1280-dark,390}
- /p/[practiceId]/cases/[caseId] | error | packet-approver | p.case.error.{1280,1280-dark,390}
- /p/[practiceId]/cases/[caseId]/submissions | error | packet-approver | p.submissions.error.{1280,1280-dark,390}
- /p/[practiceId]/abstraction/ledger | error | contract-specialist | p.abstraction-ledger.error-adjust-zero.{1280,1280-dark,390}
- /p/[practiceId]/reports/roi | error | ledger-manager | p.roi.error.{1280,1280-dark,390}
- /p/[practiceId]/settings/pricing | error | billing-manager | p.pricing-settings.error.{1280,1280-dark,390}
- /p/[practiceId]/settings/correspondence | error | other-admin | p.correspondence.error.{1280,1280-dark,390}
- /p/[practiceId]/contracts | default | era-manager | p.contracts.default.{1280,1280-dark,390}
- /p/[practiceId]/contracts | error | era-manager | p.contracts.error.{1280,1280-dark,390}
- /p/[practiceId]/coverage | interaction:checklist-review | pricing-manager | p.coverage.checklist-review.{1280,1280-dark,390}
- /p/[practiceId]/coverage | interaction:checklist-review-sent | pricing-manager | p.coverage.checklist-review-sent.{1280,1280-dark,390}
- after: build done 15:01:18; server ready 15:01:55; populate 11 passed (3.0 min, exit 0); capture start 15:04:58.
- after capture: exit 0 at 15:10:02, 153 shots, 0 skipped (no retake needed; console.models.error refused, no flag written: feature_flag count 0).
- after stop: server stopped 15:10:14 (lock held ~14:59:30-15:10:14), fuser 3297 empty; DB dropped; /tmp/tp-e2e-tp_e2e_screens-* removed. AFTER RUN DONE.
- data notes: after's seed adds forms-invited and forms-signin members (the PR's synthetic-personas.ts), visible on console.organization.* and settings.users.*.
- after post.sh: first try failed (console.compliance.error.390 after is 16,395 px > WebP 16,383); convert.py now scales such a shot (gallery/w390/scaled.json) and build.py notes it. Rerun: 153 shots -> 424 tiles; WebP 9.6 MB; pub1280 102, pub390 51.
- gallery render check (Chromium under the lock, shots-work/galcheck/check.cjs): all four pages load, 102/51 cards, 0 broken images, 0 console errors, verdict filter hidden, "Checker: Not checked", "Capture note".
- READMEs updated: tour README (dark-on-request, unreached, pending-status notes; "A pull request's before and after: PR #74" section), gallery README (GALLERY_SHOTS etc., WebP limit).
## Outputs
- tiles: scratchpad/screens-before/tiles (index.json), scratchpad/screens-after/tiles (index.json)
- galleries: scratchpad/gallery-before/gallery/pub1280, pub390; scratchpad/gallery-after/gallery/pub1280, pub390 (each index.html + s/NNNN.webp); not published.
ALL STEPS DONE; remaining: final return.
