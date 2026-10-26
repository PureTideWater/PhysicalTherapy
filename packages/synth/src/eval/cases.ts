/**
 * The evaluation sets as registry cases (docs/adr/0023): MOD-01 carries the contract set beside its
 * recorded proposal, MOD-03 the narrative set, MOD-09 the contract set v2 (docs/adr/0070 Part 1). pnpm
 * synth --all writes them like every other case, and the fixtures test holds the committed files to a
 * fresh generation; MOD-09's large tier is generated at test time and its expected.json pins its hashes.
 */
import { type CaseBuilder } from '../cases/builder';
import { CONTRACT_SET_DIR, CONTRACT_SET_SIZE, contractSetFiles, contractSetSpecs } from './contract-set';
import { CONTRACT_SET_V2_DIR, CONTRACT_SET_V2_SIZE, INJECTION_CANARY, LARGE_CONTRACT_DIR, contractSetV2Files } from './contract-set-v2';
import { type ContractSetManifest, type ContractSetV1Manifest } from './formats';
import { largeContractFacts } from './large-contracts';
import { NARRATIVE_SET_DIR, NARRATIVE_SET_SIZE, narrativeSetCases, narrativeSetFiles } from './narrative-set';

/** Adds the 40-case contract evaluation set to the MOD-01 case. */
export function addContractSet(b: CaseBuilder): void {
  const files = contractSetFiles();
  for (const file of files) {
    b.addFile(file.path, file.bytes, file.kind, file.description);
  }
  const manifest = JSON.parse(String(files[0]?.bytes)) as ContractSetV1Manifest;
  const count = (key: 'layout' | 'kind', value: string) => manifest.cases.filter((item) => item[key] === value).length;
  const methods: Record<string, number> = {};
  for (const spec of contractSetSpecs()) {
    methods[spec.method] = (methods[spec.method] ?? 0) + 1;
  }
  b.scenario({
    contractSet: {
      dir: CONTRACT_SET_DIR,
      cases: CONTRACT_SET_SIZE,
      layouts: { table: count('layout', 'table'), prose: count('layout', 'prose'), scanned: count('layout', 'scanned') },
      kinds: { contract: count('kind', 'contract'), exhibit: count('kind', 'exhibit') },
      methods,
      records: manifest.cases.reduce((sum, item) => sum + item.records, 0),
      fields: manifest.cases.reduce((sum, item) => sum + item.fields, 0),
    },
  });
  b.outcome({
    contractSet: 'every true field quotes its own page; the evaluation harness scores each proposal field by field against truth.json, and every quote the local provider returns verifies',
  });
}

/** The MOD-03 case: the 300-case narrative set. */
export function addNarrativeSet(b: CaseBuilder): void {
  for (const file of narrativeSetFiles()) {
    b.addFile(file.path, file.text, 'json', file.description);
  }
  const methods: Record<string, number> = {};
  for (const item of narrativeSetCases()) {
    methods[item.method] = (methods[item.method] ?? 0) + 1;
  }
  b.scenario({ narrativeSet: { dir: NARRATIVE_SET_DIR, cases: NARRATIVE_SET_SIZE, methods } });
  b.outcome({ gate: 'zero critical errors: every case’s narrative passes the packets verifier, states its required facts, and follows the prompt’s schema' });
}

/**
 * The MOD-09 case: the contract set v2's manifest and its 18 committed cases, and the large tier's
 * files as generated entries (each path, size and SHA-256), which ensureLargeContractTier() writes into
 * MOD-09/generated/ and holds to these pins. The case has committed files, so it needs no noFiles().
 */
export function addContractSetV2(b: CaseBuilder): void {
  const files = contractSetV2Files();
  for (const file of files) {
    b.addFile(file.path, file.bytes, file.kind, file.description);
  }
  for (const file of largeContractFacts()) {
    b.generatedFile({ path: file.path, sha256: file.sha256, bytes: file.bytes, description: `${file.description} Generated at test time by ensureLargeContractTier() from @tp/synth.` });
  }
  b.addAuxiliary('.gitignore', 'generated/\n');
  const manifest = JSON.parse(String(files[0]?.bytes)) as ContractSetManifest;
  const count = <K extends 'tier' | 'layout' | 'kind' | 'pageText'>(key: K, value: string) => manifest.cases.filter((item) => item[key] === value).length;
  b.scenario({
    contractSetV2: {
      dir: CONTRACT_SET_V2_DIR,
      generatedDir: LARGE_CONTRACT_DIR,
      cases: CONTRACT_SET_V2_SIZE,
      tiers: { small: count('tier', 'small'), medium: count('tier', 'medium'), large: count('tier', 'large') },
      layouts: { table: count('layout', 'table'), prose: count('layout', 'prose'), scanned: count('layout', 'scanned') },
      kinds: { contract: count('kind', 'contract'), exhibit: count('kind', 'exhibit') },
      pageText: { faithful: count('pageText', 'faithful'), unfaithful: count('pageText', 'unfaithful') },
      records: manifest.cases.reduce((sum, item) => sum + item.records, 0),
      fields: manifest.cases.reduce((sum, item) => sum + item.fields, 0),
      canary: INJECTION_CANARY,
    },
  });
  b.outcome({
    contractSetV2:
      'every true field quotes its page as a person sees it, and on an unfaithful case where the text as read differs the field as a faithful copier of that text would write it; the gate counts wrong-but-verified fields apart from rejected and missed ones, holds them to zero on faithful cases, and refuses comparison when the set changes',
  });
}
