// node a1.mts: A.1's neighbours (a month's word glued after a shape's last digits, a year-like number after a space or a comma) and the patterns of named() asked directly
import { load, M, out, rng, pick, int, digits } from './lib.mts';
await load(['head', 'before', 'base', 'vX']);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec', 'MAR', 'MAY', 'DEC', 'SEP', 'OCT', 'JUN', 'AUG', 'March', 'June'];
const AFTER: [string, string][] = [['a year', ' 2026'], ['comma, a year', ', 2026'], ['an amount 2000.00', ' 2000.00'], ['1999 units', ' 1999 units'], ['a year range', ' 2025-2026'], ['a year and an amount', ' 2026 150.00']];
const PRE = ['Lot', 'Web ID', 'Seq', 'Item', 'Row', 'Unit', 'Batch item'];
for (const [name, after] of AFTER) for (const wide of [false, true]) {
  const r = rng(31 + name.length); let base = 0, head = 0, before = 0; let ex = '';
  for (let i = 0; i < 400; i += 1) {
    const shape = wide ? `${digits(r, 3)}-${digits(r, 3)}-${digits(r, 5)}` : `${digits(r, 3)}-${digits(r, 2)}-${digits(r, 6)}`;
    const text = `${pick(r, PRE)} ${shape}${pick(r, MON)}${after}`;
    const b = out('base', text); if (b === 'REFUSED') continue; base += 1;
    const h = out('head', text); const bf = out('before', text);
    if (bf !== b) before += 1; if (h !== b) { head += 1; if (bf === b && ex === '') ex = JSON.stringify(text); }
  }
  console.log(`## A1 ${wide ? '3-3-5' : '3-2-6'} + month word + ${name}: 400 letters, base sends ${base}; head refuses ${head} (${((100 * head) / Math.max(1, base)).toFixed(0)}%), before ${before}  e.g. ${ex}`);
}
const rx = M.vX.__rx; const LB = new RegExp('\\r\\n|[\\n\\r\\f\\v]', 'u');
for (const before of ['CLAIM\n#\n', '| CLAIM |\n|:------|\n| ', '| CLAIM |\n|-------|\n| ', '│ CLAIM │\n├───────┤\n│ ', 'CLAIM\n─────\n', 'ICN\n_ _ _ _ _\n', 'REF.\n-----\n', 'INVOICE\n-------\nNO. ', 'MEMBER\nID\nNUMBER\n', 'CLAIM*\n-----\n']) {
  const noun = rx.NAMED_BEFORE.exec(before); const tail = rx.LABEL_TAIL.exec(before)?.[0] ?? ''; const label = noun === null ? '' : before.slice(noun.index, before.length - tail.length);
  const own = tail.slice(0, Math.max(0, tail.search(LB)));
  console.log(`  ${JSON.stringify(before)}: NAMED_BEFORE ${noun === null ? 'null' : 'label ' + JSON.stringify(label)} | tail ${JSON.stringify(tail)} | own line ${JSON.stringify(own)} holds : or # ${String(/[:#]/u.test(own))} | RULE_LINE ${String(rx.RULE_LINE.test(tail))} | NUMBER_LABEL_END ${String(rx.NUMBER_LABEL_END.test(label))}`);
}
