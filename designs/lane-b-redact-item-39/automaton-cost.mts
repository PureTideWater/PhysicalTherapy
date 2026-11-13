// The automaton's own cost at the identifier ceiling (about 60,000 identifier characters), built per call, and the size of
// K (the code points compactFolded keeps). Uses the prototype's build through a patched copy. Synthetic identifiers.
import fs from 'node:fs';
import { patched } from './variants.mts';
const src = patched(fs.readFileSync('/home/user/PhysicalTherapy/packages/redact/src/redact.ts', 'utf8'), 'aclazy').replace("from './confusables'", "from '/home/user/PhysicalTherapy/packages/redact/src/confusables.ts'") + '\nexport const item39BuildForTest = item39Build;\n';
fs.writeFileSync(new URL('./x/redact-automaton.ts', import.meta.url), src);
const H = await import(new URL('./x/redact-automaton.ts', import.meta.url).href);
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
for (const [count, len] of [[6700, 9], [1500, 40], [15000, 4], [20000, 3]] as const) {
  const words = Array.from({ length: count }, (_, i) => (len >= 9 ? `SYN${String(556000 + i)}${'0918273645QWRTYPSDFGHJKLZXCVBNM'.slice(0, len - 9)}` : i.toString(36).toUpperCase().padStart(len, '0')));
  const t = [0, 1, 2, 3].map(() => { const a = cpu(); H.item39BuildForTest(words); return cpu() - a; });
  console.log(`${count} words of ${len} (${count * len} characters): build cold ${t[0]!.toFixed(1)} ms, then ${Math.min(...t.slice(1)).toFixed(1)} ms`);
}
let k = 0; for (let c = 0; c <= 0x10ffff; c += 1) { if (c >= 0xd800 && c <= 0xdfff) continue; const s = String.fromCodePoint(c); if (/^[\p{L}\p{N}]$/u.test(s) && !/^[ʼʹˊ]$/u.test(s)) k += 1; }
console.log(`K: ${k} code points`);
