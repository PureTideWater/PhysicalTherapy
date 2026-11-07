// Runs one reviewer harness with the recorder in place of every redact module. Usage:
//   REC_OUT=<out.jsonl> node harvest-run.mts <harness.mts> [args...]
// Writes nothing but REC_OUT: fs writes are no-ops, console is silenced, cwd is a scratch dir.
import { register, syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
const genDir = path.dirname(new URL(import.meta.url).pathname);
await import('./rec-sink.mts');
register('./hooks.mjs', import.meta.url, { data: { recorder: pathToFileURL(path.join(genDir, 'recorder.mts')).href, genDir: pathToFileURL(genDir).href } });
const noop = () => undefined;
(fs as any).writeFileSync = noop; (fs as any).appendFileSync = noop; (fs as any).mkdirSync = noop;
(fs as any).createWriteStream = () => new Writable({ write(_c, _e, cb) { cb(); } });
syncBuiltinESMExports();
const [harness, ...args] = process.argv.slice(2);
process.argv = [process.argv[0]!, harness!, ...args];
const scratch = path.join(genDir, '..', 'harvest', 'cwd');
process.chdir(fs.existsSync(scratch) ? scratch : genDir);
console.log = noop; console.error = noop; console.warn = noop; console.table = noop;
process.stdout.write = (() => true) as any;
try { await import(pathToFileURL(path.resolve(harness!)).href); } catch (e) { process.exitCode = 3; }
