// Summarise a jsonl of mismatches: outcome pairs, and the shortest few with the first place the two outputs differ.
import fs from 'node:fs';
const rows = fs.readFileSync(process.argv[2]!, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const un = (e: string) => JSON.parse(e) as string;
const pairs: Record<string, number> = {};
for (const r of rows) { const a = r.ref ?? r.b, b = r.head ?? r.h; const ta = un(a.text), tb = un(b.text); const k = `${a.out}/${b.out} ${ta.replace(/\u0001$/, '') === tb.replace(/\u0001$/, '') ? (ta.endsWith('\u0001') ? 'ref marked only' : tb.endsWith('\u0001') ? 'head marked only' : '?') : 'bodies differ'}`; pairs[k] = (pairs[k] ?? 0) + 1; }
console.log(pairs);
rows.sort((x, y) => x.text.length - y.text.length);
for (const r of rows.slice(0, Number(process.argv[3] ?? 4))) { const a = r.ref ?? r.b, b = r.head ?? r.h; const ta = un(a.text), tb = un(b.text); let i = 0; while (i < ta.length && ta[i] === tb[i]) i++;
  console.log('---\nin  ', r.text.length > 900 ? r.text.slice(0, 900) + '…' : r.text, '\nref ', a.out, JSON.stringify(ta.slice(Math.max(0, i - 60), i + 80)), ta.length, '\nhead', b.out, JSON.stringify(tb.slice(Math.max(0, i - 60), i + 80)), tb.length); }
