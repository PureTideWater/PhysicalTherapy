# UX PR 3 inventory: every table and scroll box in apps/web/src (tsx)

Base: /home/user/ux-table-scroll at e908c21 (co-001/ux-table-scroll). Read-only scan; line numbers are at e908c21.
Scope: every `<table` (87 elements in 61 non-test files with a site; see Counts), every `overflow-x-auto` / `overflow-auto` /
`overflow-y-auto` box, and every `ScrollTable` use. Test files are left out except where they pin markup (noted).
Raw extraction (headers and cells per table): design/sites.txt beside this file.

## What ScrollTable is today (components/scroll-table.tsx, 52 lines)

Already changed since the review's 4d99df8 (PR #50 and its UX recheck): a `'use client'` component; `role="region"`,
`aria-label="<label>, scrolls sideways"`, `tabIndex={0}` always (never dropped while the table fits), class
`relative min-w-0 max-w-full overflow-x-auto` with a focus ring. A ResizeObserver sets `overflows`, and while true a
line ABOVE the scroller reads "More columns to the right: scroll the table sideways." (`aria-hidden`, `data-state=
"scrolls-sideways"`, shown at every width, not only below `sm`). No edge fade, no left-edge cue once scrolled.
Pinned by scroll-table.test.tsx:22 (`^<div role="region" aria-label="Run lines, scrolls sideways" tabindex="0" class=
"relative min-w-0 max-w-full overflow-x-auto `), content.test.tsx:87, diff.test.tsx:71,235, calculation-words.test.tsx:91
(table class strings). screening/result.test.tsx:479-480 pin the hand-rolled screening regions.
So of UX-011's fix, `relative`, the named region, the server-rendered tab stop and min-w on 3 tables are done; what
is left in ScrollTable is: drop the tab stop while the table fits (UX-011 asks; today it is always on), the CSS edge
fades (UX-079 a), and the cue caption's wording/placement (below `sm` only, per UX-079 a).

## Legend

- Wrapper: **ST** = ScrollTable(label); **RG** = hand-rolled region div (role, name, tabIndex); **OV** = bare
  `overflow-x-auto` div (no role, name or tab stop); **NONE** = table straight in its parent (card content, section or
  page); "card" says when that parent is a CardContent.
- Name: AL = aria-label, ALB = aria-labelledby, CAP = caption; H = a visible heading/CardTitle right above.
- Focusable cols: the columns holding a link or control (Tab scrolls them into view). Every other column is reachable
  only by pointer scrolling when clipped.
- Kind: **W** working list, **R** reference table, **F** figure table (money lines), **T** text box.
- Flags: **#42** = PR #42 file (excluded); **UXF** = also an ux-forms file (shared; merged second keeps both);
  **P3** = listed in prs.json order 3; **P3-miss** = has a site needing work but prs.json does not list it.

## Data tables

### apps/web/src/app/p/[practiceId]/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 438-439 | /p/[practiceId] | OV `relative overflow-x-auto`, in card | AL "Agreements" | 5: Agreement, Version, Signer, Signed, SHA-256 | none | R | SHA-256 sliced to 12 + "…"; signer name | no |

### apps/web/src/app/p/[practiceId]/cases/page.tsx  (P3, UXF)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 242-243 | /p/[practiceId]/cases | OV, page body (not in card) | AL "Cases" | 8: Payer and plan, Pattern, State, Lines, Actionable total, Deadline, Pursuit cost, Owner | 1 (Payer and plan link) | W | behaviorText (pattern sentence), owner email | no |

### apps/web/src/app/p/[practiceId]/claims/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 134-135 | /p/[practiceId]/claims | OV on `CardContent className="relative overflow-x-auto"` (the card content itself scrolls) | AL "Claims and lines" | 11: Patient reference and claim control numbers, Service date, Code and modifiers, Units, Charge, Expected allowed, Observed allowed, Short (variance), Paid, Patient share, Status | 1 (patient link); 11 Status is a chip, not a control | W (F columns) | claim control numbers (PCN/payer ICN), patient ref | no |

### apps/web/src/app/p/[practiceId]/anomalies/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 58-59 | /p/[practiceId]/anomalies?anomaly=… | OV, in card | AL "Flagged lines" | 7: Payer claim control number, Service date (or Line), Code, Units, Observed allowed, Mode for the units, Short of the mode | 2 (line link) | W (F) | payer claim control number | no |
| 162-163 | /p/[practiceId]/anomalies | OV, page body | AL "Anomaly cohorts" | 9: Label, Payer and plan, Code, Quarter, Cohort, Mode per unit, Flagged lines, Range, Reviewed | 2 (payer and plan link) | W | — | no |

