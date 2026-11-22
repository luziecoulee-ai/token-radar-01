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
type Params = { growth_positive_weight: number; growth_negative_weight: number; age_base: number; age_weight: number; breadth_per_extra_chain: number };
type Factors = { category_multiple: number; peer_count: number; growth_factor: number; age_factor: number; breadth_factor: number; token_odds: number; odds_factor: number };
type Verdict = 'farm' | 'watch' | 'skip';
export type BoardRow = SnapshotProtocol & { rank: number; token_status: 'pre-token'; age_days: number | null; implied_value_usd: number; watchlist: boolean; model: Factors; farm_verdict: Verdict; farm_fees_usd: number; farm_capital_usd: number; farm_steps: string[] };
export type RadarData = {
  as_of: string; source: string; floor_usd: number; model_version: string; model: Params; design_model: typeof MODEL; launch_rate_global: number; validation: { priced_peers: number; half_sizes: number[]; halves_agree: boolean; holdout: { fit_half: number; test_half: number; params: Params; fitted: number; neutral: number; design: number }[]; final: { fitted: number; neutral: number; design: number } }; verdict_counts: Record<Verdict, number>;
  watchlist_size: number; board_size: number; early_size: number; live_size: number;
  categories: { category: string | null; peers: number; median_multiple: number; multiple: number; launched: number; total: number; launch_rate: number; odds_factor: number }[];
  rows: { rank: number; slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number; change_7d: number | null; age_days: number | null; implied_value_usd: number; implied_multiple: number; watchlist: boolean; factors: Factors; farm_verdict: Verdict; farm_fees_usd: number; farm_capital_usd: number; farm_steps: string[] }[];
  live: { slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number; mcap_usd: number; change_7d: number | null; ratio: number }[];
};
export const MODEL_VERSION = 'peer-multiple-2';
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

