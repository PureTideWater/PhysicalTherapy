# Lane B, queue item 9 (combined audit #48): a narrative survives sign-out, the design contract

Base: `claude/build-platform` at 6ddd587 (main checkout, read only). Design step only: nothing was built, committed,
pushed or posted. Date 2026-10-26. Lane B's claim: `LANES.md:172` (`co-001/narrative-draft`, after
`co-001/figures-in-words`; ADR 0072 if needed, which #38 takes; test-matrix and synth CAS-30 to CAS-37 shared with #38).
Branch, once the build may start: `co-001/narrative-draft`, cut from the latest `claude/build-platform` after PR #38
(figures in words) merges, worked in `/home/user/narrative-draft` (LANES rule 5).

**Status: ready to build after one adversarial review (section 17), every finding applied or answered.** No migration. No PR #42 file is touched, except rows added to
`docs/product/test-matrix.md`, `docs/product/reconciliation-001.md` and `packages/synth/src/cases/{matrix,registry}.ts`.
Two small parts wait for #42 (section 13). Every choice took the recommended option under the co-founder's ruling of
2026-10-26 ~00:20 UTC ("Don't ask for approvals anymore just build and optimize"; for security, the safer one;
`lanes/lane-b.md:206`). They are listed in section 14.

Sources:
- the audit entry: `/home/user/ops/audits/combined/combined-report.md:625-632` (#48);
- the orchestrator's scope for this item (client-side draft, restored; database no; record why);
- the scouts' maps, re-checked against the code at 6ddd587 and cited `file:line` below;
- `docs/product/sessions.md`, `docs/product/PRD.md:256`, `docs/policies/{access-control,workforce-and-device,vendor-management,data-retention}.md`;
- ADR 0016 (sessions in the database), 0047 (narrative identifiers), 0053 and 0055 (headers, cookies);
- `/home/user/ops/designs/lane-b-ux-review-brief.md` (the UX and brand review);
- reconciliation-001's checks (`docs/product/reconciliation-001.md:440-486`).
- The designer's notes: `/tmp/claude-0/-home-user-PhysicalTherapy/cd4c3776-ffb4-50ed-99cf-e6bf837d5699/scratchpad/nd-design/progress/designer.md`.
  That path does not survive the session; this file carries everything.

---

## 0. In one screen

- **The problem (audit #48).** A PHI screen signs out after 30 minutes without a request. Typing sends none. On save
  the person lands on sign-in, the text is gone, and sign-in goes to the home page. There is no warning, and the
  screen stays readable until the next click.
- **The two instructions agree.** "The draft is kept client-side and restored" and the audit's "Nothing is saved in
  the browser" both hold when the draft stays in the live page and is never written anywhere. The page does not
  navigate away when the session ends. It locks in place, the person signs in again in a dialog over it, and the page
  comes back with its text.
- **Storage: nothing persisted by the product (option a).** No localStorage, sessionStorage, IndexedDB, Cache API,
  cookie or URL ever holds typed text, and no form sends typed text by GET. The draft lives in the open tab's memory only.
  It is cleared on save, on sign-out, the moment another user's sign-in is heard, on tab close, and 12 hours after the
  lock at the latest. At the lock the text controls are blanked and their values held in memory, so the browser's own
  session-restore data does not keep them overnight. The browser may still write form state for session restore while
  someone types; that is outside the product's control, and ADR 0076 says so. Section 3 compares the other options.
- **The behaviour, as the audit's best option says.**
  - Typing, clicking and scrolling are activity. A quiet touch renews the session at most every 5 minutes while the
    person works, shared across tabs.
  - At 25 minutes without a touch, a warning with "Stay signed in".
  - At 30 minutes after the last input (never later than the server's end) the screen locks in place: the page is
    hidden and inert, the text is kept in memory.
  - The person signs in again in place, in a dialog over the lock (password, authenticator code, hardware key), and
    is back where they were, with the text. A step that needs a full page (a new password, enrolment) opens in a new
    tab as the fallback.
  - 10 minutes before the 12-hour limit, a notice. The limit is never extended.
  - No status check exists. The clock runs in the browser. Only real input or the "Stay signed in" click reaches the
    server, so SEC-15 holds exactly as today.
  - The limits do not change (`SESSION_LIMITS`, `lib/auth/sessions.ts:15`; `resolve_session()` in migration
    `20261015170000:368-369`).
- **The save never navigates away from typed text.** A practice action that finds no session, a changed session, an
  MFA step, new terms or maintenance returns a state that locks or notices in place. A network failure or a server
  error returns "not sent". The text stays. Today these redirect (`lib/http/next.ts:148-153`) or reach the root error
  page, and the text is lost.
- **Another user, sign-out, history.** Every page tells the other tabs which session and which user it was rendered
  for, by two opaque markers. A different user marker drops the draft and reloads the tab at once, with no request and
  no click. The same user under a new session locks with Continue. Every sign-in ends in a full document load, so a
  tab where B signs in keeps nothing of A's in memory or in the router cache. An explicit sign-out discards every
  tab's drafts and reloads them. A page restored from the back/forward cache is never shown readable.
- **Also fixed here.** The background polls that renew an unattended session today (`export-status.tsx:21-32`,
  `receipts.tsx:106-115`, `uploader.tsx:256-263`) pause after 5 minutes without input. Sign-in returns to the page it
  interrupted. A new sign-in on the same browser ends the earlier session on the server. "Write the code-built draft"
  and "Draft with the model" ask before they discard unsaved text.
- **No header change.** `Clear-Site-Data` was dropped in review: under option (a) it buys almost nothing, and a header
  change needs the owner's consent (reconciliation-001:300).
- **Files.** About 35 files, three builders (section 10). No new npm package (`pnpm-lock.yaml` is a #42 file).
- **ADR 0076**, "Keep unsaved work in the open page only, lock it in place at the idle limit, and sign in again without
  leaving it". #38 takes 0072; 0073 to 0075 are claimed in `LANES.md:173-175`. Rows CAS-35 to CAS-37 (#38 takes CAS-30
  to CAS-34, `lane-b-figures-in-words.md:7-10`).

---

## 1. What the code does today (verified at 6ddd587)

**Sessions live in Postgres.** There is no middleware auth (`proxy.ts:23-58` sets the CSP nonce, the attribution
cookie and `x-tp-received-at` only; `next.ts:16`).
- `resolve_session()` (migration `20261015170000_identity_and_permissions.sql:336-385`) ends a session at 12 hours
  (`:368`) or 30 minutes idle (`:369`). Otherwise it touches `last_seen_at` on every call (`:380`).
- Every page load, server action and route handler calls it through `signedIn()` (`lib/http/invoke.ts:198-214`).
- So every request renews the idle clock. A server-side status read that does not renew needs a new SECURITY DEFINER
  function, which is a migration. This design needs none: it has no status read.
- `tp_app` may SELECT only its own `user_session` rows (`:469-485`), so a route can read its own session's
  `expires_at` once the actor is set.

**An expired session on a save.**
- `runAction` (`lib/http/next.ts:148-153`) calls `redirect('/sign-in?reason=idle')`.
- The client navigates away. The narrative held in `useState` (`components/packets/narrative-editor.tsx:19`) is lost.
- Sign-in then returns `{ redirect: '/' }` (`lib/routes/sign-in.ts:82-83`). There is no return path.
- A form submitted after another tab signed in again is refused as `csrf_refused` (the CSRF token is an HMAC of the
  session token, `lib/http/csrf.ts:26-29`). Its message says "Reload the page and try again" (`next.ts:77`), and
  reloading loses the text.

**Other typed work on PHI screens.** Every other free-text field on a `/p` page is uncontrolled inside `ActionForm`
(`components/action-form.tsx`): the case note, line note, payer response notes, approval request message, reversal
and adjustment reasons, contract quotes and answers. They are lost the same way. React 19 also resets uncontrolled
fields after a form action completes, so a refusal clears them too (to be proved by the e2e test in section 7).

**Typed work lost on purpose, without a question.** "Write a new version from the code-built draft" and "Draft the
narrative with the model" delete the typed narrative from the form (`packet/actions.ts:27-29`, `:39-41`) and write a
new version.

**Background polls renew an unattended session.**
- `components/packets/export-status.tsx:21-32` calls `router.refresh()` every 5 seconds while an export is live.
- `components/uploads/receipts.tsx:106-115` polls every 3 seconds for up to 10 minutes.
- `components/uploads/uploader.tsx:256-263` polls the receipts route while a batch is pending.
- Each request touches the session. An unattended packet page with a live export is never signed out. That weakens
  SEC-15 today.

**Sign-in, and errors on save.**
- Every sign-in step completes by a server-action `redirect` (`runSignInStep`, `lib/http/next.ts:189-191`), a soft
  navigation. Only the hardware-key path ends in a full load (`components/hardware-key.tsx:57`, `:111`). So when B
  signs in in the tab A left, A's JavaScript heap and Next's router cache (A's `/p` payloads) survive into B's session.
- A server action that rejects (offline, a 502 from the load balancer, a 500) throws into the transition. The only
  error boundary is `app/error.tsx`, at the root, so the whole tree unmounts and every typed word goes with it.
- `mfa_required` and `hardware_key_required` come back as HTTP 401, `terms_required` as 403 and `maintenance` as 503
  (`lib/http/handler.ts:17-31`). The status is in the JSON body.

**Sign-out.**
- `signOutAction` (`lib/routes/account.ts:46-62`) ends the session, deletes `tp_session` and redirects to
  `/sign-in?reason=signed_out`. That redirect is a soft navigation, so the JavaScript heap and Next's router cache
  (which hold the PHI pages' payloads) stay in memory.
- No `Clear-Site-Data` header exists anywhere.
- The Sign out button is in `components/shell.tsx:97-102`, a #42 file.

**Another user on the same browser.** Nothing handles it. `writeSession` overwrites `tp_session`
(`lib/auth/pending.ts:33-37`). The earlier session stays open on the server until its own limits.

**Every PHI screen is under `/p/[practiceId]`.** The PHI routes (`phi: true`) all have paths under `/p/`. The only
other authenticated pages (`/console`, `/settings/...`, `/account`) carry no PHI. There is no
`app/p/[practiceId]/layout.tsx` yet.

---

## 2. Reconciling "kept client-side" with "Nothing is saved in the browser"

The orchestrator's scope says the draft is kept client-side and restored. The audit says nothing is saved in the
browser. Both hold, and the design meets both, as follows.
- **Kept client-side** means kept in the open tab's memory: the React state the page already has, plus one in-memory
  copy of the narrative form's values held above the page (section 4.10).
- **Nothing is saved** means the product writes nothing to any browser store that outlives the tab or can be read
  outside the page: no Web Storage, no IndexedDB, no Cache API, no cookie, no URL, no service worker, no
  BroadcastChannel payload, no form history, no spell-check service. The browser's own session-restore data is outside
  the product's control; the lock keeps typed text out of it while a tab sits locked (section 4.10).
- **Restored** means the page is never unloaded by the sign-out. It locks in place. The person signs in again in a
  dialog over the lock (or, for a step that needs a full page, in a second tab). The tab then fetches fresh form keys
  and shows the page as it was.

That is the only reading under which "no narrative is ever lost to a sign-out" and "nothing saved" are both true. The
honest cost: a closed tab, a reload the person confirms, or a browser crash still loses unsaved text. Section 3 says
why that cost is accepted, and section 4.10 keeps it small (a leave warning on reload, close and in-app links).

---

## 3. Where a draft that may hold patient details can live

A narrative is PHI. It is an encrypted column (`packages/db/src/crypto/cipher.ts:55`, "free text people write that can
hold anything they type"). The identifier check runs on the server only, after a save (ADR 0047:41-45, :120). So an
unsaved draft may hold a patient's name in plain text that nothing has checked.

| | (a) Nothing persisted: the live page's memory, locked in place | (b) sessionStorage | (c) sessionStorage or IndexedDB, encrypted with a WebCrypto key | (d) A server-side draft |
| --- | --- | --- | --- | --- |
| What is kept | The form's values in React state and one in-memory copy of the narrative form's values | The text, in plain | The text as AES-GCM ciphertext | The text, encrypted with the practice key |
| Where | The tab's JavaScript heap | The browser profile's disk (sessionStorage is written to disk for session restore in most browsers) | The profile's disk; the key in memory, or derived by the server per user and packet | Postgres |
| How long | While the tab is open; at most 12 hours after a lock | Until the tab closes, and past it through session restore | Until deleted; a crashed tab leaves the ciphertext behind | Until saved or discarded, by a retention rule |
| Readable by another user of the browser | No: their sign-in discards it (section 4.11) | Yes, from the same tab after their sign-in, unless code clears it first | No, if the key is bound to the user | No (RLS) |
| A later sign-in of the same user | Yes, while the tab is open (the point) | Yes | Yes, if the key is per user | Yes |
| A browser extension with page access | Only while the page is shown, as it can read the page today | Yes, at any time | Ciphertext only, unless it runs in the page | No |
| A stolen disk | Nothing the product wrote; the browser's session-restore files may hold form state captured while typing (blanked while locked) | The plain text | Ciphertext; safe only while the key stays off the disk | Nothing |
| Survives a reload or crash | No | Reload yes; crash partly | Yes, with a server-derived key | Yes |
| Cleared on sign-out | Yes: the tab reloads (section 4.11) | Only by code, or by a `Clear-Site-Data: "storage"` header this design does not add (Safari's support is partial) | Same as (b), and the key | By the sign-out route |
| Cleared on another user's sign-in | Yes, at the first message naming another user, before any click | Only by code that runs first | Undecryptable | Not needed |
| Cleared on tab close | Yes | Yes, unless restored | No | Not needed |
| SEC-15 and the 12-hour limit | Unchanged | Unchanged | Unchanged | Unchanged |
| CSP | No change | No change | No change | No change |
| Policy fit | Meets "No PHI on a laptop ... ever" (`workforce-and-device.md:29-31`), vendor flows (`vendor-management.md:38-42`) and the retention schedule (`data-retention.md:20-28`, which has no row for a browser copy) | Breaks all three | PHI ciphertext on the device and outside the retention schedule; the policy says "ever" | Fits, but needs a table |
| Database | No | No | No (a key derived by HMAC needs no table) | **A migration: Lane A** |

**Decision: (a).** It is the safer option, and it still means no narrative is lost to a sign-out.
- (b) writes PHI to disk in plain text. It breaks the workforce policy outright, since internal roles open these pages
  on their laptops. Rejected.
- (c) is the only browser option that survives a crash. But it still puts a PHI copy on the device, outside the
  retention schedule, and its cleanup is unreliable (a crashed tab leaves ciphertext until the next visit). A
  server-derived key also hands the key to page script, so script injection reads both. Its only gain over (a) is the
  crash and the reload, not the sign-out the item is about. Rejected under the safer-side ruling. Revisit when people
  report drafts lost to crashes (from support tickets; PHI pages carry no analytics, `PRD.md:639`).
- (d) closes every gap but needs a table, so a migration, so Lane A (LANES rule 2). Autosaving as packet versions
  instead is rejected: versions are immutable, each write clears the approval (CAS-13) and writes an audit event.
  (d) is recorded in ADR 0076's "Revisit when", not handed to Lane A now. The audit's own best option says
  "Database: no" and "Nothing is saved in the browser", and (a) meets the item in full.
- An in-memory encrypted copy (the policy scout's extra option) adds nothing over (a): the key would sit in the same
  heap as the ciphertext.

**PRD.md:256** says "no screen depends on client-side state that a refresh loses". Unsaved typing is client-side state
by nature. The design makes a refresh ask first (section 4.10), and makes the session's end, which used to lose it,
lose nothing. ADR 0076 records this reading.

---

## 4. The design

### 4.1 The pieces and where they mount (no #42 file)

| Piece | Where | Why there |
| --- | --- | --- |
| `SessionGuard` (client): the clock, activity, the cross-tab channel, the warning, the lock, the 12-hour notice, the leave warning, the narrative copy | New `app/p/[practiceId]/layout.tsx` (server) wrapping every practice page | Every PHI screen is under `/p`. `components/shell.tsx` (AppShell) is a #42 file, and a layout needs no edit to any page. |
| `SessionClock` (client provider): the shared clock, activity, the cross-tab channel, and the beacon that announces the session and user markers the page was rendered for | `app/layout.tsx` (root, not #42) | It lives for the whole document, so it sees every contact from the document's start, including pages outside `/p` before a soft navigation into it (section 4.3). A sign-in that lands outside `/p` must still reach another user's `/p` tabs. |
| `PracticeError` (client): the error boundary below the guard | New `app/p/[practiceId]/error.tsx` | A render error inside a practice page no longer unmounts the guard and its narrative copy (section 4.9). |
| The touch route `account.session`, `GET /api/session` | `lib/routes/account.ts`, added to `ACCOUNT_ROUTES` (`:64`); new `app/api/session/route.ts` | `index.ts` already spreads `ACCOUNT_ROUTES` (`index.ts:62`), so `index.ts` and `registry.test.ts` (#42) stay untouched, and the route gets the generated per-route tests (`route-tests/define.ts:70-78`), which pass unedited only because the route refuses a cross-site fetch as `sameOrigin()` does (section 4.3). |
| The session view cookie `tp_session_view` and the two markers | New `lib/auth/session-view.ts`; `lib/auth/pending.ts` (`writeSession`, `clearSession`) | No database read in a layout (section 4.2). |
| The non-navigating practice action, and the action wrapper | `lib/http/next.ts` (`runAction`, `ActionState`, `guardMessage`); `components/session/guard.tsx` (`guardedAction`) | Not #42 files. |
| Re-authentication in place | `lib/http/next.ts` (`runSignInStepInPlace`), new `app/sign-in/in-place-actions.ts`, `components/session/sign-in-dialog.tsx`, `components/hardware-key.tsx` (an `inPlace` mode that never calls `location.assign`) | The existing step routes, unchanged; none is a #42 file. |
| The return path | `proxy.ts` (stamps the path), `lib/http/next.ts` (`signInFor`), `lib/routes/sign-in.ts`, `lib/auth/sign-in.ts` (`Pending` carries `next` and `resume`), the sign-in pages | None is a #42 file. No new cookie. |
| The sign-in landing page `/sign-in/done` | New `app/sign-in/done/page.tsx`, its public page route `sign_in.done` in `SIGN_IN_ROUTES` (`sign-in.ts:345`, spread by `index.ts:61`), loaded with `loadPublicPage` | `registry.test.ts:135-148` requires every page to run a registered page route at its own path; adding the route to `sign-in.ts` needs no #42 file. Every sign-in ends here, in a full document load (section 4.11). |
| The sign-out landing's broadcast and hard reload | `app/sign-in/page.tsx`, new `components/session/signed-out.tsx` | No header change (section 4.11). |
| Pure logic: the clock reducer, the limits, the path check, the message schema | New `lib/session/{limits,clock,channel}.ts` (client-safe) and `lib/session/return-path.ts` (`import 'server-only'`: it reads `ROUTES`, which pulls in server code) | Unit-testable without jsdom (apps/web has none). Not `lib/server/config.ts` (#42). |

### 4.2 What the page knows about its session, with no status call

The layout reads cookies only. It never calls the database, for two reasons:
- a second `resolve_session()` in the same render could end an idle session before the page's own call, which would
  then redirect with `reason=ended` instead of `reason=idle` and change SEC-15's observable result;
- a layout that touched the session would be a status check by another name.

**The session view cookie.** `writeSession` (`pending.ts:33-37`) also sets `tp_session_view`:
- a value sealed with the existing `Sealer` (`lib/auth/seal.ts`, purpose `session-view`, expiring at the session's
  `expires_at`), holding `{ userId, expiresAt, marker, userMarker }`;
- HttpOnly, Secure, SameSite=Lax, path `/`, Max-Age the session's 12 hours, like `tp_session`;
- `clearSession` deletes it with `tp_session`.

It is a hint for the screen only. No authorization reads it. The database stays the authority.

**The user marker** is `sealer.sign('session-user-marker', userId)` in base64url, cut to 22 characters: a purpose of
its own, so it never equals the session marker or any other HMAC, and it never reveals the user ID. It lets a tab tell
"the same person signed in again" from "someone else signed in" without a request (section 4.11).

**The marker** is `sealer.sign('session-marker', sessionToken)` in base64url, cut to 22 characters (128 bits). It
names the session without revealing the token or the session ID. The layout computes it from `tp_session` and accepts
the view cookie only when the two markers agree. Otherwise the view is `{ marker, userMarker: null, userId: null, endsInMs: null }`.

**What the layouts pass.** The root layout passes `{ marker, userMarker, endsInMs }` to `SessionClock` (the clock and
the beacon). The `/p` layout passes `{ marker, userMarker, userId }` to `SessionGuard`. `endsInMs` is `expiresAt` minus the
server's clock, so the browser's clock skew never matters. A session opened before this PR ships has no view cookie;
its user and end time arrive with its first touch (section 4.3). That gap lasts at most 12 hours after the deploy.

`OpenedSession` (`lib/auth/sessions.ts:33-41`) gains `userId` (openSession already has it in `request.userId`).

### 4.3 Activity and the touch

**Activity** is a trusted (`event.isTrusted`) `keydown`, `pointerdown` or `wheel` event anywhere in the document,
with passive listeners. A pointer moving, a timer, a poll and a focus change are not activity.

**The touch rule** (one shared clock for every tab of the browser, section 4.4):
- On activity, if the last touch was 5 minutes ago or more, touch now.
- Otherwise remember that activity is pending. At the last touch plus 5 minutes, if activity is pending, touch then.
- So while someone works, the session is renewed at most once every 5 minutes, and the last touch is never more than
  5 minutes after the last input.

**The touch route** (`lib/routes/account.ts`):

```ts
/** The session's own clock, renewed by this call as by any request (combined audit #48; docs/adr/0076). */
export const sessionTouchRoute = selfRoute({
  id: 'account.session',
  kind: 'handler',
  method: 'GET',
  path: '/api/session',
  phi: false,
  // The lock must get an answer whatever the terms' state: this reads only the caller's own session.
  termsExempt: true,
  // GET carries no rate limit by default; the existing mutation bucket bounds a script that loops (rate-limit.ts unchanged).
  rateLimit: 'mutation',
  params: z.object({}),
  handle: async ({ scope, actor, request, services }) => {
    // A browser that names another site gets nothing back, as sameOrigin() refuses (csrf.ts:52-59). This does not
    // prevent the touch: signedIn() has already run (invoke.ts:425-432). It keeps the answer from other sites only.
    if (request.fetchSite != null && request.fetchSite !== 'same-origin' && request.fetchSite !== 'none') {
      throw new NotFoundError();
    }
    const { rows } = await scope.client.query<{ ends_in: number }>(
      'SELECT floor(extract(epoch FROM expires_at - now()))::int AS ends_in FROM user_session WHERE id = $1',
      [actor.sessionId],
    );
    return {
      userId: actor.userId,
      idleSeconds: SESSION_LIMITS.idleMinutes * 60,
      endsInSeconds: Math.max(0, rows[0]?.ends_in ?? 0),
      marker: sessionMarker(services.sealer, request.cookies.get(SESSION_COOKIE)),
      userMarker: userMarker(services.sealer, actor.userId),
    };
  },
  sample: { params: () => ({}) },
});
```

- **Zod:** `params: z.object({})`; it takes no input. **Role check:** a self route (any signed-in user, their own row;
  RLS `user_id = app_actor_id()`). **Transaction:** the actor-scoped transaction every self route opens. No practice
  scope: it reads no tenant table.
- **No audit event, no request key, no CSRF token.** It is a GET that reads the caller's own session. Its only effect
  is the touch that every request already makes, with no audit event (a page load is the same). Writing an event every
  5 minutes per person would bury the access log (audit #49). ADR 0076 records this.
- `app/api/session/route.ts`: `export const dynamic = 'force-dynamic'; export const GET = routeHandler(sessionTouchRoute, services);`
  (the pattern of `app/api/sign-in/hardware-key/options/route.ts`). The response is JSON with
  `Cache-Control: private, no-store` (`handler.ts:15`, `:76`).
- The client calls it with `fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' })`. `connect-src
  'self'` already allows it. No CSP change.
- **Why the cross-site check is written this way.** The generated per-route tests send no `Sec-Fetch-Site`
  (`route-tests/world.ts:606-627` sets it only for their cross-site case), and a persona test expects `ok`
  (`define.ts:96-101`). Refusing a missing header would turn every persona test into `not_found`. The body holds
  nothing secret, CORS keeps another origin from reading it, and SameSite=Lax keeps cross-site subresource requests
  from carrying the cookie, so a cross-site top-level navigation is the only case left, and it renews nothing a click on
  any app link would not.
- The client branches on the JSON body's `status` and `reason`, never on the HTTP code (`mfa_required` and
  `hardware_key_required` are 401, `handler.ts:17-31`):
  - `ok`: the guard sets the shared clock: `lastContact = sentAt` (the time the request left, which is earlier than the
    server's touch, so the client is never later than the server), `endsAt = sentAt + endsInSeconds * 1000`, and
    `userId`, `marker`, `userMarker`.
  - `unauthenticated`: locks with the body's reason (`idle`, `expired`, `ended`, `device_revoked`, `user_disabled`,
    `none`).
  - `mfa_required`, `hardware_key_required`: locks with `ended`; the in-place dialog runs that step (section 4.7).
  - `rate_limited` (429), `maintenance` (503), any other status, or a network error: nothing changes; it tries again at
    the next activity. It never locks on these.

**Other server contact the clock counts: only contact it actually observed.**
- a touch answered;
- a practice action's result through the guard's action wrapper (section 4.9), at the time it was sent;
- a guarded refresh (section 4.13), which always follows a touch.
A soft navigation is **not** contact. Back and Forward can be served from Next's router cache with no request (the
browser's own Back button among them, a press the document never sees as input), and a prefetch stops at the
`loading.tsx` boundary without reaching `loadPage`. Counting either would make the clock believe in a touch the server
never had, and lock late. A real navigation starts with a click or a key press, which is activity and leads to a touch
within 5 minutes; a contact the clock misses only makes it lock early. (The reviewer's PerformanceObserver on resource
entries was considered and not taken: a resource entry cannot tell a prefetch, which does not touch, from a page load,
which does.)

**At the document's start** `SessionClock` (root layout, mounted once per document) sets
`lastContact = lastActivity = Date.now() - performance.now()`, the document's start in the same clock as `Date.now()`
(Playwright's `page.clock` fakes both, so the e2e is stable; `performance.timeOrigin` is not faked and is not used).
The document's own request touched the session after that instant, so the clock is never late. Because the provider
lives in the root layout, a `/p` layout mounted later by a soft navigation from `/`, `/settings` or `/console` reads
the clock that has been running since the document began, so there is no false lock in an old document and no late
lock from a fresh start. `endsAt` is the document's start plus the root layout's `endsInMs` (the root layout renders on the document's own
request, so this is never later than the true end), then each touch's answer. A later render of the root layout (a
`router.refresh()`) updates the markers only, never `endsAt`, since a refreshed payload can arrive late; a session
change always comes with a touch first (section 4.7). The `/p` layout's view props carry the user ID for the narrative
copy and the lock, not times. Every time is `Date.now()`.

### 4.4 One clock for every tab

A `BroadcastChannel('tp-session')` carries only kinds, times and the two markers. Never text, a name, a URL or an ID
other than the markers. No CSP directive governs it, and COOP same-origin does not block it. There is no localStorage
fallback, which would write to disk.

The messages (schema in `lib/session/channel.ts`, checked with Zod on receipt; anything else is ignored):

| Message | Sent when | A receiving tab |
| --- | --- | --- |
| `{ t: 'contact', at }` | Any observed contact this tab made (touch, action result, guarded refresh; section 4.3) | Takes the later of its own `lastContact` and `at` |
| `{ t: 'activity', at }` | Activity, at most once a second | Records `lastActivity` (for the touch rule and the polls) |
| `{ t: 'renewed', at, endsAt }` | A touch answered 200 | Takes `at` and `endsAt`; closes its warning |
| `{ t: 'hello', marker, userMarker }` | The beacon's mount (every document) and every change of its marker props (a refresh after a sign-in) | Same `marker`: nothing. A `marker` equal to a `signed_in` heard in the last 10 seconds: ignored (that sign-in is already being handled). Different `userMarker`, or either one unknown: drops the draft and reloads at once, with no request (section 4.11). Same `userMarker`, different `marker`: locks with reason `changed`, Continue restores |
| `{ t: 'sync' }` / `{ t: 'state', lastContact, lastActivity, endsAt }` | A tab joins / answers | Takes the later `lastContact` and `lastActivity`; the earlier `endsAt` |
| `{ t: 'signed_in', marker, userMarker }` | An in-place sign-in completes, or `/sign-in/done` loads after a sign-in started from a lock (section 4.7) | Handled before any `hello` from the same page (a child's effect runs before the root layout's). Same user: one touch, then restore (section 4.7). Other user: drop and reload |
| `{ t: 'signed_out' }` | The sign-out landing loads, under the conditions of section 4.11 | Drops its drafts and reloads to `/sign-in?reason=signed_out` |

Every tab computes the same deadlines from the shared times, so the warning and the lock appear in every tab at
once, and only one touch goes out per 5 minutes across the browser. Two tabs racing to touch at once is harmless (a
GET). Without BroadcastChannel (every browser the product supports has it), each tab keeps its own clock: a background
tab may lock while another works, which is safe, and Continue brings it back.

**The clock** is a pure reducer in `lib/session/clock.ts`:

```ts
export type ClockPhase = 'active' | 'warning' | 'locked';
export type LockReason = 'idle' | 'expired' | 'ended' | 'changed' | 'signed_out' | 'step_up'; // step_up: MFA or a hardware key asked for
export interface ClockState {
  readonly lastContact: number; // ms since epoch, the latest contact any tab made
  readonly lastActivity: number;
  readonly lastTouch: number;
  readonly activityPending: boolean;
  readonly endsAt: number | null; // the 12-hour end, when known
  readonly phase: ClockPhase;
  readonly lockReason: LockReason | null;
  readonly lockedAt: number | null;
  readonly absoluteNoticeShown: boolean;
}
export type ClockEvent =
  | { readonly kind: 'tick'; readonly now: number }
  | { readonly kind: 'activity'; readonly now: number }
  | { readonly kind: 'contact'; readonly at: number }
  | { readonly kind: 'renewed'; readonly at: number; readonly endsAt: number }
  | { readonly kind: 'refused'; readonly reason: LockReason; readonly now: number }
  | { readonly kind: 'restored'; readonly now: number };
/** The next state, and whether to touch now. Pure: no timers, no DOM. */
export function step(state: ClockState, event: ClockEvent): { readonly state: ClockState; readonly touch: boolean };
/** When the guard must look again (the next deadline), for one timer instead of a per-second tick. */
export function nextDeadline(state: ClockState): number;
```

The constants (`lib/session/limits.ts`, imported by both `lib/auth/sessions.ts` and the client, so the client bundle
pulls in no server code):

```ts
export const SESSION_LIMITS = { absoluteHours: 12, idleMinutes: 30 } as const; // moved here; sessions.ts re-exports it
export const WARN_BEFORE_IDLE_MS = 5 * 60_000;   // the warning at 25 minutes
export const TOUCH_EVERY_MS = 5 * 60_000;        // at most one touch per 5 minutes
export const ABSOLUTE_NOTICE_MS = 10 * 60_000;   // the notice 10 minutes before the 12-hour end
export const ATTENDED_MS = 5 * 60_000;           // a poll runs only within 5 minutes of input
export const DRAFT_HOLD_MS = 12 * 3_600_000;     // a locked tab keeps its draft at most 12 hours
```

- The idle base is `min(lastContact, lastActivity)`. `warning` from base + 25 min; `locked` (reason `idle`) from
  base + 30 min; `locked` (reason `expired`) from `endsAt`. The screen therefore locks at most 30 minutes after the
  last input and never later than the server's end. Without the `min`, the trailing touch (up to 5 minutes after the
  last input) would leave the screen readable up to 35 minutes after the last input, and the warning's "after 30
  minutes without activity" would overstate it. Activity alone never moves the base past `lastContact`, so activity
  in `warning` still cannot renew.
- In `warning`, activity does not renew. Only the "Stay signed in" click does (audit #48, "only real input or the
  explicit 'Stay signed in' click renews"). The page behind the dialog is inert, so the click is the input.
- One timer is set for `nextDeadline()`. The guard also steps on `visibilitychange`, `focus` and `pageshow`, so a tab
  that slept or was throttled is right the moment it is seen again.
- A unit test asserts that the 30 minutes here equal the migration's hard-coded `interval '30 minutes'`
  (`20261015170000:369`) and `SESSION_LIMITS`, so neither can drift alone.

### 4.5 The 25-minute warning

- A modal `alertdialog` (section 6), in every tab at once, over the page. It says when the sign-out will happen,
  counts down at minute marks, and offers "Stay signed in" and "Sign out".
- **"Stay signed in"** calls the touch route. On 200 it broadcasts `renewed` and closes the dialog in every tab. On
  401 it locks.
- **"Sign out"** submits the existing sign-out action (`app/account/actions.ts:8-10`) with fresh form keys the layout
  rendered. If the page holds unsaved text, it asks first (section 5).
- Esc does not close the dialog and does not renew. Pressing a key behind it is impossible (the page is inert).
- WCAG 2.2.1 (Timing Adjustable): the warning comes 5 minutes before the end (at least 20 seconds), extends with one
  simple action, and can be used without limit. ADR 0076 cites 2.2.1, which no file cites today.

### 4.6 The 30-minute lock: hidden in place, kept in memory

At the lock the guard:
1. sets `hidden` and `inert` on the wrapper around the page (the AppShell and everything in it), so nothing shows,
   prints, is found by find-in-page, or reaches a screen reader;
2. blurs the focused element and closes any open dialog of the page;
3. shows the lock screen in place of the page (section 5), its heading focused;
4. snapshots every text control inside the wrapper (`input` other than hidden, `textarea`, `select`, checked state)
   into a `WeakMap` held by the guard, then blanks each control's DOM value, so the browser's session-restore data
   for this page holds no typed text while the tab sits locked (it can sit locked for 12 hours, overnight). React state
   is untouched. At unlock the guard writes every value back before it unhides the page and before any refresh, so
   React's controlled fields see the value they rendered;
5. never navigates.

**From pagehide.** On `pagehide` the guard sets the wrapper `hidden` at once (no snapshot needed: the page is
leaving). A page restored from the back/forward cache therefore paints hidden, and stays hidden until the guard's
`pageshow` handler decides (section 4.11). A laptop that wakes past a deadline may paint one frame of the old page
before the timer runs: the guard also hides on `visibilitychange` to hidden when the form is dirty and the clock is
past its warning, so a sleeping tab goes to sleep already hidden.

**The guard's own reloads.** Before any reload or navigation it starts on purpose (another tab's `signed_out`,
another user's sign-in, the 12-hour draft hold, revocation), the guard hides the page, drops the narrative copy,
blanks the controls and removes its `beforeunload` handler, then calls `location.replace`. If the navigation is still
blocked or cancelled, the tab stays locked.

**Why hidden and not unmounted.** Unmounting would also clear the DOM and React's copy, but:
- it loses every uncontrolled field unless each one is rebuilt to keep its value elsewhere;
- it aborts a running upload (`uploader.tsx` streams to storage from the page);
- it gains nothing against someone at the machine with developer tools, because the page's memory (React state, the
  router's cache of every PHI page visited) holds the same text either way.

Hidden-in-place hides the page from everyone looking at the screen, which is the audit's test ("a PHI screen left
readable past the idle limit"). It is the safer of the two that keep every word. ADR 0076 records it.

A locked tab keeps its unsaved text for at most `DRAFT_HOLD_MS` (12 hours) after the lock. After that it drops the
draft and reloads, so no unsaved PHI sits in a forgotten tab for days.

### 4.7 Signing in again without leaving the page

**In place first.** The lock screen's **"Sign in again"** opens a modal dialog over the lock (`sign-in-dialog.tsx`).
The tab never unloads, so a phone that discards background tabs (iOS Safari, Android Chrome) or a screen-reader user
who would otherwise juggle tabs loses nothing. The dialog runs the existing sign-in step routes, unchanged, through
new in-place server actions (`app/sign-in/in-place-actions.ts`) that call `runSignInStepInPlace` (`lib/http/next.ts`).
It is `runSignInStep` without the `redirect`: it maps the step's `redirect` to the next step instead.

| The step's answer | The dialog |
| --- | --- |
| The authenticator code (`/sign-in/mfa`) | Shows the code field in the dialog |
| The hardware key (`/sign-in/hardware-key`) | Runs WebAuthn in the dialog: `HardwareKeyForm` gains an `inPlace` mode that returns the verify answer instead of calling `location.assign` (`hardware-key.tsx:57`, `:111`) |
| Signed in (the step answers `/sign-in/done`) | Closes; the tab broadcasts `{ t: 'signed_in', marker, userMarker }` from the touch that follows, and restores (below) |
| A new password, TOTP enrolment, a hardware key to register | Says this step needs its own page, and shows the new-tab link (below). The pending cookie the step set is already in the browser, so the new tab continues the same sign-in |
| A refusal | The step's own message, as on the sign-in page |

The dialog's fields are the sign-in page's own (the email is typed: the page holds no email), with
`autoComplete="username"`/`"current-password"`/`"one-time-code"` so password managers work. Rate limits, lockout and
the audit trail are the step routes' own. The dialog is mounted outside the hidden wrapper, so it shows while the page
stays hidden.

**The new-tab fallback.** The lock screen also shows an ordinary link, never `window.open`:
`<a href="/sign-in?reason=<reason>&resume=1&next=<path>" target="_blank" rel="noopener noreferrer">Sign in in a new
tab (opens a new tab)</a>`. A link is never blocked as a popup and is announced as a link that opens a new tab.
(`window.open(..., 'noopener')` always returns null by spec, so a "did it open" check cannot work.)

The sign-in tab:
1. The sign-in page passes `resume` and `next` (validated, section 4.12) as hidden fields of its first step's form.
2. The password step carries them in `Pending` (`lib/auth/sign-in.ts:44-50` gains optional `next` and `resume` on
   every step), which is sealed in the existing `tp_sign_in` cookie and lives exactly as long as the step (5 minutes,
   15 for registering a key; `pending.ts:15-17`). No new cookie.
3. Each later step (new password, enrolment, the authenticator code, the hardware key) runs as today and copies them
   forward.
4. At `settle()`'s `signed_in` (`sign-in.ts:82-83`), every sign-in (with or without `resume`) redirects to
   `/sign-in/done`, and `settle` writes a one-time sealed `tp_sign_in` value of its own purpose, `sign-in-done`
   (60 seconds; `{ next, resume }`), in place of the cleared pending step.
5. `/sign-in/done` (public page route `sign_in.done`, `loadPublicPage`) reads that value. Without it, or when the
   request's `Sec-Fetch-Site` names another site, it redirects to `/` and broadcasts nothing, so a link from another
   site cannot make locked tabs touch. With it:
   - with `resume`: broadcasts `{ t: 'signed_in', marker, userMarker }`, shows "Signed in again" (section 5) and tries
     `window.close()`. Closing is best effort: a tab whose history holds several sign-in steps usually may not close
     itself, and the wording says it can be closed;
   - without `resume`: calls `location.replace(next ?? '/')`, a full document load (section 4.11).
   - Without JavaScript the page shows a "Continue" link to the same place.
   The value expires in 60 seconds and the next `writeSession` or `clearSession` removes it, so a reload of the page
   repeats the broadcast at most within that minute, which costs each locked tab one touch.

**The locked tab, on `signed_in` (or on its "Continue" button, always on the lock screen):**
1. calls the touch route once (the person has just signed in, so this is their action, not a status check);
2. `unauthenticated`: stays locked and says "You are not signed in yet";
3. `ok` with the same `userMarker` as the page was rendered for (the layout's, or the narrative copy's owner):
   `router.refresh()`. Next re-renders the layouts and the page with the new cookies, so every form gets new keys
   (`FormKeys` renders `value=`, a new request key and the new session's CSRF token, `components/form-keys.tsx:11-17`).
   The guard writes back the snapshot, takes the new marker, unhides the page, restores focus to where it was, and
   announces "Signed in again. Your text is still here." React keeps the editor's state across a refresh, since
   `NarrativeEditor` ignores a changed `initial` (`narrative-editor.tsx:19`);
4. `ok` with a different `userMarker`: the guard's intentional reload (section 4.6) to `/`. A full load drops the
   earlier user's memory. Their text is never offered, re-keyed or submitted under the new user;
5. with no known user marker on either side (a session from before this PR, with no view cookie): treats it as a
   different user and reloads. That is the safe side, and the case ends 12 hours after the deploy.

The save is never re-sent automatically. The person sees the page as they left it and presses Save again. The failed
attempt used nothing: the session check runs before the request key is recorded (`invoke.ts:198-213`).

### 4.8 The 12-hour notice

- At `endsAt - 10 minutes`: a dialog says the session ends in 10 minutes and cannot be extended. It offers "Sign in
  again" (the in-place dialog of section 4.7, which starts a new session and so a new 12 hours) and "Close". Esc closes
  it, since nothing can be extended.
- After it closes, a status line stays at the top of the page and counts down at minute marks.
- From `endsAt - 60 seconds` no guarded refresh runs (section 4.13), so no poll can reach `loadPage` after the end and
  navigate away.
- At `endsAt`: the lock (section 4.6), with the reason `expired`.
- Signing in again before the end replaces the session. The signing tab restores in place; every other tab hears
  `signed_in` before the `hello` and adopts the new session (step 3 above) without a lock and without lost text.
- **WCAG.** The 12-hour behaviour rests on advance notice plus a re-authentication that loses nothing (2.2.5,
  Re-authenticating). Whether a 12-hour security limit is "essential" under 2.2.1 is a judgment, not a given: W3C's
  understanding note does not treat security as automatically essential, and 12 hours is under 2.2.1's own 20-hour
  exception. ADR 0076 records the essential-exception reading as a judgment, and records 2.2.5 as what the design
  meets.

### 4.9 The save never navigates away from typed text

`runAction` (`lib/http/next.ts:148-174`) changes only for practice actions. Every `/p` action passes `practiceId` in
`params`; the account, console, settings, terms and screening actions do not (verified: all 105 call sites).

```ts
/** What a form shows after a server action that did not move on. */
export interface ActionState {
  readonly error?: string;
  readonly issues?: readonly Issue[];
  readonly problems?: readonly string[];
  readonly locked?: boolean;
  /** A practice page could not save and keeps what was typed, in place (docs/adr/0076). */
  readonly session?: 'signed_out' | 'changed' | 'step_up' | 'blocked';
  readonly signedOutReason?: 'none' | EndedReason;
  readonly blockedBy?: 'maintenance' | 'terms';
  readonly notSent?: boolean;
}

// In runAction, before the redirect: a practice action never redirects on a refusal.
const inPractice = typeof params.practiceId === 'string';
if (inPractice) {
  const held = heldInPlace(outcome); // unauthenticated, csrf_refused, mfa_required, hardware_key_required, terms_required, maintenance
  if (held !== undefined) {
    return held;
  }
}
```

| Outcome on a practice action | State | The page |
| --- | --- | --- |
| `unauthenticated` | `{ session: 'signed_out', signedOutReason }` | Locks with the reason, keeps the text |
| `csrf_refused` | `{ session: 'changed' }` | Locks with `changed`, Continue restores |
| `mfa_required`, `hardware_key_required` | `{ session: 'step_up' }` | Locks with `step_up`; the in-place dialog runs that step |
| `terms_required` | `{ session: 'blocked', blockedBy: 'terms' }` | Stays visible; a notice above the form: new terms must be accepted, with a link that opens `/terms` in a new tab; then save again |
| `maintenance` | `{ session: 'blocked', blockedBy: 'maintenance' }` | Stays visible; a notice: the service is down for maintenance, the text is kept, save again when it is back; a link opens `/maintenance` in a new tab |

- Success still redirects (Post/Redirect/Get); after a save the typed text is the new version, so nothing is lost.
- `refusalState` (`lib/cases/refusals.ts:37-44`) passes these fields through unchanged.
- **The action wrapper.** Inside the guard, every form's action is wrapped on the client by
  `guardedAction(action)` (`components/session/guard.tsx`):
  `async (state, form) => { try { return await action(state, form); } catch (error) { if (isRedirectError(error) || isNotFoundError(error)) throw error; return { error: NOT_SENT_MESSAGE, notSent: true }; } }`.
  An offline save, a 502 from the load balancer or a 500 now comes back as "not sent" instead of throwing into the
  root error boundary (`app/error.tsx`, which unmounts the whole tree). The text stays and the person retries. The
  wrapper also reports the attempt's start as contact when the action answered (not when it threw).
- **The error boundary below the guard.** A new `app/p/[practiceId]/error.tsx` sits inside the `/p` layout, so a
  render error inside a practice page replaces the page, not the guard. The narrative copy survives and the
  newer-version notice (section 4.10) offers it when the page is reset; other uncontrolled fields of a page that
  failed to render are lost, which is what a render error means.
- A new hook `useSessionRefusal(state)` tells the guard to lock or notice when a state carries `session`. Outside the
  guard it does nothing. `ActionForm`, `VersionForm` and the export request form (`export-status.tsx`) call it.
- `device_revoked` and `user_disabled` lock and drop the draft (someone ended this device or this account on
  purpose). `idle`, `expired`, `ended` and `none` lock and keep it. **This is best effort:** `resolve_session()`
  reports `device_revoked` or `user_disabled` only to the first request after the event, and `ended` to every later
  one (`20261015170000:362-375`); an administrator's revoke-all writes `revoked` and reports `ended`
  (`revoke_user_sessions`, `:402`); and the idle check comes before the revocation check. Which tab hears which reason
  depends on who asked first. A kept draft is still bounded by `DRAFT_HOLD_MS`, and the next sign-in by another user
  drops it. Reading the ended session's own `end_reason` from the touch route is not possible without a migration:
  an ended session has no actor, so the self policy shows nothing, and a SECURITY DEFINER read is a migration.
- **Keeping uncontrolled values on any refusal, safely.** Inside the guard, `ActionForm` keeps `action={formAction}`
  on the `<form>` and adds `method="post"`, then adds an `onSubmit` on top:
  `event.preventDefault(); startTransition(() => formAction(new FormData(form, event.nativeEvent.submitter)))`.
  React does not reset the form on that path. Before hydration, or with script failed, the function action is still
  there, so React queues the submit or the browser posts it, and a form is never sent as a native GET to the current
  URL, which would put the narrative and every typed field in the query string, history and server logs. `VersionForm`
  does the same (`action={writeDispatch}` stays, `method="post"` added) and picks `modelDispatch` or `writeDispatch`
  by the submitter in its `onSubmit`. Outside the guard (sign-in, console, settings) `ActionForm` keeps today's
  behaviour, so a refused password still clears.
- A static test (`components/forms.test.ts`, new) reads every `.tsx` under `app` and `components` and fails on a
  `<form` that does not name its `method`. A `method="get"` form is allowed only from a list in the test, each with
  its reason (today: the nine filter forms under `app/p` and `reference-search.tsx`, which carry opaque IDs, codes and
  months, never free text), and only if it holds no `textarea`. It also fails on `ActionForm` or `VersionForm`
  rendering a form without `autoComplete="off"` under the guard (section 4.10).
- `VersionForm` makes the prompt-pay `select` and the attachment checkboxes controlled (`useState`), so the narrative
  copy can hold them and a remount can restore them.

### 4.10 The narrative, and the other typed work

**What is kept, and where.**
- Every form value on a `/p` page stays where it is (section 4.6).
- One copy of the narrative form's values is held by the guard, in a React context above the page, in memory:
  `{ ownerId, practiceId, caseId, basedOnVersionId, narrative, promptPayState, attachmentIds, changedAt }`. The key is
  `ownerId:caseId`. It exists only while the form differs from what the page rendered (dirty).
- `ownerId` is the page's `viewerId` (`lib/routes/packets.ts:108`), passed to `VersionForm`. It is the opaque user ID
  the server rendered the page for.

**Why a copy at all.** After a re-sign-in the refresh can bring a newer version (someone else wrote one while the tab
was locked). The current version's `VersionForm` then mounts fresh, and the old editor's state is gone. The copy lets
the new form show the kept text:
- same `basedOnVersionId`: the editor starts from the copy (normally it never remounted, and nothing changes);
- a newer version exists: the editor starts from the new version's text. A notice above it says a newer version was
  written while the person was away. It shows the kept text read-only, with "Use my unsaved text" and "Discard it".
  The server's staleness guard still refuses a save based on the old version (`packets.ts:136`), so nothing is
  overwritten.

**When it is cleared.**

| Event | The copy | The page's form values |
| --- | --- | --- |
| Saved (the page loads with `notice=written` or `unchanged` for a new `basedOnVersionId`) | Cleared | Replaced by the new page |
| The person leaves the page and confirms (section 5) | Cleared | Gone with the page |
| Sign-out in any tab (section 4.11) | Cleared (the tab reloads) | Gone (reload) |
| A different user signs in anywhere in the browser (the first `hello` or `signed_in` with another user marker; no click needed) | Cleared at once | Gone (the guard's intentional reload to `/`) |
| A sign-in by anyone in this same tab (in place) | Kept only for the same user marker | Same user: kept; other user: gone (reload) |
| `device_revoked` or `user_disabled` | Cleared | Gone (the tab reloads to sign-in) |
| 12 hours after a lock | Cleared | Gone (reload) |
| Tab closed or crashed | Gone (memory) | Gone (memory) |
| Idle lock, 12-hour lock, a session change by the same user | **Kept** | **Kept** (snapshot in memory, controls blanked while locked) |
| Network failure, server error, maintenance, new terms on save | **Kept** | **Kept** (section 4.9) |

**The leave warning.** While any form on the page is dirty:
- a `beforeunload` handler asks before a reload, a close or a navigation away (the browser's own words). The guard
  removes it before any reload it starts itself (section 4.6). Background tabs show the prompt inconsistently; that is
  why the guard's own reloads never depend on it;
- a capture-phase click handler on same-origin links inside the page asks first, with an in-page dialog (section 5).
  The shell's rail and breadcrumbs are inside the page wrapper, so this needs no #42 file;
- "Write the code-built draft" and "Draft with the model" ask before they discard typed text (section 5).

A form is dirty when a control's value differs from its default (`value !== defaultValue`,
`checked !== defaultChecked`), hidden inputs excluded. `VersionForm` reports its own state, since its fields are
controlled.

**Never written anywhere by the product.**
- Inside the guard, `ActionForm` and `VersionForm` render `autoComplete="off"` on the `<form>` (which covers its
  controls) and on every `textarea`, so no browser saves typed PHI as form history.
- Every free-text control under the guard also gets `spellCheck={false}`. A browser's enhanced spell check (Chrome's,
  Edge's editor) sends typed text to its vendor, outside the BAA chain (`vendor-management.md:38-42`). This was
  improvement 7; review raised it to the same decision as `autoComplete`, since both keep or send typed PHI outside
  the page. The cost is spelling help in payer-facing text; the UX review checks the narrative still reads well.
- No form ever submits by GET with typed text (section 4.9).
- **Outside the product's control:** a browser may write a page's form state into its session-restore files while
  someone types (Chromium keeps it in session history), and an extension with page access can read the page. The lock
  blanks the controls (section 4.6), so a locked tab does not keep them there overnight. ADR 0076 records the rest as
  a limit, not a guarantee.
- No typed text goes in a URL, a broadcast, a log, an error or a model prompt. Restoring never involves a model: the
model's output arrives only as a stored version (`lib/routes/models.ts:102-139`), so rule 1 is untouched.

### 4.11 Another user's sign-in, sign-out, and the back button

**The markers.** `SessionClock`'s beacon (root layout) broadcasts `{ t: 'hello', marker, userMarker }` on its mount,
which is every document, and again whenever its marker props change (a `router.refresh()` after a sign-in). A `/p` tab
that hears:
- **another user marker** (or a hello with no user marker while its own differs): drops the narrative copy, blanks the
  controls and reloads to `/` at once, with no request and no click (section 4.6). A's text leaves the DOM and the
  heap before B can reach that tab;
- **the same user marker under a new session marker**: locks with reason `changed`; Continue restores (section 4.7);
- a marker equal to a `signed_in` it heard in the last 10 seconds: nothing (that sign-in is being handled).

**Every sign-in ends in a full document load.** `settle()`'s `signed_in` redirects to `/sign-in/done`, which calls
`location.replace(next ?? '/')` (section 4.7). So in the tab where B signs in, A's JavaScript heap and Next's router
cache (A's `/p` payloads) are gone before B sees anything, Back cannot replay A's pages from memory, and the beacon of
the new document always sends B's hello. The hardware-key path's `location.assign` already does a full load and now
lands on `/sign-in/done` too.

**Ending the earlier session on the server.** At `settle()`'s `signed_in`, before `writeSession`, if the browser still
holds a `tp_session` token, a new `endReplacedSession(pool, token, requestId)` in `lib/auth/sessions.ts`:
- resolves it (an expired one is ended as today);
- if it is still active, ends it as its own user (`withActor(old.userId)`, `UPDATE user_session SET ended_at = now(),
  end_reason = 'signed_out'`, which the existing CHECK allows, `20261015170000:220`);
- records the audit event `session_replaced` (object `user_session`, the earlier session's ID) with
  `purpose: 'replaced'`, through the same path `resolveSession` uses for `session_ended` (`sessions.ts:143-147`;
  `purpose` matches the existing CHECK, `20261015140500:15`).
- `end_reason` cannot say `replaced`: the CHECK has no such value and adding one is a migration. So the session record
  merges replacements with sign-outs, and the access log tells them apart by the event's action and purpose. ADR 0076
  says so.

The earlier session's token, now overwritten in the cookie jar, can then never be used again.

**Explicit sign-out.**
- The sign-in page renders `<SignedOut />` on every landing, whatever the `reason`. It always does the one thing that
  is safe from any link: if this page was reached by a soft navigation (the navigation entry's URL is not this page's),
  it calls `location.replace(location.href)` once. The full load drops the heap and the router's cache of PHI pages,
  so Back cannot replay them from memory. That covers `signed_out`, `idle`, `ended`, `expired` and the rest alike.
- It broadcasts `{ t: 'signed_out' }` only when `reason` is `signed_out` or `device_revoked`, there is no
  `tp_session` cookie, and `Sec-Fetch-Site` is `same-origin`. So a link from another site to
  `/sign-in?reason=signed_out` cannot wipe anyone's drafts. Every other tab then does its intentional reload to
  `/sign-in?reason=signed_out`, dropping its draft.
- **No `Clear-Site-Data` header.** Review dropped it. Under option (a) nothing is stored, PHI pages are `no-store`,
  and the back/forward cache is handled by `pageshow` and `pagehide`; the header would buy almost nothing. A header
  change also needs the owner's consent (`reconciliation-001.md:300`, `:440`, `:472`), and `next.config.ts`'s
  `headers()` could not apply the cookie gate, so a cross-site link to `/sign-in?reason=signed_out` would clear the
  HTTP cache. If the owner wants it later, it is a question for them, with a `missing: [{ type: 'cookie', key:
  'tp_session' }]` condition (section 14, N13).
- `clearSession` also clears `tp_sign_in` (sign-out leaves it today; improvement).
- Unsaved text at the shell's own Sign out button: the shell is a #42 file, so the confirmation there waits (section
  13). Until then a sign-out from the shell discards the draft without asking. That is a deliberate act, unlike a
  timeout.

**The back/forward cache.** PHI pages are `no-store`, which most browsers keep out of the back/forward cache, and
Chrome evicts such a page when a cookie changes. The guard hides the page on `pagehide` (section 4.6), so a restored
page paints hidden. On `pageshow` with `event.persisted`, the guard reloads the page (its intentional reload), or, if
a form is dirty, stays locked with Continue. A signed-out PHI page never comes back readable from history.

### 4.12 Returning to the same page after sign-in

- `proxy.ts` sets `x-tp-path` on the request to the pathname as the browser sent it (set, never appended, like
  `x-tp-received-at`). The query is never carried.
- `signInFor` (`next.ts:54-72`) appends `next=<encoded path>` to the sign-in address for page loads under `/p/`.
  Practice actions no longer redirect (section 4.9). The lock's new-tab link sends `location.pathname` as it is,
  unvalidated on the client: the client never imports `return-path.ts`, which is `server-only` because `ROUTES` pulls
  in server and database code. The sign-in page and the password step validate it.
- `returnPath(value)` (`lib/session/return-path.ts`, `import 'server-only'`) accepts a value only if:
  - it starts with `/p/`, is at most 512 characters, and holds only `A-Z a-z 0-9 / - _`;
  - it has no `//`, no `..` and no backslash;
  - it matches a registered page route's pattern (`ROUTES` from `lib/routes/index.ts`, read, never edited) whose
    segments are opaque IDs (the SEC-08 rule, `urlPhiFindings` as `registry.test.ts` uses it).
  Anything else is dropped silently and sign-in goes to `/` as today.
- The sign-in page validates `next` (`reasonParams` in `sign-in.ts:35` gains `next` and `resume`). The password step
  validates it again before carrying it in the sealed `Pending` (section 4.7).
- At `signed_in` without `resume` (`/sign-in/done` then loads `next`): if the path's practice is in the new user's practice directory
  (`practiceDirectory`, the read `shellFor` uses, `invoke.ts:220-228`), redirect there. Otherwise `/`. A different
  user never lands on the earlier user's page.
- The URL carries only the path, which already holds opaque IDs only (`sessions.md:41`). The value is never echoed into
  the page except as a validated link.

### 4.13 The background polls

`useAttended()` (from the guard) is true when the tab is visible, the clock is `active` (not `warning`, not
`locked`), the last activity in any tab was under `ATTENDED_MS` (5 minutes) ago, and the time is before
`endsAt - 60 seconds`. Outside the guard it is always true.

`useGuardedRefresh()` (from the guard) replaces a bare `router.refresh()` on `/p` pages. It runs only while attended.
While the page holds unsaved text it calls the touch route first and refreshes only on `ok`; with nothing unsaved it
refreshes directly, since a redirect to sign-in then loses nothing and returns to the page through `next`. Any other answer locks or waits as section 4.3 says, so a
session the server ended without the guard knowing (revocation, the 12-hour end, a sign-out in another browser
profile) locks the page instead of letting `loadPage` redirect it away (`next.ts:103-107`) with the text.
- `ExportStatus` (`export-status.tsx:21-32`) refreshes through `useGuardedRefresh` only while attended. When paused it
  adds one line under "Check again" (section 5). The extra touch is spent only while text is unsaved: at the
  5-second interval that is 12 a minute per tab against the `mutation` bucket's 120 a minute per user
  (`rate-limit.ts:41`), which saves share. A `rate_limited` touch skips that refresh and never locks, so a save is never
  starved by the poll for long; a bucket of its own waits for #42 (section 13).
- The uploader's refresh on `settledAll` (`uploader.tsx:254-257`) uses `useGuardedRefresh` too.
- `Receipts` (`receipts.tsx:106-115`) and the uploader's receipt poll (`uploader.tsx:256-263`) are fetches, not
  refreshes; they poll only while attended, treat a 401 body as a lock, and resume at the next input. The upload
  itself (to storage) never stops.
- The restore's own refresh (section 4.7) already runs only after an `ok` touch.

So no request reaches the server more than 5 minutes after the last input, SEC-15's 30 minutes hold for every
unattended PHI page, and no poll navigates a page with typed text away.

### 4.14 Every kept thing, where, for how long

| Thing | Where | Holds | Lifetime | Cleared |
| --- | --- | --- | --- | --- |
| Form values on a `/p` page | The tab's DOM and React state | Typed text | While the tab lives; 12 h after a lock at most | Save, confirmed leave, sign-out, another user, revocation, tab close |
| The narrative copy | Guard's React context, memory | The narrative form's values and opaque IDs | While dirty | As above |
| The lock's snapshot | Guard's `WeakMap`, memory | The blanked controls' values | While locked | Unlock (written back), or with the page |
| `tp-session` broadcasts | In flight only | Kinds, times, the two markers | None | Never stored |
| `tp_session_view` | Cookie, HttpOnly, sealed | User ID, end time, the two markers | The session's 12 hours | Sign-out, revocation, a new sign-in |
| `next` and `resume` in `Pending` | The existing `tp_sign_in` cookie, HttpOnly, sealed | A validated path, a flag | The step's 5 minutes (15 to register a key) | Each step, sign-in completes, sign-out |
| The `sign-in-done` value | The existing `tp_sign_in` cookie, sealed, its own purpose | A validated path, a flag | 60 seconds | Expiry, the next sign-in or sign-out |
| `next` | The sign-in URL | A validated path of opaque IDs | The sign-in | Not stored |
| Browser storage, Cache API, service workers | None | Nothing | — | Nothing to clear; the e2e checks they stay empty |
| The browser's own session-restore form state | The browser profile, outside the product's control | What the browser captured while the person typed | The browser's | Blanked while locked (section 4.6); ADR 0076 records the limit |

---

## 5. Wording

Brand rules checked: `.claude/rules/brand.md` (tokens only, no brass fill, focus `--pw-focus`, 4.5:1 text, no mark as a
countdown), `docs/brand/BRAND.md:23-24` (serious, exact, warm; never "AI"), `tools/brand-copy/scan.ts` (no "AI", no
"intelligence", no "recovered", no typed brand word; none of these strings names the brand), and
`lib/copy/words.ts:8-10` (every count through `counted()`). Each message says what to do next (`PRD.md:256`). Taken
as recommended (co-founder's ruling of 2026-10-25 ~21:34 UTC on wording; section 14).

New strings live in `lib/session/words.ts` (not `components/help.ts`, a #42 file).

**The 25-minute warning** (`alertdialog`)
- Title: "You will be signed out in {counted(n, 'minute')}" (5 down to 1), then "You will be signed out in less than a minute".
- Text: "To protect patient information, you are signed out after 30 minutes without activity. What you typed on this page is kept."
- Buttons: "Stay signed in" (primary), "Sign out" (outline).

**The lock screen** (replaces the page; `h1`)
- Heading by reason:
  - idle: "Signed out after 30 minutes without activity"
  - expired: "Your session reached its 12-hour limit"
  - ended: "Your session has ended"
  - changed: "Your session changed in another tab"
  - step_up: "Confirm it is you to continue"
- Text with unsaved text: "This page is hidden to protect patient information. Your unsaved text is still here. Sign in again, and this page comes back as you left it."
- Then: "Keep this tab open. Closing or reloading it loses the unsaved text."
- Text without unsaved text: "This page is hidden to protect patient information. Sign in again to see it."
- For changed, instead: "You signed in again in another tab. Continue to load this page with that session. Your unsaved text is kept."
- Buttons: "Sign in again" (primary; opens the sign-in dialog here), "Continue" (outline), "Sign out" (link style).
- Link below them: "Sign in in a new tab (opens a new tab)".
- Continue while still signed out: "You are not signed in yet. Sign in again in the other tab, then choose Continue."
- Sign out with unsaved text: "Sign out and discard your unsaved text?" Buttons: "Discard and sign out" (destructive), "Keep it".

**The sign-in dialog** (`role="dialog"`, over the lock)
- Title: "Sign in again"
- Text: "Sign in to bring this page back. Nothing on it is lost."
- The step's fields and buttons are the sign-in page's own words.
- A step that needs its own page: "This step needs its own page. Open it in a new tab, finish there, then come back and choose Continue." Link: "Continue signing in in a new tab (opens a new tab)".

**After restoring** (polite status at the top of the page)
- "Signed in again. Your text is still here. Save it when you are ready."
- Without unsaved text: "Signed in again."

**A newer version while away** (above the editor)
- "A newer version was written while you were away. Your unsaved text is below; it was not saved."
- Buttons: "Use my unsaved text", "Discard it".

**The signed-in-again tab** (`/sign-in/done` with `resume`)
- Title: "Signed in again"
- Text: "Go back to the tab you were working in. Your text is there. You can close this tab."
- Link (only for a valid `next`): "Open the page here instead (it shows what was last saved)"

**The sign-in notice with `resume=1`** (`app/sign-in/notice.tsx`, after the reason's text)
- "Sign in here, then go back to the tab you were working in."

**The 12-hour notice** (dialog)
- Title: "Your session ends in 10 minutes"
- Text: "Sessions last 12 hours and cannot be extended. Save your work now, or sign in again here to start a new session. This page and your text stay as they are."
- Buttons: "Sign in again" (primary), "Close" (outline).
- The status line afterwards: "Session ends in {counted(n, 'minute')}. Save your work, or sign in again." (the button "sign in again" opens the sign-in dialog).

**Leaving with unsaved text** (in-page dialog for links)
- Title: "Leave this page?"
- Text: "Your unsaved text on this page will be lost."
- Buttons: "Stay on this page" (primary), "Leave" (outline).

**Replacing typed text** (`VersionForm`)
- Code-built draft: "Replace your unsaved text with the code-built draft? What you typed is not saved." Buttons: "Write the code-built draft", "Keep my text".
- Model draft: "Replace your unsaved text with the model's draft? What you typed is not saved." Buttons: "Draft with the model", "Keep my text".

**Saving did not go through, in place** (notices above the form; the page stays visible)
- `NOT_SENT_MESSAGE`: "This was not saved: the connection failed or the server did not answer. What you typed is still here. Try again."
- Terms: "New terms of use must be accepted before you can save. What you typed is still here." Link: "Read and accept the terms (opens a new tab)". Then: "Then save again."
- Maintenance: "The service is down for maintenance, so this was not saved. What you typed is still here. Save again when it is back." Link: "See the maintenance notice (opens a new tab)".
- Error boundary below the guard (`app/p/[practiceId]/error.tsx`): "This page could not be shown. Your unsaved narrative is kept. Try again." Button: "Try again".

**Form fallbacks** (`ActionState.error`, shown only if the lock cannot show)
- `SIGNED_OUT_MESSAGE`: "You were signed out, so this was not saved. Sign in again; what you typed is still here."
- `SESSION_CHANGED_MESSAGE`: "Your session changed in another tab, so this was not saved. Choose Continue above; what you typed is still here."
- `guardMessage`'s CSRF text outside practice pages stays as it is.

**Paused polls** (`ExportStatus`, receipts)
- "Updates paused after 5 minutes without activity. They resume when you return, or choose Check again."

---

## 6. Accessibility

- **Dialogs** (`role="alertdialog"`, `aria-modal="true"`, `aria-labelledby` the title, `aria-describedby` the text):
  focus moves to the primary button on open and is held inside; the page behind is `inert`. On close, focus returns to
  where it was. The idle warning ignores Esc; the 12-hour notice and the leave dialog close on Esc (Esc never renews
  and never leaves).
- **Countdowns** are not announced every second. A polite live region updates at each minute mark and at the last
  minute. The visible number updates at the same marks. No animation; `prefers-reduced-motion` needs nothing more.
- **The lock screen** is a `main` region with an `h1` that takes focus (`tabIndex={-1}`). Its buttons follow in order,
  operable by keyboard, with `--pw-focus` visible. Nothing behind it is reachable. The new-tab link says "(opens a new
  tab)" in its visible text.
- **The sign-in dialog** keeps the person in one tab, so a screen-reader user never has to find another tab and come
  back. Focus goes to its first field; errors are announced as on the sign-in page; on success focus returns to where
  it was before the lock.
- **After restoring**, focus returns to the element focused before the lock (the editor, normally), and the status is
  announced politely.
- **390 px:** dialogs are full-width with a 16 px gutter; buttons stack full-width, primary first. No horizontal
  scroll. Checked in the screenshots (section 11).
- **Colour:** tokens only; the destructive button uses the destructive token; no meaning by colour alone.
- **axe** runs on the dialog and lock states in the new e2e spec (`apps/web/e2e/a11y.ts`).
- **WCAG 2.2:** 2.2.1 met for the idle limit (warn, extend with one action, unlimited); for the 12-hour limit the
  design relies on advance notice and 2.2.5, and records the essential-exception reading as a judgment (section 4.8).
  2.2.5 met (re-authenticating, in place, loses nothing). 2.2.6 met (no data is lost to inactivity, and the warning
  says so). Recorded in ADR 0076 as the manual checks audit #103 asks for.

---

## 7. Tests

**Unit** (vitest, pure; apps/web has no jsdom, so no component logic depends on one)
- `lib/session/clock.test.ts`:
  - warns at 25 minutes and locks at 30 minutes after `min(lastContact, lastActivity)`;
  - activity in `warning` does not renew; only `renewed` does;
  - touches at most once per 5 minutes, with the trailing touch; the lock still comes 30 minutes after the last input,
    not 35;
  - a contact from another tab moves the deadlines; an older one does not;
  - the 12-hour notice at end − 10 minutes, the lock at the end, attended false from end − 60 seconds, and no event
    ever moves `endsAt` later except `renewed` from a new session;
  - a refused action locks with its reason; `rate_limited` and `maintenance` touches never lock; `restored` returns to
    `active`;
  - the draft hold expires 12 hours after the lock.
  - A property-style test over 2,000 seeded random event sequences (a small seeded generator in the test file:
    `fast-check` is not a dependency of apps/web, and `apps/web/package.json` and `pnpm-lock.yaml` are #42 files):
    the guard never locks later than the server would (the server's deadline computed from the same requests), never
    locks later than 30 minutes after the last input, and never touches twice within 5 minutes. The generator
    includes the events "navigation served from the router cache, no request" (no contact for the client, none for
    the server: no late lock) and "a `/p` layout mounted by soft navigation in a document hours old, with recent
    activity" (no false lock: the clock started with the document).
- `lib/session/limits.test.ts`: the idle limit equals `SESSION_LIMITS.idleMinutes` and the migration's
  `interval '30 minutes'` (read from `20261015170000_identity_and_permissions.sql`).
- `lib/session/channel.test.ts`: the schema accepts the seven kinds and refuses any extra field. A test fails if a
  message type gains a string field other than `marker` and `userMarker`. The receiver's decision table: another user
  marker drops and reloads; the same user marker locks `changed`; a hello whose marker equals a recent `signed_in` is
  ignored.
- `lib/session/return-path.test.ts`: registered `/p/` patterns pass; `//evil`, `/\evil`, `/p/../x`, a query, an
  encoded slash, an unregistered path, a 513-character path and a non-opaque segment fail. The module is
  `server-only` (a test imports it under the client condition and expects the throw).
- `lib/auth/session-view.test.ts`: the view opens only with a matching marker; a tampered or expired seal is null; the
  user marker differs from the session marker for the same input, and from another user's.
- `lib/http/next-action.test.ts` (new; `http.test.ts` is a #42 file), with `next/headers` and `next/navigation`
  mocked by `vi.mock`: a practice action with `unauthenticated` returns `{ session: 'signed_out' }` and never calls
  `redirect`; `csrf_refused` returns `changed`; `mfa_required` and `hardware_key_required` return `step_up`;
  `terms_required` and `maintenance` return `blocked` with `blockedBy`; a non-practice action still redirects on each;
  `runSignInStepInPlace` maps each step's redirect to its step and never calls `redirect`.
- `components/session/guarded-action.test.ts`: the wrapper turns a rejected action (a `TypeError: fetch failed`, a 502)
  into `{ notSent: true }`, and re-throws Next's redirect and not-found signals.
- `components/forms.test.ts` (new, static, section 4.9): every `<form` names its method; a GET form is on the list and
  holds no textarea; `ActionForm` and `VersionForm` under the guard render `method="post"`, a function action and
  `autoComplete="off"`; every `textarea` under the guard has `autoComplete="off"` and `spellCheck={false}`.
- Static markup (`renderToStaticMarkup`, as `version-form.test.tsx` does): the lock screen, the warning, the 12-hour
  notice and the sign-in dialog render their roles, labels, headings and words; the new-tab link is an `<a
  target="_blank" rel="noopener noreferrer">` with "(opens a new tab)"; `lint:copy` passes over `lib/session/words.ts`.

**Route and database** (`pnpm test:db`)
- `lib/routes/account-routes.db.test.ts` (new): `GET /api/session` returns the caller's user, 1800 idle seconds, the
  12-hour remainder from Postgres and both markers; refuses a fetch whose `Sec-Fetch-Site` is `cross-site`, and
  answers one with no header or `same-origin`; renews `last_seen_at` (the touch is the point); writes no audit event;
  carries `private, no-store`.
- The generated per-route tests (`route-tests/define.ts:70-78`) cover the new route's persona, idle, ended and expired
  cases with no edit, and pass (their harness sends no `Sec-Fetch-Site`). `registry.test.ts` passes unedited with the
  new handler route and the new `sign_in.done` page route (`:135-148`). Both are run in the PR, not assumed.
- `lib/routes/sign-in-routes.db.test.ts` (exists; cases added): `next` survives the password, code and hardware-key
  steps inside `Pending`; an invalid `next` goes to `/`; a practice the new user cannot reach goes to `/`; every
  `signed_in` redirects to `/sign-in/done`; `/sign-in/done` without the one-time value, or cross-site, redirects to
  `/`; an earlier live session on the same browser is ended with `end_reason = 'signed_out'` and one
  `session_replaced` event with `purpose = 'replaced'`; `clearSession` clears `tp_sign_in`.

**End to end** (Playwright; new `apps/web/e2e/session-lock.spec.ts`; the packets journey's personas
`packet-drafter` and `packet-approver`, no new persona, no change to `e2e/prepare.ts` or `env.ts`, both #42 files)
- `page.clock.install()` before the first navigation. The browser's clock is fast-forwarded with
  `page.clock.fastForward()`. The server's clock is moved as SEC-15's test does (`last_seen_at` back 31 minutes,
  `sign-in.spec.ts:64-84`).
1. **CAS-35, the narrative survives.** Type a narrative, choose a prompt-pay state and an attachment. Fast-forward
   25 minutes: the warning shows in two tabs. Fast-forward 5 more and move `last_seen_at`: both tabs lock; the page's
   text is not visible, not in the accessibility tree, not found by `page.getByText`, and every text control's DOM
   value is empty. Choose "Sign in again": the dialog opens in the same tab; sign in with password and code; the page
   shows the text, state and attachment. Save: Version 2 holds the text. Then:
   - the same with the save pressed after expiry (no lock beforehand): the lock appears, and the text survives;
   - the new-tab fallback: the link opens a tab, sign in there, `/sign-in/done` broadcasts, the first tab restores;
   - **network:** abort the save's action request with `page.route(..., route => route.abort())`, then answer it with a
     502: "not saved" shows each time and the text is still there; the next save goes through;
   - **maintenance and terms:** switch maintenance on while typing, save: the notice shows, the page does not navigate,
     the text is there; switch it off, save, Version 2. The same with new terms published;
   - **no JavaScript:** a context with `javaScriptEnabled: false` submits a case note; the request is a POST, and no
     URL in the history or the server's request log holds the typed word.
2. **CAS-36, activity and warnings.** Typing renews at most once per 5 minutes (count requests to `/api/session` with
   `page.on('request')`). An idle page with a live export stops refreshing after 5 minutes, and `last_seen_at` stops
   moving. "Stay signed in" renews and closes the warning in both tabs. Moving `expires_at` to 11 minutes away shows
   the 12-hour notice 1 minute later, and nothing moves `expires_at`. Then:
   - **12-hour end with a live export:** move `expires_at` to now while typing: the page locks with `expired`, never
     navigates, and the text survives;
   - **soft navigation in an old document:** open `/` (or `/settings`), keep typing in a field there for 40 minutes of
     fast-forward with touches, then follow a link into a packet page: no lock at mount;
   - **Back from the cache:** on a packet page, navigate in-app to another `/p` page, go idle 29 minutes, press the
     browser's Back (`page.goBack()`): the page still locks at 30 minutes after the last input, not later.
3. **CAS-37, another user and sign-out.**
   - Drafter types in tab 1; in tab 2 of the same context, sign out and sign in as the approver: before any click in
     tab 1, the drafter's text is gone from tab 1's DOM (`page.content()` holds no typed word) and tab 1 has reloaded;
     the approver's packet page shows the saved version only.
   - **Same tab:** the drafter is idle on `/p` until the lock; sign in as the approver in the in-place dialog: tab 1
     reloads to `/` and holds no typed word. Separately, let the drafter's page redirect to sign-in through a page
     load, sign in as the approver in that tab, press Back twice: no drafter text or PHI page appears.
   - Sign out with unsaved text in another tab: every tab reloads to sign-in; Back shows no PHI page.
   - **The guard's own reloads are not blocked:** with a dirty form, each of the sign-out broadcast, another user's
     hello and the 12-hour draft hold reloads the tab without a `beforeunload` dialog (`page.on('dialog')` never
     fires).
4. **Security checks in the same spec**, after each scenario: `localStorage.length === 0`, `sessionStorage.length ===
   0`, `indexedDB.databases()` is empty, `caches.keys()` is empty, and no cookie value contains any typed word.
   Every broadcast is captured with `page.exposeFunction` on a test-only listener and holds no typed word. No request
   URL seen by `page.on('request')` holds a typed word.
5. **Return path.** A page load after idle redirects to `/sign-in?reason=idle&next=%2Fp%2F...`; signing in lands on that
   page through `/sign-in/done`. A tampered `next` lands on `/`.
6. **Keeping typed text on refusal.** A case note refused (empty required field elsewhere, or a forced CSRF failure)
   keeps its text. This proves React's reset no longer clears practice forms.
7. **axe** on the warning, the lock, the sign-in dialog, the 12-hour notice and the leave dialog, at 1280 and 390 px.

**The existing SEC-15 e2e test** (`apps/web/e2e/sign-in.spec.ts:64-84`) keeps its assertions but its URL patterns
gain the return path: `/\/sign-in\?reason=idle&next=%2Fp%2F[0-9a-f-]+$/` and, for the ended call,
`/\/sign-in\?reason=ended&next=.../`. The no-session test (`:86-91`) becomes `/\/sign-in\?next=.../`. These are
stronger assertions, not weaker ones. `sign-in.spec.ts` is not a #42 file.

**The shared sign-in helper** (`apps/web/e2e/helpers.ts`, not a #42 file): `signInWithTotp` waits for
`url.pathname !== '/sign-in/mfa'` (`helpers.ts:47`), which `/sign-in/done` would satisfy for a moment before its
`location.replace`, so every journey could race. It changes to wait for a path outside `/sign-in` (as `signInWithKey`
already does, `:80`), keeping its refusal race. Every other spec's URL expectations wait for the final page and need
no change; the full e2e suite runs in the PR to prove it.

---

## 8. Rows

**`docs/product/test-matrix.md`**, three rows added after CAS-34, which #38 adds (add only; a #42 file):

```
| CAS-35 | Narrative typed past the idle limit on a packet | The page locks in place 30 minutes after the last input with nothing readable and never navigates; after the same person signs in again in place, the narrative, prompt-pay state and attachments are still there and save as the next version; a save that fails on the network, a server error, maintenance or new terms keeps the text; no form sends typed text in a URL; nothing is written to browser storage |
| CAS-36 | Activity, warnings and polls on a PHI screen | Typing or clicking renews at most every 5 minutes, shared across tabs; the 25-minute warning's Stay signed in renews and nothing else in the warning does; no status check, poll or notice renews without input; no poll navigates the page away at the 12-hour end; the 12-hour limit warns 10 minutes before and never extends |
| CAS-37 | Another sign-in or a sign-out on the same browser | A different user's sign-in drops every earlier page's unsaved text before any click, shows them none of it, leaves nothing of it in that tab's memory or history and ends the earlier session; a sign-out drops every tab's unsaved text; sign-in returns only to a registered page the new user can reach |
```

**`packages/synth/src/cases/matrix.ts`**, the same three rows word for word after CAS-34
(`packages/synth/src/fixtures.test.ts:33` enforces it).

**`packages/synth/src/cases/registry.ts`**, after `'CAS-34'`:

```ts
  // Combined audit #48 (docs/adr/0076): session behaviour on a packet; no file.
  'CAS-35': none(8, 'A narrative typed in the browser past the idle limit: a session and page property, no file.', [
    'apps/web/src/lib/session/clock.test.ts',
    'apps/web/src/lib/http/next-action.test.ts',
    'apps/web/src/components/forms.test.ts',
    'apps/web/e2e/session-lock.spec.ts',
  ]),
  'CAS-36': none(8, 'Activity and the session clock: no file.', [
    'apps/web/src/lib/session/clock.test.ts',
    'apps/web/src/lib/session/limits.test.ts',
    'apps/web/src/lib/routes/account-routes.db.test.ts',
    'apps/web/e2e/session-lock.spec.ts',
  ]),
  'CAS-37': none(8, 'Two sign-ins on one browser: no file.', [
    'apps/web/src/lib/session/channel.test.ts',
    'apps/web/src/lib/session/return-path.test.ts',
    'apps/web/src/lib/routes/sign-in-routes.db.test.ts',
    'apps/web/e2e/session-lock.spec.ts',
  ]),
```

(The builder keeps the exact test file names in step with what is written.) `pnpm synth` writes
`fixtures/synthetic/CAS-35/expected.json` to `CAS-37`, as for CAS-28 and CAS-29. Committed.

**IDs.** #38's design (`lane-b-figures-in-words.md:7-10`) takes CAS-30 to CAS-34 and leaves CAS-35 to CAS-37 to this
PR, so the rows sit right after #38's. Session behaviour would sit naturally in SEC, but SEC
IDs are not reserved and #42 adds SEC-18 and SEC-19, so CAS it is. SEC-15's row stays as it is.

**`docs/product/reconciliation-001.md`**, rows added only:
- No ruling sub-bullet. The design changes no response header (`Clear-Site-Data` was dropped in review, section
  4.11), so "The response headers from ADR 0053 and 0055 change only as D7 allows" (`:472`) holds as written and asks
  nothing of the owner.
- In the PR order, if #38's PR added a Lane B line there, one line beside it for this PR. Otherwise none.

---

## 9. Documents

- **ADR 0076** (`docs/adr/0076-keep-unsaved-work-in-the-open-page-only-lock-it-in-place-at-the-idle-limit-and-sign-in-again-without-leaving-it.md`).
  It records: the problem; the four storage options and the decision (section 3); the in-place lock and why hidden,
  not unmounted, and the blanked controls while locked; what is outside the product's control (the browser's
  session-restore form state, extensions); `autoComplete` and `spellCheck` off on PHI text; the browser clock, started
  with the document, counting only observed contact, and why there is no status call (SEC-15, no migration); the bound
  "the server ends a session 30 minutes after its last request; the screen locks 30 minutes after the last input";
  the touch route as a read with no audit event, and that its cross-site check keeps the answer from other sites but
  does not prevent the touch; the two markers and the view cookie; re-authentication in place, with the new tab as
  the fallback; every sign-in ending in a full document load; the return path rules; why there is no
  `Clear-Site-Data`; the polls and the guarded refresh; saves that never navigate (session, step-up, terms,
  maintenance, network); that dropping a draft on revocation is best effort, bounded by `DRAFT_HOLD_MS`; that a
  replaced session's `end_reason` reads `signed_out` and the `session_replaced` event's `purpose: 'replaced'` tells
  them apart; WCAG 2.2.1 for the idle limit, 2.2.5 and 2.2.6, and the 12-hour essential-exception reading as a
  judgment; the PRD:256 reading; "Revisit when": drafts lost to crashes reported (then a server-side encrypted draft,
  a Lane A migration), or the shell can host the guard after #42.
  - **Numbering:** #38 takes ADR 0072 (`lane-b-figures-in-words.md:7-10`); `LANES.md:173-175` give 0073 to
    bank-account-first, 0074 to verified-seal and 0075 to unmapped-plan. This PR takes **0076**, the next number free.
    The orchestrator records it in the claim at `LANES.md:172` before the build starts. If another claim takes 0076
    first, the build takes the next free number and moves the file name and every reference together.
- **`docs/product/sessions.md`**: a new "In the browser" section, citing combined audit #48 and ADR 0076: nothing
  persisted; drafts in the open page only; the warning at 25 minutes and the lock in place 30 minutes after the last
  input (`:19` gains the bound in ADR 0076's words); the 12-hour notice at 11 h 50; no status check; activity renews at
  most every 5 minutes; polls pause after 5 minutes without input; re-authentication in place; the return path; the
  markers. The cookies table gains `tp_session_view`, and `tp_sign_in`'s row gains `next`, `resume` and the
  one-minute `sign-in-done` value. The tests table gains CAS-35 to CAS-37.
- **`.claude/agents/security-reviewer.md`**: one checklist line: "PHI written to browser storage (localStorage,
  sessionStorage, IndexedDB, Cache API), in a BroadcastChannel or postMessage payload, in a URL by a GET form, or left
  visible on a locked or signed-out page; a PHI text field without autoComplete and spellCheck off; a background
  request or refresh that renews a session without input or can navigate a page with typed text away."
- **`docs/policies/data-retention.md`** ("Browser copies: none") is a #42 file: waits (section 13). ADR 0076 says it
  meanwhile.

---

## 10. Files to change, and the builders' split

**Builder 1: the server side** (no UI)
- `apps/web/src/lib/session/limits.ts` (new); `lib/auth/sessions.ts` (re-export `SESSION_LIMITS`; `OpenedSession.userId`; `endReplacedSession` with `purpose: 'replaced'`)
- `apps/web/src/lib/auth/session-view.ts` (new: seal, open, the session and user markers); `lib/auth/pending.ts` (`writeSession`, `clearSession` also clearing `tp_sign_in`, the `sign-in-done` value)
- `apps/web/src/lib/auth/sign-in.ts` (`Pending` carries optional `next` and `resume`)
- `apps/web/src/lib/routes/account.ts` (`sessionTouchRoute`, into `ACCOUNT_ROUTES`); `app/api/session/route.ts` (new)
- `apps/web/src/lib/routes/sign-in.ts` (`reasonParams` `next` and `resume`; the password step's input; `settle` to `/sign-in/done`; the `sign_in.done` public page route in `SIGN_IN_ROUTES`)
- `apps/web/src/lib/session/return-path.ts` (new, `server-only`)
- `apps/web/src/lib/http/next.ts` (`ActionState`, `runAction` with `heldInPlace`, `runSignInStepInPlace`, `signInFor` with `next`, the messages)
- `apps/web/src/app/sign-in/in-place-actions.ts` (new)
- `apps/web/src/proxy.ts` (`x-tp-path`)
- Tests: `limits.test.ts`, `return-path.test.ts`, `session-view.test.ts`, `next-action.test.ts`, `account-routes.db.test.ts`, `sign-in-routes.db.test.ts`.

**Builder 2: the guard** (client)
- `apps/web/src/lib/session/{clock,channel,words}.ts` (new) and `clock.test.ts`, `channel.test.ts`
- `apps/web/src/components/session/{clock-provider,guard,warning,lock,sign-in-dialog,notice,leave,signed-out,guarded-action}.tsx` (new) and `guarded-action.test.ts`
- `apps/web/src/components/hardware-key.tsx` (the `inPlace` mode)
- `apps/web/src/app/p/[practiceId]/layout.tsx`, `app/p/[practiceId]/error.tsx` (new)
- `apps/web/src/app/layout.tsx` (mount `SessionClock` with the view props)
- `apps/web/src/app/sign-in/page.tsx`, `notice.tsx` (the `resume` line; `<SignedOut />` on every landing), `app/sign-in/done/page.tsx` (new)
- `apps/web/src/components/action-form.tsx` (`useSessionRefusal`; `method="post"`, the function action kept, `onSubmit` without reset, `autoComplete="off"` inside the guard; `guardedAction`)
- `apps/web/src/components/packets/export-status.tsx`, `components/uploads/receipts.tsx`, `components/uploads/uploader.tsx` (`useAttended`, `useGuardedRefresh`)
- `apps/web/src/components/forms.test.ts` (new, static) and static-markup tests for the lock, warning, notice and sign-in dialog.

**Builder 3: the packet, the rows and the documents**
- `apps/web/src/components/packets/version-form.tsx` (controlled select and checkboxes; `method="post"` with `writeDispatch` kept; `autoComplete="off"`; the narrative copy; the two confirmations; `useSessionRefusal`; `guardedAction`; `ownerId`)
- `apps/web/src/components/packets/narrative-editor.tsx` (`autoComplete="off"`, `spellCheck={false}`; start from the copy; the newer-version notice)
- The other free-text controls under `/p` (`spellCheck={false}`, `autoComplete="off"`), found by `forms.test.ts`. The support-access page (a #42 file) has no `textarea`, and its `ActionForm` gets `autoComplete="off"` from the component, so that file stays untouched
- `apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx` (pass `viewerId` and `notice` to `VersionForm`)
- `apps/web/e2e/session-lock.spec.ts` (new); `apps/web/e2e/sign-in.spec.ts` (the URL patterns); `apps/web/e2e/helpers.ts` (the post-sign-in wait, section 7)
- `docs/adr/0076-...md` (new), `docs/product/sessions.md`, `.claude/agents/security-reviewer.md`
- Rows: `docs/product/test-matrix.md`, `docs/product/reconciliation-001.md` (PR order line only, if any), `packages/synth/src/cases/{matrix,registry}.ts`; `fixtures/synthetic/CAS-35..37/expected.json` (generated)

Order: Builder 1 first (the contract types in `next.ts`, `limits.ts` and `session-view.ts`), then 2 and 3 in parallel.

**#38's files.** #38 touches packet review and line-trace rendering. This design changes neither the review page
(`[versionId]/review/page.tsx`) nor `lines/[lineId]/page.tsx`. The packet page (`packet/page.tsx`) gets two props; if
#38 changed it, the change is merged on top after #38 lands.

---

## 11. Reviews

- **Security reviewer** (default workflow agent given `.claude/agents/security-reviewer.md`, with the new line): no
  PHI in any store, broadcast, URL, cookie, log or error; no GET form with typed text; the lock hides and blanks
  everything; another user's sign-in drops the text before any click and leaves nothing in memory or history; the
  in-place sign-in dialog (the step routes' own rate limits, lockout and audit, nothing new); `/sign-in/done`'s
  one-time gate; the touch route's scope, cross-site refusal and rate limit; the return path (open redirect, PHI in
  URL); the replaced-session end; the polls and the guarded refresh; no response header changed.
- **UX and brand reviewer** (the brief's step 2, `lane-b-ux-review-brief.md:96-104`): before and after screenshots at
  1280 and 390 px, light and dark, with `/home/user/ops/tools/lane-b-screen-tour` on the packet page, the sign-in page
  with `resume=1`, and `/sign-in/done` with `resume`; plus the warning, the lock (each reason, with and without unsaved
  text), the sign-in dialog (each step, and the full-page fallback), the 12-hour notice, the leave dialog, the two
  confirmations, the not-sent, terms and maintenance notices, the practice error page and the paused-poll line. The
  narrative with `spellCheck` off is checked for how it reads. The timed states need the clock:
  the e2e spec saves them as test artifacts (never committed; published in the private gallery with the tour's).
  Checked against the brand rules and the copy lint.
- The pipeline's two adversarial reviews: one is the UX and brand review (a visible change), the other the security
  review.

---

## 12. Checks

- **No migration.** `resolve_session()` and every table are unchanged. The touch route reads `user_session` under the
  existing self policy; `endReplacedSession` writes `ended_at` and `end_reason`, which `tp_app` may already update
  (`20261015170000:485`), with a value the existing CHECK allows (`:220`). `domain-model.md` is not regenerated.
- **No #42 file** except rows in `test-matrix.md`, `reconciliation-001.md`, `matrix.ts` and `registry.ts`. Not
  touched: `shell.tsx`, `lib/routes/{index,practice,settings}.ts`, `registry.test.ts`, `lib/server/{config,services}.ts`,
  `lib/http/rate-limit.ts`, `components/help.ts`, `packages/observability/src/fields.ts`, `e2e/{env,prepare}.ts`,
  `pnpm-lock.yaml`, `data-retention.md`, `app/p/[practiceId]/support-access/**`. No longer changed at all (not a #42 file):
  `next.config.ts`. Read only: `index.ts` (`ROUTES` for the return path), `services.ts`.
- **No new dependency.** Playwright 1.56.1 has `page.clock`; Zod is already a dependency. No `fast-check` in apps/web (section 7). `apps/web/package.json` and `pnpm-lock.yaml` (#42) unchanged.
- **Headers:** none changed (`Clear-Site-Data` dropped in review, section 4.11). CSP unchanged. No owner question.
- **Logs:** no new log field; the touch route logs what every route logs (IDs). `pnpm lint:logs` passes.
- **SEC-15:** its three tests pass (the e2e one with the return path added); the generated per-route tests and
  `registry.test.ts` pass unedited with the touch route and the `sign_in.done` page (run, not assumed).
- **No form sends typed text by GET**, and every PHI text field carries `autoComplete` and `spellCheck` off
  (`forms.test.ts`).
- **Cross-tenant and catalog tests:** unchanged, pass.
- **Copy:** `pnpm lint:copy` passes; every count uses `counted()`.
- **No model name in any file.**

---

## 13. What waits for #42, and the way around it

| Waits | Why | Meanwhile |
| --- | --- | --- |
| A confirmation at the shell's Sign out button when a page holds unsaved text | `components/shell.tsx:97-102` is a #42 file | A shell sign-out discards the draft without asking (a deliberate act). Follow-up: add `data-sign-out` to that form and let the guard's capture-phase submit handler ask, as it does for links. |
| The guard inside AppShell, for any future PHI page outside `/p` | `shell.tsx` | Every PHI route is under `/p` today, which the layout covers in full. |
| "Browser copies: none" in the retention schedule | `docs/policies/data-retention.md` is a #42 file | ADR 0076 and `sessions.md` state it. |
| A dedicated rate bucket for the touch | `lib/http/rate-limit.ts` | The existing `mutation` bucket (120 a minute per user); the guarded refresh touches only while text is unsaved, and a `rate_limited` touch never locks. |

None of these blocks the PR.

---

## 14. Choices (each took the recommended option)

Recorded under the co-founder's ruling of 2026-10-26 ~00:20 UTC (security and cost trade-offs: the safer option, no
question asked) and his wording delegation (2026-10-25 ~21:34 UTC). Each goes in the PR description and Lane B's log.

| # | Choice | Taken | Why |
| --- | --- | --- | --- |
| N1 | Where the draft lives | (a) the open page's memory only | Safest; meets the audit, the workforce policy and the retention schedule; loses nothing to a sign-out (section 3) |
| N2 | Lock by unmounting or hiding in place | Hide in place (`hidden` + `inert`), controls blanked into memory while locked, hidden from `pagehide` | Keeps every field and upload; equal confidentiality, since the heap holds the same text; no typed text in session-restore data overnight |
| N3 | Status check | None: a browser clock started with the document (root layout), counting only observed contact, locking 30 minutes after the last input | No migration; the warning can never renew; the client can only lock early; no false lock on a soft navigation into `/p` |
| N4 | Touch route | `GET /api/session`, self route, no audit event, `mutation` rate bucket, refuses only a browser that names another site | A read, as every page load is; no event flood; the generated route tests pass unedited |
| N5 | Session identity for the page | Sealed HttpOnly view cookie plus two HMAC markers (session, user), no database read in the layout | Keeps SEC-15's observable reasons; nothing forgeable; tells "same person" from "someone else" with no request |
| N6 | How to sign in again | In place, in a dialog over the lock, through the existing step routes; a plain new-tab link as the fallback for full-page steps | The tab never unloads, so a phone's tab discard or a screen reader's tab switch loses nothing |
| N7 | Another user | Drop the draft and reload at the first hello or `signed_in` that names another user, before any click; every sign-in ends in a full document load | No earlier user's text is ever shown to, kept near or saved by another, in any tab or in history |
| N8 | How long a locked tab keeps a draft | 12 hours after the lock | Covers an overnight return; no forgotten PHI for days |
| N9 | A save that cannot go through | Practice actions return a lock or notice for every refusal that used to redirect (session, step-up, terms, maintenance); a client wrapper turns a network failure or server error into "not sent"; an error boundary below the guard | The text stays in every case; other areas unchanged |
| N10 | React's form reset | `onSubmit` without reset on top of the kept function action and `method="post"`, inside the guard | A refusal no longer clears typed text, and a form can never fall back to a GET that puts PHI in a URL |
| N11 | Return after sign-in | `next` path, validated twice on the server, carried in the sealed `Pending`, only to a reachable practice, through `/sign-in/done` | Audit's "returns to where they were"; no open redirect; no PHI in the URL; no new cookie |
| N12 | Earlier session on a new sign-in | Ended on the server, audited | An overwritten token can never be reused |
| N13 | Sign-out cleanup | Broadcast (gated), hard reload on every sign-in landing; no `Clear-Site-Data` | Clears heap, router cache and bfcache; changes no header, so asks the owner nothing; the header stays a question for the owner if ever wanted |
| N14 | Background polls | Pause 5 minutes after input, at the warning, at the lock and from the 12-hour end minus 60 seconds; touch before a refresh while text is unsaved | Closes an existing SEC-15 gap; no poll navigates typed text away |
| N15 | Discarding typed text on purpose | Confirm first (code draft, model draft, links, reload) | No silent loss |
| N16 | Row IDs | CAS-35 to CAS-37 | Reserved range, from the top |
| N17 | ADR | 0076 (#38 takes 0072; 0073 to 0075 are claimed) | Sets the first rule on PHI in the browser and records WCAG 2.2.1 and 2.2.5 |
| N18 | Wording | Section 5 as written | Brand rules, copy lint, `counted()`, a next step in each |
| N19 | Server-side encrypted draft | Not now; recorded in "Revisit when" | Needs a migration; the item's best option says database no |
| N20 | Spell check and form history on PHI text | `spellCheck={false}` and `autoComplete="off"` on every free-text control under the guard (raised from improvement 7 in review) | Typed PHI never reaches a spell-check vendor or form history; the spelling-help cost is accepted under the safer-option ruling and checked by the UX review |
| N21 | A replaced session's record | `end_reason = 'signed_out'` with a `session_replaced` event, `purpose: 'replaced'` | No migration; the access log tells them apart |

---

## 15. Risks

- **A crash, a closed tab or a reload the person confirms loses unsaved text.** That is the price of storing nothing
  (N1). The leave warning makes it a choice. Recorded in ADR 0076.
- **The browser may discard a background tab under memory pressure** (Chrome's Memory Saver, iOS). Re-authenticating
  in place (N6) means the person never has to leave the tab to sign in again, which was the common case. A tab
  discarded while the person works elsewhere still loses its text. Same cost as above.
- **The browser's own session-restore files** may hold form state captured while the person typed. Outside the
  product's control; the lock blanks the controls so a locked tab does not keep them there. ADR 0076 states it.
- **Dropping a draft on revocation is best effort** (section 4.9), bounded by `DRAFT_HOLD_MS` and by the next
  sign-in of another user.
- **Clock jumps.** A clock moved forward locks early (safe). A clock moved back delays the lock; the server still
  refuses, the save then locks (N9), and nothing is lost. The hidden-tab case is checked on `visibilitychange`.
- **React keeping state across `router.refresh()`** is relied on. If a page's tree changes on refresh, the narrative
  copy covers the narrative; the e2e test proves the rest.
- **Next's soft redirect after sign-out** keeps the heap until the hard reload in `<SignedOut />` runs. That runs on
  mount on every sign-in landing, before any interaction, and the e2e test checks Back. Sign-in itself always ends in
  a full load through `/sign-in/done`.
- **The in-place sign-in** runs sign-in steps from a `/p` page. It reuses the step routes unchanged, so their rate
  limits, lockout, audit and CSRF handling hold; the security review checks that no step's result or error carries
  more than the sign-in page shows.
- **The return path** is an open-redirect and PHI-in-URL surface. Mitigated by two validations, a registered-pattern
  match, opaque IDs only, and the reachability check.
- **The updated SEC-15 e2e patterns** must stay at least as strict as today's (anchored, status 307 kept).
- **Existing sessions at deploy** have no view cookie for up to 12 hours: no 12-hour notice until their first touch,
  and a changed-session Continue reloads instead of restoring. Safe side.
- **ADR number**: 0076 is free today but not yet claimed in `LANES.md`; the orchestrator records it at line 172
  before the build (section 9).

---

## 16. Improvements noted (beyond the item)

Built in this PR:
1. Polls no longer keep an unattended PHI page signed in, and no poll navigates typed text away (section 4.13).
2. A refusal, a network failure, a server error, maintenance or new terms no longer clear typed text on practice
   pages (section 4.9).
3. "Write the code-built draft" and "Draft with the model" ask before discarding typed text.
4. Sign-in returns to the page it interrupted, for every practice page.
5. A new sign-in ends the earlier session on the server.
6. Sign-out clears `tp_sign_in` too, and every sign-in landing reloads the tab to drop PHI from memory.
7. `spellCheck` and `autoComplete` off on every PHI text field (raised to N20 in review).
12. Every sign-in ends in a full document load, so no tab ever carries one user's memory into another's session.
13. A static test that no form can send typed text by GET.
14. The e2e helper `signInWithTotp` no longer races a redirect hop.

Not built, recommended:
8. `docs/policies/workforce-and-device.md:29`: say the product itself never writes PHI to a device's storage, so
   customers get the same promise (after #42 for the retention row).
9. The UX and brand checklist (`.claude/agents/ux-brand-reviewer.md`, when it lands) lists WCAG 2.2.1 for any timed
   screen.
10. A future SEC row for the lock and the polls, once SEC numbering is free of #42's rows.
11. After #42: the shell's Sign out confirmation, and the guard mounted from AppShell if a PHI page ever appears
    outside `/p`.

---

## 17. Design review (one adversarial reviewer)

One adversarial reviewer read the design against the code at 6ddd587. Raw findings:
`/home/user/ops/designs/lane-b-narrative-draft-review.json`. The verdict: sound but not ready, with 1 blocker, 13
majors and 9 minors. Its checks that held: storage (a) is right; no migration; no #42 file; the 105 `runAction` call
sites; `FormKeys` renders `value=`; the `loading.tsx` boundaries stop prefetch. Every finding was checked against the
code before it was applied (`action-form.tsx:64`, `version-form.tsx:118`, `world.ts:606-627`, `csrf.ts:52-59`,
`handler.ts:17-31`, `next.ts:54-75`, `:148-153`, `:177-193`, `export-status.tsx:21-32`, `uploader.tsx:256`,
`registry.test.ts:135-148`, `20261015170000:360-402`, `pending.ts:15-45`, `lib/auth/sign-in.ts:44-50`, `app/error.tsx`
as the only error boundary, `LANES.md:172-175`, `lane-b-figures-in-words.md:7-10`, `e2e/helpers.ts:47`, `:80`,
`rate-limit.ts:41`).

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | Blocker | `onSubmit` without a function action falls back to a GET with PHI in the URL | **Applied** (4.9). `action={formAction}` stays, `method="post"` added, `onSubmit` on top. Static `forms.test.ts` (every form names its method; GET forms only from a list, no textarea) and a no-JS e2e case. Improved: the static check also covers the existing GET filter forms, found by grep. |
| 2 | Major | ADR 0072 is #38's | **Applied, with a different number.** 0074 (the reviewer's suggestion) is claimed by verified-seal and 0075 by unmapped-plan (`LANES.md:174-175`), so this PR takes **0076**. Every reference renamed; the "did not exist" sentence gone; the orchestrator records 0076 at `LANES.md:172`. CAS-35 to CAS-37 confirmed, after #38's CAS-34. |
| 3 | Major | The touch route's cross-site check breaks the generated tests | **Applied** (4.3). Refuses only a present header that is not `same-origin` or `none`, as `sameOrigin()` does. ADR text says the check keeps the answer from other sites and does not prevent the touch. |
| 4 | Major | `Clear-Site-Data` needs owner consent | **Applied** (4.11, 8, 12). Dropped. No header changes, no ruling written into reconciliation-001, no owner question. Recorded as an owner question if ever wanted, with the `missing` cookie condition. |
| 5 | Major | Sign-in is a soft navigation; A's memory survives into B's session | **Applied** (4.7, 4.11). Every `signed_in` lands on `/sign-in/done`, which calls `location.replace`. `<SignedOut />`'s hard reload runs on every sign-in landing. The beacon broadcasts on mount and on marker change. Same-tab e2e with Back twice. |
| 6 | Major | The clock can lock falsely and late; `timeOrigin` is flaky under `page.clock` | **Applied, with a change** (4.3). A pathname change is no longer contact. The clock moved to the root layout (`SessionClock`), so it starts with the document (`Date.now() - performance.now()`) and a soft navigation into `/p` reads a clock already running. The PerformanceObserver part was **not taken**: a resource entry cannot tell a prefetch, which never reaches `loadPage`, from a load that touches, so counting it could make the clock late. Contacts are only touches, action results and guarded refreshes. Property-test events added. |
| 7 | Major | A network failure or server error reaches the root error boundary | **Applied** (4.9). `guardedAction` returns "not sent" and re-throws only Next's redirect and not-found signals; `app/p/[practiceId]/error.tsx` below the guard. e2e with `page.route` abort and a 502. |
| 8 | Major | Maintenance, terms and MFA redirects still lose text | **Applied** (4.9). `heldInPlace` returns `step_up` (locks; the in-place dialog runs the step) or `blocked` with `blockedBy` (notice in place, link in a new tab). e2e for maintenance and terms. |
| 9 | Major | A refresh at the 12-hour end or after an unseen server end navigates away | **Applied** (4.13, 4.8). `useAttended` false outside `active` and from `endsAt - 60 s`; `useGuardedRefresh` touches first and refreshes only on `ok`. Improved: it touches only while text is unsaved, since the touch shares the `mutation` bucket with saves (`rate-limit.ts:41`), and a `rate_limited` touch never locks. e2e at the 12-hour end. |
| 10 | Major | `window.open(..., 'noopener')` always returns null; `window.close()` unreliable | **Applied** (4.7). A plain `<a target="_blank" rel="noopener noreferrer">` with "(opens a new tab)"; `window.close()` is best effort. |
| 11 | Major | Browser form-state restore; `autoComplete` off only on the narrative | **Applied** (4.10, 4.6). `autoComplete="off"` on every guarded form and textarea; `spellCheck={false}` raised to decision N20; ADR states session restore is outside the product's control. Improved: at the lock the guard snapshots and blanks the controls, so a tab locked overnight holds no typed text in session-restore data. Static test. |
| 12 | Major | Another user's sign-in does not drop the text until Continue | **Applied** (4.2, 4.4, 4.11). An opaque user marker (`session-user-marker` HMAC) in the view cookie, touch answer and hello. Another user marker drops and reloads at once with no request; the same user locks with Continue. CAS-37's e2e asserts the text left the DOM before any click. |
| 13 | Major | Restoring through a second tab is fragile on phones and for screen readers | **Applied** (4.7, N6). Re-authentication in place is now the primary path: a dialog over the lock runs the existing step routes through `runSignInStepInPlace` (password, code, hardware key in an `inPlace` mode). The new tab stays as the fallback for full-page steps. |
| 14 | Major | Tests missing | **Applied** (7). All eleven are in: no-JS submit (CAS-35), network abort (CAS-35), maintenance and terms (CAS-35), live export at the 12-hour end (CAS-36), same-tab other user then Back (CAS-37), soft-nav mount in an old document and Back from cache (CAS-36 and the property test), the other user's hello before any click (CAS-37), generated route tests and `registry.test.ts` run (route and database), `forms.test.ts`, and reloads not blocked by `beforeunload` (CAS-37). Improved: `e2e/helpers.ts`'s `signInWithTotp` would race the new `/sign-in/done` hop (`:47`), so it now waits for a path outside `/sign-in`. |
| 15 | Minor | `/sign-in/resumed` needs a registered page route | **Applied** (4.1, 4.7), as `/sign-in/done` (`sign_in.done` in `SIGN_IN_ROUTES`, `loadPublicPage`), which also serves the full-load landing of finding 5. The broadcast is gated on same-origin and a one-time `sign-in-done` value written by `settle()`. |
| 16 | Minor | Status keyed on the HTTP code; 429 unhandled | **Applied** (4.3). Branches on the body's `status` and `reason`; `rate_limited`, `maintenance` and network errors never lock. |
| 17 | Minor | Screen readable up to 35 minutes after the last input | **Applied** (4.4). The idle base is `min(lastContact, lastActivity)`. The ADR and `sessions.md:19` state both bounds. |
| 18 | Minor | `beforeunload` can block the guard's own reloads | **Applied** (4.6). Hide, drop, blank, remove the handler, then `location.replace`; a blocked navigation leaves the tab locked. e2e. |
| 19 | Minor | Revocation reported only once | **Applied in part** (4.9). Best effort, bounded by `DRAFT_HOLD_MS`, stated in the ADR. The optional part is **rejected**: an ended session has no actor, so the self policy shows the touch route nothing, and a SECURITY DEFINER read would be a migration, which Lane B never opens. |
| 20 | Minor | bfcache and wake paint; the same-user hello flickers a lock | **Applied** (4.6, 4.4, 4.8). Hidden from `pagehide`, and on going hidden past the warning with a dirty form. `signed_in` is handled before the `hello` of the same page, and a hello whose marker matches a recent `signed_in` is ignored. Wording corrected. |
| 21 | Minor | `return-path.ts` would pull server code into the client | **Applied** (4.12, 4.7). `import 'server-only'`; the client sends `location.pathname` unvalidated. `next` and `resume` ride in the sealed `Pending`, so there is no `tp_return` cookie. |
| 22 | Minor | The WCAG wording overreaches | **Applied** (4.8, 6, 9). 2.2.5 is the ground for the 12-hour behaviour; the essential-exception reading is recorded as a judgment. |
| 23 | Minor | A replaced session reads `signed_out` | **Applied** (4.11, N21). `signed_out` kept (no migration); `session_replaced` carries `purpose: 'replaced'` (the column's CHECK allows it, `20261015140500:15`); the ADR says so. |

**Rejected:** only the two partial parts above: finding 6's PerformanceObserver, which could make the clock late, and
finding 19's `end_reason` read, which needs a migration. Each finding's other parts are applied.

**What the review changed in the design's verdict.** Still no migration. Still no #42 file except rows in
`test-matrix.md`, `reconciliation-001.md` (the PR order line only) and `matrix.ts` and `registry.ts`. One #42 file is
avoided rather than edited: `app/p/[practiceId]/support-access/**` gets `autoComplete` through `ActionForm`. And one
file is no longer touched at all: `next.config.ts`.
