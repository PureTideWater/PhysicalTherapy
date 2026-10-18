import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { ERA_FORMAT_IDS } from '@tp/db';
import { describe, expect, it } from 'vitest';

import { ERA_EXPORT_FORMATS, FORMAT_UNCONFIRMED, OPTIONAL_ERA_FIELDS, REQUIRED_ERA_FIELDS, eraFormatName, findEraExportFormat, isUnconfirmed, unconfirmedEraFormatIds } from './formats';

/**
 * The worker's runtime ERA formats against the fixtures packages/synth's registry writes (fixtures/synthetic/emr/
 * <id>/manifest.json; docs/adr/0059): the same IDs as source_document.format_id's CHECK (ERA_FORMAT_IDS, which
 * packages/db/src/documents.db.test.ts holds to the migrated CHECK), the same columns in file order, layout,
 * status and confirmation.
 */

const EMR = path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic/emr');

interface Manifest {
  readonly format: string;
  readonly vendor: string;
  readonly kind: string;
  readonly version: number;
  readonly status: string;
  readonly confirmation: unknown;
  readonly note: string;
  readonly layout: { readonly dateFormat: string; readonly money: string; readonly lineEnding: string; readonly bom: boolean; readonly listSeparator: string };
  readonly columns: readonly { readonly header: string; readonly field: string }[];
}

const manifests = readdirSync(EMR)
  .map((id) => JSON.parse(readFileSync(path.join(EMR, id, 'manifest.json'), 'utf8')) as Manifest)
  .filter((manifest) => manifest.kind === 'era_export');

describe('the runtime ERA export formats (docs/adr/0060)', () => {
  it('hold exactly the registry’s ERA formats, in the format_id CHECK’s order', () => {
    expect(ERA_EXPORT_FORMATS.map((format) => format.id)).toEqual([...ERA_FORMAT_IDS]);
    expect(manifests.map((manifest) => manifest.format).sort()).toEqual([...ERA_FORMAT_IDS].sort());
  });

  it('equal each fixture’s manifest: columns in file order, layout, status, confirmation and note', () => {
    for (const manifest of manifests) {
      const format = findEraExportFormat(manifest.format);
      expect(format, manifest.format).toBeDefined();
      if (format === undefined) {
        continue;
      }
      expect(format.columns, manifest.format).toEqual(manifest.columns.map(({ header, field }) => ({ header, field })));
      expect(
        { dateFormat: format.dateFormat, lineEnding: format.lineEnding, bom: format.bom, listSeparator: format.listSeparator, money: 'plain_decimal' },
        manifest.format,
      ).toEqual({
        dateFormat: manifest.layout.dateFormat,
        lineEnding: manifest.layout.lineEnding,
        bom: manifest.layout.bom,
        listSeparator: manifest.layout.listSeparator,
        money: manifest.layout.money,
      });
      expect({ status: format.status, confirmation: format.confirmation, version: format.version, vendorName: format.vendorName, note: format.note }, manifest.format).toEqual({
        status: manifest.status,
        confirmation: manifest.confirmation,
        version: manifest.version,
        vendorName: manifest.vendor,
        note: manifest.note,
      });
    }
  });

  it('give every format each required column once, and only fields the normalizer reads', () => {
    const known = new Set([...REQUIRED_ERA_FIELDS, ...OPTIONAL_ERA_FIELDS]);
    for (const format of ERA_EXPORT_FORMATS) {
      const fields = format.columns.map((column) => column.field);
      expect(new Set(fields).size, format.id).toBe(fields.length);
      expect(fields.filter((field) => !known.has(field)), format.id).toEqual([]);
      expect(REQUIRED_ERA_FIELDS.filter((field) => !fields.includes(field)), format.id).toEqual([]);
      const headers = format.columns.map((column) => column.header.trim().toLowerCase());
      expect(new Set(headers).size, format.id).toBe(headers.length);
    }
  });

  it('flags every format unconfirmed until its description arrives, and names it for a person', () => {
    expect(ERA_EXPORT_FORMATS.every(isUnconfirmed)).toBe(true);
    expect(unconfirmedEraFormatIds()).toEqual([...ERA_FORMAT_IDS]);
    expect(isUnconfirmed({ status: 'FORMAT_CONFIRMED' })).toBe(false);
    expect(ERA_EXPORT_FORMATS.map(eraFormatName)).toEqual(['WebPT Billing ERA export', 'Prompt ERA export', 'SPRY ERA export', 'Raintree ERA export']);
    expect(findEraExportFormat('webpt_billing_posting_v0')).toBeUndefined();
    expect(ERA_EXPORT_FORMATS.every((format) => format.note.startsWith(FORMAT_UNCONFIRMED))).toBe(true);
  });
});