### apps/web/src/app/p/[practiceId]/abstraction/ledger/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 48-49 (Entries, used at 144 and 155) | /p/[practiceId]/abstraction/ledger | OV, component root | AL {label}: "Entries of the line" (per line, inside a list item) and "Ledger entries" | 7: #, Money moved, Stage, Amount, Evidence, Written by, Correct | 7 (AdjustForm, when canAdjust) | F (ledger, with a correction form per row: stacked rows are UX-078) | createdBy email | no |

### apps/web/src/app/p/[practiceId]/abstraction/page.tsx  (P3-miss)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 100 | /p/[practiceId]/abstraction | NONE, under h2 "Versions in progress" | AL "Versions in progress" | 5: Contract, Version, Status, Effective, Rate records | 2 (version link) | W (specialist queue of versions) | contract title + payer | no |

### apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 570-571 | /p/[practiceId]/cases/[caseId]/packet | OV, in card | AL "Versions" | 7: Version, Written, Verifier, Deadline stated, Approved, Exported SHA-256, Files | 1 (version link), 7 (PDF/CSV download links, if exported and canExport) | R | full SHA-256 via `<Hash>` (break-all already); writer/approver emails | no |
(The page also renders LineSchedule, PricingNowPanel and CalculationWords: see components below.)

### apps/web/src/app/p/[practiceId]/packet-reviews/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 48-49 (ExportTable, used at 100 and 111) | /p/[practiceId]/packet-reviews | OV, component root inside CardContent | AL {label}: "Exports waiting", NEVER_ATTESTED_LIST.title | 5: Packet, Exported, Lines, variance, File by, PDF SHA-256 | 1 (review link) | W (attestation queue) | full SHA-256 `<Hash>` (break-all) | no |

### apps/web/src/app/p/[practiceId]/reconciliation/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 144-145 (EntryTable, used at 210 per linkage line and 462) | /p/[practiceId]/reconciliation (?case=…) | OV, component root | AL {label}: "Entries of the line", "Ledger entries" | 8: #, Money moved, Stage, Amount, Case, Evidence, Written by, Reason (blank header when no PHI) | 5 (Case ledger link) | F | createdBy email; reason text | no |
| 306 | /p/[practiceId]/reconciliation | NONE, under h2 "Exports" | AL "Exports" | 5: Kind, Uploaded, What became of it, Rows, Matched | none | R | — | no |
(The page also renders Uploader → ReceiptList.)

### apps/web/src/app/p/[practiceId]/settings/pricing/page.tsx  (P3, UXF)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 137-138 | /p/[practiceId]/settings/pricing | OV `w-full overflow-x-auto`, in card | AL "Places of service in effect" | 3: Place of service, Rate, Set by | none | R | — | no (3 short cols; likely fits) |
(The page also renders MonthsWaitingOnLocation (ST).)

### apps/web/src/app/p/[practiceId]/contracts/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 91 | /p/[practiceId]/contracts | NONE, in card | AL "Contracts" | 8: Payer, Contract, Plans, Version, Effective, Method, Status, Coverage share | 2 (contract), 4 (version) | R | plans list joined by ", " | no |
| 148 | /p/[practiceId]/contracts | NONE, under h2 "Contract calendar" | AL "Calendar" | 4: Date, What, Contract, Note | 3 (contract link) | R | note text | no |
(The page also renders Uploader → ReceiptList.)

### apps/web/src/app/p/[practiceId]/contracts/[contractId]/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 53 | /p/[practiceId]/contracts/[contractId] | NONE, under h2 "Versions" | AL "Versions" | 6: Version, Status, Effective, Rate records, Approved, Signed off | 1 (version link) | R | approver/sign-off emails | no |

### apps/web/src/app/p/[practiceId]/mapping/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 109 | /p/[practiceId]/mapping | NONE, in card | AL "Payers and plans" | 7: Payer, Plan, Status, Claims, Billed, Waiting, Mapped to | 2 (plan link), 7 (mapping links / "Map this plan") | W | planKey when no plan name | no |

### apps/web/src/app/p/[practiceId]/mapping/[planId]/page.tsx  (P3-miss)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 101 | /p/[practiceId]/mapping/[planId] | NONE, in card, under h2 | AL "Agreement resolution" | 4: Outcome, Contract version, Lines, Billed | 2 (version link) | R/F | — | no |
| 202 | /p/[practiceId]/mapping/[planId] | NONE, under h2 "Every mapping of this plan" | AL "Mappings" | 3: Mapping, State, Mapped by | MappingText may link | R | mapper email | no |

