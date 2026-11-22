/**
 * Product model: value pre-token protocols using snapshot market-cap / TVL peer
 * multiples, winsorized and shrunk toward the global median by category. Apply
 * bounded seven-day growth, listing age and chain-breadth factors to TVL. These
 * are model estimates derived solely from the snapshot, not market prices.
 * All watchlist matches are mandatory. Other rows must be pre-token and exclude
 * exchanges, versioned or wrapped/staking names, liquid staking/restaking,
 * restaked BTC, Bridge and Canonical Bridge categories, and names whose first
 * word matches a live protocol name or symbol or whose whole name is a live
 * symbol. Candidates are selected by TVL, with an initial category cap of 30,
 * up to 220 rows, then ranked by implied value.
 */
export type SnapshotProtocol = {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
};
export type Snapshot = { as_of: string; source: string; floor_usd: number; protocols: SnapshotProtocol[]; watchlist: string[] };
type Factors = { category_multiple: number; peer_count: number; growth_factor: number; age_factor: number; breadth_factor: number };
export type BoardRow = SnapshotProtocol & { rank: number; token_status: 'pre-token'; age_days: number | null; implied_value_usd: number; watchlist: boolean; model: Factors; farm_steps: string[] };
export type RadarData = {
  as_of: string; source: string; floor_usd: number; model_version: string; model: typeof MODEL;
  watchlist_size: number; board_size: number; early_size: number; live_size: number;
  categories: { category: string | null; peers: number; median_multiple: number; multiple: number }[];
  rows: { rank: number; slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number; change_7d: number | null; age_days: number | null; implied_value_usd: number; implied_multiple: number; watchlist: boolean; factors: Factors; farm_steps: string[] }[];
  live: { slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number; mcap_usd: number; change_7d: number | null; ratio: number }[];
};
export const MODEL_VERSION = 'peer-multiple-1';
export const MODEL = {
  peer_ratio_min: 0.02, peer_ratio_max: 3.0, shrinkage_peers: 6,
  category_multiple_min: 0.03, category_multiple_max: 2.5,
  growth_pct_min: -50, growth_pct_max: 100, positive_growth_weight: 0.30, negative_growth_weight: 0.45,
  unknown_age_days: 365, age_base: 0.75, age_weight: 0.50, age_cap_days: 730,
  breadth_per_extra_chain: 0.04, breadth_extra_chain_cap: 5,
} as const;
class SnapshotError extends Error { constructor(message: string) { super(message); this.name = 'SnapshotError'; } }
const fail = (message: string): never => { throw new SnapshotError(message); };
const record = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown, path: string): string => typeof x === 'string' ? x : fail(`${path} must be a string`);
const num = (x: unknown, path: string): number => typeof x === 'number' && Number.isFinite(x) ? x : fail(`${path} must be a finite number`);
const nullableString = (x: unknown, path: string): string | null => x === null ? null : str(x, path);
const nullableNumber = (x: unknown, path: string): number | null => x === null ? null : num(x, path);
const strings = (x: unknown, path: string): string[] => Array.isArray(x) ? x.map((v, i) => str(v, `${path}[${i}]`)) : fail(`${path} must be an array`);
export function parseSnapshot(input: unknown): Snapshot {
  let x = input;
  if (typeof x === 'string') { try { x = JSON.parse(x); } catch { return fail('snapshot must be valid JSON'); } }
  if (!record(x)) return fail('snapshot must be an object');
  const as_of = str(x.as_of, 'as_of');
  if (dateValue(as_of) === null) return fail('as_of must be a valid YYYY-MM-DD date');
  const source = str(x.source, 'source');
  const floor_usd = num(x.floor_usd, 'floor_usd');
  if (!Array.isArray(x.protocols)) return fail('protocols must be an array');
  const seen = new Set<string>();
  const protocols = x.protocols.map((p, i): SnapshotProtocol => {
    const path = `protocols[${i}]`;
    if (!record(p)) return fail(`${path} must be an object`);
    const slug = str(p.slug, `${path}.slug`);
    if (!slug || seen.has(slug)) return fail(`${path}.slug must be non-empty and unique`);
    seen.add(slug);
    const tvl_usd = num(p.tvl_usd, `${path}.tvl_usd`);
    const mcap_usd = nullableNumber(p.mcap_usd, `${path}.mcap_usd`);
    return { slug, name: str(p.name, `${path}.name`), category: nullableString(p.category, `${path}.category`), chains: strings(p.chains, `${path}.chains`), tvl_usd, change_7d: nullableNumber(p.change_7d, `${path}.change_7d`), mcap_usd, listed_at: nullableString(p.listed_at, `${path}.listed_at`), gecko_id: nullableString(p.gecko_id, `${path}.gecko_id`), symbol: nullableString(p.symbol, `${path}.symbol`) };
  });
  return { as_of, source, floor_usd, protocols, watchlist: strings(x.watchlist, 'watchlist') };
}
function dateValue(s: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const n = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === s ? n : null;
}
export function ageDays(listed_at: string | null, as_of: string): number | null {
  if (listed_at === null) return null;
  const start = dateValue(listed_at), end = dateValue(as_of);
  return start === null || end === null ? null : Math.max(0, Math.floor((end - start) / 86400000));
}
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number, dp: number) => Number(n.toFixed(dp));
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const catCompare = (a: string | null, b: string | null) => a === null ? (b === null ? 0 : -1) : b === null ? 1 : compare(a, b);
function median(values: number[]): number { const a = [...values].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
const preToken = (p: SnapshotProtocol) => p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
function rankable(p: SnapshotProtocol, liveNames: Set<string>, liveSymbols: Set<string>): boolean {
  const name = p.name.trim().toLowerCase(), firstWord = name.split(/\s+/)[0];
  return preToken(p) && !liveNames.has(firstWord) && !liveSymbols.has(firstWord) && !liveSymbols.has(name) && p.category !== 'CEX' && !/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(p.name) && !/\b(wrapped|staked|staking)\b/i.test(p.name) && !/^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i.test(p.name) && !['Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'Bridge', 'Canonical Bridge'].includes(p.category ?? '');
}
const actions: Record<string, string> = {
  Lending: 'supply USDC and consider a small borrow', CDP: 'open a conservatively collateralized debt position and mint a stablecoin', 'CDP Manager': 'manage a conservative collateralized debt position', Dexs: 'provide liquidity to a liquid trading pair', Derivatives: 'open a small margin position and hedge its exposure', Bridge: 'bridge funds across supported networks', 'Canonical Bridge': 'bridge funds using the canonical route', 'Cross Chain Bridge': 'move funds across supported chains and back', Yield: 'deposit into a yield strategy', 'Yield Aggregator': 'deposit into an aggregated yield vault', 'Risk Curators': 'allocate to a curated risk vault', 'Onchain Capital Allocator': 'allocate capital to an onchain lending market', RWA: 'subscribe to an available tokenized asset vault', 'Basis Trading': 'enter a conservative market-neutral basis strategy', Launchpad: 'join an eligible token launch subscription', 'Prediction Market': 'take a small position in a liquid prediction market', Privacy: 'make a private transfer using the supported app', Chain: 'use a native application and make a network transaction', Farm: 'stake liquidity in an active farm', 'Leveraged Farming': 'open a low-leverage farming position', Indexes: 'mint or buy an available index token', Payments: 'make a small payment through the protocol', Insurance: 'purchase a small amount of protocol cover', Options: 'trade a small, defined-risk option',
};
function farm(p: SnapshotProtocol, age: number | null): string[] {
  const capital = p.tvl_usd >= 1e9 ? 250 : p.tvl_usd >= 1e8 ? 100 : p.tvl_usd >= 1e7 ? 75 : 50;
  const chain = p.chains[0] ?? 'a supported chain';
  const gas = chain === 'Ethereum' ? 'about $6-12 of gas' : ['Arbitrum', 'Base', 'Optimism', 'Polygon', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Blast'].includes(chain) ? 'about $0.10-1 of gas' : 'about $1-3 of gas';
  const days = age === null ? 45 : age < 180 ? 60 : age < 540 ? 45 : 30;
  let hash = 0; for (const ch of p.slug) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
  const action = actions[p.category ?? ''] ?? 'use an available core product';
  const steps = [
    hash % 2 ? 'Create a fresh wallet holding only farm funds and store its seed phrase offline. Cost: free. Time: 10 minutes.' : 'Set up a new wallet solely for farm funds and keep its seed phrase offline. Cost: free. Time: 10 minutes.',
    `Fund the wallet with ${capital} USDC plus a little gas asset on ${chain} using an exchange withdrawal or bridge. Cost: ${capital} USDC plus ${gas}. Time: 15 minutes.`,
    `On ${chain}, use ${p.name} to ${action} with ${capital} USDC. Cost: ${capital} USDC plus ${gas}. Time: 20 minutes.`,
    p.chains.length > 1 ? `Repeat a smaller ${p.name} action on ${p.chains[1]}: ${action} with ${capital / 2} USDC. Cost: ${capital / 2} USDC plus network fees. Time: 20 minutes.` : `Use a second ${p.name} product or pool, or schedule a small top-up to your position. Cost: a small additional deposit plus ${gas}. Time: 15 minutes.`,
    hash % 2 ? `Each week during the ${days}-day hold window, make a qualifying deposit, swap, vote or rebalance. Cost: network fees. Time: 10 minutes weekly.` : `Throughout the ${days}-day hold window, return weekly to deposit, swap, vote or rebalance where eligible. Cost: network fees. Time: 10 minutes weekly.`,
    `Check ${p.name}'s official points or rewards page and announcements for eligibility; claim only through official links and never pay to claim. Cost: free to check. Time: 10 minutes.`,
    hash % 2 ? `Log wallet, dates and transaction hashes; hold at least ${days} days, then unwind after a launch or claim announcement, or earlier if TVL falls over 40% in a week. Smart contracts can lose funds. Cost: exit fees. Time: 15 minutes.` : `Record your wallet, dates and transaction hashes; keep the position at least ${days} days and exit after a launch or claim announcement, or early if weekly TVL drops over 40%. Smart-contract failure can cause losses. Cost: exit fees. Time: 15 minutes.`,
  ];
  return steps.map(s => { const t = s.slice(0, 600); return t.length < 20 ? t.padEnd(20, '.') : t; });
}
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const peers = snapshot.protocols.filter(p => p.mcap_usd !== null && p.tvl_usd > 0);
  if (!peers.length) throw new SnapshotError('snapshot must contain at least one live peer with positive TVL');
  const ratios = new Map<string | null, number[]>();
  for (const p of peers) { const a = ratios.get(p.category) ?? []; a.push(clamp(p.mcap_usd! / p.tvl_usd, MODEL.peer_ratio_min, MODEL.peer_ratio_max)); ratios.set(p.category, a); }
  const globalMedian = median([...ratios.values()].flat());
  const categories = [...new Set(snapshot.protocols.map(p => p.category))].sort(catCompare).map(category => {
    const values = ratios.get(category) ?? [], raw = values.length ? median(values) : globalMedian;
    return { category, peers: values.length, raw, multiple: clamp((values.length * raw + MODEL.shrinkage_peers * globalMedian) / (values.length + MODEL.shrinkage_peers), MODEL.category_multiple_min, MODEL.category_multiple_max) };
  });
  const byCategory = new Map(categories.map(c => [c.category, c]));
  const watch = new Set(snapshot.watchlist);
  const liveProtocols = snapshot.protocols.filter(p => !preToken(p));
  const liveNames = new Set(liveProtocols.map(p => p.name.trim().toLowerCase()));
  const liveSymbols = new Set(liveProtocols.flatMap(p => p.symbol ? [p.symbol.trim().toLowerCase()] : []));
  const selected = snapshot.protocols.filter(p => watch.has(p.slug));
  const counts = new Map<string | null, number>();
  for (const p of selected) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const candidates = snapshot.protocols.filter(p => !watch.has(p.slug) && rankable(p, liveNames, liveSymbols)).sort((a, b) => b.tvl_usd - a.tvl_usd || compare(a.slug, b.slug));
  const included = new Set(selected.map(p => p.slug));
  for (const p of candidates) { if (selected.length >= 220) break; if ((counts.get(p.category) ?? 0) < 30) { selected.push(p); included.add(p.slug); counts.set(p.category, (counts.get(p.category) ?? 0) + 1); } }
  for (const p of candidates) { if (selected.length >= 220) break; if (!included.has(p.slug)) selected.push(p); }
  const board: BoardRow[] = selected.map(p => {
    const c = byCategory.get(p.category)!;
    const growth = clamp(p.change_7d ?? 0, MODEL.growth_pct_min, MODEL.growth_pct_max);
    const growthFactor = 1 + (growth >= 0 ? MODEL.positive_growth_weight : MODEL.negative_growth_weight) * growth / 100;
    const age = ageDays(p.listed_at, snapshot.as_of);
    const ageFactor = MODEL.age_base + MODEL.age_weight * Math.min(age ?? MODEL.unknown_age_days, MODEL.age_cap_days) / MODEL.age_cap_days;
    const breadthFactor = 1 + MODEL.breadth_per_extra_chain * Math.min(Math.max(p.chains.length - 1, 0), MODEL.breadth_extra_chain_cap);
    return { ...p, rank: 0, token_status: 'pre-token', age_days: age, implied_value_usd: Math.max(1, Math.round(p.tvl_usd * c.multiple * growthFactor * ageFactor * breadthFactor)), watchlist: watch.has(p.slug), model: { category_multiple: round(c.multiple, 4), peer_count: c.peers, growth_factor: round(growthFactor, 4), age_factor: round(ageFactor, 4), breadth_factor: round(breadthFactor, 4) }, farm_steps: farm(p, age) };
  });
  board.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || compare(a.slug, b.slug));
  board.forEach((row, i) => { row.rank = i + 1; if (i && row.implied_value_usd >= board[i - 1].implied_value_usd) row.implied_value_usd = Math.max(1, board[i - 1].implied_value_usd - 1); });
  const live = [...peers].sort((a, b) => b.mcap_usd! - a.mcap_usd! || compare(a.slug, b.slug)).slice(0, 36).map(p => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd!, change_7d: p.change_7d, ratio: round(p.mcap_usd! / p.tvl_usd, 3) }));
  const radar: RadarData = { as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd, model_version: MODEL_VERSION, model: MODEL, watchlist_size: board.filter(r => r.watchlist).length, board_size: board.length, early_size: board.filter(r => !r.watchlist).length, live_size: peers.length, categories: categories.map(c => ({ category: c.category, peers: c.peers, median_multiple: round(c.raw, 4), multiple: round(c.multiple, 4) })), rows: board.map(r => ({ rank: r.rank, slug: r.slug, name: r.name, category: r.category, chains: r.chains, tvl_usd: r.tvl_usd, change_7d: r.change_7d, age_days: r.age_days, implied_value_usd: r.implied_value_usd, implied_multiple: r.tvl_usd > 0 ? round(r.implied_value_usd / r.tvl_usd, 4) : 0, watchlist: r.watchlist, factors: r.model, farm_steps: r.farm_steps })), live };
  return { board, radar };
}
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map(r => r.slug));
  for (const slug of snapshot.watchlist) if (snapshot.protocols.some(p => p.slug === slug) && !slugs.has(slug)) return `missing watchlist protocol: ${slug}`;
  if (board.length < 100 || board.length > 4000) return 'board size must be between 100 and 4000';
  for (let i = 0; i < board.length; i++) {
    const row = board[i];
    if (row.rank !== i + 1) return `invalid rank at row ${i + 1}`;
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd < 1 || row.implied_value_usd > 1e14) return `invalid implied value at rank ${i + 1}`;
    if (i && row.implied_value_usd > board[i - 1].implied_value_usd) return `implied values increase at rank ${i + 1}`;
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12 || row.farm_steps.some(s => typeof s !== 'string' || s.trim().length < 20 || s.trim().length > 600)) return `invalid farm steps at rank ${i + 1}`;
  }
  if (board.every(r => r.implied_value_usd === board[0].implied_value_usd)) return 'implied values are all equal';
  return null;
}
export function dataScript(radar: RadarData): string { return `window.RADAR=${JSON.stringify(radar)};\n`; }
