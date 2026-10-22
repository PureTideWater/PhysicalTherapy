import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readMigrationText } from './migration-text';

/**
 * The migration files read as text for the domain model: a table or function renamed keeps the migration that
 * created it under its new name (migration 20261105090000 renames screening_place_of_service_split and
 * screening_split_valid), so the document never reports a renamed table as created by no migration.
 */

let dir = '';

afterEach(() => {
  if (dir !== '') rmSync(dir, { recursive: true, force: true });
  dir = '';
});

function migrations(files: Readonly<Record<string, string>>): ReturnType<typeof readMigrationText> {
  dir = mkdtempSync(path.join(tmpdir(), 'tp-migration-text-'));
  for (const [name, sql] of Object.entries(files)) writeFileSync(path.join(dir, name), sql);
  return readMigrationText(dir);
}

describe('readMigrationText', () => {
  it('carries a renamed table’s creation, its columns and the migrations that touched it over to its new name', () => {
    const read = migrations({
      '20260101000000_first.sql': '-- ADR 0062.\nCREATE TABLE old_split (id uuid PRIMARY KEY, settings jsonb NOT NULL);\nCREATE FUNCTION old_valid(settings jsonb) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;',
      '20260102000000_second.sql': 'ALTER TABLE old_split ADD COLUMN approved_at timestamptz;',
      '20260103000000_rename.sql':
        'ALTER TABLE old_split RENAME TO new_split;\nALTER TABLE new_split RENAME CONSTRAINT old_split_pkey TO new_split_pkey;\nALTER FUNCTION old_valid(jsonb) RENAME TO new_valid;',
    });
    expect(read.tableCreatedBy.get('new_split')).toBe('20260101000000_first.sql');
    expect(read.columnAddedBy.get('new_split.id')).toBe('20260101000000_first.sql');
    expect(read.columnAddedBy.get('new_split.settings')).toBe('20260101000000_first.sql');
    expect(read.columnAddedBy.get('new_split.approved_at')).toBe('20260102000000_second.sql');
    expect([...(read.tableTouchedBy.get('new_split') ?? [])].sort()).toEqual(['20260101000000_first.sql', '20260102000000_second.sql', '20260103000000_rename.sql']);
    expect([...(read.functionDefinedBy.get('new_valid') ?? [])].sort()).toEqual(['20260101000000_first.sql', '20260103000000_rename.sql']);
    // The old name stays where it was: a later migration that names it again is read as it always was.
    expect(read.tableCreatedBy.get('old_split')).toBe('20260101000000_first.sql');
  });

  it('reads a table never renamed as before', () => {
    const read = migrations({ '20260101000000_first.sql': 'CREATE TABLE kept (id uuid PRIMARY KEY);\nALTER TABLE kept ADD COLUMN zip text;' });
    expect(read.tableCreatedBy.get('kept')).toBe('20260101000000_first.sql');
    expect(read.columnAddedBy.get('kept.zip')).toBe('20260101000000_first.sql');
    expect(read.tableCreatedBy.size).toBe(1);
  });
});