### apps/web/src/app/p/[practiceId]/remittances/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 71 | /p/[practiceId]/remittances | NONE, in card | AL "Remittances" | 7: Payer, Payment date, Trace, Amount, Claims, Balanced, Source file | 1 (payer link), 7 (source file link) | W | TRN02 trace number; doc id sliced to 8 | no |

### apps/web/src/app/p/[practiceId]/remittances/[remittanceId]/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 107 | /p/[practiceId]/remittances/[remittanceId] | NONE, in card "Provider-level adjustments (PLB)" | AL "Provider adjustments" | 5: Reason, Kind, Fiscal period, Reference, Amount | none | F | PLB reference | no |
| 145 | same | NONE, in card | AL "Claims" | 9: #, Patient, Claim control numbers, Service dates, Status, Charge, Paid, Patient responsibility, Links | 9 (reversal/line links) | F/W | patient and payer claim control numbers | no |

### apps/web/src/app/p/[practiceId]/pricing-runs/[runId]/page.tsx  (P3; already ST since PR #50)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 428-429 | /p/[practiceId]/pricing-runs/[runId] | ST "Run lines" | AL "Run lines" | 7: Code and modifiers, Units, Expected allowed, Observed allowed, Variance, Method or reason, Open | 7 (Line trace) | F | unpriced reason code | min-w-[40rem] |
(The page also renders UnpricedReasons, PatternTable and DiffTable, all ST.)

### apps/web/src/app/p/[practiceId]/reports/roi/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 63 | /p/[practiceId]/reports/roi | NONE, section "Statements" | AL "ROI statements" | 7: Period, Kind, Recovered (posted or deposited), Interest, Proof level, Generated, PDF | 1 (period link) | F | generatedBy email | no |

### apps/web/src/app/p/[practiceId]/reports/page.tsx  (UXF, P3-miss)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 239 | /p/[practiceId]/reports | NONE, under h2 | AL "Generated reports" | 4: Report, Figures fixed, PDF, Files | 1, 4 (links) | R | requestedBy email | no |
| 287 | /p/[practiceId]/reports | NONE | AL "Exports" | 3: When, What, By | 2 (link when href) | R | downloadedBy email | no |

### apps/web/src/app/p/[practiceId]/settings/access-log/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 46 | /p/[practiceId]/settings/access-log | NONE, page body | AL "Access log" | 5: When, Who, Through, What, Record | 5 (object filter link, mono) | R | actor email; object type + UUID (font-mono, no break) | no |

### apps/web/src/app/p/[practiceId]/settings/agreements/page.tsx  (UXF, P3-miss)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 92 | /p/[practiceId]/settings/agreements | NONE, in card | AL "Grants" | 5: Organization, Roles, From, Until, State | none | R | roles list | no |

### apps/web/src/app/p/[practiceId]/coverage/page.tsx  (P3-miss)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 245 | /p/[practiceId]/coverage | NONE, in card | AL "Plans waiting on mapping" | 6: Payer, Plan, Lines, Claims, Billed, Paid | 2 (plan key link) | W/F | planKey (long unbroken key) | no |
| 296 | /p/[practiceId]/coverage | NONE, page body | AL "Unpriced reasons and their remedies" | 4: Reason, Meaning, Lines, Remedy | 4 (remedy links, sometimes) | R | reason codes (NO_PFS_VALUE etc.) | no |
(The page also renders MonthsWaitingOnContent and MonthsWaitingOnLocation, both ST.)

### apps/web/src/app/p/[practiceId]/lines/[lineId]/page.tsx  (P3-miss)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 240 | /p/[practiceId]/lines/[lineId] | NONE, in card | AL "Adjustments" | 5: Level, Group, Reason, Quantity, Amount | none | F | — | no (5 short cols) |
(The page also renders LineTrace: WorksheetView (ST) and Recorded (ST over a pre).)

### apps/web/src/app/p/[practiceId]/releases/page.tsx  (P3-miss)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 154 | /p/[practiceId]/releases | NONE, section "Published releases" | AL "Rule releases" | 4: Release, Published, Standing, Your runs in effect on it | 1 (release link) | R | — | no |
(The page also renders ReleaseChanges (note.tsx) and MonthsWaitingOnContent.)

### apps/web/src/app/p/[practiceId]/uploads/[documentId]/page.tsx  (P3-miss)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 102 | /p/[practiceId]/uploads/[documentId] | NONE, in card | AL "Transaction sets" | 5: Transaction set, Outcome, Claims, Lines, Remittance | 5 (RemittanceLinks) | R | outcome reasons joined | no |
| 135 | same | NONE, in card | AL "Errors" | 3: Code, Where, What | none | R (problem list) | error text | no |
| 176 | same | NONE, in card | AL "Payments" | 5: Payment, Outcome, Claims, Lines, Remittance | 5 (RemittanceLinks) | R | payment key (mono) | no |
| 212 | same | NONE, in card | AL "Holds" | 3: Reason, Where, What, and what to do | none | R | remedy text | no |
(Zip uploads also render ReceiptList "Files in this zip", line 309.)

