import { describe, expect, it, vi } from 'vitest';

import { InputRefusedError } from './errors';
import { contractTermsSpec, screenContractPages } from './functions/contract-terms';
import { denialLetterSpec } from './functions/denial-letter';
import { evidenceRequestsSpec } from './functions/evidence-requests';
import { narrativeSpec } from './functions/narrative';
import { ModelGateway } from './gateway';
import * as entry from './index';
import type { PurposeSpec } from './spec';
import { PURPOSE_SPECS } from './specs';
import { SYNTHETIC_IDS, localGateway, syntheticContractInput, syntheticPracticeCheck } from './testing';

/**
 * The purposes' specs cannot be changed in-process (combined audit item 120's review, F6; docs/adr/0070, Part 3): the
 * spec decides whether the contract screen runs (gateway.ts calls spec.screen), so the map and each spec are frozen
 * and their members readonly, and the map is not on the package's entry. SYNTHETIC data only.
 */

const SPECS = [contractTermsSpec, denialLetterSpec, narrativeSpec, evidenceRequestsSpec];

describe('the purposes’ specs', () => {
  it('are frozen, the map and every spec, and the contract spec’s screen is the contract screen', () => {
    expect(Object.isFrozen(PURPOSE_SPECS)).toBe(true);
    for (const spec of Object.values(PURPOSE_SPECS)) {
      expect(Object.isFrozen(spec), spec.purpose).toBe(true);
    }
    expect(Object.values(PURPOSE_SPECS)).toEqual(SPECS);
    expect(SPECS.every((spec) => Object.isFrozen(spec))).toBe(true);
    expect(PURPOSE_SPECS.proposeContractTerms.screen).toBe(screenContractPages);
  });

  it('refuse an assignment or a delete of the screen, or of the map’s entry, with a TypeError (and none compiles)', () => {
    const spec: PurposeSpec<unknown, unknown, unknown> = PURPOSE_SPECS.proposeContractTerms as unknown as PurposeSpec<unknown, unknown, unknown>;
    expect(() => {
      // @ts-expect-error screen is readonly
      spec.screen = () => Promise.resolve();
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error screen is readonly
      delete spec.screen;
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error prepare is readonly
      spec.prepare = () => ({ user: '', inputHashes: [], variant: 'default', context: undefined });
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error the map's entries are readonly
      PURPOSE_SPECS.proposeContractTerms = { ...contractTermsSpec, screen: undefined };
    }).toThrow(TypeError);
    expect(() => Object.defineProperty(contractTermsSpec, 'screen', { value: undefined })).toThrow(TypeError);
    expect(PURPOSE_SPECS.proposeContractTerms.screen).toBe(screenContractPages);
  });

  it('are frozen where each is defined, so a module loaded before the registry cannot change one either', async () => {
    // A fresh module graph with no ./specs.ts: each spec module, loaded alone, already exports its spec frozen.
    vi.resetModules();
    const [contract, letter, narrative, evidence] = await Promise.all([import('./functions/contract-terms'), import('./functions/denial-letter'), import('./functions/narrative'), import('./functions/evidence-requests')]);
    for (const spec of [contract.contractTermsSpec, letter.denialLetterSpec, narrative.narrativeSpec, evidence.evidenceRequestsSpec]) {
      expect(Object.isFrozen(spec), spec.purpose).toBe(true);
    }
  });

  it('are run by a gateway whose methods cannot be replaced, on its prototype or on an instance', () => {
    expect(Object.isFrozen(ModelGateway.prototype)).toBe(true);
    const methods = ModelGateway.prototype as unknown as Record<string, unknown>;
    expect(() => {
      methods.screen = () => Promise.resolve();
    }).toThrow(TypeError);
    expect(() => Object.defineProperty(ModelGateway.prototype, 'limited', { value: () => Promise.resolve() })).toThrow(TypeError);
    const { gateway } = localGateway();
    const instance = gateway as unknown as Record<string, unknown>;
    expect(Object.isFrozen(gateway)).toBe(true);
    expect(() => {
      instance.screen = () => Promise.resolve();
    }).toThrow(TypeError);
    expect(() => Object.defineProperty(gateway, 'screen', { value: () => Promise.resolve() })).toThrow(TypeError);
  });

  it('so a contract naming a held member ID is still refused after any such attempt', async () => {
    // Reflect answers false, without throwing, where the object refuses the change.
    expect(Reflect.deleteProperty(PURPOSE_SPECS.proposeContractTerms, 'screen')).toBe(false);
    expect(Reflect.set(PURPOSE_SPECS, 'proposeContractTerms', { ...contractTermsSpec, screen: undefined })).toBe(false);
    const { gateway, local } = localGateway();
    const input = syntheticContractInput({ pages: ['SYNTHETIC EXPLANATION OF BENEFITS', 'Member ID:ZZ 123 4567'], patientRecords: syntheticPracticeCheck(SYNTHETIC_IDS.practice, { memberIds: ['ZZ1234567'] }) });
    const refusal = gateway.proposeContractTerms({ practiceId: SYNTHETIC_IDS.practice, requestKey: 'request-specs-1' }, input);
    await expect(refusal).rejects.toBeInstanceOf(InputRefusedError);
    await expect(refusal).rejects.toMatchObject({ code: 'names_patient' });
    expect(local.requests).toEqual([]);
  });

  it('are not on the package’s entry, nor is the synthetic check: production code reaches neither', () => {
    expect('PURPOSE_SPECS' in entry).toBe(false);
    expect('syntheticRecordsCheck' in entry).toBe(false);
    expect(typeof entry.requestFor).toBe('function');
    expect(typeof entry.practiceRecordsCheck).toBe('function');
  });
});
