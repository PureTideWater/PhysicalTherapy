/**
 * A stand-in for the page reader that holds more than READER_BASELINE_MAX_BYTES before it says it is ready
 * (pages.test.ts): the parent must fail the read as the reader's own (it started too large), never widen its bound.
 * Imports nothing of the repository.
 */
const held = Buffer.alloc(240 * 1024 * 1024, 1);
const ready = Buffer.alloc(5);
process.stdout.write(ready);
setInterval(() => held.length, 1000);
