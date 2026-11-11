// Synthetic only. Sets fast-check's global seed from FC_SEED for a run of the property files (as the gate's tests.sh does).
import fc from 'fast-check';

const seed = Number(process.env.FC_SEED ?? '0');
if (seed !== 0) fc.configureGlobal({ seed });
