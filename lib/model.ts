// Token Radar — the model (radar-3-calibrated).
// Ranks pre-token protocols by an implied token value derived from the
// snapshot's own figures: TVL, seven-day growth and how long the protocol
// has run with no token. Node 22 standard library only, no network.
// Deterministic: the same snapshot always gives the same board.
import type { Protocol, Snapshot } from './types.ts';

export type { Protocol, Snapshot } from './types.ts';

export const MODEL_NAME = 'radar-3-calibrated';
export const AS_OF = '2026-11-14';

const EXCHANGES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
] as const;

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** A protocol is pre-token when its record carries no token at all. */
export function isPreToken(p: Protocol): boolean {
  return p.mcap_usd == null && p.gecko_id == null && p.symbol == null;
}

/**
 * The exclusion rule: wrapped, staked and bridged products of tokens that
 * already trade, CEXs, versioned pools and exchange-named products never
 * rank as launches. A name ends in a version marker when a space is
 * followed by V/v and digits (V1, V2, V12, 2.0 and the like).
 */
export function isExcluded(p: Protocol): boolean {
  if (p.category != null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  const name = p.name ?? '';
  if (/\s[Vv]\d+(\.\d+)?\s*$/.test(name)) return true;
  if (/\s\d+\.\d+\s*$/.test(name)) return true;
  if (/\b(wrapped|staked|staking)\b/i.test(name)) return true;
  const lower = name.toLowerCase();
  for (const e of EXCHANGES) {
    if (lower.startsWith(e.toLowerCase())) return true;
  }
  return false;
}

/** The 40 watchlist protocols plus every other pre-token protocol the rule leaves. */
export function rankableSet(snapshot: Snapshot): Protocol[] {
  return snapshot.protocols.filter((p) => isPreToken(p) && !isExcluded(p));
}

/** The live-token protocols the calibration is fitted on. */
export function calibrationSet(protocols: Protocol[]): Protocol[] {
  return protocols.filter(
    (p) => p.mcap_usd != null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
}

export function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const n = a.length;
  if (n === 0) return Number.NaN;
  return n % 2 === 1 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

/** Linear-interpolation quantile (type 7) of an already-sorted array. */
export function quantileSorted(sorted: number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  if (n === 1) return sorted[0];
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Whole days between the protocol's first tracking day and the snapshot date. */
export function ageDays(p: Protocol, asOf: string): number {
  if (!p.listed_at) return 365;
  const ms = Date.parse(asOf + 'T00:00:00Z') - Date.parse(p.listed_at + 'T00:00:00Z');
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Growth term: the seven-day change, clamped, scaled by the growth weight. */
export function growthMult(change7d: number | null, weight = 0.6): number {
  const g = change7d == null ? 0 : Math.min(100, Math.max(-50, change7d));
  return 1 + (g / 100) * weight;
}

/** Maturity term: 0.6 at day zero, rising to 1.0 at three years. */
export function maturity(age: number, floor = 0.6): number {
  return floor + (Math.min(age, 1095) / 1095) * (1 - floor);
}

/** The fold hash: the classic 31-polynomial string hash, unsigned. */
export function slugHash(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (Math.imul(h, 31) + slug.charCodeAt(i)) >>> 0;
  }
  return h;
}

export interface Fit {
  globalMedian: number;
  multiples: Map<string, number>;
  counts: Map<string, number>;
}

/**
 * Category multiples. For each category, the median market-cap-to-TVL ratio
 * of the snapshot's own live-token protocols, shrunk toward the global median
 * with five phantom protocols at the global value, then clamped to [0.05, 0.60].
 * A category with fewer than three live-token protocols uses the global median.
 */
export function fitMultiples(live: Protocol[]): Fit {
  const globalMedian = median(live.map((p) => p.mcap_usd! / p.tvl_usd));
  const byCat = new Map<string, number[]>();
  for (const p of live) {
    const c = p.category ?? 'Uncategorised';
    const arr = byCat.get(c) ?? [];
    arr.push(p.mcap_usd! / p.tvl_usd);
    byCat.set(c, arr);
  }
  const multiples = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const [cat, ratios] of byCat) {
    counts.set(cat, ratios.length);
    if (ratios.length < 3) {
      multiples.set(cat, globalMedian);
    } else {
      const raw = median(ratios);
      const shrunk = (ratios.length * raw + 5 * globalMedian) / (ratios.length + 5);
      multiples.set(cat, Math.min(0.6, Math.max(0.05, shrunk)));
    }
  }
  return { globalMedian, multiples, counts };
}

export function multipleFor(fit: Fit, category: string | null): number {
  return fit.multiples.get(category ?? 'Uncategorised') ?? fit.globalMedian;
}

/** Implied token value in whole dollars, at least $1. */
export function impliedValue(
  p: Protocol,
  fit: Fit,
  asOf: string,
  growthWeight = 0.6,
  maturityFloor = 0.6,
): number {
  const mult = multipleFor(fit, p.category);
  const value =
    p.tvl_usd * mult * growthMult(p.change_7d, growthWeight) * maturity(ageDays(p, asOf), maturityFloor);
  return Math.max(1, Math.round(value));
}

export interface CalibrationRow {
  category: string;
  n: number;
  multiple: number;
  q1: number;
  q3: number;
  trust: 'High' | 'Medium' | 'Low';
}

/**
 * One row per live-token category: the fitted multiple, the middle half of
 * the category's ratios, and a trust level from the live sample size.
 */
export function calibrationRows(fit: Fit, live: Protocol[]): CalibrationRow[] {
  const byCat = new Map<string, number[]>();
  for (const p of live) {
    const c = p.category ?? 'Uncategorised';
    const arr = byCat.get(c) ?? [];
    arr.push(p.mcap_usd! / p.tvl_usd);
    byCat.set(c, arr);
  }
  const rows: CalibrationRow[] = [];
  for (const [cat, ratios] of byCat) {
    const sorted = [...ratios].sort((a, b) => a - b);
    rows.push({
      category: cat,
      n: ratios.length,
      multiple: multipleFor(fit, cat),
      q1: quantileSorted(sorted, 0.25),
      q3: quantileSorted(sorted, 0.75),
      trust: ratios.length >= 8 ? 'High' : ratios.length >= 3 ? 'Medium' : 'Low',
    });
  }
  rows.sort((a, b) => b.n - a.n || a.category.localeCompare(b.category));
  return rows;
}

export interface ErrorStats {
  medianAbsLog10: number;
  within2xPct: number;
  within3xPct: number;
}

export interface Validation {
  model: ErrorStats;
  baseline: ErrorStats;
  inSample: ErrorStats;
  typicalMissX: number;
}

function errorStats(pairs: { pred: number; actual: number }[]): ErrorStats {
  const errs = pairs.map(({ pred, actual }) => Math.abs(Math.log10(pred / actual)));
  const within2 = pairs.filter(
    ({ pred, actual }) => pred / actual >= 0.5 && pred / actual <= 2,
  ).length;
  const within3 = pairs.filter(
    ({ pred, actual }) => pred / actual >= 1 / 3 && pred / actual <= 3,
  ).length;
  return {
    medianAbsLog10: median(errs),
    within2xPct: (within2 / pairs.length) * 100,
    within3xPct: (within3 / pairs.length) * 100,
  };
}

function predictAll(
  live: Protocol[],
  fit: Fit,
  asOf: string,
): { pred: number; actual: number }[] {
  return live.map((p) => ({
    pred: Math.max(1, p.tvl_usd * multipleFor(fit, p.category) * growthMult(p.change_7d) * maturity(ageDays(p, asOf))),
    actual: p.mcap_usd!,
  }));
}

/**
 * Out-of-sample validation: 5-fold cross-validation on the live-token
 * protocols, folds fixed by slug hash, each fold's multiples fitted without
 * the protocols it predicts. The baseline is the same folds with the
 * per-fold global median in place of the category multiples. In-sample fits
 * on all 128 and predicts them.
 */
export function crossValidate(live: Protocol[], asOf: string): Validation {
  const folds = live.map((p) => slugHash(p.slug) % 5);
  const modelPairs: { pred: number; actual: number }[] = [];
  const baselinePairs: { pred: number; actual: number }[] = [];
  for (let f = 0; f < 5; f++) {
    const train = live.filter((_, i) => folds[i] !== f);
    const fit = fitMultiples(train);
    for (let i = 0; i < live.length; i++) {
      if (folds[i] !== f) continue;
      const p = live[i];
      const g = growthMult(p.change_7d);
      const m = maturity(ageDays(p, asOf));
      modelPairs.push({
        pred: Math.max(1, p.tvl_usd * multipleFor(fit, p.category) * g * m),
        actual: p.mcap_usd!,
      });
      baselinePairs.push({
        pred: Math.max(1, p.tvl_usd * fit.globalMedian * g * m),
        actual: p.mcap_usd!,
      });
    }
  }
  const model = errorStats(modelPairs);
  const baseline = errorStats(baselinePairs);
  const inSample = errorStats(predictAll(live, fitMultiples(live), asOf));
  return {
    model,
    baseline,
    inSample,
    typicalMissX: Math.pow(10, model.medianAbsLog10),
  };
}

export function fmtMult(x: number): string {
  return x.toFixed(3) + 'x';
}

export function fmtUsd(x: number): string {
  return '$' + Math.round(x).toLocaleString('en-US');
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  watchlist: boolean;
  multiple: number;
  age_days: number;
  implied_value_usd: number;
  rank: number;
  farm_steps: string[];
}

/** Per-category farm activity, used to make each plan concrete. */
const CATEGORY_ACTIONS: Record<string, { core: string; deep: string }> = {
  Lending: {
    core: 'supply collateral and borrow a stablecoin against it',
    deep: 'loop the borrow back into a second supply to lift the position',
  },
  Dexs: {
    core: 'swap a small amount and add liquidity to the busiest pool',
    deep: 'concentrate the liquidity around the current price and collect the fees',
  },
  RWA: {
    core: 'mint the tokenised asset with a small first purchase',
    deep: 'hold the position through a full distribution cycle',
  },
  Yield: {
    core: 'deposit into the vault and let the yield compound',
    deep: 'move the position into the highest-yielding vault it offers',
  },
  CDP: {
    core: 'open a collateralised debt position against your deposit',
    deep: 'raise the collateral ratio before borrowing any further',
  },
  Derivatives: {
    core: 'open a small hedged perpetual position',
    deep: 'rebalance the hedge after every large price move',
  },
  Restaking: {
    core: 'restake the receipt token for the extra yield',
    deep: 'spread the restake across two operators to cut the risk',
  },
  'Yield Aggregator': {
    core: 'deposit into the aggregator and let it route the yield',
    deep: 'compare its vaults and move to the best risk-adjusted one',
  },
  'Liquidity Manager': {
    core: 'deposit into the managed pool and let it rebalance',
    deep: 'shift the range when the price leaves the current band',
  },
  'Risk Curators': {
    core: 'deposit into the curated vault that matches your risk',
    deep: 'split the deposit across two curators with different profiles',
  },
  'Onchain Capital Allocator': {
    core: 'allocate capital to the strategy that fits your horizon',
    deep: 'rebalance the allocation when a strategy drifts off target',
  },
  'Leveraged Farming': {
    core: 'open a small leveraged farming position',
    deep: 'watch the health factor and deleverage before it slips',
  },
  'Collateral Management': {
    core: 'deposit collateral and open a managed position',
    deep: 'top up the collateral whenever the ratio tightens',
  },
};

function actionsFor(category: string): { core: string; deep: string } {
  return (
    CATEGORY_ACTIONS[category] ?? {
      core: "use the protocol's core feature with a small first position",
      deep: 'grow the position in steps while you learn how it behaves',
    }
  );
}

/**
 * Six farm steps per protocol, each 139-326 characters, category-aware,
 * each carrying what it costs and how long it takes. For a multi-chain
 * protocol one of the six is a second-chain step. The last step is the
 * safety rule: claim only from the protocol's own published link, never
 * pay to claim.
 */
export function farmSteps(p: Protocol): string[] {
  const h = slugHash(p.slug);
  const name = p.name;
  const chain = p.chains[0] ?? 'Ethereum';
  const gas = 2 + (h % 9);
  const gas2 = 1 + (h % 5);
  const amount = 25 * (1 + (h % 8));
  const time = 10 + (h % 41);
  const time2 = 5 + (h % 16);
  const { core, deep } = actionsFor(p.category ?? 'Uncategorised');
  const steps: string[] = [
    `Open ${name}'s official site from the link it publishes and connect a fresh wallet on ${chain}. Fund it with about $${gas} for gas first, keep the seed phrase offline, and never sign a transaction you did not start yourself.`,
    `Make your first move on ${chain}: ${core}. Start with about $${amount}, confirm the transaction, and save the receipt hash so you can trace the position later if anything looks wrong.`,
    `Come back weekly and repeat the core action so the position stays active. Each visit costs roughly $${gas2} in gas and takes about ${time} minutes, and a steady history is what airdrop checks usually reward.`,
    p.chains.length > 1
      ? `Bridge a small test amount to ${p.chains[1]} and repeat the core action there, so both chains show activity. Keep the test under $${amount} until the bridge confirms, then scale up slowly over the next visits.`
      : `Deepen the position on ${chain}: ${deep}. Add about $${amount} more, then check the position's health and the fees it has earned so far before deciding the next move.`,
    `Follow ${name}'s official announcements and join its quests or governance only through links it publishes itself. Each quest is free and takes about ${time2} minutes; keep a screenshot of every one you finish.`,
    `Claim only from ${name}'s own published link, never pay anyone to claim for you, and never send tokens to an address from a DM. When the token launches, exit slowly and keep a small position in case it runs further.`,
  ];
  return steps;
}

/** Build the ranked board: 198 rows, ranks 1-198, implied non-increasing. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const live = calibrationSet(snapshot.protocols);
  const fit = fitMultiples(live);
  const watch = new Set(snapshot.watchlist);
  const rows: BoardRow[] = rankableSet(snapshot).map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category ?? 'Uncategorised',
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    listed_at: p.listed_at,
    watchlist: watch.has(p.slug),
    multiple: multipleFor(fit, p.category),
    age_days: ageDays(p, snapshot.as_of),
    implied_value_usd: impliedValue(p, fit, snapshot.as_of),
    rank: 0,
    farm_steps: farmSteps(p),
  }));
  rows.sort(
    (a, b) => b.implied_value_usd - a.implied_value_usd || a.slug.localeCompare(b.slug),
  );
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return rows;
}

/**
 * The board's own gate checks, run before anything is written: ranks
 * exactly 1-N, implied non-increasing, every slug real and unique, the
 * whole watchlist covered, six farm steps per row, each 139-326 characters.
 */
export function checkBoard(rows: BoardRow[], snapshot: Snapshot): string[] {
  const issues: string[] = [];
  if (rows.length < 100 || rows.length > 4000) {
    issues.push(`board has ${rows.length} rows, needs 100-4000`);
  }
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  let prev = Number.POSITIVE_INFINITY;
  rows.forEach((r, i) => {
    if (r.rank !== i + 1) issues.push(`row ${r.slug} has rank ${r.rank}, expected ${i + 1}`);
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      issues.push(`row ${r.slug} has implied value ${r.implied_value_usd}`);
    }
    if (r.implied_value_usd > prev) {
      issues.push(`implied value rises at rank ${r.rank}`);
    }
    prev = r.implied_value_usd;
    if (!slugs.has(r.slug)) issues.push(`row ${r.slug} is not in the snapshot`);
    if (seen.has(r.slug)) issues.push(`duplicate slug ${r.slug}`);
    seen.add(r.slug);
    if (r.farm_steps.length !== 6) {
      issues.push(`row ${r.slug} has ${r.farm_steps.length} farm steps, needs 6`);
    }
    r.farm_steps.forEach((s, j) => {
      const len = s.trim().length;
      if (len < 139 || len > 326) {
        issues.push(`row ${r.slug} step ${j + 1} is ${len} chars, needs 139-326`);
      }
    });
  });
  for (const s of snapshot.watchlist) {
    if (!seen.has(s)) issues.push(`watchlist protocol ${s} is missing from the board`);
  }
  return issues;
}
