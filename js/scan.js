// Pure scanner logic: neutral events in, ranked opportunities out. No DOM, no
// network. All odds maths goes through Arb (js/arb.js) so the scanner and the
// calculator can never disagree about what counts as an arbitrage.
(function (root) {
  'use strict';
  var A = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./arb.js') : root.Arb;

  // Home, Draw, Away when those names are present; anything else in API order.
  function orderNames(ev) {
    var names = Object.keys(ev.outcomes), pref = [ev.home, 'Draw', ev.away];
    var head = pref.filter(function (n) { return names.indexOf(n) >= 0; });
    return head.concat(names.filter(function (n) { return head.indexOf(n) < 0; }));
  }

  // opts.commission: { bookKey: percent }   opts.now: ms   opts.staleMin: minutes
  // Returns null when the event can't be treated as a 2- or 3-way market.
  function analyse(ev, opts) {
    opts = opts || {};
    var comm = opts.commission || {}, now = opts.now || Date.now();
    var staleMin = opts.staleMin == null ? 10 : opts.staleMin;
    var names = orderNames(ev);
    if (names.length < 2 || names.length > 3) return null;

    var legs = [];
    for (var i = 0; i < names.length; i++) {
      var best = null;
      ev.outcomes[names[i]].forEach(function (q) {
        var c = comm[q.book] || 0, eff = A.effectiveOdds(q.dec, c);
        if (!best || eff > best.eff) best = { name: names[i], book: q.book, title: q.title, dec: q.dec, eff: eff, comm: c, updated: q.updated };
      });
      if (!best) return null;
      legs.push(best);
    }

    var sumInv = legs.reduce(function (t, l) { return t + 1 / l.eff; }, 0);
    var start = Date.parse(ev.start);
    var ages = legs.map(function (l) { var t = Date.parse(l.updated); return isFinite(t) ? Math.max(0, (now - t) / 60000) : null; });
    var known = ages.filter(function (a) { return a !== null; });
    return {
      event: ev, legs: legs, sumInv: sumInv, margin: 1 / sumInv - 1,
      isArb: sumInv < 1 - 1e-12,
      started: isFinite(start) && start <= now,
      oldestAge: known.length ? Math.max.apply(null, known) : null,
      unknownAge: known.length < ages.length,
      stale: known.length > 0 && Math.max.apply(null, known) > staleMin,
      sameBook: legs.every(function (l) { return l.book === legs[0].book; })
    };
  }

  // Closest-to-arbitrage first, so near-misses show even when there are no arbs.
  function scanAll(events, opts) {
    return events.map(function (e) { return analyse(e, opts); })
      .filter(Boolean).sort(function (a, b) { return a.sumInv - b.sumInv; });
  }

  // Which bookmaker supplied the best price, how often — evidence for "who is
  // actually good for arbs" instead of guessing.
  function bestPriceShare(results) {
    var counts = {}, total = 0;
    results.forEach(function (r) { r.legs.forEach(function (l) { counts[l.book] = (counts[l.book] || 0) + 1; total++; }); });
    return { counts: counts, total: total };
  }

  var Scan = { analyse: analyse, scanAll: scanAll, bestPriceShare: bestPriceShare };
  if (typeof module !== 'undefined' && module.exports) module.exports = Scan;
  else root.Scan = Scan;
})(typeof window !== 'undefined' ? window : this);
