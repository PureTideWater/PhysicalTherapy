## Other sentences people see, word for word (Q12: the founder or the brand owner, then counsel where it is a legal surface)

Changed or added in the verification round, with the earlier text:

- The users page, an invitation reported as spam (200d2ba). Before: "Reported as spam {date}: ask the person to find it in their spam folder; one sent again will not reach them" (with "Send again" beside it). After: "Reported as spam: ask the person to find this invitation in their spam folder before {expiry date}. If they cannot, ask PaidWhole support to release their address and send it again; until then another one will not reach them." and, once it has expired, "Reported as spam, and expired: ask PaidWhole support to release their address and send it again." No "Send again".
- The users page, an invitation SES held back with its suppression list (new reason). Before: "Not delivered {date}: check the address, then invite again". After: "Not delivered {date}: our mail service is holding this address back after an earlier bounce or spam report. If the address is right, ask PaidWhole support to release it and send it again." No "Send again".
- The users page, a bounced or rejected invitation: unchanged, "Not delivered {date}: check the address, then invite again".
- A resend of a held-back invitation, refused (new): "our mail service is holding this address back: ask PaidWhole support to release it and send the invitation again"
- The in-app notification. Before: "A support-access opening (or closing) notice did not reach every administrator. Check your administrators' email addresses." After: "A support-access opening (or closing) notice did not reach every administrator. Check your administrators' email addresses; if an address is right, ask PaidWhole support to release it."
- The screening's refusal of an upload as a whole (paused, closed, the bounce budget; fc47317): the words are unchanged; the alert now reads "Not done" and the sentence alone, "request an audit" linked, with no "Check the fields marked below." and no "Form:" label.

Operators only (`/console/mail`; fc47317):

- The cut-off sentence. Before: "It pauses by itself when more than 3% of its sends bounce permanently (counted over at least 200 sends, so 7 hard bounces pause it) or more than 0.08% are reported as spam (over at least 2,500, so 3 complaints pause it), within 7 days or since the last resume; on the account’s warnings; or under an SES review." After: "It pauses by itself when more than 3% of its sends in the window bounce permanently (over at least 200 sends, so 7 hard bounces pause it) or more than 0.08% are reported as spam (over at least 2,500, so 3 complaints pause it); the window is the last 7 days, or since the last resume if that is later. It also pauses on the account’s warnings or under an SES review." Each figure in the mono face.
- Under the resume form. Before: "If SES still has the account under review, the platform pauses it again within a minute." After: "If SES still has the account under review, the platform pauses it again within a minute. Resume only once the account’s bounce and complaint rates are under their warnings: a warning still raised does not pause it again."
- The platform's log (58f8af5): "{stream} mail probe has not come back" (was "… has not come back in 26 hours"), and the new info line "mail probe event recorded". The alarm `MAIL_PROBE_MISSED`'s description now reads: "A {env} mail stream's probes have not come back: 26 hours after the older of its last delivered and bounced probe, or 1 hour after the first probe sent since a resume, sent and lost or never sent (then MAIL_PROBE_UNSENT too). It stays raised, and the probes go again hourly, until both come back. Staging and production close the screening 48 hours after the last came back, and keep a resumed one closed until both are back; check the identity, the event destination, the rule, the queue and the job (docs/runbooks/deliverability.md, 3.7)."

Unchanged in this pull request's later rounds (from the review round, listed for completeness):

- Every refused address (DNS, SES's validation or the refusal list): "We cannot send email to this address. Check it, or use another address."
- SES could not confirm the mailbox: "We could not confirm this mailbox exists. Check the address, or keep it as typed."
- A likely typo of a large provider's domain: "Did you mean @{provider domain}? Check the address, or keep it as typed." with a button "Use {suggested address}".
- An ending one edit from a common one: "This address ends in “.{ending}”. Did you mean “.{suggested}”? Check it, or keep it as typed."
- An ending in no top-level domain in use: "This address ends in “.{ending}”, which is not a domain ending in use. Check it, or keep it as typed."
- The box that keeps a questioned address: "Keep this address as typed"
- The result email's sender: "PaidWhole <results@screening.<domain>>", Reply-To the support address.
- Each support-access notice on the grant's page and the console's support list: "Sending", "Sent when access ends", "Sent {time}; delivery not yet confirmed", "Delivered to {n} of {n} administrator(s)", "Not delivered to {k} of {n} administrator(s). PaidWhole has been told." and "Not sent: the practice had no administrator"; labelled "Opening notice" and "Closing notice".
- The console's bounce marks "on email domains or mailboxes (3 refuse a fourth screening)".

