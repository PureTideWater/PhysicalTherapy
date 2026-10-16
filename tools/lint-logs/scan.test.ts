import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import fc from 'fast-check';
import { ALLOWED_LOG_FIELDS } from '@tp/observability';
import { afterEach, describe, expect, it } from 'vitest';

import { isTestFile, listSourceFiles, scanRepository, scanSource } from './scan';

const messages = (code: string) => scanSource('example.ts', code).map((violation) => violation.message);

describe('scanSource (property)', () => {
  const words = fc.stringMatching(/^[a-z ]{1,30}$/);

  it('accepts any fixed message with allowlisted ID fields, and refuses any message holding nine digits', () => {
    fc.assert(
      fc.property(words, fc.stringMatching(/^\d{9,12}$/), words, (before, digits, after) => {
        expect(messages(`logger.info('${before}', { practice_id: practiceId, job_id: jobId });`)).toEqual([]);
        expect(messages(`logger.info('${before}${digits}${after}');`)).toEqual([expect.stringContaining('nine or more digits')]);
      }),
    );
  });

  it('refuses every interpolated message, whatever it interpolates', () => {
    fc.assert(
      fc.property(words, fc.constantFrom('id', 'name', 'value', 'job.id'), (text, expression) => {
        expect(messages(`logger.warn(\`${text}\${${expression}}\`);`)).toEqual([expect.stringContaining('log messages are fixed text')]);
      }),
    );
  });
});

describe('scanSource', () => {
  it.each([
    "logger.info('job started', { practice_id: practiceId, job_id: job.id });",
    "logger.info('job started', { practice_id });",
    "context.logger.warn('retrying', { 'job_type': 'parse_835', release_no: 1 });",
    "this.logger.error('failed', { error_code: 'EDI_SYNTAX' });",
    'jobLogger.debug(`fixed text`);',
    "logger.child({ practice_id }).info('scoped');",
    "createLogger({ base: { worker_id: randomUUID() } });",
    "console.log('static text only');",
  ])('accepts %s', (code) => {
    expect(messages(code)).toEqual([]);
  });

  it.each([
    ['logger.info("x", { patient_name: name });', /"patient_name" looks like a name/],
    ['logger.info("x", { first_name });', /looks like a name/],
    ['log.warn("x", { dob: value });', /looks like a date of birth/],
    ['logger.error("x", { member_id: m });', /looks like a member ID/],
    ['logger.error("x", { claim_number: c });', /looks like a claim number/],
    ['logger.error("x", { patient_control_number: c });', /looks like a claim number/],
    ['logger.info("x", { document_text: t });', /looks like a document text/],
    ['logger.info("x", { "member_id": m });', /looks like a member ID/],
    ['console.log({ dob });', /looks like a date of birth/],
    ['logger.child({ member_id: m });', /looks like a member ID/],
    ['logger.child({ practice_id }).info("x", { last_name: n });', /looks like a name/],
    ['createLogger({ base: { insured_name: n } });', /looks like a name/],
  ])('refuses a forbidden field in %s', (code, expected) => {
    expect(messages(code)).toEqual([expect.stringMatching(expected)]);
  });

  it('accepts every field on the allowlist, the tenancy and audit IDs included', () => {
    expect(ALLOWED_LOG_FIELDS).toEqual(expect.arrayContaining(['organization_id', 'grant_id', 'support_grant_id', 'agreement_id', 'audit_event_id', 'restore_drill_id']));
    for (const field of ALLOWED_LOG_FIELDS) {
      expect(messages(`logger.info('x', { ${field}: value });`), field).toEqual([]);
    }
  });

  it('refuses a field that is not on the allowlist', () => {
    expect(messages('logger.info("x", { amount_cents: 100n });')).toEqual([
      expect.stringMatching(/"amount_cents" is not on the allowlist/),
    ]);
  });

  it('refuses fields it cannot check', () => {
    expect(messages('logger.info("x", { ...fields });')).toEqual([expect.stringMatching(/spread/)]);
    expect(messages('logger.info("x", { [key]: 1 });')).toEqual([expect.stringMatching(/computed/)]);
    expect(messages('logger.info("x", { practice_id() { return 1; } });')).toEqual([
      expect.stringMatching(/plain properties/),
    ]);
    expect(messages('logger.info("x", { practice_id: { nested: 1 } });')).toEqual([
      expect.stringMatching(/single value/),
    ]);
    expect(messages('logger.info("x", { job_id: ["a"] });')).toEqual([expect.stringMatching(/single value/)]);
  });

  it('refuses arguments that are not fixed text or a field object', () => {
    expect(messages('logger.error(error);')).toEqual([expect.stringMatching(/fixed text or an object literal/)]);
    expect(messages('console.error("failed", error.message);')).toEqual([
      expect.stringMatching(/fixed text or an object literal/),
    ]);
    expect(messages('logger.info(`claim ${claimNumber}`);')).toEqual([expect.stringMatching(/interpolating/)]);
  });

  it('refuses nine-digit runs in log text and field values', () => {
    expect(messages('logger.info("member 123456789");')).toEqual([expect.stringMatching(/nine or more digits/)]);
    expect(messages('logger.info("x", { request_id: "1234567890" });')).toEqual([
      expect.stringMatching(/nine or more digits/),
    ]);
    expect(messages('logger.info("batch 12345678");')).toEqual([]);
  });

  it('ignores calls that are not logging', () => {
    expect(messages('Math.log(5); list.info({ name }); boss.on("error", handler); createThing({ base: { name } });')).toEqual(
      [],
    );
  });

  it('reports the line and column of each violation', () => {
    expect(scanSource('a.ts', '\n  logger.info("x", { dob });')).toEqual([
      { file: 'a.ts', line: 2, column: 22, message: expect.stringMatching(/date of birth/) as string },
    ]);
  });

  it('parses TSX', () => {
    expect(scanSource('a.tsx', 'const a = <div onClick={() => logger.info("x", { dob })} />;')).toHaveLength(1);
  });
});

