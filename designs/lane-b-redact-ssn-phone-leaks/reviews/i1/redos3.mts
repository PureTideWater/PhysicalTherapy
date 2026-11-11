// node redos3.mts: what the slow path needs (time of the head's holdsIdentifier; the run is 48 characters unless said).
import { load, patient, claims } from './lib.mts';
const H = await load('head');
const run = '_'.repeat(48);
const rows: [string, string][] = [
  ['baseline: noun, run, a word, a number whose naming is asked', `Claim Number: ${run} Date 12345-67-89012`],
  ['the run stands right before the number', `Claim Number: ${run} 12345-67-89012`],
  ['no listed noun before the run', `Signature: ${run} Date 12345-67-89012`],
  ['a word between the noun and the run', `Member name: ${run} Date 12345-67-89012`],
  ['sixteen runs of three, a space between', `Claim Number: ${'___ '.repeat(16)}Date 12345-67-89012`],
  ['two runs of 24, spaces between', `Claim Number: ${'_'.repeat(24)}  ${'_'.repeat(24)} Date 12345-67-89012`],
  ['a number whose naming is not asked', `Claim Number: ${run} Date 202-555-0123`],
  ['double box line U+2550 under a header', `Check\n${'═'.repeat(48)}\nTotal 12345-67-89012`],
  ['baseline again', `Claim Number: ${run} Date 12345-67-89012`],
];
for (const [name, text] of rows) {
  const s = H.redactLetterForScreen(text, patient, claims);
  const t = performance.now();
  const refused = H.holdsIdentifier(s.text, patient, claims);
  console.log(`${(performance.now() - t).toFixed(0).padStart(6)} ms ${refused ? 'REFUSED' : 'sent   '} ${name}`);
}
