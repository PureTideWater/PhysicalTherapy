import { existsSync, readFileSync } from 'node:fs';

import { SyntheticSenderError, assertSyntheticFixture } from '../write';
import { type HookInput, resultingText } from './hook';

/**
 * The fixture guard for a hook or a shell, one implementation with the writer and CI (docs/adr/0059):
 *
 *   tsx packages/synth/src/guard/cli.ts --label <repository path>                          < file bytes
 *   tsx packages/synth/src/guard/cli.ts --hook --label <repository path> --file <absolute>  < hook JSON
 *
 * With --hook, stdin is Claude Code's PreToolUse input for a Write, Edit or MultiEdit; the file the call
 * would leave is rebuilt from it and from the file on disk at --file. Exit 0 lets the file through; exit 2
 * refuses it, naming the file and the rule on stderr, and so does anything unexpected: the guard fails closed.
 */
function option(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
}

async function stdin(): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of process.stdin) {
    parts.push(part as Buffer);
  }
  return Buffer.concat(parts);
}

try {
  const args = process.argv.slice(2);
  const label = option(args, '--label');
  if (label === undefined || label === '') {
    throw new Error('usage: cli.ts [--hook --file <absolute path>] --label <repository path>');
  }
  const input = await stdin();
  let bytes: Uint8Array | null = input;
  if (args.includes('--hook')) {
    const file = option(args, '--file');
    if (file === undefined) {
      throw new Error('--hook needs --file <absolute path>');
    }
    const text = resultingText(JSON.parse(input.toString('utf8')) as HookInput, existsSync(file) ? readFileSync(file, 'utf8') : null);
    bytes = text === null ? null : new Uint8Array(Buffer.from(text, 'utf8'));
  }
  if (bytes !== null) {
    assertSyntheticFixture(bytes, label);
  }
} catch (error) {
  if (error instanceof SyntheticSenderError) {
    process.stderr.write(`Blocked: ${error.message}. Fixtures are synthetic: generate them with pnpm synth (.claude/rules/fixtures.md).\n`);
  } else {
    process.stderr.write(`Blocked: the fixture guard could not check this file (${error instanceof Error ? error.name : 'error'}), so it is refused.\n`);
  }
  process.exitCode = 2;
}
