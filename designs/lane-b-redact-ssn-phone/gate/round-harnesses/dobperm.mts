// Synthetic only. DOB writings in every order / year length / padding / separator, in held frames.
// Hit: cc3dd7f6 refused or redacted the form, candidate sends it in clear. Each hit's form is classified by whether a
// redaction rule reads it elsewhere: plain bounded ("Seen {t} today") or after a birth label ("DOB {t}").
import { readFileSync, writeFileSync } from 'node:fs';
import { A, B, run } from './lib.mts';
import { FRAMES } from './frames.mts';
const pins = new Set<string>(JSON.parse(readFileSync('/home/user/rg-cand-b/packages/model-gateway/src/redact.residuals.json', 'utf8')).ownIdentifierA.map((r: any) => r.token));
const DOBS = ['1980-03-14', '1975-11-02', '1961-03-03'];
const SEPS = ['/', '-', '.', ' ', '–', '—', '\\', '_', '|', '−', '⁃', ' / ', ' - ', '--', '//', '..', '\n', '', ', ', '  ', '\t', ' .', '/ '];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function forms(dob: string): string[] {
  const [y, m, d] = dob.split('-');
  const out = new Set<string>();
  for (const yl of [4, 2]) for (const pad of [true, false]) for (const sep of SEPS) {
    const Y = yl === 4 ? y : y.slice(2);
    const M = pad ? m : String(Number(m)); const D = pad ? d : String(Number(d));
    const parts: Record<string, string> = { y: Y, m: M, d: D };
    for (const order of ['ymd', 'ydm', 'mdy', 'dmy', 'myd', 'dym']) out.add(order.split('').map((k) => parts[k]).join(sep));
  }
  const mi = Number(m) - 1;
  const words = [MONTHS[mi], MONTHS[mi].slice(0, 3), MONTHS[mi].slice(0, 3) + '.', MONTHS[mi].toUpperCase()];
  for (const w of words) for (const D of [d, String(Number(d)), String(Number(d)) + (Number(d) === 1 ? 'st' : Number(d) === 2 ? 'nd' : Number(d) === 3 ? 'rd' : 'th')]) for (const Y of [y, y.slice(2), "'" + y.slice(2)]) for (const sep of [' ', '-', '/', '.', '', ', ', '\n']) {
    out.add([Y, w, D].join(sep)); out.add([Y, D, w].join(sep)); out.add([w, Y, D].join(sep)); out.add([D, Y, w].join(sep));
    out.add([w, D, Y].join(sep)); out.add([D, w, Y].join(sep));
  }
  return [...out];
}
const name = 'JANE Q ZEPHYRA';
const out: any[] = [];
const by: Record<string, number> = {};
let n = 0;
for (const dob of DOBS) {
  const p = { names: [name], dob };
  for (const t of forms(dob)) {
    const tn = t.normalize('NFKC');
    const clear = (x: string) => x !== 'REFUSED' && x.includes(tn);
    const readBy = (l: string) => { const a = run(A, l, p), b = run(B, l, p); return (!clear(a) && a !== 'REFUSED' ? 'A' : '') + (!clear(b) && b !== 'REFUSED' ? 'B' : ''); };
    const plain = readBy(`Seen ${t} today.`);
    const label = readBy(`DOB ${t} today.`);
    for (const f of FRAMES) {
      const l = f.replace('{T}', t);
      n++;
      const a = run(A, l, p), b = run(B, l, p);
      if (clear(b) && !clear(a)) {
        const cls = plain ? 'plain-read' : label ? 'label-read' : 'unread';
        out.push({ dob, t, l, a: a === 'REFUSED' ? 'REFUSED' : a, b: b === l ? 'SENT' : b, plain, label, cls, pinned: pins.has(t) });
        const k = `${cls}${pins.has(t) ? ' pinned' : ''}`;
        by[k] = (by[k] ?? 0) + 1;
      }
    }
  }
}
writeFileSync(process.argv[2]!, out.map((o) => JSON.stringify(o)).join('\n') + '\n');
console.log('letters', n, 'hits', out.length);
for (const [k, v] of Object.entries(by)) console.log(v, k);
