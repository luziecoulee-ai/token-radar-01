import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir, tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const shots = join(root, 'screenshots'), output = join(root, 'out');
const profile = join(tmpdir(), `radar-chrome-${process.pid}`);
const allowlist = join(tmpdir(), `radar-webgl-${process.pid}.txt`);
const snapshot = join(homedir(), '.makefun/work/token-radar-01-kit-extract/token-radar-01-kit/input/snapshot.json');
const names = ['1-board.jpg', '2-detail.jpg', '3-model.jpg', '4-filtered.jpg'];
function build() {
  const result = spawnSync(process.execPath, ['main.ts', '--input', snapshot, '--output', output], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`build exited with status ${result.status}`);
}
mkdirSync(shots, { recursive: true });
const legacy = ['1-board.png', '2-detail.png', '3-filtered.png'];
const backups = new Map([...legacy, ...names].filter(name => existsSync(join(shots, name))).map(name => [name, readFileSync(join(shots, name))]));
for (const name of legacy) rmSync(join(shots, name), { force: true });
// A one-pixel JPEG satisfies the build prerequisite before the first capture.
const placeholder = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==', 'base64');
const missing = names.filter(name => !existsSync(join(shots, name)));
for (const name of missing) writeFileSync(join(shots, name), placeholder);
let chrome, ws;
try {
  rmSync(output, { recursive: true, force: true });
  build();
  const board = JSON.parse(readFileSync(join(output, 'board.json'), 'utf8'));
  const page = pathToFileURL(join(output, 'dashboard/index.html')).href;
  const views = ['', `?slug=${encodeURIComponent(board.rows[0].slug)}`, '?tab=model', `?cat=${encodeURIComponent('Risk Curators')}&wl=1`];
  const policy = 'hatch-webgl-all-origins-v1\n';
  writeFileSync(allowlist, policy);
  const sha = createHash('sha256').update(policy).digest('hex');
  const port = 9333;
  chrome = spawn('/opt/meta-chromium/chrome', [
    `--hatch-webgl-allowed-domains-file=${allowlist}`,
    `--hatch-webgl-allowed-domains-sha256=${sha}`,
    '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    `--user-data-dir=${profile}`, '--headless=new', `--remote-debugging-port=${port}`, 'about:blank',
  ], { stdio: 'ignore' });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let version;
  for (let i = 0; i < 50; i++) {
    try { const response = await fetch(`http://127.0.0.1:${port}/json/version`); if (response.ok) { version = await response.json(); break; } } catch {}
    await sleep(200);
  }
  if (!version) throw new Error('chromium CDP did not come up');
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 1;
  const pending = new Map(), listeners = [];
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result); }
    else if (msg.method) for (const listener of [...listeners]) listener(msg);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  for (let i = 0; i < names.length; i++) {
    const loaded = new Promise(resolve => { const listener = msg => { if (msg.method === 'Page.loadEventFired' && msg.sessionId === sessionId) { listeners.splice(listeners.indexOf(listener), 1); resolve(); } }; listeners.push(listener); });
    await send('Page.navigate', { url: page + views[i] }, sessionId);
    await loaded;
    await sleep(900);
    await send('Runtime.evaluate', { expression: "(() => { const s = document.createElement('style'); s.textContent = '::-webkit-scrollbar{display:none}'; document.head.appendChild(s); })()" }, sessionId);
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80, fromSurface: true }, sessionId);
    const path = join(shots, names[i]);
    writeFileSync(path, Buffer.from(shot.data, 'base64'));
    console.log(`${names[i]}: ${statSync(path).size} bytes`);
  }
  build();
} catch (error) {
  for (const name of names) rmSync(join(shots, name), { force: true });
  for (const [name, contents] of backups) writeFileSync(join(shots, name), contents);
  throw error;
} finally {
  if (ws) ws.close();
  if (chrome) chrome.kill('SIGKILL');
  rmSync(profile, { recursive: true, force: true });
  rmSync(allowlist, { force: true });
}
