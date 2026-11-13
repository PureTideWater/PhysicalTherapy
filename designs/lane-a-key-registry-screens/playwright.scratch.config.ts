// SCRATCH, never committed: the e2e configuration against a server already running (scratchpad serve.mts).
import base from './playwright.config';
const { webServer: _server, ...rest } = base;
export default { ...rest, testMatch: process.env.SCRATCH_MATCH ?? '**/*.spec.ts' };
