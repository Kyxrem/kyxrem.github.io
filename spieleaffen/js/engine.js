/* SpieleAffen Engine — Wertung, Tabellen, Achievements, Rekorde, Sticheleien.
   Pure Funktionen über data.json; läuft im Browser (window.Engine) und in Node. */
(function (root) {
  'use strict';
  const Engine = {};

  /* ---------------- Utils ---------------- */
  const MON_SHORT = ['JAN','FEB','MÄR','APR','MAI','JUN','JUL','AUG','SEP','OKT','NOV','DEZ'];
  const MON_LONG = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const WD_SHORT = ['So','Mo','Di','Mi','Do','Fr','Sa'];

  function todayISO() { return new Date().toISOString().slice(0, 10); }
  Engine.todayISO = todayISO;

  function parseISO(iso) {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    return new Date(y || 1970, (m || 1) - 1, d || 1);
  }
  Engine.fmtDay = function (iso) {
    const dt = parseISO(iso);
    return { d: String(dt.getDate()), mon: MON_SHORT[dt.getMonth()] };
  };
  Engine.fmtLong = function (iso) {
    const dt = parseISO(iso);
    return dt.getDate() + '. ' + MON_LONG[dt.getMonth()];
  };
  Engine.fmtFull = function (iso) {
    const dt = parseISO(iso);
    return WD_SHORT[dt.getDay()] + ', ' + dt.getDate() + '. ' + MON_LONG[dt.getMonth()] + ' ' + String(dt.getFullYear()).slice(2);
  };
  Engine.fmtShort = function (iso) {
    const dt = parseISO(iso);
    const p = (n) => String(n).padStart(2, '0');
    return p(dt.getDate()) + '.' + p(dt.getMonth() + 1) + '.';
  };
  Engine.initials = function (name) {
    const parts = String(name || '?').trim().split(/\s+/);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : String(parts[0]).slice(0, 2)).toUpperCase();
  };

  function by(fn, desc) { return (a, b) => desc ? fn(b) - fn(a) : fn(a) - fn(b); }

  /* ---------------- Grunddaten ---------------- */
  Engine.player = function (data, id) {
    return data.players.find((p) => p.id === id) || { id, name: id, monkey: '🐒' };
  };
  Engine.activeSeason = function (data) {
    return data.seasons.find((s) => s.id === data.activeSeasonId) || data.seasons[data.seasons.length - 1] || null;
  };
  Engine.seasonFinished = function (s) {
    return !!(s && (s.closed || (s.end && s.end < todayISO())));
  };

  /* ---------------- Spiel-Wertung ---------------- */
  // results: [{playerId, score}] -> [{playerId, score, rank}] (competition ranking, ties teilen den Rang)
  Engine.rankResults = function (game) {
    const asc = !!game.lowWins;
    const sorted = [...(game.results || [])].sort(by((r) => r.score, !asc));
    let out = [];
    sorted.forEach((r, i) => {
      const rank = (i > 0 && sorted[i - 1].score === r.score) ? out[i - 1].rank : i + 1;
      out.push({ playerId: r.playerId, score: r.score, rank });
    });
    return out;
  };

  // Tipp: jeder tippt die EIGENE Endpunktzahl. Am nächsten dran => Bonus, exakt => Extra-Bonus.
  Engine.evalTips = function (game, ranked, settings) {
    const tips = game.tips || {};
    const per = {};
    let best = Infinity;
    ranked.forEach((r) => {
      const t = tips[r.playerId];
      if (t === undefined || t === null || t === '') return;
      const err = Math.abs(Number(t) - r.score);
      per[r.playerId] = { tip: Number(t), err, bonus: 0 };
      if (err < best) best = err;
    });
    const winners = [];
    Object.keys(per).forEach((pid) => {
      if (per[pid].err === best) {
        per[pid].bonus = best === 0 ? (settings.tipExactBonus ?? 5) : (settings.tipBonus ?? 3);
        winners.push(pid);
      }
    });
    return { per, winners, bestErr: best === Infinity ? null : best };
  };

  /* ---------------- Abend-Wertung ---------------- */
  Engine.eveningStats = function (ev, settings) {
    const pp = settings.placementPoints || [5, 3, 1];
    const per = {}; // pid -> Zahlen
    const ensure = (pid) => (per[pid] = per[pid] || {
      gamePts: 0, tipPts: 0, att: 0, pts: 0, gameWins: 0, games: 0,
      placements: [], tips: []
    });

    const games = (ev.games || []).map((g) => {
      const ranked = Engine.rankResults(g);
      const tipEval = Engine.evalTips(g, ranked, settings);
      ranked.forEach((r) => {
        const P = ensure(r.playerId);
        P.games++;
        P.placements.push(r.rank);
        const pts = pp[r.rank - 1] || 0;
        P.gamePts += pts;
        if (r.rank === 1) P.gameWins++;
        const te = tipEval.per[r.playerId];
        if (te) { P.tipPts += te.bonus; P.tips.push({ game: g.name, tip: te.tip, score: r.score, err: te.err, bonus: te.bonus }); }
      });
      return { game: g, ranked, tipEval };
    });

    const attendees = Object.keys(per);
    attendees.forEach((pid) => {
      per[pid].att = settings.attendancePoints ?? 1;
      per[pid].pts = per[pid].gamePts + per[pid].tipPts + per[pid].att;
    });

    const ranking = attendees
      .map((pid) => ({ playerId: pid, pts: per[pid].pts }))
      .sort((a, b) => b.pts - a.pts || per[b.playerId].gameWins - per[a.playerId].gameWins);
    ranking.forEach((r, i) => {
      r.rank = (i > 0 && ranking[i - 1].pts === r.pts) ? ranking[i - 1].rank : i + 1;
    });
    const winners = ranking.filter((r) => r.rank === 1).map((r) => r.playerId);
    const maxRank = ranking.length ? ranking[ranking.length - 1].rank : 0;
    const lastIds = ranking.length >= 3 ? ranking.filter((r) => r.rank === maxRank && maxRank > 1).map((r) => r.playerId) : [];

    return { per, games, ranking, winners, lastIds, attendees };
  };

  /* ---------------- Kontext: alles einmal durchrechnen ---------------- */
  Engine.prepare = function (data) {
    const settings = data.settings || {};
    const evenings = [...(data.evenings || [])]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((ev) => ({ ev, stats: Engine.eveningStats(ev, settings) }));

    // Spieltag-Nummer je Saison
    const counters = {};
    evenings.forEach((e) => {
      counters[e.ev.seasonId] = (counters[e.ev.seasonId] || 0) + 1;
      e.matchday = counters[e.ev.seasonId];
    });

    function table(filterFn) {
      const agg = {};
      const rows = [];
      evenings.filter(filterFn).forEach((e) => {
        e.stats.attendees.forEach((pid) => {
          const A = (agg[pid] = agg[pid] || { playerId: pid, evenings: 0, wins: 0, pts: 0, gameWins: 0, tipBonuses: 0, lastPlaces: 0 });
          A.evenings++;
          A.pts += e.stats.per[pid].pts;
          A.gameWins += e.stats.per[pid].gameWins;
          A.tipBonuses += e.stats.per[pid].tips.filter((t) => t.bonus > 0).length;
          if (e.stats.winners.includes(pid)) A.wins++;
          if (e.stats.lastIds.includes(pid)) A.lastPlaces++;
        });
      });
      Object.values(agg).forEach((r) => rows.push(r));
      rows.sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.evenings - b.evenings ||
        String(Engine.player(data, a.playerId).name).localeCompare(Engine.player(data, b.playerId).name));
      rows.forEach((r, i) => {
        r.rank = (i > 0 && rows[i - 1].pts === r.pts && rows[i - 1].wins === r.wins) ? rows[i - 1].rank : i + 1;
      });
      return rows;
    }

    const tables = { all: table(() => true) };
    data.seasons.forEach((s) => { tables[s.id] = table((e) => e.ev.seasonId === s.id); });

    // Pro Spiel
    const perGame = {};
    evenings.forEach((e) => {
      e.stats.games.forEach(({ game, ranked }) => {
        const key = game.name;
        const G = (perGame[key] = perGame[key] || { name: key, lowWins: !!game.lowWins, plays: 0, totalMinutes: 0, per: {}, best: null });
        G.plays++;
        G.totalMinutes += game.minutes || 0;
        ranked.forEach((r) => {
          const P = (G.per[r.playerId] = G.per[r.playerId] || { playerId: r.playerId, plays: 0, wins: 0, best: null, sum: 0 });
          P.plays++;
          P.sum += r.score;
          if (r.rank === 1) P.wins++;
          const better = P.best === null || (game.lowWins ? r.score < P.best : r.score > P.best);
          if (better) P.best = r.score;
          const gBetter = !G.best || (game.lowWins ? r.score < G.best.score : r.score > G.best.score);
          if (gBetter) G.best = { playerId: r.playerId, score: r.score, date: e.ev.date };
        });
      });
    });

    // Streaks & Durststrecken (Abendsiege; Fehlen bricht die Serie)
    const streaks = {}; const droughts = {};
    data.players.forEach((p) => {
      streaks[p.id] = { cur: 0, max: 0, maxDate: null };
      droughts[p.id] = { cur: 0, max: 0, everWon: false };
    });
    evenings.forEach((e) => {
      data.players.forEach((p) => {
        const attended = e.stats.attendees.includes(p.id);
        const won = e.stats.winners.includes(p.id);
        const S = streaks[p.id]; const D = droughts[p.id];
        if (attended && won) {
          S.cur++; if (S.cur >= S.max) { S.max = S.cur; S.maxDate = e.ev.date; }
          D.cur = 0; D.everWon = true;
        } else if (attended) {
          S.cur = 0;
          D.cur++; if (D.cur > D.max) D.max = D.cur;
        } else {
          S.cur = 0; // Vom Sofa aus verteidigt man keine Krone.
        }
      });
    });

    const finishedSeasons = data.seasons.filter(Engine.seasonFinished)
      .map((s) => ({ season: s, table: tables[s.id] }))
      .filter((x) => x.table.length >= 2);

    return { data, settings, evenings, tables, perGame, streaks, droughts, finishedSeasons };
  };

  /* ---------------- Achievements ---------------- */
  const DEFS = [
    { id: 'grundstein',   icon: '🧱', name: 'Grundstein',      desc: 'Beim allerersten Abend dabei gewesen.' },
    { id: 'erster-sieg',  icon: '🏆', name: 'Erster Sieg',     desc: 'Zum ersten Mal einen Abend gewonnen.' },
    { id: 'hattrick',     icon: '🔥', name: 'Hattrick',        desc: 'Drei Abende in Folge gewonnen.' },
    { id: 'serientaeter', icon: '🌋', name: 'Serientäter',     desc: 'Fünf Abende in Folge gewonnen.' },
    { id: 'hellseher',    icon: '🔮', name: 'Hellseher',       desc: 'Die eigene Endpunktzahl exakt vorhergesagt.' },
    { id: 'scharfschuetze', icon: '🎯', name: 'Scharfschütze', desc: 'Drei Tipp-Boni in einer Saison.' },
    { id: 'blindflug',    icon: '🙈', name: 'Blindflug',       desc: 'Mit dem Tipp um 8+ Punkte danebengelegen.' },
    { id: 'groessenwahn', icon: '📉', name: 'Größenwahn',      desc: 'Höchster Tipp des Spiels — letzter Platz.' },
    { id: 'tiefstapler',  icon: '🥷', name: 'Tiefstapler',     desc: 'Niedrigster Tipp des Spiels — und gewonnen.' },
    { id: 'heimvorteil',  icon: '🏠', name: 'Heimvorteil',     desc: 'Als Gastgeber den Abend gewonnen.' },
    { id: 'gastgeber-fluch', icon: '🪦', name: 'Gastgeber-Fluch', desc: 'Als Gastgeber Letzter geworden.' },
    { id: 'punktemaschine', icon: '🦾', name: 'Punktemaschine', desc: '15+ Punkte an einem einzigen Abend.' },
    { id: 'abraeumer',    icon: '🧹', name: 'Abräumer',        desc: 'Jedes Spiel eines Abends gewonnen (min. 2).' },
    { id: 'comeback',     icon: '⚡', name: 'Comeback',        desc: 'Abendsieg direkt nach einem letzten Platz.' },
    { id: 'kellerkind',   icon: '🕳️', name: 'Kellerkind',      desc: 'Drei Abende in Folge Letzter.' },
    { id: 'dauergast',    icon: '🛋️', name: 'Dauergast',       desc: 'Zehn Abende dabei gewesen.' },
    { id: 'monument',     icon: '🗿', name: 'Monument',        desc: '25 Abende dabei gewesen.' },
    { id: 'nachteule',    icon: '🦉', name: 'Nachteule',       desc: 'Einen Abend mit 3+ Spielen durchgezogen.' },
    { id: 'marathon',     icon: '⏳', name: 'Marathon',        desc: 'Ein Spiel über 2 Stunden durchgestanden.' },
    { id: 'allrounder',   icon: '🎲', name: 'Allrounder',      desc: 'Siege in fünf verschiedenen Spielen.' },
    { id: 'spezialist',   icon: '🧠', name: 'Spezialist',      desc: 'Drei Siege im selben Spiel.' },
    { id: 'saisonsieger', icon: '👑', name: 'Saisonsieger',    desc: 'Eine Saison auf Platz 1 beendet.' },
    { id: 'rote-laterne', icon: '🏮', name: 'Rote Laterne',    desc: 'Eine Saison auf dem letzten Platz beendet.' },
    { id: 'ewiger-zweiter', icon: '🥈', name: 'Ewiger Zweiter', desc: 'Zwei Saisons als Zweiter beendet.' },
    { id: 'sammler',      icon: '💎', name: 'Sammler',         desc: 'Zehn Pokale eingesammelt.' }
  ];
  Engine.achievementDefs = DEFS;

  Engine.achievements = function (ctx) {
    const { data, evenings, streaks, finishedSeasons } = ctx;
    const un = {}; // id -> [{playerId, date, detail}]
    const add = (id, pid, date, detail, once) => {
      un[id] = un[id] || [];
      if (once && un[id].some((u) => u.playerId === pid)) return;
      un[id].push({ playerId: pid, date, detail: detail || '' });
    };

    const seen = {
      firstWin: {}, streak: {}, evCount: {}, lastStreak: {},
      seasonTip: {}, gameWins: {}, distinctWins: {}, prevLast: {}
    };

    evenings.forEach((e, idx) => {
      const d = e.ev.date;
      const st = e.stats;

      if (idx === 0) st.attendees.forEach((pid) => add('grundstein', pid, d, 'Der erste Abend überhaupt', true));

      st.attendees.forEach((pid) => {
        seen.evCount[pid] = (seen.evCount[pid] || 0) + 1;
        if (seen.evCount[pid] === 10) add('dauergast', pid, d, '10. Abend', true);
        if (seen.evCount[pid] === 25) add('monument', pid, d, '25. Abend', true);
        if (st.per[pid].pts >= 15) add('punktemaschine', pid, d, st.per[pid].pts + ' Punkte an einem Abend');
        if ((e.ev.games || []).length >= 3) add('nachteule', pid, d, (e.ev.games || []).length + ' Spiele in einer Nacht', true);
      });

      st.games.forEach(({ game, ranked, tipEval }) => {
        if ((game.minutes || 0) >= 120) ranked.forEach((r) => add('marathon', r.playerId, d, game.name + ' · ' + game.minutes + ' Min', true));
        Object.entries(tipEval.per).forEach(([pid, te]) => {
          if (te.err === 0) add('hellseher', pid, d, game.name + ': ' + te.tip + ' getippt, ' + te.tip + ' geholt');
          // relativ zur Punkteskala des Spiels, sonst ist Wizard ein Selbstläufer
          if (te.err >= 8 && te.err >= 0.2 * Math.max(40, Math.abs(te.score))) add('blindflug', pid, d, game.name + ': ' + te.tip + ' getippt, ' + te.score + ' geholt');
          if (te.bonus > 0) {
            const key = pid + '|' + e.ev.seasonId;
            seen.seasonTip[key] = (seen.seasonTip[key] || 0) + 1;
            if (seen.seasonTip[key] === 3) add('scharfschuetze', pid, d, '3 Tipp-Boni in einer Saison', true);
          }
        });
        const tipsArr = Object.entries(tipEval.per);
        if (tipsArr.length >= 2 && ranked.length >= 3) {
          const maxTip = Math.max(...tipsArr.map(([, t]) => t.tip));
          const minTip = Math.min(...tipsArr.map(([, t]) => t.tip));
          const maxRank = Math.max(...ranked.map((r) => r.rank));
          tipsArr.forEach(([pid, te]) => {
            const r = ranked.find((x) => x.playerId === pid);
            const soleMax = te.tip === maxTip && tipsArr.filter(([, t]) => t.tip === maxTip).length === 1;
            const soleMin = te.tip === minTip && tipsArr.filter(([, t]) => t.tip === minTip).length === 1;
            if (soleMax && r.rank === maxRank && maxRank > 1) add('groessenwahn', pid, d, game.name + ': ' + te.tip + ' getippt, Letzter geworden');
            if (soleMin && r.rank === 1) add('tiefstapler', pid, d, game.name + ' gewonnen, nur ' + te.tip + ' getippt');
          });
        }
        ranked.filter((r) => r.rank === 1).forEach((r) => {
          seen.gameWins[r.playerId] = seen.gameWins[r.playerId] || {};
          const g = seen.gameWins[r.playerId];
          g[game.name] = (g[game.name] || 0) + 1;
          if (g[game.name] === 3) add('spezialist', r.playerId, d, '3× ' + game.name + ' gewonnen', true);
          if (Object.keys(g).length === 5 && !seen.distinctWins[r.playerId]) {
            seen.distinctWins[r.playerId] = true;
            add('allrounder', r.playerId, d, 'Siege in 5 verschiedenen Spielen', true);
          }
        });
      });

      st.winners.forEach((pid) => {
        if (!seen.firstWin[pid]) { seen.firstWin[pid] = true; add('erster-sieg', pid, d, 'Spieltag ' + e.matchday, true); }
        seen.streak[pid] = (seen.streak[pid] || 0) + 1;
        if (seen.streak[pid] === 3) add('hattrick', pid, d, '3 Abendsiege in Folge');
        if (seen.streak[pid] === 5) add('serientaeter', pid, d, '5 Abendsiege in Folge');
        if (e.ev.hostId === pid) add('heimvorteil', pid, d, 'Gewonnen im eigenen Wohnzimmer');
        if (seen.prevLast[pid]) add('comeback', pid, d, 'Vom letzten Platz zum Abendsieg');
        if ((e.ev.games || []).length >= 2 && st.per[pid].gameWins === (e.ev.games || []).length) {
          add('abraeumer', pid, d, 'Alle ' + (e.ev.games || []).length + ' Spiele des Abends gewonnen');
        }
      });
      st.attendees.forEach((pid) => { if (!st.winners.includes(pid)) seen.streak[pid] = 0; });
      data.players.forEach((p) => { if (!st.attendees.includes(p.id)) seen.streak[p.id] = 0; });

      st.lastIds.forEach((pid) => {
        if (e.ev.hostId === pid) add('gastgeber-fluch', pid, d, 'Letzter in den eigenen vier Wänden');
        seen.lastStreak[pid] = (seen.lastStreak[pid] || 0) + 1;
        if (seen.lastStreak[pid] === 3) add('kellerkind', pid, d, '3× in Folge Letzter');
      });
      st.attendees.forEach((pid) => {
        if (!st.lastIds.includes(pid)) seen.lastStreak[pid] = 0;
        seen.prevLast[pid] = st.lastIds.includes(pid);
      });
    });

    finishedSeasons.forEach(({ season, table }) => {
      const endDate = season.end || todayISO();
      table.filter((r) => r.rank === 1).forEach((r) => add('saisonsieger', r.playerId, endDate, season.name + ' gewonnen'));
      const maxRank = table[table.length - 1].rank;
      if (table.length >= 4) {
        table.filter((r) => r.rank === maxRank && maxRank > 1).forEach((r) => add('rote-laterne', r.playerId, endDate, 'Letzter in ' + season.name));
      }
    });
    const seconds = {};
    finishedSeasons.forEach(({ season, table }) => {
      table.filter((r) => r.rank === 2).forEach((r) => {
        seconds[r.playerId] = (seconds[r.playerId] || 0) + 1;
        if (seconds[r.playerId] === 2) add('ewiger-zweiter', r.playerId, season.end || todayISO(), 'Zum 2. Mal Saison-Zweiter', true);
      });
    });

    // Sammler: 10 einzigartige Pokale
    const perPlayerUnique = {};
    const events = [];
    Object.entries(un).forEach(([id, list]) => list.forEach((u) => events.push({ id, ...u })));
    events.sort((a, b) => (a.date < b.date ? -1 : 1));
    events.forEach((ev2) => {
      const set = (perPlayerUnique[ev2.playerId] = perPlayerUnique[ev2.playerId] || new Set());
      if (!set.has(ev2.id)) {
        set.add(ev2.id);
        if (set.size === 10) add('sammler', ev2.playerId, ev2.date, '10 verschiedene Pokale', true);
      }
    });

    return DEFS.map((def) => {
      const list = (un[def.id] || []).sort((a, b) => (a.date < b.date ? -1 : 1));
      const byPlayer = {};
      list.forEach((u) => {
        const B = (byPlayer[u.playerId] = byPlayer[u.playerId] || { playerId: u.playerId, count: 0, first: u.date, last: u.date, detail: u.detail });
        B.count++; B.last = u.date; B.detail = u.detail || B.detail;
      });
      return { ...def, unlocks: list, holders: Object.values(byPlayer) };
    });
  };

  // Alle Unlock-Ereignisse, neueste zuerst
  Engine.unlockFeed = function (achievements) {
    const out = [];
    achievements.forEach((a) => a.unlocks.forEach((u) => out.push({ icon: a.icon, name: a.name, id: a.id, ...u })));
    return out.sort((a, b) => (a.date < b.date ? 1 : -1));
  };

  /* ---------------- Rekorde ---------------- */
  Engine.records = function (ctx) {
    const { data, evenings, perGame, streaks, droughts } = ctx;
    const out = [];
    const games = Object.values(perGame).sort((a, b) => b.plays - a.plays);
    games.slice(0, 3).forEach((G) => {
      if (G.best) out.push({
        v: G.best.score, label: G.name + '-Bestwert',
        sub: Engine.player(data, G.best.playerId).name + ', ' + Engine.fmtLong(G.best.date), tone: 'acid'
      });
    });
    let longest = null;
    evenings.forEach((e) => (e.ev.games || []).forEach((g) => {
      if ((g.minutes || 0) > (longest?.minutes || 0)) longest = { minutes: g.minutes, name: g.name, date: e.ev.date };
    }));
    if (longest) out.push({ v: longest.minutes + "'", label: 'Längstes Spiel', sub: longest.name + ', ' + Engine.fmtLong(longest.date) });
    out.push({ v: evenings.length, label: 'Abende gespielt', sub: evenings.length ? 'seit ' + Engine.fmtLong(evenings[0].ev.date) : '—' });
    let ms = null;
    Object.entries(streaks).forEach(([pid, s]) => { if (s.max >= 2 && s.max > (ms?.v || 0)) ms = { v: s.max, pid, date: s.maxDate }; });
    if (ms) out.push({ v: '×' + ms.v, label: 'Längste Siegesserie', sub: Engine.player(data, ms.pid).name + ', bis ' + Engine.fmtLong(ms.date), tone: 'acid' });
    let worstTip = null;
    evenings.forEach((e) => e.stats.games.forEach(({ game, tipEval }) => {
      Object.entries(tipEval.per).forEach(([pid, te]) => {
        if (!worstTip || te.err > worstTip.err) worstTip = { err: te.err, pid, game: game.name, date: e.ev.date };
      });
    }));
    if (worstTip && worstTip.err >= 4) out.push({ v: '±' + worstTip.err, label: 'Schlechtester Tipp', sub: Engine.player(data, worstTip.pid).name + ', ' + worstTip.game, tone: 'alert' });
    let dr = null;
    Object.entries(droughts).forEach(([pid, d]) => { if (d.cur >= 3 && d.cur > (dr?.v || 0)) dr = { v: d.cur, pid }; });
    if (dr) out.push({ v: dr.v, label: 'Abende ohne Sieg', sub: Engine.player(data, dr.pid).name + ', und es läuft weiter', tone: 'alert' });
    return out;
  };

  /* ---------------- Sticheleien ---------------- */
  Engine.nemesis = function (ctx) {
    // Paar (A schlägt B) im selben Spiel: >=4 gemeinsame Partien, A vor B in >=70%
    const { data, evenings } = ctx;
    const pair = {}; // 'a|b|game' -> {a, b, game, n, aWins}
    evenings.forEach((e) => e.stats.games.forEach(({ game, ranked }) => {
      for (const x of ranked) for (const y of ranked) {
        if (x.playerId >= y.playerId) continue;
        const key = x.playerId + '|' + y.playerId + '|' + game.name;
        const P = (pair[key] = pair[key] || { a: x.playerId, b: y.playerId, game: game.name, n: 0, aAhead: 0 });
        if (x.rank !== y.rank) { P.n++; if (x.rank < y.rank) P.aAhead++; }
      }
    }));
    let best = null;
    Object.values(pair).forEach((P) => {
      if (P.n < 4) return;
      const ratio = Math.max(P.aAhead, P.n - P.aAhead) / P.n;
      if (ratio < 0.7) return;
      if (!best || P.n * ratio > best.n * best.ratio) {
        const aWins = P.aAhead >= P.n - P.aAhead;
        best = {
          winner: aWins ? P.a : P.b, loser: aWins ? P.b : P.a, game: P.game,
          w: Math.max(P.aAhead, P.n - P.aAhead), n: P.n, ratio
        };
      }
    });
    return best;
  };

  Engine.sticheleien = function (ctx) {
    const { data, evenings, streaks, droughts, tables } = ctx;
    const t = [];
    const P = (pid) => Engine.player(data, pid).name;
    let bestStreak = null;
    Object.entries(streaks).forEach(([pid, s]) => {
      if (s.cur >= 2 && (!bestStreak || s.cur > bestStreak.cur)) bestStreak = { pid, cur: s.cur };
    });
    if (bestStreak) t.push(P(bestStreak.pid).toUpperCase() + ' GEWINNT ' + bestStreak.cur + ' ABENDE IN FOLGE');
    let worstDrought = null;
    Object.entries(droughts).forEach(([pid, d]) => {
      if (d.cur >= 4 && (!worstDrought || d.cur > worstDrought.cur)) worstDrought = { pid, cur: d.cur };
    });
    if (worstDrought) t.push(P(worstDrought.pid).toUpperCase() + ' OHNE SIEG SEIT ' + worstDrought.cur + ' ABENDEN');
    const nem = Engine.nemesis(ctx);
    if (nem) t.push(P(nem.winner).toUpperCase() + ' SCHLÄGT ' + P(nem.loser).toUpperCase() + ' ' + nem.w + ':' + (nem.n - nem.w) + ' BEI ' + nem.game.toUpperCase());
    const last = evenings[evenings.length - 1];
    if (last) {
      let flop = null;
      last.stats.games.forEach(({ game, tipEval }) => Object.entries(tipEval.per).forEach(([pid, te]) => {
        if (te.tip > te.score && (!flop || te.err > flop.err)) flop = { pid, ...te, game: game.name };
      }));
      if (flop && flop.err >= 3) t.push(P(flop.pid).toUpperCase() + ' TIPPTE ' + flop.tip + ', HOLTE ' + flop.score);
    }
    const act = tables[data.activeSeasonId] || [];
    if (act.length >= 2) t.push(P(act[1].playerId).toUpperCase() + ' FEHLEN ' + (act[0].pts - act[1].pts) + ' PUNKTE AUF PLATZ 1');
    return t;
  };

  // Kurzzeile fürs Tabellen-Tag — bewusst sparsam: nur die vier markanten Fälle
  Engine.playerTag = function (ctx, pid, tableRows) {
    const { streaks } = ctx;
    const row = tableRows.find((r) => r.playerId === pid);
    if (!row) return null;
    if (row.rank === 1 && tableRows.length > 1) {
      if (streaks[pid] && streaks[pid].cur >= 2) return { text: streaks[pid].cur + ' SIEGE IN FOLGE', tone: 'acid' };
      const gap = row.pts - tableRows[1].pts;
      return gap > 0 ? { text: '+' + gap + ' VORSPRUNG', tone: 'acid' } : null;
    }
    const maxRank = tableRows[tableRows.length - 1].rank;
    if (tableRows.length >= 4 && row.rank === maxRank && maxRank > 1) return { text: 'ROTE LATERNE', tone: 'alert' };
    if (row.rank === 2) return { text: '–' + (tableRows[0].pts - row.pts) + ' AUF PLATZ 1', tone: '' };
    const sorted = [...tableRows].sort((a, b) => b.tipBonuses - a.tipBonuses);
    if (sorted[0].playerId === pid && sorted[0].tipBonuses >= 3 &&
      (!sorted[1] || sorted[1].tipBonuses < sorted[0].tipBonuses)) return { text: 'BESTER TIPPER', tone: '' };
    return null;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