### apps/web/src/app/p/[practiceId]/support-access/[supportGrantId]/page.tsx  (#42: EXCLUDED, UX PR 76)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 45 | /p/[practiceId]/support-access/[supportGrantId] | NONE, in card | **no name** | 4: When, Record type, Record, Purpose | none | R | object UUID | no |

### apps/web/src/app/screening/page.tsx  (#42: EXCLUDED, already ST)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 94-95 | /screening | ST "The screening columns" | AL | 3: Column, What it holds, Example | none | R | example values | no |

### apps/web/src/app/settings/billing/[organizationId]/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 133 (review said 126) | /settings/billing/[organizationId] | NONE, in card | AL "Invoices" | 6: Invoice, For, Issued, Amount, Status, Paid | 1 (hosted invoice link, when present) | F | invoice number | no |

### apps/web/src/app/settings/organizations/[organizationId]/users/page.tsx  (#42: EXCLUDED, UX PR 75)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 51 | /settings/organizations/[organizationId]/users | NONE, in card | AL "Members" | 3 headers + actions cell: Email, Role, State, (actions) | 4 (change role / remove forms) | W | emails | no |
| 119 | same | NONE, in card | AL "Invitations" | 3 + actions: Email, Role, State, (Send again) | 4 | W | emails | no |

### apps/web/src/app/support/page.tsx  (UXF, P3-miss)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 63 | /support | NONE, under h2 "Your tickets" | AL "Tickets" | 4: Number, Subject, Opened, Status | none | R | subject | no (4 cols) |

### apps/web/src/app/status/page.tsx  (P3-miss)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 34 | /status (public) | NONE, in card "Components" | AL "Components" | 2, no thead: name, status | none | R | — | no; fits at 390 |

### apps/web/src/app/console/prospects/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 50 | /console/prospects | NONE, page body | AL "Audit requests" | 8: Organization, Contact, Locations, Payers, Billing, Received, Status, Next | 8 (org link / convert action) | W | contact email; payers list | no (capture 959 px) |

### apps/web/src/app/console/tickets/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 46 | /console/tickets | NONE, page body | AL "Tickets" | 6: Number, From, About, Message, Opened, Status | 6 (status change forms) | W | requester email; message (pre-wrap); screen id | no |

### apps/web/src/app/console/specialist-queue/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 81 | /console/specialist-queue | NONE, page body | AL "Practices" | 8: Practice, Awaiting abstraction, Drafts, Proposals, Awaiting sign-off, Open questions, Regulations to confirm, Access | 8 (open-under-grant link/form) | W | — | no (capture 768 px) |

### apps/web/src/app/console/compliance/page.tsx  (P3, UXF)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 159 | /console/compliance | NONE, in card "Policies" | AL "Policies" | 4, **no thead**: title, file, version, status | none | R | policy file path (mono) | no |
| 200 | /console/compliance | NONE, under h2 "Records kept" | AL "Evidence records" | 4: What, Subject, On, Reference | none | R | subject email; document reference | no |

### apps/web/src/app/console/terms/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 31 | /console/terms | NONE, page body | AL "Terms versions" | 5: Version, Published, Document, SHA-256, Acceptances | none | R | documentRef; SHA-256 sliced to 12 | no |

### apps/web/src/app/console/rule-releases/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 59 | /console/rule-releases | NONE, under h2 "Published releases" | AL "Rule releases" | 7: Release, Published, Records, Standing, Complete runs, Re-runs (accepted), Lines re-runs changed | 1 (release link) | R | — | no |
| 115 | /console/rule-releases?release=… | NONE, in card | AL "Affected runs by practice" | 5: Practice, Runs pinned to it (in effect), Re-runs under it (accepted), Lines those re-runs changed, Runs in effect on other releases | none | R | long headers | no |
| 164 | /console/rule-releases | NONE, in card | AL "Drafts" | 6: Draft file, Record types, Records, L1, L2, L3 | none | R | draft file path; record types list | no |
(Text boxes 198, 216 below; the page also renders ContentDueSection and ReleaseChanges.)

### apps/web/src/app/console/screening/page.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 82-83 | /console/screening | OV, in card | ALB "screening-splits" | 5: Approved, By, Facility, Non-facility, Status | none | R | approver email; POS code lists | no |

