/**
 * The words version (finding M1; docs/adr/0072): which renderer wrote a calculation's words. WORDS_VERSION is the
 * SHA-256 of the canonical JSON of every word table (./words.ts), the slot table (./slots.ts) and RENDERER_REVISION;
 * ../words-version.ts computes it and version.test.ts requires this literal to equal it, printing the value to write
 * when it differs. A literal, so the subpath stays free of node:crypto. RENDERER_REVISION is raised by hand with any
 * change to a sentence form (./line.ts, ./worksheet.ts) that changes no table, so the version still moves.
 *
 * The review page, the approve and export-request forms and the export job each hold this value, and each refuses a
 * value that differs from its own: the reviewer reads what the payer reads under the same renderer.
 */
export const RENDERER_REVISION = 2;

export const WORDS_VERSION = 'add9bd2abbd5ca8c578155160f50a0904685be1b87356176b42e5f02a579ab5c';
