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
} else if (behaviour === 'abort') {
  // SIGABRT without V8's out-of-memory line: the reader's own crash.
  process.abort();
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
} else if (behaviour.startsWith('header ')) {
  // One page frame whose header claims the length named, then up to 4 MiB of its body, a mebibyte at a time.
  const length = Number.parseInt(behaviour.slice('header '.length), 10);
  const header = Buffer.alloc(5);
  header.writeUInt8(1, 0);
  header.writeUInt32BE(length, 1);
  await write(header);
  for (let sent = 0; sent < Math.min(length, 4 * 1024 * 1024); sent += 1024 * 1024) {
    await write(Buffer.alloc(Math.min(1024 * 1024, length - sent), 0x78));
  }
  await write(frame(2, '0'));
  process.exit(0);
} else if (behaviour === 'done-exit-1') {
  await write(frame(1, 'SYNTHETIC PAGE'));
  await write(frame(2, '0'));
  process.exit(1);
} else if (behaviour === 'page-done-extra') {
  await write(frame(1, 'SYNTHETIC PAGE'));
  await write(frame(2, '0'));
  await write(frame(1, 'SYNTHETIC PAGE AFTER THE REPLY'));
  process.exit(0);
} else if (behaviour.startsWith('many ')) {
  // That many page frames and done in one write, then an exit as soon as the kernel has them: the last frames are still
  // in the pipe when the process has exited, so only a parent that waits for close has them all.
  const count = Number.parseInt(behaviour.slice('many '.length), 10);
  const frames: Buffer[] = [];
  for (let page = 0; page < count; page += 1) {
    frames.push(frame(1, `SYNTHETIC PAGE ${String(page)} ${'x'.repeat(1000)}`));
  }
  frames.push(frame(2, '0'));
  await write(Buffer.concat(frames));
  process.exit(0);
} else if (behaviour.startsWith('late-done-hang ') || behaviour.startsWith('late-done-exit ')) {
  // A page and done that many milliseconds after the request, then a hang (a reader that replies close to its deadline
  // and lingers) or an exit at once (one whose reply and exit come while the parent's loop is held).
  const delay = Number.parseInt(behaviour.slice(behaviour.lastIndexOf(' ') + 1), 10);
  await new Promise((resolve) => setTimeout(resolve, delay));
  await write(Buffer.concat([frame(1, 'SYNTHETIC LATE PAGE'), frame(2, '0')]));
  if (behaviour.startsWith('late-done-exit ')) {
    process.exit(0);
  }
  setInterval(() => undefined, 1000);
} else if (behaviour === 'silent') {
  setInterval(() => undefined, 1000);
} else if (behaviour === 'done-hang' || behaviour === 'refused-hang' || behaviour === 'done-grow') {
  // A reader a document compromised: a well-formed last frame, then it neither exits nor stays small.
  if (behaviour === 'refused-hang') {
    await write(frame(3, 'unsupported_document'));
  } else {
    await write(frame(1, 'SYNTHETIC PAGE'));
    await write(frame(2, '0'));
  }
  const held: Buffer[] = [];
  setInterval(() => {
    if (behaviour === 'done-grow') {
      // Off the V8 heap, so its own heap flag does not stop it.
      held.push(Buffer.alloc(32 * 1024 * 1024, 1));
    }
  }, 20);
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
