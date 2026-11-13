// summarize-stage-3.mjs [summary.json]: Queues item 40, stage 3 (W74; stage 2's reader of the summary, unchanged but for this line): reads measure/generated-set-40-base-head.summary.json
// and prints, as markdown, each family's counts of clear (left, partial or threw) / hidden (replaced) / refused on the
// base and on the head, its failures, and every REAL-SHAPED form with what the head newly refuses of it. Counts only.
import fs from 'node:fs';
const file = process.argv[2] ?? new URL('./measure/generated-set-40-base-head.summary.json', import.meta.url).pathname;
const S = JSON.parse(fs.readFileSync(file, 'utf8'));
const c = (o) => `${(o.left ?? 0) + (o.partial ?? 0) + (o.threw ?? 0)} / ${o.replaced ?? 0} / ${o.refused ?? 0}`;
const add = (into, o) => { for (const [k, n] of Object.entries(o ?? {})) into[k] = (into[k] ?? 0) + n; };
const family = (form) => { const f = form.replace('G40/', ''); if (f.startsWith('real.')) return 'real.' + f.split('.')[1]; if (f.startsWith('A.length')) return 'A.length-*'; const p = f.split('.'); return f.startsWith('r13.') ? (p[1] === 'control' ? `r13.control.${p[3]}` : p.slice(0, 2).join('.')) : f.startsWith('r14.surrogate') ? p.slice(0, 3).join('.') : f.startsWith('r14.') ? p.slice(0, 2).join('.') : f; };
const fam = {};
for (const [form, v] of Object.entries(S.forms)) {
  const row = (fam[family(form)] ??= { exp: new Set(), letters: 0, A: {}, B: {}, failures: 0, newly: 0 });
  row.exp.add(v.exp); row.letters += v.letters; add(row.A, v.A); add(row.B, v.B); row.failures += v.failures ?? 0; row.newly += S.newlyRefused?.[form] ?? 0;
}
console.log(`letters ${S.worker.letters}, differ ${S.worker.differ}, refused base ${S.worker.refusedA}, head ${S.worker.refusedB}, errors ${S.worker.errorsA}/${S.worker.errorsB}, PHI classes ${JSON.stringify(S.worker.phiClasses)}, classes ${JSON.stringify(S.worker.classes)}, failures ${S.failures}\n`);
console.log('| family | expected | letters | base clear / hidden / refused | head | failures | newly refused |\n| --- | --- | --- | --- | --- | --- | --- |');
for (const [k, r] of Object.entries(fam).sort()) console.log(`| ${k} | ${[...r.exp].join(',')} | ${r.letters} | ${c(r.A)} | ${c(r.B)} | ${r.failures} | ${r.newly} |`);
console.log('\nReal-shaped forms, each: letters, base, head, newly refused\n');
for (const [form, v] of Object.entries(S.forms).filter(([f]) => f.includes('real.')).sort()) console.log(`- ${form.replace('G40/', '')}: ${v.letters}; base ${c(v.A)}; head ${c(v.B)}; newly refused ${S.newlyRefused?.[form] ?? 0}`);
