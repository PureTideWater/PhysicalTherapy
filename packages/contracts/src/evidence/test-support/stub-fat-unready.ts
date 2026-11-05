/**
 * A stand-in for the page reader that holds more than READER_BASELINE_MAX_BYTES and never says it is ready
 * (pages.test.ts): only the parent's poll, before any baseline, can fail it as too large; the ready-time check never
 * runs. Imports nothing of the repository.
 */
const held = Buffer.alloc(240 * 1024 * 1024, 1);
setInterval(() => held.length, 1000);
