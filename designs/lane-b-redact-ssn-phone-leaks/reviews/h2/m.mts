// TREES=head,before,base node m.mts [layouts|special]: a noun above or beside its number in many layouts (A.2), and hand-written letters (A.3, A.4, B).
import { out, MAYA } from './lib2.mts';
const part = process.argv[2] ?? 'layouts';
const NOUNS = ['Claim Number', 'ICN', 'Reference No.', 'Control Number', 'Invoice No.', 'Check Number', 'Policy Number', 'Member ID', 'Claim', 'Reference', 'Account', 'Invoice', 'Authorization', 'Case', 'Remittance Advice', 'Statement'];
const NUMS = ['20260112345.01', '12345678901234.01', '802-45-678901.50', '12345678901/02/2026'];
const R = (ch: string, k: number) => ch.repeat(k);
const ruled = (ch: string): [string, (n: string, x: string) => string] => [`rule of ${JSON.stringify(ch)} under the label`, (n, x) => `${n}\n${R(ch, n.length)}\n${x}`];
const wide = (k: number): [string, (n: string, x: string) => string] => [`rule of hyphens ${k} wide`, (n, x) => `${n}\n${R('-', k)}\n${x}`];
const LAY: [string, (n: string, x: string) => string][] = [
  ['same line, colon', (n, x) => `${n}: ${x}`],
  ['one line break', (n, x) => `${n}\n${x}`],
  ['colon, blank line', (n, x) => `${n}:\n\n${x}`],
  ['blank line, no colon', (n, x) => `${n}\n\n${x}`],
  ruled('-'), ruled('='), ruled('_'), ruled('~'), ruled('*'), ruled('.'), ruled('—'), ruled('─'), ruled('━'),
  ['rule of spaced hyphens "- - -"', (n, x) => `${n}\n${R('- ', 6).trim()}\n${x}`],
  ['rule +-----+', (n, x) => `${n}\n+${R('-', n.length)}+\n${x}`],
  ['rule |-----|', (n, x) => `${n}\n|${R('-', n.length)}|\n${x}`],
  wide(80), wide(100), wide(110), wide(120), wide(132),
  ['rule, number indented 8', (n, x) => `${n}\n-----\n        ${x}`],
  ['label, rule and number all indented 4', (n, x) => `    ${n}\n    -----\n    ${x}`],
  ['boxed cell: | label | / |-----| / | number |', (n, x) => `| ${n} |\n|${R('-', n.length + 2)}|\n| ${x} |`],
  ['boxed with a +---+ frame', (n, x) => `+${R('-', n.length + 2)}+\n| ${n} |\n+${R('-', n.length + 2)}+\n| ${x} |`],
  ['markdown **label**', (n, x) => `**${n}**\n${x}`],
  ['markdown __label__', (n, x) => `__${n}__\n${x}`],
  ['form blank: label: ______ number', (n, x) => `${n}: ______ ${x}`],
  ['form blank filled: label: __number__', (n, x) => `${n}: __${x}__`],
  ['dot leaders', (n, x) => `${n} ........ ${x}`],
  ['header row of 3 columns (spaces), number first', (n, x) => `${n}    Service Date    Billed\n${x}    01/15/2026    150.00`],
  ['header row of 3 columns (pipes), number first', (n, x) => `${n} | DOS | Billed\n${x} | 01/15/2026 | 150.00`],
  ['header row of 3 columns (tabs), number first', (n, x) => `${n}\tDOS\tBilled\n${x}\t01/15/2026\t150.00`],
  ['header row (spaces), number in the last column', (n, x) => `DOS    Billed    ${n}\n01/15/2026    150.00    ${x}`],
  ['header row (pipes), number in the last column', (n, x) => `DOS | Billed | ${n}\n01/15/2026 | 150.00 | ${x}`],
  ['two fields on a line: Date: ... label: number', (n, x) => `Date: 01/15/2026    ${n}: ${x}`],
  ['label, words, number', (n, x) => `${n} for this service: ${x}`],
  ['label (see below), break', (n, x) => `${n} (see below)\n${x}`],
  ['label -> number', (n, x) => `${n} -> ${x}`],
  ['label = number', (n, x) => `${n} = ${x}`],
  ['label, bullet on the next line', (n, x) => `${n}\n• ${x}`],
  ['label, "> " on the next line', (n, x) => `${n}\n> ${x}`],
  ['wrapped label (its space a line break)', (n, x) => `${n.replace(' ', '\n')}\n${x}`],
  ['CRLF blank line with a colon', (n, x) => `${n}:\r\n\r\n${x}`],
  ['form feed then a break', (n, x) => `${n}:\f\n${x}`],
  ['label, colon, break, tab', (n, x) => `${n}:\n\t${x}`],
  ['label_number', (n, x) => `${n}_${x}`],
  ['label [number]', (n, x) => `${n} [${x}]`],
  ['label <number>', (n, x) => `${n} <${x}>`],
  ['label – number (en dash)', (n, x) => `${n} – ${x}`],
  ['label… number (ellipsis)', (n, x) => `${n}… ${x}`],
  ['label → number (arrow)', (n, x) => `${n} → ${x}`],
  ['label · number (middle dot)', (n, x) => `${n} · ${x}`],
  ['label; number', (n, x) => `${n}; ${x}`],
  ['label + number', (n, x) => `${n} + ${x}`],
  ['label ~ number', (n, x) => `${n} ~ ${x}`],
];
const SPECIAL: [string, any?][] = [
  ['ICN\n-----\n12345678901234.01'], ['ICN\n_____\n12345678901234.01'], ['ICN\n~~~~~\n12345678901234.01'], ['Claim Number\n____________\n20260112345.01'], ['Claim Number\n+------------+\n20260112345.01'],
  ['Claim Number: ________\n20260112345.01'], ['Claim\n-----\n12345678901234.01'], ['Claim\n-  \n12345678901234.01'], ['Statement\n\n802-45-678901.50'], ['Statement\n.  \n802-45-678901.50'], ['Statement\n- \n802-45-678901.50'],
  ['Claim number on file: 12345678901234.01'], ['Claim number on-file: 12345678901234.01'], ['Claim number on\nfile: 12345678901234.01'], ['ICN on-file 12345678901234.01'], ['File 12345678901234.01'], ['On-file 12345678901234.01'], ['Upon file 12345678901234.01'], ['Reconsideration - File 12345678901234.01'], ['Decision on -- File 12345678901234.01'],
  ['Remittance\nAdvice 12345678901234.01'], ['Remittance\n\nAdvice 12345678901234.01'], ['Remit Advice No. 802-45-678901.50'],
  ['SSN: Medicare rate 110 32.74420'], ['Medicare rate 110 32.74420'], ['Social Security/Medicare rate 110 32.74420'], ['Soc. Sec. and Medicare 110 32.74420'], ['Social Security offset 110 32.74420'],
  ['SSN   Claim Number: 20260112345.01'], ['SSN:   Claim Number: 20260112345.01'], ['HIC Claim Number 12345678901.01'], ['Social Security Disability Claim 12345678901.01'], ['Social Security Claim 12345678901.01'], ['Social Security Check 12345678901.00'], ['Verify SSN\nClaim Number: 20260112345.01'],
  ['NPI 1234567893/15/2026'], ['Provider 1234567893/15/2026'], ['Seq 0000012345/1/2026'], ['Trace 12345678901/02/2026150.00'], ['On 12345678901/02/20261234'], ['SSN_Verification_79790014228_08_2026.pdf'],
  ['Service 01/15/2026-150.00 Paid\nWeb ID 802-456-78901'], ['Contact Jane Zephyra 01/15/2026-150.00\nWeb ID 802-456-78901'], ['Phone 1: 01/15/2026-150.00\nWeb ID 802-456-78901'], ['01/15/2026-12345678901234.01\nWeb ID 802-456-78901'],
  ['Benefits may\n14th Street', MAYA], ['Service 01/15/2026-150.00 Paid\nBenefits may\n14th Street', MAYA], ['Contact Jane Zephyra 01/15/2026-150.00\nBenefits may\n14th Street', MAYA], ['Phone 1: 01/15/2026-150.00\nBenefits may\n14th Street', MAYA], ['01/15/2026-12345678901234.01\nBenefits may\n14th Street', MAYA], ['ICN 12345678901234.01-01/15/2026\nBenefits may\n14th Street', MAYA],
];
if (part === 'layouts') {
  const quiet: string[] = [];
  for (const [name, f] of LAY) {
    let base = 0, head = 0, before = 0, total = 0; let ex = ''; const nouns: Record<string, number> = {};
    for (const n of NOUNS) for (const x of NUMS) {
      const text = f(n, x); total += 1;
      const b = out('base', text); if (b === 'REFUSED') continue; base += 1;
      const h = out('head', text); const bf = out('before', text);
      if (bf !== b) before += 1;
      if (h !== b) { head += 1; nouns[n] = (nouns[n] ?? 0) + 1; if (ex === '') ex = `${JSON.stringify(text)} head ${h}, before ${bf}, base ${b}`; }
    }
    if (head === 0 && before === 0) { quiet.push(`${name} (${base}/${total})`); continue; }
    const which = Object.keys(nouns).length === NOUNS.length ? 'every noun' : Object.entries(nouns).map(([k, v]) => `${k}:${v}`).join(', ');
    console.log(`## ${name}: base sends ${base}/${total}; head refuses ${head}, before ${before}; ${which}\n     ${ex}`.slice(0, 330));
  }
  console.log(`## no refusal on head or before: ${quiet.join('; ')}`);
} else {
  for (const [text, patient] of SPECIAL) console.log(`${JSON.stringify(text)}${patient ? ' [date of birth May 14]' : ''}\n     head: ${out('head', text, patient)} | before: ${out('before', text, patient)} | base: ${out('base', text, patient)}`.slice(0, 300));
}
