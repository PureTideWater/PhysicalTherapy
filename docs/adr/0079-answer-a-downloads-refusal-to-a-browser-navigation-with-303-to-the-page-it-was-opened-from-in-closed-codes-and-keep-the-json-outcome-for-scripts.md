# 0079. Answer a download's refusal to a browser navigation with 303 to the page it was opened from, in closed codes, and keep the JSON outcome for scripts

- **Status:** accepted (`co-001/ux-download-refusals`, the UX baseline review's fifth pull request; UX-010, C-004).
  Adds to [0017](0017-one-route-wrapper-a-route-registry-and-the-persona-matrix-as-data.md) (one route wrapper and a
  route registry: a download route now names its page) and to
  [0053](0053-onboard-customers-through-recorded-agreements-gate-every-request-on-csrf-rate-limits-terms-and-maintenance-and-keep-soc2-evidence-as-a-checked-map.md)
  (the gates whose refusals a download now says in words); reverses none of their rulings
- **Date:** 2026-10-27
- **Deciders:** the founder, under the standing rule of 2026-10-18; the co-founder, under the founder's delegation of
  2026-10-25, whose rulings have the build take each recommended option and wording without asking; the build
  (Lane B), for the design review's eighteen findings (R01 to R18, all taken) and for the pull request's two reviews:
  the security review's three (SEC-01 to SEC-03, that review's numbers, not the test matrix's) and the UX review's
  fifteen (UX-DLR-01 to UX-DLR-15), each taken as its verifier corrected it, two of them (UX-DLR-12, UX-DLR-13) no
  defect, and its re-check's three (UX-DLR-16 to UX-DLR-18), the last left for after #42 (Revisit when). Each
  reversible by the founder
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
   | `practice.uploads.report` | the file's receipt, also from a zip's list of its files (the receipt links back to the zip); with `from=uploads`, the Uploads screen | none |
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
   `Location`; `downloadRefusal()` reads it back, both in `lib/http/download-refusal.ts`, on the closed codes of
   `lib/http/download-refusal-words.ts`, so the writer and the reader never differ. That module imports nothing, so a
   client component takes the same codes and words (4 below): `refusedDownloadOf()` reads a route's outcome, or the
   JSON body a script's request gets, into the status, the refused fields that are names and the wait, and
   `refusalLocation()` writes the query from it.
   - **The status.** `refused=` takes one of `invalid`, `not_found`, `forbidden`, `rate_limited`, `suspended`,
     `duplicate`, `csrf_refused` (`DOWNLOAD_REFUSALS`). The signed-out statuses (`unauthenticated`, `mfa_required`,
     `hardware_key_required`, `terms_required`, `maintenance`) go where a page's refusal goes: `signInFor`, moved from
     `lib/http/next.ts` to `lib/http/sign-in-for.ts` unchanged, so a page, a server action and a download never differ.
   - **The fields.** For `invalid` only, `fields=` lists the issues' field names that match `^[a-z][A-Za-z0-9_]{0,39}$`
     (a parameter or input name; a dotted path is dropped), each once, at most 8. Never a message.
   - **The wait.** For `rate_limited` only, `retry=` is the whole minutes to wait (`waitMinutes`, which a test holds to
     what `retryMinutes` in `lib/http/rate-limit.ts`, a #42 file read only, gives a refused form), from 1 to 1440.
   - **The kept values.** Each is validated with the schema of the page it returns to before it enters the `Location`
     (`keptId`: `opaqueId`; `keptMonth`: `^\d{4}-(0[1-9]|1[0-2])$`; `keptCodes`: the trimmed value matches
     `^[A-Za-z0-9\s,;]{1,400}$` with every token at most 10 characters, and the PHI guard, `textPhiFindings` in
     `@tp/observability`, finds no identifier's shape in it), and a value that fails is dropped, never sent, so the
     monthly page never 404s on a kept month. `refusalLocation()` then drops any kept value whose name is not a
     lowercase code, that takes a refusal key, or that the PHI guard finds an identifier's shape in. The codes are
     already in the URL the browser sent (a GET form puts them there); the redirect copies them only within that
     alphabet, and Coverage reads them back through the same `keptCodes`, so a link that skips the redirect fills the
     field with no more than the redirect would carry (SEC-01). `keptCodes` reads the value as typed, separators and
     all: reading them as `-` would take good lists for dates (`L1832, 0101T`), and the field's pattern sends only
     five-character codes, no list of which has one of the guard's shapes.
   - **The path.** `safeReturnPath()` admits only one `/` and then route words and opaque IDs
     (`(/[A-Za-z0-9._~-]+)+`), unchanged when resolved against `services.origin` and on that origin: no `\`, `//`,
     `%`, `:`, control character, query or fragment. A path that fails, a null page, a missing `returnTo` or one that
     throws sends the navigation to `/` (the home picks the practice). No input can make it an open redirect.
   - **The response.** `new Response(null, { status: 303, headers })` (undici's `Response.redirect` needs an absolute
     URL), with a relative `Location` (RFC 9110), `cache-control: private, no-store` and the cookies the request wrote.
     The query is encoded with `URLSearchParams`, in the order refused, fields, retry, then the kept values. **No
     fragment** (R02): the refused field or the notice takes the focus instead (5 below).
4. **Link downloads lose the `download` attribute (R13), and where a reload would lose work a plain click downloads
   in place (UX-DLR-02).** `<a download>` sends Dest empty, so under 1 its refusal would be JSON saved as the file.
   Every success already carries `Content-Disposition: attachment`, so the browser saves it and stays on the page
   without the attribute. The links in `components/uploads/receipts.tsx`, `uploads/[documentId]/page.tsx`,
   `packet/[versionId]/review/page.tsx` and `console/compliance/page.tsx` drop it; the other links had none. A link that
   keeps it by mistake gets JSON, never the app's HTML under the file's name.
   Without the attribute, a refused link loads its page again, which would cut off an Uploads batch still being sent,
   untick the export review's and the audit report's reviewer checklists, and lose words typed and not yet sent on the
   packet page or in the console's evidence forms. On those pages a link is a `DownloadLink`
   (`components/download-link.tsx`), inside a `DownloadLinks` that says its fetches and its refusals. A plain primary
   click (no modifier key) fetches the file as a script does (`Accept: application/json`, Fetch Metadata's `cors` mode
   and an empty destination, so `isNavigation` is false and a refusal is the JSON outcome, never the 303). The browser
   shows a fetched file only once the whole of it has arrived, where the navigation it replaces showed its own loading
   indicator from the click, so while it runs the link is `aria-busy` (with the progress cursor,
   `aria-busy:cursor-progress`) and tells its `DownloadLinks` through the context it says refusals through (one inside
   another defers to the outer, as for refusals): that place keeps a `role="status"` line
   (`text-sm text-muted-foreground`), mounted from the first render, empty and out of the layout's flow while no fetch
   runs (`empty:sr-only`, so a page's gaps stay as they were), which reads "Downloading the file…", in the product's
   busy words ("Working…", "Sending…"), while any link inside is fetching (UX-DLR-16). A fetch begun takes the place
   from the notice before it, so the newest attempt is the one on screen, and its outcome clears the status: an
   attachment is saved under its `Content-Disposition` name from an object URL, and nothing is said; a refusal is read
   by `refusedDownloadOf()` and said above the links (below them where they sit in the page's header: `below`) in the
   words and look of a page's notice (`RefusalAlert`, 5 below), in place of the notice the page arrived with, and
   focused as it mounts (React's `autoFocus` focuses only a form control) when the focus is still where the download
   left it, on a download link, on an element that holds one or on the page itself (`focusIsFree`; Safari focuses a
   clicked link's nearest focusable ancestor, not the link, and for the receipts' Report and the packet's version files
   that is the table's scroller while it overflows, as on a phone: docs/adr/0078): a person who moved on while the file
   was fetched, into the packet page's narrative say, keeps their place, and the alert is still said; the next download
   begun takes it away; anything the notice cannot settle (a signed-out session, maintenance, a body that is not an outcome, a request that
   failed) goes to the link as a navigation, whose 303 takes sign-in's steps. The `href` stays the link's own, `?from=`
   and `?version=` with it, so a new tab, a modifier click, "Save link as" or a page without script still downloads, and
   is still refused back to its page (1 to 3). It serves the receipts' Report link (on Uploads, and in a zip's list of
   its files); the export review's PDF and CSV, which read the page again once a file is saved (`router.refresh()`), so
   the checklist opens as the second file is downloaded; the reviewer checklist's PDF and line CSV, in its header; each
   exported version's PDF and CSV in the packet page's export history; and the console's evidence export, in the
   console's words (`surface="console"`). Every other download link stays plain: its page holds nothing a reload would
   lose (Alternatives considered). Once Report never navigates on a plain click, `Uploader` asks before the page unloads
   (`beforeunload`, the browser's own question) while any file of the batch is still being asked for, sent or reported
   complete (`stillSending`); a move inside the app does not unload the page and does not ask.
5. **How a page says it.** Each page parses `props.searchParams` with `downloadRefusal()`, whose zod fragment
   (`downloadRefusalParams`) takes each key `.optional().catch(undefined)`, so an unknown code, a repeated key, a field
   that is not a name or a wait out of range is ignored, never a refusal of the page (R14). It is parsed in the page,
   not its route, because it is display only: no read and no audit event.
   - **The notice.** `components/download-refusal.tsx` renders it (`RefusalAlert`, `components/refusal-notice.tsx`:
     `Alert`, destructive, `role="alert"`) beside the link or form the person used, in the product's own words keyed
     by status (`lib/http/download-refusal-words.ts`), never text from the URL, so a crafted link cannot put words in
     the product's frame. Every notice is titled "Not downloaded", as every refusal in the product is titled by its
     outcome ("Not done", "Not sent"), and its body gives the cause and the next step (R09, retitled by UX-DLR-08):
     `forbidden` "Your role cannot download this file. Ask your organization’s administrator, who manages users and
     roles.", and on the console "Only a platform administrator can download the evidence export."; `not_found` "This
     file is not available here now. This page lists the files that are." The notice takes `tabIndex={-1}` and
     `autoFocus`, and is kept clear of the sticky header by ADR 0077 D4's page-wide `scroll-padding-top` (the header's
     56 px and 16 px), with no margin of its own, which would add to it (UX-DLR-11, done once #74 merged first).
   - **Out of the address bar.** Once shown, the notice takes its keys (`refused`, `fields`, `retry`) out of the
     address bar with `history.replaceState` (`ForgetRefusal`, `components/forget-refusal.tsx`), and with them the
     page's own keys that only a refusal gives meaning to (`DownloadRefusal`'s `forget`: the letter's `payer`,
     `contract` and `codes` beside its notice, the Reports screen's `list`; SEC-02, UX-DLR-14), so a reload, a bookmark
     or a copied link shows the page as it is now. It replaces on a timer, once Next's router has patched `history`, and
     with a `null` state, so Next copies its own entry and moves its canonical URL too, with no request: a router
     refresh (a live export's poll, a settled upload batch, a server action) then asks for the page without the
     refusal and never writes it back, as a replace that passed the router's own state let it do (UX-DLR-01). The
     notice outlasts that refresh, still focused, while the person stays on the page (`RefusalNotice` holds the notice
     it arrived with while the page's path and query, without those keys, stay the same); another page, or other
     parameters of this one, lets it go, and a reload starts without it.
   - **A page the person cannot open.** A person whose file was refused may not be able to open its return page either,
     which then shows its permission state (`Forbidden`). On every return page the refusal leaves the address bar there
     too (a `ForgetRefusal` beside `Forbidden`, with the page's own keys its notice would take: Reports' `list`, the
     letter's entries on Coverage; `components/shell.tsx`, a #42 file, is not changed), so a reload or a copied link
     shows the permission state alone; and where the state's own words would be about something else, it says the file's
     (UX-DLR-05). The packet page, which every role refused the packet's line-level PHI but an analyst cannot open, says
     "The packet’s PDF and CSV hold line-level PHI, which your role cannot download: a billing manager or a firm
     principal downloads them. Open the case to see its state."; the reviewer checklist, whose PDF every role that reads
     reports downloads, adds "The report’s own page lists its files for the roles that download them."; the export
     review, whose files take its own permission, keeps its words.
   - **Coverage's letter** marks the refused control instead of a notice, as ADR 0077 D3 marks every field (UX-DLR-11,
     moved once #74 merged first): `aria-invalid` (the 2 px danger border), and under the control `form-issues`'
     `FieldError`, an icon and an `aria-hidden` "Error:" beside the message, which `letter-<control>-error` holds alone
     ("Choose one of the payers listed.", "Choose one of this payer’s contracts, or None named.", "Each code must be
     five letters or digits.": what is wrong, while the label names the field and the hint gives the format;
     UX-DLR-10), named first in the control's `aria-describedby` by `form-issues`' `describedBy`, then its hint, and
     `autoFocus` on the first marked control. The payer and contract selects are the shared `SelectField`, given the
     message as `error` and `showChosen` (ADR 0077 D6), so they look and read as every select does. The codes input is
     written beside `FieldError` rather than as a `Field`, because a `Field`'s hint is a string and this one sets each
     example code in mono (UX-DLR-09), and because ux-forms' static check of pattern fields (FRM-04) reads only a
     `hint` or an `aria-describedby` on the element: it writes `aria-describedby` as an attribute of its own, never
     through a spread (UX-DLR-03), naming its hint, written at the shared `Hint`'s 14 px under the message (ADR 0077
     D9). `SelectField` writes no attribute on an option, so `LetterContractCheck` is given each listed contract's
     payer by ID. It keeps the validated entries as the form's defaults (a payer or
     contract only when it is one of the form's own options); a marked payer that is none of them starts unanswered,
     on a first option "Choose a payer" that the select's `required` holds, never as another payer shown under the
     mark (UX-DLR-06). A mark clears as the person edits its control, the contract's also once a change of the payer
     makes the pair hold (its entry in `LetterMarks` names the payer as `also`, and the payer's change is read on the
     form, where it bubbles after `LetterContractCheck`'s listener on the payer has set the contract's validity, so its
     `validity.valid` is the new pair's, read as a value where `checkValidity()` would fire `invalid`; UX-DLR-17), and a
     letter sent (the browser fires `submit` only once its own checks pass) clears them all and takes the refusal and
     the entries out of the address bar as `ForgetRefusal` does, so a downloaded letter leaves a clean form and a reload
     shows the plain one; until then the marks and entries survive a reload (`LetterMarks`, UX-DLR-04). Before the
     server, the codes input takes the route's rule as its `pattern` (`LETTER_CODES_PATTERN`), with `letterCodes`
     tightened to test `/^[0-9A-Za-z]{5}$/` before upper-casing so the two accept exactly the same codes (R06), and its
     hint gives the format and the example (each code in mono, with no placeholder; UX-DLR-07, UX-DLR-09); and a
     contract of another payer holds the contract select invalid (`setCustomValidity`) in the words its refusal would be
     marked with, so the browser stops that letter and says why there (`LetterContractCheck`, UX-DLR-15). The route's
     checks stay the rule: without script, its refusal comes back marked.

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
  succeed without client code on every link; done where a link downloads in place (4) and where the letter is sent
  (`LetterMarks`), accepted elsewhere (Consequences).
- **Downloading every link by fetch.** A fetched file is held whole in the page's memory before it is saved, where a
  navigation streams it to disk, and a page that holds nothing a reload would lose gets the same answer from the 303;
  only the pages that hold work fetch (4).
- **Replacing the URL at once with the router's own history state** (the first build). Next's patched `replaceState`
  passes its own state through without moving its canonical URL, and on the first render it is not patched yet, so
  the next router refresh wrote `?refused=` back and a reload replayed the notice (UX-DLR-01).
- **Reading the codes' separators as `-` before the PHI guard** (SEC-01's first fix). It takes good code lists for
  dates (`L1832, 0101T`) and guards no value the field's pattern sends.
- **Reading the letter's entries on a visit without a refusal** (UX-DLR-14's first fix, so a reload after a notice
  keeps them). Any link could then fill the form with no refusal beside it; the entries leave the address bar with the
  notice instead (SEC-02).
- **Disabling another payer's contracts as the payer changes, and resetting the one chosen** (UX-DLR-15's other
  option). It drops a choice without saying why; holding the select invalid keeps the choice and says why when the
  letter is sent.
- **A disabled "Choose a payer"** (UX-DLR-06's first fix). It holds the letter the same way, but a disabled selected
  option can be announced as unavailable, and the product's other first choices ("Choose the system") are plain.
- **Naming the notice by its title and body** (`aria-labelledby` and `aria-describedby`, UX-DLR-12). GOV.UK Frontend
  4.4.0 removed that markup from its error summary because JAWS then read only the title, and here it would put the
  next step in a description some verbosity settings skip; the notice keeps ActionForm's summary's markup.
- **Bringing a zip's file's refused report back to the zip** (UX-DLR-13). It needs a `list=files` keep that places the
  notice above the zip's list and the file's ID to name its row; the 303 comes back to the file's receipt, which links
  back to the zip, and a plain click in that list downloads in place (4).

## Consequences

- A person who opens a refused download stays in the app, on the page they used, with the refusal said beside the
  link or form and the focus on it; a script's request, every route test and every end-to-end request assertion are
  unchanged (DLR-01, DLR-02, DLR-04).
- Every new download route declares `returnTo` through `returnPage`, or the registry test in
  `download-refusal.test.ts` fails; a route that names no page still sends a navigation to `/`, never to JSON (DLR-03).
- **A later success leaves a plain link's notice on screen (R16).** A download does not navigate, so after a good file
  the notice stays beside a link that is now fine, until the person moves on; a link that downloads in place (4) takes
  it away as its next download begins. The notice's keys, and the page's own that it names, have already left the
  address bar (`ForgetRefusal`), so a reload shows the page as it is now, and no notice tells the person to reload: each
  says what to do on the page itself. The letter clears its own marks, a control's as the person edits it (the
  contract's also as a change of the payer makes the pair hold) and all of them, with the refusal and the entries in the
  address bar, once the letter is sent (`LetterMarks`, which hides `FieldError`'s whole line): ADR 0077's shared fields
  do not clear a mark as the person types (#74).
- **A refused plain link loads its page again**, on a page that holds nothing a reload would lose. Every page that
  holds work beside a download link (Uploads, the export review, the audit report's reviewer checklist, the packet
  page and the console's evidence checklist) downloads it in place (4), so a refused file leaves the ticks, the typed
  words and a batch being sent as they were.
- **A role refused both a page and its file sees that page's permission state**, and on every return page the
  refusal leaves the address bar with it (5), so a reload, a bookmark or a copied link shows the permission state
  alone. A test in `download-refusal.test.ts` finds every page a download route comes back to, for its own IDs and
  every `?from=`, and reads that page's `Forbidden` branch for its `ForgetRefusal`, with the keys its notice forgets.
- **A crafted link can still fill the codes field.** Coverage reads `?codes=` back only beside a refusal and only
  through `keptCodes`, so a link from another site (SameSite=Lax cookies ride a top-level GET) can place letters,
  digits and separators there ("Call 555 0100", for example), shown as the field's value, marked refused, under the
  product's message; never as the product's own words, never a date, nine digits or another shape the PHI guard knows
  (SEC-01). The guard's shapes are heuristic: nine digits written with spaces (`123 45 6789`) match none of them, here
  as everywhere the guard reads, and reach the route only from a URL that already holds them, since the field's
  pattern refuses them. The security review is given this residual beside DLR-03's hostile inputs (R18).
- A signed-out download goes to sign in, the terms or maintenance, as a page does, and does not come back to its page
  afterwards: the product has no sign-in return path yet.
- The kept values travel in one more URL (the 303's), which the load balancer's access log records as it already
  records the GET form's.
- The DLR rows of the test matrix hold the behaviour: `apps/web/src/lib/http/download-refusal.test.ts` (DLR-01 to
  DLR-03, against fake routes and the registry, with every `Location` it builds checked by `urlPhiFindings`, the codes
  pattern held to `letterCodes` over 20,000 seeded strings, and every return page's `Forbidden` branch read),
  `download-refusal-words.test.ts` (the codes read from an outcome as the 303 writes them, and a module that imports
  nothing), the notice's, the in-place download's, the uploader's and the letter's unit tests, and
  `apps/web/e2e/download-refusals.spec.ts` (DLR-04, on a practice of its own with axe at 1280 and 390 px).

## Not verified here

- The fallback without Fetch Metadata: every browser the product supports sends it (Safari from 16.4), and CI runs
  Chromium; the `Accept` rule is held by unit tests only.
- Screen readers by hand: a notice present at first load with `role="alert"` and focus is announced as the focused
  element, which the tests assert as focus and attributes; the manual checks belong to the accessibility pull request
  (combined audit #103), which may move the focus to an unnamed element around the alert, as GOV.UK's error summary
  now does (UX-DLR-12).
- The in-place refusal under the real limit: the end-to-end test's refused report on Uploads is the route's own 429
  outcome stood in by `page.route`, so the `export` limit the run's downloads share stays whole; the fetch, the save
  and the words are held by unit tests against that outcome.
- The `beforeunload` question: it is the browser's own; a unit test holds when the guard is on (`stillSending`), and
  no end-to-end test answers it. CI saves a fetched file in Chromium only.
- Every in-place link and every return page in a browser: the end-to-end tests click the receipts' Report, the export
  review's files and the reviewer checklist's line CSV (its ticks kept); the packet page's export history and the
  console's evidence export are the same `DownloadLink`, held by its unit tests and the type check. The status is read
  in a browser on the receipts' Report alone, its refused fetch held open; what the place says after each thing a link
  tells it, two links fetching at once among them, is held by unit tests (`nextSaid`, `NoticePlace`), and no test
  hears a screen reader say it. No end-to-end test sends a refused file back to one of the nine return pages whose
  permission is their file's, as a role that page refuses too; the source test in `download-refusal.test.ts` reads their
  `Forbidden` branches instead. Safari's focus on the scroller of a clicked link is stood in for in Chromium (the
  receipts at 390 px: the scroller focused and the Report link clicked without moving the focus); no test runs Safari.

## Revisit when

- Sign-in gains a return path (UX-006, and UX PR 59's maintenance return path): a refused download then may come back
  to its page after sign-in, a second redirect surface that needs its own design and checks (R17).
- A shared field (ADR 0077's `SelectField` or `Field`) comes to clear its own mark as the person edits it: the letter
  then drops `LetterMarks`' per-control clearing, keeping its clearing of every mark, the refusal and the entries on a
  sent letter. (The move onto `FieldError` and `describedBy`, and the drop of `scroll-mt-18` for ADR 0077 D4's
  `scroll-padding-top`, which had added to it, 144 px where 72 px was meant, are done: UX-DLR-11, by this pull
  request, merged after #74.)
- Another page comes to hold what a reload would lose beside a download link: its links move onto `DownloadLink`.
- #42 merges: `Forbidden` (`components/shell.tsx`, a #42 file this pull request leaves untouched) takes an optional
  link, which `PermissionState` renders under its next step, so the packet page's permission state links the case
  ("Open the case", in place of "Open the case to see its state.") and the reviewer checklist's links the audit report
  ("Open the audit report"), which its next step now names without a way to open it (UX-DLR-18).
- A download is opened from a page `from=` does not name (a zip's file's report coming back to the zip, UX-DLR-13), or
  a route needs a page that depends on more than its own path parameters.
- A browser changes the destination it sends for a link download or "Save link as", or Next changes how a route
  handler's `Location` is sent.
