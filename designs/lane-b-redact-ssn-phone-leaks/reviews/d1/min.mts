// D1 review: shrink the one letter the base refuses and the head sends (fz3 seed 4201) to the least text that still does,
// to see what the base refuses it for. node min.mts
import { pathToFileURL } from 'node:url';
import { XA } from './gen2.mts';
const load = async (p: string): Promise<any> => import(pathToFileURL(p).href);
const B = await load('/home/user/tree-ef3/packages/model-gateway/src/redact.ts');
const H = await load('/home/user/fix/packages/model-gateway/src/redact.ts');
const [P, C] = [XA.P, XA.C];
const out = (R: any, t: string) => { try { const s = R.redactLetterForScreen(t, P, C).text as string; return { r: R.holdsIdentifier(s, P, C) as boolean, s }; } catch (e) { return { r: false, s: `THREW ${String(e).slice(0, 80)}` }; } };
const flips = (t: string) => out(B, t).r && !out(H, t).r;
let t = 'EFT # and J. Z3ph··yra, S. Vant•ree AE 09012-3456:900-12-34567th';
console.log('start flips:', flips(t));
for (let changed = true; changed; ) {
  changed = false;
  const parts = t.split(/(\s+)/u);
  for (let i = 0; i < parts.length; i += 2) {
    const without = [...parts.slice(0, i), ...parts.slice(i + 2)].join('');
    if (without.length > 0 && flips(without)) { t = without; changed = true; break; }
  }
}
for (let changed = true; changed; ) {
  changed = false;
  const chars = [...t];
  for (let i = 0; i < chars.length; i += 1) {
    const without = [...chars.slice(0, i), ...chars.slice(i + 1)].join('');
    if (without.length > 0 && flips(without)) { t = without; changed = true; break; }
  }
}
const show = (label: string, x: string) => { const [b, h] = [out(B, x), out(H, x)]; console.log(`${label} ${JSON.stringify(x)} base=${b.r ? 'REFUSED' : 'SENT'} ${JSON.stringify(b.s)} head=${h.r ? 'REFUSED' : 'SENT'} ${JSON.stringify(h.s)}`); };
show('least', t);
show('least, plain name', t.replace(/Vant•ree/u, 'Vantree').replace(/Z3ph··yra/u, 'Zephyra'));
show('least, other word', t.replace(/Vant•ree/u, 'Wint•rop').replace(/Z3ph··yra/u, 'Q3rt··uvw'));
console.log('base check on the head text of the least letter:', B.holdsIdentifier(out(H, t).s, P, C));
const chars = [...t];
for (let i = 0; i < chars.length; i += 1) { const x = [...chars.slice(0, i), ...chars.slice(i + 1)].join(''); const [b, h] = [out(B, x), out(H, x)]; if (!(b.r && !h.r)) console.log(`  without ${JSON.stringify(chars[i])} at ${i}: base=${b.r ? 'REFUSED' : 'SENT'} head=${h.r ? 'REFUSED' : 'SENT'}`); }
