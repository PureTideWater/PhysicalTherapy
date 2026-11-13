# Queues item 37, hardware-key registry: UX and brand review (five screens, three emails)

Ref `co-001/wip-key-registry` at ad684695, base 1f652b6f. This is a read-only review: nothing was run, no server was started and no file was edited.
**The galleries were not opened from this machine.** Both are private claude.ai artifacts. Every judgement below is either "from markup" (the code at ad684695) or "from the walk's record" (W53's F1 to F19, the focus orders and the refresh notes in `lane-a-key-registry-status.md`). None of it is "seen".
The tokens are in `packages/brand/src/tokens.css`. The e2e spec `apps/web/e2e/key-registry.spec.ts` is on `co-001/wip-key-registry-screens` (07807b33), not on this ref. The Playwright checks proposed below go into that spec.

Abbreviations: KR = `apps/web/src/components/console/key-removal.tsx`, OR = `apps/web/src/components/console/open-registration.tsx`, PG = `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, RK = `apps/web/src/app/sign-in/register-key/page.tsx`, CK = `apps/web/src/lib/routes/console-keys.ts`, W = `packages/auth-mail/src/words.ts`.

## Findings, heaviest first

### U1 (F1, point 33). Blocker for a person; also WCAG 1.3.1 and 1.4.10. Console, every key state, 390 px
- **Evidence (from the walk's record and the markup):** The table is `min-w-[40rem]` inside `ScrollTable` (PG:123-124). The email cell is a plain `td` (PG:136-138) and is not sticky. As loaded, the window shows Email and Role. Scrolled to Actions, it shows a column of identical buttons and no email (`v390-c1-request--focused-by-keyboard`), and the badge is cut ("moval requested", `v390-c3-requested-other--resting--actions-in-view`). At 390 px the Request key removal button is one press. It states no consequence and does not say whose account it acts on.
- **Fix (best option): at narrow widths, render each member as a stacked list item with its actions. Keep the table at `sm` and wider.** One shared `MemberRow` body serves both renders:
  ```tsx
  <ul aria-label="Members" className="flex flex-col gap-3 sm:hidden">
    {members.map((member) => (
      <li key={member.membershipId} data-member={member.email} className="flex flex-col gap-2 rounded-md border p-3">
        <h3 className="text-sm font-medium wrap-break-word">{member.email}</h3>   {/* one level below the card's title */}
        <p className="text-sm text-muted-foreground">{roleName(member.role)}</p>
        <div className="flex flex-wrap gap-1">{/* the same badges, KeyRemovalState */}</div>
        <div className="flex flex-col gap-2">{/* Unlock, End membership, KeyRemovalActions */}</div>
      </li>
    ))}
  </ul>
  <div className="hidden sm:block"><ScrollTable label="Members">…the table, with U2's row header…</ScrollTable></div>
  ```
  `display:none` takes the other render out of the accessibility tree and out of the tab order, so a reader meets only one set of forms. Each `ActionForm` keeps its own `FormKeys`.
- **Verify (Playwright, 390 × 844):**
  - `expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)`.
  - For the member's `li`, after `button.scrollIntoViewIfNeeded()`, the boxes of its `heading` and of each key button both lie within `0..844`.
  - In every state c1 to c5, `getByRole('listitem').filter({ hasText: email })` contains the state badge, and the badge is not clipped (`badge.boundingBox().x + width <= 390`).
- **Scope:** markup only. The fix round can take it if the spec's 390 px project runs with it; otherwise it goes to the queue. It is not a sticky-column patch: a sticky 160 px email column leaves about 200 px for a 170 px button cell and still cuts the badge.

### U2 (F2). Blocker for a person (screen reader); WCAG 2.4.6, 1.3.1, 2.5.3 kept. Console, all states, all widths
- **Evidence (from markup):**
  - `submit="Request key removal"` (KR:79), `"Confirm key removal"` (KR:50), `"Cancel request"` (KR:57), `"Open registration"` (OR:44) and `"End membership"` (PG:160) are the same in every row.
  - The rows have no row header: the email is a `td` (PG:136).
  - The walk recorded 40 buttons with each name.
- **Fix:** keep the visible label at the start of the name and add the account in a visually hidden span. `ActionForm`'s `submit` already takes a `ReactNode`.
  ```tsx
  // PG:136: the email becomes the row header
  <th scope="row" className="py-1 pr-3 text-left font-normal"><span className="block min-w-40 wrap-break-word">{member.email}</span></th>
  // KR:79, KR:50, KR:57, OR:44, PG:160
  submit={<>Request key removal<span className="sr-only"> for {member.email}</span></>}
  submit={<>Confirm key removal<span className="sr-only"> for {member.email}</span></>}
  submit={<>Cancel removal request<span className="sr-only"> for {member.email}</span></>}   // visible words change: "Cancel request" says not what
  submit={<>Open key registration<span className="sr-only"> for {email}</span></>}
  submit={<>End membership<span className="sr-only"> of {member.email}</span></>}
  ```
  The accessible names become "Request key removal for key-removal-member@synthetic.test", and so on. Each name contains its visible label (2.5.3). `RefusalSummary` gets the same node, so a refusal also names the account.
- **Verify (Playwright):**
  - `await expect(page.getByRole('button', { name: 'Request key removal for key-removal-member@synthetic.test', exact: true })).toHaveCount(1)`
  - `await expect(page.getByRole('button', { name: 'Request key removal', exact: true })).toHaveCount(0)`
  - `await expect(page.getByRole('rowheader', { name: 'key-removal-member@synthetic.test' })).toBeVisible()`
  - The same pattern holds for Confirm, Cancel removal request, Open key registration and End membership.
- **Scope:** small and safe for the fix round. Update the spec's existing selectors in the same change.

### U3 (F3). WCAG 2.4.3 and 4.1.3. Console: Request, Cancel and Confirm succeed, 1,280 and 390 px
- **Evidence:** Each route returns `redirect: /console/organizations/<id>` (CK:55, 70, 88, 110). Next remounts the page and focus falls to the body (from the walk's record). Nothing announces the row's new state.
- **Fix:**
  1. The three redirects point at the member: `${redirectTo(organizationId)}#member-${membershipId}`. That is an opaque ID, not PHI, and no state is carried. Add `membershipId` to the three hidden inputs and to the Zod inputs. The route input changes, but no database name does.
  2. Each member's key-state paragraph gets `id={`member-${membershipId}`}` and `tabIndex={-1}`.
  3. A small client effect focuses that element when `location.hash` names it. The paragraph's text then gives the new state, for example "Key removal requested by you at 2026-11-12 20:43 UTC. Another platform administrator confirms it."
  4. A Back or refresh that lands on the hash only moves focus again. No notice replays.
