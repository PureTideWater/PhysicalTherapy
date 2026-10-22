/**
 * The "sent" page after an upload (the founder's Q12 of 2026-10-21, the recommended wording, for counsel to confirm
 * before the screening opens; Q7's queue): its first words say how long the result is likely to take, by where the
 * upload stands in the queue. `soon`: a slot of the screening consumer is free, usually within a minute. `minutes`:
 * every slot is busy or taken by the runs ahead. `account`: the upload is over its account's share of the UTC day, and
 * `day`: over the day's cap; both wait behind every normal upload, with no time promised.
 */
export const SCREENING_WAIT_STATES = ['soon', 'minutes', 'account', 'day'] as const;
export type ScreeningWaitState = (typeof SCREENING_WAIT_STATES)[number];

/** The "sent" alert's first words, by state. */
export const SCREENING_SENT_WAIT: Readonly<Record<ScreeningWaitState, string>> = {
  soon: 'We are screening your file. The result is emailed to the address you gave as a link, usually within a minute.',
  minutes: 'We are screening your file. Every screening slot is busy right now, so the result, emailed to the address you gave as a link, can take a few minutes.',
  account:
    'We have your file. Your email address or its organization has already screened more than one day’s share today, so this file waits until the screenings ahead of it are done, and the result, emailed to the address you gave as a link, can take longer than usual.',
  day: 'We have your file. The screening has reached its limit for today, so this file waits until the screenings ahead of it are done, and the result, emailed to the address you gave as a link, can take longer than usual.',
};

/** What the alert says after its first words, whatever the state. */
export const SCREENING_SENT_LINK = 'The link opens the result for 30 days, or until a later screening for the same practice or from the same email address replaces it.';
