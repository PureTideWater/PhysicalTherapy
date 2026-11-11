// Which top-level functions of redact.ts differ between base and head (bodies compared as text), and which are new.
import fs from 'node:fs';
const bodies = (p) => { const out = new Map(); const lines = fs.readFileSync(p, 'utf8').split('\n'); let name = null; let buf = []; for (const line of lines) { const m = /^(?:export )?function (\w+)\(/.exec(line); if (m && name === null) { name = m[1]; buf = []; } if (name !== null) { buf.push(line); if (line === '}') { out.set(name, buf.join('\n')); name = null; } } } return out; };
const [b, h] = [bodies(process.argv[2]), bodies(process.argv[3])];
const changed = []; const added = []; for (const [k, v] of h) { if (!b.has(k)) added.push(k); else if (b.get(k) !== v) changed.push(k); }
console.log('changed:', changed.join(' ')); console.log('new:', added.join(' ')); console.log('gone:', [...b.keys()].filter((k) => !h.has(k)).join(' '));
