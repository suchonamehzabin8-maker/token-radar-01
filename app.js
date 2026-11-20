// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail dialog with the model's own
// inputs and the protocol's farm plan, the calibration table, and a model sandbox. No network:
// every byte it shows is in data.js.
//
// The page recomputes a row from the snapshot figures with the same function main.ts runs, so
// the number it shows is the number board.json carries. The farm plan it shows is the plan
// board.json carries, whole, never a second derivation of it.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var MODEL = DATA.model;
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var sandbox = { gw: MODEL.growth_weight, mf: MODEL.maturity_floor, active: false };
  var table = document.getElementById('board-table');
  var tbody = document.getElementById('rows');
  var dialog = document.getElementById('detail');

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // The model in one function: the same arithmetic lib/model.ts runs. The category multiple is
  // carried at full precision in data.js, so this recomputes a row to the same dollar board.json
  // carries; the sandbox only changes the two constants it names.
  function impliedOf(row, gw, mf) {
    var growth = clamp(row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d, MODEL.growth_floor, MODEL.growth_cap);
    var growthMult = 1 + (growth / 100) * gw;
    var age = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
    var maturity = mf + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * (1 - mf);
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple_full * growthMult * maturity));
  }
  function impliedShown(row) {
    return sandbox.active ? impliedOf(row, sandbox.gw, sandbox.mf) : row.implied_value_usd;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = impliedShown(a); bv = impliedShown(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function badge(r) {
    if (r.watchlist) return el('span', { class: 'status watch', text: 'watchlist' });
    if (r.early) return el('span', { class: 'status early', text: 'early' });
    return el('span', { class: 'status', text: 'no token' });
  }

  function boardTable() {
    var list = sortedRows(rows());
    var max = 1;
    list.forEach(function (r) { max = Math.max(max, impliedShown(r)); });
    table.querySelector('caption').textContent = sandbox.active
      ? 'Pre-token protocols, recomputed with your sandbox settings. The submitted board is the one at the defaults.'
      : 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.';
    var thead = table.querySelector('thead');
    thead.textContent = '';
    thead.appendChild(el('tr', null,
      sortHeader('implied', 'Rank'),
      sortHeader('name', 'Protocol'),
      sortHeader('tvl', 'TVL'),
      sortHeader('growth', '7d'),
      sortHeader('age', 'Age'),
      sortHeader('implied', 'Implied value'),
      el('th', { scope: 'col', text: 'Token' })
    ));
    tbody.textContent = '';
    document.getElementById('empty').hidden = list.length !== 0;
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var shown = impliedShown(r);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((shown / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(shown) })
        )),
        el('td', null, badge(r))
      );
      tbody.appendChild(tr);
    });
    document.getElementById('count').textContent = list.length + ' rows shown';
  }

  function liveTable() {
    table.querySelector('caption').textContent = 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.';
    var thead = table.querySelector('thead');
    thead.textContent = '';
    thead.appendChild(el('tr', null,
      el('th', { scope: 'col', text: 'Status' }),
      el('th', { scope: 'col', text: 'Protocol' }),
      el('th', { scope: 'col', text: 'TVL' }),
      el('th', { scope: 'col', text: '7d' }),
      el('th', { scope: 'col', text: 'Market cap' }),
      el('th', { scope: 'col', text: 'Token' })
    ));
    tbody.textContent = '';
    document.getElementById('empty').hidden = true;
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    document.getElementById('count').textContent = DATA.live.length + ' live-token protocols';
  }

  function calibrationTable() {
    var body = document.getElementById('calibration-rows');
    body.textContent = '';
    var cal = DATA.calibration;
    var rows = cal.rows.slice().sort(function (a, b) { return b.multiple - a.multiple; });
    rows.forEach(function (r) {
      body.appendChild(el('tr', null,
        el('td', { text: r.category }),
        el('td', { class: 'num', text: String(r.live_count) }),
        el('td', { class: 'num', text: r.median_ratio === null ? 'n/a' : r.median_ratio.toFixed(3) + 'x' }),
        el('td', { class: 'num', text: r.multiple.toFixed(3) + 'x' + (r.from_global ? ' (global)' : '') })
      ));
    });
    document.getElementById('calibration-note').textContent =
      'Global median FDV / TVL across the snapshot\'s live-token protocols: ' + cal.global_median.toFixed(3) +
      'x. Categories with fewer than three live-token protocols use it outright; the rest shrink their own median toward it (5 phantom protocols at the global value), clamped to 0.05–0.60x.';
  }

  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row, MODEL.growth_weight, MODEL.maturity_floor);
    var agrees = recomputed === row.implied_value_usd;
    var calRow = (DATA.calibration.rows || []).filter(function (r) { return r.category === row.category; })[0];
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') }),
        el('div', { class: 'badge-row' }, badge(row), el('span', { class: 'status', text: row.listed_at ? 'listed ' + row.listed_at : 'listing date unknown' }))
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: row.category_multiple.toFixed(3) + 'x' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Value per $ of TVL' }), el('b', { class: 'num', text: '$' + (row.implied_value_usd / row.tvl_usd).toFixed(2) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (agrees ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' }),
      el('p', { class: 'sub', text: calRow
        ? (calRow.from_global
          ? 'Only ' + calRow.live_count + ' live-token protocol' + (calRow.live_count === 1 ? '' : 's') + ' in ' + (row.category || 'Other') + ' is in this snapshot — too thin a sample to set its own multiple, so this row uses the global median (' + DATA.calibration.global_median.toFixed(3) + 'x).'
          : (row.category || 'Other') + ' trades at a median ' + calRow.median_ratio.toFixed(3) + 'x FDV / TVL across ' + calRow.live_count + ' live-token protocols in this snapshot, shrunk toward the global median to ' + calRow.multiple.toFixed(3) + 'x.')
        : 'No live-token protocol in this category is in the snapshot, so this row uses the global median multiple (' + DATA.calibration.global_median.toFixed(3) + 'x).' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function fillControls() {
    var q = document.getElementById('q');
    q.value = state.q;
    q.addEventListener('input', function () { state.q = q.value; writeHash(); render(); });
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var select = document.getElementById('category');
    categories.forEach(function (c) {
      select.appendChild(el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }));
    });
    select.value = state.category;
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var chainSelect = document.getElementById('chain');
    chains.forEach(function (c) {
      chainSelect.appendChild(el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }));
    });
    chainSelect.value = state.chain;
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var pre = document.getElementById('tab-pre');
    var live = document.getElementById('tab-live');
    pre.addEventListener('click', function () { state.tab = 'pre-token'; writeHash(); render(); });
    live.addEventListener('click', function () { state.tab = 'live'; writeHash(); render(); });
    document.getElementById('clear-filters').addEventListener('click', function () {
      state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render();
    });
    var gw = document.getElementById('gw');
    var mf = document.getElementById('mf');
    var gwOut = document.getElementById('gw-out');
    var mfOut = document.getElementById('mf-out');
    function applySandbox() {
      sandbox.gw = parseFloat(gw.value);
      sandbox.mf = parseFloat(mf.value);
      sandbox.active = sandbox.gw !== MODEL.growth_weight || sandbox.mf !== MODEL.maturity_floor;
      gwOut.textContent = sandbox.gw.toFixed(2);
      mfOut.textContent = sandbox.mf.toFixed(2);
      render();
    }
    gw.addEventListener('input', applySandbox);
    mf.addEventListener('input', applySandbox);
    document.getElementById('sandbox-reset').addEventListener('click', function () {
      gw.value = String(MODEL.growth_weight);
      mf.value = String(MODEL.maturity_floor);
      applySandbox();
    });
  }

  function render() {
    document.getElementById('meta-snapshot').textContent = 'Snapshot ' + DATA.as_of;
    document.getElementById('meta-model').textContent = DATA.model_version + ' model';
    document.getElementById('lede-title').textContent = DATA.watchlist_size + ' watchlist protocols, ranked by implied value';
    document.getElementById('lede-text').textContent = 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor — every one the board can honestly rank, however small. Implied value is a model, not a promise.';
    document.getElementById('fact-watchlist').textContent = DATA.watchlist_size + ' / ' + DATA.watchlist_size;
    document.getElementById('fact-board').textContent = String(DATA.board_size);
    document.getElementById('fact-early').textContent = String(DATA.early_size);
    document.getElementById('fact-live').textContent = String(DATA.live_size);
    document.getElementById('tab-pre').setAttribute('aria-pressed', state.tab === 'pre-token' ? 'true' : 'false');
    document.getElementById('tab-live').setAttribute('aria-pressed', state.tab === 'live' ? 'true' : 'false');
    if (state.tab === 'pre-token') boardTable(); else liveTable();
    calibrationTable();
    var app = document.getElementById('board');
    app.setAttribute('aria-busy', 'false');
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  fillControls();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
