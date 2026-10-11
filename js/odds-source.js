// The only file that knows about The Odds API (https://the-odds-api.com).
// It turns the API's response into the neutral event shape that js/scan.js
// consumes, so another odds source can be swapped in by writing a new file that
// returns the same shape:
//   { id, sportKey, league, start, home, away,
//     outcomes: { "<outcome name>": [ { book, title, dec, updated } ] } }
//
// The API key lives only in localStorage and is sent only to the API, as it
// requires (`apiKey` query param). Never log or display a request URL.
(function (root) {
  'use strict';

  var BASE = 'https://api.the-odds-api.com/v4';
  var KEY_STORE = 'arb.oddsApiKey', USAGE_STORE = 'arb.oddsUsage';

  // UK-region bookmaker keys from the provider's bookmaker list. `ex` = betting exchange.
  var BOOKS = [
    { key: 'betway', title: 'Betway' }, { key: 'casumo', title: 'Casumo' },
    { key: 'betfair_ex_uk', title: 'Betfair Exchange', ex: true },
    { key: 'smarkets', title: 'Smarkets', ex: true },
    { key: 'matchbook', title: 'Matchbook', ex: true },
    { key: 'sport888', title: '888sport' }, { key: 'betano_uk', title: 'Betano' },
    { key: 'betfair_sb_uk', title: 'Betfair Sportsbook' }, { key: 'betfred_uk', title: 'Betfred' },
    { key: 'betvictor', title: 'Bet Victor' }, { key: 'boylesports', title: 'BoyleSports' },
    { key: 'coral', title: 'Coral' }, { key: 'grosvenor', title: 'Grosvenor' },
    { key: 'ladbrokes_uk', title: 'Ladbrokes' }, { key: 'leovegas', title: 'LeoVegas' },
    { key: 'livescorebet', title: 'LiveScore Bet' }, { key: 'paddypower', title: 'Paddy Power' },
    { key: 'skybet', title: 'Sky Bet' }, { key: 'unibet_uk', title: 'Unibet' },
    { key: 'virginbet', title: 'Virgin Bet' }, { key: 'williamhill', title: 'William Hill' }
  ];
  var MAX_BOOKS = 10;   // 10 bookmakers = 1 "region" for billing; 11+ doubles the cost per call

  // ---- storage (can throw in private windows, so always wrapped) -------------
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* no storage */ }
    return null;
  }
  function getKey() { return store(KEY_STORE) || ''; }
  function setKey(k) { store(KEY_STORE, k ? String(k).trim() : null); }
  function getUsage() { try { return JSON.parse(store(USAGE_STORE) || 'null'); } catch (e) { return null; } }

  // ---- HTTP ------------------------------------------------------------------
  function toInt(h) { var v = parseInt(h, 10); return isFinite(v) ? v : null; }

  function request(path, params) {
    var qs = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(BASE + path + '?' + qs).then(function (res) {
      var usage = {
        remaining: toInt(res.headers.get('x-requests-remaining')),
        used: toInt(res.headers.get('x-requests-used')),
        last: toInt(res.headers.get('x-requests-last')),
        at: Date.now()
      };
      if (usage.remaining !== null || usage.used !== null) store(USAGE_STORE, JSON.stringify(usage));
      return res.json().catch(function () { return null; }).then(function (body) {
        if (!res.ok) {
          var err = new Error((body && body.message) || ('The odds service returned an error (' + res.status + ').'));
          err.code = (body && body.error_code) || ('HTTP_' + res.status);
          err.status = res.status;
          throw err;
        }
        return { body: body, usage: usage };
      });
    }, function () {
      var err = new Error('Could not reach the odds service. Check your connection and try again.');
      err.code = 'NETWORK';
      throw err;
    });
  }

  // Free: /sports does not use credits. Returns active, non-outright sports.
  function listSports() {
    return request('/sports/', { apiKey: getKey() }).then(function (r) {
      return r.body.filter(function (s) { return s.active && !s.has_outrights; })
        .map(function (s) { return { key: s.key, group: s.group, title: s.title }; });
    });
  }

  // One call = one sport, h2h market only, only the chosen bookmakers.
  function fetchOdds(sport, bookKeys) {
    return request('/sports/' + encodeURIComponent(sport.key) + '/odds/', {
      apiKey: getKey(), regions: 'uk', bookmakers: bookKeys.join(','),
      markets: 'h2h', oddsFormat: 'decimal', dateFormat: 'iso'
    }).then(function (r) { return { events: normalize(r.body, sport), usage: r.usage }; });
  }

  // ---- normalisation (pure) --------------------------------------------------
  function titleFor(key) { for (var i = 0; i < BOOKS.length; i++) if (BOOKS[i].key === key) return BOOKS[i].title; return key; }

  function normalize(raw, sport) {
    if (!Array.isArray(raw)) return [];
    return raw.map(function (e) {
      var outcomes = {};
      (e.bookmakers || []).forEach(function (b) {
        (b.markets || []).forEach(function (m) {
          if (m.key !== 'h2h') return;
          (m.outcomes || []).forEach(function (o) {
            var dec = Number(o.price);
            if (!isFinite(dec) || dec <= 1) return;
            (outcomes[o.name] = outcomes[o.name] || []).push({
              book: b.key, title: b.title || titleFor(b.key), dec: dec, updated: m.last_update || b.last_update || null
            });
          });
        });
      });
      return { id: e.id, sportKey: e.sport_key, league: (sport && sport.title) || e.sport_title || e.sport_key,
               start: e.commence_time, home: e.home_team, away: e.away_team, outcomes: outcomes };
    });
  }

  var OddsSource = { BOOKS: BOOKS, MAX_BOOKS: MAX_BOOKS, getKey: getKey, setKey: setKey, getUsage: getUsage,
                     listSports: listSports, fetchOdds: fetchOdds, normalize: normalize };
  if (typeof module !== 'undefined' && module.exports) module.exports = OddsSource;
  else root.OddsSource = OddsSource;
})(typeof window !== 'undefined' ? window : this);
