// UI for the calculator. All maths is in arb.js; this file only reads the
// form, calls Arb.calc, and renders. Structure changes (outcome count, odds
// format, mode) rebuild the form; typing only re-renders the results so the
// input keeps focus.
(function () {
  'use strict';

  var FORMATS = [['fractional', 'Fractional'], ['decimal', 'Decimal'], ['american', 'American']];
  var ROUND_STEPS = [0, 1, 5, 10, 50, 100];
  var NAMES = { 2: ['Outcome A', 'Outcome B'], 3: ['Home win', 'Draw', 'Away win'] };

  // Each leg keeps `dec`, the last valid odds as a decimal, so switching format
  // converts from the exact value rather than re-parsing rounded text (7/3 -> 3.33 -> 233/100).
  var state = {
    n: 3, format: 'fractional', mode: 'total', total: '100', legIndex: 0, legStake: '100',
    roundTo: 0, useComm: false,
    legs: [0, 1, 2].map(function (i) { return { name: NAMES[3][i], book: '', text: '', dec: null, comm: '' }; })
  };

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(x) {
    if (Math.abs(x) < 0.005) x = 0;
    return (x < 0 ? '−' : '') + '£' + Math.abs(x).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function pct(x) { if (Math.abs(x) < 0.00005) x = 0; return (x < 0 ? '−' : '') + (Math.abs(x) * 100).toFixed(2) + '%'; }
  function seg(attr, options, current) {
    return '<div class="seg" role="group">' + options.map(function (o) {
      return '<button type="button" ' + attr + '="' + o[0] + '" class="' + (String(o[0]) === String(current) ? 'on' : '') + '" aria-pressed="' + (String(o[0]) === String(current)) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  // ---- form ---------------------------------------------------------------

  function buildForm() {
    var legsHTML = state.legs.slice(0, state.n).map(function (l, i) {
      return '<div class="leg">' +
        '<div class="field"><label for="name' + i + '">Outcome</label><input class="text" id="name' + i + '" data-i="' + i + '" data-f="name" value="' + esc(l.name) + '"></div>' +
        '<div class="field"><label for="book' + i + '">Bookmaker (optional)</label><input class="text" id="book' + i + '" data-i="' + i + '" data-f="book" value="' + esc(l.book) + '" placeholder="e.g. Bet365"></div>' +
        '<div class="field"><label for="odds' + i + '">Odds</label><input id="odds' + i + '" data-i="' + i + '" data-f="text" inputmode="text" autocomplete="off" value="' + esc(l.text) + '" placeholder="' + { fractional: '9/2', decimal: '5.50', american: '+450' }[state.format] + '"><div class="conv" id="conv' + i + '"></div></div>' +
        (state.useComm ? '<div class="field"><label for="comm' + i + '">Commission %</label><input id="comm' + i + '" data-i="' + i + '" data-f="comm" inputmode="decimal" value="' + esc(l.comm) + '" placeholder="0"></div>' : '') +
        '</div>';
    }).join('');

    var legOptions = state.legs.slice(0, state.n).map(function (l, i) {
      return '<option value="' + i + '"' + (i === state.legIndex ? ' selected' : '') + '>' + esc(l.name || 'Outcome ' + (i + 1)) + '</option>';
    }).join('');

    $('app').innerHTML =
      '<div class="panel"><h2>Setup</h2><div class="controls">' +
        '<div class="ctl"><div class="k">Outcomes</div>' + seg('data-n', [[2, '2-way'], [3, '3-way']], state.n) + '</div>' +
        '<div class="ctl"><div class="k">Odds format</div>' + seg('data-fmt', FORMATS, state.format) + '</div>' +
        '<div class="ctl"><div class="k">Exchange commission</div><label class="check"><input type="checkbox" id="useComm"' + (state.useComm ? ' checked' : '') + '> Add a commission box per outcome</label></div>' +
      '</div></div>' +

      '<div class="panel"><h2>Odds <span><button type="button" class="link" id="example">Try an example</button> &middot; <button type="button" class="link" id="clear">Clear</button></span></h2>' + legsHTML + '</div>' +

      '<div class="panel"><h2>Stakes</h2><div class="controls">' +
        '<div class="ctl"><div class="k">Work out stakes from</div>' + seg('data-mode', [['total', 'Total stake'], ['leg', 'One fixed stake']], state.mode) + '</div>' +
        '<div class="ctl"><div class="k">Round each stake to nearest</div>' + seg('data-round', ROUND_STEPS.map(function (s) { return [s, s ? '£' + s : 'Exact']; }), state.roundTo) + '</div>' +
      '</div><div class="stakegrid">' +
        (state.mode === 'total'
          ? '<div class="field"><label for="total">Total to stake (£)</label><input id="total" inputmode="decimal" value="' + esc(state.total) + '"></div>'
          : '<div class="field"><label for="legIndex">I\'m betting on</label><select id="legIndex">' + legOptions + '</select></div>' +
            '<div class="field"><label for="legStake">Stake on that outcome (£)</label><input id="legStake" inputmode="decimal" value="' + esc(state.legStake) + '"></div>') +
      '</div></div>' +

      '<div id="result"></div>';
    refreshConversions();
    update();
  }

  // The small "= 5.50 · +450" line under each odds box.
  function refreshConversions() {
    state.legs.slice(0, state.n).forEach(function (l, i) {
      var el = $('conv' + i), box = $('odds' + i);
      if (!el) return;
      var bad = l.text.trim() !== '' && l.dec === null;
      box.classList.toggle('bad', bad);
      el.textContent = l.dec === null ? (bad ? 'not valid odds' : '') :
        FORMATS.filter(function (f) { return f[0] !== state.format; })
          .map(function (f) { return Arb.formatOdds(l.dec, f[0]); }).join(' · ');
    });
  }

  // ---- results ------------------------------------------------------------

  function num(s) { var v = parseFloat(String(s).replace(',', '.')); return isFinite(v) ? v : NaN; }

  function update() {
    var legs = state.legs.slice(0, state.n), out = $('result');
    var missing = legs.some(function (l) { return l.dec === null; });
    var amount = state.mode === 'total' ? num(state.total) : num(state.legStake);
    var comms = legs.map(function (l) { return state.useComm ? (num(l.comm) || 0) : 0; });

    if (missing) { out.innerHTML = '<div class="card"><div class="empty">Enter valid odds for every outcome to see the result.</div></div>'; return; }
    if (!(amount > 0)) { out.innerHTML = '<div class="card"><div class="empty">Enter a stake greater than £0.</div></div>'; return; }
    if (comms.some(function (c) { return c < 0 || c >= 100; })) { out.innerHTML = '<div class="card"><div class="empty">Commission must be between 0% and 100%.</div></div>'; return; }

    var r = Arb.calc({
      odds: legs.map(function (l) { return l.dec; }), commission: comms, mode: state.mode,
      total: amount, legIndex: state.legIndex, legStake: amount, roundTo: state.roundTo
    });

    var ok = r.minProfit > 0.005;
    var badge = r.isArb ? (ok ? ['long', 'Arbitrage'] : ['flat', 'Edge lost to rounding'])
                        : (r.sumInv < 1 + 1e-9 ? ['flat', 'Break-even'] : ['short', 'No arbitrage']);
    var bookPct = r.sumInv * 100;
    var meterW = Math.max(0, Math.min(100, (bookPct - 90) / 20 * 100));   // 90%..110% scale, mark at 100%

    var rows = legs.map(function (l, i) {
      return '<tr><td>' + esc(l.name || 'Outcome ' + (i + 1)) + (l.book ? '<span class="sub">' + esc(l.book) + '</span>' : '') + '</td>' +
        '<td>' + esc(l.text.trim()) + '<span class="sub">' + Arb.formatOdds(r.effectiveOdds[i], 'decimal') + (comms[i] ? ' after commission' : ' decimal') + '</span></td>' +
        '<td class="stake">' + money(r.stakes[i]) + '</td><td>' + money(r.returns[i]) + '</td>' +
        '<td style="color:var(--' + (r.profits[i] > 0.005 ? 'long' : r.profits[i] < -0.005 ? 'warn' : 'ink') + ')">' + money(r.profits[i]) + '</td></tr>';
    }).join('');

    var notes = '', idealTotal = r.idealStakes.reduce(function (a, b) { return a + b; }, 0);
    if (r.hasZeroStake) notes += '<p class="note warn">A stake rounds to £0 — choose a smaller rounding step or a larger stake.</p>';
    if (r.rounded && r.maxProfit - r.minProfit > 0.005)
      notes += '<p class="note">Stakes are rounded, so profit now depends on which outcome wins (' + money(r.minProfit) + ' to ' + money(r.maxProfit) + '). The headline figure is the worst case.' + (r.isArb ? ' Exact stakes would guarantee ' + money(idealTotal * r.margin) + ' on ' + money(idealTotal) + '.' : '') + '</p>';
    if (!r.isArb && r.sumInv >= 1 + 1e-9)
      notes += '<p class="note">These odds cannot be combined for a risk-free profit: the bookmakers\' combined implied probability is ' + bookPct.toFixed(2) + '%, and it needs to be under 100%. Staking this way would lock in a loss.</p>';
    if (state.mode === 'leg' && state.roundTo) notes += '<p class="note">The outcome you fixed keeps the exact amount you typed; the others are rounded.</p>';

    out.innerHTML =
      '<div class="card"><div class="card-head"><span class="name">Result</span><span class="badge ' + badge[0] + '">' + badge[1] + '</span></div>' +
      '<div class="statrow">' +
        '<div class="stat"><div class="k">' + (r.rounded ? 'Guaranteed profit (worst case)' : 'Guaranteed profit') + '</div><div class="v ' + (ok ? 'pos' : r.minProfit < -0.005 ? 'neg' : '') + '">' + money(r.minProfit) + '</div></div>' +
        '<div class="stat"><div class="k">Return on stake</div><div class="v ' + (ok ? 'pos' : r.minProfit < -0.005 ? 'neg' : '') + '">' + pct(r.roi) + '</div></div>' +
        '<div class="stat"><div class="k">Total staked</div><div class="v">' + money(r.totalStake) + '</div></div>' +
      '</div>' +
      '<div class="meter-label"><span>Combined implied probability</span><span class="num">' + bookPct.toFixed(2) + '% <span style="color:var(--ink-faint)">(under 100% = arbitrage)</span></span></div>' +
      '<div class="meter"><div class="fill' + (bookPct >= 100 ? ' over' : '') + '" style="width:' + meterW + '%"></div><div class="mark" style="left:50%"></div></div>' +
      '<div class="tablewrap"><table class="res"><thead><tr><th>Outcome</th><th>Odds</th><th>Stake</th><th>Returns if it wins</th><th>Profit if it wins</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      notes + '</div>';
  }

  // ---- events -------------------------------------------------------------

  function setLegCount(n) {
    if (n === state.n) return;
    var prev = NAMES[state.n];
    for (var i = 0; i < 3; i++) {                       // rename only legs still on their default name
      var l = state.legs[i];
      if (!l.name || l.name === (prev[i] || '')) l.name = NAMES[n][i] || '';
    }
    state.n = n;
    if (state.legIndex >= n) state.legIndex = 0;
    buildForm();
  }

  function setFormat(fmt) {
    state.format = fmt;
    state.legs.forEach(function (l) { if (l.dec !== null) l.text = Arb.formatOdds(l.dec, fmt); else l.dec = Arb.parseOdds(l.text, fmt); });
    buildForm();
  }

  function loadExample() {
    var ex = [2.1, 3.5, 5];
    state.n = 3; state.mode = 'total'; state.total = '100'; state.roundTo = 0; state.useComm = false;
    state.legs.forEach(function (l, i) { l.name = NAMES[3][i]; l.book = ''; l.comm = ''; l.dec = ex[i]; l.text = Arb.formatOdds(ex[i], state.format); });
    buildForm();
  }

  function clearAll() {
    state.legs.forEach(function (l) { l.text = ''; l.dec = null; l.comm = ''; l.book = ''; });
    buildForm();
  }

  $('app').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.n) setLegCount(parseInt(b.dataset.n, 10));
    else if (b.dataset.fmt) setFormat(b.dataset.fmt);
    else if (b.dataset.mode) { state.mode = b.dataset.mode; buildForm(); }
    else if (b.dataset.round !== undefined) { state.roundTo = parseInt(b.dataset.round, 10); buildForm(); }
    else if (b.id === 'example') loadExample();
    else if (b.id === 'clear') clearAll();
  });

  $('app').addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset.f) {
      var l = state.legs[parseInt(t.dataset.i, 10)];
      l[t.dataset.f] = t.value;
      if (t.dataset.f === 'text') { l.dec = Arb.parseOdds(t.value, state.format); refreshConversions(); }
      if (t.dataset.f === 'name') { var o = $('legIndex'); if (o) o.options[parseInt(t.dataset.i, 10)].text = t.value || 'Outcome ' + (parseInt(t.dataset.i, 10) + 1); }
      update();
    } else if (t.id === 'total') { state.total = t.value; update(); }
    else if (t.id === 'legStake') { state.legStake = t.value; update(); }
    else if (t.id === 'legIndex') { state.legIndex = parseInt(t.value, 10); update(); }
    else if (t.id === 'useComm') { state.useComm = t.checked; buildForm(); }
  });

  buildForm();
})();
