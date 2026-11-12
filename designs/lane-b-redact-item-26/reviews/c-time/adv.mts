// Review C-TIME, steps 2 and 3: the adversarial search and the letters past the bound. Each letter is the JS expression in `expr`
// (a function of n; F, N and B in scope), evaluated as written, so the report's expression is the one that ran.
// Usage: adv.mts <tag> [id prefixes, comma separated] [runs]
import { B, F, N, calls, claimOf, measure, patientOf, probe, record, type Impl } from './lib.mts';
import * as base from '/home/user/rev/base/redact.ts';
import * as f0d from '/home/user/rev/f0d/redact.ts';

interface Case { id: string; expr: string; n?: number; names?: string[]; member?: string[]; claims?: string[]; fit?: boolean; impl?: 'base' | 'f0d'; runs?: number; calls?: boolean; noProbe?: boolean }
const J = ['JANE Q VANTREE'];
const SIX = ['SIMONE VANTREE', 'ZEPHYRA BELLO', 'JUNE ORLANDO'];
const SHORT6 = ['AL BO CY DI ED FY'];
const LONG = ['WILHELMINA Q VANTREE-MONTGOMERY HERNANDEZ ALEXANDROPOULOS'];
const r = String.raw;
export const CASES: Case[] = [
  // A: one look-alike character, so every reading runs on two folds.
  { id: 'A1', expr: r`(n) => F('1 1 11 ', n - 4) + '\r\n х'`, runs: 5, calls: true },
  { id: 'A1-base', expr: r`(n) => F('1 1 11 ', n - 4) + '\r\n х'`, runs: 5, impl: 'base' },
  { id: 'A1-f0d', expr: r`(n) => F('1 1 11 ', n - 4) + '\r\n х'`, runs: 5, impl: 'f0d' },
  { id: 'A2', expr: r`(n) => F('1 1 11 ', n - 2) + ' х'` },
  { id: 'A3', expr: r`(n) => F('1 1 11 ', n - 12) + 'Vant ree х'`, fit: true, calls: true },
  { id: 'A4', expr: r`(n) => 'х ' + F('1 1 11 ', n - 4) + '\r\n'` },
  { id: 'A5', expr: r`(n) => F('1 1 11 х ', n - 2) + '\r\n'` },
  { id: 'A6', expr: r`(n) => F('1 1 1І ', n - 2) + '\r\n'` },
  { id: 'A7', expr: r`(n) => F('З З 62 ', n - 2) + '\r\n'` },
  { id: 'A8', expr: r`(n) => F('1 1 11\r\n', n - 1) + 'х'` },
  { id: 'A9', expr: r`(n) => F('1 1 11 ', n - 2) + '\r\n'`, runs: 5, calls: true },
  { id: 'A9-base', expr: r`(n) => F('1 1 11 ', n - 2) + '\r\n'`, runs: 5, impl: 'base' },
  // B: lists searched once per match (matchesIn: plain.some, base.some, found.some).
  ...[12_000, 24_000, 48_000].map((n): Case => ({ id: `B0-${String(n)}`, n, expr: r`(n) => 'Vantree' + ' J'.repeat(n)` })),
  ...[6_000, 12_000, 24_000, 48_000].map((n): Case => ({ id: `B1-${String(n)}`, n, expr: r`(n) => 'Vantree' + ' J'.repeat(n) + ' х'` })),
  ...[24_000, 48_000].map((n): Case => ({ id: `B1-base-${String(n)}`, n, impl: 'base', expr: r`(n) => 'Vantree' + ' J'.repeat(n) + ' х'` })),
  ...[12_000, 24_000, 48_000].map((n): Case => ({ id: `B2-${String(n)}`, n, expr: r`(n) => 'Vantree' + ' J'.repeat(n) + ' ·'` })),
  ...[24_000, 48_000].map((n): Case => ({ id: `B3-${String(n)}`, n, expr: r`(n) => 'Vantree' + ' J'.repeat(n) + ' · х'` })),
  ...[25_000, 50_000, 100_000].map((n): Case => ({ id: `B4-${String(n)}`, n, names: ['AL Q VANTREE'], expr: r`(n) => F('Al ', n - 2) + ' х'` })),
  ...[10_000, 20_000].map((n): Case => ({ id: `B5-${String(n)}`, n, expr: r`(n) => 'Vantree' + ' J'.repeat(n) + ' xVANTR3Ex'.repeat(n / 4)` })),
  // C: runs of CR before the LF, so the LF writing is much shorter than the written one.
  { id: 'C1', expr: r`(n) => F('1 1 11 ', 10000) + '\r'.repeat(n - 10020) + '\nVant ree'`, fit: true, calls: true },
  { id: 'C2', expr: r`(n) => '\r'.repeat(n - 1) + '\n'` },
  { id: 'C2b', expr: r`(n) => '1' + '\r'.repeat(n - 3) + '\n1'` },
  { id: 'C2c', expr: r`(n) => F('\r\r\r\r\n', n)` },
  { id: 'C3', expr: r`(n) => F('5\r\r\r\r\r\r\r\r\n', n - 8) + 'Vant ree'`, fit: true },
  { id: 'C3b', expr: r`(n) => F('5\r\r\r\n', n)` },
  { id: 'C4', expr: r`(n) => F('1\r\r\r\n1\r\r\r\n11\r\r\r\n', n - 8) + 'Vant ree'`, fit: true },
  { id: 'C4b', expr: r`(n) => F('1\r\r\r\n1\r\r\r\n11\r\r\r\n', n)` },
  { id: 'C5', expr: r`(n) => F('1 1 11 \r', n - 2) + '\r\n'` },
  { id: 'C6', expr: r`(n) => F('1\r1\r11\r', n - 2) + '\r\n'` },
  // E: numbers stored with separators.
  { id: 'E1', member: ['ZZ-123-4567'], claims: ['SYN 555 001'], expr: r`(n) => F('ZZ-123-4567 SYN 555 001 ', n)` },
  { id: 'E2', member: ['ZZ-123-4567'], claims: ['SYN 555 001'], expr: r`(n) => F('ZZ-123-4567\r\nSYN 555 001\r\n', n)`, fit: true },
  { id: 'E3', member: ['ZZ-123-4567'], claims: ['SYN 555 001'], expr: r`(n) => F('ZZ-123-4568 SYN 555 002 ', n - 2) + '\r\n'` },
  { id: 'E4', member: ['ZZ-123-4567'], claims: ['SYN 555 001'], expr: r`(n) => F('ZZ-123-4568 SYN 555 002 ', n - 30) + '\r\nZZ - 123 - 4567'`, fit: true },
  { id: 'E5', member: ['ZZ-123-4567'], claims: ['SYN 555 001'], expr: r`(n) => F('Z Z 1 2 3 4 5 6 8 S Y N 5 5 5 0 0 2 ', n - 2) + '\r\n'` },
  // F: the first reading's text much longer or much shorter than the letter (the count is on the first reading's text).
  { id: 'F2', names: LONG, expr: r`(n) => F('Wilhelmina Q Vantree-Montgomery Hernandez Alexandropoulos,\r\n', n - 16) + 'Alexandro poulos'`, fit: true },
  { id: 'F3', expr: r`(n) => F('900-12-3456\r\n', n - 8) + 'Vant ree'`, fit: true },
  { id: 'F4', expr: r`(n) => F('(202) 555-0123\r\n', n - 8) + 'Vant ree'`, fit: true },
  { id: 'F5', expr: r`(n) => 'Vantree' + ' J'.repeat(n / 2) + '\r\nVant ree'`, fit: true },
  { id: 'F6', expr: r`(n) => 'Vantree' + ' J'.repeat(n / 2 - 8) + '\r\n'`, calls: true },
  // G: the first reading's check refuses late.
  { id: 'G1', expr: r`(n) => F('1 1 11 ', n / 2 - 70) + '\r\nSSN on file. Statement\r\nNo. 900-12-3456150.00\r\nVant ree'`, fit: true, calls: true },
  { id: 'G2', expr: r`(n) => F('1 1 11 ', n - 60) + '\r\nSSN on file. Statement\r\nNo. 900-12-3456150.00'`, calls: true },
  { id: 'G3', expr: r`(n) => F('1 1 11 ', n - 40) + 'Vant ree ref 3/3/61150.00'`, fit: true, calls: true },
  // H: a patient with six name parts.
  { id: 'H1', names: SIX, expr: r`(n) => F('1 1 11 ', n - 4) + '\r\n х'` },
  { id: 'H2', names: SHORT6, expr: r`(n) => F('1 1 11 ', n - 4) + '\r\n х'` },
  { id: 'H3', names: SHORT6, expr: r`(n) => F('1 1 11 ', n - 2) + '\r\n'` },
  { id: 'H4', names: SIX, expr: r`(n) => F('1 1 11 ', n / 2 - 20) + '\r\nVant ree х'`, fit: true },
  { id: 'H5', names: SHORT6, expr: r`(n) => F('a b c d e f ', n - 4) + '\r\n х'` },
  // I: above 100,000 characters.
  ...[200_000, 400_000].map((n): Case => ({ id: `I1-${String(n)}`, n, noProbe: true, expr: r`(n) => F('1 1 11 ', n)` })),
  ...[200_000, 400_000].map((n): Case => ({ id: `I3-${String(n)}`, n, noProbe: true, expr: r`(n) => F('1 1 11 ', n - 4) + '\r\n х'` })),
  { id: 'I4-200000', n: 200_000, noProbe: true, expr: r`(n) => F('1 1 11 ', n - 2) + '\r\n'` },
  // J: past the bound (step 3), five runs each.
  { id: 'J1', runs: 5, calls: true, expr: r`(n) => F('1/1/11 ', n) + 'Vant ree'` },
  { id: 'J2', runs: 5, expr: r`(n) => F('1 1 11 ', n) + 'Vant. ree'` },
  { id: 'J3', runs: 5, expr: r`(n) => 'Vant ree' + ' J'.repeat(n / 2)` },
  { id: 'J4', runs: 5, calls: true, expr: r`(n) => F('1 1 11 ', n) + '\r\nVant ree'` },
  { id: 'J5', runs: 5, expr: r`(n) => F('5\r\n', n) + 'Vant ree'` },
  { id: 'J6', runs: 5, expr: r`(n) => F('1 1 11 ', B / 2) + '\r\nVant ree'` },
  { id: 'J7', runs: 5, expr: r`(n) => F('1 1 11 ', n - 12) + '\r\nVant ree х'` },
  { id: 'J8', runs: 5, expr: r`(n) => 'Vantree' + ' J'.repeat(49990) + ' х\r\nVant ree'` },
  // K: the sweep's dearest cells, as explicit expressions, five runs each; the same letters on the base and on the build before the bound.
  ...(['', 'base', 'f0d'] as const).flatMap((impl): Case[] => [
    { id: `K1${impl && `-${impl}`}`, expr: r`(n) => F('5\n', 99990) + ' Vant ree'` },
    { id: `K2${impl && `-${impl}`}`, expr: r`(n) => F('5\n', 99998) + '\r\n'` },
    { id: `K3${impl && `-${impl}`}`, expr: r`(n) => F('5\n', 99996) + '\r\n х'` },
    { id: `K5${impl && `-${impl}`}`, names: ['JA Q ZE'], expr: r`(n) => F('1/1/20-1.00Ja ', 100000) + '\r\n х'` },
    { id: `K0${impl && `-${impl}`}`, expr: r`(n) => F('5\n', 100000)` },
  ].map((c) => ({ ...c, runs: 5, calls: impl === '', ...(impl === '' ? {} : { impl }) }))),
  { id: 'K4', runs: 5, calls: true, expr: r`(n) => F('5\n', 99984) + '\r\nVant ree х'`, fit: true },
  { id: 'K6', runs: 5, names: ['JA Q ZE'], expr: r`(n) => F('1/1/20-1.00Ja ', 49982) + '\r\nJ a х'` },
  { id: 'K7', runs: 5, expr: r`(n) => F('5\n', 49975) + '\r\nVant ree'` },
  { id: 'K8', runs: 5, calls: true, expr: r`(n) => F('5\n', 99988) + ' Vant ree х'` },
  { id: 'K9', runs: 5, names: SHORT6, expr: r`(n) => F('5\n', 99996) + '\r\n х'` },
  { id: 'K10', runs: 5, expr: r`(n) => F('1 1 11 ', n - 4) + '\r\n х'` },
  { id: 'K11', runs: 5, expr: r`(n) => F('1 1 11 ', n - 12) + 'Vant ree х'` },
  { id: 'K12', runs: 5, names: ['JA Q ZE'], expr: r`(n) => F('1/1/20-1.00Ja ', 99990) + ' J a'` },
  // X: the initials' lists at the letter's full length, five runs, head and base; the series for the growth.
  ...(['', 'base'] as const).flatMap((impl): Case[] => [
    { id: `X1${impl && `-${impl}`}`, expr: r`(n) => 'Vantree' + ' J'.repeat(49990) + ' х'` },
    { id: `X2${impl && `-${impl}`}`, expr: r`(n) => 'Vantree' + ' J'.repeat(49990) + ' ·'` },
    { id: `X3${impl && `-${impl}`}`, expr: r`(n) => 'Vantree' + ' J'.repeat(49990) + ' · х'` },
  ].map((c) => ({ ...c, runs: 5, ...(impl === '' ? {} : { impl }) }))),
  ...[12_000, 24_000, 48_000, 96_000].map((n): Case => ({ id: `Y1-${String(n)}`, n, runs: n > 50_000 ? 2 : 3, noProbe: true, expr: r`(n) => 'Vantree' + ' J'.repeat(n) + ' х'` })),
  ...[12_000, 24_000, 48_000, 96_000].map((n): Case => ({ id: `Y0-${String(n)}`, n, runs: n > 50_000 ? 2 : 3, noProbe: true, expr: r`(n) => 'Vantree' + ' J'.repeat(n)` })),
  ...[25_000, 50_000, 100_000, 200_000].map((n): Case => ({ id: `Y5-${String(n)}`, n, runs: 3, noProbe: true, expr: r`(n) => F('5\n', n - 10) + ' Vant ree'` })),
  // U: other units of one digit and one separator, as written (one redaction and one check), to rank them against '5\n'.
  ...[r`5\n`, r`1\n`, r`0\n`, r`5\n\n`, r`5\t`, r`5\n `, r`5\f`, r`5\v`, r`5 `, r`5\u0085`, r`5 `, r`55\n`, r`5.\n`, r`5,\n`, r`3\n3\n62\n`, r`l\n`, r`5\n5 `, r`5\nJ\n`, r`5\nх\n`, r`٥\n`].map((u, i): Case => ({ id: `U${String(i)}`, noProbe: true, expr: `(n) => F('${u}', n)` })),
  // L: the dearer units the ranking found (a digit of another script, a line separator), five runs; P: past the bound, the dearest redactions.
  { id: 'L1', runs: 5, expr: r`(n) => F('٥\n', 100000)` },
  { id: 'L1-base', runs: 5, impl: 'base', expr: r`(n) => F('٥\n', 100000)` },
  { id: 'L2', runs: 5, calls: true, expr: r`(n) => F('٥\n', 99990) + ' Vant ree'` },
  { id: 'L2-base', runs: 5, impl: 'base', expr: r`(n) => F('٥\n', 99990) + ' Vant ree'` },
  { id: 'L3', runs: 5, expr: r`(n) => F('٥\n', 99998) + '\r\n'` },
  { id: 'L4', runs: 5, expr: r`(n) => F('5 ', 100000)` },
  { id: 'L5', runs: 5, expr: r`(n) => F('5 ', 99990) + ' Vant ree'` },
  { id: 'L6', runs: 5, expr: r`(n) => F('5 ', 99998) + '\r\n'` },
  { id: 'L7', runs: 5, expr: r`(n) => F('٧\n', 99990) + ' Vant ree'` },
  { id: 'L8', runs: 5, expr: r`(n) => F('٥\n', 99988) + ' Vant ree х'` },
  { id: 'L9', runs: 5, expr: r`(n) => F('٥ ', 99990) + ' Vant ree'` },
  { id: 'P1', runs: 5, expr: r`(n) => F('5\n', 99990) + '\r\nVant ree'` },
  { id: 'P2', runs: 5, expr: r`(n) => F('٥\n', 99990) + '\r\nVant ree'` },
  { id: 'P3', runs: 5, expr: r`(n) => F('5\n', 99984) + '\r\nVant ree х'` },
  { id: 'P4', runs: 5, names: ['JA Q ZE'], expr: r`(n) => F('1/1/20-1.00Ja ', 99988) + '\r\nJ a х'` },
  // M: the second process for every row named as a finding (a suspicious row is repeated before it is reported), and the dearest unit's growth.
  { id: 'M-L9', runs: 5, expr: r`(n) => F('٥ ', 99990) + ' Vant ree'` },
  { id: 'M-L10', runs: 5, calls: true, expr: r`(n) => F('٥ ', 99998) + '\r\n'` },
  { id: 'M-L11', runs: 5, expr: r`(n) => F('٥ ', 100000)` },
  { id: 'M-L11-base', runs: 5, impl: 'base', expr: r`(n) => F('٥ ', 100000)` },
  { id: 'M-L12', runs: 5, expr: r`(n) => F('٥ ', 49975) + '\r\nVant ree'` },
  { id: 'M-K2', runs: 5, expr: r`(n) => F('5\n', 99998) + '\r\n'` },
  { id: 'M-K8', runs: 5, expr: r`(n) => F('5\n', 99988) + ' Vant ree х'` },
  { id: 'M-K9', runs: 5, names: SHORT6, expr: r`(n) => F('5\n', 99996) + '\r\n х'` },
  { id: 'M-L2', runs: 5, expr: r`(n) => F('٥\n', 99990) + ' Vant ree'` },
  { id: 'M-L5', runs: 5, expr: r`(n) => F('5 ', 99990) + ' Vant ree'` },
  { id: 'M-L6', runs: 5, expr: r`(n) => F('5 ', 99998) + '\r\n'` },
  { id: 'M-K7', runs: 5, expr: r`(n) => F('5\n', 49975) + '\r\nVant ree'` },
  { id: 'M-K10', runs: 5, expr: r`(n) => F('1 1 11 ', n - 4) + '\r\n х'` },
  ...[25_000, 50_000, 100_000, 200_000].map((n): Case => ({ id: `M-Y9-${String(n)}`, n, runs: 3, noProbe: true, expr: r`(n) => F('٥ ', n - 2) + '\r\n'` })),
];

