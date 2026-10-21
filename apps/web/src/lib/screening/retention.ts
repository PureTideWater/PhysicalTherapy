import { KEPT_COUNTS, KEPT_IF_REQUESTED, KEPT_SUMMARY, type KeptWith, MATCHED } from '@tp/worker/screening-wording';

/**
 * What the screening's pages say is kept, and for how long (audit #57; the founder's rulings of 2026-10-20, decisions
 * 7, 10, 17 and 18; docs/adr/0062, Outcomes, leads and attribution), from the one wording every surface uses
 * (apps/worker/src/screening/wording.ts, which the result email uses too). Every surface that deletes a screening or
 * collects attribution says what outlives it: the counts-only record of every screening (kept with no end date, never a
 * name, email, ZIP, exact count, date or dollar figure), and the screening's summary when it is kept with an audit
 * request (its own, or an earlier screening's with the same practice name and ZIP code that it took over) for 12 months
 * from the screening. The result page says which applies to its screening, as the database says (kept_with); a surface
 * shown before a screening exists, or for a link that no longer opens, says what happens if one applies. Each is a
 * legal surface counsel reviews before the screening opens (docs/product/legal-surfaces.md).
 */

export { KEPT_COUNTS, KEPT_SUMMARY } from '@tp/worker/screening-wording';
export type { KeptWith } from '@tp/worker/screening-wording';

/** The result page: until when the link opens the result, what is deleted then, and what is kept, by what its summary is kept with. */
export function resultRetention(until: string, keptWith: KeptWith, converted: boolean): string {
  const closes = `This link still closes on ${until}, and then we delete the result’s rows and figures.`;
  switch (keptWith) {
    case 'none':
      return `This link opens it until ${until}, or until a later screening for the same practice or from the same email address replaces it. Then we delete the result: its rows and figures, and the practice name, ZIP code and email address you gave. If you request an audit from it, we keep ${KEPT_SUMMARY} with your request for 12 months from the screening. We keep a record of counts that names no one: ${KEPT_COUNTS}.`;
    case 'own_request':
      return `Because you requested an audit, we keep ${KEPT_SUMMARY} with your request for 12 months from the screening. ${closes} We also keep a record of counts for every screening that names no one: ${KEPT_COUNTS}; while we keep your request, yours can be matched to it.`;
    case 'earlier_request':
      return `An audit was requested for this practice from an earlier screening with the same practice name and ZIP code, so we keep ${KEPT_SUMMARY} with that request, in place of the earlier screening’s, for 12 months from this screening${converted ? '; your own request is kept beside it' : ''}. ${closes} We also keep a record of counts for every screening that names no one: ${KEPT_COUNTS}; ${MATCHED}.`;
    case 'consent':
      return `Because you agreed that we may follow up, we keep ${KEPT_SUMMARY} for 12 months from the screening, or until you withdraw with the link we send. ${closes} We also keep a record of counts for every screening that names no one: ${KEPT_COUNTS}; while we keep the summary, yours can be matched to it.`;
  }
}

/** The closed link's page: it cannot say whether the screening was kept with a request, so it says what happens if it was. */
export const CLOSED_LINK_KEPT = `A screening link opens its result for 30 days from the upload, or until a later screening for the same practice or from the same email address replaces it. Then we delete the result and the details given with it, and keep a record of counts that names no one. ${KEPT_IF_REQUESTED}`;

/** The upload form's hint under the email address. */
export const UPLOAD_EMAIL_HINT = `The result is emailed here as a link that opens it for 30 days, or until a later screening of the practice replaces it. Then we delete the result and what you enter here, and keep a record of counts that names no one. ${KEPT_IF_REQUESTED}`;

/** The upload form's "About your practice" card. */
export const ABOUT_PRACTICE = 'Used to price your file at your locality and to send the result.';

/** The "sent" alert, after its sentences on the email. */
export const SENT_KEPT = `Then we delete it with your details, and keep a record of counts that names no one. ${KEPT_IF_REQUESTED}`;

/** The audit request form, which collects how the requester heard of us and the campaign link they came from. */
export const REQUEST_AUDIT_KEPT =
  'We keep your request, with how you heard of us, any referring firm, and the campaign codes and kind of paid click of the link you came from (which a cookie of ours holds for 30 days from your first visit), to follow up on it.';

/** The conversion form on the result page, by what the screening's summary is already kept with. */
export function convertKept(keptWith: KeptWith): string {
  if (keptWith === 'earlier_request') {
    return 'This screening’s summary is already kept with an audit request made from an earlier screening of this practice, for 12 months from this screening. Your request is kept beside that one with no summary of its own: if the earlier request is deleted, the summary goes with it.';
  }
  return `We keep ${KEPT_SUMMARY} with your request for 12 months from the screening; ${MATCHED}.`;
}

/** The optional attribution fields, as both forms label them. */
export const HEARD_FROM_LABEL = 'How did you hear about us?';
export const REFERRING_FIRM_LABEL = 'Referring billing firm';
export const REFERRING_FIRM_HINT = 'Optional: the billing firm that suggested PaidWhole, if one did. No patient information.';
