import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { causeText, keyText } from '../pricing/causes';
import { defaultContentRoot, readWebConfig } from '../server/config';
import { fieldChanges } from './queries';

/**
 * The pieces of the release notes and the re-run diffs that hold no database (docs/adr/0037): the
 * fields of a changed rule record, the words for a diff line's cause, and where the console's Rule
 * releases screen finds its content checkout.
 */

describe('the fields of a changed rule record', () => {
  it('lists each differing field in order, before and after, and the end date when it moved', () => {
    expect(fieldChanges({ work_rvu: '0.31', pe_rvu_facility: '0.21', year: 2026 }, { work_rvu: '0.41', pe_rvu_facility: '0.21', year: 2026 }, '2026-12-31', '2026-12-31')).toEqual([
      { field: 'work_rvu', before: '0.31', after: '0.41' },
    ]);
    expect(fieldChanges({ a: '1' }, { b: { c: 2 } }, null, '2026-06-30')).toEqual([
      { field: 'a', before: '1', after: null },
      { field: 'b', before: null, after: '{"c":2}' },
      { field: 'effective_to', before: null, after: '2026-06-30' },
    ]);
    expect(fieldChanges(null, null, null, null)).toEqual([]);
  });
});

describe('the cause of a changed line, in words', () => {
  const version = (sha: string) => ({ sha256: sha.repeat(64), effectiveFrom: '2026-01-01', effectiveTo: null });

  it('says what changed, naming rule records by type and key', () => {
    expect(keyText({ hcpcs: '97110', modifier: '' })).toBe('hcpcs 97110');
    expect(causeText({ kind: 'release_record', recordType: 'pfs_rvu', key: { hcpcs: '97110', modifier: '' }, before: version('a'), after: version('b') })).toBe(
      'The rule record pfs_rvu (hcpcs 97110) changed, aaaaaaaaaaaa… to bbbbbbbbbbbb…',
    );
    expect(causeText({ kind: 'release_record', recordType: 'ncci_mue', key: { hcpcs: '97110' }, before: null, after: version('c') })).toBe('A rule record the line now reads: ncci_mue (hcpcs 97110)');
    expect(causeText({ kind: 'release_record', recordType: 'ncci_mue', key: { hcpcs: '97110' }, before: version('c'), after: null })).toBe('A rule record the line no longer reads: ncci_mue (hcpcs 97110)');
    expect(causeText({ kind: 'mapping', before: { mappingId: 'a', mappingKind: 'no_agreement' }, after: { mappingId: 'b', mappingKind: 'contract' } })).toBe("The plan's mapping: no agreement before, a contract after");
    expect(causeText({ kind: 'mapping', before: { mappingId: null, mappingKind: null }, after: { mappingId: 'b', mappingKind: 'something_new' } })).toBe("The plan's mapping: none before, something_new after");
    expect(causeText({ kind: 'contract_version', before: { contractVersionId: null, rateRecordId: null }, after: { contractVersionId: 'v', rateRecordId: 'r' } })).toBe('A contract version prices the line now');
    expect(causeText({ kind: 'contract_version', before: { contractVersionId: 'v', rateRecordId: 'r' }, after: { contractVersionId: null, rateRecordId: null } })).toBe('No contract version prices the line now');
    expect(causeText({ kind: 'contract_version', before: { contractVersionId: 'v', rateRecordId: 'r' }, after: { contractVersionId: 'w', rateRecordId: 's' } })).toBe('Another contract version or rate record');
    expect(causeText({ kind: 'claim' })).toMatch(/claim's facts/);
    // The fields that differ, the billing ZIP and ZIP+4 with their values (docs/adr/0064).
    expect(causeText({ kind: 'settings', fields: ['zip_plus_four'], before: { zip_plus_four: '1234' }, after: { zip_plus_four: '5678' } })).toBe("The practice's pricing settings: the billing ZIP+4 (1234 → 5678)");
    expect(causeText({ kind: 'settings', fields: ['zip', 'zip_plus_four'], before: { zip: '00011', zip_plus_four: null }, after: { zip: '00012', zip_plus_four: '5000' } })).toBe(
      "The practice's pricing settings: the billing ZIP (00011 → 00012), the billing ZIP+4 (none → 5000)",
    );
    expect(causeText({ kind: 'settings', fields: ['default_rounding', 'place_of_service_settings'], before: {}, after: {} })).toBe("The practice's pricing settings: the default rounding, the places of service");
    expect(causeText({ kind: 'engine', before: 'phase-two/1', after: 'phase-three/1' })).toBe('The engine, phase-two/1 to phase-three/1');
    expect(causeText({ kind: 'claim_lines' })).toMatch(/Another line of the same claim/);
  });
});

describe('the content checkout of the Rule releases screen', () => {
  it('is CONTENT_ROOT, else in development the repository the server runs from, and none in production', () => {
    const base = { DATABASE_URL: 'postgres://tp_app_dev:x@localhost:5432/tp', BILLING_DATABASE_URL: 'postgres://tp_billing_dev:x@localhost:5432/tp' };
    expect(readWebConfig({ ...base, CONTENT_ROOT: '/srv/content' }).contentRoot).toBe('/srv/content');
    const production = {
      ...base,
      NODE_ENV: 'production',
      TP_AUTH_PROVIDER: 'cognito',
      COGNITO_USER_POOL_ID: 'us-east-1_Synthetic',
      COGNITO_CLIENT_ID: 'syntheticclient',
      TP_KEY_PROVIDER: 'kms',
      KMS_KEY_ID: 'alias/tp',
      AUTH_COOKIE_SECRET: Buffer.alloc(32, 1).toString('base64'),
      DOCUMENTS_BUCKET: 'tp-documents',
      DOCUMENTS_KMS_KEY_ID: 'alias/tp',
      TRUSTED_PROXY_HOPS: '1',
      SUPPORT_EMAIL: 'support@synthetic.test',
      SECURITY_EMAIL: 'security@synthetic.test',
      APP_ORIGIN: 'https://app.synthetic.test',
      TP_ENVIRONMENT: 'staging',
      MAIL_VALIDATION: 'ses',
      MAIL_VALIDATION_DAILY_CAP: '50',
    };
    expect(readWebConfig(production).contentRoot).toBeNull();
    const scratch = mkdtempSync(path.join(tmpdir(), 'tp-content-root-test-'));
    try {
      expect(defaultContentRoot(scratch)).toBeNull();
      mkdirSync(path.join(scratch, 'content', 'drafts'), { recursive: true });
      mkdirSync(path.join(scratch, 'apps', 'web'), { recursive: true });
      expect(defaultContentRoot(scratch)).toBe(scratch);
      expect(defaultContentRoot(path.join(scratch, 'apps', 'web'))).toBe(scratch);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
