// node one.mts <tree> <kind:n[:i]>...: one process, each letter timed in turn ("start" is printed before a letter, so a kill shows where it hung)
import { pathToFileURL } from 'node:url';
import { PATHS, JANE, CLAIMS } from './lib.mts';
const [, , tree, ...specs] = process.argv;
const R = await import(pathToFileURL(PATHS[tree as string] as string).href);
const lcg = (seed: number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const two = (v: number) => String(v).padStart(2, '0');
const amt = (r: () => number) => `${1 + Math.floor(r() * 900)}.${two(Math.floor(r() * 100))}`;
const fill = (n: number, f: (r: () => number) => string) => { const r = lcg(7); let s = ''; while (s.length < n) s += f(r); return s.slice(0, n); };
const CH = ['-', '| ', '_', '+', ' ', '─', '~', '=', '*', '.', '\t', '|', '-+'];
const mk = (kind: string, n: number, i: number): string => {
  switch (kind) {
    case 'U': return `IMPORTANT NOTICE\n${'_'.repeat(n)}\nClaim Number: 20260112345.01`;
    case 'Ub': return `REMITTANCE ADVICE\n${'─'.repeat(n)}\nICN 12345678901234.01`;
    case 'Ut': return `STATEMENT\n${'~'.repeat(n)}\nYour reference is 802-45-678901.50`;
    case 'Uf': return `Provider: ${'_'.repeat(n)} Date: 01/15/2026 Claim 20260112345.01`;
    case 'Up': return `YOUR PLAN\n${'─'.repeat(n)}\nPolicy 01-23456-78-9012`;
    case 'Ud': return `IMPORTANT NOTICE\n${'-'.repeat(n)}\nClaim Number: 20260112345.01`;
    case 'X': return `Claim Number${(CH[i] as string).repeat(n)}20260112345.01`;
    case 'Y': return `Claim Number${(CH[i] as string).repeat(n)} x 20260112345.01`;
    case 'P0': return fill(n, (r) => `PatientRef ${amt(r)}\n`);
    case 'P1': return fill(n, (r) => `PatientSSN ${amt(r)}\n`);
    case 'P2': return fill(n, (r) => `MemberSSN 9711${Math.floor(r() * 10)}\n`);
    case 'P3': return fill(n, (r) => `PatientSSN ${amt(r)} MemberSSN 9711${Math.floor(r() * 10)} `);
    case 'P4': return fill(n, (r) => `MemberSSN on file 01/${two(1 + Math.floor(r() * 28))}/2026 ${amt(r)} paid\n`);
    case 'P5': return fill(n, (r) => `Patient SSN ${amt(r)}\n`);
    case 'P6': return fill(n, (r) => `MemberSSN ${1 + Math.floor(r() * 8)} units ${amt(r)} billed, PatientSSN ${amt(r)} allowed\n`);
    default: throw new Error(kind);
  }
};
R.holdsIdentifier(R.redactLetterForScreen('Claim 97110 2 150.00 on 01/15/2026', JANE, CLAIMS).text, JANE, CLAIMS);
for (const spec of specs) {
  const [kind, ns, is] = spec.split(':'); const n = Number(ns);
  console.log(`start ${spec}`);
  if (kind === 'R') { const s = `IMPORTANT NOTICE\n${'_'.repeat(n)}\nCLAIM NUMBER: `; const t0 = performance.now(); const m = R.__rx.NAMED_BEFORE.exec(s); console.log(`done ${spec} NAMED_BEFORE.exec alone ${(performance.now() - t0).toFixed(1)}ms match=${m === null ? 'null' : JSON.stringify(m[0])}`); continue; }
  const text = mk(kind as string, n, Number(is ?? 0));
  const t0 = performance.now(); const s = R.redactLetterForScreen(text, JANE, CLAIMS); const t1 = performance.now(); const h = R.holdsIdentifier(s.text, JANE, CLAIMS); const t2 = performance.now();
  console.log(`done ${spec} [${text.length} chars] redact ${(t1 - t0).toFixed(0)}ms check ${(t2 - t1).toFixed(0)}ms ${h ? 'REFUSED' : s.text === text ? 'same' : 'changed'}`);
}