### apps/web/src/app/console/organizations/[organizationId]/page.tsx  (P3, UXF)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 133 | /console/organizations/[organizationId] | NONE, in card | AL "Members" | 4: Email, Role, Account, Actions | 4 (unlock / reset forms) | W | email | no |
| 191 | same | NONE, in card | AL "Invitations" | 4 headers + 5th action cell: Email, Role, Sent, State, (Send again) | 5 | W | email | no |
| 236 | same | NONE, in card | AL "Agreements" | 7: Kind, Practice, Version, Signer, Signed, Reference, SHA-256 | none | R | documentRef; SHA-256 sliced 12 | no |
| 305 | same | NONE, in card | AL "Grants" | 6: Grantee, Practice, Roles admitted, From, Until, State | none | R | roles list | no |

### apps/web/src/app/console/organizations/page.tsx  (P3-miss)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 51 | /console/organizations | NONE, page body | AL "Organizations" | 4: Name, Kind, Status, Created | 1 (name link) | R | — | no (4 short cols) |

### apps/web/src/app/console/billing/page.tsx  (UXF, P3-miss)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 49 | /console/billing | NONE, page body | AL "Billing status" | 5: Organization, Standing, Plan, Owed, Practices (granted, active) | none | R/F | — | no |

### apps/web/src/app/console/models/page.tsx  (UXF, P3-miss)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 93 | /console/models | NONE, in card | AL "Model flags" | 3: Flag, Applies to, Value | none | R | flag key / practice id | no |
| 120 | /console/models | NONE, in card | AL "Model spend by practice" | 5: Practice, Calls, Spent, Budget, State | none | F | — | no |

### apps/web/src/app/console/status/page.tsx  (UXF, P3-miss)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 60 | /console/status | NONE, in card "Components" | AL "Components" | 2, no thead: name + badge, Set form | 2 (ActionForm) | W (row form: UX-078 stack) | — | no |

### apps/web/src/app/console/support/page.tsx  (#42: EXCLUDED, UX PR 74)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 65 | /console/support | NONE, page body | AL "Support grants" | 9: State, Ticket, Practice, Granted to, Opened, Expires, Reads, Expiry notice, End | 9 (End now form) | W | engineer email | no (capture 739-745 px) |

### apps/web/src/components/packets/display.tsx  (P3-miss: already ST; UX-079 lists it)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 138-139 LineSchedule | /p/[practiceId]/cases/[caseId]/packet, …/packet/[versionId]/review | ST "Line schedule" | AL | 12: Row, Claim, Patient, Service date, Code, Units, Expected, Observed, Variance (Actionable), Paid, on, Deadline/Window ends, Trace | 12 (Line trace, when canOpenLines) | F (the packet's money lines) | claim control number, patient name placeholders | **no** (12 cols with no min-w) |

### apps/web/src/components/packets/calculation-words.tsx  (P3-miss: already ST)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 76-77 WorksheetView | packet, packet review, /p/[practiceId]/lines/[lineId] (LineTrace) | ST "Fee schedule worksheet N" | AL | 4: part, RVU, GPCI, unit (headings are sentences) | none | F | — | no |

### apps/web/src/components/packets/pricing.tsx  (P3-miss: already ST)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 81-82 PricingNowPanel | packet, packet review, /p/[practiceId]/cases/[caseId]/submissions | ST "Lines not on current pricing" (in card) | AL | 7: Row, Why, Expected then, Expected now, Variance then, Variance now, This version's total | none | F | — | no |

### apps/web/src/components/pricing/display.tsx  (P3-miss: already ST)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 504-505 UnpricedReasons | /p/[practiceId]/pricing-runs/[runId] | ST "Unpriced reasons" | AL | 4: Reason, Remedy, Lines, Billed | none | R | reason code | no |
| 549-550 PatternTable | same | ST "Variance by payer pattern" | AL | 6: Payer and plan, Priced under, Lines, Underpaid lines, Underpaid (validated), Overpaid (recorded) | 1 (plan key link, mono), 2 (version link) | F | plan key (font-mono, unbroken) | no |

### apps/web/src/components/pricing/content.tsx  (P3-miss: already ST)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 20-21 MonthsWaitingOnContent | /p/[practiceId]/coverage, /p/[practiceId]/releases | ST {label} | AL {label} | 6: Month, Lines, Claims, Billed, Paid, Status | none | F | — | min-w-[36rem] |

### apps/web/src/components/pricing/location.tsx  (P3-miss: already ST)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 13-14 MonthsWaitingOnLocation | /p/[practiceId]/settings/pricing, /p/[practiceId]/coverage | ST {label} | AL {label} | 6: Month, Lines, Claims, Billed, Paid, Why it waits | none | F | — | min-w-[36rem] |

