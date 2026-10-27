# Lane B: a refused download comes back to its page, never a JSON page (UX PR 5, `co-001/ux-download-refusals`)

The UX baseline review's PR 5 (`designs/lane-b-ux-review.md` §3.2 "UX PR 5" and "### UX-010 (C-004)";
`designs/lane-b-ux-review/synthesis/prs.json` order 5; raw findings `a11y-practice-1-18`, `narrow-practice-1-09`,
`words-practice-42`). Written 2026-10-27 ~01:50 UTC against `claude/build-platform` e908c21 (#49 merged, so its
`coverage/page.tsx` and `lib/routes/coverage.ts` are the base). Session: session_01L3tN5LCq2aNYetEQBNJYZg, a Lane B
item run by Lane A's orchestrator.

## 1. The defect

Typing "ABC" in Coverage's Procedure codes and pressing "Download the letter" leaves the app for a bare JSON body,
`{"status":"invalid","issues":[{"field":"codes",...}]}`: no frame, no words, no way back, the entries gone, and 980 px
wide on a phone. The cause is general, not the letter's:

- every download route is served by `downloadHandler` (`apps/web/src/lib/http/handler.ts:260`), which answers every
  refusal with `outcomeResponse` (`:272-273`), JSON and a 4xx;
- fourteen routes use it (`coverage/letter`, the packet's and the packet review's PDF and CSV, the upload report,
  the ROI statement's PDF and CSV, the audit report's PDF, CSV and review CSV, the monthly CSV, the report document's
  PDF and CSV, the console's compliance export), and every one is opened by a browser navigation: a GET form (the
  letter) or a link (the rest);
- so any refusal of any of them (a bad field, the `export` rate limit, a file not ready, a role that cannot, a session
  that ended) shows the same dead end.

## 2. The fix, in one sentence

A download that a browser opens as a page answers a refusal with **303 to the page it was opened from**, carrying only
a closed refusal code, the refused field names and the opaque values to keep; that page shows the refusal in words
beside the form or link, inside the app frame. A script's request keeps today's JSON outcome and status.

## 3. Decisions (each the recommended option, taken under the brief §6; security: the safer one)

### D1. Who gets the redirect: a navigation, told by Fetch Metadata
- **Navigation** when `Sec-Fetch-Mode` is `navigate`. Every browser the product supports sends Fetch Metadata.
- **When `Sec-Fetch-Mode` is absent** (an old browser, a proxy that strips it), a navigation is one whose `Accept`
  lists `text/html` before `application/json` and any `*/*`. Never by User-Agent.
- **Everything else** (a `fetch()` from a script: mode `cors` or `same-origin`; curl; Playwright's request API, which
  sends no Fetch Metadata and `Accept: */*`) keeps today's JSON outcome and status, byte for byte. So every existing
  route test and e2e request assertion is unchanged.
