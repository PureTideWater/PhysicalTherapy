# PaidWhole route map for screen tours

Every page of the web app (`apps/web/src/app/**/page.tsx`), mapped from the code of the build-platform branch at commit 6ddd587 for the Lane B UX/UI and brand baseline review (brief: `designs/lane-b-ux-review-brief.md`). 89 entries: the 83 pages that exist, one entry each (35 reachable on the seed, 48 after the populate step), and 6 paths that earlier lists named but that have no page. Synthetic data only: the seed (`apps/web/e2e/prepare.ts`) and the repository's own e2e journeys make every record.

## How to use it in a later tour
- `route-map.json` is the machine-readable map: one object per route with its page file, the personas the route admits (the first is the one to shoot it as), the permission check with file and line, how to find each dynamic segment's record (a SQL query or a click), the populate specs it needs, and its empty, loading, error and not-found states with how to reach each. `interactions` lists dialogs, details and filters worth their own shot, and flags every control that writes.
- `reachable` is `seed` when the page shows its intended content on a fresh prepare with no populate spec, `after-populate` when it needs the records the specs in `populateSpecs` make (run all of them), and `not-reachable` when there is no page.
- Personas list only who the route admits. The Forbidden state is a separate shot, named in `states.error` with the persona to use.
- Internal personas sign in with a hardware key that registers once per database, inside the browser context that registered it. Keys the populate step registers are gone at capture: packet-reviewer (packets.spec.ts), contracts-admin and contracts-specialist (contracts.spec.ts), reports-reviewer (reports.spec.ts). Capture with platform-admin, contract-specialist, reviewer, support and support-expiry, each registered by the capture itself (never add hardware-key.spec.ts to the populate step). A phone-width context can reuse a signed-in context's storageState, as the tour's `phone()` already does.
- The reviewer reaches a practice only through a support grant that the tour's platform-admin opens on screen at /console/support (Practice, `reviewer@synthetic.test (Reimbursement reviewer)`, a ticket such as SYN-TOUR-1, reason `SYNTHETIC SCREEN TOUR`): one on SYNTHETIC OTHER PRACTICE PACKETS, one on PACKET DEADLINES, one on REPORTS. Shoot `/` as `support`: a reviewer with a grant is redirected to a practice home it may not open.
- Every journey support grant (SYN-JOURNEY-*, SYN-CON-E2E) lasts four hours from populate. Take the contract-specialist and support-access shots inside that window.
- Loading states: a direct `page.goto` streams the fallback and the page in one response. Open another page of the same practice, hold with `page.route` only the navigation request to the target (header `rsc: 1`, no `next-router-prefetch`), click the in-app link, shoot once `[data-slot="loading-state"]` is visible, then continue the route. Do not wait for the loading state to detach first.
- Not-found is one global page (`app/not-found.tsx`, the public header, no shell), plus the screening result's own. Shoot each once: any random v4 UUID in a dynamic segment reaches it. A malformed ID or search parameter also gives 'Not found', not a validation message (a candidate finding).
- Dark: set `data-theme="dark"` on `document.documentElement` after each load (`apps/web/e2e/brand.spec.ts`).
- Writes: `?notice=`, `?saved=1` and similar URLs show success alerts without writing. Take every step marked as a write after the read-only shots, and undo it at once where the entry says how (suspend, then reinstate; maintenance on, then off). Never publish a terms version, switch the global model kill switch or approve a different place-of-service split mid-run.

## Routes

