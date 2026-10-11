# Arbitrage calculator

Enter the odds for a 2-way or 3-way market and get the stake on each outcome and the guaranteed profit.

- Odds as fractional (`9/2`, `evens`), decimal (`5.50`) or American (`+450`) — flipping the format converts what you've typed.
- Work out stakes from a **total stake**, or from **one fixed stake** you've already placed.
- Optionally **round each stake** to the nearest £1 / £5 / £10 / £50 / £100. Profit then varies by outcome; the headline figure is the worst case.
- Optional per-outcome **exchange commission** (e.g. Betfair): applied as `effective odds = 1 + (odds − 1) × (1 − commission)`.

## Maths

With decimal odds `dᵢ`, an arbitrage exists when `Σ 1/dᵢ < 1`. Stake on outcome *i* is `Total × (1/dᵢ) / Σ(1/dᵢ)`, every outcome returns `Total / Σ(1/dᵢ)`, so profit is that minus `Total`.

## Layout

- `js/arb.js` — pure maths (parsing, formatting, `calc`). No DOM, so a future odds scanner can reuse it.
- `js/app.js` — the UI.
- `tools/check_arb.js` — `node tools/check_arb.js` checks the maths against hand-worked cases.

No build step and no dependencies. Run locally with `python -m http.server`, deploy by serving the repo root from GitHub Pages.
