import { describe, expect, it } from 'vitest';

import { LedgerSettingsError, ledgerSettings, postingTemplateOf, postingTemplateSetting } from './settings';
import { SYNTHETIC_PM_EXPORT_V1 } from './templates';

describe('the ledger’s practice settings (Data dictionary, practice.settings: proof level; PRD 20)', () => {
  it('proves by posting with no template mapped when nothing is set', () => {
    expect(ledgerSettings({})).toEqual({ proofLevel: 'posted', postingTemplate: null });
    expect(ledgerSettings(null)).toEqual({ proofLevel: 'posted', postingTemplate: null });
    expect(ledgerSettings({ line_materiality_cents: '500' })).toEqual({ proofLevel: 'posted', postingTemplate: null });
  });

  it('reads the proof level and a built-in or practice template', () => {
    expect(ledgerSettings({ proof_level: 'deposited', posting_export_template: { template: 'synthetic_pm_export_v1' } })).toEqual({ proofLevel: 'deposited', postingTemplate: SYNTHETIC_PM_EXPORT_V1 });
    const own = { system: 'SYNTHETIC OTHER PM', columns: { posted_on: 'Posted', check_or_trace: 'Check', amount: 'Amount' }, date_format: 'YYYY-MM-DD' };
    expect(ledgerSettings({ posting_export_template: own }).postingTemplate).toEqual({ id: 'practice', system: 'SYNTHETIC OTHER PM', columns: own.columns, dateFormat: 'YYYY-MM-DD' });
  });

  it('refuses a malformed setting by its key, never replacing it with a default', () => {
    expect(() => ledgerSettings({ proof_level: 'approved' })).toThrow(new LedgerSettingsError('proof_level'));
    for (const template of [
      'synthetic_pm_export_v1',
      { template: 'no_such_template' },
      { template: 'synthetic_pm_export_v1', system: 'x' },
      { system: 'S', columns: { posted_on: 'P', check_or_trace: 'C', amount: 'A' } },
      { system: 7, columns: {}, date_format: 'YYYY-MM-DD' },
      { system: 'S', columns: [], date_format: 'YYYY-MM-DD' },
      { system: 'S', columns: {}, date_format: 'DD.MM.YYYY' },
      { system: 'S', columns: { posted_on: 'P' }, date_format: 'YYYY-MM-DD' },
    ]) {
      expect(() => ledgerSettings({ posting_export_template: template })).toThrow(new LedgerSettingsError('posting_export_template'));
    }
    expect(() => postingTemplateOf(null)).toThrow(LedgerSettingsError);
  });

  it('stores a built-in template by its ID and a practice’s own by its mapping, and reads both back', () => {
    expect(postingTemplateSetting(SYNTHETIC_PM_EXPORT_V1)).toEqual({ template: 'synthetic_pm_export_v1' });
    const own = postingTemplateOf({ system: 'S', columns: { posted_on: 'P', check_or_trace: 'C', amount: 'A' }, date_format: 'MM/DD/YYYY' });
    expect(postingTemplateOf(postingTemplateSetting(own))).toEqual(own);
  });
});
