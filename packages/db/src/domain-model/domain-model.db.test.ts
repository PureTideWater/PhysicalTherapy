import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from '../config';
import { migrate } from '../migrate';
import { type ScratchDatabase, createScratchDatabase } from '../testing';
import { firstDifference } from './approval';
import { type GeneratedDomainModel, generateDomainModel } from './generate';
import { DOMAIN_MODEL_DOCUMENT, DomainModelError } from './sources';

/**
 * The CO-02 gate's drift half. A fresh database migrated with every migration must regenerate exactly the
 * committed docs/product/domain-model.md (apart from its approval and provenance lines), with every
 * divergence explained and every table in an area (--strict), so a migration merged without regenerating
 * the document fails here. The approval half, the founder's approval of exactly that text (a name on
 * packages/db/domain-model/approvers.json, a date and its SHA-256, which must also be the committed text's),
 * is its own check: ci.yml's `domain model` job runs `pnpm db:domain-model --check --strict
 * --require-approval` on a freshly migrated database (docs/adr/0066, Part 1), so a schema pull request
 * awaiting the signature is red there alone and the database suite reports only what it tests.
 */
const committed = readFileSync(DOMAIN_MODEL_DOCUMENT, 'utf8');
let database: ScratchDatabase | undefined;
let generated: GeneratedDomainModel | undefined;
/** Why the generator refused the schema (a table in no area, an unexplained or stale divergence). */
let refusal: DomainModelError | undefined;

beforeAll(async () => {
  database = await createScratchDatabase(readDatabaseUrl());
  await migrate({ databaseUrl: database.url });
  try {
    generated = await generateDomainModel({ databaseUrl: database.url, strict: true });
  } catch (error) {
    if (!(error instanceof DomainModelError)) throw error;
    refusal = error;
  }
}, 180_000);

afterAll(async () => {
  await database?.drop();
});

/** The regenerated document; a refusal fails the case that asks for it, with the generator's reason. */
function regenerated(): GeneratedDomainModel {
  if (generated === undefined) {
    throw new Error(`pnpm db:domain-model --strict refuses the migrated schema: ${refusal?.message ?? 'nothing was generated'}`);
  }
  return generated;
}

describe('docs/product/domain-model.md (CO-02)', () => {
  it('matches the schema a fresh database migrates to, every divergence explained and every table in an area', () => {
    const difference = firstDifference(committed, regenerated().text);
    expect(
      difference,
      difference === null
        ? ''
        : `docs/product/domain-model.md does not match the schema; regenerate it with pnpm db:domain-model --out on a freshly migrated database. First difference at line ${String(difference.line)}:\n- ${difference.existing}\n+ ${difference.generated}`,
    ).toBeNull();
  });
});
