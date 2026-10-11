// Scanner tab. Fetching is OddsSource, analysis is Scan; this file only wires
// settings, a manual "Scan" button (never automatic: every call spends credits)
// and rendering. Anything that came from the API is escaped before it hits innerHTML.
(function () {
  'use strict';

  var FOCUS = ['betway', 'casumo'];
  var DEFAULT_BOOKS = ['betway', 'casumo', 'betfair_ex_uk', 'smarkets', 'matchbook'];
  // Exchange commission is ASSUMED, deliberately high so the scanner under-reports
  // rather than invents arbs. The user is told to set their own rate.
  var DEFAULT_COMM = { betfair_ex_uk: '5', smarkets: '5', matchbook: '5' };
  var SETTINGS_STORE = 'arb.scanner';
  var SHOW_LIMIT = 25;

  var S = { sports: null, selSports: [], books: DEFAULT_BOOKS.slice(), comm: Object.assign({}, DEFAULT_COMM),
            onlyFocus: false, hideStarted: true, sportFilter: '', busy: false, loadingSports: false,
            msg: '', err: '', results: null, scannedAt: 0, shown: [], showAll: false };

  try {
    var saved = JSON.parse(localStorage.getItem(SETTINGS_STORE) || 'null');
    if (saved) {
      if (Array.isArray(saved.books)) S.books = saved.books.slice(0, OddsSource.MAX_BOOKS);
      if (Array.isArray(saved.selSports)) S.selSports = saved.selSports;
      if (saved.comm) S.comm = Object.assign(S.comm, saved.comm);
      if (typeof saved.onlyFocus === 'boolean') S.onlyFocus = saved.onlyFocus;
      if (typeof saved.hideStarted === 'boolean') S.hideStarted = saved.hideStarted;
    }
  } catch (e) { /* defaults */ }
  function persist() {
    try { localStorage.setItem(SETTINGS_STORE, JSON.stringify({ books: S.books, selSports: S.selSports, comm: S.comm, onlyFocus: S.onlyFocus, hideStarted: S.hideStarted })); } catch (e) { /* no storage */ }
  }

  var root = document.getElementById('scanner');
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function isEx(key) { return OddsSource.BOOKS.some(function (b) { return b.key === key && b.ex; }); }
  function commissionMap() {
    var m = {};
    S.books.forEach(function (k) { if (isEx(k)) { var v = parseFloat(S.comm[k]); m[k] = isFinite(v) && v >= 0 && v < 100 ? v : 0; } });
    return m;
  }
  function ageText(min) {
    if (min === null) return 'no timestamp';
    if (min < 1) return '<1m old';
    if (min < 60) return Math.round(min) + 'm old';
    return Math.floor(min / 60) + 'h ' + Math.round(min % 60) + 'm old';
  }

  // ---- panels ----------------------------------------------------------------

  function renderKey() {
    var key = OddsSource.getKey(), u = OddsSource.getUsage();
    var usage = u && u.remaining !== null
      ? 'Credits remaining: ' + u.remaining + (u.used !== null ? ' · used: ' + u.used : '') + (u.last !== null ? ' · last call: ' + u.last : '') +
        ' · as of ' + new Date(u.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : 'Credit balance will show here after your first request (listing sports is free).';
    $('sc-key').innerHTML = '<h2>Odds API key <span class="hint"><a href="https://the-odds-api.com" target="_blank" rel="noopener" style="color:inherit">get a free key</a></span></h2>' +
      (key
        ? '<div class="keyrow"><div class="field"><label>Key saved in this browser only (ends …' + esc(key.slice(-4)) + ')</label></div><button type="button" class="btn ghost" id="sc-removekey">Remove key</button></div>'
        : '<div class="keyrow"><div class="field"><label for="sc-keyinput">Paste your The Odds API key</label><input id="sc-keyinput" type="password" autocomplete="off" spellcheck="false"></div><button type="button" class="btn" id="sc-savekey">Save</button></div>') +
      '<div class="usage">' + esc(usage) + '</div>';
  }

  function renderBooks() {
    var full = S.books.length >= OddsSource.MAX_BOOKS;
    $('sc-books').innerHTML = '<h2>Bookmakers <span class="hint">' + S.books.length + ' of ' + OddsSource.MAX_BOOKS + ' selected</span></h2><div class="bookgrid">' +
      OddsSource.BOOKS.map(function (b) {
        var on = S.books.indexOf(b.key) >= 0;
        return '<label class="bk"><input type="checkbox" data-book="' + esc(b.key) + '"' + (on ? ' checked' : '') + (!on && full ? ' disabled' : '') + '> ' + esc(b.title) +
          (FOCUS.indexOf(b.key) >= 0 ? ' <span class="focus-dot">●</span>' : '') +
          (b.ex ? ' <span class="tag">exch.</span>' + (on ? '<input class="cm" data-comm="' + esc(b.key) + '" value="' + esc(S.comm[b.key] || '') + '" inputmode="decimal" aria-label="' + esc(b.title) + ' commission percent" title="Commission %">' : '') : '') + '</label>';
      }).join('') + '</div>' +
      '<p class="note">Up to ' + OddsSource.MAX_BOOKS + ' bookmakers per scan: more than that makes each request cost double. The box beside each exchange is its commission %. These are <b>assumed (5%)</b> — set your own account\'s rate, since commission decides whether an arb survives.</p>';
  }

  function renderSports() {
    var body;
    if (S.sports === null) {
      body = '<p class="note">Load the sports list first. This is free and uses no credits.</p>';
    } else {
      var f = S.sportFilter.trim().toLowerCase(), last = '';
      var list = S.sports.filter(function (s) { return !f || (s.title + ' ' + s.group).toLowerCase().indexOf(f) >= 0; });
      body = list.length ? list.map(function (s) {
        var head = s.group !== last ? '<div class="grouphead">' + esc(s.group) + '</div>' : '';
        last = s.group;
        return head + '<label class="bk"><input type="checkbox" data-sport="' + esc(s.key) + '"' + (S.selSports.indexOf(s.key) >= 0 ? ' checked' : '') + '> ' + esc(s.title) + '</label>';
      }).join('') : '<p class="note">No sports match.</p>';
    }
    var n = S.selSports.length;
    $('sc-sports-head').innerHTML = 'Sports and leagues <span class="hint">' + n + ' selected · each costs credits per scan</span>';
    // The filter box is only rebuilt when it isn't on screen, so typing in it keeps focus.
    if (S.sports === null || !$('sc-filter')) {
      $('sc-sports-ctl').innerHTML = S.sports === null
        ? '<button type="button" class="btn ghost" id="sc-loadsports"' + (!OddsSource.getKey() || S.loadingSports ? ' disabled' : '') + '>' + (S.loadingSports ? 'Loading…' : 'Load sports list') + '</button>'
        : '<div class="field"><input class="text" id="sc-filter" placeholder="Filter, e.g. premier, tennis" value="' + esc(S.sportFilter) + '" aria-label="Filter sports"></div>';
    }
    $('sc-sports-list').innerHTML = body;
    $('sc-sports-list').className = S.sports === null ? '' : 'sportgrid';
  }

  function renderRun() {
    var n = S.selSports.length, perSport = S.books.length <= OddsSource.MAX_BOOKS ? 1 : 2, cost = n * perSport;
    var u = OddsSource.getUsage(), rem = u && u.remaining !== null ? u.remaining : null;
    var why = !OddsSource.getKey() ? 'Add your API key first.' : S.sports === null ? 'Load the sports list first.' :
              S.books.length < 2 ? 'Pick at least two bookmakers.' : n === 0 ? 'Pick at least one sport or league.' :
              (rem !== null && cost > rem) ? 'This would cost about ' + cost + ' credits but you have ' + rem + ' left.' : '';
    $('sc-run').innerHTML = '<div class="controls" style="align-items:center">' +
      '<button type="button" class="btn" id="sc-scan"' + (why || S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Scanning…' : 'Scan now') + '</button>' +
      '<span class="usage" style="margin:0">' + (n ? 'Estimated cost: ' + cost + ' credit' + (cost === 1 ? '' : 's') + (rem !== null ? ' of ' + rem + ' remaining' : '') + ' (1 per sport/league)' : '') + '</span></div>' +
      '<div class="controls" style="margin-top:12px">' +
        '<label class="check"><input type="checkbox" id="sc-onlyfocus"' + (S.onlyFocus ? ' checked' : '') + '> Only results using Betway or Casumo</label>' +
        '<label class="check"><input type="checkbox" id="sc-hidestarted"' + (S.hideStarted ? ' checked' : '') + '> Hide events that have started</label></div>' +
      (why && !S.busy ? '<div class="msg">' + esc(why) + '</div>' : '') +
      (S.msg ? '<div class="msg">' + esc(S.msg) + '</div>' : '') +
      (S.err ? '<div class="msg err">' + esc(S.err) + '</div>' : '');
  }

  function renderResults() {
    var out = $('sc-results');
    if (!S.results) { out.innerHTML = ''; return; }
    var all = S.results, share = Scan.bestPriceShare(all);
    var rows = all.filter(function (r) {
      if (S.hideStarted && r.started) return false;
      if (S.onlyFocus && !r.legs.some(function (l) { return FOCUS.indexOf(l.book) >= 0; })) return false;
      return true;
    });
    S.shown = S.showAll ? rows : rows.slice(0, SHOW_LIMIT);
    var arbs = rows.filter(function (r) { return r.isArb; }).length;
    var leaders = Object.keys(share.counts).map(function (k) { return [k, share.counts[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6)
      .map(function (p) { var t = OddsSource.BOOKS.filter(function (b) { return b.key === p[0]; })[0]; return esc(t ? t.title : p[0]) + ' ' + Math.round(100 * p[1] / share.total) + '%'; }).join(' · ');

    out.innerHTML = '<div class="panel"><h2>Results <span class="hint">scanned ' + new Date(S.scannedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '</span></h2>' +
      '<div class="note" style="margin-top:0"><b>' + arbs + '</b> arbitrage' + (arbs === 1 ? '' : 's') + ' among ' + rows.length + ' events shown (' + all.length + ' scanned), closest first.' +
      (leaders ? '<br>Who supplied the best price: ' + leaders + '.' : '') + '</div>' +
      (S.shown.length ? S.shown.map(function (r, i) { return opp(r, i); }).join('') : '<div class="empty">Nothing to show with these filters.</div>') +
      (!S.showAll && rows.length > SHOW_LIMIT ? '<p style="text-align:center;margin:12px 0 0"><button type="button" class="btn ghost" id="sc-showall">Show all ' + rows.length + '</button></p>' : '') +
      '<p class="note">Prices are the API\'s latest snapshot, not live, and they say nothing about how much can be staked at that price — especially on exchanges. Always confirm each price on the bookmaker\'s site before betting.</p></div>';
  }

  function opp(r, i) {
    var ev = r.event, when = new Date(ev.start);
    var flags = [];
    if (r.started) flags.push('STARTED — in-play prices');
    if (r.stale) flags.push('OLD PRICE');
    if (r.unknownAge) flags.push('NO TIMESTAMP');
    if (r.sameBook) flags.push('ALL ONE BOOK — check data');
    var legs = r.legs.map(function (l) {
      var age = (function () { var t = Date.parse(l.updated); return isFinite(t) ? Math.max(0, (Date.now() - t) / 60000) : null; })();
      return '<div class="oppleg"><span>' + esc(l.name) + '</span><span class="p">' + l.dec.toFixed(2) + (l.comm ? ' <span class="age">(' + l.eff.toFixed(2) + ' after ' + l.comm + '%)</span>' : '') + '</span>' +
        '<span class="b">' + esc(l.title) + (FOCUS.indexOf(l.book) >= 0 ? ' <span class="focus-dot">●</span>' : '') + ' <span class="age' + (age !== null && age > 10 ? ' old' : '') + '">' + ageText(age) + '</span></span></div>';
    }).join('');
    return '<div class="opp' + (r.isArb ? ' arb' : '') + '"><div class="opp-head"><span class="t">' + esc(ev.home) + ' v ' + esc(ev.away) + '</span>' +
      '<span class="badge ' + (r.isArb ? 'long' : 'flat') + '">' + (r.isArb ? 'Arb +' + (r.margin * 100).toFixed(2) + '%' : 'Near miss −' + (Math.abs(r.margin) * 100).toFixed(2) + '%') + '</span></div>' +
      '<div class="s" style="font-size:11px;color:var(--ink-faint);font-family:var(--mono);margin-bottom:6px">' + esc(ev.league) + ' · ' +
      (isFinite(when) ? when.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'time unknown') + '</div>' + legs +
      '<div class="opp-foot"><span class="flags">' + flags.map(function (f) { return '<span class="flag">' + esc(f) + '</span>'; }).join('') + '<span>Combined ' + (r.sumInv * 100).toFixed(2) + '%</span></span>' +
      '<button type="button" class="btn ghost" data-open="' + i + '">Open in calculator</button></div></div>';
  }

  // ---- actions ---------------------------------------------------------------

  function fail(e) { S.err = e.message + (e.code && e.code !== 'NETWORK' ? ' [' + e.code + ']' : ''); }

  function loadSports() {
    S.loadingSports = true; S.err = ''; renderSports(); renderRun();
    OddsSource.listSports().then(function (list) {
      S.sports = list.sort(function (a, b) { return a.group.localeCompare(b.group) || a.title.localeCompare(b.title); });
      S.selSports = S.selSports.filter(function (k) { return S.sports.some(function (s) { return s.key === k; }); });
      persist();
    }, fail).then(function () { S.loadingSports = false; renderKey(); renderSports(); renderRun(); });
  }

  function scan() {
    var chosen = S.sports.filter(function (s) { return S.selSports.indexOf(s.key) >= 0; }), events = [], i = 0;
    S.busy = true; S.err = ''; S.msg = ''; renderRun();
    function next() {
      if (i >= chosen.length) return Promise.resolve();
      S.msg = 'Scanning ' + chosen[i].title + ' (' + (i + 1) + ' of ' + chosen.length + ')…'; renderRun();
      return OddsSource.fetchOdds(chosen[i], S.books).then(function (r) { events = events.concat(r.events); renderKey(); i++; return next(); });
    }
    next().catch(fail).then(function () {
      S.busy = false; S.msg = ''; S.scannedAt = Date.now(); S.showAll = false;
      if (S.err && events.length) S.err += ' Showing results from the sports scanned before the error.';
      S.results = events.length || !S.err ? Scan.scanAll(events, { commission: commissionMap(), now: Date.now() }) : null;
      renderKey(); renderRun(); renderResults();
    });
  }

  root.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.id === 'sc-savekey') { var v = $('sc-keyinput').value.trim(); if (v) { OddsSource.setKey(v); S.sports = null; S.err = ''; renderKey(); renderSports(); renderRun(); } }
    else if (b.id === 'sc-removekey') { OddsSource.setKey(''); S.sports = null; S.results = null; renderKey(); renderSports(); renderRun(); renderResults(); }
    else if (b.id === 'sc-loadsports') loadSports();
    else if (b.id === 'sc-scan') scan();
    else if (b.id === 'sc-showall') { S.showAll = true; renderResults(); }
    else if (b.dataset.open !== undefined) {
      var r = S.shown[parseInt(b.dataset.open, 10)];
      if (r) { window.Calculator.load({ legs: r.legs.map(function (l) { return { name: l.name, book: l.title, dec: l.dec, comm: l.comm }; }) }); window.showTab('calc'); }
    }
  });

  root.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.book) {
      var k = t.dataset.book, i = S.books.indexOf(k);
      if (t.checked && i < 0 && S.books.length < OddsSource.MAX_BOOKS) S.books.push(k); else if (!t.checked && i >= 0) S.books.splice(i, 1);
      persist(); renderBooks(); renderRun();
    } else if (t.dataset.sport) {
      var j = S.selSports.indexOf(t.dataset.sport);
      if (t.checked && j < 0) S.selSports.push(t.dataset.sport); else if (!t.checked && j >= 0) S.selSports.splice(j, 1);
      persist(); $('sc-sports-head').innerHTML = 'Sports and leagues <span class="hint">' + S.selSports.length + ' selected · each costs credits per scan</span>'; renderRun();
    } else if (t.id === 'sc-onlyfocus') { S.onlyFocus = t.checked; persist(); renderResults(); }
    else if (t.id === 'sc-hidestarted') { S.hideStarted = t.checked; persist(); renderResults(); }
  });

  root.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset.comm) { S.comm[t.dataset.comm] = t.value; persist(); }
    else if (t.id === 'sc-filter') { S.sportFilter = t.value; renderSports(); }
  });

  root.innerHTML = '<div class="panel" id="sc-key"></div><div class="panel" id="sc-books"></div>' +
    '<div class="panel"><h2 id="sc-sports-head"></h2><div id="sc-sports-ctl"></div><div id="sc-sports-list"></div></div>' +
    '<div class="panel" id="sc-run"></div><div id="sc-results"></div>';
  renderKey(); renderBooks(); renderSports(); renderRun();
})();
