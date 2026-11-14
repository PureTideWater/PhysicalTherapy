// summarize42.mjs <label> <samples out> <census prefix> [...]: the counts of census42.mts's rows, as markdown.
// A letter is "newly found" by a hit when the base neither refuses the letter nor hides the hit (state clear or
// partial). "marked" means the hit lies on a part the corpus's generator marked as an identifier (sec); the gate's
// harness rows carry no marks, so "unmarked" there is unknown, not false: the samples file is read by eye.
import fs from 'node:fs';
const [label, samplesOut, ...prefixes] = process.argv.slice(2);
const rows = [];
const stats = { letters: 0, chars: 0, withHit: 0, ms: {}, slowestMs: {} };
for (const p of prefixes) {
  const s = JSON.parse(fs.readFileSync(`${p}.stats.json`, 'utf8'));
  stats.letters += s.letters; stats.chars += s.chars; stats.withHit += s.withHit;
  for (const [k, v] of Object.entries(s.ms)) stats.ms[k] = (stats.ms[k] ?? 0) + v;
  for (const [k, v] of Object.entries(s.slowestMs)) stats.slowestMs[k] = Math.max(stats.slowestMs[k] ?? 0, v);
  for (const line of fs.readFileSync(`${p}.hits.jsonl`, 'utf8').split('\n')) if (line !== '') rows.push(JSON.parse(line));
}
const fresh = (h) => h.state === 'clear' || h.state === 'partial';
const group = (h) => (h.kind === 'member' || h.kind === 'claim' ? (h.digitsOnly ? 'number, digits only' : 'number, letters and digits') : h.kind);
const caseAware = (h) => h.rule === 'glue' && h.side === 'before' && h.before === 'lower' && (h.shape === 'UPPER' || h.shape === 'Capital');
const SHAPE = new Set(['.', ',', '/', ':']);
console.log(`## ${label}\n`);
console.log(`letters ${stats.letters}, characters ${stats.chars}, letters with any hit ${stats.withHit} (base-refused among them ${rows.filter((r) => r.refused).length})`);
const per = (k) => (stats.ms[k] / stats.letters).toFixed(4);
console.log(`time per letter, ms: stored identifiers N=1 ${per('stored1')}, N=2 ${per('stored2')}; deletion reading (SSN, phone) ${per('pattern2')}; glued ${per('glue')}; the base's reader (every 50th letter) ${(stats.ms.base / stats.ms.baseLetters).toFixed(4)}`);
console.log(`slowest letter, ms: ${Object.entries(stats.slowestMs).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}\n`);

// T1: inserted, by kind and length.
const cell = (map, key) => (map[key] ??= { n1m: new Set(), n1u: new Set(), n2m: new Set(), n2u: new Set(), hid: new Set(), ref: new Set() });
const t1 = {};
for (const r of rows) for (const h of r.rows) if (h.rule === 'ins') {
  const c = cell(t1, `${group(h)}|${h.len}`);
  if (r.refused) c.ref.add(r.i); else if (!fresh(h)) c.hid.add(r.i);
  else { (h.sec ? c.n2m : c.n2u).add(r.i); if (h.n === 1) (h.sec ? c.n1m : c.n1u).add(r.i); }
}
console.log('### Inserted characters: letters newly found, by kind and the identifier\'s length\n');
console.log('| kind | length | 1 inserted: marked | 1 inserted: unmarked | 1 or 2: marked | 1 or 2: unmarked | base hides the hit | base refuses the letter |\n|---|---|---|---|---|---|---|---|');
for (const key of Object.keys(t1).sort((a, b) => a.split('|')[0].localeCompare(b.split('|')[0]) || Number(a.split('|')[1]) - Number(b.split('|')[1]))) { const c = t1[key]; console.log(`| ${key.replace('|', ' | ')} | ${c.n1m.size} | ${c.n1u.size} | ${c.n2m.size} | ${c.n2u.size} | ${c.hid.size} | ${c.ref.size} |`); }

// T1b: by the inserted character's class (new hits only).
const t1b = {};
for (const r of rows) for (const h of r.rows) if (h.rule === 'ins' && fresh(h) && !r.refused) {
  const cls = [...new Set(h.classes)].sort().join('+');
  const c = (t1b[`${group(h)}|${cls}`] ??= { m: new Set(), u: new Set() });
  (h.sec ? c.m : c.u).add(r.i);
}
console.log('\n### Inserted characters: letters newly found, by kind and the inserted characters\' classes (1 or 2)\n');
console.log('| kind | classes | marked | unmarked |\n|---|---|---|---|');
for (const key of Object.keys(t1b).sort()) console.log(`| ${key.replace('|', ' | ')} | ${t1b[key].m.size} | ${t1b[key].u.size} |`);

