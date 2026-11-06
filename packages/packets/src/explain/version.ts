/**
 * The words version (finding M1; docs/adr/0072): which renderer wrote a calculation's words. WORDS_VERSION is the
 * SHA-256 of the canonical JSON of every word table (./words.ts), the slot table (./slots.ts), RENDERER_REVISION and a
 * packet narrative's facts' tables and amounts (../fact-words.ts, ../words-version.ts); ../words-version.ts computes
 * it and version.test.ts requires this literal to equal it, printing the value to write when it differs. A literal, so
 * the subpath stays free of node:crypto. RENDERER_REVISION is raised with any change to a sentence form (./line.ts,
 * ./worksheet.ts, ./figures.ts) or to the facts' catalog and renderer (../fact-catalog.ts, ../render.ts) that changes
 * no table, so the version still moves: sentence-forms.test.ts pins the SHA-256 of those files' text beside the
 * revision it was written under, and fails on any edit to them until both are written again.
 *
 * The review page, the approve and export-request forms and the export job each hold this value, and each refuses a
 * value that differs from its own: the reviewer reads what the payer reads under the same renderer.
 */
export const RENDERER_REVISION = 5;

export const WORDS_VERSION = 'c851ebbc27b30416ffa8eb2899da7c817870130b2a3060f9bf9f443166fa366a';
