import { RELEASE_COMMANDS, isReleaseCommand } from './commands';

/** `pnpm release:prepare | release:dry-run | release:load`: placeholders until milestone 0 part B. */
const [command] = process.argv.slice(2);
if (isReleaseCommand(command)) {
  process.stdout.write(`release:${command}: not implemented yet (milestone 0 part B); nothing was changed.\n`);
} else {
  process.stderr.write(`usage: pnpm release:<${RELEASE_COMMANDS.join('|')}> [release-number]\n`);
  process.exitCode = 2;
}