### apps/web/src/components/pricing/diff.tsx  (P3, but already ST since PR #50: nothing left to wrap)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 284-285 DiffTable | /p/[practiceId]/pricing-runs/[runId], /p/[practiceId]/pricing-runs/compare | ST "Changed lines" | AL | 6: Code and modifiers, Change, In effect now/First run, Once accepted/Second run, Cause, Traces | 3-4 (SideCell links), 6 (trace links) | F | changed field names | min-w-[40rem] |

### apps/web/src/components/contracts/review.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 240-241 ReviewBody | /p/[practiceId]/contracts/versions/[versionId], /p/[practiceId]/abstraction/versions/[versionId] | OV, in each rate record's card (role=region "Rate record N") | AL "Fields" (same name on every record) | key-value: row header th = field label, then value, approval, optional control cell (no thead) | control cell (approve/correct, specialist page) | R (fields) | approver email; field text | no |

### apps/web/src/components/models/display.tsx  (P3-miss)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 100 CandidateCard (via ProposalList) | /p/[practiceId]/abstraction/versions/[versionId] | NONE, in card | AL "Proposed fields" (same on every candidate) | 4: Field, As written, Page and quote, Check against the page (row th per field) | none | R | quote text | no |

### apps/web/src/components/reports/display.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 124-125 Table (rendered 7 times by ReportSections: "Unpriced lines by reason", "Anomaly cohorts", "Validated discrepancies by payer pattern", "Validated but not actionable", "Cases", "Payer approved and recovered by case", "Evidence gaps") | /p/[practiceId]/reports/[reportId], …/[reportId]/review | OV, component root (inside role=region cards) | CAP sr-only {caption} (no aria-label) | 3 to 10 per caption; widest "Cases": Payer, Plan, Pattern, State, Lines (this run), Actionable (this run), Deadline (this run), Whole case, Pursuit cost, Net expected | none in rows (one link to /cases in a cell) | F | pattern text | no |

### apps/web/src/components/reports/documents.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 66 CoverageFigures | /p/[practiceId]/reports/documents/[documentId] | NONE, section under h2 | AL "Unpriced reasons and their remedies" | 3: Reason, Lines, Remedy | 3 (remedy screen link) | R | reason code | no |
| 110 CoverageFigures | same | NONE | AL "Plans waiting on mapping" | 4: Payer, Plan, Lines, Billed | 2 (plan_key link) | F | plan_key | no |
| 171 MonthlyFigures | /p/[practiceId]/reports/monthly, /p/[practiceId]/reports/documents/[documentId] | NONE, in card | AL "Lines by stage" | 4: Stage, Lines, Billed, Dollars | 2 (lines link), 4 (StageDollars may link) | F | — | no |
| 234 MonthlyFigures | same | NONE, in card | AL "Stages by payer" | 1 + one per stage (Payer, Flagged…Recovered: about 6) | none | F | — | no |
| 278 MonthlyFigures | same | NONE, in card | AL "Packets approved by their own writer" | 4: Case, Packet version, Approved on, Hours after it was written | 1 (case packet link) | R | packet_version_id (UUID, unbroken) | no |

### apps/web/src/components/reports/roi.tsx  (P3-miss)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 49 RoiFigure | /p/[practiceId]/reports/roi/[statementId] | NONE, in card | AL "Entries of <label>" | 4: Money moved, Stage, Amount, Entry | 4 (ledger link) | F | — | no |

### apps/web/src/components/reconciliation/template-mapper.tsx  (P3, UXF)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 173-174 TemplateMapper | /p/[practiceId]/reconciliation/template | OV, component root | AL "Preview rows" | 7: Row, Posted on, Check or trace, Amount, Payer, Claim reference, Batch | none | F (preview) | check/trace number | no |

### apps/web/src/components/uploads/receipts.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 145 ReceiptList | /p/[practiceId]/uploads, /p/[practiceId]/reconciliation, /p/[practiceId]/contracts (via Uploader, showReceipts), /p/[practiceId]/uploads/[documentId] (zip, title "Files in this zip") | NONE, section aria-label={title} under h2 | **table unnamed** (section is named) | 6: Received, Document, Kind, Size, Status, Actions | 2 (doc link), 6 (Report, retry/remove) | W | doc id short; file kind names | no |

### apps/web/src/components/releases/note.tsx  (P3)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 31 ReleaseChanges | /p/[practiceId]/releases, /console/rule-releases | NONE | AL "Changes by record type" | 4: Record type, Added, Removed, Changed | none | R | record type names | no |
| 53 ReleaseChanges | same | NONE | AL "Records that differ" | 3: Record, From, Change | none | R | record keys (mono), field lists | no |

