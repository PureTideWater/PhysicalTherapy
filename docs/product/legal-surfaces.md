# Legal surfaces

The words the product shows the public or a customer that carry a legal commitment, and who must review each before
launch. A surface in the product is marked where it renders with `data-legal-surface="<id>"` and a comment naming this
list (for a surface with no element of its own, an email or a cookie, the marker is in that comment where it is made);
`tools/test/legal-surfaces.test.ts` holds the two to each other, so a marked surface missing here, or a row here
whose file no longer carries its marker, fails `pnpm test`. A row leaves this list only when its review is recorded in
the pull request that changes its text.

The combined audit (adopted 2026-10-20) places the legal texts, the terms shown before "I accept", the privacy notice,
the screening terms and the AMA notice in a legal-surfaces pull request before PR 16 and any production deploy (items
#51 and #52). That pull request reviews every row below with counsel, and adds its own.

| ID | Surface | Where | Review | Before |
| --- | --- | --- | --- | --- |
| `good-faith-research` | The disclosure page's good-faith research statement: research that follows the page is treated as authorized, no legal action is brought or supported over it, and a third party's claim is answered by saying so; it never authorizes access to patient information or to data that is not the researcher's | `apps/web/src/app/security/page.tsx` | Counsel (the legal-surfaces pull request) | Launch, and any production deploy |
| `disclosure-response-times` | The disclosure page's response times: receipt confirmed within three business days, an assessment within ten, a fix aimed for within 90 days of the report, publication agreed with the reporter, no rewards | `apps/web/src/app/security/page.tsx` | The security official (with the incident-response policy) | Launch, and any production deploy |
| `screening-kept-result` | The screening result page's notice of what is kept: the record of counts that names no one (decision 7's plain list, every column) and, by what the screening's summary is kept with as the database says, nothing more until an audit is requested, the summary with the screening's own request, the summary with an earlier screening's request of the same practice name and ZIP code that it took over (decision 17: the later prospect's own details are what is kept), or by consent (PR 6e); that a kept request's record of counts can be matched to it (decision 18); and, with no request, that a coded form of an address whose email could not be delivered or was reported as spam is kept 12 months, only so that it is never sent to again (the founder's Q11 (b) of 2026-10-21) | `apps/web/src/components/screening/result-summary.tsx` | Counsel (with decisions 7, 17 and 18) | The screening opens, and any production deploy |
| `screening-kept-email` | The result email's sentences on what is deleted when its link closes and what is kept, by the same basis as the result page | `apps/worker/src/screening/message.ts` | Counsel (with decisions 7, 17 and 18) | The screening opens, and any production deploy |
| `screening-kept-closed-link` | The closed link's page: what was deleted, and what is kept if an audit was requested from the screening or an earlier one of the same practice name and ZIP code (it cannot say whether one was), and the coded form of an undeliverable or reported address kept 12 months (Q11 (b)) | `apps/web/src/app/screening/results/[resultId]/not-found.tsx` | Counsel (with decisions 7 and 17) | The screening opens, and any production deploy |
| `screening-kept-upload` | The upload form's hint under the email address: how long the link opens the result, what is deleted, and what is kept if an audit is requested, and the coded form of an undeliverable or reported address kept 12 months (Q11 (b)) | `apps/web/src/components/screening/upload-form.tsx` | Counsel (with decisions 7 and 17) | The screening opens, and any production deploy |
| `screening-kept-sent` | The "sent" alert after an upload: the same | `apps/web/src/app/screening/page.tsx` | Counsel (with decisions 7 and 17) | The screening opens, and any production deploy |
| `screening-kept-convert` | The result page's request form: the summary the request keeps for 12 months, or, when the summary is already kept with an earlier request of the practice, that the new request has none of its own | `apps/web/src/components/screening/convert-form.tsx` | Counsel (with decisions 10 and 17) | The screening opens, and any production deploy |
| `screening-mail-paused` | The screening page while its mail stream is paused (audit #76; the founder's Q12 of 2026-10-21, the recommended wording): new screenings are paused, the screenings uploaded before the pause are kept and emailed when sending resumes if that is within 30 days of their upload, and result links already sent still work | `apps/web/src/app/screening/page.tsx` | Counsel (with the founder's Q12 of 2026-10-21) | The screening opens, and any production deploy |
| `screening-mail-address` | What the upload form says about the address a result goes to (audit #76; the founder's Q10 (a) and Q12 of 2026-10-21, the recommended wording): the one sentence every refused address gets, whatever refused it (DNS, SES's validation or the refusal list), which says nothing about any earlier screening or a customer's mail; the likely-typo, unknown-ending and unconfirmed-mailbox warnings, each answered by keeping the address as typed; and the bounce budget's refusal (`SCREENING_BOUNCE_BUDGET` in `src/lib/screening/messages.ts`) | `apps/web/src/lib/screening/address.ts` | Counsel (with the founder's Q10 (a), Q11 (b) and Q12 of 2026-10-21) | The screening opens, and any production deploy |
| `request-audit-kept` | The audit request form's sentence on what it keeps: how the requester heard of us, the referring firm, and the campaign codes and kind of paid click the attribution cookie holds | `apps/web/src/app/request-audit/page.tsx` | Counsel (with the privacy notice, #51) | Launch |
| `attribution-cookie` | The first-party attribution cookie pw_first_touch (decision 11): set on the first page a visitor lands on with campaign codes or a paid click, 30 days, the first visit wins, holding the codes (an identifier-shaped code dropped) and the kind of paid click, never a click ID; read by the screening and audit-request handlers; disclosed in the privacy notice (#51) | `apps/web/src/proxy.ts` | Counsel (with the privacy notice, #51) | Launch, and any production deploy |

Until a row's review is recorded, a production server leaves its surface out, or does not do what it describes
(`LEGAL_SURFACES_AWAITING_REVIEW` in `apps/web/src/lib/legal-surfaces.ts`, which the test holds to every row whose
Before column names a production deploy, and each id to its gate): the disclosure page renders its two parts only
outside production; the screening stays closed there while any of its `screening-kept-*` or `screening-mail-*` rows waits, so nothing is
screened or kept under wording counsel has not confirmed (the founder's ruling of 2026-10-20 puts that confirmation
before the screening opens); and no production server sets or reads the attribution cookie while its row waits, so no
campaign code is kept from a visit before the privacy notice discloses the cookie. The audit request form's sentence
describes what that form keeps today, from the first deploy, so it waits only for launch. The pull request that
records a review removes the row and the id together.

The security contact itself (`/.well-known/security.txt` and the address on the page) is configuration, not a legal
text: production refuses to start without `SECURITY_EMAIL`, and `apps/web/src/lib/security/disclosure.test.ts` fails 30
days before security.txt's `Expires` date, when the address is checked again and the date moved on.
