import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ADJUSTMENT_FLAGS, COMPUTED_CONTRACT_WINDOW_RULE, CONTRACT_VERSION_STATES, DISPUTE_WINDOW_STARTS, DISPUTE_WINDOW_UNITS, RATE_METHODS, TIMED_UNITS_RULES } from './index';

describe('@tp/contracts', () => {
  it('lists the rate methods of PRD section 9', () => {
    expect(RATE_METHODS).toEqual(['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'PER_VISIT', 'UNSUPPORTED']);
  });

  it('lists the contract version states in lifecycle order', () => {
    expect(CONTRACT_VERSION_STATES).toEqual(['draft', 'proposed', 'approved', 'signed_off', 'superseded']);
  });

  it('lists the four Medicare adjustment flags', () => {
    expect(ADJUSTMENT_FLAGS).toEqual(['apply_mppr', 'apply_assistant_reduction', 'apply_sequestration', 'apply_ncci']);
  });

  it('lists the dispute window’s units and starts, and computes one rule: calendar days after the payment date (best-option audit #5)', () => {
    expect(DISPUTE_WINDOW_UNITS).toEqual(['calendar_days', 'business_days', 'months']);
    expect(DISPUTE_WINDOW_STARTS).toEqual(['date_of_service', 'remittance_date', 'payment_date', 'receipt_date']);
    expect(COMPUTED_CONTRACT_WINDOW_RULE).toEqual({ unit: 'calendar_days', measuredFrom: 'payment_date' });
  });

  it('lists the timed-units rules', () => {
    expect(TIMED_UNITS_RULES).toEqual(['MEDICARE_POOLED', 'PER_CODE', 'UNKNOWN']);
  });

  it('reaches no document parser from its main entry, which the web app bundles (ADR 0033)', () => {
    const seen = new Set<string>();
    const external = new Set<string>();
    const visit = (file: string): void => {
      if (seen.has(file)) {
        return;
      }
      seen.add(file);
      for (const match of readFileSync(file, 'utf8').matchAll(/^(?:import|export)\s[^;]*?from\s+'([^']+)';/gms)) {
        const specifier = match[1] as string;
        if (specifier.startsWith('.')) {
          const target = path.resolve(path.dirname(file), specifier);
          visit(existsSync(`${target}.ts`) ? `${target}.ts` : path.join(target, 'index.ts'));
        } else {
          external.add(specifier);
        }
      }
    };
    visit(path.join(import.meta.dirname, 'index.ts'));
    const reached = [...seen].map((file) => path.relative(import.meta.dirname, file));
    expect(reached).not.toContain('evidence/pages.ts');
    expect(reached).not.toContain('evidence/page-thread.ts');
    expect([...external].filter((name) => name.startsWith('pdfjs-dist') || name === 'yauzl' || name === 'node:worker_threads')).toEqual([]);
    expect(reached).toContain('evidence/resolve.ts');
  });
});
