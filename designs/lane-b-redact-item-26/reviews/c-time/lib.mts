// Review C-TIME: the measuring kit. Processor time of this thread only; every figure scaled to the reference calibration (144 ms).
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as real from '/home/user/PhysicalTherapy/packages/redact/src/index.ts';
import * as inst from './inst/redact.ts';
import { calibrationMs } from '/home/user/PhysicalTherapy/packages/model-gateway/src/test-support/time-budget.ts';

export const B = real.WIDER_WORK_BOUND;
export const N = 100_000;
export const F = (u: string, n: number) => u.repeat(Math.max(0, Math.floor(n / u.length)));
export const claimOf = (...claimNumbers: string[]) => [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-7', claimNumbers }];
export const patientOf = (names: string[], memberIds: string[] = ['ZZ1234567'], datesOfBirth: string[] = ['1961-03-03']) => ({ pseudonym: 'synthetic-patient-7', names, datesOfBirth, memberIds });
export const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
type Who = ReturnType<typeof patientOf>; type Claims = ReturnType<typeof claimOf>;
export interface Impl { redactLetterForScreen: (t: string, w: Who, c: Claims) => { text: string; replaced: number }; holdsIdentifier: (t: string, w: Who, c: Claims) => boolean }

export function measure(text: string, who: Who, claims: Claims, runs: number, impl: Impl = real as unknown as Impl) {
  const ms: number[] = []; const answers = new Set<string>(); let refused = false; let bounded = false; let sentLen = 0;
  for (let i = 0; i < runs; i += 1) {
    const s = cpu(); const r = impl.redactLetterForScreen(text, who, claims); const h = impl.holdsIdentifier(r.text, who, claims); ms.push(cpu() - s);
    refused = h; bounded = r.text.endsWith(inst.__BARRIER) && !text.endsWith(inst.__BARRIER); sentLen = r.text.length;
    answers.add(`${String(h)}|${String(r.replaced)}|${createHash('sha256').update(r.text).digest('hex').slice(0, 12)}`);
  }
  const cal = calibrationMs();
  const r0 = (x: number) => Math.round(x);
  return { len: text.length, sentLen, refused, bounded, same: answers.size === 1, answer: [...answers][0], ms: ms.map(r0), cal: r0(cal), best: r0(Math.min(...ms) * 144 / cal), worst: r0(Math.max(...ms) * 144 / cal) };
}

/** On the instrumented copy: the first reading's text, the wider reading's uncovered matches, and the count the bound is held on. */
export function probe(text: string, who: Who, claims: Claims) {
  return inst.__inOneReading(() => {
    const normal = inst.__unbracketed(text); const subject = inst.__letterSubject(who, claims);
    const first = inst.__screenAsFirstRead(normal, subject, claims);
    const covered = inst.__within([...first.spans]);
    const wider = inst.__widerMatchesIn(inst.__unmarked(normal), subject).filter((m) => !covered(m));
    return { firstLen: first.text.length, work: inst.__widerWorkOf(first.text), wider: wider.length, replaced: first.replaced };
  });
}
/** On the instrumented copy: how many times each reader ran for one letter (redaction, then the check). */
export function calls(text: string, who: Who, claims: Claims) {
  Object.assign(inst.__count, { holds: 0, matches: 0, chain: 0, wider: 0 });
  const r = inst.redactLetterForScreen(text, who, claims); inst.holdsIdentifier(r.text, who, claims);
  return { ...inst.__count };
}

export interface Row { id: string; names: string[]; build: (n: number) => string; claims?: string[]; intrinsic?: boolean; asIsOnly?: boolean; note?: string }
export interface Variant { id: string; crlf: 'none' | 'append' | 'body'; wider: boolean; alike: boolean }
export const VARIANTS: Variant[] = [
  { id: 'a', crlf: 'none', wider: false, alike: false },
  { id: 'b1', crlf: 'append', wider: false, alike: false },
  { id: 'b2', crlf: 'body', wider: false, alike: false },
  { id: 'c', crlf: 'none', wider: true, alike: false },
  { id: 'd1', crlf: 'append', wider: true, alike: false },
  { id: 'd2', crlf: 'body', wider: true, alike: false },
  { id: 'e', crlf: 'append', wider: false, alike: true },
  { id: 'g', crlf: 'append', wider: true, alike: true },
];
/** The longest part of the patient's names, written apart in the middle: VANTREE as "Vant ree". */
export const splitOf = (names: string[]) => {
  const part = names.join(' ').split(/[^A-Za-z]+/).sort((a, b) => b.length - a.length)[0] ?? 'X';
  const h = Math.ceil(part.length / 2);
  return `${part.slice(0, 1).toUpperCase()}${part.slice(1, h).toLowerCase()} ${part.slice(h).toLowerCase()}`;
};
/** CR LF inside the body: every fourth space as a CR LF where the body has spaces, else a CR LF after every 64 characters. */
export const inBody = (body: string) => {
  if ((body.match(/ /g)?.length ?? 0) >= body.length / 200) { let k = 0; return body.replace(/ /g, (s) => ((k += 1) % 4 === 0 ? '\r\n' : s)); }
  return body.replace(/[^]{64}/g, '$&\r\n');
};
export function decorate(body: string, v: Variant, split: string): string {
  let t = v.crlf === 'body' ? inBody(body) : body;
  if (v.wider) t += `${v.crlf === 'none' ? ' ' : '\r\n'}${split}`;
  else if (v.crlf === 'append') t += '\r\n';
  if (v.alike) t += ' х';
  return t;
}
/** The variant's letter: at most N characters, and where a wider match stands, trimmed until the bound's count is at or just under B. */
export function fit(row: Row, v: Variant) {
  const split = splitOf(row.names); const who = patientOf(row.names); const claims = claimOf(...(row.claims ?? ['SYN555001']));
  const dv = row.intrinsic === true ? { ...v, wider: false } : v;
  const make = (n: number) => decorate(row.build(n), dv, split);
  let n = N; let text = make(n);
  for (let i = 0; i < 12 && text.length > N; i += 1) { n -= text.length - N; text = make(n); }
  if (!v.wider) return { text, n, who, claims, split };
  let p = probe(text, who, claims);
  for (let i = 0; i < 8; i += 1) {
    if (p.wider === 0 || (p.work <= B && B - p.work < 120)) break;
    const next = Math.floor((n * (B - 40)) / p.work);
    if (next === n) break;
    const t2 = make(next);
    if (t2.length > N || t2 === text) break;
    const p2 = probe(t2, who, claims);
    if (p2.work > B && p.work <= B) break;
    n = next; text = t2; p = p2;
  }
  return { text, n, who, claims, split, ...p };
}
export const record = (file: string, value: unknown) => { appendFileSync(file, `${JSON.stringify(value)}\n`); };
export { real, inst, calibrationMs };