- **Verify (Playwright):** after Request, `await expect(page.locator('#member-' + id)).toBeFocused()` and `toContainText('Key removal requested by you')`. The same after Cancel ("No key removal stands") and after Confirm ("Keys removed at").
- **Scope:** fix round.

### U4 (F3, F4). WCAG 2.4.3 and 4.1.3. Code screen: the right code, 390 and 1,280 px
- **Evidence:** RK:36 shows the ordinary first-registration description after the code. It says nothing about a code being accepted, and focus goes to the body (from the walk's record).
- **Fix:**
  - The loader (`apps/web/src/lib/routes/sign-in.ts`, `registerKeyPage`) returns `afterRemoval: true` when the step passed a code. RK then reads: "Code accepted. Connect your new hardware key and press Register hardware key; then sign in with it. Your password and authenticator code alone open nothing for this account."
  - `StepHeading` (the h1) takes focus on mount when `afterRemoval` is true. This is state, not a notice, so it stays true on refresh.
- **Verify (Playwright):** after the right code, `await expect(page.getByRole('heading', { level: 1 })).toBeFocused()` and `await expect(page.getByText('Code accepted.')).toBeVisible()`.
- **Scope:** fix round.

### U5 (F8, points 36 and 46). WCAG 2.4.3 and 2.4.6, plus a false or missing next step. Console, code panel shown and after a reload
- **Evidence (from markup):**
  - OR:33: the panel is `tabIndex={-1}` with `role="group"` and no heading. Once focus leaves it, no Tab stop and no heading leads back to it.
  - OR:38 says "It is shown once" but gives no next step for a lost code.
  - KR:67, after a reload: "The code was shown once to the administrator who opened it." Again no next step.
  - The database refuses a second opening within the hour (`hardware_key_registration_open_once`), and the runbook says to wait the hour out (point 46).
- **Fix:**
  - At OR:34, `<p className="font-medium">` becomes `<h3 className="text-sm font-medium">Registration code for {email}</h3>`. Keep the group's `aria-label`.
  - Add a last child: `<Button variant="outline" onClick={() => setOpened(null)}>Hide the code</Button>`. It is a real Tab stop. It ends the display deliberately, and focus then moves to the row's state paragraph (U3).
  - Add to OR:38: "If the code is lost, it cannot be shown again, and registration cannot be opened again until {utc(until)}. Then open it again for a new code."
  - KR:67 becomes: "Registration of a new key is open until {time}. The code was shown once to the administrator who opened it. If it was lost, open registration again after {time}."
  - Do not add a copy button: the code would go to the clipboard, and the rules allow no store.
- **Verify (Playwright):** Tab from the panel reaches "Hide the code"; `getByRole('heading', { name: 'Registration code for …' })` is visible; after a reload, `toContainText('open registration again after')`.
- **Scope:** fix round.

### U6 (point 37). Should fix by the baseline (a state's words match the record). Console, requested, the other administrator
- **Evidence:** KR:48 ends "It cannot be undone." A new registration mends the account. Only the removed keys cannot be restored.
- **Fix:** KR:48 becomes: "Confirming removes every hardware key of {email} and ends their sessions at once. They cannot sign in until an administrator opens registration and they register a new key; the removed keys cannot be restored."
- **Verify:** a unit test on `KeyRemovalActions` (not mine, not self): the text contains "cannot be restored" and not "cannot be undone".
- **Scope:** fix round.

### U7 (F9). Should fix (a false next step; PRD.md:256). Console: Cancel after a confirmation, Confirm after a cancel
- **Evidence:**
  - CK:34 and CK:108 give "this removal is already decided; reload the page" for both cases. For Confirm, "decided" means cancelled.
  - The row keeps its stale words, because the forms set no `refreshOnError` (KR:50, KR:57).
- **Fix:**
  - CK:34's words (the constraint name stays) become: "this request was already confirmed, cancelled or has expired; the row now shows where it stands".
  - Give both forms `refreshOnError={`key-removal-${removal.removalId}`}`, and render a `RefusalTakeover` with that key in each branch the row can turn into, so the focus lands on the new state.
- **Verify (Playwright, the c2 and c3 refusals):** after the refusal the row shows the new state without a reload, and focus is on its explanation.
- **Scope:** fix round.

### U8 (F11, point 35). Should fix (a next step the reader cannot take). Console: Request key removal, under seven days
- **Evidence:** CK:28-29 is one 42501 sentence that ends "sign out, sign in again with your key, then try again". Signing in again does not help an administrator who has held the role for five days.
- **Fix (words only; the 42501 stays):** "only a platform administrator who has held the role for seven days and signed in with their hardware key in the last 15 minutes can do this. If you signed in with your key more than 15 minutes ago, sign out and sign in again with it. If you have held the role for less than seven days, ask another platform administrator."
- **Verify:** a unit test on `KEY_REFUSALS.not_permitted`. The c1 refusal in the spec asserts "ask another platform administrator".
- **Scope:** fix round.

### U9 (point 52). Polish as written; a blocker for a person if "Start again" spends an accepted code (not judged). Code screen, the key step, any width
- **Evidence (from markup):** `RelyingPartyMismatch` is thrown on the key steps (`apps/web/src/lib/auth/sign-in.ts:178-185`, 385).
  - On the key step, `post()` in `apps/web/src/components/hardware-key.tsx:20-24` turns any non-2xx into "The sign-in step was refused. Start again." under "Not registered".
  - If the 500 body is not JSON, `response.json()` throws and the catch at :160-161 says "The hardware key did not answer. Connect it and try again."
  - Both send the person away from the real cause. A platform setting is wrong, so retrying or starting again fails the same way.
  - If starting again ends the step after the code was taken, the member needs a new opening, which the database refuses for the rest of the hour.
- **Fix (words and handling in `hardware-key.tsx` only):** on a 5xx, or on a body that cannot be read, show "PaidWhole could not start the hardware-key step. The fault is ours, not your key's. Stay on this page and try again in a few minutes; if it keeps happening, write to {support address} from the address you sign in with." Keep "Start again" for 4xx only. Pass `supportEmail` from RK.
- **Verify:** a unit test on `HardwareKeyRegistration` with `fetch` mocked to 500 (JSON and non-JSON): the alert contains "The fault is ours" and not "Start again" or "Connect it". The security reviewer should confirm whether the code is spent when it is accepted.
- **Scope:** fix round.

### U10 (badge colour). Brand (`.claude/rules/brand.md:26-28`; ADR 0056:70-95: a system state is a neutral badge). Console, requested, all widths
- **Evidence:** KR:22 is `<Badge variant="destructive">key removal requested</Badge>`. A pending request is a state, not a failure.
- **Fix:** `variant="outline"`. "keys removed" at KR:26 stays destructive, like "locked" at PG:145: the account cannot sign in.
- **Verify:** a unit test that the requested badge has no `bg-danger-bg` class.
- **Scope:** fix round.

### U11 (F15). Brand (`brand.md:36`: codes in mono). Code screen, every state
- **Evidence:** RK:43's `Field` input is in the text face (from the walk's record). The same code is mono in the panel (OR:36).
- **Fix:** add `className="font-mono tracking-widest"` on the input. Use `Field`'s input class prop, or add one to `Field`.
- **Verify:** Playwright, `getComputedStyle(input).fontFamily` contains "Plex Mono".
- **Scope:** fix round.