// T2: glued, by length.
const t2 = {};
for (const r of rows) for (const h of r.rows) if (h.rule === 'glue') {
  const c = (t2[h.len] ??= { am: new Set(), au: new Set(), cm: new Set(), cu: new Set(), hid: new Set(), ref: new Set() });
  if (r.refused) c.ref.add(r.i); else if (!fresh(h)) c.hid.add(r.i);
  else { (h.sec ? c.am : c.au).add(r.i); if (caseAware(h)) (h.sec ? c.cm : c.cu).add(r.i); }
}
console.log('\n### Glued name words: letters newly found, by the word\'s length\n');
console.log('| length | any case: marked | any case: unmarked | case-aware: marked | case-aware: unmarked | base hides the hit | base refuses the letter |\n|---|---|---|---|---|---|---|');
for (const L of Object.keys(t2).map(Number).sort((a, b) => a - b)) { const c = t2[L]; console.log(`| ${L} | ${c.am.size} | ${c.au.size} | ${c.cm.size} | ${c.cu.size} | ${c.hid.size} | ${c.ref.size} |`); }
// What the base sends by side and case (new glued hits, length 4 and over).
const t2b = {};
for (const r of rows) for (const h of r.rows) if (h.rule === 'glue' && h.len >= 4 && fresh(h) && !r.refused) { const k = `${h.side} | ${h.before} | ${h.after} | ${h.shape}`; (t2b[k] ??= new Set()).add(r.i); }
console.log('\n### Glued name words of 4 letters or more the base sends, by side, neighbour and case\n');
console.log('| side | before | after | written | letters |\n|---|---|---|---|---|');
for (const [k, v] of Object.entries(t2b).sort((a, b) => b[1].size - a[1].size)) console.log(`| ${k} | ${v.size} |`);

// T3: the candidate rules, exactly.
const noShape = (h) => !h.classes.some((c, i) => false) && true;
const RULES = {
  'inserted, 1, floor 5 (names 5)': (h) => h.rule === 'ins' && h.n === 1 && h.len >= 5,
  'inserted, 1 or 2, floor 5 (names 5)': (h) => h.rule === 'ins' && h.len >= 5,
  'inserted, 1, floor 6 (names 5)': (h) => h.rule === 'ins' && h.n === 1 && (h.kind === 'name' ? h.len >= 5 : h.len >= 6),
  'inserted, 1 or 2, floor 6 (names 5)': (h) => h.rule === 'ins' && (h.kind === 'name' ? h.len >= 5 : h.len >= 6),
  'inserted, 1 or 2, floor 8 (names 6)': (h) => h.rule === 'ins' && (h.kind === 'name' ? h.len >= 6 : h.len >= 8),
  'inserted, 1 or 2, floor 5, no letter or digit inside a name': (h) => h.rule === 'ins' && h.len >= 5 && !(h.kind === 'name' && h.classes.some((c) => c === 'letter' || c === 'digit')),
  'glued, any case, floor 4': (h) => h.rule === 'glue' && h.len >= 4,
  'glued, any case, floor 5': (h) => h.rule === 'glue' && h.len >= 5,
  'glued, any case, floor 6': (h) => h.rule === 'glue' && h.len >= 6,
  'glued, case-aware, floor 3': (h) => caseAware(h) && h.len >= 3,
  'glued, case-aware, floor 4': (h) => caseAware(h) && h.len >= 4,
  'glued, case-aware, floor 5': (h) => caseAware(h) && h.len >= 5,
};
console.log('\n### Each candidate, exactly: letters with a newly found hit\n');
console.log('| rule | letters, a marked hit | letters, unmarked hits only | of those, top sources |\n|---|---|---|---|');
const samples = [];
for (const [name, test] of Object.entries(RULES)) {
  let marked = 0, unmarked = 0; const src = {};
  for (const r of rows) {
    if (r.refused) continue;
    const hits = r.rows.filter((h) => fresh(h) && test(h));
    if (hits.length === 0) continue;
    if (hits.some((h) => h.sec)) marked += 1;
    else { unmarked += 1; const s = r.s.split('__')[0].replace(/\.(surname|spelled|drawn)-.*/, '.$1'); src[s] = (src[s] ?? 0) + 1; samples.push({ rule: name, i: r.i, s: r.s, hits: hits.map((h) => ({ kind: h.kind, id: h.id, n: h.n, classes: h.classes, w: h.w, shape: h.shape, side: h.side })) }); }
  }
  console.log(`| ${name} | ${marked} | ${unmarked} | ${Object.entries(src).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`).join('; ')} |`);
}
fs.writeFileSync(samplesOut, samples.map((s) => JSON.stringify(s) + '\n').join(''));
