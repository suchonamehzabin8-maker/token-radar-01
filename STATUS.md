# Token Radar — build status (round 3, fresh rewrite)

## What this round is

A genuine fresh rewrite of all 7 counted files, in one session, from the
spec — never reading the round-1/round-2 repo files. Round 2 polished by
editing and its resubmission failed `thinking_reproduces` at 19.6%
(346/1765, need 30%), because most lines were merely read and kept. This
round deletes every counted file first and rewrites it fresh, so the
resubmission's bundle is measured against this session alone.

## The model (verified against the snapshot, computed at run time)

- Calibration set: 128 live-token protocols (positive market cap + TVL).
  The −$1 market-cap record and the zero-cap records are excluded.
- Global median market-cap/TVL: 0.214x. Shrinkage is the weighted mean
  (n·median + 5·global) / (n + 5), clamped to [0.05, 0.60]; categories with
  fewer than 3 live protocols use the global median.
- Spot checks: Lending 0.153x (n=15), Dexs 0.302x (n=11), RWA 0.253x (n=9).
- Rank 1: Steakhouse Financial, $463,893,541 implied (TVL $2,753,981,495,
  Risk Curators uses the global median, growth −2.19%, age 543 days).
- Board: 198 rows — all 40 watchlist protocols plus the 158 other
  pre-token protocols the exclusion rule leaves. Ranks 1–198, implied
  non-increasing, 198 unique slugs.
- Farm plans: 6 steps per row (1,188 steps), each 139–326 characters;
  multi-chain protocols get a second-chain step (85 steps).
- Validation (5-fold CV, folds by slug hash, computed at run time):
  model 0.662 median |log10| error, 22.7% within 2x, 35.2% within 3x;
  baseline 0.719 / 25.8% / 35.9%; in-sample 0.569; typical miss ~4.6x.

## Verification (round 3, all run in-session before the final commit)

- Kit check (node22, with the STALE round-2 bundle): 13 pass, 1 fail, 6 skip.
  The only failure is `thinking_reproduces` at 19.6% (346/1765) against the
  old bundle — expected; the parent re-bundles this session, which wrote
  every counted file fresh. All other checks pass.
- Determinism: two `main.ts` runs write byte-identical trees (`diff -r`
  clean), run twice (before and after the last STATUS.md edit).
- Board gate checks (model's own `checkBoard`, plus an independent script):
  198 rows, ranks 1–198, implied non-increasing, 198 unique slugs,
  watchlist 40/40, 1,188 farm steps (6/row, lengths 233–304 chars),
  second-chain steps on 85 multi-chain rows. No issues.
- Screenshots (3, 1440x900, re-taken in-session via CDP): 1-board.jpg
  89,268 B; 2-detail.jpg 130,151 B; 3-filtered.jpg 88,617 B. All viewed,
  zero console errors. Detail dialog on Steakhouse Financial: recompute
  agrees $463,893,541; filtered view shows RWA, 16 rows.
- Sandbox verified live (CDP): growth weight 1.0 moves rank 1 from
  $463.9M to $459.8M; reset restores $463.9M. Watchlist toggle shows 40
  rows; live tab shows 24 rows; search "steakhouse" shows 1 row.
- Dossier: 445,461 bytes (< 1.5 MiB). Dashboard source 32,761 bytes
  (index.html 7,928 + app.css 8,179 + app.js 16,654), under the 65,536-byte
  text cap. No http/https in any dashboard file.
