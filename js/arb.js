// Pure arbitrage maths: no DOM, no I/O. Everything works in DECIMAL odds
// ("multiples": 5.5 = 9/2 = +450). The UI converts to and from the other
// formats at the edge. Used by js/app.js in the browser and by
// tools/check_arb.js under Node, so keep it free of browser globals.
(function (root) {
  'use strict';

  // ---- parsing / formatting -------------------------------------------------

  // Text in the given format -> decimal odds, or null if it isn't valid odds.
  function parseOdds(text, format) {
    var s = String(text == null ? '' : text).trim().toLowerCase().replace(',', '.');
    if (!s) return null;
    var d = null, m;
    if (format === 'fractional') {
      if (/^(evens|evs|even|ev)$/.test(s)) return 2;
      m = /^(\d+(?:\.\d+)?)\s*[\/-]\s*(\d+(?:\.\d+)?)$/.exec(s);
      if (!m) return null;
      var a = parseFloat(m[1]), b = parseFloat(m[2]);
      if (!(b > 0)) return null;
      d = 1 + a / b;
    } else if (format === 'decimal') {
      if (!/^\d+(\.\d+)?$/.test(s)) return null;
      d = parseFloat(s);
    } else if (format === 'american') {
      if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
      var v = parseFloat(s);
      if (Math.abs(v) < 100) return null;
      d = v > 0 ? 1 + v / 100 : 1 + 100 / Math.abs(v);
    }
    return d !== null && isFinite(d) && d > 1 ? d : null;
  }

  // Decimal odds -> "n/d" using the smallest denominator that matches
  // (11/10, 9/2, 91/100); "evens" for 2.0; a rough value if nothing matches.
  function toFraction(d) {
    var x = d - 1;
    if (Math.abs(x - 1) < 1e-9) return 'evens';
    for (var q = 1; q <= 100; q++) {
      var n = Math.round(x * q);
      if (n >= 1 && Math.abs(n / q - x) < 5e-7) return n + '/' + q;
    }
    return x.toFixed(2) + '/1';
  }

  function toAmerican(d) {
    if (d >= 2) return '+' + Math.round((d - 1) * 100);
    return '-' + Math.round(100 / (d - 1));
  }

  function formatOdds(d, format) {
    if (format === 'fractional') return toFraction(d);
    if (format === 'american') return toAmerican(d);
    return (Math.round(d * 100) / 100).toFixed(2);
  }

  // ---- the calculation ------------------------------------------------------

  // Exchanges take commission on net WINNINGS, which is the same as shortening
  // the odds: backing at d with commission c pays 1 + (d-1)(1-c) per unit staked.
  function effectiveOdds(d, commissionPct) {
    var c = (commissionPct || 0) / 100;
    return 1 + (d - 1) * (1 - c);
  }

  function sum(a) { return a.reduce(function (t, x) { return t + x; }, 0); }

  // p.odds        decimal odds per outcome (2 or 3 entries)
  // p.commission  optional commission % per outcome
  // p.mode        'total' (split p.total) or 'leg' (p.legStake fixed on outcome p.legIndex)
  // p.roundTo     0 = exact stakes, else round each stake to the nearest multiple of this
  //               (in 'leg' mode the fixed leg keeps the amount typed)
  function calc(p) {
    var n = p.odds.length;
    var eff = p.odds.map(function (d, i) { return effectiveOdds(d, p.commission && p.commission[i]); });
    var inv = eff.map(function (d) { return 1 / d; });
    var sumInv = sum(inv);

    var ideal;
    if (p.mode === 'leg') {
      ideal = eff.map(function (d) { return p.legStake * eff[p.legIndex] / d; });
    } else {
      ideal = inv.map(function (x) { return p.total * x / sumInv; });
    }

    var step = p.roundTo || 0;
    var stakes = ideal.map(function (s, j) {
      if (step > 0 && !(p.mode === 'leg' && j === p.legIndex)) return Math.round(s / step) * step;
      return s;
    });

    var totalStake = sum(stakes);
    var returns = stakes.map(function (s, j) { return s * eff[j]; });
    var profits = returns.map(function (r) { return r - totalStake; });
    var minProfit = Math.min.apply(null, profits);
    var maxProfit = Math.max.apply(null, profits);

    return {
      n: n,
      effectiveOdds: eff,
      sumInv: sumInv,                       // < 1 means an arbitrage exists
      isArb: sumInv < 1 - 1e-12,
      margin: 1 / sumInv - 1,               // profit / stake with exact stakes
      idealStakes: ideal,
      stakes: stakes,
      returns: returns,
      profits: profits,
      totalStake: totalStake,
      minProfit: minProfit,                 // the guaranteed outcome
      maxProfit: maxProfit,
      roi: totalStake > 0 ? minProfit / totalStake : 0,
      rounded: step > 0,
      hasZeroStake: stakes.some(function (s) { return s <= 0; })
    };
  }

  var Arb = { parseOdds: parseOdds, formatOdds: formatOdds, toFraction: toFraction,
              toAmerican: toAmerican, effectiveOdds: effectiveOdds, calc: calc };
  if (typeof module !== 'undefined' && module.exports) module.exports = Arb;
  else root.Arb = Arb;
})(typeof window !== 'undefined' ? window : this);
