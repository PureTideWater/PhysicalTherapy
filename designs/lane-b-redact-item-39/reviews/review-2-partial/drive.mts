// Driver: node drive.mts <batch> [filter]. Runs each case of the batch in a fresh process on BASE and HEAD, each under the
// shared heavy lock with a time limit, and appends one JSON line per run to /home/user/rv2/out/<batch>.jsonl.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const batch = process.argv[2] ?? 'smoke';
const LIMIT = Number(process.env.LIMIT ?? 100);
const NEL = '\u0085';
const HALF = '½';
const B: Record<string, any[]> = {
  smoke: [{ kind: 'ids', count: 1000, len: 9, letter: 'tiny' }, { kind: 'win', n: 20000, d: 600, marker: NEL, ws: true, own: true }],
  ids: [
    ...[1000, 3150, 6300].map((count) => ({ kind: 'ids', count, len: 9, letter: 'tiny' })),
    ...[1000, 2000].map((count) => ({ kind: 'ids', count, len: 2, letter: 'prose' })),
    ...[2000, 4000, 8000].map((count) => ({ kind: 'ids', count, len: 3, letter: 'prose' })),
    ...[2000, 4000, 8000].map((count) => ({ kind: 'ids', count, len: 3, letter: 'tiny' })),
    ...[15000, 30000].map((count) => ({ kind: 'ids', count, len: 'cjk2', letter: 'tiny' })),
    ...[15000, 30000, 59000].map((count) => ({ kind: 'ids', count, len: 'cjk1', letter: 'tiny' })),
    ...[3000, 5900].map((count) => ({ kind: 'ids', count, len: 'slash', letter: 'tiny' })),
    ...[30, 59].map((count) => ({ kind: 'long', count, len: 1000 })),
    { kind: 'ids', count: 6600, len: 9, letter: 'tiny' },
  ],
  chain: [
    ...[50, 100, 200].flatMap((L) => [25000, 50000, 100000].map((n) => ({ kind: 'chain', L, n, ch: 'A' }))),
    ...[25000, 50000].map((n) => ({ kind: 'chain', L: 100, n, ch: '7' })),
    ...[12500, 25000].map((n) => ({ kind: 'chain', L: 50, n, ch: 'A', spaced: true })),
    ...[25000, 50000].map((n) => ({ kind: 'chain', L: 20, n, ch: 'A' })),
  ],
  win: [
    ...[NEL, HALF].flatMap((marker) => [300, 600, 5000].flatMap((d) => [100000, 200000].map((n) => ({ kind: 'win', n, d, marker, ws: true, own: true })))),
    ...[NEL, HALF].flatMap((marker) => [100000, 200000].map((n) => ({ kind: 'win', n, d: 600, marker, ws: false, own: true }))),
    ...[NEL, HALF].flatMap((marker) => [50000, 100000].map((n) => ({ kind: 'win', n, d: 300, marker, ws: true, own: true, edges: true }))),
    { kind: 'win', n: 300000, d: 5000, marker: NEL, ws: true, own: true },
    ...[50000, 100000].map((n) => ({ kind: 'win', n, d: 600, marker: NEL, ws: true, own: true, count: 1000 })),
    ...[50000, 100000].map((n) => ({ kind: 'win', n, d: 600, marker: HALF, ws: true, own: true, count: 1000 })),
  ],
  chain2: [
    ...['=', '|'].flatMap((sep) => [50, 200].flatMap((L) => [5000, 20000].map((n) => ({ kind: 'chain', L, n, ch: 'A', sep, from: 2 })))),
    ...[2000, 8000].map((n) => ({ kind: 'chain', L: 100, n, ch: 'A' })),
    ...[2000, 8000].map((n) => ({ kind: 'chain', L: 100, n, ch: '7', sep: '=', from: 2 })),
    ...[20000, 40000, 80000].map((n) => ({ kind: 'chain', L: 340, n, ch: 'A', sep: '=', from: 2 })),
  ],
  win2: [
    ...[40000, 60000, 80000, 100000].map((n) => ({ kind: 'win', n, d: 80, marker: NEL, ws: true, own: true })),
    ...[60000, 80000].map((n) => ({ kind: 'win', n, d: 300, marker: NEL, ws: true, own: true })),
    ...[40000, 60000, 80000].map((n) => ({ kind: 'win', n, d: 300, marker: HALF, ws: true, own: true })),
  ],
  misc: [
    ...[15, 16, 17, 2000, 4000, 8000].map((m) => ({ kind: 'dense', m })),
    ...[1, 16, 17, 400].map((reps) => ({ kind: 'prefix', L: 300, reps })),
    ...['astral', 'mark', 'mixed', 'emoji', 'cjk', 'astralsp'].flatMap((what) => [100000, 200000].map((n) => ({ kind: 'skel', what, n }))),
    { kind: 'win', n: 100000, d: 300, marker: NEL, ws: true, own: true, plain: true },
    { kind: 'win', n: 200000, d: 300, marker: NEL, ws: true, own: true, plain: true },
    { kind: 'win', n: 100000, d: 300, marker: HALF, ws: true, own: true, plain: true },
    { kind: 'chain', L: 200, n: 100000, ch: 'A', plain: true },
    { kind: 'chain', L: 340, n: 200000, ch: 'A', plain: true },
  ],
};
fs.mkdirSync('/home/user/rv2/out', { recursive: true });
const outFile = `/home/user/rv2/out/${batch}.jsonl`;
for (const spec of B[batch] ?? []) {
  for (const repo of ['/home/user/PhysicalTherapy', '/home/user/item39']) {
    const r = spawnSync('flock', ['/tmp/laneb-heavy.lock', 'timeout', String(LIMIT), '/opt/node24/bin/node', '--no-warnings', '/home/user/rv2/case.mts', JSON.stringify(spec)], { env: { ...process.env, REPO: repo }, encoding: 'utf8', maxBuffer: 1 << 24 });
    const line = (r.stdout ?? '').trim().split('\n').at(-1) ?? '';
    const tree = repo.endsWith('item39') ? 'head' : 'base';
    fs.appendFileSync(outFile, `${line.startsWith('{') ? line : JSON.stringify({ tree, spec, failed: r.status === 124 ? `TIMEOUT>${String(LIMIT)}s` : `exit ${String(r.status)} ${String(r.signal)} ${(r.stderr ?? '').slice(-300)}` })}\n`);
  }
}
console.log('done', batch);
