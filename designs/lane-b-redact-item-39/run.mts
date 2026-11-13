// One fresh process: call 1 is the cold first check, calls 2..5 warm. Args: count len shape(one|across) letter(tiny|prose).
import { once, numbers, one, across, who, TINY, PROSE, calibrationMs, stats } from './lib.mts';
const [k = '1000', len = '9', shape = 'one', letter = 'tiny'] = process.argv.slice(2);
const ids = numbers(Number(k), Number(len));
const c = shape === 'one' ? one(ids) : across(ids);
// listed: a letter that writes the call's own numbers (up to 400 of them) in a paragraph: places for the automaton.
const text = letter === 'tiny' ? TINY : letter === 'listed' ? `Claims ${ids.slice(0, 400).join(', ')} were denied. ${PROSE.slice(0, 2000)}` : PROSE;
const cal0 = calibrationMs();
const heap0 = process.memoryUsage().heapUsed; const rss0 = process.memoryUsage().rss;
const calls: ReturnType<typeof once>[] = [];
let session: any = null;
const CALLS = Number(process.env.CALLS ?? '5');
for (let i = 0; i < CALLS; i += 1) {
  if (i === 1 && process.env.PROFILE) { const { Session } = await import('node:inspector/promises'); session = new Session(); session.connect(); await session.post('Profiler.enable'); await session.post('Profiler.start'); }
  calls.push(once(text, who, c));
}
if (session) { const { profile } = await session.post('Profiler.stop'); (await import('node:fs')).writeFileSync(process.env.PROFILE!, JSON.stringify(profile)); }
const mem = process.memoryUsage();
const cal = Math.min(cal0, calibrationMs());
const warm = Math.min(...calls.slice(1).map((g) => g.ms));
const f = (x: number) => x.toFixed(0).padStart(6);
console.log(`${(process.env.VARIANT ?? 'base').padEnd(6)} ${k.padStart(6)}x${len.padEnd(2)} ${shape.padEnd(6)} ${letter.padEnd(5)} cold ${f(calls[0]!.ms)} ms (redact ${f(calls[0]!.redact)}, check ${f(calls[0]!.check)}) warm ${f(warm)} ms | ref x${(144 / cal).toFixed(2)}: cold ${f(calls[0]!.ms * 144 / cal)} warm ${f(warm * 144 / cal)} | heap +${((mem.heapUsed - heap0) / 2 ** 20).toFixed(0)} MB rss +${((mem.rss - rss0) / 2 ** 20).toFixed(0)} MB | ${calls.map((g) => g.out).join(',')} | out ${JSON.stringify(calls[0]!.text).length} sha ${(await import('node:crypto')).createHash('sha256').update(calls.map((g) => g.out + g.text).join('\u0000')).digest('hex').slice(0, 12)} | cal ${cal.toFixed(0)} | units ${calls[0]!.units} (redaction ${calls[0]!.redactUnits})${stats ? ` | ${JSON.stringify(stats)}` : ''}`);
