// Token Radar model — radar-3-calibrated.
// Reads a sealed DefiLlama snapshot, fits category multiples from the
// snapshot's own live-token protocols, ranks every pre-token protocol the
// exclusion rule leaves, and writes a farm plan for each row. Everything is
// computed from the snapshot at run time: no implied value, no validation
// number and no calibration figure is hardcoded.

export interface Proto {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
}

export interface Fit {
  globalMedian: number;
  multiples: Record<string, number>;
  counts: Record<string, number>;
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  rank: number;
  implied_value_usd: number;
  multiple: number;
  growth_mult: number;
  maturity: number;
  age_days: number;
  watchlist: boolean;
  farm_steps: string[];
}

export interface ValidationMetrics {
  medianAbsLog10: number;
  within2xPct: number;
  within3xPct: number;
}

export interface Validation {
  model: ValidationMetrics;
  baseline: ValidationMetrics;
  inSample: ValidationMetrics;
  typicalMissX: number;
  folds: number;
  n: number;
}

export interface CalibrationRow {
  category: string;
  n: number;
  q1: number;
  median: number;
  q3: number;
  multiple: number;
  trust: 'High' | 'Medium' | 'Low';
}

// The snapshot's fetch date. Ages are counted in whole days from listed_at
// to this date; a protocol with no listed_at is treated as a year old.
export const AS_OF = '2026-11-14';
const DAY_MS = 86_400_000;
const PHANTOM_COUNT = 5;
const MULT_MIN = 0.05;
const MULT_MAX = 0.6;
const MATURITY_CAP_DAYS = 1095;

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return NaN;
  return n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

// Linear-interpolation quantile (the usual type-7 definition).
export function quantile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return NaN;
  if (n === 1) return sortedAsc[0];
  const pos = (n - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

// A protocol records no token when every token field is empty.
export function isPreToken(p: Proto): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

// The exclusion rule: wrapped, staked and bridged products of tokens that
// already trade, CEXs, versioned pools and exchange-named products are
// never ranked as launches.
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const EXCHANGE_NAMES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];
const VERSION_SUFFIX = / (V\d+|v\d+|\d+\.\d+.*)$/i;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function exclusionReason(p: Proto): string | null {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) {
    return `category ${p.category}`;
  }
  if (VERSION_SUFFIX.test(p.name)) return 'versioned pool';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped or staked product';
  for (const ex of EXCHANGE_NAMES) {
    if (p.name.startsWith(ex)) return `exchange-named (${ex})`;
  }
  return null;
}

export function isRankable(p: Proto): boolean {
  return isPreToken(p) && exclusionReason(p) === null;
}

// The calibration set: live-token protocols with a positive market cap and
// a TVL. One record in the snapshot carries a market cap of -$1, a data
// error; it is excluded here, as are the zero-cap records.
export function calibrationSet(protocols: Proto[]): Proto[] {
  return protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
}

export function ageDays(p: Proto): number {
  if (!p.listed_at) return 365;
  const days = Math.floor(
    (Date.parse(AS_OF) - Date.parse(p.listed_at)) / DAY_MS,
  );
  return Math.max(0, days);
}

export function growthMultiplier(p: Proto): number {
  const growth = Math.max(-50, Math.min(100, p.change_7d ?? 0));
  return 1 + (growth / 100) * 0.6;
}

export function maturityFactor(p: Proto): number {
  return 0.6 + (Math.min(ageDays(p), MATURITY_CAP_DAYS) / MATURITY_CAP_DAYS) * 0.4;
}

// Fit category multiples from the live-token protocols. For each category,
// the median market-cap-to-TVL ratio of that category's live protocols,
// shrunk toward the global median with five phantom protocols at the global
// value, then clamped to [0.05, 0.60]. A category with fewer than three
// live-token protocols uses the global median outright.
export function fitMultiples(live: Proto[]): Fit {
  const ratios = live.map((p) => p.mcap_usd! / p.tvl_usd);
  const globalMedian = median(ratios);
  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    const cat = p.category ?? 'Uncategorised';
    const list = byCategory.get(cat);
    if (list) list.push(p.mcap_usd! / p.tvl_usd);
    else byCategory.set(cat, [p.mcap_usd! / p.tvl_usd]);
  }
  const multiples: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const [cat, rs] of byCategory) {
    counts[cat] = rs.length;
    if (rs.length < 3) {
      multiples[cat] = globalMedian;
    } else {
      const shrunk =
        (rs.length * median(rs) + PHANTOM_COUNT * globalMedian) /
        (rs.length + PHANTOM_COUNT);
      multiples[cat] = Math.max(MULT_MIN, Math.min(MULT_MAX, shrunk));
    }
  }
  return { globalMedian, multiples, counts };
}

