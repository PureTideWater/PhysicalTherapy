// P-3: what the returned result keeps alive. usage: node --expose-gc p3.mts base|head
// Counts copies of the raw letter in a heap snapshot while only the redacted result is held, and again once it is dropped.
import fs from 'node:fs'; import v8 from 'node:v8';
import { B, H, who, claims } from './lib.mts';
const M = process.argv[2] === 'base' ? B : H;
function check() { const q = 'q' + 'x'.repeat(5) + 'q'; const text = `Our letter. ${q} Member ID 76543210 for Jane Q Zephyra, ${q}. ` + 'The claim was paid. '.repeat(20); return M.redactLetterForScreen(text, who, claims); }
function flush() { for (let i = 0; i < 50; i++) /z+/u.exec('none here ' + i); M.redactLetterForScreen('Another letter with nothing in it.', who, claims); (globalThis as any).gc(); (globalThis as any).gc(); }
function copies() { const file = v8.writeHeapSnapshot(`/home/user/rv1/x/heap-${process.argv[2]}.heapsnapshot`); const snap = fs.readFileSync(file, 'utf8'); fs.unlinkSync(file); return snap.split('qxxxxxq Member ID 76543210 for Jane Q Zephyra').length - 1; }
let kept: any = check();
flush(); const held = copies();
const ok = kept.text.includes('qxxxxxq Member ID [MEMBER_ID]');
kept = null; flush(); const dropped = copies();
console.log(process.argv[2], '| result redacted:', ok, '| raw letter copies in the heap, result held:', held, '| result dropped:', dropped);
