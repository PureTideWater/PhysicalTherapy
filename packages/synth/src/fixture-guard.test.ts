import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { render835 } from './cases/builder';
import { minimalFile } from './cases/par';
import { writeZip } from './formats/zip';
import { SyntheticSenderError, assertSyntheticX12 } from './write';

/**
 * Test matrix SEC-14: a fixture with a non-synthetic sender is refused. The non-synthetic interchange
 * is built in memory from a synthetic one and handed to the hook on stdin, exactly as Claude Code
 * hands it a Write; it is never written to disk.
 */
const repository = path.resolve(import.meta.dirname, '../../..');
const hook = path.join(repository, '.claude/hooks/fixture-guard.sh');

const synthetic = render835(minimalFile()).text;
/** The same interchange with another sender in ISA06, padded to fifteen characters. */
const otherSender = synthetic.replace('SYNTHSENDER    ', 'OTHERSENDER    ');

function runHook(content: string) {
  const input = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: path.join(repository, 'fixtures/synthetic/PAR-01/remit.835'), content } });
  return spawnSync('bash', [hook], { input, encoding: 'utf8' });
}

describe('the fixture hook (SEC-14)', () => {
  it('refuses a Write of X12 content whose sender is not SYNTHSENDER', () => {
    const result = runHook(otherSender);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('not SYNTHSENDER');
  });

  it('lets a synthetic interchange through', () => {
    expect(runHook(synthetic).status).toBe(0);
  });
});

describe('the fixture writer guard', () => {
  it('refuses a non-synthetic sender, a non-synthetic GS02, and either inside a zip or after a BOM', () => {
    const bytes = (text: string) => new Uint8Array(Buffer.from(text, 'utf8'));
    expect(() => assertSyntheticX12(bytes(synthetic), 'ok')).not.toThrow();
    expect(() => assertSyntheticX12(bytes(otherSender), 'isa')).toThrow(SyntheticSenderError);
    expect(() => assertSyntheticX12(bytes(synthetic.replace('*SYNTH*', '*OTHER*')), 'gs')).toThrow(/GS02/);
    expect(() => assertSyntheticX12(bytes(`\uFEFF${otherSender}`), 'bom')).toThrow(SyntheticSenderError);
    expect(() => assertSyntheticX12(writeZip([{ name: 'a.835', bytes: bytes(otherSender) }]), 'zip')).toThrow(/zip!a\.835/);
    expect(() => assertSyntheticX12(bytes('Code,Description\n'), 'csv')).not.toThrow();
  });

  it('reads each interchange with its own delimiters, so a second sender behind other delimiters is refused', () => {
    const bytes = (text: string) => new Uint8Array(Buffer.from(text, 'utf8'));
    const otherDelimiters = (text: string) => text.replaceAll('*', '|').replaceAll(':', '>').replaceAll('~', "'");
    const second = otherDelimiters(synthetic);
    expect(() => assertSyntheticX12(bytes(`${synthetic}\r\n${second}`), 'two')).not.toThrow();
    expect(() => assertSyntheticX12(bytes(`${synthetic}${otherDelimiters(otherSender)}`), 'isa')).toThrow(/ISA06/);
    expect(() => assertSyntheticX12(bytes(`${synthetic}\n${otherDelimiters(synthetic.replace('*SYNTH*', '*OTHER*'))}`), 'gs')).toThrow(/GS02/);
    // A line feed as the terminator, a blank line, then the other sender.
    const newline = synthetic.replaceAll('~', '\n');
    expect(() => assertSyntheticX12(bytes(`${newline}\n${second}`), 'newline')).not.toThrow();
    expect(() => assertSyntheticX12(bytes(`${newline}\n${otherDelimiters(otherSender)}`), 'newline-isa')).toThrow(/ISA06/);
    // A second interchange cut inside its header, after or before ISA06.
    expect(() => assertSyntheticX12(bytes(`${synthetic}${otherSender.slice(0, 60)}`), 'cut')).toThrow(/ISA06/);
    expect(() => assertSyntheticX12(bytes(`${synthetic}${otherSender.slice(0, 40)}`), 'cut-early')).toThrow(/ISA06/);
    expect(() => assertSyntheticX12(bytes(`${synthetic}${synthetic.slice(0, 40)}`), 'cut-synthetic')).not.toThrow();
  });
});
