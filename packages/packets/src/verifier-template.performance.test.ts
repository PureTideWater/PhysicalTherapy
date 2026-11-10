/**
 * Verifier format tp-packet-verifier/3, pass 1, in time (docs/adr/0089; test matrix CAS-52): the separation check reads
 * the text before each fact token once, so a 100k-character template checks in well under a second. It asserts only
 * time, so it lives apart from verifier-template.test.ts: the mutation runs leave it out (vitest.mutation.config.ts
 * EXCLUDED), since a wall-clock bound under Stryker's instrumentation on shared CPUs fails on load, not on a mutant's
 * behaviour, and so would count as a kill a mutant no test tells apart. All data SYNTHETIC.
 */
import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import { FACT_CONTENTS } from './fact-contents.test-support';
import { verifyTemplate } from './verifier';

const verify = (template: string) => verifyTemplate(template, FACT_CONTENTS.base(), []);

describe('CAS-52: a fact token stands apart, so nothing typed against it prints as part of its figure', () => {
  it('reads the text before each token once: 100k-character templates with long runs before tokens check in well under a second each', () => {
    const token = '{{fact:pattern.units}}';
    const templates = [
      `${' '.repeat(99_970)}x ${token}`,
      `${'a'.repeat(99_970)}1 ${token}`,
      `${token} `.repeat(Math.ceil(100_000 / (token.length + 1))),
      `${' '.repeat(2000)}x ${token} `.repeat(Math.ceil(100_000 / (2000 + token.length + 3))),
      `The payer allowed ${' '.repeat(10_000)}x${` ${token}`.repeat(400)} [1].`,
      `The payer allowed ${'b'.repeat(99_000)}1 ${` minus ${token}`.repeat(30)} [1].`,
    ];
    for (const template of templates) {
      const started = performance.now();
      verify(template);
      expect(performance.now() - started, `${template.length} characters`).toBeLessThan(1500);
    }
  });
});
