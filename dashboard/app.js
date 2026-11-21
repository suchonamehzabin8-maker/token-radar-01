// Token Radar dashboard.
// Re-derives every row from the snapshot figures with the same formula the
// program used (TVL × category multiple × growth × maturity), so the number
// this page shows is the number board.json carries. No network, no
// framework: all data comes from data.js, loaded before this file.

const DATA = window.RADAR;
const AS_OF = DATA.as_of;
const DAY_MS = 86_400_000;
const PUBLISHED_GROWTH = 0.6;
const PUBLISHED_FLOOR = 0.6;

const $ = (id) => document.getElementById(id);

function fmtMoney(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function fmtShort(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n);
}

function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
}

function fmtMult(n) {
  return n.toFixed(3) + 'x';
}

function ageDays(listedAt) {
  if (!listedAt) return 365;
  return Math.max(0, Math.floor((Date.parse(AS_OF) - Date.parse(listedAt)) / DAY_MS));
}

// The model, exactly as the program computes it. growthWeight and
// maturityFloor are the sandbox sliders; the published board uses 0.6/0.6.
function recompute(row, growthWeight, maturityFloor) {
  const growth = Math.max(-50, Math.min(100, row.change_7d ?? 0));
  const growthMult = 1 + (growth / 100) * growthWeight;
  const age = ageDays(row.listed_at);
  const maturity = maturityFloor + (Math.min(age, 1095) / 1095) * (1 - maturityFloor);
  const implied = Math.max(1, Math.round(row.tvl_usd * row.multiple * growthMult * maturity));
  return { growth, growthMult, age, maturity, implied };
}

function multipleFor(category) {
  return DATA.multiples[category] ?? DATA.globalMedian;
}

// ---- state ---------------------------------------------------------------

const state = {
  q: '',
  category: '',
  chain: '',
  watch: false,
  tab: 'pre', // 'pre' | 'live'
  sortKey: 'rank',
  sortDir: 1, // 1 = ascending, -1 = descending
  growthWeight: PUBLISHED_GROWTH,
  maturityFloor: PUBLISHED_FLOOR,
};

function sandboxActive() {
  return state.growthWeight !== PUBLISHED_GROWTH || state.maturityFloor !== PUBLISHED_FLOOR;
}

// The rows as currently displayed: published rows re-ranked under the
// sandbox sliders when they move, otherwise the published order.
function currentRows() {
  const base = DATA.rows.map((row) => {
    const r = recompute(row, state.growthWeight, state.maturityFloor);
    return { ...row, implied_value_usd: r.implied, growth_mult: r.growthMult, maturity: r.maturity, age_days: r.age };
  });
  if (sandboxActive()) {
    base.sort((a, b) => b.implied_value_usd - a.implied_value_usd);
    base.forEach((row, i) => { row.displayRank = i + 1; });
  } else {
    base.forEach((row) => { row.displayRank = row.rank; });
  }
  return base;
}

function filteredRows() {
  const rows = currentRows();
  const q = state.q.trim().toLowerCase();
  return rows.filter((row) => {
    if (q && !row.name.toLowerCase().includes(q) && !row.slug.toLowerCase().includes(q)) return false;
    if (state.category && row.category !== state.category) return false;
    if (state.chain && !row.chains.includes(state.chain)) return false;
    if (state.watch && !row.watchlist) return false;
    return true;
  });
}

function sortedRows(rows) {
  const key = state.sortKey;
  const dir = state.sortDir;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let av = a[key];
    let bv = b[key];
    if (key === 'rank') { av = a.displayRank; bv = b.displayRank; }
    if (key === 'chains') { av = a.chains.join(', '); bv = b.chains.join(', '); }
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === 'string') return av.localeCompare(bv) * dir;
    return (av - bv) * dir;
  });
  return sorted;
}

// ---- rendering -------------------------------------------------------------

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function renderStats() {
  $('stat-rows').textContent = DATA.rows.length;
  $('stat-watch').textContent = DATA.rows.filter((r) => r.watchlist).length;
  $('stat-median').textContent = fmtMult(DATA.globalMedian);
  $('stat-miss').textContent = '~' + DATA.validation.typicalMissX + 'x';
}

