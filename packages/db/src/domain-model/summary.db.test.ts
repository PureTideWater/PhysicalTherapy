import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from '../config';
import { migrate } from '../migrate';
import { type ScratchDatabase, createScratchDatabase } from '../testing';
import { type GeneratedDomainModel, generateDomainModel } from './generate';
import { DEFAULT_SOURCES } from './sources';
import { SUMMARY_CATEGORIES, changeLine, documentChanges, readDocument, renderSummary } from './summary';

/**
 * "Changes since the last approved document" (docs/adr/0063) against the generator itself: a scratch database
 * migrated with every migration gives the document as approved; synthetic DDL then changes its row-level
 * security, a policy, the PHI registry, grants, a table, columns, constraints, a function, triggers and the
 * divergence rows, and the regenerated document's summary must name each change once, in its category, with
 * row-level security, policies, the PHI registry and grants first. Synthetic schema only (gate_probe_*).
 */
const PROBE_DDL = `
ALTER TABLE line_note NO FORCE ROW LEVEL SECURITY;
CREATE POLICY gate_probe_read ON line_note AS RESTRICTIVE FOR SELECT TO tp_app USING (created_by = app_actor_id());
UPDATE phi_table_registry SET policy_name = 'gate_probe_read' WHERE table_name = 'line_note';
GRANT DELETE ON line_note TO tp_app;
ALTER TABLE line_note ADD COLUMN gate_probe_flag boolean NOT NULL DEFAULT false;
ALTER TABLE line_note ADD CONSTRAINT gate_probe_flag_set CHECK (gate_probe_flag IS NOT NULL);
CREATE INDEX gate_probe_by_flag ON line_note (practice_id, gate_probe_flag);
ALTER TABLE practice ADD COLUMN gate_probe_note text;
CREATE FUNCTION gate_probe_refuse() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'a gate probe refuses every delete'; END $$;
ALTER FUNCTION gate_probe_refuse() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION gate_probe_refuse() FROM PUBLIC;
CREATE TRIGGER gate_probe_refuse BEFORE DELETE ON line_note FOR EACH ROW EXECUTE FUNCTION gate_probe_refuse();
ALTER TABLE agreement_event DISABLE TRIGGER agreement_event_append_only;
CREATE TABLE gate_probe_code (code text PRIMARY KEY);
ALTER TABLE gate_probe_code OWNER TO tp_owner;
GRANT SELECT ON gate_probe_code TO tp_app;
`;

/** A view whose definition holds a line of three backticks, and a policy dropped: the reader keeps the fences in step. */
const FENCE_DDL = `
CREATE VIEW gate_probe_fence AS SELECT E'\\n\`\`\`\\n'::text AS x;
ALTER VIEW gate_probe_fence OWNER TO tp_owner;
DROP POLICY organization_owner ON organization;
`;

const databases: ScratchDatabase[] = [];
const directories: string[] = [];
let approved: GeneratedDomainModel | undefined;
let changed: GeneratedDomainModel | undefined;
let fenced: GeneratedDomainModel | undefined;

beforeAll(async () => {
  const database = await createScratchDatabase(readDatabaseUrl());
  databases.push(database);
  await migrate({ databaseUrl: database.url });
  approved = await generateDomainModel({ databaseUrl: database.url, commit: '0000000', branch: 'probe' });
  // The area map with the probe table placed, as a migration adding a table would place it.
  const dir = mkdtempSync(path.join(tmpdir(), 'domain-model-summary-'));
  directories.push(dir);
  const areas = JSON.parse(readFileSync(DEFAULT_SOURCES.areasPath, 'utf8')) as { areas: { id: string; tables: string[] }[] };
  areas.areas.find((a) => a.id === 'operations')?.tables.push('gate_probe_code');
  const areasPath = path.join(dir, 'areas.json');
  writeFileSync(areasPath, JSON.stringify(areas));
  const client = new pg.Client({ connectionString: database.url });
  await client.connect();
  try {
    await client.query(PROBE_DDL);
  } finally {
    await client.end();
  }
  changed = await generateDomainModel({ databaseUrl: database.url, areasPath, commit: '1111111', branch: 'probe' });
  areas.areas.find((a) => a.id === 'operations')?.tables.push('gate_probe_fence');
  const fencedAreasPath = path.join(dir, 'areas-fenced.json');
  writeFileSync(fencedAreasPath, JSON.stringify(areas));
  const second = new pg.Client({ connectionString: database.url });
  await second.connect();
  try {
    await second.query(FENCE_DDL);
  } finally {
    await second.end();
  }
  fenced = await generateDomainModel({ databaseUrl: database.url, areasPath: fencedAreasPath, commit: '2222222', branch: 'probe' });
}, 240_000);

