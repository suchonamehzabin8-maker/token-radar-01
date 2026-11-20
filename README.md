# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/suchonamehzabin8-maker/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/suchonamehzabin8-maker/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

The best token launch radar: a program that reads a sealed snapshot of the
protocol universe (758 DefiLlama protocols, 14 November 2026), ranks every
pre-token protocol by an implied token value, and writes a dashboard a reader
can use — a board, a detail view for each protocol, and a filter — with a farm
plan for every row.

## What it does

- **Covers the watchlist, then goes further.** All 40 watchlist protocols
  (≥ $50M TVL, no token on record), plus every other pre-token protocol the
  board can honestly rank — 198 rows in all. Wrapped, staked and bridged
  products of tokens that already trade are never ranked as launches.
- **A calibrated value model, not a TVL table.** Each category's multiple is
  derived from the snapshot's own live-token protocols: the median
  market-cap-to-TVL ratio of that category, shrunk toward the global median
  (0.205x) so a thin category cannot set a wild multiple. Lending trades at
  ~0.13x TVL, DEXs at ~0.34x, RWA at ~0.28x — the model knows the difference.
  Growth is capped asymmetrically (−50% / +100%, weight 0.6) and age rewards
  protocols that have run longest with no token.
- **Farm plans with costs and times.** Six steps per protocol, derived from
  its category, chains, TVL and age: the action, what it costs, how long it
  takes, and the one safety rule — claim only from the protocol's own
  published link, never pay to claim.
- **A dashboard that recomputes.** The page re-derives every row from the
  snapshot figures with the same function, so the number it shows is the
  number `board.json` carries. A model sandbox lets a reader move the growth
  weight and maturity floor and watch the board re-rank live.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

Node 22.18 or later, standard library only, no network. The program writes
`out/board.json` (198 rows), `out/data.js`, `out/dashboard/`, `out/screenshots/`
and `out/dossier.json`. It is deterministic: two runs on the same snapshot
write the same bytes.

## Layout

- `main.ts` — the program: reads the snapshot, writes the board, the data, the
  dashboard, the screenshots and the dossier.
- `lib/model.ts` — the model: calibration, implied value, rankable set, farm
  plans, snapshot parsing and the board's own gate checks.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js`. No network, no
  framework.
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte the
  scorer's own copy.
- `screenshots/` — the board, a protocol's detail view, and a filtered view.

## Implied value

```
implied = round( tvl_usd × category multiple
                 × (1 + clamp(change_7d, −50, 100) / 100 × 0.6)
                 × (0.6 + min(age_days, 1095) / 1095 × 0.4) )
```

Implied value is this entry's own claim, never a price and never a prediction
of whether or when a token is issued. A protocol is called pre-token only
because its record carries no token — the record is not proof it has none.

Built for [make.fun's token-radar-01 bounty](https://make.fun/bounty/token-radar-01).
