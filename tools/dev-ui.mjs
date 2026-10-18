import { build } from 'vite';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const configFile = fileURLToPath(new URL('../ui/vite.config.mjs', import.meta.url));
await build({ configFile });
const watcher = await build({ configFile, build: { watch: {} } });
const server = spawn(process.execPath, ['tools/serve-live.mjs', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', windowsHide: true });
async function stop() { server.kill(); await watcher.close(); }
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
server.once('exit', async code => { await watcher.close(); process.exitCode = code || 0; });
