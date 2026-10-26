# Content updates

Trigger: `.github/workflows/content-calendar.yml`, daily (07:17 UTC, once the default branch carries the workflows),
on request, on pushes to `claude/build-platform` and on pull requests that touch the calendar, its tool or `content/`
(audit #59; docs/adr/0071). An issue labelled `content-due` is open, or the console's Rule releases page shows
Content due. This runbook says what the content calendar is, what each finding asks of you, the target time to load a
period's content, and how to review a calendar entry. Loading a release into production is the content-release
runbook's (Lane A's, with audit #8; not written yet), which this one does not repeat.

## 1. What the calendar is

The content calendar is `packages/rules/src/calendar.ts` (`CONTENT_CALENDAR`, imported as `@tp/rules/calendar`): one
entry per family of global rule content, naming its contents (record types, with `mppr_rate` split into the per-code
list `mppr_code` and the general reduction `mppr_general`), its public source page, when the source publishes, how long
ahead of a period its content must be loaded, and the import commands that load it. `denial_category` is PaidWhole's
own classification and is in no entry. `contentDue()` in the same file judges, for a day, what a release holds against
the calendar. Three readers use it:

- the content-calendar workflow: its `check` job runs `tools/content-calendar/index.ts` with only read access, and its
  `notify` job, which checks nothing out and runs no repository code, opens one issue per finding whose title is not
  already open;
- the console's Rule releases page, section Content due;
- the customer's Releases page, "What this release covers", and the Coverage page's fee-schedule sentence.

Every lead, grace and publication value is a proposal until a reviewer confirms it against the entry's source page
(section 5). Until then each entry has no review, and the workflow says so.

## 2. The calendar

Held equal to `CONTENT_CALENDAR` by `tools/content-calendar/runbook.test.ts`: change the calendar, then this table,
in the same pull request. "Published ahead" is how many days before a period the source usually publishes it;
"Loaded ahead" is how many days before the period its content is due in a published release; "Grace" is how many
days after the expected publication a missing download becomes overdue.

<!-- content-calendar -->
| Family | Title | Source | Contents | Published | Ends | Published ahead | Loaded ahead | Grace | Loaded by | Reviewed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fee_schedule` | Medicare fee schedule (relative values and GPCIs) | [CMS, PFS Relative Value Files](https://www.cms.gov/medicare/payment/fee-schedules/physician/pfs-relative-value-files) | `pfs_rvu`, `pfs_gpci` | quarterly | its window | 30 | 14 | 3 | 2 import commands | not yet |
| `conversion_factor` | Medicare conversion factor | [The physician fee schedule final rule, in the Federal Register](https://www.federalregister.gov) | `conversion_factor` | yearly from 01-01 | its window | 55 | 14 | 3 | 1 import command | not yet |
| `zip_locality` | ZIP code to Medicare locality | [CMS, Zip Code to Carrier Locality File (physician fee schedule pages)](https://www.cms.gov/medicare/payment/fee-schedules/physician) | `locality_map`, `locality_map_plus_four` | quarterly | its window | 30 | 14 | 3 | 2 import commands | not yet |
| `mppr` | Medicare multiple-procedure reduction list (MPPR) | [CMS, Therapy Services](https://www.cms.gov/medicare/coding-billing/therapy-services) | `mppr_code` | yearly from 01-01 | its window | 30 | 14 | 3 | 1 import command | not yet |
| `mppr_general` | Medicare general practice-expense reduction | [CMS, Therapy Services](https://www.cms.gov/medicare/coding-billing/therapy-services) | `mppr_general` | when it changes | never (open) | — | — | — | typed with `/new-rule-record` | not yet |
| `ncci_mue` | Medicare unit limits (MUE) | [CMS, Medicare NCCI Medically Unlikely Edits (MUEs)](https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits/medicare-ncci-medically-unlikely-edits) | `ncci_mue` | quarterly | its window | 30 | 14 | 3 | 1 import command | not yet |
| `ncci_ptp` | Medicare coding edits (NCCI PTP) | [CMS, Medicare NCCI Procedure to Procedure (PTP) Edits](https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits/medicare-ncci-procedure-procedure-ptp-edits) | `ncci_ptp` | quarterly | never (open) | 30 | 14 | 5 | 1 import command | not yet |
| `code_lists` | X12 claim adjustment, remark and status codes | [X12, Claim Adjustment Reason Codes (and the remark and claim status code lists beside it)](https://x12.org/codes/claim-adjustment-reason-codes) | `carc`, `rarc`, `claim_status_code` | on 03-01, 07-01, 11-01 | never (open) | 30 | 14 | 7 | 3 import commands | not yet |
| `therapy_thresholds` | Medicare therapy thresholds | [CMS, Therapy Services](https://www.cms.gov/medicare/coding-billing/therapy-services) | `therapy_threshold` | yearly from 01-01 | its window | 55 | 14 | 3 | typed with `/new-rule-record` | not yet |
| `assistant_modifiers` | Medicare therapy assistant reduction | [CMS, Therapy Services](https://www.cms.gov/medicare/coding-billing/therapy-services) | `assistant_modifier` | when it changes | never (open) | — | — | — | typed with `/new-rule-record` | not yet |
| `sequestration` | Medicare sequestration | [CMS, Medicare notices on the payment reduction required by federal law](https://www.cms.gov/medicare) | `sequestration` | when it changes | never (open) | — | — | — | typed with `/new-rule-record` | not yet |
| `state_prompt_pay` | State prompt-pay rules | [NC Department of Insurance, Prompt Pay Requirement (and G.S. 58-3-225)](https://www.ncdoi.gov/insurance-industry/form-and-rate-filings/life-and-health/prompt-pay-requirement) | `state_prompt_pay` | when it changes | never (open) | — | — | — | typed with `/new-rule-record` | not yet |
| `dispute_windows` | Medicare appeal windows | [CMS, Original Medicare (fee-for-service) appeals](https://www.cms.gov/medicare/appeals-grievances/fee-for-service) | `dispute_window` | when it changes | never (open) | — | — | — | typed with `/new-rule-record` | not yet |
<!-- /content-calendar -->

## 3. Target time to load

The service level for every family the calendar dates (decided in docs/adr/0071):

- a period's content is in a published release 14 days (the entry's "Loaded ahead") before the period starts, when
  the source publishes at least 21 days ahead;
- otherwise, within 3 business days of the source's publication.

A family that changes only when its source does (published "when it changes") has no target date: its records are
typed by hand with `/new-rule-record` when the change is announced, and loaded in the next release.

## 4. When an issue opens

Each issue's title names the family and the period and is the same every day until the finding clears, so one issue
stays open per finding. Its body gives the dates, the source page, the exact commands for the period and this runbook.
An issue closed while its finding still holds opens again on the next run: the content is still due.

| Stage | Title begins | What to do |
| --- | --- | --- |
| No release | `No rule release is published` | Nothing for the calendar: release 1 is the content-release runbook's. Until it is published, every other finding is judged on the drafts and the prepared releases, and its title says "content in the drafts" or "not in the drafts" |
| Not loaded | `Content not loaded:` / `Content not in the drafts:` | Download the family's files for the period named and run the commands; a hand-typed family is typed with `/new-rule-record` |
| Ended | `Content ended:` | The loaded content has run out: lines on later dates wait for it. Load the next period now |
| Ends within 14 or 45 days | `Content due: <title>, loaded content ends within` | Download the next period's files when the source publishes them and run the commands |
| No draft | `Content due: <title>, <period> has no draft` | The period is due in a published release by the date in the title, and neither the drafts nor a prepared release holds a window for it. Import it now |
| Overdue | `Content overdue:` | The source usually publishes this period's files by now, and the newest files loaded were retrieved before that. Check the source page: download and import the new files, or, if the source has not published, leave the issue open and note it there |
| Calendar not reviewed | `Content calendar: entries not reviewed` | Review the entries it lists (section 5) |
| Calendar due for review | `Content calendar: <title> due for review` | The entry's last review is more than 13 months old: review it again |
| Source unreachable | `Content source unreachable:` | The page did not answer twice, 5 seconds apart. Open it in a browser: if it moved, change the entry's `source.page` in a pull request |
| Source files not recorded | `Content source files not recorded:` | Record the page's file names in the entry's `knownFiles` (section 5) |
| Source changed | `Content source changed:` | The page links to files the entry has not recorded: usually a new period's. Download and import them, then add their names to `knownFiles` |
| Check failing | `Content calendar check failing` | The check did not finish: a `COVERAGE.md` that cannot be read, a calendar that fails its schema, or a broken run. Open the run named in the issue and fix the cause; an unreadable input never reads as "nothing due" |

The commands, run from the repository root, are the entry's import templates filled for the period, then:

```sh
pnpm verify-content
pnpm release:assemble <the next release number>
```

The file placeholders in angle brackets (`<the PPRRVU file of RVU27A>`, `<download address>`) are yours to fill: the
file you downloaded, and the address you downloaded it from. Every window the commands carry is the importer's for the
period; the importer still refuses a file whose stated quarter differs (content/sources/README.md). What a release
covers, and how a release may stop covering a date only on purpose, is the README's "Coverage" section.

## 5. How to review an entry

1. Open the entry's source page. Check its cadence, "Published ahead" and "Loaded ahead" against what the page and the
   source's recent publications show; change any that are wrong.
2. Where the entry has a file pattern, list the file names the page links to that match it, as the page shows them.
3. In a pull request, set the entry's `review` to `{ by: '<your name>', on: '<today>' }`, `knownFiles` to the names
   from step 2, and this runbook's table to match. The tests check the table and the calendar's schema.

The workflow then reports only real changes for that entry: new file names on the page, and its dates.

## 6. What the console and the customer pages show

- The console's Content due, on the Rule releases page, judges **the release in force** in the database (and, with a
  checkout, the drafts and prepared releases as pending): one row per family with its loaded-through date and stage,
  the commands for the items due, and "Nothing is due." when nothing is.
- The customer's Releases page lists each family of the release in force as "<title>: loaded through <date>", or
  "<title>: in force, no end date" for a family that stays in force until replaced. The Coverage page says when the
  Medicare fee schedule for a period is not loaded.
- The workflow's issues judge **the newest published release** in the repository, which may not yet be the release
  production has loaded, or the drafts before release 1; their titles and bodies say which ("the newest published
  release (<n>)", "content in the drafts").

## 7. A correction inside a quarter, and content that runs out

Both are content/sources/README.md's procedures, followed as written there: "A correction inside a quarter" (import the
original and the corrected file for their two parts of the quarter, so the quarter stays covered once) and "Coverage"
(a release never stops covering a date its previous release covered, except before the look-back, where the source's
own dates close it, or by a note two people sign). A family whose loaded content has ended is the "Ended" stage above.

## 8. Still to come

The later pull request, after #42, adds a daily `content_due` platform job that judges the release in force in the
production database (through Lane A's `operator_content_coverage()`), with alarms 45 and 14 days before the loaded
content ends, when it ends, and when an open-ended family is overdue.
