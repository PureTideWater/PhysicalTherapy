# co-001/ux-forms, Scout C: the other surfaces and the test tooling

Read at /home/user/ux-forms (branch co-001/ux-forms, cut from claude/build-platform 4d99df8), 2026-10-26. No product
file was edited. Every experiment ran in the scratchpad (`.../scratchpad/harness`), against the worktree read-only.
Line numbers are at 4d99df8.

## 0. Three things the orchestrator must know first

1. **The test-matrix rows FRM-01 to FRM-08 cannot land in this PR without touching #42.** `docs/product/test-matrix.md`,
   `packages/synth/src/cases/matrix.ts` and `packages/synth/src/cases/registry.ts` are all #42 files.
   - `packages/synth/src/fixtures.test.ts:33` holds matrix.ts identical to the .md, word for word.
   - The registry needs an entry for every row: the no-fixture form is `none(...)`, as at registry.ts:257 (SEC-15),
     :452 (BIL-01) and :468 (CI-05).

   So the FRM rows have to wait. They can come in a small follow-up after #42 merges, or this PR can be marked
   "after #42". Until then, the tests can cite the FRM ids in their names. I recommend the follow-up, because the
   component fix is blocking and touches no #42 file. `docs/product/reconciliation-001.md` is also a #42 file, so it
   must not be edited either.
2. **No new dependency in this PR.** `pnpm-lock.yaml` is a #42 file, and so is `apps/web/package.json`. A devDependency
   added anywhere (root, packages/ui, tools) rewrites the lockfile. This PR also doesn't need one (section 6).
3. **No migration is needed** for anything in this scout's scope.

## 1. Sign-in