const [tag, only, runsArg] = [process.argv[2] ?? 'x', process.argv[3] ?? '', Number(process.argv[4] ?? 0)];
const out = `${import.meta.dirname}/out/adv-${tag}.jsonl`;
const IMPLS: Record<string, Impl> = { base: base as unknown as Impl, f0d: f0d as unknown as Impl };
if (import.meta.filename === process.argv[1]) {
  measure(F('1 1 11 ', 21_000), patientOf(J), claimOf('SYN555001'), 2);
  for (const c of CASES) {
    if (only !== '' && !only.split(',').some((p) => c.id === p || c.id.startsWith(`${p}-`) || (p.endsWith('*') && c.id.startsWith(p.slice(0, -1))))) continue;
    const who = patientOf(c.names ?? J, c.member); const claims = claimOf(...(c.claims ?? ['SYN555001']));
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const make = new Function('F', 'N', 'B', `return (${c.expr});`)(F, N, B) as (n: number) => string;
    let n = c.n ?? N; let text = make(n); let p: Partial<ReturnType<typeof probe>> = {};
    if (c.fit === true) {
      for (let i = 0; i < 12 && text.length > N; i += 1) { n -= text.length - N; text = make(n); }
      let q = probe(text, who, claims);
      for (let i = 0; i < 10; i += 1) {
        if (q.wider === 0 || (q.work <= B && B - q.work < 120)) break;
        const next = Math.floor((n * (B - 40)) / q.work);
        if (next === n) break;
        const t2 = make(next);
        if (t2.length > N || t2 === text) break;
        const q2 = probe(t2, who, claims);
        if (q2.work > B && q.work <= B) break;
        n = next; text = t2; q = q2;
      }
      p = q;
    } else if (c.noProbe !== true) {
      p = probe(text, who, claims);
    }
    const m = measure(text, who, claims, runsArg > 0 ? runsArg : (c.runs ?? 2), c.impl === undefined ? undefined : IMPLS[c.impl]);
    const k = c.calls === true ? calls(text, who, claims) : undefined;
    record(out, { id: c.id, expr: c.expr, n, names: (c.names ?? J).join('|'), member: c.member, claims: c.claims, impl: c.impl ?? 'head', ...p, ...m, calls: k });
    console.log(`${c.id} [${c.impl ?? 'head'}] n ${String(n)} len ${String(m.len)} work ${String(p.work ?? '-')} wider ${String(p.wider ?? '-')} first ${String(p.firstLen ?? '-')} ${m.refused ? (m.bounded ? 'REFUSED(bound)' : 'refused') : 'sent'} same ${String(m.same)} best ${String(m.best)} worst ${String(m.worst)} cal ${String(m.cal)} ms ${m.ms.join(' ')}${k === undefined ? '' : ` calls ${JSON.stringify(k)}`}`);
  }
}
