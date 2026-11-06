// Local proof for ci-findings-transport: the base notify step against FINDINGS_B64 at the 98,292-byte edge, and the
// built notify and handoff steps (extracted from the workflow by extract.mjs; the artifact through a stand-in gh)
// against the worst-case 41-finding file and the download's failure modes. Synthetic data only.
//
// The stand-in gh, as gh 2.89 and 2.103 behave where it matters: `run download` downloads, then extracts with O_EXCL,
// so it refuses a findings.json already in its -D directory; a try can fail before writing (HTTP 502), after writing a
// cut findings.json (a zip checksum error), or stall (a sleep past DOWNLOAD_LIMIT, after writing a cut file); its
// output and every error name a synthetic signed address, as gh's blob errors do. A try can also die of SIGKILL at
// once (kill), or ignore the stop and wait to be killed 10 seconds later under timeout -k 10 (ignore): either way
// timeout dies of the signal, the try exits 137 and bash reports it "Killed" with its command line. A `sleep` beside it
// logs each pause and returns at once; the stall waits with /bin/sleep.
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
const SIGNED = 'https://blob.example.invalid/findings.zip?se=2026-11-04T21%3A40%3A56Z&sig=synthetic-signature';
const fileOf = (list) => `${JSON.stringify(list, null, 2)}\n`;
function fakeGh(dir, findings, mode) {
  mkdirSync(path.join(dir, 'bin'), { recursive: true });
  writeFileSync(path.join(dir, 'open.jsonl'), '');
  if (findings !== null) writeFileSync(path.join(dir, 'fake-findings.json'), findings);
  for (const [key, value] of Object.entries(mode)) writeFileSync(path.join(dir, key), String(value));
  writeFileSync(path.join(dir, 'bin/gh'), [
    '#!/usr/bin/env bash', 'set -euo pipefail', 'printf "%s\\n" "$*" | head -c 200 >> "$FAKE_DIR/log"; printf "\\n" >> "$FAKE_DIR/log"',
    'if [ "$1" = api ]; then cat "$FAKE_DIR/open.jsonl"; exit 0; fi',
    'count() { cat "$FAKE_DIR/$1" 2>/dev/null || echo 0; }',
    'cut() { mkdir -p "$1"; head -c 5 "$FAKE_DIR/fake-findings.json" > "$1/findings.json"; }',
    'if [ "$1 $2" = "run download" ]; then',
    `  echo "downloading from ${SIGNED}"; [ "$6" = -D ] || exit 2; dest="$7"; name=$(cat "$FAKE_DIR/name" 2>/dev/null || echo findings.json)`,
    '  if [ "$(count kill)" -gt 0 ]; then echo $(( $(count kill) - 1 )) > "$FAKE_DIR/kill"; kill -9 $$; fi',
    '  if [ "$(count ignore)" -gt 0 ]; then echo $(( $(count ignore) - 1 )) > "$FAKE_DIR/ignore"; trap "" TERM; exec /bin/sleep 30; fi',
    '  if [ "$(count stall)" -gt 0 ]; then echo $(( $(count stall) - 1 )) > "$FAKE_DIR/stall"; if [ -f "$FAKE_DIR/fake-findings.json" ] && [ ! -e "$dest/findings.json" ]; then cut "$dest"; fi; exec /bin/sleep 30; fi',
    `  if [ "$(count fail)" -gt 0 ]; then echo $(( $(count fail) - 1 )) > "$FAKE_DIR/fail"; echo "error downloading findings: Get \\"${SIGNED}\\": HTTP 502" >&2; exit 1; fi`,
    '  [ -f "$FAKE_DIR/fake-findings.json" ] || { echo "no valid artifacts found to download" >&2; exit 1; }',
    `  if [ -e "$dest/findings.json" ]; then echo "error downloading findings: error extracting \\"findings.json\\": open $dest/findings.json: file exists" >&2; exit 1; fi`,
    `  if [ "$(count partial)" -gt 0 ]; then echo $(( $(count partial) - 1 )) > "$FAKE_DIR/partial"; cut "$dest"; echo "error downloading findings: ${SIGNED}: zip: checksum error" >&2; exit 1; fi`,
    '  mkdir -p "$dest"; cp "$FAKE_DIR/fake-findings.json" "$dest/$name"; exit 0',
    'fi',
    'for arg in "$@"; do if [ "${previous:-}" = --body-file ]; then { cat "$arg"; printf "\\n---\\n"; } >> "$FAKE_DIR/bodies"; fi; previous=$arg; done',
  ].join('\n'), { mode: 0o755 });
  writeFileSync(path.join(dir, 'bin/sleep'), ['#!/usr/bin/env bash', 'printf "sleep %s\\n" "$*" >> "$FAKE_DIR/log"'].join('\n'), { mode: 0o755 });
}
function run(script, extra, findings, mode = {}) {
  const dir = mkdtempSync('/tmp/ftp-');
  fakeGh(dir, findings, mode);
  const env = { PATH: `${dir}/bin:/usr/bin:/bin`, GH_REPO: 'owner/repo', GH_TOKEN: 'token', RUN_URL: 'https://github.com/owner/repo/actions/runs/1', GITHUB_REF_NAME: 'claude/build-platform', GITHUB_SHA: 'abc123', GITHUB_RUN_ID: '1', RUNNER_TEMP: path.join(dir, 'temp'), MAX_OPENED: '20', MAX_FILE_BYTES: '2000000', MAX_LISTED: '200', DOWNLOAD_PAUSE: '10', DOWNLOAD_LIMIT: '60', FAKE_DIR: dir, ...extra };
  mkdirSync(env.RUNNER_TEMP);
  const file = path.join(dir, 'step.sh'); writeFileSync(file, script);
  mkdirSync(path.join(dir, "cwd")); const r = spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", file], { cwd: path.join(dir, "cwd"), env, encoding: 'utf8', maxBuffer: 1 << 26 });
  const envBytes = Object.entries(env).reduce((n, [k, v]) => n + Buffer.byteLength(`${k}=${v}`) + 1, 0);
  const longest = Math.max(...Object.entries(env).map(([k, v]) => Buffer.byteLength(`${k}=${v}`) + 1));
  const log = existsSync(path.join(dir, 'log')) ? readFileSync(path.join(dir, 'log'), 'utf8').split('\n').filter(Boolean) : [];
  const output = (r.stdout ?? '') + (r.stderr ?? '');
  return { error: r.error?.code, status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', output, envBytes, longest, creates: log.filter((l) => l.startsWith('issue create')).length, last: log.filter((l) => l.startsWith('issue ')).at(-1), log, bodies: existsSync(path.join(dir, 'bodies')) ? readFileSync(path.join(dir, 'bodies'), 'utf8').split('\n---\n').filter(Boolean) : [] };
}
const downloads = (r) => r.log.filter((l) => l.startsWith('run download')).length;
const paced = (r) => r.log.filter((l) => l.startsWith('run download') || l.startsWith('sleep ')).map((l) => (l.startsWith('run download') ? 'try' : l)).join(', ');
// Lines of the step's stderr other than its own "content-calendar: " lines (bash's report of a killed try among them).
const stray = (r) => r.stderr.split('\n').filter((l) => l !== '' && !l.startsWith('content-calendar: '));
const tries = (r) => r.output.split('\n').filter((l) => l.startsWith('content-calendar: try ')).map((l) => l.replace('content-calendar: ', ''));
const leaks = (r) => /blob\.example\.invalid|sig=/.test(r.output);
const issues = (r) => JSON.stringify(r.log.filter((l) => l.startsWith('issue ')));
// A findings file of exactly n bytes: one finding whose body pads it.
function fileOfBytes(n) { const shell = fileOf([{ title: 'Finding 0', body: '' }]); return fileOf([{ title: 'Finding 0', body: 'x'.repeat(n - Buffer.byteLength(shell)) }]); }
const compactOfBytes = (n) => JSON.stringify([{ title: 'Finding 1', body: 'x'.repeat(n - JSON.stringify([{ title: 'Finding 1', body: '' }]).length) }]);
console.log('1. base notify, FINDINGS_B64 env (83d71fd6 content-calendar.yml:78)');
for (const n of [98_292, 98_293]) {
  const text = fileOfBytes(n);
  const b64 = Buffer.from(text).toString('base64');
  const r = run(base, { CHECK_RESULT: 'success', FINDINGS_B64: b64 }, null);
  console.log(`   file ${Buffer.byteLength(text)} B, base64 ${b64.length} chars, FINDINGS_B64= string ${Buffer.byteLength('FINDINGS_B64=' + b64) + 1} B: ${r.error ? 'bash did not start, ' + r.error : 'started, exit ' + r.status + ', issue creates ' + r.creates}`);
}
console.log('2. built notify, artifact through gh run download');
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
  console.log(`   ${name}: file ${Buffer.byteLength(text)} B; ${r.error ? 'did not start ' + r.error : 'exit ' + r.status}; creates ${r.creates}; last ${JSON.stringify(r.last)}; env ${r.envBytes} B, longest string ${r.longest} B; signed address in the log: ${leaks(r)}; not-filed body ${r.bodies.at(-1)?.length ?? 0} chars, ${(r.bodies.at(-1) ?? '').split('\n').filter((l) => l.startsWith('- ') && !l.startsWith('- and ')).length} titles; tail ${JSON.stringify((r.bodies.at(-1) ?? '').trim().split('\n').at(-1).slice(0, 60))}`);
}
console.log('3. built notify, fail closed');
for (const [name, extra, text, mode] of [
  ['no artifact', { CHECK_RESULT: 'success' }, null, {}],
  ['check failed', { CHECK_RESULT: 'failure' }, fileOf([{ title: 'a', body: 'b' }]), {}],
  ['file over MAX_FILE_BYTES', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, fileOf([{ title: 'a', body: 'x'.repeat(200) }]), {}],
  ['one byte over MAX_FILE_BYTES (101 B, bound 100)', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, compactOfBytes(101), {}],
  ['a list padded with whitespace past MAX_FILE_BYTES', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, JSON.stringify([{ title: 'Finding 1', body: 'b' }]) + ' '.repeat(200), {}],
  ['a list followed by other bytes past MAX_FILE_BYTES', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, JSON.stringify([{ title: 'Finding 1', body: 'b' }]) + 'x'.repeat(200), {}],
  ['not a list', { CHECK_RESULT: 'success' }, '{"title":"x"}', {}],
  ['an entry with no body', { CHECK_RESULT: 'success' }, '[{"title":"x"}]', {}],
  ['two JSON documents in one file, a list then []', { CHECK_RESULT: 'success' }, '[{"title":"a","body":"b"}]\n[]', {}],
  ['an artifact holding no findings.json', { CHECK_RESULT: 'success' }, fileOf([{ title: 'a', body: 'b' }]), { name: 'other.txt' }],
]) {
  const r = run(proposed, extra, text, mode);
  console.log(`   ${name}: exit ${r.status}; issues ${issues(r)}; downloads ${downloads(r)}; signed address in the log: ${leaks(r)}`);
}
console.log('   exactly MAX_FILE_BYTES (100 B, bound 100): ' + (() => { const r = run(proposed, { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, compactOfBytes(100)); return `exit ${r.status}; issues ${issues(r)}; downloads ${downloads(r)}; signed address in the log: ${leaks(r)}`; })());
console.log('4. built notify, the download as built: three tries, DOWNLOAD_PAUSE 10 s apart, each stopped after DOWNLOAD_LIMIT');
for (const [name, extra, mode] of [
  ['2 failures (HTTP 502)', {}, { fail: 2 }],
  ['3 failures', {}, { fail: 3 }],
  ['a try that leaves a cut findings.json (zip checksum error)', {}, { partial: 1 }],
  ['1 stall (DOWNLOAD_LIMIT 1)', { DOWNLOAD_LIMIT: '1' }, { stall: 1 }],
  ['3 stalls (DOWNLOAD_LIMIT 1)', { DOWNLOAD_LIMIT: '1' }, { stall: 3 }],
  ['1 try killed by SIGKILL at once', {}, { kill: 1 }],
  ['1 try that ignores the stop, killed 10 s later (DOWNLOAD_LIMIT 1)', { DOWNLOAD_LIMIT: '1' }, { ignore: 1 }],
]) {
  const r = run(proposed, { CHECK_RESULT: 'success', ...extra }, fileOf([{ title: 'Finding 1', body: 'Body 1' }]), mode);
  console.log(`   ${name}: exit ${r.status}; ${paced(r)}; logged ${JSON.stringify(tries(r))}; other stderr lines ${stray(r).length}; signed address in the log: ${leaks(r)}; "file exists": ${r.output.includes('file exists')}; issues ${issues(r)}`);
}
{
  // The same partial try with the per-try clearing removed: what the clearing prevents.
  const lines = proposed.split('\n');
  const cleared = lines.filter((l) => l.trim() !== 'rm -rf "$RUNNER_TEMP/findings"').join('\n');
  const r = run(cleared, { CHECK_RESULT: 'success' }, fileOf([{ title: 'Finding 1', body: 'Body 1' }]), { partial: 1 });
  console.log(`   (counter-proof) the partial try with the per-try clearing removed (${lines.length - cleared.split('\n').length} line): exit ${r.status}; ${paced(r)}; issues ${issues(r)}`);
}
{
  // The killed try with the try run outside its group, as at 14e71f0c…: what the group's own redirect prevents.
  const group = '{ timeout -k 10 "$DOWNLOAD_LIMIT" gh run download "$GITHUB_RUN_ID" -n findings -D "$RUNNER_TEMP/findings"; } > /dev/null 2>&1 || code=$?';
  const bare = 'timeout -k 10 "$DOWNLOAD_LIMIT" gh run download "$GITHUB_RUN_ID" -n findings -D "$RUNNER_TEMP/findings" > /dev/null 2>&1 || code=$?';
  if (!proposed.includes(group)) throw new Error('the download line is not the group form');
  const r = run(proposed.replace(group, bare), { CHECK_RESULT: 'success' }, fileOf([{ title: 'Finding 1', body: 'Body 1' }]), { kill: 1 });
  console.log(`   (counter-proof) the killed try outside its group: exit ${r.status}; logged ${JSON.stringify(tries(r))}; other stderr lines ${stray(r).length}: ${JSON.stringify(stray(r).map((l) => l.replace(/^.*?: line \d+: +\d+ /, '<step>: line N: PID ')))}`);
}
console.log('5. built handoff job (pull requests), the same download and read check, then its branch');
console.log(`   download block equal in both scripts: ${block(proposed) !== null && block(proposed) === block(handoff)} (${block(proposed)?.split('\n').length} lines); read check inside it: ${block(proposed)?.includes('jq -e') === true}; jq -e after it in either job: ${[proposed, handoff].some((s) => s.split('# End of the download.')[1]?.includes('jq -e'))}`);
for (const [name, extra, text, mode] of [
  ['worst case', { CHECK_RESULT: 'success' }, fileOf(Array.from({ length: MAX_FINDINGS }, () => exact)), {}],
  ['exactly MAX_FILE_BYTES (100 B, bound 100)', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, compactOfBytes(100), {}],
  ['a cut file left by a try, then the artifact', { CHECK_RESULT: 'success' }, fileOf([{ title: 'a', body: 'b' }]), { partial: 1 }],
  ['1 stall (DOWNLOAD_LIMIT 1), then the artifact', { CHECK_RESULT: 'success', DOWNLOAD_LIMIT: '1' }, fileOf([{ title: 'a', body: 'b' }]), { stall: 1 }],
  ['1 try killed by SIGKILL, then the artifact', { CHECK_RESULT: 'success' }, fileOf([{ title: 'a', body: 'b' }]), { kill: 1 }],
  ['no artifact', { CHECK_RESULT: 'success' }, null, {}],
  ['file over MAX_FILE_BYTES', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, fileOf([{ title: 'a', body: 'x'.repeat(200) }]), {}],
  ['one byte over MAX_FILE_BYTES', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, compactOfBytes(101), {}],
  ['a list padded with whitespace past MAX_FILE_BYTES', { CHECK_RESULT: 'success', MAX_FILE_BYTES: '100' }, JSON.stringify([{ title: 'Finding 1', body: 'b' }]) + ' '.repeat(200), {}],
  ['not a list', { CHECK_RESULT: 'success' }, '{"title":"x"}', {}],
  ['an entry with no body', { CHECK_RESULT: 'success' }, '[{"title":"x"}]', {}],
  ['two JSON documents in one file, [{"title":1}] then []', { CHECK_RESULT: 'success' }, '[{"title":1}] []', {}],
  ['an artifact holding no findings.json', { CHECK_RESULT: 'success' }, fileOf([{ title: 'a', body: 'b' }]), { name: 'other.txt' }],
  ['3 stalls (DOWNLOAD_LIMIT 1)', { CHECK_RESULT: 'success', DOWNLOAD_LIMIT: '1' }, fileOf([{ title: 'a', body: 'b' }]), { stall: 3 }],
]) {
  const r = run(handoff, extra, text, mode);
  const out = (r.status === 0 ? r.stdout : r.stderr).trim().split('\n').at(-1) ?? '';
  console.log(`   ${name}: exit ${r.status}; ${paced(r)}; other stderr lines ${stray(r).length}; issue calls ${r.log.filter((l) => l.startsWith('issue ')).length}; signed address in the log: ${leaks(r)}; ${out.slice(0, 120)}`);
}
