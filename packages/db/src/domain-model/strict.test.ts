import { describe, expect, it } from 'vitest';

import { compareWithDictionary, explain, parseDictionary } from './dictionary';
import { type ColumnModel, type Model, type PolicyModel, type TableModel, areaProblems, buildModel, enumerationOf, wholeEnumerationOf } from './model';
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
    rules: [],
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

const column = (name: string, type: string, overrides: Partial<ColumnModel> = {}): ColumnModel => ({
  name,
  type,
  notNull: true,
  default: null,
  identity: null,
  generated: null,
  encrypted: false,
  enumeration: null,
  enumerationMerged: false,
  fk: [],
  addedBy: null,
  ...overrides,
});

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
        column('id', 'uuid'),
        column('trn02', 'text'),
        column('payee_npi', 'text'),
        column('created_at', 'timestamp with time zone', { default: 'now()' }),
        column('updated_at', 'timestamp with time zone', { default: 'now()' }),
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

  it('refuses a policy note that leaves out a policy the table has, as one a migration added', () => {
    const withProbe = modelOf([
      tableModel('membership', { policies: [policy('membership_administrators_insert'), policy('membership_owner'), policy('membership_probe_all_read')] }),
    ]);
    const reviewed = { table: 'membership', policies: ['membership_administrators_insert', 'membership_owner'], by: 'ADR 0013', status: 'explained', text: '-' };
    expect(explain([], { ...none, policies: [reviewed] }, withProbe).strictProblems).toEqual(['policy note for membership does not list its policy membership_probe_all_read']);
    const complete = { ...reviewed, policies: ['membership_probe_all_read', 'membership_owner', 'membership_administrators_insert'] };
    expect(explain([], { ...none, policies: [complete] }, withProbe).strictProblems).toEqual([]);
  });
});

describe('enumerations', () => {
  const statusCheck = "CHECK (status = ANY (ARRAY['draft'::text, 'proposed'::text, 'approved'::text, 'signed_off'::text, 'superseded'::text]))";
  const conditional = "CHECK ((status = ANY (ARRAY['draft'::text, 'proposed'::text])) = (approved_by IS NULL))";
  const signedOff = "CHECK (signed_off_by IS NULL OR (status = ANY (ARRAY['signed_off'::text, 'superseded'::text])))";

  it("reads a closed list only from a CHECK whose whole expression is the column's list", () => {
    expect(wholeEnumerationOf(statusCheck)).toEqual({ column: 'status', values: ['draft', 'proposed', 'approved', 'signed_off', 'superseded'] });
    expect(wholeEnumerationOf("CHECK ((kind)::text = ANY ((ARRAY['a'::character varying, 'it''s'::character varying])::text[]))")).toEqual({ column: 'kind', values: ['a', "it's"] });
    expect(wholeEnumerationOf(conditional)).toBeNull();
    expect(wholeEnumerationOf(signedOff)).toBeNull();
    expect(wholeEnumerationOf('CHECK (attempts = ANY (ARRAY[1, 2]))')).toBeNull();
    expect(enumerationOf(conditional)).toEqual([{ column: 'status', values: ['draft', 'proposed'] }]);
  });

  /** A one-table catalog whose status column carries `checks` (constraint-name order). */
  function statusColumn(checks: readonly string[]): ColumnModel | undefined {
    const catalog = {
      meta: { major: 18, migrations: 0, head: null },
      appliedMigrations: [],
      migrationChecksums: [],
      roles: [],
      groupRoles: [],
      relations: [{ oid: 1, name: 'contract_version', kind: 'r', rls: false, forced: false, owner: 'tp_owner', options: null }],
      columns: [{ table_name: 'contract_version', num: 1, name: 'status', type: 'text', not_null: true, default_expr: null, identity: null, generated: null }],
      constraints: checks.map((def, i) => ({ table_name: 'contract_version', name: `c${String(i)}`, type: 'c', def, cols: [], ref_table: null, ref_cols: [], on_delete: 'a', deferrable: false })),
      indexes: [],
      policies: [],
      triggers: [],
      functions: [],
      functionPolicies: [],
      eventTriggers: [],
      otherSchemaFunctions: [],
      privileges: [],
      columnPrivileges: [],
      enumTypes: [],
      viewDefs: [],
      rules: [],
      defaultPrivileges: [],
      registry: [],
      otherSchemas: [],
    };
    const migrations = { files: [], checksums: new Map(), adrs: new Map(), tableCreatedBy: new Map(), columnAddedBy: new Map(), tableTouchedBy: new Map(), functionDefinedBy: new Map() };
    return buildModel(catalog, migrations, { createdOutsideMigrations: {}, areas: [] }).byName.get('contract_version')?.columns[0];
  }

  it("takes the column's values from its own CHECK, in that CHECK's order, whatever conditional CHECKs sort before it", () => {
    expect(statusColumn([conditional, signedOff, statusCheck])).toMatchObject({ enumeration: ['draft', 'proposed', 'approved', 'signed_off', 'superseded'], enumerationMerged: false });
  });

  it('marks values named only by conditional CHECKs as merged, not a closed list, and the dictionary comparison as not enforced', () => {
    const merged = statusColumn([conditional, signedOff]);
    expect(merged).toMatchObject({ enumeration: ['draft', 'proposed', 'signed_off', 'superseded'], enumerationMerged: true });
    const dictionary = parseDictionary(
      ['## Contracts', '', '| Table | Purpose | Key fields | Policy |', '| --- | --- | --- | --- |', '| `contract_version` | A version | `status` (draft, proposed, signed_off, superseded) | tenant |', ''].join('\n'),
    );
    const model = modelOf([tableModel('contract_version', { columns: [column('id', 'uuid'), merged ?? column('status', 'text')] })]);
    expect(compareWithDictionary(model, dictionary).divergences.filter((d) => d.field === 'status')).toEqual([
      expect.objectContaining({ kind: 'enumeration not enforced', schema: 'text with no CHECK list (conditional CHECKs name draft, proposed, signed_off, superseded)' }),
    ]);
  });
});
