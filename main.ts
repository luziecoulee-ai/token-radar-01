import { readFileSync, readdirSync, mkdirSync, copyFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot, buildRadar, boardIssue, dataScript } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const usage = 'Usage: node main.ts [--input <file|dir>] [--output <dir>] [--help]';
const args = process.argv.slice(2);
if (args.includes('--help')) { console.log(usage); process.exit(0); }
let input = '/input', output = process.env.MAKEFUN_OUTPUT_DIR || '/output';
for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--input' || args[i] === '--output') && args[i + 1] && !args[i + 1].startsWith('--')) {
    if (args[i] === '--input') input = args[++i]; else output = args[++i];
  } else { console.error(`Invalid argument: ${args[i]}\n${usage}`); process.exit(2); }
}
let source: string;
try { const path = statSync(input).isDirectory() ? join(input, 'snapshot.json') : input; source = readFileSync(path, 'utf8'); }
catch { console.error(`Cannot read snapshot at ${input} (expected a file or a directory containing snapshot.json)`); process.exit(2); }
const root = dirname(fileURLToPath(import.meta.url));
function copyTree(from: string, to: string) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const src = join(from, entry.name), dst = join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dst);
    else if (entry.isFile()) copyFileSync(src, dst);
  }
}
try {
  const snapshot = parseSnapshot(source);
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue) throw new Error(issue);
  const shots = join(root, 'screenshots');
  let count = 0;
  try { count = readdirSync(shots, { withFileTypes: true }).filter(e => e.isFile() && /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(e.name)).length; } catch { /* reported below */ }
  if (count < 3) throw new Error('At least 3 screenshots with valid names are required in screenshots/');
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'board.json'), JSON.stringify({ rows: board }) + '\n');
  writeFileSync(join(output, 'data.js'), dataScript({ ...radar, protocols_scanned: snapshot.protocols.length, watchlist_total: snapshot.watchlist.length }));
  for (const dir of ['dashboard', 'screenshots']) {
    const dest = join(output, dir);
    if (resolve(dest) === resolve(root, dir)) throw new Error('Output must not overwrite repository source directories');
    rmSync(dest, { recursive: true, force: true });
    copyTree(join(root, dir), dest);
  }
  writeFileSync(join(output, 'dossier.json'), buildDossier(output, { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 }, dashboard: { max_files: 400, max_bytes: 4194304 } }));
  console.log(`${snapshot.protocols.length} protocols scanned; ${radar.watchlist_size} watchlist rows; ${board.length} board rows.`);
  console.log(`Wrote board.json, data.js, dashboard/, screenshots/ and dossier.json to ${output}.`);
  const p = radar.model;
  console.log(`Coefficients (fitted): growth+ ${p.growth_positive_weight}, growth- ${p.growth_negative_weight}, age base ${p.age_base}, age weight ${p.age_weight}, breadth ${p.breadth_per_extra_chain}.`);
  console.log(`Holdout median |log10 error|: ${radar.validation.holdout.map(h => `fit ${h.fit_half} -> test ${h.test_half}: fitted ${h.fitted} vs unadjusted ${h.neutral}`).join('; ')}.`);
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