describe('repository scan', () => {
  let root: string | undefined;

  afterEach(() => {
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('recognizes test files', () => {
    expect(isTestFile('a.test.ts')).toBe(true);
    expect(isTestFile('a.db.test.ts')).toBe(true);
    expect(isTestFile('smoke.spec.ts')).toBe(true);
    expect(isTestFile('states.test.tsx')).toBe(true);
    expect(isTestFile('testing.ts')).toBe(false);
  });

  it('scans source files, skipping tests, build output and dependencies', () => {
    root = mkdtempSync(path.join(tmpdir(), 'lint-logs-'));
    const write = (file: string, text: string) => {
      mkdirSync(path.dirname(path.join(root ?? '', file)), { recursive: true });
      writeFileSync(path.join(root ?? '', file), text);
    };
    write('packages/a/src/bad.ts', 'logger.info("x", { member_id: m });\n');
    write('packages/a/src/good.ts', 'logger.info("x", { practice_id });\n');
    write('packages/a/src/types.d.ts', 'declare const x: number;\n');
    write('packages/a/src/bad.test.ts', 'logger.info("x", { member_id: m });\n');
    write('packages/a/node_modules/dep/index.js', 'console.log(secret);\n');
    write('apps/web/.next/server.js', 'console.log(secret);\n');
    write('apps/web/README.md', 'logger.info(x)\n');
    expect(listSourceFiles(root)).toEqual([path.join('packages', 'a', 'src', 'bad.ts'), path.join('packages', 'a', 'src', 'good.ts')]);
    const { files, violations } = scanRepository(root);
    expect(files).toBe(2);
    expect(violations).toEqual([expect.objectContaining({ file: path.join('packages', 'a', 'src', 'bad.ts'), line: 1 })]);
  });

  it('passes over a scan root that does not exist', () => {
    root = mkdtempSync(path.join(tmpdir(), 'lint-logs-'));
    expect(scanRepository(root)).toEqual({ files: 0, violations: [] });
  });

  // It walks the whole repository, which grows with every milestone: about a second alone, longer
  // beside the rest of the suite under coverage.
  it('finds nothing to fix in this repository', () => {
    const repository = path.resolve(import.meta.dirname, '../..');
    expect(scanRepository(repository).violations).toEqual([]);
  }, 30_000);
});
