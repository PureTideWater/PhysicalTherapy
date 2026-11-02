// Local proof for ci-findings-transport: the base notify step against FINDINGS_B64 at the 98,292-byte edge, and the
// proposed step (artifact through a stand-in gh) against the worst-case 41-finding file. Synthetic data only.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const [work] = process.argv.slice(2);
const base = readFileSync(path.join(work, 'base-notify.sh'), 'utf8');
const proposed = readFileSync(path.join(work, 'proposed-notify.sh'), 'utf8');
const handoff = readFileSync(path.join(work, 'proposed-handoff.sh'), 'utf8');
// The download block between its two marker lines, which must be the same text in both jobs.
const block = (script) => { const lines = script.split('\n'); const a = lines.findIndex((l) => l.startsWith('# The download, word for word')); const b = lines.indexOf('# End of the download.'); return a < 0 || b < a ? null : lines.slice(a, b + 1).join('\n'); };
const MAX_BODY = 6000, MAX_TITLE = 256, MAX_FINDINGS = 2 + 3 * 13;
const fileOf = (list) => `${JSON.stringify(list, null, 2)}\n`;
function fakeGh(dir, findings) {
  mkdirSync(path.join(dir, 'bin'), { recursive: true });
  writeFileSync(path.join(dir, 'open.jsonl'), '');
  if (findings !== null) writeFileSync(path.join(dir, "fake-findings.json"), findings);
  writeFileSync(path.join(dir, 'bin/gh'), [
    '#!/usr/bin/env bash', 'set -euo pipefail', 'printf "%s\\n" "$*" | head -c 200 >> "$FAKE_DIR/log"; printf "\\n" >> "$FAKE_DIR/log"',
    'if [ "$1" = api ]; then cat "$FAKE_DIR/open.jsonl"; exit 0; fi',
    'if [ "$1 $2" = "run download" ]; then if [ -f "$FAKE_DIR/fail" ] && [ "$(cat "$FAKE_DIR/fail")" -gt 0 ]; then echo $(( $(cat "$FAKE_DIR/fail") - 1 )) > "$FAKE_DIR/fail"; echo "HTTP 502" >&2; exit 1; fi; [ -f "$FAKE_DIR/fake-findings.json" ] || { echo "no valid artifacts found to download" >&2; exit 1; }; [ "$6" = -D ] || exit 2; mkdir -p "$7"; cp "$FAKE_DIR/fake-findings.json" "$7/findings.json"; exit 0; fi',
    'for arg in "$@"; do if [ "${previous:-}" = --body-file ]; then { cat "$arg"; printf "\\n---\\n"; } >> "$FAKE_DIR/bodies"; fi; previous=$arg; done',
  ].join('\n'), { mode: 0o755 });
}
function run(script, extra, findings) {
  const dir = mkdtempSync(process.env.PROOF_TMP + '/ftp-');
  fakeGh(dir, findings);
  const env = { PATH: `${dir}/bin:/usr/bin:/bin`, GH_REPO: 'owner/repo', GH_TOKEN: 'token', RUN_URL: 'https://github.com/owner/repo/actions/runs/1', GITHUB_REF_NAME: 'claude/build-platform', GITHUB_SHA: 'abc123', GITHUB_RUN_ID: '1', RUNNER_TEMP: path.join(dir, 'temp'), MAX_OPENED: '20', MAX_FILE_BYTES: '2000000', MAX_LISTED: '200', DOWNLOAD_PAUSE: '0', FAKE_DIR: dir, ...extra };
  mkdirSync(env.RUNNER_TEMP);
  const file = path.join(dir, 'step.sh'); writeFileSync(file, script);
  mkdirSync(path.join(dir, "cwd")); const r = spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", file], { cwd: path.join(dir, "cwd"), env, encoding: 'utf8', maxBuffer: 1 << 26 });
  const envBytes = Object.entries(env).reduce((n, [k, v]) => n + Buffer.byteLength(`${k}=${v}`) + 1, 0);
  const longest = Math.max(...Object.entries(env).map(([k, v]) => Buffer.byteLength(`${k}=${v}`) + 1));
  const log = existsSync(path.join(dir, 'log')) ? readFileSync(path.join(dir, 'log'), 'utf8').split('\n').filter(Boolean) : [];
  return { error: r.error?.code, status: r.status, stdout: r.stdout ?? '', envBytes, longest, creates: log.filter((l) => l.startsWith('issue create')).length, last: log.filter((l) => l.startsWith('issue ')).at(-1), log, bodies: existsSync(path.join(dir, 'bodies')) ? readFileSync(path.join(dir, 'bodies'), 'utf8').split('\n---\n').filter(Boolean) : [] };
}
// A findings file of exactly n bytes: one finding whose body pads it.
function fileOfBytes(n) { const shell = fileOf([{ title: 'Finding 0', body: '' }]); return fileOf([{ title: 'Finding 0', body: 'x'.repeat(n - Buffer.byteLength(shell)) }]); }
console.log('1. base notify, FINDINGS_B64 env (83d71fd6 content-calendar.yml:78)');
for (const n of [98_292, 98_293]) {
  const text = fileOfBytes(n);
  const b64 = Buffer.from(text).toString('base64');
  const r = run(base, { CHECK_RESULT: 'success', FINDINGS_B64: b64 }, null);
  console.log(`   file ${Buffer.byteLength(text)} B, base64 ${b64.length} chars, FINDINGS_B64= string ${Buffer.byteLength('FINDINGS_B64=' + b64) + 1} B: ${r.error ? 'bash did not start, ' + r.error : 'started, exit ' + r.status + ', issue creates ' + r.creates}`);
}
console.log('2. proposed notify, artifact through gh run download');
const worst = (i) => ({ title: `${String(i).padStart(2, '0')} ${'\u0001'.repeat(MAX_TITLE - 3)}`, body: '\u0001'.repeat(MAX_BODY) });
const exact = { title: '\u0001'.repeat(MAX_TITLE), body: '\u0001'.repeat(MAX_BODY) };
const cases = {
  'worst case: 41 full-length findings, 6 bytes a unit': fileOf(Array.from({ length: MAX_FINDINGS }, () => exact)),
  'near-worst: 41 findings, 2-digit titles, 6 bytes a unit': fileOf(Array.from({ length: MAX_FINDINGS }, (_, i) => worst(i))),
  'ASCII: 41 findings of 6,000-character bodies': fileOf(Array.from({ length: MAX_FINDINGS }, (_, i) => ({ title: `Finding ${i}`, body: 'x'.repeat(MAX_BODY) }))),
  'just over the old edge: 98,293 bytes': fileOfBytes(98_293),
  'many findings: 400 short ones (not-filed list capped at MAX_LISTED)': fileOf(Array.from({ length: 400 }, (_, i) => ({ title: `Finding ${i}`, body: 'x' }))),
};
for (const [name, text] of Object.entries(cases)) {
  const r = run(proposed, { CHECK_RESULT: 'success' }, text);
  console.log(`   ${name}: file ${Buffer.byteLength(text)} B; ${r.error ? 'did not start ' + r.error : 'exit ' + r.status}; creates ${r.creates}; last ${JSON.stringify(r.last)}; env ${r.envBytes} B, longest string ${r.longest} B; not-filed body ${r.bodies.at(-1)?.length ?? 0} chars, ${(r.bodies.at(-1) ?? '').split('\n').filter((l) => l.startsWith('- ') && !l.startsWith('- and ')).length} titles; tail ${JSON.stringify((r.bodies.at(-1) ?? '').trim().split('\n').at(-1).slice(0, 60))}`);
}
console.log('3. proposed notify, fail closed');
for (const [name, extra, text] of [
  ['no artifact', { CHECK_RESULT: 'success' }, null],
  ['check failed', { CHECK_RESULT: 'failure' }, fileOf([{ title: 'a', body: 'b' }])],
  ['file over MAX_FILE_BYTES', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, fileOf([{ title: 'a', body: 'x'.repeat(200) }])],
  ['not a list', { CHECK_RESULT: 'success' }, '{"title":"x"}'],
]) {
  const r = run(proposed, extra, text);
  console.log(`   ${name}: exit ${r.status}; issues ${JSON.stringify(r.log.filter((l) => l.startsWith('issue ')))}; downloads ${r.log.filter((l) => l.startsWith('run download')).length}`);
}
console.log('4. proposed notify, a download that fails twice, then once more');
for (const fails of [2, 3]) {
  const dir = mkdtempSync(process.env.PROOF_TMP + '/ftp-');
  // run() makes its own dir; emulate by a wrapper env FAKE_FAILS read below
  const r = run(proposed.replace('downloaded=false', `echo ${fails} > "$FAKE_DIR/fail"\ndownloaded=false`), { CHECK_RESULT: 'success' }, fileOf([{ title: 'Finding 1', body: 'Body 1' }]));
  console.log(`   ${fails} failures: exit ${r.status}; downloads ${r.log.filter((l) => l.startsWith('run download')).length}; issues ${JSON.stringify(r.log.filter((l) => l.startsWith('issue ')))}`);
}
console.log('5. proposed handoff job (pull requests), the same download, then the shape check');
console.log(`   download block equal in both scripts: ${block(proposed) !== null && block(proposed) === block(handoff)} (${block(proposed)?.split('\n').length} lines)`);
for (const [name, extra, text] of [
  ['worst case', { CHECK_RESULT: 'success' }, fileOf(Array.from({ length: MAX_FINDINGS }, () => exact))],
  ['no artifact', { CHECK_RESULT: 'success' }, null],
  ['file over MAX_FILE_BYTES', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, fileOf([{ title: 'a', body: 'x'.repeat(200) }])],
  ['not a list', { CHECK_RESULT: 'success' }, '{"title":"x"}'],
]) {
  const r = run(handoff, extra, text);
  const out = r.stdout.trim().split('\n').at(-1) ?? '';
  console.log(`   ${name}: exit ${r.status}; downloads ${r.log.filter((l) => l.startsWith('run download')).length}; issue calls ${r.log.filter((l) => l.startsWith('issue ')).length}; ${out.slice(0, 120)}`);
}
