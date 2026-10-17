import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from '../config';
import { migrate } from '../migrate';
import { type ScratchDatabase, createScratchDatabase } from '../testing';
import { approvalLineOf, approvalProblems, firstDifference } from './approval';
import { type GeneratedDomainModel, generateDomainModel } from './generate';
import { DOMAIN_MODEL_DOCUMENT } from './sources';

/**
 * The CO-02 gate. A fresh database migrated with every migration must regenerate exactly the committed
 * docs/product/domain-model.md (apart from its approval and provenance lines), with every divergence
 * explained (--strict), so a migration merged without regenerating the document fails here. The second
 * case requires the founder's approval of exactly that text: a name, a date and its SHA-256. It fails
 * until the founder signs, and again after any schema change until the regenerated text is signed.
 */
const committed = readFileSync(DOMAIN_MODEL_DOCUMENT, 'utf8');
let database: ScratchDatabase | undefined;
let generated: GeneratedDomainModel;

beforeAll(async () => {
  database = await createScratchDatabase(readDatabaseUrl());
  await migrate({ databaseUrl: database.url });
  generated = await generateDomainModel({ databaseUrl: database.url, strict: true });
}, 180_000);

afterAll(async () => {
  await database?.drop();
});

describe('docs/product/domain-model.md (CO-02)', () => {
  it('matches the schema a fresh database migrates to, every divergence explained', () => {
    const difference = firstDifference(committed, generated.text);
    expect(
      difference,
      difference === null
        ? ''
        : `docs/product/domain-model.md does not match the schema; regenerate it with pnpm db:domain-model --out on a freshly migrated database. First difference at line ${String(difference.line)}:\n- ${difference.existing}\n+ ${difference.generated}`,
    ).toBeNull();
  });

  it("carries the founder's approval of exactly this text: a name, a date and its SHA-256", () => {
    expect(approvalProblems(approvalLineOf(committed), generated.sha256)).toEqual([]);
  });
});
