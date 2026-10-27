# 0079. Answer a download's refusal to a browser navigation with 303 to the page it was opened from, in closed codes, and keep the JSON outcome for scripts

- **Status:** accepted (`co-001/ux-download-refusals`, the UX baseline review's fifth pull request; UX-010, C-004).
  Adds to [0017](0017-one-route-wrapper-a-route-registry-and-the-persona-matrix-as-data.md) (one route wrapper and a
  route registry: a download route now names its page) and to
  [0053](0053-onboard-customers-through-recorded-agreements-gate-every-request-on-csrf-rate-limits-terms-and-maintenance-and-keep-soc2-evidence-as-a-checked-map.md)
  (the gates whose refusals a download now says in words); reverses none of their rulings
- **Date:** 2026-10-27
- **Deciders:** the founder, under the standing rule of 2026-10-18; the co-founder, under the founder's delegation of
  2026-10-25, whose rulings have the build take each recommended option and wording without asking; the build
  (Lane B), for the design review's eighteen findings (R01 to R18, all taken). Each reversible by the founder
- **PRD sections:** 6 (Cross-cutting: every error shown with a next step; PRD.md:256), 7 (every screen has an error
  state with a next step); test matrix DLR-01 to DLR-04

## Context

Typing "ABC" in Coverage's Procedure codes and pressing "Download the letter" left the app for a bare JSON body,
`{"status":"invalid","issues":[{"field":"codes",...}]}`: no frame, no words a person reads, no way back, the entries
gone, and 980 px wide on a phone (UX-010). The cause was general, not the letter's:

- **One adapter, one answer.** Every download route is served by `downloadHandler` (`apps/web/src/lib/http/handler.ts`),
  which answered every refusal with `outcomeResponse`: the JSON outcome and a 4xx.
- **Fifteen routes, each opened by a browser.** The request-to-payer letter, the packet's and the packet review's PDF
  and CSV, the upload report, the ROI statement's PDF and CSV, the audit report's PDF, CSV and review CSV, the monthly
  CSV, the report document's PDF and CSV, and the console's evidence export. Coverage's letter is a GET form; the rest
  are links. So any refusal of any of them (a bad field, the `export` rate limit, a file not ready, a role that cannot,
  a session that ended) showed the same dead end.
- **Scripts read the JSON.** The generated route tests call `invoke` directly, and every end-to-end assertion of a
  download's refusal reads it through Playwright's request API (`reports.spec.ts`, `packets.spec.ts`,
  `onboarding.spec.ts`), which sends no Fetch Metadata and `Accept: */*`. Their outcome had to stay byte for byte.
- **What constrained the design** (the review's findings). `lib/http/http.test.ts`, a file of pull request #42 that
  this pull request may not edit, builds four download routes with no page of their own (R01). A fragment on the
  redirect makes the browser skip every `autofocus` candidate, so the refused field would not take focus (R02).
  `<a download>` and "Save link as" navigate with an empty destination, and would save the app's HTML under the file's
  name (R11). Several links open the same route from different pages (R05). The monthly page answers a month it cannot
  read with a 404, so a kept bad month would turn one refusal into another (R07). And the letter's codes are whatever
  the URL holds, which a link from another site can choose (R08).

## Decision

1. **Who gets the redirect: a browser navigation, told by Fetch Metadata (R11).** `isNavigation(request)` in
   `handler.ts` counts a request as a navigation when `Sec-Fetch-Mode` is `navigate` and `Sec-Fetch-Dest` is
   `document` or absent: a link, a GET form, a new tab. A download link and "Save link as" (navigate, Dest empty) and a
   frame are not. When a request carries no `Sec-Fetch-Mode` (an old browser, a proxy that strips it), it is a
   navigation only when its `Accept` ranks `text/html` with a weight above zero above `application/json` and `*/*` (at
   equal weight, the one listed first wins); no `Accept` is a script. Never the User-Agent. Everything else (a
   `fetch()` in mode `cors` or `same-origin`, curl, Playwright's request API, `new Request()` in a unit test) keeps
   `outcomeResponse` exactly as before, status, headers and body. A success is the same attachment either way, and a
   HEAD or any method but GET is still refused with 405 before the route runs (docs/adr/0061: a download records
   itself as it reads the file).
2. **Where it goes: the route names its page, never the Referer (R01, R05, R15).** `CommonSpec` takes an optional
   `returnTo(params)`, copied to `Route.returnTo` (null when absent) by `invoke.ts`'s `common()`. It reads the request's
   raw path and query parameters as strings (the refusal may be that they do not validate) and returns a
   `ReturnPage { path; keep? }` or null. A route builds it only through `returnPage(template, params, keep)` in
   `lib/http/download-refusal.ts`: the template is the page's route path (`'/p/[practiceId]/coverage'`), each `[name]`
   is filled only with a parameter that passes `opaqueId` (lowercased), anything else gives null, and a template that
   is not route words and `[name]` parameters throws. A link opened from more than one page adds `?from=` from a
   closed list the route reads with `cameFrom()`; a missing or unknown value takes the route's own page. The route's
   params schema never sees it (`z.object` strips it).

   | Route | Returns to | Keeps |
   | --- | --- | --- |
   | `practice.coverage.letter` | Coverage | `payer`, `contract` (`keptId`), `codes` (`keptCodes`) |
   | packet PDF and CSV | the case's packet page | `version` (`keptId`), so the builder sees the version they were on |
   | packet review PDF and CSV | the version's review | none |
   | `practice.uploads.report` | the file's receipt; with `from=uploads`, the Uploads screen | none |
   | ROI statement PDF and CSV | the statement's page | none |
   | audit report PDF and CSV | the report's page; `from=list`, Reports; `from=review`, the reviewer's checklist | none |
   | audit report review CSV | the reviewer's checklist | none |
   | monthly CSV | the monthly summary | `month` (`keptMonth`) |
   | report document PDF and CSV | the document's page; `from=list`, Reports | `list=documents`, so Reports shows the notice in that list |
   | `console.compliance_export` | the console's evidence checklist | none |

   The design's `from=reconciliation` and `from=contracts` for the upload report were not built: the receipts on
   those two pages show no report link (`showReceipts={false}`), so `from=uploads` is the one other page.
   **`downloadHandler` never refuses a route without `returnTo`** (it would fail #42's `http.test.ts`): such a route
   sends a navigation to `/`. The rule is held by a registry test instead, in `lib/http/download-refusal.test.ts`: it
   finds every `downloadHandler(X)` in `apps/web/src/app/**/route.ts` (fifteen today), requires X to be the route
   registered at that file's path, to declare `returnTo`, to name a page on the application's origin for synthetic
   IDs (under `/p/<that practice>`, or `/console/` for the evidence export), and to send every hostile ID to `/`. So a
   new download route without a page fails CI, not a person.
3. **What the redirect carries: closed codes, never text (R04, R07, R08, R15).** `refusalLocation()` writes the
   `Location`; `downloadRefusal()` reads it back, both in `lib/http/download-refusal.ts`, so the writer and the reader
   never differ.
   - **The status.** `refused=` takes one of `invalid`, `not_found`, `forbidden`, `rate_limited`, `suspended`,
     `duplicate`, `csrf_refused` (`DOWNLOAD_REFUSALS`). The signed-out statuses (`unauthenticated`, `mfa_required`,
     `hardware_key_required`, `terms_required`, `maintenance`) go where a page's refusal goes: `signInFor`, moved from
     `lib/http/next.ts` to `lib/http/sign-in-for.ts` unchanged, so a page, a server action and a download never differ.
   - **The fields.** For `invalid` only, `fields=` lists the issues' field names that match `^[a-z][A-Za-z0-9_]{0,39}$`
     (a parameter or input name; a dotted path is dropped), each once, at most 8. Never a message.
   - **The wait.** For `rate_limited` only, `retry=` is the whole minutes `retryMinutes` (`lib/http/rate-limit.ts`, read
     only) gives, from 1 to 1440.
   - **The kept values.** Each is validated with the schema of the page it returns to before it enters the `Location`
     (`keptId`: `opaqueId`; `keptMonth`: `^\d{4}-(0[1-9]|1[0-2])$`; `keptCodes`: the trimmed value matches
     `^[A-Za-z0-9\s,;]{1,400}$` with every token at most 10 characters), and a value that fails is dropped, never sent,
     so the monthly page never 404s on a kept month. `refusalLocation()` then drops any kept value whose name is not a
     lowercase code, that takes a refusal key, or that the PHI guard (`textPhiFindings`, `@tp/observability`) finds an
     identifier's shape in. The codes are already in the URL the browser sent (a GET form puts them there); the
     redirect copies them only within that alphabet.
   - **The path.** `safeReturnPath()` admits only one `/` and then route words and opaque IDs
     (`(/[A-Za-z0-9._~-]+)+`), unchanged when resolved against `services.origin` and on that origin: no `\`, `//`,
     `%`, `:`, control character, query or fragment. A path that fails, a null page, a missing `returnTo` or one that
     throws sends the navigation to `/` (the home picks the practice). No input can make it an open redirect.
   - **The response.** `new Response(null, { status: 303, headers })` (undici's `Response.redirect` needs an absolute
     URL), with a relative `Location` (RFC 9110), `cache-control: private, no-store` and the cookies the request wrote.
     The query is encoded with `URLSearchParams`, in the order refused, fields, retry, then the kept values. **No
     fragment** (R02): the refused field or the notice takes the focus instead (5 below).
4. **Link downloads lose the `download` attribute (R13).** `<a download>` sends Dest empty, so under 1 its refusal
   would be JSON saved as the file. Every success already carries `Content-Disposition: attachment`, so the browser
   saves it and stays on the page without the attribute. The links in `components/uploads/receipts.tsx`,
   `uploads/[documentId]/page.tsx`, `packet/[versionId]/review/page.tsx` and `console/compliance/page.tsx` drop it; the
   other links had none. A link that keeps it by mistake gets JSON, never the app's HTML under the file's name.
5. **How a page says it.** Each page parses `props.searchParams` with `downloadRefusal()`, whose zod fragment
   (`downloadRefusalParams`) takes each key `.optional().catch(undefined)`, so an unknown code, a repeated key, a field
   that is not a name or a wait out of range is ignored, never a refusal of the page (R14). It is parsed in the page,
   not its route, because it is display only: no read and no audit event. `components/download-refusal.tsx` renders
   the notice (`Alert`, destructive, `role="alert"`) beside the link or form the person used, in the product's own
   words keyed by status, never text from the URL, so a crafted link cannot put words in the product's frame (R09:
   "Not available to your role" and "Your role cannot download this file. Users and roles are managed by your
   organization’s administrator.", and on the console "Only a platform administrator can download the evidence
   export."; `not_found` "This file is not available here now. This page lists the files that are."). Once shown, the notice
   takes its keys (`refused`, `fields`, `retry`) out of the address bar with `history.replaceState`
   (`components/forget-refusal.tsx`), so a reload, a bookmark or a copied link shows the page as it is now; the notice
   stays on screen until the person moves on, and the letter's field marks, which render no notice, stay in the URL
   with its entries so a reload keeps both. The notice
   takes `tabIndex={-1}` and `autoFocus`, and keeps clear of the sticky header with `scroll-margin-top` (`scroll-mt-18`:
   the header's 56 px and 16 px) until ux-forms' page-wide `scroll-padding-top` (ADR 0077 D4) lands. Coverage's letter
   marks the refused control instead (`aria-invalid`, "Error: " and its message in `letter-<control>-error`, named
   first by its `aria-describedby`, and `autoFocus` on the first marked control), keeps the validated entries as the
   form's defaults (a payer or contract only when it is one of the form's own options), and gives the codes input the
   route's rule as its `pattern` (`LETTER_CODES_PATTERN`), with `letterCodes` tightened to test `/^[0-9A-Za-z]{5}$/`
   before upper-casing so the two accept exactly the same codes (R06).

## Alternatives considered

- **Redirecting every refusal.** It breaks scripts and the generated route tests that read the outcome.
- **A `?format=` switch.** A person's link would need it, and a missing one is the bug.
- **The `Referer` header.** Absent under some referrer policies and from a typed or bookmarked URL, set by whoever
  sends the request, and an open-redirect surface.
- **A generic refusal page.** A new registered route in `lib/routes/index.ts`, a #42 file, and it sends the person
  away from their form.
- **Refusing a route without `returnTo` at definition** (the design's first version). It throws for #42's four test
  routes in `http.test.ts`; the registry test enforces the same rule on every real route (R01).
- **A fragment to scroll the page to the region** (`#letter`, `#downloads`). HTML's "flush autofocus candidates" skips
  every candidate when the document has a target element, so the refused field would not be focused (R02).
- **`Sec-Fetch-Mode: navigate` alone.** A download link and "Save link as" would save the app's HTML under the file's
  name (R11).
- **Saying the typed value back** ("“ABC” is not a procedure code", the UX review's words). It puts text from the URL
  in the product's words; the value stays in the field, marked, and the message names the rule.
- **Keeping codes of any alphabet, or up to the route's 400 characters of anything.** A link from another site could
  fill the field with a chosen sentence or an identifier, and the ALB's logs would hold it twice (R08).
- **Clearing the notice when a later download succeeds.** A download does not navigate, so the page cannot see it
  succeed without client code on every link; accepted as it is (Consequences).

## Consequences

- A person who opens a refused download stays in the app, on the page they used, with the refusal said beside the
  link or form and the focus on it; a script's request, every route test and every end-to-end request assertion are
  unchanged (DLR-01, DLR-02, DLR-04).
- Every new download route declares `returnTo` through `returnPage`, or the registry test in
  `download-refusal.test.ts` fails; a route that names no page still sends a navigation to `/`, never to JSON (DLR-03).
- **A later success leaves the notice on screen (R16).** A download does not navigate, so after a good letter or file
  the notice (or the letter's marked field) stays beside a link or field that is now fine, until the person moves on.
  The notice's keys have already left the address bar (`ForgetRefusal`), so a reload shows the page as it is now, and
  no notice tells the person to reload: each says what to do on the page itself. The letter keeps its marks and entries
  in the URL, so a reload keeps them; ux-forms' `Field` clears a field's mark as the person types once the letter moves
  onto it (Revisit when).
- **A crafted link can still fill the codes field.** Coverage reads `?codes=` back only beside a refusal and only
  through `keptCodes`, so a link from another site (SameSite=Lax cookies ride a top-level GET) can place letters,
  digits and separators there ("Call 555 0100", for example), shown as the field's value, marked refused, under the
  product's message that names the rule; never as the product's own words, never a date, nine digits or another shape
  the PHI guard knows. The security review is given this residual beside DLR-03's hostile inputs (R18).
- A signed-out download goes to sign in, the terms or maintenance, as a page does, and does not come back to its page
  afterwards: the product has no sign-in return path yet.
- The kept values travel in one more URL (the 303's), which the load balancer's access log records as it already
  records the GET form's.
- The DLR rows of the test matrix hold the behaviour: `apps/web/src/lib/http/download-refusal.test.ts` (DLR-01 to
  DLR-03, against fake routes and the registry, with every `Location` it builds checked by `urlPhiFindings`, and the
  codes pattern held to `letterCodes` over 20,000 seeded strings), the component's and the letter's unit tests, and
  `apps/web/e2e/download-refusals.spec.ts` (DLR-04, on a practice of its own with axe at 1280 and 390 px).

## Not verified here

- The fallback without Fetch Metadata: every browser the product supports sends it (Safari from 16.4), and CI runs
  Chromium; the `Accept` rule is held by unit tests only.
- Screen readers by hand: a notice present at first load with `role="alert"` and focus is announced as the focused
  element, which the tests assert as focus and attributes; the manual checks belong to the accessibility pull request
  (combined audit #103).

## Revisit when

- Sign-in gains a return path (UX-006, and UX PR 59's maintenance return path): a refused download then may come back
  to its page after sign-in, a second redirect surface that needs its own design and checks (R17).
- ux-forms (ADR 0077) merges: the letter moves onto `components/field.tsx`, the mark clears as the person types, and
  the notice's `scroll-margin-top` gives way to the page-wide `scroll-padding-top`.
- A download is opened from a page `from=` does not name, or a route needs a page that depends on more than its own
  path parameters.
- A browser changes the destination it sends for a link download or "Save link as", or Next changes how a route
  handler's `Location` is sent.