### U12 (F18). Polish (a false fact in the words). Console, the reader's own row, requested
- **Evidence:** KR:35: "Another administrator asked to remove your hardware keys. Two others decide it." One person has already asked; one more decides.
- **Fix:** "Another platform administrator asked to remove your hardware keys at {time}. A second administrator confirms or cancels it; no one acts on the keys of their own account."
- **Verify:** a unit test on the self branch.
- **Scope:** fix round.

### U13 (F7). Polish. Console, code panel shown, all widths
- **Evidence:** the paragraph at KR:71 and the "keys removed" badge stay above the panel. A refresh to update them would unmount the panel and lose the code, so do not refresh.
- **Fix:** move the KR:71 paragraph into `OpenRegistration`'s unopened branch, as a `lead` prop rendered above the button. It goes when the panel shows. The panel's h3 (U5) carries the state. The badge remains stale until a reload; accept that.
- **Verify:** Playwright, after Open: `row.getByText('Open registration only when')` has count 0.
- **Scope:** fix round.

### U14 (F12, F17). Polish. Console, requested and removed, 1,280 px
- **Evidence:** at PG:150-166 End membership sits directly above the key text. The cell grows to 290 to 568 px. The email wraps mid-word (`wrap-anywhere`, PG:137).
- **Fix:**
  - Wrap `KeyRemovalActions`' output in `<div role="group" aria-label={`Hardware keys of ${member.email}`} className="basis-full border-t pt-2">` with a first line `<p className="text-xs font-medium text-muted-foreground">Hardware key</p>`.
  - Use `wrap-break-word` in place of `wrap-anywhere` so the address breaks at its punctuation.