| Route | First persona | Reachable | Populate specs | States present |
|---|---|---|---|---|
| `/` | support | seed | none | empty (its only state) |
| `/account/devices` | practice-admin | after-populate | billing.spec.ts | empty (not reachable) |
| `/account/notifications` | billing-manager | seed | none | base state, loading |
| `/console/billing` | platform-admin | after-populate | billing.spec.ts | empty (not reachable), loading, error |
| `/console/compliance` | platform-admin | seed | none | empty, error |
| `/console/models` | platform-admin | seed | none | empty, error |
| `/console/organizations` | platform-admin | seed | none | empty (not reachable), error |
| `/console/organizations/[organizationId]` | platform-admin | seed | none | empty, error, not-found |
| `/console/practices/[practiceId]` | platform-admin | seed | none | empty, loading, error, not-found |
| `/console/prospects` | platform-admin | seed | none | empty |
| `/console/rule-releases` | platform-admin | after-populate | layout-1280.spec.ts, reconciliation.spec.ts, monitoring.spec.ts, packets.spec.ts | empty, loading, not-found |
| `/console/screening` | contract-specialist | seed | none | empty (not reachable), error |
| `/console/specialist-queue` | contract-specialist | after-populate | layout-1280.spec.ts, packets.spec.ts, reconciliation.spec.ts, monitoring.spec.ts, contracts.spec.ts | empty, loading, error |
| `/console/status` | platform-admin | seed | none | empty, error |
| `/console/support` | platform-admin | after-populate | layout-1280.spec.ts, packets.spec.ts, contracts.spec.ts | empty, error |
| `/console/terms` | platform-admin | seed | none | empty (not reachable), error |
| `/console/tickets` | support | seed | none | empty |
| `/maintenance` | no session (public) | seed | none | base state |
| `/p/[practiceId]` | ledger-manager | after-populate | reconciliation.spec.ts, packets.spec.ts, monitoring.spec.ts | empty, error, not-found |
| `/p/[practiceId]/abstraction` | contract-specialist | after-populate | packets.spec.ts, layout-1280.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/abstraction/ledger` | contract-specialist | after-populate | reconciliation.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/abstraction/regulations` | contract-specialist | after-populate | layout-1280.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/abstraction/versions/[versionId]` | contract-specialist | after-populate | layout-1280.spec.ts | loading, error, not-found |
| `/p/[practiceId]/anomalies` | pricing-manager | after-populate | layout-1280.spec.ts | empty, loading, not-found |
| `/p/[practiceId]/cases` | packet-approver | after-populate | packets.spec.ts, layout-1280.spec.ts, monitoring.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/cases/[caseId]` | packet-approver | after-populate | packets.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/cases/[caseId]/packet` | packet-approver | after-populate | packets.spec.ts, layout-1280.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/cases/[caseId]/packet/[versionId]/review` | reviewer | after-populate | packets.spec.ts | loading, error, not-found |
| `/p/[practiceId]/cases/[caseId]/submissions` | packet-approver | after-populate | packets.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/cases/by-reference` | packet-approver | after-populate | packets.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/claims` | pricing-manager | after-populate | layout-1280.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/contracts` | era-manager | after-populate | contracts.spec.ts, layout-1280.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/contracts/[contractId]` | era-manager | after-populate | contracts.spec.ts, layout-1280.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/contracts/versions/[versionId]` | era-manager | after-populate | contracts.spec.ts, layout-1280.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/coverage` | pricing-manager | after-populate | layout-1280.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/digests/[digestId]` | monitoring-manager | after-populate | monitoring.spec.ts | loading, not-found |
| `/p/[practiceId]/lines/[lineId]` | pricing-manager | after-populate | layout-1280.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/mapping` | pricing-manager | after-populate | layout-1280.spec.ts | empty, loading, not-found |
| `/p/[practiceId]/mapping/[planId]` | pricing-manager | after-populate | layout-1280.spec.ts, contracts.spec.ts | loading, error, not-found |
| `/p/[practiceId]/notifications` | monitoring-manager | after-populate | monitoring.spec.ts | empty, loading, not-found |
| `/p/[practiceId]/packet-reviews` | reviewer | after-populate | packets.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/pricing-runs` | pricing-manager | after-populate | layout-1280.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/pricing-runs/[runId]` | pricing-manager | after-populate | layout-1280.spec.ts | empty, loading, not-found |
| `/p/[practiceId]/pricing-runs/compare` | pricing-manager | after-populate | layout-1280.spec.ts | empty, loading, not-found |
| `/p/[practiceId]/reconciliation` | ledger-manager | after-populate | reconciliation.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/reconciliation/template` | ledger-manager | after-populate | reconciliation.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/releases` | pricing-manager | seed | none | empty (not reachable), loading, not-found |
| `/p/[practiceId]/remittances` | pricing-manager | after-populate | layout-1280.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/remittances/[remittanceId]` | pricing-manager | after-populate | layout-1280.spec.ts, reconciliation.spec.ts | empty, loading, not-found |
| `/p/[practiceId]/reports` | ledger-manager | after-populate | reconciliation.spec.ts, layout-1280.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/reports/[reportId]` | reports-manager | after-populate | reports.spec.ts | loading, not-found |
| `/p/[practiceId]/reports/[reportId]/review` | reviewer | after-populate | reports.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/reports/documents/[documentId]` | pricing-manager | after-populate | layout-1280.spec.ts | loading, not-found |
| `/p/[practiceId]/reports/monthly` | monitoring-manager | after-populate | layout-1280.spec.ts, monitoring.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/reports/roi` | ledger-manager | after-populate | reconciliation.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/reports/roi/[statementId]` | ledger-manager | after-populate | reconciliation.spec.ts | empty, loading, not-found |
| `/p/[practiceId]/settings` | practice-admin | seed | none | empty, not-found |
| `/p/[practiceId]/settings/access-log` | other-admin | after-populate | packets.spec.ts, contracts.spec.ts | empty, error, not-found |
| `/p/[practiceId]/settings/agreements` | practice-admin | seed | none | empty, not-found |
| `/p/[practiceId]/settings/correspondence` | other-admin | seed | none | empty, error, not-found |
| `/p/[practiceId]/settings/data` | practice-admin | seed | none | not-found |
| `/p/[practiceId]/settings/defaults` | billing-manager | seed | none | empty, error, not-found |
| `/p/[practiceId]/settings/pricing` | practice-admin | seed | none | empty, error, not-found |
| `/p/[practiceId]/settings/proof-level` | other-admin | after-populate | reconciliation.spec.ts | empty, not-found |
| `/p/[practiceId]/support-access/[supportGrantId]` | other-admin | after-populate | contracts.spec.ts | empty, error, not-found |
| `/p/[practiceId]/uploads` | pricing-manager | after-populate | layout-1280.spec.ts | empty, loading, error, not-found |
| `/p/[practiceId]/uploads/[documentId]` | pricing-manager | after-populate | layout-1280.spec.ts | empty, loading, not-found |
| `/request-audit` | no session (public) | seed | none | base state, loading, error, not-found |
| `/screening` | no session (public) | seed | none | base state, loading, error, not-found |
| `/screening/results/[resultId]` | no session (public) | seed | none | base state (no empty variant), error, not-found |
| `/security` | no session (public) | seed | none | base state (no empty variant) |
| `/settings/billing` | practice-admin | seed | none | empty, loading |
| `/settings/billing/[organizationId]` | practice-admin | after-populate | billing.spec.ts | empty, loading, error, not-found |
| `/settings/organizations/[organizationId]/users` | practice-admin | seed | none | empty, error, not-found |
| `/sign-in` | no session (public) | seed | none | base state, loading, error, not-found |
| `/sign-in/enroll` | invited | seed | none | base state, loading, error |
| `/sign-in/hardware-key` | no session (public) | seed | none | base state, loading, error, not-found |
| `/sign-in/mfa` | billing-manager | seed | none | base state, loading, error |
| `/sign-in/new-password` | invited | seed | none | base state, loading, error |
| `/sign-in/register-key` | reviewer | seed | none | base state, loading, error |
| `/status` | no session (public) | seed | none | base state |
| `/support` | billing-manager | seed | none | base state, error |
| `/terms` | practice-admin | seed | none | base state, error |

'States present' names the states a person can reach on synthetic data; the JSON entry says how. `empty (not reachable)` marks a page whose empty state the seed always fills.

## Paths with no page

These six paths came from an early scout list, not from the code. `route-map.json` holds only the 83 real pages; they are kept here because each URL still lands somewhere (mostly the not-found page), which a later tour or the UX review may need.

- `/console` (`apps/web/src/app/console/page.tsx`): No such page: apps/web/src/app/console/page.tsx does not exist at 6ddd587. GET /console renders the root not-found (apps/web/src/app/not-found.tsx: PublicHeader and EmptyState 'Not found', 'Go to your workspace') with HTTP 404 for anyone, signed in or not. The 'console home' the tour shoots (23-console-home.png) is /console/organizations, reached by page.goto('/') as platform-admin; map it there.
- `/p/[practiceId]/pricing-runs/[runId]/lines/[lineId]` (`apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/lines/[lineId]/page.tsx`): No such page.tsx at 6ddd587 or on any remote branch. A run line's trace is /p/[practiceId]/lines/[lineId]?run=[runId] (the run page's Line trace links, pricing-runs/[runId]/page.tsx:268); see that entry. The URL /pricing-runs/<run>/lines/<line> renders app/not-found.tsx.
- `/p/[practiceId]/reconciliation/[remittanceId]` (`apps/web/src/app/p/[practiceId]/reconciliation/[remittanceId]/page.tsx`): No such page.tsx at the build-platform branch 6ddd587 (git cat-file fails; find apps/web/src/app -name page.tsx lists none). The URL /p/<id>/reconciliation/<uuid> renders app/not-found.tsx. Per-remittance reconciliation is shown inside /p/[practiceId]/reconciliation (Case lines' ERA/Posting/EFT matches) and the case ledger is /p/[practiceId]/reconciliation?case=<caseId>.
- `/p/[practiceId]/reports/monitoring` (`apps/web/src/app/p/[practiceId]/reports/monitoring/page.tsx`): No such page.tsx at the build-platform branch 6ddd587, nor on any remote branch (git ls-tree). /p/<id>/reports/monitoring is caught by reports/[reportId], whose opaqueId (UUID) check fails, so loadPage calls notFound() and app/not-found.tsx renders. Monitoring output lives at /p/[practiceId]/digests/[digestId], /p/[practiceId]/notifications and the monthly summary /p/[practiceId]/reports/monthly.
- `/p/[practiceId]/reports/monitoring/[streamId]` (`apps/web/src/app/p/[practiceId]/reports/monitoring/[streamId]/page.tsx`): No such page.tsx at 6ddd587 or on any remote branch; no monitoring stream record exists in the product. The URL renders app/not-found.tsx.
- `/p/[practiceId]/reports/scorecard` (`apps/web/src/app/p/[practiceId]/reports/scorecard/page.tsx`): No such page.tsx at 6ddd587 or on any remote branch. A scorecard is planned, not built: CO-09 calls for docs/product/scorecard.md (a document, not a screen; docs/product/change-order-001.md:77-87) and payer-behavior scorecards are milestone 13 (docs/product/PRD.md:716; reconciliation-001.md:23 says not built). /p/<id>/reports/scorecard renders app/not-found.tsx (caught by reports/[reportId], invalid UUID).

## The populate step

Run these repository specs, unchanged, before the capture (`tools/lane-b-screen-tour/run.sh`, project `populate`):

- `apps/web/e2e/billing.spec.ts`: 3 routes.
- `apps/web/e2e/contracts.spec.ts`: 8 routes.
- `apps/web/e2e/layout-1280.spec.ts`: 27 routes.
- `apps/web/e2e/monitoring.spec.ts`: 7 routes.
- `apps/web/e2e/packets.spec.ts`: 13 routes.
- `apps/web/e2e/reconciliation.spec.ts`: 11 routes.
- `apps/web/e2e/reports.spec.ts`: 2 routes.

Two changes to today's run.sh, both needed by the map:
1. Add `reports.spec.ts` (it runs its own worker). It is the only source of an audit report, its reviewer checklist and deterministically printed report documents (SYNTHETIC OTHER PRACTICE REPORTS).
2. Narrow `--grep-invert "unverified deadline|webhook route"` to `--grep-invert "webhook route"`, so packets.spec.ts's second test fills SYNTHETIC OTHER PRACTICE PACKET DEADLINES: the export blocked by an unverified deadline, 'Deadline not verified', and an export awaiting attestation (the reviewer's `needs_downloads` state).

Keep `uploads.spec.ts` and `remittances.spec.ts` out: they write NORTH and SOUTH, the only seeded practices every empty state uses. Optional, for states the map lists as needing them: `era-exports.spec.ts` (Coverage's unconfirmed-format section, ERA receipts and duplicates), `pricing.spec.ts` (a re-run with its diff and Accept), `triage.spec.ts` (struck-through WINDOW_PASSED lines, waiting patterns), `unattested.spec.ts` (never-attested exports), `onboarding.spec.ts` (invitations, the agreement chain's confirm form, converted prospects), `screening.spec.ts` (declined prospects, a second split row). The console's prospect and ticket rows need no spec: the capture's own /request-audit send and /support ticket make them.
