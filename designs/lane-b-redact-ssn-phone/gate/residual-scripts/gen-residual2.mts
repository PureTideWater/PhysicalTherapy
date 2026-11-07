// Builds the residual table's gate rows (class A: SSN/phone; class B: month-word names; fail-safe refusals) from a gate
// run's hits, as SYNTHETIC rows. A class-A row keeps its number IN CLEAR in the head's sent text (the judge's review round
// 2, PHIJ2-1/GATEWAYJ2-1): a mapping is kept only when cc3dd7f6 refuses the mapped letter, the head sends it, and the sent
// text holds the mapped number as written; candidates in order: the original when already synthetic (900-xx-xxxx or
// 555-01xx), 900-xx-xxxx, 202/555-01xx (a 10-digit shape), the never-issued area 000; else the original kept (9xx, never
// issued, when the oracle reads one). Each row carries `number` (the occurrence as the head sends it).
// usage: node gen-residual2.mts <gate run dir> <out.json> <report.txt>
import fs from 'node:fs';
import zlib from 'node:zlib';
import { annotate, unbracketed, digitValue } from '/tmp/claude-0/-home-user-PhysicalTherapy/b3c6553f-bf86-5901-9a05-bd89989a0ff9/scratchpad/rg-judge/gate/oracle.mts';
import * as base from './h/redact.base.ts';
import * as win from './h/redact.win.ts';
const G = '/tmp/claude-0/-home-user-PhysicalTherapy/b3c6553f-bf86-5901-9a05-bd89989a0ff9/scratchpad/rg-judge/gate/corpus';
const [runDir, outFile, reportFile] = process.argv.slice(2) as [string, string, string];
const hits = (cls: string) => fs.readdirSync(`${runDir}/hits`).filter((f) => f.startsWith(`${cls}.w`)).flatMap((f) => fs.readFileSync(`${runDir}/hits/${f}`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const want = new Map<number, string>();
const classes = ['PHI.ssn', 'PHI.phone', 'PHI.name', 'KEEP.refused.must-stay.other', 'KEEP.refused.letter-with-identifiers'];
const byClass: Record<string, any[]> = {};
for (const c of classes) { byClass[c] = hits(c); for (const h of byClass[c]!) want.set(h.i, c); }
const records = new Map<number, any>();
for (let k = 0; k < 8; k += 1) {
  for (const line of zlib.gunzipSync(fs.readFileSync(`${G}/shard-${k}.jsonl.gz`)).toString('utf8').split('\n')) {
    if (!line) continue;
    const m = /^\{"i":(\d+),/.exec(line);
    if (m && want.has(Number(m[1]))) records.set(Number(m[1]), JSON.parse(line));
  }
}
const patients: { P: any; C: any }[] = JSON.parse(fs.readFileSync(`${G}/patients.json`, 'utf8'));
const outcome = (M: any, t: string, P: any, C: any) => { const r = M.redactLetterForScreen(t, P, C); return M.holdsIdentifier(r.text, P, C) ? null : (r.text as string); };
const digitsOf = (s: string) => [...s].map((ch) => digitValue(ch)).filter((v) => v >= 0).join('');
const synthetic = (kind: string, d: string) => (kind === 'ssn' ? d.startsWith('900') || /^[01]900/u.test(d) : (d.length === 7 && d.startsWith('55501')) || (d.length === 10 && d.startsWith('20255501')) || (d.length === 11 && d.startsWith('120255501')));
const candidates = (kind: string, d: string): string[] => {
  const out: string[] = [];
  if (kind === 'ssn') {
    if (d.length === 9) out.push(`900${d.slice(3)}`, `000${d.slice(3)}`);
    else if (d.length === 10) out.push(`${d[0]}900${d.slice(4)}`, `20255501${d.slice(8)}`, `2025550122`, `${d[0]}000${d.slice(4)}`, `000${d.slice(3)}`);
    else out.push(`900${d.slice(3)}`, `000${d.slice(3)}`);
  } else {
    if (d.length === 7) out.push(`55501${d.slice(5)}`);
    else if (d.length === 10) out.push(`20255501${d.slice(8)}`, `2025550122`, `000${d.slice(3)}`);
    else if (d.length === 11) out.push(`120255501${d.slice(9)}`);
  }
  return out.filter((m) => m.length === d.length);
};
const rewrite = (letter: string, at: number, len: number, m: string) => {
  let k = 0;
  let unit = 0;
  const arr = [...letter];
  for (let i = 0; i < arr.length; i += 1) {
    const ch = arr[i]!;
    if (unit >= at && unit < at + len) {
      const v = digitValue(ch);
      if (v >= 0) { arr[i] = String.fromCodePoint(ch.codePointAt(0)! - v + Number(m[k])); k += 1; }
    }
    unit += ch.length;
  }
  return arr.join('');
};
const report: string[] = [];
const rowOf = (rec: any) => { const { P, C } = patients[rec.p]!; return { names: P.names, datesOfBirth: P.datesOfBirth, memberIds: P.memberIds, claimNumbers: C.flatMap((c: any) => c.claimNumbers) }; };
const PC = (row: any) => ({ P: { pseudonym: 'synthetic-patient-21', names: row.names, datesOfBirth: row.datesOfBirth, memberIds: row.memberIds }, C: [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-21', claimNumbers: row.claimNumbers }] });
const classA: any[] = [];
const tally: Record<string, number> = {};
const count = (k: string) => { tally[k] = (tally[k] ?? 0) + 1; };
for (const c of ['PHI.ssn', 'PHI.phone']) {
  const kind = c === 'PHI.ssn' ? 'ssn' : 'phone';
  for (const h of byClass[c]!) {
    const rec = records.get(h.i);
    const row: any = rowOf(rec);
    const { P, C } = PC(row);
    const t: string = rec.t;
    const normal = unbracketed(t);
    const sameDigits = normal.length === t.length && digitsOf(normal) === digitsOf(t);
    // The occurrences of the class's kind the head sends in clear, original letter.
    const sentOrig = outcome(win, t, P, C);
    const baseOrig = outcome(base, t, P, C);
    if (sentOrig === null || baseOrig !== null) { report.push(`NOT A HIT ANY MORE ${c} ${JSON.stringify(t)}`); count('not-a-hit'); continue; }
    const occ = annotate(normal, P, C, rec.d).filter(([k]) => k === kind).filter(([, at, len]) => sentOrig.includes(normal.slice(at, at + len)));
    if (occ.length === 0) { report.push(`NO OCCURRENCE IN CLEAR ${c} ${JSON.stringify(t)} -> ${JSON.stringify(sentOrig)}`); count('no-occurrence'); continue; }
    const [, at, len] = occ[0]!;
    const d = digitsOf(normal.slice(at, at + len));
    const tryLetter = (letter: string) => {
      const a = outcome(base, letter, P, C);
      const b = outcome(win, letter, P, C);
      const number = unbracketed(letter).slice(at, at + len);
      return a === null && b !== null && b.includes(number) ? { letter, sent: b, number } : null;
    };
    let chosen: { letter: string; sent: string; number: string } | null = null;
    let how = '';
    if (synthetic(kind, d)) { chosen = tryLetter(t); how = 'already synthetic'; }
    if (chosen === null && sameDigits) {
      for (const m of candidates(kind, d)) {
        chosen = tryLetter(rewrite(t, at, len, m));
        if (chosen !== null) { how = m.startsWith('000') || m.slice(1).startsWith('000') ? 'mapped area 000' : m.startsWith('202555') ? 'mapped 202-555-01xx' : 'mapped 900'; break; }
      }
    }
    if (chosen === null) { chosen = tryLetter(t); how = 'original kept'; report.push(`ORIGINAL KEPT ${c} digits ${d.slice(0, 3)}x ${JSON.stringify(t)}`); }
    if (chosen === null) { report.push(`UNPINNABLE ${c} ${JSON.stringify(t)}`); count('unpinnable'); continue; }
    count(how);
    classA.push({ gate: c, ...row, ...chosen });
  }
}
const classB = byClass['PHI.name']!.map((h) => { const rec = records.get(h.i); const row: any = rowOf(rec); const { P, C } = PC(row); return { gate: 'PHI.name', ...row, letter: rec.t, sent: outcome(win, rec.t, P, C) }; }).filter((r) => r.sent !== null);
const failSafe: any[] = [];
for (const c of ['KEEP.refused.must-stay.other', 'KEEP.refused.letter-with-identifiers']) {
  for (const h of byClass[c]!) {
    const rec = records.get(h.i);
    const row: any = rowOf(rec);
    const { P, C } = PC(row);
    const r = win.redactLetterForScreen(rec.t, P, C);
    if (!win.holdsIdentifier(r.text, P, C)) { report.push(`NOT REFUSED ANY MORE ${c} ${JSON.stringify(rec.t)}`); continue; }
    const scan = win.holdsIdentifier(r.text, { pseudonym: 'synthetic-patient-21', names: [], datesOfBirth: [], memberIds: [] }, []);
    if (c === 'KEEP.refused.letter-with-identifiers' && scan) continue;
    failSafe.push({ gate: c === 'KEEP.refused.must-stay.other' ? 'must-stay' : 'glued-check', ...row, letter: rec.t });
  }
}
fs.writeFileSync(outFile, JSON.stringify({ classA, classB, failSafe }, null, 1) + '\n');
report.unshift(`classA ${classA.length} ${JSON.stringify(tally)}; classB ${classB.length}; failSafe ${failSafe.length} (must-stay ${failSafe.filter((r) => r.gate === 'must-stay').length}, glued-check ${failSafe.filter((r) => r.gate === 'glued-check').length})`);
fs.writeFileSync(reportFile, report.join('\n') + '\n');
console.log(report.slice(0, 8).join('\n'));