- **Verify:** visual check of the c3 and c4 crops at 1,280.
- **Scope:** fix round.

### U15 (F5). Polish. Code screen, wrong shape
- **Evidence:** a code of the wrong shape never reaches the database (from the walk's record), yet the form empties it (the `form-issues.tsx:464` secret selector).
- **Fix:** add `beforeSubmit` on RK:42's `ActionForm`. It strips spaces and hyphens and tests `/^[A-Za-z0-9]{8}$/`. On a mismatch it marks the field, "Enter the eight letters and digits of the code; you typed {n}.", and sends nothing, so the text stays and can be mended.
- **Verify (Playwright):** type "ABC 123", press Continue: the field still holds "ABC 123" and "you typed 6" is shown.
- **Scope:** fix round.

### U16 (F6). Polish. Code screen, empty Continue
- **Evidence:** `required` at RK:43 lets Chromium's bubble answer, not the page.
- **Fix:** keep `aria-required="true"` and drop native validation for this form (`noValidate`), so the page's "Error:" line and summary answer.
- **Verify (Playwright):** an empty Continue shows the page's field error, focused.
- **Scope:** fix round. If it is made in `ActionForm`, it is a shared change and needs its own review.

### U17 (F16). Polish. Console refusals
- **Evidence:** the summary capitalises CK's lower-case sentences and adds no full stop (from the walk's record).
- **Fix:** make the summary end an issue on a hidden field with a full stop. That is shared (`form-issues.tsx`), so it goes to the queue.

