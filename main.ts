// Token Radar — the program.
// Reads the sealed snapshot, ranks every pre-token protocol the exclusion
// rule leaves, and writes the board, the dashboard data, the dashboard
// itself, the screenshots and the dossier. Node 22.18+, standard library
// only, no network. Deterministic: two runs on the same snapshot write the
// same bytes.
//
//   node main.ts [--input <snapshot.json>]
//
// The input defaults to $MAKEFUN_INPUT_DIR/snapshot.json (the grader's
// /input), or the single .json file in $MAKEFUN_INPUT_DIR when that file is
// not there. A missing --input flag is never an error on its own: the
// grader runs this program bare, with no arguments at all.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-board.ts';
import {
  AS_OF,
  MODEL_NAME,
  buildBoard,
  calibrationRows,
  calibrationSet,
  checkBoard,
  crossValidate,
  fitMultiples,
  fmtMult,
  fmtUsd,
  impliedValue,
  multipleFor,
  type Snapshot,
} from './lib/model.ts';

function flagValue(argv: string[], name: string): string | null {
  const i = argv.indexOf(name);
  if (i === -1 || i + 1 >= argv.length) return null;
  return argv[i + 1];
}

/**
 * Where the snapshot comes from. The --input flag wins; otherwise the
 * grader's input directory, then the kit's input directory beside the
 * repository. Only when no snapshot is found anywhere is that an error.
 */
function resolveInput(argv: string[]): string {
  const flag = flagValue(argv, '--input');
  if (flag) return flag;
  const inputDir = process.env.MAKEFUN_INPUT_DIR;
  if (inputDir) {
    const named = join(inputDir, 'snapshot.json');
    if (existsSync(named)) return named;
    const jsons = readdirSync(inputDir).filter((f) => f.endsWith('.json'));
    if (jsons.length === 1) return join(inputDir, jsons[0]!);
    if (jsons.length > 1) {
      throw new Error(
        `no --input given and ${inputDir} holds ${jsons.length} .json files; pass --input <snapshot.json>`,
      );
    }
  }
  const local = resolve('input', 'snapshot.json');
  if (existsSync(local)) return local;
  throw new Error(
    'no snapshot found: pass --input <snapshot.json>, or set MAKEFUN_INPUT_DIR to a directory holding snapshot.json',
  );
}

/**
 * Empty a directory's contents without removing the directory itself.
 * The grader mounts /output, and removing a mount point throws EBUSY.
 */
function emptyDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const entry of readdirSync(dir)) {
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

function copyTree(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) copyFileSync(from, to);
  }
}

function main(): void {
  const inputPath = resolveInput(process.argv.slice(2));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? 'out';
  const repoDir = resolve(import.meta.dirname ?? '.');

  const snapshot = JSON.parse(readFileSync(inputPath, 'utf8')) as Snapshot;
  if (!Array.isArray(snapshot.protocols) || !Array.isArray(snapshot.watchlist)) {
    throw new Error('snapshot is not shaped like {protocols, watchlist}');
  }

  const live = calibrationSet(snapshot.protocols);
  const fit = fitMultiples(live);
  const rows = buildBoard(snapshot);
  const validation = crossValidate(live, snapshot.as_of);
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
      multiple: multipleFor(fit, p.category),
      implied_value_usd: impliedValue(p, fit, snapshot.as_of),
    }));

  const board = {
    model: MODEL_NAME,
    as_of: AS_OF,
    snapshot_as_of: snapshot.as_of,
    rows: rows,
    row_count: rows.length,
    watchlist_covered: rows.filter((r) => r.watchlist).length,
    rank_1: {
      slug: rows[0].slug,
      name: rows[0].name,
      implied_value_usd: rows[0].implied_value_usd,
    },
  };

  const multiples: Record<string, number> = {};
  for (const cat of [...fit.multiples.keys()].sort()) {
    multiples[cat] = fit.multiples.get(cat)!;
  }
  const counts: Record<string, number> = {};
  for (const cat of [...fit.counts.keys()].sort()) {
    counts[cat] = fit.counts.get(cat)!;
  }

  const data = {
    model: MODEL_NAME,
    as_of: AS_OF,
    snapshot_as_of: snapshot.as_of,
    snapshot_source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    globalMedian: fit.globalMedian,
    multiples,
    counts,
    validation,
    calibration,
    liveRows,
    rows,
  };

  emptyDir(outDir);
  mkdirSync(join(outDir, 'dashboard'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });

  writeFileSync(join(outDir, 'board.json'), JSON.stringify(board, null, 2) + '\n', 'utf8');
  writeFileSync(join(outDir, 'data.js'), 'window.RADAR = ' + JSON.stringify(data) + ';\n', 'utf8');

  copyTree(join(repoDir, 'dashboard'), join(outDir, 'dashboard'));
  copyTree(join(repoDir, 'screenshots'), join(outDir, 'screenshots'));

  // The gate's own limits, checked here before the dossier is written.
  const shotFiles = readdirSync(join(outDir, 'screenshots')).filter((f) => !f.startsWith('.'));
  if (shotFiles.length < 3 || shotFiles.length > 4) {
    throw new Error(`screenshots/ holds ${shotFiles.length} images, needs 3-4`);
  }
  for (const f of shotFiles) {
    const size = statSync(join(outDir, 'screenshots', f)).size;
    if (size > 512 * 1024) throw new Error(`screenshots/${f} is ${size} bytes, over the 512 KiB cap`);
  }

  const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
  if (dossier.length > 1.5 * 1024 * 1024) {
    throw new Error(`dossier.json is ${dossier.length} bytes, over the 1.5 MiB cap`);
  }
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  console.log(
    `Token Radar (${MODEL_NAME}) — snapshot ${snapshot.as_of}, ${snapshot.protocols.length} protocols`,
  );
  console.log(
    `board: ${rows.length} rows, rank 1 ${rows[0].name} ${fmtUsd(rows[0].implied_value_usd)} (multiple ${fmtMult(rows[0].multiple)})`,
  );
  console.log(
    `watchlist covered: ${rows.filter((r) => r.watchlist).length}/${snapshot.watchlist.length}`,
  );
  console.log(
    `calibration: ${live.length} live-token protocols, global median ${fmtMult(fit.globalMedian)}, ${calibration.length} categories`,
  );
  console.log(
    `validation (5-fold): model ${validation.model.medianAbsLog10.toFixed(3)} |log10| (${validation.model.within2xPct.toFixed(1)}% within 2x, ${validation.model.within3xPct.toFixed(1)}% within 3x); baseline ${validation.baseline.medianAbsLog10.toFixed(3)}; in-sample ${validation.inSample.medianAbsLog10.toFixed(3)}; typical miss ~${validation.typicalMissX.toFixed(1)}x`,
  );
  console.log(
    `farm plans: ${rows.length * 6} steps, second-chain steps on ${rows.filter((r) => r.chains.length > 1).length} multi-chain rows`,
  );
  console.log(
    `dashboard: ${readdirSync(join(outDir, 'dashboard')).length} files, screenshots: ${shotFiles.join(', ')}, dossier: ${dossier.length} bytes`,
  );
  console.log(
    `wrote ${outDir}/board.json, ${outDir}/data.js, ${outDir}/dashboard/, ${outDir}/screenshots/, ${outDir}/dossier.json`,
  );
}

main();
