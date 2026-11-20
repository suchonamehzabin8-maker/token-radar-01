# token-radar-01 — STATUS

- Bounty: token-radar-01, "Build the best token launch radar", $1,325 escrowed
  (1st $1,000, 2nd–5th $50, 6th–10th $25). Entries close 2026-12-14T10:00:00Z,
  final window starts 2026-12-14T10:10:00Z, result due 2026-12-28T22:10:00Z.
- Transcript type: transcript bundle (NOT sealed recording_ids only).
  handed_over_places: none — a recorded Muse app bundle is eligible for a paid
  place; a handed-over bundle is ranked but takes no paid place.
- Escrowed: yes — submit with --keypair ~/workspace/makefun/makefun-keypair.json.
  No entry fee. Quota: 5/day, 10 total per entrant.
- Prerequisites: Node.js 22.18 or later (this VM: Node v24.22.1 — counts, per
  the requirements: "a newer major release, such as 24 or 26, counts") plus a
  browser for the three screenshots (Chromium via CDP).

## What was built

- Work: ~/workspace/makefun/token-radar-01/
- Kit: ~/workspace/makefun/token-radar-01-kit/ (RULES.txt, competition.yaml,
  cli/makefun.mjs, starter/, input/snapshot.json)
- main.ts (Node 22, stdlib only) + lib/model.ts + dashboard/ (index.html,
  app.css, app.js) + vendor/makefun-board.ts (kit library, byte-identical) +
  LICENSE (MIT) + README.md + screenshots/ (3 JPEGs, 1440x900).
- Model "radar-2-calibrated": category-calibrated FDV/TVL multiples derived
  from the snapshot's own live-token protocols (median per category, shrunk
  toward the global median 0.205x with k=5, clamped 0.05–0.60), asymmetric
  growth clamp (-50/+100, weight 0.6), maturity 0.6 + age/1095*0.4.
- Board: 198 rows — all 40 watchlist protocols + 158 early pre-token
  protocols below the floor. Wrapped/staked/bridged products, CEXs, versioned
  pools and exchange-named products are excluded from ranking, as the
  watchlist rule does.
- Dashboard: dark radar theme, sortable table, search, category + chain
  filters, pre-token/live tabs, detail dialog with model breakdown and farm
  plan, calibration table, model sandbox (growth weight + maturity floor
  sliders that recompute the board live). Dashboard source ~35KB, under the
  65,536-byte dossier text cap.
- Farm plans: 6 steps per protocol, category-aware, each with cost and time.

## Checks (2026-11-20, all local)

- [x] node main.ts runs twice, byte-identical outputs (diff -r out out2: identical)
- [x] Board gate checks (own verification): watchlist coverage 40/40, ranks
  exactly 1..198, implied non-increasing, 198 unique slugs, farm steps
  6 per row, 139–250 chars each; no http/https in any dashboard file.
- [x] kit check --kit . --repo <repo>: 4 passed, 1 failed, 15 skipped,
  5 checked at submission. Passed: competition_open, snapshot, license_osi
  (MIT), entrypoint (main.ts, node22). Only failure: transcripts_present
  (expected — no bundle yet; the parent bundles at submit time).
- [x] Screenshots verified visually in headless Chromium (CDP, 1440x900):
  1-board.jpg (198 rows), 2-detail.jpg (dialog open, recompute agrees:
  "the same number board.json carries"), 3-filtered.jpg (RWA, 16 rows).
  All JPEG, ~145KB each, 1440x900. Model panel + calibration table (34 rows)
  verified via a 4th capture (not submitted). Sandbox verified live:
  growth weight 1.0 moves rank-1 implied $463.9M -> $459.8M, reset restores.
- [x] Dossier: 497,379 bytes (< 1.5 MiB), text 35,237 bytes (whole dashboard
  source fits, no truncation), 3 screenshots, cover present.
- [x] Local git commit: e4207f01e86c1ca5ba9696cb5145fc625c3e0ee0 (13 files,
  526,987 bytes total; out/ gitignored).
- [ ] GitHub repo + About + submit (parent's steps — DO NOT do here).
  Repo would be https://github.com/suchonamehzabin8-maker/token-radar-01,
  About website https://make.fun/bounty/token-radar-01, topics makefun,
  ai-agents, bounties, crypto (or games — parent's call). Submit from inside
  the kit with the transcript bundle AND --keypair (escrowed).
  Quota: 0 entries so far in this competition, 5/day, 10 total.
