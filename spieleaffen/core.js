/* SpieleAffen — core.js
 * Datenmodell, Punkte-Engine, Tabellen, Achievements, Rekorde.
 * Läuft im Browser (window.SA) und in Node (module.exports) — keine DOM-Abhängigkeit.
 *
 * Punkteregeln (siehe Legende in der App):
 *   – Platzierung je Spiel: 1. = 5, 2. = 3, 3. = 1 (Gleichstand teilt den Platz)
 *   – Antreten: +1 pro Abend
 *   – Bester Tipp je Spiel: +3 (Gleichstand: alle Nächsten)
 * Abendsieger = meiste Punkte des Abends.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PLACE_POINTS = [5, 3, 1]; // 1., 2., 3. — danach 0
  var PART_POINTS = 1;          // pro Abend
  var TIP_BONUS = 3;            // bester Tipp je Spiel

  // ── Helpers ────────────────────────────────────────────────────────────────
  function byDateAsc(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }

  function fmtDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[2] + '.' + p[1] + '.' + p[0].slice(2);
  }
  function fmtDateShort(iso) {
    var p = iso.split('-');
    return parseInt(p[2], 10) + '.' + parseInt(p[1], 10) + '.';
  }
  var MONTHS = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];
  function monthAbbr(iso) { return MONTHS[parseInt(iso.split('-')[1], 10) - 1] || ''; }
  function dayNum(iso) { return parseInt(iso.split('-')[2], 10); }

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return String(name || '?').slice(0, 2).toUpperCase();
  }

  // Kürzel: explizit gesetzt (player.short) oder aus dem Namen abgeleitet.
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

  // Wettkampf-Ranking über einen Zahlenwert: gleiche Werte teilen den Platz ("1224").
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
    return out; // Map item -> {place, value}
  }

  // ── Spiel auswerten ───────────────────────────────────────────────────────
  // returns per playerId: {score, tip, place, placePts, tipPts, tipDiff, exact}
  function evalGame(game) {
    var res = game.results || [];
    if (!res.length) return {};
    var ranks = rankBy(res, function (r) { return game.lowerWins ? -r.score : r.score; });
    var out = {};
    res.forEach(function (r) {
      var place = ranks.get(r).place;
      out[r.playerId] = {
        score: r.score,
        tip: (r.tip === 0 || r.tip) ? r.tip : null,
        place: place,
        placePts: PLACE_POINTS[place - 1] || 0,
        tipPts: 0, tipDiff: null, exact: false
      };
    });
    // Tipp-Bonus: kleinste Abweichung |score − tip| unter allen Tippern
    var tippers = res.filter(function (r) { return r.tip === 0 || r.tip; });
    if (tippers.length) {
      var best = Infinity;
      tippers.forEach(function (r) { best = Math.min(best, Math.abs(r.score - r.tip)); });
      tippers.forEach(function (r) {
        var d = Math.abs(r.score - r.tip);
        out[r.playerId].tipDiff = d;
        out[r.playerId].exact = d === 0;
        if (d === best) out[r.playerId].tipPts = TIP_BONUS;
      });
    }
    return out;
  }

  // ── Abend auswerten ───────────────────────────────────────────────────────
  function evalNight(night) {
    var per = {}; // playerId -> {placePts, tipPts, partPts, total, games:[{gameId,title,place,score,tip,tipPts,exact}]}
    (night.games || []).forEach(function (g) {
      var ev = evalGame(g);
      Object.keys(ev).forEach(function (pid) {
        if (!per[pid]) per[pid] = { placePts: 0, tipPts: 0, partPts: PART_POINTS, total: 0, games: [] };
        per[pid].placePts += ev[pid].placePts;
        per[pid].tipPts += ev[pid].tipPts;
        per[pid].games.push({
          gameId: g.id, title: g.title, place: ev[pid].place, score: ev[pid].score,
          tip: ev[pid].tip, tipDiff: ev[pid].tipDiff, tipPts: ev[pid].tipPts, exact: ev[pid].exact
        });
      });
    });
    var pids = Object.keys(per);
    pids.forEach(function (pid) {
      per[pid].total = per[pid].placePts + per[pid].tipPts + per[pid].partPts;
      var placeSum = 0;
      per[pid].games.forEach(function (g) { placeSum += g.place; });
      per[pid].avgPlace = per[pid].games.length ? placeSum / per[pid].games.length : 0;
    });
    var ranks = rankBy(pids, function (pid) { return per[pid].total; });
    var winners = [], losers = [];
    var totals = pids.map(function (pid) { return per[pid].total; });
    var max = Math.max.apply(null, totals), min = Math.min.apply(null, totals);
    pids.forEach(function (pid) {
      per[pid].place = ranks.get(pid).place;
      if (per[pid].total === max) winners.push(pid);
    });
    // "Letzter des Abends": eindeutig schlechtester — bei Punktgleichheit
    // entscheidet die schlechtere Durchschnittsplatzierung; volle Gleichheit → niemand.
    if (max !== min) {
      var cands = pids.filter(function (pid) { return per[pid].total === min; });
      cands.sort(function (a, b) { return per[b].avgPlace - per[a].avgPlace; });
      if (cands.length === 1 || per[cands[0]].avgPlace > per[cands[1]].avgPlace) {
        losers = [cands[0]];
      }
    }
    return { per: per, players: pids, winners: winners, losers: losers };
  }

  // ── Gesamtauswertung ──────────────────────────────────────────────────────
  function newStats() {
    return {
      nights: 0, nightWins: 0, nightLasts: 0, points: 0,
      placePts: 0, tipPts: 0, partPts: 0,
      gamesPlayed: 0, gameWins: 0, tipBonuses: 0, tipExacts: 0,
      placements: [] // Abend-Platzierungen chronologisch (für Formkurve)
    };
  }

  function compute(data) {
    var players = data.players || [];
    var playerById = {};
    players.forEach(function (p) { playerById[p.id] = p; });

    var nights = (data.nights || []).slice().sort(byDateAsc);
    var played = nights.filter(function (n) { return (n.games || []).length > 0; });
    var planned = nights.filter(function (n) { return !(n.games || []).length; });

    var scopes = { all: {} }; // scopeKey -> playerId -> stats
    (data.seasons || []).forEach(function (s) { scopes[s.id] = {}; });
    function stat(scope, pid) {
      if (!scopes[scope][pid]) scopes[scope][pid] = newStats();
      return scopes[scope][pid];
    }

    var nightInfos = [];          // chronologisch, ausgewertet
    var unlockEvents = [];        // Achievements (unten)
    var perGame = {};             // title -> {plays, totalMin, byPlayer: pid -> {played, wins, scoreSum, bestScore, places[]}}
    var streaks = {};             // pid -> {cur, best}
    var lastNightLast = {};       // pid -> war beim letzten Abend Letzter?
    var timelinePerPlayer = {};   // pid -> [{nightId,date,place,total}]
    var records = {
      bestScoreByTitle: {},       // title -> {score,playerId,date}
      longestGameMin: null,       // {min,title,date}
      bestNightPoints: null,      // {points,playerId,date,nightId}
      bestStreak: null            // {len,playerId}
    };

    played.forEach(function (night) {
      var season = seasonOf(data, night.date);
      var ev = evalNight(night);
      var info = { night: night, season: season, eval: ev };
      nightInfos.push(info);

      ev.players.forEach(function (pid) {
        var e = ev.per[pid];
        [stat('all', pid)].concat(season ? [stat(season.id, pid)] : []).forEach(function (s) {
          s.nights += 1;
          s.points += e.total;
          s.placePts += e.placePts;
          s.tipPts += e.tipPts;
          s.partPts += e.partPts;
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
      });

      // Streaks (über alle Abende, nicht nur Saison)
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
        if (!perGame[g.title]) perGame[g.title] = { title: g.title, plays: 0, byPlayer: {} };
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
      lastNightLast = {};
      ev.losers.forEach(function (pid) { lastNightLast[pid] = true; });
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

    // ── Angstgegner (Nemesis): wer schlägt mich am häufigsten? ─────────────
    // Zählt Spiele, in denen beide dabei waren und B strikt besser platziert war als A.
    var beats = {}; // a -> b -> {lost, shared, byTitle: {title: {lost, shared}}}
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

    // ── Achievements ────────────────────────────────────────────────────────
    // Werden aus der Historie berechnet — deterministisch, keine Speicherung nötig.
    var ACH = achievementDefs();
    var achState = {}; // pid -> achId -> {nightId, date}
    players.forEach(function (p) { achState[p.id] = {}; });
    var run = {}; // Laufzustand je Spieler für die Checks
    players.forEach(function (p) {
      run[p.id] = {
        nights: 0, nightWins: 0, nightLasts: 0, points: 0, tipBonuses: 0, tipExacts: 0,
        winStreak: 0, wonTitles: {}, winsByTitle: {}, wasLastPreviousNight: false,
        hasBigOvershoot: false, seasonsWon: 0
      };
    });

    // Saisonsieger vergangener Saisonen (Saisonende < heute niemals nötig —
    // eine Saison gilt als gewonnen, sobald ihr Enddatum vor dem letzten
    // erfassten Abend liegt oder eine spätere Saison begonnen hat).
    var seasonWinners = {}; // seasonId -> [pid]
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
        r.nights += 1;
        r.points += e.total;
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
      // Spieler, die nicht dabei waren: wasLastPreviousNight bleibt wie zuvor
    });

    // Saisonmeister nach Saisonende freischalten (Datum = letzter Abend der Saison)
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

    return {
      players: players,
      playerById: playerById,
      seasons: data.seasons || [],
      nights: nights,
      playedNights: played,
      plannedNights: planned,
      nightInfos: nightInfos,
      table: table,
      perGame: perGame,
      streaks: streaks,
      nemesisOf: nemesisOf,
      timeline: timelinePerPlayer,
      achievements: ACH,
      achState: achState,
      unlockEvents: unlockEvents,
      seasonWinners: seasonWinners,
      records: records,
      currentSeason: currentSeason(data),
      spieltag: function (seasonId) {
        return played.filter(function (n) {
          var s = seasonOf(data, n.date);
          return s && s.id === seasonId;
        }).length;
      }
    };
  }

  function currentSeason(data, todayIso) {
    var t = todayIso || new Date().toISOString().slice(0, 10);
    var list = data.seasons || [];
    for (var i = 0; i < list.length; i++) {
      if (t >= list[i].start && t <= list[i].end) return list[i];
    }
    // sonst: letzte Saison mit Abenden, sonst letzte
    var played = (data.nights || []).filter(function (n) { return (n.games || []).length; }).sort(byDateAsc);
    if (played.length) {
      var s = seasonOf(data, played[played.length - 1].date);
      if (s) return s;
    }
    return list[list.length - 1] || null;
  }

  // ── Achievement-Katalog ───────────────────────────────────────────────────
  function achievementDefs() {
    return [
      { id: 'erster-sieg',    emoji: '🏆', name: 'Erster Sieg',     desc: 'Zum ersten Mal Abendsieger', tone: 'gold',
        check: function (c) { return c.wonNight && c.run.nightWins === 1; } },
      { id: 'hattrick',       emoji: '🎩', name: 'Hattrick',        desc: 'Drei Abendsiege in Folge', tone: 'gold',
        check: function (c) { return c.run.winStreak >= 3; } },
      { id: 'hellseher',      emoji: '🔮', name: 'Hellseher',       desc: 'Eigenen Tipp exakt getroffen', tone: 'gold',
        check: function (c) { return c.run.tipExacts >= 1; } },
      { id: 'scharfschuetze', emoji: '🎯', name: 'Scharfschütze',   desc: 'Dreimal den Tipp-Bonus geholt', tone: 'gold',
        check: function (c) { return c.run.tipBonuses >= 3; } },
      { id: 'allrounder',     emoji: '🧭', name: 'Allrounder',      desc: 'Drei verschiedene Spiele gewonnen', tone: 'gold',
        check: function (c) { return Object.keys(c.run.wonTitles).length >= 3; } },
      { id: 'spezialist',     emoji: '👑', name: 'Spezialist',      desc: 'Fünf Siege im selben Spiel', tone: 'gold',
        check: function (c) {
          var w = c.run.winsByTitle;
          return Object.keys(w).some(function (t) { return w[t] >= 5; });
        } },
      { id: 'dauerbrenner',   emoji: '🔥', name: 'Dauerbrenner',    desc: 'Zehn Abende dabei', tone: 'gold',
        check: function (c) { return c.run.nights >= 10; } },
      { id: 'urgestein',      emoji: '🗿', name: 'Urgestein',       desc: '25 Abende dabei', tone: 'gold',
        check: function (c) { return c.run.nights >= 25; } },
      { id: 'punktesammler',  emoji: '💯', name: 'Punktesammler',   desc: '100 Punkte insgesamt', tone: 'gold',
        check: function (c) { return c.run.points >= 100; } },
      { id: 'comeback',       emoji: '🚀', name: 'Comeback',        desc: 'Abendsieg direkt nach letztem Platz', tone: 'gold',
        check: function (c) { return c.comeback; } },
      { id: 'affenbande',     emoji: '🐒', name: 'Affenbande',      desc: 'Abend mit allen sechs Affen', tone: 'gold',
        check: function (c) { return c.allSix; } },
      { id: 'saisonmeister',  emoji: '🥇', name: 'Saisonmeister',   desc: 'Eine Saison gewonnen', tone: 'gold',
        check: function () { return false; /* wird separat vergeben */ } },
      { id: 'rote-laterne',   emoji: '🕯️', name: 'Rote Laterne',    desc: 'Dreimal Letzter des Abends', tone: 'shame',
        check: function (c) { return c.run.nightLasts >= 3; } },
      { id: 'luftschloss',    emoji: '📉', name: 'Luftschloss',     desc: 'Eigenen Tipp meilenweit überschätzt', tone: 'shame',
        check: function (c) { return c.run.hasBigOvershoot; } }
    ];
  }

  // ── Statuszeilen für die Tabelle (Sticheleien) ────────────────────────────
  function statusLines(computed, rows, scopeStats) {
    var out = {}; // pid -> {text, tone}
    if (!rows.length) return out;
    // Beste Tipper (eindeutig, ≥2 Boni)
    var bestTip = null, bestTipCount = 1, tie = false;
    rows.forEach(function (r) {
      var tb = r.stats.tipBonuses;
      if (tb > bestTipCount) { bestTip = r.player.id; bestTipCount = tb; tie = false; }
      else if (tb === bestTipCount && bestTip) tie = true;
    });
    rows.forEach(function (r) {
      var pid = r.player.id;
      var streak = computed.streaks[pid] ? computed.streaks[pid].cur : 0;
      if (streak >= 2) { out[pid] = { text: streak + ' SIEGE IN FOLGE', tone: 'up' }; return; }
      if (r.place === rows[rows.length - 1].place && r.place > 1 && r.stats.nightWins === 0 && r.stats.nights >= 3) {
        out[pid] = { text: 'ROTE LATERNE', tone: 'down' }; return;
      }
      if (pid === bestTip && !tie && bestTipCount >= 2) { out[pid] = { text: 'BESTER TIPPER', tone: 'dim' }; return; }
      if (r.place === 2) {
        var diff = rows[0].stats.points - r.stats.points;
        if (diff > 0) { out[pid] = { text: '–' + diff + ' AUF PLATZ 1', tone: 'dim' }; return; }
      }
    });
    return out;
  }

  // ── Sticheleien / Banter für den letzten Abend ────────────────────────────
  function banterForNight(computed, info) {
    var lines = [];
    var ev = info.eval;
    // Größte Tipp-Fehleinschätzung
    var worst = null;
    ev.players.forEach(function (pid) {
      ev.per[pid].games.forEach(function (g) {
        if (g.tipDiff !== null && (!worst || g.tipDiff > worst.diff)) {
          worst = { pid: pid, diff: g.tipDiff, tip: g.tip, score: g.score, title: g.title };
        }
      });
    });
    if (worst && worst.diff >= 3) {
      var name = computed.playerById[worst.pid].name;
      lines.push({
        plain: name + ' tippte ' + worst.tip + ' Punkte, holte ' + worst.score + '.',
        strong: 'Größte Selbstüberschätzung des Abends.'
      });
    } else if (worst && worst.diff === 0) {
      var n2 = computed.playerById[worst.pid].name;
      lines.push({ plain: n2 + ' traf den eigenen Tipp exakt.', strong: 'Hellseher.' });
    }
    return lines;
  }

  return {
    PLACE_POINTS: PLACE_POINTS,
    PART_POINTS: PART_POINTS,
    TIP_BONUS: TIP_BONUS,
    compute: compute,
    evalGame: evalGame,
    evalNight: evalNight,
    currentSeason: currentSeason,
    seasonOf: seasonOf,
    statusLines: statusLines,
    banterForNight: banterForNight,
    fmtDate: fmtDate,
    fmtDateShort: fmtDateShort,
    monthAbbr: monthAbbr,
    dayNum: dayNum,
    initials: initials,
    shortCode: shortCode,
    uid: function (prefix) {
      return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    }
  };
});