const DESIGN: Params = { growth_positive_weight: 0.30, growth_negative_weight: 0.45, age_base: 0.75, age_weight: 0.50, breadth_per_extra_chain: 0.04 };
const NEUTRAL: Params = { growth_positive_weight: 0, growth_negative_weight: 0, age_base: 1, age_weight: 0, breadth_per_extra_chain: 0 };
function factors(p: SnapshotProtocol, asOf: string, params: Params) {
  const growth = clamp(p.change_7d ?? 0, -50, 100), age = ageDays(p.listed_at, asOf);
  return { growth: 1 + (growth >= 0 ? params.growth_positive_weight : params.growth_negative_weight) * growth / 100,
    age: params.age_base + params.age_weight * Math.min(age ?? 365, 730) / 730,
    breadth: 1 + params.breadth_per_extra_chain * Math.min(Math.max(p.chains.length - 1, 0), 5) };
}
function buildModel(peerSet: SnapshotProtocol[], asOf: string) {
  if (!peerSet.length) throw new SnapshotError('model requires priced peers in each training half');
  const ratios = new Map<string | null, number[]>();
  for (const p of peerSet) { const a = ratios.get(p.category) ?? []; a.push(clamp(p.mcap_usd! / p.tvl_usd, 0.02, 3)); ratios.set(p.category, a); }
  const globalMedian = median(peerSet.map(p => clamp(p.mcap_usd! / p.tvl_usd, 0.02, 3)));
  const categories = [...ratios.keys()].sort(catCompare).map(category => { const values = ratios.get(category)!; const raw = median(values); return { category, peers: values.length, raw, multiple: clamp((values.length * raw + 6 * globalMedian) / (values.length + 6), 0.03, 2.5) }; });
  const lookup = new Map(categories.map(c => [c.category, c]));
  const predict = (p: SnapshotProtocol, params: Params) => { const f = factors(p, asOf, params); return p.tvl_usd * (lookup.get(p.category)?.multiple ?? clamp(globalMedian, 0.03, 2.5)) * f.growth * f.age * f.breadth; };
  const error = (peers: SnapshotProtocol[], params: Params) => median(peers.map(p => Math.abs(Math.log10(predict(p, params) / p.mcap_usd!))));
  const fit = (trainingPeers: SnapshotProtocol[]) => {
  if (!trainingPeers.length) throw new SnapshotError('model requires priced peers in each training half');
  let params = NEUTRAL, trainError = Infinity;
  for (const wp of [0, 0.2, 0.4]) for (const wn of [0, 0.3, 0.6]) for (const base of [0.8, 0.9, 1]) for (const w of [0, 0.25, 0.5]) for (const b of [0, 0.03, 0.06]) {
    const candidate = { growth_positive_weight: wp, growth_negative_weight: wn, age_base: base, age_weight: w, breadth_per_extra_chain: b };
    const e = error(trainingPeers, candidate); if (e < trainError) { trainError = e; params = candidate; }
  }
  return { params, trainError };
  };
  return { categories, globalMedian, ...fit(peerSet), fit, predict, error };
}
function foldOf(slug: string) { let h = 0x811c9dc5; for (const ch of slug) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; } return h % 2; }

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
  const peers = snapshot.protocols.filter(p => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const finalModel = buildModel(peers, snapshot.as_of);
  const halves = [0, 1].map(h => peers.filter(p => foldOf(p.slug) === h));
  const holdoutModels = [0, 1].map(h => ({ ...finalModel, ...finalModel.fit(halves[1 - h]) }));
  const errors = (model: ReturnType<typeof buildModel>, set: SnapshotProtocol[]) => ({ fitted: round(model.error(set, model.params), 4), neutral: round(model.error(set, NEUTRAL), 4), design: round(model.error(set, DESIGN), 4) });
  const validation = { priced_peers: peers.length, half_sizes: halves.map(h => h.length), halves_agree: JSON.stringify(holdoutModels[0].params) === JSON.stringify(holdoutModels[1].params), holdout: holdoutModels.map((m, h) => ({ fit_half: 1 - h, test_half: h, params: m.params, ...errors(m, halves[h]) })), final: errors(finalModel, peers) };
  const globalRate = snapshot.protocols.filter(p => !preToken(p)).length / snapshot.protocols.length;
  const categories = [...new Set(snapshot.protocols.map(p => p.category))].sort(catCompare).map(category => {
    const priced = finalModel.categories.find(c => c.category === category);
    const members = snapshot.protocols.filter(p => p.category === category), launched = members.filter(p => !preToken(p)).length;
    const rate = (launched + 20 * globalRate) / (members.length + 20);
    return { category, peers: priced?.peers ?? 0, raw: priced?.raw ?? finalModel.globalMedian, multiple: priced?.multiple ?? clamp(finalModel.globalMedian, 0.03, 2.5), launched, total: members.length, rate, odds: clamp(rate / globalRate, 0.70, 1.40) };
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
    const age = ageDays(p.listed_at, snapshot.as_of), f = factors(p, snapshot.as_of, finalModel.params), isWatch = watch.has(p.slug);
    const verdict: Verdict = (p.change_7d !== null && p.change_7d <= -30) || p.tvl_usd < 75_000_000 ? 'skip' : (isWatch ? age !== null && age >= 180 && p.tvl_usd >= 1e8 && c.odds >= 0.9 : c.odds >= 1 && age !== null && age >= 270 && p.tvl_usd >= 1.5e8) ? 'farm' : 'watch';
    const capital = p.tvl_usd >= 1e9 ? 250 : p.tvl_usd >= 1e8 ? 100 : p.tvl_usd >= 1e7 ? 75 : 50;
    const days = age === null ? 45 : age < 180 ? 60 : age < 540 ? 45 : 30, weeks = Math.ceil(days / 7);
    const gas = (chain: string | undefined) => chain === 'Ethereum' ? 9 : ['Arbitrum', 'Base', 'Optimism', 'Polygon', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Blast'].includes(chain ?? '') ? 0.55 : 2;
    const fees = round(gas(p.chains[0]) * (3 + weeks) + gas(p.chains[1] ?? p.chains[0]), 2), deployed = capital + (p.chains.length > 1 ? capital / 2 : 0);
    const steps = farm(p, age);
    steps.push(`Verdict: ${verdict.toUpperCase()} — estimated out-of-pocket cost $${fees.toFixed(2)} in gas across ${4 + weeks} transactions over ${days} days; $${deployed} of your own capital is deployed and stays at smart-contract risk (capital is not a fee). Exit early if weekly TVL falls over 40%.`);
    return { ...p, rank: 0, token_status: 'pre-token', age_days: age, implied_value_usd: Math.max(1, Math.round(finalModel.predict(p, finalModel.params) * c.odds)), watchlist: isWatch, model: { category_multiple: round(c.multiple, 4), peer_count: c.peers, growth_factor: round(f.growth, 4), age_factor: round(f.age, 4), breadth_factor: round(f.breadth, 4), token_odds: round(c.rate, 4), odds_factor: round(c.odds, 4) }, farm_verdict: verdict, farm_fees_usd: fees, farm_capital_usd: deployed, farm_steps: steps };
  });
  board.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || compare(a.slug, b.slug));
  board.forEach((row, i) => { row.rank = i + 1; if (i && row.implied_value_usd >= board[i - 1].implied_value_usd) row.implied_value_usd = Math.max(1, board[i - 1].implied_value_usd - 1); });
  const live = [...peers].sort((a, b) => b.mcap_usd! - a.mcap_usd! || compare(a.slug, b.slug)).slice(0, 36).map(p => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd!, change_7d: p.change_7d, ratio: round(p.mcap_usd! / p.tvl_usd, 3) }));
  const radar: RadarData = { as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd, model_version: MODEL_VERSION, model: finalModel.params, design_model: MODEL, launch_rate_global: round(globalRate, 4), validation, verdict_counts: { farm: board.filter(r => r.farm_verdict === 'farm').length, watch: board.filter(r => r.farm_verdict === 'watch').length, skip: board.filter(r => r.farm_verdict === 'skip').length }, watchlist_size: board.filter(r => r.watchlist).length, board_size: board.length, early_size: board.filter(r => !r.watchlist).length, live_size: peers.length, categories: categories.map(c => ({ category: c.category, peers: c.peers, median_multiple: round(c.raw, 4), multiple: round(c.multiple, 4), launched: c.launched, total: c.total, launch_rate: round(c.rate, 4), odds_factor: round(c.odds, 4) })), rows: board.map(r => ({ rank: r.rank, slug: r.slug, name: r.name, category: r.category, chains: r.chains, tvl_usd: r.tvl_usd, change_7d: r.change_7d, age_days: r.age_days, implied_value_usd: r.implied_value_usd, implied_multiple: r.tvl_usd > 0 ? round(r.implied_value_usd / r.tvl_usd, 4) : 0, watchlist: r.watchlist, factors: r.model, farm_verdict: r.farm_verdict, farm_fees_usd: r.farm_fees_usd, farm_capital_usd: r.farm_capital_usd, farm_steps: r.farm_steps })), live };
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
