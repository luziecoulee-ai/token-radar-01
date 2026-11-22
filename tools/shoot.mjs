import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const shots = join(root, 'screenshots');
const output = join(root, 'out');
const profile = join(root, 'out-chrome-profile');
const snapshot = join(homedir(), '.makefun/work/token-radar-01-kit-extract/token-radar-01-kit/input/snapshot.json');
const chrome = '/opt/meta-chromium/chrome';
const names = ['1-board.png', '2-detail.png', '3-filtered.png'];
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}
function capture(url, path) {
  run(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${profile}`, '--window-size=1440,900', '--virtual-time-budget=5000', `--screenshot=${path}`, url]);
}
mkdirSync(shots, { recursive: true });
// main.ts validates screenshot presence even on the first build.
const missing = names.filter(name => !existsSync(join(shots, name)));
if (missing.length) {
  const placeholder = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aXcAAAAASUVORK5CYII=', 'base64');
  for (const name of missing) writeFileSync(join(shots, name), placeholder);
}
try {
  rmSync(output, { recursive: true, force: true });
  const build = () => run(process.execPath, ['main.ts', '--input', snapshot, '--output', output]);
  build();
  const board = JSON.parse(readFileSync(join(output, 'board.json'), 'utf8'));
  const page = pathToFileURL(join(output, 'dashboard/index.html')).href;
  for (const [name, query] of [[names[0], ''], [names[1], `?slug=${encodeURIComponent(board.rows[0].slug)}`], [names[2], '?sort=change']]) {
    const path = join(shots, name);
    capture(page + query, path);
    console.log(`${name}: ${statSync(path).size} bytes`);
  }
  build();
} catch (error) {
  for (const name of missing) if (existsSync(join(shots, name)) && statSync(join(shots, name)).size === 68) rmSync(join(shots, name));
  throw error;
} finally {
  rmSync(profile, { recursive: true, force: true });
}
