import { checkReading as readOnce, narrativeFacts as factsOf } from '../../../../../packages/packets/src/check';

/**
 * @tp/packets/check as the forms' harness serves it (browser.ts aliases the specifier here): the real module, with the
 * two calls the narrative editor makes counted on window.checkCounts, so a browser test sees how often the editor builds
 * the version's facts and reads the narrative (the review of 2026-11-01, PE-9). Nothing else changes.
 */
export * from '../../../../../packages/packets/src/check';

const counts = { facts: 0, readings: 0 };
Object.assign(window, { checkCounts: counts });

export const narrativeFacts: typeof factsOf = (content) => {
  counts.facts += 1;
  return factsOf(content);
};

export const checkReading: typeof readOnce = (narrative, facts) => {
  counts.readings += 1;
  return readOnce(narrative, facts);
};
