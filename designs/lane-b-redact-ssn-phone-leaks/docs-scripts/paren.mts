// The letters of the gate whose outcome turns on a number in parentheses right after a label with no colon after it:
// the head against a copy that reads such a number only before a colon. By the gate's class on the head.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
const H = await import(pathToFileURL('/home/user/fix/packages/model-gateway/src/redact.ts').href);
const V = await import(pathToFileURL('/home/user/work/p16/variant/packages/model-gateway/src/redact.ts').href);
const B = await import(pathToFileURL('/home/user/tree-ef3/packages/model-gateway/src/redact.ts').href);
const dir = '/home/user/gate-out/p16-ef3/hits';
const cls = new Map<number, string>();
for (const f of fs.readdirSync(dir)) {
  const name = f.replace(/\.w[0-9]+\.jsonl$/u, '');
  if (!/^(REVERSE\.PHI|KEEP\.)/u.test(name)) continue;
  for (const line of fs.readFileSync(`${dir}/${f}`, 'utf8').split('\n')) if (line) { const i = JSON.parse(line).i; cls.set(i, cls.has(i) ? `${cls.get(i)}+${name}` : name); }
}
const corpus = '/home/user/gate/corpus';
const patients = JSON.parse(fs.readFileSync(`${corpus}/patients.json`, 'utf8'));
const out = (R: any, t: string, P: any, C: any) => { const s = R.redactLetterForScreen(t, P, C); return R.holdsIdentifier(s.text, P, C) ? 'REFUSED' : s.text; };
const by: Record<string, number> = {}; let without = 0, withoutRefused = 0;
for (const f of fs.readdirSync(corpus).filter((f) => f.startsWith('shard-'))) {
  for (const line of zlib.gunzipSync(fs.readFileSync(`${corpus}/${f}`)).toString('utf8').split('\n')) {
    if (!line) continue;
    const m = /"i":(\d+)/.exec(line);
    if (!m || !cls.has(Number(m[1]))) continue;
    const rec = JSON.parse(line);
    const { P, C } = patients[rec.p];
    const h = out(H, rec.t, P, C), v = out(V, rec.t, P, C);
    if (h === v) continue;
    const group = /REVERSE\.PHI/u.test(cls.get(rec.i)!) ? 'holds a number or identifier the harness wrote (REVERSE.PHI)' : 'holds none the oracle places (KEEP)';
    const key = `${group}: head ${h === 'REFUSED' ? 'refuses' : 'redacts'}`;
    by[key] = (by[key] ?? 0) + 1;
    if (group.startsWith('holds none')) { without += 1; if (out(B, rec.t.replace(/[ \t]?\([0-9]{1,2}\)/gu, ''), P, C) === 'REFUSED' || out(B, rec.t.replace(/[ \t]?\([0-9]{1,2}\)/gu, ''), P, C) !== rec.t.replace(/[ \t]?\([0-9]{1,2}\)/gu, '').normalize('NFKC')) withoutRefused += 1; }
  }
}
console.log(JSON.stringify(by)); console.log(`KEEP letters ${without}; ef3e8d20 refuses or redacts the same letter with its "(n)" taken out: ${withoutRefused}`);