export function multipleFor(fit: Fit, category: string | null): number {
  if (category === null) return fit.globalMedian;
  return fit.multiples[category] ?? fit.globalMedian;
}

export function impliedValue(p: Proto, fit: Fit): number {
  const value =
    p.tvl_usd *
    multipleFor(fit, p.category) *
    growthMultiplier(p) *
    maturityFactor(p);
  return Math.max(1, Math.round(value));
}

// The category-aware core action a farm plan is built around. Each entry
// names what a farmer actually does in that kind of protocol.
const CORE_ACTIONS: Record<string, { verb: string; noun: string }> = {
  Lending: { verb: 'supply assets to a lending market', noun: 'lending market' },
  Dexs: { verb: 'swap tokens and add liquidity to a pool', noun: 'liquidity pool' },
  RWA: { verb: 'buy into a tokenised real-world-asset position', noun: 'asset position' },
  'Risk Curators': { verb: 'deposit into a curated vault', noun: 'curated vault' },
  Yield: { verb: 'deposit into a yield vault', noun: 'yield vault' },
  'Yield Aggregator': { verb: 'deposit into an auto-compounding vault', noun: 'vault' },
  Derivatives: { verb: 'open a small hedged derivatives position', noun: 'derivatives position' },
  CDP: { verb: 'open a collateralised debt position', noun: 'vault' },
  Restaking: { verb: 'restake liquid staking tokens', noun: 'restaking position' },
  'Staking Pool': { verb: 'stake tokens in the pool', noun: 'staking position' },
  'Basis Trading': { verb: 'open a small basis-trading position', noun: 'basis position' },
  'Onchain Capital Allocator': { verb: 'allocate capital to a strategy vault', noun: 'strategy vault' },
  'Liquidity Manager': { verb: 'deposit into a managed liquidity position', noun: 'liquidity position' },
  Chain: { verb: 'bridge funds and use the chain’s native apps', noun: 'onchain position' },
  'Cross Chain Bridge': { verb: 'bridge a small amount across the bridge', noun: 'bridge route' },
  'Collateral Markets': { verb: 'supply collateral to a market', noun: 'collateral market' },
  'Uncollateralized Lending': { verb: 'lend through the protocol’s credit market', noun: 'credit market' },
  'Anchor BTC': { verb: 'deposit BTC-backed collateral', noun: 'collateral position' },
  'Interest Rate Derivatives': { verb: 'open a small rates position', noun: 'rates position' },
  'Decentralized BTC': { verb: 'use the protocol’s BTC product', noun: 'BTC position' },
  'CDP Manager': { verb: 'open a managed CDP position', noun: 'CDP position' },
  CeDeFi: { verb: 'deposit into a CeDeFi yield product', noun: 'yield product' },
  'OTC Marketplace': { verb: 'place a small OTC order', noun: 'OTC order' },
  Insurance: { verb: 'buy a small cover policy', noun: 'cover policy' },
  'Dual-Token Stablecoin': { verb: 'mint the protocol’s stablecoin', noun: 'stablecoin position' },
  Farm: { verb: 'deposit into a farm', noun: 'farm position' },
  Payments: { verb: 'route a small payment through the protocol', noun: 'payment route' },
  'Governance Incentives': { verb: 'deposit to earn governance incentives', noun: 'incentive position' },
  'Crypto Card Issuer': { verb: 'order and fund the crypto card', noun: 'card balance' },
  'Prediction Market': { verb: 'place a small prediction-market position', noun: 'market position' },
  'Stablecoin Wrapper': { verb: 'wrap stablecoins through the protocol', noun: 'wrapped position' },
  Indexes: { verb: 'buy the index token', noun: 'index position' },
  'Leveraged Farming': { verb: 'open a small leveraged farming position', noun: 'farming position' },
};

