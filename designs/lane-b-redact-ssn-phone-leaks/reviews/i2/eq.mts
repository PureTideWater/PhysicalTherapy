// node eq.mts: head against vF (the run taken whole) on the letters of the findings and on the form letters of forms.mts: outcomes must agree
import fs from 'node:fs';
import { load, out, rng, pick } from './lib.mts';
await load(['head', 'vF', 'before', 'base']);
let n = 0, differ = 0;
const check = (text: string) => { n += 1; const h = out('head', text); const f = out('vF', text); if (h !== f) { differ += 1; if (differ < 6) console.log('DIFFER', JSON.stringify(text), 'head', h, 'vF', f); } };
for (const file of ['cmp1.jsonl', 'cmp2.jsonl']) for (const line of fs.readFileSync(`/home/user/review-i2/${file}`, 'utf8').split('\n')) if (line.trim()) check(JSON.parse(line) as string);
const LABELS = ['Claim', 'Claim Number', 'ICN', 'Invoice', 'Invoice No', 'Account', 'Reference', 'Check Number', 'Policy', 'Member ID', 'Statement', 'Authorization', 'Case', 'Remittance Advice', 'Control Number', 'Ref', 'Payment', 'Notice', 'Provider ID', 'Group'];
const ENDS = ['', ':', ' #', '.', ' (#)', ' :', '#:', ' -', '*', ')', '**'];
const BOX = String.fromCharCode(0x2500);
const RULES = ['_', '~', BOX, '-', '=', '_ ', '~~~ ', '__ ', BOX + ' ', '_~', '|_', '+_'];
const PRE = ['', '#', ': ', 'No. ', '- ', '(', 'Page 2 ', 'x ', 'Ref ', '$'];
const NUMS = ['20260112345.01', '12345678901234.01', '802-45-678901.50', '12345678901/02/2026', '01-23456-78-9012', '900-12-3456150.00'];
const r = rng(77);
for (let i = 0; i < 6000; i += 1) { const k = 1 + Math.floor(r() * 30); const rule = pick(r, RULES).repeat(k).slice(0, 36); const sep = pick(r, [`\n${rule}\n`, ` ${rule} `, `: ${rule}\n`, `\n${rule}\n\n`, ` |\n|${rule}|\n| `, `${rule}`]); check(`${pick(r, LABELS)}${pick(r, ENDS)}${sep}${pick(r, PRE)}${pick(r, NUMS)}`); }
console.log(`eq: ${n} letters, head and vF differ on ${differ}`);
const c = (x: number) => String.fromCharCode(x);
console.log('## line breaks written otherwise (no throw expected)');
for (const t of [`Claim${c(0x2028)}${c(0x2028)}#20260112345.01`, `Claim:${c(0x85)}${c(0x85)}20260112345.01`, `Claim\v\v: 20260112345.01`, `Claim\r\r20260112345.01`, 'Claim\n\n:   20260112345.01', 'Claim\n: 20260112345.01']) console.log(`${JSON.stringify(t)}\n     head: ${out('head', t)} | before: ${out('before', t)} | base: ${out('base', t)}`);
