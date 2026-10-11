// Run: node tools/check_arb.js   — checks js/arb.js against hand-worked cases.
const assert = require('assert');
const Arb = require('../js/arb.js');
const near = (a, b, tol = 1e-9) => assert(Math.abs(a - b) < tol, `${a} !~ ${b}`);

// ---- parsing ----
near(Arb.parseOdds('9/2', 'fractional'), 5.5);
near(Arb.parseOdds('9-2', 'fractional'), 5.5);
near(Arb.parseOdds('evens', 'fractional'), 2);
near(Arb.parseOdds('11/10', 'fractional'), 2.1);
near(Arb.parseOdds('5.5', 'decimal'), 5.5);
near(Arb.parseOdds('5,5', 'decimal'), 5.5);
near(Arb.parseOdds('+450', 'american'), 5.5);
near(Arb.parseOdds('-200', 'american'), 1.5);
near(Arb.parseOdds('250', 'american'), 3.5);
for (const [t, f] of [['', 'decimal'], ['1.0', 'decimal'], ['0.5', 'decimal'], ['abc', 'decimal'],
                      ['1/0', 'fractional'], ['0/5', 'fractional'], ['5', 'fractional'],
                      ['+50', 'american'], ['0', 'american']]) {
  assert.strictEqual(Arb.parseOdds(t, f), null, `${t} (${f}) should be invalid`);
}

// ---- formatting round-trips ----
assert.strictEqual(Arb.formatOdds(5.5, 'fractional'), '9/2');
assert.strictEqual(Arb.formatOdds(2, 'fractional'), 'evens');
assert.strictEqual(Arb.formatOdds(2.1, 'fractional'), '11/10');
assert.strictEqual(Arb.formatOdds(1.91, 'fractional'), '91/100');
assert.strictEqual(Arb.formatOdds(5.5, 'american'), '+450');
assert.strictEqual(Arb.formatOdds(1.5, 'american'), '-200');
assert.strictEqual(Arb.formatOdds(5.5, 'decimal'), '5.50');

// ---- 2-way: 2.10 / 2.10, £100 -> 50/50, return 105, profit 5 ----
let r = Arb.calc({ odds: [2.1, 2.1], mode: 'total', total: 100 });
assert(r.isArb);
near(r.stakes[0], 50); near(r.stakes[1], 50);
near(r.minProfit, 5); near(r.maxProfit, 5); near(r.roi, 0.05);

// ---- 3-way: 11/10, 5/2, 4/1 = 2.1, 3.5, 5.0 ----
r = Arb.calc({ odds: [2.1, 3.5, 5], mode: 'total', total: 100 });
near(r.sumInv, 1 / 2.1 + 1 / 3.5 + 1 / 5);
assert(r.isArb);
near(r.stakes.reduce((a, b) => a + b), 100);
r.profits.forEach(p => near(p, r.profits[0]));          // equal profit on every outcome
near(r.minProfit, 100 / r.sumInv - 100);
near(r.margin, 1 / r.sumInv - 1);

// ---- no arb: 1.90 / 1.90 loses 5% ----
r = Arb.calc({ odds: [1.9, 1.9], mode: 'total', total: 100 });
assert(!r.isArb);
near(r.minProfit, -5);

// ---- exactly fair book: 2.0 / 2.0 is not an arb ----
r = Arb.calc({ odds: [2, 2], mode: 'total', total: 100 });
assert(!r.isArb); near(r.minProfit, 0);

// ---- fix one leg: £60 on leg 0 at 2.1 -> leg 1 stake 60*2.1/2.1 ----
r = Arb.calc({ odds: [2.1, 2.1], mode: 'leg', legIndex: 0, legStake: 60 });
near(r.stakes[0], 60); near(r.stakes[1], 60); near(r.minProfit, 6);
r = Arb.calc({ odds: [2.0, 4.0], mode: 'leg', legIndex: 1, legStake: 25 });   // 1/2+1/4 = .75
near(r.stakes[1], 25); near(r.stakes[0], 50);           // 25*4/2
near(r.returns[0], 100); near(r.returns[1], 100); near(r.minProfit, 25);

// ---- commission: 5% on winnings at 3.0 is the same as odds of 2.9 ----
near(Arb.effectiveOdds(3, 5), 2.9);
r = Arb.calc({ odds: [2.1, 3.0], commission: [0, 5], mode: 'total', total: 100 });
const r2 = Arb.calc({ odds: [2.1, 2.9], mode: 'total', total: 100 });
near(r.minProfit, r2.minProfit); near(r.stakes[1], r2.stakes[1]);

// ---- rounding: profit now varies, guaranteed = the lowest ----
r = Arb.calc({ odds: [2.1, 3.5, 5], mode: 'total', total: 100, roundTo: 10 });
r.stakes.forEach(s => near(s % 10, 0));
near(r.totalStake, r.stakes.reduce((a, b) => a + b));
near(r.minProfit, Math.min(...r.returns) - r.totalStake);
assert(r.maxProfit >= r.minProfit);
// fixed leg keeps the typed amount even when rounding is on
r = Arb.calc({ odds: [2.1, 3.5, 5], mode: 'leg', legIndex: 0, legStake: 47, roundTo: 10 });
near(r.stakes[0], 47); near(r.stakes[1] % 10, 0); near(r.stakes[2] % 10, 0);
// a stake that rounds to nothing is flagged
r = Arb.calc({ odds: [1.05, 30], mode: 'total', total: 10, roundTo: 10 });
assert(r.hasZeroStake);

console.log('arb.js: all checks passed');