const DEFAULT_ACTION = {
  verb: 'use the protocol’s flagship product with a small position',
  noun: 'position',
};

function coreAction(category: string | null): { verb: string; noun: string } {
  if (category !== null && CORE_ACTIONS[category]) return CORE_ACTIONS[category];
  return DEFAULT_ACTION;
}

// Six concrete steps per protocol. Every step carries what it costs and
// how long it takes, and the last step carries the safety rule: claim only
// from the protocol's own published link, never pay to claim. Multi-chain
// protocols get a second-chain step; single-chain protocols get a second,
// smaller position on the same chain instead.
export function farmPlan(p: Proto): string[] {
  const action = coreAction(p.category);
  const chain = p.chains[0] ?? 'its main chain';
  const secondChain = p.chains.length > 1 ? p.chains[1] : null;
  const steps: string[] = [];
  steps.push(
    `Open ${p.name}’s official site from its DefiLlama listing and connect a fresh wallet you keep only for farming. Fund it with a small amount of ${chain} gas plus the assets you plan to use. Cost: gas only, a few dollars. Time: about 10 minutes.`,
  );
  steps.push(
    `On ${chain}, ${action.verb} with a modest first position, about $100–$500, and confirm the transaction settles. Keep the position open rather than entering and exiting daily. Cost: network gas plus the position itself. Time: about 15 minutes.`,
  );
  steps.push(
    `Return weekly and ${action.verb} again, letting the position compound: add a little more, claim and restake any rewards the protocol pays, and keep your activity steady across several weeks. Cost: gas each visit. Time: about 15 minutes a week.`,
  );
  if (secondChain) {
    steps.push(
      `Repeat the same ${action.verb} on ${secondChain}, the protocol’s second chain, with a smaller position so your activity is visible on two chains. Use the protocol’s own bridge or its listed route, never a random link. Cost: gas on both chains. Time: about 20 minutes.`,
    );
  } else {
    steps.push(
      `Open a second, smaller position in another ${action.noun} on ${chain} so your activity is not a single one-off deposit: a different pool or market in the same protocol. Keep both positions live together. Cost: gas plus the second position. Time: about 15 minutes.`,
    );
  }
  steps.push(
    `Watch ${p.name}’s official announcements and its points or rewards page, if it has one, and keep a simple record of your deposits, dates and transaction hashes. If a snapshot or season is announced, make sure your position is live before it. Cost: nothing. Time: about 5 minutes a week.`,
  );
  steps.push(
    `If ${p.name} ever issues a token, claim only from the protocol’s own published link and never pay anyone to claim for you, never connect your wallet to a link from a DM or a reply, and revoke the spending approvals afterwards. Cost: gas to claim. Time: about 10 minutes.`,
  );
  return steps;
}

export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const fit = fitMultiples(calibrationSet(snapshot.protocols));
  const watchlist = new Set(snapshot.watchlist);
  const rows = snapshot.protocols
    .filter(isRankable)
    .map((p) => {
      const value = impliedValue(p, fit);
      return {
        slug: p.slug,
        name: p.name,
        category: p.category ?? 'Uncategorised',
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        change_7d: p.change_7d,
        listed_at: p.listed_at,
        rank: 0,
        implied_value_usd: value,
        multiple: multipleFor(fit, p.category),
        growth_mult: growthMultiplier(p),
        maturity: maturityFactor(p),
        age_days: ageDays(p),
        watchlist: watchlist.has(p.slug),
        farm_steps: farmPlan(p),
      } satisfies BoardRow;
    })
    .sort((a, b) => b.implied_value_usd - a.implied_value_usd);
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  return rows;
}

// Folds are fixed by a hash of the slug, so the validation is reproducible.
export function foldOf(slug: string): number {
  let h = 0;
  for (const ch of slug) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return (h >>> 0) % 5;
}

