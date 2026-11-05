import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';

/**
 * A stand-in for the page reader (pages.test.ts): it speaks the reader's frames (page-reader.ts: a type byte, a 4-byte
 * big-endian length, the UTF-8 body; 0 ready, 1 page, 2 done) and then does what its request's SYNTHETIC text names, so
 * the parent's handling of a reader that crashes, floods, misbehaves or looks around is tested through the real spawn,
 * flags and limits. It imports nothing of the repository, so Node runs it as written (type stripping).
 */

function frame(type: number, body = ''): Buffer {
  const text = Buffer.from(body, 'utf8');
  const header = Buffer.alloc(5);
  header.writeUInt8(type, 0);
  header.writeUInt32BE(text.length, 1);
  return Buffer.concat([header, text]);
}

function write(data: Buffer): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write(data, () => {
      resolve();
    });
  });
}

async function requestText(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const all = Buffer.concat(chunks);
  return all.subarray(4 + all.readUInt32BE(0)).toString('utf8');
}

/** The error code an action fails with under the reader's flags, or 'allowed'. */
function attempt(action: () => unknown): string {
  try {
    action();
    return 'allowed';
  } catch (error) {
    return (error as { code?: string }).code ?? 'failed';
  }
}

await write(frame(0));
const behaviour = (await requestText()).trim();
if (behaviour === 'exit-3') {
  process.exit(3);
} else if (behaviour === 'segv') {
  process.kill(process.pid, 'SIGSEGV');
} else if (behaviour === 'malformed') {
  await write(frame(9, 'x'));
} else if (behaviour === 'oom') {
  const held: unknown[] = [];
  for (;;) {
    held.push({ index: held.length, text: `SYNTHETIC ${String(held.length)}` });
  }
} else if (behaviour === 'flood') {
  for (;;) {
    await write(frame(1, 'x'.repeat(1000)));
  }
} else if (behaviour === 'silent') {
  setInterval(() => undefined, 1000);
} else if (behaviour === 'inspect') {
  const seen = {
    env: Object.keys(process.env),
    argv: process.argv,
    execArgv: process.execArgv,
    write: attempt(() => {
      writeFileSync('/tmp/tp-page-reader-probe', 'x');
    }),
    environ: attempt(() => readFileSync('/proc/self/environ')),
    etc: attempt(() => readFileSync('/etc/hostname')),
    spawn: attempt(() => spawnSync('/bin/true')),
    worker: attempt(() => new Worker('0', { eval: true })),
    addon: attempt(() => {
      process.dlopen({ exports: {} }, '/nonexistent.node');
    }),
  };
  await write(frame(1, JSON.stringify(seen)));
  await write(frame(2, '0'));
  process.exit(0);
}
