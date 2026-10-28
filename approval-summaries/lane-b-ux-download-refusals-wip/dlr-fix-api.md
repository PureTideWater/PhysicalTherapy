# dlr-fix API (fix round of PR #78, core builder) - what the other builders build on

Worktree /home/user/ux-download-refusals (head 53c7224, uncommitted). Every current import still works.

## 1. The client-safe words module: `apps/web/src/lib/http/download-refusal-words.ts`

Imports nothing (a unit test holds that), so a `'use client'` component may import it. A client component imports the
codes and words from HERE, never from `lib/http/download-refusal.ts` (pulls @tp/observability, zod, sign-in-for) and
never from `rate-limit.ts` (a PR #42 file, server code).

Exports:
- `DOWNLOAD_REFUSALS` (the 7 statuses), `type DownloadRefusalStatus`
- `REFUSED_FIELD`, `MAX_REFUSED_FIELDS` (8), `MAX_RETRY_MINUTES` (1440), `refusedFields(names): string[]`
- `waitMinutes(retryAfterSeconds: number): number` - whole minutes rounded up, 1..1440, a day when not finite
  (a test holds it equal to rate-limit.ts's retryMinutes, capped)
- `interface RefusedDownload { status; fields: readonly string[]; retryMinutes: number | null }` (moved here)
- `refusedDownloadOf(outcome: unknown): RefusedDownload | null` - reads a route's outcome OR the JSON body a script's
  fetch() of a download gets (handler.ts outcomeResponse body = the outcome itself, e.g.
  `{ status: 'rate_limited', retryAfterSeconds: 125 }`). Null for ok, unauthenticated, mfa_required,
  hardware_key_required, terms_required, maintenance, or a body that is not an outcome. Only the closed codes come
  out: status, field names passing REFUSED_FIELD (never a message), the wait when retryAfterSeconds is a number.
  refusalLocation now writes the 303 query from this same function, so the in-place notice and the 303 never differ.
- `minutesWords(minutes): string` ("1 minute", "3 minutes"); guardMessage (next.ts) now imports it from here and still
  says `minutesWords(retryMinutes(outcome.retryAfterSeconds))` exactly as before.
- `type DownloadSurface = 'practice' | 'console'`, `interface DownloadRefusalWords { title; body }`
- `NOT_DOWNLOADED = 'Not downloaded'` (every title, UX-DLR-08)
- `downloadRefusalWords(refusal: RefusedDownload, surface = 'practice'): DownloadRefusalWords` (moved here)
- `interface ShownRefusal extends DownloadRefusalWords { status; retryMinutes }` and
  `shownRefusal(refusal: RefusedDownload, surface = 'practice'): ShownRefusal` - a notice's codes and words.

Re-exports kept for current importers:
- `lib/http/download-refusal.ts` re-exports what it exported before: DOWNLOAD_REFUSALS, DownloadRefusalStatus,
  MAX_REFUSED_FIELDS, MAX_RETRY_MINUTES, REFUSED_FIELD, RefusedDownload, minutesWords (server code may keep importing
  them from there; new names such as refusedDownloadOf and shownRefusal come from the words module).
- `components/download-refusal.tsx` re-exports DownloadRefusalWords, DownloadSurface, NOT_DOWNLOADED, ShownRefusal,
  downloadRefusalWords, shownRefusal.

The words now (UX-DLR-08): every title "Not downloaded"; forbidden (practice) body "Your role cannot download this file.
Ask your organization’s administrator, who manages users and roles."; console body unchanged ("Only a platform
administrator can download the evidence export."); the other bodies unchanged.

## 2. For the DownloadLink builder (UX-DLR-02)

```ts
import { refusedDownloadOf, shownRefusal } from '../lib/http/download-refusal-words';
import { RefusalAlert } from './refusal-notice';
// on !response.ok:
const body: unknown = await response.json().catch(() => null);
const refusal = refusedDownloadOf(body);
if (refusal === null) { window.location.assign(href); return; } // signed out, maintenance, anything else
setShown(shownRefusal(refusal));               // surface 'console' for the evidence export
// render: {shown === null ? null : <RefusalAlert notice={shown} />}
```
`RefusalAlert` (components/refusal-notice.tsx, 'use client') is the notice's one look: destructive Alert, role="alert",
tabIndex -1, autoFocus (React focuses it when it mounts on the client), scroll-mt-18, data-download-refusal and
data-retry-minutes. It has NO ForgetRefusal and NO latch, so it is right for an in-place notice. Do not use
RefusalNotice/DownloadRefusal in place: their latch holds a notice while the page stays the same. To re-focus a second
refusal with the same words, remount it (a key that changes per attempt).

## 3. The refusal's address bar and the held notice

`components/forget-refusal.tsx` ('use client'):
- `REFUSAL_QUERY_KEYS` (unchanged)
- `forgetRefusalUrl(href: string, also: readonly string[] = []): string | null` - pure; the path+query+hash without the
  refusal's keys and `also`; null when the URL holds none of them.
- `pageOfRefusal(pathname: string, search: string, also = []): string` - pure; the page key the latch compares.
- `ForgetRefusal({ also?: readonly string[] })` - now replaces on a setTimeout and with `replaceState(null, '', path)`
  (UX-DLR-01 part 1), deleting the refusal's keys plus `also`.

`components/refusal-notice.tsx` ('use client', NEW):
- `RefusalAlert({ notice: ShownRefusal, className? })` - the look (see 2).
- `interface HeldRefusal { notice; page }`, `heldRefusal(held, notice, page)` - pure latch step.
- `RefusalNotice({ notice: ShownRefusal | null, forget?: readonly string[], className? })` - holds the arrival notice
  through a router refresh while pageOfRefusal(pathname, search, forget) stays the same (UX-DLR-01 part 2), renders
  RefusalAlert + `<ForgetRefusal also={forget} />`. Uses usePathname/useSearchParams (null-guarded for static renders).

`components/download-refusal.tsx` (server-compatible, no 'use client'):
- `DownloadRefusal({ refusal, surface?, forget?: readonly string[], className? })` - NEW `forget` prop, passed to
  RefusalNotice/ForgetRefusal as `also`. It now always renders RefusalNotice (null markup when nothing is held), so a
  held notice survives a refresh that no longer carries the refusal.

Who passes forget:
- Reports (done here): `reports/page.tsx` passes `forget={RETURN_ONLY}` (`['list']`) to both notices.
- The letter (letter builder, SEC-02/UX-DLR-14): `letter.tsx` passes `forget={...}` with payer, contract and codes
  (the verdict: one constant LETTER_KEPT_KEYS beside keptId/keptCodes, used by coverage.ts:205's keep too, plus a drift
  test that the keys payerLetter.returnTo keeps equal it). Only the DownloadRefusal branch (marked.size === 0) passes it;
  a marked letter renders no notice and keeps its marks and entries in the URL.
- LetterMarks (UX-DLR-04) taking refused/fields/kept entries out of the URL on a valid submit may reuse
  forgetRefusalUrl(window.location.href, [...]) and should call replaceState(null, '', path) the same way (after
  hydration; a null state so Next moves its canonical URL).
- The packet page (UX-DLR-05): a ForgetRefusal sibling of Forbidden takes `also` if the page keeps any return-only key
  (its `version` is the page's own parameter: do not forget it).

## 4. SEC-01 / SEC-03
- `keptCodes` (lib/http/download-refusal.ts) also returns undefined when textPhiFindings(codes) finds anything; no
  separator normalisation. Kept: 'ABC', '97110, 97530', 'g0283;97110', 'L1832, 0101T', 'G2061, 0106T', 'L2000; 0512T'.
  Dropped: '123456789', '19500115', '919 555 0100'. The letter reads codes through keptCodes, so letter.test.tsx now
  has the case (a crafted codes=123456789 leaves the field with no value, still aria-invalid). ADR 0079:171 ("never a
  date, nine digits or another shape the PHI guard knows") is now true as written; the ADR builder may reword :93-99
  to say the drop sits inside keptCodes, which the page and refusalLocation both use.
- handler.ts returnParams: comment only (the verdict's wording).

## 5. Tests and e2e touched here (others: do not undo)
- lib/http/download-refusal.test.ts (keptCodes cases), NEW lib/http/download-refusal-words.test.ts,
  components/download-refusal.test.tsx (titles, forbidden words, forgetRefusalUrl, pageOfRefusal, heldRefusal, forget
  prop), components/coverage/letter.test.tsx (the forbidden body at :141; the SEC-01 case after "not.toContain('555')").
- e2e/download-refusals.spec.ts: NO_DOCUMENT constant; a new step before the viewer's ("a refused file of the Reports
  list comes back beside that list ..."); the viewer step expects "Not downloaded" and the new forbidden body and does
  a router.refresh() (asserts the RSC refresh request has no ?refused, URL clean, notice visible and focused) before
  the reload. The letter steps (lines ~85-145) are untouched: UX-DLR-06/10 builders own them.
- tools/screening-capacity/watched-paths.txt: one generated row added (download-refusal-words.ts), by watched.ts --write.

## 6. For the ADR builder (ADR 0079 lines that now say the old thing)
- :118-121 (R09 words): title is now "Not downloaded" for every status; forbidden body "Your role cannot download this
  file. Ask your organization’s administrator, who manages users and roles."; the console's sentence kept; the words
  live in lib/http/download-refusal-words.ts (client-safe; the in-place DownloadLink says them too).
- :122-125: ForgetRefusal takes the refusal's keys and the page's own return-only keys (DownloadRefusal's `forget`:
  the letter's payer/contract/codes, Reports' list) out of the URL, on a timer after the router has patched history and
  with a null state, so Next's canonical URL moves too and a router refresh never writes ?refused= back; the notice
  outlasts a router refresh while the person stays on the same page (RefusalNotice, keyed on the path and query without
  those keys) and goes on another page or other parameters of the page; a reload shows none.
- :164 (R16): unchanged in substance; "The notice's keys have already left the address bar" now includes the page's
  forget keys.
- :93-99 / :171 (SEC-01): keptCodes holds the PHI-shape drop itself; :171 is now true for the page as well as the 303.
