/* SpieleAffen — engine.js
 * Datenmodell, Punkte-Engine, Tabellen, Pokale, Rekorde.
 * Läuft im Browser (window.SA) und in Node (module.exports) — keine DOM-Abhängigkeit,
 * damit die Regeln von der Kommandozeile aus prüfbar bleiben.
 *
 * Punkteregeln (unverändert aus der Vorgänger-App übernommen):
 *   – Platzierung je Spiel: 1. = 5, 2. = 3, 3. = 1 (Gleichstand teilt den Platz)
 *   – Antreten: +1 pro Abend
 *   – Bester Tipp je Spiel: +3 (Gleichstand: alle Nächsten)
 *   – Strafe: −20 je Regelbruch
 * Abendsieger = meiste Punkte des Abends.
 *
 * Datendokument:
 *   { meta, players[], seasons[], games[], nights[], modules{}, houseRules[] }
 *   players: { id, name, short, seat 1..6, admin, archived }
 *   nights:  { id, date, title, hostId, status, dabei[], snacks[], games[] }
 *   games in nights: { id, gameId, title, lowerWins, durationMin, results[] }
 *   results: { playerId, score, tip, strafe }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PLACE_POINTS = [5, 3, 1];  // 1., 2., 3. — danach 0
  var PART_POINTS = 1;           // pro Abend
  var TIP_BONUS = 3;             // bester Tipp je Spiel
  var STRAFE_POINTS = 20;        // Abzug je Strafe

  var SEATS = [1, 2, 3, 4, 5, 6];

  // ── Helfer ────────────────────────────────────────────────────────────────
  function byDateAsc(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }

  function fmtDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[2] + '.' + p[1] + '.' + p[0].slice(2);
  }
  function fmtDateShort(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return parseInt(p[2], 10) + '.' + parseInt(p[1], 10) + '.';
  }
  var MONTHS = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];
  var MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  var WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  function monthAbbr(iso) { return MONTHS[parseInt(iso.split('-')[1], 10) - 1] || ''; }
  function monthName(key) {
    var p = String(key).split('-');
    return (MONTHS_LONG[parseInt(p[1], 10) - 1] || '') + ' ' + p[0];
  }
  function dayNum(iso) { return parseInt(iso.split('-')[2], 10); }
  function monthKey(iso) { return iso ? iso.slice(0, 7) : ''; }
  function weekday(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00');
    return WEEKDAYS[d.getDay()] || '';
  }
  /* „Di, 19. Mai" — die Datumsform aus dem Design-Kit. */
  function fmtDateLong(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return weekday(iso) + ', ' + parseInt(p[2], 10) + '. ' + (MONTHS_LONG[parseInt(p[1], 10) - 1] || '');
  }

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return String(name || '?').slice(0, 2).toUpperCase();
  }
  function shortCode(player) {
    if (!player) return '?';
    if (player.short) return String(player.short).toUpperCase().slice(0, 2);
    return initials(player.name);
  }

  function seasonOf(data, iso) {
    var list = data.seasons || [];
    for (var i = 0; i < list.length; i++) {
      if (iso >= list[i].start && iso <= list[i].end) return list[i];
    }
    return null;
  }

  /* Wettkampf-Ranking über einen Zahlenwert: gleiche Werte teilen den Platz ("1224"). */
  function rankBy(items, valueOf, desc) {
    var sorted = items.slice().sort(function (a, b) {
      var d = valueOf(b) - valueOf(a);
      return desc === false ? -d : d;
    });
    var out = new Map();
    for (var i = 0; i < sorted.length; i++) {
      var v = valueOf(sorted[i]);
      var place = i + 1;
      if (i > 0 && valueOf(sorted[i - 1]) === v) place = out.get(sorted[i - 1]).place;
      out.set(sorted[i], { place: place, value: v });
    }
    return out;
  }

  /* „1 Spiel" statt „1 Spiele" — Zahlen bleiben Ziffern, aber das Wort daneben
     muss stimmen. */
  function plural(n, einzahl, mehrzahl) {
    return n + ' ' + (Math.abs(n) === 1 ? einzahl : mehrzahl);
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }

  /* Freie Sitzfarben: sechs Stück, aktive Affen belegen je eine. */
  function freeSeats(players) {
    var taken = (players || []).filter(function (p) { return !p.archived; })
      .map(function (p) { return Number(p.seat); });
    return SEATS.filter(function (s) { return taken.indexOf(s) < 0; });
  }

  // ── Spiel auswerten ───────────────────────────────────────────────────────
  // → je playerId: {score, tip, place, placePts, tipPts, tipDiff, exact, strafe, strafePts}
  function evalGame(game) {
    var res = (game.results || []).filter(function (r) { return r.score != null && r.score !== ''; });
    if (!res.length) return {};
    var ranks = rankBy(res, function (r) { return game.lowerWins ? -Number(r.score) : Number(r.score); });
    var out = {};
    res.forEach(function (r) {
      var place = ranks.get(r).place;
      out[r.playerId] = {
        score: Number(r.score),
        tip: (r.tip === 0 || r.tip) ? Number(r.tip) : null,
        place: place,
        placePts: PLACE_POINTS[place - 1] || 0,
        tipPts: 0, tipDiff: null, exact: false,
        strafe: !!r.strafe,
        strafePts: r.strafe ? -STRAFE_POINTS : 0
      };
    });
    // Tipp-Bonus: kleinste Abweichung |score − tip| unter allen Tippern
    var tippers = res.filter(function (r) { return r.tip === 0 || r.tip; });
    if (tippers.length) {
      var best = Infinity;
      tippers.forEach(function (r) { best = Math.min(best, Math.abs(Number(r.score) - Number(r.tip))); });
      tippers.forEach(function (r) {
        var d = Math.abs(Number(r.score) - Number(r.tip));
        out[r.playerId].tipDiff = d;
        out[r.playerId].exact = d === 0;
        if (d === best) out[r.playerId].tipPts = TIP_BONUS;
      });
    }
    return out;
  }

  // ── Abend auswerten ───────────────────────────────────────────────────────
  function evalNight(night) {
    var per = {};
    (night.games || []).forEach(function (g) {
      var ev = evalGame(g);
      Object.keys(ev).forEach(function (pid) {
        if (!per[pid]) per[pid] = { placePts: 0, tipPts: 0, partPts: PART_POINTS, strafePts: 0, strafen: 0, total: 0, games: [] };
        per[pid].placePts += ev[pid].placePts;
        per[pid].tipPts += ev[pid].tipPts;
        per[pid].strafePts += ev[pid].strafePts;
        if (ev[pid].strafe) per[pid].strafen += 1;
        per[pid].games.push({
          gameId: g.id, title: g.title, place: ev[pid].place, score: ev[pid].score,
          tip: ev[pid].tip, tipDiff: ev[pid].tipDiff, tipPts: ev[pid].tipPts,
          exact: ev[pid].exact, strafe: ev[pid].strafe
        });
      });
    });
    var pids = Object.keys(per);
    pids.forEach(function (pid) {
      per[pid].total = per[pid].placePts + per[pid].tipPts + per[pid].partPts + per[pid].strafePts;
      var placeSum = 0;
      per[pid].games.forEach(function (g) { placeSum += g.place; });
      per[pid].avgPlace = per[pid].games.length ? placeSum / per[pid].games.length : 0;
    });
    var ranks = rankBy(pids, function (pid) { return per[pid].total; });
    var winners = [], losers = [];
    var totals = pids.map(function (pid) { return per[pid].total; });
    var max = totals.length ? Math.max.apply(null, totals) : 0;
    var min = totals.length ? Math.min.apply(null, totals) : 0;
    pids.forEach(function (pid) {
      per[pid].place = ranks.get(pid).place;
      if (per[pid].total === max) winners.push(pid);
    });
    // „Letzter des Abends": eindeutig schlechtester — bei Punktgleichheit
    // entscheidet die schlechtere Durchschnittsplatzierung; volle Gleichheit → niemand.
    if (max !== min) {
      var cands = pids.filter(function (pid) { return per[pid].total === min; });
      cands.sort(function (a, b) { return per[b].avgPlace - per[a].avgPlace; });
      if (cands.length === 1 || per[cands[0]].avgPlace > per[cands[1]].avgPlace) losers = [cands[0]];
    }
    return { per: per, players: pids, winners: winners, losers: losers };
  }

  // ── Gesamtauswertung ──────────────────────────────────────────────────────
  function newStats() {
    return {
      nights: 0, nightWins: 0, nightLasts: 0, points: 0,
      placePts: 0, tipPts: 0, partPts: 0, strafePts: 0, strafen: 0,
      gamesPlayed: 0, gameWins: 0, tipBonuses: 0, tipExacts: 0,
      placements: []
    };
  }

  function compute(data) {
    data = data || {};
    var players = data.players || [];
    var playerById = {};
    players.forEach(function (p) { playerById[p.id] = p; });

    var nights = (data.nights || []).slice().sort(byDateAsc);
    var played = nights.filter(function (n) { return (n.games || []).length > 0 && hasResults(n); });
    var planned = nights.filter(function (n) { return played.indexOf(n) < 0; });
    var live = nights.filter(function (n) { return n.status === 'laeuft'; })[0] || null;

    // Bereiche: 'all', jede Saison, jeder Monat mit Abenden
    var scopes = { all: {} };
    (data.seasons || []).forEach(function (s) { scopes[s.id] = {}; });
    played.forEach(function (n) { if (!scopes['m:' + monthKey(n.date)]) scopes['m:' + monthKey(n.date)] = {}; });
    function stat(scope, pid) {
      if (!scopes[scope]) scopes[scope] = {};
      if (!scopes[scope][pid]) scopes[scope][pid] = newStats();
      return scopes[scope][pid];
    }

    var nightInfos = [];
    var unlockEvents = [];
    var perGame = {};
    var streaks = {};
    var timelinePerPlayer = {};
    var rankSnapshots = {};   // scope -> [ {pid: place} ] nach jedem Abend
    var records = {
      bestScoreByTitle: {}, longestGameMin: null, bestNightPoints: null,
      bestStreak: null, worstNight: null
    };

    played.forEach(function (night) {
      var season = seasonOf(data, night.date);
      var ev = evalNight(night);
      var info = { night: night, season: season, eval: ev };
      nightInfos.push(info);
      var scopeKeys = ['all', 'm:' + monthKey(night.date)].concat(season ? [season.id] : []);

      ev.players.forEach(function (pid) {
        var e = ev.per[pid];
        scopeKeys.forEach(function (key) {
          var s = stat(key, pid);
          s.nights += 1;
          s.points += e.total;
          s.placePts += e.placePts;
          s.tipPts += e.tipPts;
          s.partPts += e.partPts;
          s.strafePts += e.strafePts;
          s.strafen += e.strafen;
          s.gamesPlayed += e.games.length;
          s.placements.push(e.place);
          e.games.forEach(function (g) {
            if (g.place === 1) s.gameWins += 1;
            if (g.tipPts > 0) s.tipBonuses += 1;
            if (g.exact) s.tipExacts += 1;
          });
          if (ev.winners.indexOf(pid) >= 0) s.nightWins += 1;
          if (ev.losers.indexOf(pid) >= 0) s.nightLasts += 1;
        });
        if (!timelinePerPlayer[pid]) timelinePerPlayer[pid] = [];
        timelinePerPlayer[pid].push({ nightId: night.id, date: night.date, place: e.place, total: e.total });
        if (!records.bestNightPoints || e.total > records.bestNightPoints.points) {
          records.bestNightPoints = { points: e.total, playerId: pid, date: night.date, nightId: night.id };
        }
        if (!records.worstNight || e.total < records.worstNight.points) {
          records.worstNight = { points: e.total, playerId: pid, date: night.date, nightId: night.id };
        }
      });

      // Serien laufen über alle Abende, nicht je Saison
      players.forEach(function (p) {
        var pid = p.id;
        if (ev.players.indexOf(pid) < 0) return; // nicht dabei: Serie bleibt stehen
        if (!streaks[pid]) streaks[pid] = { cur: 0, best: 0 };
        if (ev.winners.indexOf(pid) >= 0) {
          streaks[pid].cur += 1;
          streaks[pid].best = Math.max(streaks[pid].best, streaks[pid].cur);
          if (!records.bestStreak || streaks[pid].cur > records.bestStreak.len) {
            records.bestStreak = { len: streaks[pid].cur, playerId: pid };
          }
        } else {
          streaks[pid].cur = 0;
        }
      });

      // Pro Spiel + Rekorde
      (night.games || []).forEach(function (g) {
        var gv = evalGame(g);
        if (!Object.keys(gv).length) return;
        if (!perGame[g.title]) perGame[g.title] = { title: g.title, gameId: g.gameId || null, plays: 0, byPlayer: {} };
        var pg = perGame[g.title];
        pg.plays += 1;
        Object.keys(gv).forEach(function (pid) {
          if (!pg.byPlayer[pid]) pg.byPlayer[pid] = { played: 0, wins: 0, scoreSum: 0, bestScore: null, places: [] };
          var bp = pg.byPlayer[pid];
          bp.played += 1;
          bp.scoreSum += gv[pid].score;
          bp.places.push(gv[pid].place);
          if (gv[pid].place === 1) bp.wins += 1;
          var better = g.lowerWins ? (bp.bestScore === null || gv[pid].score < bp.bestScore)
                                   : (bp.bestScore === null || gv[pid].score > bp.bestScore);
          if (better) bp.bestScore = gv[pid].score;
          if (!g.lowerWins) {
            var rec = records.bestScoreByTitle[g.title];
            if (!rec || gv[pid].score > rec.score) {
              records.bestScoreByTitle[g.title] = { score: gv[pid].score, playerId: pid, date: night.date };
            }
          }
        });
        if (g.durationMin && (!records.longestGameMin || g.durationMin > records.longestGameMin.min)) {
          records.longestGameMin = { min: g.durationMin, title: g.title, date: night.date };
        }
      });

      // Platzierungs-Momentaufnahme je Bereich — daraus wird später die Bewegung (delta)
      scopeKeys.forEach(function (key) {
        var pids = Object.keys(scopes[key]);
        var r = rankBy(pids, function (pid) { return scopes[key][pid].points; });
        var snap = {};
        pids.forEach(function (pid) { snap[pid] = r.get(pid).place; });
        if (!rankSnapshots[key]) rankSnapshots[key] = [];
        rankSnapshots[key].push(snap);
      });
    });

    // ── Tabellen ────────────────────────────────────────────────────────────
    function table(scope) {
      var rows = players
        .map(function (p) { return { player: p, stats: scopes[scope] && scopes[scope][p.id] }; })
        .filter(function (r) { return r.stats && r.stats.nights > 0; });
      rows.sort(function (a, b) {
        return (b.stats.points - a.stats.points) ||
               (b.stats.nightWins - a.stats.nightWins) ||
               a.player.name.localeCompare(b.player.name, 'de');
      });
      var ranks = rankBy(rows, function (r) { return r.stats.points; });
      rows.forEach(function (r) { r.place = ranks.get(r).place; });
      return rows;
    }

    /* Bewegung gegenüber dem vorletzten Abend: +1 = einen Platz gutgemacht. */
    function deltaIn(scope, pid) {
      var snaps = rankSnapshots[scope];
      if (!snaps || snaps.length < 2) return 0;
      var now = snaps[snaps.length - 1][pid];
      var before = snaps[snaps.length - 2][pid];
      if (now == null || before == null) return 0;
      return before - now;
    }

    /* Die Zeilenform, die Rangliste, Affen und die Sprüche erwarten. */
    function standings(scope, opts) {
      opts = opts || {};
      var rows = table(scope || 'all');
      var out = rows.map(function (r) {
        var s = r.stats;
        return {
          id: r.player.id, name: r.player.name, short: shortCode(r.player),
          seat: r.player.seat, archiv: !!r.player.archived, admin: !!r.player.admin,
          place: r.place, points: s.points, delta: deltaIn(scope || 'all', r.player.id),
          nights: s.nights, wins: s.nightWins, lasts: s.nightLasts,
          gameWins: s.gameWins, gamesPlayed: s.gamesPlayed,
          tipBonuses: s.tipBonuses, tipExacts: s.tipExacts,
          strafen: s.strafen,
          streak: streaks[r.player.id] ? streaks[r.player.id].cur : 0,
          bestStreak: streaks[r.player.id] ? streaks[r.player.id].best : 0,
          quote: s.nights ? Math.round((s.nightWins / s.nights) * 100) : 0,
          you: opts.youId ? r.player.id === opts.youId : false
        };
      });
      // Affen ohne Abende gehören trotzdem in die Affen-Liste
      if (opts.includeEmpty) {
        var seen = {};
        out.forEach(function (a) { seen[a.id] = true; });
        players.filter(function (p) { return !seen[p.id] && (opts.includeArchived || !p.archived); })
          .forEach(function (p) {
            out.push({
              id: p.id, name: p.name, short: shortCode(p), seat: p.seat, archiv: !!p.archived, admin: !!p.admin,
              place: out.length + 1, points: 0, delta: 0, nights: 0, wins: 0, lasts: 0,
              gameWins: 0, gamesPlayed: 0, tipBonuses: 0, tipExacts: 0, strafen: 0,
              streak: 0, bestStreak: 0, quote: 0, you: opts.youId === p.id
            });
          });
      }
      return opts.includeArchived ? out : out.filter(function (a) { return !a.archiv; });
    }

    // ── Angstgegner (Nemesis) ───────────────────────────────────────────────
    var beats = {};
    played.forEach(function (night) {
      (night.games || []).forEach(function (g) {
        var gv = evalGame(g);
        var pids = Object.keys(gv);
        pids.forEach(function (a) {
          pids.forEach(function (b) {
            if (a === b) return;
            if (!beats[a]) beats[a] = {};
            if (!beats[a][b]) beats[a][b] = { lost: 0, shared: 0, byTitle: {} };
            var cell = beats[a][b];
            cell.shared += 1;
            if (!cell.byTitle[g.title]) cell.byTitle[g.title] = { lost: 0, shared: 0 };
            cell.byTitle[g.title].shared += 1;
            if (gv[b].place < gv[a].place) { cell.lost += 1; cell.byTitle[g.title].lost += 1; }
          });
        });
      });
    });
    function nemesisOf(pid) {
      var best = null;
      Object.keys(beats[pid] || {}).forEach(function (b) {
        var c = beats[pid][b];
        if (c.shared < 4) return;
        var rate = c.lost / c.shared;
        if (rate <= 0.5) return;
        if (!best || rate > best.rate || (rate === best.rate && c.shared > best.shared)) {
          var worstTitle = null;
          Object.keys(c.byTitle).forEach(function (t) {
            var ct = c.byTitle[t];
            if (ct.shared >= 3 && ct.lost / ct.shared > 0.5 &&
                (!worstTitle || ct.lost / ct.shared > worstTitle.rate)) {
              worstTitle = { title: t, lost: ct.lost, shared: ct.shared, rate: ct.lost / ct.shared };
            }
          });
          best = { playerId: b, lost: c.lost, shared: c.shared, rate: rate, worstTitle: worstTitle };
        }
      });
      return best;
    }

    // ── Pokale ──────────────────────────────────────────────────────────────
    // Aus der Historie berechnet — deterministisch, nichts zu speichern.
    var ACH = achievementDefs();
    var achState = {};
    players.forEach(function (p) { achState[p.id] = {}; });
    var run = {};
    players.forEach(function (p) {
      run[p.id] = {
        nights: 0, nightWins: 0, nightLasts: 0, points: 0, tipBonuses: 0, tipExacts: 0,
        winStreak: 0, wonTitles: {}, winsByTitle: {}, wasLastPreviousNight: false,
        hasBigOvershoot: false, strafen: 0
      };
    });

    var seasonWinners = {};
    (data.seasons || []).forEach(function (s) {
      var rows = table(s.id);
      if (!rows.length) return;
      var lastPlayedDate = played.length ? played[played.length - 1].date : '';
      var laterSeasonStarted = (data.seasons || []).some(function (o) { return o.start > s.end && lastPlayedDate >= o.start; });
      var over = lastPlayedDate > s.end || laterSeasonStarted;
      if (!over) return;
      seasonWinners[s.id] = rows.filter(function (r) { return r.place === 1; }).map(function (r) { return r.player.id; });
    });

    nightInfos.forEach(function (info) {
      var night = info.night, ev = info.eval;
      ev.players.forEach(function (pid) {
        var r = run[pid], e = ev.per[pid];
        if (!r) return;
        r.nights += 1;
        r.points += e.total;
        r.strafen += e.strafen;
        var wonNight = ev.winners.indexOf(pid) >= 0;
        var lastNight = ev.losers.indexOf(pid) >= 0;
        if (wonNight) { r.nightWins += 1; r.winStreak += 1; } else { r.winStreak = 0; }
        if (lastNight) r.nightLasts += 1;
        e.games.forEach(function (g) {
          if (g.place === 1) {
            r.wonTitles[g.title] = true;
            r.winsByTitle[g.title] = (r.winsByTitle[g.title] || 0) + 1;
          }
          if (g.tipPts > 0) r.tipBonuses += 1;
          if (g.exact) r.tipExacts += 1;
          // Luftschloss: Tipp deutlich ÜBER dem Ergebnis — mind. 5 daneben und
          // relativ zur Punkteskala des Spiels (50 % drüber), damit ±5 bei
          // Wizard & Co. nicht trivial zählt.
          if (g.tip !== null && g.tip - g.score >= 5 && (g.score <= 0 || g.tip >= g.score * 1.5)) {
            r.hasBigOvershoot = true;
          }
        });
        var ctx = {
          run: r, wonNight: wonNight, lastNight: lastNight,
          comeback: wonNight && r.wasLastPreviousNight,
          allSix: ev.players.length >= 6
        };
        ACH.forEach(function (a) {
          if (achState[pid][a.id]) return;
          if (a.check(ctx)) {
            achState[pid][a.id] = { nightId: night.id, date: night.date };
            unlockEvents.push({ achId: a.id, playerId: pid, nightId: night.id, date: night.date });
          }
        });
        r.wasLastPreviousNight = lastNight;
      });
    });

    Object.keys(seasonWinners).forEach(function (sid) {
      var season = (data.seasons || []).filter(function (s) { return s.id === sid; })[0];
      var lastNightOfSeason = null;
      nightInfos.forEach(function (info) {
        if (info.season && info.season.id === sid) lastNightOfSeason = info.night;
      });
      seasonWinners[sid].forEach(function (pid) {
        if (!achState[pid] || achState[pid].saisonmeister) return;
        var when = lastNightOfSeason || { id: null, date: season ? season.end : '' };
        achState[pid].saisonmeister = { nightId: when.id, date: when.date, seasonId: sid };
        unlockEvents.push({ achId: 'saisonmeister', playerId: pid, nightId: when.id, date: when.date, seasonId: sid });
      });
    });

    unlockEvents.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });

    // ── Spiele-Regal ────────────────────────────────────────────────────────
    var shelf = (data.games || []).map(function (g) {
      var pg = perGame[g.title];
      return {
        id: g.id, title: g.title, genre: g.genre || 'Sonst', dauerMin: g.dauerMin || null,
        minAffen: g.minAffen || null, maxAffen: g.maxAffen || null,
        lowerWins: !!g.lowerWins, modul: g.modul || null,
        plays: pg ? pg.plays : 0
      };
    }).sort(function (a, b) { return b.plays - a.plays || a.title.localeCompare(b.title, 'de'); });

    var monthKeys = Object.keys(scopes).filter(function (k) { return k.slice(0, 2) === 'm:'; })
      .map(function (k) { return k.slice(2); }).sort().reverse();

    return {
      data: data,
      players: players,
      playerById: playerById,
      seasons: data.seasons || [],
      nights: nights,
      playedNights: played,
      plannedNights: planned,
      liveNight: live,
      lastNight: played.length ? played[played.length - 1] : null,
      nextNight: planned.filter(function (n) { return n.status !== 'laeuft'; })[0] || null,
      nightInfos: nightInfos,
      table: table,
      standings: standings,
      shelf: shelf,
      perGame: perGame,
      streaks: streaks,
      nemesisOf: nemesisOf,
      timeline: timelinePerPlayer,
      achievements: ACH,
      achState: achState,
      unlockEvents: unlockEvents,
      seasonWinners: seasonWinners,
      records: records,
      months: monthKeys,
      currentSeason: currentSeason(data),
      freeSeats: freeSeats(players),
      spieltag: function (seasonId) {
        return played.filter(function (n) {
          var s = seasonOf(data, n.date);
          return s && s.id === seasonId;
        }).length;
      }
    };
  }

  function hasResults(night) {
    return (night.games || []).some(function (g) {
      return (g.results || []).some(function (r) { return r.score != null && r.score !== ''; });
    });
  }

  function currentSeason(data, todayIso) {
    var t = todayIso || new Date().toISOString().slice(0, 10);
    var list = data.seasons || [];
    for (var i = 0; i < list.length; i++) {
      if (t >= list[i].start && t <= list[i].end) return list[i];
    }
    var played = (data.nights || []).filter(function (n) { return (n.games || []).length; }).sort(byDateAsc);
    if (played.length) {
      var s = seasonOf(data, played[played.length - 1].date);
      if (s) return s;
    }
    return list[list.length - 1] || null;
  }

  // ── Pokal-Katalog ─────────────────────────────────────────────────────────
  // Kein Emoji — das Design-System verbietet es. Jeder Pokal trägt ein
  // Material-Symbol und einen der beiden Tonfälle: banana (Belohnung) oder
  // punsch (Schande).
  function achievementDefs() {
    return [
      { id: 'erster-sieg',    icon: 'trophy',        name: 'Erster Sieg',   desc: 'Zum ersten Mal Abendsieger', tone: 'banana',
        check: function (c) { return c.wonNight && c.run.nightWins === 1; } },
      { id: 'hattrick',       icon: 'repeat',        name: 'Hattrick',      desc: 'Drei Abendsiege in Folge', tone: 'banana',
        check: function (c) { return c.run.winStreak >= 3; } },
      { id: 'hellseher',      icon: 'visibility',    name: 'Hellseher',     desc: 'Eigenen Tipp exakt getroffen', tone: 'banana',
        check: function (c) { return c.run.tipExacts >= 1; } },
      { id: 'scharfschuetze', icon: 'gps_fixed',     name: 'Scharfschütze', desc: 'Dreimal den Tipp-Bonus geholt', tone: 'banana',
        check: function (c) { return c.run.tipBonuses >= 3; } },
      { id: 'allrounder',     icon: 'explore',       name: 'Allrounder',    desc: 'Drei verschiedene Spiele gewonnen', tone: 'banana',
        check: function (c) { return Object.keys(c.run.wonTitles).length >= 3; } },
      { id: 'spezialist',     icon: 'crown',         name: 'Spezialist',    desc: 'Fünf Siege im selben Spiel', tone: 'banana',
        check: function (c) {
          var w = c.run.winsByTitle;
          return Object.keys(w).some(function (t) { return w[t] >= 5; });
        } },
      { id: 'dauerbrenner',   icon: 'flame',         name: 'Dauerbrenner',  desc: 'Zehn Abende dabei', tone: 'banana',
        check: function (c) { return c.run.nights >= 10; } },
      { id: 'urgestein',      icon: 'landscape',     name: 'Urgestein',     desc: '25 Abende dabei', tone: 'banana',
        check: function (c) { return c.run.nights >= 25; } },
      { id: 'punktesammler',  icon: 'scoreboard',    name: 'Punktesammler', desc: '100 Punkte insgesamt', tone: 'banana',
        check: function (c) { return c.run.points >= 100; } },
      { id: 'comeback',       icon: 'rocket_launch', name: 'Comeback',      desc: 'Abendsieg direkt nach letztem Platz', tone: 'banana',
        check: function (c) { return c.comeback; } },
      { id: 'affenbande',     icon: 'users',         name: 'Affenbande',    desc: 'Abend mit allen sechs Affen', tone: 'banana',
        check: function (c) { return c.allSix; } },
      { id: 'saisonmeister',  icon: 'military_tech', name: 'Saisonmeister', desc: 'Eine Saison gewonnen', tone: 'banana',
        check: function () { return false; /* wird separat vergeben */ } },
      { id: 'rote-laterne',   icon: 'skull',         name: 'Rote Laterne',  desc: 'Dreimal Letzter des Abends', tone: 'punsch',
        check: function (c) { return c.run.nightLasts >= 3; } },
      { id: 'luftschloss',    icon: 'trending-down', name: 'Luftschloss',   desc: 'Eigenen Tipp meilenweit überschätzt', tone: 'punsch',
        check: function (c) { return c.run.hasBigOvershoot; } },
      { id: 'strafbank',      icon: 'gavel',         name: 'Strafbank',     desc: 'Dreimal Strafe kassiert', tone: 'punsch',
        check: function (c) { return c.run.strafen >= 3; } }
    ];
  }

  // ── Statuszeilen für die Tabelle ──────────────────────────────────────────
  function statusLines(computed, rows) {
    var out = {};
    if (!rows.length) return out;
    var bestTip = null, bestTipCount = 1, tie = false;
    rows.forEach(function (r) {
      var tb = r.stats.tipBonuses;
      if (tb > bestTipCount) { bestTip = r.player.id; bestTipCount = tb; tie = false; }
      else if (tb === bestTipCount && bestTip) tie = true;
    });
    rows.forEach(function (r) {
      var pid = r.player.id;
      var streak = computed.streaks[pid] ? computed.streaks[pid].cur : 0;
      if (streak >= 2) { out[pid] = { text: streak + ' Siege in Folge', tone: 'up' }; return; }
      if (r.place === rows[rows.length - 1].place && r.place > 1 && r.stats.nightWins === 0 && r.stats.nights >= 3) {
        out[pid] = { text: 'Rote Laterne', tone: 'down' }; return;
      }
      if (pid === bestTip && !tie && bestTipCount >= 2) { out[pid] = { text: 'Bester Tipper', tone: 'dim' }; return; }
      if (r.place === 2) {
        var diff = rows[0].stats.points - r.stats.points;
        if (diff > 0) { out[pid] = { text: '−' + diff + ' auf Platz 1', tone: 'dim' }; return; }
      }
    });
    return out;
  }

  // ── Sticheleien zum letzten Abend ─────────────────────────────────────────
  function banterForNight(computed, info) {
    var lines = [];
    var ev = info.eval;
    var worst = null;
    ev.players.forEach(function (pid) {
      ev.per[pid].games.forEach(function (g) {
        if (g.tipDiff !== null && (!worst || g.tipDiff > worst.diff)) {
          worst = { pid: pid, diff: g.tipDiff, tip: g.tip, score: g.score, title: g.title };
        }
      });
    });
    if (worst && worst.diff >= 3) {
      lines.push({
        text: (computed.playerById[worst.pid] || {}).name + ' tippte ' + worst.tip + ', holte ' + worst.score + '.',
        tone: 'burn'
      });
    } else if (worst && worst.diff === 0) {
      lines.push({ text: (computed.playerById[worst.pid] || {}).name + ' traf den eigenen Tipp exakt.', tone: 'brag' });
    }
    return lines;
  }

  // ── Leeres Dokument ───────────────────────────────────────────────────────
  function emptyDoc() {
    return { meta: { version: 1 }, players: [], seasons: [], games: [], nights: [], modules: { catan: { sessions: [] }, wizard: { sessions: [] } }, houseRules: [] };
  }

  return {
    PLACE_POINTS: PLACE_POINTS,
    PART_POINTS: PART_POINTS,
    TIP_BONUS: TIP_BONUS,
    STRAFE_POINTS: STRAFE_POINTS,
    SEATS: SEATS,
    compute: compute,
    evalGame: evalGame,
    evalNight: evalNight,
    currentSeason: currentSeason,
    seasonOf: seasonOf,
    achievementDefs: achievementDefs,
    statusLines: statusLines,
    banterForNight: banterForNight,
    freeSeats: freeSeats,
    emptyDoc: emptyDoc,
    fmtDate: fmtDate,
    fmtDateShort: fmtDateShort,
    fmtDateLong: fmtDateLong,
    monthAbbr: monthAbbr,
    monthName: monthName,
    monthKey: monthKey,
    weekday: weekday,
    dayNum: dayNum,
    initials: initials,
    shortCode: shortCode,
    rankBy: rankBy,
    plural: plural,
    uid: uid
  };
});