afterAll(async () => {
  await Promise.all(databases.map((d) => d.drop()));
  for (const dir of directories) rmSync(dir, { recursive: true, force: true });
});

function documents(): { readonly before: string; readonly after: string } {
  if (approved === undefined || changed === undefined) throw new Error('the probe database was not migrated');
  return { before: approved.text, after: changed.text };
}

describe('the summary of a regenerated document', () => {
  it('names each synthetic schema change once, in its category', () => {
    const { before, after } = documents();
    const changes = documentChanges(before, after);
    const shown = (category: string): string[] => changes.filter((c) => c.category === category).map(changeLine);
    expect(shown('rls')).toEqual([
      expect.stringMatching(/^- changed `row-level security \(totals\)`: .*; 0 enable without forcing; .* → .*; 1 enable without forcing; .*/),
      '- changed `tables with RLS enabled but not forced`: `none.` → `line_note.`',
      '- changed `line_note row-level security`: `enabled, forced; owner tp_owner` → `enabled; owner tp_owner`',
      '- added `gate_probe_code row-level security`: `not enabled; owner tp_owner`',
    ]);
    expect(shown('policies')).toEqual(['- added `line_note policy gate_probe_read`: `RESTRICTIVE FOR SELECT TO tp_app; USING (created_by = app_actor_id())`']);
    expect(shown('phi')).toEqual(
      expect.arrayContaining([
        '- changed `line_note class`: `PHI (registered); registry policy line_note_tenant, registered by 20261016120000_remittances, qualifies: yes` → `PHI (registered); registry policy gate_probe_read, registered by 20261016120000_remittances, qualifies: **NO**`',
        '- changed `registered tables whose policy does not qualify`: `none.` → `line_note.`',
        '- added `gate_probe_code class`: `global (no practice_id, no RLS)`',
      ]),
    );
    expect(shown('grants')).toEqual(
      expect.arrayContaining([
        '- changed `line_note privileges`: `tp_app SELECT, INSERT(cols)` → `tp_app SELECT, INSERT(cols), DELETE`',
        '- added `gate_probe_code privileges`: `tp_app SELECT`',
        '- added `EXECUTE on gate_probe_refuse()`: `granted to no group role`',
      ]),
    );
    expect(shown('tables')).toEqual(expect.arrayContaining(['- added `table gate_probe_code`', '- added `gate_probe_code area`: `Operations`']));
    expect(shown('columns')).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^- added `line_note\.gate_probe_flag`: `boolean; NOT NULL; default false; since runner|^- added `line_note\.gate_probe_flag`: `boolean; NOT NULL; default false/),
        expect.stringMatching(/^- added `practice\.gate_probe_note`: `text; null/),
        expect.stringMatching(/^- added `gate_probe_code\.code`: `text; NOT NULL/),
      ]),
    );
    expect(shown('constraints')).toEqual(
      expect.arrayContaining([
        '- added `line_note check gate_probe_flag_set`: `CHECK (gate_probe_flag IS NOT NULL)`',
        '- added `line_note index gate_probe_by_flag`: `USING btree (practice_id, gate_probe_flag)`',
        '- added `gate_probe_code primary key`: `(code)`',
      ]),
    );
    expect(shown('functions')).toEqual(expect.arrayContaining([expect.stringMatching(/^- added `gate_probe_refuse\(\)`: `returns trigger; plpgsql; security invoker; volatile; body [0-9a-f]{16}`$/)]));
    expect(shown('triggers')).toEqual(
      expect.arrayContaining([
        '- added `line_note trigger gate_probe_refuse`: `BEFORE DELETE ON line_note FOR EACH ROW EXECUTE FUNCTION gate_probe_refuse(); "a gate probe refuses every delete"`',
        expect.stringMatching(/^- changed `agreement_event trigger agreement_event_append_only`: `BEFORE DELETE OR UPDATE ON agreement_event .*` → `disabled: not enforced; BEFORE DELETE OR UPDATE ON agreement_event /),
      ]),
    );
    expect(shown('divergences')).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^- added `D\d+ gate_probe_code \(table not in the Data dictionary\)`: `area Operations; global \(no practice_id, no RLS\); created by /),
        expect.stringMatching(/^- changed `E practice \(columns not in the Data dictionary\)`: .*gate_probe_note/),
      ]),
    );
    // The Drizzle and catalog cross-checks see the probe too.
    expect(shown('cross-checks').length).toBeGreaterThan(0);
    // Nothing above is reported twice, and no line of the document falls outside a category.
    const facts = changes.filter((c) => c.category !== 'cross-checks' && c.category !== 'other');
    expect(new Set(facts.map((c) => `${c.category} ${c.label}`)).size, facts.map(changeLine).join('\n')).toBe(facts.length);
    expect(shown('other')).toEqual([]);
  });

  it('reads a view whose definition holds a fence line whole, and still names the one policy dropped beside it', () => {
    if (changed === undefined || fenced === undefined) throw new Error('the probe database was not migrated');
    expect(fenced.text).toContain('\n````sql\nSELECT \'\n```\n\'::text AS x;\n````\n');
    expect(readDocument(fenced.text).unclosedFence).toBe(false);
    const changes = documentChanges(changed.text, fenced.text);
    const shown = (category: string): string[] => changes.filter((c) => c.category === category).map(changeLine);
    expect(shown('policies')).toEqual(['- removed `organization policy organization_owner`: `PERMISSIVE FOR ALL TO tp_owner; USING true; WITH CHECK true`']);
    expect(shown('tables')).toEqual(expect.arrayContaining(['- added `view gate_probe_fence`', "- added `gate_probe_fence view definition`: `SELECT ' ⏎ ''' ⏎ '::text AS x;`"]));
    // Nothing spurious: no line falls outside a category, and every change is the view's, its counts' or the policy's.
    expect(shown('other')).toEqual([]);
    expect(changes.length, changes.map(changeLine).join('\n')).toBeLessThan(20);
    for (const change of changes) expect(`${change.label} ${change.before ?? ''} ${change.after ?? ''}`, changeLine(change)).toMatch(/gate_probe_fence|organization|totals|B\d+ organization|polic/);
  });

  it('lists row-level security, policies, the PHI registry and grants first, with both documents’ SHA-256', () => {
    const { before, after } = documents();
    const summary = renderSummary({
      before: { text: before, ref: 'origin/claude/build-platform', commit: '0'.repeat(40) },
      after: { text: after, source: 'the text regenerated from the database' },
      check: { approvers: ['A. Signer'] },
    });
    expect(summary).toContain(`document SHA-256 \`${approved?.sha256 ?? ''}\`: awaiting approval`);
    expect(summary).toContain(`document SHA-256 \`${changed?.sha256 ?? ''}\`: awaiting approval`);
    const at = SUMMARY_CATEGORIES.map(([, title]) => summary.indexOf(`**${title}** (`));
    expect(at.slice(0, 10).every((n) => n > 0)).toBe(true);
    expect([...at.slice(0, 10)].sort((a, b) => a - b)).toEqual(at.slice(0, 10));
    for (const line of summary.split('\n').filter((l) => l.startsWith('- added') || l.startsWith('- changed') || l.startsWith('- removed'))) {
      expect(line, line).not.toContain('\n');
    }
  });
});
