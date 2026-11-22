[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/suchonamehzabin8-maker/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/suchonamehzabin8-maker/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar

The best token launch radar: a program that reads a sealed snapshot of 758
DefiLlama protocols (14 November 2026), ranks every pre-token protocol by an
implied token value, and writes a dashboard a reader can use — a board, a
detail view for each protocol, and a filter — with a farm plan for every row.

An entry for [token-radar-01 on make.fun](https://make.fun/bounty/token-radar-01).

## The model (radar-3-calibrated)

A protocol is pre-token when its record carries no token at all: no market
cap, no CoinGecko id, no symbol. Wrapped, staked and bridged products of
tokens that already trade, CEXs, versioned pools and exchange-named products
never rank as launches.

- **Category multiple**: for each category, the median market-cap-to-TVL
  ratio of the snapshot's own live-token protocols, shrunk toward the global
  median (0.214x) with five phantom protocols at the global value, clamped to
  [0.05, 0.60]. Lending 0.153x, Dexs 0.302x, RWA 0.253x.
- **Growth**: the seven-day TVL change, clamped to [-50, 100]%, scaled by 0.6.
- **Maturity**: 0.6 at day zero, rising to 1.0 at three years.
- **Implied value**: TVL × multiple × growth × maturity, at least $1.

The board holds 198 rows: the 40 watchlist protocols plus every other
pre-token protocol the rule leaves. Rank 1 is Steakhouse Financial,
$463,893,541 implied.

## Validation (computed at run time, shown in the dashboard)

5-fold cross-validation on the 128 live-token protocols, folds fixed by slug
hash: the model scores a median |log10| error of 0.662 (typical miss ~4.6x),
22.7% within 2x, 35.2% within 3x — against a global-median baseline of 0.719
/ 25.8% / 35.9% and an in-sample 0.569. Implied value ranks; it does not
price. Every detail view states the typical miss.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

Node 22.18+, standard library only, no network. With no `--input`, the
program reads `$MAKEFUN_INPUT_DIR/snapshot.json` (the grader runs it bare,
with no arguments). It writes `out/board.json` (198 rows), `out/data.js`,
`out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Two runs on the
same snapshot write the same bytes.

## The dashboard

Dark radar theme: a sortable, filterable board with a top-ten strip, a
watchlist-only toggle, pre-token/live tabs, a detail dialog with the model
breakdown and the farm plan, a calibration table, a validation table, and a
model sandbox — growth-weight and maturity-floor sliders that recompute the
board live from the snapshot figures. The page re-derives every row with the
same function, so the number it shows is the number `board.json` carries.

## Farm plans

Six steps per protocol (1,188 steps), category-aware, each with what it
costs and how long it takes. Multi-chain protocols get a second-chain step.
The safety rule, on every plan: claim only from the protocol's own published
link, never pay to claim.

## License

MIT — see LICENSE.
