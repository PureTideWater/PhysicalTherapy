# Legal surfaces

The words the product shows the public or a customer that carry a legal commitment, and who must review each before
launch. A surface in the product is marked where it renders with `data-legal-surface="<id>"` and a comment naming this
list; `tools/test/legal-surfaces.test.ts` holds the two to each other, so a marked surface missing here, or a row here
whose file no longer carries its marker, fails `pnpm test`. A row leaves this list only when its review is recorded in
the pull request that changes its text.

The combined audit (adopted 2026-10-20) places the legal texts, the terms shown before "I accept", the privacy notice,
the screening terms and the AMA notice in a legal-surfaces pull request before PR 16 and any production deploy (items
#51 and #52). That pull request reviews every row below with counsel, and adds its own.

| ID | Surface | Where | Review | Before |
| --- | --- | --- | --- | --- |
| `good-faith-research` | The disclosure page's good-faith research statement: research that follows the page is treated as authorized, no legal action is brought or supported over it, and a third party's claim is answered by saying so; it never authorizes access to patient information or to data that is not the researcher's | `apps/web/src/app/security/page.tsx` | Counsel (the legal-surfaces pull request) | Launch, and any production deploy |
| `disclosure-response-times` | The disclosure page's response times: receipt confirmed within three business days, an assessment within ten, a fix aimed for within 90 days of the report, publication agreed with the reporter, no rewards | `apps/web/src/app/security/page.tsx` | The security official (with the incident-response policy) | Launch, and any production deploy |

The security contact itself (`/.well-known/security.txt` and the address on the page) is configuration, not a legal
text: production refuses to start without `SECURITY_EMAIL`, and `apps/web/src/lib/security/disclosure.test.ts` fails 30
days before security.txt's `Expires` date, when the address is checked again and the date moved on.
