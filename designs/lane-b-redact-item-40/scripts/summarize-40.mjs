// summarize-40.mjs: reads ../measure/generated-set-40-base-proto-{i,ii}.summary.json and prints, as markdown, each
// family's counts of clear (left, partial or threw), hidden (replaced) and refused on the base and on each prototype,
// the failures, and each REAL-SHAPED form with what each prototype newly refuses of it. Counts only.
import fs from 'node:fs';
const M = new URL('../measure/', import.meta.url).pathname;
const S = Object.fromEntries(['proto-i', 'proto-ii'].map((t) => [t, JSON.parse(fs.readFileSync(`${M}generated-set-40-base-${t}.summary.json`, 'utf8'))]));
const c = (o) => `${(o.left ?? 0) + (o.partial ?? 0) + (o.threw ?? 0)} / ${o.replaced ?? 0} / ${o.refused ?? 0}`;
const family = (form) => { const f = form.replace('G40/', ''); if (f.startsWith('real.')) return 'real: ' + f.split('.')[1]; if (f.startsWith('A.length')) return 'A.length-*'; const p = f.split('.'); return f.startsWith('r13.') ? (p[1] === 'control' ? `r13.control.${p[3]}` : p.slice(0, 2).join('.')) : f.startsWith('r14.surrogate') ? p.slice(0, 3).join('.') : f.startsWith('r14.') ? p.slice(0, 2).join('.') : f; };
const fam = {};
for (const t of Object.keys(S)) for (const [form, v] of Object.entries(S[t].forms)) {
  const k = family(form); const row = (fam[k] ??= { exp: v.exp, letters: 0, base: {}, 'proto-i': {}, 'proto-ii': {}, fail: { 'proto-i': 0, 'proto-ii': 0 }, newly: { 'proto-i': 0, 'proto-ii': 0 } });
  if (t === 'proto-i') { row.letters += v.letters; for (const [o, n] of Object.entries(v.A)) row.base[o] = (row.base[o] ?? 0) + n; }
  for (const [o, n] of Object.entries(v.B)) row[t][o] = (row[t][o] ?? 0) + n;
  row.fail[t] += v.failures; row.newly[t] += S[t].newlyRefused[form] ?? 0;
}
for (const t of Object.keys(S)) console.log(`- base against ${t}: letters ${S[t].worker.letters}, differ ${S[t].worker.differ}, refused ${S[t].worker.refusedA} and ${S[t].worker.refusedB}, PHI classes ${S[t].worker.phiClasses.length === 0 ? 'none' : S[t].worker.phiClasses.join(' ')}, errors ${S[t].worker.errorsA} and ${S[t].worker.errorsB}, failures ${S[t].failures}, notes ${S[t].notes}, slowest letter on the prototype ${S[t].slowestMsB} ms`);
console.log('\n| family | exp | letters | base clear / hidden / refused | proto-i | proto-ii | failures i, ii | newly refused i, ii |\n| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const [k, v] of Object.entries(fam).sort(([a], [b]) => a.localeCompare(b))) console.log(`| ${k} | ${v.exp} | ${v.letters} | ${c(v.base)} | ${c(v['proto-i'])} | ${c(v['proto-ii'])} | ${v.fail['proto-i']}, ${v.fail['proto-ii']} | ${v.newly['proto-i']}, ${v.newly['proto-ii']} |`);
console.log('\n| real-shaped form | letters | base clear / hidden / refused | proto-i | proto-ii | newly refused i | newly refused ii |\n| --- | --- | --- | --- | --- | --- | --- |');
let ti = 0, tii = 0, tl = 0;
for (const [form, v] of Object.entries(S['proto-i'].forms).filter(([f]) => f.startsWith('G40/real.')).sort(([a], [b]) => a.localeCompare(b))) {
  const w = S['proto-ii'].forms[form]; const ni = S['proto-i'].newlyRefused[form] ?? 0, nii = S['proto-ii'].newlyRefused[form] ?? 0; ti += ni; tii += nii; tl += v.letters;
  console.log(`| ${form.replace('G40/', '')} | ${v.letters} | ${c(v.A)} | ${c(v.B)} | ${c(w.B)} | ${ni} | ${nii} |`);
}
console.log(`| all real-shaped | ${tl} | | | | ${ti} | ${tii} |`);
