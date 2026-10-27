# DLR core API (UX PR 5, co-001/ux-download-refusals): what the page builders code against

Worktree /home/user/ux-download-refusals. Built by the core builder; nothing committed.

## 1. Route shape (apps/web/src/lib/http/route.ts)

```ts
export interface ReturnPage { readonly path: string; readonly keep?: Readonly<Record<string, string>> }   // no anchor (R02)
export type ReturnTo = (params: Readonly<Record<string, string | undefined>>) => ReturnPage | null;
// CommonSpec<P, I>:  readonly returnTo?: ReturnTo;        (optional; downloadHandler never throws without it: R01)
// Route<R>:          readonly returnTo: ReturnTo | null;  (invoke.ts common() copies it, null when absent)
```

`params` is the request's RAW path + query parameters (strings only; a repeated query key is absent; path params win
over query params). It is NOT the parsed schema output: validate everything through the helpers below.

## 2. Helpers for a returnTo (apps/web/src/lib/http/download-refusal.ts)

```ts
export type ReturnParams = Parameters<ReturnTo>[0];
export function returnPage(template: string, params: ReturnParams, keep?: Readonly<Record<string, string | undefined>>): ReturnPage | null;
export function pagePath(template: string, params: ReturnParams): string | null;
export function cameFrom<const T extends string>(params: ReturnParams, values: readonly T[]): T | undefined;
export function keptId(value: string | undefined): string | undefined;     // opaqueId from lib/routes/schemas.ts (lowercased)
export function keptMonth(value: string | undefined): string | undefined;  // trimmed, ^\d{4}-(0[1-9]|1[0-2])$
export function keptCodes(value: string | undefined): string | undefined;  // trimmed, ^[A-Za-z0-9\s,;]{1,400}$, every token <= 10 chars (R08)
```

- `template` is written like a route path: '/p/[practiceId]/coverage'. Each `[name]` is replaced by `params[name]` when it
  passes `opaqueId`; any that fails gives `null` (the navigation then goes to '/'). Literal segments must be lowercase route
  words; anything else THROWS (a programming error; the handler catches it and sends '/', the registry test fails).
- `keep`: pass each value through a kept*() check; an undefined value is dropped. The handler also drops a kept value whose
  name is not a lowercase code, that takes a refusal key (refused, fields, retry), or that holds an identifier's shape
  (textPhiFindings from @tp/observability: nine digits, a date, a phone number, an email ...).
- `cameFrom(params, [...])`: the closed `?from=` value (R05), undefined for missing or unknown (take the default page).
  The linking page adds `?from=<value>` to the download link's href. The route's params schema is untouched (z.object
  strips `from`).
- Use `returnPage(...)` as the whole body of returnTo. Never build a path by hand from a param.

### Example returnTo (paste into the route spec, beside `rateLimit`/`params`)

```ts
import { cameFrom, keptCodes, keptId, keptMonth, returnPage } from '../http/download-refusal';

// Coverage's letter (keeps what the GET form sent, each validated with Coverage's own schema):
returnTo: (params) => returnPage('/p/[practiceId]/coverage', params, { payer: keptId(params.payer), contract: keptId(params.contract), codes: keptCodes(params.codes) }),

// Report PDF, linked from the list (?from=list), the review checklist (?from=review) and its own page (default):
returnTo: (params) => {
  const from = cameFrom(params, ['list', 'review']);
  return returnPage(from === 'list' ? '/p/[practiceId]/reports' : from === 'review' ? '/p/[practiceId]/reports/[reportId]/review' : '/p/[practiceId]/reports/[reportId]', params);
},

// Monthly CSV (R07: a bad month is dropped, so the monthly page never 404s):
returnTo: (params) => returnPage('/p/[practiceId]/reports/monthly', params, { month: keptMonth(params.month) }),

// Console evidence export (no parameters):
returnTo: (params) => returnPage('/console/compliance', params),

// Packet PDF/CSV. RECOMMENDED (beyond D2's table "keeps: none"): the packet page takes ?version=<id>, so keep the version
// the person was on, or they return to the current version instead:
returnTo: (params) => returnPage('/p/[practiceId]/cases/[caseId]/packet', params, { version: keptId(params.versionId) }),
```

