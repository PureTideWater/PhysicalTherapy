/**
 * What the screening's pages say is kept, and for how long (audit #57; the founder's ruling of 2026-10-20, decision
 * 7: "the plain list"; docs/adr/0062, Outcomes, leads and attribution). Every surface that deletes a screening or
 * collects attribution says what outlives it: the counts-only outcome of every screening (kept with no end date, never
 * a name, email, ZIP, exact count, date or dollar figure), and, once an audit is requested, the screening's totals kept
 * with the request for 12 months from the screening. Counsel reviews this wording before the screening opens. The
 * worker's result email (apps/worker/src/screening/message.ts) says the same in its own words.
 */

/** The outcome's contents, as the result page lists them. */
export const KEPT_COUNTS =
  'ranges for how many rows the file had, how many were left out and how many were anomalies, a dollar range for the anomalies, what share of the allowed dollars could be priced, how you heard of us and the kind of link you came from, whether and how soon the result was opened and whether an audit was requested, the rule release used, and the month';

/** The result page: until when the link opens the result, what is deleted then, and what is kept. */
export function resultRetention(until: string): string {
  return `This link opens it until ${until}, or until a later screening for the same practice or from the same email address replaces it. Then we delete the result: its rows and figures, and the practice name, ZIP code and email address you gave. We keep a record of counts that names no one: ${KEPT_COUNTS}.`;
}

/** The result page once an audit was requested from it. */
export function convertedRetention(until: string): string {
  return `Because you requested an audit, we keep this screening’s totals, with your practice name, ZIP code, email address and how you heard of us, with your request for 12 months from the screening. This link still closes on ${until}. We also keep a record of counts for every screening that names no one; while we keep your request, yours can be matched to it.`;
}

/** The closed link's page. */
export const CLOSED_LINK_KEPT =
  'A screening link opens its result for 30 days from the upload, or until a later screening for the same practice or from the same email address replaces it, and then the result and the details given with it are deleted. We keep only a record of counts that names no one.';

/** The upload form's hint under the email address. */
export const UPLOAD_EMAIL_HINT =
  'The result is emailed here as a link that opens it for 30 days, or until a later screening of the practice replaces it. Then we delete the result and what you enter here, and keep only a record of counts that names no one.';

/** The upload form's "About your practice" card. */
export const ABOUT_PRACTICE = 'Used to price your file at your locality and to send the result.';

/** The "sent" alert, after its sentences on the email. */
export const SENT_KEPT = 'Then we delete it with your details, and keep only a record of counts that names no one.';

/** The audit request form, which collects how the requester heard of us and the campaign link they came from. */
export const REQUEST_AUDIT_KEPT = 'We keep your request, with how you heard of us and the campaign link you came from, to follow up on it.';

/** The conversion form on the result page. */
export const CONVERT_KEPT = 'Your request includes this screening’s totals, which we keep with your request for 12 months from the screening.';

/** The optional attribution fields, as both forms label them. */
export const HEARD_FROM_LABEL = 'How did you hear about us?';
export const REFERRING_FIRM_LABEL = 'Referring billing firm';
export const REFERRING_FIRM_HINT = 'Optional: the billing firm that suggested PaidWhole, if one did. No patient information.';
