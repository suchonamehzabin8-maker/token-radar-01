// Token Radar — the program.
// Reads the sealed snapshot, ranks every pre-token protocol the exclusion
// rule leaves, and writes the board, the dashboard data, the dashboard
// itself, the screenshots and the dossier. Node 22.18+, standard library
// only, no network. Deterministic: two runs on the same snapshot write the
// same bytes.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot>

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-board.ts';
import {
  AS_OF,
  buildBoard,
  calibrationRows,
  calibrationSet,
  checkBoard,
  crossValidate,
  fitMultiples,
  fmtMult,
  fmtUsd,
  type Snapshot,
} from './lib/model.ts';

const MODEL_NAME = 'radar-3-calibrated';

function usage(): never {
  console.error('usage: node main.ts --input <snapshot.json>');
  process.exit(2);
}

function flagValue(argv: string[], name: string): string | null {
  const i = argv.indexOf(name);
  if (i === -1 || i + 1 >= argv.length) return null;
  return argv[i + 1];
}

function main(): void {
  const inputPath = flagValue(process.argv.slice(2), '--input');
  if (!inputPath) usage();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? 'out';
  const repoDir = resolve(import.meta.dirname ?? '.');

  const snapshot = JSON.parse(
    readFileSync(inputPath!, 'utf8'),
  ) as Snapshot;
  if (!Array.isArray(snapshot.protocols) || !Array.isArray(snapshot.watchlist)) {
    throw new Error('snapshot is not shaped like {protocols, watchlist}');
  }

  const live = calibrationSet(snapshot.protocols);
  const fit = fitMultiples(live);
  const rows = buildBoard(snapshot);
  const validation = crossValidate(live);
  const calibration = calibrationRows(fit, live);

  // The board's own gate checks run before anything is written.
  const issues = checkBoard(rows, snapshot);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`board check: ${issue}`);
    process.exit(1);
  }

  // The live-token tab: the 24 live-token protocols with the most TVL,
  // shown with their recorded market cap beside the model's implied value,
  // so a reader can see where the model agrees and where it misses.
  const liveRows = [...live]
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category ?? 'Uncategorised',
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
    }));

  const board = {
    model: MODEL_NAME,
    as_of: AS_OF,
    snapshot_as_of: snapshot.as_of,
    rows: rows,
    row_count: rows.length,
    watchlist_covered: rows.filter((r) => r.watchlist).length,
    rank_1: { slug: rows[0].slug, name: rows[0].name, implied_value_usd: rows[0].implied_value_usd },
  };

  const data = {
    model: MODEL_NAME,
    as_of: AS_OF,
    snapshot_as_of: snapshot.as_of,
    snapshot_source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    globalMedian: fit.globalMedian,
    multiples: fit.multiples,
    counts: fit.counts,
    validation,
    calibration,
    liveRows,
    rows,
  };

  mkdirSync(join(outDir, 'dashboard'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });

  writeFileSync(
    join(outDir, 'board.json'),
    JSON.stringify(board, null, 2) + '\n',
    'utf8',
  );
  writeFileSync(
    join(outDir, 'data.js'),
    'window.RADAR = ' + JSON.stringify(data) + ';\n',
    'utf8',
  );

  for (const file of ['index.html', 'app.css', 'app.js']) {
    copyFileSync(join(repoDir, 'dashboard', file), join(outDir, 'dashboard', file));
  }
  for (const file of readdirSync(join(repoDir, 'screenshots')).sort()) {
    if (file.startsWith('.')) continue;
    copyFileSync(join(repoDir, 'screenshots', file), join(outDir, 'screenshots', file));
  }

  const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  const shotFiles = readdirSync(join(outDir, 'screenshots')).filter((f) => !f.startsWith('.'));
  console.log(`Token Radar (${MODEL_NAME}) — snapshot ${snapshot.as_of}, ${snapshot.protocols.length} protocols`);
  console.log(`board: ${rows.length} rows, rank 1 ${rows[0].name} ${fmtUsd(rows[0].implied_value_usd)} (multiple ${fmtMult(rows[0].multiple)})`);
  console.log(`watchlist covered: ${rows.filter((r) => r.watchlist).length}/${snapshot.watchlist.length}`);
  console.log(`calibration: ${live.length} live-token protocols, global median ${fmtMult(fit.globalMedian)}, ${calibration.length} categories`);
  console.log(`validation (5-fold): model ${validation.model.medianAbsLog10} |log10| (${validation.model.within2xPct}% within 2x, ${validation.model.within3xPct}% within 3x); baseline ${validation.baseline.medianAbsLog10}; in-sample ${validation.inSample.medianAbsLog10}; typical miss ~${validation.typicalMissX}x`);
  console.log(`farm plans: ${rows.length * 6} steps, second-chain steps on ${rows.filter((r) => r.chains.length > 1).length} multi-chain rows`);
  console.log(`dashboard: 3 files, screenshots: ${shotFiles.join(', ')}, dossier: ${dossier.length} bytes`);
  console.log(`wrote ${outDir}/board.json, ${outDir}/data.js, ${outDir}/dashboard/, ${outDir}/screenshots/, ${outDir}/dossier.json`);
  if (!existsSync(join(outDir, 'screenshots', '1-board.jpg'))) {
    console.error('warning: screenshots missing — take them with the CDP script before submitting');
  }
}

main();
