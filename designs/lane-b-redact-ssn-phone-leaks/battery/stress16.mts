// node stress16.mts <redact.ts> <prop.mts> [runs] [seed]: MOD-16's letters, sent unchanged and not refused?
import fc from 'fast-check';
import { pathToFileURL } from 'node:url';
const R = await import(pathToFileURL(process.argv[2]!).href);
const G = await import(pathToFileURL(process.argv[3]!).href);
const runs = Number(process.argv[4] ?? 20000);
const seed = Number(process.argv[5] ?? 42);
const show = Number(process.argv[6] ?? 12);
const P = { pseudonym: 'synthetic-patient-16', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] };
const C = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-16', claimNumbers: ['SYNCLAIM0001'] }];
const samples = fc.sample(fc.array(fc.tuple(G.keptSegment, fc.constantFrom(...G.KEPT_JOINS)), { minLength: 1, maxLength: 8 }), { numRuns: runs, seed });
let bad = 0; const why: Record<string, number> = {};
const shown: string[] = [];
for (const pieces of samples as any[]) {
  const glues = (i: number) => !/\p{L}$/u.test(pieces[i]?.[0].text ?? '') && /^\p{L}/u.test(pieces[i + 1]?.[0].text ?? '');
  const text = pieces.map(([segment, join]: any, i: number) => `${segment.text}${i === pieces.length - 1 ? '' : join === '' && !glues(i) ? ' ' : join}`).join('');
  const s = R.redactLetterForScreen(text, P, C);
  const refused = R.holdsIdentifier(s.text, P, C);
  if (refused || s.text !== text.normalize("NFKC") || s.replaced !== 0) { why["refused"] = (why[R.lastStrictReason || "?"] ?? 0) + 1;
    bad += 1;
    if (shown.length < show) shown.push(`${refused ? "REFUSED" : "CHANGED"} [] ${JSON.stringify(text)}`);
  }
}
console.log(JSON.stringify(why)); console.log(`MOD-16 runs ${runs} seed ${seed} bad ${bad}`);
for (const s of shown) console.log('  ', s);
