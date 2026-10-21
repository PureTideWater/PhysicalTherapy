/**
 * What the screening says is kept, in one place for every surface (audit #57; the founder's rulings of 2026-10-20,
 * decisions 7, 10 and 17; docs/adr/0062, Outcomes, leads and attribution): the web app's pages and forms
 * (apps/web/src/lib/screening/retention.ts builds its sentences from these) and the result email (message.ts). Plain
 * strings, browser-safe (@tp/worker/screening-wording). Counsel reviews this wording before the screening opens
 * (docs/product/legal-surfaces.md).
 *
 * Two records outlive a screening:
 * - the counts-only record of every screening (screening_outcome, kept with no end date): KEPT_COUNTS;
 * - the kept summary of a screening an audit was requested from (screening_lead, 12 months from the screening):
 *   KEPT_SUMMARY, every column it holds. A later screening of the practice, from the same email address or the same
 *   ZIP code and practice name, takes that summary over at its completion and carries the request with it (decision
 *   17). Its uploader may be someone other than the requester, so a surface other than the converted page never says
 *   whether this practice has a request: it says what happens if it has (KEPT_IF_REQUESTED).
 */

/** The counts-only record's contents, as every surface lists them (decision 7, the plain list). */
export const KEPT_COUNTS =
  'ranges for how many rows the file had, how many were left out and how many were anomalies, a dollar range for the anomalies, what share of the allowed dollars could be priced, how you heard of us and the kind of link you came from, whether and how soon the result was opened and whether an audit was requested, the rule release used, and the month';

/**
 * What the kept summary holds (screening_freeze_lead): the screening's totals by payer product, its date and release,
 * the practice's name, state, ZIP code and email address, how they heard of us, the referring firm, the campaign codes
 * and kind of paid click of the link they came from, and when the result was first opened.
 */
export const KEPT_SUMMARY =
  'the screening’s totals, date and rule release, the practice name, state, ZIP code and email address given, how you heard of us, any referring firm, any campaign link you came from, and when the result was first opened';

/** Every surface but the converted result page: what is kept with an audit request, never whether there is one. */
export const KEPT_IF_REQUESTED = `If an audit is requested from the screening, or was requested from an earlier screening of the same practice, we keep ${KEPT_SUMMARY} with that request for 12 months from the screening.`;

/** The result email's sentence on what happens when its link closes. */
export const EMAIL_KEPT = `The link below opens it for 30 days from your upload, or until a later screening for the same practice or from this address replaces it. Then we delete the result and your details. ${KEPT_IF_REQUESTED} We keep a record of counts that names no one: ${KEPT_COUNTS}.`;
