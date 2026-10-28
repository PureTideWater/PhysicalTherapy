import { readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { MUTATE, MUTATION_PACKAGES, PACKAGE_VARIABLE, SHARD_VARIABLE, packageOptions, readNoMutants, readShards } from '../../stryker/base.mjs';
import { repositoryRoot } from '../content-files';
import { selectFiles, shardsFor, trackedFiles } from './affected';
import { packagesOf, shardNamed, shardsOf } from './shards';

/**
 * The mutation workflow's shards (stryker/shards.json; docs/adr/0066, Part 4): every file a package's configuration
 * mutates is in exactly one of that package's shards, every shard file is one it mutates, and every package has its
 * shards listed, so a package's shards, run all together, run every one of its mutants once.
 */
describe('the shard partition', () => {
  const shards = readShards();
  const files = trackedFiles();

  it('lists each package’s shards', () => {
    for (const pkg of MUTATION_PACKAGES) expect(shardsOf(pkg).length, pkg).toBeGreaterThan(0);
    expect(shards.map((shard) => shard.name)).toEqual(['money-ledger', 'packets-scan', 'packets-roles', 'packets-words', 'packets-rest', 'packets-explain', 'pricing-engine', 'pricing-recompute', 'pricing-rest']);
    expect(new Set(shards.map((shard) => shard.name)).size).toBe(shards.length);
    for (const shard of shards) {
      expect(shard.name, 'a job, artifact and directory name').toMatch(/^[a-z]+(?:-[a-z]+)*$/);
      expect(packagesOf(shard).length, shard.name).toBeGreaterThan(0);
      for (const pkg of Object.keys(shard.mutate)) expect(MUTATION_PACKAGES, `${shard.name}: ${pkg}`).toContain(pkg);
    }
  });

  it('puts every file each package mutates in exactly one of its shards, and nothing else', () => {
    for (const pkg of MUTATION_PACKAGES) {
      const mutated = selectFiles(files, MUTATE[pkg]).sort();
      const sharded = shardsOf(pkg).flatMap((shard) => [...(shard.mutate[pkg] ?? [])]);
      expect(mutated.length, pkg).toBeGreaterThan(0);
      expect([...sharded].sort(), pkg).toEqual(mutated);
      expect(new Set(sharded).size, `${pkg}: a file in two shards`).toBe(sharded.length);
    }
  });

  it('is what the workflow’s matrix runs when every package is affected, and what each shard’s configuration mutates', () => {
    expect(shardsFor([...MUTATION_PACKAGES])).toEqual(shards.map((shard) => shard.name));
    const before = [process.env[SHARD_VARIABLE], process.env[PACKAGE_VARIABLE]] as const;
    try {
      for (const shard of shards) {
        process.env[SHARD_VARIABLE] = shard.name;
        for (const pkg of packagesOf(shard)) {
          const options = packageOptions(pkg);
          expect(options.mutate, `${shard.name} ${pkg}`).toEqual(shard.mutate[pkg]);
          expect(options.jsonReporter?.fileName).toBe(`reports/mutation/${shard.name}/${pkg}.json`);
        }
        const outside = MUTATION_PACKAGES.find((pkg) => shard.mutate[pkg] === undefined);
        if (outside !== undefined) expect(() => packageOptions(outside)).toThrow(`${SHARD_VARIABLE}=${shard.name}: that shard mutates no file of ${outside}`);
      }
      process.env[SHARD_VARIABLE] = 'nowhere';
      expect(() => packageOptions('money')).toThrow(`${SHARD_VARIABLE}=nowhere: stryker/shards.json has no shard of that name`);
    } finally {
      for (const [name, value] of [[SHARD_VARIABLE, before[0]], [PACKAGE_VARIABLE, before[1]]] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it('names a shard’s packages and finds a shard by name', () => {
    expect(packagesOf(shardNamed('money-ledger'))).toEqual(['money', 'ledger']);
    expect(shardsOf('pricing').map((shard) => shard.name)).toEqual(['pricing-engine', 'pricing-recompute', 'pricing-rest']);
    expect(() => shardNamed('nowhere')).toThrow('stryker/shards.json has no shard "nowhere": money-ledger, packets-scan, packets-roles, packets-words, packets-rest, packets-explain, pricing-engine, pricing-recompute, pricing-rest');
  });
});

/**
 * What Stryker 10.1.1 finds no mutant in, by a file's top-level statements: imports and exports that name other files'
 * code, type declarations, `declare` statements, and constants whose value is an `as` expression (`[...] as const`),
 * which its instrumenter reads as a type and leaves whole (syntax-helpers.js, isTypeNode: TSAsExpression, TSEnumDeclaration
 * among the type nodes). Anything else may hold a mutant, so its file cannot be listed in noMutants.
 */
function statementsWithMutants(file: string, text: string = readFileSync(path.join(repositoryRoot, file), 'utf8')): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const declared = (statement: ts.Statement) => ts.canHaveModifiers(statement) && (ts.getModifiers(statement) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword);
  const typeOnly = (statement: ts.Statement) =>
    ts.isImportDeclaration(statement) ||
    (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    declared(statement) ||
    (ts.isVariableStatement(statement) && statement.declarationList.declarations.every((declaration) => declaration.initializer !== undefined && ts.isAsExpression(declaration.initializer)));
  // The statement's kind by name (ts.SyntaxKind's reverse mapping gives an alias, FirstStatement, for a variable statement).
  const kind = (statement: ts.Statement) =>
    ts.isVariableStatement(statement) ? 'VariableStatement' : ts.isExpressionStatement(statement) ? 'ExpressionStatement' : ts.isFunctionDeclaration(statement) ? 'FunctionDeclaration' : ts.isClassDeclaration(statement) ? 'ClassDeclaration' : ts.isExportDeclaration(statement) ? 'ExportDeclaration' : ts.SyntaxKind[statement.kind];
  return source.statements.filter((statement) => !typeOnly(statement)).map((statement) => `${file}:${String(source.getLineAndCharacterOfPosition(statement.getStart()).line + 1)}: ${kind(statement)}`);
}

describe('the files a shard holds that Stryker finds no mutant in (stryker/shards.json, noMutants)', () => {
  it('lists only files a shard holds, sorted, each nothing but imports, re-exports, types and as-const values', () => {
    const noMutants = readNoMutants();
    expect(noMutants).toEqual(['packages/ledger/src/index.ts', 'packages/money/src/index.ts', 'packages/packets/src/explain/index.ts', 'packages/pricing/src/index.ts', 'packages/pricing/src/types.ts']);
    const held = readShards().flatMap((shard) => Object.values(shard.mutate).flatMap((files) => [...(files ?? [])]));
    for (const file of noMutants) {
      expect(held, file).toContain(file);
      expect(statementsWithMutants(file), file).toEqual([]);
    }
  });

  it('refuses a file with code in it: a function, a constant computed at run time, a statement', () => {
    const probe = (text: string) => statementsWithMutants('probe.ts', text);
    expect(probe("import type { A } from './a';\nexport { a } from './a';\nexport * from './b';\nexport type T = 'x' | 'y';\nexport interface I { readonly a: A }\nexport const NAMES = ['a', 'b'] as const;\n")).toEqual([]);
    expect(probe('export const total = (a: number, b: number) => a + b;\n')).toEqual(['probe.ts:1: VariableStatement']);
    expect(probe("export const LIMIT = 10 * 2;\nconsole.log('x');\nexport function f() {}\nconst a = 1;\nexport { a };\n")).toEqual(['probe.ts:1: VariableStatement', 'probe.ts:2: ExpressionStatement', 'probe.ts:3: FunctionDeclaration', 'probe.ts:4: VariableStatement', 'probe.ts:5: ExportDeclaration']);
    expect(statementsWithMutants('packages/money/src/cents.ts').length).toBeGreaterThan(0);
  });
});