function renderTopTen() {
  const strip = $('top10');
  strip.replaceChildren();
  const rows = currentRows().slice(0, 10);
  for (const row of rows) {
    const li = el('li');
    li.appendChild(el('span', 't-rank', '#' + row.displayRank));
    li.appendChild(el('span', 't-name', row.name));
    li.appendChild(el('span', 't-val', fmtShort(row.implied_value_usd)));
    li.addEventListener('click', () => openDetail(row));
    strip.appendChild(li);
  }
}

function renderBoard() {
  const body = $('rows');
  body.replaceChildren();
  if (state.tab === 'live') {
    renderLiveTab(body);
    return;
  }
  $('live-note').hidden = true;
  const rows = sortedRows(filteredRows());
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', 'rank-cell', '#' + row.displayRank));
    const nameCell = el('td', 'name-cell', row.name);
    nameCell.appendChild(el('span', 'sub-cell', row.slug));
    if (row.watchlist) {
      const badge = el('span', 'watch-badge', 'WATCHLIST');
      nameCell.appendChild(badge);
    }
    tr.appendChild(nameCell);
    tr.appendChild(el('td', null, row.category));
    const chainCell = el('td');
    for (const chain of row.chains.slice(0, 3)) chainCell.appendChild(el('span', 'chip', chain));
    if (row.chains.length > 3) chainCell.appendChild(el('span', 'chip', '+' + (row.chains.length - 3)));
    tr.appendChild(chainCell);
    tr.appendChild(el('td', 'num', fmtShort(row.tvl_usd)));
    tr.appendChild(el('td', 'num', fmtPct(row.change_7d)));
    tr.appendChild(el('td', 'num', fmtShort(row.implied_value_usd)));
    tr.appendChild(el('td', 'num', fmtMult(row.multiple)));
    const farmCell = el('td', null, row.farm_steps.length + ' steps');
    tr.appendChild(farmCell);
    tr.addEventListener('click', () => openDetail(row));
    body.appendChild(tr);
  }
  const shown = rows.length;
  const total = DATA.rows.length;
  $('count').textContent =
    `Showing ${shown} of ${total} pre-token protocols` +
    (sandboxActive() ? ' · sandbox ordering — reset to restore the published board' : '') +
    (state.watch ? ' · watchlist only' : '');
}

function renderLiveTab(body) {
  $('live-note').hidden = false;
  const live = DATA.liveRows.map((p) => {
    const row = { ...p, multiple: multipleFor(p.category) };
    const r = recompute(row, PUBLISHED_GROWTH, PUBLISHED_FLOOR);
    return { ...row, implied_value_usd: r.implied, growth_mult: r.growthMult, maturity: r.maturity, age_days: r.age, watchlist: false, farm_steps: [] };
  });
  live.forEach((row, i) => { row.displayRank = i + 1; });
  for (const row of live) {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', 'rank-cell', '#' + row.displayRank));
    tr.appendChild(el('td', 'name-cell', row.name));
    tr.appendChild(el('td', null, row.category));
    const chainCell = el('td');
    for (const chain of row.chains.slice(0, 3)) chainCell.appendChild(el('span', 'chip', chain));
    tr.appendChild(chainCell);
    tr.appendChild(el('td', 'num', fmtShort(row.tvl_usd)));
    tr.appendChild(el('td', 'num', fmtPct(row.change_7d)));
    tr.appendChild(el('td', 'num', fmtShort(row.implied_value_usd)));
    tr.appendChild(el('td', 'num', fmtMult(row.multiple)));
    tr.appendChild(el('td', null, 'Live · ' + fmtShort(row.mcap_usd) + ' mcap'));
    tr.addEventListener('click', () => openDetail(row, true));
    body.appendChild(tr);
  }
  $('count').textContent = `Showing ${live.length} live-token protocols by TVL — recorded market cap beside the model’s implied value`;
}

