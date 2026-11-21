[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/suchonamehzabin8-maker/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/suchonamehzabin8-maker/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar

The best token launch radar: every protocol in the snapshot that records no
token, ranked by what its token would be worth if the record stayed as it
is — with a farm plan for every row and a dashboard a reader can actually
use.

## What it is

A program (`main.ts`) reads a sealed snapshot of 758 DefiLlama protocols
(14 November 2026), ranks the 198 pre-token protocols the exclusion rule
leaves, and writes a dashboard: a sortable, filterable board, a detail view
for every protocol, a model sandbox, and the calibration and validation
tables behind the ranking.

- **Board:** 198 rows, ranks 1–198, implied value non-increasing. Rank 1 is
  Steakhouse Financial at $463,893,541. All 40 watchlist protocols are
  covered, plus 158 more below the $50M floor.
- **Model (radar-3-calibrated):** implied value = TVL × category multiple ×
  growth × maturity. The category multiple is the median market-cap-to-TVL
  ratio of the snapshot's own live-token protocols in that category, shrunk
  toward the global median of 0.214x with five phantom protocols, clamped to
  0.05x–0.60x. Categories with fewer than three live protocols use the
  global median. Growth is the seven-day TVL change clamped to −50%…+100%,
  moving value by 0.6x its size. Maturity runs from 0.60 at launch to 1.00
  after three years without a token; unknown age counts as one year.
- **Validation (computed at run time, not hardcoded):** five-fold
  cross-validation on the 128 live-token protocols, folds fixed by slug hash,
  each fold's multiples fitted without the protocols it predicts. Model
  median |log10| error 0.662 (typical miss ~4.6x), 22.7% within 2x, 35.2%
  within 3x; global-median baseline 0.719 / 25.8% / 35.9%; in-sample 0.569.
  The dashboard says plainly that implied value ranks, it does not price.
- **Calibration:** 34 category rows with the quartiles of each category's
  live ratios and a trust level from the live sample size (High ≥ 8,
  Medium 3–7, Low where the global median stands in). One live protocol
  carries a market cap of −$1, a data error; it is excluded from
  calibration, as are the zero-cap records.
- **Farm plans:** 6 steps per protocol (1,188 steps), each 139–326
  characters, category-aware, with cost and time, and the safety rule:
  claim only from the protocol's own published link, never pay to claim.
  Multi-chain protocols get a second-chain step (85 steps).
- **Dashboard:** dark radar theme, sortable table, search, category and
  chain filters, watchlist-only toggle (hash-shareable), pre-token/live tabs
  (live tab: the 24 live-token protocols with the most TVL, recorded market
  cap beside the model's implied value), a detail dialog with the model
  breakdown and farm plan, and a sandbox whose growth-weight and
  maturity-floor sliders recompute the board live (growth weight 1.0 moves
  rank 1 from $463.9M to $459.8M; reset restores the published board). The
  page re-derives every row from the snapshot figures with the same
  function, so the number it shows is the number `board.json` carries. No
  network, no framework.

## Honesty notes

- A protocol on this board *records* no token — that is not proof it has
  none. A high implied value is not a prediction that a token is coming,
  or when.
- The board cannot honestly grow past 198 rows: that is every protocol the
  exclusion rule leaves.
- The formula was kept because, of the variants tested (log-space medians,
  dropping the growth term, dropping the maturity term), it had the smallest
  out-of-sample median error — and it still misses by ~4.6x typically.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

Node 22.18+, standard library only, no network. Writes `out/board.json`,
`out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`.
Deterministic: two runs on the same snapshot write the same bytes.

## Screenshots

`out/screenshots/` (and `screenshots/` in this repo) hold three JPEGs,
1440×900, taken in headless Chromium via CDP: the board, the detail dialog
on Steakhouse Financial, and the RWA-filtered view (16 rows).

## Files

- `main.ts` — the program: reads the snapshot, writes the board, the data,
  the dashboard, the screenshots and the dossier.
- `lib/model.ts` — the model: calibration, out-of-sample validation,
  implied value, the rankable set, farm plans, the board's gate checks.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js`.
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte
  the scorer's own copy. Do not touch.
- `LICENSE` — MIT.
