// Builds the residual table (class A: SSN/phone gate rows; class B: month-word name rows; fail-safe refusals) from a gate
// run's hits, as SYNTHETIC rows: SSN digits mapped into 900-xx-xxxx and phone digits into 202/555-01xx where the row's
// outcome (cc3dd7f6 refuses, the candidate sends the number in clear) is kept by the mapping.
// usage: node gen-residual.mts <gate run dir> <out.json> <report.txt>
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
const outcome = (M: any, t: string, P: any, C: any) => { const r = M.redactLetterForScreen(t, P, C); return M.holdsIdentifier(r.text, P, C) ? null : r.text as string; };
const digitsOf = (s: string) => [...s].map((ch) => digitValue(ch)).filter((v) => v >= 0).join('');
const syntheticSsn = (d: string) => d.startsWith('900');
const syntheticPhone = (d: string) => (d.length === 7 && d.startsWith('55501')) || (d.length === 10 && d.startsWith('20255501')) || (d.length === 11 && d.startsWith('120255501'));
const mapSsn = (d: string) => `900${d.slice(3)}`;
const mapPhone = (d: string) => (d.length === 7 ? `55501${d.slice(5)}` : d.length === 10 ? `20255501${d.slice(8)}` : d.length === 11 ? `120255501${d.slice(9)}` : d);
const report: string[] = [];
const rowOf = (rec: any) => { const { P, C } = patients[rec.p]!; return { names: P.names, datesOfBirth: P.datesOfBirth, memberIds: P.memberIds, claimNumbers: C.flatMap((c: any) => c.claimNumbers) }; };
const PC = (row: any) => ({ P: { pseudonym: 'synthetic-patient-21', names: row.names, datesOfBirth: row.datesOfBirth, memberIds: row.memberIds }, C: [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-21', claimNumbers: row.claimNumbers }] });
const classA: any[] = [];
let mapped = 0, already = 0, unmapped = 0, lost = 0;
for (const c of ['PHI.ssn', 'PHI.phone']) {
  for (const h of byClass[c]!) {
    const rec = records.get(h.i);
    const row: any = rowOf(rec);
    const { P, C } = PC(row);
    const t: string = rec.t;
    const normal = unbracketed(t);
    const occ = annotate(normal, P, C, rec.d).filter(([k]) => k === 'ssn' || k === 'phone');
    // Map in the letter as written when NFKC keeps its digits where they are.
    const sameDigits = normal.length === t.length && digitsOf(normal) === digitsOf(t);
    let letter = t;
    let changed = false;
    let ok = true;
    for (const [kind, at, len] of occ) {
      const d = digitsOf(normal.slice(at, at + len));
      if (kind === 'ssn' ? syntheticSsn(d) : syntheticPhone(d)) continue;
      if (!sameDigits) { ok = false; continue; }
      const m = kind === 'ssn' ? mapSsn(d) : mapPhone(d);
      let k = 0;
      const chars = [...letter.slice(0, at)].length;
      const arr = [...letter];
      // Rewrite digit by digit, each in its own script.
      let pos = 0;
      const units: string[] = [];
      for (const ch of arr) { units.push(ch); }
      let idx = 0;
      let unit = 0;
      for (let i = 0; i < arr.length; i += 1) {
        const ch = arr[i]!;
        if (unit >= at && unit < at + len) {
          const v = digitValue(ch);
          if (v >= 0) { const nv = Number(m[k]); arr[i] = String.fromCodePoint(ch.codePointAt(0)! - v + nv); k += 1; }
        }
        unit += ch.length;
      }
      void chars; void pos; void idx; void units;
      letter = arr.join('');
      changed = true;
    }
    if (!ok) { unmapped += 1; report.push(`UNMAPPED (NFKC moves digits) ${c} ${JSON.stringify(t)}`); }
    const tryRow = (l: string) => { const a = outcome(base, l, P, C); const b = outcome(win, l, P, C); return a === null && b !== null ? b : null; };
    let sent = changed ? tryRow(letter) : null;
    if (changed && sent === null) { lost += 1; report.push(`KEPT ORIGINAL (mapping changed the outcome) ${c} ${JSON.stringify(t)} -> ${JSON.stringify(letter)}`); letter = t; changed = false; }
    if (!changed) { sent = tryRow(t); if (ok) already += 1; } else mapped += 1;
    if (sent === null) { report.push(`NOT A HIT ANY MORE ${c} ${JSON.stringify(t)}`); continue; }
    classA.push({ gate: c, ...row, letter, sent });
  }
}
const classB = byClass['PHI.name']!.map((h) => { const rec = records.get(h.i); const row: any = rowOf(rec); const { P, C } = PC(row); return { gate: 'PHI.name', ...row, letter: rec.t, sent: outcome(win, rec.t, P, C) }; });
// Fail-safe refusals: must-stay letters (60) and letters with identifiers the glued check refuses (the scan's own: with no
// identifier to look for, the letter is still refused).
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
report.unshift(`classA ${classA.length} (mapped ${mapped}, already synthetic ${already}, unmapped ${unmapped}, mapping kept original ${lost}); classB ${classB.length}; failSafe ${failSafe.length} (must-stay ${failSafe.filter((r) => r.gate === 'must-stay').length}, glued-check ${failSafe.filter((r) => r.gate === 'glued-check').length})`);
fs.writeFileSync(reportFile, report.join('\n') + '\n');
console.log(report.slice(0, 12).join('\n'));
