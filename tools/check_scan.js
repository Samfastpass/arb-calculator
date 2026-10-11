// Run: node tools/check_scan.js — checks js/odds-source.js normalisation and js/scan.js.
// The raw fixtures follow the documented The Odds API response shape; nothing here calls the network.
const assert = require('assert');
const Source = require('../js/odds-source.js');
const Scan = require('../js/scan.js');
const near = (a, b, tol = 1e-9) => assert(Math.abs(a - b) < tol, `${a} !~ ${b}`);

const NOW = Date.parse('2030-06-01T12:00:00Z');
const ago = m => new Date(NOW - m * 60000).toISOString();
const mk = (key, title, outcomes, upd = ago(1), market = 'h2h') =>
  ({ key, title, last_update: upd, markets: [{ key: market, last_update: upd, outcomes: outcomes.map(([name, price]) => ({ name, price })) }] });
const ev = (id, home, away, start, bookmakers) => ({ id, sport_key: 'soccer_epl', sport_title: 'EPL', commence_time: start, home_team: home, away_team: away, bookmakers });
const FUTURE = '2030-06-02T15:00:00Z', PAST = '2030-06-01T11:00:00Z';
const sport = { key: 'soccer_epl', title: 'EPL' };

const raw = [
  // 3-way arb: best prices 2.6 (betway) / 3.8 (casumo) / 3.6 (casumo)
  ev('A', 'Reds', 'Blues', FUTURE, [
    mk('betway', 'Betway', [['Reds', 2.6], ['Draw', 3.2], ['Blues', 3.0]]),
    mk('casumo', 'Casumo', [['Reds', 2.4], ['Draw', 3.8], ['Blues', 3.6]])]),
  // 2-way near miss
  ev('B', 'Ace', 'Bee', FUTURE, [
    mk('betway', 'Betway', [['Ace', 1.9], ['Bee', 2.0]]),
    mk('casumo', 'Casumo', [['Ace', 1.85], ['Bee', 2.05]])]),
  // arb on paper, but one leg is 30 minutes old
  ev('C', 'Cat', 'Dog', FUTURE, [
    mk('betway', 'Betway', [['Cat', 2.1], ['Dog', 1.5]], ago(30)),
    mk('casumo', 'Casumo', [['Cat', 1.5], ['Dog', 2.2]], ago(1))]),
  // already started
  ev('D', 'Elk', 'Fox', PAST, [mk('betway', 'Betway', [['Elk', 2.0], ['Fox', 2.0]])]),
  // only one bookmaker quoting everything (same-book flag), plus junk market and bad price
  ev('E', 'Gnu', 'Hen', FUTURE, [
    mk('betway', 'Betway', [['Gnu', 2.1], ['Hen', 2.1]]),
    mk('casumo', 'Casumo', [['Gnu', 1.0], ['Hen', 1.0]]),
    mk('smarkets', 'Smarkets', [['Gnu', 5], ['Hen', 5]], ago(1), 'totals')]),
  // 4 outcomes -> not a 2/3-way market
  ev('F', 'Ibis', 'Jay', FUTURE, [mk('betway', 'Betway', [['Ibis', 2], ['Draw', 3], ['Jay', 3], ['Other', 9]])])
];

const events = Source.normalize(raw, sport);
assert.strictEqual(events.length, 6);
assert.strictEqual(events[0].league, 'EPL');
assert.deepStrictEqual(Object.keys(events[0].outcomes), ['Reds', 'Draw', 'Blues']);
// junk market ignored, price<=1 dropped
assert.strictEqual(events[4].outcomes['Gnu'].length, 1);
assert.deepStrictEqual(Source.normalize(null, sport), []);

const get = (r, id) => r.find(x => x.event.id === id);
const res = Scan.scanAll(events, { now: NOW });
assert.strictEqual(get(res, 'F'), undefined);           // 4 outcomes dropped

// A: best legs, ordered Home/Draw/Away, arb with the right margin
const A = get(res, 'A');
assert.deepStrictEqual(A.legs.map(l => [l.name, l.book, l.dec]), [['Reds', 'betway', 2.6], ['Draw', 'casumo', 3.8], ['Blues', 'casumo', 3.6]]);
assert(A.isArb && !A.started && !A.stale && !A.sameBook);
near(A.sumInv, 1 / 2.6 + 1 / 3.8 + 1 / 3.6);
near(A.margin, 1 / A.sumInv - 1);

// ranked closest-to-arb first
assert.strictEqual(res[0].event.id, 'A');
for (let i = 1; i < res.length; i++) assert(res[i - 1].sumInv <= res[i].sumInv);

// B: near miss, not an arb
const B = get(res, 'B');
assert(!B.isArb); near(B.sumInv, 1 / 1.9 + 1 / 2.05);

// C: arb on paper but stale; D: started; E: same book on both legs
const C = get(res, 'C'); assert(C.isArb && C.stale); near(C.oldestAge, 30);
assert(get(res, 'D').started);
assert(get(res, 'E').sameBook);

// commission: Smarkets 5% turns A's winning Reds price 2.6 -> 2.52 when it is the best source
const withEx = Source.normalize([ev('G', 'P', 'Q', FUTURE, [
  mk('betway', 'Betway', [['P', 2.0], ['Q', 2.0]]),
  mk('smarkets', 'Smarkets', [['P', 2.1], ['Q', 1.9]])])], sport);
let g = Scan.analyse(withEx[0], { now: NOW });
assert.strictEqual(g.legs[0].book, 'smarkets');
g = Scan.analyse(withEx[0], { now: NOW, commission: { smarkets: 5 } });
assert.strictEqual(g.legs[0].book, 'smarkets');          // 1 + 1.1*0.95 = 2.045 still beats 2.0
near(g.legs[0].eff, 2.045); near(g.legs[0].dec, 2.1);
g = Scan.analyse(withEx[0], { now: NOW, commission: { smarkets: 20 } });
assert.strictEqual(g.legs[0].book, 'betway');             // 1 + 1.1*0.8 = 1.88 loses to 2.0

// scanner and calculator agree on the maths
const Arb = require('../js/arb.js');
const calc = Arb.calc({ odds: A.legs.map(l => l.dec), mode: 'total', total: 100 });
near(calc.sumInv, A.sumInv); near(calc.margin, A.margin);

// best-price share
const share = Scan.bestPriceShare([A, B]);
assert.strictEqual(share.total, 5);
assert.strictEqual(share.counts.casumo, 3);

console.log('scan.js / odds-source.js: all checks passed');
