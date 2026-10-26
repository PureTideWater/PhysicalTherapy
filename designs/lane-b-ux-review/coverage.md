# Screen tour coverage (claude/build-platform 6ddd587, synthetic data)

857 shots of the 83 pages: 1280 px light, 1280 px dark (tokens only) and 390 px light, plus each state the route map names. The PNGs are in a private gallery, never on a branch. `manifest.json` holds every shot with its check verdict.

Verdicts: {'ok': 683, 'dark-not-applied': 6, 'cropped': 43, 'other': 114, 'state-not-shown': 9, 'error-page': 2}. 22 capture faults are being retaken; the rest of the flags are product findings for the review.

| Route | 1280 light | 1280 dark | 390 light | States (both widths) |
|---|---|---|---|---|
| `/` | home.default.1280 | home.default.1280-dark | home.default.390 | interaction:account-menu, interaction:help, interaction:menu |
| `/account/devices` | account.devices.default.1280 | account.devices.default.1280-dark | account.devices.default.390 | interaction:internal-shell |
| `/account/notifications` | account.notifications.default.1280 | account.notifications.default.1280-dark | account.notifications.default.390 | interaction:internal-shell, interaction:saved, loading |
| `/console/billing` | console.billing.default.1280 | console.billing.default.1280-dark | console.billing.default.390 | error, loading |
| `/console/compliance` | console.compliance.default.1280 | console.compliance.default.1280-dark | console.compliance.default.390 | error, interaction:sent |
| `/console/models` | console.models.default.1280 | console.models.default.1280-dark | console.models.default.390 | error, interaction:notice |
| `/console/organizations` | console.organizations.default.1280 | console.organizations.default.1280-dark | console.organizations.default.390 | error, interaction:account-menu, interaction:help, interaction:menu |
| `/console/organizations/[organizationId]` | console.organization.default.1280 | console.organization.default.1280-dark | console.organization.default.390 | empty, error, interaction:created, interaction:firm, interaction:help, interaction:menu, interaction:suspended |
| `/console/practices/[practiceId]` | console.practice.default.1280 | console.practice.default.1280-dark | console.practice.default.390 | empty, error, interaction:location-saved, interaction:saved, loading |
| `/console/prospects` | console.prospects.default.1280 | console.prospects.default.1280-dark | console.prospects.default.390 | empty, interaction:all |
| `/console/rule-releases` | console.rule-releases.default.1280 | console.rule-releases.default.1280-dark | console.rule-releases.default.390 | interaction:notes-open, interaction:prepared, interaction:release, loading |
| `/console/screening` | console.screening.default.1280 | console.screening.default.1280-dark | console.screening.default.390 | error, interaction:approved |
| `/console/specialist-queue` | console.specialist-queue.default.1280 | console.specialist-queue.default.1280-dark | console.specialist-queue.default.390 | error, interaction:all, loading |
| `/console/status` | console.status.default.1280 | console.status.default.1280-dark | console.status.default.390 | error, interaction:maintenance-on |
| `/console/support` | console.support.default.1280 | console.support.default.1280-dark | console.support.default.390 | error, interaction:ended, interaction:help, interaction:menu |
| `/console/terms` | console.terms.default.1280 | console.terms.default.1280-dark | console.terms.default.390 | error |
| `/console/tickets` | console.tickets.default.1280 | console.tickets.default.1280-dark | console.tickets.default.390 | empty, interaction:all |
| `/maintenance` | maintenance.default.1280 | maintenance.default.1280-dark | maintenance.default.390 | interaction:on, interaction:redirected |
| `/p/[practiceId]` | p.home.default.1280 | p.home.default.1280-dark | p.home.default.390 | empty, error, interaction:support-access, interaction:tiles |
| `/p/[practiceId]/abstraction` | p.abstraction.default.1280 | p.abstraction.default.1280-dark | p.abstraction.default.390 | empty, error, loading |
| `/p/[practiceId]/abstraction/ledger` | p.abstraction-ledger.default.1280 | p.abstraction-ledger.default.1280-dark | p.abstraction-ledger.default.390 | empty, error, interaction:adjust-open, interaction:notice, loading |
| `/p/[practiceId]/abstraction/regulations` | p.abstraction-regulations.default.1280 | p.abstraction-regulations.default.1280-dark | p.abstraction-regulations.default.390 | error, interaction:notice, loading |
| `/p/[practiceId]/abstraction/versions/[versionId]` | p.abstraction-version.default.1280 | p.abstraction-version.default.1280-dark | p.abstraction-version.default.390 | error, interaction:model-notice |
| `/p/[practiceId]/anomalies` | p.anomalies.default.1280 | p.anomalies.default.1280-dark | p.anomalies.default.390 | empty, interaction:cohort, interaction:cohort-viewer, loading |
| `/p/[practiceId]/cases` | p.cases.default.1280 | p.cases.default.1280-dark | p.cases.default.390 | empty, error, interaction:deadline-14, interaction:notice, loading, not-found |
| `/p/[practiceId]/cases/[caseId]` | p.case.default.1280 | p.case.default.1280-dark | p.case.default.390 | empty, error, interaction:viewer, interaction:write-off-open, loading |
| `/p/[practiceId]/cases/[caseId]/packet` | p.packet.default.1280 | p.packet.default.1280-dark | p.packet.default.390 | empty, error, interaction:approver-ready, interaction:drafter, interaction:notice-exported, interaction:notice-requested, loading |
| `/p/[practiceId]/cases/[caseId]/packet/[versionId]/review` | p.packet-review.default.1280 | p.packet-review.default.1280-dark | p.packet-review.default.390 | error, interaction:notice, loading |
| `/p/[practiceId]/cases/[caseId]/submissions` | p.submissions.default.1280 | p.submissions.default.1280-dark | p.submissions.default.390 | empty, error, interaction:attestation-waiting, interaction:notice, loading |
| `/p/[practiceId]/cases/by-reference` | p.by-reference.default.1280 | p.by-reference.default.1280-dark | p.by-reference.default.390 | empty, error, interaction:typed |
| `/p/[practiceId]/claims` | p.claims.default.1280 | p.claims.default.1280-dark | p.claims.default.390 | empty, error, interaction:patient, interaction:viewer, loading |
| `/p/[practiceId]/contracts` | p.contracts.default.1280 | p.contracts.default.1280-dark | p.contracts.default.390 | empty, error, interaction:help, interaction:layout, interaction:viewer, loading |
| `/p/[practiceId]/contracts/[contractId]` | p.contract.default.1280 | p.contract.default.1280-dark | p.contract.default.390 | error, interaction:layout, interaction:viewer, loading |
| `/p/[practiceId]/contracts/versions/[versionId]` | p.contract-version.default.1280 | p.contract-version.default.1280-dark | p.contract-version.default.390 | error, interaction:cited-page-2, interaction:notice, loading |
| `/p/[practiceId]/coverage` | p.coverage.default.1280 | p.coverage.default.1280-dark | p.coverage.default.390 | empty, error, interaction:model-notice, interaction:no-run, interaction:viewer, loading |
| `/p/[practiceId]/digests/[digestId]` | p.digest.default.1280 | p.digest.default.1280-dark | p.digest.default.390 | error, loading |
| `/p/[practiceId]/lines/[lineId]` | p.line.default.1280 | p.line.default.1280-dark | p.line.default.390 | empty, error, interaction:viewer, loading |
| `/p/[practiceId]/mapping` | p.mapping.default.1280 | p.mapping.default.1280-dark | p.mapping.default.390 | empty, interaction:all-plans, loading |
| `/p/[practiceId]/mapping/[planId]` | p.plan.default.1280 | p.plan.default.1280-dark | p.plan.default.390 | error, interaction:no-agreement, interaction:notice, interaction:viewer, loading |
| `/p/[practiceId]/notifications` | p.notifications.default.1280 | p.notifications.default.1280-dark | p.notifications.default.390 | empty, loading |
| `/p/[practiceId]/packet-reviews` | p.packet-reviews.default.1280 | p.packet-reviews.default.1280-dark | p.packet-reviews.default.390 | empty, error, loading |
| `/p/[practiceId]/pricing-runs` | p.pricing-runs.default.1280 | p.pricing-runs.default.1280-dark | p.pricing-runs.default.390 | empty, error, interaction:viewer, loading |
| `/p/[practiceId]/pricing-runs/[runId]` | p.pricing-run.default.1280 | p.pricing-run.default.1280-dark | p.pricing-run.default.390 | empty, interaction:april, loading |
| `/p/[practiceId]/pricing-runs/compare` | p.compare.default.1280 | p.compare.default.1280-dark | p.compare.default.390 | interaction:diff-filter |
| `/p/[practiceId]/reconciliation` | p.reconciliation.default.1280 | p.reconciliation.default.1280-dark | p.reconciliation.default.390 | empty, error, interaction:case-ledger, interaction:reverse-open, interaction:viewer, loading |
| `/p/[practiceId]/reconciliation/template` | p.template.default.1280 | p.template.default.1280-dark | p.template.default.390 | empty, error, interaction:notice, interaction:preview, loading |
| `/p/[practiceId]/releases` | p.releases.default.1280 | p.releases.default.1280-dark | p.releases.default.390 | empty, interaction:release, loading |
| `/p/[practiceId]/remittances` | p.remittances.default.1280 | p.remittances.default.1280-dark | p.remittances.default.390 | empty, loading |
| `/p/[practiceId]/remittances/[remittanceId]` | p.remittance.default.1280 | p.remittance.default.1280-dark | p.remittance.default.390 | interaction:plb, interaction:viewer, loading |
| `/p/[practiceId]/reports` | p.reports.default.1280 | p.reports.default.1280-dark | p.reports.default.390 | empty, interaction:audit-reports, interaction:viewer, loading |
| `/p/[practiceId]/reports/[reportId]` | p.report.default.1280 | p.report.default.1280-dark | p.report.default.390 | interaction:generating, interaction:viewer, loading |
| `/p/[practiceId]/reports/[reportId]/review` | p.report-review.default.1280 | p.report-review.default.1280-dark | p.report-review.default.390 | empty, error |
| `/p/[practiceId]/reports/documents/[documentId]` | p.report-document.default.1280 | p.report-document.default.1280-dark | p.report-document.default.390 | interaction:layout-coverage, loading |
| `/p/[practiceId]/reports/monthly` | p.monthly.default.1280 | p.monthly.default.1280-dark | p.monthly.default.390 | empty, interaction:month, loading |
| `/p/[practiceId]/reports/roi` | p.roi.default.1280 | p.roi.default.1280-dark | p.roi.default.390 | empty, error, interaction:viewer, loading |
| `/p/[practiceId]/reports/roi/[statementId]` | p.roi-statement.default.1280 | p.roi-statement.default.1280-dark | p.roi-statement.default.390 | loading |
| `/p/[practiceId]/settings` | p.settings.default.1280 | p.settings.default.1280-dark | p.settings.default.390 | empty, interaction:mostly-done |
| `/p/[practiceId]/settings/access-log` | p.access-log.default.1280 | p.access-log.default.1280-dark | p.access-log.default.390 | empty, error, interaction:older, interaction:record-filter |
| `/p/[practiceId]/settings/agreements` | p.agreements.default.1280 | p.agreements.default.1280-dark | p.agreements.default.390 | empty, interaction:non-admin, interaction:notice |
| `/p/[practiceId]/settings/correspondence` | p.correspondence.default.1280 | p.correspondence.default.1280-dark | p.correspondence.default.390 | empty, error, interaction:notice, interaction:read-only, interaction:set |
| `/p/[practiceId]/settings/data` | p.data.default.1280 | p.data.default.1280-dark | p.data.default.390 | interaction:non-admin |
| `/p/[practiceId]/settings/defaults` | p.defaults.default.1280 | p.defaults.default.1280-dark | p.defaults.default.390 | error, interaction:admin-view, interaction:notice |
| `/p/[practiceId]/settings/pricing` | p.pricing-settings.default.1280 | p.pricing-settings.default.1280-dark | p.pricing-settings.default.390 | error, interaction:notice, interaction:places, interaction:viewer |
| `/p/[practiceId]/settings/proof-level` | p.proof-level.default.1280 | p.proof-level.default.1280-dark | p.proof-level.default.390 | empty, interaction:notice, interaction:read-only |
| `/p/[practiceId]/support-access/[supportGrantId]` | p.support-access.default.1280 | p.support-access.default.1280-dark | p.support-access.default.390 | empty, error, interaction:ended |
| `/p/[practiceId]/uploads` | p.uploads.default.1280 | p.uploads.default.1280-dark | p.uploads.default.390 | empty, error, interaction:era-format, interaction:viewer, loading |
| `/p/[practiceId]/uploads/[documentId]` | p.upload.default.1280 | p.upload.default.1280-dark | p.upload.default.390 | interaction:export-receipt, loading |
| `/request-audit` | request-audit.default.1280 | request-audit.default.1280-dark | request-audit.default.390 | error, interaction:attribution, interaction:sent, loading |
| `/screening` | screening.default.1280 | screening.default.1280-dark | screening.default.390 | error, interaction:file-ready, interaction:sent-minutes, interaction:sent-sent, interaction:sent-soon, interaction:sent-waiting, loading |
| `/screening/results/[resultId]` | screening-result.default.1280 | screening-result.default.1280-dark | screening-result.default.390 | error, interaction:converted, loading, not-found |
| `/security` | security.default.1280 | security.default.1280-dark | security.default.390 | — |
| `/settings/billing` | settings.billing.default.1280 | settings.billing.default.1280-dark | settings.billing.default.390 | empty, interaction:firm, loading |
| `/settings/billing/[organizationId]` | settings.billing-org.default.1280 | settings.billing-org.default.1280-dark | settings.billing-org.default.390 | empty, error, interaction:suspended, loading |
| `/settings/organizations/[organizationId]/users` | settings.users.default.1280 | settings.users.default.1280-dark | settings.users.default.390 | error, interaction:end-membership-ticked, interaction:firm, interaction:notice-invited |
| `/sign-in` | sign-in.default.1280 | sign-in.default.1280-dark | sign-in.default.390 | error, interaction:reason-idle, interaction:reason-step-expired, loading |
| `/sign-in/enroll` | sign-in-enroll.default.1280 | sign-in-enroll.default.1280-dark | sign-in-enroll.default.390 | error, loading |
| `/sign-in/hardware-key` | sign-in-hardware-key.default.1280 | sign-in-hardware-key.default.1280-dark | sign-in-hardware-key.default.390 | error, interaction:reason-hardware-key-required, interaction:reason-key-registered, loading |
| `/sign-in/mfa` | sign-in-mfa.default.1280 | sign-in-mfa.default.1280-dark | sign-in-mfa.default.390 | error, loading |
| `/sign-in/new-password` | sign-in-new-password.default.1280 | sign-in-new-password.default.1280-dark | sign-in-new-password.default.390 | error, loading |
| `/sign-in/register-key` | sign-in-register-key.default.1280 | sign-in-register-key.default.1280-dark | sign-in-register-key.default.390 | error, loading |
| `/status` | status.default.1280 | status.default.1280-dark | status.default.390 | interaction:maintenance |
| `/support` | support.default.1280 | support.default.1280-dark | support.default.390 | error, interaction:account-menu, interaction:help, interaction:menu, interaction:ticket-opened, loading |
| `/terms` | terms.default.1280 | terms.default.1280-dark | terms.default.390 | interaction:account-menu, interaction:help, interaction:internal, interaction:menu |

