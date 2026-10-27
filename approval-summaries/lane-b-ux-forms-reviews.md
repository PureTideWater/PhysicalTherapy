# PR #74 reviews (wf_1a8adc67-91d, 2026-10-27 14:15 to 15:50 UTC)
Two adversarial reviews of 4f0b526 (base e908c21), each finding then given to an adversarial verifier. Ids are prefixed S- (security and accessibility) and U- (UX and brand) in the fix round.

## Security and accessibility (fresh clone)

I reviewed the whole diff e908c21..4f0b526 (105 files) in a fresh clone at /tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/rev-sec, against design sections 2 to 6 and the dispositions in 12 and 12.1. I found no blocking issue. Most of the security checklist holds:
- No value the person typed comes back in ActionState. The new next.test.ts checks this on the real adapters.
- The `$ACTION_*` filter in formInput catches what the browser hook now sends.
- Passwords and codes are emptied by data-secret, with a type fallback.
- The Show toggle turns off spellcheck, autocorrect and autocapitalize, and the form hides the password again through state before its data is read.
- Labels go into the summary through textContent and render as React text, so there is no XSS path.
- No style attribute, console call, browser storage or new log was added. Authorization did not change.
- Every practice ActionForm carries FormKeys (checked by a TypeScript-AST scan). The coverage review form gains its missing FormKeys.
- A request key is claimed inside the mutation's transaction, so a refused attempt can be retried with the same key.

Two should-fix security findings come from the new paths:
- **SEC-1:** after "Not confirmed", pressing again saves twice if anything refreshed the page in between. FormKeys renders a new random request key on every server render, and the packet page polls with router.refresh while an export runs.
- **SEC-2:** on a shared browser, the out-of-date-page refresh switches to whoever signed in last in another tab. It keeps what the first person typed, and one press saves it under the second person's name and audit event. Before this PR the refusal emptied the form.

Accessibility mostly matches the design:
- The summary is first in the form and spans every column.
- Focus follows the one rule.
- The error, emptied-note, hint order holds in every field.
- scroll-padding works because the document is the scroll container.
- The 16 px rule and the invalid-control rules are unlayered and win over Tailwind's utilities.
- The pending status is said once.
- Field ids are unique on every changed page (checked by a scan).

The accessibility points left are polish: refused boxes in a CheckboxGroup never get aria-invalid; the emptied-note and "Not confirmed" wording contradict the account-locked and emptied-secret states; and the version form's two hooks can reuse one summary key. A pre-existing point is not raised: the summary is a role=alert Alert that also takes focus, so some screen readers read it twice. e908c21 did the same, and design 3.5 leaves the Alert's role to the Notice PR. Progress and findings are saved in /tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/progress/review-sec.md.

