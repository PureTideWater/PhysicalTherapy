// D1 review probes, second round. node probe2.mts
import { pathToFileURL } from 'node:url';
import { XA } from './gen2.mts';
const load = async (p: string): Promise<any> => import(pathToFileURL(p).href);
const B = await load('/home/user/tree-ef3/packages/model-gateway/src/redact.ts');
const H = await load('/home/user/fix/packages/model-gateway/src/redact.ts');
const P1 = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] };
const C1 = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const [PA, CA] = [XA.P, XA.C];
const out = (R: any, t: string, P: any, C: any) => { try { const s = R.redactLetterForScreen(t, P, C).text as string; return { r: R.holdsIdentifier(s, P, C) as boolean, s }; } catch (e) { return { r: false, s: `THREW ${String(e).slice(0, 80)}` }; } };
for (const [t, P, C] of [['900-12-3456Z3PHYRA', P1, C1], ['Tel 555-0123Z3phyra', P1, C1], ['Call 2025550123νantree today', PA, CA]] as [string, any, any][]) console.log(`RL ${JSON.stringify(t)} base=${JSON.stringify(B.redactLetter(t, P, C).text)} head=${JSON.stringify(H.redactLetter(t, P, C).text)}`);
const probes: [string, string, any?, any?][] = [
  ['P1', 'PatientSS# Zephyra 900.12 3456'], ['P2', 'memberHIC Zephyra 900 12 34 56'], ['P3', 'PatientSS# 1: 90012-3456 cc Zeph•yra'], ['P4', 'Paid900-12-3456Zephyra'], ['P5', 'Zephyra900-12-3456'], ['P6', 'Zephyrá 900-12-3456x'],
  ['Q1', '5IMONEVANTREE 555-0123', PA, CA], ['Q2', 'Tel 555-0123 5IMONEVANTREE', PA, CA], ['Q3', 'Tel 555-0123-5IMONEVANTREE', PA, CA], ['Q4', 'SSN 900-12-3456 VANTREESIMON3', PA, CA], ['Q5', 'Tel 5IMONE 555-0123', PA, CA], ['Q6', 'Tel 5IMONE-VANTREE 555-0123 456', PA, CA],
  ['R1', 'Claim Zephyra, 555-0123, 900123456'], ['R2', 'Phone Zephyra, 555-0123, 900123456'], ['R3', 'Phone 1: 555-0123, 900 12 3456'], ['R4', 'Fax 2) 555-0123 and 2025550123'], ['R5', 'Call Zephyra at 555-0123/555-0124'], ['R6', 'Call Zephyra at 555-0123 or 555-0124 45'], ['R7', 'Phone 1: 555-0123 900 12'], ['R8', 'Phone 1: 555-0123-45 Zephyra'], ['R9', 'Phone Zephyra 1234567893'], ['R10', 'Phone Zephyra 0123456789, Claim SYNCLAIM0001, 900123456'], ['R11', 'Tel Zephyra 555-0123, SYNCLAIM0001 and 900123456'], ['R12', 'Claims Zephyra 555-0123 and 900123456'],
];
for (const [id, t, P = P1, C = C1] of probes) {
  const b = out(B, t, P, C); const h = out(H, t, P, C);
  let w = ''; try { if (H.redactLetter(t, P, C).text !== h.s) w = ' W'; } catch { w = ' W?'; }
  const mark = !h.r && b.r ? 'FLIP' : !h.r && !b.r ? (h.s !== b.s ? 'diff' : 'same') : h.r && !b.r ? 'stricter' : 'bothref';
  console.log(`${id} ${mark}${w} ${JSON.stringify(t)}${mark === 'bothref' ? '' : ` b=${b.r ? 'REF ' : ''}${JSON.stringify(b.s).slice(0, 90)} h=${h.r ? 'REF ' : ''}${JSON.stringify(h.s).slice(0, 90)}`}`);
}
