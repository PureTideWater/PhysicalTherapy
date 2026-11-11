// node forms.mts: a label, what ends it, what stands between it and its number, what begins the number's line: where head refuses what before and base send, by class (A.3); a boxed cell's width against NAMED_REACH
import { load, out, rng, pick } from './lib.mts';
await load(['head', 'before', 'base']);
const LABELS = ['Claim', 'Claim Number', 'ICN', 'Invoice', 'Invoice No', 'Account', 'Reference', 'Check Number', 'Policy', 'Member ID', 'Statement', 'Authorization', 'Case', 'Remittance Advice', 'Control Number', 'Ref', 'Payment', 'Notice', 'Provider ID', 'Group'];
const ENDS = ['', ':', ' #', '.', ' (#)', ' :', '#:', ' -', '*', ')', '**'];
const BOX = String.fromCharCode(0x2500).repeat(5);
const SEPS: [string, string][] = [['space', ' '], ['2 spaces', '  '], ['tab', '\t'], ['break', '\n'], ['break+indent', '\n    '], ['blank line', '\n\n'], ['CRLF blank line', '\r\n\r\n'], ['2 blank lines', '\n\n\n'],
  ['rule -', '\n-----\n'], ['rule =', '\n=====\n'], ['rule _', '\n_____\n'], ['rule ~', '\n~~~~~\n'], ['rule *', '\n*****\n'], ['rule .', '\n.....\n'], ['rule box', `\n${BOX}\n`], ['rule #', '\n#####\n'], ['rule - - - -', '\n- - - -\n'], ['rule --', '\n--\n'], ['rule +-----+', '\n+-----+\n'], ['cell |-----|', ' |\n|-----|\n| '], ['cell |:----|', ' |\n|:----|\n| '], ['rule indented', '\n   -----\n   '], ['rule then blank', '\n-----\n\n'], ['blank then rule', '\n\n-----\n'], ['rule, blanks after it', '\n-----   \n'], ['form feed', '\f'], ['break, form feed', '\n\f'], ['dot leader', ' ........ '], ['underscore blank', ' ______ '], ['underscore blank, break', ' ______\n'], ['page mark', '\n- 2 -\n']];
const PRE = ['', '#', ': ', 'No. ', '# ', '- ', '• ', '> ', '(', '[', '"', "'", '$', '* ', 'ID: ', 'Number: ', '=', '+ '];
const NUMS = ['20260112345.01', '12345678901234.01', '802-45-678901.50', '12345678901/02/2026'];
const r = rng(4242);
let total = 0, sent = 0;
for (const [name, sep] of SEPS) {
  let base = 0, regress = 0, back = 0, both = 0; const byPre: Record<string, number> = {}; const byEnd: Record<string, number> = {}; let ex = '';
  for (const end of ENDS) for (const pre of PRE) for (let k = 0; k < 2; k += 1) {
    const text = `${pick(r, LABELS)}${end}${sep}${pre}${pick(r, NUMS)}`; total += 1;
    const b = out('base', text); if (b === 'REFUSED') continue; base += 1; sent += 1;
    const h = out('head', text); const bf = out('before', text);
    if (h !== b && bf === b) { regress += 1; byPre[JSON.stringify(pre)] = (byPre[JSON.stringify(pre)] ?? 0) + 1; byEnd[JSON.stringify(end)] = (byEnd[JSON.stringify(end)] ?? 0) + 1; if (ex === '' || (pre === '' && !ex.endsWith('*'))) ex = JSON.stringify(text) + (pre === '' ? '*' : ''); }
    else if (h === b && bf !== b) back += 1; else if (h !== b) both += 1;
  }
  const fmt = (o: Record<string, number>) => Object.entries(o).sort((a, b2) => b2[1] - a[1]).map(([k2, v]) => `${k2}:${v}`).join(' ');
  console.log(`## ${name}: base sends ${base}; head newly refuses ${regress}; sends again ${back}; both refuse ${both}${regress ? `\n     by what begins the number's line: ${fmt(byPre)}\n     by what ends the label: ${fmt(byEnd)}\n     e.g. ${ex.replace(/\*$/u, '')}` : ''}`);
}
console.log(`forms: ${total} letters, base sends ${sent}`);
console.log('## a boxed cell of width W: | Claim Number ... | over |-----| over | 20260112345.01 ... |');
for (const W of [24, 40, 50, 54, 56, 57, 58, 60, 64, 72]) { const text = `| ${'Claim Number'.padEnd(W - 2)} |\n|${'-'.repeat(W)}|\n| ${'20260112345.01'.padEnd(W - 2)} |`; console.log(`  W=${W}: head ${out('head', text)} | before ${out('before', text)} | base ${out('base', text)}`); }
