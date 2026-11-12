// The least letter with the most identifiers, call by call in one fresh process (the first call is cold). Synthetic data only.
import fs from 'node:fs';
import { calib, once, who } from '/home/user/review-time/lib.mts';
const [k = '5000', len = '40', shape = 'one', text = 'The claim was paid.'] = process.argv.slice(2);
const nums = Array.from({ length: Number(k) }, (_, i) => `SYN${String(556000 + i)}${'0918273645QWRTYPSDFGHJKLZXCVBNM'.slice(0, Number(len) - 9)}`);
const c = shape === 'one' ? [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: nums }] : nums.map((x, i) => ({ claimId: `c${i}`, patientPseudonym: 'p1', claimNumbers: [x] }));
const c0 = await calib(); const out: string[] = [];
for (let i = 0; i < 4; i++) { const g = once(text, who(), c as any); out.push(`${g.ms.toFixed(0)} ms (redact ${g.msRedact.toFixed(0)}; ${g.units} units; ${g.held ? 'HELD' : 'sent'})`); }
const c1 = await calib();
const s = `${k} claim numbers of ${len} characters, ${shape}, letter of ${text.length} characters: cpu per call ${out.join(' | ')}  [cal ${c0.toFixed(0)}/${c1.toFixed(0)}]`;
console.log(s); fs.appendFileSync('/home/user/review-fix1/out/cold.txt', s + '\n');
