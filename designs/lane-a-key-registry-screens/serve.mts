// Starts the e2e web server exactly as playwright.config.ts would (same command, same environment), and keeps it up. NOBUILD=1 skips the build.
import { spawn } from 'node:child_process';
import config from '/home/user/PhysicalTherapy/apps/web/playwright.config.ts';
const server = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer;
if (!server) throw new Error('no webServer');
const child = spawn('bash', ['-c', process.env.NOBUILD === '1' ? server.command.replace('pnpm run build', 'true') : server.command], { cwd: '/home/user/PhysicalTherapy/apps/web', env: { ...process.env, ...server.env }, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