## 3. What the handler does (apps/web/src/lib/http/handler.ts; read only for you)

- `export function isNavigation(request: Request): boolean` (R11): `Sec-Fetch-Mode: navigate` with `Sec-Fetch-Dest: document`
  or no Dest; without Fetch Metadata, `Accept` ranking text/html (q>0) above application/json and `*/*` (equal q: listed
  first wins). No Accept = a script. So in e2e: `page.goto(url)` / clicking a link or a GET form = navigation (303);
  Playwright `request.get` (no Fetch Metadata, Accept */*) and `fetch()` = JSON exactly as before; `<a download>` and
  "Save link as" (navigate, Dest empty) = JSON (so drop the `download` attribute from links: D4).
- A navigation's refusal: 303, relative Location, `cache-control: private, no-store`, cookies the request wrote, no body.
  Signed-out statuses (unauthenticated, mfa_required, hardware_key_required, terms_required, maintenance) go to
  `signInFor(outcome)` (now `lib/http/sign-in-for.ts`). Others go to `returnTo`'s page with
  `?refused=<status>[&fields=a,b][&retry=N]&<kept values>`, or '/' when returnTo is null / returns null / throws /
  yields a path that fails `safeReturnPath` (allowlist `(/[A-Za-z0-9._~-]+)+`, unchanged when resolved on services.origin).
- Query order: refused, fields (invalid only), retry (rate_limited only), then the kept values in the order you list them.

## 4. Reading it on the page (download-refusal.ts, pure, no React)

```ts
export const DOWNLOAD_REFUSALS: readonly ['invalid', 'not_found', 'forbidden', 'rate_limited', 'suspended', 'duplicate', 'csrf_refused'];
export type DownloadRefusalStatus = (typeof DOWNLOAD_REFUSALS)[number];
export const SIGNED_OUT_REFUSALS: readonly ['unauthenticated', 'mfa_required', 'hardware_key_required', 'terms_required', 'maintenance'];
export const REFUSED_FIELD: RegExp;          // ^[a-z][A-Za-z0-9_]{0,39}$  (R04)
export const MAX_REFUSED_FIELDS = 8;
export const MAX_RETRY_MINUTES = 1440;
export interface RefusedDownload { readonly status: DownloadRefusalStatus; readonly fields: readonly string[]; readonly retryMinutes: number | null }
export const downloadRefusalParams: z.ZodObject<{ refused, fields, retry }>;   // each z....optional().catch(undefined) (R14)
export function downloadRefusal(searchParams: Readonly<Record<string, string | string[] | undefined>> | undefined): RefusedDownload | null;
export function refusalLocation(outcome, page: ReturnPage | null, origin: string): string;   // the handler's Location (tests)
export function safeReturnPath(path: string, origin: string): boolean;
export function minutesWords(minutes: number): string;   // "1 minute" / "3 minutes" (guardMessage uses it too)
```

In a page (Next 16: `searchParams` is a Promise):

```tsx
export default async function Page(props: { params: Promise<...>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const result = await loadPage(route, props);                 // unchanged
  const refusal = downloadRefusal(await props.searchParams);   // display only: no read, no audit
  ...
  <DownloadRefusal refusal={refusal} />                        // in the region of the link the person used
```

The uploads page (`uploads/[documentId]/page.tsx`) has no `searchParams` in its props today: add it (R14).
`fields` holds only names that match REFUSED_FIELD; map the ones the page knows (e.g. `refusal.fields.includes('codes')`)
to its own words and ignore the rest. Never render a field name or any URL text.

## 5. The component (apps/web/src/components/download-refusal.tsx; server component, no 'use client')

```tsx
export type DownloadSurface = 'practice' | 'console';
export interface DownloadRefusalWords { readonly title: string; readonly body: string }
export function downloadRefusalWords(refusal: RefusedDownload, surface?: DownloadSurface): DownloadRefusalWords;
export function DownloadRefusal(props: {
  readonly refusal: RefusedDownload | null;   // null renders nothing, so render it unconditionally
  readonly surface?: DownloadSurface;          // 'console' on /console/compliance: forbidden reads the console's words
  readonly invalid?: string;                   // replaces invalid's general body (the letter's own words)
  readonly autoFocus?: boolean;                // default true; pass false where a refused field takes autoFocus (the letter)
  readonly className?: string;
}): JSX.Element | null;
```

Renders `<Alert variant="destructive" role="alert" tabIndex={-1} autoFocus className="scroll-mt-18 ..."
data-download-refusal="<status>" data-retry-minutes="<n>">` (scroll-mt-18 = 72 px = the h-14 sticky header + 16 px).
Only ONE element may carry autoFocus on a page (the first in document order wins): on the letter's refusal, put
`autoFocus` on the first refused field and pass `autoFocus={false}` to the notice (or render no notice for `invalid`).
Give the refused field `scroll-mt-18` too (R02).

Words (title / body), for the PR description:
- invalid: Not downloaded / This file could not be made from what was asked. Reload the page and try again.
  (CHANGED from D5's "Check the fields marked below and try again": only link pages use the default, and they mark no
  fields; the letter passes its own words through `invalid` or marks its field.)
- not_found: Not downloaded / This file is not available here now. Reload the page to see the files that are.
- forbidden: Not available to your role / Your role cannot download this file. Users and roles are managed by your organization’s administrator.
  console: Not available to your role / Only a platform administrator can download the evidence export.
- rate_limited: Not downloaded / Too many downloads in a short time. Wait N minute(s) and try again. ("a few minutes" when the link has no retry)
- suspended: Not downloaded / Downloads are paused while the organization is suspended. The billing page says why and what lifts it. (no link)
- duplicate, csrf_refused: Not downloaded / This download could not be checked against your session. Reload the page and try again.

## 6. The letter's codes field (apps/web/src/lib/contracts/letter.ts)

```ts
export const LETTER_CODES_PATTERN = '[\\s,;]*(?:[A-Za-z0-9]{5}(?:[\\s,;]+[A-Za-z0-9]{5})*)?[\\s,;]*';  // the string value has single backslashes
```

`<Input name="codes" pattern={LETTER_CODES_PATTERN} maxLength={400} autoCapitalize="characters" spellCheck={false} ... />`.
`letterCodes` now tests `/^[0-9A-Za-z]{5}$/` on the trimmed code before upper-casing (R06); a property test proves the
pattern (anchored, v flag) + maxLength agrees with the route over 20,000 seeded strings.

## 7. Tests the builders must make pass

- `apps/web/src/lib/http/download-refusal.test.ts` > "every download route declares its page (R01 ...)": one case per
  `downloadHandler(X)` in `apps/web/src/app/**/route.ts` (15 today). It FAILS for all 15 until each route declares
  `returnTo`. For each route it also checks: X is in `ROUTES` at the route.ts's own path; `returnTo` with a synthetic
  UUID for every `[name]` of the route's path gives a non-null page whose path passes `safeReturnPath`, starts with
  `/p/<that practice>` (practice routes) or `/console/` (the console export); a navigation's forbidden refusal lands on
  `<page>?refused=forbidden...`; and every `[name]` set to '//evil.example', '/\\evil', 'javascript:alert(1)',
  '%2F%2Fevil.example' or 'SYN-1' lands on '/'. So a returnTo must depend on its route's path params through
  returnPage/pagePath (it does if you use the helpers).
- `apps/web/src/components/download-refusal.test.tsx`: the component's words and attributes.
- Synth registry entries can name both files above plus the e2e spec.
