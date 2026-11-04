/**
 * What the screening says is kept, in one place for every surface (audit #57; the founder's rulings of 2026-10-20,
 * decisions 7, 10, 17 and 18; docs/adr/0062, Outcomes, leads and attribution): the web app's pages and forms
 * (apps/web/src/lib/screening/retention.ts builds its sentences from these) and the result email (message.ts). Plain
 * strings, browser-safe (@tp/worker/screening-wording). Counsel reviews this wording before the screening opens
 * (docs/product/legal-surfaces.md, the screening-kept rows; a production server keeps the screening closed until then).
 *
 * Two records outlive a screening:
 * - the counts-only record of every screening (screening_outcome, kept with no end date): KEPT_COUNTS, every column;
 * - the kept summary of a screening an audit was requested from (screening_lead, 12 months from the screening):
 *   KEPT_SUMMARY, every column it holds. A later screening with the same practice name and ZIP code, from any email
 *   address, takes that summary over at its completion and carries the request with it (decision 17), so the later
 *   prospect's own details are what is kept with the request. The database says which applies to a screening
 *   (screening_result_summary's and operator_screening_complete's kept_with), and the result page and email say it;
 *   a surface shown before a screening exists, or for a link that no longer opens, says what happens if it applies
 *   (KEPT_IF_REQUESTED), never whether a practice has a request.
 */

/** What a screening's summary is kept with: nothing, the audit request made from it, an earlier screening's request it took over, or consent. */
export type KeptWith = 'none' | 'own_request' | 'earlier_request' | 'consent';
export const KEPT_WITH: readonly KeptWith[] = ['none', 'own_request', 'earlier_request', 'consent'];

/** The counts-only record's contents (screening_outcome), as every surface lists them (decision 7, the plain list). */
export const KEPT_COUNTS =
  'ranges for how many rows the file had, how many were left out and how many were anomalies; a dollar range for the anomalies’ gap below their Medicare figures; what shares of the allowed dollars were priced, need a contract, could not be priced or were not screened; how you heard of us and the kind of link you came from (its channel, and its campaign if it is one we list); whether and how soon the result was first opened; whether an audit was requested; whether the screening followed a refused upload or a later screening replaced it; for a refused upload, the kinds of problem found; the rule release used; and the month';

/**
 * What the kept summary holds (screening_freeze_lead): the screening's totals by payer product, its date and release,
 * the practice's name, state, ZIP code and email address, how they heard of us, the referring firm, the campaign codes
 * and kind of paid click of the link they came from, and when the result was first opened.
 */
export const KEPT_SUMMARY =
  'the screening’s totals by payer product, its date and rule release, the practice name, state, ZIP code and email address given with it, how you heard of us, any referring firm, the campaign codes and kind of paid click of any link you came from, and when the result was first opened';

/** That a kept request's screening's record of counts can be matched to it (decision 18). */
export const MATCHED = 'while we keep the request, the record of counts of the screening it is kept with can be matched to it';

/** Every surface shown before a screening exists, or for a link that no longer opens: what is kept with an audit request, never whether there is one. */
export const KEPT_IF_REQUESTED = `If an audit is requested from the screening, or was requested from an earlier screening with the same practice name and ZIP code, we keep ${KEPT_SUMMARY} with that request for 12 months from the screening.`;

/**
 * What outlives a screening's address when its email could not be delivered or was reported as spam (audit #76; the
 * founder's Q11 (b) of 2026-10-21: a keyed hash kept 12 months, used only to refuse that address; docs/adr/0065). No
 * surface calls it deleted. It says what the hash does, refuse a new screening to the address, and not "never send to
 * it again": the hash lapses after 12 months, and a screening already accepted for the address is still sent (the review
 * of 2026-10-23, Wording). Every surface that says the address is deleted says it, the result email too (the review of
 * 2026-10-27). A legal surface counsel reviews with the others before the screening opens (open item O4).
 */
export const REFUSED_ADDRESS_KEPT =
  'If email to the address you gave cannot be delivered, or is reported as spam, we keep a coded form of it, which cannot be turned back into the address, for 12 months, only to refuse another screening to that address.';

/**
 * What outlives a screening's address in AWS (docs/adr/0065, residual 1; docs/policies/data-retention.md): SES's check that
 * the address can receive email is a request recorded in the address-validation account's CloudTrail event history,
 * which keeps it 90 days, with the address in it unless CloudTrail withholds it. Every surface that says the address is
 * deleted says it (the review of 2026-10-27). A legal surface counsel reviews before the screening opens (O4).
 */
export const ADDRESS_CHECK_KEPT = 'The mail service that checks whether the address can receive email keeps a record of that check, which can name the address, for 90 days.';

/** The result email's sentences on what happens when its link closes, by what this screening's summary is kept with. */
export function emailKept(keptWith: Exclude<KeptWith, 'own_request'>): string {
  const opens = 'The link below opens it for 30 days from your upload, or until a later screening for the same practice or from this address replaces it.';
  switch (keptWith) {
    case 'none':
      return `${opens} Then we delete the result and the details you gave, unless an audit is requested from it: then we keep ${KEPT_SUMMARY} with the request for 12 months from the screening. ${REFUSED_ADDRESS_KEPT} ${ADDRESS_CHECK_KEPT} We keep a record of counts that names no one: ${KEPT_COUNTS}.`;
    case 'earlier_request':
      return `${opens} Then we delete the result’s rows and figures. An audit was requested for this practice from an earlier screening with the same practice name and ZIP code, so we now keep ${KEPT_SUMMARY} with that request, in place of the earlier screening’s, for 12 months from this screening. We keep a record of counts that names no one: ${KEPT_COUNTS}; ${MATCHED}.`;
    case 'consent':
      return `${opens} Then we delete the result’s rows and figures. Because you agreed that we may follow up, we keep ${KEPT_SUMMARY} for 12 months from the screening, or until you withdraw with the link we send. We keep a record of counts that names no one: ${KEPT_COUNTS}; while we keep the summary, the record can be matched to it.`;
  }
}
