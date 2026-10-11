# Arbitrage calculator

Enter the odds for a 2-way or 3-way market and get the stake on each outcome and the guaranteed profit.

- Odds as fractional (`9/2`, `evens`), decimal (`5.50`) or American (`+450`) — flipping the format converts what you've typed.
- Work out stakes from a **total stake**, or from **one fixed stake** you've already placed.
- Optionally **round each stake** to the nearest £1 / £5 / £10 / £50 / £100. Profit then varies by outcome; the headline figure is the worst case.
- Optional per-outcome **exchange commission** (e.g. Betfair): applied as `effective odds = 1 + (odds − 1) × (1 − commission)`.

## Scanner

The Scanner tab pulls live odds from [The Odds API](https://the-odds-api.com) (free key) and ranks events by how close they are to an arbitrage, with exchange commission applied. **Open in calculator** sends a result to the calculator.

- The key is pasted into the page and kept only in your browser's `localStorage`; it is never in the repo.
- A scan only runs when you press **Scan now** — never automatically. Cost is shown before you scan and the real balance is read from the API's response headers after every call. Each sport/league is one call; keep to 10 bookmakers or each call costs double.
- Exchange commission (Betfair Exchange, Smarkets, Matchbook) is **assumed 5%** and editable — set your own account's rate.
- Prices are a snapshot with no liquidity information: confirm on the bookmaker's site before betting.

## Maths

With decimal odds `dᵢ`, an arbitrage exists when `Σ 1/dᵢ < 1`. Stake on outcome *i* is `Total × (1/dᵢ) / Σ(1/dᵢ)`, every outcome returns `Total / Σ(1/dᵢ)`, so profit is that minus `Total`.

## Layout

- `js/arb.js` — pure maths (parsing, formatting, `calc`). No DOM, so a future odds scanner can reuse it.
- `js/app.js` — the calculator UI (and `Calculator.load`, used by the scanner).
- `js/odds-source.js` — the only code that talks to The Odds API; returns a neutral event shape so another source can replace it.
- `js/scan.js` — pure scanner logic (best price per outcome, commission, flags, ranking), built on `Arb`.
- `js/scanner-ui.js`, `js/tabs.js` — Scanner tab and tab switching.
- `tools/check_arb.js`, `tools/check_scan.js` — `node tools/check_arb.js && node tools/check_scan.js` checks the maths and scanner against hand-worked cases. Run after any change to those files.

No build step and no dependencies. Run locally with `python -m http.server`, deploy by serving the repo root from GitHub Pages.