## The three emails (W in the diff; `apps/worker/src/platform/hardware-key-notices.ts:81-91`)
Sound, from markup:
- `links: []`. Reply-To is the support address. The words carry no name, practice, code or PHI.
- The plain-text part is sent beside the HTML (`apps/worker/src/mail/mail.ts:167`).
- The subject is branded by `brandedSubject`.

Should an email say that a code exists? **Yes; keep it.** It warns the true owner of an opening they did not ask for, which is the attack this guards. The code itself is never in it. Add one line so the email also works against phishing.

Findings:
- **U18. Should fix (words true to the record), `removed`.** "Signing in asks for your password and your authenticator code." reads as if the person can sign in, but they reach only the code step. Write: "You cannot sign in until you register a new hardware key. To do that, PaidWhole support first opens registration and reads you a one-time code by phone. PaidWhole never sends this code by email or text." Also write "removed by two PaidWhole administrators", which names who did it exactly.
- **U19. Polish, `registration_opened`.** "at {at}, for 1 hour" makes the reader compute the end. Write: "PaidWhole opened registration of a new hardware key on your PaidWhole account at {at}. It is open until {at + 1 h}." Add the same never-by-email line as U18.
- **U20. Polish, all three.**
  - Subject and console say "keys" while the code screen says "key", under the one-live-key rule. Pick one name; "Your hardware key was removed" is recommended.
  - There is no preheader, but that is house-wide (no template has one) and not this item's.
  - All three kinds send `identity.kind: 'hardware_keys_removed'` (`hardware-key-notices.ts:90`). For the code or security reviewer: check whether a kind-keyed suppression or record should tell the three apart.
- Verify: unit tests on `hardwareKeyNoticeLines` for the new sentences. The open-until time equals `eventAt + 1 h`, to the minute.

## Fix round now and the queue
- **Fix round now (small and safe):** U2, U3, U4, U5, U6, U7, U8, U9, U10, U11, U12, U13, U14, U15, U18, U19, U20's naming. U1 can go in too if the 390 px spec runs with it (markup only).
- **The queue:** U1, if the round cannot carry the dual render; U16 and U17 (shared form components).
- No fix touches a migration, a database function or a constraint name.

## Also seen, not this item's
- The page title "Organization | PaidWhole" does not name the organization (WCAG 2.4.2). This is pre-existing.
- "End membership", which removes access, is outline while "locked" is danger. Pre-existing.
- At 390 px the region "Members, scrolls sideways" showed no focus indicator by computed style (W53). Pre-existing `ScrollTable`.
- For the code reviewer: OR:18-25 passes a client wrapper as `ActionForm`'s `action`, which `action-form.tsx:33-36` forbids (no post without JavaScript, no replay of a press made before hydration). The panel needs JavaScript anyway, but the rule is stated.

## Judged sound
- **F13 contrast** (computed from the tokens):
  - Light: danger #B5452E on danger-bg #F8ECE8 is 4.71:1 (passes 4.5); its border on white #FFFFFF is 5.45:1; the focus ring #2F5DA8 on the tint is 5.58:1.
  - Dark: #E8846B on #3A1C14 is 5.86:1; on the ground #0B1626 it is 6.87:1.
  - The tint alone against the dark raised surface is 1.07:1, but the button carries a danger border, so its boundary holds.
  - Muted text passes in both themes: #526070 on white is 6.43:1, and #A7B1C2 on #0B1626 is 8.39:1.
- **Confirm stays one press (point 34).** Two people already guard it, and with U6 its consequence is stated. I recommend no typed confirmation.
- **F10, the requester offered no Confirm,** is correct.
- **F14, times in the text face:** no rule requires mono for times, and the Agreements dates match.
- **The code panel takes focus once** (OR:26-30). The code is in no URL, title or storage (from the walk's record).
- **The code screen** is the same screen whether or not registration is open (RK:20-22), so it is no oracle. Its "No code?" line gives a route.
- **Refusals** go to the summary, focused, as `role="alert"` (an error that needs action).
- **F19, dark (tokens only):** nothing found. Advisory.

## Not judged
- The galleries, so nothing here is "seen".
- A screen reader's own speech and a headed browser's bubble behaviour (F6).
- Whether "Start again" spends an accepted code (U9).
- The 24-hour expiry, five-wrong-codes and requester-left screens (not walked).
- The page without JavaScript.
- The emails' rendered HTML.
