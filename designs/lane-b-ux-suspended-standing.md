# Design: a suspended organization never reads "In good standing" (`co-001/ux-suspended-standing`)

*Lane B, 2026-10-26 ~09:45 UTC (date -u). The UX baseline review's PR 2 (UX-004; raw finding flows-other-11), assigned
by the orchestrator at 09:35 UTC. Branch cut from `claude/build-platform` 7ef421b. Status:
`approval-summaries/lane-b-ux-suspended-standing-status.md`. The review document (`designs/lane-b-ux-review.md`) is in
its review round; §3.2 PR 2 and UX-004 are re-read before the builders start.*

## The defect (7ef421b)
- `apps/web/src/app/settings/billing/[organizationId]/page.tsx:43` prints "Standing:" from `billing.standing` alone
  (`good | past_due | suspended`, billing's dunning standing).
- A platform administrator's suspension or closure lives in `organization.status` (`active | suspended | closed`), read
  only by `suspensionNotice()` (`apps/web/src/lib/routes/billing.ts:156-167`) for the red alert.
- So a suspended organization in good billing standing reads "Standing: In good standing" directly above "New runs have
  stopped: A platform administrator has suspended the organization …", with no reason and no next step. The page
  also still offers "Choose plan" and the payment forms as if payment would lift the suspension.

## No migration, no #42 file
Everything needed is already in the billing view (`OrganizationBilling`: `status`, `standing`, `pastDueSince`,
`suspendedSince`, `invoices`). Files: `apps/web/src/lib/routes/billing.ts` and the billing page (neither is #42's).
Left to Lane A, as the review says: the stored suspension reason, note and time, and the console's reason form (a
migration, and `lib/routes/console.ts` is #42's).

## Decisions (the recommended option each, taken without asking; recorded here, in the PR and the status file)
1. **One standing, worked out in one place.** `billing.ts` exports a pure `accountStanding(billing)` returning
   `{ kind, label, tone, notice, nextStep }`, replacing `suspensionNotice()` and the page's `STANDING` map:
   - `closed` (record closed): label "Closed"; notice "The organization is closed: its data stays readable, and no new
     run starts."; next step: open a ticket.
   - `suspended_by_paidwhole` (record suspended, whatever billing says): label "Suspended by PaidWhole"; notice "PaidWhole
     has suspended the organization: new runs have stopped, and its data stays readable. Paying an invoice does not lift
     this suspension."; next step: "Open a support ticket to find out why and what lifts it." linking to
     `/support?from=billing`.
   - `suspended_nonpayment` (record active, billing suspended): label "Suspended for nonpayment since <date>"
     (`suspendedSince`); notice as today; next step: pay the open invoice (the page's existing Pay buttons, named), or
     open a ticket.
   - `past_due` (record active, billing past due): label "Past due since <date>"; the existing past-due alert stays
     (with its stop date); next step: update the payment method or pay the open invoice.
   - `good` only when the record is active and billing is good.
   The record's status wins over billing's: suspended or closed never yields good standing. A closed organization wins
   over a suspended one.
2. **The page renders the one standing**: the badge from `label` and `tone` (neutral outline for good; the danger
   variant only for a suspension, closure or failed payment, words always beside it), the alert from `notice` with the
   next step as a sentence with its link in the same alert (`role="alert"` kept: it is a blocking state), and one
   `data-standing="<kind>"` attribute for tests.
3. **While suspended by PaidWhole or closed, the payment and plan forms say why they do not lift it**: a one-line note
   above them ("Changing the plan or payment method does not lift a suspension by PaidWhole."); the forms stay usable
   (an administrator may still need to fix a payment method during a suspension).
4. **The page data** carries `standing: AccountStanding` in place of `suspension: string | null`; the route stays
   `phi: false`, the same permission, the same query; billing still runs as `tp_billing`.

## Tests (BIL-05 and BIL-06, reserved)
| ID | Case | Assertion |
| --- | --- | --- |
| BIL-05 | One account standing from the record and billing | `accountStanding` gives good only for an active record in good billing; a suspended record reads "Suspended by PaidWhole" whatever billing's standing, a closed record "Closed" whatever else; an active record suspended for nonpayment or past due names the date; every non-good standing has a notice and a next step |
| BIL-06 | A suspended organization's billing page | With the organization suspended by a platform administrator and its billing in good standing, its administrator's billing page shows "Suspended by PaidWhole", never "In good standing", the notice, a link to open a support ticket (`/support?from=billing`) and the note that payment does not lift it; the page passes axe |

Where: BIL-05 a unit test of `accountStanding` (and the page's rendering through a component test if the badge and
alert are extracted to `components/billing`); BIL-06 in `apps/web/e2e/billing.spec.ts` (suspending through the
console's existing route or the database as the e2e helpers do, then reinstating, so other journeys sharing the
group are unaffected) and the billing db test's suspended case extended. `pnpm lint:copy` over the new words.

## Reviews
- Security or payment engine is not the right second lens here (no money computation); the second adversarial review is
  a correctness and tenancy review of the billing route and the e2e (the orchestrator named only the UX review; the
  pipeline needs two).
- UX and brand, with `.claude/agents/ux-brand-reviewer.md` from PR #55 as its checklist: before and after shots of the
  billing page for a suspended organization (and good, past-due states for regressions) at 1280 px and 390 px, light
  and dark.
