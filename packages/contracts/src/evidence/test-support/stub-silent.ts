/**
 * A stand-in for the page reader that never says it is ready (pages.test.ts): the parent's deadline, counted from
 * spawn, must still stop it. Imports nothing of the repository.
 */
setInterval(() => undefined, 1000);