## States synthetic data cannot show

Each was left out rather than faked; the capture's reason is given.
- `/screening` screening.loading-reading.1280: 'Reading the file in this browser...' is a FileReader step inside the browser that page.route cannot hold; with the small fixture it lasts milliseconds
- `/screening` screening.loading-reading.390: 'Reading the file in this browser...' is a FileReader step inside the browser that page.route cannot hold; with the small fixture it lasts milliseconds
- `/screening` screening.closed.1280: 'Screening is not open yet' needs no release or no approved split; prepare.ts always loads release 900001 and approves the split
- `/screening` screening.closed.390: 'Screening is not open yet' needs no release or no approved split; prepare.ts always loads release 900001 and approves the split
- `/screening/results/[resultId]` screening-result.pager.1280: the anomalies pager needs more than 50 groups; no repository fixture has that many and rows are never invented
- `/screening/results/[resultId]` screening-result.pager.390: the anomalies pager needs more than 50 groups; no repository fixture has that many and rows are never invented
- `/console/organizations` console.organizations.empty.1280: the seed always holds four organizations, so No organizations yet never shows
- `/console/organizations` console.organizations.empty.390: the seed always holds four organizations, so No organizations yet never shows
- `/console/organizations/[organizationId]` console.organization.locked-member.1280: the locked badge needs sign-in.spec.ts's ten-failure test on lockout (not a populate spec; the tour's own lockout lock comes last)
- `/console/organizations/[organizationId]` console.organization.locked-member.390: the locked badge needs sign-in.spec.ts's ten-failure test on lockout (not a populate spec; the tour's own lockout lock comes last)
- `/console/prospects` console.prospects.declined-select-open.1280: a native select's open list is drawn by the browser outside the page, so a screenshot cannot show it
- `/console/prospects` console.prospects.declined-select-open.390: a native select's open list is drawn by the browser outside the page, so a screenshot cannot show it
- `/console/rule-releases` console.rule-releases.empty.1280: 'No practice has a complete run' shows only before populate, and 'No release is published' never (prepare.ts loads 900001)
- `/console/rule-releases` console.rule-releases.empty.390: 'No practice has a complete run' shows only before populate, and 'No release is published' never (prepare.ts loads 900001)
- `/console/billing` console.billing.empty.1280: the seed always has three customer organizations
- `/console/billing` console.billing.empty.390: the seed always has three customer organizations
- `/console/models` console.models.populated.1280: flag and spend rows need models.spec.ts (not in the populate set)
- `/console/models` console.models.populated.390: flag and spend rows need models.spec.ts (not in the populate set)
- `/console/status` console.status.incident.1280: an open incident is an optional operator write that also changes /status; not taken
- `/console/status` console.status.incident.390: an open incident is an optional operator write that also changes /status; not taken
- `/console/support` console.support.empty.1280: 'No support grants' shows only before populate; the journeys' grants always fill the table
- `/console/support` console.support.empty.390: 'No support grants' shows only before populate; the journeys' grants always fill the table
- `/console/terms` console.terms.empty.1280: the seed always publishes synthetic-2026-10
- `/console/terms` console.terms.empty.390: the seed always publishes synthetic-2026-10
- `/console/screening` console.screening.empty.1280: prepare.ts approves the split before any spec, so No split approved yet never shows
- `/console/screening` console.screening.empty.390: prepare.ts approves the split before any spec, so No split approved yet never shows
- `/console/specialist-queue` console.specialist-queue.empty.1280: 'Nothing waiting' shows only on a fresh prepare before populate (the journeys give the specialist grants and work)
- `/console/specialist-queue` console.specialist-queue.empty.390: 'Nothing waiting' shows only on a fresh prepare before populate (the journeys give the specialist grants and work)
- `/account/devices` account.devices.empty.1280: the session that opens the page is itself a device, so No devices yet never shows
- `/account/devices` account.devices.empty.390: the session that opens the page is itself a device, so No devices yet never shows
- `/settings/billing/[organizationId]` settings.billing-org.past-due.1280: the past-due layout is expected from the code but exercised by no spec (the simulator's failing account); not taken
- `/settings/billing/[organizationId]` settings.billing-org.past-due.390: the past-due layout is expected from the code but exercised by no spec (the simulator's failing account); not taken
- `/terms` terms.accept-form.1280: the accept form needs a person who owes the version in force; the one product path (publishing a newer version) would send every customer to /terms, so it is never taken mid-capture
- `/terms` terms.accept-form.390: the accept form needs a person who owes the version in force; the one product path (publishing a newer version) would send every customer to /terms, so it is never taken mid-capture
- `/p/[practiceId]/abstraction` p.abstraction.questions.1280: Questions to the practice needs a question a specialist asks on a version page; no spec asks one
- `/p/[practiceId]/abstraction` p.abstraction.questions.390: Questions to the practice needs a question a specialist asks on a version page; no spec asks one
- `/p/[practiceId]/abstraction/versions/[versionId]` p.abstraction-version.loading.1280: not holdable on populated data: the versions are signed off, so neither /abstraction nor the specialist queue links to one
- `/p/[practiceId]/abstraction/versions/[versionId]` p.abstraction-version.loading.390: not holdable on populated data: the versions are signed off, so neither /abstraction nor the specialist queue links to one
- `/p/[practiceId]/abstraction/versions/[versionId]` p.abstraction-version.draft-forms.1280: the draft forms need a draft or proposed version, which no populate spec leaves
- `/p/[practiceId]/abstraction/versions/[versionId]` p.abstraction-version.draft-forms.390: the draft forms need a draft or proposed version, which no populate spec leaves
- `/p/[practiceId]/cases/[caseId]` p.case.struck-lines.1280: struck-through WINDOW_PASSED lines need triage.spec.ts (not in the populate set)
- `/p/[practiceId]/cases/[caseId]` p.case.struck-lines.390: struck-through WINDOW_PASSED lines need triage.spec.ts (not in the populate set)
- `/p/[practiceId]/cases/[caseId]/packet` p.packet.notice-written-unchanged-approved-export-requested.1280: the same notice alert as notice-requested and notice-exported; two representative notices are shot
- `/p/[practiceId]/cases/[caseId]/packet` p.packet.notice-written-unchanged-approved-export-requested.390: the same notice alert as notice-requested and notice-exported; two representative notices are shot
- `/p/[practiceId]/cases/[caseId]/packet/[versionId]/review` p.packet-review.stale-export.1280: a stale, never-attested export needs unattested.spec.ts (not in the populate set)
- `/p/[practiceId]/cases/[caseId]/packet/[versionId]/review` p.packet-review.stale-export.390: a stale, never-attested export needs unattested.spec.ts (not in the populate set)
- `/p/[practiceId]/cases/by-reference` p.by-reference.loading.1280: the lookup is a plain GET form: a document navigation streams cases/loading.tsx and the page in one response, so the loading state cannot be held
- `/p/[practiceId]/cases/by-reference` p.by-reference.loading.390: the lookup is a plain GET form: a document navigation streams cases/loading.tsx and the page in one response, so the loading state cannot be held
- `/p/[practiceId]/contracts/[contractId]` p.contract.empty.1280: tagging always creates version 1, so No version yet is not reachable
- `/p/[practiceId]/contracts/[contractId]` p.contract.empty.390: tagging always creates version 1, so No version yet is not reachable
- `/p/[practiceId]/contracts/versions/[versionId]` p.contract-version.sign-off.1280: the approved, awaiting sign-off and superseded states are not reachable: contracts.spec.ts signs its version off and nothing supersedes one
- `/p/[practiceId]/contracts/versions/[versionId]` p.contract-version.sign-off.390: the approved, awaiting sign-off and superseded states are not reachable: contracts.spec.ts signs its version off and nothing supersedes one
- `/p/[practiceId]/coverage` p.coverage.refused-and-unconfirmed.1280: the refused state, months waiting on the ZIP, unconfirmed export formats and the model checklist need specs outside the populate set (uploads, onboarding, era-exports, models)
- `/p/[practiceId]/coverage` p.coverage.refused-and-unconfirmed.390: the refused state, months waiting on the ZIP, unconfirmed export formats and the model checklist need specs outside the populate set (uploads, onboarding, era-exports, models)
- `/p/[practiceId]/pricing-runs/[runId]` p.pricing-run.unfinished.1280: 'This run has not finished' needs a run created with no worker (a write that would add a run to LAYOUT's lists); not taken
- `/p/[practiceId]/pricing-runs/[runId]` p.pricing-run.unfinished.390: 'This run has not finished' needs a run created with no worker (a write that would add a run to LAYOUT's lists); not taken
- `/p/[practiceId]/pricing-runs/compare` p.compare.loading.1280: not holdable: the Compare form on /pricing-runs is a plain GET form (a document navigation streams compare/loading.tsx with the page), and the page's own Diff filter links change only its search parameters, which keep the current screen (tried with the request held: no loading state in 15 s)
- `/p/[practiceId]/pricing-runs/compare` p.compare.loading.390: not holdable: the Compare form on /pricing-runs is a plain GET form (a document navigation streams compare/loading.tsx with the page), and the page's own Diff filter links change only its search parameters, which keep the current screen (tried with the request held: no loading state in 15 s)
- `/p/[practiceId]/pricing-runs/compare` p.compare.incomplete.1280: 'A run is still being priced' needs an incomplete run (a write that adds a run); not taken
- `/p/[practiceId]/pricing-runs/compare` p.compare.incomplete.390: 'A run is still being priced' needs an incomplete run (a write that adds a run); not taken
- `/p/[practiceId]/remittances/[remittanceId]` p.remittance.empty.1280: 'No claims in this remittance' needs a PLB-only remittance; no populate spec loads one
- `/p/[practiceId]/remittances/[remittanceId]` p.remittance.empty.390: 'No claims in this remittance' needs a PLB-only remittance; no populate spec loads one
- `/p/[practiceId]/reports/[reportId]/review` p.report-review.loading.1280: not holdable: the report page links to the checklist only while it is unattested, and the populated report is signed
- `/p/[practiceId]/reports/[reportId]/review` p.report-review.loading.390: not holdable: the report page links to the checklist only while it is unattested, and the populated report is signed
- `/p/[practiceId]/reports/roi/[statementId]` p.roi-statement.mismatch.1280: 'A figure is not what its entries give' needs a tampered ledger; never faked
- `/p/[practiceId]/reports/roi/[statementId]` p.roi-statement.mismatch.390: 'A figure is not what its entries give' needs a tampered ledger; never faked
- `/p/[practiceId]/uploads/[documentId]` p.upload.zip.1280: a zip with a held file needs uploads.spec.ts, which writes NORTH (kept out of the populate set so NORTH's empty states hold)
- `/p/[practiceId]/uploads/[documentId]` p.upload.zip.390: a zip with a held file needs uploads.spec.ts, which writes NORTH (kept out of the populate set so NORTH's empty states hold)
- `/p/[practiceId]/settings/agreements` p.agreements.confirm-form.1280: the confirm form needs the terms and data-rights agreements on file, which only onboarding.spec.ts records
- `/p/[practiceId]/settings/agreements` p.agreements.confirm-form.390: the confirm form needs the terms and data-rights agreements on file, which only onboarding.spec.ts records
- `/status` status.degraded.1280: a degraded component and an incident are optional operator writes; not taken
- `/status` status.degraded.390: a degraded component and an incident are optional operator writes; not taken
- `/console` route:/console: not reachable (route map): No such page: apps/web/src/app/console/page.tsx does not exist at 6ddd587. GET /console renders the root not-found (apps/web/src/app/not-found.tsx: PublicHeader and EmptyState 'Not found', 'Go to your workspace') with HTTP 404 for anyone, signed in or not. The 'console hom
- `/p/[practiceId]/pricing-runs/[runId]/lines/[lineId]` route:/p/[practiceId]/pricing-runs/[runId]/lines/[lineId]: not reachable (route map): No such page.tsx at 6ddd587 or on any remote branch. A run line's trace is /p/[practiceId]/lines/[lineId]?run=[runId] (the run page's Line trace links, pricing-runs/[runId]/page.tsx:268); see that entry. The URL /pricing-runs/<run>/lines/<line> renders app/not-found.tsx.
- `/p/[practiceId]/reconciliation/[remittanceId]` route:/p/[practiceId]/reconciliation/[remittanceId]: not reachable (route map): No such page.tsx at the build-platform branch 6ddd587 (git cat-file fails; find apps/web/src/app -name page.tsx lists none). The URL /p/<id>/reconciliation/<uuid> renders app/not-found.tsx. Per-remittance reconciliation is shown inside /p/[practiceId]/reconciliation (Case 
- `/p/[practiceId]/reports/monitoring` route:/p/[practiceId]/reports/monitoring: not reachable (route map): No such page.tsx at the build-platform branch 6ddd587, nor on any remote branch (git ls-tree). /p/<id>/reports/monitoring is caught by reports/[reportId], whose opaqueId (UUID) check fails, so loadPage calls notFound() and app/not-found.tsx renders. Monitoring output lives
- `/p/[practiceId]/reports/monitoring/[streamId]` route:/p/[practiceId]/reports/monitoring/[streamId]: not reachable (route map): No such page.tsx at 6ddd587 or on any remote branch; no monitoring stream record exists in the product. The URL renders app/not-found.tsx.
- `/p/[practiceId]/reports/scorecard` route:/p/[practiceId]/reports/scorecard: not reachable (route map): No such page.tsx at 6ddd587 or on any remote branch. A scorecard is planned, not built: CO-09 calls for docs/product/scorecard.md (a document, not a screen; docs/product/change-order-001.md:77-87) and payer-behavior scorecards are milestone 13 (docs/product/PRD.md:716; rec
