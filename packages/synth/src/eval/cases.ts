/**
 * The evaluation sets as registry cases (docs/adr/0023): MOD-01 carries the contract set beside its
 * recorded proposal, MOD-03 the narrative set. pnpm synth --all writes them like every other case, and
 * the fixtures test holds the committed files to a fresh generation.
 */
import { type CaseBuilder } from '../cases/builder';
import { CONTRACT_SET_DIR, CONTRACT_SET_SIZE, contractSetFiles, contractSetSpecs } from './contract-set';
import { type ContractSetManifest } from './formats';
import { NARRATIVE_SET_DIR, NARRATIVE_SET_SIZE, narrativeSetCases, narrativeSetFiles } from './narrative-set';

/** Adds the 40-case contract evaluation set to the MOD-01 case. */
export function addContractSet(b: CaseBuilder): void {
  const files = contractSetFiles();
  for (const file of files) {
    b.addFile(file.path, file.bytes, file.kind, file.description);
  }
  const manifest = JSON.parse(String(files[0]?.bytes)) as ContractSetManifest;
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
