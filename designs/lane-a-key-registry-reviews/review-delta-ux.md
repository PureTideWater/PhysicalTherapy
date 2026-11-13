# Queues item 37, fix round 1: UX and brand review of the delta (c505ad28)

Ref `co-001/wip-key-registry` at c505ad28. This review read only the commit's delta in the web app's screens and components, `console-keys.ts`, `sign-in.ts`, `packages/auth-mail` and the e2e spec, plus a few surrounding lines: `field.tsx`, `action-form.tsx`, `hardware-key.tsx`, the brand ring token and the `hardware_key_notice` table in the migration. It ran nothing, started no server and edited nothing else. No screen was seen in a browser, so every judgement below is **from markup**.
Abbreviations: PG = `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, KR = `apps/web/src/components/console/key-removal.tsx`, OR = `apps/web/src/components/console/open-registration.tsx`, CK = `apps/web/src/lib/routes/console-keys.ts`, AHF = `apps/web/src/app/sign-in/register-key/arrival-heading-focus.tsx`, W = `packages/auth-mail/src/words.ts`.

No finding is a blocker or a WCAG AA failure. The round broke nothing that a person needs to finish a task.

## Findings

### V1. Polish (screen reader verbosity; not a 1.3.1 failure). PG:155, 390 px
- **Evidence:** the narrow copy (`[data-narrow-account]`: the email and `KeyRemovalState`) is in the accessibility tree below `sm`. Reading the row, a screen reader meets the email in the row header, the key-state badge in the Account cell, then the email and the same badge again at the start of the Actions cell. Each button then says the email a third time. The badge is plain text, not a live region, so no status is announced twice. Only the reading repeats.
- **Fix:** add `aria-hidden="true"` to the `div` at PG:155. It holds nothing focusable (a `span` and a `Badge`), so hiding it is safe. The row header and the buttons' names already carry the account.
- **Verify (Playwright, 390 project):** `await expect(narrowAccount(page, MEMBER)).toHaveAttribute('aria-hidden', 'true')`. Also, `page.getByRole('row', { name: new RegExp(email) }).getByText('key removal requested')`, filtered to the accessible tree, appears once.
- **Small:** yes.
- **1.4.10:** the min-width of 18rem (`min-w-72`) on the cell sits inside `ScrollTable`, and a data table's two-dimensional scroll is the criterion's exception. The page itself gains no sideways scroll. By arithmetic (390 minus page and card padding, about 310 px), the 288 px Actions cell fits the scrolling region's window whole. Unverified: the 390 spec's `scrollWidth` check covers this.

### V2. Polish (same rationale as U2, 2.4.6). PG:160
- **Evidence:** `submit="Unlock"` is identical in every locked row. It is the one row button left unnamed.
- **Fix:** `submit={<>Unlock<span className="sr-only"> {member.email}</span></>}`
- **Verify:** `getByRole('button', { name: 'Unlock ' + email, exact: true })` has a count of 1. `getByRole('button', { name: 'Unlock', exact: true })` has a count of 0.
- **Small:** yes.

### V3. Polish (one name per thing). OR:27 and OR:33
- **Evidence:** the group is named "Hardware keys of {email}", but its visible caption reads "Hardware key". The words differ in number, and the group's name is not its caption.
- **Fix:** give the caption an `id` (`key-caption-${account}`) with the visible text "Hardware key". Name the group with `aria-labelledby` pointing at that caption plus a visually hidden span holding " of {email}". If that is too much, set `aria-label={\`Hardware key of ${email}\`}`.
- **Verify:** `getByRole('group', { name: 'Hardware key of ' + email })` is visible.
- **Small:** yes.

### V4. Polish (words true to the record; name who did it). KR:140
- **Evidence:** the line is "No key removal stands for this account: the request of {requestedAt} was cancelled / expired".
  - "Stands" is jargon.
  - "Expired" is dated by the request time, not by `expiresAt`.
  - `keyRemovalsByAccount` keeps the latest removal for ever, so this line shows on every load, months later.
  - After an overtaken Confirm, the refused form, and with it its summary, is replaced. Focus lands on this line, which does not say the press did nothing.
- **Fix (words):**
  - Cancelled: "The key removal requested at {requestedAt} was cancelled. This account's hardware key is unchanged."
  - Expired: "The key removal requested at {requestedAt} expired at {expiresAt} unconfirmed. This account's hardware key is unchanged."
  - Naming who cancelled needs `decided_by` in the summary. That is not small, so queue it.
- **Verify:** a unit test on `KeyRemovalActions` for each state. In the spec, change `toContainText('No key removal stands')` to `'was cancelled. This account'`.
- **Small:** yes for the words.

### V5. Polish (words). OR:105 and OR:91
- **Evidence:** OR:105 says "It is shown once" and then "it cannot be shown again". In "Then open it again for a new code", the "it" could mean the code or the registration. OR:91 repeats "cannot be shown again".
- **Fix:**
  - OR:105, last two sentences: "If the code is lost, registration can be opened again, with a new code, only after {until}."
  - OR:91: "Registration of a new key is open until {until}. The code is hidden for good. If it was lost, open registration again after {until} for a new code."
- **Verify:** unit or Playwright `toContainText('only after')`.
- **Small:** yes.
- **Rule check:** the claim that no second opening is possible until {until} is true while the lost opening is still usable (`hardware_key_registration_open_once`). The panel does not cover an opening closed early by five wrong codes. Whether that opening can be reopened before `until` was not checked.

### V6. Polish (words). CK:40
- **Evidence:** "this request was already confirmed, cancelled or has expired" mixes tenses. With `refreshOnError`, the row is replaced, so the summary is rarely read.
- **Fix:** "this request was already confirmed or cancelled, or it expired; the row now shows where it stands"
- **Small:** yes.

### V7. Polish (consistency). CK:34
- **Evidence:** `not_permitted` is now three full-stopped sentences. Its siblings are lower-case clauses with no full stop, and the summary capitalises them (U17). The refusals now read in two styles.
- **Fix:** keep the words. Settle the style when U17 lands. Until then, accept it.
- **Small:** yes.

### V8. Polish (2.4.3, a page that loads takes no focus). AHF:14
- **Evidence:** `codeAccepted` is a state of the step, so a refresh or Back on the key step also moves focus to the h1. On a fresh load, focus is on the body, so the guard passes.
- **Judgement:** this does no harm: the h1 is the first content. It does contradict KeyStateText's own rule, "a page that loads takes no focus".
- **Fix (optional):** focus only when the previous render was the code form. For example, set a module flag in `registrationCodeStep`'s client submit, as KeyGroup notes a press.
- **Small:** small to medium. The words "Code accepted." on refresh are true (the database took it), and they claim nothing about the opening being used up.

### V9. Polish (U19 only partly done). W:202
- **Evidence:** the round kept "for 1 hour" because "the notice carries only the event's time". The migration's check is `registration_open_until = registration_opened_at + interval '1 hour'`, and the notice is written "at the first opening". So the end is `eventAt + KEY_REGISTRATION_OPEN_HOURS`, exact to the minute, provided the opening function sets `event_at = registration_opened_at`. That is to be checked in the function, not done here.
- **Fix:** "PaidWhole opened registration of a new hardware key on your PaidWhole account at {at}. It is open until {at + 1 h}."
- **Verify:** unit `hardwareKeyNoticeLines('registration_opened', t)` contains `utc(t + 3_600_000)`.
- **Small:** yes. Separately, for the security reviewer: a second opening, after the hour, sends no email (`hardware_key_notice_once`). That is not this delta's.

## Checked and sound (from markup)
- **U3:**
  - Focus moves only if the press was this account's within 15 s **and** focus has fallen to the body. A person who has moved on keeps their focus.
  - Focus alone, with no live region, is the right announcement for a focused `p`.
  - The ring is `focus-visible:ring-2 ring-ring`, and `--color-ring` maps through the UI theme. After a mouse press, Chromium may show no ring on a programmatic focus. That is acceptable.
  - The `key` props force a remount on each state change, so the effect runs.
- **U4:** the h1 takes `tabIndex=-1` only on arrival. "press Register hardware key" matches `hardware-key.tsx:172`.
- **U11:** `Field` spreads `className` onto `Input`, so the mono face reaches the input.
- **U10:** the requested badge is `outline`, and "keys removed" stays danger.
- **Emails U18, U20:** the subject is singular. "removed by two PaidWhole administrators" names who did it. "reads you a one-time code by phone" plus "PaidWhole never sends this code by email or text." add no PHI, link or code.

## U-fixes
- **Done:** U2 (except Unlock, V2), U3, U4, U6, U8, U10, U11, U12, U13, U14 (the group name, V3), U18.
- **Partly:**
  - U1: the small form is done. The narrow copy should be `aria-hidden` (V1), and the stacked list is queued.
  - U5: the words are not yet right (V5).
  - U7: the words' tense (V6), and the replaced summary leaves the overtaken press unexplained (V4).
  - U19: the end time can be computed (V9).
  - U20: the console still says "hardware keys", "keys removed" and "remove this account's hardware keys" (KR:127). This is queued.
- **Queued and not judged here:** U9, U15, U16, U17.
- **Words I would still change:** V4, V5, V6 and V9, as written above. In the console, singular throughout: "Key removed at {time}." (KR:127), the badge "key removed", and "asked to remove this account's hardware key".

## Not checked
- A screen reader's own speech: whether a focused `p` with `tabIndex=-1` is read in full by NVDA or VoiceOver.
- Focus-ring visibility after a mouse press.
- The 390 px crops.
- Dark theme.
- The page without JavaScript.
- The emails' HTML.
- Whether `event_at` equals `registration_opened_at`.
