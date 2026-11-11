// node time.mts: the timings (B: NAMED_BEFORE's run of three or more inside its repeated group; 5,000-character lines; A.4: 20,000-character letters with a glued label before every number)
import { spawnSync } from 'node:child_process';
const T0 = Date.now();
const run = (tree: string, specs: string[], timeout: number) => {
  const t0 = Date.now();
  const p = spawnSync(process.execPath, ['/home/user/review-i2/one.mts', tree, ...specs], { timeout, encoding: 'utf8' });
  const lines = (p.stdout ?? '').trim().split('\n');
  console.log(`## ${tree}: ${specs.join(' ')}${p.signal ? ` -> KILLED at ${((Date.now() - t0) / 1000).toFixed(0)}s (cap ${timeout / 1000}s) during "${lines[lines.length - 1]}"` : ''}${p.status !== 0 && !p.signal ? ` ERR ${(p.stderr ?? '').slice(-300)}` : ''}`);
  for (const l of lines) if (l.startsWith('done')) console.log('    ' + l);
};
const part = process.argv[2] ?? 'all';
if (part === 'all' || part === 'exp') {
  run('vX', ['R:24', 'R:30', 'R:36', 'R:42', 'R:48', 'R:54', 'R:60'], 20000);
  run('head', ['U:16', 'U:24', 'U:32', 'U:36', 'U:40', 'U:44', 'U:48', 'U:52', 'U:56', 'U:60', 'U:72'], 40000);
  run('before', ['U:48', 'U:72', 'Ub:72', 'Ut:72', 'Uf:60', 'Up:60'], 20000);
  run('base', ['U:48', 'U:72', 'Ub:72', 'Ut:72', 'Uf:60', 'Up:60'], 20000);
  run('head', ['Ub:40', 'Ub:44', 'Ub:48', 'Ub:52'], 12000);
  run('head', ['Ut:40', 'Ut:44', 'Ut:48', 'Ut:52'], 12000);
  run('head', ['Uf:30', 'Uf:40', 'Uf:44', 'Uf:48', 'Uf:52'], 12000);
  run('head', ['Up:40', 'Up:44', 'Up:48', 'Up:52'], 12000);
}
if (part === 'all' || part === 'lin') {
  const xy: string[] = ['Ud:72', 'Ud:5000']; for (let i = 0; i < 13; i += 1) xy.push(`X:5000:${i}`, `Y:5000:${i}`);
  run('head', xy, 40000);
}
if (part === 'all' || part === 'p') for (const tree of ['head', 'before', 'base', 'vL']) run(tree, ['P0:20000', 'P1:20000', 'P2:20000', 'P3:20000', 'P4:20000', 'P5:20000', 'P6:20000', 'P1:20000', 'P6:20000'], 60000);
console.log(`total ${((Date.now() - T0) / 1000).toFixed(0)}s`);