function metricsFor(
  pairs: Array<[number, number]>,
): ValidationMetrics {
  const errors = pairs.map(([pred, actual]) => Math.abs(Math.log10(pred / actual)));
  const within2x = errors.filter((e) => e <= Math.log10(2)).length;
  const within3x = errors.filter((e) => e <= Math.log10(3)).length;
  return {
    medianAbsLog10: round3(median(errors)),
    within2xPct: round1((within2x / pairs.length) * 100),
    within3xPct: round1((within3x / pairs.length) * 100),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// 5-fold cross-validation on the live-token protocols: each fold's
// multiples are fitted without the protocols it predicts, so every
// prediction is genuinely out of sample. The baseline predicts with the
// global median multiple instead of the category multiple.
export function crossValidate(live: Proto[]): Validation {
  const folds: Proto[][] = [[], [], [], [], []];
  for (const p of live) folds[foldOf(p.slug)].push(p);
  const modelPairs: Array<[number, number]> = [];
  const baselinePairs: Array<[number, number]> = [];
  for (let k = 0; k < 5; k++) {
    const train = folds.flatMap((fold, i) => (i === k ? [] : fold));
    const fit = fitMultiples(train);
    for (const p of folds[k]) {
      modelPairs.push([impliedValue(p, fit), p.mcap_usd!]);
      const baselineValue = Math.max(
        1,
        Math.round(
          p.tvl_usd * fit.globalMedian * growthMultiplier(p) * maturityFactor(p),
        ),
      );
      baselinePairs.push([baselineValue, p.mcap_usd!]);
    }
  }
  const fullFit = fitMultiples(live);
  const inSamplePairs = live.map(
    (p) => [impliedValue(p, fullFit), p.mcap_usd!] as [number, number],
  );
  const model = metricsFor(modelPairs);
  const baseline = metricsFor(baselinePairs);
  return {
    model,
    baseline,
    inSample: metricsFor(inSamplePairs),
    typicalMissX: round1(Math.pow(10, model.medianAbsLog10)),
    folds: 5,
    n: live.length,
  };
}

// One calibration row per live-token category: the quartiles of that
// category's market-cap-to-TVL ratios (the middle half), the fitted
// multiple, and a trust level from the live sample size.
export function calibrationRows(fit: Fit, live: Proto[]): CalibrationRow[] {
  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    const cat = p.category ?? 'Uncategorised';
    const list = byCategory.get(cat);
    if (list) list.push(p.mcap_usd! / p.tvl_usd);
    else byCategory.set(cat, [p.mcap_usd! / p.tvl_usd]);
  }
  const rows: CalibrationRow[] = [];
  for (const [cat, rs] of [...byCategory.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const sorted = [...rs].sort((a, b) => a - b);
    const n = rs.length;
    rows.push({
      category: cat,
      n,
      q1: round3(quantile(sorted, 0.25)),
      median: round3(quantile(sorted, 0.5)),
      q3: round3(quantile(sorted, 0.75)),
      multiple: round3(fit.multiples[cat]),
      trust: n >= 8 ? 'High' : n >= 3 ? 'Medium' : 'Low',
    });
  }
  return rows;
}

// The board's own gate checks: the same invariants the scorer checks,
// run here before anything is written.
export function checkBoard(rows: BoardRow[], snapshot: Snapshot): string[] {
  const issues: string[] = [];
  const watchlist = new Set(snapshot.watchlist);
  if (rows.length < 100 || rows.length > 4000) {
    issues.push(`board has ${rows.length} rows, need 100–4000`);
  }
  const slugs = new Set<string>();
  let prev = Infinity;
  rows.forEach((row, i) => {
    if (row.rank !== i + 1) issues.push(`row ${row.slug} has rank ${row.rank}, expected ${i + 1}`);
    if (slugs.has(row.slug)) issues.push(`duplicate slug ${row.slug}`);
    slugs.add(row.slug);
    if (row.implied_value_usd > prev) {
      issues.push(`implied value rises at rank ${row.rank}`);
    }
    prev = row.implied_value_usd;
    if (row.farm_steps.length !== 6) {
      issues.push(`${row.slug}: ${row.farm_steps.length} farm steps, expected 6`);
    }
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) {
        issues.push(`${row.slug}: farm step ${len} chars, outside 20–600`);
      }
    }
  });
  for (const slug of watchlist) {
    if (!slugs.has(slug)) issues.push(`watchlist slug ${slug} missing from board`);
  }
  const values = new Set(rows.map((r) => r.implied_value_usd));
  if (rows.length >= 2 && values.size === 1) {
    issues.push('all implied values are identical');
  }
  return issues;
}

export function fmtUsd(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function fmtMult(n: number): string {
  return n.toFixed(3) + 'x';
}