function renderValidation() {
  const body = $('validation-rows');
  body.replaceChildren();
  const v = DATA.validation;
  const rows = [
    ['Radar model (out of sample)', v.model],
    ['Global-median baseline (out of sample)', v.baseline],
    ['Radar model (in sample)', v.inSample],
  ];
  for (const [label, m] of rows) {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', null, label));
    tr.appendChild(el('td', 'num', m.medianAbsLog10.toFixed(3)));
    tr.appendChild(el('td', 'num', m.within2xPct.toFixed(1) + '%'));
    tr.appendChild(el('td', 'num', m.within3xPct.toFixed(1) + '%'));
    body.appendChild(tr);
  }
  $('validation-note').textContent =
    `Five-fold cross-validation on the ${v.n} live-token protocols: each fold’s multiples were fitted without the protocols it predicts, so every prediction is genuinely out of sample. The model’s typical miss is about ${v.typicalMissX}x — implied value ranks protocols, it does not price them.`;
}

function renderCalibration() {
  const body = $('calibration-rows');
  body.replaceChildren();
  for (const row of DATA.calibration) {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', null, row.category));
    tr.appendChild(el('td', 'num', String(row.n)));
    tr.appendChild(el('td', 'num', fmtMult(row.q1)));
    tr.appendChild(el('td', 'num', fmtMult(row.median)));
    tr.appendChild(el('td', 'num', fmtMult(row.q3)));
    tr.appendChild(el('td', 'num', fmtMult(row.multiple)));
    const trust = el('td', 'trust-' + row.trust.toLowerCase(), row.trust);
    tr.appendChild(trust);
    body.appendChild(tr);
  }
}

function renderAll() {
  renderStats();
  renderTopTen();
  renderBoard();
}

// ---- detail dialog ----------------------------------------------------------

function openDetail(row, isLive) {
  const dialog = $('detail');
  $('detail-title').textContent = row.name;
  $('detail-sub').textContent =
    `${row.category} · ${row.chains.join(', ')} · TVL ${fmtMoney(row.tvl_usd)}` +
    (row.watchlist ? ' · On the watchlist' : '');
  const breakdown = $('detail-breakdown');
  breakdown.replaceChildren();
  const r = recompute(row, state.growthWeight, state.maturityFloor);
  const lines = [
    ['TVL', fmtMoney(row.tvl_usd)],
    [`Category multiple (${row.category})`, fmtMult(row.multiple)],
    [`7-day growth (${fmtPct(row.change_7d)})`, '× ' + r.growthMult.toFixed(4)],
    [`Maturity (${r.age} days, floor ${state.maturityFloor.toFixed(2)})`, '× ' + r.maturity.toFixed(4)],
  ];
  if (isLive) lines.push(['Recorded market cap', fmtMoney(row.mcap_usd)]);
  lines.push(['Implied value', fmtMoney(r.implied)]);
  for (const [label, value] of lines) {
    const div = document.createElement('div');
    if (label === 'Implied value') div.className = 'total';
    div.appendChild(el('dt', null, label));
    div.appendChild(el('dd', null, value));
    breakdown.appendChild(div);
  }
  const published = DATA.rows.find((p) => p.slug === row.slug);
  if (published && !isLive) {
    const agrees = r.implied === published.implied_value_usd;
    $('detail-recompute').textContent =
      `Dashboard recompute from the raw figures: ${fmtMoney(r.implied)} — ` +
      (agrees ? 'agrees with board.json.' : `board.json carries ${fmtMoney(published.implied_value_usd)} (sandbox is active).`);
  } else if (isLive) {
    $('detail-recompute').textContent =
      `Dashboard recompute from the raw figures: ${fmtMoney(r.implied)} — the model’s implied value beside a recorded market cap of ${fmtMoney(row.mcap_usd)}.`;
  } else {
    $('detail-recompute').textContent =
      `Dashboard recompute from the raw figures: ${fmtMoney(r.implied)}.`;
  }
  $('detail-miss').textContent =
    `Typical miss ~${DATA.validation.typicalMissX}x: the model’s out-of-sample median error is ${DATA.validation.model.medianAbsLog10} in log10. Treat this as a ranking, not a price.`;
  const plan = $('detail-plan');
  plan.replaceChildren();
  if (isLive || row.farm_steps.length === 0) {
    plan.appendChild(el('li', null, 'This protocol already trades, so there is no farm plan. The comparison above is the point: see how far the model’s implied value sits from the market cap the market actually assigned.'));
  } else {
    for (const step of row.farm_steps) plan.appendChild(el('li', null, step));
  }
  dialog.showModal();
}