### apps/web/src/components/releases/content-due.tsx  (P3-miss)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 145 ContentDueSection | /console/rule-releases | NONE, section under h2 "Content due" | AL "Content due by family" | 3: Content (row th), Loaded through, Status | none | R | — | no |

### apps/web/src/components/screening/coverage.tsx  (P3; UX PR 4 also owns the screening result)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 61-62 ScreeningCoverage | /screening/results/[resultId] | OV, in card | ALB "screening-coverage" | 6: Payer product, Outcome, Reason, Rows, Claim lines, Allowed in your file | none | F | unpriced reason code (mono) | no |

### apps/web/src/components/screening/anomalies.tsx  (P3-miss; belongs with UX PR 4 ux-screening-result-tables)
| Line | Route | Wrapper | Name | Columns | Focusable cols | Kind | Long values | min-w |
|---|---|---|---|---|---|---|---|---|
| 286-287 ScreeningAnomalies | /screening/results/[resultId] | RG (role=region, ALB, tabIndex 0, data-scroll) in card | ALB "screening-anomalies" | 10: Code, Payer product, Rows, Claim lines, Medicare figure, Reduced figure, Allowed in your file, Difference, Reduced difference, Status | none | F | — | no |
| 359-360 ScreeningTopRows | same | RG, in card | ALB "screening-top-rows" | 16: Row, Code, Modifiers, Units, Place of service, Payer product, Quarter, Claims, Medicare line, Medicare figure, Reduced line, Reduced figure, Allowed in your file, Difference, Reduced difference, Status | none | F | — | no |

## Fixed-height and sideways text boxes (not tables)

| File:line | Route | Box today | Name | Kind | P3 / flags |
|---|---|---|---|---|---|
| app/console/rule-releases/page.tsx:198 | /console/rule-releases?check=1 | `<pre class="max-h-96 overflow-auto">` check message + problems, no role/name/tab stop (review said :195) | none (h3 "The content checker" above) | T | P3 |
| app/console/rule-releases/page.tsx:216 | /console/rule-releases | `<pre max-h-96 overflow-auto>` RELEASE.md of each prepared release, in `<details>`, no role/name/tab stop (review said :213) | summary "RELEASE.md" | T | P3 |
| components/releases/note.tsx:94 | /p/[practiceId]/releases, /console/rule-releases | `<pre mt-2 max-h-96 overflow-auto>` release notes in `<details>`, no role/name/tab stop | summary "The release's notes (RELEASE.md)" | T | P3 |
| components/contracts/display.tsx:91 CitedPageView | /p/[practiceId]/contracts/versions/[versionId]?record=…, /p/[practiceId]/abstraction/versions/[versionId] | `<div max-h-[32rem] overflow-auto ... data-page-text>` cited page text with `<mark>`, no role/name/tab stop | none on the box | T | P3 |
| components/releases/content-due.tsx:125-136 Block | /console/rule-releases | `<pre role=region aria-label={label} tabIndex=0 max-h-96 overflow-auto>` with focus ring: **already the target treatment** | AL {label} | T | P3-miss, nothing to do (reference pattern) |
| components/pricing/line-words.tsx:117-119 Recorded | /p/[practiceId]/lines/[lineId] | ST "{step.title}, as the engine recorded it" around `<pre>` JSON; no max-h | AL via ST | T (JSON) | not P3; audit #38's JSON blocks (in flight per review) |

## Not data (layout / navigation)

| File:line | What | Note |
|---|---|---|
| components/shell.tsx:324 | phone menu drawer `max-h-[calc(100vh-3.5rem)] overflow-y-auto` | navigation, not a table; #42 file, excluded |
No `<table>` is used for layout. Tables with no thead (compliance Policies, both Components tables, Fields, Proposed
fields with row headers, Content due with row headers) are still data tables.

## Counts

- `<table>` elements: 87 (reports/display.tsx's one element renders 7 tables; ledger, reconciliation EntryTable and
  packet-reviews ExportTable each render 2 instances).
