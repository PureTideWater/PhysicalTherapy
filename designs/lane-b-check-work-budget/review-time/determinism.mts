// The count of 30 varied letters, with the real budget, by mode: fresh | after (200 other letters first) | reversed.
process.env.BUDGET = '420000000';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const { once, who, claimsOf, rep } = await import('./lib.mts');
const mode = process.argv[2] ?? 'fresh';
const TOKENS = ['Zephyra', 'Jane', 'J', 'J.', 'Q', 'Zeph∙yra', 'х', 'Ј', 'Zерhуrа', 'ＺＥＰＨＹＲＡ', 'zephyra', 'ZZ1234567', 'ZZ-1234-567', 'SYN555001', 'SYN 555 001', '03/03/1961', 'Mar 3, 1961', '3 3 61', '610303', '5', '12', '97110', '$150.00', '900-12-3456', '(202) 555-0123', '٥', '３', '߅', '௫', 'Claim', 'Member ID', 'DOB', 'SSN', 'Phone', 'Service', 'Paid', 'and', 'the', 'St.', '3rd', '[PATIENT_NAME]', '[CLAIM_1]', '[CLAIM_7654321]', '[', ']', 'ﷺ', '⒈', '½', 'é', 'ß', 'ǅ', 'İ', 'ı', 'ſ', 'Σ', 'ς', 'ẞ', 'ŉ', 'ͅ', 'Ⅻ', '𝐉', '𝟓', 'Ａ', 'ｊ'];
const SEPS = [' ', ' ', '', '\n', '\r\n', '-', '​', '­', '.', '/', ':', '\t', '\n    ', ' ', ', ', '∙', "'", '-\n'];
const maker = (seed: number) => { let s = seed >>> 0; const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; const pick = <T,>(l: readonly T[]) => l[Math.floor(rnd() * l.length)] as T; return (count: number, lo: number, hi: number) => Array.from({ length: count }, () => { let unit = ''; const k = 1 + Math.floor(rnd() * 6); for (let i = 0; i < k; i++) unit += pick(TOKENS) + pick(SEPS); const pre = rnd() < 0.4 ? 'Zephyra ' : ''; const periodic = rnd() < 0.6; const n = lo + Math.floor(rnd() * (hi - lo)); if (periodic) return rep(unit, pre)(n); let text = pre; while (text.length < n) text += pick(TOKENS) + pick(SEPS); return text; }); };
const P = who(); const C = claimsOf();
// 26 random letters, and 4 that the real budget refuses part-way (in the redaction, in the look-alike reading, in the check).
const letters = [...maker(20261112)(26, 1_500, 30_000), '5\n'.repeat(50_000), 'Zephyra' + ' J'.repeat(49_990) + ' х', 'a '.repeat(120_000), 'Zeph∙yra Zephyra' + ' J'.repeat(30_000) + ' х'];
if (mode === 'after') { const others = maker(777)(200, 500, 6_000); others.forEach((text, i) => { once(text, P, C); if (i % 50 === 10) once('Zephyra' + ' Q'.repeat(45_000) + ' х', who(['QUINN J ZEPHYRA']), claimsOf(['SYN555777'])); }); }
const order = letters.map((_, i) => i); if (mode === 'reversed') order.reverse();
const got: string[] = [];
for (const i of order) { const text = letters[i] as string; const g = once(text, P, C); got[i] = `${String(i).padStart(2)} len ${text.length} redaction ${g.first} check ${g.units} held ${String(g.held)} out ${g.outLen}`; }
const body = got.join('\n') + '\n';
const file = `/home/user/review-time/out/det-${mode}-${process.version.split('.')[0]}.txt`;
fs.writeFileSync(file, body);
console.log(file, createHash('sha256').update(body).digest('hex').slice(0, 16), `unicode ${process.versions.unicode} icu ${process.versions.icu}`, `refused ${got.filter((l) => / check 42000\d{4}| redaction 420000001/.test(l)).length}`);
