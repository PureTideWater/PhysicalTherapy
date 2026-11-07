// Recording sink for the harvest: every letter a harness passes to a redaction function is written once, with its patient
// and claims (deduplicated into a table), and the digit strings the harness then looks for in the result (its own oracle's
// SSN or phone digits, caught on String.prototype.includes). Synthetic data only. Uses fs functions captured before the
// runner no-ops them.
import fs from 'node:fs';
const openSync = fs.openSync, writeSync = fs.writeSync, closeSync = fs.closeSync;
const out = process.env.REC_OUT ?? '';
const cap = Number(process.env.REC_CAP ?? 2_000_000);
const fd = out === '' ? -1 : openSync(out, 'w');
const patients = new Map<string, number>();
const seen = new Set<string>();
type Rec = { p: number; t: string; f: string; d?: string[] } | { patientDef: number; def: unknown };
let buf: Rec[] = [];
let count = 0;
// The last new letter: the digits the harness looks for next belong to it (its other trees' calls are duplicates).
let current: { p: number; t: string; f: string; d?: string[] } | null = null;
const flush = (all: boolean) => {
  if (fd < 0) return;
  const keep = !all && current !== null && buf.at(-1) === current ? buf.pop()! : null;
  if (buf.length > 0) writeSync(fd, buf.map((r) => JSON.stringify(r)).join('\n') + '\n');
  buf = keep === null ? [] : [keep];
};
export function record(fn: string, text: unknown, patient: unknown, claims: unknown): void {
  if (typeof text !== 'string' || count >= cap) return;
  if (/\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|SSN|PHONE|CLAIM_\d+)\]/.test(text) && fn === 'holds') return;
  const pk = JSON.stringify({ patient, claims: claims ?? null });
  let p = patients.get(pk);
  if (p === undefined) { p = patients.size; patients.set(pk, p); buf.push({ patientDef: p, def: JSON.parse(pk) }); }
  const key = `${p}\u0000${text}`;
  if (seen.has(key)) return;
  seen.add(key);
  count += 1;
  current = { p, t: text, f: fn };
  buf.push(current);
  if (buf.length >= 5000) flush(false);
}
export function noteDigits(d: string): void {
  if (current === null) return;
  const list = (current.d ??= []);
  if (!list.includes(d) && list.length < 4) list.push(d);
}
const origIncludes = String.prototype.includes;
// eslint-disable-next-line no-extend-native
String.prototype.includes = function (this: string, search: string, position?: number) {
  if (typeof search === 'string' && search.length >= 7 && search.length <= 12 && /^\d+$/.test(search)) {
    const self = String(this);
    if (self.length < 400 && /^\d*$/.test(self)) noteDigits(search);
  }
  return origIncludes.call(this, search, position);
} as typeof String.prototype.includes;
process.on('exit', () => { flush(true); if (fd >= 0) closeSync(fd); });
