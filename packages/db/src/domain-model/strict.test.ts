import { describe, expect, it } from 'vitest';

import { compareWithDictionary, explain, parseDictionary } from './dictionary';
import { type Model, type PolicyModel, type TableModel, areaProblems } from './model';
import { type Area, type Explanations } from './sources';

/**
 * What the domain model refuses before it writes a line (CO-02): a table the area map does not place
 * (always, so a migration that adds a table cannot pass unnoticed), and under --strict a divergence
 * with no reviewed explanation or an explanation that has gone stale.
 */
function tableModel(name: string, overrides: Partial<TableModel> = {}): TableModel {
  return {
    name,
    isView: false,
    owner: 'tp_owner',
    options: null,
    rls: false,
    forced: false,
    classification: 'global (no practice_id, no RLS)',
    practiceId: null,
    registry: null,
    tenantPolicyOk: null,
    createdBy: '20261015120000_rule_content.sql',
    createdOutside: null,
    touchedBy: [],
    columns: [],
    primaryKey: ['id'],
    uniques: [],
    foreignKeys: [],
    checks: [],
    exclusions: [],
    indexes: [],
    policies: [],
    triggers: [],
    privileges: {},
    columnGrants: [],
    view: null,
    ...overrides,
  };
}

function modelOf(tables: readonly TableModel[]): Model {
  return { tables, byName: new Map(tables.map((t) => [t.name, t])), functions: [], rolesWithTablePrivileges: [] };
}

const area = (id: string, tables: readonly string[]): Area => ({ id, title: id, dictionary: '-', about: '-', tables });

const policy = (name: string): PolicyModel => ({ name, command: 'ALL', permissive: true, roles: ['tp_app'], using: 'true', withCheck: null });

describe('the area map', () => {
  const model = modelOf([tableModel('payer'), tableModel('remittance')]);

  it('places every relation in exactly one area', () => {
    const { areaOf, problems } = areaProblems([area('payers', ['payer']), area('remittances', ['remittance'])], model);
    expect(problems).toEqual([]);
    expect(areaOf.get('remittance')?.id).toBe('remittances');
  });

  it('refuses a table no area places, as a migration that adds one without placing it', () => {
    expect(areaProblems([area('payers', ['payer'])], model).problems).toEqual(['remittance is in no area: add it to packages/db/domain-model/areas.json']);
  });

  it('refuses a table in two areas, and an area naming a table the database does not have', () => {
    expect(areaProblems([area('payers', ['payer', 'remittance']), area('remittances', ['remittance', 'gate_probe'])], model).problems).toEqual([
      'remittance is in two areas (payers, remittances)',
      'gate_probe is in area remittances but not in the database',
    ]);
  });
});

describe('the reviewed explanations (--strict)', () => {
  const dictionary = parseDictionary(
    ['## Remittances', '', '| Table | Purpose | Key fields | Policy |', '| --- | --- | --- | --- |', '| `remittance` | One 835 | `trn02`, `payee_id` | tenant |', ''].join('\n'),
  );
  const model = modelOf([
    tableModel('remittance', {
      columns: [
        { name: 'id', type: 'uuid', notNull: true, default: null, identity: null, generated: null, encrypted: false, enumeration: null, fk: [], addedBy: null },
        { name: 'trn02', type: 'text', notNull: true, default: null, identity: null, generated: null, encrypted: false, enumeration: null, fk: [], addedBy: null },
        { name: 'payee_npi', type: 'text', notNull: true, default: null, identity: null, generated: null, encrypted: false, enumeration: null, fk: [], addedBy: null },
        { name: 'created_at', type: 'timestamp with time zone', notNull: true, default: 'now()', identity: null, generated: null, encrypted: false, enumeration: null, fk: [], addedBy: null },
        { name: 'updated_at', type: 'timestamp with time zone', notNull: true, default: 'now()', identity: null, generated: null, encrypted: false, enumeration: null, fk: [], addedBy: null },
      ],
      policies: [policy('remittance_tenant')],
    }),
    tableModel('support_mail_receipt'),
  ]);
  const { divergences } = compareWithDictionary(model, dictionary);
  const none: Explanations = { rows: {}, policies: [], plan: [] };

  it('finds the divergences: a renamed field to approve, and an informational extra column and table', () => {
    expect(divergences.map((d) => d.key)).toEqual(['remittance|payee_id|renamed', 'remittance|payee_npi|extra column', 'support_mail_receipt||extra table']);
  });

  it('refuses a divergence to approve that has no reviewed explanation; informational rows need none', () => {
    expect(explain(divergences, none, model).strictProblems).toEqual(['no reviewed explanation for remittance|payee_id|renamed']);
  });

  it('attaches the reviewed explanation to its divergence', () => {
    const explained = explain(divergences, { ...none, rows: { 'remittance|payee_id|renamed': { by: 'ADR 0031', status: 'approved', text: 'The NPI.' } } }, model);
    expect(explained.strictProblems).toEqual([]);
    expect(explained.divergences[0]).toMatchObject({ key: 'remittance|payee_id|renamed', by: 'ADR 0031', status: 'approved', text: 'The NPI.' });
    expect(explained.divergences[1]).toMatchObject({ kind: 'extra column', by: null, status: null, text: null });
  });

  it('refuses an explanation of a divergence that no longer exists, and a policy note naming a table or policy that does not', () => {
    const stale: Explanations = {
      rows: { 'remittance|payee_id|renamed': { by: 'ADR 0031', status: 'approved', text: null }, 'remittance|bpr02_cents|retyped': { by: 'ADR 0021', status: 'approved', text: null } },
      policies: [
        { table: 'remittance', policies: ['remittance_tenant', 'remittance_dropped'], by: 'ADR 0013', status: 'conforms', text: '-' },
        { table: 'legal_hold', policies: ['legal_hold_tenant'], by: 'PRD 12', status: 'conforms', text: '-' },
      ],
      plan: [],
    };
    expect(explain(divergences, stale, model).strictProblems).toEqual([
      'explanation for a divergence that no longer exists: remittance|bpr02_cents|retyped',
      'policy note for remittance names policy remittance_dropped, which does not exist',
      'policy note names table legal_hold, which does not exist',
    ]);
  });
});
