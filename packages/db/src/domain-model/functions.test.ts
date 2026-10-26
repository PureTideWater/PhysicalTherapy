import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { type EventTriggerRow, type FunctionAclRow, type FunctionPolicyRow, type FunctionRow, type TriggerRow } from './catalog-reads';
import { FUNCTION_FILE_BANNER, cOrder, fileNameProblem, functionFileNameProblem, privilegeLines, renderFunctionFiles } from './functions';
import { bodySha256 } from './model';
import { DomainModelError } from './sources';

/**
 * The function files (docs/adr/0068; test matrix DBF-03 and DBF-05) rendered from synthetic catalog rows: one file
 * per name with its overloads in signature order, names that cannot name a file refused, aggregates refused, the
 * output the same whatever order the catalog returns its rows in, and every privilege line explicit. The rows are
 * shaped as catalog-reads.ts reads them; domain-model.db.test.ts and domain-model-drift.db.test.ts read them from
 * a migrated database.
 */
const acl = (grantee: string | null, overrides: Partial<FunctionAclRow> = {}): FunctionAclRow => ({
  grantee,
  grantee_ident: grantee ?? 'PUBLIC',
  grantor: 'tp_owner',
  grantor_ident: 'tp_owner',
  grantable: false,
  ...overrides,
});

/** The owner's own EXECUTE, as aclexplode lists it once PUBLIC's default grant is revoked. */
const OWN = acl('tp_owner');

function fn(signature: string, overrides: Partial<FunctionRow> = {}): FunctionRow {
  const name = signature.slice(0, signature.indexOf('('));
  return {
    signature,
    name,
    language: 'sql',
    security_definer: false,
    volatility: 'i',
    config: [],
    returns: 'integer',
    execute_roles: [],
    execute_public: false,
    src: ' SELECT 1 ',
    kind: 'f',
    definition: `CREATE OR REPLACE FUNCTION public.${signature}\n RETURNS integer\n LANGUAGE sql\n IMMUTABLE\nAS $function$ SELECT 1 $function$\n`,
    owner: 'tp_owner',
    owner_ident: 'tp_owner',
    acl: [OWN],
    comment: null,
    extension_member: false,
    sql_standard_body: false,
    ...overrides,
  };
}

const trigger = (table: string, name: string, signature: string): TriggerRow => ({
  table_name: table,
  name,
  def: `CREATE TRIGGER ${name} BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION ${signature}`,
  enabled: 'O',
  function_name: signature.slice(0, signature.indexOf('(')),
  function_signature: signature,
  function_src: null,
});

const policy = (table: string, name: string, signature: string): FunctionPolicyRow => ({ function_signature: signature, table_name: table, policy_name: name });
const eventTrigger = (name: string, event: string, signature: string): EventTriggerRow => ({ function_signature: signature, name, event });

/** What renderFunctionFiles reads of the catalog beside the functions and triggers, empty unless a case gives it. */
interface Others {
  readonly functionPolicies?: readonly FunctionPolicyRow[];
  readonly eventTriggers?: readonly EventTriggerRow[];
  readonly otherSchemaFunctions?: readonly string[];
}
const render = (functions: readonly FunctionRow[], triggers: readonly TriggerRow[] = [], others: Others = {}): Map<string, string> =>
  renderFunctionFiles({ functions, triggers, functionPolicies: others.functionPolicies ?? [], eventTriggers: others.eventTriggers ?? [], otherSchemaFunctions: others.otherSchemaFunctions ?? [] });
const fileOf = (functions: readonly FunctionRow[], file: string, triggers: readonly TriggerRow[] = []): string => render(functions, triggers).get(file) ?? '';

