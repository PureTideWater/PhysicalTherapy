// Review B, script 1b: reads out/s1-*.jsonl: the new refusals by family and what the newly replaced spans hold.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const DIR = '/home/user/ops/designs/lane-b-redact-item-26/reviews/b';
const B = await import(pathToFileURL('/home/user/rev/base/redact.ts').href);
const H = await import(pathToFileURL('/home/user/rev/head/redact.ts').href);
const TAG = process.env.TAG ?? 's1';
const rows = (cls: string) => { try { return fs.readFileSync(`${DIR}/out/${TAG}-${cls}.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const show = (r: any) => `${r.gen} ${JSON.stringify(r.t)} names=${JSON.stringify(r.P.names)} ids=${JSON.stringify(r.P.memberIds)} claims=${JSON.stringify(r.C[0].claimNumbers)}\n     base ${r.base.refused ? 'REFUSED' : 'sent'} ${JSON.stringify(r.base.text)}\n     head ${r.head.refused ? 'REFUSED' : 'sent'} ${JSON.stringify(r.head.text)}`;
for (const cls of ['newref-first-check-refuses-wider-redacted-text']) {
  const list = rows(cls);
  for (const gen of ['G2', 'G3', 'G1', 'G1v']) { console.log(`\n## ${cls} ${gen}`); for (const r of list.filter((x) => x.gen === gen).sort((a, b) => a.t.length - b.t.length).slice(0, gen === 'G3' ? 14 : 7)) console.log(show(r)); }
}
// New redactions: the written text of each span the head replaces that the base's spans do not cover.
const damage = new Map<string, { n: number; ex: any }>();
let total = 0;
for (const r of rows('newred')) {
  const b = B.redactionSpans(r.t, r.P, r.C); const h = H.redactionSpans(r.t, r.P, r.C);
  for (const span of h.spans) {
    if (b.spans.some((s: any) => s.start <= span.start && span.end <= s.end)) continue;
    total += 1;
    const phrase: string = h.text.slice(span.start, span.end);
    const around = h.text.slice(Math.max(0, span.start - 3), span.end + 6);
    const kinds: string[] = [];
    if (/\d/.test(phrase)) kinds.push('digits-inside');
    if (/\$\s*$/.test(h.text.slice(0, span.start)) ) kinds.push('after-currency-sign');
    if (/^[.,]\d/.test(h.text.slice(span.end))) kinds.push('digits-continue-after');
    if (/\d[.,/]$/.test(h.text.slice(0, span.start))) kinds.push('digits-continue-before');
    if (/^\/\d/.test(h.text.slice(span.end))) kinds.push('date-continues-after');
    if (/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(phrase) && r.gen !== 'G1v') kinds.push('month-word');
    if (/\n\s*\n/.test(phrase)) kinds.push('across-paragraphs');
    for (const k of kinds) { const key = `${r.gen}|${span.placeholder}|${k}`; const d = damage.get(key) ?? { n: 0, ex: null }; d.n += 1; if (d.ex === null || JSON.stringify(d.ex.t).length > JSON.stringify(r.t).length) d.ex = { ...r, phrase, around }; damage.set(key, d); }
  }
}
console.log(`\n## newly replaced spans read: ${total}`);
for (const [key, d] of [...damage].sort()) console.log(`\n${String(d.n).padStart(6)} ${key} phrase=${JSON.stringify(d.ex.phrase)}\n   ${show(d.ex)}`);
const sc = rows('screen-added'); console.log(`\n## screen-added rows ${sc.length}`); for (const r of sc.sort((a, b) => a.t.length - b.t.length).slice(0, 5)) console.log(show(r), JSON.stringify(r.added));
