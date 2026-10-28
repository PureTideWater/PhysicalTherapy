# UX-DLR-08 verify (skeptic), PR #78 @63aaa7f4

Clone: scratchpad/verify-uxdlr08/repo @63aaa7f4. Read-only; no install needed (copy question).

## Checked
- download-refusal.tsx:34-39: forbidden -> title 'Not available to your role', destructive Alert (:66-79); the other five statuses -> NOT_DOWNLOADED (:25). Confirmed in shot screens-after/png/p.report.refused-forbidden.1280.png (red title, Files card).
- packages/ui/src/states/permission-state.tsx:15-16: same title, default (neutral) Alert, role=note; used via shell Forbidden on ~17 page sites. Shot p.packet.refused-forbidden.1280 shows it neutral.
- alert.tsx: destructive = red title on card; default = foreground title.
- Claim "every other refusal is a danger Alert titled 'Not ...'": FALSE. Danger titles also 'Account locked' (action-form.tsx:94, hardware-key.tsx:32), 'Nothing was uploaded' (uploader.tsx:399), 'Export blocked' (packet/page.tsx:123), 'Approval blocked' (packet/page.tsx:407). So "one look has two titles" is the product norm, not a defect.
- Two looks are principled: UX-018 (ops lane-b-ux-review.md:1312) = danger for failures AND refusals; PermissionState is a standing page state (role=note). Red is right for the download refusal.
- Design §6 R09 chose this title deliberately; PR body lines 25/31 say so ("Every title other than forbidden's is 'Not downloaded'").
- What stands: the product's existing role refusal of an attempt, ActionForm via runAction (lib/http/next.ts:147-148), is danger titled 'Not done' with "Not available to your role: X." in the BODY. The download refusal is the only danger notice taking PermissionState's title, and the only one of its six statuses not 'Not downloaded'. Aligning removes a special case and matches 'Not done'/'Not sent'/'Not exported'.
- Body: "no next step" overstated: naming who manages roles is a next step, worded as users/page.tsx:30's own PermissionState. Imperative ("Ask ...") matches the 13 Forbidden pages' "Ask the practice's administrator for access." Keep "organization's": roles are managed on settings/organizations/[id]/users (org administrator).
- Follow-on edits the fix needs: download-refusal.test.tsx:44-48, e2e/download-refusals.spec.ts:205-206, ADR 0079:118-120, PR body 25/31, comment at download-refusal.tsx:35. No other code reads the title (grep).

## Verdict
Real, nit (severity right). Partly overstated argument. Fix as proposed plus the follow-on edits.