**None of these files is #42's:** app/sign-in/**, lib/routes/sign-in.ts, lib/http/next.ts, lib/routes/schemas.ts,
components/action-form.tsx, components/field.tsx, components/hardware-key.tsx and lib/auth/*.

### Refusals today
- `lib/routes/sign-in.ts:43-49`, MESSAGES:
  - `credentials` (:44) and `no_account` (:46) carry the same text, "That did not match. Check the email, the
    password or the code, and try again." That keeps the first step's account enumeration closed. Keep it there.
  - `credentials` is also used by the hardware-key options fallback (:250) and the key verify path. Keep it vague
    there too.
- `settle()` (:64-108) doesn't know which step it is settling.
  - `invalid_password` returns `{ error: 'Choose a password that meets the policy.', problems }` (:84-86).
  - The refusals `credentials`, `no_account`, `key_not_registered` and `invitation_expired` return `{ error }` (:101-105).
- A wrong TOTP code comes back as `credentials`. `lib/auth/sign-in.ts` `after()` turns 'rejected' into
  `failure()`, then `refused('credentials')` (or `locked`). It counts toward the ten-failure lock.
- The code steps are `enrollTotp` (:183-196) and `answerMfa` (:210-223), both `input: z.object({ code: sixDigitCode })`.
  - These steps run only with a sealed pending cookie, which proves the email and password.
  - So naming the code as the wrong part leaks nothing.
- `chooseNewPassword` (:154-169): `.refine(... { path: ['confirm'], message: 'the two passwords differ' })`.
- The policy's words come from `lib/auth/password.ts:10-23`, `PASSWORD_MIN_LENGTH` 12. The problems are 'at least 12
  characters', 'a lowercase letter', 'an uppercase letter', 'a digit' and 'a symbol'. ActionForm joins them with ', '
  (`action-form.tsx:81`).
- `lib/http/next.ts`:
  - `ActionState` (:124-129) is `{error, issues, problems, locked}`.
  - `runAction` is at :148-174 and `runSignInStep` at :177-193.
  - `runSignInStep` returns the route's `StepResult` itself as the ActionState (:192). So a StepResult that gains
    `issues` reaches ActionForm with no change in next.ts.
  - 'Check the fields marked below.' is at :162 and :180.

### Pages
| Page | Fields |
| --- | --- |
| `sign-in/page.tsx:26-29` | Email (`autoComplete="username"`), Password (`type=password`, `current-password`) |
| `sign-in/mfa/page.tsx:24` | `Field label="Six-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required` |
| `sign-in/enroll/page.tsx:34` | the same field |
| `sign-in/new-password/page.tsx:27-30` | New password (`minLength` 12), New password again. The policy sits in the CardDescription (:21-24), not on the field |

### sixDigitCode
- `lib/routes/schemas.ts:23`: `z.string().trim().regex(/^\d{6}$/, 'the six-digit code from your authenticator app')`.
- Its only callers are `sign-in.ts:191` and `:218`.

### Is there a code field anywhere else?
- **No.** There is no MFA re-enrolment or console code field.
- `p/[practiceId]/claims/page.tsx:76` has `name="code"`, but that is a CPT filter.

### Recommendations
- **a11y-other-08.** Add `issues?` to `StepResult`.
  - In `enrollTotp` and `answerMfa`, map a `credentials` refusal to
    `{ error, issues: [{ field: 'code', message: ... }] }`.
  - In `settle`'s `invalid_password` case, return `issues: [{ field: 'password', message: 'It still needs X, Y and Z.' }]`
    in place of the bare `problems`.
  - The first step, the hardware key and `locked` keep their current vague wording.
  - Move the policy into the New password field's `hint`, and keep it visible.
- **e2e impact.** `e2e/helpers.ts:48-49` finds a code refusal by the text 'That did not match'.
  - New code-step wording must keep that phrase, or helpers.ts changes with it (not a #42 file).
  - `sign-in.spec.ts:57` expects 'did not match' on the first step. That step is unchanged.
- **words-other-29.** "Choose a stronger password. It still needs an uppercase letter, a digit and a symbol." Join
  with commas and a final "and", in one helper used by every list.
- **a11y-other-05.**
  - Change `sixDigitCode` to `z.string().transform((v) => v.replace(/[\s-]/g, '')).pipe(z.string().regex(/^\d{6}$/, ...))`.
  - Remove `pattern` from both Fields. Constraint validation runs before the submit event, so with the pattern still
    there, '123 456' stays blocked whatever onSubmit does.
  - Set `maxLength={9}` and the hint "6 digits. Spaces are fine.".
  - Keep `inputMode` and `autoComplete`.
- **Secrets after a refusal.** With the onSubmit fix, nothing is reset. The scratch harness confirmed that the password
  survives a refusal. So ActionForm must clear, on purpose:
  - every `type=password` input;
  - every `autocomplete="one-time-code"` input. A refused code is spent, and the code rotates every 30 s.
- **narrow-other-23 (Show password).**
  - Make a client `PasswordField` (field.tsx is a server component).
  - The toggle is a `type="button"` with `aria-pressed` and `aria-controls`.
  - **Name it by its visible text, not `aria-label`.** `getByLabel('Password')` matches labels and aria-labels as a
    case-insensitive substring. It is used in `helpers.ts:32` and many specs, so an aria-label 'Show password' would
    break them (Playwright strict mode).
  - Give each toggle on new-password a distinct name: visible "Show", plus a visually hidden " new password" or
    " new password again".
  - Before submit, switch the input back to `type=password`, so password managers still offer to save it.
  - No style attribute: CSP style-src is 'self' plus a nonce (`lib/http/security-headers.ts:60`).

## 2. Hardware key and the Stripe form

**hardware-key.tsx (not #42):**
- `HardwareKeySignIn` (:38-89) submits through onSubmit with preventDefault (:72-75), and the email is controlled
  (:39, :79), so it is kept.
- The button is `disabled={busy}` with the text 'Waiting for the key…' (:83-85). Disabling it drops focus.
- The `Problem` alert (:26-36) gets no focus and no tabIndex. Its title is 'Not signed in' (:32), which registration
  also uses (:124).
- `HardwareKeyRegistration`'s button is `disabled={busy}` (:126-128).

**stripe-payment-method.tsx (not #42):**
- `ConfirmForm` (:191-227) has the same pattern: `disabled={pending || stripe === null}` and 'Working…' (:221-222).
- Its error Alert (:216-218) and the start error (:246) get no focus.
- `SetupNotice` already does it right: `role=status`, `tabIndex=-1`, focused on mount (:144-160).

**`Button`** (`packages/ui/src/components/button.tsx:8`) styles only `disabled:`. It has no `aria-disabled` look.

**Recommendation.** One small shared pattern, inside the PR's files:
- `aria-disabled="true"` plus an early return while pending, in place of `disabled`. Add
  `aria-disabled:opacity-50 aria-disabled:pointer-events-none` to buttonVariants.
- A polite `role=status` line that exists from first render and holds 'Working…' or 'Waiting for your hardware key…'.
- Focus moves to the refusal alert (`tabIndex=-1`), as ActionForm does.
- Apply it in ActionForm, both hardware-key components and ConfirmForm.

Titling the registration failure 'Not registered' is a words fix inside the same file.

## 3. Loading

**LoadingState** (`packages/ui/src/states/loading-state.tsx:18-39`):
- It is `role=status aria-live=polite aria-busy=true` (:22-24), with an sr-only label (:27), and the mark and bar are
  `aria-hidden` (:28).
- It is a server component: no file in packages/ui has 'use client'.
- `states.test.tsx:22-36` asserts `aria-busy="true"` (:26), so the test changes with the fix.
- `tools/brand-copy/scan.test.ts:315` lists loading-state.tsx as a copy file, so a visible label is linted.

**40 loading.tsx files.** Every one is
`<main className="mx-auto flex max-w-5xl flex-col gap-4 p-8"><LoadingState label="Loading …"/></main>`:
- 36 are under app/p/[practiceId]/**;
- the others are account/notifications, settings/billing (two) and console's specialist-queue, billing,
  rule-releases and practices/[practiceId];
- none is #42's.

The only layouts are app/layout.tsx and sign-in/layout.tsx. The shell renders per page, and shell.tsx is #42's, so the
header and rail vanish while any page loads. The only other user is `components/uploads/receipts.tsx:131`, which is
client and inline.

**What the shared component alone can do (in scope):**
- Remove `aria-busy` from the status element.
- Show the label as visible text beside the bar (`text-sm text-fg-muted`), which answers a11y-practice-1-17's "no
  words".
- Have the live region exist before its text arrives. Render the region empty and fill the label after mount, in a tiny
  client child ('use client' file in packages/ui/src/states). Or render the visible label only, and let the region's
  later change be announced.
- Change the test to assert no `aria-busy` and the visible label.

**What needs each loading.tsx or a layout (out of scope; a proposal):**
- `aria-busy` on `<main>`;
- a still frame of the shell while loading, which needs shell.tsx (#42) or new segment layouts;
- a persistent live region in app/layout.tsx.

## 4. Uploader, split form and status components

### Uploader
- `components/uploads/uploader.tsx:376-387` is `<input type=file className="sr-only" aria-label="Choose files to upload">`
  with no tabIndex. The 'Choose files' button is at :388-390. Not #42.
- About 20 e2e calls use `getByLabel('Choose files to upload').setInputFiles(...)` (uploads.spec.ts:37,
  packets.spec.ts:79/425/466/535, era-exports.spec.ts:76/100/104/221/243 and others).
- **Tested in scratch** (Chromium 1194, Playwright 1.56.1): with `tabindex="-1"`, and with `tabindex="-1"` plus
  `aria-hidden="true"`, `getByLabel('Choose files to upload')` still finds the input and `setInputFiles` works. Tab
  skips it to 'Choose files' in both cases.
- **Fix:** `tabIndex={-1}` and `aria-hidden="true"`. No spec changes. axe's aria-hidden-focus rule passes with
  tabindex=-1.
- Its selects at :330 and :353 are `text-sm`; section 5 covers them.

### Split form
- `components/screening/split-form.tsx` is not #42's. Its test is `components/screening/forms.test.tsx:52-75`
  (renderToStaticMarkup).
- The CodesFields are controlled and unnamed (:54-73), and the hidden `settings` field is at :94. They survive React's
  reset because they are controlled.
- The problems `<ul>` (:109-115) is not live, and no field gets `aria-invalid` or `aria-describedby`.
- The server route is `lib/screening/routes.ts:1292` (`settings: z.string().max(4000)`), which **is #42's**. So the fix
  is client-only:
  - a `role=status` region present from first render;
  - `aria-invalid` and `aria-describedby` on the offending CodesField;
  - on submit with problems, prevent the post and focus the first offending field.
- A server issue on `settings` (a hidden input) has no visible control. The shared label source (section 6 of the
  design) needs to send such an issue to a named control or a fieldset. Here that is the facility field: the form can
  mark it with `data-issue-for="settings"`, or the issue can fall back to the summary with its message alone, never
  the key.

### Status page
- `app/console/status/page.tsx:114-122` has a fieldset with the legend 'Components affected' and checkboxes
  `name="components[]"` (:119). This is the only `[]` group in the app. Not #42.
- `lib/http/form.ts:7-21`: `formInput` folds `name[]` into the key `components` as a comma string (test:
  `lib/http/readiness.test.ts:200`).
- `lib/routes/support.ts:391-394`: the `componentList` preprocess passes `undefined` through, so Zod's type message
  ('Invalid input: expected array, received undefined') wins over `.min(1, 'choose at least one component')`. Not #42.
- **Fix:** preprocess `undefined` and `''` to `[]`.
- The issue key is 'components', but the controls are named 'components[]'. ActionForm's lookup should try
  `name` then `name[]`. For a RadioNodeList or a group:
  - mark the enclosing fieldset (`aria-describedby` on it, `aria-invalid` on its first input);
  - take the label from its `<legend>`;
  - focus the first input.
- The radio group in `components/reconciliation/template-mapper.tsx:87,92` (`name="template"`) is the same shape.

## 5. Type scale (narrow-other-09, narrow-practice-2-10)

### What the ADR and components say
- ADR 0056's status (:3) is "accepted; amended by 0058". Its type-scale sentence (:48-50) ends "tables and dense
  controls 14".
- BRAND.md section 5 says "16/24 body; 14 in dense tables".
- `packages/ui/src/components/input.tsx:11` is `text-sm` plus `aria-invalid:border-destructive`.
- `field.tsx` select (:75) and textarea (:106) are `text-sm` with no invalid style.
- About 35 raw `<select>` and 12 `<textarea>` sit in apps/web/src, most of them `text-sm`:
  - cases/page.tsx:77,144;
  - cases/[caseId]/page.tsx:115,208,271;
  - submissions/page.tsx:79,307,326,338,354;
  - claims/page.tsx:58,65,88;
  - contracts/page.tsx:53,64;
  - coverage/page.tsx:350,360;
  - mapping/page.tsx:62,72;
  - pricing-runs/page.tsx:110,120;
  - reports/page.tsx:98;
  - remittances/page.tsx:36;
  - lines/[lineId]/page.tsx:299;
  - reconciliation/page.tsx:42;
  - abstraction/ledger/page.tsx:35;
  - abstraction/versions/[versionId]/page.tsx:265,320,464;
  - packet/page.tsx:415;
  - contracts/forms.tsx:84;
  - packets/version-form.tsx:125;
  - template-mapper.tsx:115,141;
  - uploader.tsx:330,353.

  Some filters (anomalies and cases filters) carry no text-sm. The form files #42 owns are the users page,
  console/support/page.tsx and screening/upload-form.tsx.

### The cascade
- Tailwind 4.3.3 with the default breakpoints (sm 40rem, md 48rem). No custom breakpoint anywhere.
- `brand.css:10` sets `html { font-size: 16px }`.
- `globals.css:1-9` imports tailwindcss, the tokens, the theme, brand.css (layer base) and `@tp/ui/styles.css` (not in
  a layer).
- `packages/ui/src/styles.css:75-80` already holds the one shared rule for every field (`@layer base`: input except
  checkbox/radio/hidden/file, select, textarea get `border-input`).

### Recommendation: one rule, one source
- Add it to packages/ui/src/styles.css beside that base rule, **unlayered**, so it beats every `text-sm` utility:
  `@media (width < 40rem) { input:not([type='checkbox'],[type='radio'],[type='hidden'],[type='file']), select, textarea { font-size: 1rem; } }`.
  - Unlayered CSS outranks Tailwind's `@layer utilities`, whatever the specificity. So this one rule fixes Input,
    SelectField, TextAreaField, every raw control and the #42 pages' controls without touching a #42 file. It cannot
    drift per page.
- Do not touch the viewport (`app/layout.tsx:29`): maximum-scale stays unset, for WCAG 1.4.4.
- Assert it in the new e2e spec: the computed font-size is at least 16 px at 390 px.

### Is amending ADR 0056 allowed?
Yes, by the repository's own precedent. 0058 amended 0056 by:
- adding "amended by [0058]" to 0056's status line (:3);
- adding an italic `*Amended by [0058](...) (decision D7): ...*` paragraph in 0056's body (:104-105) under the passage
  it changes.

No hook protects docs/adr, and 0056 is not a #42 file. **Recommendation:** ADR 0077 records the form submission
pattern and, as one of its decisions, the phone exception: "form controls are 16 px below the sm breakpoint, so iOS
does not zoom; 14 px from sm up". 0056 gets "amended by [0077]" on its status line and an italic note after its
type-scale sentence. The sentence itself is not rewritten. BRAND.md section 5's row can carry the same clause.

## 6. Unit-test tooling for ActionForm's client behaviour

### What the repository has
- `vitest.config.ts` has the projects unit, db and golden, with no environment set (node).
- Unit and db run the global setup `tools/test/ci-chromium.ts`, which **requires Playwright's Chromium on CI** (CI-05;
  the tests that print PDFs).
- No jsdom, happy-dom, @testing-library or @vitest/browser appears in any package.json or config. They show only as
  vitest's optional peers in the lockfile (pnpm-lock.yaml:3779-3799).
- The pnpm-workspace.yaml catalog has react/react-dom 19.3.1 and vitest ^5.0.4.
- Component tests render with `renderToStaticMarkup` (`packages/ui/src/states/states.test.tsx`,
  `components/screening/forms.test.tsx`, `components/billing/billing.test.tsx`). That can't test effects, focus or
  submit.

### Resolvable from apps/web today
- `@playwright/test` 1.56.1, which exports `chromium` (installed at /opt/pw-browsers/chromium-1194);
- `react-dom/client`;
- `vitest/node`, which exports `createViteServer` (vite 8.3.4 is in the store).

Not resolvable: esbuild, vite (as a bare import), happy-dom, jsdom.

### Tried in scratch, worktree untouched
- **The `// @vitest-environment happy-dom` directive fails:** "Cannot find package 'happy-dom' imported from
  .../vitest/dist/chunks/...". Vitest resolves the environment from its own install. It would need happy-dom at the
  root plus a lockfile change, and the lockfile is #42's.
- **An in-repo browser harness works with no new dependency.** A vitest test does three things:
  - starts `createViteServer` from `vitest/node` (`configFile: false`, `server.port: 0`, its own cacheDir) over a
    harness page whose entry renders the real `ActionForm` and `Field` with `createRoot` and an async action that
    refuses;
  - drives it with `chromium` from `@playwright/test`;
  - asserts on input values, aria-invalid and the focused element.
- **Results:**
  - On today's ActionForm, the refused ZIP '0001' comes back as the default '27601'. The bug reproduced.
  - On a copy with `onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget, submitter); startTransition(() => formAction(data)); }}`,
    the value is kept as '0001'. So is the password, so it must be cleared on purpose.
  - `aria-invalid` is true and focus is on the field.
  - Under `vitest run`, 2 tests passed in 2.6 s. A standalone node run took 2.0 s.

### Exactly what adding a devDependency would require (for the record)
- Edits to package.json and pnpm-lock.yaml. Both are #42 files, so this is impossible in this PR.
- After ci-deps (not merged yet, `/home/user/ops/designs/lane-b-ci.md:915-938`):
  - a locked version at least `minimumReleaseAge: 4320` (3 days) old, or a `minimumReleaseAgeExclude` entry with a
    reason and an expiry;
  - `trustPolicy: no-downgrade`;
  - `tools/check-toolchain`'s lockfile release-age rule.
- Weekly grouped Dependabot updates (`.github/dependabot.yml`).
- `pnpm licenses:check` (`tools/check-licenses`, allowlist.json) and `pnpm audit --prod` cover **production**
  dependencies only, so a devDependency is not licence-gated. ADR 0066 asks that every dependency be pinned.

### Recommendation: the harness in the unit project, not happy-dom, not e2e only
- It runs the real component in a real browser, so focus, constraint validation, React 19's form reset, FormData with
  the submitter, and `labels[0]` are all true behaviour, not a simulated DOM.
- It needs no dependency and no lockfile change.
- CI already installs Chromium for the unit job.
- Layout:
  - put the harness under `apps/web/src/components/test-support/` (an entry .tsx plus index.html);
  - put the tests in `apps/web/src/components/action-form.test.tsx`;
  - add a small helper, `renderInBrowser(entry)`.
- Skip off CI when Chromium is missing, as the print tests do (`chromiumInstalled()` in `apps/worker/src/report/pdf.ts`;
  that is worker code, so give it a web-side twin or use `existsSync(chromium.executablePath())`).
- e2e (section 7) then proves the real server path and the no-JavaScript post.
- Within the server-rendered markup, a `renderToStaticMarkup` test can still hold that the form keeps `action=` for the
  no-script post.

## 7. e2e and axe

- **`e2e/a11y.ts`** (not #42):
  - `expectAccessible` (:11-15) runs `AxeBuilder.withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])`;
  - `tabTo` is at :22-46;
  - `atPhoneWidth` (:53-66) runs axe at 390 px and the no-sideways-scroll check.
- **`playwright.config.ts`:**
  - It already imports `./e2e/env` (#42) read-only (:7-20). Importing is not changing.
  - `fullyParallel` (:79).
  - The webServer runs `e2e/prepare.ts` (:99).
  - No proxy is trusted (:130-131), so per-address rate limits never apply in e2e.
  - Per-account limits do apply: sign_in 20 per 900 s and mfa 10 per 300 s (`lib/http/rate-limit.ts:39-40`).
  - public_form (5 per hour) is per address only, so request-audit refusals are safe.
- **`helpers.ts`** imports `./env` (:5):
  - `enterPassword` (:29-34);
  - `signInWithTotp` (:41-60);
  - `refusal()` = `[data-slot="alert"]` (:63-65);
  - `registerKeyAndSignIn` with a virtual key (:84-91), for console personas.
- **A new spec, `apps/web/e2e/forms-keep-input.spec.ts`, can reach real refusals.** It can import helpers.ts (and
  env.ts through it) read-only, and touches no #42 e2e file.
  - **Personas:** add dedicated ones to `apps/web/scripts/synthetic-personas.ts` (not #42), each with the usual comment
    line, because failures count toward the ten-failure lock and the specs run in parallel. `scripts/seed.ts:32` (not
    #42) seeds them automatically; `seed.db.test.ts:37` compares keys to the list, so it follows. Suggested:
    - `forms-signin` (group viewer): wrong password keeps the email and clears the password; a wrong code is marked on
      the code field; a pasted '123 456' signs in.
    - `forms-invited` (`invited: true`): mismatch and policy refusals mark the right field.
    - `forms-manager` (other_group billing_manager): a practice form, e.g. ROI's period or Correspondence's phone. A
      form that needs no prior upload is best.
    - `forms-admin` (internal platform_admin, hardware key): /console/status opened with no component ticked, so the
      'Components affected' group is marked and named.
  - Public /request-audit needs no persona.
  - Assert values kept, the label (never the key) in the summary, the inline message, focus on the first invalid
    field, `expectAccessible` after the refusal, and computed font-size at least 16 px at 390 px.
  - A no-JavaScript case: a `browser.newContext({ javaScriptEnabled: false })` post still reaches the server and comes
    back refused.
- **Existing assertions that the wording may move:**
  - `helpers.ts:49` 'That did not match' (code step);
  - `sign-in.spec.ts:57,60` ('did not match', 'locked after ten failed attempts', 'Account locked'; first step,
    unchanged);
  - `contracts.spec.ts:116,145,210` filter on the alert title 'Not done'.

## 8. Combined audit #103 and PR 7

- **#103** (`/home/user/ops/audits/combined/combined-report.md:1122-1129`) lands in Lane A's PR 7, a schema PR. It
  plans:
  - a **generated** check that visits every page route with a role that can open it, under WCAG 2.2 rules, failing
    when a route has no visit;
  - focus-not-hidden in the keyboard test;
  - manual checks for what no tool sees;
  - tagged PDFs.
- The UX review's raw findings (`designs/lane-b-ux-review/raw-findings.md:268-270, :792-794`) ask PR 7 to add the
  `wcag22aa` and best-practice tags, visit refused states, and record 3.3.7 and 3.3.8 as manual checks.
- ci-browser (lane-b-ci.md:93 A10, :1716-1717, :2464) moves `@axe-core/playwright` from 4.13.0 to 4.14.0. It depends
  on "every spec runs a11y.ts:12", and a11y.ts is one of the files it cites.
- **To avoid colliding:**
  - this PR does not edit `e2e/a11y.ts` (no tag change, no new helper there) and adds no route-visit generator;
  - its spec calls `expectAccessible` and `atPhoneWidth` as they are;
  - it uses its own file name and its own FRM ids (when the matrix rows can land);
  - its findings (values kept after a refusal, paste into the code field) are the first cases PR 7 can cite for its
    manual 3.3.7 and 3.3.8 checks;
  - a form-specific helper the new spec needs goes in the spec, or in a new `e2e/forms.ts`.

## 9. reconciliation-001's "What must not change, as checks"

`docs/product/reconciliation-001.md:440-486` (a #42 file, so it is read, not edited). This PR can touch these checks:
- **Security program:** `pnpm test:db` must pass.
  - The generated route tests exercise the changed sign-in and support schemas.
  - `lib/auth/sign-in.db.test.ts` and the route-tests' `sample` inputs must still pass.
  - The `componentList` preprocess change keeps `sample` valid.
- **Response headers** (ADR 0053/0055, "change only as D7 allows"): nothing changes them.
  - Every new mark must use classes and SVG attributes, never `style`. CSP style-src is 'self' plus a nonce
    (`lib/http/security-headers.ts:60`), and ADR 0056 says the same.
- **The role and permission matrix (PR 14 only):** untouched.
- **Untouched:** the engine, ledger, content pipeline, applied migrations, AUDIT-01 and the milestones.

## 10. The error mark

**Rules:**
- `.claude/rules/brand.md`:
  - colours from tokens, no hex in components;
  - status colours are for data only and never colour alone;
  - text at 4.5:1 or better;
  - focus with `--pw-focus`.
- `docs/brand/BRAND.md` sections 4 and 9.
- `packages/brand/src/tokens.css:43-46`: `--pw-danger: var(--pw-short)`, with the comment "A failure that is not a
  payment status ... named apart from Short", so a refusal uses `--pw-danger` (Tailwind `destructive` /
  `text-danger`), never `--pw-short`.
- `styles.css:28` maps `--destructive` to `--pw-danger`.
- The destructive Button is `text-danger` on `bg-danger-bg` (`button.tsx:13-15`).

**Contrast, computed:**

| Pair | Ratio |
| --- | --- |
| #B5452E on White | 5.45:1 |
| #B5452E on its tint #F8ECE8 | 4.71:1 |
| #B5452E on raised #F7F8FA | 5.13:1 |
| Dark: #E8846B on #0B1626 | 6.87:1 |
| Dark: #E8846B on the tint #3A1C14 | 5.86:1 |
| The input outline #808996 on White | 3.54:1 |
| Danger against the input outline | 1.54:1 |

All the text pairs pass 4.5:1. The last row is why a red border alone is a hue-only change. Make the invalid border
2 px, and always pair it with text.

**Icon:** no icon library in any package.json (no lucide), and adding one would touch the lockfile. The precedent is a
hand-drawn inline SVG: `aria-hidden="true" focusable="false"`, `currentColor`, 12 px
(`components/uploads/format-flag.tsx:12-16`, a warning triangle; `shell.tsx:39`).

**Recommended mark:**
- Put the field message under the control: `text-xs text-danger`, starting with a 12 px inline SVG (a circle with an
  exclamation, aria-hidden) and the visible word "Error:" in a span. The word "Error:" carries the meaning for screen
  readers and for anyone who can't tell the colours apart.
- Add one rule for every invalid control in styles.css: `[aria-invalid='true'] { border-color: var(--pw-danger); border-width: 2px }`.
  - Put it in the base layer's field rule, or unlayered, so raw selects and textareas get it too.
- No status colour sits near the mark, and there is no new hex.

## 11. Proposals outside this PR's files (improve as you go)

- Each loading.tsx: `aria-busy` on `<main>`, and a still shell frame (needs shell.tsx, #42).
- A persistent live region in `app/layout.tsx`.
- The upload form's file-field gaps, a11y-other-15 (upload-form.tsx, #42), after #42.
- Pattern hints on console/support/page.tsx (#42), a11y-other-20, after #42. The other pages in that finding are not
  #42's.
- FRM-01 to FRM-08 in test-matrix.md, matrix.ts and registry.ts (all #42), in a follow-up after #42.
- The other custom forms that copy ActionForm's pending pattern: `components/packets/version-form.tsx` (:64, :148) and
  `components/packets/export-status.tsx` (:86, :103). Take them into this PR if the design widens to "every form";
  they are not #42's.
