// node rows.mts <file>: one JSON string per line ("<200B>" stands for that code point; "# ..." is a heading); the outcome on head, before, base.
import fs from 'node:fs';
import { load, outcome, show, J } from './lib.mts';
const [H, P, B] = await Promise.all(['head', 'before', 'base'].map(load));
for (const line of fs.readFileSync(process.argv[2] as string, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  if (line.startsWith('#')) { console.log(`\n${line}`); continue; }
  const text = (JSON.parse(line) as string).replace(/<([0-9A-F]{4,5})>/g, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)));
  const [h, p, b] = [outcome(H, text), outcome(P, text), outcome(B, text)];
  const flag = !h.refused && p.refused ? (b.refused ? 'BASE-R>S ' : 'P-R>S    ') : h.refused && !p.refused ? 'newR     ' : '         ';
  console.log(`${flag}${J(text)} :: H ${show(h, text)} | P ${show(p, text)} | B ${show(b, text)}`);
}
