/**
 * The "sent" page after an upload (the founder's Q12 of 2026-10-21, the recommended wording, for counsel to confirm
 * before the screening opens; Q7's queue; the wording revised after the review of 2026-10-22, for the founder and then
 * counsel): its first words say how long the result is likely to take, by where the upload stood in the queue when it
 * arrived. `soon`: a slot of the screening consumer was free, usually within a minute. `minutes`: every slot was busy or
 * taken by the runs ahead. `waiting`: the upload is past its account's share of the UTC day or past the day's cap; the
 * page does not say which, since nothing proves the visitor owns the address typed (the account's share would tell
 * anyone that an organization's domain screened more than its share that day), and the emailed result, which reaches
 * the mailbox's owner, says why it waited. `sent`: the queue could not be read, or the link carries no state (one
 * edited by hand, or bookmarked from before the states): nothing but that the file arrived. Each sentence stays true on
 * a reload or a bookmark: it says how things stood when the file arrived, not how they stand now.
 */
export const SCREENING_WAIT_STATES = ['soon', 'minutes', 'waiting', 'sent'] as const;
export type ScreeningWaitState = (typeof SCREENING_WAIT_STATES)[number];

/** The page an accepted upload lands on (the capacity harness waits for it: tools/screening-capacity/uploads.ts). */
export function screeningSentPath(wait: ScreeningWaitState): string {
  return `/screening?sent=1&wait=${wait}`;
}

/** The state a link names, read leniently: anything but a state (none, a typo, an old link) reads as `sent`. */
export function screeningWaitStateOf(value: string | undefined): ScreeningWaitState {
  return (SCREENING_WAIT_STATES as readonly string[]).includes(value ?? '') ? (value as ScreeningWaitState) : 'sent';
}

/** The "sent" alert's first words, by state. */
export const SCREENING_SENT_WAIT: Readonly<Record<ScreeningWaitState, string>> = {
  soon: 'We have your file. The result is emailed to the address you gave as a link, usually within a minute of when you sent it.',
  minutes: 'We have your file. Other screenings were ahead of it when it arrived, so the result, emailed to the address you gave as a link, can take a few minutes.',
  waiting: 'We have your file. It is screened after the files sent within today’s limits, so the result, emailed to the address you gave as a link, can take longer than usual.',
  sent: 'We have your file. The result is emailed to the address you gave as a link.',
};

/** What the alert says after its first words, whatever the state. */
export const SCREENING_SENT_LINK = 'The link opens the result for 30 days, or until a later screening for the same practice or from the same email address replaces it.';