describe('DBF-03: one file per function name', () => {
  it('names each file after its function, in C order, with the banner and one final newline', () => {
    const files = render([fn('gate_probe_b()'), fn('gate_probe_a()'), fn('_gate_probe()')]);
    expect([...files.keys()]).toEqual(['_gate_probe.sql', 'gate_probe_a.sql', 'gate_probe_b.sql']);
    const text = files.get('gate_probe_a.sql') ?? '';
    expect(text.split('\n').slice(0, 3)).toEqual([...FUNCTION_FILE_BANNER, '']);
    expect(text.endsWith(';\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    expect(text).not.toContain('\r');
    // The banner carries none of the markers that make GitHub collapse a generated file's diff.
    expect(text).not.toMatch(/@generated|DO NOT EDIT/);
  });

  it('puts overloads in one file, in the C order of their signatures, a blank line between them', () => {
    const files = render([fn('gate_probe(text,text,integer)'), fn('gate_probe(text)'), fn('gate_probe(integer)')]);
    expect([...files.keys()]).toEqual(['gate_probe.sql']);
    const headers = (files.get('gate_probe.sql') ?? '').split('\n').filter((line) => /^-- gate_probe\(/.test(line));
    expect(headers).toEqual(['-- gate_probe(integer)', '-- gate_probe(text)', '-- gate_probe(text,text,integer)']);
    expect(files.get('gate_probe.sql')).toContain('FROM PUBLIC;\n\n-- gate_probe(text)\n');
  });

  it('refuses a name that is not lower-case letters, digits and underscores, or is over 63 bytes', () => {
    expect(fileNameProblem('gate_probe')).toBeNull();
    expect(fileNameProblem('g'.repeat(63))).toBeNull();
    expect(fileNameProblem('g'.repeat(64))).toBe('is longer than 63 bytes');
    for (const name of ['Gate_probe', '9gate', 'gate-probe', 'gate probe', '../gate', 'gate/probe', 'gaté', '']) expect(fileNameProblem(name), name).not.toBeNull();
    const bad = fn('"GateProbe"()', { name: 'GateProbe' });
    expect(() => render([fn('gate_probe()'), bad])).toThrow(DomainModelError);
    expect(() => render([bad])).toThrow(/a function name cannot name its file under packages\/db\/functions: "GateProbe" is not lower-case/);
    expect(() => render([fn(`${'g'.repeat(64)}()`)])).toThrow(/is longer than 63 bytes/);
  });

  it("a file name read from a directory or a tree is a function file's only when it is <name>.sql with a name that passes", () => {
    expect(functionFileNameProblem('gate_probe.sql')).toBeNull();
    expect(functionFileNameProblem(`${'g'.repeat(63)}.sql`)).toBeNull();
    expect(functionFileNameProblem(`${'g'.repeat(64)}.sql`)).toMatch(/longer than 63 bytes/);
    for (const name of ['gate probe.sql', 'Gate.sql', '"gate".sql', 'gate\tprobe.sql', 'gate\nprobe.sql', '.sql', '../gate.sql', 'gate.SQL', 'gate.sql.bak', 'README.md', 'gate-probe.sql']) {
      expect(functionFileNameProblem(name), JSON.stringify(name)).not.toBeNull();
    }
  });

  it('refuses any function outside schema public, naming each, since it would have no file and no diff', () => {
    expect(() => render([fn('gate_probe()')], [], { otherSchemaFunctions: ['priv.gate_probe_leak()', 'audit.gate_probe_b(integer)'] })).toThrow(DomainModelError);
    expect(() => render([fn('gate_probe()')], [], { otherSchemaFunctions: ['priv.gate_probe_leak()', 'audit.gate_probe_b(integer)'] })).toThrow(
      /a function outside schema public would have no function file and no diff: audit\.gate_probe_b\(integer\), priv\.gate_probe_leak\(\)/,
    );
  });

  it('refuses an aggregate, naming it, rather than calling pg_get_functiondef on it or guessing', () => {
    const aggregate = fn('gate_probe_sum(integer)', { kind: 'a', definition: null, src: 'aggregate_dummy' });
    expect(() => render([fn('gate_probe()'), aggregate])).toThrow(DomainModelError);
    expect(() => render([aggregate])).toThrow(/cannot render an aggregate: gate_probe_sum\(integer\)/);
  });

  it('renders a procedure and a window function with the keyword each takes', () => {
    const procedure = fn('gate_probe_run()', { kind: 'p', definition: 'CREATE OR REPLACE PROCEDURE public.gate_probe_run()\n LANGUAGE sql\nAS $procedure$ SELECT 1 $procedure$\n' });
    expect(fileOf([procedure], 'gate_probe_run.sql')).toContain('$procedure$;\nALTER PROCEDURE public.gate_probe_run() OWNER TO tp_owner;\nREVOKE ALL ON PROCEDURE public.gate_probe_run() FROM PUBLIC;');
    const window = fn('gate_probe_rank()', { kind: 'w' });
    expect(fileOf([window], 'gate_probe_rank.sql')).toContain('ALTER FUNCTION public.gate_probe_rank() OWNER TO tp_owner;');
  });

  it('leaves out a member of an extension, whose definition belongs to the extension', () => {
    expect([...render([fn('gate_probe()'), fn('gate_probe_ext()', { extension_member: true })]).keys()]).toEqual(['gate_probe.sql']);
    // An extension's aggregate is left out too, not refused.
    expect(() => render([fn('gate_probe_ext_sum(integer)', { kind: 'a', definition: null, extension_member: true })])).not.toThrow();
  });

  it('is the same whatever order the catalog returns functions, ACL entries and triggers in (property)', () => {
    const functions = [
      fn('gate_probe(integer)', { acl: [OWN, acl('tp_app'), acl('tp_operator', { grantable: true }), acl(null)] }),
      fn('gate_probe(text)', { acl: [OWN, acl('tp_screening', { grantor: 'tp_app', grantor_ident: 'tp_app' }), acl('tp_app')] }),
      fn('gate_probe_touch()', { returns: 'trigger' }),
      fn('gate_probe_other()', { comment: 'a synthetic note' }),
    ];
    const triggers = [trigger('remittance', 'gate_probe_b', 'gate_probe_touch()'), trigger('line_note', 'gate_probe_a', 'gate_probe_touch()'), trigger('adjustment', 'gate_probe_c', 'gate_probe_touch()')];
    const policies = [policy('remittance', 'tenant', 'gate_probe(integer)'), policy('line_note', 'tenant', 'gate_probe(integer)'), policy('adjustment', 'tenant_insert', 'gate_probe(text)')];
    const events = [eventTrigger('gate_probe_ddl_b', 'ddl_command_end', 'gate_probe_other()'), eventTrigger('gate_probe_ddl_a', 'sql_drop', 'gate_probe_other()')];
    const expected = [...render(functions, triggers, { functionPolicies: policies, eventTriggers: events })];
    fc.assert(
      fc.property(
        fc.shuffledSubarray(functions, { minLength: functions.length }),
        fc.shuffledSubarray(triggers, { minLength: triggers.length }),
        fc.shuffledSubarray(policies, { minLength: policies.length }),
        fc.shuffledSubarray(events, { minLength: events.length }),
        fc.boolean(),
        (fs, ts, ps, es, reverseAcl) => {
          const shuffled = fs.map((f) => ({ ...f, acl: reverseAcl ? [...f.acl].reverse() : f.acl }));
          expect([...render(shuffled, ts, { functionPolicies: ps, eventTriggers: es })]).toEqual(expected);
        },
      ),
    );
  });
});

describe('DBF-05: what each file says of a function', () => {
  it('prints the header, the definition with its trailing newline replaced by a semicolon, the owner and the privileges', () => {
    const f = fn('gate_probe()', { acl: [OWN, acl('tp_app')] });
    expect(fileOf([f], 'gate_probe.sql')).toBe(
      [
        ...FUNCTION_FILE_BANNER,
        '',
        '-- gate_probe()',
        `-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: ${bodySha256(' SELECT 1 ').slice(0, 16)}`,
        '-- Trigger function of: (none)',
        '-- Called by policy: (none)',
        'CREATE OR REPLACE FUNCTION public.gate_probe()',
        ' RETURNS integer',
        ' LANGUAGE sql',
        ' IMMUTABLE',
        'AS $function$ SELECT 1 $function$;',
        'ALTER FUNCTION public.gate_probe() OWNER TO tp_owner;',
        'REVOKE ALL ON FUNCTION public.gate_probe() FROM PUBLIC;',
        'GRANT EXECUTE ON FUNCTION public.gate_probe() TO tp_app;',
        '',
      ].join('\n'),
    );
  });

  it("prints the body hash Appendix C prints: model.ts's bodySha256 of the body alone", () => {
    const src = '\nBEGIN\n  RETURN 1;\nEND\n';
    const text = fileOf([fn('gate_probe()', { src, language: 'plpgsql' })], 'gate_probe.sql');
    expect(text).toContain(`as Appendix C prints it: ${bodySha256(src).slice(0, 16)}\n`);
    // A header change alone (a grant here) leaves the hash line as it was.
    const granted = fileOf([fn('gate_probe()', { src, language: 'plpgsql', acl: [OWN, acl('tp_app')] })], 'gate_probe.sql');
    expect(granted.split('\n')[4]).toBe(text.split('\n')[4]);
  });

  it('labels the body-hash line of a SQL-standard body, which has no dollar quotes, for what it covers', () => {
    const src = "RETURN CASE WHEN (a > 0) THEN 'up'::text ELSE 'down'::text END";
    const definition = `CREATE OR REPLACE FUNCTION public.gate_probe(a integer)\n RETURNS text\n LANGUAGE sql\n IMMUTABLE\n${src}\n`;
    const text = fileOf([fn('gate_probe(integer)', { src, definition, sql_standard_body: true })], 'gate_probe.sql');
    expect(text.split('\n')[4]).toBe(`-- Body SHA-256 (the SQL-standard body only, from RETURN or BEGIN ATOMIC), as Appendix C prints it: ${bodySha256(src).slice(0, 16)}`);
    expect(text).toContain(`${src};\nALTER FUNCTION public.gate_probe(integer) OWNER TO tp_owner;`);
  });

  it('strips exactly one trailing newline from the definition, keeping a body that ends in blank lines as it is', () => {
    const definition = 'CREATE OR REPLACE FUNCTION public.gate_probe()\n RETURNS integer\n LANGUAGE sql\nAS $function$ SELECT 1\n\n$function$\n';
    expect(fileOf([fn('gate_probe()', { definition })], 'gate_probe.sql')).toContain('AS $function$ SELECT 1\n\n$function$;\nALTER FUNCTION');
  });

  it('PUBLIC both ways: REVOKE ALL when PUBLIC lacks EXECUTE, GRANT TO PUBLIC when it holds it', () => {
    const base = { signature: 'gate_probe()', kind: 'f', owner: 'tp_owner', owner_ident: 'tp_owner' };
    expect(privilegeLines({ ...base, acl: [OWN] })).toEqual(['REVOKE ALL ON FUNCTION public.gate_probe() FROM PUBLIC;']);
    // The default ACL (proacl null): PUBLIC and the owner.
    expect(privilegeLines({ ...base, acl: [acl(null), OWN] })).toEqual(['GRANT EXECUTE ON FUNCTION public.gate_probe() TO PUBLIC;']);
  });

  it('one GRANT per grantee in C order, WITH GRANT OPTION where grantable and GRANTED BY where the grantor is not the owner', () => {
    const lines = privilegeLines({
      signature: 'gate_probe(integer)',
      kind: 'f',
      owner: 'tp_owner',
      owner_ident: 'tp_owner',
      acl: [acl('tp_screening', { grantor: 'tp_operator', grantor_ident: 'tp_operator' }), acl('tp_operator', { grantable: true }), OWN, acl('Gate Probe', { grantee_ident: '"Gate Probe"' }), acl('tp_app')],
    });
    expect(lines).toEqual([
      'REVOKE ALL ON FUNCTION public.gate_probe(integer) FROM PUBLIC;',
      'GRANT EXECUTE ON FUNCTION public.gate_probe(integer) TO "Gate Probe";',
      'GRANT EXECUTE ON FUNCTION public.gate_probe(integer) TO tp_app;',
      'GRANT EXECUTE ON FUNCTION public.gate_probe(integer) TO tp_operator WITH GRANT OPTION;',
      'GRANT EXECUTE ON FUNCTION public.gate_probe(integer) TO tp_screening GRANTED BY tp_operator;',
    ]);
    expect(cOrder('Gate Probe', 'tp_app')).toBeLessThan(0);
  });

  it('says when the owner revoked its own EXECUTE, and a GRANT TO PUBLIC from another grantor', () => {
    expect(privilegeLines({ signature: 'gate_probe()', kind: 'f', owner: 'tp_owner', owner_ident: 'tp_owner', acl: [acl('tp_app')] })).toEqual([
      'REVOKE ALL ON FUNCTION public.gate_probe() FROM PUBLIC;',
      'GRANT EXECUTE ON FUNCTION public.gate_probe() TO tp_app;',
      'REVOKE EXECUTE ON FUNCTION public.gate_probe() FROM tp_owner;',
    ]);
    expect(privilegeLines({ signature: 'gate_probe()', kind: 'f', owner: 'tp_owner', owner_ident: 'tp_owner', acl: [OWN, acl(null, { grantor: 'tp_app', grantor_ident: 'tp_app' })] })).toEqual([
      'GRANT EXECUTE ON FUNCTION public.gate_probe() TO PUBLIC GRANTED BY tp_app;',
    ]);
  });

  it('prints a comment as COMMENT ON FUNCTION, its quotes doubled, and none when there is no comment', () => {
    expect(fileOf([fn('gate_probe()', { comment: "the probe's note" })], 'gate_probe.sql')).toContain("\nCOMMENT ON FUNCTION public.gate_probe() IS 'the probe''s note';\n");
    expect(fileOf([fn('gate_probe()')], 'gate_probe.sql')).not.toContain('COMMENT ON');
  });

  it('lists each trigger the function serves as table.trigger, one per line in C order, and only on its own overload', () => {
    const files = render(
      [fn('gate_probe_touch()', { returns: 'trigger' }), fn('gate_probe_touch(integer)')],
      [trigger('remittance', 'gate_probe_touch', 'gate_probe_touch()'), trigger('line_note', 'gate_probe_touch', 'gate_probe_touch()'), trigger('line_note', 'gate_probe_a', 'gate_probe_touch()')],
    );
    const lines = (files.get('gate_probe_touch.sql') ?? '').split('\n').filter((line) => line.startsWith('-- Trigger function of:'));
    expect(lines).toEqual([
      '-- Trigger function of: line_note.gate_probe_a',
      '-- Trigger function of: line_note.gate_probe_touch',
      '-- Trigger function of: remittance.gate_probe_touch',
      '-- Trigger function of: (none)',
    ]);
  });

  it('lists each policy that calls the function as table.policy, one per line in C order, and (none) when none does', () => {
    const files = render([fn('gate_probe_scope()'), fn('gate_probe_scope(integer)'), fn('gate_probe_other()')], [], {
      functionPolicies: [policy('remittance', 'tenant', 'gate_probe_scope()'), policy('line_note', 'tenant_update', 'gate_probe_scope()'), policy('line_note', 'tenant', 'gate_probe_scope()')],
    });
    const lines = (files.get('gate_probe_scope.sql') ?? '').split('\n').filter((line) => line.startsWith('-- Called by policy:'));
    expect(lines).toEqual(['-- Called by policy: line_note.tenant', '-- Called by policy: line_note.tenant_update', '-- Called by policy: remittance.tenant', '-- Called by policy: (none)']);
    expect(files.get('gate_probe_other.sql')).toContain('\n-- Trigger function of: (none)\n-- Called by policy: (none)\nCREATE OR REPLACE FUNCTION');
  });

  it('lists each event trigger that runs the function as name ON event, one per line in C order, and nothing when none does', () => {
    const files = render([fn('gate_probe_ddl()', { returns: 'event_trigger' }), fn('gate_probe()')], [], {
      eventTriggers: [eventTrigger('gate_probe_ddl_b', 'sql_drop', 'gate_probe_ddl()'), eventTrigger('gate_probe_ddl_a', 'ddl_command_end', 'gate_probe_ddl()')],
    });
    expect(files.get('gate_probe_ddl.sql')).toContain(
      '\n-- Trigger function of: (none)\n-- Called by policy: (none)\n-- Event trigger: gate_probe_ddl_a ON ddl_command_end\n-- Event trigger: gate_probe_ddl_b ON sql_drop\nCREATE OR REPLACE FUNCTION',
    );
    expect(files.get('gate_probe.sql')).not.toContain('-- Event trigger:');
  });
});
