// node bound-refusals.mts <f0d415e2's redact.ts> <head's redact.ts>: what the wider reading's work bound (WIDER_WORK_BOUND,
// ADR 0054) refuses over the repository's synthetic prose. The corpus is cost-names.mts's (fixtures' .txt and .md, the
// narrative set, the letters quoted in the gateway's tests), each text as written and with every line ending as CR LF,
// with each of cost-names.mts's 64 names alone as the patient. Each goes down the letter's path on both trees
// (redactLetterForScreen, then holdsIdentifier). Printed: the corpus's size and longest text, the largest count of
// characters the bound could be asked about, the letters the head refuses by the bound, and the letters whose answer or
// sent text differs between the trees at all (the bound is the only change, so the two figures must be the same).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [F, H] = await Promise.all(process.argv.slice(2, 4).map((t) => import(pathToFileURL(t).href)));
const ROOT = '/home/user/PhysicalTherapy';
const texts: string[] = [];
const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(txt|md)$/.test(e.name) && fs.statSync(p).size < 400_000) texts.push(fs.readFileSync(p, 'utf8')); } };
walk(`${ROOT}/fixtures/synthetic`);
for (const f of ['packages/synth/src/eval/narrative-set.ts', 'packages/model-gateway/src/functions/denial-letter.test.ts', 'packages/model-gateway/src/functions/narrative.test.ts', 'packages/model-gateway/src/redact.test.ts']) {
  for (const m of fs.readFileSync(`${ROOT}/${f}`, 'utf8').matchAll(/'((?:[^'\\\n]|\\.){40,})'|`((?:[^`\\]|\\.){40,})`/g)) texts.push((m[1] ?? m[2] ?? '').replace(/\\n/g, '\n').replace(/\\'/g, "'"));
}
const NAMES = 'INA,ISA,ANA,ALAN,THEO,NEWMAN,UNDERWOOD,ABE,BEA,MAYA,AMY,IAN,NOEL,TOM,BEN,ANN,ALI,ELI,ADA,ARI,DON,ANDY,ISAAC,ISABEL,HASAN,ATWOOD,INMAN,FORMAN,NORMAN,HERMAN,ONEAL,MAYO,ANTON,DOAN,NOLAN,ASHE,THEIS,TOBIAS,AL,TY,JO,ED,BO,LI,AN,SO,TOBE,ASA,IDA,INGE,SOTO,ORR,WEBB,ISOM,FORTE,WITHERS,ZEPHYRA,VANTREE,MARIA,SMITH,JONES,GARCIA,NGUYEN,JOHNSON'.split(',');
const BOUND: number = H.WIDER_WORK_BOUND;
const work = (t: string) => t.length + (t.includes('\r\n') ? t.replace(/\r+\n/g, '\n').length : 0);
const letters = texts.flatMap((t) => [t, t.replace(/\r?\n/g, '\r\n')]);
const lengths = texts.map((t) => t.length).sort((a, b) => a - b);
console.log(`texts ${texts.length}, characters ${lengths.reduce((n, l) => n + l, 0)}, longest ${lengths.at(-1)}, median ${lengths[lengths.length >> 1]}; with their CR LF writings ${letters.length} letters; the bound ${BOUND}; the largest count a letter could be asked about ${Math.max(...letters.map(work))}`);
const claims = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'p', claimNumbers: ['SYN555001'] }];
let read = 0, byBound = 0, differ = 0, refusedBoth = 0;
for (const name of NAMES) {
  const P = { pseudonym: 'p', names: [name], datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] };
  for (const letter of letters) {
    const f = F.redactLetterForScreen(letter, P, claims); const h = H.redactLetterForScreen(letter, P, claims);
    const fr: boolean = F.holdsIdentifier(f.text, P, claims); const hr: boolean = H.holdsIdentifier(h.text, P, claims);
    read += 1; if (fr && hr) refusedBoth += 1;
    if (h.text.endsWith(H.BARRIER)) byBound += 1;
    if (fr !== hr || f.text !== h.text || JSON.stringify(f.candidates) !== JSON.stringify(h.candidates)) differ += 1;
  }
}
console.log(`letters read ${read} (${NAMES.length} names); refused on both trees ${refusedBoth}; refused by the bound ${byBound}; answer, sent text or candidates differ between the trees ${differ}`);