// ---- filters, tabs, sorting, sandbox ---------------------------------------

function fillSelect(select, values) {
  for (const value of values) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  }
}

function readHash() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (hash.get('q')) state.q = hash.get('q');
  if (hash.get('cat')) state.category = hash.get('cat');
  if (hash.get('chain')) state.chain = hash.get('chain');
  if (hash.get('watch') === '1') state.watch = true;
  if (hash.get('tab') === 'live') state.tab = 'live';
}

function writeHash() {
  const hash = new URLSearchParams();
  if (state.q) hash.set('q', state.q);
  if (state.category) hash.set('cat', state.category);
  if (state.chain) hash.set('chain', state.chain);
  if (state.watch) hash.set('watch', '1');
  if (state.tab === 'live') hash.set('tab', 'live');
  const text = hash.toString();
  history.replaceState(null, '', text ? '#' + text : window.location.pathname);
}

function applyStateToControls() {
  $('q').value = state.q;
  $('category').value = state.category;
  $('chain').value = state.chain;
  $('watch').checked = state.watch;
  $('tab-pre').classList.toggle('active', state.tab === 'pre');
  $('tab-live').classList.toggle('active', state.tab === 'live');
  $('tab-pre').setAttribute('aria-selected', state.tab === 'pre' ? 'true' : 'false');
  $('tab-live').setAttribute('aria-selected', state.tab === 'live' ? 'true' : 'false');
}

function bindControls() {
  $('q').addEventListener('input', () => { state.q = $('q').value; writeHash(); renderBoard(); });
  $('category').addEventListener('change', () => { state.category = $('category').value; writeHash(); renderBoard(); });
  $('chain').addEventListener('change', () => { state.chain = $('chain').value; writeHash(); renderBoard(); });
  $('watch').addEventListener('change', () => { state.watch = $('watch').checked; writeHash(); renderBoard(); });
  $('tab-pre').addEventListener('click', () => { state.tab = 'pre'; applyStateToControls(); writeHash(); renderBoard(); });
  $('tab-live').addEventListener('click', () => { state.tab = 'live'; applyStateToControls(); writeHash(); renderBoard(); });
  document.querySelectorAll('.sort').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.sort;
      if (state.sortKey === key) state.sortDir = -state.sortDir;
      else { state.sortKey = key; state.sortDir = key === 'name' || key === 'category' || key === 'chains' ? 1 : -1; }
      document.querySelectorAll('.sort').forEach((b) => b.removeAttribute('aria-sort'));
      button.setAttribute('aria-sort', state.sortDir === 1 ? 'ascending' : 'descending');
      renderBoard();
    });
  });
}

function bindSandbox() {
  const growth = $('growth-weight');
  const floor = $('maturity-floor');
  const update = () => {
    state.growthWeight = parseFloat(growth.value);
    state.maturityFloor = parseFloat(floor.value);
    $('growth-weight-out').textContent = state.growthWeight.toFixed(2);
    $('maturity-floor-out').textContent = state.maturityFloor.toFixed(2);
    $('sandbox-note').textContent = sandboxActive()
      ? `Sandbox active: growth weight ${state.growthWeight.toFixed(2)}, maturity floor ${state.maturityFloor.toFixed(2)}. The board below is re-ranked live — reset to restore the published board.`
      : 'Published board: growth weight 0.60, maturity floor 0.60.';
    renderTopTen();
    renderBoard();
  };
  growth.addEventListener('input', update);
  floor.addEventListener('input', update);
  $('reset-sandbox').addEventListener('click', () => {
    growth.value = String(PUBLISHED_GROWTH);
    floor.value = String(PUBLISHED_FLOOR);
    update();
  });
}

// ---- init -------------------------------------------------------------------

function init() {
  const categories = [...new Set(DATA.rows.map((r) => r.category))].sort();
  const chains = [...new Set(DATA.rows.flatMap((r) => r.chains))].sort();
  fillSelect($('category'), categories);
  fillSelect($('chain'), chains);
  readHash();
  applyStateToControls();
  renderValidation();
  renderCalibration();
  renderAll();
  bindControls();
  bindSandbox();
}

init();