- By wrapper (87): ST 10 (one is #42's screening page), RG 2 (screening result), OV 15, NONE 60 (about 36 in a
  card's content, 24 straight in a page body or section).
- Of the 60 NONE: 4 are #42 (console/support, support-access, users x2); 56 are this PR's. So 71 tables need a
  wrapper change here (15 OV + 56 NONE), plus 4 text boxes.
- Text boxes: 6 (4 need the region treatment; content-due Block already has it; line-words is ST + audit #38).
- Layout/nav scroll box: 1 (shell, #42).
- By kind (87 tables, first-named kind): W 19 (NONE 14, OV 5), R 43 (NONE 36, OV 5, ST 2), F 25 (NONE 10, OV 5,
  ST 8, RG 2).
- min-w set: 4 tables (pricing-runs Run lines 40rem, DiffTable 40rem, MonthsWaitingOnContent 36rem,
  MonthsWaitingOnLocation 36rem). None elsewhere; LineSchedule (12 columns) has none.
- Unnamed tables: support-access reads (#42) and ReceiptList (section named, table not). reports/display Table is
  named only by an sr-only caption (fine; ScrollTable label would reuse it). Duplicate names on one page: "Fields"
  per rate record and "Proposed fields" per candidate (name each by its record/candidate number), "Entries of the
  line" per linkage line.
- `overflow-wrap:anywhere` / break-all: only `Hash` (packets/display.tsx:62-70, break-all) and line-words record
  list; nothing on emails, plan keys, file paths, document refs, control numbers.

## prs.json order 3 vs the code

Listed but already done / no table to wrap:
- components/pricing/diff.tsx and app/p/[practiceId]/pricing-runs/[runId]/page.tsx: already ScrollTable with min-w
  since PR #50 (and pricing-runs has 2 more ST tables via pricing/display). Nothing to wrap; only the ScrollTable cue
  change reaches them (and their test strings: diff.test.tsx:71,235).
- apps/web/e2e/a11y.ts, app/brand.css, components/stacked-rows.tsx (new): not sites, correctly listed as support
  files.

Missed (have a bare table or box, not #42), 21 files:
- Practice: abstraction/page.tsx (Versions in progress), coverage/page.tsx (2), lines/[lineId]/page.tsx (Adjustments),
  mapping/[planId]/page.tsx (2), releases/page.tsx (Rule releases), reports/page.tsx (2; UXF),
  settings/agreements/page.tsx (Grants; UXF), uploads/[documentId]/page.tsx (4).
- Account/public: app/support/page.tsx (Tickets; UXF), app/status/page.tsx (Components, 2 columns, fits).
- Console: console/organizations/page.tsx, console/billing/page.tsx (UXF), console/models/page.tsx (2; UXF),
  console/status/page.tsx (row form; UXF).
- Components: models/display.tsx (Proposed fields), reports/roi.tsx (ROI entries), releases/content-due.tsx (table
  only; its Block is already right), screening/anomalies.tsx (hand-rolled RG; UX PR 4's, but prs.json lists its
  sibling coverage.tsx here, so decide one owner for the screening result's three tables).
- Already ST but named in UX-079's file list and not in prs.json: packets/display.tsx (LineSchedule; needs min-w),
  plus packets/calculation-words.tsx, packets/pricing.tsx, pricing/display.tsx, pricing/content.tsx,
  pricing/location.tsx (no edit needed unless min-w/test pins change).
- Review also listed /p/[practiceId]/contracts/versions/[versionId] and /p/[practiceId]/uploads as routes: those are
  reached through components/contracts/review.tsx + display.tsx and components/uploads/receipts.tsx (listed), so no
  page file is missing for them.

ux-forms overlap: of this PR's sites, 11 files are also ux-forms files: the 5 already in prs.json (console/compliance,
console/organizations/[organizationId], p/cases, p/settings/pricing, reconciliation/template-mapper) plus 6 of the
missed ones (console/billing, console/models, console/status, p/reports, p/settings/agreements, app/support).

Line drift since 4d99df8: cases 246→242/243; packet 546→570/571; reconciliation 136→144/145; reports/display
120→124/125; rule-releases 195,213→198,216; billing invoices 126→133. Other cited lines unchanged.

## #42 sites left out

- app/console/support/page.tsx:65 "Support grants" (NONE, 9 cols) — UX PR 74.
- app/settings/organizations/[organizationId]/users/page.tsx:51 "Members", :119 "Invitations" (NONE) — UX PR 75.
- app/p/[practiceId]/support-access/[supportGrantId]/page.tsx:45 unnamed reads table (NONE) — UX PR 76.
- app/screening/page.tsx:94-95 already ST; its stacked reference is UX PR 85.
- components/shell.tsx:324 menu drawer (navigation, not a table).

## Proposals outside this item's scope (notes)

- The guard test UX-011 asks for (every `<table>` inside ScrollTable or a stacked layout) should allow-list the 5 #42
  tables by file until UX PRs 74-76 land, or it fails on day one.
- `Hash` uses break-all; an `overflow-wrap:anywhere` utility in brand.css would serve emails, plan keys, file paths
  and document refs the same way (UX-011 fix text asks for it; in scope if the PR adds the utility).