**Not seen:**
- No test was run. I did not install dependencies, so the browser harness, the e2e specs (forms-keep-input, packets, triage, sign-in) and the db tests were not run. SEC-1 and SEC-2 are reasoned from the code (FormKeys' randomUUID per render, router.refresh call sites, csrf.ts) and the design's own D5 evidence that a refresh renders a new key while the fields keep their values. Neither is reproduced in a browser.
- No screen reader was used. Whether fieldset aria-describedby is read (A11Y-1), the double reading of a focused role=alert summary, and announcements of in-place alert changes (A11Y-3) are judged from known screen-reader behaviour, not observed.
- Pages were read through their diffs and AST scans for field ids and FormKeys, not line by line: abstraction/versions, cases/[caseId], cases, console/organizations, console/compliance, console/models, pricing-runs and reports. Unchanged code those pages call was not re-reviewed.
- The test files were not read in full (action-form.browser.test.tsx, fields.test.tsx, form-issues.test.ts, form-hints.test.ts, the forms harness, forms-keep-input.spec.ts beyond the values it types). Nor were docs/product/test-matrix.md, ADR 0056 or BRAND.md beyond grep.
- iOS Safari's zoom, real phones' virtual keyboards against scroll-padding, and Next's server-action origin check were not exercised.
- Domain idempotency of every create route on pages with a refresh source was not traced. That is how much of SEC-1 reaches real data: the version write route dedupes an unchanged narrative, but the model draft does not.

| Id | Reviewer | Verified | In this PR | Title |
| --- | --- | --- | --- | --- |
| S-SEC-1 | should-fix | real, should-fix | yes | "Not confirmed, press again" saves twice if the page was refreshed in between: the retry sends a new request key |
| S-SEC-2 | should-fix | real, should-fix | yes | The out-of-date-page refresh adopts another person's session, keeps the first person's typed text and invites them to send it |
| S-SEC-3 | polish | real, polish | yes | A caller can undo the shown password's spelling-service protection |
| S-A11Y-1 | polish | not a defect | yes | A refused CheckboxGroup box takes the focus but never says it is invalid |
| S-A11Y-2 | polish | real, polish | yes | The emptied note and the "Not confirmed" lead contradict the state they describe |
| S-A11Y-3 | polish | not a defect | yes | The version form's two actions number their responses separately, so the summary is not always re-inserted |

### S-SEC-1: "Not confirmed, press again" saves twice if the page was refreshed in between: the retry sends a new request key

- **Where:** `apps/web/src/components/form-issues.tsx:201`
- **Detail:** When the connection drops, useGuardedSubmit returns { unconfirmed: true } (form-issues.tsx:196-202). RefusalLead (:440) then invites "press “{submit}” again". Design 2.1 and ADR 0077 D1 rely on that second press replaying the same request key, which claimRequestKey makes a no-op (invoke.ts:231-236, :251), so nothing is saved twice. But the key is not pinned. onSubmit and send (:214-231) read it again from the DOM with new FormData(form). FormKeys renders randomUUID() on every server render (form-keys.tsx:14), and any router.refresh() re-renders it into the hidden input, as the design's own D5 evidence for the stale path shows. Refreshes come from:
- ExportStatus, which polls router.refresh every refreshMs while an export is live (export-status.tsx:28-38). It sits on the packet page next to the current version's VersionForm (packet/page.tsx:358 and :513).
- RefreshAfterRefusal, which refreshes the whole page for any refreshOnError or stale form (action-form.tsx:217-229; the pricing-runs, compare and releases rows).
- The Uploader (uploader.tsx:256, on the reconciliation and contracts pages, beside ActionForms).
After any of these, the retry carries a new, unclaimed key.
- **Failure:** A specialist on the packet page, with the approved version's export still running (ExportStatus polling), presses "Draft with the model" on a weak connection. The server writes the model-drafted version and commits, and the response is lost. The form shows "Not confirmed … press again". A few seconds later the poll's router.refresh renders a new requestKey into the VersionForm (and moves basedOnVersionId to the new version). The person presses again. The key is new, so it is not a replay: the model is called a second time against the practice's model budget (requestKey `narrative:<key>` is new too), and a second version is written. The same happens to any create form whose page another form refreshes.
- **Verifier:** I could not refute this. I traced the code at 4f0b526 using /home/user/ux-forms (checked out at 4f0b526) and git show.

1. The request key is read again from the page on every press. useGuardedSubmit.onSubmit (form-issues.tsx:230) and VersionForm.onSubmit (version-form.tsx:115) both build `new FormData(form, submitter)` at the moment of the press. Nothing in the browser hook (:192-203) keeps the key the dropped request carried.

2. Refreshing the page renders a new key in place. FormKeys (form-keys.tsx:14) renders `randomUUID()` on every server render. router.refresh() reconciles the page without remounting it, so React writes the new value into the hidden input while the form's useActionState stays "unconfirmed". The design's own evidence says the same thing (3.5a and D10: "a fresh token and key render in place", drive/r4.out D5 "a new request key").

3. Some refreshes happen without the person doing anything. At 4f0b526 there are three router.refresh call sites:
   - ExportStatus (packets/export-status.tsx:28-38) refreshes every refreshMs while an attempt is live.
   - RefreshAfterRefusal (action-form.tsx:217-229) refreshes for refreshOnError and, new in this PR, for any stale refusal.
   - The Uploader (uploader.tsx:252-256) refreshes when a batch settles.

   On the packet page (page.tsx:357-364 and :513), the current version's VersionForm, which has no React key, sits beside ExportStatus. An approved version stays current, so both are on screen while its export is live, and canDraftWithModel depends only on role and feature (routes/packets.ts:125).

4. The server treats the retry as a new request. claimRequestKey (invoke.ts:231-236, :251) only skips a key it has already seen. A new key reaches draftNarrativeAction (routes/models.ts:102-136), which:
   - calls the model gateway again with the new key `narrative:<newKey>`, so the practice's model budget is charged a second time;
   - calls writeVersionOnce (queries.ts:405-440) with the model's new narrative. Its content check only skips identical content, so the new narrative is written as a second version.

   The save and code_draft buttons are mostly protected by that "unchanged" check. Other create forms on the reconciliation and contracts pages, which can be refreshed by the Uploader or by another form's stale or refreshOnError refusal, have no such check.

5. The design relies on the opposite. Design 2.1 and disposition row 4 say a second press "replays the same request key, which does nothing … so nothing is saved twice", and RefusalLead (:440) tells the person to press again. Neither section 12 nor 12.1, the build records, ADR 0077's "Not covered" nor the review.md entry I found (line 62, which asks for a refresh-renews-the-key test) records a decision to accept a new key on retry.

6. On the base e908c21, a dropped connection showed the error page and the form came back empty; there was no invitation to press again and no claim that a retry was safe. So the unsafe invitation is new in this PR, even though a refresh renewing the key is older.

How much harm: a duplicate version and a second model call, or a duplicate record from another create form. It needs the response to be lost after the commit and a refresh before the second press. Nothing changes a dollar figure or a stage.

Both files involved (form-issues.tsx and action-form.browser.test.tsx) are new in this PR and neither is on the #42 list. No migration is needed and nothing needs the founder.
- **Fix:** In useGuardedSubmit (apps/web/src/components/form-issues.tsx), keep the key a dropped request carried and reuse it on the next press:
- Add `const held = options.heldKey ?? useRef<FormDataEntryValue | null>(null)`. It is an optional shared ref, passed the same way as inFlight, so VersionForm can give its write and draft hooks one held key. That makes a retry behave exactly as it does when no refresh happened.
- In the browser hook's action:
  - after `await action(...)` returns, set `held.current = null`;
  - in the catch, when the error is a dropped connection (TypeError, no digest), set `held.current = data.get('requestKey')` before returning `{ unconfirmed: true, seq }`;
  - otherwise set `held.current = null` before `unstable_rethrow` and the rethrow.
- In `send`, before startTransition: `if (held.current !== null && data.has('requestKey')) data.set('requestKey', held.current);`

The CSRF token still comes from the page, so after a refresh it is fresh while the key stays the one from the dropped press:
- If that press was committed, the retry answers "This form was already submitted".
- If it never reached the server, the retry runs normally.
- A stale refusal or a redirect clears the hold.

Also:
- Pass one shared `heldKey` ref to both hooks in version-form.tsx.
- Correct the sentence in design 2.1 and ADR 0077 D1 to say the dropped press's key is kept until the server answers.
- Add a harness case in action-form.browser.test.tsx: drop the connection, change the page's requestKey input, press again, and assert the second call carries the first key.

### S-SEC-2: The out-of-date-page refresh adopts another person's session, keeps the first person's typed text and invites them to send it

- **Where:** `apps/web/src/lib/http/next.ts:153`
- **Detail:** next.ts:153-155 maps every csrf_refused to STALE. csrf.ts:13 states that a token from another session is refused, and pageCsrfToken follows the session cookie (csrf-page.ts). The sign-in page does not redirect a browser that is already signed in (lib/routes/sign-in.ts:141-148), so a second person can sign in from another tab of the same browser profile. When the first person's tab is then submitted:
- ActionForm renders RefreshAfterRefusal for the stale state (action-form.tsx:78, :217-229).
- router.refresh() re-renders the page under the new session: the shell shows the other email, and FormKeys carries the other person's token and a new key.
- The uncontrolled fields keep the first person's values (design 3.5a, D5).
- Because the press came from this page, RefusalLead says "It is up to date now: press “{submit}” again" (form-issues.tsx:445-446).
The design names "signing in again in another tab" as the cause of a stale token, but only considers the same person signing in again. Before this PR the refusal reset the form, so nothing typed carried over to the new identity.
- **Failure:** On a shared front-desk PC, biller A types a write-off reason, a case note or a ledger adjustment's reason on a practice page and steps away. Biller B opens a new tab and signs in as B (same practice). A, or B using A's tab, presses Save. The post is csrf_refused and becomes STALE. The page refreshes as B with A's text still in the fields and says the page is up to date, press Save again. One press records A's words under B's identity and audit event (audit attribution is wrong). B also now holds A's typed note, which may contain patient information, in a form under B's session.
- **Verifier:** I could not refute the failure path. Each step, checked against the code at 4f0b526:
1. A second person can sign in from another tab of the same browser. The /sign-in page has no signed-in redirect: signInPage's handler only returns the reason (lib/routes/sign-in.ts:141-148) and app/sign-in/page.tsx calls only loadPublicPage. When B's sign-in settles as signed_in, writeSession overwrites the single SESSION_COOKIE, so A's open tab now sends B's cookie.
2. A's form carries A's token, which is an HMAC of A's session token (csrf.ts csrfTokenFor, csrf-page.ts, form-keys.tsx). The wrapper resolves B's session first, which is valid, and then guard() fails the token: invoke.ts:419-424 and :154-155 return csrf_refused. next.ts:153-155 turns that into STALE.
3. ActionForm renders RefreshAfterRefusal for the stale state (action-form.tsx:78) and calls router.refresh(). Every server component renders again under B's cookie: FormKeys gives B's token and a new key, and the shell shows B's email. Nothing in the tree is keyed on identity (no key tied to user, email or session; the root layout holds no shell). So if B can reach the same practice, the form element survives and the uncontrolled fields keep A's text. The PR's own e2e step proves the fields keep their values across a stale refresh with a changed token (forms-keep-input.spec.ts:442-454).
4. The press came through onSubmit, so fromBrowser is true. RefusalLead then says "It is up to date now: press “{submit}” again." (form-issues.tsx:445-446). One more press saves A's words with B's actor_id and B's audit event.

On the base e908c21 the outcome differs. useActionState's dispatcher sat on `<form action>`, so React reset the uncontrolled fields after every refusal; that reset is the UX-001 defect this PR fixes. There was also no refresh on csrf_refused, and guardMessage said "...or your session changed). Reload the page and try again." Before this PR, nothing typed before the switch could be sent under the new identity without retyping it, and the message hinted that the session had changed. The PR drops that hint and asserts the page is "up to date".

The design and ADR record no decision on this:
- Design 3.5a names "signing in again in another tab" as a cause but treats it only as the same person.
- Section 12's findings 10 and 17 and the 12.1 amendments are silent on another person.
- ADR 0077's "Not covered" covers only a session that ends, and drops typed text on purpose because it may hold patient information. That supports the finding.

Two parts of the finding are weaker than stated:
- The patient-information exposure is marginal. A's text was already on screen in a shared browser that B controls, and it leaves the browser only on a press.
- Acting as B from A's tab is already possible on the base after a reload, because the shared browser profile is the root hazard.

What this PR adds is narrower: carrying the typed text across an identity change in one press, under wording that says the page is current. That misattributes an audited mutation (a write-off reason, a case note or an adjustment reason) to a person who did not write it, so should-fix stands.

It is in scope:
- No migration is needed.
- next.ts, form-keys.tsx, action-form.tsx, form-issues.tsx, action-form.browser.test.tsx, forms-keep-input.spec.ts and ADR 0077 are not in pr42-files.txt.
- shell.tsx is a #42 file, so the tag cannot go on the shell, and FormKeys alone has no user (it reads only the cookie). The tag must come from a request-scoped value that loadPage sets.
- **Fix:** Clear the form, and never invite a second press, when the stale refresh shows a different person signed in. Keep today's behaviour when the same person signed in again.

1. next.ts: add a request-scoped slot (React `cache(() => ({ tag: undefined as string | undefined }))`). In loadPage, when outcome.shell is defined, set the slot's tag to `services().sealer.sign('form-actor', shell.email.toLowerCase()).toString('base64url')`.
   - The tag is opaque and keyed by the server. It is not the email and not a form field, so no route sees it and nothing is logged.
   - shell.tsx is a #42 file, and FormKeys alone knows only the cookie, so the tag has to come from loadPage.

2. form-keys.tsx: when the slot holds a tag, also render `<span hidden data-form-actor={tag} />`.

3. action-form.tsx, RefreshAfterRefusal, stale branch only:
   - Read `formRef.current?.querySelector('[data-form-actor]')?.getAttribute('data-form-actor')` before the refresh.
   - Call `startTransition(() => router.refresh())` from useTransition. When the transition is no longer pending, read the tag again.
   - If a tag was present before and is now different or gone:
     - call `form.reset()` and empty the secrets;
     - set a `signedInAsOther` flag that RefusalLead reads, so it shows "You are signed in as someone else now, so nothing was saved and the form was cleared." and never "press “{submit}” again";
     - move the focus to the summary.
   - If no tag was present before (public forms), or it is unchanged, keep today's behaviour.
   - The version form and the export form already render RefreshAfterRefusal, so they are covered too.

4. Tests:
   - action-form.browser.test.tsx: a harness case whose stand-in refresh swaps the tag (the form is cleared and the lead changes) and one where it keeps the tag (values kept, the press invited).
   - forms-keep-input.spec.ts: optionally an e2e step that signs a second synthetic persona into the same context and presses in the first page.
   - Add a line to FRM-01.

5. ADR 0077 D10: add one sentence saying that a stale refresh which finds another person signed in clears the form and does not invite a press. In design 12.1, add a row recording the amendment.

### S-SEC-3: A caller can undo the shown password's spelling-service protection

- **Where:** `apps/web/src/components/password-field.tsx:84`
- **Detail:** PasswordField writes spellCheck={false}, autoCorrect="off" and autoCapitalize="none" (lines 80-82), then spreads {...props} after them (line 84). Its props type only omits `type` (line 46). Any caller passing spellCheck, autoCorrect or autoCapitalize therefore turns the browser's cloud spelling service back on for a shown password, which design 5.3 and review finding 9 set out to stop. No caller does this today. It is a property the component should hold itself.
- **Failure:** A later page adds `<PasswordField … spellCheck />`, for example copied from a text field. A person presses Show, and Chrome's Enhanced Spell Check or Edge Editor sends the plaintext password to the vendor's service. The FRM-07 harness test still passes because it renders its own PasswordField without the prop.
- **Verifier:** I could not refute it.

1. **What the code does.** In apps/web/src/components/password-field.tsx at 4f0b526, the Input gets spellCheck={false}, autoCorrect="off" and autoCapitalize="none" (lines 80-82). After that it gets {...controlMarks(...)} and then {...props} (lines 83-84). The props type is `... & Omit<ComponentProps<'input'>, 'type'>` (line 46), so only `type` is closed off. In @types/react 19.3.0 (index.d.ts lines 2888, 2901 and 2927), autoCapitalize, spellCheck and autoCorrect are all ordinary input props. A caller writing `<PasswordField ... spellCheck />` therefore typechecks, and its value wins over the component's. The @tp/ui Input just passes its props through to the `<input>`, so nothing downstream puts the protection back.
2. **Not on the base.** The file does not exist at e908c21. This PR introduces the component and the gap.
3. **No recorded decision covers it.** Design 5.3 and the section 12 disposition for review finding 9 both say the input "always carries" the three attributes "in both modes". The file's own doc comment says "Shown or not, the input turns off spell checking...". Neither section 12 nor 12.1 says callers may override them. The component documents a property it does not enforce.
4. **No failure today.** The callers are sign-in/page.tsx:29, new-password/page.tsx:25 and :34, forms-harness.tsx:117 and fields.test.tsx:193. None passes any of the three props, so no real person can hit this now. It needs a future code change, such as a prop copied from a text field. In that case a shown password would go to Chrome's Enhanced Spell Check or Edge's Microsoft Editor, which is exactly what finding 9 was meant to stop. The FRM-07 unit, browser and e2e tests would not catch it, because each renders its own PasswordField without the prop.
5. **Severity.** It is a latent gap with no live path, so polish is right. The fix touches no migration and no #42 file, and needs no founder decision.

**Related, out of this task's scope (proposal only):** `data-secret` (line 79) can be overridden the same way, and the form uses it to empty secrets after a refusal. Since `type` is omitted only at compile time, a cast caller could also override it at runtime. Moving data-secret and type after the spread as well would cover both.
- **Fix:** Make the component hold the property both at runtime and when it compiles.

1. In password-field.tsx, widen the Omit on line 46 to `Omit<ComponentProps<'input'>, 'type' | 'spellCheck' | 'autoCorrect' | 'autoCapitalize'>`. A caller then gets a type error instead of having its value silently dropped.
2. Move `spellCheck={false} autoCorrect="off" autoCapitalize="none"` from lines 80-82 to after `{...props}`, so they win even if a caller casts past the type.
3. In fields.test.tsx's 'PasswordField (FRM-07)' block, add a case that renders `<PasswordField ... /* @ts-expect-error spelling props are fixed */ spellCheck autoCorrect="on" autoCapitalize="sentences" />` and asserts the input still has spellcheck="false", autocorrect="off" and autocapitalize="none". The @ts-expect-error also locks in the narrowed type.

No current caller changes.

### S-A11Y-1: A refused CheckboxGroup box takes the focus but never says it is invalid

- **Where:** `apps/web/src/components/form-issues.tsx:342`
- **Detail:** In CheckboxGroup (field.tsx:210-233) the fieldset gets data-invalid and aria-describedby, but its boxes (:222-231) get no aria-invalid and no aria-describedby. markByHand also skips any control inside a [data-invalid] ancestor (form-issues.tsx:342), which is wider than design 3.8's rule (skip only a control that already carries aria-invalid). So the box the summary focuses carries no invalid state and no description of its own. That box is the first box for components, kept and medicareAdjustments, and the refused box in the itemized attestation lists (12.1). Whether the message is heard then depends on the screen reader reading the fieldset's aria-describedby when focus enters the group, which is inconsistent across JAWS, NVDA and VoiceOver.
- **Failure:** On the contract version page, the route refuses applyNcci alone. Focus moves to the NCCI box. With JAWS or VoiceOver, the person hears "NCCI edits, checkbox, checked", with no "invalid" and possibly no message, unless they explore back to the group's Error line.
- **Verifier:** The code at 4f0b526 does what the finding describes: CheckboxGroup (apps/web/src/components/field.tsx:210-233) puts no aria-invalid on its boxes, and markByHand (form-issues.tsx:342) skips any control inside a [data-invalid] ancestor. I could not make the claimed failure happen for a real person, though.

1. The finding's own scenario can't be reached. The NCCI box posts value="on". The route (lib/routes/abstraction.ts:302) refuses applyNcci only when it is longer than 5 characters (text(5)), which takes a forged post. termsFromForm never sends an issue for a flag. No route sends 'medicareAdjustments'.
   - `kept`: the route (lib/routes/models.ts:178) refuses it only when there are more than 100 entries or an index above 99. The UI can't produce either.
   - The attestation boxes (`confirm_<id>`) are `required: true` on both review pages. No form in apps/web/src uses noValidate or formNoValidate, so the browser's own validation stops the press before onSubmit or the post. So no person can reach a refusal on one box under its own key.

2. The refusals a person can reach are group refusals: `components` on console status (nothing ticked) and `attachments` on the version form (more than 20 ticked). For these the design records exactly the behaviour the finding objects to:
   - Section 3.3: the fieldset's aria-describedby names the message.
   - Section 3.9 gives what the screen reader says: "Components affected, group, choose at least one component. Uploads, checkbox, not checked." There is no "invalid" on the box. This is the GOV.UK checkbox-group pattern.
   - The wider skip is deliberate. Under 3.8's narrower wording, markByHand would mark only the first box ("Uploads, invalid entry") for a group problem, which would be wrong. action-form.browser.test.tsx:434 asserts that #group-components-0 has no aria-invalid.
   - The summary is an Alert with role="alert" (packages/ui alert.tsx), so the message is spoken when it appears, whatever a screen reader does with the fieldset's description.

3. It is not a regression for any case a person can reach. At e908c21, ActionForm's effect called namedItem('components'). That returns null for boxes named 'components[]' (and 'attach:<id>'), so no box was marked and focus went to the summary.

What remains is a documentation gap: 3.8 says the fallback skips "any control that already carries aria-invalid", while the code also skips controls inside a component-marked [data-invalid] group, and section 12.1 does not record that. There is also a latent gap: if a later route refuses a single box that a person can reach, that box would carry no aria-invalid. Neither is a defect today.
- **Fix:** No code change needed. Two optional changes:
- Add a row to section 12.1 of /home/user/ops/designs/lane-b-ux-forms.md, amending 3.8: the fallback also skips a control inside a component-marked [data-invalid] group, so a group problem never marks only its first box invalid, as action-form.browser.test.tsx:434 asserts.
- As hardening, have CheckboxGroup set aria-invalid="true" and aria-describedby={`${id}-error`} only on a box whose own key (one of boxKeys) is refused, never on every box for issueKey. That would need a per-key issue lookup in the component. Extend the itemized-group browser test (:438) to assert aria-invalid on #group-confirm-1. This is inside this PR's own files (field.tsx and the browser test): no migration and no #42 file.

### S-A11Y-2: The emptied note and the "Not confirmed" lead contradict the state they describe

- **Where:** `apps/web/src/components/form-issues.tsx:132`
- **Detail:** EmptiedNote shows whenever the form shows a refusal (useEmptied, :124-126). On a sign-in that answers "Account locked" (locked: true), the password field therefore says "Emptied for your security: type it again.", an instruction the lock forbids. The "Not confirmed" lead (:440) says "What you typed is still here", but on the sign-in, new-password, MFA and enrollment forms the password or code has just been emptied (emptySecrets runs for unconfirmed states too).
- **Failure:** After the tenth failure, a screen-reader user hears "Account locked …". Tabbing to Password, they then hear "Emptied for your security: type it again.", type it again, and add a failure attempt or wait on a lock they were told to retry through. On a dropped connection at sign-in, the person reads that everything is still there, finds an empty password, and may think the page is broken.
- **Verifier:** I traced both halves of the finding at 4f0b526, and both happen. The harm is smaller than the finding says.

(1) The lock. On the tenth failure, or on any later try, lib/routes/sign-in.ts:117-119 returns { error: MESSAGES.locked, locked: true }. refused() (form-issues.tsx:54-56) checks only error or unconfirmed, so FormIssuesContext.refused is true. useEmptied('password') (:124-126) is then true, and EmptiedNote (:132) prints "Emptied for your security: type it again." under Password on /sign-in. PasswordField also puts that note in the field's aria-describedby (password-field.tsx:50, :83, :101). The summary at the same time says "Account locked" and "This account is locked after ten failed attempts. A platform administrator can unlock it." The field's note therefore gives an instruction the lock makes pointless.

The finding's consequences are overstated:
- Another try adds no failure. SignInFlow.start (lib/auth/sign-in.ts) refuses a locked account before any credential is tried, and authenticated() checks the lock again. failure() is never reached.
- The lock has no timer to wait out. A platform administrator has to unlock it.
- So the real cost is one wasted try that answers "Account locked" again.
- The MFA and enrollment steps can also return locked. Their code note is already the short "Emptied for your security.", so the lock half affects the password field only.

(2) The dropped connection. useGuardedSubmit returns { unconfirmed: true }. Summary's useLayoutEffect runs emptySecrets(form) whenever refused(state) is true, and that includes unconfirmed (:385, :392). On /sign-in, /sign-in/new-password, /sign-in/mfa and /sign-in/enroll (all ActionForm with a PasswordField or a one-time-code Field), the password or code is emptied. Yet RefusalLead (:440) says "What you typed is still here". On MFA and enrollment the code is the only field, so the sentence is wholly false there. The emptied note under the field does say what happened, which softens the "page is broken" reading, but the summary and the note still contradict each other.

The browser test locks the contradiction in. action-form.browser.test.tsx:169-185 drops the connection on the harness's 'keep' form, which holds a PasswordField, a one-time-code Field and a raw password input (forms-harness.tsx:117-120). It asserts "What you typed is still here" and checks only #field-zip.

Base: both are new in this PR. At e908c21 there is no EmptiedNote and no "Not confirmed" state (no match for emptied, still here or type it again under apps/web/src); a dropped connection showed the error page.

Dispositions: nothing in the design records a decision on either combination. Row 11 adds the note without considering locked. Row 4 sets the "Not confirmed" wording on evidence that "D2 keeps every value" (the drive/r4.out run); I did not check whether that run's form held a secret. 2.1, 10.2 and FRM-01 also say a dropped connection keeps every value, while 2.3 says secrets are emptied after every refusal. 12.1 adds nothing on this.

Scope: form-issues.tsx, its tests, ADR 0077 and the design are not in pr42-files.txt. No migration is needed and the founder has nothing to decide. Polish is the right severity: the problem is contradictory words in two error states, with no security effect and no extra lock count.
- **Fix:** Everything below is in apps/web/src/components/form-issues.tsx, plus tests and docs.

(a) Lock. Put the lock into the context:
- FormIssues value: `{ issues: state.issues ?? [], refused: refused(state), locked: state.locked === true }`.
- Widen FormIssuesContext's type and default to match (`locked: false`).
- EmptiedNote reads `const { locked } = use(FormIssuesContext)` and renders `secret === 'password' && !locked ? 'Emptied for your security: type it again.' : 'Emptied for your security.'`.
- The note stays (the field really was emptied) and its id stays in aria-describedby.

(b) Dropped connection. Make the lead depend on whether the form held a secret:
- Have emptySecrets return whether it matched any control (`let any = false; … any = true; return any;`).
- Store `secrets` in Summary's placement (`setPlacement({ state, targets, hidden, secrets })`).
- Pass `secrets={read?.secrets === true}` to RefusalLead, as an optional prop that defaults to false, so the export form's existing call is unchanged.
- In the unconfirmed branch, when `secrets` is true, render "The connection to PaidWhole dropped before an answer came back. What you typed is still here, except any password or code: check your connection, then press “{submit}” again."
- Do not stop emptying secrets on a dropped connection. 2.3's rule never to keep a password or code still holds, and a code may already have been spent.

Tests:
- action-form.browser.test.tsx:176-178: expect the "except any password or code" lead on the harness 'keep' form, and assert #field-password, #field-code and #raw-pin are empty.
- fields.test.tsx: add a case in which a locked state renders "Emptied for your security." under a PasswordField.
- forms-keep-input.spec.ts:432 (support form, no secret) stays as it is.

Docs: add both strings to design 10.2 and ADR 0077 D2/D1, and record the disposition in 12.1.

### S-A11Y-3: The version form's two actions number their responses separately, so the summary is not always re-inserted

- **Where:** `apps/web/src/components/packets/version-form.tsx:121`
- **Detail:** RefusalSummary is keyed by state.seq (form-issues.tsx:376) so that each response inserts a new alert (review finding 5). VersionForm runs two useGuardedSubmit hooks (version-form.tsx:97-98), each counting seq from its own previous state. A write refusal (seq 1) followed by a model-draft refusal (seq 1) reuses the same Summary instance. The alert's contents change in place and no new alert is inserted, so how it is announced depends on the screen reader's handling of changes inside a live region. A repeated identical message across the two actions may not be announced at all.
- **Failure:** A person presses "Save as a new version" and is refused for the prompt-pay state. They then press "Draft with the model" and get the same issue. The second refusal renders under the same key-1 summary, which some screen readers do not announce again, so the person hears only "Working…" and silence.
- **Verifier:** I traced the code at 4f0b526 (apps/web/src/components/packets/version-form.tsx and apps/web/src/components/form-issues.tsx). The finding assumes the key-1 Summary from the write refusal stays mounted until the draft refusal arrives. It does not.

1. The person presses "Draft with the model". VersionForm.onSubmit (version-form.tsx:106-116) calls setClicked('model_draft') inside the discrete submit event, so React renders and commits that update at sync priority straight away. Only after that does it run draft.send, which puts setSource('browser') and dispatch inside startTransition (form-issues.tsx:214-219). An async action entangles those transition updates, so they commit together with the response.

2. That first commit already uses shown = draft (version-form.tsx:104). The draft hook has never answered, so draft.state is its initial {}: serverState while source is still 'server', or the initial browserState, which is also {}. RefusalSummary therefore renders key={undefined ?? 0} = 0 (form-issues.tsx:376). The key-1 instance unmounts and its role="alert" node leaves the DOM. Summary key 0 returns null because refused({}) is false.

3. When the draft action answers, browserState is {...refusal, seq: (undefined ?? 0) + 1 = 1}. The key goes from 0 to 1, a fresh Summary mounts, and a new Alert (role="alert", packages/ui/src/components/alert.tsx:18) is inserted. A new alert is announced, which is what review finding 5 wants. The same thing happens in the reverse order (draft refused, then write refused).

The general case holds too. clicked always commits before the pressed hook's response does: the response is a network round trip, and in any case the sync lane renders before the transition lane. So the key shown just before a response is that hook's own previous seq, or 0. The response then carries exactly that number plus one (form-issues.tsx:193). Each hook's numbering is only ever compared with its own, so every response remounts the summary. A shared counter or an action-qualified key would change nothing. With no press seen (clicked === null), the state comes from the post without JavaScript or a replay, has no seq and arrives with a page load, so no in-place update happens there either.

Base: at e908c21 there is no keyed RefusalSummary (the base version form uses plain useActionState with its own summary), so the mechanism is new in this PR, but the failure it describes does not occur. Design: section 3.5 and disposition 5 key the summary by seq; nothing in 12 or 12.1 concerns two actions, and nothing needs to.

Empirical check: I wrote a scratch Playwright and Vite harness that renders the real VersionForm with a model button, under /tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/a11y3/ (entry.tsx, run.mjs; nothing in the repo was changed). It covers write then draft, draft then write, mixed sequences and a held draft. It never ran: the other agent's screen tour holds /tmp/laneb-heavy.lock for the life of its server (TOUR_MINUTES=45, from 14:46). I cancelled my queued run rather than block on it. It can be run once the lock is free with: cd <that dir> && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers flock /tmp/laneb-heavy.lock node run.mjs. The verdict rests on the code trace above.

Proposal, a different issue outside this finding: because shown follows clicked as soon as the button is pressed, switching to an action that already holds an earlier refusal brings that old refusal back while "Working…" shows. Example: draft refused, then write refused twice, then press draft. The draft's old seq-1 state becomes the shown state, the key changes from 2 to 1, and an alert with the stale draft refusal is inserted. Summary's layout effect then moves focus to it before the real answer arrives. If the keys happen to match, the old text is swapped in place and focus still moves. A possible fix: choose the shown state by the action that last answered. Keep clicked (sync) for PendingStatus and the button label, and set a separate 'answered' value inside the same transition as dispatch, so it commits with the response. Add a harness case for it: draft refused, write refused, then a held draft press shows no summary inserted and no focus move before release. I have not verified this one beyond reading the code. The held-draft step in my scratch run.mjs prints exactly this case.
- **Fix:** None needed for A11Y-3. Each hook's response number is always one more than the number its summary showed just before, because the clicked switch commits first and unmounts the other action's summary (key 0, or that hook's previous seq). So every response inserts a new alert. Optional hardening, not required: a harness case that presses write (refused), then draft (refused), and asserts two summary insertions. The forms harness 'version' page has model={null} today, so that page would need a model submit.

## UX and brand (before and after tour shots, 153 per run)

UX and brand review of PR #74 (4f0b526 against e908c21). I compared before and after shots of all 51 sampled states at 1280, 390 and 1280-dark, as side-by-side crops of the PNGs, and read the code in a fresh clone (scratchpad/rev-ux). I also confirmed one CSS cause in Chromium 141 (pinned build 1194) with a small static test page (scratchpad/revux-repro). My working notes are in /tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/progress/review-ux.md.

Verdict: the PR fixes its core defect on every sampled refused form. What was typed stays and defaults are not swapped in: `console.models.error` keeps Daily budget and no longer becomes a kill switch for everyone, `console.practice.error` keeps 0001, `settings.billing-org.error` keeps 12345, `p.roi.error` keeps the typed period, `p.case.error` keeps Other with the box ticked, and `p.submissions.error` keeps Partially accepted. On each of these the summary comes first. Each item is named by its visible label and links to its field. Each refused control has the 2 px mark and an "Error:" line with the icon. Passwords and codes are emptied, with a note saying so, and Show password works. The pending status line, "Not registered", the new loading label (shown in both themes), "Not confirmed" and "This page was out of date" all match section 10.2. Dark shots use tokens only. No blocking finding. No legal text, brass, mark or seal is touched.

Two layout regressions came with the change, both at 390 px:
- **UX-1:** the new rule that lets a form wrap while it shows a refusal widens column forms. `p.submissions.error.390` scrolls sideways, 613 px wide against 390 before.
- **UX-2:** the 16 px control rule widens selects that cannot shrink. `p.coverage.checklist-review.390` is now 408 px wide. On `console.status.error.390` the Set buttons cross the card's border.

The other should-fix findings:
- **UX-3:** on a locked account the password note says "type it again".
- **UX-4:** after "Not confirmed", the second press the page asks for can read "Not done" when the first press had in fact saved.
- **UX-5:** /support no longer warns against patient details on the email route.
- **A11Y-1:** essential rules (the password policy, the no-patient-information rule) now sit in 12 px hints.
- **A11Y-2:** the split form's problem list announces on every keystroke.
- **UX-6:** the rewritten Reason and Response selects still open already answered.

Baseline findings this PR answers (31):
- **Fixed on shots:**
  - Forms keep what was typed: a11y-other-01, a11y-practice-1-03, a11y-practice-2-01, flows-other-01, narrow-other-01 and narrow-practice-2-01. narrow-practice-1-07 is fixed too, but `p.submissions.error.390` now overflows (UX-1).
  - Fields named by label and marked: a11y-other-02, a11y-practice-1-01, a11y-practice-1-02, a11y-practice-2-02, narrow-other-12, narrow-practice-1-08, narrow-practice-2-06 and words-other-03.
  - Server words: words-other-01, for the sampled messages. The ZIP and other #42 messages wait, as the design says.
  - Sign-in and the hardware key: a11y-other-05, a11y-other-07, a11y-other-08, words-other-29 and narrow-other-23.
  - Format and patient-information hints: a11y-other-20, now in 12 px (A11Y-1).
  - 16 px controls: narrow-other-09 and narrow-practice-2-10, with the overflow side effects in UX-2.
  - The group half of a11y-other-09.
- **Fixed by code only:**
  - a11y-other-26 and a11y-practice-1-17 (component half).
  - a11y-practice-1-20: the hidden file input leaves the tab order.
  - The pending half of a11y-practice-1-04.
  - The split-form half of a11y-other-09, which brings A11Y-2.
  - Not in the 31 but fixed: narrow-practice-1-13, through html scroll-padding-top.
- **Still open:**
  - a11y-other-15: waits for #42.
  - The success half of a11y-practice-1-04: the notice pull request.
  - The page half of a11y-practice-1-17: no shell while a page loads.

Other open baseline findings on these screens, not caused by this PR:
- flows-practice-07: listed as UX-6, because the PR rewrote both selects.
- a11y-other-06: no QR code or copy button on `sign-in-enroll.error`.
- words-other-19: "change their role below" on `settings.users.error`.
- words-other-22: Impact reads 'minor' on `console.status.error`.
- narrow-other-03: console and settings tables scroll sideways on `console.organization.*`, `console.compliance.*`, `console.terms.*` and `settings.users.*`. The users table got a little wider (667 to 686 px).
- The ROI and contracts tables overflow, unchanged (599 and 664 px).
- Dark mode, advisory: a11y-other-19 and brand-01 (the sign-in h1 is light on Paper in `sign-in.error-wrong-password.1280-dark`), and brand-02 (white native checkboxes in `console.status.error.1280-dark`).
- Polish, pre-existing: the first sign-in step's "Check the email, the password or the code" names a code that step does not have.

**Not seen:**
- Not seen, by sample: routes this PR changes outside the 51 sampled states: /p/[practiceId]/abstraction/regulations, /abstraction/versions/[versionId] (error-amend), /abstraction (error-tag); /cases/[caseId]/packet (version form, export status pending and stale) and /packet/[versionId]/review (the attestation legend); /lines/[lineId] (p.line.error); /pricing-runs, /pricing-runs/[runId], /pricing-runs/compare (hidden-field data-error-name items); /reconciliation (error-reverse) and the reconciliation template mapper; /releases; /reports and /reports/[reportId]/review (itemized attestation group); /settings/agreements, /settings/proof-level, /settings/defaults (p.defaults.error, labels moved onto fields); /uploads (uploader); the Stripe ConfirmForm on /settings/billing/[organizationId].
- Not seen, by sample: ActionForm users the baseline cited, reached through the shared component and styles change: /console/support (Ticket), /console/organizations list error, /console/billing error, /screening/results/[resultId] error-name, /p/[practiceId]/cases error, /claims error, /contracts/[contractId] error, /mapping/[planId] error. UX-1 and UX-2 may reach any of them at 390.
- Not seen: ActionForm's pending state ('Working…' beside a button that keeps its words). Only the hardware-key and register-key status lines were captured.
- Not checked: screen-reader announcements (the summary alert, LoadingAnnouncement's delayed label, the pending status, the hardware-key alert focus), visible focus rings after programmatic focus, keyboard tab order, focus under the sticky header (scroll-padding-top, which fixes narrow-practice-1-13, was read from code only), Back and refresh, posts without JavaScript, the stale state reached by a replay, and the second press after 'Not confirmed' (UX-4 rests on the code).
- Not checked: dark shots other than a sample of sign-in, new-password, console status and cases loading. Dark is advisory (tokens only).
- Not checked: real iOS Safari zoom. The 16 px rule was judged from CSS and the 390 shots.

| Id | Reviewer | Verified | In this PR | Title |
| --- | --- | --- | --- | --- |
| U-UX-1 | should-fix | real, should-fix | yes | Refused column forms widen past a phone's width: the new wrap rule makes a flex-col form a multi-line flexbox |
| U-UX-2 | should-fix | real, should-fix | yes | 16 px controls widen selects that cannot shrink: new sideways scroll and controls over the card border at 390 |
| U-UX-3 | should-fix | real, should-fix | yes | "Emptied for your security: type it again." tells a locked or rate-limited person to retype, and "What you typed is still here" is said over an emptied password |
| U-UX-4 | should-fix | real, should-fix | yes | After "Not confirmed", the press the page invites can come back titled "Not done" although the first press saved |
| U-UX-5 | should-fix | real, should-fix | yes | /support's email route lost its no-patient-information warning when the sentence moved into the field hints |
| U-A11Y-1 | should-fix | real, should-fix | yes | Essential instructions moved into 12 px hints (password policy, no-PHI rule, formats), off the brand's type scale |
| U-A11Y-2 | should-fix | real, should-fix | yes | The split form's live problem list speaks while the person types |
| U-UX-6 | should-fix | real, should-fix | yes | The write-off Reason and the payer Response were rewritten as SelectFields but still open pre-answered |
| U-A11Y-3 | polish | real, polish | yes | Show password has no visible pressed state |
| U-UX-7 | polish | not a defect | no | Summary items stack two or three colons |
| U-UX-8 | polish | real, polish | yes | At 390 px the 16 px rule clips a select's chosen text |
| U-UX-9 | polish | real, polish | yes | One field mixes apostrophe styles and names; a format hint and its error say the format differently |
| U-UX-10 | polish | real, polish | yes | Two refused states skip the pattern every other form now follows |

### U-UX-1: Refused column forms widen past a phone's width: the new wrap rule makes a flex-col form a multi-line flexbox

- **Where:** `packages/ui/src/styles.css:127`
- **Detail:** `form:has(> [data-slot='refusal-summary']) { flex-wrap: wrap; }` (styles.css:127-129) is unlayered and reaches every ActionForm, including the default 'flex flex-col gap-4' and 'flex max-w-xl flex-col gap-3'. In a multi-line column flexbox Chromium sizes the line to its widest item's max-content. A select's max-width:100% then no longer clamps it, because the percentage is cyclic there. Evidence: `p.submissions.error.390` before 390 px wide, after 613 px. In the after shot, Response and Received on sit side by side, and the Amount label, its "Error:" line, its hint and the Document select run past the card and off the screen; the header stays 390. I reproduced the cause in Chromium 141 (scratchpad/revux-repro). The same column form with a long-option select measures 390 px with the rule off and 573 px with it on. A long label or hint alone does not trigger it. Every refused column form holding a SelectField with a long option (documents, contracts, payers, practices) is exposed at 390, in exactly the state this PR is about. Rule: ADR 0056:51-53 (no page scrolls sideways at a phone's width); WCAG 1.4.10.
- **Failure:** A packet approver on a phone logs a partial payer response and leaves Amount empty. The refusal turns the form 613 px wide. The amount's error line and the Document select run off the right edge, and they must pan sideways to read the error and check the document.
- **Verifier:** I tried to refute this finding and could not. It is real, this PR introduced it, and the design records no decision that covers it.

1. The code at 4f0b526. packages/ui/src/styles.css:127-129 adds an unlayered rule, `form:has(> [data-slot='refusal-summary']) { flex-wrap: wrap; }`. ActionForm (apps/web/src/components/action-form.tsx:68-69) renders RefusalSummary as the form's first child with that data-slot (form-issues.tsx:412). So the rule reaches every refused ActionForm, including the default `flex flex-col gap-4` and the submissions response form `flex max-w-xl flex-col gap-3` (submissions/page.tsx:277). SelectField's select is `h-9 max-w-full` inside a `flex min-w-0 flex-col` wrapper (field.tsx:90-95).

2. Independent reproduction with the real CSS. I compiled the app's own globals.css with the clone's @tailwindcss/postcss 4.3.3, so the output includes this PR's styles.css. I built a page with the same classes as the submissions response form and a default `flex flex-col gap-4` form with a long-option select, then measured in Chromium 141.0.7390.37 at 390x844:
- As shipped: documentElement.scrollWidth is 808. The Document select is 517 px and the contract select 767 px, while the form box stays 308 px and the card 358 px.
- With the rule neutralised: scrollWidth is 390 and both selects are 308 px.
- With the proposed `form:not(.flex-col):has(...)`: scrollWidth is 390, and the `flex items-end gap-2` row form still wraps its summary onto its own line, so the rule's purpose survives.

Scripts and output are in /tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/verify-ux1/.

3. The real app shots agree. The reviewer's screens-after/png/p.submissions.error.390.png is 613 px wide, and the Amount field, its Error line, its hint, the Document select and Notes run past the card. screens-before is 390 px wide with the Document select clipped inside the card.

4. The base does not have the bug. At e908c21 neither the rule nor the summary-first placement exists, so the column form is single-line and max-width:100% clamps the select.

5. The design has no recorded decision. Design 3.5 (line 478) and disposition 12 #8 justify the rule by saying "a column form has no height for it to wrap into". That premise is false in Chromium: a multi-line column flexbox sizes its line to the widest item's content, and the select's max-width:100% stops clamping. Section 12.1 has nothing on page width. This breaks ADR 0056 ("at a phone's width no page scrolls sideways") and WCAG 1.4.10, in exactly the refused state this PR is about.

6. Impact. 116 ActionForm uses exist, and 30 or more have flex-col classes, including the default. Any of them holding a select with a long option label (documents, contracts, payers) is exposed below about 400 px.

7. Scope check for the fix. No form uses a responsive flex-col plus md:flex-row, so `:not(.flex-col)` excludes nothing that becomes a row at a wider breakpoint. Grid forms ignore flex-wrap either way. The selector appears nowhere else in code or docs. styles.css and the e2e specs are not on the #42 file list. No migration and no founder decision are needed.
- **Fix:** 1. In packages/ui/src/styles.css:127, change the selector to `form:not(.flex-col):has(> [data-slot='refusal-summary']) { flex-wrap: wrap; }`.
2. Correct the comment above it. A column form must not wrap, because Chromium then sizes the column's line to its widest item and a long-option select overflows the phone width.
3. Add an FRM-08 assertion at 390x844 on a refused column form that holds a long-option select, for example the packets.spec.ts submissions step where Amount is left empty: `expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)`. Optionally assert the same in forms-keep-input.spec.ts:163.
4. In the design, correct 3.5 (line 478, "a column form has no height for it to wrap into") and disposition 12 #8 to record the narrowed selector and why.

All of this fits in this PR: no migration, no #42 file, nothing the founder must decide.

### U-UX-2: 16 px controls widen selects that cannot shrink: new sideways scroll and controls over the card border at 390

- **Where:** `packages/ui/src/styles.css:107`
- **Detail:** The <48rem rule enlarges every control's intrinsic width by 16/14. Raw selects with no max-width, and selects in non-wrapping rows, now pass their card. `p.coverage.checklist-review.390` and `-sent.390` go from 390 to 408 px wide: the 'Request a missing fee schedule' form (coverage/page.tsx:420, `grid max-w-xl gap-3`, raw selects with no max-w-full) puts Payer and Contract past the card and the viewport. `console.status.error.390` goes from 390 to 391: each component row's form (`flex items-end gap-2`, status/page.tsx:68) now runs its 'Set' button over the card's right border, where before it sat inside. `settings.users.error.390`'s already-overflowing table grows from 667 to 686. Design 5.1 and 11.3 claimed FRM-08 measures both widths, but none of these pages is in its check. Rule: ADR 0056:51-53; WCAG 1.4.10.
- **Failure:** A pricing manager on a phone opens Coverage. The page now pans sideways and the Contract select's arrow sits off-screen. A platform admin on a phone sees each Set button overlapping the card edge.
- **Verifier:** I could not refute it. The core claim holds and the PR introduces it, though one part of the finding is overstated and one of its proposed fixes does not work.

1. The cause is in this PR alone. The letter form's markup on Coverage is the same at e908c21 and 4f0b526 (coverage/page.tsx:420-447: `grid max-w-xl gap-3`, raw selects with `text-sm` and no max-width). So is the status row form (status/page.tsx:68: `flex items-end gap-2`, a SelectField inside a w-full table cell). The only change that reaches them is the new unlayered `@media (width < 48rem) { select, input, textarea { font-size: 1rem } }` in packages/ui/src/styles.css:107. It outranks `text-sm` and makes each select's intrinsic width 16/14 of what it was.

2. The reviewer's tour shots confirm it. I measured the PNG headers in screens-before and screens-after (the after build is /home/user/screens at 4f0b526):
   - p.coverage.checklist-review.390 goes from 390 to 408 px wide, and p.coverage.checklist-review-sent.390 also from 390 to 408.
   - console.status.error.390 goes from 390 to 391.
   - In the after tiles, the Payer and Contract selects and the codes input end at about x=408, past the card border (about 374) and past the viewport. The Set buttons end at about 385, over the card border.
   - In the before tiles they end at about 366 and 371. That is already past the card's content box (349), but inside its border.

   So the base already had a hidden overflow into the card's padding. This PR turns it into sideways page scrolling, which breaks ADR 0056's rule "At a phone's width no page scrolls sideways".

3. Nothing records a decision on this. Design sections 5.1, 11.3, 12 and 12.1 say nothing about it, and neither do review.md or the 2b build records. FRM-08 (test-matrix:325, forms-keep-input.spec.ts:163-173) checks only font size and axe on the audit-request and ROI forms. It measures no page width. The 11.3 hold is about controls that should stay 14 px, not about overflow, so the finding's wording on that point is loose, but the gap it names is real.

4. I reproduced it in a static page in Chromium 1194 under the heavy lock (/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/verify-ux2/repro.html and run.cjs):
   - With 14 px controls the page is 390 wide. With the 16 px rule it is 410, the selects end at 410 and Set ends at 376, past a card border at 374.
   - Adding `select { max-width: 100% }` changes nothing in either layout. The grid's auto column still sizes to the select's min-content, and SelectField already has max-w-full, which does not help inside an auto table cell. So the reviewer's global CSS proposal is not a fix.
   - `grid-template-columns: minmax(0,1fr)` alone brings the page back to 390, with the selects ending at the content edge (349). So does `min-width: 0` on the field wrappers plus a select max-width of 100%, which is what SelectField does. Tailwind 4.3.3's `grid-cols-1` is `repeat(1, minmax(0, 1fr))`, as checked in its dist/lib.js.
   - `flex-wrap` on the status row form brings Set back inside the card.
   - The PR's own `form:has(> [data-slot=refusal-summary])` wrap does not cover this. It wraps only a refused row, and console.status.error-row.390 is still 391 wide after the PR.

5. Part of the finding is not introduced here. settings.users.error.390 was already 667 px wide on the base, so that overflow predates this PR, which only widens it to 686. Moving that table into a scroller inside its card is a separate proposal.

6. The fix is in scope. coverage/page.tsx and console/status/page.tsx are both files this PR already changes. Neither is in pr42-files.txt. No migration is needed and nothing needs a founder decision.

Severity is should-fix: a pricing manager's Coverage page scrolls sideways on a phone and the Contract select's arrow is off-screen, but no data is lost. The console row is a 1 px overflow on an internal admin page.
- **Fix:** 1. Coverage letter form (apps/web/src/app/p/[practiceId]/coverage/page.tsx:420): `className="grid max-w-xl grid-cols-1 gap-3"`. In Tailwind 4 that is `repeat(1, minmax(0,1fr))`, so the column can no longer grow to the select's intrinsic width. Also give both raw selects `w-full max-w-full` (letter-payer :423, letter-contract :432), or wrap each field div in `min-w-0`. Replacing them with SelectField would also work, since its wrapper has min-w-0 and the select has max-w-full, but the contract select uses optgroups, which SelectField does not render, so keeping the raw selects is the smaller change.

2. Status row form (apps/web/src/app/console/status/page.tsx:68): `className="flex flex-wrap items-end gap-2"`. The form's min-content becomes its widest item, not the sum of all items, so the table fits the card at 390 and Set moves below the select only when the cell is too narrow.

3. Do not count on adding `select { max-width: 100% }` to styles.css. In Chromium it fixes neither layout.

4. Optional (it costs one more e2e step): in apps/web/e2e/forms-keep-input.spec.ts, which is new in this PR, assert `document.documentElement.scrollWidth <= 390` at 390 px on /p/<id>/coverage (with a payer loaded) and on /console/status. FRM-08 today measures only font size and axe, so it would not catch this. No migration, and no #42 file.

Proposal outside this PR: settings/users' table was already 667 px wide at 390 on the base. Under ADR 0056 it should scroll inside its own card.

### U-UX-3: "Emptied for your security: type it again." tells a locked or rate-limited person to retype, and "What you typed is still here" is said over an emptied password

- **Where:** `apps/web/src/components/form-issues.tsx:132`
- **Detail:** `sign-in.error-locked.390` and `.1280` show the summary 'Account locked / This account is locked after ten failed attempts. A platform administrator can unlock it.' with, under Password, 'Emptied for your security: type it again.' useEmptied (form-issues.tsx:124-126) shows the note for any refusal, so the same happens after 'Too many attempts in a short time. Wait N minutes and try again.' The note's next step contradicts the summary's. On a dropped connection, the sign-in forms say 'What you typed is still here' (form-issues.tsx:440) while emptySecrets has cleared the password and code. Rule: every error says what happened and a next step the reader can take, true to where it points (PRD.md:256; baseline); WCAG 3.3.3.
- **Failure:** A locked user reads 'type it again' and keeps retyping their password. Each try fails against an account only an administrator can unlock, and nothing explains why.
- **Verifier:** I traced each part of the finding at 4f0b526. Two of the three parts hold. The rate-limit part does not.

1. A dropped connection on a sign-in form: real, and the most serious part. `refused()` (form-issues.tsx:54-56) counts `unconfirmed` as a refusal. Because of that, Summary's layout effect runs `emptySecrets(form)` (form-issues.tsx:392) and `useEmptied` (124-126) shows the note. A drop on /sign-in (ActionForm + PasswordField), /sign-in/new-password or /sign-in/mfa therefore produces two contradictory messages:
   - The summary says "What you typed is still here: check your connection, then press “Continue” again." (form-issues.tsx:440)
   - The password or code field is empty, and the note under it says "Emptied for your security: type it again."
   Every one of those secret fields is `required` (sign-in/page.tsx, new-password/page.tsx:30,34, mfa/page.tsx:24). So following the summary's next step exactly gets the browser's own "fill out this field" bubble and sends nothing. The summary makes a false statement and its next step does not work.
   - The base (e908c21) has neither string; both are new in this PR.
   - The design lists both strings in 10.2, but no section considers them together. 10.1 shows `error-unconfirmed` only on /support, which has no secret field.
   - 12 and 12.1 record no decision on this.

2. A locked account: real, but smaller than the finding says. runSignInStep returns `{ error, locked: true }`. The summary shows "Account locked" with the administrator sentence, and PasswordField still shows "Emptied for your security: type it again." The design gives the code note no instruction because its next step lives elsewhere (2.3). The same logic should have kept the instruction off the password note when locked, but 2.3 and 12/12.1 never consider the locked case.
   - The finding's harm is overstated. "Nothing explains why" is false: every retry shows the focused "Account locked" summary again, with its reason.
   - Retrying does no harm, because sign-in.ts refuses a locked account before trying any credential.
   - So the defect is one misleading instruction that does not fit a locked account, not a loop with no explanation.

3. Rate limit: refuted. "Too many attempts in a short time. Wait N minutes and try again." and "type it again" read as one sequence: wait, then type it again. They do not contradict each other, and the summary sets the timing. No `noRetry` flag or next.ts change is needed.

Scope: the fix touches only form-issues.tsx and its tests. That needs no migration, none of those files is in pr42-files.txt, and the wording is a 10.2 amendment recorded in 12.1 with no founder decision.
- **Fix:** Change apps/web/src/components/form-issues.tsx only; next.ts stays as it is.

(a) Locked:
- Add `locked: boolean` to FormIssuesContext. Set it in FormIssues' useMemo to `state.locked === true`; the default is false.
- In EmptiedNote, show the password note as 'Emptied for your security: type it again.' only when the form is not locked. When locked, show 'Emptied for your security.' (the same words as the code note).

(b) Dropped connection:
- Make `emptySecrets(form)` return whether the form holds any secret control: `[data-secret], input[type=password], [autocomplete=one-time-code]`.
- In Summary's layout effect, store that result as `secrets` in `placement`.
- Pass it to RefusalLead as an optional prop, `secrets?: boolean` (default false, so the export form's call is unchanged).
- When `state.unconfirmed` and `secrets` are both true, the lead reads: "The connection to PaidWhole dropped before an answer came back. What you typed is still here, except passwords and codes: check your connection, type them again, then press “{submit}” again." Otherwise it keeps today's sentence. `unconfirmed` exists only in the browser, and the layout effect's setState lands before paint, so the old sentence never flashes.

Tests and records:
- In action-form.browser.test.tsx, add one case for a locked refusal (password note without "type it again") and one for a drop on a form with a password (the new lead).
- In fields.test.tsx, add one case for the locked context.
- Record the two wordings as a 10.2 amendment in 12.1 and ADR 0077.

### U-UX-4: After "Not confirmed", the press the page invites can come back titled "Not done" although the first press saved

- **Where:** `apps/web/src/lib/http/next.ts:206`
- **Detail:** RefusalLead invites 'press “{submit}” again' after a dropped connection (form-issues.tsx:440). When the first post did save and only the answer was lost, the page still holds the used request key. The second press is a 'duplicate' (invoke.ts:251-252), and runAction maps it to { error: 'This form was already submitted. Reload the page to see the result.' } (next.ts:206). The summary titles every error state 'Not done' (form-issues.tsx:413), so the person reads 'Not done' over a record that exists, and the page does not refresh to show it. Design 12 row 4 knows the replay 'does nothing' but not what it says. Not on any shot; judged from the code. Rule: a state's words match the record (baseline); PRD.md:256.
- **Failure:** On a train, a billing manager opens a support ticket. The ticket saves but the answer drops, and the page says 'Not confirmed… press “Open ticket” again'. They press, see 'Not done', conclude it failed, and retype the ticket in a fresh page, creating a duplicate ticket.
- **Verifier:** I traced this in the code at 4f0b526 and could not refute it. The path, using the support form (app/support/page.tsx:51, ActionForm, FormKeys, no refreshOnError):
1. The first press goes through useGuardedSubmit's browser hook. The server claims the request key and creates the ticket in one transaction (invoke.ts:251 then handle). The answer is lost, fetch throws a TypeError with no digest, and the hook returns { unconfirmed: true, seq } (form-issues.tsx:198-201).
2. The summary is titled "Not confirmed" and RefusalLead invites 'press “Open ticket” again' (form-issues.tsx:440). Nothing reads the page again for an unconfirmed state: RefreshAfterRefusal runs only for stale or refreshOnError (action-form.tsx:78). So the hidden requestKey is still the used one.
3. The second press sends the same key. claimRequestKey hits ON CONFLICT DO NOTHING and the route returns { status: 'duplicate' } (invoke.ts:251-252). A duplicate means an earlier transaction with this key committed: the key and the work are claimed together, and a thrown handler rolls both back.
4. runAction: signInFor, refusedInput, forbidden, not_found and suspended all pass, so it returns { error: 'This form was already submitted. Reload the page to see the result.' } (next.ts:205). The browser hook spreads only that object plus seq, so unconfirmed is gone. kind becomes 'error' and AlertTitle reads "Not done", in the destructive variant, with the focus on it (form-issues.tsx:410-413). The version form's RefusalSummary does the same.

So a red "Not done" sits over a record that exists, on the path the PR's own words invite. The design's dispositions do not settle this. Section 2.1 records the exact answer ("answers 'This form was already submitted…'") and 3.5 keeps "Not done" for every state except locked and unconfirmed. Neither weighs the title against a saved record, and nothing in 12, 12.1 or the build records decides it. So the finding's claim that the design does not know what the replay says is inaccurate. The defect stands anyway. The design changed "Not sent" to "Not confirmed" because a title must not deny a save that may have happened. The same reasoning applies more strongly here, where the save certainly happened.

On the base, e908c21, the words and the "Not done" title are the same (old action-form.tsx:94, next.ts). The duplicate could be reached there too, after the error page's reset kept the same RSC payload and key. What this PR adds is an explicit invitation that leads straight to it, so it is "made reachable by" this PR rather than newly written.

What lowers the risk: the lead is accurate and gives a next step (PRD 6, "every error shown with a next step", is met). On /support a reload lists the ticket under "Your tickets". The duplicate-ticket harm in the scenario needs the person to skim past "already submitted", so it is less likely than claimed. I still rate it should-fix, not polish: the PR exists so that refusal states say the true thing, and the title is the part read first and announced first.

The proposed fix has a flaw: do not use router.refresh for this state. Refreshing re-renders FormKeys with a fresh request key while ActionForm keeps the typed values (that is the stale mechanism). The next press would then create a real second ticket, which is the exact harm the finding wants to prevent. Keep the reload to the person, as the lead already says. A real reload remounts the form and shows the result.

Scope: next.ts, form-issues.tsx and export-status.tsx are not #42 files. No migration and no founder decision is needed. No test asserts the duplicate text.
- **Fix:** Keep the server's words and the person's reload. Only flag the state and change the title:
1. apps/web/src/lib/http/next.ts: add `readonly duplicate?: boolean` to ActionState (comment: the request key was used before, so an earlier post with it saved, and this one did nothing). Change line 205 to `return { error: 'This form was already submitted, so nothing new was saved. Reload the page to see the result.', duplicate: true };`. Keeping the old words is acceptable; the flag is what matters.
2. apps/web/src/components/form-issues.tsx: add `readonly duplicate?: boolean` to RefusalState. In Summary, set `const kind = state.locked === true ? 'locked' : state.unconfirmed === true ? 'unconfirmed' : state.duplicate === true ? 'duplicate' : 'error';` and give it the title 'Already sent' (data-state="duplicate"). The lead stays summaryLead's state.error.
3. Do NOT render RefreshAfterRefusal for this state in action-form.tsx or version-form.tsx. An in-place refresh renders a fresh request key under the kept values, and the next press would save a real second record.
4. Optional, for consistency: apps/web/src/components/packets/export-status.tsx:110 uses the same title switch when state.duplicate is set.
5. Tests: in lib/http/next.test.ts, a duplicate outcome maps to { duplicate: true } with no value echoed. In action-form.browser.test.tsx, a harness state { error, duplicate: true } titles 'Already sent', not 'Not done'. Optional e2e in forms-keep-input.spec.ts FRM-01 step 5: page.route lets the first POST reach the server (route.fetch) and then aborts it; the second press shows 'Already sent', and a reload lists the ticket once.

### U-UX-5: /support's email route lost its no-patient-information warning when the sentence moved into the field hints

- **Where:** `apps/web/src/app/support/page.tsx:46`
- **Detail:** Before, the card said 'Or write to support@… from the address you sign in with: the mail opens a ticket here too. Never send a patient's name, date of birth, member ID or claim number: name the screen and the record's ID from its address instead.' The warning covered both the form and the email. After (`support.default.390`, `support.error.390`), the card ends at 'the mail opens a ticket here too.' The rule now lives only in the two fields' hints (page.tsx:19, 55-56), which a person who emails never sees. Design 10.2 moved the sentence for the form's sake; nothing replaces it for the email. Security reviewer: please confirm (CLAUDE.md's Never list, PHI in an email body).
- **Failure:** A front-desk user taps the support address on their phone and emails a screenshot description naming a patient and a claim number. Nothing on the page now told them not to.
- **Verifier:** I could not refute this finding.

1. The change is in this PR. At e908c21, apps/web/src/app/support/page.tsx:43-45 ends the card with "...the mail opens a ticket here too. Never send a patient's name, date of birth, member ID or claim number: name the screen and the record's ID from its address instead." At 4f0b526, page.tsx:45-48 stops at "the mail opens a ticket here too." The rule now appears only as the `hint` on Subject and Message (page.tsx:19, 55-56). The hints are wired to those inputs through `aria-describedby` and read as instructions for those two fields.

2. The email route is real and stays open. The `mailto:` link sits in the same card text (page.tsx:46). Mail to that address opens a ticket through apps/worker/src/support/support-mail.ts. Two things limit the damage, but neither makes the warning unnecessary:
   - `screenMail` withholds text that `writtenPhiFindings` flags, so the desk sees only a withheld notice. But the raw mail stays in the SES/S3 inbox until its lifecycle rule expires it (support-mail.ts header comment), and the screen works on patterns. It catches a name only after a word that introduces a person (lib/routes/support.ts:236-240), so a bare patient name can reach a ticket the desk reads without a support grant.
   - The sender's own mail system also keeps the message.
   So a person who taps the link and writes a patient's name or claim number now gets no warning on the page that offers the link. On the base, that same page told them not to.

3. Nothing on record decides it.
   - Design 5.4 and 10.2 say only that the sentence "moves into the hints". They follow the UX review's UX-077/a11y-other-20, which is about tying the rule to the fields for screen readers and never mentions the email route.
   - Section 12 (findings 1-23) and 12.1 have no row about it.
   - ADR 0077 (D9) covers only `pattern` format hints.
   - Build record build-D.md says only "app/support (hints, card sentence moved)".
   - No test asserts the card text either way: no e2e spec, unit test or screen-tour assertion.

4. Other places that show the address, /status (page.tsx:79) and /maintenance (page.tsx:30), had no warning on the base either. They are outside this finding and could be a separate proposal.

5. It can be fixed in this PR. apps/web/src/app/support/page.tsx is not on the #42 list. The fix changes words only: no migration, nothing on a legal surface, nothing the founder has to decide (the wording follows the rule the founder already accepted).

Severity is should-fix rather than blocking because the server-side screen holds back most flagged mail from the desk, but the PR does weaken a no-patient-information safeguard.
- **Fix:** Keep both field hints, and give the email route its own sentence again in the card. In apps/web/src/app/support/page.tsx:45-48, the `CardDescription` should read: `We answer within {responseTarget}. Or write to <a className="underline" href={`mailto:${supportEmail}`}>{supportEmail}</a> from the address you sign in with: the mail opens a ticket here too. A mail takes no patient information either: no names, dates of birth, member IDs or claim numbers.` (Write the apostrophes as `&apos;` if any are added.) This also follows the house rule of a colon, not a parenthetical. Record it as a row in design 12.1, with the reason "the card's sentence also covered mail to the support address, which the field hints do not reach", and update 10.2's /support card row to match. The screen tour's support.default and support.error captures will change; no test needs to change.

### U-A11Y-1: Essential instructions moved into 12 px hints (password policy, no-PHI rule, formats), off the brand's type scale

- **Where:** `apps/web/src/components/field.tsx:47`
- **Detail:** Hint renders `text-xs` (12 px; field.tsx:47). This PR moves the password policy out of the 16/24 card description into it (`sign-in-new-password.default.390`: before 'Choose your own: at least 12 characters, with a lowercase letter…' at 16 px, after the same rule at 12 px under the field). It does the same for the /support no-patient-information rule (`support.error.390`) and adds the code, NPI, Tax ID and SHA-256 format hints in it. ADR 0056's one type scale names 16/24 for running text and 14 for dense controls. 12 px is only a dashboard tile's label (BRAND.md:125), and the FieldError beside these hints is already 14. The PR touches Hint's cause: it rewrote field.tsx and exports Hint.
- **Failure:** An invited user on a phone has to read a 12-character, four-class password rule in 12 px slate text under the field. They miss 'a symbol' and are refused.
- **Verifier:** I tried to refute this and could not. Three parts of the claim hold at 4f0b526, and the two parts that would weaken it don't change the result.

1. The 12 px hint is real. `Hint` in apps/web/src/components/field.tsx:47 renders `text-xs`. No brand theme overrides `--text-xs` (I searched packages/brand/src, packages/ui/src/styles.css and apps/web/src/app/brand.css), so Tailwind's 0.75rem gives 12 px.

2. This PR moves essential instructions from 16 px into that 12 px. At e908c21, sign-in/new-password/page.tsx put the policy ("at least 12 characters, with a lowercase letter, an uppercase letter, a digit and a symbol") in `CardDescription`, which is `text-base` (16/24, card.tsx:26, the same at both commits). At 4f0b526 the card says only "Choose your own." and the policy is the `hint` of the new `PasswordField`, which renders `<Hint>` at 12 px. support/page.tsx does the same with the no-patient-information rule: it was 16 px card text at the base and is now the Subject and Message hints at 12 px. That rule is a privacy instruction. The PR also adds new 12 px hints: the code hint, NPI, Tax ID, SHA-256, year/carrier/locality and the ledger amount.

3. It is off the brand's type scale and inconsistent with the PR's own changes. ADR 0056:49-51 says "One type scale": 32/20/18 headings, 16/24 running text, 14 for tables and dense controls. BRAND.md:125 and the UX review's UX-104/UX-106 allow 12 px only for tile labels and chips, and UX review line 4865 calls an unlisted size "a size the type scale lacks". In this same PR, `FieldError` (`data-field-error ... text-sm`, form-issues.tsx:110) and `EmptiedNote` (text-sm, :131) moved to 14 px, and below md the control itself is 16 px. That leaves the hint as the only 12 px element in each field. The PR also extracted and exported `Hint`, so it changed this component directly.

No recorded decision covers it. Sections 12 and 12.1 of the design, ADR 0077 and the build records say nothing about hint size. Section 6.3 says "The rules stay visible, now tied to the field" but never addresses the drop from 16 px to 12 px.

What weakens the finding:
- It is not a WCAG failure. Slate #526070 on white is about 6.4:1, which passes AA at 12 px. Dark mode is #A7B1C2 on #0B1626. WCAG sets no minimum text size, and pinch zoom stays available.
- 12 px hints already existed at the base: field.tsx base:39, split-form.tsx base:68, and coverage/page.tsx base:451. About 200 `text-xs` uses exist app-wide, so the off-scale hint itself is not new.
- The failure scenario overstates the outcome. A refused password now gets "it still needs a symbol" at 14 px on the field (design 6.3), so the person recovers in one more try rather than getting stuck.

What this PR adds is the move of two essential instructions, one of them a privacy rule, from 16 px running text into 12 px. That is a readability regression against the ADR 0056 type scale, and it is cheap to fix: no test pins the hint class (I searched the unit, browser and e2e tests for hint plus `text-xs`). field.tsx, split-form.tsx and coverage/page.tsx are not in pr42-files.txt. upload-form.tsx (line 209/219 hints) is a #42 file and must stay as it is. No migration is needed, and the founder doesn't need to decide anything, because 14 is already on the scale and is the size of the FieldError beside the hint.
- **Fix:** In apps/web/src/components/field.tsx:47, change `Hint`'s class from `text-xs text-muted-foreground` to `text-sm text-muted-foreground`. That puts it at 14 px on the ADR 0056 scale, matching FieldError and EmptiedNote. `Hint` is the only hint renderer for Field, SelectField, TextAreaField, CheckboxField, CheckboxGroup and PasswordField, so this one change covers the moved password policy, the moved no-PHI rule and every new format and code hint.

Optional, for consistency in non-#42 files: make the same `text-xs` to `text-sm` change on the hand-written hints at apps/web/src/components/screening/split-form.tsx:106 and apps/web/src/app/p/[practiceId]/coverage/page.tsx:453. Both already existed at the base.

Leave alone: upload-form.tsx (a #42 file). packets/reference-search.tsx is not a #42 file and this PR doesn't touch it, so list it as a follow-up proposal rather than change it here.

No test asserts the old class. Re-run the screen tour at 390 px to confirm the new-password and support screens still fit.

### U-A11Y-2: The split form's live problem list speaks while the person types

- **Where:** `apps/web/src/components/screening/split-form.tsx:171`
- **Detail:** `<div id="split-problems" role="status">` holds a list recomputed from state on every keystroke (built = useMemo(splitSettings(facility, nonFacility)), shown when either field is non-empty). Typing '2' then '22' into Non-facility announces 'Place of service 2 is not a two-digit code' and then 'Place of service 22 is listed as both…' mid-word. `console.screening.error.390` shows the list live under both fields. This follows the baseline's own best fix for a11y-other-09, but the reviewer rule is that a live check stays quiet while the person types (4.1.3). Screen-reader behaviour not checked; judged from the code.
- **Failure:** A contract specialist using a screen reader types a list of place-of-service codes. Each keystroke queues a polite announcement of a transient problem, burying the character echo.
- **Verifier:** I tried to refute this and couldn't. The finding's example is wrong, but the defect is real.

**What the PR does.** At 4f0b526, split-form.tsx:171-179 wraps the visible problem list in `<div id="split-problems" role="status">`. The list comes from `built = useMemo(splitSettings(facility, nonFacility))` and is shown once either field has text (:130-132), so it changes on every keystroke. Each `<li>` is keyed by its problem text. Any problem that newly appears adds a node to a polite live region, which is announced (aria-relevant defaults to additions and text). When a problem goes away its node is removed, and removals are not announced.

**Not on the base.** At e908c21, split-form.tsx:109-115 renders the same list with no live region. It was silent, which was a11y-other-09's complaint. So the chatter is introduced by this PR.

**Where the finding is wrong.** It says typing '2' announces "Place of service 2 is not a two-digit code". No such message exists, and splitCodes pads a single digit, so '2' becomes '02', which is valid.

**The real trigger paths.** I ran the PR's splitCodes and splitSettings logic one keystroke at a time and counted only additions:
- **A leading '0'.** Typing '0' of any code 01-09 becomes '00', which is invalid. "Each place of service is a two-digit code from 01 to 99." is announced, then disappears silently when the second digit is typed. Typing facility "02 06 08 19 21 22" from empty announces it three times. The first time it also announces "List at least one place of service."
- **A padded first digit that matches the other list.** When editing an existing split (the form starts with the split in force), the first digit of a code collides with a 0X code in the other list. With non-facility "01 03 04 05 11 12", typing facility "... 19 ... 31 34 41 51" announces "Place of service 01 / 03 / 03 / 04 / 05 is listed as both facility and non-facility." These are codes the person never typed.

In both paths the field ends with no problem. The last thing a screen-reader user heard is an error that does not exist, and nothing tells them it has cleared.

**No recorded decision covers this.** Design 4.6 and ADR 0077 only adopt a11y-other-09's "role=status from the first render". Neither section 12, 12.1, the review nor the build records say anything about announcements while typing. The reviewer's rule (lane-b-ux-brand-reviewer.md:382-385, WCAG 4.1.3) says a live check does not re-announce while the person types, and it cites baseline a11y-practice-1-26, which describes this same pattern.

**Severity.** The baseline rates that analogue polish, but it only re-announced counts. Here the form announces false errors and never clears them, which harms the task. That is should-fix under the reviewer's section 3.

**Limits.** Judged from the ARIA semantics plus the simulation (/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/sim.mjs). No screen reader was run. The e2e step (#42's screening.spec.ts:160-161) uses fill(), so it never sees the transients.

**In scope.** The files to change are split-form.tsx, forms.test.tsx and action-form.browser.test.tsx (none is a #42 file), ADR 0077 (created by this PR) and design 12.1. No migration and no founder decision is needed.
- **Fix:** In apps/web/src/components/screening/split-form.tsx (:171-179):

1. **Visible list stops being live.** Remove role="status" from `<div id="split-problems">`. Keep the id and the visible `<ul>`, so the list still updates as the person types and stays the faulty fields' aria-describedby target, read when focus lands on a field.

2. **New hidden status line.** Add a visually hidden `<p role="status" className="sr-only" data-slot="split-status">`, rendered from the first render. Its text is a `said` state holding the shown problems joined, set at three moments:
   - 1 s after the last change to either list: one timer, reset on each change and cleared on unmount, as in baseline a11y-practice-1-26's best fix.
   - At once on blur of either CodesField.
   - On a press with problems: in beforeSubmit, inside the same flushSync as setPressed, cancel the timer and set it. Key the text by a press count so a repeated press is said again, as RefusalSummary does. This matters because Enter inside the already-focused faulty field moves no focus, so its description is not re-read.

   When the problems clear, empty it silently.

3. **Tests.**
   - forms.test.tsx:79 and :83: assert the visible div has no role, and that the status line is present and empty from the first render (with server-rendered problems: visible list, empty status line).
   - action-form.browser.test.tsx: type '0' then '2' with keyboard.type and assert the status line stays empty. Assert that a pause or blur says the settled problems, and that Enter in a faulty field says them.

4. **Records.** Add a 4.6 amendment row to design 12.1 and a line to ADR 0077, recording the departure from a11y-other-09's best fix and citing the reviewer's live-region rule and a11y-practice-1-26.

### U-UX-6: The write-off Reason and the payer Response were rewritten as SelectFields but still open pre-answered

- **Where:** `apps/web/src/app/p/[practiceId]/cases/[caseId]/page.tsx:222`
- **Detail:** This is baseline flows-practice-07: 'Window passed' and 'Accepted' are preselected on choices that record a fact. This PR rewrote both selects (cases/[caseId]/page.tsx:222; submissions/page.tsx:283) without the first empty option the baseline asks for, so per the brief it is the change's own (touches its cause). With values now kept after a refusal, the first press is where a wrong default is recorded unnoticed. Seen in `p.case.error` and `p.submissions.error` as kept values; design 11.2.6 defers it.
- **Failure:** A person writes off a line whose window is still open (the line in `p.case.error.390` is open to 2036) without opening Reason, and records 'Window passed', a false reason.
- **Verifier:** I could not refute the failure, but it is a baseline defect that #74 carried over unchanged. It did not cause it and did not make it worse.

What happens at 4f0b526: cases/[caseId]/page.tsx:222 builds the write-off Reason SelectField from WRITE_OFF_REASONS (packages/triage/src/cases.ts:93). 'window_passed' is first in that list and there is no empty option, so `required` never fires. A person opens "Write this line off", ticks the required confirmation and presses Write off. That records 'Window passed'. writeOffLineAction (apps/web/src/lib/routes/triage.ts:464-495) accepts any z.enum value and never checks line.windowPassed. caseLineState already loads that value, yet only the reopen route uses it. So the line is written off as "Written off: Window passed, by <person>" while its window is still open, which is a false fact in the audit record. The payer Response (submissions/page.tsx:283) also opens on 'Accepted'. That half is weaker: routes/submissions.ts:235-238 refuses 'accepted' when no amount is given, so a hurried press is refused there. But the refusal names Amount, not Response.

Attempts to refute:
1. The same thing happens on the base. At e908c21 both raw selects had the same options, the same order, `required` and no empty option. #74's diff only rewraps them in SelectField.
2. #74 does not make it worse; it improves it. The finding says kept values make "the first press" the danger point, but the first press is the same on the base. The base also had a second path: a refusal reset Reason to 'Window passed', so a second press recorded it (design section 1, a11y-practice-1-03). #74 closes that path, and triage.spec.ts:139-166 asserts it.
3. A deferral is on record. Design 11.2.6 lists it as "a flows fix", even though slice C1 knowingly rewrites this page. The baseline's UX-001 entry (lane-b-ux-review.md:1532) puts these two pre-answered selects under UX-035 (C-065). UX-035 was re-graded to blocking at baseline and is closed by UX PR 10 `co-001/ux-payer-response`, which depends on ux-forms (lines 92, 293-300). Sections 12 and 12.1 have no row on it.
4. The reviewer brief makes it #74's own only if, in a Lane B PR, the change "touches its cause". #74 re-expressed the cause (the options list) unchanged, so the finding holds only in that weak sense. The brief's should-fix category does allow "deferred with where it is tracked".

#74's description does not list UX-035 as still open.

Scope: no migration and no file from pr42-files.txt. The files would be the two pages, routes/triage.ts, routes/submissions.ts and the triage route/db test. The wording ('Choose the reason', 'Choose the payer's answer') was already chosen under the co-founder's ruling. Nothing needs the founder. Every e2e that submits these forms already chooses explicitly: triage.spec 'Other', export-attempts.ts and unattested.spec 'Not worth pursuit', packets.spec 'partial'. So none of them depend on the default.

The finding's proposed fix is incomplete. Hiding 'Window passed' only in the page leaves the handler accepting it (CLAUDE.md: check in the handler, not the UI alone). Also, an empty value posted without JavaScript would hit z.enum's default message.
- **Fix:** Either fix it fully in #74, or explicitly defer it with where it is tracked.

Fixing it in #74:
1. cases/[caseId]/page.tsx:222: options={[{ value: '', label: 'Choose the reason' }, ...WRITE_OFF_REASONS.filter((reason) => reason !== 'window_passed' || line.windowPassed).map((reason) => ({ value: reason, label: writeOffText(reason) }))]} and keep `required`. An empty first option makes it the placeholder option, so browser validation blocks an unchosen press, and the kept value survives a refusal.
2. submissions/page.tsx:283: options={[{ value: '', label: 'Choose the payer’s answer' }, ...PERSON_RESPONSE_KINDS.map(...)]} and keep `required`.
3. lib/routes/triage.ts writeOffLineAction:
   - Change the input to z.enum(WRITE_OFF_REASONS, { message: 'choose the reason' }).
   - After caseLineState, add: if (checked.data.reason === 'window_passed' && !line.windowPassed) throw new InputError([{ field: 'reason', message: 'the line’s dispute window is still open: choose another reason' }]).
4. lib/routes/submissions.ts:225: change it to z.enum(PERSON_RESPONSE_KINDS, { message: 'choose the payer’s answer' }).
5. Add one route/db test: the write-off refuses 'window_passed' on an open-window line and names 'reason'. Also add an FRM e2e assertion that Reason opens on 'Choose the reason'.
6. Record the change in design 12.1, and retire 11.2.6 and the select half of UX PR 10.

Deferring instead: list UX-035 (flows-practice-07) in #74's description as a still-open baseline finding (blocking at baseline). Say #74 neither changed nor worsened it, and that it is tracked by UX PR 10 `co-001/ux-payer-response` per design 11.2.6. UX PR 10 must include the server-side refusal in step 3.

### U-A11Y-3: Show password has no visible pressed state

- **Where:** `apps/web/src/components/password-field.tsx:86`
- **Detail:** The toggle keeps the word 'Show' and sets aria-pressed (password-field.tsx:86-98), but buttonVariants has no aria-pressed style (button.tsx). Pressed or not, it looks the same; only the field's text gives the state away (`sign-in.default.390`, `sign-in-new-password.default.390`). Recommendation.
- **Failure:** A person who pressed Show and looked away cannot tell from the button whether the password is shown before handing over the phone.
- **Verifier:** Checked against the code at 4f0b526. In apps/web/src/components/password-field.tsx (lines 86-98) the toggle is `<Button variant="outline" size="sm" aria-pressed={visible}>Show<span className="sr-only">{showName}</span></Button>`. Nothing on it changes with `visible` except the aria-pressed attribute. In packages/ui/src/components/button.tsx the outline variant is `border bg-background hover:bg-accent hover:text-accent-foreground`, and the base classes cover only disabled and aria-disabled. A search of 4f0b526 finds no `aria-pressed:` class and no `[aria-pressed]` rule in any .css or .tsx file. The only rule keyed on an ARIA state is the aria-invalid rule at packages/ui/src/styles.css:92. Tailwind v4 puts `hover:` inside `@media (hover:hover)`, so a tap on a 390 px phone leaves no stuck hover, and a mouse click does not trigger focus-visible. Pressed or not, the button looks the same, which matches screens-after/png/sign-in.default.390.png. The PR introduced this: password-field.tsx does not exist at e908c21.

Design dispositions: section 5.3 fixes the visible word "Show", the accessible name "Show password", aria-pressed, the outline/sm Button and no style attribute. It says nothing about how the pressed state looks. Neither section 12 (rows 9, 19 and 20 are about this toggle) nor 12.1 records a decision to leave the pressed state unstyled, so this is not a decided point.

Partial refutation: the failure scenario overstates the harm. The field right beside the button shows the state (plain characters or dots), and an empty field reveals nothing. So a person can tell whether the password is shown by looking at the field. What remains is a real but small defect: for a sighted person, a button that always reads "Show" and looks the same in both states gives no sign that it is pressed, and pressing "Show" again hides the password. The ARIA toggle-button pattern keeps the label fixed and expects the pressed state to be visible. Polish is the right severity.

The finding's second fix (change the visible word to "Hide" while pressed) should be rejected. It contradicts the decision in design 5.3: the visible word "Show", and a name that never changes, as the ARIA pattern requires for an aria-pressed toggle. It would also break FRM-07, because forms-keep-input.spec.ts:261-286 finds the pressed button by the name "Show new password". The first fix is sound. Tailwind v4 has a built-in `aria-pressed:` variant (it matches aria-pressed="true"), and packages/ui/src/styles.css:9 has `@source "./"`, so classes written in button.tsx are generated. In the theme, bg-secondary is --pw-bg-inset (#EFF1F4 light, #122844 dark), not an Ink fill, so it keeps BRAND.md's rule that Ink fills belong to the primary button. border-foreground is Ink in light mode and #F4F6FA in dark mode, a strong change from the unpressed --pw-border line colour in both themes. button.tsx and password-field.tsx are not on the #42 list, button.tsx is already changed by this PR, and nothing needs a migration or a founder decision. Only one element in the codebase uses aria-pressed, so the shared variant changes this toggle alone, and only while it is pressed. The screen-tour shots, all unpressed, do not change.

Proposals (outside this verification): add the shown state to the screen tour (for example sign-in.password-shown.390), and add a line to design 12.1 / ADR 0077 D8 saying how the pressed toggle looks.
- **Fix:** In packages/ui/src/components/button.tsx, extend the outline variant so a pressed toggle is visibly different, with the visible word and accessible name unchanged:

outline: 'border bg-background hover:bg-accent hover:text-accent-foreground aria-pressed:border-foreground aria-pressed:bg-secondary',

(Tailwind v4's aria-pressed: matches aria-pressed="true"; bg-secondary is the bg-inset surface, not Ink; border-foreground is Ink in light mode and near-white in dark mode.) Keep "Show" and aria-pressed in password-field.tsx as design 5.3 decides; do not switch the word to "Hide". Optionally pin it with one assertion, either in the PasswordField unit/browser test or in FRM-07's e2e step: after the press, the toggle carries the pressed style (its border colour differs from the unpressed one). Then record the pressed look in design section 12.1 (row for 5.3) and ADR 0077 D8.

### U-UX-7: Summary items stack two or three colons

- **Where:** `apps/web/src/lib/routes/sign-in.ts:184`
- **Detail:** The house form '{name}: {instruction}' meets messages that hold their own colon. 'New password again: the two passwords do not match: type the same password in both fields' (`sign-in-new-password.error-mismatch.390`). 'Date it happened: the date is after today: enter the day it happened, today or earlier' (`console.compliance.error.390`). 'Organization: this form takes no patient information: remove anything…, then send it again' (`request-audit.error.390`). 'New password: the sign-in service refused it: choose a different password' (sign-in.ts:76). Plain words (recommendation).
- **Failure:** A reader parses 'X: Y: Z' as nested labels and misses which part is the instruction.
- **Verifier:** The strings are quoted correctly, but the finding is a recorded wording decision, not a defect.

What 4f0b526 does:
- The summary renders each item as `${target.name}: ${message}` (form-issues.tsx:464, :423).
- So the person sees "New password again: the two passwords do not match: type the same password in both fields" (sign-in.ts:184), and likewise for sign-in.ts:76, compliance.ts:151 and onboarding.ts:34.
- The label is not set apart: the whole item is one underlined link.

Why it is not a defect:
1. The decision is recorded. Design section 12, row 14, says the colon house form is applied and points to 9.3, the table of recommended wordings the design replaced, which was reported to the co-founder. That table names the clause-break question and both exact strings in question: "New password again: the two passwords do not match: type the same password in both fields" and "Organization: this form takes no patient information: remove anything …". 10.2 and 10.3 list all four strings, and 10.3 says "Every one keeps the house form". ADR 0077 records the co-founder's delegated rulings, each reversible only by the founder.
2. The stacked colons are not new in this PR:
   - Base e908c21 already had about 20 messages with a colon inside, including onboarding.ts:34's own "this form takes no patient information: remove …", compliance.ts:213, reconciliation.ts:131, support.ts:375 and contracts services.ts:611.
   - The base summary printed "{key}: {message}" (action-form.tsx:101), so base already showed two colons, behind a raw key.
   - So introducedByThisPR is only partly true: the request-audit case existed before.
3. The colon form is shared with code this PR cannot change. #42's screening/routes.ts:280 `NO_PATIENT_INFORMATION` holds the same sentence with the same colon, and support.ts:247 is unchanged by design. Changing onboarding.ts:34 alone would make the two "no patient information" messages differ, the drift that 9.3's rationale guards against.
4. The proposed fix is not clearly plainer. Semicolons are a known plain-language hazard, and GOV.UK style advises avoiding them. The colon form is also the PR's own voice in the new leads and notes: "What you typed is still here: check your connection…" and "Emptied for your security: type it again."
5. The failure cannot be shown. Each message is a fact clause then an imperative clause, and the imperative ("type…", "enter…", "choose…", "remove…") is plainly the instruction. Nothing in the code makes a reader lose the next step.

One fair point remains. The codebase does mix separators: about 37 non-test messages use "fact; next step" and about 18 use "fact: next step". So 9.3's "one form across 112 forms does not drift" is not literally true. The design even moved organizationId from a semicolon to a colon. That is a whole-codebase words question. ADR 0077's "Revisit when" defers it to the words pass after #42, because one rule needs #42's screening file too.
- **Fix:** No change in this PR. Proposal, outside this PR: in the words pass after #42 (ADR 0077, "Revisit when"), choose one separator for the clause inside a message, colon or something else, and apply it to every route message, #42's screening/routes.ts included. Record the choice in ADR 0077's successor and in design 9.3, 10.2 and 10.3. If the founder then prefers to stop the stacked colons, the smallest consistent version is: change the four strings named in the finding, plus `NO_PATIENT_INFORMATION` (screening/routes.ts:280, a #42 file) and support.ts:247, together with the tests that assert them (forms-keep-input.spec.ts:108 and :299, and sign-in-routes.db.test.ts:177).

### U-UX-8: At 390 px the 16 px rule clips a select's chosen text

- **Where:** `packages/ui/src/styles.css:107`
- **Detail:** `console.compliance.error.390`: What reads 'Policy approved by the security officia' (at 14 px before, the full text fit). `p.contracts.error.390`: Contract reads 'SYNTHETIC PAYER C AGREEMENT (SYNT'. `p.cases.default.390`: Pricing run '…(release ‘' (already clipped before, more now). Baseline class: a select's chosen text readable at 390.
- **Failure:** A person on a phone cannot see which contract or policy the form is about to record without opening the select.
- **Verifier:** The finding is partly real. Two of its three examples are new in this PR. The contracts example is not.

The cause is the 16 px rule this PR adds under @media (width < 48rem) in packages/ui/src/styles.css (lines 103-110 at 4f0b526). It does not exist on e908c21, where SelectField is text-sm (14 px) at every width. Nothing in design section 12 or 12.1 records a decision about clipped select text, and neither do sections 5.1 and 10.1 or ADR 0077's D6, "Not covered" and "Not verified here".

At 390 px the select is about 308 px wide in both pages (measured on the reviewer's screenshots revux-work/comp390.png and cases390.png). The real app clips between "officia" and "official", so the text has about 274-277 px. I measured the brand font (IBM Plex Sans 400) in pinned Chromium (scratchpad/verify-ux8):

1. Compliance "What" (console/compliance/page.tsx:186; labels in lib/routes/compliance.ts:42). "Policy approved by the security official" is 242 px at 14 px and 278 px at 16 px. "Quarterly vendor and data-flow review" is 242 px and 278 px. So the PR causes the clip, but it costs only the last letter. The kind stays unambiguous, so "cannot see which policy" overstates it. The Policy select itself shows "Access control 0.1" in full.

2. Pricing run (cases/page.tsx:76, and the same label at reports/page.tsx:97). With realistic one- or two-digit release numbers, "2026-03-01 to 2026-03-31 (release 3)" is 242 px at 14 px (fits) and 289 px at 16 px (clipped). "release 12" is 250 px and 299 px. So the PR hides the release number, the one part that tells apart two runs of the same period: under rule 3 a new release means a new run. The person triages or reports on the chosen run without seeing which release it is unless they open the select. The tour's synthetic release 900001 measures 282 px, so it was already clipped at 14 px. That is why the reviewer saw "(release 9000(" before.

3. Contracts (components/contracts/forms.tsx:57). "SYNTHETIC PAYER C AGREEMENT (SYNTHETIC PAYER C)" is 357 px even at 14 px, so it clips on the base too. The reviewer's "before" shot is the base's reset form, the very bug this PR fixes, which showed the default "A new contract with this payer", so it is not a like-for-like comparison. The clipped part is also the payer name, which the Payer select right above already shows.

The 16 px rule itself must stay: it is decision D6, it stops iOS from zooming on focus, and the design records that choice. Severity is polish: nothing is lost for good, and opening the select shows every label in full. It can be fixed inside this PR. field.tsx, the four page files and reports.spec.ts are not in pr42-files.txt, and no migration or founder decision is needed.
- **Fix:** Keep the 16 px rule. In apps/web/src/components/field.tsx, give SelectField an optional `showChosen` prop. When it is set, render the chosen option's full text on a line under the select, below md only. Use `aria-hidden` on that line, since assistive technology already reads the select's value.
- Read the text from the DOM (`select.selectedOptions[0]?.text`), so a value kept after a refusal shows correctly: once in a mount effect, then on `change` and on the form's `reset`.
- Chain any onChange the caller passes.
- Style the line like the Hint line, with `md:hidden`, rendered after the Hint.

Pass `showChosen` to:
- triage-run in app/p/[practiceId]/cases/page.tsx:76
- report-run in app/p/[practiceId]/reports/page.tsx:97
- the What, Policy and Workforce member selects in app/console/compliance/page.tsx:186-188
- the Contract select in components/contracts/forms.tsx:51 (that clip predates this PR, but it costs nothing once the prop exists)

Add one browser or e2e assertion next to FRM-08: at 390 px, the triage run's chosen line reads the full label including "(release N)", and it follows a new choice. A narrower alternative fixes only the information that is lost: reorder the run labels so the release comes first (for example "Release 3: 2026-03-01 to 2026-03-31") on the cases and reports pages, and update e2e/reports.spec.ts:107's selectOption label. That alternative can still clip the end date at 16 px, and it leaves compliance's one-letter clip, so the chosen line is the better fix.

### U-UX-9: One field mixes apostrophe styles and names; a format hint and its error say the format differently

- **Where:** `apps/web/src/app/support/page.tsx:19`
- **Detail:** `support.error.390`: the Subject error says 'the record’s opaque ID' (curly) and its new hint says 'the record's ID' (straight, page.tsx:19). The SHA-256 hint is 'The document's SHA-256' (straight), while 'month’s' moved to curly in `account.notifications.default`. `console.terms.error.390`: the new error says 'use only letters, digits, dots, underscores and hyphens, such as 2026-11' under the unchanged hint 'Letters, digits and . _ - (for example 2026-11).' (console/terms/page.tsx:66). One apostrophe style; one name per thing (recommendations).
- **Failure:** A reader sees 'ID' and 'opaque ID' for the same thing under one field and wonders whether they differ.
- **Verifier:** I tried to refute this and could not. The failure happens as the finding describes.

Support field (traced at 4f0b526):
- A person types something the screen refuses into Subject, such as the e2e's own "A question about the date of birth column" (forms-keep-input.spec.ts:457). `screened('subject', …)` (lib/routes/support.ts:243-247) throws an InputError on `subject` whose words end "…name the screen and the record’s opaque ID instead". The apostrophe is curly.
- The new `Field` reads that issue through `useFieldIssue` (components/field.tsx:58-70) and renders `FieldError` and then `Hint` under the control.
- So the person sees "Error: … the record’s opaque ID instead" directly above the new hint "… Name the screen and the record's ID." (app/support/page.tsx:19). The hint uses a straight apostrophe and calls it plain "ID". The Message textarea does the same.

Base (e908c21):
- The Field was given no error, so the refusal showed only at form level.
- The card description said "the record&apos;s ID from its address" (straight).
- So "opaque ID" against "ID" already existed on the base, but on separate parts of the screen. This PR moves them under one field and writes the new straight-apostrophe string.
- "Opaque" is also an internal word, against the reviewer brief's rules of no internal names and one name per thing.

Terms Version field:
- The PR rewords only the server message (console-onboarding.ts:316, design 10.3) to "use only letters, digits, dots, underscores and hyphens, such as 2026-11".
- The hint at console/terms/page.tsx:66 is unchanged: "Letters, digits and . _ - (for example 2026-11)."
- Both now show under Version after a refusal. On the base the error ("letters, digits and . _ -") matched the hint's form, so this split is introduced by this PR. They do not contradict each other, but they describe one format in two styles. Screen readers at their default punctuation setting often do not read ". _ -", so the hint's version is also the weaker one.

Apostrophe style:
- This is not just taste. UX-168 (C-149) in /home/user/ops/designs/lane-b-ux-review.md:4688-4705 and :1419 records the co-founder's ruling: "the curly apostrophe and quotes in all product copy". UX PR 31 (co-001/ux-copy-lint) will add a straight-quote lint rule.
- The PR's new copy goes against that ruling: "record's ID" and the new compliance hint "The document's SHA-256" (copied from the terms page per design 5.4). Meanwhile "month’s" in account/notifications is correctly curly.

Design dispositions:
- Sections 12 and 12.1 record no decision on apostrophes or on the terms hint.
- Section 10.3 keeps the subject message "unchanged (its words already give a next step; only its key goes)". That limits what the PR changes; it is not a ruling that "opaque ID" stays. Changing it should get a row in 12.1.

Scope:
- None of support/page.tsx, lib/routes/support.ts, console/compliance/page.tsx or console/terms/page.tsx is in pr42-files.txt.
- No migration. No founder decision is needed; the apostrophe ruling already exists.
- The only test that reads the support message checks the prefix "Subject: a ticket takes no patient information" (forms-keep-input.spec.ts:459). No test reads the terms hint or the SHA-256 hint text.

It stays polish: nothing is refused wrongly and no value is lost. The cost is a moment of doubt about whether "ID" and "opaque ID" differ, and copy that goes against a recorded ruling.

Two things outside this finding that could be fixed while in these lines:
- console/billing/page.tsx:92 is edited by this PR and still renders "organization&apos;s" (straight). It could become ’ in the same pass.
- The new support hint dropped the base card's "from its address", which told the person where to find the ID. "Name the screen and the record’s ID from the page’s address." would restore that, but it departs from a11y-other-20's recommended words, so I list it as a proposal and not as part of the fix.
- **Fix:** Four string changes and one record. Each is a one-line edit in a file that is not in #42 and needs no migration.

1. apps/web/src/app/support/page.tsx:19 becomes:
   const NO_PATIENT_INFORMATION = 'No patient names, dates of birth, member IDs or claim numbers. Name the screen and the record’s ID.';
   (curly apostrophe)

2. apps/web/src/lib/routes/support.ts:247: drop "opaque" so the message ends "…and name the screen and the record’s ID instead". The e2e assertion at forms-keep-input.spec.ts:459 checks only the prefix and still passes.

3. apps/web/src/app/console/compliance/page.tsx:191: hint "The document’s SHA-256, 64 hexadecimal characters." Make the same change at console/terms/page.tsx:68, which is the source the compliance hint copies, so the two stay one string. Optionally do the same at console/organizations/[organizationId]/page.tsx:274 ("The signed document’s SHA-256, …").

4. apps/web/src/app/console/terms/page.tsx:66: hint "Letters, digits, dots, underscores and hyphens, such as 2026-11." This matches the reworded server message and avoids bare punctuation that screen readers skip.

Then add a row to section 12.1 of /home/user/ops/designs/lane-b-ux-forms.md (and to section 10.2/10.3's tables): the subject message drops "opaque", the support and SHA-256 hints use ’ under the co-founder's UX-168 ruling, and the terms Version hint takes the error's words.

### U-UX-10: Two refused states skip the pattern every other form now follows

- **Where:** `apps/web/src/components/hardware-key.tsx:118`
- **Detail:** `sign-in-hardware-key.error-no-credential.390`: the Problem alert still sits between Email and the button, not first in the form. `console.screening.error.390`: the split form marks both fields with the 2 px border but shows its problems as a red bullet list after both fields, with no "Error:" word or icon under a field. Section 10.1 says every refused state shows the summary at the top and the "Error:" line under each field. Consistency (baseline: each notice kind looks the same everywhere).
- **Failure:** A person learns that refusals appear above the form and under the field, then misses the hardware-key problem below the email on a short phone screen.
- **Verifier:** Half of this finding holds and half does not.

**Hardware key: real, but smaller than claimed.**
- At 4f0b526, `HardwareKeySignIn` (apps/web/src/components/hardware-key.tsx:106-122) renders in this order: the Email field, then `<Problem/>`, then `CeremonyButton`.
- At base e908c21 the password page (`/sign-in`) had the same order, so the two pages matched. The base 390 px screenshot shows "Not done" between Password and Continue.
- At the PR head, the password page's alert is first in the form, above Email. That is design 3.5: the summary renders "first inside the form, before the fields". The hardware-key page, one link away in the same sign-in flow, still puts its alert below Email (after-screenshot `sign-in-hardware-key.error-no-credential.390`).
- So the PR creates a new mismatch between two sibling sign-in pages. It also misses design 10.1's closing sentence ("Every refused state shows the summary at the top of the form"), and 10.1's table lists `/sign-in/hardware-key` error as a covered state. Design 4.4 does not say where the alert goes, and 12 and 12.1 record no decision on it.
- The stated failure (a person misses the alert on a short phone screen) is weak. `Problem` focuses its alert when it appears, which scrolls it into view, and it sits just above the button the person pressed. The real cost is consistency, so the severity is polish.
- `HardwareKeyRegistration` already shows its `Problem` first.
- No test depends on the order (the only use of `HardwareKeySignIn` is the page; the tour waits only for the alert to be visible), and hardware-key.tsx is not in pr42-files.txt.

**Split form: refuted.**
- Design 4.6 specifies this exact layout:
  - an always-present `<div id="split-problems" role="status">` that holds the list;
  - on each field at fault, `aria-invalid` plus `aria-describedby="split-problems {id}-hint"`, "and so the 3.7 mark".
- 10.1's own row for `/console/screening` error says "the split's live problems and marked fields", which is what was built.
- Where 10.1's closing sentence disagrees, the specific section 4.6 governs.
- The list's position below both fields is unchanged from base. The PR only added the field marks, the live region and the refusal to post while the lists have problems.
- The proposed fix (a `FieldError` under each `CodesField`) would print "Place of service 22 is listed as both facility and non-facility." twice, once under each field. It would also reverse a decision recorded in 4.6. That is a design change, not a fix within this PR. If wanted at all, it belongs in a proposal: for example, give the shared live region the "Error:" word and icon so it matches the 3.7 look.
- **Fix:** In apps/web/src/components/hardware-key.tsx, `HardwareKeySignIn`: move `<Problem message={error} locked={locked} title="Not signed in" />` to be the form's first child, before the `<div className="flex flex-col gap-1.5">` that holds the Email label and input. The order becomes Problem, Email, CeremonyButton, matching the password sign-in page and design 3.5 and 10.1. Change nothing else: the focus effect, title, status line and registration form stay as they are. Leave split-form.tsx unchanged, because design 4.6 decides its layout.

## e2e of the never-run specs

All seven specs now pass. The first run had one failure, and it was a test bug; I fixed it in the spec (uncommitted; nothing committed).

The worktree is /home/user/ux-forms (co-001/ux-forms at 4f0b526). I ran Chromium 1194 from /opt/pw-browsers against PostgreSQL 18 on 5433, using database `tp_e2e_uxforms` on port 4771, with `--workers=2` and each run under the heavy lock.

**Runs**
- **run-1:** the stamped build of 4f0b526 with `E2E_PREBUILT=1`, all seven specs. 21 passed, 1 failed, 5.3 min.
- **run-2:** forms-keep-input only, after the first fix. 6 of 6 passed. The edited tree is dirty, so the stamp refuses `E2E_PREBUILT=1`; the web server rebuilt first, as the runbook says.
- **run-3:** all seven specs with the fix. 22 of 22 passed, 4.7 min.
- **run-4:** forms-keep-input with the final version of the fix. 6 of 6 passed.

| Spec | run-1 | Final |
|---|---|---|
| forms-keep-input.spec.ts (new) | 5 passed, 1 failed | 6 passed (run-3 and run-4) |
| packets.spec.ts (refused "Partially accepted") | 2 passed | 2 passed |
| pricing.spec.ts (run-form refusals) | 1 passed | 1 passed |
| triage.spec.ts (refused write-off) | 1 passed | 1 passed |
| sign-in.spec.ts | 6 passed | 6 passed |
| onboarding.spec.ts | 5 passed | 5 passed |
| contracts.spec.ts | 1 passed | 1 passed |

**The failure**
- **Where:** `apps/web/e2e/forms-keep-input.spec.ts:201` (old line), in the audit-request test's no-JavaScript step (FRM-06). "Request received" never showed.
- **Cause (from the trace's network log):** the test sent its success post with the Organization `SYNTHETIC FORMS CLINIC ${Date.now()}`. That is a 13-digit run, which the form's patient-information check refuses ("a run of nine or more digits"). So the second post came back refused, not redirected. The product is right and the test was wrong; design 8.4 step 1 only needs a post that succeeds.
- **Fix, at `forms-keep-input.spec.ts:201-203`:** the test now sends the fixed name `'SYNTHETIC FORMS CLINIC'`, with a two-line comment saying why.
  - My first fix used a random 8-character tag, as `onboarding.spec.ts:69` does, and run-2 and run-3 passed with it.
  - Testing the check showed that a tag of eight digits forming a valid YYYYMMDD date is refused too (112 of 100,301 sampled 8-digit tags), so a random tag could rarely fail the same way.
  - A name with no digits always passes. Nothing reads it back, and no database rule requires it to be unique.
- No other failure, so nothing needed running on e908c21.

**Checks after the change**
- I changed no product code, so there were no unit tests to re-run.
- eslint on the spec is clean, and `pnpm typecheck` in apps/web (which covers e2e/) passes.

**Cleanup:** I dropped `tp_e2e_uxforms` from 5433 and removed `/tmp/tp-e2e-tp_e2e_uxforms-*` and my scratch folders. No server is left and port 4771 is free. I left the shared dev login roles (`tp_*_dev`) in place, since other runs on this cluster use them.

**Files changed**
- /home/user/ux-forms/apps/web/e2e/forms-keep-input.spec.ts (3 lines added, 1 removed)

**Proposals (outside this task)**
1. `apps/web/e2e/onboarding.spec.ts:68-69` uses `randomUUID().slice(0, 8)` in the clinic name it sends through the audit request. About 1 run in 40,000 that tag is an 8-digit date, which the check refuses. A tag with no digits would remove that.
2. The spec's comment at `forms-keep-input.spec.ts:199` cites "docs/adr/0077, Not covered" for fields coming back empty without JavaScript. ADR 0077's "Not covered" doesn't list it; only the design (2.4) does. Either add that case to the ADR's "Not covered" or change the citation.
3. Playwright's list output prints each test's line number wrong (e.g. `forms-keep-input.spec.ts:143` for a test at line 122, `contracts.spec.ts:66` for line 58), though the error stack lines are right. This is cosmetic, but it misleads anyone finding a test from a CI log.

Files are in /tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad:
- progress/e2e.md
- e2e-logs/run-1.log
- e2e-logs/run-2.log
- e2e-logs/run-3.log
- e2e-logs/run-4.log
- e2e-results/run-1/forms-keep-input-a-refused-87fda-RM-04-FRM-05-FRM-06-FRM-08--chromium/trace.zip

## Shots

The before and after shots for PR #74 are done. Both runs took all 153 sample shots and skipped none in the end; the before run needed one retake, described below. Nothing was committed or published.

**Runs**
- **Before:** `TOUR_REF=e908c21`, `TOUR_DIR=/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/screens-before`. Populate passed 11 of 11, capture exit 0, then a same-database retake of `console.models.error.*`. The server stopped at 14:58:22.
- **After:** `TOUR_REF=origin/co-001/ux-forms`, which resolved to 4f0b526 (checked). `TOUR_DIR=/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/screens-after`. Populate passed 11 of 11, capture exit 0, 153 shots and 0 skips first time. The server stopped at 15:10:14.
- **Each run:** used one hold of the lock (about 11.5 and 10.6 minutes). Afterwards `fuser 3297/tcp` was empty, `tp_e2e_screens` was dropped and `/tmp/tp-e2e-tp_e2e_screens-*` was removed.
- **Python:** tiles and gallery files were made with `/usr/bin/python3 -I`, because the `/opt/py312-ci` python has no Pillow.

**The sample:** 51 states, each at `.1280`, `.1280-dark` and `.390`, 153 ids. The full list is in `/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/shots-work/tour-only.txt` and the progress file.

| Route | State | Shot id prefix |
| --- | --- | --- |
| `/sign-in` | default (also the sign-in layout), error ×2 | `sign-in.default`, `.error-wrong-password`, `.error-locked` |
| `/sign-in/mfa` | default, error | `sign-in-mfa.default`, `.error` |
| `/sign-in/enroll` | default, error | `sign-in-enroll.default`, `.error` |
| `/sign-in/new-password` | default, error ×2 | `sign-in-new-password.default`, `.error-mismatch`, `.error-policy` |
| `/sign-in/hardware-key` | default, loading, error ×2 | `sign-in-hardware-key.default`, `.loading`, `.error-no-credential`, `.error-locked` |
| `/sign-in/register-key` | default, loading, error | `sign-in-register-key.default`, `.loading`, `.error` |
| `/request-audit` | default (public layout), error | `request-audit.default`, `.error` |
| `/support` | default (AppShell home layout), error ×3 | `support.default`, `.error`, `.error-unconfirmed`, `.error-stale` |
| `/console/status` | error ×2 | `console.status.error`, `.error-row` |
| console models, practice, screening | error | `console.models.error`, `console.practice.error`, `console.screening.error` |
| `/console/organizations/[id]` | default, error | `console.organization.default`, `.error` |
| `/console/terms`, `/console/compliance` | default, error | `console.terms.default`, `.error`; `console.compliance.default`, `.error` |
| `/console/billing` | default (console layout) | `console.billing.default` |
| `/account/notifications` | default (account layout) | `account.notifications.default` |
| `/settings/billing` | loading | `settings.billing.loading` |
| billing organization, users | error | `settings.billing-org.error`, `settings.users.error` |
| `/p/…/cases` | default (practice layout), loading | `p.cases.default`, `.loading` |
| case (write-off), submissions | error | `p.case.error`, `p.submissions.error` |
| ROI, pricing settings, correspondence | error | `p.roi.error`, `p.pricing-settings.error`, `p.correspondence.error` |
| abstraction ledger | error | `p.abstraction-ledger.error-adjust-zero` |
| `/p/…/contracts` | default, error (tag form) | `p.contracts.default`, `.error` |
| `/p/…/coverage` | checklist review | `p.coverage.checklist-review`, `.checklist-review-sent` |

**Tiles**
- **Before:** `/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/screens-before/tiles`, 408 tiles. Index: `/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/screens-before/tiles/index.json`
- **After:** `/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/screens-after/tiles`, 424 tiles. Index: `/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/screens-after/tiles/index.json`

**Gallery folders** (each holds `index.html` and `s/NNNN.webp`; not published). All four pages load in Chromium with no broken images or errors.
- `/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/gallery-before/gallery/pub1280` (102 shots)
- `/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/gallery-before/gallery/pub390` (51 shots)
- `/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/gallery-after/gallery/pub1280` (102 shots)
- `/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/gallery-after/gallery/pub390` (51 shots)

**Failures, skips and differences to know about**
- **`console.models.error` wrote a flag in the before run.** The old step typed "5.00" for the daily budget, which e908c21 now accepts. It set a global budget of 500 cents on the throwaway tour database; I deleted it at once with SQL. The 390 attempt then failed on two "Flag" labels, so all three ids were skipped. I fixed the step (the value is now "5 dollars", scoped to its form) and retook all three; the after run took them first time with no flag written.
- **That retake makes one table differ.** Because the before `console.models.error.*` were retaken after the checklist steps, their spend table reads LAYOUT 2 calls; the after reads 0. This is not the PR's change.
- **The PR's seed adds two personas.** forms-invited and forms-signin make the member lists on `console.organization.*` and `settings.users.*` two rows longer after.
- **The contracts tag-form step also changes the page's Payer filter.** It picks the filter's Payer select (left unapplied) as well as the tag form's, in both runs, so they still compare.
- **One gallery image is scaled.** `console.compliance.error.390` after is 16,395 px tall, past WebP's 16,383 limit, so its gallery copy is scaled down and its note says so. The PNG and tiles are full size.
- The task's example "sign-in 390 error" was already in the tour (`sign-in.error-wrong-password.390`).

**`tour.spec.ts` changes** (`/home/user/ops/tools/lane-b-screen-tour/capture/tour.spec.ts`; originals in `shots-work/`)
- **New captures:**
  - `support.error-unconfirmed`: the POST aborted as a lost connection.
  - `support.error-stale` and `console.status.error-row`: the hidden CSRF token altered on the page, so nothing is saved.
  - The coverage checklist pair: `expectChecklist()` computes LAYOUT's gaps with the product's own `coverageGaps` and writes the local model provider's synthetic answer the way `e2e/models.ts` does. "Suggest what to obtain with the model" and "Keep the checked items" are then pressed on screen. These are writes, taken after LAYOUT's other coverage shots.
- **Dark for any state:** a dark id named in full in `TOUR_ONLY` is now taken for any state, not only defaults.
- **Before and after both pass:**
  - The pending check also accepts the PR's status line (`[data-slot="pending-status"]`). Without this, the after's held submits, enroll and key registration would have failed.
  - Checks accept "Waiting for your hardware key", "Not registered" and the summary's "Account locked".
- **Missing ids are reported:** at the end of a restricted run, any id that `TOUR_ONLY` names in full but no step took is recorded as skipped.

**`route-map.json` changes** (`/home/user/ops/designs/lane-b-ux-review/route-map.json`)
- `/support`: errors (3) unconfirmed and (4) stale, plus an interaction.
- `/console/status`: the `error-row` state.
- `/p/[practiceId]/coverage`: the checklist interaction, and the notes no longer list it as unreachable.
- `/sign-in`, `/sign-in/hardware-key`, `/sign-in/register-key`: loading notes for the new pending status.

**Other files I changed (inside the task)**
- **Gallery tools** (`convert.py`, `build.py`, `template.html`, `README.md`): they were wired to the baseline's manifest. They now take `GALLERY_SHOTS`, `GALLERY_TITLE` and `GALLERY_LEDE`, say "Not checked" and "Capture note" when there is no checker, handle the WebP size limit and reconvert retakes. Baseline output is unchanged.
- **Tour README:** the new mechanisms and a section on the PR #74 runs.

**Proposals**
1. Add the pages the PR changes outside the sample, or the reviewer will mark them "not seen, by sample":
   - abstraction: `p.abstraction-regulations.default`, `p.abstraction-version.default`
   - packets: `p.packet.default`, `p.packet-review.default`
   - pricing: `p.line.error`, `p.pricing-runs.default`, `p.pricing-run.default`, `p.compare.default`
   - reconciliation and releases: `p.reconciliation.error-reverse`, `p.releases.default`
   - reports: `p.reports.default`, `p.report-review.default`
   - practice settings: `p.agreements.default`, `p.proof-level.default`, `p.defaults.error`
   - uploads and billing: `p.uploads.default`, `settings.billing-org.default`
2. Scope the `p.contracts.error` step to the tag form. I didn't change it mid-run, so both runs stay comparable.
3. The tour README's `python3 -I tile.py` fails under this machine's PATH. Name `/usr/bin/python3`, or have setup check for Pillow.
4. Bring `route-map.md` in line with the JSON edits.
5. Add a gallery that shows before and after side by side, keyed by shot id.
6. Product notes for the reviewer:
   - Before, a dropped connection shows the generic error page and loses everything typed.
   - After, at 390 px the console status rows' "Set" buttons still reach the page edge (391 px wide).
   - The 390 console tables still overflow.

Progress log: `/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/progress/shots.md`