- *Rejected:* redirecting every refusal (breaks scripts and the generated route tests that read the outcome); a
  `?format=` switch (a person's link would need it, and a missing one is the bug).

### D2. Where it goes: the route declares its page (`returnTo`), never the Referer
- `CommonSpec` gains `returnTo?: (params: Readonly<Record<string, string | undefined>>) => ReturnPage | null`, and
  `Route` carries `returnTo: … | null` (`route.ts`, copied in `invoke.ts`'s `common()`). `ReturnPage` is
  `{ path: string; keep?: Readonly<Record<string, string>>; anchor?: string }`.
- It reads the raw path and query parameters (the refusal may be that they do not validate), uses only the path
  parameters that match `opaqueId`'s pattern, and returns null when they do not.
- `downloadHandler` refuses at definition a route without `returnTo` (a thrown Error at module load, which `next build`
  and every test that imports the route file hits), and a unit test holds every download route in the registry
  (`lib/routes/index.ts`, read only) to one.
- **The handler checks the path before it answers:** it must start with one `/`, hold no `\`, `//`, control character
  or scheme, and resolve to the application's own origin (`new URL(path, services.origin).origin === services.origin`).
  A path that fails, or a null `returnTo`, sends the navigation to `/` (the home picks the practice). So no input can
  make it an open redirect.
- *Rejected:* the `Referer` header (absent under `Referrer-Policy: no-referrer`, spoofable, and an open-redirect
  surface); a generic refusal page (it would be a new registered route in `lib/routes/index.ts`, a #42 file, and it
  sends the person away from their form).

  | Route | Returns to | Anchor | Keeps |
  | --- | --- | --- | --- |
  | `practice.coverage.letter` | `/p/<practiceId>/coverage` | `letter` | `payer`, `contract`, `codes` |
  | packet PDF and CSV | `/p/<practiceId>/cases/<caseId>/packet` | `exported-files` | none |
  | packet review PDF and CSV | `/p/<practiceId>/cases/<caseId>/packet/<versionId>/review` | `exported-files` | none |
  | upload report | `/p/<practiceId>/uploads/<documentId>` | `report` | none |
  | ROI statement PDF and CSV | `/p/<practiceId>/reports/roi/<statementId>` | `downloads` | none |
  | audit report PDF, CSV, review CSV | `/p/<practiceId>/reports/<reportId>` (review CSV: its review page) | `downloads` | none |
  | monthly CSV | `/p/<practiceId>/reports/monthly` | `downloads` | `month` |
  | report document PDF and CSV | `/p/<practiceId>/reports/documents/<documentId>` | `downloads` | none |
  | console compliance export | `/console/compliance` | `export` | none |

  The builders confirm each anchor against the page and give the region that `id` where it has none.

### D3. What the redirect carries: closed codes, never text
- `refused=<status>` from a closed list: `invalid`, `not_found`, `forbidden`, `rate_limited`, `suspended`,
  `duplicate`, `csrf_refused`.
- For `invalid`, `fields=<a,b>`: the issue fields, each `^[a-z][a-z_]{0,39}$`, at most 8; never a message.
- For `rate_limited`, `retry=<whole minutes>` (1 to 1440), from `retryMinutes`.
- The route's `keep` values: each an opaque ID, or (the letter's codes) what the person typed, cut to the route's own
  limit (400). These are already in the URL the browser sent: the GET form put them there, so the redirect exposes
  nothing new. No name, date, member ID, claim number or document text can be in them (CLAUDE.md "Never"; the
  route's params schema holds `opaqueId` and the codes' 400 characters).
- **The page never renders text from the URL.** It maps codes and field names to its own words; an unknown code or
  field reads the general words. So a crafted link cannot put words in the product's frame (content spoofing).
- `unauthenticated`, `mfa_required`, `hardware_key_required`, `terms_required` and `maintenance` go where a page's
  refusal goes (`signInFor` in `lib/http/next.ts`, moved to a pure module `lib/http/sign-in-for.ts` that both
  adapters import, so the two never differ).
- The 303 carries the cookies the request wrote, `cache-control: private, no-store`, and a relative `Location`
  (RFC 9110 allows it; the origin check above already ran).

### D4. Link downloads lose the `download` attribute
- `<a download>` saves whatever comes back as a file, the refusal page included. Every success already carries
  `Content-Disposition: attachment`, so the browser saves it and stays on the page without the attribute.
- So the links in `components/uploads/receipts.tsx:176`, `uploads/[documentId]/page.tsx:296`,
  `packet/[versionId]/review/page.tsx:120,129` and `console/compliance/page.tsx:110` drop it. The other links have none.

### D5. How a page shows it
- **One parser** `lib/http/download-refusal.ts` (pure, no React): `downloadRefusal(searchParams)` returns
  `{ status, fields, retryMinutes } | null` from the closed lists, ignoring anything else.
- **One component** `components/download-refusal.tsx`: `DownloadRefusal` renders today's `Alert` (destructive), with
  `role="alert"`, a title and a next step, in words keyed by status (below). Placed in the region of the link or form
  the person used (the anchor of D2), so the fragment scrolls to it.
- **Each page** reads `props.searchParams` through the parser (display only: no read, no audit; the route's params
  schema is untouched, since `z.object` strips unknown keys anyway).
- **Words** (brand.md: plain, second person, a next step in each):
  - `invalid`: "This file could not be made from what was asked. Check the fields marked below and try again." (the
    letter's own words replace it, below);
  - `not_found`: "This file is no longer available here. Reload the page to see the files that are.";
  - `forbidden`: "Your role in this practice cannot download this file. A practice administrator can change your role
    on Settings → Users.";
  - `rate_limited`: "Too many downloads in a short time. Wait N minute(s) and try again." (`retryMinutes`' words, as
    `guardMessage` says it);
  - `suspended`: "Downloads are paused while the organization is suspended. The billing page says why and what lifts
    it." with the billing link where the role may open it;
  - `csrf_refused`, `duplicate`: "This download could not be checked against your session. Reload the page and try
    again."
  - The builders hold these against `.claude/rules/brand.md`, `tools/brand-copy` and the forbidden words already in
    use (`PermissionState`), and adjust within them; the PR description reports the final words.

### D6. Coverage's letter form
- **Kept values:** the payer select, the contract select and the codes input take `payer`, `contract` and `codes` as
  their default values (only an ID that is in the page's own options is selected; anything else falls back to today's
  default).
- **The refused field:** `codes` gets `aria-invalid="true"`, the message in a `<p id="letter-codes-error">` tied by
  `aria-describedby` (with the hint), and `autoFocus` (the first refused field takes focus on arrival, so a keyboard and
  a screen reader land on it). `contract` likewise on the contract select; a `not_found` (the payer is not the
  practice's) marks the payer select.
- **Words** (the UX review, taken under the co-founder's ruling):
  - hint: "Five-character codes separated by commas, such as 97110, 97530. Leave blank to ask for the whole schedule."
  - codes refused: "Procedure codes: enter five-character codes separated by commas, such as 97110, 97530, or leave the
    field blank." The review's version quotes the typed value ("“ABC” is not a procedure code"); D3 forbids text from
    the URL in the product's words, so the value stays in the field, marked, and the message names the rule.
  - contract refused: "The payer’s contract: choose one of this payer’s contracts, or None named."
  - payer not found: "Payer: choose one of the payers listed."
- **Before the server:** the codes input takes the route's rule as `pattern` (five letters or digits, separated by
  commas, spaces or semicolons; blank allowed; case-insensitive), `autoCapitalize="characters"`, `spellCheck={false}`,
  and the hint. Native validation stays, as ux-forms decided (`designs/lane-b-ux-forms.md` §11, its format hints
  answer the browser's "Please match the requested format"). The server's check stays the rule; the pattern only
  saves a round trip, and is tested to accept exactly what `letterCodes` accepts.
- `coverage.ts`'s issue message stays as the API's words (scripts read it).

### D7. Size, files, #42, migration
- **Files** (prs.json order 5, widened by D2's table and D4): `lib/http/{handler,route,invoke}.ts`, the new
  `lib/http/{download-refusal,sign-in-for}.ts`, `lib/http/next.ts` (imports `signInFor`), `lib/http/download-refusal.test.ts`
  (new), `components/download-refusal.tsx` (new), the route files of D2's table (`lib/routes/{coverage,packets,uploads,roi,reports,monitoring,report-documents,compliance}.ts`:
  one `returnTo` each), the pages of D2 and D4, `e2e/onboarding.spec.ts`, docs (ADR 0079, test-matrix DLR-01 to DLR-04,
  `packages/synth` registry entries if the fixtures test needs them, module 18).
- **#42:** none of its files. Checked 2026-10-27 01:45 UTC with `git diff --name-only $(git merge-base origin/claude/build-platform origin/co-001/pr-06b-mail-streams) origin/co-001/pr-06b-mail-streams`:
  it changes `lib/http/http.test.ts` and `lib/http/rate-limit.ts` (so `downloadHandler`'s tests go in the new
  file, and `retryMinutes` is imported, not changed), `components/shell.tsx` (used, not changed) and
  `lib/routes/index.ts` (read by the test, not changed); not `handler.ts`, `route.ts`, `invoke.ts`, `next.ts` or any
  file above.
- **Migration:** none. Nothing is stored; the refusal is in the URL of one response.
- **Overlap with open work:** ux-forms (`co-001/ux-forms`, no PR) changes `components/field.tsx` and `packages/ui`'s
  input (a 2 px invalid mark on `aria-invalid`); this PR sets `aria-invalid` on today's `Input`, so the mark arrives
  with ux-forms and nothing here conflicts. ux-table-scroll (PR 3) may touch the report and packet pages: the one
  merged second keeps both (LANES.md rule 6).

### D8. ADR 0079
"Answer a download's refusal to a browser navigation with 303 to the page it was opened from, in closed codes; keep
the JSON outcome for scripts." It records D1 to D4, the closed lists, the rejected options, and that every future
download route declares `returnTo` (enforced at definition).

## 4. Tests (test-matrix DLR-01 to DLR-04, a new series)

| ID | Case | Expected |
| --- | --- | --- |
| DLR-01 | A navigation's refused download | `downloadHandler` answers `Sec-Fetch-Mode: navigate` (and, without Fetch Metadata, an `Accept` preferring `text/html`) refusals with 303 to the route's `returnTo` page: `refused=<status>`, `fields` for invalid, `retry` for a rate limit, the route's kept values, the anchor; cookies written and `private, no-store`; signed-out statuses go where a page's go; the letter's bad codes, other payer's contract and unknown payer each return to Coverage |
| DLR-02 | A script's refused download | Without a navigation (mode `cors`, `same-origin`, no Fetch Metadata with `Accept: */*` or JSON first) the JSON outcome and status are exactly today's; a success is the same attachment either way; a HEAD or POST still refused before the route runs |
| DLR-03 | Every download route has a safe page | Every route `downloadHandler` serves declares `returnTo` (the definition refuses one without); for hostile parameters (`//evil.example`, `/\evil`, `javascript:`, encoded slashes, control characters, an ID that is not opaque) the Location is the application's own origin, or `/`; the page parser accepts only the closed codes and field names and ignores everything else |
| DLR-04 | The person sees it in the frame (e2e and axe) | `onboarding.spec.ts`: a bad code on the letter (opened by navigation, past the pattern) returns to Coverage with the codes kept, the field marked `aria-invalid`, its message tied by `aria-describedby` and focused; axe (WCAG 2.1 A/AA) passes on `/p/[practiceId]/coverage` in that state; the pattern blocks the bad code before submit; a good letter still downloads. One link download's refusal (a packet or report file not available) returns to its page with the notice |

Unit tests in `apps/web/src/lib/http/download-refusal.test.ts` (new) cover DLR-01 to DLR-03 against fake routes and
the registry; the pattern's equivalence with `letterCodes` is a property test over generated strings. `packages/synth`
registry entries DLR-01 to DLR-04, no files, module 18, if the fixtures test needs one per matrix row (it did for DBF).

## 5. Pipeline for this PR
1. This design, with one adversarial reviewer (a workflow agent) that tries to break D1 to D6.
2. Builders: one workflow, two agents in series (the handler core and its tests; then the routes, pages and e2e), each
   checking what it touches (eslint, typecheck, the unit tests of the files).
3. Draft PR into `claude/build-platform`, the template's every section.
4. Two adversarial reviews: the UX and brand review (`.claude/agents/ux-brand-reviewer.md`, before and after shots at
   1280 px and 390 px light and 1280 px dark through `tools/lane-b-screen-tour/README.md` "From another lane"), and a
   security review (`.claude/agents/security-reviewer.md`: a redirect built from request input and a change to every
   download route is the open-redirect and content-spoofing surface).
5. Fix round with the full local suite once, one push; 6. fresh-clone verification reading CI; 7. merge per
   lanes/lane-b.md "Merging".

## 6. Design review and dispositions (2026-10-27 ~02:10 UTC)

One adversarial reviewer (workflow `wf_a85eb619-cf6`; script `workflow-scripts/lane-b-ux-download-refusals-design-review-wf_a85eb619-cf6.js`;
findings `designs/lane-b-ux-download-refusals-review.json`). Verdict: **build with changes**; no migration; no #42
file. All 18 findings are taken. **Where this section and §2 to §5 disagree, this section wins**; builders read it as
the amendment.

| ID | Sev. | Disposition (the design as amended) |
| --- | --- | --- |
| R01 | blocking | `returnTo` stays optional; `downloadHandler` does **not** throw (it would break `http.test.ts`, a #42 file whose fake download routes have none). A route without one sends a navigation to `/`. The rule is enforced in `download-refusal.test.ts`: it scans `apps/web/src/app/**/route.ts` for `downloadHandler(X)` (as `registry.test.ts:151` does with `routesUsed`) and requires every X to declare `returnTo`. DLR-03 reads "the registry test refuses one without". |
| R02 | blocking | **No fragment on the 303**; `ReturnPage.anchor` is dropped (a fragment makes the browser skip autofocus). The letter's first refused field takes `autoFocus`; a link refusal's `DownloadRefusal` notice takes `tabIndex={-1}` and `autoFocus` and keeps `role="alert"`. Field and notice get `scroll-margin-top` (the sticky header plus 16 px) until ux-forms' `scroll-padding-top` lands. DLR-04 asserts `toBeFocused()`. |
| R03 | blocking | The synth entries are required: a test-matrix section "## Download refusals (DLR)" with the header `| ID | Case | Assertion |` and four rows with no `|` inside; `packages/synth/src/cases/matrix.ts` rows; `registry.ts` `DLR-01`..`DLR-04` as `none(...)` entries naming the real test files; `'DLR'` in `CASE_MODULES` (`packages/synth/src/expected/types.ts:9`); `DLR: 18` in `MODULE_NUMBER` (`common.ts:18`); the four `fixtures/synthetic/DLR-0N/expected.json` that `pnpm synth --all` writes, committed. ux-forms appends to the same lines (FRM 16): the one merged second keeps both. |
| R04 | should-fix | Field names match `^[a-z][A-Za-z0-9_]{0,39}$` (camelCase path parameters kept; dotted paths dropped), at most 8. |
| R05 | should-fix | `returnTo` may read one closed `from` parameter per route: report PDF/CSV `from=list` (→ `/reports`) or `from=review` (→ the review page); report document PDF/CSV `from=list`; upload report `from=reconciliation` or `from=contracts` (receipts render there). The linking pages add `?from=` to the href; a missing or unknown value takes the default of §3 D2's table. |
| R06 | should-fix | `letterCodes` tightens to test `/^[0-9A-Za-z]{5}$/` on the trimmed code **before** upper-casing (so `ſ9711`, `ßAB1` are refused, as the pattern refuses them); `lib/contracts/letter.ts` and its test join the files. The input's pattern is exactly `[\s,;]*(?:[A-Za-z0-9]{5}(?:[\s,;]+[A-Za-z0-9]{5})*)?[\s,;]*` (checked under the `v` flag), `maxLength={400}`. The property test draws from non-ASCII letters with case mappings (ſ, ß, ı, ﬀ), Unicode spaces and separators and asserts the pattern agrees with the route's acceptance. |
| R07 | should-fix | Every kept value is validated with the schema of the page it returns to before it enters the Location (`payer`, `contract`: `opaqueId`; `month`: `^\d{4}-(0[1-9]\|1[0-2])$`); a failing value is dropped. DLR-03: a bad month returns to `/reports/monthly` without `month`, and the page renders (no 404). |
| R08 | should-fix | Codes are kept only when the trimmed value matches `^[A-Za-z0-9\s,;]{1,400}$` with every token at most 10 characters; otherwise dropped (the field is empty, still marked, the message names the rule). DLR-03 runs every Location the tests build through `urlPhiFindings` (`@tp/observability`) and expects none. D3 records that the GET form already puts the codes in the URL, and the redirect copies them only within that alphabet. |
| R09 | should-fix | Words: forbidden, title "Not available to your role", body "Your role cannot download this file. Users and roles are managed by your organization’s administrator."; on the console, "Only a platform administrator can download the evidence export."; not_found "This file is not available here now. Reload the page to see the files that are."; suspended keeps its words with no role-dependent link (it is unreachable on downloads today: no download route is in `RUN_STARTING_ROUTES`). |
| R10 | should-fix | Overlap corrected: `co-001/ux-forms` (ADR 0077, FRM 16, no PR) changes 85 files, among them `console/compliance/page.tsx`, `reports/[reportId]/review/page.tsx`, `reports/page.tsx`, `lib/routes/compliance.ts`, the synth `common.ts`, `types.ts`, `matrix.ts`, `registry.ts` and `test-matrix.md`: LANES rule 6, the one merged second keeps both. The letter's refused field follows ADR 0077 D3: `<p id="letter-codes-error">` reads "Error: " then the message, `aria-describedby="letter-codes-error letter-codes-hint"`, the codes in mono. Whichever PR merges second moves the letter onto `components/field.tsx`. |
| R11 | should-fix | A navigation is `Sec-Fetch-Mode: navigate` with `Sec-Fetch-Dest: document` (or Dest absent). `<a download>` and "Save link as" (navigate, Dest empty) get JSON, so they never save the app's HTML under the file's name. Without Fetch Metadata: `Accept` ranks `text/html` (q>0) above `application/json` and `*/*`; no `Accept` is a script. DLR-02 adds "navigate with Dest empty → JSON" and "no Accept → JSON". |
| R12 | should-fix | DLR-04 goes in a new `apps/web/e2e/download-refusals.spec.ts` on the seeded synthetic practice with payers (not `onboarding.spec.ts`): (1) the letter with "ABC", `novalidate` set by the test, returns to Coverage with the codes kept, `aria-invalid`, focus on the field, axe passing; (2) the pattern blocks "ABC" (`validity.patternMismatch`); (3) a good letter fires `waitForEvent('download')`; (4) a viewer's `page.goto(<report>/csv)` lands on the report page with the forbidden notice focused. |
| R13 | nit | D4 confirmed; nothing relies on the attribute. |
| R14 | nit | Pages parse `props.searchParams` with a zod fragment (`z.enum(...).optional().catch(undefined)` per key) exported beside `downloadRefusal()`; parsed in the page, not the route, because it is display only and adds no read or audit. The uploads page gains `searchParams` in its props. |
| R15 | nit | The 303 is `new Response(null, { status: 303, headers })` (undici's `Response.redirect` needs an absolute URL); kept values are encoded with `URLSearchParams`; `ReturnPage.path` is built only from route constants and parameters that passed `opaqueId`. |
| R16 | nit | 15 download routes, not 14. A later success leaves `?refused=` in the URL (a download does not navigate), so the notice stays beside a now-correct field: accepted and recorded in ADR 0079; ux-forms' `Field` clears a field's mark on input when the letter moves onto it. |
| R17 | nit | `signInFor` moves to `lib/http/sign-in-for.ts`; no sign-in return path in this PR (a second redirect surface; ADR 0079 "Revisit when"). |
| R18 | nit | ADR 0079 and the security review kept; the security reviewer gets DLR-03's hostile inputs and R08's cross-site navigation case. The codes 97110 and 97530 in the hint and message render in mono with tabular numerals. |

**Next:** builders (one workflow, two agents in series), after the usage hold lifts at 14:05 UTC.

## 7. After the reviews (fix round, 2026-10-27 ~20:00 to 22:30 UTC)

The two adversarial reviews (`wf_1c44b1a2-762`: security, and UX and brand on 74 after shots) and their verification (one
skeptic per finding; 16 real, UX-DLR-12 and 13 not defects; `approval-summaries/lane-b-ux-download-refusals-review-findings.json`)
changed the design in these places. **ADR 0079 is the record of what is built; where §3, §4 or §6 disagree, it wins.**

- **D5's words (R09):** every refusal is titled "Not downloaded" (UX-DLR-08); forbidden reads "Your role cannot download
  this file. Ask your organization’s administrator, who manages users and roles."; not_found "This file is not available
  here now. This page lists the files that are."; no notice tells the person to reload.
- **R16:** a shown refusal leaves the address bar (`ForgetRefusal`, on a timer with a null history state so Next moves its
  canonical URL too; UX-DLR-01), with each page's return-only keys (`forget`: the letter's entries, the Reports list;
  SEC-02, UX-DLR-14); the notice outlasts a router refresh while the person stays on the page (`RefusalNotice`). The
  letter clears a control's mark as the person edits it, and on a valid submit clears every mark and the refusal's keys
  (`LetterMarks`; UX-DLR-04), rather than waiting for ux-forms' Field.
- **D4:** on pages that hold what a reload would lose (the Uploads screen mid-batch, the export review's checklist, the
  audit report's reviewer checklist, the packet page's version form, the console's evidence export) the link is a
  `DownloadLink`: a plain click fetches the file as a script and says a refusal in place; the href keeps the 303 path for
  a new tab or no script (UX-DLR-02). Uploader warns before leaving while a file is sending.
- **D6:** the letter's messages follow "Error: " with no field-name prefix: payer "Choose one of the payers listed.",
  contract "Choose one of this payer’s contracts, or None named.", codes "Each code must be five letters or digits."
  (UX-DLR-10); a not-found payer shows "Choose a payer" (UX-DLR-06); no placeholder (UX-DLR-07); each example code in
  mono, the separators not (UX-DLR-09); every control's `aria-describedby` is its own attribute (UX-DLR-03, for ux-forms'
  FRM-04). Before the server, the contract select also refuses another payer's contract (`setCustomValidity`; UX-DLR-15).
- **D3, R08:** `keptCodes` itself drops a value with an identifier's shape, so the 303 and the page share one rule; the
  separators are never read as "-", which would drop valid lists such as "L1832, 0101T" (SEC-01).
- **R05:** the upload report's `from` is `uploads` only (Reconciliation and Contracts show no receipts); a zip's files
  download in place, and only a new tab returns to the file's receipt, which links its zip (UX-DLR-13).
- **Forbidden branches:** a return page that the person's role cannot open says the file's own reason where it is
  narrower than the file's (the packet page, the reviewer checklist; UX-DLR-05), and every return page forgets a refusal
  shown on its Forbidden branch.
- **With ux-forms (#74, ADR 0077):** whichever merges second moves the letter's controls onto form-issues' `FieldError`
  and drops `scroll-mt-18` for ADR 0077's `scroll-padding-top` (UX-DLR-11).
