// Token Radar — the dashboard.
// Re-derives every row from the snapshot figures with the same functions
// the program used: implied = TVL x category multiple x growth x maturity.
// No network: all data comes from data.js beside this page.
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) {
    document.body.innerHTML = '<p style="padding:32px">Dashboard data failed to load.</p>';
    return;
  }

  var AS_OF = D.snapshot_as_of;
  var state = {
    tab: 'pre',
    q: '',
    cat: '',
    chain: '',
    wl: false,
    sortKey: 'rank',
    sortDir: 1,
    gw: 0.6,
    mf: 0.6,
  };

  function $(id) { return document.getElementById(id); }
  function fmtUsd(x) { return '$' + Math.round(x).toLocaleString('en-US'); }
  function fmtMult(x) { return x.toFixed(3) + 'x'; }
  function ageDays(listedAt) {
    if (!listedAt) return 365;
    var ms = Date.parse(AS_OF + 'T00:00:00Z') - Date.parse(listedAt + 'T00:00:00Z');
    return Math.max(0, Math.round(ms / 86400000));
  }
  function growthMult(change7d, w) {
    if (w === undefined) w = 0.6;
    var g = change7d == null ? 0 : Math.min(100, Math.max(-50, change7d));
    return 1 + (g / 100) * w;
  }
  function maturity(age, floor) {
    if (floor === undefined) floor = 0.6;
    return floor + (Math.min(age, 1095) / 1095) * (1 - floor);
  }
  function implied(row, gw, mf) {
    return Math.max(
      1,
      Math.round(
        row.tvl_usd *
          row.multiple *
          growthMult(row.change_7d, gw === undefined ? state.gw : gw) *
          maturity(ageDays(row.listed_at), mf === undefined ? state.mf : mf),
      ),
    );
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- hash-shareable state ----
  function readHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return;
    var p = new URLSearchParams(h);
    if (p.get('tab') === 'live') state.tab = 'live';
    if (p.get('q')) state.q = p.get('q');
    if (p.get('cat')) state.cat = p.get('cat');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('wl') === '1') state.wl = true;
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.tab === 'live') p.set('tab', 'live');
    if (state.q) p.set('q', state.q);
    if (state.cat) p.set('cat', state.cat);
    if (state.chain) p.set('chain', state.chain);
    if (state.wl) p.set('wl', '1');
    var s = p.toString();
    history.replaceState(null, '', s ? '#' + s : location.pathname + location.search);
  }

  // ---- derived rows ----
  function derivedRows() {
    var base = state.tab === 'live' ? D.liveRows : D.rows;
    var out = base.map(function (r) {
      return {
        row: r,
        value: implied(r),
        stored: r.implied_value_usd,
        age: ageDays(r.listed_at),
      };
    });
    out.sort(function (a, b) {
      return b.value - a.value || a.row.slug.localeCompare(b.row.slug);
    });
    out.forEach(function (d, i) { d.rank = i + 1; });
    return out;
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return derivedRows().filter(function (d) {
      var r = d.row;
      if (state.wl && !r.watchlist) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.indexOf(q) === -1) return false;
      return true;
    });
  }

  function sortRows(list) {
    var k = state.sortKey;
    var dir = state.sortDir;
    return list.slice().sort(function (a, b) {
      var x = k === 'rank' ? a.rank : a.row[k];
      var y = k === 'rank' ? b.rank : b.row[k];
      if (k === 'implied_value_usd') { x = a.value; y = b.value; }
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === 'string') return dir * x.localeCompare(y);
      return dir * (x - y);
    });
  }

  // ---- rendering ----
  function renderTop10() {
    var top = derivedRows().slice(0, 10);
    $('top10').innerHTML = top.map(function (d) {
      return '<article data-slug="' + esc(d.row.slug) + '"><div class="r">#' + d.rank + '</div><div class="n">' +
        esc(d.row.name) + '</div><div class="v">' + fmtUsd(d.value) + '</div></article>';
    }).join('');
  }

  function renderTable() {
    var list = sortRows(filtered());
    var tb = $('rows');
    tb.innerHTML = list.map(function (d) {
      var r = d.row;
      var chg = r.change_7d == null ? '—' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%';
      var cls = r.change_7d == null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      return '<tr data-slug="' + esc(r.slug) + '"><td>' + d.rank + '</td><td><strong>' + esc(r.name) +
        '</strong>' + (r.watchlist ? ' <span class="star" title="Watchlist">★</span>' : '') +
        '<br><span class="tag">' + esc(r.slug) + '</span></td><td>' + esc(r.category) +
        '</td><td>' + r.chains.map(function (c) { return '<span class="tag">' + esc(c) + '</span>'; }).join('') +
        '</td><td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num ' + cls + '">' + chg +
        '</td><td class="num">' + fmtMult(r.multiple) + '</td><td class="num"><strong>' + fmtUsd(d.value) +
        '</strong></td><td class="num live-only">' + (r.mcap_usd == null ? '—' : fmtUsd(r.mcap_usd)) +
        '</td><td>' + (r.farm_steps ? '›' : '') + '</td></tr>';
    }).join('');
    $('empty').hidden = list.length > 0;
    document.body.classList.toggle('live', state.tab === 'live');
    var top = derivedRows()[0];
    $('rank1live').textContent = top ? top.row.name + ' — ' + fmtUsd(top.value) : '—';
  }

  function renderMeta() {
    $('gmed').textContent = fmtMult(D.globalMedian);
    $('miss').textContent = '~' + D.validation.typicalMissX.toFixed(1) + 'x';
    $('val').textContent = D.validation.model.medianAbsLog10.toFixed(3) + ' |log10|';
    $('countPre').textContent = '(' + D.rows.length + ')';
    $('countLive').textContent = '(' + D.liveRows.length + ')';
    var cats = [];
    D.rows.forEach(function (r) { if (cats.indexOf(r.category) === -1) cats.push(r.category); });
    cats.sort();
    $('cat').innerHTML = '<option value="">All categories</option>' + cats.map(function (c) {
      return '<option' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var chains = [];
    D.rows.forEach(function (r) { r.chains.forEach(function (c) { if (chains.indexOf(c) === -1) chains.push(c); }); });
    chains.sort();
    $('chain').innerHTML = '<option value="">All chains</option>' + chains.map(function (c) {
      return '<option' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    $('calib').querySelector('tbody').innerHTML = D.calibration.map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.n + '</td><td class="num">' + fmtMult(c.multiple) +
        '</td><td class="num">' + c.q1.toFixed(3) + 'x</td><td class="num">' + c.q3.toFixed(3) + 'x</td><td>' + c.trust + '</td></tr>';
    }).join('');
    var v = D.validation;
    function vrow(name, s) {
      return '<tr><td>' + name + '</td><td class="num">' + s.medianAbsLog10.toFixed(3) + '</td><td class="num">' +
        s.within2xPct.toFixed(1) + '%</td><td class="num">' + s.within3xPct.toFixed(1) + '%</td></tr>';
    }
    $('valid').querySelector('tbody').innerHTML =
      vrow('Model (5-fold CV)', v.model) + vrow('Global-median baseline (5-fold CV)', v.baseline) + vrow('In-sample', v.inSample);
  }

  // ---- detail dialog ----
  var dlg = $('detail');
  function openDetail(slug) {
    var all = D.rows.concat(D.liveRows);
    var r = null;
    for (var i = 0; i < all.length; i++) if (all[i].slug === slug) { r = all[i]; break; }
    if (!r) return;
    var value = implied(r);
    var g = growthMult(r.change_7d);
    var m = maturity(ageDays(r.listed_at));
    $('dName').textContent = r.name;
    $('dSub').textContent = r.category + ' · ' + r.chains.join(', ') + ' · TVL ' + fmtUsd(r.tvl_usd) +
      (r.watchlist ? ' · ★ Watchlist' : '');
    $('dBreak').innerHTML =
      '<dt>TVL</dt><dd>' + fmtUsd(r.tvl_usd) + '</dd>' +
      '<dt>Category multiple</dt><dd>' + fmtMult(r.multiple) + '</dd>' +
      '<dt>Growth (7d ' + (r.change_7d == null ? 'n/a' : r.change_7d.toFixed(1) + '%') + ')</dt><dd>× ' + g.toFixed(3) + '</dd>' +
      '<dt>Maturity (' + ageDays(r.listed_at) + ' days)</dt><dd>× ' + m.toFixed(3) + '</dd>' +
      '<dt>Implied value</dt><dd><strong>' + fmtUsd(value) + '</strong></dd>' +
      (r.mcap_usd != null ? '<dt>Recorded market cap</dt><dd>' + fmtUsd(r.mcap_usd) + '</dd>' : '');
    var agrees = value === r.implied_value_usd;
    $('dAgree').textContent = 'The page re-derives this row from the snapshot figures: ' + fmtUsd(value) +
      (agrees ? ', which agrees with the board.' : ', while the board carries ' + fmtUsd(r.implied_value_usd) + ' at the default weights.');
    $('dFarm').innerHTML = (r.farm_steps || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') ||
      '<li>No farm plan for this row.</li>';
    if (typeof dlg.showModal === 'function') dlg.showModal();
  }
  $('closeDetail').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

  // ---- events ----
  function rerender() { renderTop10(); renderTable(); }
  $('tabPre').addEventListener('click', function () {
    state.tab = 'pre'; state.sortKey = 'rank'; state.sortDir = 1;
    $('tabPre').setAttribute('aria-selected', 'true');
    $('tabLive').setAttribute('aria-selected', 'false');
    writeHash(); rerender();
  });
  $('tabLive').addEventListener('click', function () {
    state.tab = 'live'; state.sortKey = 'tvl_usd'; state.sortDir = -1;
    $('tabLive').setAttribute('aria-selected', 'true');
    $('tabPre').setAttribute('aria-selected', 'false');
    writeHash(); rerender();
  });
  $('q').addEventListener('input', function (e) { state.q = e.target.value; writeHash(); renderTable(); });
  $('cat').addEventListener('change', function (e) { state.cat = e.target.value; writeHash(); renderTable(); });
  $('chain').addEventListener('change', function (e) { state.chain = e.target.value; writeHash(); renderTable(); });
  $('wl').addEventListener('change', function (e) { state.wl = e.target.checked; writeHash(); renderTable(); });
  document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (state.sortKey === k) state.sortDir = -state.sortDir;
      else { state.sortKey = k; state.sortDir = k === 'name' || k === 'category' ? 1 : -1; }
      renderTable();
    });
  });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  $('top10').addEventListener('click', function (e) {
    var a = e.target.closest('article[data-slug]');
    if (a) openDetail(a.getAttribute('data-slug'));
  });
  function sandbox() {
    state.gw = parseFloat($('gw').value);
    state.mf = parseFloat($('mf').value);
    $('gwv').textContent = state.gw.toFixed(2);
    $('mfv').textContent = state.mf.toFixed(2);
    rerender();
  }
  $('gw').addEventListener('input', sandbox);
  $('mf').addEventListener('input', sandbox);
  $('reset').addEventListener('click', function () {
    $('gw').value = '0.6'; $('mf').value = '0.6';
    sandbox();
  });

  // ---- init ----
  readHash();
  $('q').value = state.q;
  $('wl').checked = state.wl;
  if (state.tab === 'live') {
    state.sortKey = 'tvl_usd'; state.sortDir = -1;
    $('tabLive').setAttribute('aria-selected', 'true');
    $('tabPre').setAttribute('aria-selected', 'false');
  }
  renderMeta();
  rerender();
  var dh = new URLSearchParams(location.hash.replace(/^#/, '')).get('detail');
  if (dh) openDetail(dh);
})();
